//! Window side of the media host (see media_host.rs).
//!
//! One helper process at a time, shared by the editor and thumbnail
//! decoding. It runs while anything holds a [`Host`]: the editor's playback
//! holds one while it is open, thumbnail requests hold one for a few seconds
//! after their last decode. When the last holder lets go, the helper's stdin
//! closes and it exits, taking the decoder's memory with it. A kill-on-close
//! job ends it with the window if the window dies first.
//!
//! Nothing here waits on the helper from the UI thread: commands go through
//! a writer thread, events arrive on a reader thread, and the UI reads the
//! latest status and frame without a round trip.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::os::windows::io::AsRawHandle;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, Weak, mpsc};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use windows::Win32::Foundation::{CloseHandle, DUPLICATE_SAME_ACCESS, DuplicateHandle, HANDLE};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JobObjectExtendedLimitInformation, SetInformationJobObject,
};
use windows::Win32::System::Threading::GetCurrentProcess;

use crate::media_host::{Cmd, Event, Status, frames};

/// How long an idle helper stays up after thumbnail work, so a burst of
/// cache misses doesn't start one process per thumbnail.
const LINGER: Duration = Duration::from_secs(3);
const THUMB_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Default)]
struct Inbox {
    status: Mutex<Option<Status>>,
    error: Mutex<Option<String>>,
    replies: Mutex<HashMap<u64, mpsc::Sender<Option<String>>>>,
    repaint: Mutex<Option<egui::Context>>,
}

/// A running helper process.
pub struct Host {
    commands: mpsc::Sender<Vec<u8>>,
    inbox: Arc<Inbox>,
    alive: Arc<AtomicBool>,
    child: Child,
    next_id: AtomicU64,
}

impl Host {
    fn spawn() -> Result<Host> {
        let exe = std::env::current_exe().context("couldn't find Switchboard's own executable")?;
        let mut child = Command::new(exe)
            .arg("--media-host")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .context("couldn't start the media helper")?;
        if let Some(job) = job() {
            unsafe {
                let _ = AssignProcessToJobObject(job, HANDLE(child.as_raw_handle()));
            }
        }
        let mut stdin = child.stdin.take().ok_or_else(|| anyhow!("no helper stdin"))?;
        let stdout = child.stdout.take().ok_or_else(|| anyhow!("no helper stdout"))?;
        let (commands, rx) = mpsc::channel::<Vec<u8>>();
        // Writer: ends (closing the helper's stdin) when the Host is dropped.
        std::thread::Builder::new().name("media-client-tx".into()).spawn(move || {
            for line in rx {
                if stdin.write_all(&line).and_then(|_| stdin.flush()).is_err() {
                    break;
                }
            }
        })?;
        let inbox = Arc::new(Inbox::default());
        let alive = Arc::new(AtomicBool::new(true));
        {
            let (inbox, alive) = (inbox.clone(), alive.clone());
            std::thread::Builder::new().name("media-client-rx".into()).spawn(move || {
                let mut reader = BufReader::new(stdout);
                let mut line = String::new();
                while reader.read_line(&mut line).is_ok_and(|n| n > 0) {
                    if let Ok(event) = serde_json::from_str::<Event>(&line) {
                        match event {
                            Event::Status { status } => *inbox.status.lock().unwrap() = Some(status),
                            Event::Error { text } => *inbox.error.lock().unwrap() = text,
                            Event::Thumbnail { id, error } => {
                                if let Some(tx) = inbox.replies.lock().unwrap().remove(&id) {
                                    let _ = tx.send(error);
                                }
                            }
                        }
                        if let Some(ctx) = inbox.repaint.lock().unwrap().as_ref() {
                            REPAINTS.fetch_add(1, Ordering::Relaxed);
                            ctx.request_repaint();
                        }
                    }
                    line.clear();
                }
                // The helper exited (or was killed).
                alive.store(false, Ordering::Release);
                inbox.replies.lock().unwrap().clear();
                if let Some(ctx) = inbox.repaint.lock().unwrap().as_ref() {
                    ctx.request_repaint();
                }
            })?;
        }
        if std::env::var_os("SB_MEM_TRACE").is_some() {
            HELPERS.lock().unwrap().push(child.id());
        }
        Ok(Host { commands, inbox, alive, child, next_id: AtomicU64::new(1) })
    }

