//! Clip library model: folder scan with a metadata cache, the service-owned
//! index (favorites, titles, capture source, events), filters, sorting,
//! selection, day grouping, and a bounded thumbnail texture cache.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime};

use switchboard_capture::mp4::{ProbeInfo, probe};

use crate::library_index::{CaptureSource, LibraryIndex};
use crate::settings::thumbnails_dir;

pub const THUMB_W: usize = 480;
pub const THUMB_H: usize = 270;
/// Decoded thumbnails kept as textures (~330 KB each, ~40 MB at the cap).
/// Textures are sized to the screen, so keep roughly a screenful or two.
const MAX_TEXTURES: usize = 48;

#[derive(Clone, Copy, Debug, Default)]
pub struct LocalTime {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
}

pub struct Clip {
    pub path: PathBuf,
    pub file_name: String,
    /// Shown title: the user's, or "SB <Game> · Oct 5, 9:30 PM".
    pub title: String,
    pub game: String,
    pub source: CaptureSource,
    pub favorite: bool,
    pub events: Vec<String>,
    pub modified: SystemTime,
    pub local: LocalTime,
    /// Local calendar day, as days since 1970-01-01.
    pub day: i32,
    pub bytes: u64,
    pub info: Option<ProbeInfo>,
}

impl Clip {
    pub fn seconds(&self) -> Option<f64> {
        self.info.map(|i| i.seconds)
    }
    pub fn duration_ms(&self) -> i64 {
        self.seconds().map(|s| (s * 1000.0).round() as i64).unwrap_or(0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Sort {
    Newest,
    Oldest,
    Largest,
    Smallest,
    Longest,
    Shortest,
}

impl Sort {
    pub const ALL: [Sort; 6] = [Sort::Newest, Sort::Oldest, Sort::Largest, Sort::Smallest, Sort::Longest, Sort::Shortest];
    pub fn label(self) -> &'static str {
        match self {
            Sort::Newest => "Newest",
            Sort::Oldest => "Oldest",
            Sort::Largest => "Largest",
            Sort::Smallest => "Smallest",
            Sort::Longest => "Longest",
            Sort::Shortest => "Shortest",
        }
    }
    pub fn groups_by_day(self) -> bool {
        matches!(self, Sort::Newest | Sort::Oldest)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum View {
    Grid,
    List,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SourceFilter {
    All,
    Manual,
    Auto,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateFilter {
    Any,
    Today,
    Yesterday,
    Week,
    Month,
}

impl DateFilter {
    pub const ALL: [DateFilter; 5] = [DateFilter::Any, DateFilter::Today, DateFilter::Yesterday, DateFilter::Week, DateFilter::Month];
    pub fn label(self) -> &'static str {
        match self {
            DateFilter::Any => "Any time",
            DateFilter::Today => "Today",
            DateFilter::Yesterday => "Yesterday",
            DateFilter::Week => "Last 7 days",
            DateFilter::Month => "Last 30 days",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Filters {
    pub favorites: bool,
    pub game: Option<String>,
    pub source: SourceFilter,
    pub event: Option<String>,
    pub date: DateFilter,
}

impl Default for Filters {
    fn default() -> Self {
        Filters { favorites: false, game: None, source: SourceFilter::All, event: None, date: DateFilter::Any }
    }
}

impl Filters {
    pub fn active_count(&self) -> usize {
        self.favorites as usize
            + self.game.is_some() as usize
            + (self.source != SourceFilter::All) as usize
            + self.event.is_some() as usize
            + (self.date != DateFilter::Any) as usize
    }
}

enum Slot {
    Ready(egui::TextureHandle, u64),
    /// No thumbnail. The first failure retries once at the given time (a clip
    /// still being written can fail); after that it stays missing.
    Missing(Option<Instant>),
}

/// Textures uploaded per frame, so a burst of finished thumbnails doesn't
/// stall one frame.
const UPLOADS_PER_FRAME: usize = 6;
const MISSING_RETRY: Duration = Duration::from_secs(10);

pub enum Thumb<'a> {
    Ready(&'a egui::TextureHandle),
    Missing,
    Loading,
}

pub struct Library {
    pub dir: PathBuf,
    pub clips: Vec<Clip>,
    pub total_bytes: u64,
    pub scanned: bool,
    index: LibraryIndex,
    meta: HashMap<PathBuf, (u64, SystemTime, Option<ProbeInfo>)>,

    query: String,
    filters: Filters,
    sort: Sort,
    pub view: View,
    pub selecting: bool,
    visible: Vec<usize>,
    games: Vec<(String, usize)>,
    event_kinds: Vec<String>,
    dirty: bool,

    selected: HashSet<PathBuf>,
    anchor: Option<PathBuf>,

    thumbs: HashMap<PathBuf, Slot>,
    /// Size each thumbnail was drawn at last frame; a new size is only
    /// requested once it holds for two frames (layout settled, resize ended).
    drawn_size: HashMap<PathBuf, (Option<[usize; 2]>, u64)>,
    /// Clips whose thumbnail already had its one retry.
    retried: HashSet<PathBuf>,
    ctx: egui::Context,
    /// In-flight requests and the pixel size each asked for.
    requested: HashMap<PathBuf, Option<[usize; 2]>>,
    tx: mpsc::Sender<(PathBuf, Option<[usize; 2]>)>,
    rx: mpsc::Receiver<(PathBuf, Option<(usize, usize, Vec<u8>)>)>,
    frame: u64,
    pub today: i32,
}

impl Library {
    pub fn new(dir: PathBuf, ctx: &egui::Context) -> Library {
        let (tx, worker_rx) = mpsc::channel::<(PathBuf, Option<[usize; 2]>)>();
        let (worker_tx, rx) = mpsc::channel();
        let ui_ctx = ctx.clone();
        let ctx = ctx.clone();
        // One background decoder; it exits when the library is dropped.
        std::thread::Builder::new()
            .name("sb-thumbs".into())
            .spawn(move || {
                super::thumbs::init();
                // A stack: the newest request is what's on screen now, so it
                // goes first. A newer request for the same clip replaces the
                // older one (only the latest size matters while resizing).
                let mut stack: Vec<(PathBuf, Option<[usize; 2]>)> = Vec::new();
                loop {
                    if stack.is_empty() {
                        match worker_rx.recv() {
                            Ok(job) => stack.push(job),
                            Err(_) => return,
                        }
                    }
                    for job in worker_rx.try_iter() {
                        stack.retain(|(p, _)| *p != job.0);
                        stack.push(job);
                    }
                    let Some((path, size)) = stack.pop() else { continue };
                    let result = super::thumbs::load_sized(&path, &thumbnails_dir(), size);
                    if worker_tx.send((path, result)).is_err() {
                        return;
                    }
                    ctx.request_repaint();
                }
            })
            .expect("spawn thumbnail worker");
        let mut lib = Library {
            dir,
            clips: Vec::new(),
            total_bytes: 0,
            scanned: false,
            index: LibraryIndex::load(),
            meta: HashMap::new(),
            query: String::new(),
            filters: Filters::default(),
            sort: Sort::Newest,
            view: View::Grid,
            selecting: false,
            visible: Vec::new(),
            games: Vec::new(),
            event_kinds: Vec::new(),
            dirty: true,
            selected: HashSet::new(),
            anchor: None,
            thumbs: HashMap::new(),
            requested: HashMap::new(),
            drawn_size: HashMap::new(),
            retried: HashSet::new(),
            ctx: ui_ctx,
            tx,
            rx,
            frame: 0,
            today: today(),
        };
        lib.refresh();
        lib
    }

    pub fn set_dir(&mut self, dir: PathBuf) {
        if dir != self.dir {
            self.dir = dir;
            self.selected.clear();
            self.refresh();
        }
    }

    /// Re-reads library.json (after the service changed it) and re-applies it.
    pub fn reload_index(&mut self) {
        self.index = LibraryIndex::load();
        for c in &mut self.clips {
            apply_meta(c, &self.index);
        }
        self.dirty = true;
    }

    /// Rescans the folder. Media facts are cached by size and modification
    /// time, so a rescan only opens new or changed files.
    pub fn refresh(&mut self) {
        self.today = today();
        let mut clips = Vec::new();
        let mut meta = HashMap::new();
        if let Ok(entries) = std::fs::read_dir(&self.dir) {
            for e in entries.flatten() {
                let path = e.path();
                if !path.extension().is_some_and(|x| x.eq_ignore_ascii_case("mp4")) {
                    continue;
                }
                let Ok(m) = e.metadata() else { continue };
                let modified = m.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                let info = match self.meta.get(&path) {
                    Some(&(size, time, info)) if size == m.len() && time == modified => info,
                    _ => probe(&path),
                };
                meta.insert(path.clone(), (m.len(), modified, info));
                let file_name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let local = local_time(modified);
                let mut clip = Clip {
                    game: game_of(&path),
                    title: String::new(),
                    source: CaptureSource::Manual,
                    favorite: false,
                    events: Vec::new(),
                    file_name,
                    path,
                    modified,
                    day: days_from_civil(local.year, local.month, local.day),
                    local,
                    bytes: m.len(),
                    info,
                };
                apply_meta(&mut clip, &self.index);
                clips.push(clip);
            }
        }
        clips.sort_by(|a, b| b.modified.cmp(&a.modified));
        self.total_bytes = clips.iter().map(|c| c.bytes).sum();
        let live: HashSet<&PathBuf> = clips.iter().map(|c| &c.path).collect();
        self.thumbs.retain(|p, _| live.contains(p));
        self.requested.retain(|p, _| live.contains(p));
        self.drawn_size.retain(|p, _| live.contains(p));
        self.selected.retain(|p| live.contains(p));
        self.meta = meta;
        self.clips = clips;
        if !self.scanned {
            self.prune_thumbnail_cache();
        }
        self.scanned = true;
        self.dirty = true;
    }

    /// Once per session, deletes cached thumbnails of clips that no longer
    /// exist (or changed), off the window thread.
    fn prune_thumbnail_cache(&self) {
        let paths: Vec<PathBuf> = self.clips.iter().map(|c| c.path.clone()).collect();
        let _ = std::thread::Builder::new().name("sb-thumb-prune".into()).spawn(move || {
            let dir = thumbnails_dir();
            // Older-size files of live clips stay until they're converted.
            let keep: HashSet<PathBuf> = paths
                .iter()
                .flat_map(|p| [super::thumbs::cache_path(&dir, p), super::thumbs::legacy_cache_path(&dir, p)])
                .collect();
            let Ok(entries) = std::fs::read_dir(&dir) else { return };
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().is_some_and(|x| x == "rgba") && !keep.contains(&p) {
                    let _ = std::fs::remove_file(&p);
                }
            }
        });
    }

    pub fn remove(&mut self, paths: &[PathBuf]) {
        let gone: HashSet<&PathBuf> = paths.iter().collect();
        self.clips.retain(|c| !gone.contains(&c.path));
        for p in paths {
            self.thumbs.remove(p);
            self.selected.remove(p);
            self.meta.remove(p);
        }
        self.total_bytes = self.clips.iter().map(|c| c.bytes).sum();
        self.dirty = true;
    }

    pub fn find(&self, file_name: &str) -> Option<&Clip> {
        self.clips.iter().find(|c| c.file_name == file_name)
    }

    // ------------------------------------------------------------ view

    pub fn query(&self) -> &str {
        &self.query
    }
    pub fn set_query(&mut self, q: String) {
        if q != self.query {
            self.query = q;
            self.dirty = true;
        }
    }
    pub fn filters(&self) -> &Filters {
        &self.filters
    }
    pub fn set_filters(&mut self, f: Filters) {
        if f != self.filters {
            self.filters = f;
            self.dirty = true;
        }
    }
    pub fn sort(&self) -> Sort {
        self.sort
    }
    pub fn set_sort(&mut self, s: Sort) {
        if s != self.sort {
            self.sort = s;
            self.dirty = true;
        }
    }
    pub fn is_filtered(&self) -> bool {
        !self.query.is_empty() || self.filters.active_count() > 0
    }

    /// Indices into `clips` after filtering and sorting. Recomputed only when
    /// the folder, index, filter or sort changed.
    pub fn visible(&mut self) -> &[usize] {
        if self.dirty {
            let q = self.query.to_lowercase();
            let f = &self.filters;
            let today = self.today;
            let mut v: Vec<usize> = (0..self.clips.len())
                .filter(|&i| {
                    let c = &self.clips[i];
                    let age = today - c.day;
                    (!f.favorites || c.favorite)
                        && f.game.as_ref().is_none_or(|g| &c.game == g)
                        && match f.source {
                            SourceFilter::All => true,
                            SourceFilter::Manual => c.source == CaptureSource::Manual,
                            SourceFilter::Auto => c.source == CaptureSource::Auto,
                        }
                        && f.event.as_ref().is_none_or(|e| c.events.iter().any(|k| k == e))
                        && match f.date {
                            DateFilter::Any => true,
                            DateFilter::Today => age == 0,
                            DateFilter::Yesterday => age == 1,
                            DateFilter::Week => age < 7,
                            DateFilter::Month => age < 30,
                        }
                        && (q.is_empty()
                            || c.title.to_lowercase().contains(&q)
                            || c.game.to_lowercase().contains(&q)
                            || c.file_name.to_lowercase().contains(&q)
                            || c.events.iter().any(|e| e.contains(&q)))
                })
                .collect();
            let clips = &self.clips;
            let secs = |i: usize| clips[i].seconds().unwrap_or(0.0);
            match self.sort {
                Sort::Newest => {}
                Sort::Oldest => v.reverse(),
                Sort::Largest => v.sort_by_key(|&i| std::cmp::Reverse(clips[i].bytes)),
                Sort::Smallest => v.sort_by_key(|&i| clips[i].bytes),
                Sort::Longest => v.sort_by(|&a, &b| secs(b).total_cmp(&secs(a))),
                Sort::Shortest => v.sort_by(|&a, &b| secs(a).total_cmp(&secs(b))),
            }
            let mut games: HashMap<&str, usize> = HashMap::new();
            let mut kinds: HashSet<&str> = HashSet::new();
            for c in &self.clips {
                *games.entry(c.game.as_str()).or_default() += 1;
                kinds.extend(c.events.iter().map(String::as_str));
            }
            let mut games: Vec<(String, usize)> = games.into_iter().map(|(k, n)| (k.to_string(), n)).collect();
            games.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            let mut kinds: Vec<String> = kinds.into_iter().map(str::to_string).collect();
            kinds.sort();
            self.games = games;
            self.event_kinds = kinds;
            self.visible = v;
            self.dirty = false;
        }
        &self.visible
    }

    pub fn visible_paths(&mut self) -> Vec<PathBuf> {
        self.visible();
        self.visible.iter().map(|&i| self.clips[i].path.clone()).collect()
    }

    pub fn games(&mut self) -> Vec<(String, usize)> {
        self.visible();
        self.games.clone()
    }

    pub fn event_kinds(&mut self) -> Vec<String> {
        self.visible();
        self.event_kinds.clone()
    }

    // ------------------------------------------------------- selection

    pub fn is_selected(&self, p: &Path) -> bool {
        self.selected.contains(p)
    }
    pub fn selection_len(&self) -> usize {
        self.selected.len()
    }
    pub fn select_only(&mut self, p: &Path) {
        self.selected.clear();
        self.selected.insert(p.to_path_buf());
        self.anchor = Some(p.to_path_buf());
    }
    pub fn toggle(&mut self, p: &Path) {
        if !self.selected.remove(p) {
            self.selected.insert(p.to_path_buf());
        }
        self.anchor = Some(p.to_path_buf());
    }
    pub fn select_range(&mut self, p: &Path) {
        let Some(anchor) = self.anchor.clone() else { return self.select_only(p) };
        let order = self.visible_paths();
        let (Some(a), Some(b)) = (order.iter().position(|x| *x == anchor), order.iter().position(|x| x == p)) else {
            return self.select_only(p);
        };
        let (lo, hi) = (a.min(b), a.max(b));
        self.selected.extend(order[lo..=hi].iter().cloned());
    }
    pub fn select_all_visible(&mut self) {
        let paths = self.visible_paths();
        self.selected.extend(paths);
    }
    pub fn clear_selection(&mut self) {
        self.selected.clear();
        self.anchor = None;
    }
    /// Selected paths in library order.
    pub fn selected_paths(&self) -> Vec<PathBuf> {
        self.clips.iter().filter(|c| self.selected.contains(&c.path)).map(|c| c.path.clone()).collect()
    }

    // ------------------------------------------------------ thumbnails

    pub fn begin_frame(&mut self) {
        self.frame += 1;
    }

    pub fn poll(&mut self, ctx: &egui::Context) {
        let mut taken = 0;
        for _ in 0..UPLOADS_PER_FRAME {
            let Ok((path, result)) = self.rx.try_recv() else { break };
            taken += 1;
            self.requested.remove(&path);
            let slot = match result {
                Some((w, h, rgba)) => {
                    let img = egui::ColorImage::from_rgba_unmultiplied([w, h], &rgba);
                    Slot::Ready(ctx.load_texture(path.display().to_string(), img, egui::TextureOptions::LINEAR), self.frame)
                }
                // Retry once, unless this already was the retry.
                None if self.retried.insert(path.clone()) => Slot::Missing(Some(Instant::now() + MISSING_RETRY)),
                None => Slot::Missing(None),
            };
            self.thumbs.insert(path, slot);
        }
        // Budget used up: more may be waiting, take them next frame.
        if taken == UPLOADS_PER_FRAME {
            ctx.request_repaint();
        }
        // Keep memory bounded on large libraries: drop the least recently
        // drawn textures; they reload from the disk cache when scrolled back.
        let ready = self.thumbs.values().filter(|s| matches!(s, Slot::Ready(..))).count();
        if ready > MAX_TEXTURES {
            let mut ages: Vec<(u64, PathBuf)> = self
                .thumbs
                .iter()
                .filter_map(|(p, s)| match s {
                    Slot::Ready(_, used) if *used + 2 < self.frame => Some((*used, p.clone())),
                    _ => None,
                })
                .collect();
            ages.sort();
            for (_, p) in ages.into_iter().take(ready - MAX_TEXTURES) {
                self.thumbs.remove(&p);
            }
        }
    }

    /// The thumbnail at any size, for small or non-screen uses.
    pub fn thumb(&mut self, path: &Path) -> Thumb<'_> {
        self.thumb_sized(path, None)
    }

    /// The thumbnail, asking for a texture of exactly `size` pixels. Until
    /// that arrives the current texture (any size) is returned.
    pub fn thumb_sized(&mut self, path: &Path, size: Option<[usize; 2]>) -> Thumb<'_> {
        let frame = self.frame;
        let current = match self.thumbs.get(path) {
            Some(Slot::Ready(tex, _)) => Some(tex.size()),
            Some(Slot::Missing(Some(at))) if Instant::now() >= *at => {
                self.thumbs.remove(path);
                None
            }
            Some(Slot::Missing(_)) => return Thumb::Missing,
            None => None,
        };
        let wanted = size.filter(|s| s[0] > 0 && s[1] > 0);
        let stale = match (current, wanted) {
            (None, _) => true,
            (Some(have), Some(want)) => have != want,
            (Some(_), None) => false,
        };
        let settled = match self.drawn_size.insert(path.to_path_buf(), (wanted, frame)) {
            Some((size, at)) => size == wanted && at + 1 >= frame,
            None => false,
        };
        if stale && !settled {
            // Settling needs one more frame; make sure an idle window draws it.
            self.ctx.request_repaint_after(Duration::from_millis(30));
        }
        if stale && settled && self.requested.get(path) != Some(&wanted) {
            self.requested.insert(path.to_path_buf(), wanted);
            let _ = self.tx.send((path.to_path_buf(), wanted));
        }
        if current.is_none() {
            return Thumb::Loading;
        }
        match self.thumbs.get_mut(path) {
            Some(Slot::Ready(tex, used)) => {
                *used = frame;
                Thumb::Ready(tex)
            }
            Some(Slot::Missing(_)) => Thumb::Missing,
            None => Thumb::Loading,
        }
    }

    pub fn day_heading(&self, day: i32) -> String {
        day_heading(day, self.today)
    }
}

fn apply_meta(c: &mut Clip, index: &LibraryIndex) {
    let meta = index.get(&c.file_name);
    if let Some(g) = meta.and_then(|m| m.game.as_ref()).filter(|g| !g.is_empty()) {
        c.game = pretty_game(g);
    }
    c.favorite = meta.is_some_and(|m| m.favorite);
    c.source = meta.map(|m| m.source).unwrap_or_default();
    c.events = meta.map(|m| m.events.iter().map(|e| e.kind.clone()).collect()).unwrap_or_default();
    c.title = meta.and_then(|m| m.title.clone()).unwrap_or_else(|| default_title(&c.game, c.local));
}

/// "SB FiveM · Oct 5, 9:30 PM", as the old app names clips.
pub fn default_title(game: &str, t: LocalTime) -> String {
    let (h, ampm) = match t.hour {
        0 => (12, "AM"),
        1..=11 => (t.hour, "AM"),
        12 => (12, "PM"),
        _ => (t.hour - 12, "PM"),
    };
    format!("SB {game} \u{b7} {} {}, {h}:{:02} {ampm}", MONTHS[(t.month.clamp(1, 12) - 1) as usize], t.day, t.minute)
}

/// Game name from "SB_<Game>_<date>_<time>.mp4"; display captures read as Desktop.
pub fn game_of(path: &Path) -> String {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let raw = stem
        .strip_prefix("SB_")
        .and_then(|rest| {
            let parts: Vec<&str> = rest.split('_').collect();
            (parts.len() >= 3).then(|| parts[..parts.len() - 2].join(" "))
        })
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "Desktop".into());
    pretty_game(&raw)
}

fn pretty_game(raw: &str) -> String {
    let lower = raw.to_ascii_lowercase();
    if ["display", "desktop", "screen", "probe"].iter().any(|k| lower.starts_with(k)) {
        "Desktop".into()
    } else {
        raw.replace('_', " ")
    }
}

/// "19 hr ago" style age, uppercase in the card meta line.
pub fn age_label(modified: SystemTime) -> String {
    let secs = SystemTime::now().duration_since(modified).map(|d| d.as_secs()).unwrap_or(0);
    match secs {
        0..=59 => "just now".into(),
        60..=3599 => format!("{} min ago", secs / 60),
        3600..=86_399 => format!("{} hr ago", secs / 3600),
        86_400..=172_799 => "1 day ago".into(),
        _ if secs < 30 * 86_400 => format!("{} days ago", secs / 86_400),
        _ if secs < 365 * 86_400 => format!("{} mo ago", secs / (30 * 86_400)),
        _ => format!("{} yr ago", secs / (365 * 86_400)),
    }
}

// ---------------------------------------------------------------- time

fn days_from_civil(y: i32, m: u32, d: u32) -> i32 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy as i32;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i32) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (yoe + era * 400 + i32::from(m <= 2), m, d)
}

fn today() -> i32 {
    let t = unsafe { windows::Win32::System::SystemInformation::GetLocalTime() };
    days_from_civil(t.wYear as i32, t.wMonth as u32, t.wDay as u32)
}

fn local_time(t: SystemTime) -> LocalTime {
    use windows::Win32::Foundation::{FILETIME, SYSTEMTIME};
    use windows::Win32::System::Time::{FileTimeToSystemTime, SystemTimeToTzSpecificLocalTime};
    let Ok(d) = t.duration_since(SystemTime::UNIX_EPOCH) else { return LocalTime::default() };
    let ticks = d.as_nanos() as u64 / 100 + 116_444_736_000_000_000;
    let ft = FILETIME { dwLowDateTime: ticks as u32, dwHighDateTime: (ticks >> 32) as u32 };
    let mut utc = SYSTEMTIME::default();
    let mut local = SYSTEMTIME::default();
    unsafe {
        if FileTimeToSystemTime(&ft, &mut utc).is_err() || SystemTimeToTzSpecificLocalTime(None, &utc, &mut local).is_err()
        {
            return LocalTime::default();
        }
    }
    LocalTime {
        year: local.wYear as i32,
        month: local.wMonth as u32,
        day: local.wDay as u32,
        hour: local.wHour as u32,
        minute: local.wMinute as u32,
    }
}

const MONTHS: [&str; 12] = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG: [&str; 12] =
    ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS: [&str; 7] = ["Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday"];

/// "Today · October 6", "Yesterday · October 5", "Sunday · October 4", "September 1, 2025".
pub fn day_heading(day: i32, today: i32) -> String {
    let (y, m, d) = civil_from_days(day);
    let (ty, _, _) = civil_from_days(today);
    let date = if y == ty { format!("{} {d}", MONTHS_LONG[m as usize - 1]) } else { format!("{} {d}, {y}", MONTHS_LONG[m as usize - 1]) };
    match today - day {
        0 => format!("Today \u{b7} {date}"),
        1 => format!("Yesterday \u{b7} {date}"),
        2..=6 => format!("{} \u{b7} {date}", WEEKDAYS[day.rem_euclid(7) as usize]),
        _ => date,
    }
}

/// Short date for list rows: "Today, 9:30 PM", "Oct 5, 9:30 PM".
pub fn short_when(c: &Clip, today: i32) -> String {
    let t = c.local;
    let (h, ampm) = match t.hour {
        0 => (12, "AM"),
        1..=11 => (t.hour, "AM"),
        12 => (12, "PM"),
        _ => (t.hour - 12, "PM"),
    };
    let day = match today - c.day {
        0 => "Today".to_string(),
        1 => "Yesterday".to_string(),
        _ => format!("{} {}", MONTHS[(t.month.clamp(1, 12) - 1) as usize], t.day),
    };
    format!("{day}, {h}:{:02} {ampm}", t.minute)
}

pub fn bytes_label(b: u64) -> String {
    let b = b as f64;
    if b >= 1e9 {
        format!("{:.1} GB", b / 1e9)
    } else if b >= 1e6 {
        format!("{:.0} MB", b / 1e6)
    } else {
        format!("{:.0} KB", b / 1e3)
    }
}

pub fn duration_label(s: f64) -> String {
    let s = s.round() as u64;
    if s >= 3600 { format!("{}:{:02}:{:02}", s / 3600, s / 60 % 60, s % 60) } else { format!("{}:{:02}", s / 60, s % 60) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_days_round_trip() {
        for day in [-1000, 0, 19_000, 20_367] {
            let (y, m, d) = civil_from_days(day);
            assert_eq!(days_from_civil(y, m, d), day);
        }
    }

    #[test]
    fn day_headings_match_the_old_app() {
        let today = days_from_civil(2026, 10, 6);
        assert_eq!(day_heading(today, today), "Today \u{b7} October 6");
        assert_eq!(day_heading(today - 1, today), "Yesterday \u{b7} October 5");
        assert_eq!(day_heading(today - 2, today), "Sunday \u{b7} October 4");
        assert_eq!(day_heading(days_from_civil(2026, 9, 1), today), "September 1");
        assert_eq!(day_heading(days_from_civil(2025, 12, 31), today), "December 31, 2025");
    }

    #[test]
    fn default_titles_use_twelve_hour_time() {
        let t = LocalTime { year: 2026, month: 10, day: 5, hour: 21, minute: 30 };
        assert_eq!(default_title("FiveM", t), "SB FiveM \u{b7} Oct 5, 9:30 PM");
        let t = LocalTime { hour: 0, minute: 5, ..t };
        assert_eq!(default_title("FiveM", t), "SB FiveM \u{b7} Oct 5, 12:05 AM");
    }

    #[test]
    fn games_come_from_file_names() {
        assert_eq!(game_of(Path::new("SB_FiveM_2026-10-05_21-30-05.mp4")), "FiveM");
        assert_eq!(game_of(Path::new("SB_GTA5_Enhanced_2026-10-06_15-45-09.mp4")), "GTA5 Enhanced");
        assert_eq!(game_of(Path::new("SB_Display1_2026-10-06_15-45-09.mp4")), "Desktop");
        assert_eq!(game_of(Path::new("random.mp4")), "Desktop");
    }
}
