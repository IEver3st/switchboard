import { L as require_jsx_runtime, N as createLucideIcon, S as titleOverlay, V as __toESM, _ as framingGeometry, b as sourceToEditedMs, f as automationGainAt, g as framingAt, h as editedTimeAt, m as editedDurationMs, p as canvasRatios, t as switchboardApi, w as videoTextSize, x as speedAt, y as montageSizeChoices, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-Dzg1fQmA.js";
import { a as Music2, i as Save, r as VolumeX, t as channelColor } from "./channel-identity-GMsL-QZN.js";
import { v as Pencil } from "./dist-QFVzjJjP.js";
import { At as Pause, B as Separator, Bt as Copy, Ct as Trash2, I as Input, L as ScrollArea, Lt as FolderOpen, Ot as Plus, Rt as Film, Tt as Search, Wt as Check, at as Checkbox, bt as Video, c as Dialog, d as DialogHeader, dt as SelectItem, f as DialogTitle, ft as SelectTrigger, i as formatDuration, j as Slider, kt as Play, l as DialogContent, lt as Select, n as formatBytes, p as DialogTrigger, pt as SelectValue, qt as ArrowLeft, rt as Progress, s as formatVideoQuality, st as Button, u as DialogDescription, ut as SelectContent, yt as Volume2, z as Switch } from "./index-Cqk9uQ3G.js";
import { a as ContextMenuTrigger, i as ContextMenuSeparator, n as ContextMenuContent, r as ContextMenuItem, t as ContextMenu } from "./context-menu-B-i_KTVb.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-Bj4P2x-X.js";
import { _ as montageV2Api, a as mapMontageTime, c as musicTimelineDurationMs, d as removeMontageSegment, f as reorderMontageSegment, g as updateMontageSegment, h as updateMontageMusic, i as duplicateMontageSegment, l as normalizeMontageProject, m as splitMontageSegment, n as createMontageMusicTrack, o as montageStartForSegment, p as segmentDurationMs, s as musicPlaybackAt, t as addClipsToMontage, u as reconcileMontageProject, v as Star, y as Share2 } from "./capture-CJ3BXYbE.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Grip = createLucideIcon("grip", [
	["circle", {
		cx: "12",
		cy: "5",
		r: "1",
		key: "gxeob9"
	}],
	["circle", {
		cx: "19",
		cy: "5",
		r: "1",
		key: "w8mnmm"
	}],
	["circle", {
		cx: "5",
		cy: "5",
		r: "1",
		key: "lttvr7"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "1",
		key: "41hilf"
	}],
	["circle", {
		cx: "19",
		cy: "12",
		r: "1",
		key: "1wjl8i"
	}],
	["circle", {
		cx: "5",
		cy: "12",
		r: "1",
		key: "1pcz8c"
	}],
	["circle", {
		cx: "12",
		cy: "19",
		r: "1",
		key: "lyex9k"
	}],
	["circle", {
		cx: "19",
		cy: "19",
		r: "1",
		key: "shf9b7"
	}],
	["circle", {
		cx: "5",
		cy: "19",
		r: "1",
		key: "bfqh0e"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Maximize = createLucideIcon("maximize", [
	["path", {
		d: "M8 3H5a2 2 0 0 0-2 2v3",
		key: "1dcmit"
	}],
	["path", {
		d: "M21 8V5a2 2 0 0 0-2-2h-3",
		key: "1e4gt3"
	}],
	["path", {
		d: "M3 16v3a2 2 0 0 0 2 2h3",
		key: "wsl5sc"
	}],
	["path", {
		d: "M16 21h3a2 2 0 0 0 2-2v-3",
		key: "18trek"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Minimize = createLucideIcon("minimize", [
	["path", {
		d: "M8 3v3a2 2 0 0 1-2 2H3",
		key: "hohbtr"
	}],
	["path", {
		d: "M21 8h-3a2 2 0 0 1-2-2V3",
		key: "5jw1f3"
	}],
	["path", {
		d: "M3 16h3a2 2 0 0 1 2 2v3",
		key: "198tvr"
	}],
	["path", {
		d: "M16 21v-3a2 2 0 0 1 2-2h3",
		key: "ph8mxp"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var PanelRightClose = createLucideIcon("panel-right-close", [
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		key: "afitv7"
	}],
	["path", {
		d: "M15 3v18",
		key: "14nvp0"
	}],
	["path", {
		d: "m8 9 3 3-3 3",
		key: "12hl5m"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var PanelRightOpen = createLucideIcon("panel-right-open", [
	["rect", {
		width: "18",
		height: "18",
		x: "3",
		y: "3",
		rx: "2",
		key: "afitv7"
	}],
	["path", {
		d: "M15 3v18",
		key: "14nvp0"
	}],
	["path", {
		d: "m10 15-3-3 3-3",
		key: "1pgupc"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Redo2 = createLucideIcon("redo-2", [["path", {
	d: "m15 14 5-5-5-5",
	key: "12vg1m"
}], ["path", {
	d: "M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13",
	key: "6uklza"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Scissors = createLucideIcon("scissors", [
	["circle", {
		cx: "6",
		cy: "6",
		r: "3",
		key: "1lh9wr"
	}],
	["path", {
		d: "M8.12 8.12 12 12",
		key: "1alkpv"
	}],
	["path", {
		d: "M20 4 8.12 15.88",
		key: "xgtan2"
	}],
	["circle", {
		cx: "6",
		cy: "18",
		r: "3",
		key: "fqmcym"
	}],
	["path", {
		d: "M14.8 14.8 20 20",
		key: "ptml3r"
	}]
]);
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
var Undo2 = createLucideIcon("undo-2", [["path", {
	d: "M9 14 4 9l5-5",
	key: "102s5s"
}], ["path", {
	d: "M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11",
	key: "f3b9sd"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ZoomIn = createLucideIcon("zoom-in", [
	["circle", {
		cx: "11",
		cy: "11",
		r: "8",
		key: "4ej97u"
	}],
	["line", {
		x1: "21",
		x2: "16.65",
		y1: "21",
		y2: "16.65",
		key: "13gj7c"
	}],
	["line", {
		x1: "11",
		x2: "11",
		y1: "8",
		y2: "14",
		key: "1vmskp"
	}],
	["line", {
		x1: "8",
		x2: "14",
		y1: "11",
		y2: "11",
		key: "durymu"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ZoomOut = createLucideIcon("zoom-out", [
	["circle", {
		cx: "11",
		cy: "11",
		r: "8",
		key: "4ej97u"
	}],
	["line", {
		x1: "21",
		x2: "16.65",
		y1: "21",
		y2: "16.65",
		key: "13gj7c"
	}],
	["line", {
		x1: "8",
		x2: "14",
		y1: "11",
		y2: "11",
		key: "durymu"
	}]
]);
//#endregion
//#region src/renderer/src/components/capture/EditedAudioPreview.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
/** Uses the existing isolated per-track media protocol; raw audio never enters IPC. */
function EditedAudioPreview({ state, onDuckGain, onError }) {
	const [tracks, setTracks] = (0, import_react.useState)([]);
	const stateRef = (0, import_react.useRef)(state);
	stateRef.current = state;
	const callbacks = (0, import_react.useRef)({
		onDuckGain,
		onError
	});
	callbacks.current = {
		onDuckGain,
		onError
	};
	const mediaRefs = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const syncRef = (0, import_react.useRef)(null);
	const clipId = state?.segment.clipId;
	(0, import_react.useEffect)(() => {
		let active = true;
		setTracks([]);
		if (clipId) switchboardApi.loadClipAudioWaveform(clipId).then((waveform) => {
			if (active) setTracks(waveform.tracks);
		}).catch((cause) => {
			if (active) callbacks.current.onError(`Clip audio preview is unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
		});
		return () => {
			active = false;
		};
	}, [clipId]);
	(0, import_react.useEffect)(() => {
		if (!tracks.length) return;
		let context = null;
		const nodes = /* @__PURE__ */ new Map();
		let frame = null, duckGain = 1, previousAt = performance.now();
		const setup = () => {
			if (context) return;
			context = new AudioContext();
			for (const track of tracks) {
				const audio = mediaRefs.current.get(track.trackIndex);
				if (!audio) continue;
				audio.volume = 1;
				const source = context.createMediaElementSource(audio), gain = context.createGain();
				source.connect(gain);
				gain.connect(context.destination);
				if (track.channel === "microphone") {
					const analyser = context.createAnalyser();
					analyser.fftSize = 1024;
					gain.connect(analyser);
					nodes.set(track.trackIndex, {
						gain,
						analyser,
						buffer: /* @__PURE__ */ new Float32Array(1024)
					});
				} else nodes.set(track.trackIndex, { gain });
			}
		};
		const synchronize = () => {
			const next = stateRef.current;
			if (!next) return;
			if (next.playing) {
				setup();
				if (context?.state === "suspended") context.resume();
			}
			let rms = 0;
			for (const track of tracks) {
				const audio = mediaRefs.current.get(track.trackIndex);
				if (!audio) continue;
				const active = next.playing && !next.frozen;
				const trim = next.segment.audioTrackTrims?.[track.trackIndex];
				const trimmed = trim && (next.sourceMs < trim.startMs || next.sourceMs >= trim.endMs);
				const gain = next.muted || next.segment.muted || next.frozen || trimmed ? 0 : next.volume * next.segment.volume * (next.segment.audioTrackLevels?.[track.trackIndex] ?? 100) / 100 * automationGainAt(next.segment.videoEdits?.audioAutomation?.find((lane) => lane.trackIndex === track.trackIndex), next.sourceMs);
				const node = nodes.get(track.trackIndex);
				if (node && context) node.gain.gain.setTargetAtTime(gain, context.currentTime, .004);
				else audio.volume = Math.max(0, Math.min(1, gain));
				audio.playbackRate = speedAt(next.sourceMs, next.segment.videoEdits);
				audio.preservesPitch = true;
				if (audio.readyState >= 1 && Math.abs(audio.currentTime * 1e3 - next.sourceMs) > (active ? 100 : 10)) audio.currentTime = next.sourceMs / 1e3;
				if (active && audio.paused) audio.play().catch(() => callbacks.current.onError("An audio track could not play. Check the source media and try again."));
				else if (!active) audio.pause();
				if (node?.analyser && node.buffer && active) {
					node.analyser.getFloatTimeDomainData(node.buffer);
					let power = 0;
					for (const sample of node.buffer) power += sample * sample;
					rms = Math.max(rms, Math.sqrt(power / node.buffer.length) / Math.max(.001, next.volume));
				}
			}
			const ducking = next.ducking;
			const desired = ducking?.enabled && rms > .02 ? 1 - ducking.amount + ducking.amount * Math.pow(rms / .02, 1 / 8 - 1) : 1;
			const at = performance.now(), elapsed = Math.max(1, at - previousAt);
			previousAt = at;
			const duration = desired < duckGain ? ducking?.attackMs ?? 80 : ducking?.releaseMs ?? 500;
			duckGain += (desired - duckGain) * (1 - Math.exp(-elapsed / duration));
			callbacks.current.onDuckGain(next.playing ? duckGain : 1);
			if (!next.playing && context?.state === "running") context.suspend();
			if (next.playing && frame === null) frame = requestAnimationFrame(tick);
		};
		const tick = () => {
			frame = null;
			synchronize();
		};
		syncRef.current = synchronize;
		synchronize();
		return () => {
			syncRef.current = null;
			if (frame !== null) cancelAnimationFrame(frame);
			for (const audio of mediaRefs.current.values()) audio.pause();
			for (const node of nodes.values()) {
				node.gain.disconnect();
				node.analyser?.disconnect();
			}
			if (context) context.close();
			callbacks.current.onDuckGain(1);
		};
	}, [tracks]);
	(0, import_react.useEffect)(() => {
		syncRef.current?.();
	}, [state]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: tracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
		ref: (audio) => {
			if (audio) mediaRefs.current.set(track.trackIndex, audio);
			else mediaRefs.current.delete(track.trackIndex);
		},
		src: `switchboard-media://clip-audio/${encodeURIComponent(clipId ?? "")}?track=${track.trackIndex}`,
		preload: "auto",
		onLoadedData: () => syncRef.current?.(),
		onError: () => callbacks.current.onError(`${track.label} audio preview could not be decoded.`)
	}, `${clipId}:${track.trackIndex}`)) });
}
//#endregion
//#region src/renderer/src/components/capture/VideoEditControls.tsx
function PreciseTimeField({ label, valueMs, minimumMs = 0, maximumMs, onChange }) {
	const [draft, setDraft] = (0, import_react.useState)((valueMs / 1e3).toFixed(3));
	(0, import_react.useEffect)(() => setDraft((valueMs / 1e3).toFixed(3)), [valueMs]);
	const commit = () => {
		const value = Number(draft) * 1e3;
		if (!draft.trim() || !Number.isFinite(value)) {
			setDraft((valueMs / 1e3).toFixed(3));
			return;
		}
		const next = Math.min(maximumMs, Math.max(minimumMs, Math.round(value)));
		onChange(next);
		setDraft((next / 1e3).toFixed(3));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "editor-time-field",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			"aria-label": label,
			type: "number",
			min: minimumMs / 1e3,
			max: maximumMs / 1e3,
			step: "0.001",
			value: draft,
			onChange: (event) => setDraft(event.target.value),
			onBlur: commit,
			onKeyDown: (event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					commit();
				}
				if (event.key === "Escape") {
					event.stopPropagation();
					setDraft((valueMs / 1e3).toFixed(3));
				}
			}
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "s" })] })]
	});
}
function PreciseTrimControls({ startMs, endMs, durationMs, fps, onChange, onSeek, getCurrentMs }) {
	const frame = 1e3 / Math.max(1, fps || 30);
	const changeStart = (value) => {
		const next = Math.round(Math.max(0, Math.min(endMs - 100, value)));
		onChange(next, endMs);
		onSeek(next);
	};
	const changeEnd = (value) => {
		const next = Math.round(Math.max(startMs + 100, Math.min(durationMs, value)));
		onChange(startMs, next);
		onSeek(Math.max(startMs, next - frame));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "editor-precise-trim",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "editor-field-pair",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
					label: "Trim start",
					valueMs: startMs,
					maximumMs: endMs - 100,
					onChange: changeStart
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
					label: "Trim end",
					valueMs: endMs,
					minimumMs: startMs + 100,
					maximumMs: durationMs,
					onChange: changeEnd
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "editor-field-pair",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-frame-steps",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						"aria-label": "Trim start one frame earlier",
						onClick: () => changeStart(startMs - frame),
						children: "−1f"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						"aria-label": "Trim start one frame later",
						onClick: () => changeStart(startMs + frame),
						children: "+1f"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-frame-steps",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						"aria-label": "Trim end one frame earlier",
						onClick: () => changeEnd(endMs - frame),
						children: "−1f"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "ghost",
						size: "sm",
						"aria-label": "Trim end one frame later",
						onClick: () => changeEnd(endMs + frame),
						children: "+1f"
					})]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "editor-field-pair",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => changeStart(getCurrentMs()),
					children: "Set in at playhead"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => changeEnd(getCurrentMs()),
					children: "Set out at playhead"
				})]
			})
		]
	});
}
function VideoEditControls({ edits = {}, startMs, endMs, durationMs, onChange, showSpeed = true }) {
	const text = edits.text;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "editor-video-tools",
		children: [
			showSpeed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: ["Playback speed ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [(editedDurationMs(startMs, endMs, edits) / 1e3).toFixed(2), " s output"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
				value: String(edits.speed ?? 1),
				onValueChange: (value) => onChange({
					...edits,
					speed: Number(value)
				}, "speed"),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
					"aria-label": "Playback speed",
					className: "no-drag",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
					.25,
					.5,
					.75,
					1,
					1.25,
					1.5,
					2,
					3,
					4
				].map((speed) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
					value: String(speed),
					children: [
						speed,
						"×",
						speed === 1 ? " · Normal" : speed < 1 ? " · Slow motion" : ""
					]
				}, speed)) })]
			})] }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "editor-picture",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "Picture" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: ["Adjust picture ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: () => onChange({
							...edits,
							brightness: 0,
							contrast: 1,
							saturation: 1,
							flipHorizontal: false
						}, "reset-picture"),
						children: "Reset"
					})] }),
					[
						"brightness",
						"contrast",
						"saturation"
					].map((key) => {
						const value = edits[key] ?? (key === "brightness" ? 0 : 1);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "editor-adjustment",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [key.charAt(0).toUpperCase() + key.slice(1), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [Math.round(value * 100), key === "brightness" ? "" : "%"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
								"aria-label": key.charAt(0).toUpperCase() + key.slice(1),
								min: key === "brightness" ? -30 : key === "contrast" ? 50 : 0,
								max: key === "brightness" ? 30 : key === "contrast" ? 150 : 200,
								step: 1,
								value: [Math.round(value * 100)],
								onValueChange: ([next]) => {
									if (next !== void 0) onChange({
										...edits,
										[key]: next / 100
									}, key);
								}
							})]
						}, key);
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "editor-switch",
						children: ["Flip horizontally", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
							"aria-label": "Flip horizontally",
							checked: edits.flipHorizontal ?? false,
							onCheckedChange: (flipHorizontal) => onChange({
								...edits,
								flipHorizontal
							}, "flip")
						})]
					})
				] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", { children: ["Text ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				onClick: () => onChange({
					...edits,
					text: text ? void 0 : {
						content: "Your title",
						startMs,
						endMs,
						position: "bottom",
						size: "medium"
					}
				}, "text-toggle"),
				children: text ? "Remove" : "Add title"
			})] }), text ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
					className: "editor-text-content",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Title" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						"aria-label": "Title text",
						maxLength: 160,
						rows: 2,
						value: text.content,
						onChange: (event) => onChange({
							...edits,
							text: {
								...text,
								content: event.target.value
							}
						}, "text-content")
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Position", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: text.position,
						onValueChange: (value) => onChange({
							...edits,
							text: {
								...text,
								position: value
							}
						}, "text-position"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							"aria-label": "Text position",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
							"top",
							"center",
							"bottom"
						].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value,
							children: value.charAt(0).toUpperCase() + value.slice(1)
						}, value)) })]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Size", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: text.size,
						onValueChange: (value) => onChange({
							...edits,
							text: {
								...text,
								size: value
							}
						}, "text-size"),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							"aria-label": "Text size",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
							"small",
							"medium",
							"large"
						].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value,
							children: value.charAt(0).toUpperCase() + value.slice(1)
						}, value)) })]
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: "Text in",
						valueMs: text.startMs,
						maximumMs: text.endMs - 1,
						onChange: (startMs) => onChange({
							...edits,
							text: {
								...text,
								startMs
							}
						}, "text-in")
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: "Text out",
						valueMs: text.endMs,
						minimumMs: text.startMs + 1,
						maximumMs: durationMs,
						onChange: (endMs) => onChange({
							...edits,
							text: {
								...text,
								endMs
							}
						}, "text-out")
					})]
				})
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Add a timed title to this clip." })] })
		]
	});
}
//#endregion
//#region src/renderer/src/components/capture/AdvancedVideoControls.tsx
function NumberControl({ label, value, min = 0, max = 100, step = 1, disabled, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "advanced-number",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			"aria-label": label,
			disabled,
			type: "number",
			min,
			max,
			step,
			value: Number(value.toFixed(3)),
			onChange: (event) => {
				if (!event.target.value.trim()) return;
				const next = Number(event.target.value);
				if (Number.isFinite(next)) onChange(Math.max(min, Math.min(max, next)));
			}
		})]
	});
}
function AdvancedVideoControls({ edits = {}, clip, startMs, endMs, currentMs, onChange, onSeek, tool, onToolChange, selectedOverlayId, onSelectOverlay, audioTrackTrims, onTrackTrim }) {
	const now = Math.max(startMs, Math.min(endMs - 1, Math.round(currentMs)));
	const frame = framingAt(now, edits);
	const keys = edits.framing?.keyframes ?? [];
	const activeKey = keys.find((key) => Math.abs(key.timeMs - now) < 25);
	const framingFull = keys.length >= 128 && !activeKey;
	const changeFrame = (patch) => {
		if (framingFull) return;
		const next = {
			...frame,
			timeMs: activeKey?.timeMs ?? now,
			...patch
		};
		const points = keys.filter((key) => key.timeMs !== (activeKey?.timeMs ?? now));
		if (!points.length && next.timeMs > startMs) points.push({
			...framingAt(startMs, edits),
			timeMs: startMs
		});
		onChange({
			...edits,
			framing: {
				mode: edits.framing?.mode ?? "fill",
				background: edits.framing?.background ?? "black",
				keyframes: [...points.filter((key) => key.timeMs !== next.timeMs), next].sort((a, b) => a.timeMs - b.timeMs)
			}
		}, `frame:${next.timeMs}`);
	};
	const overlay = edits.overlays?.find((item) => item.id === selectedOverlayId);
	const changeOverlay = (patch) => {
		if (!overlay) return;
		const next = {
			...overlay,
			...patch
		};
		next.x = Math.min(next.x, 1 - next.width);
		next.y = Math.min(next.y, 1 - next.height);
		onChange({
			...edits,
			overlays: edits.overlays?.map((item) => item.id === overlay.id ? next : item)
		}, `overlay:${overlay.id}`);
	};
	const [trackIndex, setTrackIndex] = (0, import_react.useState)(0);
	const [waveform, setWaveform] = (0, import_react.useState)(null);
	const [waveformError, setWaveformError] = (0, import_react.useState)(null);
	(0, import_react.useEffect)(() => {
		if (tool !== "audio") return;
		let active = true;
		setWaveform(null);
		setWaveformError(null);
		switchboardApi.loadClipAudioWaveform(clip.id).then((value) => {
			if (active) setWaveform(value);
		}).catch(() => {
			if (active) setWaveformError("Source audio could not be read.");
		});
		return () => {
			active = false;
		};
	}, [clip.id, tool]);
	const tracks = waveform?.tracks ?? (clip.audioChannels ?? []).map((channel, trackIndex) => ({
		trackIndex,
		channel,
		label: channel,
		samples: []
	}));
	const audioTrack = tracks.find((track) => track.trackIndex === trackIndex) ?? tracks[0];
	const activeTrack = audioTrack?.trackIndex ?? 0;
	const trackTrim = audioTrackTrims?.[activeTrack] ?? {
		startMs: 0,
		endMs: clip.durationMs
	};
	const automation = edits.audioAutomation?.find((track) => track.trackIndex === activeTrack) ?? {
		trackIndex: activeTrack,
		points: [],
		mutes: []
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "advanced-video-controls",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
				value: tool,
				onValueChange: (value) => onToolChange(value),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
					"aria-label": "Edit tool",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "framing",
						children: "Framing"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "timing",
						children: "Speed & freezes"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "overlays",
						children: "Text & privacy"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "audio",
						children: "Audio automation"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "picture",
						children: "Picture & title"
					})
				] })]
			}),
			tool === "framing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Scale", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: edits.framing?.mode ?? "fill",
						onValueChange: (mode) => onChange({
							...edits,
							framing: {
								keyframes: keys,
								background: edits.framing?.background ?? "black",
								mode
							}
						}),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							"aria-label": "Frame scale",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "fill",
							children: "Fill frame"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "fit",
							children: "Fit whole frame"
						})] })]
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Background", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: edits.framing?.background ?? "black",
						onValueChange: (background) => onChange({
							...edits,
							framing: {
								keyframes: keys,
								mode: edits.framing?.mode ?? "fill",
								background
							}
						}),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							"aria-label": "Frame background",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "black",
							children: "Black"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "blur",
							children: "Blurred video"
						})] })]
					})] })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Drag the preview to frame the action. Changes add a point at the playhead." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
						label: "Horizontal position",
						value: frame.x * 100,
						onChange: (x) => changeFrame({ x: x / 100 })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
						label: "Vertical position",
						value: frame.y * 100,
						onChange: (y) => changeFrame({ y: y / 100 })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
					label: "Zoom %",
					value: frame.zoom * 100,
					min: 100,
					max: 800,
					step: 5,
					onChange: (zoom) => changeFrame({ zoom: zoom / 100 })
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Move to next point", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: frame.transition,
					onValueChange: (transition) => changeFrame({ transition }),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
						"aria-label": "Framing interpolation",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "smooth",
							children: "Smooth"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "linear",
							children: "Linear"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: "hold",
							children: "Hold, then cut"
						})
					] })]
				})] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "secondary",
					disabled: framingFull,
					onClick: () => changeFrame({}),
					children: "Add framing point"
				}),
				framingFull ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "128 framing points reached. Select a point to adjust it or remove one." }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyframeLane, {
					label: "Framing points",
					points: keys.filter((key) => key.timeMs >= startMs && key.timeMs < endMs).map((key) => ({
						timeMs: key.timeMs,
						label: `${Math.round(key.zoom * 100)}%`
					})),
					currentMs: now,
					startMs,
					endMs,
					onSeek,
					onRemove: (timeMs) => onChange({
						...edits,
						framing: {
							...edits.framing,
							keyframes: keys.filter((key) => key.timeMs !== timeMs)
						}
					})
				}),
				activeKey ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
					label: "Framing point time",
					valueMs: activeKey.timeMs,
					minimumMs: startMs,
					maximumMs: endMs - 1,
					onChange: (timeMs) => {
						changeFrame({ timeMs });
						onSeek(timeMs);
					}
				}) : null
			] }) : null,
			tool === "timing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Speed points use source time. Linear ramps ease into the next speed; holds switch at the next point." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
					label: "Speed at playhead",
					disabled: (edits.speedPoints?.length ?? 0) >= 64 && !edits.speedPoints?.some((point) => point.timeMs === now),
					value: speedAt(now, edits),
					min: .25,
					max: 4,
					step: .05,
					onChange: (speed) => {
						const points = [...edits.speedPoints ?? []];
						if (!points.length && now > startMs) points.push({
							timeMs: startMs,
							speed: edits.speed ?? 1,
							transition: "linear"
						});
						onChange({
							...edits,
							speedPoints: [...points.filter((point) => point.timeMs !== now), {
								timeMs: now,
								speed,
								transition: "linear"
							}].sort((a, b) => a.timeMs - b.timeMs)
						}, `speed-point:${now}`);
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "secondary",
					disabled: (edits.speedPoints?.length ?? 0) >= 64 && !edits.speedPoints?.some((point) => point.timeMs === now),
					onClick: () => onChange({
						...edits,
						speedPoints: [...(edits.speedPoints ?? []).filter((point) => point.timeMs !== now), {
							timeMs: now,
							speed: speedAt(now, edits),
							transition: "linear"
						}].sort((a, b) => a.timeMs - b.timeMs)
					}),
					children: "Add speed point"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyframeLane, {
					label: "Speed points",
					points: (edits.speedPoints ?? []).filter((point) => point.timeMs >= startMs && point.timeMs < endMs).map((point) => ({
						timeMs: point.timeMs,
						label: `${point.speed}×`
					})),
					currentMs: now,
					startMs,
					endMs,
					onSeek,
					onRemove: (timeMs) => onChange({
						...edits,
						speedPoints: edits.speedPoints?.filter((point) => point.timeMs !== timeMs)
					})
				}),
				(edits.speedPoints ?? []).filter((point) => Math.abs(point.timeMs - now) < 25).map((point) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Speed transition", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: point.transition,
					onValueChange: (transition) => onChange({
						...edits,
						speedPoints: edits.speedPoints?.map((item) => item === point ? {
							...point,
							transition
						} : item)
					}),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
						"aria-label": "Speed transition",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "linear",
						children: "Ramp to next speed"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: "hold",
						children: "Hold speed"
					})] })]
				})] }, point.timeMs)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "secondary",
					disabled: (edits.freezes?.length ?? 0) >= 32 && !edits.freezes?.some((hold) => hold.timeMs === now),
					onClick: () => onChange({
						...edits,
						freezes: [...(edits.freezes ?? []).filter((hold) => hold.timeMs !== now), {
							timeMs: now,
							durationMs: 1e3
						}].sort((a, b) => a.timeMs - b.timeMs)
					}),
					children: "Freeze frame at playhead"
				}),
				(edits.freezes ?? []).filter((hold) => hold.timeMs >= startMs && hold.timeMs < endMs).map((hold) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "advanced-point-row",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							onClick: () => onSeek(hold.timeMs),
							"aria-label": `Seek freeze at ${(hold.timeMs / 1e3).toFixed(2)} seconds`,
							children: [(hold.timeMs / 1e3).toFixed(2), " s"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
							label: `Freeze duration at ${(hold.timeMs / 1e3).toFixed(2)}`,
							valueMs: hold.durationMs,
							minimumMs: 100,
							maximumMs: 3e4,
							onChange: (durationMs) => onChange({
								...edits,
								freezes: edits.freezes?.map((item) => item === hold ? {
									...hold,
									durationMs
								} : item)
							}, `freeze:${hold.timeMs}`)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							"aria-label": `Remove freeze at ${hold.timeMs}`,
							onClick: () => onChange({
								...edits,
								freezes: edits.freezes?.filter((item) => item !== hold)
							}),
							children: "Remove"
						})
					]
				}, hold.timeMs)),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Clip audio pauses during a freeze. Added music continues." })
			] }) : null,
			tool === "overlays" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "advanced-add-tools",
					children: [
						"text",
						"blur",
						"pixelate"
					].map((kind) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						size: "sm",
						variant: "secondary",
						disabled: (edits.overlays?.length ?? 0) >= 32,
						onClick: () => {
							const item = {
								id: crypto.randomUUID(),
								kind,
								startMs: now,
								endMs,
								x: .1,
								y: kind === "text" ? .75 : .1,
								width: kind === "text" ? .8 : .3,
								height: .18,
								...kind === "text" ? {
									content: "Your caption",
									size: "medium"
								} : {}
							};
							onChange({
								...edits,
								overlays: [...edits.overlays ?? [], item]
							});
							onSelectOverlay(item.id);
						},
						children: ["Add ", kind === "text" ? "text" : kind === "blur" ? "blur" : "pixelation"]
					}, kind))
				}),
				(edits.overlays ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					className: "advanced-overlay-item",
					"aria-pressed": item.id === selectedOverlayId,
					onClick: () => {
						onSelectOverlay(item.id);
						onSeek(Math.max(startMs, item.startMs));
					},
					children: [item.kind === "text" ? item.content || "Empty text" : item.kind === "blur" ? "Blur region" : "Pixelated region", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
						(item.startMs / 1e3).toFixed(2),
						"–",
						(item.endMs / 1e3).toFixed(2),
						" s"
					] })]
				}, item.id)),
				overlay ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
					overlay.kind === "text" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { children: ["Caption", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", {
						"aria-label": "Overlay text",
						rows: 3,
						maxLength: 500,
						value: overlay.content ?? "",
						onChange: (event) => changeOverlay({ content: event.target.value })
					})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: overlay.size ?? "medium",
						onValueChange: (size) => changeOverlay({ size }),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
							"aria-label": "Overlay text size",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: [
							"small",
							"medium",
							"large"
						].map((size) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
							value: size,
							children: size
						}, size)) })]
					})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Drag the selected region. Use its corner handle to resize." }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "editor-field-pair",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
							label: "Overlay in",
							valueMs: overlay.startMs,
							maximumMs: overlay.endMs - 1,
							onChange: (startMs) => changeOverlay({ startMs })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
							label: "Overlay out",
							valueMs: overlay.endMs,
							minimumMs: overlay.startMs + 1,
							maximumMs: clip.durationMs,
							onChange: (endMs) => changeOverlay({ endMs })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "editor-field-pair",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
							label: "Overlay X %",
							value: overlay.x * 100,
							max: (1 - overlay.width) * 100,
							onChange: (x) => changeOverlay({ x: x / 100 })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
							label: "Overlay Y %",
							value: overlay.y * 100,
							max: (1 - overlay.height) * 100,
							onChange: (y) => changeOverlay({ y: y / 100 })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "editor-field-pair",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
							label: "Overlay width %",
							value: overlay.width * 100,
							min: 2,
							max: 100,
							onChange: (width) => changeOverlay({ width: width / 100 })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
							label: "Overlay height %",
							value: overlay.height * 100,
							min: 2,
							max: 100,
							onChange: (height) => changeOverlay({ height: height / 100 })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						size: "sm",
						variant: "ghost",
						onClick: () => {
							onChange({
								...edits,
								overlays: edits.overlays?.filter((item) => item.id !== overlay.id)
							});
							onSelectOverlay(null);
						},
						children: "Remove overlay"
					})
				] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Add text or a privacy region, then select it to adjust its timing and position." })
			] }) : null,
			tool === "audio" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: tracks.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
					value: String(activeTrack),
					onValueChange: (value) => setTrackIndex(Number(value)),
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
						"aria-label": "Automation audio track",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: tracks.map((track) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
						value: String(track.trackIndex),
						children: track.label
					}, track.trackIndex)) })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-music-waveform",
					"aria-label": `${audioTrack?.label} source waveform`,
					children: [
						audioTrack?.samples.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
							viewBox: "0 0 240 48",
							preserveAspectRatio: "none",
							"aria-hidden": "true",
							children: audioTrack.samples.map((sample, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
								x1: index / audioTrack.samples.length * 240,
								x2: index / audioTrack.samples.length * 240,
								y1: 24 - sample * 22,
								y2: 24 + sample * 22
							}, index))
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: waveformError ?? "Reading waveform…" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: {
							left: 0,
							width: `${trackTrim.startMs / clip.durationMs * 100}%`
						} }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: {
							right: 0,
							width: `${(1 - trackTrim.endMs / clip.durationMs) * 100}%`
						} })
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: "Audio in",
						valueMs: trackTrim.startMs,
						maximumMs: trackTrim.endMs - 1,
						onChange: (startMs) => onTrackTrim(activeTrack, {
							...trackTrim,
							startMs
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: "Audio out",
						valueMs: trackTrim.endMs,
						minimumMs: trackTrim.startMs + 1,
						maximumMs: clip.durationMs,
						onChange: (endMs) => onTrackTrim(activeTrack, {
							...trackTrim,
							endMs
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					size: "sm",
					variant: "ghost",
					disabled: !audioTrackTrims?.[activeTrack],
					onClick: () => onTrackTrim(activeTrack, null),
					children: "Reset audio trim"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioAutomationControls, {
					automation,
					currentMs: now,
					startMs,
					endMs,
					onSeek,
					onChange: (value, key) => onChange({
						...edits,
						audioAutomation: [...(edits.audioAutomation ?? []).filter((track) => track.trackIndex !== activeTrack), {
							...value,
							trackIndex: activeTrack
						}]
					}, key ? `automation:${activeTrack}:${key}` : void 0)
				})
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: waveformError ?? (waveform ? "This clip has no audio tracks." : "Reading source audio…") }) }) : null,
			tool === "picture" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VideoEditControls, {
				edits,
				showSpeed: false,
				startMs,
				endMs,
				durationMs: clip.durationMs,
				onChange
			}) : null
		]
	});
}
function AudioAutomationControls({ automation, currentMs, startMs, endMs, onChange, onSeek }) {
	const now = Math.round(Math.max(startMs, Math.min(endMs - 1, currentMs)));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "advanced-audio-tools",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "sm",
				variant: "secondary",
				disabled: automation.points.length >= 128 && !automation.points.some((point) => point.timeMs === now),
				onClick: () => onChange({
					...automation,
					points: [...automation.points.filter((point) => point.timeMs !== now), {
						timeMs: now,
						gain: 1
					}].sort((a, b) => a.timeMs - b.timeMs)
				}),
				children: "Add volume point"
			}),
			automation.points.map((point) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "advanced-point-row",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						onClick: () => onSeek(point.timeMs),
						children: [(point.timeMs / 1e3).toFixed(2), " s"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
						label: `Volume at ${(point.timeMs / 1e3).toFixed(2)} seconds`,
						value: point.gain * 100,
						onChange: (gain) => onChange({
							...automation,
							points: automation.points.map((item) => item === point ? {
								...point,
								gain: gain / 100
							} : item)
						}, `gain:${point.timeMs}`)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						"aria-label": `Remove volume point at ${point.timeMs}`,
						onClick: () => onChange({
							...automation,
							points: automation.points.filter((item) => item !== point)
						}),
						children: "Remove"
					})
				]
			}, point.timeMs)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "sm",
				variant: "secondary",
				disabled: automation.mutes.length >= 64,
				onClick: () => onChange({
					...automation,
					mutes: [...automation.mutes, {
						startMs: now,
						endMs: Math.min(endMs, now + 1e3)
					}]
				}),
				children: "Mute interval at playhead"
			}),
			automation.mutes.map((range, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "advanced-mute-range",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "editor-field-pair",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: `Mute ${index + 1} in`,
						valueMs: range.startMs,
						maximumMs: range.endMs - 1,
						onChange: (startMs) => onChange({
							...automation,
							mutes: automation.mutes.map((item, i) => i === index ? {
								...range,
								startMs
							} : item)
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
						label: `Mute ${index + 1} out`,
						valueMs: range.endMs,
						minimumMs: range.startMs + 1,
						maximumMs: endMs,
						onChange: (endMs) => onChange({
							...automation,
							mutes: automation.mutes.map((item, i) => i === index ? {
								...range,
								endMs
							} : item)
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					onClick: () => onChange({
						...automation,
						mutes: automation.mutes.filter((_item, i) => i !== index)
					}),
					children: "Remove mute interval"
				})]
			}, index))
		]
	});
}
function KeyframeLane({ label, points, currentMs, startMs, endMs, onSeek, onRemove }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "advanced-keyframe-lane",
		"aria-label": label,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "advanced-keyframe-ruler",
			children: points.map((point) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				style: { left: `${(point.timeMs - startMs) / (endMs - startMs) * 100}%` },
				"aria-pressed": Math.abs(currentMs - point.timeMs) < 25,
				"aria-label": `${label}: ${point.label} at ${(point.timeMs / 1e3).toFixed(2)} seconds`,
				title: `${point.label} · ${(point.timeMs / 1e3).toFixed(2)} s`,
				onClick: () => onSeek(point.timeMs),
				onKeyDown: (event) => {
					if (event.key === "Delete" || event.key === "Backspace") {
						event.preventDefault();
						onRemove(point.timeMs);
					}
				}
			}, point.timeMs))
		}), points.map((point) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "advanced-point-row",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				onClick: () => onSeek(point.timeMs),
				children: [
					(point.timeMs / 1e3).toFixed(2),
					" s · ",
					point.label
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				"aria-label": `Remove ${label.toLowerCase()} at ${point.timeMs}`,
				onClick: () => onRemove(point.timeMs),
				children: "Remove"
			})]
		}, point.timeMs))]
	});
}
//#endregion
//#region src/renderer/src/components/capture/EditedVideoCanvas.tsx
function EditedVideoCanvas({ videoRef, edits, canvasSize, sourceMs, startMs, tool, selectedOverlayId, onChange, onPause }) {
	const canvasRef = (0, import_react.useRef)(null);
	const frameRef = (0, import_react.useRef)(null);
	const dragRef = (0, import_react.useRef)(null);
	const sourceRef = (0, import_react.useRef)(sourceMs);
	sourceRef.current = sourceMs;
	const paintRef = (0, import_react.useRef)(null);
	const overlay = edits?.overlays?.find((item) => item.id === selectedOverlayId && sourceMs >= item.startMs && sourceMs < item.endMs);
	(0, import_react.useEffect)(() => {
		const video = videoRef.current, canvas = canvasRef.current, frame = frameRef.current;
		if (!video || !canvas || !frame) return;
		const context = canvas.getContext("2d", { alpha: false });
		if (!context) return;
		const scratch = document.createElement("canvas");
		const scratchContext = scratch.getContext("2d");
		let callback = null;
		const paint = () => {
			if (video.readyState < 2 || !video.videoWidth) return;
			const ratio = canvasRatios[canvasSize] ?? video.videoWidth / video.videoHeight;
			const area = frame.parentElement.getBoundingClientRect();
			const width = Math.min(area.width, area.height * ratio), height = width / ratio;
			frame.style.width = `${width}px`;
			frame.style.height = `${height}px`;
			const w = Math.max(2, Math.round(width)), h = Math.max(2, Math.round(height));
			if (canvas.width !== w) canvas.width = w;
			if (canvas.height !== h) canvas.height = h;
			context.filter = "none";
			context.fillStyle = "#000";
			context.fillRect(0, 0, w, h);
			const time = video.paused ? sourceRef.current : video.currentTime * 1e3;
			const key = framingAt(time, edits);
			const geometry = framingGeometry(video.videoWidth, video.videoHeight, w, h, key, edits?.framing?.mode ?? (canvasSize === "original" ? "fit" : "fill"));
			const filter = `brightness(${1 + (edits?.brightness ?? 0)}) contrast(${edits?.contrast ?? 1}) saturate(${edits?.saturation ?? 1})`;
			if (edits?.framing?.background === "blur") {
				const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
				context.save();
				context.filter = `${filter} blur(${Math.max(3, h * .02)}px)`;
				context.translate(-geometry.cropX * geometry.zoom, -geometry.cropY * geometry.zoom);
				context.scale(geometry.zoom, geometry.zoom);
				if (edits?.flipHorizontal) {
					context.translate(w, 0);
					context.scale(-1, 1);
				}
				context.drawImage(video, (w - video.videoWidth * scale) / 2, (h - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale);
				context.restore();
			}
			context.save();
			context.filter = filter;
			if (edits?.flipHorizontal) {
				context.translate(geometry.x + geometry.width, geometry.y);
				context.scale(-1, 1);
				context.drawImage(video, 0, 0, geometry.width, geometry.height);
			} else context.drawImage(video, geometry.x, geometry.y, geometry.width, geometry.height);
			context.restore();
			const overlays = [...edits?.overlays ?? []];
			if (edits?.text?.content) overlays.unshift(titleOverlay(edits.text, w, h));
			for (const item of overlays) {
				if (time < item.startMs || time >= item.endMs) continue;
				const x = item.x * w, y = item.y * h, ow = item.width * w, oh = item.height * h;
				if (item.kind === "text") {
					drawText(context, item, w, h);
					continue;
				}
				if (!scratchContext) continue;
				const sw = item.kind === "pixelate" ? Math.max(2, Math.round(ow / Math.max(6, h / 60))) : Math.ceil(ow);
				const sh = item.kind === "pixelate" ? Math.max(2, Math.round(oh / Math.max(6, h / 60))) : Math.ceil(oh);
				if (scratch.width !== sw) scratch.width = sw;
				if (scratch.height !== sh) scratch.height = sh;
				scratchContext.clearRect(0, 0, sw, sh);
				scratchContext.filter = item.kind === "blur" ? `blur(${Math.max(3, h * .02)}px)` : "none";
				scratchContext.drawImage(canvas, x, y, ow, oh, 0, 0, sw, sh);
				context.save();
				context.imageSmoothingEnabled = item.kind !== "pixelate";
				context.drawImage(scratch, x, y, ow, oh);
				context.restore();
			}
		};
		const tick = () => {
			callback = null;
			paint();
			if (!video.paused) callback = video.requestVideoFrameCallback(tick);
		};
		const start = () => {
			if (callback === null) callback = video.requestVideoFrameCallback(tick);
		};
		const stop = () => {
			if (callback !== null) video.cancelVideoFrameCallback(callback);
			callback = null;
			paint();
		};
		const observer = new ResizeObserver(paint);
		observer.observe(frame.parentElement);
		for (const event of [
			"seeked",
			"loadeddata",
			"loadedmetadata"
		]) video.addEventListener(event, paint);
		video.addEventListener("play", start);
		video.addEventListener("pause", stop);
		paintRef.current = paint;
		paint();
		if (!video.paused) start();
		return () => {
			paintRef.current = null;
			if (callback !== null) video.cancelVideoFrameCallback(callback);
			observer.disconnect();
			for (const event of [
				"seeked",
				"loadeddata",
				"loadedmetadata"
			]) video.removeEventListener(event, paint);
			video.removeEventListener("play", start);
			video.removeEventListener("pause", stop);
		};
	}, [
		videoRef,
		edits,
		canvasSize
	]);
	(0, import_react.useEffect)(() => {
		if (videoRef.current?.paused) paintRef.current?.();
	}, [sourceMs, videoRef]);
	const startDrag = (event) => {
		if (event.button !== 0 || tool !== "framing" && !(tool === "overlays" && overlay)) return;
		event.preventDefault();
		onPause();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			edits: edits ?? {},
			sourceMs: Math.max(startMs, Math.round(sourceMs)),
			resize: event.target.dataset.resize === "true"
		};
	};
	const move = (event) => {
		const drag = dragRef.current, frame = frameRef.current, video = videoRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !frame || !video) return;
		const bounds = frame.getBoundingClientRect();
		if (tool === "overlays" && selectedOverlayId) {
			const item = drag.edits.overlays?.find((candidate) => candidate.id === selectedOverlayId);
			if (!item) return;
			const dx = (event.clientX - drag.x) / bounds.width, dy = (event.clientY - drag.y) / bounds.height;
			const patch = drag.resize ? {
				width: clamp$2(item.width + dx, .02, 1 - item.x),
				height: clamp$2(item.height + dy, .02, 1 - item.y)
			} : {
				x: clamp$2(item.x + dx, 0, 1 - item.width),
				y: clamp$2(item.y + dy, 0, 1 - item.height)
			};
			onChange({
				...drag.edits,
				overlays: drag.edits.overlays?.map((candidate) => candidate.id === item.id ? {
					...item,
					...patch
				} : candidate)
			}, `overlay:${item.id}`);
			return;
		}
		const key = framingAt(drag.sourceMs, drag.edits);
		const geometry = framingGeometry(video.videoWidth, video.videoHeight, bounds.width, bounds.height, key, drag.edits.framing?.mode ?? "fill");
		const next = {
			...key,
			timeMs: drag.sourceMs,
			x: clamp$2(key.x - (event.clientX - drag.x) / Math.max(1, geometry.width - bounds.width), 0, 1),
			y: clamp$2(key.y - (event.clientY - drag.y) / Math.max(1, geometry.height - bounds.height), 0, 1)
		};
		const points = [...drag.edits.framing?.keyframes ?? []].filter((point) => point.timeMs !== next.timeMs);
		if (points.length >= 128) return;
		if (!points.length && next.timeMs > startMs) points.push({
			...framingAt(startMs, drag.edits),
			timeMs: startMs
		});
		onChange({
			...drag.edits,
			framing: {
				mode: drag.edits.framing?.mode ?? "fill",
				background: drag.edits.framing?.background ?? "black",
				keyframes: [...points, next].sort((a, b) => a.timeMs - b.timeMs)
			}
		}, `frame:${next.timeMs}`);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "edited-video-stage",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: frameRef,
			className: "edited-video-frame",
			"data-tool": tool,
			onPointerDown: startDrag,
			onPointerMove: move,
			onPointerUp: (event) => {
				dragRef.current = null;
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			},
			onPointerCancel: () => {
				dragRef.current = null;
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
					ref: canvasRef,
					"aria-label": "Edited video preview"
				}),
				tool === "overlays" && overlay ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "edited-overlay-selection",
					style: {
						left: `${overlay.x * 100}%`,
						top: `${overlay.y * 100}%`,
						width: `${overlay.width * 100}%`,
						height: `${overlay.height * 100}%`
					},
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { "data-resize": "true" })
				}) : null,
				tool === "framing" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "edited-framing-outline",
					"aria-hidden": "true"
				}) : null
			]
		})
	});
}
function drawText(context, item, width, height) {
	const lines = (item.content ?? "").split("\n"), longest = Math.max(1, ...lines.map((line) => [...line].length));
	const size = Math.max(1, Math.min(height * videoTextSize[item.size ?? "medium"], item.width * width / (longest * .65), item.height * height / (Math.max(1, lines.length) * 1.2)));
	context.save();
	context.font = `bold ${size}px Arial`;
	context.textAlign = "center";
	context.textBaseline = "top";
	const x = (item.x + item.width / 2) * width, y = item.y * height;
	const textWidth = Math.max(0, ...lines.map((line) => context.measureText(line).width));
	context.fillStyle = "rgba(0,0,0,0.55)";
	context.fillRect(x - textWidth / 2 - 6, y - 4, textWidth + 12, lines.length * size * 1.2 + 8);
	context.fillStyle = "#fff";
	lines.forEach((line, index) => context.fillText(line, x, y + index * size * 1.2));
	context.restore();
}
function clamp$2(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
//#endregion
//#region src/renderer/src/components/capture/AddMontageClipsDialog.tsx
function AddMontageClipsDialog({ open, clips, onOpenChange, onAdd }) {
	const [query, setQuery] = (0, import_react.useState)("");
	const [selectedIds, setSelectedIds] = (0, import_react.useState)([]);
	(0, import_react.useEffect)(() => {
		if (!open) return;
		setQuery("");
		setSelectedIds([]);
	}, [open]);
	const visibleClips = (0, import_react.useMemo)(() => {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) return clips;
		return clips.filter((clip) => `${clip.name} ${clip.game ?? ""}`.toLocaleLowerCase().includes(normalized));
	}, [clips, query]);
	const selected = (0, import_react.useMemo)(() => new Set(selectedIds), [selectedIds]);
	const confirm = () => {
		const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
		const next = selectedIds.map((id) => clipsById.get(id)).filter((clip) => Boolean(clip && clip.durationMs >= 100));
		if (next.length === 0) return;
		onAdd(next);
		onOpenChange(false);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open,
		onOpenChange,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-[620px] overflow-hidden p-0 no-drag",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, {
					className: "px-5 pb-3 pt-5 pr-12",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Add clips" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: "Add one or several library clips after the selected segment. A source clip can be reused as many times as needed." })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "border-y border-border",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "flex h-11 items-center gap-2 border-b border-border px-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
							className: "size-3.5 text-muted-foreground",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							value: query,
							onChange: (event) => setQuery(event.currentTarget.value),
							className: "h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0",
							placeholder: "Search clips",
							"aria-label": "Search clips"
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
						className: "h-[360px]",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "divide-y divide-border/70",
							children: [visibleClips.map((clip) => {
								const unavailable = clip.durationMs < 100;
								const checked = selected.has(clip.id);
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "grid min-h-[58px] cursor-pointer grid-cols-[16px_56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
											checked,
											disabled: unavailable,
											onCheckedChange: (next) => setSelectedIds((current) => next ? current.includes(clip.id) ? current : [...current, clip.id] : current.filter((id) => id !== clip.id)),
											"aria-label": `Add ${clip.name}`
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "block h-9 w-14 overflow-hidden rounded-[3px] border border-border bg-surface-2 bg-cover bg-center",
											style: { backgroundImage: `url("switchboard-media://thumbnail/${encodeURIComponent(clip.id)}")` },
											"aria-hidden": "true"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
												className: "block truncate text-[11px] font-semibold text-foreground",
												children: clip.name
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
												className: "mt-0.5 block truncate text-[9.5px] text-muted-foreground",
												children: [
													clip.game ?? "Unknown game",
													" · ",
													formatVideoQuality(clip.width, clip.height, clip.fps)
												]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "font-mono text-[9.5px] tabular-nums text-muted-foreground",
											children: unavailable ? "Unavailable" : formatDuration(clip.durationMs / 1e3)
										})
									]
								}, clip.id);
							}), visibleClips.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "grid h-48 place-items-center text-center text-[10px] text-muted-foreground",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Film, { className: "mx-auto mb-2 size-5 opacity-55" }), "No matching clips"] })
							}) : null]
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex flex-row items-center justify-between px-5 py-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "text-[10px] text-muted-foreground",
						children: [selectedIds.length, " selected"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "secondary",
							size: "sm",
							onClick: () => onOpenChange(false),
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "primary",
							size: "sm",
							disabled: selectedIds.length === 0,
							onClick: confirm,
							children: "Add to montage"
						})]
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/renderer/src/components/capture/TimelineContextMenu.tsx
/** The owning timeline freezes the clicked source position before this menu opens. */
function TimelineContextMenu({ children, label, actions, onContextMenu }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuTrigger, {
		asChild: true,
		onContextMenu,
		children
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuContent, {
		"aria-label": label,
		collisionPadding: 8,
		className: "min-w-52 max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto",
		onKeyDown: (event) => event.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "max-w-64 truncate px-2 py-1.5 text-[10px] text-muted-foreground",
				title: label,
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuSeparator, {}),
			actions.map((action, index) => action === "separator" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuSeparator, {}, index) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuItem, {
				disabled: action.disabled,
				onSelect: action.onSelect,
				className: action.danger ? "text-destructive focus:text-destructive" : void 0,
				children: action.label
			}, action.label))
		]
	})] });
}
//#endregion
//#region src/renderer/src/components/capture/MontageV2Timeline.tsx
function MontageV2Timeline({ project, clips, selectedSegmentId, currentMs, zoom, waveform, canUndo, canRedo, musicPending, onEditMusic, onZoomChange, onProjectChange, onSelectSegment, onSeek, onAddClips, onAddMusic, onDuplicate, onSplit, onRemove, onUndo, onRedo }) {
	const viewportRef = (0, import_react.useRef)(null);
	const contentRef = (0, import_react.useRef)(null);
	const [contextPoint, setContextPoint] = (0, import_react.useState)({
		segmentId: selectedSegmentId,
		sourceMs: 0,
		timelineMs: 0,
		music: false
	});
	const [viewportWidth, setViewportWidth] = (0, import_react.useState)(1);
	const scrubPointerRef = (0, import_react.useRef)(null);
	(0, import_react.useLayoutEffect)(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const measure = () => setViewportWidth(Math.max(1, viewport.clientWidth - 2));
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		return () => observer.disconnect();
	}, []);
	const draggedSegmentIdRef = (0, import_react.useRef)(null);
	const trimRef = (0, import_react.useRef)(null);
	const musicDragRef = (0, import_react.useRef)(null);
	const clipsById = (0, import_react.useMemo)(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
	const width = viewportWidth * zoom;
	const pixelsPerMs = width / Math.max(1, project.durationMs);
	const selected = project.segments.find((segment) => segment.id === selectedSegmentId);
	const rulerTicks = (0, import_react.useMemo)(() => createRulerTicks(project.durationMs, pixelsPerMs), [pixelsPerMs, project.durationMs]);
	const fitTimeline = () => {
		onZoomChange(1);
		if (viewportRef.current) viewportRef.current.scrollLeft = 0;
	};
	(0, import_react.useEffect)(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		if (zoom === 1) {
			viewport.scrollLeft = 0;
			return;
		}
		const x = currentMs * pixelsPerMs;
		if (x < viewport.scrollLeft || x > viewport.scrollLeft + viewport.clientWidth - 12) viewport.scrollLeft = Math.max(0, x - viewport.clientWidth * .2);
	}, [
		currentMs,
		pixelsPerMs,
		zoom
	]);
	const continueTrim = (event) => {
		const drag = trimRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const frame = 1e3 / Math.max(1, clipsById.get(drag.segment.clipId)?.fps || 30);
		const rawDelta = (event.clientX - drag.startX) / drag.pixelsPerMs * speedAt(drag.edge === "start" ? drag.segment.trimStartMs : drag.segment.trimEndMs, drag.segment.videoEdits);
		const deltaMs = event.shiftKey ? Math.round(rawDelta) : Math.round(Math.round(rawDelta / frame) * frame);
		const requested = (drag.edge === "start" ? drag.segment.trimStartMs : drag.segment.trimEndMs) + deltaMs;
		onProjectChange(updateMontageSegment(project, drag.segment.id, (segment) => drag.edge === "start" ? {
			...segment,
			trimStartMs: requested
		} : {
			...segment,
			trimEndMs: requested
		}), `trim:${drag.segment.id}:${drag.edge}`);
	};
	const finishTrim = (event) => {
		if (!trimRef.current || trimRef.current.pointerId !== event.pointerId) return;
		continueTrim(event);
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch {}
		trimRef.current = null;
	};
	const continueMusicDrag = (event) => {
		const drag = musicDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !project.music) return;
		const deltaMs = Math.round((event.clientX - drag.startX) / pixelsPerMs);
		onProjectChange(updateMontageMusic(project, (track) => ({
			...track,
			timelineStartMs: drag.startMs + deltaMs
		})), "music:position");
	};
	const seekFromSurface = (event) => {
		const rect = event.currentTarget.getBoundingClientRect();
		onSeek(clamp$1((event.clientX - rect.left) / pixelsPerMs, 0, project.durationMs));
	};
	const contextSegment = project.segments.find((segment) => segment.id === contextPoint.segmentId);
	const contextClip = clipsById.get(contextSegment?.clipId ?? "");
	const contextActions = [{
		label: "Move playhead here",
		onSelect: () => onSeek(contextPoint.timelineMs)
	}, "separator"];
	if (contextPoint.music) contextActions.push({
		label: project.music ? "Music settings" : "Add music",
		disabled: musicPending,
		onSelect: project.music ? onEditMusic : onAddMusic
	}, ...project.music ? [
		{
			label: project.music.muted ? "Unmute music" : "Mute music",
			onSelect: () => onProjectChange(updateMontageMusic(project, (track) => ({
				...track,
				muted: !track.muted
			})))
		},
		{
			label: "Start music here",
			onSelect: () => onProjectChange(updateMontageMusic(project, (track) => ({
				...track,
				timelineStartMs: contextPoint.timelineMs
			})))
		},
		{
			label: "Remove music",
			danger: true,
			onSelect: () => onProjectChange({
				...project,
				music: void 0
			})
		}
	] : []);
	else if (contextSegment) {
		const segment = contextSegment;
		const canStart = contextPoint.sourceMs >= segment.trimStartMs && contextPoint.sourceMs <= segment.trimEndMs - 100;
		const canEnd = contextPoint.sourceMs >= segment.trimStartMs + 100 && contextPoint.sourceMs <= segment.trimEndMs;
		contextActions.push({
			label: "Trim start to here",
			disabled: !canStart || contextPoint.sourceMs === segment.trimStartMs,
			onSelect: () => onProjectChange(updateMontageSegment(project, segment.id, (value) => ({
				...value,
				trimStartMs: contextPoint.sourceMs
			})))
		}, {
			label: "Trim end to here",
			disabled: !canEnd || contextPoint.sourceMs === segment.trimEndMs,
			onSelect: () => onProjectChange(updateMontageSegment(project, segment.id, (value) => ({
				...value,
				trimEndMs: contextPoint.sourceMs
			})))
		}, {
			label: "Split here",
			disabled: !canStart || !canEnd,
			onSelect: () => onProjectChange(splitMontageSegment(project, segment.id, contextPoint.sourceMs))
		}, {
			label: "Reset trim",
			disabled: segment.trimStartMs === 0 && segment.trimEndMs === segment.sourceDurationMs,
			onSelect: () => onProjectChange(updateMontageSegment(project, segment.id, (value) => ({
				...value,
				trimStartMs: 0,
				trimEndMs: value.sourceDurationMs
			})))
		}, "separator", {
			label: "Duplicate segment",
			onSelect: () => onProjectChange(duplicateMontageSegment(project, segment.id))
		}, {
			label: "Remove segment",
			disabled: project.segments.length <= 1,
			danger: true,
			onSelect: () => onProjectChange(removeMontageSegment(project, segment.id))
		});
	}
	contextActions.push("separator", {
		label: "Undo",
		disabled: !canUndo,
		onSelect: onUndo
	}, {
		label: "Redo",
		disabled: !canRedo,
		onSelect: onRedo
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-v2-timeline",
		"aria-label": "Montage timeline",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "montage-v2-timeline__toolbar",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-timeline__tools",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Undo",
						icon: Undo2,
						disabled: !canUndo,
						onClick: onUndo
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Redo",
						icon: Redo2,
						disabled: !canRedo,
						onClick: onRedo
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "montage-v2-toolbar-divider",
						"aria-hidden": "true"
					}),
					!project.sourceClipId ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "secondary",
						size: "sm",
						onClick: onAddClips,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3.5" }), " Add clips"]
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "secondary",
						size: "sm",
						disabled: musicPending,
						onClick: project.music ? onEditMusic : onAddMusic,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, { className: "size-3.5" }),
							" ",
							musicPending ? "Importing…" : project.music ? "Music settings" : "Add music"
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Split at playhead",
						icon: Scissors,
						disabled: !selected || segmentDurationMs(selected) < 200 || project.segments.length >= 500,
						onClick: onSplit
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Duplicate segment",
						icon: Copy,
						disabled: !selected || project.segments.length >= 500,
						onClick: onDuplicate
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Remove segment",
						icon: Trash2,
						disabled: !selected || project.segments.length <= 1,
						onClick: onRemove
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-timeline__zoom",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Zoom out",
						icon: ZoomOut,
						disabled: zoom <= 1,
						onClick: () => onZoomChange(clamp$1(zoom / 1.5, 1, 32))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "montage-v2-fit",
						"aria-pressed": zoom === 1,
						onClick: fitTimeline,
						children: "Fit"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("output", {
						"aria-label": `Timeline zoom ${zoom.toFixed(1)} times fit`,
						children: zoom === 1 ? "Full" : `${zoom.toFixed(1)}×`
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Zoom in",
						icon: ZoomIn,
						disabled: zoom >= 32,
						onClick: () => onZoomChange(clamp$1(zoom * 1.5, 1, 32))
					})
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "montage-v2-timeline__desk",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-lane-labels",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "montage-v2-ruler-label",
						children: "Timeline"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Video" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [project.segments.length, " segments"] })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Music" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.music ? "Imported audio" : "Empty lane" })] })
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: viewportRef,
				className: "montage-v2-timeline__viewport",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimelineContextMenu, {
					label: `${contextPoint.music ? "Music" : contextClip?.name ?? "Timeline"} · ${formatTimecode(contextPoint.timelineMs, true)}`,
					actions: contextActions,
					onContextMenu: (event) => {
						const keyboard = event.button !== 2;
						const rect = contentRef.current.getBoundingClientRect();
						const requested = keyboard ? currentMs : clamp$1((event.clientX - rect.left) / pixelsPerMs, 0, project.durationMs);
						const target = event.target;
						const music = Boolean(target.closest(".montage-v2-music-lane"));
						const id = target.closest("[data-segment-id]")?.dataset.segmentId;
						const segment = project.segments.find((value) => value.id === id) ?? mapMontageTime(project.segments, requested)?.segment;
						if (!segment) return;
						const start = montageStartForSegment(project.segments, segment.id);
						const frame = 1e3 / Math.max(1, clipsById.get(segment.clipId)?.fps || 30);
						const source = editedTimeAt(segment.trimStartMs, segment.trimEndMs, requested - start, segment.videoEdits).sourceMs;
						const sourceMs = clamp$1(Math.round(Math.round(source / frame) * frame), segment.trimStartMs, segment.trimEndMs);
						setContextPoint({
							segmentId: segment.id,
							sourceMs,
							timelineMs: music ? Math.round(requested) : start + sourceToEditedMs(segment.trimStartMs, sourceMs, segment.videoEdits),
							music
						});
						if (!music) onSelectSegment(segment.id);
					},
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						ref: contentRef,
						className: "montage-v2-timeline__content",
						style: { width: `${width}px` },
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "montage-v2-ruler",
								role: "slider",
								tabIndex: 0,
								"aria-label": "Montage playhead",
								"aria-valuemin": 0,
								"aria-valuemax": project.durationMs,
								"aria-valuenow": Math.round(currentMs),
								"aria-valuetext": formatTimecode(currentMs, true),
								onPointerDown: (event) => {
									if (event.button !== 0) return;
									scrubPointerRef.current = event.pointerId;
									event.currentTarget.setPointerCapture(event.pointerId);
									seekFromSurface(event);
								},
								onPointerMove: (event) => {
									if (scrubPointerRef.current === event.pointerId) seekFromSurface(event);
								},
								onPointerUp: (event) => {
									scrubPointerRef.current = null;
									event.currentTarget.releasePointerCapture(event.pointerId);
								},
								onPointerCancel: () => {
									scrubPointerRef.current = null;
								},
								onKeyDown: (event) => {
									const mapping = mapMontageTime(project.segments, currentMs);
									const delta = event.shiftKey ? 1e3 : 1e3 / Math.max(1, clipsById.get(mapping?.segment.clipId ?? "")?.fps || 30) / speedAt(mapping?.sourceTimeMs ?? 0, mapping?.segment.videoEdits);
									const time = event.key === "Home" ? 0 : event.key === "End" ? project.durationMs : event.key === "ArrowLeft" ? currentMs - delta : event.key === "ArrowRight" ? currentMs + delta : null;
									if (time === null) return;
									event.preventDefault();
									event.stopPropagation();
									onSeek(clamp$1(time, 0, project.durationMs));
								},
								children: rulerTicks.map((tick) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									style: { left: `${tick.timeMs * pixelsPerMs}px` },
									"data-end": tick.timeMs === project.durationMs || void 0,
									"data-major": tick.major || void 0,
									children: tick.major ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: formatTimecode(tick.timeMs, false) }) : null
								}, tick.timeMs))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "montage-v2-video-lane",
								role: "list",
								"aria-label": "Video segments",
								children: project.segments.map((segment, index) => {
									const clip = clipsById.get(segment.clipId);
									const segmentWidth = segmentDurationMs(segment) * pixelsPerMs;
									const isSelected = segment.id === selectedSegmentId;
									return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										"data-segment-id": segment.id,
										className: "montage-v2-segment-slot",
										style: { width: `${segmentWidth}px` },
										"data-compact": segmentWidth < 70 || void 0,
										role: "listitem",
										onDragOver: (event) => {
											event.preventDefault();
											event.dataTransfer.dropEffect = "move";
										},
										onDrop: (event) => {
											event.preventDefault();
											const activeId = draggedSegmentIdRef.current ?? event.dataTransfer.getData("text/plain");
											draggedSegmentIdRef.current = null;
											if (!activeId) return;
											onProjectChange(reorderMontageSegment(project, activeId, segment.id));
											onSelectSegment(activeId);
										},
										children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
												type: "button",
												draggable: true,
												className: "montage-v2-segment",
												"data-selected": isSelected || void 0,
												"data-missing": !clip || void 0,
												"aria-label": `${clip?.name ?? "Missing clip"}, segment ${index + 1} of ${project.segments.length}`,
												"aria-pressed": isSelected,
												title: `${index + 1}. ${clip?.name ?? "Missing clip"} · ${formatTimecode(segmentDurationMs(segment), true)}`,
												onClick: () => {
													onSelectSegment(segment.id);
													onSeek(montageStartForSegment(project.segments, segment.id));
												},
												onKeyDown: (event) => {
													if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
													const target = project.segments[index + (event.key === "ArrowLeft" ? -1 : 1)];
													if (!target) return;
													event.preventDefault();
													onProjectChange(reorderMontageSegment(project, segment.id, target.id));
													onSelectSegment(segment.id);
												},
												onDragStart: (event) => {
													draggedSegmentIdRef.current = segment.id;
													event.dataTransfer.effectAllowed = "move";
													event.dataTransfer.setData("text/plain", segment.id);
												},
												style: clip ? { backgroundImage: `url("switchboard-media://thumbnail/${encodeURIComponent(clip.id)}")` } : void 0,
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "montage-v2-segment__shade",
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
														className: "montage-v2-segment__index",
														children: index + 1
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: clip?.name ?? "Missing clip" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
														formatTimecode(segmentDurationMs(segment), true),
														segment.videoEdits?.speed && segment.videoEdits.speed !== 1 ? ` · ${segment.videoEdits.speed}×` : "",
														segment.videoEdits?.text?.content ? " · T" : ""
													] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "montage-v2-trim-handle is-start",
												role: "slider",
												tabIndex: 0,
												"aria-label": `${clip?.name ?? "Clip"} trim start`,
												"aria-valuemin": 0,
												"aria-valuemax": Math.max(0, segment.trimEndMs - 100),
												"aria-valuenow": segment.trimStartMs,
												onPointerDown: (event) => {
													if (event.button !== 0) return;
													event.stopPropagation();
													trimRef.current = {
														pointerId: event.pointerId,
														startX: event.clientX,
														segment,
														edge: "start",
														pixelsPerMs
													};
													try {
														event.currentTarget.setPointerCapture(event.pointerId);
													} catch {}
												},
												onPointerMove: continueTrim,
												onPointerUp: finishTrim,
												onPointerCancel: () => {
													trimRef.current = null;
												},
												onKeyDown: (event) => {
													const frame = event.shiftKey ? 1 : 1e3 / Math.max(1, clip?.fps || 30);
													const delta = event.key === "ArrowLeft" ? -frame : event.key === "ArrowRight" ? frame : 0;
													if (!delta) return;
													event.preventDefault();
													onProjectChange(updateMontageSegment(project, segment.id, (current) => ({
														...current,
														trimStartMs: current.trimStartMs + delta
													})), `trim:${segment.id}:start`);
												}
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "montage-v2-trim-handle is-end",
												role: "slider",
												tabIndex: 0,
												"aria-label": `${clip?.name ?? "Clip"} trim end`,
												"aria-valuemin": segment.trimStartMs + 100,
												"aria-valuemax": segment.sourceDurationMs,
												"aria-valuenow": segment.trimEndMs,
												onPointerDown: (event) => {
													if (event.button !== 0) return;
													event.stopPropagation();
													trimRef.current = {
														pointerId: event.pointerId,
														startX: event.clientX,
														segment,
														edge: "end",
														pixelsPerMs
													};
													try {
														event.currentTarget.setPointerCapture(event.pointerId);
													} catch {}
												},
												onPointerMove: continueTrim,
												onPointerUp: finishTrim,
												onPointerCancel: () => {
													trimRef.current = null;
												},
												onKeyDown: (event) => {
													const frame = event.shiftKey ? 1 : 1e3 / Math.max(1, clip?.fps || 30);
													const delta = event.key === "ArrowLeft" ? -frame : event.key === "ArrowRight" ? frame : 0;
													if (!delta) return;
													event.preventDefault();
													onProjectChange(updateMontageSegment(project, segment.id, (current) => ({
														...current,
														trimEndMs: current.trimEndMs + delta
													})), `trim:${segment.id}:end`);
												}
											})
										]
									}, segment.id);
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "montage-v2-music-lane",
								children: project.music ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "montage-v2-music-clip",
									style: {
										left: `${project.music.timelineStartMs * pixelsPerMs}px`,
										width: `${Math.max(12, musicTimelineDurationMs(project.music, project.durationMs) * pixelsPerMs)}px`
									},
									"data-muted": project.music.muted || project.music.volume <= 0 || void 0,
									"aria-label": `${project.music.asset.name} music track. Drag to change its timeline position.`,
									onDoubleClick: onEditMusic,
									onKeyDown: (event) => {
										const delta = event.key === "ArrowLeft" ? -100 : event.key === "ArrowRight" ? 100 : 0;
										if (!delta) return;
										event.preventDefault();
										onProjectChange(updateMontageMusic(project, (track) => ({
											...track,
											timelineStartMs: track.timelineStartMs + delta * (event.shiftKey ? 10 : 1)
										})), "music:position");
									},
									onClick: () => onSeek(project.music?.timelineStartMs ?? 0),
									onPointerDown: (event) => {
										if (event.button !== 0 || !project.music) return;
										event.stopPropagation();
										musicDragRef.current = {
											pointerId: event.pointerId,
											startX: event.clientX,
											startMs: project.music.timelineStartMs
										};
										try {
											event.currentTarget.setPointerCapture(event.pointerId);
										} catch {}
									},
									onPointerMove: continueMusicDrag,
									onPointerUp: (event) => {
										continueMusicDrag(event);
										try {
											event.currentTarget.releasePointerCapture(event.pointerId);
										} catch {}
										musicDragRef.current = null;
									},
									onPointerCancel: () => {
										musicDragRef.current = null;
									},
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "montage-v2-waveform",
											"aria-hidden": "true",
											children: (waveform?.samples ?? []).map((sample, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: { height: `${Math.max(4, sample * 90)}%` } }, index))
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: project.music.asset.name }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: project.music.loop ? "Looping" : formatTimecode(project.music.sourceEndMs - project.music.sourceStartMs, true) })
									]
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "montage-v2-music-empty",
									disabled: musicPending,
									onClick: onAddMusic,
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, { "aria-hidden": "true" }),
										" ",
										musicPending ? "Importing audio…" : "Add music from your computer"
									]
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "montage-v2-playhead",
								style: { left: `${currentMs * pixelsPerMs}px` },
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {})
							})
						]
					})
				})
			})]
		})]
	});
}
function ToolbarButton({ label, icon: Icon, disabled, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: "ghost",
			size: "icon",
			className: "size-7",
			"aria-label": label,
			disabled,
			onClick,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-3.5" })
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: label })] });
}
function createRulerTicks(durationMs, pixelsPerMs) {
	const targetMinorPixels = 18;
	const interval = [
		100,
		250,
		500,
		1e3,
		2e3,
		5e3,
		1e4,
		15e3,
		3e4,
		6e4,
		12e4
	].find((candidate) => candidate * pixelsPerMs >= targetMinorPixels) ?? 12e4;
	const majorEvery = interval < 1e3 ? 5 : interval < 1e4 ? 5 : interval < 6e4 ? 3 : 2;
	const ticks = [];
	for (let timeMs = 0, index = 0; timeMs <= durationMs; timeMs += interval, index += 1) {
		ticks.push({
			timeMs,
			major: index % majorEvery === 0 && (timeMs === 0 || timeMs === durationMs || (durationMs - timeMs) * pixelsPerMs >= 72)
		});
		if (ticks.length >= 300) break;
	}
	if (ticks.at(-1)?.timeMs !== durationMs) ticks.push({
		timeMs: durationMs,
		major: true
	});
	return ticks;
}
function formatTimecode(milliseconds, compact) {
	const totalMs = Math.max(0, Math.round(milliseconds));
	const totalSeconds = Math.floor(totalMs / 1e3);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const millis = totalMs % 1e3;
	if (compact) return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
	return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
function clamp$1(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}
//#endregion
//#region src/renderer/src/components/capture/ShareClipDialog.tsx
var sharePresets = [
	{
		id: "original",
		label: "Original",
		description: "No size target"
	},
	{
		id: "10mb",
		label: "10 MB",
		description: "Works with smaller upload limits",
		targetBytes: 10485760
	},
	{
		id: "25mb",
		label: "25 MB",
		description: "Balanced detail and upload size",
		targetBytes: 26214400
	},
	{
		id: "50mb",
		label: "50 MB",
		description: "More detail for longer clips",
		targetBytes: 52428800
	}
];
function errorMessage$1(cause) {
	return cause instanceof Error ? cause.message : String(cause);
}
function ShareClipDialog({ clip, startMs, endMs, exportPending, disabled = false, projectType = "single", segmentCount = 1, sourceBytes, selectedDurationMs, getPreviewCanvas, onExport, onCancelExport }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const [previewCanvas, setPreviewCanvas] = (0, import_react.useState)(null);
	const previewRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const destination = previewRef.current;
		if (!previewCanvas || !destination || !open) return;
		destination.width = previewCanvas.width;
		destination.height = previewCanvas.height;
		destination.getContext("2d")?.drawImage(previewCanvas, 0, 0);
	}, [previewCanvas, open]);
	const [preset, setPreset] = (0, import_react.useState)("10mb");
	const [montageSize, setMontageSize] = (0, import_react.useState)("balanced");
	const [customSize, setCustomSize] = (0, import_react.useState)("250");
	const [activeExportId, setActiveExportId] = (0, import_react.useState)(null);
	const activeExportIdRef = (0, import_react.useRef)(null);
	const [exportProgress, setExportProgress] = (0, import_react.useState)(null);
	const [prepared, setPrepared] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [thumbnailFailed, setThumbnailFailed] = (0, import_react.useState)(false);
	const durationMs = selectedDurationMs ?? endMs - startMs;
	const sizes = montageSizeChoices(durationMs);
	const targetSizeMb = projectType !== "montage" || montageSize === "quality" ? void 0 : montageSize === "custom" ? Number(customSize) : sizes[montageSize === "compact" ? 0 : montageSize === "balanced" ? 1 : 2];
	const invalidSize = targetSizeMb !== void 0 && (!Number.isInteger(targetSizeMb) || targetSizeMb < 5 || targetSizeMb > 1e5);
	const videoKbps = targetSizeMb ? targetSizeMb * 1048576 * 8 * .94 / Math.max(.1, durationMs / 1e3) / 1e3 - 128 : null;
	const impossibleSize = videoKbps !== null && videoKbps < 120;
	const selected = sharePresets.find((candidate) => candidate.id === preset) ?? sharePresets[1];
	const proportionalBytes = sourceBytes ?? clip.fileSize * durationMs / Math.max(1, clip.durationMs);
	const expectedBytes = projectType === "montage" ? targetSizeMb && !invalidSize ? targetSizeMb * 1048576 : proportionalBytes : selected.targetBytes ? Math.min(proportionalBytes, selected.targetBytes) : proportionalBytes;
	const sourceName = clip.path.split(/[\\/]/).at(-1) ?? clip.name;
	const visibleName = prepared?.name ?? (projectType === "montage" ? "Montage.mp4" : sourceName);
	const visibleBytes = prepared?.fileSize ?? expectedBytes;
	const canDrag = prepared !== null;
	const progressLabel = exportProgress?.stage === "finalizing" || exportProgress?.stage === "complete" ? "Finalizing share copy" : projectType === "montage" ? "Exporting montage" : "Compressing clip";
	(0, import_react.useEffect)(() => switchboardApi.subscribeClipExportProgress((progress) => {
		if (progress.exportId !== activeExportIdRef.current) return;
		setExportProgress(progress);
	}), []);
	const handleOpenChange = (nextOpen) => {
		if (!nextOpen && exportPending) return;
		setOpen(nextOpen);
		if (nextOpen) setPreviewCanvas(getPreviewCanvas?.() ?? null);
		if (!nextOpen) {
			setPreviewCanvas(null);
			setPrepared(null);
			setError(null);
			setActiveExportId(null);
			activeExportIdRef.current = null;
			setExportProgress(null);
		}
	};
	const createShareFile = async () => {
		const exportId = crypto.randomUUID();
		activeExportIdRef.current = exportId;
		setActiveExportId(exportId);
		setExportProgress(null);
		setPrepared(null);
		setError(null);
		try {
			const result = await onExport(projectType === "montage" ? "original" : preset, exportId, targetSizeMb);
			if (result && typeof result === "object") setPrepared(result);
			else if (result === true) setOpen(false);
		} catch (cause) {
			setError(errorMessage$1(cause));
		} finally {
			activeExportIdRef.current = null;
			setActiveExportId(null);
		}
	};
	const cancelExport = async () => {
		if (!activeExportId || !onCancelExport) return;
		await onCancelExport(activeExportId);
	};
	const selectPreset = (value) => {
		if (!value) return;
		setPreset(value);
		setPrepared(null);
		setError(null);
		setExportProgress(null);
	};
	const startFileDrag = (event) => {
		if (!prepared) return;
		event.preventDefault();
		switchboardApi.startPreparedShareDrag(prepared.id);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Dialog, {
		open,
		onOpenChange: handleOpenChange,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
				type: "button",
				variant: "primary",
				size: "sm",
				className: "no-drag",
				disabled: exportPending || disabled,
				title: disabled ? "Clip duration is unavailable" : void 0,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Share2, {
						className: "size-4",
						"aria-hidden": "true"
					}),
					" ",
					exportPending ? "Preparing…" : "Share"
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "max-w-[520px] max-h-[calc(100vh-32px)] overflow-y-auto p-0 no-drag",
			"data-share-clip-dialog": true,
			"data-share-state": exportPending ? "preparing" : prepared ? "ready" : error ? "error" : "idle",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, {
					className: "px-5 pb-3 pt-5 pr-12",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: projectType === "montage" ? "Export montage" : "Share clip" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: projectType === "montage" ? `${formatDuration(durationMs / 1e3)} across ${segmentCount} ${segmentCount === 1 ? "clip" : "clips"}. Choose an output size and save a copy.` : "Prepare a share copy, then drag the clip straight into Discord or another app." })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "px-5 pb-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "group overflow-hidden rounded-md border border-border bg-surface-1 data-[ready=true]:cursor-grab data-[ready=true]:border-primary/55 data-[ready=true]:active:cursor-grabbing",
							"data-ready": canDrag ? "true" : "false",
							draggable: canDrag,
							onDragStart: startFileDrag,
							role: "group",
							"aria-label": canDrag ? `${visibleName}, ready to drag into another app` : `${visibleName} preview`,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "relative aspect-video overflow-hidden bg-background",
								children: [previewCanvas ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
									ref: previewRef,
									"aria-label": "Edited frame at the playhead",
									className: "size-full object-contain"
								}) : !thumbnailFailed && clip.thumbnailPath ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
									src: `switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`,
									alt: "",
									draggable: false,
									onError: () => setThumbnailFailed(true),
									className: "size-full object-cover"
								}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "grid size-full place-items-center text-muted-foreground",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, {
										className: "size-8",
										strokeWidth: 1.4
									})
								}), exportPending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "absolute inset-0 flex items-end bg-black/65 p-4 text-white",
									role: "status",
									"aria-live": "polite",
									"data-share-progress": true,
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "w-full rounded-sm bg-black/45 px-3 py-2.5 shadow-sm",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: progressLabel }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "tabular-nums text-white/80",
												children: exportProgress ? `${exportProgress.percent}%` : "Starting…"
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Progress, {
											value: exportProgress?.percent ?? 0,
											"aria-label": `${progressLabel} progress`,
											"aria-valuetext": exportProgress ? `${exportProgress.percent} percent` : "Starting",
											className: "h-1.5 bg-white/20",
											indicatorClassName: "bg-white"
										})]
									})
								}) : canDrag ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/72 px-3 py-2 text-white",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "flex items-center gap-2 text-[11px] font-semibold",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Grip, {
											className: "size-4",
											"aria-hidden": "true"
										}), projectType === "montage" ? "Drag montage into another app" : "Drag clip into Discord"]
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
										className: "size-4 text-primary",
										"aria-hidden": "true"
									})]
								}) : null]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex min-w-0 items-center justify-between gap-3 border-t border-border px-3 py-2.5",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "truncate text-[12px] font-semibold text-foreground",
										title: visibleName,
										children: visibleName
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "mt-0.5 text-[10px] tabular-nums text-muted-foreground",
										children: [
											formatDuration(durationMs / 1e3),
											" · ",
											formatBytes(visibleBytes)
										]
									})]
								}), prepared ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
									type: "button",
									variant: "ghost",
									size: "sm",
									className: "h-7 shrink-0 px-2 text-[10px]",
									onClick: () => void switchboardApi.revealPreparedShareFile(prepared.id).catch((cause) => setError(errorMessage$1(cause))),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {
										className: "size-3.5",
										"aria-hidden": "true"
									}), " Show in folder"]
								}) : null]
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mt-4",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "mb-2 flex items-center justify-between gap-3",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[11px] font-semibold text-foreground",
									children: "File size"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "text-[10px] text-muted-foreground",
									children: projectType === "montage" ? "Sized for this runtime" : selected.description
								})]
							}), projectType === "montage" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "editor-size-options",
									role: "group",
									"aria-label": "Montage file size",
									children: [
										"compact",
										"balanced",
										"detail",
										"quality",
										"custom"
									].map((id, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
										type: "button",
										disabled: exportPending,
										"aria-pressed": montageSize === id,
										onClick: () => {
											setMontageSize(id);
											setPrepared(null);
											setError(null);
										},
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: [
											"Compact",
											"Balanced",
											"More detail",
											"Quality",
											"Custom"
										][index] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: index < 3 ? formatBytes(sizes[index] * 1048576) : index === 3 ? "No size limit" : "Set a limit" })]
									}, id))
								}),
								montageSize === "custom" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "editor-custom-size",
									children: ["Target size (MB)", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
										type: "number",
										min: 5,
										max: 1e5,
										step: 1,
										value: customSize,
										disabled: exportPending,
										onChange: (event) => {
											setCustomSize(event.target.value);
											setPrepared(null);
										}
									})]
								}) : null,
								invalidSize || impossibleSize ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									role: "alert",
									className: "mt-2 text-[11px] text-destructive",
									children: invalidSize ? "Enter a whole size from 5 to 100,000 MB." : "This size is too small for the runtime. Choose a larger target."
								}) : videoKbps !== null && videoKbps < 1500 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "mt-2 text-[11px] text-muted-foreground",
									children: "Heavy compression at this size. More detail is recommended for fast motion."
								}) : null
							] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
								type: "single",
								value: preset,
								onValueChange: selectPreset,
								disabled: exportPending,
								"aria-label": "File size preset",
								className: "grid w-full grid-cols-4 bg-surface-interactive",
								children: sharePresets.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
									value: candidate.id,
									"data-share-preset": candidate.id,
									className: "h-9 min-w-0 px-2 text-[11px]",
									"aria-label": candidate.label,
									children: candidate.label
								}, candidate.id))
							})]
						}),
						error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 rounded-sm border border-destructive/35 bg-destructive/10 px-3 py-2 text-[11px] leading-4 text-destructive",
							role: "alert",
							children: error
						}) : null
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("footer", {
					className: "flex items-center justify-between gap-4 px-5 py-3.5",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0 text-[10px] leading-4 text-muted-foreground",
						"aria-live": "polite",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "block",
							children: prepared ? "Share copy" : "Expected output"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
							className: "block text-[12px] font-semibold tabular-nums text-foreground",
							children: prepared ? `${formatBytes(prepared.fileSize)} · Ready to drag` : projectType === "montage" ? invalidSize ? "Choose a valid size" : targetSizeMb ? `Up to ${formatBytes(targetSizeMb * 1048576)}` : "Quality export · No size limit" : selected.targetBytes ? `Up to ${selected.label}` : `About ${formatBytes(expectedBytes)}`
						})]
					}), exportPending && activeExportId && onCancelExport ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "secondary",
						size: "sm",
						className: "min-w-[132px]",
						onClick: () => void cancelExport().catch((cause) => setError(errorMessage$1(cause))),
						children: "Cancel"
					}) : prepared ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "primary",
						size: "sm",
						className: "min-w-[132px]",
						onClick: () => handleOpenChange(false),
						children: "Done"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "primary",
						size: "sm",
						className: "min-w-[132px]",
						disabled: exportPending || invalidSize || impossibleSize,
						onClick: () => void createShareFile(),
						children: projectType === "montage" ? "Choose destination" : "Prepare clip"
					})]
				})
			]
		})]
	});
}
//#endregion
//#region src/renderer/src/components/capture/MontageComposer.tsx
var channelLabels = {
	game: "Game",
	chat: "Chat",
	microphone: "Microphone",
	media: "Media"
};
var draftSaveError = "Your latest edits are still open. The draft could not be saved to disk.";
function MontageComposer({ initialProject, clips, inspectorOpen, onClose, onInspectorOpenChange, onReveal, onDraftsChanged, sourceClipActions }) {
	const [editTool, setEditTool] = (0, import_react.useState)("framing");
	const [selectedOverlayId, setSelectedOverlayId] = (0, import_react.useState)(null);
	const duckGainRef = (0, import_react.useRef)(1);
	const playbackClockRef = (0, import_react.useRef)({
		wall: 0,
		time: 0
	});
	const editorRef = (0, import_react.useRef)(null);
	const backRef = (0, import_react.useRef)(null);
	const videoARef = (0, import_react.useRef)(null);
	const videoBRef = (0, import_react.useRef)(null);
	const musicRef = (0, import_react.useRef)(null);
	const musicSettingsRef = (0, import_react.useRef)(null);
	const [musicSettingsRequested, setMusicSettingsRequested] = (0, import_react.useState)(false);
	const [inspectorSection, setInspectorSection] = (0, import_react.useState)("segment");
	const playbackFrameRef = (0, import_react.useRef)(null);
	const currentMsRef = (0, import_react.useRef)(0);
	const lastRenderedMsRef = (0, import_react.useRef)(0);
	const activeSlotRef = (0, import_react.useRef)(0);
	const playingRef = (0, import_react.useRef)(false);
	const autosaveTimerRef = (0, import_react.useRef)(null);
	const discardingRef = (0, import_react.useRef)(false);
	const projectRef = (0, import_react.useRef)(initialProject);
	const clipsRef = (0, import_react.useRef)(clips);
	const masterVolumeRef = (0, import_react.useRef)(1);
	const previewMutedRef = (0, import_react.useRef)(false);
	const seekGenerationRef = (0, import_react.useRef)(0);
	const [history, setHistory] = (0, import_react.useState)(() => ({
		past: [],
		present: normalizeMontageProject(initialProject),
		future: [],
		mergeKey: null,
		mergedAt: 0
	}));
	const project = history.present;
	const [nameDraft, setNameDraft] = (0, import_react.useState)(project.name);
	(0, import_react.useEffect)(() => setNameDraft(project.name), [project.name]);
	const [selectedSegmentId, setSelectedSegmentId] = (0, import_react.useState)(project.segments[0]?.id ?? "");
	const [currentMs, setCurrentMs] = (0, import_react.useState)(0);
	const [playing, setPlaying] = (0, import_react.useState)(false);
	const [activeSlot, setActiveSlot] = (0, import_react.useState)(0);
	const [previewState, setPreviewState] = (0, import_react.useState)("loading");
	const [previewMuted, setPreviewMuted] = (0, import_react.useState)(false);
	const [masterVolume, setMasterVolume] = (0, import_react.useState)(1);
	const [viewerFullscreen, setViewerFullscreen] = (0, import_react.useState)(false);
	const [zoom, setZoom] = (0, import_react.useState)(1);
	const [addClipsOpen, setAddClipsOpen] = (0, import_react.useState)(false);
	const [waveform, setWaveform] = (0, import_react.useState)(null);
	const [musicPending, setMusicPending] = (0, import_react.useState)(false);
	const [exportPending, setExportPending] = (0, import_react.useState)(false);
	const [saveState, setSaveState] = (0, import_react.useState)("idle");
	const [error, setError] = (0, import_react.useState)(null);
	const [musicPreviewWarning, setMusicPreviewWarning] = (0, import_react.useState)(null);
	const clipsById = (0, import_react.useMemo)(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
	const selectedSegment = project.segments.find((segment) => segment.id === selectedSegmentId) ?? project.segments[0];
	const selectedClip = selectedSegment ? clipsById.get(selectedSegment.clipId) : void 0;
	const representativeClip = project.segments.map((segment) => clipsById.get(segment.clipId)).find((clip) => Boolean(clip));
	const missingSegmentCount = project.segments.filter((segment) => !clipsById.has(segment.clipId)).length;
	const proportionalBytes = project.segments.reduce((total, segment) => {
		const clip = clipsById.get(segment.clipId);
		if (!clip) return total;
		return total + clip.fileSize * segmentDurationMs(segment) / Math.max(1, clip.durationMs);
	}, 0) + (project.music?.asset.fileSize ?? 0);
	projectRef.current = project;
	clipsRef.current = clips;
	masterVolumeRef.current = masterVolume;
	previewMutedRef.current = previewMuted;
	playingRef.current = playing;
	activeSlotRef.current = activeSlot;
	const changeProject = (0, import_react.useCallback)((next, mergeKey) => {
		const normalized = normalizeMontageProject(next);
		projectRef.current = normalized;
		const now = Date.now();
		setHistory((current) => {
			if (current.present === normalized) return current;
			if (mergeKey && current.mergeKey === mergeKey && now - current.mergedAt < 900) return {
				...current,
				present: normalized,
				future: [],
				mergedAt: now
			};
			return {
				past: [...current.past, current.present].slice(-80),
				present: normalized,
				future: [],
				mergeKey: mergeKey ?? null,
				mergedAt: now
			};
		});
		setError(null);
	}, []);
	const undo = (0, import_react.useCallback)(() => {
		setHistory((current) => {
			const previous = current.past.at(-1);
			if (!previous) return current;
			return {
				past: current.past.slice(0, -1),
				present: previous,
				future: [current.present, ...current.future].slice(0, 80),
				mergeKey: null,
				mergedAt: 0
			};
		});
	}, []);
	const redo = (0, import_react.useCallback)(() => {
		setHistory((current) => {
			const next = current.future[0];
			if (!next) return current;
			return {
				past: [...current.past, current.present].slice(-80),
				present: next,
				future: current.future.slice(1),
				mergeKey: null,
				mergedAt: 0
			};
		});
	}, []);
	const stopPlaybackFrame = (0, import_react.useCallback)(() => {
		if (playbackFrameRef.current === null) return;
		window.cancelAnimationFrame(playbackFrameRef.current);
		playbackFrameRef.current = null;
	}, []);
	const pausePlayback = (0, import_react.useCallback)(() => {
		videoARef.current?.pause();
		videoBRef.current?.pause();
		musicRef.current?.pause();
		setPlaying(false);
		playingRef.current = false;
		stopPlaybackFrame();
	}, [stopPlaybackFrame]);
	const syncMusic = (0, import_react.useCallback)(async (timeMs, resume) => {
		const audio = musicRef.current;
		const currentProject = projectRef.current;
		if (!audio || !currentProject.music) return;
		const playback = musicPlaybackAt(currentProject.music, timeMs, currentProject.durationMs);
		const assetId = currentProject.music.asset.id;
		if (audio.dataset.assetId !== assetId) {
			audio.dataset.assetId = assetId;
			audio.src = `switchboard-media://montage-audio/${encodeURIComponent(assetId)}`;
			audio.preload = "auto";
			audio.load();
			try {
				await waitForMetadata(audio);
				setMusicPreviewWarning(null);
			} catch {
				setMusicPreviewWarning("Music preview is unavailable in Chromium. FFmpeg export can still use this file.");
				return;
			}
		}
		if (!playback.active) {
			audio.pause();
			return;
		}
		const targetSeconds = playback.sourceTimeMs / 1e3;
		if (Math.abs(audio.currentTime - targetSeconds) > .08) audio.currentTime = targetSeconds;
		audio.muted = previewMutedRef.current;
		audio.volume = clamp(playback.gain * masterVolumeRef.current * duckGainRef.current, 0, 1);
		if (resume) try {
			await audio.play();
		} catch {
			setMusicPreviewWarning("Music preview could not start. Export remains available.");
		}
	}, []);
	const seekMontage = (0, import_react.useCallback)(async (requestedMs, resume = false) => {
		const currentProject = projectRef.current;
		const mapping = mapMontageTime(currentProject.segments, requestedMs);
		if (!mapping) return;
		const clip = clipsRef.current.find((candidate) => candidate.id === mapping.segment.clipId);
		if (!clip) {
			pausePlayback();
			setPreviewState("error");
			setError("The selected source clip is missing from the library.");
			return;
		}
		const generation = ++seekGenerationRef.current;
		const activeVideo = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
		const inactiveSlot = activeSlotRef.current === 0 ? 1 : 0;
		const inactiveVideo = inactiveSlot === 0 ? videoARef.current : videoBRef.current;
		const matchingActive = activeVideo?.dataset.clipId === clip.id;
		const matchingInactive = inactiveVideo?.dataset.clipId === clip.id;
		const targetSlot = matchingActive ? activeSlotRef.current : matchingInactive ? inactiveSlot : inactiveSlot;
		const targetVideo = targetSlot === 0 ? videoARef.current : videoBRef.current;
		if (!targetVideo) return;
		pausePlayback();
		const nextMs = clamp(requestedMs, 0, currentProject.durationMs);
		currentMsRef.current = nextMs;
		setCurrentMs(nextMs);
		setPreviewState("loading");
		try {
			await prepareVideo(targetVideo, clip.id, mapping.sourceTimeMs);
			if (generation !== seekGenerationRef.current) return;
			activeSlotRef.current = targetSlot;
			setActiveSlot(targetSlot);
			setSelectedSegmentId(mapping.segment.id);
			currentMsRef.current = nextMs;
			lastRenderedMsRef.current = nextMs;
			setCurrentMs(nextMs);
			applyVideoVolume(targetVideo, mapping.segment);
			setPreviewState("ready");
			await syncMusic(nextMs, resume);
			if (generation !== seekGenerationRef.current) return;
			if (resume) {
				playbackClockRef.current = {
					wall: performance.now(),
					time: nextMs
				};
				if (!mapping.frozen) await targetVideo.play();
				setPlaying(true);
				playingRef.current = true;
			}
		} catch {
			if (generation !== seekGenerationRef.current) return;
			setPreviewState("error");
			setError(`Preview could not decode ${clip.name}.`);
		}
	}, [pausePlayback, syncMusic]);
	const advancePlayback = (0, import_react.useCallback)(async () => {
		const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
		if (!mapping) return;
		if (!projectRef.current.segments[mapping.segmentIndex + 1]) {
			pausePlayback();
			currentMsRef.current = projectRef.current.durationMs;
			lastRenderedMsRef.current = currentMsRef.current;
			setCurrentMs(currentMsRef.current);
			return;
		}
		await seekMontage(mapping.montageEndMs, true);
	}, [pausePlayback, seekMontage]);
	const tickPlayback = (0, import_react.useCallback)(() => {
		playbackFrameRef.current = null;
		if (!playingRef.current) return;
		const currentProject = projectRef.current;
		const mapping = mapMontageTime(currentProject.segments, currentMsRef.current);
		const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
		if (!mapping || !video) return;
		const nextMs = Math.min(currentProject.durationMs, playbackClockRef.current.time + performance.now() - playbackClockRef.current.wall);
		if (nextMs >= mapping.montageEndMs) {
			advancePlayback();
			return;
		}
		const desired = mapMontageTime(currentProject.segments, nextMs);
		if (!desired) return;
		video.playbackRate = speedAt(desired.sourceTimeMs, desired.segment.videoEdits);
		if (desired.frozen) {
			video.pause();
			if (Math.abs(video.currentTime * 1e3 - desired.sourceTimeMs) > 25) video.currentTime = desired.sourceTimeMs / 1e3;
		} else {
			if (Math.abs(video.currentTime * 1e3 - desired.sourceTimeMs) > 160) video.currentTime = desired.sourceTimeMs / 1e3;
			if (video.paused) video.play().catch(() => {
				pausePlayback();
				setError("Preview playback could not continue.");
			});
		}
		currentMsRef.current = nextMs;
		if (Math.abs(nextMs - lastRenderedMsRef.current) >= 50) {
			lastRenderedMsRef.current = nextMs;
			setCurrentMs(nextMs);
		}
		const audio = musicRef.current;
		const musicPlayback = musicPlaybackAt(currentProject.music, nextMs, currentProject.durationMs);
		if (audio && currentProject.music) {
			if (!musicPlayback.active) audio.pause();
			else if (audio.dataset.assetId === currentProject.music.asset.id) {
				const desired = musicPlayback.sourceTimeMs / 1e3;
				if (Math.abs(audio.currentTime - desired) > .16) audio.currentTime = desired;
				audio.muted = previewMutedRef.current;
				audio.volume = clamp(musicPlayback.gain * masterVolumeRef.current * duckGainRef.current, 0, 1);
				if (audio.paused) audio.play().catch(() => void 0);
			}
		}
		playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
	}, [advancePlayback, pausePlayback]);
	(0, import_react.useEffect)(() => {
		if (!playing) {
			stopPlaybackFrame();
			return;
		}
		playbackFrameRef.current ??= window.requestAnimationFrame(tickPlayback);
		return stopPlaybackFrame;
	}, [
		playing,
		stopPlaybackFrame,
		tickPlayback
	]);
	(0, import_react.useEffect)(() => {
		backRef.current?.focus();
		seekMontage(0, false);
		return () => {
			seekGenerationRef.current += 1;
			stopPlaybackFrame();
			for (const media of [
				videoARef.current,
				videoBRef.current,
				musicRef.current
			]) {
				if (!media) continue;
				media.pause();
				media.removeAttribute("src");
				media.load();
			}
		};
	}, []);
	(0, import_react.useEffect)(() => {
		if (project.segments.some((segment) => segment.id === selectedSegmentId)) return;
		setSelectedSegmentId(project.segments[0]?.id ?? "");
	}, [project.segments, selectedSegmentId]);
	(0, import_react.useEffect)(() => {
		if (!projectRef.current.segments.some((segment) => {
			const clip = clips.find((candidate) => candidate.id === segment.clipId);
			return Boolean(clip && clip.durationMs >= 100 && clip.durationMs !== segment.sourceDurationMs);
		})) return;
		const reconciled = reconcileMontageProject(projectRef.current, clips);
		setHistory((current) => ({
			...current,
			present: reconciled,
			future: [],
			mergeKey: null,
			mergedAt: 0
		}));
	}, [clips]);
	(0, import_react.useEffect)(() => {
		const requestedMs = Math.min(currentMsRef.current, Math.max(0, project.durationMs - 1));
		const mapping = mapMontageTime(project.segments, requestedMs);
		const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
		if (!mapping || !video) return;
		const sourceTimeMs = video.currentTime * 1e3;
		const sourceChanged = video.dataset.clipId !== mapping.segment.clipId;
		const outsideTrim = sourceTimeMs < mapping.segment.trimStartMs - 40 || sourceTimeMs > mapping.segment.trimEndMs + 40;
		if (currentMsRef.current >= project.durationMs || sourceChanged || outsideTrim) {
			seekMontage(requestedMs, playingRef.current);
			return;
		}
		applyVideoVolume(video, mapping.segment);
		syncMusic(currentMsRef.current, playingRef.current);
	}, [
		project,
		seekMontage,
		syncMusic
	]);
	(0, import_react.useEffect)(() => {
		if (!project.music) {
			setWaveform(null);
			setMusicPreviewWarning(null);
			musicRef.current?.pause();
			return;
		}
		let active = true;
		setWaveform(null);
		montageV2Api.loadMontageAudioWaveform(project.music.asset.id).then((next) => {
			if (active) setWaveform(next);
		}).catch((cause) => {
			if (active) setMusicPreviewWarning(errorMessage(cause));
		});
		return () => {
			active = false;
		};
	}, [project.music?.asset.id]);
	const persistDraft = (0, import_react.useCallback)(async (generation) => {
		if (discardingRef.current) return;
		setSaveState("saving");
		try {
			await montageV2Api.saveMontageDraft(generation);
			if (discardingRef.current || projectRef.current !== generation) return;
			setSaveState("saved");
			setError((previous) => previous === draftSaveError ? null : previous);
			onDraftsChanged();
		} catch (cause) {
			if (discardingRef.current || projectRef.current !== generation) return;
			console.warn("Draft save failed", cause);
			setSaveState("error");
			setError(draftSaveError);
		}
	}, [onDraftsChanged]);
	(0, import_react.useEffect)(() => {
		setSaveState("saving");
		const timer = window.setTimeout(() => {
			persistDraft(project);
		}, 450);
		autosaveTimerRef.current = timer;
		return () => window.clearTimeout(timer);
	}, [persistDraft, project]);
	(0, import_react.useEffect)(() => {
		if (!viewerFullscreen) return;
		const closeFullscreen = (event) => {
			if (event.key !== "Escape") return;
			event.preventDefault();
			setViewerFullscreen(false);
		};
		window.addEventListener("keydown", closeFullscreen, { capture: true });
		return () => window.removeEventListener("keydown", closeFullscreen, { capture: true });
	}, [viewerFullscreen]);
	const togglePlayback = async () => {
		if (playingRef.current) {
			pausePlayback();
			return;
		}
		if (currentMsRef.current >= projectRef.current.durationMs) await seekMontage(0, false);
		const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
		const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
		if (!video || !mapping) return;
		applyVideoVolume(video, mapping.segment);
		await syncMusic(currentMsRef.current, true);
		try {
			playbackClockRef.current = {
				wall: performance.now(),
				time: currentMsRef.current
			};
			if (!mapping.frozen) await video.play();
			setPlaying(true);
			playingRef.current = true;
		} catch {
			setPreviewState("error");
			setError("Montage playback could not start.");
		}
	};
	const importMusic = async () => {
		if (musicPending) return;
		pausePlayback();
		setMusicPending(true);
		setError(null);
		try {
			const asset = await montageV2Api.importMontageAudio();
			if (!asset) return;
			changeProject({
				...projectRef.current,
				music: createMontageMusicTrack(asset)
			});
			openMusicSettings();
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setMusicPending(false);
		}
	};
	const openMusicSettings = () => {
		setInspectorSection("music");
		onInspectorOpenChange(true);
		setMusicSettingsRequested(true);
	};
	(0, import_react.useEffect)(() => {
		if (!inspectorOpen || !musicSettingsRequested) return;
		musicSettingsRef.current?.scrollIntoView({ block: "start" });
		musicSettingsRef.current?.focus({ preventScroll: true });
		setMusicSettingsRequested(false);
	}, [
		inspectorOpen,
		musicSettingsRequested,
		project.music
	]);
	const duplicateSelected = () => {
		if (!selectedSegment) return;
		const currentIndex = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
		const next = duplicateMontageSegment(project, selectedSegment.id);
		changeProject(next);
		const duplicate = next.segments[currentIndex + 1];
		if (duplicate) setSelectedSegmentId(duplicate.id);
	};
	const splitSelected = () => {
		if (!selectedSegment) return;
		const mapping = mapMontageTime(project.segments, currentMsRef.current);
		const sourceTimeMs = mapping?.segment.id === selectedSegment.id ? mapping.sourceTimeMs : (selectedSegment.trimStartMs + selectedSegment.trimEndMs) / 2;
		const currentIndex = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
		const next = splitMontageSegment(project, selectedSegment.id, sourceTimeMs);
		if (next === project) return;
		changeProject(next);
		const second = next.segments[currentIndex + 1];
		if (second) setSelectedSegmentId(second.id);
	};
	const removeSelected = () => {
		if (!selectedSegment || project.segments.length <= 1) return;
		const index = project.segments.findIndex((segment) => segment.id === selectedSegment.id);
		const next = removeMontageSegment(project, selectedSegment.id);
		changeProject(next);
		const fallback = next.segments[Math.min(index, next.segments.length - 1)];
		if (fallback) setSelectedSegmentId(fallback.id);
	};
	const discardDraft = async () => {
		if (exportPending || discardingRef.current) return;
		discardingRef.current = true;
		if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current);
		pausePlayback();
		try {
			await montageV2Api.deleteMontageDraft(project.id);
			onDraftsChanged();
			onClose();
		} catch (cause) {
			discardingRef.current = false;
			setError(errorMessage(cause));
		}
	};
	const exportMontage = async (preset, exportId, targetSizeMb) => {
		setExportPending(true);
		setError(null);
		try {
			await montageV2Api.saveMontageDraft(projectRef.current);
			const exported = await montageV2Api.exportMontageV2({
				exportId,
				preset,
				targetSizeMb,
				project: projectRef.current
			});
			if (exported) onDraftsChanged();
			return exported;
		} catch (cause) {
			setError(errorMessage(cause));
			throw cause;
		} finally {
			setExportPending(false);
		}
	};
	const cancelExport = async (exportId) => {
		await montageV2Api.cancelMontageV2Export(exportId);
		setExportPending(false);
	};
	const closeComposer = (0, import_react.useCallback)(async () => {
		if (exportPending) {
			setError("Cancel the active export before closing this montage.");
			return;
		}
		pausePlayback();
		setSaveState("saving");
		try {
			await montageV2Api.saveMontageDraft(projectRef.current);
			setSaveState("saved");
			onDraftsChanged();
			onClose();
		} catch (cause) {
			setSaveState("error");
			setError(`Could not save the montage before closing: ${errorMessage(cause)}`);
		}
	}, [
		exportPending,
		onClose,
		onDraftsChanged,
		pausePlayback
	]);
	const keepFocusInside = (event) => {
		const target = event.target;
		if (event.defaultPrevented || !editorRef.current?.contains(target)) return;
		const typing = [
			"INPUT",
			"TEXTAREA",
			"SELECT"
		].includes(target.tagName) || target.isContentEditable || Boolean(target.closest("[role=\"combobox\"], [role=\"listbox\"], [role=\"menu\"]"));
		if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "y") {
			event.preventDefault();
			redo();
			return;
		}
		if (!typing && event.code === "Space" && !target.closest("button, [role=\"switch\"], [role=\"radio\"]")) {
			event.preventDefault();
			togglePlayback();
			return;
		}
		if (!typing && event.key === "Delete") {
			event.preventDefault();
			removeSelected();
			return;
		}
		if (!typing && event.key.toLocaleLowerCase() === "s") {
			event.preventDefault();
			splitSelected();
			return;
		}
		if (event.key === "Escape" && !viewerFullscreen && !event.defaultPrevented && !document.querySelector("[role=\"dialog\"][data-state=\"open\"]")) {
			event.preventDefault();
			closeComposer();
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
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		ref: editorRef,
		className: "montage-v2-shell",
		"data-editor-kind": project.sourceClipId ? "clip" : "montage",
		role: "dialog",
		"aria-modal": "true",
		"aria-labelledby": "montage-v2-title",
		onKeyDown: keepFocusInside,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "montage-v2-header no-drag",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						ref: backRef,
						type: "button",
						variant: "ghost",
						size: "sm",
						className: "px-2",
						onClick: () => void closeComposer(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, { className: "size-4" }), " Back to clips"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "montage-v2-header__identity",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "montage-v2-title",
							value: nameDraft,
							maxLength: 120,
							"aria-label": project.sourceClipId ? "Clip edit name" : "Montage name",
							onChange: (event) => setNameDraft(event.currentTarget.value),
							onBlur: () => {
								const name = nameDraft.trim() || (project.sourceClipId ? "Untitled clip" : "Untitled montage");
								setNameDraft(name);
								if (name !== project.name) changeProject({
									...project,
									name
								}, "project:name");
							},
							onKeyDown: (event) => {
								if (event.key === "Enter") event.currentTarget.blur();
								if (event.key === "Escape") {
									event.stopPropagation();
									setNameDraft(project.name);
								}
							}
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							"data-state": saveState,
							role: "status",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { "aria-hidden": "true" }), saveState === "saving" ? "Saving" : saveState === "error" ? "Not saved" : "Saved"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "montage-v2-header__actions",
						children: [
							sourceClipActions ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "ghost",
								size: "icon",
								"aria-label": sourceClipActions.clip.favorite ? "Unfavorite clip" : "Favorite clip",
								"aria-pressed": sourceClipActions.clip.favorite,
								onClick: () => sourceClipActions.onFavorite(!sourceClipActions.clip.favorite),
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: "size-4" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "ghost",
								size: "icon",
								"aria-label": "Rename source clip",
								onClick: sourceClipActions.onRename,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "size-4" })
							})] }) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "montage-v2-output",
								children: ["Canvas", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
									value: project.canvasSize,
									onValueChange: (value) => changeProject({
										...project,
										canvasSize: value
									}),
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
										"aria-label": project.sourceClipId ? "Clip canvas" : "Montage canvas",
										className: "no-drag w-32",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "original",
											children: "Original"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "16:9",
											children: "16:9 landscape"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "9:16",
											children: "9:16 vertical"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "1:1",
											children: "1:1 square"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
											value: "4:5",
											children: "4:5 portrait"
										})
									] })]
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									size: "icon",
									"aria-label": inspectorOpen ? "Collapse inspector" : "Open inspector",
									onClick: () => onInspectorOpenChange(!inspectorOpen),
									children: inspectorOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightClose, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PanelRightOpen, { className: "size-4" })
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: inspectorOpen ? "Collapse inspector" : "Open inspector" })] }),
							representativeClip ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShareClipDialog, {
								clip: representativeClip,
								startMs: 0,
								endMs: project.durationMs,
								selectedDurationMs: project.durationMs,
								getPreviewCanvas: () => {
									pausePlayback();
									return editorRef.current?.querySelector(".edited-video-frame canvas") ?? null;
								},
								sourceBytes: proportionalBytes,
								projectType: project.sourceClipId ? "single" : "montage",
								segmentCount: project.segments.length,
								exportPending,
								disabled: missingSegmentCount > 0 || project.durationMs < 100,
								onExport: exportMontage,
								onCancelExport: cancelExport
							}) : null,
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									type: "button",
									variant: "ghost",
									size: "icon",
									"aria-label": "Discard montage draft",
									onClick: () => void discardDraft(),
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-4" })
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "Discard draft" })] })
						]
					})
				]
			}),
			error || musicPreviewWarning || missingSegmentCount > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-notice",
				"data-error": Boolean(error || missingSegmentCount) || void 0,
				role: error ? "alert" : "status",
				children: [error ?? (missingSegmentCount > 0 ? `${missingSegmentCount} montage ${missingSegmentCount === 1 ? "segment references" : "segments reference"} missing media. Remove or restore the source before export.` : musicPreviewWarning), error === draftSaveError ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: saveState === "saving",
					onClick: () => void persistDraft(projectRef.current),
					children: saveState === "saving" ? "Saving…" : "Retry save"
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						setError(null);
						setMusicPreviewWarning(null);
					},
					children: "Dismiss"
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-layout",
				"data-inspector": inspectorOpen ? "open" : "closed",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
					className: "montage-v2-workspace",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "montage-v2-preview",
						"data-edited": "true",
						"data-state": previewState,
						"data-fullscreen": viewerFullscreen || void 0,
						"data-canvas": project.canvasSize,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
								ref: videoARef,
								muted: true,
								"data-slot": "0",
								"data-active": activeSlot === 0 || void 0,
								preload: "metadata",
								"aria-label": "Montage preview"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
								ref: videoBRef,
								muted: true,
								"data-slot": "1",
								"data-active": activeSlot === 1 || void 0,
								preload: "metadata",
								"aria-hidden": activeSlot !== 1
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditedAudioPreview, {
								state: (() => {
									const mapping = mapMontageTime(project.segments, currentMs);
									return mapping ? {
										segment: mapping.segment,
										sourceMs: mapping.sourceTimeMs,
										frozen: mapping.frozen,
										playing,
										volume: masterVolume,
										muted: previewMuted,
										ducking: project.music?.ducking
									} : null;
								})(),
								onDuckGain: (gain) => {
									duckGainRef.current = gain;
								},
								onError: setMusicPreviewWarning
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EditedVideoCanvas, {
								videoRef: activeSlot === 0 ? videoARef : videoBRef,
								edits: mapMontageTime(project.segments, currentMs)?.segment.videoEdits,
								canvasSize: project.canvasSize,
								sourceMs: mapMontageTime(project.segments, currentMs)?.sourceTimeMs ?? 0,
								startMs: mapMontageTime(project.segments, currentMs)?.segment.trimStartMs ?? 0,
								tool: editTool,
								selectedOverlayId,
								onPause: pausePlayback,
								onChange: (videoEdits, key) => {
									const segment = mapMontageTime(projectRef.current.segments, currentMsRef.current)?.segment;
									if (segment) changeProject(updateMontageSegment(projectRef.current, segment.id, (item) => ({
										...item,
										videoEdits
									})), key);
								}
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
								ref: musicRef,
								preload: "metadata"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "montage-v2-preview__transport no-drag",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-preview__playback",
									role: "group",
									"aria-label": "Playback controls",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": "Back to start",
											onClick: () => void seekMontage(0, false),
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipBack, {})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "montage-v2-play",
											disabled: previewState !== "ready",
											onClick: () => void togglePlayback(),
											children: [playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, {}), playing ? "Pause" : "Play"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", {
											"aria-label": "Playback time",
											children: [
												formatEditorTime(currentMs),
												" ",
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["/ ", formatEditorTime(project.durationMs)] })
											]
										})
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-preview__utilities",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": previewMuted ? "Unmute preview" : "Mute preview",
											onClick: () => {
												const next = !previewMuted;
												setPreviewMuted(next);
												previewMutedRef.current = next;
												if (musicRef.current) musicRef.current.muted = next;
											},
											children: previewMuted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, {})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
											className: "montage-v2-preview__volume",
											min: 0,
											max: 100,
											step: 1,
											value: [Math.round(masterVolume * 100)],
											"aria-label": "Preview volume",
											onValueChange: ([value]) => {
												if (typeof value !== "number") return;
												const next = value / 100;
												setMasterVolume(next);
												masterVolumeRef.current = next;
												const mapping = mapMontageTime(projectRef.current.segments, currentMsRef.current);
												const video = activeSlotRef.current === 0 ? videoARef.current : videoBRef.current;
												if (mapping && video) applyVideoVolume(video, mapping.segment);
												syncMusic(currentMsRef.current, false);
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
											type: "button",
											"aria-label": viewerFullscreen ? "Exit fullscreen" : "Enter fullscreen",
											onClick: () => setViewerFullscreen((current) => !current),
											children: viewerFullscreen ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Minimize, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Maximize, {})
										})
									]
								})]
							}),
							previewState !== "ready" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "montage-v2-preview__status",
								role: previewState === "error" ? "alert" : "status",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: previewState === "error" ? "Preview unavailable" : "Preparing montage" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: previewState === "error" ? "Check the selected source clip." : "Loading the current segment and audio…" })]
							}) : null
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageV2Timeline, {
						project,
						clips,
						selectedSegmentId,
						currentMs,
						zoom,
						waveform,
						canUndo: history.past.length > 0,
						canRedo: history.future.length > 0,
						musicPending,
						onEditMusic: openMusicSettings,
						onZoomChange: setZoom,
						onProjectChange: changeProject,
						onSelectSegment: (id) => {
							setSelectedSegmentId(id);
							setInspectorSection("segment");
						},
						onSeek: (timeMs) => void seekMontage(timeMs, false),
						onAddClips: () => setAddClipsOpen(true),
						onAddMusic: () => void importMusic(),
						onDuplicate: duplicateSelected,
						onSplit: splitSelected,
						onRemove: removeSelected,
						onUndo: undo,
						onRedo: redo
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("aside", {
					className: "montage-v2-inspector",
					"aria-label": project.sourceClipId ? "Clip inspector" : "Montage inspector",
					"aria-hidden": !inspectorOpen || void 0,
					inert: !inspectorOpen ? true : void 0,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
						className: "h-full",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "montage-v2-inspector__content",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-inspector-tabs",
									role: "group",
									"aria-label": "Inspector section",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "ghost",
										size: "sm",
										"aria-pressed": inspectorSection === "segment",
										onClick: () => setInspectorSection("segment"),
										children: "Selected clip"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										variant: "ghost",
										size: "sm",
										"aria-pressed": inspectorSection === "music",
										onClick: openMusicSettings,
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, { className: "size-3.5" }), "Music"]
									})]
								}),
								inspectorSection === "segment" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-inspector__heading",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: project.sourceClipId ? "Clip inspector" : "Montage inspector" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: selectedClip?.name ?? "Missing source" }),
										selectedClip ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											onClick: () => onReveal(selectedClip),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {}), " Show source"]
										}) : null
									]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
									title: "Trim & edit",
									children: selectedSegment && selectedClip ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTrimControls, {
											startMs: selectedSegment.trimStartMs,
											endMs: selectedSegment.trimEndMs,
											durationMs: selectedSegment.sourceDurationMs,
											fps: selectedClip?.fps ?? 30,
											onChange: (trimStartMs, trimEndMs) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
												...segment,
												trimStartMs,
												trimEndMs
											})), `segment:${selectedSegment.id}:trim`),
											getCurrentMs: () => mapMontageTime(projectRef.current.segments, currentMsRef.current)?.sourceTimeMs ?? selectedSegment.trimStartMs,
											onSeek: (sourceMs) => {
												const current = projectRef.current;
												const segment = current.segments.find((item) => item.id === selectedSegment.id);
												seekMontage(montageStartForSegment(current.segments, segment.id) + sourceToEditedMs(segment.trimStartMs, sourceMs, segment.videoEdits));
											}
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AdvancedVideoControls, {
											edits: selectedSegment.videoEdits,
											clip: selectedClip,
											startMs: selectedSegment.trimStartMs,
											endMs: selectedSegment.trimEndMs,
											audioTrackTrims: selectedSegment.audioTrackTrims,
											onTrackTrim: (index, trim) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => {
												const audioTrackTrims = [...segment.audioTrackTrims ?? []];
												while (audioTrackTrims.length <= index) audioTrackTrims.push(null);
												audioTrackTrims[index] = trim;
												return {
													...segment,
													audioTrackTrims
												};
											}), `track-trim:${selectedSegment.id}:${index}`),
											currentMs: mapMontageTime(project.segments, currentMs)?.sourceTimeMs ?? selectedSegment.trimStartMs,
											tool: editTool,
											onToolChange: setEditTool,
											selectedOverlayId,
											onSelectOverlay: setSelectedOverlayId,
											onSeek: (sourceMs) => {
												seekMontage(montageStartForSegment(project.segments, selectedSegment.id) + sourceToEditedMs(selectedSegment.trimStartMs, sourceMs, selectedSegment.videoEdits));
											},
											onChange: (videoEdits, key) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
												...segment,
												videoEdits
											})), key)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
											className: "editor-source-details",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "Clip audio & source" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "montage-v2-readout-grid",
													children: [
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
															label: "Position",
															value: `${project.segments.findIndex((segment) => segment.id === selectedSegment.id) + 1} of ${project.segments.length}`
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
															label: "Source",
															value: selectedClip ? formatVideoQuality(selectedClip.width, selectedClip.height, selectedClip.fps) : "Unavailable"
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
															label: "Duration",
															value: formatDuration(segmentDurationMs(selectedSegment) / 1e3)
														}),
														/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Readout, {
															label: "Size",
															value: selectedClip ? formatBytes(selectedClip.fileSize) : "Unavailable"
														})
													]
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabeledSlider, {
													label: "Clip audio",
													value: selectedSegment.muted ? 0 : Math.round(selectedSegment.volume * 100),
													onChange: (value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
														...segment,
														muted: false,
														volume: value / 100
													})), `segment:${selectedSegment.id}:volume`)
												}),
												selectedClip?.audioChannels && selectedClip.audioChannels.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
													className: "montage-v2-channel-mix",
													children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Source-channel levels apply to preview and export." }), selectedClip.audioChannels.map((channel, trackIndex) => {
														const level = selectedSegment.audioTrackLevels?.[trackIndex] ?? 100;
														return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
															style: { "--track-color": channelColor(channel) },
															children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
																/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": "true" }),
																channelLabels[channel],
																/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [level, "%"] })
															] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
																min: 0,
																max: 100,
																step: 1,
																value: [level],
																"aria-label": `${channelLabels[channel]} export level`,
																onValueChange: ([next]) => {
																	if (typeof next !== "number") return;
																	changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => {
																		const levels = [...segment.audioTrackLevels ?? []];
																		while (levels.length <= trackIndex) levels.push(100);
																		levels[trackIndex] = next;
																		while (levels.at(-1) === 100) levels.pop();
																		return {
																			...segment,
																			audioTrackLevels: levels.length > 0 ? levels : void 0
																		};
																	}), `segment:${selectedSegment.id}:track:${trackIndex}`);
																}
															})]
														}, `${channel}-${trackIndex}`);
													})]
												}) : null
											]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
											type: "button",
											variant: "secondary",
											size: "sm",
											className: "w-full",
											onClick: () => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
												...segment,
												muted: !segment.muted
											}))),
											children: [selectedSegment.muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-3.5" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-3.5" }), selectedSegment.muted ? "Restore clip audio" : "Mute clip audio"]
										})
									] }) : null
								})] }) : null,
								inspectorSection === "music" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									ref: musicSettingsRef,
									className: "montage-v2-music-settings",
									tabIndex: -1,
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
										title: "Music",
										children: !project.music ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "montage-v2-music-empty-state",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, { "aria-hidden": "true" }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Add a local audio file beneath the clip sequence." }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
													type: "button",
													variant: "primary",
													size: "sm",
													disabled: musicPending,
													onClick: () => void importMusic(),
													children: musicPending ? "Importing…" : "Choose audio file"
												})
											]
										}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-music-identity",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Music2, {}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: project.music.asset.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [
													formatDuration(project.music.asset.durationMs / 1e3),
													" · ",
													formatBytes(project.music.asset.fileSize)
												] })] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
													type: "button",
													onClick: () => changeProject({
														...project,
														music: void 0
													}),
													children: "Remove"
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "editor-music-trim",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "editor-music-waveform",
														"aria-label": "Music source waveform",
														children: [
															waveform?.samples.length ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", {
																viewBox: "0 0 240 48",
																preserveAspectRatio: "none",
																"aria-hidden": "true",
																children: waveform.samples.map((sample, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
																	x1: index / waveform.samples.length * 240,
																	x2: index / waveform.samples.length * 240,
																	y1: 24 - sample * 22,
																	y2: 24 + sample * 22
																}, index))
															}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: musicPreviewWarning ? "Waveform unavailable" : "Reading waveform…" }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: {
																left: 0,
																width: `${project.music.sourceStartMs / project.music.asset.durationMs * 100}%`
															} }),
															/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { style: {
																right: 0,
																width: `${(1 - project.music.sourceEndMs / project.music.asset.durationMs) * 100}%`
															} })
														]
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
														min: 0,
														max: project.music.asset.durationMs,
														step: 1,
														minStepsBetweenThumbs: 100,
														value: [project.music.sourceStartMs, project.music.sourceEndMs],
														thumbLabels: ["Music trim start", "Music trim end"],
														thumbValueText: [formatEditorTime(project.music.sourceStartMs), formatEditorTime(project.music.sourceEndMs)],
														onValueChange: ([sourceStartMs, sourceEndMs]) => {
															if (sourceStartMs === void 0 || sourceEndMs === void 0) return;
															changeProject(updateMontageMusic(project, (track) => ({
																...track,
																sourceStartMs,
																sourceEndMs
															})), "music:trim");
														}
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { children: [
														formatEditorTime(project.music.sourceEndMs - project.music.sourceStartMs),
														" selected",
														project.music.loop ? " · Loops to fill montage" : ""
													] })
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-inline-fields",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
													label: "Source in",
													valueMs: project.music.sourceStartMs,
													maximumMs: project.music.sourceEndMs - 100,
													onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														sourceStartMs: value
													})), "music:source-in")
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
													label: "Source out",
													valueMs: project.music.sourceEndMs,
													minimumMs: project.music.sourceStartMs + 100,
													maximumMs: project.music.asset.durationMs,
													onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														sourceEndMs: value
													})), "music:source-out")
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)(LabeledSlider, {
												label: "Music volume",
												value: project.music.muted ? 0 : Math.round(project.music.volume * 100),
												onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
													...track,
													muted: false,
													volume: value / 100
												})), "music:volume")
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-inline-fields",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
													label: "Timeline start",
													valueMs: project.music.timelineStartMs,
													maximumMs: project.durationMs - 1,
													onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														timelineStartMs: value
													})), "music:start")
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
													label: "Fade in",
													valueMs: project.music.fadeInMs,
													maximumMs: 3e4,
													onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														fadeInMs: value
													})), "music:fade-in")
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "montage-v2-inline-fields",
												children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreciseTimeField, {
													label: "Fade out",
													valueMs: project.music.fadeOutMs,
													maximumMs: 3e4,
													onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														fadeOutMs: value
													})), "music:fade-out")
												})
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-switch-field",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Loop track" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Fill remaining montage" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
													checked: project.music.loop,
													onCheckedChange: (loop) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														loop
													}))),
													"aria-label": "Loop music track"
												})]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
												className: "advanced-music-automation",
												children: [
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)("summary", { children: "Volume automation & voice ducking" }),
													/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioAutomationControls, {
														automation: project.music.automation ?? {
															points: [],
															mutes: []
														},
														currentMs,
														startMs: 0,
														endMs: project.durationMs,
														onSeek: (time) => {
															seekMontage(time);
														},
														onChange: (automation, key) => changeProject(updateMontageMusic(project, (track) => ({
															...track,
															automation
														})), key ? `music:automation:${key}` : void 0)
													}),
													/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
														className: "montage-v2-switch-field",
														children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Duck music under voice" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Uses activity on the separate microphone track" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
															"aria-label": "Duck music under voice",
															checked: project.music.ducking?.enabled ?? false,
															disabled: !project.segments.some((segment) => clipsById.get(segment.clipId)?.audioChannels?.includes("microphone")),
															onCheckedChange: (enabled) => changeProject(updateMontageMusic(project, (track) => ({
																...track,
																ducking: {
																	amount: .75,
																	attackMs: 80,
																	releaseMs: 500,
																	...track.ducking,
																	enabled
																}
															})))
														})]
													}),
													!project.segments.some((segment) => clipsById.get(segment.clipId)?.audioChannels?.includes("microphone")) ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "A separate microphone track is required." }) : null,
													project.music.ducking?.enabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberControl, {
														label: "Ducking reduction %",
														value: project.music.ducking.amount * 100,
														onChange: (amount) => changeProject(updateMontageMusic(project, (track) => ({
															...track,
															ducking: {
																...track.ducking,
																amount: amount / 100
															}
														})), "music:ducking")
													}) : null
												]
											}),
											/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-music-actions",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
													type: "button",
													variant: "secondary",
													size: "sm",
													disabled: musicPending,
													onClick: () => void importMusic(),
													children: musicPending ? "Importing…" : "Replace music"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
													type: "button",
													variant: "ghost",
													size: "sm",
													onClick: () => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														muted: !track.muted
													}))),
													children: project.music.muted ? "Unmute" : "Mute"
												})]
											})
										] })
									})
								}) : null
							]
						})
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddMontageClipsDialog, {
				open: addClipsOpen,
				clips,
				onOpenChange: setAddClipsOpen,
				onAdd: (nextClips) => {
					const next = addClipsToMontage(projectRef.current, nextClips, selectedSegmentId);
					changeProject(next);
					const selectedIndex = next.segments.findIndex((segment) => segment.id === selectedSegmentId);
					const added = next.segments[selectedIndex + 1];
					if (added) setSelectedSegmentId(added.id);
				}
			})
		]
	});
	function applyVideoVolume(video, segment) {
		video.playbackRate = speedAt(video.currentTime * 1e3, segment.videoEdits);
		video.preservesPitch = true;
		video.muted = true;
		video.volume = clamp((segment.muted ? 0 : segment.volume) * masterVolumeRef.current, 0, 1);
	}
}
function InspectorSection({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-v2-inspector__section",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }), children]
	});
}
function Readout({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: value })] });
}
function LabeledSlider({ label, value, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "montage-v2-slider-field",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [value, "%"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
			min: 0,
			max: 100,
			step: 1,
			value: [value],
			onValueChange: ([next]) => {
				if (typeof next === "number") onChange(next);
			},
			"aria-label": label
		})]
	});
}
async function prepareVideo(video, clipId, sourceTimeMs) {
	if (video.dataset.clipId !== clipId) {
		video.dataset.clipId = clipId;
		video.src = `switchboard-media://clip/${encodeURIComponent(clipId)}`;
		video.preload = "auto";
		video.load();
	}
	if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitForMetadata(video);
	if (video.dataset.clipId !== clipId) throw new Error("Preview source changed during seek.");
	video.currentTime = Math.max(0, sourceTimeMs) / 1e3;
}
function waitForMetadata(media) {
	if (media.error) return Promise.reject(/* @__PURE__ */ new Error("Media metadata could not be read."));
	if (media.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
	return new Promise((resolve, reject) => {
		const finish = () => {
			cleanup();
			resolve();
		};
		const fail = () => {
			cleanup();
			reject(/* @__PURE__ */ new Error("Media metadata could not be read."));
		};
		const cleanup = () => {
			window.clearTimeout(timeout);
			media.removeEventListener("loadedmetadata", finish);
			media.removeEventListener("error", fail);
			media.removeEventListener("abort", fail);
		};
		const timeout = window.setTimeout(fail, 1e4);
		media.addEventListener("loadedmetadata", finish, { once: true });
		media.addEventListener("error", fail, { once: true });
		media.addEventListener("abort", fail, { once: true });
	});
}
function formatEditorTime(milliseconds) {
	const value = Math.max(0, Math.round(milliseconds));
	const minutes = Math.floor(value / 6e4);
	const seconds = Math.floor(value / 1e3) % 60;
	const millis = value % 1e3;
	return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}
function focusableElements(root) {
	if (!root) return [];
	return [...root.querySelectorAll("a[href], summary, button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])")].filter((element) => !element.closest("[hidden], [inert], [aria-hidden=\"true\"]") && element.getClientRects().length > 0);
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}
//#endregion
export { MontageComposer };
