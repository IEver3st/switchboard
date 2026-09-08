import { L as require_jsx_runtime, M as cn, N as createLucideIcon, V as __toESM, t as switchboardApi, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-Dzg1fQmA.js";
import { a as DropdownMenuTrigger, c as AppWindow, i as DropdownMenuSeparator, n as DropdownMenuContent, o as SlidersHorizontal, r as DropdownMenuItem, s as Ellipsis, t as DropdownMenu } from "./dropdown-menu-BiaAmvUT.js";
import { t as MicVocal } from "./mic-vocal-C4acGG-V.js";
import { a as Music2, i as Save, n as mixerChannelOrder, r as VolumeX, t as channelColor } from "./channel-identity-GMsL-QZN.js";
import { v as Pencil } from "./dist-QFVzjJjP.js";
import { Bt as Copy, Ct as Trash2, Et as RotateCcw, F as SliderTrack, I as Input, It as Gamepad2, L as ScrollArea, M as Slider$1, N as SliderRange, Ot as Plus, P as SliderThumb, R as useSystemStore, Vt as Circle, dt as SelectItem, ft as SelectTrigger, j as Slider, lt as Select, pt as SelectValue, st as Button, ut as SelectContent, vt as X, yt as Volume2, z as Switch, zt as Download } from "./index-Cqk9uQ3G.js";
import { n as PopoverContent, r as PopoverTrigger, t as Popover } from "./popover-lRMNz-1W.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-Bj4P2x-X.js";
import { t as Badge } from "./badge-BIQpL-xP.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var CircleSlash2 = createLucideIcon("circle-slash-2", [["circle", {
	cx: "12",
	cy: "12",
	r: "10",
	key: "1mglay"
}], ["path", {
	d: "M22 2 2 22",
	key: "y4kqgn"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var MessageCircle = createLucideIcon("message-circle", [["path", {
	d: "M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719",
	key: "1sd12s"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Power = createLucideIcon("power", [["path", {
	d: "M12 2v10",
	key: "mnfbl"
}], ["path", {
	d: "M18.4 6.6a9 9 0 1 1-12.77.04",
	key: "obofu9"
}]]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var SlidersVertical = createLucideIcon("sliders-vertical", [
	["path", {
		d: "M10 8h4",
		key: "1sr2af"
	}],
	["path", {
		d: "M12 21v-9",
		key: "17s77i"
	}],
	["path", {
		d: "M12 8V3",
		key: "13r4qs"
	}],
	["path", {
		d: "M17 16h4",
		key: "h1uq16"
	}],
	["path", {
		d: "M19 12V3",
		key: "o1uvq1"
	}],
	["path", {
		d: "M19 21v-5",
		key: "qua636"
	}],
	["path", {
		d: "M3 14h4",
		key: "bcjad9"
	}],
	["path", {
		d: "M5 10V3",
		key: "cb8scm"
	}],
	["path", {
		d: "M5 21v-7",
		key: "1w1uti"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Upload = createLucideIcon("upload", [
	["path", {
		d: "M12 3v12",
		key: "1x0j5s"
	}],
	["path", {
		d: "m17 8-5-5-5 5",
		key: "7q97r8"
	}],
	["path", {
		d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",
		key: "ih7n3h"
	}]
]);
//#endregion
//#region src/renderer/src/components/audio/AudioHeader.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var audioWorkspaceTabs = [
	"mixer",
	"game",
	"chat",
	"media",
	"microphone"
];
var tabLabels = {
	mixer: "Mixer",
	game: "Game",
	chat: "Chat",
	media: "Media",
	microphone: "Microphone"
};
var tabIcons = {
	mixer: SlidersHorizontal,
	game: Gamepad2,
	chat: MessageCircle,
	media: Music2,
	microphone: MicVocal
};
var tabColors = {
	mixer: "var(--accent-brand)",
	game: "var(--channel-game)",
	chat: "var(--channel-chat)",
	media: "var(--channel-media)",
	microphone: "var(--channel-microphone)"
};
function AudioHeader({ value, onChange, tabs = audioWorkspaceTabs, statusLine, end }) {
	const onKeyDown = (event) => {
		const currentIndex = tabs.indexOf(value);
		let nextIndex = currentIndex;
		if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
		else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
		else if (event.key === "Home") nextIndex = 0;
		else if (event.key === "End") nextIndex = tabs.length - 1;
		else return;
		event.preventDefault();
		const next = tabs[nextIndex];
		if (!next) return;
		onChange(next);
		requestAnimationFrame(() => document.getElementById(`audio-tab-${next}`)?.focus());
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "audio-header",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-header__identity",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Audio" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					"aria-live": "polite",
					children: statusLine
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				role: "tablist",
				"aria-label": "Audio workspace",
				className: "audio-header__tabs",
				onKeyDown,
				children: tabs.map((tab) => {
					const Icon = tabIcons[tab];
					const selected = value === tab;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						id: `audio-tab-${tab}`,
						type: "button",
						role: "tab",
						"aria-selected": selected,
						"aria-controls": `audio-panel-${tab}`,
						"data-audio-tab": tab,
						tabIndex: selected ? 0 : -1,
						onClick: () => onChange(tab),
						className: cn("audio-header__tab", selected && "is-active"),
						style: { "--tab-color": tabColors[tab] },
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { "aria-hidden": "true" }), tabLabels[tab]]
					}, tab);
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-header__end",
				children: end
			})
		]
	});
}
function audioStatusLine({ tab, engineRunning, realtimeMetering, routingSupport, processingSupport }) {
	if (!engineRunning) return "Audio engine off · Turn on in Settings";
	if (tab === "mixer" && routingSupport === "unavailable") return "Routing unavailable · Mix settings are saved";
	if (tab === "mixer" && realtimeMetering !== "available") return "Live levels unavailable";
	if (tab !== "mixer" && processingSupport !== "available") return "Processing unavailable for this channel";
	return tab === "mixer" ? "Live mix levels" : "Live processing controls";
}
//#endregion
//#region src/renderer/src/lib/eq-response.ts
var SAMPLE_RATE = 48e3;
function clamp$1(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
function coefficients(band) {
	const frequency = clamp$1(band.frequency, 20, SAMPLE_RATE / 2 - 1);
	const omega = 2 * Math.PI * frequency / SAMPLE_RATE;
	const cosine = Math.cos(omega);
	const sine = Math.sin(omega);
	const amplitude = 10 ** (band.gainDb / 40);
	const alphaQ = sine / (2 * Math.max(.2, band.q));
	if (band.type === "bell") return {
		b0: 1 + alphaQ * amplitude,
		b1: -2 * cosine,
		b2: 1 - alphaQ * amplitude,
		a0: 1 + alphaQ / amplitude,
		a1: -2 * cosine,
		a2: 1 - alphaQ / amplitude
	};
	const alpha = alphaQ;
	const beta = 2 * Math.sqrt(amplitude) * alpha;
	if (band.type === "low-shelf") return {
		b0: amplitude * (amplitude + 1 - (amplitude - 1) * cosine + beta),
		b1: 2 * amplitude * (amplitude - 1 - (amplitude + 1) * cosine),
		b2: amplitude * (amplitude + 1 - (amplitude - 1) * cosine - beta),
		a0: amplitude + 1 + (amplitude - 1) * cosine + beta,
		a1: -2 * (amplitude - 1 + (amplitude + 1) * cosine),
		a2: amplitude + 1 + (amplitude - 1) * cosine - beta
	};
	return {
		b0: amplitude * (amplitude + 1 + (amplitude - 1) * cosine + beta),
		b1: -2 * amplitude * (amplitude - 1 + (amplitude + 1) * cosine),
		b2: amplitude * (amplitude + 1 + (amplitude - 1) * cosine - beta),
		a0: amplitude + 1 - (amplitude - 1) * cosine + beta,
		a1: 2 * (amplitude - 1 - (amplitude + 1) * cosine),
		a2: amplitude + 1 - (amplitude - 1) * cosine - beta
	};
}
function magnitudeAt(frequency, biquad) {
	const omega = 2 * Math.PI * frequency / SAMPLE_RATE;
	const cosine = Math.cos(omega);
	const sine = Math.sin(omega);
	const cosine2 = Math.cos(2 * omega);
	const sine2 = Math.sin(2 * omega);
	const numeratorReal = biquad.b0 + biquad.b1 * cosine + biquad.b2 * cosine2;
	const numeratorImaginary = -biquad.b1 * sine - biquad.b2 * sine2;
	const denominatorReal = biquad.a0 + biquad.a1 * cosine + biquad.a2 * cosine2;
	const denominatorImaginary = -biquad.a1 * sine - biquad.a2 * sine2;
	const numerator = numeratorReal ** 2 + numeratorImaginary ** 2;
	const denominator = denominatorReal ** 2 + denominatorImaginary ** 2;
	return Math.sqrt(numerator / Math.max(Number.EPSILON, denominator));
}
function equalizerResponseDb(frequency, bands) {
	let response = 0;
	for (const band of bands) {
		if (!band.enabled || Math.abs(band.gainDb) < 1e-4) continue;
		response += 20 * Math.log10(Math.max(Number.EPSILON, magnitudeAt(frequency, coefficients(band))));
	}
	return clamp$1(response, -12, 12);
}
//#endregion
//#region src/renderer/src/components/audio/ParametricEq.tsx
var FALLBACK_GEOMETRY = {
	width: 960,
	height: 344
};
var PLOT_LEFT = 48;
var PLOT_RIGHT = 18;
var PLOT_TOP = 46;
var PLOT_BOTTOM = 34;
var FREQUENCY_TICKS = [
	20,
	50,
	100,
	200,
	500,
	1e3,
	2e3,
	5e3,
	1e4,
	2e4
];
var GAIN_TICKS = [
	-12,
	-6,
	0,
	6,
	12
];
var FREQUENCY_REGIONS = [
	{
		label: "Sub bass",
		from: 20,
		to: 60
	},
	{
		label: "Bass",
		from: 60,
		to: 250
	},
	{
		label: "Low mids",
		from: 250,
		to: 500
	},
	{
		label: "Mid range",
		from: 500,
		to: 2e3
	},
	{
		label: "Upper mids",
		from: 2e3,
		to: 6e3
	},
	{
		label: "Highs",
		from: 6e3,
		to: 2e4
	}
];
var NODE_COLORS = [
	"var(--eq-band-1)",
	"var(--eq-band-2)",
	"var(--eq-band-3)",
	"var(--eq-band-4)",
	"var(--eq-band-5)",
	"var(--eq-band-6)",
	"var(--eq-band-7)",
	"var(--eq-band-8)"
];
function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}
function plotWidth(geometry) {
	return geometry.width - PLOT_LEFT - PLOT_RIGHT;
}
function plotHeight(geometry) {
	return geometry.height - PLOT_TOP - PLOT_BOTTOM;
}
function frequencyToX(frequency, geometry) {
	return PLOT_LEFT + Math.log10(frequency / 20) / 3 * plotWidth(geometry);
}
function xToFrequency(x, geometry) {
	return clamp(20 * 10 ** ((x - PLOT_LEFT) / plotWidth(geometry) * 3), 20, 2e4);
}
function gainToY(gain, geometry) {
	return PLOT_TOP + (12 - gain) / 24 * plotHeight(geometry);
}
function yToGain(y, geometry) {
	return clamp(12 - (y - PLOT_TOP) / plotHeight(geometry) * 24, -12, 12);
}
function curvePath(bands, geometry) {
	return Array.from({ length: 240 }, (_, index) => {
		const frequency = 20 * 10 ** (index / 239 * 3);
		return `${index === 0 ? "M" : "L"} ${frequencyToX(frequency, geometry).toFixed(2)} ${gainToY(equalizerResponseDb(frequency, bands), geometry).toFixed(2)}`;
	}).join(" ");
}
function frequencyLabel(value) {
	return value >= 1e3 ? `${value / 1e3} kHz` : `${value} Hz`;
}
function frequencyReadout(frequency) {
	if (frequency >= 1e3) {
		const kHz = frequency / 1e3;
		return `${Number.isInteger(kHz) ? kHz : kHz.toFixed(1)} kHz`;
	}
	return `${frequency} Hz`;
}
function ParametricEq({ bands, disabled, onCommit }) {
	const [draft, setDraft] = (0, import_react.useState)(bands);
	const [selectedId, setSelectedId] = (0, import_react.useState)(bands[0]?.id ?? "");
	const [geometry, setGeometry] = (0, import_react.useState)(FALLBACK_GEOMETRY);
	const stageRef = (0, import_react.useRef)(null);
	const dragIdRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => setDraft(bands), [bands, disabled]);
	(0, import_react.useEffect)(() => {
		if (!draft.some((band) => band.id === selectedId)) setSelectedId(draft[0]?.id ?? "");
	}, [draft, selectedId]);
	(0, import_react.useEffect)(() => {
		const stage = stageRef.current;
		if (!stage || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			if (width > 0 && height > 0) setGeometry({
				width: Math.round(width),
				height: Math.round(height)
			});
		});
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);
	const selected = draft.find((band) => band.id === selectedId) ?? draft[0];
	const path = (0, import_react.useMemo)(() => curvePath(draft, geometry), [draft, geometry]);
	const updateBand = (id, update, commit = false) => {
		if (disabled) return;
		const next = draft.map((band) => band.id === id ? {
			...band,
			...update
		} : band);
		setDraft(next);
		if (commit) onCommit(next);
	};
	const updateBandFromPointer = (id, event, commit) => {
		const svg = event.currentTarget.ownerSVGElement;
		if (!svg) return;
		const bounds = svg.getBoundingClientRect();
		const x = (event.clientX - bounds.left) / bounds.width * geometry.width;
		const y = (event.clientY - bounds.top) / bounds.height * geometry.height;
		updateBand(id, {
			frequency: Math.round(xToFrequency(x, geometry)),
			gainDb: Math.round(yToGain(y, geometry) * 10) / 10
		}, commit);
	};
	const handleNodeKeyDown = (band, event) => {
		const frequencyStep = event.shiftKey ? 1.015 : 1.06;
		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			const frequency = event.key === "ArrowRight" ? band.frequency * frequencyStep : band.frequency / frequencyStep;
			updateBand(band.id, { frequency: Math.round(clamp(frequency, 20, 2e4)) }, true);
			return;
		}
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			const step = event.shiftKey ? .1 : .5;
			updateBand(band.id, { gainDb: clamp(band.gainDb + (event.key === "ArrowUp" ? step : -step), -12, 12) }, true);
		}
	};
	if (!selected) return null;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("audio-eq parametric-eq", disabled && "is-disabled"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			ref: stageRef,
			className: "parametric-eq__stage",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
				viewBox: `0 0 ${geometry.width} ${geometry.height}`,
				className: "audio-eq__graph parametric-eq__graph",
				"aria-label": "Equalizer response. Drag a band to change frequency and gain.",
				children: [
					FREQUENCY_TICKS.map((frequency) => {
						const x = frequencyToX(frequency, geometry);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
							x1: x,
							x2: x,
							y1: PLOT_TOP,
							y2: geometry.height - PLOT_BOTTOM,
							stroke: "color-mix(in srgb, var(--border) 62%, transparent)",
							strokeWidth: "1"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
							x,
							y: geometry.height - 8,
							fill: "var(--text-muted)",
							opacity: "0.9",
							fontSize: "10",
							textAnchor: "middle",
							children: frequencyLabel(frequency)
						})] }, frequency);
					}),
					GAIN_TICKS.map((gain) => {
						const y = gainToY(gain, geometry);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
							x1: PLOT_LEFT,
							x2: geometry.width - PLOT_RIGHT,
							y1: y,
							y2: y,
							stroke: gain === 0 ? "var(--border-strong)" : "var(--border)",
							strokeWidth: gain === 0 ? 1.5 : 1
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("text", {
							x: 40,
							y: y + 3,
							fill: "var(--text-muted)",
							opacity: "0.9",
							fontSize: "10",
							textAnchor: "end",
							children: [gain > 0 ? "+" : "", gain]
						})] }, gain);
					}),
					FREQUENCY_REGIONS.map((region) => {
						const from = frequencyToX(region.from, geometry);
						const to = frequencyToX(region.to, geometry);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("g", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("text", {
							x: (from + to) / 2,
							y: 22,
							fill: "var(--text-muted)",
							opacity: "0.72",
							fontSize: "8.5",
							fontWeight: "620",
							letterSpacing: "0.09em",
							textAnchor: "middle",
							children: region.label.toUpperCase()
						}) }, region.label);
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", {
						x1: frequencyToX(selected.frequency, geometry),
						x2: frequencyToX(selected.frequency, geometry),
						y1: PLOT_TOP,
						y2: geometry.height - PLOT_BOTTOM,
						stroke: "var(--control-accent)",
						strokeWidth: "1",
						strokeDasharray: "1 3",
						opacity: "0.45"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: `${path} L ${geometry.width - PLOT_RIGHT} ${geometry.height - PLOT_BOTTOM} L ${PLOT_LEFT} ${geometry.height - PLOT_BOTTOM} Z`,
						fill: "color-mix(in srgb, var(--control-accent) 7%, transparent)",
						stroke: "none"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
						d: path,
						fill: "none",
						stroke: "var(--control-accent)",
						strokeWidth: "2.5",
						vectorEffect: "non-scaling-stroke"
					}),
					draft.map((band, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", {
						cx: frequencyToX(band.frequency, geometry),
						cy: gainToY(band.gainDb, geometry),
						r: band.id === selected.id ? 8 : 6,
						fill: band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : "transparent",
						stroke: band.enabled ? NODE_COLORS[index % NODE_COLORS.length] : "var(--text-muted)",
						strokeWidth: band.id === selected.id ? 2 : 1.5,
						role: "slider",
						"aria-disabled": disabled || void 0,
						tabIndex: disabled ? -1 : 0,
						"aria-label": `EQ band ${index + 1}`,
						"aria-valuemin": -12,
						"aria-valuemax": 12,
						"aria-valuenow": band.gainDb,
						"aria-valuetext": `${Math.round(band.frequency)} hertz, ${band.gainDb > 0 ? "+" : ""}${band.gainDb} decibels, width ${band.q}`,
						onFocus: () => setSelectedId(band.id),
						onPointerDown: (event) => {
							if (disabled) return;
							event.currentTarget.setPointerCapture(event.pointerId);
							dragIdRef.current = band.id;
							setSelectedId(band.id);
						},
						onPointerMove: (event) => {
							if (dragIdRef.current === band.id) updateBandFromPointer(band.id, event, false);
						},
						onPointerUp: (event) => {
							if (dragIdRef.current !== band.id) return;
							dragIdRef.current = null;
							updateBandFromPointer(band.id, event, true);
							event.currentTarget.releasePointerCapture(event.pointerId);
						},
						onDoubleClick: () => updateBand(band.id, { gainDb: 0 }, true),
						onKeyDown: (event) => handleNodeKeyDown(band, event),
						className: cn("audio-eq__node parametric-eq__node", band.id === selected.id && "is-selected"),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("title", { children: `Band ${index + 1}: ${frequencyReadout(band.frequency)}, ${band.gainDb > 0 ? "+" : ""}${band.gainDb} dB` })
					}, band.id))
				]
			})
		})
	});
}
//#endregion
//#region src/renderer/src/components/audio/presets/PresetPicker.tsx
function PresetPicker({ kind, label = "Sound", presets, activeId, pending, desktopFeatures, onApply, onCreate, onRename, onDuplicate, onDelete, onImport, onExport }) {
	const relevant = presets.filter((preset) => preset.kind === kind);
	const active = relevant.find((preset) => preset.id === activeId);
	const [mode, setMode] = (0, import_react.useState)(null);
	const [name, setName] = (0, import_react.useState)("");
	const closeEditor = () => {
		setMode(null);
		setName("");
	};
	const save = () => {
		const normalized = name.trim();
		if (!normalized) return;
		if (mode === "rename" && active && !active.builtIn) onRename(active.id, normalized);
		else onCreate(normalized);
		closeEditor();
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "preset-picker",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "preset-picker__primary",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
				value: activeId ?? "custom",
				onValueChange: (value) => {
					closeEditor();
					if (value !== "custom") onApply(value);
				},
				disabled: pending,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
					"aria-label": `${kind} preset`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Custom" })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [!activeId ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
					value: "custom",
					children: "Custom"
				}) : null, relevant.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
					value: preset.id,
					children: preset.name
				}, preset.id))] })]
			}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "preset-picker__actions",
				"aria-label": "Preset actions",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "ghost",
						size: "icon",
						disabled: pending,
						"aria-label": "Open preset actions",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { className: "size-4" })
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuContent, {
					align: "end",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							onSelect: () => {
								setMode("create");
								setName("");
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3.5" }), "Save as preset"]
						}),
						active ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							disabled: pending,
							onSelect: () => onDuplicate(active.id),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Copy, { className: "size-3.5" }), "Duplicate"]
						}) : null,
						active && !active.builtIn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							disabled: pending,
							onSelect: () => {
								setMode("rename");
								setName(active.name);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, { className: "size-3.5" }), "Rename"]
						}) : null,
						active && !active.builtIn ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							disabled: pending,
							onSelect: () => {
								closeEditor();
								onDelete(active.id);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" }), "Delete"]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuSeparator, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							disabled: pending || !desktopFeatures,
							onSelect: onImport,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Upload, { className: "size-3.5" }), "Import"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
							disabled: pending || !active || !desktopFeatures,
							onSelect: () => active && onExport(active.id),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, { className: "size-3.5" }), "Export"]
						})
					]
				})] })
			})]
		}), mode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "preset-picker__editor",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
					autoFocus: true,
					value: name,
					onChange: (event) => setName(event.target.value),
					onKeyDown: (event) => {
						if (event.key === "Enter") save();
						if (event.key === "Escape") closeEditor();
					},
					placeholder: mode === "rename" ? "Preset name" : "New preset name",
					"aria-label": "Preset name"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "secondary",
					size: "sm",
					disabled: !name.trim() || pending,
					onClick: save,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { className: "size-3.5" }),
						" ",
						mode === "rename" ? "Rename" : "Save"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "icon",
					"aria-label": "Cancel preset editing",
					onClick: closeEditor,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, { className: "size-3.5" })
				})
			]
		}) : null]
	});
}
//#endregion
//#region src/renderer/src/components/audio/processors/ParameterControl.tsx
function ParameterControl({ label, value, min, max, step, unit, precision = 0, disabled, onCommit }) {
	const [current, setCurrent] = (0, import_react.useState)(value);
	(0, import_react.useEffect)(() => setCurrent(value), [value, disabled]);
	const text = `${current.toFixed(precision)}${unit}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "audio-param parameter-control",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
				variant: "fader",
				min,
				max,
				step,
				value: [current],
				disabled,
				"aria-label": label,
				"aria-valuetext": `${current.toFixed(precision)} ${unit}`.trim(),
				onValueChange: ([next]) => typeof next === "number" && setCurrent(next),
				onValueCommit: ([next]) => !disabled && typeof next === "number" && onCommit(next)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("output", { children: text })
		]
	});
}
//#endregion
//#region src/renderer/src/components/audio/ChannelProcessingPage.tsx
var labels = {
	game: "Game",
	chat: "Chat",
	media: "Media"
};
var normalizationCopy = {
	game: {
		title: "Volume leveling",
		description: "Lifts quiet moments toward a consistent target."
	},
	chat: {
		title: "Voice leveling",
		description: "Brings quieter people closer to a consistent level."
	},
	media: {
		title: "Volume leveling",
		description: "Balances loudness changes between songs, videos, and apps."
	}
};
function ChannelProcessingPage({ snapshot, busId }) {
	const setAudioChannelProcessor = useSystemStore((state) => state.setAudioChannelProcessor);
	const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
	const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
	const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
	const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
	const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
	const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
	const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
	const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === busId);
	const bus = snapshot.audio.buses.find((candidate) => candidate.id === busId);
	const support = snapshot.audio.capabilities.channelDsp;
	const pending = useSystemStore((state) => state.pendingAudioOperations > 0);
	const unavailable = support === "unavailable";
	const unavailableMessage = snapshot.audio.host?.driver.state !== "ready" ? snapshot.audio.host?.driver.message : null;
	if (!processing || !bus) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "px-6 py-8 text-sm text-destructive",
		children: [labels[busId], " sound settings are unavailable."]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "audio-channel",
		"data-channel": busId,
		children: [
			support !== "available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "audio-status",
				role: "status",
				children: support === "simulation" ? "Sound processing is not available on this setup yet. Your settings will still be saved." : unavailableMessage ?? "Sound processing is unavailable for this output."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-toolbar",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "audio-toolbar__group",
					"aria-label": "Preset",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "audio-eyebrow",
						children: "Preset"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "audio-toolbar__card",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PresetPicker, {
							kind: busId,
							label: "Sound preset",
							presets: snapshot.audio.pathPresets,
							activeId: snapshot.audio.activePresetIds[busId],
							pending,
							desktopFeatures: Boolean(window.switchboard),
							onApply: (presetId) => void applyAudioPreset({ presetId }),
							onCreate: (name) => void createAudioPreset({
								kind: busId,
								name
							}),
							onRename: (presetId, name) => void renameAudioPreset({
								presetId,
								name
							}),
							onDuplicate: (presetId) => void duplicateAudioPreset({ presetId }),
							onDelete: (presetId) => void deleteAudioPreset({ presetId }),
							onImport: () => void importAudioPreset(),
							onExport: (presetId) => void exportAudioPreset({ presetId })
						})
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "grow" })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "audio-panel audio-panel--eq",
				"aria-labelledby": `${busId}-equalizer-heading`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "audio-panel__head",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
						checked: processing.equalizer.enabled,
						disabled: unavailable || pending,
						"aria-label": `${processing.equalizer.enabled ? "Bypass" : "Enable"} Equalizer`,
						onCheckedChange: (enabled) => void setAudioChannelProcessor({
							busId,
							processorId: "equalizer",
							enabled
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						id: `${busId}-equalizer-heading`,
						children: "Equalizer"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParametricEq, {
					bands: processing.equalizer.bands,
					disabled: unavailable || !processing.equalizer.enabled || pending,
					onCommit: (bands) => void setAudioChannelProcessor({
						busId,
						processorId: "equalizer",
						parameters: { bands }
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-panel-grid",
				"aria-label": `${labels[busId]} processing controls`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ProcessorGroup, {
						title: normalizationCopy[busId].title,
						description: normalizationCopy[busId].description,
						enabled: processing.normalization.enabled,
						disabled: unavailable,
						pending,
						onEnabledChange: (enabled) => void setAudioChannelProcessor({
							busId,
							processorId: "normalization",
							enabled
						}),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Target loudness",
							value: processing.normalization.targetLufs,
							min: -30,
							max: -10,
							step: .5,
							unit: " LUFS",
							precision: 1,
							disabled: unavailable || !processing.normalization.enabled || pending,
							onCommit: (targetLufs) => void setAudioChannelProcessor({
								busId,
								processorId: "normalization",
								parameters: { targetLufs }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Maximum lift",
							value: processing.normalization.maxGainDb,
							min: 0,
							max: 18,
							step: .5,
							unit: " dB",
							precision: 1,
							disabled: unavailable || !processing.normalization.enabled || pending,
							onCommit: (maxGainDb) => void setAudioChannelProcessor({
								busId,
								processorId: "normalization",
								parameters: { maxGainDb }
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ProcessorGroup, {
						title: "Dynamic control",
						description: "Keeps loud peaks closer to the rest of the mix.",
						enabled: processing.compressor.enabled,
						disabled: unavailable,
						pending,
						onEnabledChange: (enabled) => void setAudioChannelProcessor({
							busId,
							processorId: "compressor",
							enabled
						}),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Threshold",
								value: processing.compressor.thresholdDb,
								min: -60,
								max: 0,
								step: .5,
								unit: " dB",
								precision: 1,
								disabled: unavailable || !processing.compressor.enabled || pending,
								onCommit: (thresholdDb) => void setAudioChannelProcessor({
									busId,
									processorId: "compressor",
									parameters: { thresholdDb }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Ratio",
								value: processing.compressor.ratio,
								min: 1,
								max: 20,
								step: .1,
								unit: ":1",
								precision: 1,
								disabled: unavailable || !processing.compressor.enabled || pending,
								onCommit: (ratio) => void setAudioChannelProcessor({
									busId,
									processorId: "compressor",
									parameters: { ratio }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Attack",
								value: processing.compressor.attackMs,
								min: .1,
								max: 200,
								step: .5,
								unit: " ms",
								precision: 1,
								disabled: unavailable || !processing.compressor.enabled || pending,
								onCommit: (attackMs) => void setAudioChannelProcessor({
									busId,
									processorId: "compressor",
									parameters: { attackMs }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Release",
								value: processing.compressor.releaseMs,
								min: 10,
								max: 2e3,
								step: 5,
								unit: " ms",
								disabled: unavailable || !processing.compressor.enabled || pending,
								onCommit: (releaseMs) => void setAudioChannelProcessor({
									busId,
									processorId: "compressor",
									parameters: { releaseMs }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Makeup gain",
								value: processing.compressor.makeupDb,
								min: 0,
								max: 18,
								step: .5,
								unit: " dB",
								precision: 1,
								disabled: unavailable || !processing.compressor.enabled || pending,
								onCommit: (makeupDb) => void setAudioChannelProcessor({
									busId,
									processorId: "compressor",
									parameters: { makeupDb }
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ProcessorGroup, {
						title: "Output safety",
						description: "Prevents sudden clipping and excessive peaks.",
						enabled: processing.limiter.enabled,
						disabled: unavailable,
						pending,
						onEnabledChange: (enabled) => void setAudioChannelProcessor({
							busId,
							processorId: "limiter",
							enabled
						}),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Ceiling",
							value: processing.limiter.thresholdDb,
							min: -18,
							max: 0,
							step: .1,
							unit: " dB",
							precision: 1,
							disabled: unavailable || !processing.limiter.enabled || pending,
							onCommit: (thresholdDb) => void setAudioChannelProcessor({
								busId,
								processorId: "limiter",
								parameters: { thresholdDb }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Release",
							value: processing.limiter.releaseMs,
							min: 10,
							max: 1e3,
							step: 5,
							unit: " ms",
							disabled: unavailable || !processing.limiter.enabled || pending,
							onCommit: (releaseMs) => void setAudioChannelProcessor({
								busId,
								processorId: "limiter",
								parameters: { releaseMs }
							})
						})]
					})
				]
			})
		]
	});
}
function ProcessorGroup({ title, description, enabled, disabled, pending, onEnabledChange, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: `audio-panel${!enabled || disabled ? " is-disabled" : ""}`,
		"aria-label": title,
		"aria-busy": pending,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "audio-panel__head",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					checked: enabled,
					disabled: disabled || pending,
					"aria-label": `${enabled ? "Bypass" : "Enable"} ${title}`,
					onCheckedChange: onEnabledChange
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "audio-panel__note",
					children: description
				})
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "audio-panel__body",
			children
		})]
	});
}
//#endregion
//#region src/renderer/src/components/audio/meter-bus.ts
var listeners = /* @__PURE__ */ new Map();
var latestValues = /* @__PURE__ */ new Map();
function publishAudioMeterFrame(frame) {
	for (const value of frame.values) {
		latestValues.set(value.busId, value);
		for (const listener of listeners.get(value.busId) ?? []) listener(value);
	}
}
function subscribeToAudioMeter(busId, listener) {
	const busListeners = listeners.get(busId) ?? /* @__PURE__ */ new Set();
	busListeners.add(listener);
	listeners.set(busId, busListeners);
	const latest = latestValues.get(busId);
	if (latest) listener(latest);
	return () => {
		busListeners.delete(listener);
		if (busListeners.size === 0) listeners.delete(busId);
	};
}
function clearAudioMeters() {
	for (const busId of [
		"game",
		"chat",
		"media",
		"mic",
		"aux"
	]) {
		const value = {
			busId,
			level: 0,
			peak: 0,
			clipping: false
		};
		latestValues.set(busId, value);
		for (const listener of listeners.get(busId) ?? []) listener(value);
	}
}
//#endregion
//#region src/shared/microphone-runtime.ts
function microphoneMonitoringApplied(audio) {
	const monitoring = audio.host?.microphone?.monitoring;
	if (!audio.host?.running || !monitoring) return false;
	if (monitoring.requested !== audio.monitoringEnabled) return false;
	if (Math.abs(monitoring.level - audio.monitoring) > 1e-4) return false;
	if (!audio.monitoringEnabled) return !monitoring.active;
	return monitoring.active && monitoring.requestedDeviceId === audio.monitoringDeviceId && monitoring.activeDeviceId === audio.monitoringDeviceId;
}
//#endregion
//#region src/renderer/src/components/audio/AudioDevicePicker.tsx
function AudioDevicePicker({ value, devices, direction, label, disabled, className, onChange }) {
	const options = devices.filter((device) => device.direction === direction && device.available && !device.isSwitchboard);
	const selectedValue = options.some((device) => device.id === value) ? value : void 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value: selectedValue,
		onValueChange: onChange,
		disabled: disabled || options.length === 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
			"aria-label": label,
			className: cn("h-9 w-full min-w-0 border-0 bg-transparent px-0 text-xs font-medium shadow-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45", className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "No available device" })
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: options.map((device) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectItem, {
			value: device.id,
			children: [device.name, device.isDefault ? " · Default" : ""]
		}, device.id)) })]
	});
}
//#endregion
//#region src/renderer/src/components/audio/testing/MicrophoneTest.tsx
function MicrophoneTest({ support, pending = false, compact = false, onRecord }) {
	const recordable = support === "available" && Boolean(onRecord);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "microphone-test",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
			type: "button",
			variant: "secondary",
			size: "sm",
			disabled: !recordable || pending,
			"aria-describedby": "microphone-test-status",
			onClick: onRecord,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Circle, { className: "size-3.5 fill-current" }), " Test microphone"]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			id: "microphone-test-status",
			className: compact ? "sr-only" : void 0,
			children: pending ? "Recording and playing your processed microphone sample…" : recordable ? "Record a short sample and hear your current processing." : support === "unavailable" ? "Microphone testing is not available with the current audio setup." : "Recording is not available with the current audio setup."
		})]
	});
}
//#endregion
//#region src/renderer/src/components/audio/MicrophonePage.tsx
function getProcessor(processors, id) {
	return processors.find((processor) => processor.id === id) ?? null;
}
function MicrophonePage({ snapshot }) {
	const setMicProcessor = useSystemStore((state) => state.setMicProcessor);
	const setAudioMonitoring = useSystemStore((state) => state.setAudioMonitoring);
	const testMicrophone = useSystemStore((state) => state.testMicrophone);
	const applyAudioPreset = useSystemStore((state) => state.applyAudioPreset);
	const createAudioPreset = useSystemStore((state) => state.createAudioPreset);
	const renameAudioPreset = useSystemStore((state) => state.renameAudioPreset);
	const duplicateAudioPreset = useSystemStore((state) => state.duplicateAudioPreset);
	const deleteAudioPreset = useSystemStore((state) => state.deleteAudioPreset);
	const importAudioPreset = useSystemStore((state) => state.importAudioPreset);
	const exportAudioPreset = useSystemStore((state) => state.exportAudioPreset);
	const [microphoneTestPending, setMicrophoneTestPending] = (0, import_react.useState)(false);
	const [pendingOperations, setPendingOperations] = (0, import_react.useState)({});
	const micBus = snapshot.audio.buses.find((candidate) => candidate.id === "mic");
	const gain = getProcessor(snapshot.audio.micProcessors, "gain");
	const gate = getProcessor(snapshot.audio.micProcessors, "noise-gate");
	const suppression = getProcessor(snapshot.audio.micProcessors, "noise-suppression");
	const equalizer = getProcessor(snapshot.audio.micProcessors, "equalizer");
	const compressor = getProcessor(snapshot.audio.micProcessors, "compressor");
	const limiter = getProcessor(snapshot.audio.micProcessors, "limiter");
	const support = snapshot.audio.capabilities.microphoneDsp;
	const suppressionUnavailable = snapshot.audio.capabilities.noiseSuppression !== "available";
	const suppressionError = snapshot.audio.host?.noiseSuppression.lastError ?? snapshot.audio.host?.capabilities.reason;
	const desktopFeatures = Boolean(window.switchboard);
	const unavailable = support !== "available";
	const monitoringUnavailable = snapshot.audio.capabilities.monitoring !== "available";
	const processorPending = Object.keys(pendingOperations).some((key) => key.startsWith("processor:"));
	const pending = processorPending;
	const presetPending = Boolean(pendingOperations.preset);
	const monitoringPending = Boolean(pendingOperations.monitoring);
	const monitoringApplied = microphoneMonitoringApplied(snapshot.audio);
	const monitoringDescription = monitoringUnavailable ? snapshot.audio.host?.microphone?.error ?? "Monitoring is not available with the current audio setup." : monitoringPending ? "Applying the monitoring output and volume." : snapshot.audio.monitoringEnabled && !monitoringApplied ? snapshot.audio.host?.microphone?.error ?? "The selected output has not accepted the monitor stream." : snapshot.audio.monitoringEnabled ? "Processed microphone audio is live on the selected output." : "Hear your processed microphone through the selected output.";
	const runPending = (key, operation) => {
		setPendingOperations((current) => ({
			...current,
			[key]: (current[key] ?? 0) + 1
		}));
		operation().finally(() => {
			setPendingOperations((current) => {
				const next = { ...current };
				if ((next[key] ?? 0) <= 1) delete next[key];
				else next[key] = (next[key] ?? 1) - 1;
				return next;
			});
		});
	};
	const commitProcessor = (input) => runPending(`processor:${input.processorId}`, () => setMicProcessor(input));
	if (!micBus || !gain || !gate || !suppression || !equalizer || !compressor || !limiter) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "px-6 py-8 text-sm text-destructive",
		children: "Microphone sound settings are unavailable."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "audio-channel audio-channel--microphone",
		"data-channel": "microphone",
		children: [
			snapshot.audio.enabled && support !== "available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "audio-status",
				role: "status",
				children: support === "simulation" ? "This preview does not process microphone audio. Use the desktop application and native Audio.Host." : snapshot.audio.host?.microphone?.error ?? "Voice processing is unavailable for the selected microphone."
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-toolbar",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "audio-toolbar__group",
						"aria-label": "Preset",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "audio-eyebrow",
							children: "Preset"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "audio-toolbar__card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PresetPicker, {
								kind: "microphone",
								label: "Voice preset",
								presets: snapshot.audio.pathPresets,
								activeId: snapshot.audio.activePresetIds.microphone,
								pending: presetPending || unavailable,
								desktopFeatures,
								onApply: (presetId) => runPending("preset", () => applyAudioPreset({ presetId })),
								onCreate: (name) => runPending("preset", () => createAudioPreset({
									kind: "microphone",
									name
								})),
								onRename: (presetId, name) => runPending("preset", () => renameAudioPreset({
									presetId,
									name
								})),
								onDuplicate: (presetId) => runPending("preset", () => duplicateAudioPreset({ presetId })),
								onDelete: (presetId) => runPending("preset", () => deleteAudioPreset({ presetId })),
								onImport: () => runPending("preset", importAudioPreset),
								onExport: (presetId) => runPending("preset", () => exportAudioPreset({ presetId }))
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "grow" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						className: "audio-toolbar__group",
						"aria-label": "Test",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "audio-eyebrow",
							children: "Test"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "audio-toolbar__card",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneTest, {
								support: snapshot.audio.capabilities.microphoneTest,
								pending: microphoneTestPending,
								compact: true,
								onRecord: () => {
									setMicrophoneTestPending(true);
									testMicrophone().finally(() => setMicrophoneTestPending(false));
								}
							})
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "audio-panel audio-panel--eq",
				"aria-labelledby": "microphone-equalizer-heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
					className: "audio-panel__head",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
						checked: equalizer.enabled,
						disabled: unavailable || Boolean(pendingOperations["processor:equalizer"]),
						"aria-label": `${equalizer.enabled ? "Bypass" : "Enable"} Equalizer`,
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "equalizer",
							enabled
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						id: "microphone-equalizer-heading",
						children: "Equalizer"
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParametricEq, {
					bands: equalizer.parameters.bands,
					disabled: unavailable || !equalizer.enabled || Boolean(pendingOperations["processor:equalizer"]),
					onCommit: (bands) => commitProcessor({
						processorId: "equalizer",
						parameters: { bands }
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-panel-grid",
				"aria-busy": processorPending,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicProcessorSection, {
						id: "microphone-input-section",
						title: "Input volume",
						headingId: "microphone-input-heading",
						description: "Software level after cleanup, before tone and dynamics.",
						checked: gain.enabled,
						disabled: unavailable,
						pending: Boolean(pendingOperations["processor:gain"]),
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "gain",
							enabled
						}),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Gain",
							value: gain.parameters.gainDb,
							min: -20,
							max: 30,
							step: .5,
							unit: " dB",
							disabled: unavailable || !gain.enabled || Boolean(pendingOperations["processor:gain"]),
							onCommit: (gainDb) => commitProcessor({
								processorId: "gain",
								enabled: true,
								parameters: { gainDb }
							})
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MicProcessorSection, {
						id: "microphone-gate-section",
						title: "Noise gate",
						headingId: "microphone-gate-heading",
						description: "Mutes the room while you are not speaking.",
						checked: gate.enabled,
						disabled: unavailable,
						pending: Boolean(pendingOperations["processor:noise-gate"]),
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "noise-gate",
							enabled
						}),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Gate threshold",
								value: gate.parameters.thresholdDb,
								min: -80,
								max: -10,
								step: .5,
								unit: " dB",
								precision: 1,
								disabled: unavailable || !gate.enabled || pending,
								onCommit: (thresholdDb) => commitProcessor({
									processorId: "noise-gate",
									parameters: { thresholdDb }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Attack",
								value: gate.parameters.attackMs,
								min: .1,
								max: 100,
								step: .5,
								unit: " ms",
								precision: 1,
								disabled: unavailable || !gate.enabled || pending,
								onCommit: (attackMs) => commitProcessor({
									processorId: "noise-gate",
									parameters: { attackMs }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Release",
								value: gate.parameters.releaseMs,
								min: 10,
								max: 1e3,
								step: 5,
								unit: " ms",
								disabled: unavailable || !gate.enabled || pending,
								onCommit: (releaseMs) => commitProcessor({
									processorId: "noise-gate",
									parameters: { releaseMs }
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicProcessorSection, {
						id: "microphone-removal-section",
						title: "Noise removal",
						headingId: "microphone-removal-heading",
						description: suppressionUnavailable ? suppressionError ?? "Unavailable with the current audio setup." : "Reduces fans, keys, and background sound.",
						checked: suppression.enabled && !suppressionUnavailable,
						disabled: suppressionUnavailable,
						pending: Boolean(pendingOperations["processor:noise-suppression"]),
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "noise-suppression",
							enabled
						}),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Removal strength",
							value: suppression.parameters.amount,
							min: 0,
							max: 100,
							step: 1,
							unit: "%",
							disabled: suppressionUnavailable || !suppression.enabled || pending,
							onCommit: (amount) => commitProcessor({
								processorId: "noise-suppression",
								enabled: true,
								parameters: { amount }
							})
						})
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MicProcessorSection, {
						id: "microphone-consistency-section",
						title: "Voice consistency",
						headingId: "microphone-consistency-heading",
						description: "Keeps quiet and loud speech at a similar level.",
						checked: compressor.enabled,
						disabled: unavailable,
						pending: Boolean(pendingOperations["processor:compressor"]),
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "compressor",
							enabled
						}),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Compression ratio",
								value: compressor.parameters.ratio,
								min: 1,
								max: 20,
								step: .1,
								unit: ":1",
								precision: 1,
								disabled: unavailable || !compressor.enabled || pending,
								onCommit: (ratio) => commitProcessor({
									processorId: "compressor",
									enabled: true,
									parameters: { ratio }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Threshold",
								value: compressor.parameters.thresholdDb,
								min: -60,
								max: 0,
								step: .5,
								unit: " dB",
								precision: 1,
								disabled: unavailable || !compressor.enabled || pending,
								onCommit: (thresholdDb) => commitProcessor({
									processorId: "compressor",
									parameters: { thresholdDb }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Attack",
								value: compressor.parameters.attackMs,
								min: .1,
								max: 200,
								step: .5,
								unit: " ms",
								precision: 1,
								disabled: unavailable || !compressor.enabled || pending,
								onCommit: (attackMs) => commitProcessor({
									processorId: "compressor",
									parameters: { attackMs }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Release",
								value: compressor.parameters.releaseMs,
								min: 10,
								max: 2e3,
								step: 5,
								unit: " ms",
								disabled: unavailable || !compressor.enabled || pending,
								onCommit: (releaseMs) => commitProcessor({
									processorId: "compressor",
									parameters: { releaseMs }
								})
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Makeup gain",
								value: compressor.parameters.makeupDb,
								min: 0,
								max: 18,
								step: .5,
								unit: " dB",
								precision: 1,
								disabled: unavailable || !compressor.enabled || pending,
								onCommit: (makeupDb) => commitProcessor({
									processorId: "compressor",
									parameters: { makeupDb }
								})
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(MicProcessorSection, {
						id: "microphone-safety-section",
						title: "Output safety",
						headingId: "microphone-safety-heading",
						description: "Catches clipping and sudden peaks.",
						checked: limiter.enabled,
						disabled: unavailable,
						pending: Boolean(pendingOperations["processor:limiter"]),
						onCheckedChange: (enabled) => commitProcessor({
							processorId: "limiter",
							enabled
						}),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Ceiling",
							value: limiter.parameters.thresholdDb,
							min: -18,
							max: 0,
							step: .1,
							unit: " dB",
							precision: 1,
							disabled: unavailable || !limiter.enabled || pending,
							onCommit: (thresholdDb) => commitProcessor({
								processorId: "limiter",
								parameters: { thresholdDb }
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
							label: "Release",
							value: limiter.parameters.releaseMs,
							min: 10,
							max: 1e3,
							step: 5,
							unit: " ms",
							disabled: unavailable || !limiter.enabled || pending,
							onCommit: (releaseMs) => commitProcessor({
								processorId: "limiter",
								parameters: { releaseMs }
							})
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
						id: "microphone-monitoring-section",
						className: `audio-panel${monitoringUnavailable ? " is-disabled" : ""}`,
						"aria-labelledby": "microphone-monitoring-heading",
						"aria-busy": monitoringPending,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
							className: "audio-panel__head",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
									checked: snapshot.audio.monitoringEnabled,
									disabled: monitoringUnavailable || monitoringPending,
									"aria-label": "Monitoring",
									onCheckedChange: (enabled) => runPending("monitoring", () => setAudioMonitoring({ enabled }))
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
									id: "microphone-monitoring-heading",
									children: "Monitoring"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "audio-panel__note",
									children: monitoringDescription
								})
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "audio-panel__body",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
								className: "audio-panel__row",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Output" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioDevicePicker, {
									value: snapshot.audio.monitoringDeviceId,
									devices: snapshot.audio.devices,
									direction: "output",
									label: "Microphone monitoring device",
									disabled: monitoringUnavailable || monitoringPending,
									onChange: (deviceId) => runPending("monitoring", () => setAudioMonitoring({ deviceId }))
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ParameterControl, {
								label: "Monitor volume",
								value: snapshot.audio.monitoring * 100,
								min: 0,
								max: 100,
								step: 1,
								unit: "%",
								disabled: monitoringUnavailable || monitoringPending || !snapshot.audio.monitoringEnabled,
								onCommit: (level) => runPending("monitoring", () => setAudioMonitoring({ level: level / 100 }))
							})]
						})]
					})
				]
			})
		]
	});
}
function MicProcessorSection({ id, headingId, title, description, checked, disabled, pending, onCheckedChange, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		id,
		className: `audio-panel${!checked || disabled ? " is-disabled" : ""}`,
		"aria-labelledby": headingId,
		"aria-busy": pending,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
			className: "audio-panel__head",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					checked,
					disabled: disabled || pending,
					"aria-label": title,
					onCheckedChange
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: headingId,
					children: title
				}),
				description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "audio-panel__note",
					children: description
				}) : null
			]
		}), children ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "audio-panel__body",
			children
		}) : null]
	});
}
//#endregion
//#region src/renderer/src/components/audio/ChatMixSlider.tsx
function snapCenter(value) {
	return Math.abs(value) <= .035 ? 0 : value;
}
var ChatMixSlider = (0, import_react.memo)(function ChatMixSlider({ value, disabled, pending, onCommit }) {
	const [current, setCurrent] = (0, import_react.useState)(value);
	(0, import_react.useEffect)(() => setCurrent(value), [
		value,
		pending,
		disabled
	]);
	const game = Math.round((1 - current) / 2 * 100);
	const chat = 100 - game;
	const inactive = disabled || pending;
	const commit = (next) => {
		if (inactive) return;
		const snapped = snapCenter(next);
		setCurrent(snapped);
		onCommit(snapped);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-labelledby": "chatmix-heading",
		className: cn("audio-chatmix chatmix-control", inactive && "is-disabled"),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-chatmix__label",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "chatmix-heading",
					children: "ChatMix"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-chatmix__slider chatmix-control__slider",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Gamepad2, {
						className: "size-4 shrink-0 text-[var(--channel-game)]",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider$1, {
						min: -1,
						max: 1,
						step: .01,
						value: [current],
						disabled: inactive,
						onValueChange: ([next]) => typeof next === "number" && setCurrent(snapCenter(next)),
						onValueCommit: ([next]) => typeof next === "number" && commit(next),
						onDoubleClick: () => commit(0),
						className: "relative flex h-8 w-full min-w-0 touch-none select-none items-center",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderTrack, {
							className: "relative h-1 w-full grow rounded-[2px] bg-input",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "absolute left-1/2 top-[-5px] h-[14px] w-px -translate-x-1/2 bg-foreground/70",
								"aria-hidden": "true"
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderThumb, {
							"aria-label": "ChatMix game and chat balance",
							"aria-valuetext": `${game} percent game, ${chat} percent chat`,
							className: "block size-[18px] rounded-full border border-accent-hover bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MessageCircle, {
						className: "size-4 shrink-0 text-[var(--channel-chat)]",
						"aria-hidden": "true"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-chatmix__value",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [
					"Game ",
					game,
					" · Chat ",
					chat
				] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "ghost",
						size: "icon",
						className: "size-7",
						disabled: inactive || current === 0,
						"aria-label": "Reset ChatMix to center",
						onClick: () => commit(0),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, { className: "size-3.5" })
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "Center ChatMix" })] })]
			})
		]
	});
});
//#endregion
//#region src/renderer/src/components/audio/ClipIndicator.tsx
var ClipIndicator = (0, import_react.forwardRef)(function ClipIndicator({ className, label = "Clipping" }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		ref,
		className: cn("audio-clip", className),
		"data-clipping": "false",
		role: "img",
		"aria-label": label
	});
});
//#endregion
//#region src/renderer/src/components/audio/LevelMeter.tsx
function levelToDb(level) {
	return level <= .001 ? -60 : Math.max(-60, 20 * Math.log10(level));
}
var LevelMeter = (0, import_react.memo)(function LevelMeter({ busId, active, label, accentColor }) {
	const meterRef = (0, import_react.useRef)(null);
	const goodRef = (0, import_react.useRef)(null);
	const warningRef = (0, import_react.useRef)(null);
	const dangerRef = (0, import_react.useRef)(null);
	const peakRef = (0, import_react.useRef)(null);
	const clipRef = (0, import_react.useRef)(null);
	const readoutRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		let heldPeak = 0;
		let heldAt = 0;
		let animationFrame = null;
		let latest = {
			busId,
			level: 0,
			peak: 0,
			clipping: false
		};
		const render = () => {
			animationFrame = null;
			const value = latest;
			const normalized = active ? value.level : 0;
			const incomingPeak = active ? value.peak : 0;
			const now = performance.now();
			if (incomingPeak >= heldPeak) {
				heldPeak = incomingPeak;
				heldAt = now;
			} else if (now - heldAt > 1100) heldPeak = Math.max(incomingPeak, heldPeak - .035);
			const amount = normalized * 100;
			if (goodRef.current) goodRef.current.style.height = `${Math.min(amount, 72)}%`;
			if (warningRef.current) warningRef.current.style.height = `${Math.min(Math.max(amount - 72, 0), 20)}%`;
			if (dangerRef.current) dangerRef.current.style.height = `${Math.min(Math.max(amount - 92, 0), 8)}%`;
			if (peakRef.current) peakRef.current.style.bottom = `${Math.min(100, heldPeak * 100)}%`;
			if (clipRef.current) clipRef.current.dataset.clipping = String(active && (value.clipping || heldPeak >= .985));
			const db = levelToDb(normalized);
			const text = db <= -60 ? "-∞" : `${Math.round(db)}`;
			if (readoutRef.current) readoutRef.current.textContent = `${text} dB`;
			meterRef.current?.setAttribute("aria-valuenow", db.toFixed(1));
			meterRef.current?.setAttribute("aria-valuetext", `${text} decibels`);
		};
		const onMeter = (value) => {
			latest = value;
			if (animationFrame === null) animationFrame = requestAnimationFrame(render);
		};
		render();
		const unsubscribe = subscribeToAudioMeter(busId, onMeter);
		return () => {
			unsubscribe();
			if (animationFrame !== null) cancelAnimationFrame(animationFrame);
		};
	}, [active, busId]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "audio-meter",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipIndicator, {
				ref: clipRef,
				label: `${label} clipping indicator`
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-meter__rail",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					ref: meterRef,
					role: "meter",
					"aria-label": `${label} input level`,
					"aria-valuemin": -60,
					"aria-valuemax": 0,
					"aria-valuenow": -60,
					className: "audio-meter__bar",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: goodRef,
							className: "absolute inset-x-0 bottom-0",
							style: { backgroundColor: accentColor }
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: warningRef,
							className: "absolute inset-x-0 bottom-[72%] bg-warning"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: dangerRef,
							className: "absolute inset-x-0 bottom-[92%] bg-destructive"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							ref: peakRef,
							className: "absolute inset-x-[-1px] h-px bg-foreground"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				ref: readoutRef,
				className: "audio-meter__readout",
				children: "−∞ dB"
			})
		]
	});
});
//#endregion
//#region src/renderer/src/components/audio/MixerApplications.tsx
var applicationDestinations = [
	{
		id: "game",
		label: "Game"
	},
	{
		id: "chat",
		label: "Chat"
	},
	{
		id: "media",
		label: "Media"
	}
];
function supportLabel(support) {
	if (support === "simulation") return "Prototype";
	if (support === "unavailable") return "Unavailable";
	return "Ready";
}
var MixerApplications = (0, import_react.memo)(function MixerApplications({ channelLabel, applications, routingSupport, unavailableReason, pending, onApplicationRoute }) {
	const sortedApplications = [...applications].sort((left, right) => {
		if (left.active !== right.active) return left.active ? -1 : 1;
		return left.name.localeCompare(right.name);
	});
	const activeCount = applications.filter((application) => application.active).length;
	const canRoute = routingSupport !== "unavailable" && !pending;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mixer-channel__apps",
		"aria-label": `${channelLabel} applications`,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mixer-channel__apps-heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Applications" }), routingSupport === "available" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
				variant: activeCount > 0 ? "success" : "default",
				children: activeCount > 0 ? `${activeCount}${activeCount < applications.length ? `/${applications.length}` : ""} live` : `${applications.length} assigned`
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mixer-channel__apps-support",
				"data-state": routingSupport,
				children: supportLabel(routingSupport)
			})]
		}), routingSupport === "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mixer-channel__apps-empty",
			title: unavailableReason ?? void 0,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CircleSlash2, {
				className: "size-3.5",
				"aria-hidden": "true"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "App routing unavailable" })]
		}) : sortedApplications.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mixer-channel__apps-empty",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppWindow, {
				className: "size-3.5",
				"aria-hidden": "true"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "No apps on this channel" })]
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
			className: "mixer-channel__apps-scroll",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "mixer-channel__app-list",
				children: sortedApplications.map((application) => {
					const restartRequired = application.routingState === "pending-restart";
					const status = restartRequired ? "Restart required" : application.active ? `Playing through ${channelLabel}.` : `Assigned to ${channelLabel}; currently idle.`;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: cn(!application.active && "is-inactive"),
						title: restartRequired ? `Using ${channelLabel}. Restart ${application.name} to move it to ${application.destination}.` : void 0,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: cn("mixer-channel__app-activity", application.active && "is-active"),
								"aria-hidden": "true"
							}),
							application.iconDataUrl ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
								src: application.iconDataUrl,
								alt: "",
								className: "mixer-channel__app-icon"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AppWindow, {
								className: "mixer-channel__app-icon",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "mixer-channel__app-copy",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "mixer-channel__app-name",
									children: application.name
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: cn("mixer-channel__app-state", restartRequired && "is-pending"),
									children: status
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: application.destination,
								disabled: !canRoute,
								onValueChange: (destination) => onApplicationRoute(application.id, destination),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "mixer-channel__route-select",
									"aria-label": `Route ${application.name} to channel`,
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: applicationDestinations.map((destination) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: destination.id,
									children: destination.label
								}, destination.id)) })]
							})
						]
					}, application.id);
				})
			})
		})]
	});
});
//#endregion
//#region src/renderer/src/components/audio/MixerFader.tsx
var MAX_PERCENT = 150;
var UNITY_PERCENT = 100;
function gainToPercent(gain) {
	return Math.round(Math.max(0, Math.min(1.5, gain)) * 100);
}
function clampPercent(value) {
	return Math.max(0, Math.min(MAX_PERCENT, Math.round(value)));
}
var MixerFader = (0, import_react.memo)(function MixerFader({ value, disabled, label, accentColor, onCommit }) {
	const [percentage, setPercentage] = (0, import_react.useState)(() => gainToPercent(value));
	const [draft, setDraft] = (0, import_react.useState)(() => String(gainToPercent(value)));
	const [adjusting, setAdjusting] = (0, import_react.useState)(false);
	const cancelDraftRef = (0, import_react.useRef)(false);
	(0, import_react.useEffect)(() => {
		const next = gainToPercent(value);
		setPercentage(next);
		setDraft(String(next));
	}, [value, disabled]);
	const commitPercentage = (0, import_react.useCallback)((nextPercentage) => {
		if (disabled || !Number.isFinite(nextPercentage)) return;
		const normalized = clampPercent(nextPercentage);
		setPercentage(normalized);
		setDraft(String(normalized));
		onCommit(normalized / 100);
	}, [onCommit, disabled]);
	const handleKeyDownCapture = (event) => {
		if (disabled) return;
		let next = null;
		if (event.key === "ArrowUp" || event.key === "ArrowRight") next = percentage + 1;
		else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = percentage - 1;
		else if (event.key === "PageUp") next = percentage + 10;
		else if (event.key === "PageDown") next = percentage - 10;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = MAX_PERCENT;
		if (next === null) return;
		event.preventDefault();
		event.stopPropagation();
		setAdjusting(true);
		commitPercentage(next);
	};
	const handleWheel = (event) => {
		if (disabled) return;
		event.preventDefault();
		const step = event.shiftKey ? 1 : 5;
		commitPercentage(percentage + (event.deltaY < 0 ? step : -step));
	};
	const commitDraft = () => {
		if (cancelDraftRef.current) {
			cancelDraftRef.current = false;
			setDraft(String(percentage));
			return;
		}
		if (draft.trim() === "") {
			setDraft(String(percentage));
			return;
		}
		commitPercentage(Number(draft));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("mixer-fader", disabled && "is-disabled"),
		style: { "--channel-accent": accentColor },
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "mixer-fader__rail",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Slider$1, {
				orientation: "vertical",
				min: 0,
				max: MAX_PERCENT,
				step: 1,
				value: [percentage],
				disabled,
				onValueChange: ([next]) => {
					if (typeof next !== "number") return;
					const normalized = clampPercent(next);
					setAdjusting(true);
					setPercentage(normalized);
					setDraft(String(normalized));
				},
				onValueCommit: ([next]) => {
					setAdjusting(false);
					if (typeof next === "number") commitPercentage(next);
				},
				onDoubleClick: () => commitPercentage(UNITY_PERCENT),
				onWheel: handleWheel,
				onKeyDownCapture: handleKeyDownCapture,
				onKeyUp: () => setAdjusting(false),
				onBlur: () => setAdjusting(false),
				className: "mixer-fader__control",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SliderTrack, {
					className: "mixer-fader__track",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mixer-fader__unity",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SliderRange, { className: "mixer-fader__range" })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SliderThumb, {
					"aria-label": `${label} fader`,
					"aria-valuetext": `${percentage} percent`,
					className: "mixer-fader__thumb",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", {
						className: cn("mixer-fader__floating-value", adjusting && "is-visible"),
						"aria-live": "polite",
						children: [percentage, "%"]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "mixer-fader__thumb-mark",
						"aria-hidden": "true"
					})]
				})]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "mixer-fader__exact",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "sr-only",
					children: [
						"Set ",
						label,
						" volume percentage"
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "text",
					inputMode: "numeric",
					value: draft,
					disabled,
					"aria-label": `${label} exact volume percentage`,
					onFocus: (event) => event.currentTarget.select(),
					onInput: (event) => {
						if (/^\d{0,3}$/.test(event.currentTarget.value)) setDraft(event.currentTarget.value);
					},
					onBlur: commitDraft,
					onKeyDown: (event) => {
						if (event.key === "Enter") event.currentTarget.blur();
						if (event.key === "Escape") {
							cancelDraftRef.current = true;
							setDraft(String(percentage));
							event.currentTarget.blur();
						}
					}
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					children: "%"
				})
			]
		})]
	});
});
//#endregion
//#region src/renderer/src/components/audio/MixerStrip.tsx
var MixerStrip = (0, import_react.memo)(function MixerStrip(props) {
	if (props.master) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MasterStrip, { ...props });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BusStrip, { ...props });
});
function MasterStrip({ masterState, mixLabel, pending, onGainCommit, onEnabledChange }) {
	const muted = !masterState.enabled;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: cn("audio-strip audio-strip--master mixer-channel--master", muted && "is-muted"),
		"aria-busy": pending || void 0,
		style: { "--channel-color": "var(--accent-brand)" },
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
				className: "audio-strip__head",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "audio-strip__identity",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersVertical, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Master" })]
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-strip__sub",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [mixLabel, " mix"] })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-strip__sub",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-strip__body",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "audio-strip__meter audio-strip__meter--empty",
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "audio-strip__fader",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerFader, {
						value: masterState.gain,
						disabled: !masterState.enabled || pending,
						label: `${mixLabel} master`,
						accentColor: "var(--accent-brand)",
						onCommit: onGainCommit
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-strip__foot",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MuteButton, {
					label: muted ? "Unmute master output" : "Mute master output",
					muted,
					disabled: pending,
					onClick: () => onEnabledChange(!masterState.enabled)
				})
			})
		]
	});
}
function BusStrip({ bus, control, mixId, devices, engineRunning, pending, presetName, applications = [], routingSupport = "unavailable", routingUnavailableReason, onGainCommit, onEnabledChange, onChannelEnabledChange, onDeviceChange, onApplicationRoute, onOpen }) {
	const direction = bus.id === "mic" ? "input" : "output";
	const muted = !control.enabled;
	const color = channelColor(bus.id);
	const Icon = bus.id === "game" ? Gamepad2 : bus.id === "chat" ? MessageCircle : bus.id === "media" ? Music2 : bus.id === "mic" ? MicVocal : AppWindow;
	const settingsLabel = bus.id === "mic" ? "Voice settings" : "Sound settings";
	const hasSettings = bus.id !== "aux";
	const shortLabel = bus.id === "mic" ? "Mic" : bus.label;
	const canShowApps = bus.id === "game" || bus.id === "chat" || bus.id === "media";
	if (!bus.enabled) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("article", {
		className: "audio-strip audio-strip--disabled mixer-channel mixer-channel--disabled",
		style: { "--channel-color": color },
		"aria-label": `${bus.label} channel disabled`,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "audio-strip__disabled",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { "aria-hidden": "true" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: bus.label }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Off" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					disabled: pending,
					onClick: () => onChannelEnabledChange(true),
					"aria-label": `Enable ${bus.label} channel`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Power, {
						className: "size-3.5",
						"aria-hidden": "true"
					}), " Turn on"]
				})
			]
		})
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
		className: cn("audio-strip mixer-channel", muted && "is-muted"),
		style: { "--channel-color": color },
		"aria-busy": pending || void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "audio-strip__head",
				children: [hasSettings ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "audio-strip__identity audio-strip__identity--button",
					onClick: onOpen,
					"aria-label": `Open ${bus.label} settings`,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: shortLabel })]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "audio-strip__identity",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: shortLabel })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "ghost",
						size: "icon",
						className: "audio-strip__menu",
						"aria-label": `Open ${bus.label} channel menu`,
						disabled: pending,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, {
							className: "size-3.5",
							"aria-hidden": "true"
						})
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuContent, {
					align: "end",
					children: [hasSettings ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
						onSelect: onOpen,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersHorizontal, { className: "size-3.5" }), settingsLabel]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuSeparator, {})] }) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
						onSelect: () => onChannelEnabledChange(false),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Power, { className: "size-3.5" }), "Turn channel off"]
					})]
				})] })]
			}),
			hasSettings ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				className: "audio-strip__sub audio-strip__sub--link",
				onClick: onOpen,
				"aria-label": `Open ${bus.label} preset and ${settingsLabel.toLowerCase()}`,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: presetName ?? "Flat" })
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-strip__sub",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Line input" })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "audio-strip__sub audio-strip__sub--picker",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioDevicePicker, {
					value: bus.deviceId,
					devices,
					direction,
					label: `${bus.label} ${direction} device`,
					disabled: pending,
					onChange: onDeviceChange
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-strip__body",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "audio-strip__meter",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LevelMeter, {
						busId: bus.id,
						active: engineRunning && !muted,
						label: bus.label,
						accentColor: color
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "audio-strip__fader",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerFader, {
						value: control.gain,
						disabled: muted || pending,
						label: `${bus.label} in ${mixId} mix`,
						accentColor: color,
						onCommit: onGainCommit
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-strip__foot",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MuteButton, {
					label: `${muted ? "Unmute" : "Mute"} ${bus.label}`,
					muted,
					disabled: pending,
					onClick: () => onEnabledChange(!control.enabled)
				}), canShowApps && routingSupport !== "unavailable" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "ghost",
						size: "sm",
						className: "audio-strip__apps",
						"aria-label": `Show ${bus.label} applications`,
						children: [
							applications.length,
							" ",
							applications.length === 1 ? "app" : "apps"
						]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverContent, {
					align: "end",
					className: "audio-strip__apps-popover",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerApplications, {
						channelLabel: bus.label,
						applications,
						routingSupport,
						unavailableReason: routingUnavailableReason,
						pending,
						onApplicationRoute: onApplicationRoute ?? (() => void 0)
					})
				})] }) : null]
			})
		]
	});
}
function MuteButton({ label, muted, disabled, onClick }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
			type: "button",
			variant: "ghost",
			size: "icon",
			className: cn("audio-strip__button", muted && "is-muted"),
			disabled,
			"aria-label": label,
			"aria-pressed": muted,
			onClick,
			children: muted ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(VolumeX, { className: "size-4" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Volume2, { className: "size-4" })
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: label })] });
}
//#endregion
//#region src/renderer/src/components/audio/MixerPage.tsx
function MixerPage({ snapshot, selectedMixId, onNavigate }) {
	const setAudioBusGain = useSystemStore((state) => state.setAudioBusGain);
	const setAudioBusEnabled = useSystemStore((state) => state.setAudioBusEnabled);
	const setAudioChannelEnabled = useSystemStore((state) => state.setAudioChannelEnabled);
	const setAudioMasterGain = useSystemStore((state) => state.setAudioMasterGain);
	const setAudioMasterEnabled = useSystemStore((state) => state.setAudioMasterEnabled);
	const setAudioBusDevice = useSystemStore((state) => state.setAudioBusDevice);
	const setAudioApplicationRoute = useSystemStore((state) => state.setAudioApplicationRoute);
	const setChatMix = useSystemStore((state) => state.setChatMix);
	const pending = useSystemStore((state) => state.pendingAudioOperations > 0);
	const engineRunning = snapshot.engines.find((candidate) => candidate.kind === "audio")?.state === "running";
	const buses = mixerChannelOrder.map((id) => snapshot.audio.buses.find((bus) => bus.id === id)).filter((bus) => Boolean(bus));
	const selectedMix = snapshot.audio.mixes.find((mix) => mix.id === selectedMixId) ?? snapshot.audio.mixes[0];
	const personalMix = snapshot.audio.mixes.find((mix) => mix.id === "personal");
	const gameEnabled = (snapshot.audio.buses.find((bus) => bus.id === "game")?.enabled ?? false) && (personalMix?.buses.find((bus) => bus.id === "game")?.enabled ?? false);
	const chatEnabled = (snapshot.audio.buses.find((bus) => bus.id === "chat")?.enabled ?? false) && (personalMix?.buses.find((bus) => bus.id === "chat")?.enabled ?? false);
	const routingSupport = snapshot.audio.capabilities.applicationRouting;
	const presetNameFor = (channel) => {
		if (channel === "aux") return null;
		const presetKind = channel === "mic" ? "microphone" : channel;
		const activeId = snapshot.audio.activePresetIds[presetKind];
		return snapshot.audio.pathPresets.find((preset) => preset.id === activeId)?.name ?? null;
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "audio-desk",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "audio-desk__surface",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "audio-desk__strips",
				"data-testid": "mixer-grid",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerStrip, {
					master: true,
					masterState: selectedMix.master,
					mixId: selectedMix.id,
					mixLabel: selectedMix.label,
					devices: snapshot.audio.devices,
					engineRunning,
					pending,
					onGainCommit: (gain) => void setAudioMasterGain({
						mixId: selectedMix.id,
						gain
					}),
					onEnabledChange: (enabled) => void setAudioMasterEnabled({
						mixId: selectedMix.id,
						enabled
					})
				}), buses.map((bus) => {
					const channel = bus.id;
					const control = selectedMix.buses.find((candidate) => candidate.id === bus.id);
					if (!control) return null;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerStrip, {
						bus,
						control,
						mixId: selectedMix.id,
						devices: snapshot.audio.devices,
						engineRunning,
						pending,
						presetName: presetNameFor(channel),
						applications: snapshot.audio.applications.filter((application) => application.currentDestination === bus.id),
						routingSupport,
						routingUnavailableReason: snapshot.audio.capabilities.reason,
						onGainCommit: (gain) => void setAudioBusGain({
							mixId: selectedMix.id,
							busId: bus.id,
							gain
						}),
						onEnabledChange: (enabled) => void setAudioBusEnabled({
							mixId: selectedMix.id,
							busId: bus.id,
							enabled
						}),
						onChannelEnabledChange: (enabled) => void setAudioChannelEnabled({
							busId: bus.id,
							enabled
						}),
						onDeviceChange: (deviceId) => void setAudioBusDevice({
							busId: bus.id,
							deviceId
						}),
						onApplicationRoute: (applicationId, destination) => void setAudioApplicationRoute({
							applicationId,
							destination
						}),
						onOpen: () => bus.id !== "aux" && onNavigate(bus.id === "mic" ? "microphone" : bus.id)
					}, bus.id);
				})]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChatMixSlider, {
			value: snapshot.audio.chatMix,
			disabled: !gameEnabled || !chatEnabled,
			pending,
			onCommit: (value) => void setChatMix(value)
		})]
	});
}
//#endregion
//#region src/renderer/src/pages/audio.tsx
function tabFromHash() {
	const candidate = window.location.hash.replace(/^#audio\/?/, "");
	return audioWorkspaceTabs.includes(candidate) ? candidate : "mixer";
}
function AudioPage({ snapshot }) {
	const [tab, setTab] = (0, import_react.useState)(tabFromHash);
	const [selectedMixId, setSelectedMixId] = (0, import_react.useState)("personal");
	const engineRunning = snapshot.engines.find((candidate) => candidate.kind === "audio")?.state === "running";
	const availableTabs = (0, import_react.useMemo)(() => audioWorkspaceTabs.filter((candidate) => {
		if (candidate === "mixer") return true;
		const busId = candidate === "microphone" ? "mic" : candidate;
		return snapshot.audio.buses.find((bus) => bus.id === busId)?.enabled ?? false;
	}), [snapshot.audio.buses]);
	(0, import_react.useEffect)(() => {
		const onHashChange = () => setTab(tabFromHash());
		window.addEventListener("hashchange", onHashChange);
		return () => window.removeEventListener("hashchange", onHashChange);
	}, []);
	(0, import_react.useEffect)(() => {
		if (!engineRunning) {
			clearAudioMeters();
			return;
		}
		const unsubscribe = switchboardApi.subscribeAudioMeters(publishAudioMeterFrame);
		return () => {
			unsubscribe();
			clearAudioMeters();
		};
	}, [engineRunning]);
	(0, import_react.useEffect)(() => {
		if (availableTabs.includes(tab)) return;
		setTab("mixer");
		if (window.location.hash !== "#audio/mixer") window.location.hash = "audio/mixer";
	}, [availableTabs, tab]);
	const navigate = (next) => {
		setTab(next);
		if (window.location.hash !== `#audio/${next}`) window.location.hash = `audio/${next}`;
	};
	const statusLine = audioStatusLine({
		tab,
		engineRunning,
		realtimeMetering: snapshot.audio.capabilities.realtimeMetering,
		routingSupport: snapshot.audio.capabilities.virtualChannels,
		processingSupport: tab === "microphone" ? snapshot.audio.capabilities.microphoneDsp : snapshot.audio.capabilities.channelDsp
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "audio-page",
		"data-testid": "audio-console",
		"data-audio-tab": tab,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AudioHeader, {
			value: tab,
			onChange: navigate,
			tabs: availableTabs,
			statusLine,
			end: tab === "mixer" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mixer-mix-picker",
				role: "group",
				"aria-label": "Mixer destination",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mixer-mix-picker__label",
					children: "Mix"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
					type: "single",
					value: selectedMixId,
					onValueChange: (value) => value && setSelectedMixId(value),
					"aria-label": "Select mixer destination",
					children: snapshot.audio.mixes.map((mix) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
						value: mix.id,
						"aria-label": `${mix.label} mix`,
						children: mix.label
					}, mix.id))
				})]
			}) : null
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			id: `audio-panel-${tab}`,
			role: "tabpanel",
			"aria-labelledby": `audio-tab-${tab}`,
			tabIndex: 0,
			className: "audio-page__body outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
			children: [
				tab === "mixer" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MixerPage, {
					snapshot,
					selectedMixId,
					onNavigate: navigate
				}) : null,
				tab === "game" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChannelProcessingPage, {
					snapshot,
					busId: "game"
				}) : null,
				tab === "chat" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChannelProcessingPage, {
					snapshot,
					busId: "chat"
				}) : null,
				tab === "media" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChannelProcessingPage, {
					snapshot,
					busId: "media"
				}) : null,
				tab === "microphone" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophonePage, { snapshot }) : null
			]
		})]
	});
}
//#endregion
export { AudioPage };
