//! Minimal blocking HTTP/1.1 for loopback integrations: a single-threaded
//! server (CS2 GSI) and a GET client (War Thunder). Bounded header and body
//! sizes, per-message deadlines, `Connection: close` only. Every blocking
//! socket can be aborted from another thread through [`AbortSlot`].

use std::io::{self, Read, Write};
use std::net::{Ipv4Addr, Shutdown, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub const MAX_HEADER_BYTES: usize = 8 * 1024;

#[derive(Debug)]
pub enum HttpError {
    Io(io::Error),
    TimedOut,
    TooLarge,
    Malformed(&'static str),
    LengthRequired,
}

impl std::fmt::Display for HttpError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::TimedOut => f.write_str("request timed out"),
            Self::TooLarge => f.write_str("payload exceeded the local limit"),
            Self::Malformed(what) => write!(f, "malformed HTTP {what}"),
            Self::LengthRequired => f.write_str("length required"),
        }
    }
}

impl std::error::Error for HttpError {}

impl From<io::Error> for HttpError {
    fn from(e: io::Error) -> Self {
        if matches!(
            e.kind(),
            io::ErrorKind::TimedOut | io::ErrorKind::WouldBlock
        ) {
            Self::TimedOut
        } else {
            Self::Io(e)
        }
    }
}

/// Holds the socket currently blocked in I/O so `abort` can shut it down.
#[derive(Default)]
pub struct AbortSlot {
    stream: Mutex<Option<TcpStream>>,
    aborted: AtomicBool,
}

impl AbortSlot {
    fn register(&self, stream: &TcpStream) -> io::Result<()> {
        let clone = stream.try_clone()?;
        *self.stream.lock().unwrap_or_else(|e| e.into_inner()) = Some(clone);
        if self.aborted.load(Ordering::SeqCst) {
            let _ = stream.shutdown(Shutdown::Both);
        }
        Ok(())
    }

    fn clear(&self) {
        self.stream.lock().unwrap_or_else(|e| e.into_inner()).take();
    }

    pub fn abort(&self) {
        self.aborted.store(true, Ordering::SeqCst);
        if let Some(s) = self.stream.lock().unwrap_or_else(|e| e.into_inner()).take() {
            let _ = s.shutdown(Shutdown::Both);
        }
    }

    pub fn is_aborted(&self) -> bool {
        self.aborted.load(Ordering::SeqCst)
    }
}

/// Read adapter that enforces an absolute deadline on a `TcpStream` and
/// stops promptly once `abort` fires. On Windows, shutting down a cloned
/// socket does not wake a blocking `recv`, so waits are sliced into 100 ms
/// steps. This only runs while a connection is open.
struct Timed<'a> {
    stream: &'a TcpStream,
    deadline: Instant,
    abort: &'a AbortSlot,
}

const ABORT_SLICE: Duration = Duration::from_millis(100);

