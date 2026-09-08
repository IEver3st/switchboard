import { F as require_react, L as __toESM, N as require_jsx_runtime, O as cn, i as resolveClipTrackLevel, k as createLucideIcon, r as defaultClipTrackLevelForChannel, t as switchboardApi } from "./demo-api-BNokT5Mf.js";
import { d as TooltipTrigger, l as Tooltip, u as TooltipContent } from "./dist-vcsWvHOO.js";
import { a as DropdownMenuTrigger, i as DropdownMenuSeparator, n as DropdownMenuContent, r as DropdownMenuItem, t as DropdownMenu } from "./dropdown-menu-DuqWlit2.js";
import { a as PanelRightClose, i as PanelRightOpen, n as Undo2, o as Minimize, r as Scissors, s as Maximize, t as ShareClipDialog } from "./ShareClipDialog-Bktnjb4E.js";
import { v as Pencil } from "./dist-DBc7zWH9.js";
import { i as Save, r as VolumeX, t as channelColor } from "./channel-identity-BcgKfE8d.js";
import { t as Trash2 } from "./trash-2-Cm7s5klc.js";
import { At as ArrowLeft, Ct as Film, H as RadioGroup, J as Button, M as Slider, R as ScrollArea, St as FolderOpen, U as RadioGroupItem, V as Separator, gt as Pause, ht as Play, i as formatDuration, j as singularEventLabel, n as formatBytes, ot as Volume2, s as formatVideoQuality } from "./index-Br7Ix8br.js";
import { n as clipGameLabel } from "./ClipThumbnail-B3vrEScO.js";
import { a as ContextMenuTrigger, i as ContextMenuSeparator, n as ContextMenuContent, r as ContextMenuItem, t as ContextMenu } from "./context-menu-BQbbQDtr.js";
import { _ as Star, y as Clapperboard } from "./capture-BuauTlX_.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var EllipsisVertical = createLucideIcon("ellipsis-vertical", [
	["circle", {
		cx: "12",
		cy: "12",
		r: "1",
		key: "41hilf"
	}],
	["circle", {
		cx: "12",
		cy: "5",
		r: "1",
		key: "gxeob9"
	}],
	["circle", {
		cx: "12",
		cy: "19",
		r: "1",
		key: "lyex9k"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var FastForward = createLucideIcon("fast-forward", [["path", {
	d: "M12 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 12 18z",
	key: "b19h5q"
}], ["path", {
	d: "M2 6a2 2 0 0 1 3.414-1.414l6 6a2 2 0 0 1 0 2.828l-6 6A2 2 0 0 1 2 18z",
	key: "h7h5ge"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var GripVertical = createLucideIcon("grip-vertical", [
	["circle", {
		cx: "9",
		cy: "12",
		r: "1",
		key: "1vctgf"
	}],
	["circle", {
		cx: "9",
		cy: "5",
		r: "1",
		key: "hp0tcf"
	}],
	["circle", {
		cx: "9",
		cy: "19",
		r: "1",
		key: "fkjjf6"
	}],
	["circle", {
		cx: "15",
		cy: "12",
		r: "1",
		key: "1tmaij"
	}],
	["circle", {
		cx: "15",
		cy: "5",
		r: "1",
		key: "19l28e"
	}],
	["circle", {
		cx: "15",
		cy: "19",
		r: "1",
		key: "f4zoj3"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Rewind = createLucideIcon("rewind", [["path", {
	d: "M12 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 12 18z",
	key: "2a1g8i"
}], ["path", {
	d: "M22 6a2 2 0 0 0-3.414-1.414l-6 6a2 2 0 0 0 0 2.828l6 6A2 2 0 0 0 22 18z",
	key: "rg3s36"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var SkipBack = createLucideIcon("skip-back", [["path", {
	d: "M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z",
	key: "15892j"
}], ["path", {
	d: "M3 20V4",
	key: "1ptbpl"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var SkipForward = createLucideIcon("skip-forward", [["path", {
	d: "M21 4v16",
	key: "7j8fe9"
}], ["path", {
	d: "M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",
	key: "zs4d6"
}]]);
//#endregion
//#region src/renderer/src/components/capture/clip-timeline-model.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
function timeFromTimelinePoint(clientX, left, width, durationMs) {
	if (width <= 0 || durationMs <= 0) return 0;
	const ratio = Math.min(1, Math.max(0, (clientX - left) / width));
	return Math.round(ratio * durationMs);
}
function applyTimelineInteraction(interaction, requestedMs, values) {
	const durationMs = Math.max(0, Math.round(values.durationMs));
	const currentMs = clampMs(values.currentMs, 0, durationMs);
	const startMs = clampMs(values.startMs, 0, Math.max(0, durationMs - 100));
	const endMs = clampMs(values.endMs, Math.min(durationMs, startMs + 100), durationMs);
	const nextMs = clampMs(requestedMs, 0, durationMs);
	if (interaction === "scrubbing") return {
		currentMs: nextMs,
		startMs,
		endMs,
		durationMs
	};
	if (interaction === "dragging-trim-start") return {
		currentMs,
		startMs: Math.min(nextMs, endMs - 100),
		endMs,
		durationMs
	};
	return {
		currentMs,
		startMs,
		endMs: Math.max(nextMs, startMs + 100),
		durationMs
	};
}
function applyTrimKeyboard(interaction, key, values, stepMs) {
	const activeMs = interaction === "dragging-trim-start" ? values.startMs : values.endMs;
	let requestedMs;
	switch (key) {
		case "ArrowLeft":
		case "ArrowDown":
			requestedMs = activeMs - stepMs;
			break;
		case "ArrowRight":
		case "ArrowUp":
			requestedMs = activeMs + stepMs;
			break;
		case "PageDown":
			requestedMs = activeMs - stepMs * 10;
			break;
		case "PageUp":
			requestedMs = activeMs + stepMs * 10;
			break;
		case "Home":
			requestedMs = interaction === "dragging-trim-start" ? 0 : values.startMs + 100;
			break;
		case "End":
			requestedMs = interaction === "dragging-trim-start" ? values.endMs - 100 : values.durationMs;
			break;
		default: return null;
	}
	return applyTimelineInteraction(interaction, requestedMs, values);
}
function applyPlayheadKeyboard(key, values, stepMs) {
	let requestedMs;
	switch (key) {
		case "ArrowLeft":
		case "ArrowDown":
			requestedMs = values.currentMs - stepMs;
			break;
		case "ArrowRight":
		case "ArrowUp":
			requestedMs = values.currentMs + stepMs;
			break;
		case "PageDown":
			requestedMs = values.currentMs - stepMs * 10;
			break;
		case "PageUp":
			requestedMs = values.currentMs + stepMs * 10;
			break;
		case "Home":
			requestedMs = 0;
			break;
		case "End":
			requestedMs = values.durationMs;
			break;
		default: return null;
	}
	return applyTimelineInteraction("scrubbing", requestedMs, values);
}
function chooseTimelineTickInterval(durationMs, width) {
	const candidates = [
		100,
		200,
		500,
		1e3,
		2e3,
		5e3,
		1e4,
		15e3,
		3e4,
		6e4,
		12e4,
		3e5,
		6e5
	];
	const targetTickCount = Math.max(2, Math.floor(width / 74));
	const minimumInterval = Math.max(1, durationMs / targetTickCount);
	return candidates.find((candidate) => candidate >= minimumInterval) ?? candidates.at(-1);
}
function clampMs(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
//#endregion
//#region src/renderer/src/components/capture/clip-preview-audio.ts
function clipPreviewTrackVolume(trackLevel, masterVolume, muted, currentMs, trim) {
	if (muted || trackLevel <= 0) return 0;
	if (trim && (currentMs < trim.startMs || currentMs >= trim.endMs)) return 0;
	const level = Math.min(100, Math.max(0, trackLevel)) / 100;
	return Math.min(1, Math.max(0, masterVolume)) * level;
}
function clipPreviewNeedsSync(previewSeconds, videoSeconds) {
	return !Number.isFinite(previewSeconds) || Math.abs(previewSeconds - videoSeconds) > .08;
}
//#endregion
//#region src/renderer/src/components/capture/ClipTimeline.tsx
var import_jsx_runtime = require_jsx_runtime();
function ClipTimeline({ clipId, videoRef, durationMs, fps, audioChannels, audioTrackLevels, audioTrackTrims, defaultTrackLevels, eventMarkers, startMs, endMs, dirty, savePending, onChange, onAudioTrackTrimChange, onResetTrims, onAudioTrackLevelChange, onSave }) {
	const timelineRef = (0, import_react.useRef)(null);
	const playheadRef = (0, import_react.useRef)(null);
	const timecodeCurrentRef = (0, import_react.useRef)(null);
	const scrubTargetRef = (0, import_react.useRef)(null);
	const timelineWidthRef = (0, import_react.useRef)(720);
	const timelineRectRef = (0, import_react.useRef)(null);
	const currentMsRef = (0, import_react.useRef)(startMs);
	const interactionRef = (0, import_react.useRef)("idle");
	const activeTrimTrackRef = (0, import_react.useRef)(null);
	const pendingSeekMsRef = (0, import_react.useRef)(null);
	const seekFrameRef = (0, import_react.useRef)(null);
	const resumeAfterScrubRef = (0, import_react.useRef)(false);
	const playbackModeRef = (0, import_react.useRef)("selection");
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [muted, setMuted] = (0, import_react.useState)(false);
	const [volume, setVolume] = (0, import_react.useState)(1);
	const [interaction, setInteractionState] = (0, import_react.useState)("idle");
	const [rulerIntervalMs, setRulerIntervalMs] = (0, import_react.useState)(() => chooseTimelineTickInterval(durationMs, 720));
	const [waveformState, setWaveformState] = (0, import_react.useState)("loading");
	const [waveformTracks, setWaveformTracks] = (0, import_react.useState)([]);
	const [previewTrackLevels, setPreviewTrackLevels] = (0, import_react.useState)(() => [...audioTrackLevels ?? []]);
	const [readyPreviewTrackIndexes, setReadyPreviewTrackIndexes] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const previewAudioRefs = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const previewTrackLevelsRef = (0, import_react.useRef)(previewTrackLevels);
	const audioTrackTrimsRef = (0, import_react.useRef)(audioTrackTrims);
	const defaultTrackLevelsRef = (0, import_react.useRef)(defaultTrackLevels);
	const mutedRef = (0, import_react.useRef)(muted);
	const volumeRef = (0, import_react.useRef)(volume);
	const frameMs = Math.max(1, 1e3 / Math.max(1, fps));
	const isolatedPreviewReady = waveformState === "ready" && waveformTracks.length > 0 && waveformTracks.every((track) => readyPreviewTrackIndexes.has(track.trackIndex));
	previewTrackLevelsRef.current = previewTrackLevels;
	audioTrackTrimsRef.current = audioTrackTrims;
	defaultTrackLevelsRef.current = defaultTrackLevels;
	mutedRef.current = muted;
	volumeRef.current = volume;
	const positionPlayhead = (0, import_react.useCallback)((nextMs) => {
		const playhead = playheadRef.current;
		if (!playhead) return;
		const offset = durationMs > 0 ? Math.min(durationMs, Math.max(0, nextMs)) / durationMs * timelineWidthRef.current : 0;
		playhead.style.transform = `translate3d(${offset}px, 0, 0)`;
	}, [durationMs]);
	const updatePlayheadReadout = (0, import_react.useCallback)((nextMs) => {
		const boundedMs = Math.min(durationMs, Math.max(0, nextMs));
		const formatted = formatTimelineTime$1(boundedMs);
		if (timecodeCurrentRef.current) timecodeCurrentRef.current.textContent = formatted;
		if (scrubTargetRef.current) {
			scrubTargetRef.current.setAttribute("aria-valuenow", String(Math.round(boundedMs)));
			scrubTargetRef.current.setAttribute("aria-valuetext", formatted);
		}
	}, [durationMs]);
	const seekVideo = (0, import_react.useCallback)((nextMs, immediate) => {
		pendingSeekMsRef.current = nextMs;
		const video = videoRef.current;
		if (!video) return;
		const commitSeek = () => {
			seekFrameRef.current = null;
			const targetMs = pendingSeekMsRef.current;
			if (targetMs !== null) video.currentTime = targetMs / 1e3;
		};
		if (immediate) {
			if (seekFrameRef.current !== null) window.cancelAnimationFrame(seekFrameRef.current);
			commitSeek();
		} else if (seekFrameRef.current === null) seekFrameRef.current = window.requestAnimationFrame(commitSeek);
	}, [videoRef]);
	(0, import_react.useEffect)(() => {
		let active = true;
		setWaveformState("loading");
		setWaveformTracks([]);
		setReadyPreviewTrackIndexes(/* @__PURE__ */ new Set());
		switchboardApi.loadClipAudioWaveform(clipId).then((waveform) => {
			if (!active) return;
			setWaveformTracks(waveform.tracks);
			setWaveformState("ready");
		}).catch(() => {
			if (!active) return;
			setWaveformState("error");
		});
		return () => {
			active = false;
		};
	}, [clipId]);
	(0, import_react.useEffect)(() => {
		setPreviewTrackLevels([...audioTrackLevels ?? []]);
	}, [audioTrackLevels]);
	(0, import_react.useEffect)(() => {
		const currentMs = (videoRef.current?.currentTime ?? 0) * 1e3;
		for (const track of waveformTracks) {
			const preview = previewAudioRefs.current.get(track.trackIndex);
			if (!preview) continue;
			preview.volume = clipPreviewTrackVolume(resolveClipTrackLevel(previewTrackLevels, track.trackIndex, track.channel, defaultTrackLevels), volume, muted, currentMs, audioTrackTrims?.[track.trackIndex]);
		}
	}, [
		audioTrackTrims,
		defaultTrackLevels,
		muted,
		previewTrackLevels,
		videoRef,
		volume,
		waveformTracks
	]);
	(0, import_react.useEffect)(() => {
		const video = videoRef.current;
		if (!video || !isolatedPreviewReady) return;
		const previews = waveformTracks.flatMap((track) => {
			const preview = previewAudioRefs.current.get(track.trackIndex);
			return preview ? [{
				preview,
				trackIndex: track.trackIndex,
				channel: track.channel
			}] : [];
		});
		if (previews.length !== waveformTracks.length) return;
		let playbackFrame = null;
		const updatePreviews = (forcePosition) => {
			const videoSeconds = video.currentTime;
			const currentMs = videoSeconds * 1e3;
			for (const { preview, trackIndex, channel } of previews) {
				preview.volume = clipPreviewTrackVolume(resolveClipTrackLevel(previewTrackLevelsRef.current, trackIndex, channel, defaultTrackLevelsRef.current), volumeRef.current, mutedRef.current, currentMs, audioTrackTrimsRef.current?.[trackIndex]);
				preview.playbackRate = video.playbackRate;
				if (preview.readyState >= HTMLMediaElement.HAVE_METADATA && (forcePosition || clipPreviewNeedsSync(preview.currentTime, videoSeconds))) preview.currentTime = videoSeconds;
			}
		};
		const stopPlaybackFrames = () => {
			if (playbackFrame === null) return;
			window.cancelAnimationFrame(playbackFrame);
			playbackFrame = null;
		};
		const syncPlaybackFrame = () => {
			playbackFrame = null;
			if (video.paused || video.ended) return;
			updatePreviews(false);
			playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
		};
		const startPreviewPlayback = () => {
			video.muted = true;
			updatePreviews(true);
			for (const { preview } of previews) preview.play().catch(() => void 0);
			if (playbackFrame === null) playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
		};
		const pausePreviewPlayback = () => {
			stopPlaybackFrames();
			updatePreviews(true);
			for (const { preview } of previews) preview.pause();
		};
		const synchronizePosition = () => updatePreviews(true);
		video.muted = true;
		if (video.paused || video.ended) pausePreviewPlayback();
		else startPreviewPlayback();
		video.addEventListener("play", startPreviewPlayback);
		video.addEventListener("pause", pausePreviewPlayback);
		video.addEventListener("ended", pausePreviewPlayback);
		video.addEventListener("seeking", synchronizePosition);
		video.addEventListener("seeked", synchronizePosition);
		video.addEventListener("ratechange", synchronizePosition);
		return () => {
			video.removeEventListener("play", startPreviewPlayback);
			video.removeEventListener("pause", pausePreviewPlayback);
			video.removeEventListener("ended", pausePreviewPlayback);
			video.removeEventListener("seeking", synchronizePosition);
			video.removeEventListener("seeked", synchronizePosition);
			video.removeEventListener("ratechange", synchronizePosition);
			stopPlaybackFrames();
			for (const { preview } of previews) preview.pause();
			video.muted = mutedRef.current;
		};
	}, [
		isolatedPreviewReady,
		videoRef,
		waveformTracks
	]);
	const setPlayhead = (0, import_react.useCallback)((nextMs, immediateSeek = true) => {
		const boundedMs = Math.min(durationMs, Math.max(0, Math.round(nextMs)));
		currentMsRef.current = boundedMs;
		positionPlayhead(boundedMs);
		updatePlayheadReadout(boundedMs);
		seekVideo(boundedMs, immediateSeek);
	}, [
		durationMs,
		positionPlayhead,
		seekVideo,
		updatePlayheadReadout
	]);
	const setInteraction = (next) => {
		interactionRef.current = next;
		setInteractionState(next);
	};
	const values = (0, import_react.useCallback)(() => ({
		currentMs: currentMsRef.current,
		startMs,
		endMs,
		durationMs
	}), [
		durationMs,
		endMs,
		startMs
	]);
	const timeAtPointer = (clientX, refreshBounds = false) => {
		if (refreshBounds || !timelineRectRef.current) {
			const measured = timelineRef.current?.getBoundingClientRect();
			timelineRectRef.current = measured ? {
				left: measured.left,
				width: measured.width
			} : null;
		}
		const rect = timelineRectRef.current;
		return rect ? timeFromTimelinePoint(clientX, rect.left, rect.width, durationMs) : currentMsRef.current;
	};
	const scrubToPointer = (clientX, refreshBounds = false, immediateSeek = false) => {
		const next = applyTimelineInteraction("scrubbing", timeAtPointer(clientX, refreshBounds), values());
		setPlayhead(next.currentMs, immediateSeek);
	};
	const trimValues = (track) => {
		if (track === "clip") return values();
		const trackTrim = audioTrackTrims?.[track];
		return {
			currentMs: currentMsRef.current,
			startMs: trackTrim?.startMs ?? 0,
			endMs: trackTrim?.endMs ?? durationMs,
			durationMs
		};
	};
	const trimToPointer = (kind, track, clientX) => {
		const next = applyTimelineInteraction(kind, timeAtPointer(clientX), trimValues(track));
		if (track === "clip") onChange(next.startMs, next.endMs);
		else onAudioTrackTrimChange(track, next.startMs, next.endMs);
	};
	const beginScrubbing = (event) => {
		if (event.button > 0 || event.isPrimary === false) return;
		event.preventDefault();
		const video = videoRef.current;
		resumeAfterScrubRef.current = Boolean(video && !video.paused);
		if (video && !video.paused) video.pause();
		playbackModeRef.current = "free";
		setInteraction("scrubbing");
		capturePointer$1(event.currentTarget, event.pointerId);
		scrubToPointer(event.clientX, true);
	};
	const continueScrubbing = (event) => {
		if (interactionRef.current !== "scrubbing") return;
		scrubToPointer(event.clientX);
	};
	const finishScrubbing = (event) => {
		if (interactionRef.current !== "scrubbing") return;
		scrubToPointer(event.clientX, false, true);
		releasePointer$1(event.currentTarget, event.pointerId);
		timelineRectRef.current = null;
		setInteraction("idle");
		if (resumeAfterScrubRef.current) videoRef.current?.play().catch(() => void 0);
		resumeAfterScrubRef.current = false;
	};
	const beginTrim = (event, kind, track) => {
		if (event.button > 0 || event.isPrimary === false) return;
		event.preventDefault();
		event.stopPropagation();
		timeAtPointer(event.clientX, true);
		activeTrimTrackRef.current = track;
		setInteraction(kind);
		capturePointer$1(event.currentTarget, event.pointerId);
	};
	const continueTrim = (event, kind, track) => {
		if (interactionRef.current !== kind || activeTrimTrackRef.current !== track) return;
		trimToPointer(kind, track, event.clientX);
	};
	const finishTrim = (event, kind, track) => {
		if (interactionRef.current !== kind || activeTrimTrackRef.current !== track) return;
		trimToPointer(kind, track, event.clientX);
		releasePointer$1(event.currentTarget, event.pointerId);
		activeTrimTrackRef.current = null;
		timelineRectRef.current = null;
		setInteraction("idle");
	};
	const cancelPointerInteraction = () => {
		resumeAfterScrubRef.current = false;
		activeTrimTrackRef.current = null;
		timelineRectRef.current = null;
		setInteraction("idle");
	};
	const updateTrimFromKeyboard = (event, kind, track) => {
		const next = applyTrimKeyboard(kind, event.key, trimValues(track), 100);
		if (!next) return;
		event.preventDefault();
		event.stopPropagation();
		if (track === "clip") onChange(next.startMs, next.endMs);
		else onAudioTrackTrimChange(track, next.startMs, next.endMs);
	};
	const updatePlayheadFromKeyboard = (event) => {
		const next = applyPlayheadKeyboard(event.key, values(), frameMs);
		if (!next) return;
		event.preventDefault();
		event.stopPropagation();
		playbackModeRef.current = "free";
		setPlayhead(next.currentMs);
	};
	const seekBy = (deltaMs) => {
		playbackModeRef.current = "free";
		setPlayhead(currentMsRef.current + deltaMs);
	};
	const togglePlayback = () => {
		const video = videoRef.current;
		if (!video) return;
		if (!video.paused) {
			video.pause();
			return;
		}
		playbackModeRef.current = "selection";
		const activeMs = currentMsRef.current;
		if (activeMs < startMs || activeMs >= endMs) setPlayhead(startMs);
		video.play().catch(() => void 0);
	};
	const toggleMute = () => {
		const video = videoRef.current;
		if (!video) return;
		if (video.volume === 0) video.volume = .5;
		const nextMuted = !muted;
		setMuted(nextMuted);
		if (!isolatedPreviewReady) video.muted = nextMuted;
	};
	const updateVolume = (nextValue) => {
		const video = videoRef.current;
		const nextVolume = Math.min(1, Math.max(0, nextValue));
		if (!video) return;
		setVolume(nextVolume);
		video.volume = nextVolume;
		setMuted(nextVolume === 0);
		if (!isolatedPreviewReady) video.muted = nextVolume === 0;
	};
	(0, import_react.useLayoutEffect)(() => {
		const timeline = timelineRef.current;
		if (!timeline) return;
		const updateWidth = (width) => {
			timelineWidthRef.current = width;
			setRulerIntervalMs((current) => {
				const next = chooseTimelineTickInterval(durationMs, width);
				return next === current ? current : next;
			});
			positionPlayhead(currentMsRef.current);
		};
		updateWidth(timeline.getBoundingClientRect().width);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) updateWidth(entry.contentRect.width);
		});
		observer.observe(timeline);
		return () => observer.disconnect();
	}, [durationMs, positionPlayhead]);
	(0, import_react.useEffect)(() => () => {
		if (seekFrameRef.current !== null) window.cancelAnimationFrame(seekFrameRef.current);
	}, []);
	(0, import_react.useEffect)(() => {
		const clearStalePointerState = () => {
			if (interactionRef.current === "idle") return;
			interactionRef.current = "idle";
			activeTrimTrackRef.current = null;
			resumeAfterScrubRef.current = false;
			setInteractionState("idle");
		};
		window.addEventListener("pointerup", clearStalePointerState);
		window.addEventListener("pointercancel", clearStalePointerState);
		window.addEventListener("blur", clearStalePointerState);
		return () => {
			window.removeEventListener("pointerup", clearStalePointerState);
			window.removeEventListener("pointercancel", clearStalePointerState);
			window.removeEventListener("blur", clearStalePointerState);
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const video = videoRef.current;
		if (!video) return;
		let playbackFrame = null;
		let positionedMs = -1;
		let lastReadoutAt = -Infinity;
		const positionPlaybackFrame = (nextMs, forceReadout = false) => {
			if (Math.abs(nextMs - positionedMs) < .1) return;
			positionedMs = nextMs;
			currentMsRef.current = nextMs;
			positionPlayhead(nextMs);
			const now = performance.now();
			if (forceReadout || now - lastReadoutAt >= 50) {
				lastReadoutAt = now;
				updatePlayheadReadout(nextMs);
			}
		};
		const stopPlaybackFrames = () => {
			if (playbackFrame === null) return;
			window.cancelAnimationFrame(playbackFrame);
			playbackFrame = null;
		};
		const syncPlaybackFrame = () => {
			playbackFrame = null;
			if (video.paused || video.ended) return;
			const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1e3));
			const pendingSeekMs = pendingSeekMsRef.current;
			if (pendingSeekMs !== null && Math.abs(nextMs - pendingSeekMs) > Math.max(80, frameMs * 2)) positionPlaybackFrame(pendingSeekMs);
			else {
				pendingSeekMsRef.current = null;
				if (playbackModeRef.current === "selection" && nextMs >= endMs) {
					video.pause();
					setPlayhead(endMs);
					return;
				}
				positionPlaybackFrame(nextMs);
			}
			playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
		};
		const startPlaybackFrames = () => {
			if (playbackFrame === null) playbackFrame = window.requestAnimationFrame(syncPlaybackFrame);
		};
		const updateTime = () => {
			const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1e3));
			const pendingSeekMs = pendingSeekMsRef.current;
			if (pendingSeekMs !== null && Math.abs(nextMs - pendingSeekMs) > Math.max(80, frameMs * 2)) {
				currentMsRef.current = pendingSeekMs;
				positionPlaybackFrame(pendingSeekMs, true);
				return;
			}
			pendingSeekMsRef.current = null;
			if (!video.paused && playbackModeRef.current === "selection" && nextMs >= endMs) {
				video.pause();
				setPlayhead(endMs);
				return;
			}
			positionPlaybackFrame(nextMs, true);
		};
		const updatePlayback = () => {
			const isPlaying = !video.paused && !video.ended;
			setPlaying(isPlaying);
			if (isPlaying) startPlaybackFrames();
			else {
				stopPlaybackFrames();
				const nextMs = Math.min(durationMs, Math.max(0, video.currentTime * 1e3));
				positionPlaybackFrame(nextMs, true);
			}
		};
		const updateVolumeState = () => {
			if (isolatedPreviewReady) return;
			setMuted(video.muted || video.volume === 0);
			setVolume(video.volume);
		};
		video.addEventListener("timeupdate", updateTime);
		video.addEventListener("seeked", updateTime);
		video.addEventListener("play", updatePlayback);
		video.addEventListener("pause", updatePlayback);
		video.addEventListener("ended", updatePlayback);
		video.addEventListener("volumechange", updateVolumeState);
		updatePlayback();
		updateVolumeState();
		return () => {
			video.removeEventListener("timeupdate", updateTime);
			video.removeEventListener("seeked", updateTime);
			video.removeEventListener("play", updatePlayback);
			video.removeEventListener("pause", updatePlayback);
			video.removeEventListener("ended", updatePlayback);
			video.removeEventListener("volumechange", updateVolumeState);
			stopPlaybackFrames();
		};
	}, [
		durationMs,
		endMs,
		frameMs,
		isolatedPreviewReady,
		positionPlayhead,
		setPlayhead,
		updatePlayheadReadout,
		videoRef
	]);
	(0, import_react.useEffect)(() => {
		const onKeyDown = (event) => {
			if (event.defaultPrevented) return;
			const target = event.target;
			if (target instanceof HTMLElement && target.closest("button, input, textarea, select, [role=\"slider\"]")) return;
			if (event.code === "Space") {
				event.preventDefault();
				togglePlayback();
			} else if (event.key === "ArrowLeft") {
				event.preventDefault();
				seekBy(-5e3);
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				seekBy(5e3);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	});
	const ruler = (0, import_react.useMemo)(() => {
		if (durationMs <= 0) return [];
		const minorInterval = rulerIntervalMs / 4;
		const marks = [];
		for (let ms = 0; ms < durationMs; ms += minorInterval) marks.push({
			ms,
			major: Math.abs(ms % rulerIntervalMs) < .01
		});
		const finalMark = marks.at(-1);
		if (finalMark && durationMs - finalMark.ms < minorInterval / 2) marks[marks.length - 1] = {
			ms: durationMs,
			major: true
		};
		else {
			const previousMajorIndex = marks.findLastIndex((mark) => mark.major);
			const previousMajor = marks[previousMajorIndex];
			if (previousMajor && durationMs - previousMajor.ms < rulerIntervalMs * .55) marks[previousMajorIndex] = {
				...previousMajor,
				major: false
			};
			marks.push({
				ms: durationMs,
				major: true
			});
		}
		return marks;
	}, [durationMs, rulerIntervalMs]);
	if (durationMs < 100) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "clip-editor-timeline clip-editor-timeline--unavailable",
		"aria-labelledby": "trim-heading",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scissors, {
			className: "size-4",
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
			id: "trim-heading",
			children: "Trim unavailable"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Switchboard could not read enough clip duration to set a trim range." })] })]
	});
	const currentMs = currentMsRef.current;
	const fallbackTracks = (audioChannels ?? []).map((channel, trackIndex) => ({
		trackIndex,
		channel,
		label: channelLabel(channel),
		samples: []
	}));
	const displayTracks = waveformState === "ready" ? waveformTracks : waveformTracks.length > 0 ? waveformTracks : fallbackTracks;
	const displayChannelByIndex = (0, import_react.useMemo)(() => {
		const map = /* @__PURE__ */ new Map();
		for (const track of displayTracks) if (track.channel) map.set(track.trackIndex, track.channel);
		(audioChannels ?? []).forEach((channel, trackIndex) => {
			if (!map.has(trackIndex)) map.set(trackIndex, channel);
		});
		return map;
	}, [audioChannels, displayTracks]);
	const resolveDisplayLevel = (0, import_react.useCallback)((levels, trackIndex) => resolveClipTrackLevel(levels, trackIndex, displayChannelByIndex.get(trackIndex), defaultTrackLevels), [defaultTrackLevels, displayChannelByIndex]);
	const timelineStyle = { "--audio-track-count": Math.max(1, displayTracks.length) };
	const hasAudioTrackTrims = audioTrackTrims?.some(Boolean) ?? false;
	const showSubsecondRuler = rulerIntervalMs < 1e3;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "clip-editor-timeline",
		"aria-label": "Clip timeline",
		"data-interaction": interaction,
		"data-playing": playing ? "true" : void 0,
		children: [
			waveformState === "ready" ? waveformTracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
				ref: (preview) => {
					if (preview) previewAudioRefs.current.set(track.trackIndex, preview);
					else previewAudioRefs.current.delete(track.trackIndex);
				},
				src: `switchboard-media://clip-audio/${encodeURIComponent(clipId)}?track=${track.trackIndex}`,
				preload: "auto",
				hidden: true,
				"data-clip-preview-track": track.channel ?? `track-${track.trackIndex}`,
				"data-track-index": track.trackIndex,
				onCanPlay: (event) => {
					event.currentTarget.volume = clipPreviewTrackVolume(resolveClipTrackLevel(previewTrackLevelsRef.current, track.trackIndex, track.channel, defaultTrackLevelsRef.current), volumeRef.current, mutedRef.current, (videoRef.current?.currentTime ?? 0) * 1e3, audioTrackTrimsRef.current?.[track.trackIndex]);
					setReadyPreviewTrackIndexes((current) => current.has(track.trackIndex) ? current : new Set(current).add(track.trackIndex));
				},
				onError: () => setReadyPreviewTrackIndexes((current) => {
					if (!current.has(track.trackIndex)) return current;
					const next = new Set(current);
					next.delete(track.trackIndex);
					return next;
				})
			}, `preview-${track.trackIndex}`)) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "clip-editor-transport-bar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", {
						className: "clip-editor-timeline__timecode",
						"aria-label": "Current playback time",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							ref: timecodeCurrentRef,
							children: formatTimelineTime$1(currentMs)
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							"aria-hidden": "true",
							children: [" / ", formatTimelineTime$1(durationMs)]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-transport",
						role: "group",
						"aria-label": "Playback controls",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: "Previous frame",
								icon: SkipBack,
								onClick: () => seekBy(-frameMs)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: "Back 5 seconds",
								icon: Rewind,
								onClick: () => seekBy(-5e3)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: playing ? "Pause" : "Play selection",
								icon: playing ? Pause : Play,
								primary: true,
								onClick: togglePlayback
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: "Forward 5 seconds",
								icon: FastForward,
								onClick: () => seekBy(5e3)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: "Next frame",
								icon: SkipForward,
								onClick: () => seekBy(frameMs)
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-transport__utilities",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "clip-editor-volume",
								role: "group",
								"aria-label": "Playback volume",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
									label: muted ? "Unmute" : "Mute",
									icon: muted ? VolumeX : Volume2,
									pressed: muted,
									onClick: toggleMute
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
									type: "range",
									className: "clip-editor-volume__slider",
									min: 0,
									max: 100,
									step: 1,
									value: Math.round(volume * 100),
									"aria-label": "Playback volume",
									"aria-valuetext": `${Math.round(volume * 100)} percent`,
									onChange: (event) => updateVolume(Number(event.currentTarget.value) / 100)
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {
								orientation: "vertical",
								className: "h-5"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton$1, {
								label: "Reset timeline edits",
								icon: Undo2,
								disabled: startMs === 0 && endMs === durationMs && !hasAudioTrackTrims,
								onClick: onResetTrims
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								type: "button",
								variant: "secondary",
								size: "sm",
								className: "h-7 px-2.5 text-[10px]",
								disabled: !dirty || savePending,
								onClick: onSave,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, {
										className: "size-3.5",
										"aria-hidden": "true"
									}),
									" ",
									savePending ? "Saving…" : dirty ? "Save edits" : "Saved"
								]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "clip-editor-timeline__desk",
				style: timelineStyle,
				"data-waveform-state": waveformState,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "clip-editor-track-controls",
					"aria-label": "Timeline track controls",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-track-controls__heading",
						title: "Track levels auto-save. Timeline ranges are saved with the clip edits.",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Tracks" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: "Levels auto-save" })]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-track-controls__lanes",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "clip-editor-clip-control",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Film, { "aria-hidden": "true" }), " Clip range"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("output", { children: formatRulerTime(endMs - startMs) })]
						}), displayTracks.length > 0 ? displayTracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioTrackControl, {
							track,
							level: resolveDisplayLevel(audioTrackLevels, track.trackIndex),
							onPreview: (trackIndex, level) => setPreviewTrackLevels((current) => {
								const next = [...current];
								while (next.length <= trackIndex) {
									const fillIndex = next.length;
									next.push(defaultClipTrackLevelForChannel(displayChannelByIndex.get(fillIndex), defaultTrackLevels));
								}
								next[trackIndex] = level;
								return next;
							}),
							onCommit: onAudioTrackLevelChange
						}, track.trackIndex)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "clip-editor-track-controls__empty",
							children: waveformState === "loading" ? "Reading audio tracks…" : waveformState === "error" ? "Audio analysis unavailable" : "No audio streams"
						})]
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					ref: timelineRef,
					className: "clip-editor-timeline__surface",
					"data-testid": "clip-timeline-surface",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "clip-editor-timeline__ruler",
							"aria-hidden": "true",
							children: ruler.map((mark, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: [mark.major ? "is-major" : "", index === ruler.length - 1 ? "is-terminal" : ""].filter(Boolean).join(" ") || void 0,
								style: { left: `${mark.ms / durationMs * 100}%` },
								children: mark.major ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: formatRulerTime(mark.ms, showSubsecondRuler) }) : null
							}, `${mark.ms}-${index}`))
						}),
						eventMarkers && eventMarkers.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "clip-editor-event-markers",
							role: "group",
							"aria-label": `${eventMarkers.length} Auto Capture ${eventMarkers.length === 1 ? "event" : "events"}`,
							children: eventMarkers.map((marker) => {
								const label = marker.label ?? singularEventLabel(marker.type);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
									asChild: true,
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										className: "clip-editor-event-marker",
										"data-event-type": marker.type,
										style: { left: `clamp(14px, ${marker.timestampMs / durationMs * 100}%, calc(100% - 14px))` },
										"aria-label": `${label} at ${formatRulerTime(marker.timestampMs, showSubsecondRuler)}`,
										onPointerDown: (event) => event.stopPropagation(),
										onClick: () => setPlayhead(marker.timestampMs),
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true" })
									})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipContent, {
									side: "top",
									children: [
										label,
										" · ",
										formatRulerTime(marker.timestampMs, showSubsecondRuler)
									]
								})] }, marker.id);
							})
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "clip-editor-timeline__tracks",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "clip-editor-timeline__clip-track",
								role: "group",
								"aria-label": "Clip range",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "clip-editor-timeline__clip-fill",
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelineLaneTrim, {
									startMs,
									endMs,
									durationMs,
									startLabel: "Trim start",
									endLabel: "Trim end",
									startTestId: "clip-trim-start",
									endTestId: "clip-trim-end",
									onKeyDown: (event, kind) => updateTrimFromKeyboard(event, kind, "clip"),
									onPointerDown: (event, kind) => beginTrim(event, kind, "clip"),
									onPointerMove: (event, kind) => continueTrim(event, kind, "clip"),
									onPointerUp: (event, kind) => finishTrim(event, kind, "clip"),
									onPointerCancel: cancelPointerInteraction
								})]
							}), displayTracks.length > 0 ? displayTracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "clip-editor-timeline__audio-track",
								"data-channel": track.channel,
								"data-muted": resolveDisplayLevel(audioTrackLevels, track.trackIndex) === 0 ? "true" : void 0,
								style: { "--track-color": track.channel ? channelColor(track.channel) : "var(--text-description)" },
								role: "group",
								"aria-label": `${track.channel ? channelLabel(track.channel) : track.label} timeline`,
								children: [track.samples.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioWaveform, { samples: track.samples }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "clip-editor-timeline__empty-label",
									children: waveformState === "loading" ? "Analyzing…" : waveformState === "error" ? "Waveform unavailable" : "No audible activity"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelineLaneTrim, {
									startMs: audioTrackTrims?.[track.trackIndex]?.startMs ?? 0,
									endMs: audioTrackTrims?.[track.trackIndex]?.endMs ?? durationMs,
									durationMs,
									startLabel: `${track.channel ? channelLabel(track.channel) : track.label} trim start`,
									endLabel: `${track.channel ? channelLabel(track.channel) : track.label} trim end`,
									startTestId: `clip-track-${track.trackIndex}-trim-start`,
									endTestId: `clip-track-${track.trackIndex}-trim-end`,
									onKeyDown: (event, kind) => updateTrimFromKeyboard(event, kind, track.trackIndex),
									onPointerDown: (event, kind) => beginTrim(event, kind, track.trackIndex),
									onPointerMove: (event, kind) => continueTrim(event, kind, track.trackIndex),
									onPointerUp: (event, kind) => finishTrim(event, kind, track.trackIndex),
									onPointerCancel: cancelPointerInteraction
								})]
							}, track.trackIndex)) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "clip-editor-timeline__audio-track is-empty",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "clip-editor-timeline__empty-label",
									children: waveformState === "loading" ? "Reading track data…" : waveformState === "error" ? "Waveform unavailable" : "This clip has no audio streams"
								})
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: scrubTargetRef,
							role: "slider",
							tabIndex: 0,
							"aria-label": "Playhead",
							"aria-valuemin": 0,
							"aria-valuemax": durationMs,
							"aria-valuenow": Math.round(currentMs),
							"aria-valuetext": formatTimelineTime$1(currentMs),
							"aria-orientation": "horizontal",
							className: "clip-editor-timeline__scrub-target",
							"data-testid": "clip-timeline-scrub-target",
							onKeyDown: updatePlayheadFromKeyboard,
							onPointerDown: beginScrubbing,
							onPointerMove: continueScrubbing,
							onPointerUp: finishScrubbing,
							onPointerCancel: cancelPointerInteraction
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							ref: playheadRef,
							className: "clip-editor-playhead",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "clip-editor-playhead__cap" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "clip-editor-playhead__line" })]
						})
					]
				})]
			})
		]
	});
}
function TimelineLaneTrim({ startMs, endMs, durationMs, startLabel, endLabel, startTestId, endTestId, onKeyDown, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }) {
	const startPercent = startMs / durationMs * 100;
	const endPercent = endMs / durationMs * 100;
	const selectedPercent = Math.max(0, endPercent - startPercent);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "clip-editor-timeline__selection",
			style: {
				left: `${startPercent}%`,
				width: `${selectedPercent}%`
			},
			"aria-hidden": "true"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "clip-editor-timeline__inactive is-before",
			style: { width: `${startPercent}%` },
			"aria-hidden": "true"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "clip-editor-timeline__inactive is-after",
			style: {
				left: `${endPercent}%`,
				width: `${100 - endPercent}%`
			},
			"aria-hidden": "true"
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			role: "slider",
			tabIndex: 0,
			"aria-label": startLabel,
			"aria-valuemin": 0,
			"aria-valuemax": Math.max(0, endMs - 100),
			"aria-valuenow": Math.round(startMs),
			"aria-valuetext": formatTimelineTime$1(startMs),
			"aria-orientation": "horizontal",
			className: "clip-editor-trim-handle is-start",
			style: { left: `${startPercent}%` },
			"data-testid": startTestId,
			onKeyDown: (event) => onKeyDown(event, "dragging-trim-start"),
			onPointerDown: (event) => onPointerDown(event, "dragging-trim-start"),
			onPointerMove: (event) => onPointerMove(event, "dragging-trim-start"),
			onPointerUp: (event) => onPointerUp(event, "dragging-trim-start"),
			onPointerCancel,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
				]
			})
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			role: "slider",
			tabIndex: 0,
			"aria-label": endLabel,
			"aria-valuemin": Math.min(durationMs, startMs + 100),
			"aria-valuemax": durationMs,
			"aria-valuenow": Math.round(endMs),
			"aria-valuetext": formatTimelineTime$1(endMs),
			"aria-orientation": "horizontal",
			className: "clip-editor-trim-handle is-end",
			style: { left: `${endPercent}%` },
			"data-testid": endTestId,
			onKeyDown: (event) => onKeyDown(event, "dragging-trim-end"),
			onPointerDown: (event) => onPointerDown(event, "dragging-trim-end"),
			onPointerMove: (event) => onPointerMove(event, "dragging-trim-end"),
			onPointerUp: (event) => onPointerUp(event, "dragging-trim-end"),
			onPointerCancel,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
				]
			})
		})
	] });
}
var AudioWaveform = (0, import_react.memo)(function AudioWaveform({ samples }) {
	const path = (0, import_react.useMemo)(() => waveformPath(samples), [samples]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
		viewBox: `0 0 ${samples.length} 1`,
		preserveAspectRatio: "none",
		focusable: "false",
		"aria-hidden": "true",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
			d: path,
			vectorEffect: "non-scaling-stroke"
		})
	});
});
function AudioTrackControl({ track, level, onPreview, onCommit }) {
	const [draftLevel, setDraftLevel] = (0, import_react.useState)(level);
	const draftLevelRef = (0, import_react.useRef)(level);
	const committedLevelRef = (0, import_react.useRef)(level);
	const lastAudibleLevelRef = (0, import_react.useRef)(level > 0 ? level : 100);
	const commitTimerRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		setDraftLevel(level);
		draftLevelRef.current = level;
		committedLevelRef.current = level;
		if (level > 0) lastAudibleLevelRef.current = level;
	}, [level]);
	(0, import_react.useEffect)(() => () => {
		if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
	}, []);
	const commit = () => {
		if (commitTimerRef.current !== null) {
			window.clearTimeout(commitTimerRef.current);
			commitTimerRef.current = null;
		}
		const nextLevel = draftLevelRef.current;
		if (nextLevel === committedLevelRef.current) return;
		committedLevelRef.current = nextLevel;
		onCommit(track.trackIndex, nextLevel).catch(() => {
			committedLevelRef.current = level;
			draftLevelRef.current = level;
			setDraftLevel(level);
			onPreview(track.trackIndex, level);
		});
	};
	const updateDraft = (nextLevel) => {
		draftLevelRef.current = nextLevel;
		setDraftLevel(nextLevel);
		onPreview(track.trackIndex, nextLevel);
		if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
		commitTimerRef.current = window.setTimeout(commit, 160);
	};
	const label = track.channel ? channelLabel(track.channel) : track.label;
	const color = track.channel ? channelColor(track.channel) : "var(--text-description)";
	const toggleMute = () => {
		const nextLevel = draftLevelRef.current === 0 ? lastAudibleLevelRef.current : 0;
		if (draftLevelRef.current > 0) lastAudibleLevelRef.current = draftLevelRef.current;
		updateDraft(nextLevel);
		commit();
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "clip-editor-track-control",
		"data-muted": draftLevel === 0 ? "true" : void 0,
		style: {
			"--track-color": color,
			"--control-accent": color
		},
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "clip-editor-track-control__name",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": "true" }), label]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [draftLevel, "%"] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "clip-editor-track-control__mute",
				"aria-label": draftLevel === 0 ? `Unmute ${label} track` : `Mute ${label} track`,
				"aria-pressed": draftLevel === 0,
				onClick: toggleMute,
				children: draftLevel === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { "aria-hidden": "true" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { "aria-hidden": "true" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				variant: "fader",
				min: 0,
				max: 100,
				step: 1,
				value: [draftLevel],
				"aria-label": `${label} level`,
				"aria-valuetext": `${draftLevel} percent in preview and exported mix`,
				onValueChange: ([next]) => {
					if (typeof next === "number") updateDraft(next);
				},
				onValueCommit: ([next]) => {
					if (typeof next === "number") {
						updateDraft(next);
						commit();
					}
				},
				onKeyUp: commit,
				onBlur: commit
			})
		]
	});
}
function channelLabel(channel) {
	if (channel === "microphone") return "Microphone";
	return channel.charAt(0).toUpperCase() + channel.slice(1);
}
function waveformPath(samples) {
	if (samples.length === 0) return "";
	const points = samples.map((sample, index) => ({
		x: index + .5,
		amplitude: Math.min(.11, Math.max(0, sample * .11))
	}));
	const top = points.map(({ x, amplitude }) => `L${x},${.5 - amplitude}`).join("");
	const bottom = points.toReversed().map(({ x, amplitude }) => `L${x},${.5 + amplitude}`).join("");
	return `M0,0.5${top}L${samples.length},0.5${bottom}Z`;
}
function TransportButton$1({ label, icon: Icon, primary = false, pressed, disabled, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: primary ? "primary" : "ghost",
			size: "icon",
			className: primary ? "size-8" : "size-7",
			"aria-label": label,
			"aria-pressed": pressed,
			disabled,
			onClick,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
				className: primary ? "size-4" : "size-3.5",
				"aria-hidden": "true"
			})
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: label })] });
}
function formatTimelineTime$1(milliseconds) {
	const totalMilliseconds = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(totalMilliseconds / 36e5);
	const minutes = Math.floor(totalMilliseconds / 6e4) % 60;
	const seconds = Math.floor(totalMilliseconds / 1e3) % 60;
	const millis = totalMilliseconds % 1e3;
	return `${`${hours > 0 ? `${hours}:` : ""}${hours > 0 ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}`}.${String(millis).padStart(3, "0")}`;
}
function formatRulerTime(milliseconds, showTenths = false) {
	const totalTenths = Math.max(0, Math.round(milliseconds / 100));
	const totalSeconds = Math.floor(totalTenths / 10);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor(totalSeconds / 60) % 60;
	const seconds = totalSeconds % 60;
	const base = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
	return showTenths ? `${base}.${totalTenths % 10}` : base;
}
function capturePointer$1(element, pointerId) {
	try {
		element.setPointerCapture(pointerId);
	} catch {}
}
function releasePointer$1(element, pointerId) {
	try {
		if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
	} catch {}
}
//#endregion
//#region src/renderer/src/components/capture/clip-project-model.ts
function normalizeClipProject(project) {
	return {
		...project,
		durationMs: project.segments.reduce((total, segment) => total + segmentDurationMs(segment), 0)
	};
}
function segmentDurationMs(segment) {
	return Math.max(0, segment.trimEndMs - segment.trimStartMs);
}
function mapMontageTime(segments, requestedMontageTimeMs) {
	if (segments.length === 0) return null;
	const durationMs = segments.reduce((total, segment) => total + segmentDurationMs(segment), 0);
	const montageTimeMs = Math.min(durationMs, Math.max(0, requestedMontageTimeMs));
	let montageStartMs = 0;
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		const montageEndMs = montageStartMs + segmentDurationMs(segment);
		if (montageTimeMs < montageEndMs || index === segments.length - 1) {
			const localOffsetMs = Math.min(segmentDurationMs(segment), Math.max(0, montageTimeMs - montageStartMs));
			return {
				segment,
				segmentIndex: index,
				montageStartMs,
				montageEndMs,
				sourceTimeMs: segment.trimStartMs + localOffsetMs
			};
		}
		montageStartMs = montageEndMs;
	}
	return null;
}
function montageStartForSegment(segments, segmentId) {
	let montageStartMs = 0;
	for (const segment of segments) {
		if (segment.id === segmentId) return montageStartMs;
		montageStartMs += segmentDurationMs(segment);
	}
	return 0;
}
function reorderProjectSegment(project, activeId, overId) {
	const from = project.segments.findIndex((segment) => segment.id === activeId);
	const to = project.segments.findIndex((segment) => segment.id === overId);
	if (from < 0 || to < 0 || from === to) return project;
	const segments = [...project.segments];
	const [moved] = segments.splice(from, 1);
	segments.splice(to, 0, moved);
	return normalizeClipProject({
		...project,
		segments
	});
}
function updateProjectSegment(project, segmentId, update) {
	const segments = project.segments.map((segment) => segment.id === segmentId ? update(segment) : segment);
	return normalizeClipProject({
		...project,
		segments
	});
}
function removeProjectSegment(project, segmentId) {
	return normalizeClipProject({
		...project,
		segments: project.segments.filter((segment) => segment.id !== segmentId)
	});
}
//#endregion
//#region src/renderer/src/components/capture/montage-timeline-model.ts
function applyMontageSegmentTrim(segment, edge, requestedSourceMs) {
	if (edge === "start") {
		const trimStartMs = clamp(requestedSourceMs, 0, segment.trimEndMs - 100);
		return {
			...segment,
			trimStartMs
		};
	}
	const trimEndMs = clamp(requestedSourceMs, segment.trimStartMs + 100, segment.source.durationMs);
	return {
		...segment,
		trimEndMs
	};
}
function trimSourceTimeFromPointerDelta(edge, initialSourceMs, deltaX, timelineWidth, montageDurationMs) {
	if (timelineWidth <= 0 || montageDurationMs <= 0) return initialSourceMs;
	const deltaMs = Math.round(deltaX / timelineWidth * montageDurationMs);
	return edge === "start" ? initialSourceMs + deltaMs : initialSourceMs + deltaMs;
}
function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
//#endregion
//#region src/renderer/src/components/capture/MontageTimeline.tsx
function MontageTimeline({ project, selectedSegmentId, videoRefs, activeVideoSlot, onActiveVideoSlotChange, onPreviewStateChange, onSelectedSegmentChange, onProjectChange }) {
	const timelineRef = (0, import_react.useRef)(null);
	const playheadRef = (0, import_react.useRef)(null);
	const projectRef = (0, import_react.useRef)(project);
	const activeSlotRef = (0, import_react.useRef)(activeVideoSlot);
	const currentMsRef = (0, import_react.useRef)(0);
	const lastRenderedMsRef = (0, import_react.useRef)(0);
	const seekGenerationRef = (0, import_react.useRef)(0);
	const playbackFrameRef = (0, import_react.useRef)(null);
	const transitioningRef = (0, import_react.useRef)(false);
	const resumeAfterScrubRef = (0, import_react.useRef)(false);
	const draggedSegmentIdRef = (0, import_react.useRef)(null);
	const trimDragRef = (0, import_react.useRef)(null);
	const [currentMs, setCurrentMs] = (0, import_react.useState)(0);
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [muted, setMuted] = (0, import_react.useState)(false);
	const [volume, setVolume] = (0, import_react.useState)(1);
	const [interaction, setInteraction] = (0, import_react.useState)("idle");
	projectRef.current = project;
	activeSlotRef.current = activeVideoSlot;
	const stopPlaybackFrame = (0, import_react.useCallback)(() => {
		if (playbackFrameRef.current === null) return;
		window.cancelAnimationFrame(playbackFrameRef.current);
		playbackFrameRef.current = null;
	}, []);
	const preloadNext = (0, import_react.useCallback)(async (segmentIndex, activeSlot, segments = projectRef.current.segments) => {
		const next = segments[segmentIndex + 1];
		if (!next || next.unavailableReason) return;
		const video = videoRefs[activeSlot === 0 ? 1 : 0].current;
		if (!video) return;
		try {
			await prepareVideo(video, next, next.trimStartMs, false);
		} catch {}
	}, [videoRefs]);
	const seekMontage = (0, import_react.useCallback)(async (requestedMs, resumePlayback = false, segments = projectRef.current.segments) => {
		const mapping = mapMontageTime(segments, requestedMs);
		if (!mapping || mapping.segment.unavailableReason) {
			onPreviewStateChange("error");
			setPlaying(false);
			return;
		}
		const generation = ++seekGenerationRef.current;
		const activeVideo = videoRefs[activeSlotRef.current].current;
		const inactiveSlot = activeSlotRef.current === 0 ? 1 : 0;
		const inactiveVideo = videoRefs[inactiveSlot].current;
		const matchingActive = activeVideo?.dataset.clipId === mapping.segment.source.id;
		const matchingInactive = inactiveVideo?.dataset.clipId === mapping.segment.source.id;
		const targetSlot = matchingActive ? activeSlotRef.current : matchingInactive ? inactiveSlot : inactiveSlot;
		const targetVideo = videoRefs[targetSlot].current;
		if (!targetVideo) return;
		onPreviewStateChange("loading");
		videoRefs[0].current?.pause();
		videoRefs[1].current?.pause();
		try {
			await prepareVideo(targetVideo, mapping.segment, mapping.sourceTimeMs, false);
			if (generation !== seekGenerationRef.current) return;
			activeSlotRef.current = targetSlot;
			onActiveVideoSlotChange(targetSlot);
			onSelectedSegmentChange(mapping.segment.id);
			currentMsRef.current = Math.min(projectRef.current.durationMs, Math.max(0, requestedMs));
			lastRenderedMsRef.current = currentMsRef.current;
			setCurrentMs(currentMsRef.current);
			positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, projectRef.current.durationMs);
			targetVideo.muted = muted;
			targetVideo.volume = volume;
			onPreviewStateChange("ready");
			preloadNext(mapping.segmentIndex, targetSlot, segments);
			if (resumePlayback) {
				await targetVideo.play();
				setPlaying(true);
			}
		} catch {
			if (generation === seekGenerationRef.current) {
				onPreviewStateChange("error");
				setPlaying(false);
			}
		}
	}, [
		muted,
		onActiveVideoSlotChange,
		onPreviewStateChange,
		onSelectedSegmentChange,
		preloadNext,
		videoRefs,
		volume
	]);
	const advancePlayback = (0, import_react.useCallback)(async () => {
		if (transitioningRef.current) return;
		const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
		if (!mapping) return;
		if (!projectRef.current.segments[mapping.segmentIndex + 1]) {
			setPlaying(false);
			currentMsRef.current = projectRef.current.durationMs;
			lastRenderedMsRef.current = currentMsRef.current;
			setCurrentMs(currentMsRef.current);
			positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, projectRef.current.durationMs);
			return;
		}
		transitioningRef.current = true;
		try {
			await seekMontage(mapping.montageEndMs, true);
		} finally {
			transitioningRef.current = false;
		}
	}, [seekMontage]);
	const tickPlayback = (0, import_react.useCallback)(() => {
		playbackFrameRef.current = null;
		const segments = projectRef.current.segments;
		const activeVideo = videoRefs[activeSlotRef.current].current;
		const mapping = mapMontageTime(segments, currentMsRef.current);
		if (!activeVideo || !mapping || activeVideo.paused) return;
		const sourceTimeMs = activeVideo.currentTime * 1e3;
		if (sourceTimeMs >= mapping.segment.trimEndMs - Math.max(8, 500 / Math.max(1, mapping.segment.source.fps || 30))) {
			advancePlayback();
			return;
		}
		const nextMs = Math.min(mapping.montageEndMs, mapping.montageStartMs + sourceTimeMs - mapping.segment.trimStartMs);
		currentMsRef.current = nextMs;
		positionPlayhead(playheadRef.current, timelineRef.current, nextMs, projectRef.current.durationMs);
		if (Math.abs(nextMs - lastRenderedMsRef.current) >= 80) {
			lastRenderedMsRef.current = nextMs;
			setCurrentMs(nextMs);
		}
		playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
	}, [advancePlayback, videoRefs]);
	(0, import_react.useEffect)(() => {
		if (!playing) {
			stopPlaybackFrame();
			return;
		}
		if (playbackFrameRef.current === null) playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
		return stopPlaybackFrame;
	}, [
		playing,
		stopPlaybackFrame,
		tickPlayback
	]);
	(0, import_react.useEffect)(() => {
		const videos = videoRefs.map((ref) => ref.current).filter((video) => Boolean(video));
		const continueAtBoundary = (event) => {
			const video = event.currentTarget;
			if (video !== videoRefs[activeSlotRef.current].current) return;
			const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
			if (!mapping) return;
			const thresholdMs = Math.max(8, 500 / Math.max(1, mapping.segment.source.fps || 30));
			if (video.ended || video.currentTime * 1e3 >= mapping.segment.trimEndMs - thresholdMs) advancePlayback();
		};
		for (const video of videos) {
			video.addEventListener("timeupdate", continueAtBoundary);
			video.addEventListener("ended", continueAtBoundary);
		}
		return () => {
			for (const video of videos) {
				video.removeEventListener("timeupdate", continueAtBoundary);
				video.removeEventListener("ended", continueAtBoundary);
			}
		};
	}, [advancePlayback, videoRefs]);
	(0, import_react.useEffect)(() => {
		seekMontage(0, false);
		return () => {
			stopPlaybackFrame();
			for (const ref of videoRefs) {
				const video = ref.current;
				if (!video) continue;
				video.pause();
				video.removeAttribute("src");
				video.load();
			}
		};
	}, []);
	(0, import_react.useEffect)(() => {
		const updateWidth = () => positionPlayhead(playheadRef.current, timelineRef.current, currentMsRef.current, project.durationMs);
		const timeline = timelineRef.current;
		if (!timeline) return;
		const observer = new ResizeObserver(updateWidth);
		observer.observe(timeline);
		updateWidth();
		return () => observer.disconnect();
	}, [project.durationMs]);
	const togglePlayback = async () => {
		const activeVideo = videoRefs[activeSlotRef.current].current;
		if (playing && activeVideo) {
			activeVideo.pause();
			setPlaying(false);
			return;
		}
		if (currentMsRef.current >= project.durationMs) await seekMontage(0, false);
		const video = videoRefs[activeSlotRef.current].current;
		if (!video) return;
		try {
			await video.play();
			setPlaying(true);
		} catch {
			onPreviewStateChange("error");
		}
	};
	const seekFromPointer = (event) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
		seekMontage(Math.round(ratio * projectRef.current.durationMs), false);
	};
	const beginScrub = (event) => {
		if (event.button !== 0) return;
		resumeAfterScrubRef.current = playing;
		videoRefs[activeSlotRef.current].current?.pause();
		setPlaying(false);
		setInteraction("scrubbing");
		capturePointer(event.currentTarget, event.pointerId);
		seekFromPointer(event);
	};
	const finishScrub = (event) => {
		if (interaction !== "scrubbing") return;
		seekFromPointer(event);
		releasePointer(event.currentTarget, event.pointerId);
		setInteraction("idle");
		if (resumeAfterScrubRef.current) togglePlayback();
	};
	const beginTrim = (event, segment, edge) => {
		if (event.button !== 0) return;
		event.stopPropagation();
		videoRefs[activeSlotRef.current].current?.pause();
		setPlaying(false);
		const width = timelineRef.current?.getBoundingClientRect().width ?? 1;
		trimDragRef.current = {
			pointerId: event.pointerId,
			segment,
			edge,
			startX: event.clientX,
			timelineWidth: width,
			durationMs: project.durationMs
		};
		setInteraction("trimming");
		capturePointer(event.currentTarget, event.pointerId);
	};
	const continueTrim = (event) => {
		const drag = trimDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const initialSourceMs = drag.edge === "start" ? drag.segment.trimStartMs : drag.segment.trimEndMs;
		const requested = trimSourceTimeFromPointerDelta(drag.edge, initialSourceMs, event.clientX - drag.startX, drag.timelineWidth, drag.durationMs);
		const nextProject = updateProjectSegment(projectRef.current, drag.segment.id, (segment) => applyMontageSegmentTrim(segment, drag.edge, requested));
		projectRef.current = nextProject;
		onProjectChange(nextProject);
	};
	const finishTrim = (event) => {
		if (!trimDragRef.current) return;
		continueTrim(event);
		const segmentId = trimDragRef.current.segment.id;
		releasePointer(event.currentTarget, event.pointerId);
		trimDragRef.current = null;
		setInteraction("idle");
		seekMontage(montageStartForSegment(projectRef.current.segments, segmentId), false);
	};
	const keyboardTrim = (event, segment, edge) => {
		const step = Math.max(1, Math.round(1e3 / Math.max(1, segment.source.fps || 30)));
		const direction = event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : 0;
		if (direction === 0) return;
		event.preventDefault();
		const current = edge === "start" ? segment.trimStartMs : segment.trimEndMs;
		const nextProject = updateProjectSegment(projectRef.current, segment.id, (currentSegment) => applyMontageSegmentTrim(currentSegment, edge, current + direction * step));
		projectRef.current = nextProject;
		onProjectChange(nextProject);
	};
	const moveSegment = (activeId, overId) => {
		const nextProject = reorderProjectSegment(projectRef.current, activeId, overId);
		if (nextProject === projectRef.current) return;
		projectRef.current = nextProject;
		onProjectChange(nextProject);
		onSelectedSegmentChange(activeId);
		seekMontage(montageStartForSegment(nextProject.segments, activeId), false, nextProject.segments);
	};
	const removeSegment = (segmentId) => {
		if (projectRef.current.segments.length <= 1) return;
		const removedIndex = projectRef.current.segments.findIndex((segment) => segment.id === segmentId);
		const nextProject = removeProjectSegment(projectRef.current, segmentId);
		const nextSelected = nextProject.segments[Math.min(Math.max(0, removedIndex), nextProject.segments.length - 1)];
		projectRef.current = nextProject;
		onProjectChange(nextProject);
		onSelectedSegmentChange(nextSelected.id);
		seekMontage(montageStartForSegment(nextProject.segments, nextSelected.id), false, nextProject.segments);
	};
	const selectedIndex = project.segments.findIndex((segment) => segment.id === selectedSegmentId);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-timeline",
		"aria-label": "Montage timeline",
		"data-interaction": interaction,
		"data-playing": playing || void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "montage-transport",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("output", {
					className: "montage-timecode",
					"aria-label": `Current montage time ${formatTimelineTime(currentMs)}`,
					children: formatTimelineTime(currentMs)
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "montage-duration",
					children: ["/ ", formatTimelineTime(project.durationMs)]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {
					orientation: "vertical",
					className: "h-5"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton, {
					label: "Previous clip",
					icon: SkipBack,
					disabled: selectedIndex <= 0,
					onClick: () => {
						const segment = project.segments[Math.max(0, selectedIndex - 1)];
						if (segment) seekMontage(montageStartForSegment(project.segments, segment.id), false);
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton, {
					label: playing ? "Pause" : "Play montage",
					icon: playing ? Pause : Play,
					primary: true,
					onClick: () => void togglePlayback()
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TransportButton, {
					label: "Next clip",
					icon: SkipForward,
					disabled: selectedIndex < 0 || selectedIndex >= project.segments.length - 1,
					onClick: () => {
						const segment = project.segments[Math.min(project.segments.length - 1, selectedIndex + 1)];
						if (segment) seekMontage(montageStartForSegment(project.segments, segment.id), false);
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {
					orientation: "vertical",
					className: "h-5"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "icon",
					className: "size-7",
					"aria-label": muted ? "Unmute montage preview" : "Mute montage preview",
					onClick: () => {
						const next = !muted;
						setMuted(next);
						for (const ref of videoRefs) if (ref.current) ref.current.muted = next;
					},
					children: muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-3.5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-3.5" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					className: "montage-volume",
					min: 0,
					max: 100,
					step: 1,
					value: [Math.round(volume * 100)],
					"aria-label": "Montage preview volume",
					onValueChange: ([next]) => {
						if (typeof next !== "number") return;
						const value = next / 100;
						setVolume(value);
						for (const ref of videoRefs) if (ref.current) ref.current.volume = value;
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "montage-transport__summary",
					children: [
						project.segments.length,
						" ",
						project.segments.length === 1 ? "clip" : "clips",
						" · cuts preview continuously"
					]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: timelineRef,
			className: "montage-timeline__surface",
			"data-testid": "montage-timeline-surface",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "montage-segments",
					role: "list",
					"aria-label": "Montage clip order",
					children: project.segments.map((segment, index) => {
						const width = project.durationMs > 0 ? segmentDurationMs(segment) / project.durationMs * 100 : 100 / project.segments.length;
						const selected = segment.id === selectedSegmentId;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "montage-segment-slot",
							style: { width: `${width}%` },
							role: "listitem",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									draggable: true,
									className: "montage-segment",
									"data-selected": selected || void 0,
									"data-unavailable": segment.unavailableReason ? true : void 0,
									"aria-label": `${segment.source.name}, position ${index + 1} of ${project.segments.length}`,
									"aria-pressed": selected,
									onClick: () => void seekMontage(montageStartForSegment(project.segments, segment.id), false),
									onDragStart: (event) => {
										draggedSegmentIdRef.current = segment.id;
										event.dataTransfer.effectAllowed = "move";
										event.dataTransfer.setData("text/plain", segment.id);
									},
									onDragOver: (event) => {
										event.preventDefault();
										event.dataTransfer.dropEffect = "move";
									},
									onDrop: (event) => {
										event.preventDefault();
										const activeId = draggedSegmentIdRef.current ?? event.dataTransfer.getData("text/plain");
										if (activeId) moveSegment(activeId, segment.id);
										draggedSegmentIdRef.current = null;
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(GripVertical, { "aria-hidden": "true" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: index + 1 }), segment.source.name] }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: formatTimelineTime(segmentDurationMs(segment)) })
									]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuContent, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuItem, {
									disabled: index === 0,
									onSelect: () => {
										const previous = project.segments[index - 1];
										if (previous) moveSegment(segment.id, previous.id);
									},
									children: "Move earlier"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuItem, {
									disabled: index === project.segments.length - 1,
									onSelect: () => {
										const next = project.segments[index + 1];
										if (next) moveSegment(segment.id, next.id);
									},
									children: "Move later"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuSeparator, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuItem, {
									className: "text-destructive focus:text-destructive",
									disabled: project.segments.length <= 1,
									onSelect: () => removeSegment(segment.id),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" }), " Remove from montage"]
								})
							] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "montage-segment-trim",
								"data-selected": selected || void 0,
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										role: "slider",
										tabIndex: 0,
										"aria-label": `${segment.source.name} trim start`,
										"aria-valuemin": 0,
										"aria-valuemax": Math.max(0, segment.trimEndMs - 100),
										"aria-valuenow": segment.trimStartMs,
										className: "montage-trim-handle is-start",
										onKeyDown: (event) => keyboardTrim(event, segment, "start"),
										onPointerDown: (event) => beginTrim(event, segment, "start"),
										onPointerMove: continueTrim,
										onPointerUp: finishTrim,
										onPointerCancel: () => {
											trimDragRef.current = null;
											setInteraction("idle");
										}
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true" }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										role: "slider",
										tabIndex: 0,
										"aria-label": `${segment.source.name} trim end`,
										"aria-valuemin": segment.trimStartMs + 100,
										"aria-valuemax": segment.source.durationMs,
										"aria-valuenow": segment.trimEndMs,
										className: "montage-trim-handle is-end",
										onKeyDown: (event) => keyboardTrim(event, segment, "end"),
										onPointerDown: (event) => beginTrim(event, segment, "end"),
										onPointerMove: continueTrim,
										onPointerUp: finishTrim,
										onPointerCancel: () => {
											trimDragRef.current = null;
											setInteraction("idle");
										}
									})
								]
							})]
						}, segment.id);
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					role: "slider",
					tabIndex: 0,
					"aria-label": "Montage playhead",
					"aria-valuemin": 0,
					"aria-valuemax": project.durationMs,
					"aria-valuenow": Math.round(currentMs),
					className: "montage-scrub",
					onKeyDown: (event) => {
						const step = event.key === "ArrowLeft" ? -33 : event.key === "ArrowRight" ? 33 : 0;
						if (!step) return;
						event.preventDefault();
						seekMontage(currentMsRef.current + step, false);
					},
					onPointerDown: beginScrub,
					onPointerMove: (event) => {
						if (interaction === "scrubbing") seekFromPointer(event);
					},
					onPointerUp: finishScrub,
					onPointerCancel: () => setInteraction("idle"),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "aria-hidden": "true" })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					ref: playheadRef,
					className: "montage-playhead",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
				})
			]
		})]
	});
}
function TransportButton({ label, icon: Icon, primary = false, disabled, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: primary ? "primary" : "ghost",
			size: "icon",
			className: primary ? "size-8" : "size-7",
			"aria-label": label,
			disabled,
			onClick,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
				className: primary ? "size-4" : "size-3.5",
				"aria-hidden": "true"
			})
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: label })] });
}
async function prepareVideo(video, segment, sourceTimeMs, autoplay) {
	if (video.dataset.clipId !== segment.source.id) {
		video.dataset.clipId = segment.source.id;
		video.src = `switchboard-media://clip/${encodeURIComponent(segment.source.id)}`;
		video.preload = "auto";
		video.load();
	}
	if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitForVideoMetadata(video);
	video.currentTime = Math.min(segment.trimEndMs, Math.max(segment.trimStartMs, sourceTimeMs)) / 1e3;
	if (autoplay) await video.play();
}
function waitForVideoMetadata(video) {
	return new Promise((resolve, reject) => {
		const finish = () => {
			cleanup();
			resolve();
		};
		const fail = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Preview source could not be decoded."));
		};
		const cleanup = () => {
			video.removeEventListener("loadedmetadata", finish);
			video.removeEventListener("error", fail);
		};
		video.addEventListener("loadedmetadata", finish, { once: true });
		video.addEventListener("error", fail, { once: true });
	});
}
function positionPlayhead(playhead, timeline, currentMs, durationMs) {
	if (!playhead || !timeline) return;
	const width = timeline.getBoundingClientRect().width;
	const offset = durationMs > 0 ? Math.min(1, Math.max(0, currentMs / durationMs)) * width : 0;
	playhead.style.transform = `translate3d(${offset}px, 0, 0)`;
}
function formatTimelineTime(milliseconds) {
	const totalMilliseconds = Math.max(0, Math.round(milliseconds));
	const hours = Math.floor(totalMilliseconds / 36e5);
	const minutes = Math.floor(totalMilliseconds / 6e4) % 60;
	const seconds = Math.floor(totalMilliseconds / 1e3) % 60;
	const millis = totalMilliseconds % 1e3;
	return `${`${hours > 0 ? `${hours}:` : ""}${hours > 0 ? String(minutes).padStart(2, "0") : minutes}:${String(seconds).padStart(2, "0")}`}.${String(millis).padStart(3, "0")}`;
}
function capturePointer(element, pointerId) {
	try {
		element.setPointerCapture(pointerId);
	} catch {}
}
function releasePointer(element, pointerId) {
	try {
		if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
	} catch {}
}
//#endregion
//#region src/renderer/src/components/capture/ClipEditor.tsx
var channelLabels = {
	game: "Game",
	chat: "Chat",
	microphone: "Microphone",
	media: "Media"
};
var canvasSizes = [{
	id: "original",
	label: "Original"
}, {
	id: "9:16",
	label: "9:16"
}];
function ClipEditor(props) {
	return "project" in props ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageClipEditor, { ...props }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SingleClipEditor, { ...props });
}
function SingleClipEditor({ clip, exportPending, trimPending, canvasPending, inspectorOpen, defaultTrackLevels, onClose, onFavorite, onRename, onReveal, onInspectorOpenChange, onCanvasSizeChange, onSaveTrim, onAudioTrackLevelChange, onExport, onCancelExport, onDelete }) {
	const backRef = (0, import_react.useRef)(null);
	const editorRef = (0, import_react.useRef)(null);
	const viewerRef = (0, import_react.useRef)(null);
	const cropGuideRef = (0, import_react.useRef)(null);
	const videoRef = (0, import_react.useRef)(null);
	const savedStartMs = clip.trimStartMs ?? 0;
	const savedEndMs = clip.trimEndMs ?? clip.durationMs;
	const savedAudioTrackTrims = clip.audioTrackTrims ?? [];
	const [startMs, setStartMs] = (0, import_react.useState)(savedStartMs);
	const [endMs, setEndMs] = (0, import_react.useState)(savedEndMs);
	const [audioTrackTrims, setAudioTrackTrims] = (0, import_react.useState)(() => [...savedAudioTrackTrims]);
	const [previewState, setPreviewState] = (0, import_react.useState)("loading");
	const [viewerFullscreen, setViewerFullscreen] = (0, import_react.useState)(false);
	const dirty = startMs !== savedStartMs || endMs !== savedEndMs || !sameAudioTrackTrims(audioTrackTrims, savedAudioTrackTrims);
	(0, import_react.useLayoutEffect)(() => {
		setStartMs(clip.trimStartMs ?? 0);
		setEndMs(clip.trimEndMs ?? clip.durationMs);
		setAudioTrackTrims([...clip.audioTrackTrims ?? []]);
		setPreviewState("loading");
	}, [clip.id]);
	(0, import_react.useEffect)(() => {
		backRef.current?.focus();
	}, []);
	(0, import_react.useEffect)(() => {
		const video = videoRef.current;
		if (!video) return;
		const markReady = () => setPreviewState("ready");
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) markReady();
		video.addEventListener("loadeddata", markReady);
		video.addEventListener("canplay", markReady);
		return () => {
			video.removeEventListener("loadeddata", markReady);
			video.removeEventListener("canplay", markReady);
		};
	}, [clip.id]);
	(0, import_react.useEffect)(() => {
		if (!viewerFullscreen) return;
		const exitFocusedViewer = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			setViewerFullscreen(false);
		};
		window.addEventListener("keydown", exitFocusedViewer, { capture: true });
		return () => window.removeEventListener("keydown", exitFocusedViewer, { capture: true });
	}, [viewerFullscreen]);
	(0, import_react.useEffect)(() => {
		const viewer = viewerRef.current;
		const guide = cropGuideRef.current;
		if (!viewer || !guide || clip.canvasSize !== "9:16") return;
		const updateCropGuide = () => {
			const width = viewer.clientWidth;
			const height = viewer.clientHeight;
			const sourceAspect = clip.width > 0 && clip.height > 0 ? clip.width / clip.height : 16 / 9;
			const viewerAspect = width / Math.max(1, height);
			const videoWidth = viewerAspect > sourceAspect ? height * sourceAspect : width;
			const videoHeight = viewerAspect > sourceAspect ? height : width / sourceAspect;
			const targetAspect = 9 / 16;
			const cropWidth = sourceAspect >= targetAspect ? videoHeight * targetAspect : videoWidth;
			const cropHeight = sourceAspect >= targetAspect ? videoHeight : videoWidth / targetAspect;
			guide.style.left = `${(width - cropWidth) / 2}px`;
			guide.style.top = `${(height - cropHeight) / 2}px`;
			guide.style.width = `${cropWidth}px`;
			guide.style.height = `${cropHeight}px`;
		};
		const observer = new ResizeObserver(updateCropGuide);
		observer.observe(viewer);
		updateCropGuide();
		return () => observer.disconnect();
	}, [
		clip.canvasSize,
		clip.height,
		clip.width,
		viewerFullscreen
	]);
	const keepFocusInside = (event) => {
		if (event.key === "Escape" && viewerFullscreen) return;
		if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("[data-radix-popper-content-wrapper], [data-share-clip-dialog][data-state=\"open\"]")) {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== "Tab") return;
		const controls = focusableElements(editorRef.current);
		if (controls.length === 0) return;
		const current = controls.indexOf(document.activeElement);
		if (event.shiftKey && current <= 0) {
			event.preventDefault();
			controls.at(-1)?.focus();
		} else if (!event.shiftKey && current === controls.length - 1) {
			event.preventDefault();
			controls[0]?.focus();
		}
	};
	const updateTrim = (nextStartMs, nextEndMs) => {
		setStartMs(nextStartMs);
		setEndMs(nextEndMs);
	};
	const updateAudioTrackTrim = (trackIndex, nextStartMs, nextEndMs) => {
		setAudioTrackTrims((current) => {
			const next = [...current];
			while (next.length <= trackIndex) next.push(null);
			next[trackIndex] = nextStartMs === 0 && nextEndMs === clip.durationMs ? null : {
				startMs: nextStartMs,
				endMs: nextEndMs
			};
			while (next.at(-1) === null) next.pop();
			return next;
		});
	};
	const toggleViewerFullscreen = () => setViewerFullscreen((current) => !current);
	const seekToEvent = (timestampMs) => {
		if (!videoRef.current) return;
		videoRef.current.currentTime = timestampMs / 1e3;
		videoRef.current.play().catch(() => void 0);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		ref: editorRef,
		className: "clip-editor-shell",
		role: "dialog",
		"aria-modal": "true",
		"aria-labelledby": "clip-editor-title",
		"data-testid": "clip-editor",
		onKeyDown: keepFocusInside,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "clip-editor-header no-drag",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					ref: backRef,
					type: "button",
					variant: "ghost",
					size: "sm",
					className: "clip-editor-header__back no-drag",
					onClick: onClose,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " Back to clips"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "clip-editor-header__identity",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-header__copy",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							clipGameLabel(clip),
							" · ",
							formatDuration(clip.durationMs / 1e3)
						] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: "clip-editor-title",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "clip-editor-header__rename no-drag",
								onClick: onRename,
								"aria-label": `Rename ${clip.name}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: clip.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { "aria-hidden": "true" })]
							})
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "ghost",
							size: "icon",
							className: cn("no-drag size-7", clip.favorite && "text-primary"),
							"aria-label": clip.favorite ? "Remove from favorites" : "Add to favorites",
							"aria-pressed": clip.favorite,
							onClick: () => onFavorite(!clip.favorite),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: cn("size-3.5", clip.favorite && "fill-current") })
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: clip.favorite ? "Remove from favorites" : "Add to favorites" })] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "clip-editor-header__actions",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
							asChild: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								variant: "ghost",
								size: "icon",
								className: "no-drag",
								"aria-label": inspectorOpen ? "Collapse Inspector" : "Open Inspector",
								"aria-pressed": inspectorOpen,
								onClick: () => onInspectorOpenChange(!inspectorOpen),
								children: inspectorOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightClose, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightOpen, { className: "size-4" })
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: inspectorOpen ? "Collapse Inspector" : "Open Inspector" })] }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareClipDialog, {
							clip,
							startMs,
							endMs,
							exportPending,
							disabled: clip.durationMs < 100,
							onExport: (preset, exportId) => onExport(preset, startMs, endMs, audioTrackTrims, exportId),
							onCancelExport
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
							asChild: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									size: "icon",
									className: "no-drag",
									"aria-label": "More clip actions",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EllipsisVertical, { className: "size-4" })
								})
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "More clip actions" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuContent, {
							align: "end",
							className: "no-drag",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
									onSelect: onRename,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "size-3.5" }), " Rename clip"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
									onSelect: onReveal,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-3.5" }), " Show in folder"]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuSeparator, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
									className: "text-destructive focus:bg-destructive/10 focus:text-destructive",
									onSelect: onDelete,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" }), " Delete clip"]
								})
							]
						})] })
					]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "clip-editor-layout",
			"data-inspector": inspectorOpen ? "open" : "closed",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "clip-editor-workspace",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					ref: viewerRef,
					className: "clip-editor-preview",
					"data-state": previewState,
					"data-canvas-size": clip.canvasSize,
					"data-fullscreen": viewerFullscreen ? "true" : "false",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
							ref: videoRef,
							src: `switchboard-media://clip/${encodeURIComponent(clip.id)}`,
							preload: "metadata",
							"aria-label": `Preview ${clip.name}`,
							onLoadedMetadata: (event) => {
								event.currentTarget.currentTime = startMs / 1e3;
							},
							onLoadedData: () => setPreviewState("ready"),
							onCanPlay: () => setPreviewState("ready"),
							onError: () => setPreviewState("error")
						}),
						clip.canvasSize === "9:16" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: cropGuideRef,
							className: "clip-editor-crop-guide",
							"aria-hidden": "true"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "clip-editor-preview__controls no-drag",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									size: "icon",
									className: "clip-editor-preview__fullscreen",
									"aria-label": viewerFullscreen ? "Exit fullscreen" : "Enter fullscreen",
									onClick: toggleViewerFullscreen,
									children: viewerFullscreen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize, { className: "size-4" })
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, {
								side: "top",
								children: viewerFullscreen ? "Exit fullscreen" : "Fullscreen"
							})] })
						}),
						previewState !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "clip-editor-preview__status",
							role: previewState === "error" ? "alert" : "status",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: previewState === "error" ? "Preview unavailable" : "Loading preview" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: previewState === "error" ? "The clip could not be decoded. File actions remain available." : "Reading clip metadata…" })]
						}) : null
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipTimeline, {
					clipId: clip.id,
					videoRef,
					durationMs: clip.durationMs,
					fps: clip.fps,
					audioChannels: clip.audioChannels,
					audioTrackLevels: clip.audioTrackLevels,
					audioTrackTrims,
					defaultTrackLevels,
					eventMarkers: clip.autoCapture?.events,
					startMs,
					endMs,
					dirty,
					savePending: trimPending,
					onChange: updateTrim,
					onAudioTrackTrimChange: updateAudioTrackTrim,
					onResetTrims: () => {
						updateTrim(0, clip.durationMs);
						setAudioTrackTrims([]);
					},
					onAudioTrackLevelChange,
					onSave: () => void onSaveTrim(startMs, endMs, audioTrackTrims)
				}, clip.id)]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
				className: "clip-editor-inspector",
				"aria-label": "Clip inspector",
				"aria-hidden": !inspectorOpen || void 0,
				inert: !inspectorOpen ? true : void 0,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
					className: "h-full",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-inspector__content",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "clip-editor-inspector__heading",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Inspector" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Adjustments" })] })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section clip-editor-canvas",
								"aria-labelledby": "canvas-size-heading",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "clip-editor-section-heading",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
											id: "canvas-size-heading",
											children: "Canvas size"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: canvasPending ? "Saving…" : clip.canvasSize === "9:16" ? "Vertical" : "Source" })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroup, {
										className: "clip-editor-canvas__options",
										"aria-label": "Canvas size",
										value: clip.canvasSize,
										disabled: canvasPending,
										onValueChange: (value) => onCanvasSizeChange(value),
										children: canvasSizes.map((option) => {
											const selected = clip.canvasSize === option.id;
											const id = `clip-canvas-${option.id.replace(":", "-")}`;
											return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												htmlFor: id,
												className: "clip-editor-canvas__option",
												"data-state": selected ? "checked" : "unchecked",
												"data-disabled": canvasPending ? "" : void 0,
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroupItem, {
														id,
														value: option.id,
														className: "sr-only",
														"aria-label": option.label
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "clip-editor-canvas__glyph",
														"data-shape": option.id,
														"aria-hidden": "true",
														children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: option.label })
												]
											}, option.id);
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: clip.canvasSize === "9:16" ? "Exports use the centered vertical crop shown in the preview." : "Exports keep the source frame." })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section",
								"aria-labelledby": "clip-details-heading",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "clip-editor-section-heading",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										id: "clip-details-heading",
										children: "Clip details"
									})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
									className: "clip-editor-details",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Game",
											value: clipGameLabel(clip)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Duration",
											value: formatDuration(clip.durationMs / 1e3)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Created",
											value: new Date(clip.createdAt).toLocaleString()
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Video quality",
											value: formatVideoQuality(clip.width, clip.height, clip.fps)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Size",
											value: formatBytes(clip.fileSize)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "clip-editor-details__location",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Location" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												className: "clip-editor-metadata__path",
												title: clip.path,
												"aria-label": `Show ${clip.path} in File Explorer`,
												onClick: onReveal,
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: clip.path })]
											}) })]
										})
									]
								})]
							}),
							clip.autoCapture?.events.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section clip-editor-events",
								"aria-labelledby": "clip-events-heading",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "clip-editor-section-heading",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										id: "clip-events-heading",
										children: "Events"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: clip.autoCapture.events.length })]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", { children: clip.autoCapture.events.map((marker) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									onClick: () => seekToEvent(marker.timestampMs),
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											"data-event-type": marker.type,
											"aria-hidden": "true"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: marker.label ?? singularEventLabel(marker.type) }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", { children: formatEventTime(marker.timestampMs) })
									]
								}) }, marker.id)) })]
							}) }) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section",
								"aria-labelledby": "audio-tracks-heading",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
									id: "audio-tracks-heading",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, {
										className: "size-3.5",
										"aria-hidden": "true"
									}), " Audio tracks"]
								}), clip.audioChannels && clip.audioChannels.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
									className: "clip-editor-audio-tracks",
									children: clip.audioChannels.map((channel) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										style: { backgroundColor: channelColor(channel) },
										"aria-hidden": "true"
									}), channelLabels[channel]] }, channel))
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "No separate channel metadata is available." })]
							})
						]
					})
				})
			})]
		})]
	});
}
function MontageClipEditor({ project: initialProject, exportPending, inspectorOpen, onClose, onReveal, onInspectorOpenChange, onExport, onCancelExport }) {
	const backRef = (0, import_react.useRef)(null);
	const editorRef = (0, import_react.useRef)(null);
	const viewerRef = (0, import_react.useRef)(null);
	const cropGuideRef = (0, import_react.useRef)(null);
	const videoARef = (0, import_react.useRef)(null);
	const videoBRef = (0, import_react.useRef)(null);
	const montageVideoRefs = (0, import_react.useMemo)(() => [videoARef, videoBRef], []);
	const [project, setProject] = (0, import_react.useState)(() => normalizeClipProject(initialProject));
	const [selectedSegmentId, setSelectedSegmentId] = (0, import_react.useState)(initialProject.segments[0]?.id ?? "");
	const [previewState, setPreviewState] = (0, import_react.useState)("loading");
	const [activeVideoSlot, setActiveVideoSlot] = (0, import_react.useState)(0);
	const [viewerFullscreen, setViewerFullscreen] = (0, import_react.useState)(false);
	const selectedSegment = project.segments.find((segment) => segment.id === selectedSegmentId) ?? project.segments[0];
	const selectedClip = selectedSegment?.source ?? initialProject.segments[0].source;
	const proportionalBytes = project.segments.reduce((total, segment) => total + segment.source.fileSize * segmentDurationMs(segment) / Math.max(1, segment.source.durationMs), 0);
	(0, import_react.useEffect)(() => {
		backRef.current?.focus();
	}, []);
	(0, import_react.useEffect)(() => {
		setProject((current) => normalizeClipProject({
			...current,
			segments: current.segments.map((segment) => {
				const latest = initialProject.segments.find((candidate) => candidate.source.id === segment.source.id);
				return latest ? {
					...segment,
					source: latest.source,
					unavailableReason: latest.unavailableReason
				} : segment;
			})
		}));
	}, [initialProject.segments]);
	(0, import_react.useEffect)(() => {
		if (!viewerFullscreen) return;
		const exitFocusedViewer = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			event.stopPropagation();
			setViewerFullscreen(false);
		};
		window.addEventListener("keydown", exitFocusedViewer, { capture: true });
		return () => window.removeEventListener("keydown", exitFocusedViewer, { capture: true });
	}, [viewerFullscreen]);
	(0, import_react.useEffect)(() => {
		const viewer = viewerRef.current;
		const guide = cropGuideRef.current;
		if (!viewer || !guide || project.canvasSize !== "9:16") return;
		const updateCropGuide = () => {
			const width = viewer.clientWidth;
			const height = viewer.clientHeight;
			const sourceAspect = selectedClip.width > 0 && selectedClip.height > 0 ? selectedClip.width / selectedClip.height : 16 / 9;
			const viewerAspect = width / Math.max(1, height);
			const videoWidth = viewerAspect > sourceAspect ? height * sourceAspect : width;
			const videoHeight = viewerAspect > sourceAspect ? height : width / sourceAspect;
			const targetAspect = 9 / 16;
			const cropWidth = sourceAspect >= targetAspect ? videoHeight * targetAspect : videoWidth;
			const cropHeight = sourceAspect >= targetAspect ? videoHeight : videoWidth / targetAspect;
			guide.style.left = `${(width - cropWidth) / 2}px`;
			guide.style.top = `${(height - cropHeight) / 2}px`;
			guide.style.width = `${cropWidth}px`;
			guide.style.height = `${cropHeight}px`;
		};
		const observer = new ResizeObserver(updateCropGuide);
		observer.observe(viewer);
		updateCropGuide();
		return () => observer.disconnect();
	}, [
		project.canvasSize,
		selectedClip.height,
		selectedClip.width,
		viewerFullscreen
	]);
	const keepFocusInside = (event) => {
		if (event.key === "Escape" && viewerFullscreen) return;
		if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("[data-radix-popper-content-wrapper], [data-share-clip-dialog][data-state=\"open\"]")) {
			event.preventDefault();
			onClose();
			return;
		}
		if (event.key !== "Tab") return;
		const controls = focusableElements(editorRef.current);
		if (controls.length === 0) return;
		const current = controls.indexOf(document.activeElement);
		if (event.shiftKey && current <= 0) {
			event.preventDefault();
			controls.at(-1)?.focus();
		} else if (!event.shiftKey && current === controls.length - 1) {
			event.preventDefault();
			controls[0]?.focus();
		}
	};
	const updateProject = (nextProject) => {
		setProject(normalizeClipProject(nextProject));
	};
	const updateSelectedAudioLevel = (trackIndex, level) => {
		if (!selectedSegment) return;
		updateProject(updateProjectSegment(project, selectedSegment.id, (segment) => {
			const levels = [...segment.audioTrackLevels];
			while (levels.length <= trackIndex) levels.push(100);
			levels[trackIndex] = level;
			return {
				...segment,
				audioTrackLevels: levels
			};
		}));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		ref: editorRef,
		className: "clip-editor-shell",
		role: "dialog",
		"aria-modal": "true",
		"aria-labelledby": "clip-editor-title",
		"data-testid": "clip-editor",
		"data-project-type": "montage",
		onKeyDown: keepFocusInside,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "clip-editor-header no-drag",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					ref: backRef,
					type: "button",
					variant: "ghost",
					size: "sm",
					className: "clip-editor-header__back no-drag",
					onClick: onClose,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " Back to clips"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "clip-editor-header__identity clip-editor-header__identity--montage",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clapperboard, {
							className: "size-4 shrink-0 text-primary",
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
							id: "clip-editor-title",
							title: project.name,
							children: project.name
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
							project.segments.length,
							" ",
							project.segments.length === 1 ? "clip" : "clips"
						] })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "clip-editor-header__actions",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "ghost",
							size: "icon",
							className: "no-drag",
							"aria-label": inspectorOpen ? "Collapse Inspector" : "Open Inspector",
							"aria-pressed": inspectorOpen,
							onClick: () => onInspectorOpenChange(!inspectorOpen),
							children: inspectorOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightClose, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightOpen, { className: "size-4" })
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: inspectorOpen ? "Collapse Inspector" : "Open Inspector" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareClipDialog, {
						clip: project.segments[0].source,
						startMs: 0,
						endMs: project.durationMs,
						selectedDurationMs: project.durationMs,
						sourceBytes: proportionalBytes,
						projectType: "montage",
						segmentCount: project.segments.length,
						exportPending,
						disabled: project.durationMs < 100 || project.segments.length === 0 || project.segments.some((segment) => Boolean(segment.unavailableReason)),
						onExport: (preset, exportId) => onExport(preset, project, exportId),
						onCancelExport
					})]
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "clip-editor-layout",
			"data-inspector": inspectorOpen ? "open" : "closed",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "clip-editor-workspace",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					ref: viewerRef,
					className: "clip-editor-preview clip-editor-preview--montage",
					"data-state": previewState,
					"data-canvas-size": project.canvasSize,
					"data-fullscreen": viewerFullscreen ? "true" : "false",
					"data-active-slot": activeVideoSlot,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
							ref: videoARef,
							preload: "metadata",
							"data-preview-slot": "0",
							"aria-label": `Montage preview, ${selectedClip.name}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
							ref: videoBRef,
							preload: "metadata",
							"data-preview-slot": "1",
							"aria-hidden": activeVideoSlot !== 1
						}),
						project.canvasSize === "9:16" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: cropGuideRef,
							className: "clip-editor-crop-guide",
							"aria-hidden": "true"
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "clip-editor-preview__controls no-drag",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									size: "icon",
									className: "clip-editor-preview__fullscreen",
									"aria-label": viewerFullscreen ? "Exit fullscreen" : "Enter fullscreen",
									onClick: () => setViewerFullscreen((current) => !current),
									children: viewerFullscreen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize, { className: "size-4" })
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, {
								side: "top",
								children: viewerFullscreen ? "Exit fullscreen" : "Fullscreen"
							})] })
						}),
						previewState !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "clip-editor-preview__status",
							role: previewState === "error" ? "alert" : "status",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: previewState === "error" ? "Preview unavailable" : "Loading montage preview" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: previewState === "error" ? "A source clip is missing, inaccessible, or could not be decoded." : "Preparing the current clip and the next boundary…" })]
						}) : null
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageTimeline, {
					project,
					selectedSegmentId,
					videoRefs: montageVideoRefs,
					activeVideoSlot,
					onActiveVideoSlotChange: setActiveVideoSlot,
					onPreviewStateChange: setPreviewState,
					onSelectedSegmentChange: setSelectedSegmentId,
					onProjectChange: updateProject
				}, initialProject.id)]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
				className: "clip-editor-inspector",
				"aria-label": "Montage inspector",
				"aria-hidden": !inspectorOpen || void 0,
				inert: !inspectorOpen ? true : void 0,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
					className: "h-full",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "clip-editor-inspector__content",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "clip-editor-inspector__heading",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Montage inspector" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: selectedClip.name })] })
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section clip-editor-canvas",
								"aria-labelledby": "montage-canvas-size-heading",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "clip-editor-section-heading",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
											id: "montage-canvas-size-heading",
											children: "Canvas size"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.canvasSize === "9:16" ? "Vertical" : "Source" })]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroup, {
										className: "clip-editor-canvas__options",
										"aria-label": "Montage canvas size",
										value: project.canvasSize,
										onValueChange: (value) => updateProject({
											...project,
											canvasSize: value
										}),
										children: canvasSizes.map((option) => {
											const selected = project.canvasSize === option.id;
											const id = `montage-canvas-${option.id.replace(":", "-")}`;
											return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
												htmlFor: id,
												className: "clip-editor-canvas__option",
												"data-state": selected ? "checked" : "unchecked",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroupItem, {
														id,
														value: option.id,
														className: "sr-only",
														"aria-label": option.label
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "clip-editor-canvas__glyph",
														"data-shape": option.id,
														"aria-hidden": "true",
														children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {})
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: option.label })
												]
											}, option.id);
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Every segment is normalized to this canvas during export." })
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section",
								"aria-labelledby": "montage-details-heading",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "clip-editor-section-heading",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
										id: "montage-details-heading",
										children: "Segment details"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
										Math.max(0, project.segments.findIndex((segment) => segment.id === selectedSegmentId)) + 1,
										" of ",
										project.segments.length
									] })]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
									className: "clip-editor-details",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Trimmed duration",
											value: formatDuration(selectedSegment ? segmentDurationMs(selectedSegment) / 1e3 : 0)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Source",
											value: formatVideoQuality(selectedClip.width, selectedClip.height, selectedClip.fps)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Detail, {
											label: "Output",
											value: project.canvasSize === "9:16" ? "9:16 vertical" : formatVideoQuality(project.segments[0]?.source.width ?? 0, project.segments[0]?.source.height ?? 0, project.segments[0]?.source.fps ?? 0)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "clip-editor-details__location",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Location" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												className: "clip-editor-metadata__path",
												title: selectedClip.path,
												"aria-label": `Show ${selectedClip.path} in File Explorer`,
												onClick: () => onReveal(selectedClip),
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: selectedClip.path })]
											}) })]
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
								className: "clip-editor-inspector__section",
								"aria-labelledby": "montage-audio-heading",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
									id: "montage-audio-heading",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, {
										className: "size-3.5",
										"aria-hidden": "true"
									}), " Segment audio"]
								}), selectedClip.audioChannels && selectedClip.audioChannels.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "montage-audio-controls",
									children: selectedClip.audioChannels.map((channel, trackIndex) => {
										const level = selectedSegment?.audioTrackLevels[trackIndex] ?? 100;
										return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											style: { "--track-color": channelColor(channel) },
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": "true" }), channelLabels[channel]] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [level, "%"] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
													min: 0,
													max: 100,
													step: 1,
													value: [level],
													"aria-label": `${channelLabels[channel]} level for ${selectedClip.name}`,
													onValueChange: ([next]) => {
														if (typeof next === "number") updateSelectedAudioLevel(trackIndex, next);
													}
												})
											]
										}, `${channel}-${trackIndex}`);
									})
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "This source has no separate audio-channel metadata. Any decodable audio is still included in export." })]
							})
						]
					})
				})
			})]
		})]
	});
}
function sameAudioTrackTrims(left, right) {
	const length = Math.max(left.length, right.length);
	for (let index = 0; index < length; index += 1) {
		const leftTrim = left[index] ?? null;
		const rightTrim = right[index] ?? null;
		if (leftTrim?.startMs !== rightTrim?.startMs || leftTrim?.endMs !== rightTrim?.endMs) return false;
	}
	return true;
}
function Detail({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: value })] });
}
function formatEventTime(milliseconds) {
	const totalSeconds = Math.max(0, Math.floor(milliseconds / 1e3));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function focusableElements(root) {
	if (!root) return [];
	return [...root.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), video[controls], [tabindex]:not([tabindex=\"-1\"])")].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}
//#endregion
export { ClipEditor };