    pub fn alive(&self) -> bool {
        self.alive.load(Ordering::Acquire)
    }

    pub fn send(&self, cmd: &Cmd) {
        if let Ok(mut line) = serde_json::to_vec(cmd) {
            line.push(b'\n');
            let _ = self.commands.send(line);
        }
    }

    /// The newest playback status the helper reported.
    pub fn status(&self) -> Option<Status> {
        self.inbox.status.lock().unwrap().clone()
    }

    /// The helper's current playback error, if any.
    pub fn error(&self) -> Option<String> {
        self.inbox.error.lock().unwrap().clone()
    }

    /// Repaint this context whenever the helper reports something.
    pub fn set_repaint(&self, ctx: Option<egui::Context>) {
        *self.inbox.repaint.lock().unwrap() = ctx;
    }

    /// Gives the helper the frame section (a duplicated handle).
    pub fn share_frames(&self, section: &FrameSection) -> Result<()> {
        let mut target = HANDLE::default();
        unsafe {
            DuplicateHandle(
                GetCurrentProcess(),
                section.handle,
                HANDLE(self.child.as_raw_handle()),
                &mut target,
                0,
                false,
                DUPLICATE_SAME_ACCESS,
            )?;
        }
        self.send(&Cmd::Frames { handle: target.0 as usize as u64, bytes: frames::BYTES as u64 });
        Ok(())
    }

    /// Decodes a thumbnail into `cache`. Blocks the calling (worker) thread.
    fn thumbnail(&self, clip: &Path, cache: &Path) -> Result<()> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel();
        self.inbox.replies.lock().unwrap().insert(id, tx);
        if !self.alive() {
            self.inbox.replies.lock().unwrap().remove(&id);
            bail!("the media helper stopped");
        }
        self.send(&Cmd::Thumbnail { id, clip: clip.to_path_buf(), cache: cache.to_path_buf() });
        match rx.recv_timeout(THUMB_TIMEOUT) {
            Ok(None) => Ok(()),
            Ok(Some(e)) => Err(anyhow!(e)),
            Err(_) => {
                self.inbox.replies.lock().unwrap().remove(&id);
                bail!("the media helper didn't make a thumbnail")
            }
        }
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        // Dropping `commands` ends the writer thread, which closes the
        // helper's stdin; the helper then exits on its own. No waiting here.
        self.set_repaint(None);
    }
}

/// Kill-on-close job shared by every helper. Its handle lives as long as
/// the window process, so helpers can't outlive it.
fn job() -> Option<HANDLE> {
    static JOB: OnceLock<Option<usize>> = OnceLock::new();
    let raw = JOB.get_or_init(|| unsafe {
        let job = CreateJobObjectW(None, None).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let set = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if set.is_err() {
            let _ = CloseHandle(job);
            return None;
        }
        Some(job.0 as usize)
    });
    raw.map(|h| HANDLE(h as *mut _))
}

static SHARED: Mutex<Weak<Host>> = Mutex::new(Weak::new());
static LINGERING: Mutex<Option<(Arc<Host>, Instant)>> = Mutex::new(None);
static LINGER_THREAD: AtomicBool = AtomicBool::new(false);
/// Helper process ids started by this process (only with SB_MEM_TRACE).
static HELPERS: Mutex<Vec<u32>> = Mutex::new(Vec::new());
/// Repaints requested on behalf of helper events (diagnostics).
static REPAINTS: AtomicU64 = AtomicU64::new(0);

/// Diagnostics: repaints requested because of helper events so far.
pub fn debug_repaints() -> u64 {
    REPAINTS.load(Ordering::Relaxed)
}