impl Read for Timed<'_> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        loop {
            if self.abort.is_aborted() {
                return Err(io::ErrorKind::ConnectionAborted.into());
            }
            let remaining = self.deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(io::ErrorKind::TimedOut.into());
            }
            self.stream
                .set_read_timeout(Some(remaining.min(ABORT_SLICE)))?;
            match (&*self.stream).read(buf) {
                Err(e)
                    if matches!(
                        e.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                    ) =>
                {
                    continue;
                }
                other => return other,
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Head {
    pub start_line: String,
    pub headers: Vec<(String, String)>,
}

impl Head {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

/// Buffered reader over any `Read` that parses one HTTP message.
struct MessageReader<R> {
    inner: R,
    buf: Vec<u8>,
    pos: usize,
}

impl<R: Read> MessageReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner,
            buf: Vec::with_capacity(1024),
            pos: 0,
        }
    }

    fn fill(&mut self) -> Result<usize, HttpError> {
        let mut chunk = [0u8; 4096];
        let n = self.inner.read(&mut chunk)?;
        self.buf.extend_from_slice(&chunk[..n]);
        Ok(n)
    }

    fn read_head(&mut self) -> Result<Head, HttpError> {
        let end = loop {
            if let Some(i) = find(&self.buf[self.pos..], b"\r\n\r\n") {
                break self.pos + i;
            }
            if self.buf.len() - self.pos > MAX_HEADER_BYTES {
                return Err(HttpError::TooLarge);
            }
            if self.fill()? == 0 {
                return Err(HttpError::Malformed("header"));
            }
        };
        if end - self.pos > MAX_HEADER_BYTES {
            return Err(HttpError::TooLarge);
        }
        let text = std::str::from_utf8(&self.buf[self.pos..end])
            .map_err(|_| HttpError::Malformed("header"))?;
        let mut lines = text.split("\r\n");
        let start_line = lines.next().unwrap_or_default().to_owned();
        let mut headers = Vec::new();
        for line in lines {
            let (k, v) = line.split_once(':').ok_or(HttpError::Malformed("header"))?;
            headers.push((k.trim().to_owned(), v.trim().to_owned()));
        }
        self.pos = end + 4;
        Ok(Head {
            start_line,
            headers,
        })
    }

    fn take(&mut self, n: usize) -> Result<Vec<u8>, HttpError> {
        while self.buf.len() - self.pos < n {
            if self.fill()? == 0 {
                return Err(HttpError::Malformed("body"));
            }
        }
        let out = self.buf[self.pos..self.pos + n].to_vec();
        self.pos += n;
        Ok(out)
    }

    fn line(&mut self) -> Result<String, HttpError> {
        loop {
            if let Some(i) = find(&self.buf[self.pos..], b"\r\n") {
                let line = String::from_utf8_lossy(&self.buf[self.pos..self.pos + i]).into_owned();
                self.pos += i + 2;
                return Ok(line);
            }
            if self.buf.len() - self.pos > 1024 {
                return Err(HttpError::Malformed("chunk"));
            }
            if self.fill()? == 0 {
                return Err(HttpError::Malformed("chunk"));
            }
        }
    }

    /// Body framed by `Transfer-Encoding: chunked`, `Content-Length`, or (for
    /// responses only) connection close.
    fn read_body(
        &mut self,
        head: &Head,
        max: usize,
        until_close: bool,
    ) -> Result<Vec<u8>, HttpError> {
        if head
            .header("transfer-encoding")
            .is_some_and(|v| v.to_ascii_lowercase().contains("chunked"))
        {
            let mut body = Vec::new();
            loop {
                let size_line = self.line()?;
                let size_hex = size_line.split(';').next().unwrap_or("").trim();
                let size = usize::from_str_radix(size_hex, 16)
                    .map_err(|_| HttpError::Malformed("chunk"))?;
                if size == 0 {
                    // Trailers (rare) end with an empty line.
                    while !self.line()?.is_empty() {}
                    return Ok(body);
                }
                if body.len() + size > max {
                    return Err(HttpError::TooLarge);
                }
                body.extend(self.take(size)?);
                if !self.line()?.is_empty() {
                    return Err(HttpError::Malformed("chunk"));
                }
            }
        }
        if let Some(len) = head.header("content-length") {
            let len: usize = len
                .parse()
                .map_err(|_| HttpError::Malformed("content-length"))?;
            if len > max {
                return Err(HttpError::TooLarge);
            }
            return self.take(len);
        }
        if !until_close {
            return Err(HttpError::LengthRequired);
        }
        loop {
            if self.buf.len() - self.pos > max {
                return Err(HttpError::TooLarge);
            }
            if self.fill()? == 0 {
                let out = self.buf[self.pos..].to_vec();
                self.pos = self.buf.len();
                return Ok(out);
            }
        }
    }
}

fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|w| w == needle)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Request {
    pub method: String,
    pub path: String,
    pub body: Vec<u8>,
}

/// Parse one request from a reader (exposed for tests).
pub fn read_request(reader: impl Read, max_body: usize) -> Result<Request, HttpError> {
    let mut r = MessageReader::new(reader);
    let head = r.read_head()?;
    let mut parts = head.start_line.split(' ');
    let method = parts
        .next()
        .filter(|m| !m.is_empty())
        .ok_or(HttpError::Malformed("request line"))?
        .to_owned();
    let path = parts
        .next()
        .ok_or(HttpError::Malformed("request line"))?
        .to_owned();
    if !parts.next().is_some_and(|v| v.starts_with("HTTP/1.")) {
        return Err(HttpError::Malformed("request line"));
    }
    let body = if method == "GET" || method == "HEAD" {
        Vec::new()
    } else {
        r.read_body(&head, max_body, false)?
    };
    Ok(Request { method, path, body })
}

