//! Bounded fingerprint cache (port of `event-deduplicator.ts`).

use crate::events::GameEvent;
use std::collections::VecDeque;

pub const DEFAULT_DEDUPE_WINDOW_MS: u64 = 500;
pub const MAX_DEDUPE_FINGERPRINTS: usize = 512;

/// Treats an event as a duplicate when the same fingerprint (provider, game,
/// type, typed metadata) was seen within `window_ms`. Entries are kept in
/// insertion order; at most `max_entries` survive, and anything older than
/// `max(4 * window, 2 s)` is pruned from the front.
#[derive(Debug)]
pub struct EventDeduplicator {
    window_ms: u64,
    max_entries: usize,
    seen: VecDeque<(String, u64)>,
}

impl Default for EventDeduplicator {
    fn default() -> Self {
        Self::new(DEFAULT_DEDUPE_WINDOW_MS, MAX_DEDUPE_FINGERPRINTS)
    }
}

impl EventDeduplicator {
    pub fn new(window_ms: u64, max_entries: usize) -> Self {
        Self {
            window_ms,
            max_entries,
            seen: VecDeque::new(),
        }
    }

    pub fn is_duplicate(&mut self, event: &GameEvent) -> bool {
        self.prune(event.timestamp_ms);
        let fingerprint = event.fingerprint();
        let previous = self
            .seen
            .iter()
            .position(|(f, _)| *f == fingerprint)
            .and_then(|i| self.seen.remove(i))
            .map(|(_, at)| at);
        self.seen.push_back((fingerprint, event.timestamp_ms));
        previous.is_some_and(|at| event.timestamp_ms.abs_diff(at) <= self.window_ms)
    }

    pub fn len(&self) -> usize {
        self.seen.len()
    }

    pub fn is_empty(&self) -> bool {
        self.seen.is_empty()
    }

    pub fn clear(&mut self) {
        self.seen.clear();
    }

    fn prune(&mut self, now: u64) {
        let cutoff = now.saturating_sub((self.window_ms * 4).max(2_000));
        // `>=` mirrors the old loop: the new entry is pushed after pruning, so
        // the cache holds at most `max_entries` once it returns.
        while let Some((_, at)) = self.seen.front() {
            if *at >= cutoff && self.seen.len() < self.max_entries {
                break;
            }
            self.seen.pop_front();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::events::GameEventType;
    use crate::planner::tests::event;

    #[test]
    fn duplicates_within_window_only() {
        let mut d = EventDeduplicator::default();
        let mut a = event("a", GameEventType::Kill, 10_000);
        a.metadata.sequence = Some(1);
        assert!(!d.is_duplicate(&a));
        let mut b = a.clone();
        b.timestamp_ms = 10_400;
        assert!(d.is_duplicate(&b));
        let mut c = a.clone();
        c.timestamp_ms = 11_000; // 600 ms after the refreshed 10_400 entry
        assert!(!d.is_duplicate(&c));
        // Different sequence = distinct counter delta, never collapsed.
        let mut e = a.clone();
        e.timestamp_ms = 11_000;
        e.metadata.sequence = Some(2);
        assert!(!d.is_duplicate(&e));
    }

    #[test]
    fn bounded_entries_and_expiry() {
        let mut d = EventDeduplicator::default();
        for i in 0..2_000u64 {
            let mut e = event("x", GameEventType::Kill, 50_000);
            e.metadata.sequence = Some(i);
            d.is_duplicate(&e);
            assert!(d.len() <= MAX_DEDUPE_FINGERPRINTS);
        }
        assert_eq!(d.len(), MAX_DEDUPE_FINGERPRINTS);
        // A much later event expires everything older than the 2 s horizon.
        let late = event("y", GameEventType::Kill, 60_000);
        assert!(!d.is_duplicate(&late));
        assert_eq!(d.len(), 1);
    }
}
