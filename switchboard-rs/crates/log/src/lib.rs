use std::fmt::Arguments;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const ROTATE_AT: u64 = 1024 * 1024;
const KEEP_CRASHES: usize = 5;
const SEEN_FILE: &str = "crash-seen.txt";

struct Sink {
    file: File,
    path: PathBuf,
    size: u64,
}

static SINK: Mutex<Option<Sink>> = Mutex::new(None);
static ROLE: OnceLock<String> = OnceLock::new();

#[macro_export]
macro_rules! log {
    ($($t:tt)*) => { $crate::write(format_args!($($t)*)) };
}

pub fn logs_dir() -> PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    base.join("Switchboard Native").join("Logs")
}

pub fn log_path(role: &str) -> PathBuf {
    logs_dir().join(format!("{role}.log"))
}

pub fn init(role: &str) {
    let _ = ROLE.set(role.to_string());
    let path = log_path(role);
    let _ = std::fs::create_dir_all(logs_dir());
    if let Some(sink) = open(&path) {
        *SINK.lock().unwrap_or_else(|e| e.into_inner()) = Some(sink);
    }
}

fn open(path: &Path) -> Option<Sink> {
    let file = OpenOptions::new().create(true).append(true).open(path).ok()?;
    let size = file.metadata().map(|m| m.len()).unwrap_or(0);
    Some(Sink { file, path: path.to_path_buf(), size })
}

pub fn write(args: Arguments) {
    emit(args, true);
}

fn emit(args: Arguments, wait: bool) {
    let thread = std::thread::current();
    let line = format!("{} [{}] {args}\n", timestamp(), thread.name().unwrap_or("thread"));
    let mut guard = match SINK.try_lock() {
        Ok(g) => g,
        Err(std::sync::TryLockError::Poisoned(e)) => e.into_inner(),
        Err(std::sync::TryLockError::WouldBlock) if wait => SINK.lock().unwrap_or_else(|e| e.into_inner()),
        Err(std::sync::TryLockError::WouldBlock) => return,
    };
    let Some(sink) = guard.as_mut() else {
        eprint!("{line}");
        return;
    };
    if sink.size + line.len() as u64 > ROTATE_AT {
        let rotated = sink.path.with_extension("1.log");
        let path = sink.path.clone();
        *guard = None;
        let _ = std::fs::rename(&path, &rotated);
        *guard = open(&path);
    }
    if let Some(sink) = guard.as_mut()
        && sink.file.write_all(line.as_bytes()).is_ok()
    {
        sink.size += line.len() as u64;
    }
}

pub fn tail(role: &str, lines: usize) -> Vec<String> {
    let current = log_path(role);
    let mut all = Vec::new();
    for path in [current.with_extension("1.log"), current] {
        if let Ok(text) = std::fs::read(&path) {
            all.extend(String::from_utf8_lossy(&text).lines().map(str::to_string));
        }
    }
    let skip = all.len().saturating_sub(lines);
    all.split_off(skip)
}

fn timestamp() -> String {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}.{:03}",
        t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds
    )
}

fn file_stamp() -> String {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    format!("{:04}{:02}{:02}-{:02}{:02}{:02}-{:03}", t.wYear, t.wMonth, t.wDay, t.wHour, t.wMinute, t.wSecond, t.wMilliseconds)
}

fn module_base() -> usize {
    unsafe { windows::Win32::System::LibraryLoader::GetModuleHandleW(None) }.map(|h| h.0 as usize).unwrap_or(0)
}

fn crash_header(kind: &str) -> String {
    format!(
        "Switchboard {} crash report\nrole: {}\ntime: {}\nmodule base: {:#x}\nkind: {kind}\n",
        env!("CARGO_PKG_VERSION"),
        ROLE.get().map(String::as_str).unwrap_or("unknown"),
        timestamp(),
        module_base(),
    )
}