/// Parse one response (status, body) from a reader (exposed for tests).
pub fn read_response(reader: impl Read, max_body: usize) -> Result<(u16, Vec<u8>), HttpError> {
    let mut r = MessageReader::new(reader);
    let head = r.read_head()?;
    let mut parts = head.start_line.split(' ');
    if !parts.next().is_some_and(|v| v.starts_with("HTTP/1.")) {
        return Err(HttpError::Malformed("status line"));
    }
    let status: u16 = parts
        .next()
        .and_then(|s| s.parse().ok())
        .ok_or(HttpError::Malformed("status line"))?;
    let body = r.read_body(&head, max_body, true)?;
    Ok((status, body))
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        408 => "Request Timeout",
        411 => "Length Required",
        413 => "Payload Too Large",
        _ => "Error",
    }
}

/// Blocking GET over loopback with an overall deadline and body cap.
pub fn get(
    addr: SocketAddr,
    path_and_query: &str,
    timeout: Duration,
    max_body: usize,
    abort: &AbortSlot,
) -> Result<(u16, Vec<u8>), HttpError> {
    let deadline = Instant::now() + timeout;
    let stream = TcpStream::connect_timeout(&addr, timeout)?;
    abort.register(&stream)?;
    let result = (|| {
        let remaining = deadline
            .saturating_duration_since(Instant::now())
            .max(Duration::from_millis(1));
        stream.set_write_timeout(Some(remaining))?;
        let request = format!(
            "GET {path_and_query} HTTP/1.1\r\nHost: {addr}\r\nAccept: application/json\r\nConnection: close\r\n\r\n"
        );
        (&stream).write_all(request.as_bytes())?;
        read_response(
            Timed {
                stream: &stream,
                deadline,
                abort,
            },
            max_body,
        )
    })();
    abort.clear();
    let _ = stream.shutdown(Shutdown::Both);
    result
}

pub struct ServerConfig {
    pub bind: SocketAddr,
    pub max_body: usize,
    /// Deadline for reading one complete request.
    pub request_timeout: Duration,
}

/// One accept thread, one connection at a time (CS2 posts sequentially),
/// `Connection: close` after every response. `stop` joins the thread.
pub struct LoopbackServer {
    local_addr: SocketAddr,
    stop: Arc<AtomicBool>,
    current: Arc<AbortSlot>,
    thread: Option<JoinHandle<()>>,
}

impl LoopbackServer {
    /// `handler` returns the HTTP status for each well-formed request;
    /// transport errors are reported through `on_error` with status 400/408/
    /// 411/413 already sent when possible.
    pub fn start(
        config: ServerConfig,
        mut handler: impl FnMut(&Request) -> u16 + Send + 'static,
        mut on_error: impl FnMut(&HttpError) + Send + 'static,
    ) -> io::Result<Self> {
        if !config.bind.ip().is_loopback() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "loopback address required",
            ));
        }
        let listener = TcpListener::bind(config.bind)?;
        let local_addr = listener.local_addr()?;
        let stop = Arc::new(AtomicBool::new(false));
        let current = Arc::new(AbortSlot::default());
        let thread = {
            let stop = stop.clone();
            let current = current.clone();
            std::thread::Builder::new().name("autocapture-http".into()).spawn(move || {
                for incoming in listener.incoming() {
                    if stop.load(Ordering::SeqCst) {
                        break;
                    }
                    let Ok(stream) = incoming else { continue };
                    if !stream.peer_addr().is_ok_and(|a| a.ip().is_loopback()) {
                        let _ = stream.shutdown(Shutdown::Both);
                        continue;
                    }
                    if current.register(&stream).is_err() {
                        continue;
                    }
                    let deadline = Instant::now() + config.request_timeout;
                    let status = match read_request(Timed { stream: &stream, deadline, abort: &current }, config.max_body) {
                        Ok(request) => handler(&request),
                        Err(e) => {
                            let status = match e {
                                HttpError::TooLarge => 413,
                                HttpError::TimedOut => 408,
                                HttpError::LengthRequired => 411,
                                _ => 400,
                            };
                            if !stop.load(Ordering::SeqCst) {
                                on_error(&e);
                            }
                            status
                        }
                    };
                    let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
                    let response = format!(
                        "HTTP/1.1 {status} {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
                        reason(status)
                    );
                    let _ = (&stream).write_all(response.as_bytes());
                    let _ = stream.shutdown(Shutdown::Both);
                    current.clear();
                }
            })?
        };
        Ok(Self {
            local_addr,
            stop,
            current,
            thread: Some(thread),
        })
    }

    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// Close the listener and any in-flight connection, then join.
    pub fn stop(&mut self) {
        let Some(thread) = self.thread.take() else {
            return;
        };
        self.stop.store(true, Ordering::SeqCst);
        self.current.abort();
        // Unblock `accept` with a throwaway loopback connection.
        let wake = SocketAddr::V4(SocketAddrV4::new(
            Ipv4Addr::LOCALHOST,
            self.local_addr.port(),
        ));
        let _ = TcpStream::connect_timeout(&wake, Duration::from_millis(500));
        let _ = thread.join();
    }
}

