import { L as require_jsx_runtime, V as __toESM, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { I as Input, j as Slider } from "./index-DsMpX2W2.js";
//#region src/renderer/src/components/device-controls/ColorPicker.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function ColorPicker({ value, disabled, onChange, onCommit }) {
	const [hsv, setHsv] = (0, import_react.useState)(() => hexToHsv(value));
	const [hex, setHex] = (0, import_react.useState)(value.toUpperCase());
	const latest = (0, import_react.useRef)(hsv);
	(0, import_react.useEffect)(() => {
		const next = hexToHsv(value);
		latest.current = next;
		setHsv(next);
		setHex(value.toUpperCase());
	}, [value]);
	const update = (next, commit = false) => {
		latest.current = next;
		setHsv(next);
		const nextHex = hsvToHex(next);
		setHex(nextHex);
		onChange?.(nextHex);
		if (commit) onCommit(nextHex);
	};
	const updateFromPointer = (event, commit = false) => {
		const rect = event.currentTarget.getBoundingClientRect();
		const saturation = clamp((event.clientX - rect.left) / rect.width * 100, 0, 100);
		const nextValue = clamp(100 - (event.clientY - rect.top) / rect.height * 100, 0, 100);
		update({
			...latest.current,
			saturation,
			value: nextValue
		}, commit);
	};
	const commitHex = () => {
		const normalized = normalizeHex(hex);
		if (!normalized) {
			setHex(hsvToHex(latest.current));
			return;
		}
		const next = hexToHsv(normalized);
		latest.current = next;
		setHsv(next);
		setHex(normalized);
		onChange?.(normalized);
		onCommit(normalized);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "color-picker",
		"data-disabled": disabled || void 0,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "color-picker__selection",
				role: "slider",
				tabIndex: disabled ? -1 : 0,
				"aria-label": "Color saturation and brightness",
				"aria-disabled": disabled,
				"aria-valuemin": 0,
				"aria-valuemax": 100,
				"aria-valuenow": Math.round(hsv.saturation),
				"aria-valuetext": `${Math.round(hsv.saturation)}% saturation, ${Math.round(hsv.value)}% brightness`,
				style: { "--picker-hue": hsv.hue },
				onPointerDown: (event) => {
					if (disabled) return;
					event.currentTarget.setPointerCapture(event.pointerId);
					updateFromPointer(event);
				},
				onPointerMove: (event) => {
					if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
					updateFromPointer(event);
				},
				onPointerUp: (event) => {
					if (disabled) return;
					updateFromPointer(event, true);
					event.currentTarget.releasePointerCapture(event.pointerId);
				},
				onKeyDown: (event) => handleSelectionKey(event, latest.current, update),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "color-picker__selection-handle",
					style: {
						left: `${hsv.saturation}%`,
						top: `${100 - hsv.value}%`
					},
					"aria-hidden": true
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "color-picker__hue-row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "color-picker__preview",
					style: { backgroundColor: hsvToHex(hsv) },
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
					className: "color-picker__hue",
					min: 0,
					max: 360,
					step: 1,
					value: [hsv.hue],
					disabled,
					"aria-label": "Hue",
					"aria-valuetext": `${Math.round(hsv.hue)} degrees`,
					onValueChange: ([hue]) => typeof hue === "number" && update({
						...latest.current,
						hue
					}),
					onValueCommit: ([hue]) => typeof hue === "number" && update({
						...latest.current,
						hue
					}, true)
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "color-picker__hex-row",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "#" }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						value: hex.replace(/^#/, ""),
						maxLength: 6,
						"aria-label": "HEX color",
						spellCheck: false,
						disabled,
						onChange: (event) => {
							const next = event.target.value.replace(/[^0-9a-f]/gi, "").toUpperCase();
							setHex(`#${next}`);
							if (next.length === 6) {
								const normalized = `#${next}`;
								const nextHsv = hexToHsv(normalized);
								latest.current = nextHsv;
								setHsv(nextHsv);
								onChange?.(normalized);
							}
						},
						onBlur: commitHex,
						onKeyDown: (event) => {
							if (event.key === "Enter") event.currentTarget.blur();
							if (event.key === "Escape") {
								setHex(hsvToHex(latest.current));
								event.currentTarget.blur();
							}
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "HEX" })
				]
			})
		]
	});
}
function handleSelectionKey(event, color, update) {
	const step = event.shiftKey ? 5 : 1;
	let next = null;
	if (event.key === "ArrowLeft") next = {
		...color,
		saturation: clamp(color.saturation - step, 0, 100)
	};
	if (event.key === "ArrowRight") next = {
		...color,
		saturation: clamp(color.saturation + step, 0, 100)
	};
	if (event.key === "ArrowUp") next = {
		...color,
		value: clamp(color.value + step, 0, 100)
	};
	if (event.key === "ArrowDown") next = {
		...color,
		value: clamp(color.value - step, 0, 100)
	};
	if (!next) return;
	event.preventDefault();
	update(next, true);
}
function normalizeHex(value) {
	const normalized = `#${value.replace("#", "").toUpperCase()}`;
	return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : null;
}
function hexToHsv(value) {
	const normalized = normalizeHex(value) ?? "#FF1744";
	const red = Number.parseInt(normalized.slice(1, 3), 16) / 255;
	const green = Number.parseInt(normalized.slice(3, 5), 16) / 255;
	const blue = Number.parseInt(normalized.slice(5, 7), 16) / 255;
	const maximum = Math.max(red, green, blue);
	const delta = maximum - Math.min(red, green, blue);
	let hue = 0;
	if (delta > 0) {
		if (maximum === red) hue = 60 * ((green - blue) / delta % 6);
		else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
		else hue = 60 * ((red - green) / delta + 4);
	}
	return {
		hue: hue < 0 ? hue + 360 : hue,
		saturation: maximum === 0 ? 0 : delta / maximum * 100,
		value: maximum * 100
	};
}
function hsvToHex({ hue, saturation, value }) {
	const chroma = value / 100 * (saturation / 100);
	const x = chroma * (1 - Math.abs(hue / 60 % 2 - 1));
	const match = value / 100 - chroma;
	let [red, green, blue] = [
		0,
		0,
		0
	];
	if (hue < 60) [red, green, blue] = [
		chroma,
		x,
		0
	];
	else if (hue < 120) [red, green, blue] = [
		x,
		chroma,
		0
	];
	else if (hue < 180) [red, green, blue] = [
		0,
		chroma,
		x
	];
	else if (hue < 240) [red, green, blue] = [
		0,
		x,
		chroma
	];
	else if (hue < 300) [red, green, blue] = [
		x,
		0,
		chroma
	];
	else [red, green, blue] = [
		chroma,
		0,
		x
	];
	return `#${[
		red,
		green,
		blue
	].map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
//#endregion
export { ColorPicker as t };