fn write_crash(body: &str) {
    let dir = logs_dir();
    let _ = std::fs::create_dir_all(&dir);
    let role = ROLE.get().map(String::as_str).unwrap_or("unknown");
    let _ = std::fs::write(dir.join(format!("crash-{role}-{}.txt", file_stamp())), body);
    let mut crashes = crash_files();
    while crashes.len() > KEEP_CRASHES {
        let _ = std::fs::remove_file(crashes.remove(0));
    }
}

pub fn crash_files() -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(logs_dir()) else { return Vec::new() };
    let mut files: Vec<(String, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter_map(|p| {
            let name = p.file_name()?.to_string_lossy().to_string();
            if name == SEEN_FILE {
                return None;
            }
            let stamp = name.strip_prefix("crash-")?.strip_suffix(".txt")?.rsplitn(4, '-').take(3).collect::<Vec<_>>();
            let key = stamp.into_iter().rev().collect::<Vec<_>>().join("-");
            Some((key, p))
        })
        .collect();
    files.sort();
    files.into_iter().map(|(_, p)| p).collect()
}

pub fn take_unseen_crash() -> Option<PathBuf> {
    let newest = crash_files().pop()?;
    let name = newest.file_name()?.to_string_lossy().to_string();
    let seen_path = logs_dir().join(SEEN_FILE);
    let seen = std::fs::read_to_string(&seen_path).unwrap_or_default();
    if seen.trim() == name {
        return None;
    }
    let _ = std::fs::write(&seen_path, &name);
    Some(newest)
}

pub fn install_crash_handlers() {
    std::panic::set_hook(Box::new(|info| {
        let thread = std::thread::current();
        let name = thread.name().unwrap_or("thread").to_string();
        let backtrace = std::backtrace::Backtrace::force_capture();
        write(format_args!("panic on {name}: {info}"));
        write_crash(&format!("{}thread: {name}\n{info}\n\nbacktrace:\n{backtrace}\n", crash_header("panic")));
    }));
    unsafe {
        let previous = windows::Win32::System::Diagnostics::Debug::SetUnhandledExceptionFilter(Some(on_exception));
        let _ = PREVIOUS_FILTER.set(previous.map(|f| f as usize));
    }
}

type Filter = unsafe extern "system" fn(*const windows::Win32::System::Diagnostics::Debug::EXCEPTION_POINTERS) -> i32;
static PREVIOUS_FILTER: OnceLock<Option<usize>> = OnceLock::new();
static IN_FILTER: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
const STACK_OVERFLOW: u32 = 0xC000_00FD;

unsafe extern "system" fn on_exception(info: *const windows::Win32::System::Diagnostics::Debug::EXCEPTION_POINTERS) -> i32 {
    let (code, address) = unsafe {
        info.as_ref()
            .and_then(|p| p.ExceptionRecord.as_ref())
            .map(|r| (r.ExceptionCode.0 as u32, r.ExceptionAddress as usize))
            .unwrap_or((0, 0))
    };
    if code != STACK_OVERFLOW && !IN_FILTER.swap(true, std::sync::atomic::Ordering::SeqCst) {
        record_exception(code, address);
    }
    match PREVIOUS_FILTER.get().copied().flatten() {
        Some(f) => unsafe { std::mem::transmute::<usize, Filter>(f)(info) },
        None => 0,
    }
}

fn record_exception(code: u32, address: usize) {
    let base = module_base();
    let rva = if address >= base && base != 0 { format!("{:#x}", address - base) } else { "outside the executable".into() };
    let thread = std::thread::current();
    let body = format!(
        "{}thread: {}\nexception code: {code:#010x}\naddress: {address:#x} (rva {rva})\n",
        crash_header("native exception"),
        thread.name().unwrap_or("thread"),
    );
    emit(format_args!("native exception {code:#010x} at {address:#x} (rva {rva})"), false);
    write_crash(&body);
}