impl Drop for LoopbackServer {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn parses_requests() {
        let raw = b"POST /game-state HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\n\r\nhello";
        let r = read_request(&raw[..], 100).unwrap();
        assert_eq!(
            (r.method.as_str(), r.path.as_str(), r.body.as_slice()),
            ("POST", "/game-state", &b"hello"[..])
        );
        let big = b"POST / HTTP/1.1\r\nContent-Length: 500\r\n\r\n";
        assert!(matches!(
            read_request(&big[..], 100),
            Err(HttpError::TooLarge)
        ));
        let no_len = b"POST / HTTP/1.1\r\n\r\nabc";
        assert!(matches!(
            read_request(&no_len[..], 100),
            Err(HttpError::LengthRequired)
        ));
        let chunked = b"POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2;x=y\r\nde\r\n0\r\n\r\n";
        assert_eq!(read_request(&chunked[..], 100).unwrap().body, b"abcde");
        let chunked_big = b"POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n80\r\n";
        assert!(matches!(
            read_request(&chunked_big[..], 100),
            Err(HttpError::TooLarge)
        ));
        assert!(read_request(&b"garbage\r\n\r\n"[..], 100).is_err());
        let huge_header = vec![b'a'; MAX_HEADER_BYTES + 10];
        assert!(matches!(
            read_request(&huge_header[..], 100),
            Err(HttpError::TooLarge)
        ));
    }

    #[test]
    fn parses_responses() {
        let raw = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"a\":1}";
        assert_eq!(
            read_response(&raw[..], 100).unwrap(),
            (200, b"{\"a\":1}".to_vec())
        );
        let raw = b"HTTP/1.1 200 OK\r\n\r\n0123456789";
        assert!(matches!(
            read_response(&raw[..], 5),
            Err(HttpError::TooLarge)
        ));
    }

    #[test]
    fn server_round_trip_and_shutdown() {
        let (tx, rx) = mpsc::channel();
        let mut server = LoopbackServer::start(
            ServerConfig {
                bind: "127.0.0.1:0".parse().unwrap(),
                max_body: 64,
                request_timeout: Duration::from_secs(2),
            },
            move |req| {
                tx.send(req.body.clone()).unwrap();
                if req.path == "/ok" { 204 } else { 404 }
            },
            |_| {},
        )
        .unwrap();
        let addr = server.local_addr();
        let post = |path: &str, body: &str| {
            let mut s = TcpStream::connect(addr).unwrap();
            write!(
                s,
                "POST {path} HTTP/1.1\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
            read_response(&mut s, 1024).unwrap().0
        };
        assert_eq!(post("/ok", "hi"), 204);
        assert_eq!(rx.recv().unwrap(), b"hi");
        assert_eq!(post("/nope", "x"), 404);
        assert_eq!(post("/ok", &"x".repeat(100)), 413);

        // A client that connects and stalls does not block shutdown.
        let _stalled = TcpStream::connect(addr).unwrap();
        std::thread::sleep(Duration::from_millis(50));
        let started = Instant::now();
        server.stop();
        assert!(started.elapsed() < Duration::from_secs(1));
        server.stop(); // idempotent
        assert!(TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_err());
    }

    #[test]
    fn get_client_with_abort() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let t = std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            let mut buf = [0u8; 1024];
            let n = s.read(&mut buf).unwrap();
            assert!(
                std::str::from_utf8(&buf[..n])
                    .unwrap()
                    .starts_with("GET /hudmsg?lastEvt=0&lastDmg=0 HTTP/1.1")
            );
            s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")
                .unwrap();
            // Second connection never answers.
            let (_s2, _) = listener.accept().unwrap();
            std::thread::sleep(Duration::from_millis(1_500));
        });
        let slot = AbortSlot::default();
        let (status, body) = get(
            addr,
            "/hudmsg?lastEvt=0&lastDmg=0",
            Duration::from_secs(1),
            1024,
            &slot,
        )
        .unwrap();
        assert_eq!((status, body.as_slice()), (200, &b"{}"[..]));
        let started = Instant::now();
        let err = get(addr, "/", Duration::from_millis(300), 1024, &slot).unwrap_err();
        assert!(matches!(err, HttpError::TimedOut), "{err}");
        assert!(started.elapsed() < Duration::from_millis(900));
        t.join().unwrap();
    }
}
