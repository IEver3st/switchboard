//! Local named pipe transport: one JSON message per line.
//!
//! Both ends use overlapped handles. A synchronous handle serializes all I/O
//! on the file object, so a reader blocked in ReadFile would stop the writer
//! thread from ever sending; overlapped I/O lets them run concurrently.

use std::io::{BufRead, BufReader, Read, Write};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Result, bail};
use serde::Serialize;
use serde::de::DeserializeOwned;
use windows::Win32::Foundation::{
    CloseHandle, ERROR_BROKEN_PIPE, ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING, ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED,
    GENERIC_READ, GENERIC_WRITE, HANDLE,
};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_NONE,
    OPEN_EXISTING, PIPE_ACCESS_DUPLEX, ReadFile, WriteFile,
};
use windows::Win32::System::IO::{GetOverlappedResult, OVERLAPPED};
use windows::Win32::System::Pipes::{
    ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE,
    PIPE_UNLIMITED_INSTANCES, PIPE_WAIT,
};
use windows::Win32::System::Threading::CreateEventW;
use windows::core::HSTRING;

fn pipe_name() -> String {
    let user = std::env::var("USERNAME").unwrap_or_default();
    format!(r"\\.\pipe\switchboard-native-{}", user.replace(|c: char| !c.is_ascii_alphanumeric(), "_"))
}

struct Handle(HANDLE);
// The handle is only used through overlapped calls with per-call OVERLAPPED.
unsafe impl Send for Handle {}
unsafe impl Sync for Handle {}

impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

impl Handle {
    /// Runs one overlapped operation to completion.
    fn io(&self, op: impl FnOnce(HANDLE, *mut OVERLAPPED) -> windows::core::Result<()>) -> std::io::Result<usize> {
        unsafe {
            let event = CreateEventW(None, true, false, None)?;
            let event = Handle(event);
            let mut ov = OVERLAPPED { hEvent: event.0, ..Default::default() };
            if let Err(e) = op(self.0, &mut ov)
                && e.code() != ERROR_IO_PENDING.to_hresult() {
                    return Err(std::io::Error::from_raw_os_error(e.code().0 & 0xffff));
                }
            let mut n = 0u32;
            match GetOverlappedResult(self.0, &ov, &mut n, true) {
                Ok(()) => Ok(n as usize),
                Err(e) if e.code() == ERROR_BROKEN_PIPE.to_hresult() => Ok(0),
                Err(e) => Err(std::io::Error::from_raw_os_error(e.code().0 & 0xffff)),
            }
        }
    }
}

pub struct PipeReader(Arc<Handle>);
pub struct PipeWriter(Arc<Handle>);

impl Read for PipeReader {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        self.0.io(|h, ov| unsafe { ReadFile(h, Some(buf), None, Some(ov)) })
    }
}

impl Write for PipeWriter {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let n = self.0.io(|h, ov| unsafe { WriteFile(h, Some(buf), None, Some(ov)) })?;
        if n == 0 && !buf.is_empty() {
            return Err(std::io::ErrorKind::BrokenPipe.into());
        }
        Ok(n)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

pub struct Connection {
    pub reader: BufReader<PipeReader>,
    pub writer: PipeWriter,
}

fn split(h: HANDLE) -> Connection {
    let h = Arc::new(Handle(h));
    Connection { reader: BufReader::new(PipeReader(h.clone())), writer: PipeWriter(h) }
}

/// Accepts connections forever on a background thread.
pub fn serve(on_connect: impl Fn(Connection) + Send + 'static) {
    std::thread::Builder::new()
        .name("sb-pipe".into())
        .spawn(move || {
            let name = HSTRING::from(pipe_name());
            let security = OwnerOnly::new();
            let mut first = true;
            loop {
                let mut flags = PIPE_ACCESS_DUPLEX.0 | FILE_FLAG_OVERLAPPED.0;
                if first {
                    // Refuse to start if another process already owns the name.
                    flags |= FILE_FLAG_FIRST_PIPE_INSTANCE.0;
                }
                let handle = unsafe {
                    CreateNamedPipeW(
                        &name,
                        FILE_FLAGS_AND_ATTRIBUTES(flags),
                        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
                        PIPE_UNLIMITED_INSTANCES,
                        64 * 1024,
                        64 * 1024,
                        0,
                        security.as_ref().map(|s| &s.attrs as *const _),
                    )
                };
                if handle.is_invalid() {
                    std::thread::sleep(Duration::from_secs(1));
                    continue;
                }
                first = false;
                let pipe = Handle(handle);
                let connected = pipe.io(|h, ov| unsafe { ConnectNamedPipe(h, Some(ov)) });
                let connected = match connected {
                    Ok(_) => true,
                    Err(e) => e.raw_os_error() == Some(ERROR_PIPE_CONNECTED.0 as i32),
                };
                if !connected {
                    continue;
                }
                let raw = pipe.0;
                std::mem::forget(pipe);
                on_connect(split(raw));
            }
        })
        .expect("spawn pipe server");
}

/// Owner and SYSTEM only. The default pipe DACL also grants read access to
/// Everyone, which would let other accounts watch service events.
struct OwnerOnly {
    attrs: windows::Win32::Security::SECURITY_ATTRIBUTES,
}

impl OwnerOnly {
    fn new() -> Option<OwnerOnly> {
        use windows::Win32::Security::Authorization::{
            ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
        };
        use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
        let mut sd = PSECURITY_DESCRIPTOR::default();
        unsafe {
            ConvertStringSecurityDescriptorToSecurityDescriptorW(
                windows::core::w!("D:P(A;;GA;;;OW)(A;;GA;;;SY)"),
                SDDL_REVISION_1,
                &mut sd,
                None,
            )
            .ok()?;
        }
        // Lives for the whole process (the server thread never exits).
        Some(OwnerOnly {
            attrs: SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: sd.0,
                bInheritHandle: false.into(),
            },
        })
    }
}

pub fn connect() -> Result<Connection> {
    let name = HSTRING::from(pipe_name());
    for _ in 0..50 {
        let h = unsafe {
            CreateFileW(
                &name,
                (GENERIC_READ | GENERIC_WRITE).0,
                FILE_SHARE_NONE,
                None,
                OPEN_EXISTING,
                FILE_FLAG_OVERLAPPED,
                None,
            )
        };
        match h {
            Ok(h) => return Ok(split(h)),
            // All instances busy, or the server is between instances.
            Err(e) if e.code() == ERROR_PIPE_BUSY.to_hresult() || e.code() == ERROR_FILE_NOT_FOUND.to_hresult() => {
                std::thread::sleep(Duration::from_millis(100))
            }
            Err(e) => return Err(e.into()),
        }
    }
    bail!("Switchboard service is not responding")
}

pub fn send<T: Serialize>(w: &mut impl Write, msg: &T) -> std::io::Result<()> {
    let mut line = serde_json::to_vec(msg).map_err(std::io::Error::other)?;
    line.push(b'\n');
    w.write_all(&line)
}

/// Reads messages until the other end disconnects.
pub fn read_loop<T: DeserializeOwned>(reader: BufReader<PipeReader>, mut on_msg: impl FnMut(T)) {
    for line in reader.lines() {
        let Ok(line) = line else { break };
        // Bounded: ignore oversized or malformed lines rather than trusting them.
        if line.len() > 1 << 20 {
            continue;
        }
        if let Ok(msg) = serde_json::from_str::<T>(&line) {
            on_msg(msg);
        }
    }
}
