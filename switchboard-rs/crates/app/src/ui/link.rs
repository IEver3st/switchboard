//! Connection to the background service. State arrives as whole snapshots
//! and is kept behind an `Arc`, so each frame reads it without cloning.

use std::sync::{Arc, Mutex};

use crate::pipe;
use crate::protocol::{Event, Request, ServiceState};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Conn {
    Connecting,
    Connected,
    Offline,
}

struct Shared {
    state: Option<Arc<ServiceState>>,
    conn: Conn,
    events: Vec<Event>,
}

pub struct Link {
    shared: Mutex<Shared>,
    writer: Mutex<Option<pipe::PipeWriter>>,
}

impl Link {
    pub fn new() -> Arc<Link> {
        Arc::new(Link {
            shared: Mutex::new(Shared { state: None, conn: Conn::Connecting, events: Vec::new() }),
            writer: Mutex::new(None),
        })
    }

    pub fn connect(self: &Arc<Self>, ctx: egui::Context) {
        self.shared.lock().unwrap().conn = Conn::Connecting;
        let link = self.clone();
        std::thread::Builder::new()
            .name("sb-link".into())
            .spawn(move || {
                let Ok(conn) = pipe::connect() else {
                    link.shared.lock().unwrap().conn = Conn::Offline;
                    ctx.request_repaint();
                    return;
                };
                let mut w = conn.writer;
                let _ = pipe::send(&mut w, &Request::Subscribe);
                *link.writer.lock().unwrap() = Some(w);
                link.shared.lock().unwrap().conn = Conn::Connected;
                pipe::read_loop::<Event>(conn.reader, |ev| {
                    let mut s = link.shared.lock().unwrap();
                    match ev {
                        Event::State { state } => s.state = Some(Arc::new(*state)),
                        other => s.events.push(other),
                    }
                    drop(s);
                    ctx.request_repaint();
                });
                *link.writer.lock().unwrap() = None;
                link.shared.lock().unwrap().conn = Conn::Offline;
                ctx.request_repaint();
            })
            .expect("spawn link thread");
    }

    pub fn state(&self) -> Option<Arc<ServiceState>> {
        self.shared.lock().unwrap().state.clone()
    }

    pub fn conn(&self) -> Conn {
        self.shared.lock().unwrap().conn
    }

    pub fn take_events(&self) -> Vec<Event> {
        std::mem::take(&mut self.shared.lock().unwrap().events)
    }

    pub fn send(&self, req: Request) -> bool {
        let mut w = self.writer.lock().unwrap();
        let ok = w.as_mut().is_some_and(|file| pipe::send(file, &req).is_ok());
        if !ok {
            *w = None;
        }
        ok
    }
}