/// The running helper, or a newly started one.
pub fn shared() -> Result<Arc<Host>> {
    let mut slot = SHARED.lock().unwrap();
    if let Some(h) = slot.upgrade().filter(|h| h.alive()) {
        return Ok(h);
    }
    let h = Arc::new(Host::spawn()?);
    *slot = Arc::downgrade(&h);
    Ok(h)
}

/// Keeps `host` running for [`LINGER`] more.
fn linger(host: Arc<Host>) {
    *LINGERING.lock().unwrap() = Some((host, Instant::now() + LINGER));
    if LINGER_THREAD.swap(true, Ordering::AcqRel) {
        return;
    }
    let _ = std::thread::Builder::new().name("media-linger".into()).spawn(|| {
        loop {
            std::thread::sleep(Duration::from_millis(250));
            let mut l = LINGERING.lock().unwrap();
            if l.as_ref().is_some_and(|(_, until)| Instant::now() >= *until) {
                let host = l.take();
                // Clear the flag under the lock, so a new linger() call
                // either sees it set (and this loop picks it up) or starts
                // a new thread.
                LINGER_THREAD.store(false, Ordering::Release);
                drop(l);
                drop(host);
                return;
            }
        }
    });
}

/// Decodes a clip's thumbnail into the cache file `cache` in the helper.
/// Blocking: call from a worker thread.
pub fn thumbnail(clip: &Path, cache: &Path) -> Result<()> {
    let host = shared()?;
    let result = host.thumbnail(clip, cache);
    linger(host);
    result
}

/// Review only: terminates the running helper, as a crash would.
pub fn debug_kill_helper() -> bool {
    use windows::Win32::System::Threading::TerminateProcess;
    let Some(h) = SHARED.lock().unwrap().upgrade() else { return false };
    unsafe { TerminateProcess(HANDLE(h.child.as_raw_handle()), 1).is_ok() }
}

/// Diagnostics: (pid, private MB, CPU ms) per helper started; MB is None
/// once it has exited.
pub fn debug_helpers() -> Vec<(u32, Option<u64>, u64)> {
    use windows::Win32::System::ProcessStatus::{GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX};
    use windows::Win32::System::Threading::{
        GetExitCodeProcess, GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
    };
    const STILL_ACTIVE: u32 = 259;
    HELPERS
        .lock()
        .unwrap()
        .iter()
        .map(|&pid| unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, false, pid) else {
                return (pid, None, 0);
            };
            let (mut c0, mut c1, mut k, mut u) = Default::default();
            let cpu_ms = if GetProcessTimes(h, &mut c0, &mut c1, &mut k, &mut u).is_ok() {
                let t = |f: windows::Win32::Foundation::FILETIME| ((f.dwHighDateTime as u64) << 32 | f.dwLowDateTime as u64) / 10_000;
                t(k) + t(u)
            } else {
                0
            };
            let mut code = 0u32;
            let running = GetExitCodeProcess(h, &mut code).is_ok() && code == STILL_ACTIVE;
            let mut c = PROCESS_MEMORY_COUNTERS_EX::default();
            let ok = GetProcessMemoryInfo(
                h,
                &mut c as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
                std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32,
            )
            .is_ok();
            let _ = CloseHandle(h);
            (pid, (running && ok).then(|| (c.PrivateUsage / (1024 * 1024)) as u64), cpu_ms)
        })
        .collect()
}

/// The window's frame section: created here (reserved, header committed),
/// shared with each helper by handle duplication.
pub struct FrameSection {
    handle: HANDLE,
    view: frames::View,
}

unsafe impl Send for FrameSection {}

impl FrameSection {
    pub fn create() -> Result<FrameSection> {
        let handle = frames::create().context("couldn't create the preview frame buffer")?;
        match frames::View::map(handle, true) {
            Ok(view) => Ok(FrameSection { handle, view }),
            Err(e) => {
                unsafe {
                    let _ = CloseHandle(handle);
                }
                Err(e)
            }
        }
    }

    pub fn view(&self) -> &frames::View {
        &self.view
    }
}

impl Drop for FrameSection {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.handle);
        }
    }
}
