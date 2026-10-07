//! Microphone reaction detector (port of Capture.Host `ReactionDetector.cs`).
//!
//! An acoustic-arousal heuristic, not speech understanding: a sustained,
//! voice-shaped burst that is loud in absolute terms and well above the
//! user's learned speaking level. The capture engine feeds per-frame features
//! (10 ms frames recommended) from the microphone it already captures; no PCM
//! is retained here.
//!
//! Policy (REACTION_CLIPPING.md): calibration needs 5 s of input including 3 s
//! of voice; candidates must clear an absolute floor and a rise above the
//! speech baseline, sustain for the sensitivity's duration with gaps of at
//! most 100 ms, be outside the cooldown, and follow 3 s of settled input after
//! the previous reaction. Packet gaps over 250 ms clear evidence.

use crate::settings::{ReactionSettings, Sensitivity};
use serde::Serialize;

const SILENCE_DB: f64 = -96.0;
const INITIAL_NOISE_FLOOR_DB: f64 = -60.0;
const INITIAL_SPEECH_BASELINE_DB: f64 = -30.0;
const CALIBRATION_MS: f64 = 5_000.0;
const SPEECH_CALIBRATION_MS: f64 = 3_000.0;
const REARM_MS: f64 = 3_000.0;
const MAX_EVIDENCE_GAP_MS: f64 = 100.0;
const PACKET_GAP_RESET_MS: u64 = 250;
const MIN_RMS: f64 = 0.000_015_848_9; // -96 dBFS

/// Features of one analysis frame.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReactionFrame {
    /// RMS level in dBFS (-96..0).
    pub level_dbfs: f32,
    /// Sign changes per sample (0..1). Voice is roughly 0.003..0.35.
    pub zero_crossing_rate: f32,
    /// Peak-to-RMS ratio in dB. Voice is roughly 2..20.
    pub crest_db: f32,
    /// Frame length in milliseconds (clamped to 1..250).
    pub duration_ms: f32,
    /// The capture API flagged the packet as silent.
    pub silent: bool,
}

impl ReactionFrame {
    /// Level-only frame for callers that track RMS but not waveform shape.
    /// Shape checks then pass for any frame above the voice floor, so the
    /// detector cannot reject loud non-voice noise (music, fans) as well as
    /// with [`ReactionFrame::from_samples`].
    pub fn from_level(level_dbfs: f32, duration_ms: f32) -> Self {
        Self {
            level_dbfs,
            zero_crossing_rate: 0.05,
            crest_db: 10.0,
            duration_ms,
            silent: false,
        }
    }

