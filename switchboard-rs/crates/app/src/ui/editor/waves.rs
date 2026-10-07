//! Waveform loading for the editor: one worker thread and one queue, so a
//! long montage decodes its clips one at a time instead of starting a
//! thread per clip. The selected segment's clip goes first. Jobs for clips
//! that leave the project are dropped, and the queue closes with the editor
//! (a clip already decoding finishes, its result is discarded).
//!
//! Decoding stays in the window process: measured on a 4K recorder clip,
//! audio-only Media Foundation decode leaves ~3 MB behind (video decode
//! leaves ~160 MB, which is why video runs in the media helper).

use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex, mpsc};

use switchboard_project::Project;

/// Peak buckets per track.
const BUCKETS: usize = 1200;

#[derive(Default)]
struct Queue {
    jobs: VecDeque<(String, PathBuf)>,
    closed: bool,
}

#[derive(Default)]
struct Shared {
    queue: Mutex<Queue>,
    wake: Condvar,
}

type Waveform = Vec<Vec<f32>>;

pub struct Waves {
    shared: Arc<Shared>,
    tx: mpsc::Sender<(String, Waveform)>,
    rx: mpsc::Receiver<(String, Waveform)>,
    /// Queued or decoding.
    pending: HashSet<String>,
    worker: bool,
    ctx: egui::Context,
}

impl Waves {
    pub fn new(ctx: &egui::Context) -> Waves {
        let (tx, rx) = mpsc::channel();
        Waves { shared: Default::default(), tx, rx, pending: HashSet::new(), worker: false, ctx: ctx.clone() }
    }

    /// Collects finished waveforms into `done` and queues the project's
    /// missing ones, the clip of segment `selected` first.
    pub fn poll(&mut self, project: &Project, paths: &HashMap<String, PathBuf>, selected: usize, done: &mut HashMap<String, Arc<Waveform>>) {
        while let Ok((id, w)) = self.rx.try_recv() {
            self.pending.remove(&id);
            done.insert(id, Arc::new(w));
        }
        let in_project: HashSet<&str> = project.segments.iter().map(|s| s.clip_id.as_str()).collect();
        let first = project.segments.get(selected).map(|s| s.clip_id.as_str());
        let mut order: Vec<&str> = first.into_iter().collect();
        order.extend(project.segments.iter().map(|s| s.clip_id.as_str()).filter(|id| Some(*id) != first));
        let mut q = self.shared.queue.lock().unwrap();
        // Cancel clips that left the project (one already decoding still
        // delivers its result).
        q.jobs.retain(|(id, _)| in_project.contains(id.as_str()));
        self.pending.retain(|id| in_project.contains(id.as_str()));
        let mut added = false;
        for id in order {
            if done.contains_key(id) || self.pending.contains(id) {
                continue;
            }
            let Some(path) = paths.get(id) else { continue };
            self.pending.insert(id.to_string());
            if Some(id) == first {
                q.jobs.push_front((id.to_string(), path.clone()));
            } else {
                q.jobs.push_back((id.to_string(), path.clone()));
            }
            added = true;
        }
        drop(q);
        if added {
            self.start_worker();
            self.shared.wake.notify_one();
        }
    }

    fn start_worker(&mut self) {
        if self.worker {
            return;
        }
        let (shared, tx, ctx) = (self.shared.clone(), self.tx.clone(), self.ctx.clone());
        let spawned = std::thread::Builder::new().name("editor-waves".into()).spawn(move || {
            loop {
                let job = {
                    let mut q = shared.queue.lock().unwrap();
                    loop {
                        if q.closed {
                            return;
                        }
                        if let Some(job) = q.jobs.pop_front() {
                            break job;
                        }
                        q = shared.wake.wait(q).unwrap();
                    }
                };
                let (id, path) = job;
                // A clip that can't be read keeps an empty waveform.
                let w = switchboard_media::waveforms(&path, BUCKETS).unwrap_or_default();
                if shared.queue.lock().unwrap().closed || tx.send((id, w)).is_err() {
                    return;
                }
                ctx.request_repaint();
            }
        });
        self.worker = spawned.is_ok();
    }
}

impl Drop for Waves {
    fn drop(&mut self) {
        let mut q = self.shared.queue.lock().unwrap();
        q.closed = true;
        q.jobs.clear();
        drop(q);
        self.shared.wake.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn project(ids: &[&str]) -> (Project, HashMap<String, PathBuf>) {
        let mut p = Project::for_clip(ids[0], "T", 1000, None, 0);
        for id in &ids[1..] {
            p.segments.push(switchboard_project::Segment::new(id, 1000, None));
        }
        // Missing files: each job fails fast and delivers an empty waveform.
        let paths = ids.iter().map(|id| (id.to_string(), std::env::temp_dir().join(format!("sb-missing-{id}.mp4")))).collect();
        (p, paths)
    }

    #[test]
    fn one_worker_delivers_every_clip_and_drops_removed_ones() {
        let mut w = Waves::new(&egui::Context::default());
        let (p, paths) = project(&["a", "b", "c"]);
        let mut done = HashMap::new();
        let until = Instant::now() + Duration::from_secs(10);
        while done.len() < 3 && Instant::now() < until {
            w.poll(&p, &paths, 1, &mut done);
            std::thread::sleep(Duration::from_millis(5));
        }
        assert_eq!(done.len(), 3);
        // A clip leaving the project is no longer pending; nothing re-queues.
        let (p2, paths2) = project(&["a", "d"]);
        {
            let mut q = w.shared.queue.lock().unwrap();
            q.jobs.push_back(("c".into(), PathBuf::new()));
        }
        w.poll(&p2, &paths2, 0, &mut done);
        assert!(w.shared.queue.lock().unwrap().jobs.iter().all(|(id, _)| id != "c"));
        assert!(!w.pending.contains("b"));
    }
}