    /// Compute features from interleaved float samples, using the first
    /// channel as the C# detector does. One linear pass, no allocation.
    pub fn from_samples(interleaved: &[f32], channels: usize, sample_rate: u32) -> Self {
        let channels = channels.max(1);
        let frames = interleaved.len() / channels;
        let duration_ms = if sample_rate == 0 {
            10.0
        } else {
            frames as f32 * 1_000.0 / sample_rate as f32
        };
        if frames < 16 {
            return Self {
                level_dbfs: SILENCE_DB as f32,
                zero_crossing_rate: 0.0,
                crest_db: 0.0,
                duration_ms,
                silent: true,
            };
        }
        let mut sum_squares = 0f64;
        let mut peak = 0f64;
        let mut crossings = 0u32;
        let mut previous = 0f64;
        for frame in 0..frames {
            let sample = f64::from(interleaved[frame * channels].clamp(-1.0, 1.0));
            sum_squares += sample * sample;
            peak = peak.max(sample.abs());
            if frame > 0 && (sample >= 0.0) != (previous >= 0.0) {
                crossings += 1;
            }
            previous = sample;
        }
        let rms = (sum_squares / frames as f64).sqrt();
        Self {
            level_dbfs: (20.0 * rms.max(MIN_RMS).log10()).clamp(SILENCE_DB, 0.0) as f32,
            zero_crossing_rate: (f64::from(crossings) / (frames - 1).max(1) as f64) as f32,
            crest_db: (20.0 * (peak / rms.max(MIN_RMS)).max(1.0).log10()) as f32,
            duration_ms,
            silent: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ReactionDetection {
    /// Unix ms of the frame that completed the sustained burst.
    pub timestamp_ms: u64,
    /// 0.58..0.98
    pub confidence: f32,
    pub level_db: f32,
    pub baseline_db: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ReactionState {
    Disabled,
    Calibrating,
    Cooldown,
    Listening,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReactionSnapshot {
    pub state: ReactionState,
    pub input_level_db: f32,
    pub noise_floor_db: f32,
    pub trigger_threshold_db: f32,
    pub reactions_detected: u32,
    pub analyzed_frames: u64,
    pub cooldown_remaining_seconds: u32,
    pub last_reaction_at_ms: Option<u64>,
    pub message: Option<&'static str>,
}

#[derive(Debug, Clone, Copy)]
struct Profile {
    absolute_threshold_db: f64,
    relative_threshold_db: f64,
    minimum_sustain_ms: f64,
}

impl Profile {
    fn for_sensitivity(sensitivity: Sensitivity) -> Self {
        let (a, r, m) = match sensitivity {
            Sensitivity::Low => (-10.0, 14.0, 900.0),
            Sensitivity::Balanced => (-14.0, 12.0, 650.0),
            Sensitivity::High => (-20.0, 9.0, 450.0),
        };
        Self {
            absolute_threshold_db: a,
            relative_threshold_db: r,
            minimum_sustain_ms: m,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ReactionDetector {
    enabled: bool,
    sensitivity: Sensitivity,
    cooldown_seconds: u32,
    last_frame_at: u64,
    calibration_ms: f64,
    speech_calibration_ms: f64,
    last_reaction_at: u64,
    input_level_db: f64,
    noise_floor_db: f64,
    speech_baseline_db: f64,
    trigger_threshold_db: f64,
    excited_ms: f64,
    evidence_gap_ms: f64,
    settled_ms: f64,
    armed: bool,
    has_speech_baseline: bool,
    reactions_detected: u32,
    analyzed_frames: u64,
}

impl ReactionDetector {
    pub fn new(settings: &ReactionSettings) -> Self {
        let mut detector = Self {
            enabled: false,
            sensitivity: settings.sensitivity,
            cooldown_seconds: settings.cooldown_seconds.clamp(5, 120),
            last_frame_at: 0,
            calibration_ms: 0.0,
            speech_calibration_ms: 0.0,
            last_reaction_at: 0,
            input_level_db: SILENCE_DB,
            noise_floor_db: INITIAL_NOISE_FLOOR_DB,
            speech_baseline_db: INITIAL_SPEECH_BASELINE_DB,
            trigger_threshold_db: -18.0,
            excited_ms: 0.0,
            evidence_gap_ms: 0.0,
            settled_ms: 0.0,
            armed: true,
            has_speech_baseline: false,
            reactions_detected: 0,
            analyzed_frames: 0,
        };
        detector.configure(settings);
        detector
    }

    /// Apply settings. Disabling resets learned state (`Pause`).
    pub fn configure(&mut self, settings: &ReactionSettings) {
        self.enabled = settings.enabled;
        self.sensitivity = settings.sensitivity;
        self.cooldown_seconds = settings.cooldown_seconds.clamp(5, 120);
        if !self.enabled {
            self.pause();
        }
        self.update_threshold();
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    /// Level-only convenience: `levels_dbfs` are consecutive 10 ms frames
    /// ending at `now_ms` (Unix ms).
    pub fn push(&mut self, levels_dbfs: &[f32], now_ms: u64) -> Option<ReactionDetection> {
        let mut found = None;
        let count = levels_dbfs.len() as u64;
        for (i, level) in levels_dbfs.iter().enumerate() {
            let at = now_ms.saturating_sub((count - 1 - i as u64) * 10);
            if let Some(d) = self.observe(&ReactionFrame::from_level(*level, 10.0), at) {
                found = Some(d);
            }
        }
        found
    }

    /// Consecutive frames whose last one ends at `now_ms`.
    pub fn push_frames(
        &mut self,
        frames: &[ReactionFrame],
        now_ms: u64,
    ) -> Option<ReactionDetection> {
        let mut offset: f64 = frames
            .iter()
            .map(|f| f64::from(f.duration_ms.clamp(1.0, 250.0)))
            .sum();
        let mut found = None;
        for frame in frames {
            offset -= f64::from(frame.duration_ms.clamp(1.0, 250.0));
            let at = now_ms.saturating_sub(offset.round() as u64);
            if let Some(d) = self.observe(frame, at) {
                found = Some(d);
            }
        }
        found
    }

    /// Analyze one frame observed at `timestamp_ms`.
    pub fn observe(
        &mut self,
        frame: &ReactionFrame,
        timestamp_ms: u64,
    ) -> Option<ReactionDetection> {
        if !self.enabled {
            return None;
        }
        self.analyzed_frames += 1;
        let level_db = if frame.silent {
            SILENCE_DB
        } else {
            f64::from(frame.level_dbfs).clamp(SILENCE_DB, 0.0)
        };
        let zcr = f64::from(frame.zero_crossing_rate);
        let crest = f64::from(frame.crest_db);
        let frame_ms = f64::from(frame.duration_ms).clamp(1.0, 250.0);

        if self.last_frame_at > 0
            && timestamp_ms.saturating_sub(self.last_frame_at) > PACKET_GAP_RESET_MS
        {
            // Missing packets are neither sustained voice nor settled audio.
            self.excited_ms = 0.0;
            self.evidence_gap_ms = 0.0;
            self.settled_ms = 0.0;
        }
        self.last_frame_at = timestamp_ms;
        self.input_level_db = level_db;

        let calibrating = self.is_calibrating();
        let voice_floor = (self.noise_floor_db + 8.0).max(-50.0);
        let voice_shaped = !frame.silent
            && level_db >= voice_floor
            && (0.003..=0.35).contains(&zcr)
            && (2.0..=20.0).contains(&crest);

        self.update_noise_floor(level_db, voice_shaped, frame_ms, calibrating);
        if voice_shaped && !self.has_speech_baseline {
            self.speech_baseline_db = level_db;
            self.has_speech_baseline = true;
        }
        if calibrating {
            self.calibration_ms = (self.calibration_ms + frame_ms).min(CALIBRATION_MS);
            if voice_shaped {
                self.speech_calibration_ms =
                    (self.speech_calibration_ms + frame_ms).min(SPEECH_CALIBRATION_MS);
                let tc = if level_db > self.speech_baseline_db {
                    300.0
                } else {
                    10_000.0
                };
                self.update_speech_baseline(level_db, frame_ms, tc);
            }
            self.excited_ms = 0.0;
            self.update_threshold();
            return None;
        }

        let profile = Profile::for_sensitivity(self.sensitivity);
        let baseline = self.speech_baseline_db;
        let relative_gain = level_db - baseline;
        let candidate = voice_shaped
            && level_db >= profile.absolute_threshold_db
            && relative_gain >= profile.relative_threshold_db;

        if !self.armed {
            let settled = !voice_shaped
                || level_db
                    < (profile.absolute_threshold_db - 3.0)
                        .max(baseline + profile.relative_threshold_db / 2.0);
            self.settled_ms = if settled {
                self.settled_ms + frame_ms
            } else {
                0.0
            };
            if self.settled_ms >= REARM_MS {
                self.armed = true;
                self.settled_ms = 0.0;
            }
        }

        let in_cooldown = self.last_reaction_at > 0
            && timestamp_ms.saturating_sub(self.last_reaction_at)
                < u64::from(self.cooldown_seconds) * 1_000;
        if in_cooldown || !self.armed {
            self.excited_ms = 0.0;
            self.evidence_gap_ms = 0.0;
        } else if candidate {
            self.excited_ms = (self.excited_ms + frame_ms).min(1_000.0);
            self.evidence_gap_ms = 0.0;
        } else {
            self.evidence_gap_ms += frame_ms;
            if self.evidence_gap_ms > MAX_EVIDENCE_GAP_MS {
                self.excited_ms = 0.0;
            }
        }

        // Hold the baseline only while scoring a new burst; keep learning
        // during cooldown and long loud exchanges. Slow downward release.
        if voice_shaped && (in_cooldown || !self.armed || !candidate) {
            let tc = if level_db > baseline {
                2_000.0
            } else {
                60_000.0
            };
            self.update_speech_baseline(level_db, frame_ms, tc);
        }

        let mut detection = None;
        if !in_cooldown && self.armed && self.excited_ms >= profile.minimum_sustain_ms {
            let evidence = (level_db - profile.absolute_threshold_db)
                .min(relative_gain - profile.relative_threshold_db);
            let confidence = (0.58 + evidence.max(0.0) / 22.0).clamp(0.58, 0.98);
            detection = Some(ReactionDetection {
                timestamp_ms,
                confidence: confidence as f32,
                level_db: level_db as f32,
                baseline_db: baseline as f32,
            });
            self.last_reaction_at = timestamp_ms;
            self.reactions_detected += 1;
            self.excited_ms = 0.0;
            self.armed = false;
            self.settled_ms = 0.0;
        }
        self.update_threshold();
        detection
    }

    /// Forget learned levels and evidence (source change, input lost).
    pub fn pause(&mut self) {
        self.last_frame_at = 0;
        self.calibration_ms = 0.0;
        self.speech_calibration_ms = 0.0;
        self.last_reaction_at = 0;
        self.excited_ms = 0.0;
        self.evidence_gap_ms = 0.0;
        self.settled_ms = 0.0;
        self.armed = true;
        self.has_speech_baseline = false;
        self.input_level_db = SILENCE_DB;
        self.noise_floor_db = INITIAL_NOISE_FLOOR_DB;
        self.speech_baseline_db = INITIAL_SPEECH_BASELINE_DB;
        self.update_threshold();
    }

    pub fn is_calibrating(&self) -> bool {
        self.calibration_ms < CALIBRATION_MS || self.speech_calibration_ms < SPEECH_CALIBRATION_MS
    }

    pub fn snapshot(&self, now_ms: u64) -> ReactionSnapshot {
        let cooldown_remaining = if !self.enabled || self.last_reaction_at == 0 {
            0
        } else {
            let remaining = (i128::from(self.cooldown_seconds) * 1_000 - i128::from(now_ms)
                + i128::from(self.last_reaction_at))
            .max(0);
            ((remaining + 999) / 1_000) as u32
        };
        let state = if !self.enabled {
            ReactionState::Disabled
        } else if self.is_calibrating() {
            ReactionState::Calibrating
        } else if cooldown_remaining > 0 {
            ReactionState::Cooldown
        } else {
            ReactionState::Listening
        };
        ReactionSnapshot {
            state,
            input_level_db: round1(self.input_level_db),
            noise_floor_db: round1(self.noise_floor_db),
            trigger_threshold_db: round1(self.trigger_threshold_db),
            reactions_detected: self.reactions_detected,
            analyzed_frames: self.analyzed_frames,
            cooldown_remaining_seconds: cooldown_remaining,
            last_reaction_at_ms: (self.last_reaction_at > 0).then_some(self.last_reaction_at),
            message: (state == ReactionState::Calibrating).then_some(
                "Learning your normal speaking level. Speak normally for a few seconds.",
            ),
        }
    }

    fn update_noise_floor(
        &mut self,
        level_db: f64,
        voice_shaped: bool,
        frame_ms: f64,
        calibrating: bool,
    ) {
        if voice_shaped {
            return;
        }
        let current = self.noise_floor_db;
        if level_db > current + 10.0 && !calibrating {
            return;
        }
        let tc = if calibrating {
            1_500.0
        } else if level_db < current {
            3_000.0
        } else {
            8_000.0
        };
        let alpha = 1.0 - (-frame_ms / tc).exp();
        self.noise_floor_db = (current + (level_db - current) * alpha).clamp(SILENCE_DB, -20.0);
    }

    fn update_speech_baseline(&mut self, level_db: f64, frame_ms: f64, tc: f64) {
        let current = self.speech_baseline_db;
        let alpha = 1.0 - (-frame_ms / tc).exp();
        self.speech_baseline_db = (current + (level_db - current) * alpha).clamp(-50.0, -8.0);
    }

    fn update_threshold(&mut self) {
        let p = Profile::for_sensitivity(self.sensitivity);
        self.trigger_threshold_db = p
            .absolute_threshold_db
            .max(self.speech_baseline_db + p.relative_threshold_db)
            .clamp(SILENCE_DB, 0.0);
    }
}

fn round1(v: f64) -> f32 {
    ((v * 10.0).round() / 10.0) as f32
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: u64 = 1_800_000_000_000;

    fn settings(sensitivity: Sensitivity, cooldown: u32) -> ReactionSettings {
        ReactionSettings {
            enabled: true,
            sensitivity,
            cooldown_seconds: cooldown,
            ..Default::default()
        }
    }

    /// Feeds `ms` of 10 ms frames at `level`; returns detections and the new clock.
    fn feed(
        d: &mut ReactionDetector,
        clock: &mut u64,
        level: f32,
        ms: u64,
    ) -> Vec<ReactionDetection> {
        let mut out = Vec::new();
        for _ in 0..ms / 10 {
            *clock += 10;
            if let Some(x) = d.observe(&ReactionFrame::from_level(level, 10.0), *clock) {
                out.push(x);
            }
        }
        out
    }

    fn calibrated(sensitivity: Sensitivity, speech_db: f32) -> (ReactionDetector, u64) {
        let mut d = ReactionDetector::new(&settings(sensitivity, 60));
        let mut clock = T0;
        assert!(feed(&mut d, &mut clock, speech_db, 6_000).is_empty());
        assert!(!d.is_calibrating());
        (d, clock)
    }

    #[test]
    fn silence_cannot_arm() {
        let mut d = ReactionDetector::new(&settings(Sensitivity::High, 60));
        let mut clock = T0;
        feed(&mut d, &mut clock, -96.0, 10_000);
        assert!(d.is_calibrating());
        assert_eq!(d.snapshot(clock).state, ReactionState::Calibrating);
        // A shout during calibration is learned, not detected.
        assert!(feed(&mut d, &mut clock, -5.0, 2_000).is_empty());
    }

    #[test]
    fn sustain_thresholds_per_sensitivity() {
        // (sensitivity, sustained ms that must NOT trigger, ms that must)
        for (s, short, long) in [
            (Sensitivity::Low, 850, 950),
            (Sensitivity::Balanced, 600, 700),
            (Sensitivity::High, 400, 500),
        ] {
            let (mut d, mut clock) = calibrated(s, -30.0);
            assert!(
                feed(&mut d, &mut clock, -6.0, short).is_empty(),
                "{s:?} fired early"
            );
            // Break evidence with > 100 ms of quiet speech.
            feed(&mut d, &mut clock, -30.0, 200);
            let hits = feed(&mut d, &mut clock, -6.0, long);
            assert_eq!(hits.len(), 1, "{s:?} did not fire");
            assert!((0.58..=0.98).contains(&hits[0].confidence));
        }
    }

    #[test]
    fn absolute_floor_and_relative_rise_both_required() {
        // Balanced: floor -14 dBFS, rise 12 dB over a -30 dB baseline.
        let (mut d, mut clock) = calibrated(Sensitivity::Balanced, -30.0);
        // -16 dBFS rises 14 dB but is under the -14 floor.
        assert!(feed(&mut d, &mut clock, -16.0, 2_000).is_empty());

        // Loud speaker: baseline -12; -8 clears the floor but rises only 4 dB.
        let (mut d, mut clock) = calibrated(Sensitivity::Balanced, -12.0);
        assert!(feed(&mut d, &mut clock, -8.0, 2_000).is_empty());
    }

    #[test]
    fn short_gaps_tolerated_long_gaps_reset() {
        let (mut d, mut clock) = calibrated(Sensitivity::Balanced, -30.0);
        // 400 ms loud, 80 ms gap, 300 ms loud = 700 ms evidence: fires.
        assert!(feed(&mut d, &mut clock, -6.0, 400).is_empty());
        feed(&mut d, &mut clock, -60.0, 80);
        assert_eq!(feed(&mut d, &mut clock, -6.0, 300).len(), 1);

        let (mut d, mut clock) = calibrated(Sensitivity::Balanced, -30.0);
        assert!(feed(&mut d, &mut clock, -6.0, 400).is_empty());
        // A 300 ms packet outage clears evidence.
        clock += 300;
        assert!(feed(&mut d, &mut clock, -6.0, 400).is_empty());
    }

    #[test]
    fn cooldown_and_rearm() {
        let mut d = ReactionDetector::new(&settings(Sensitivity::Balanced, 5));
        let mut clock = T0;
        feed(&mut d, &mut clock, -30.0, 6_000);
        assert_eq!(feed(&mut d, &mut clock, -6.0, 700).len(), 1);
        assert_eq!(d.snapshot(clock).state, ReactionState::Cooldown);
        assert_eq!(d.snapshot(clock).cooldown_remaining_seconds, 5);
        // A second shout inside the cooldown is ignored.
        feed(&mut d, &mut clock, -30.0, 1_000);
        assert!(feed(&mut d, &mut clock, -6.0, 1_000).is_empty());
        // Normal speech past the cooldown settles and re-arms the detector.
        feed(&mut d, &mut clock, -30.0, 6_000);
        assert_eq!(d.snapshot(clock).state, ReactionState::Listening);
        assert_eq!(feed(&mut d, &mut clock, -6.0, 700).len(), 1);
        assert_eq!(d.snapshot(clock).reactions_detected, 2);
    }

    #[test]
    fn continuous_shouting_never_rearms() {
        let mut d = ReactionDetector::new(&settings(Sensitivity::Balanced, 5));
        let mut clock = T0;
        feed(&mut d, &mut clock, -30.0, 6_000);
        assert_eq!(feed(&mut d, &mut clock, -6.0, 700).len(), 1);
        assert!(feed(&mut d, &mut clock, -6.0, 15_000).is_empty());
    }

    #[test]
    fn loud_conversation_becomes_normal() {
        let mut d = ReactionDetector::new(&settings(Sensitivity::High, 5));
        let mut clock = T0;
        feed(&mut d, &mut clock, -35.0, 6_000);
        assert_eq!(feed(&mut d, &mut clock, -10.0, 500).len(), 1);
        // A long loud exchange: baseline learns upward during the cooldown.
        feed(&mut d, &mut clock, -12.0, 20_000);
        feed(&mut d, &mut clock, -60.0, 3_100);
        // Same loudness again is no longer a big enough rise.
        assert!(feed(&mut d, &mut clock, -10.0, 1_000).is_empty());
    }

    #[test]
    fn disable_resets_and_push_api() {
        let (mut d, clock) = calibrated(Sensitivity::High, -30.0);
        d.configure(&ReactionSettings {
            enabled: false,
            ..Default::default()
        });
        assert_eq!(d.snapshot(clock).state, ReactionState::Disabled);
        assert!(d.push(&[-5.0; 200], clock + 2_000).is_none());
        d.configure(&settings(Sensitivity::High, 60));
        assert!(d.is_calibrating());
        // Batch API: 6 s of speech then 0.5 s shout in one call each.
        let mut now = clock + 10_000;
        assert!(d.push(&[-30.0; 600], now).is_none());
        now += 500;
        let hit = d
            .push(&[-6.0; 50], now)
            .expect("high sensitivity fires at 450 ms");
        assert!(hit.timestamp_ms <= now && hit.timestamp_ms >= now - 60);
    }

    #[test]
    fn sample_features() {
        let rate = 48_000;
        let tone: Vec<f32> = (0..480)
            .map(|i| 0.5 * (i as f32 * 2.0 * std::f32::consts::PI * 200.0 / rate as f32).sin())
            .collect();
        let f = ReactionFrame::from_samples(&tone, 1, rate);
        assert!((f.level_dbfs - -9.03).abs() < 0.2, "{}", f.level_dbfs);
        assert!((f.duration_ms - 10.0).abs() < 0.01);
        assert!((0.003..=0.35).contains(&f.zero_crossing_rate));
        assert!((2.0..=4.0).contains(&f.crest_db)); // sine crest = 3 dB
        let silent = ReactionFrame::from_samples(&[0.0; 480], 1, rate);
        assert_eq!(silent.level_dbfs, -96.0);
        let stereo: Vec<f32> = tone.iter().flat_map(|s| [*s, 0.0]).collect();
        let fs = ReactionFrame::from_samples(&stereo, 2, rate);
        assert!((fs.level_dbfs - f.level_dbfs).abs() < 0.01);
    }

    #[test]
    fn non_voice_shape_rejected() {
        let (mut d, mut clock) = calibrated(Sensitivity::High, -30.0);
        // Loud but zero-crossing far too high (white-noise like hiss).
        let hiss = ReactionFrame {
            level_dbfs: -5.0,
            zero_crossing_rate: 0.6,
            crest_db: 10.0,
            duration_ms: 10.0,
            silent: false,
        };
        for _ in 0..200 {
            clock += 10;
            assert!(d.observe(&hiss, clock).is_none());
        }
    }
}
