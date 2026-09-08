const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./KeyboardDeviceEditor-4cmy6qui.js","./demo-api-BNokT5Mf.js","./dist-vcsWvHOO.js","./index-Br7Ix8br.js","./check-8nSVBn45.js","./index-TfRLGA3a.css","./popover-CaCV1LAb.js","./badge-C5CRduJA.js","./ColorPicker-D4jf_gBT.js","./MouseDeviceEditor-CXWhHRVr.js","./dist-DBc7zWH9.js","./trash-2-Cm7s5klc.js","./context-menu-BQbbQDtr.js","./MouseDeviceEditor-Djs3MzQd.css"])))=>i.map(i=>d[i]);
import { F as require_react, L as __toESM, N as require_jsx_runtime, O as cn, k as createLucideIcon, t as switchboardApi } from "./demo-api-BNokT5Mf.js";
import { d as TooltipTrigger, l as Tooltip, u as TooltipContent } from "./dist-vcsWvHOO.js";
import { t as MicVocal } from "./mic-vocal-inbByT58.js";
import { At as ArrowLeft, B as Switch, M as Slider, Ot as Blocks, _t as Mouse, ct as Usb, kt as ArrowRight, t as __vitePreload, yt as Keyboard, z as useSystemStore } from "./index-Br7Ix8br.js";
import { n as ToggleGroup, r as ToggleGroupItem, t as Badge } from "./badge-C5CRduJA.js";
import { t as Skeleton } from "./skeleton-qZkP6Iml.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Radio = createLucideIcon("radio", [
	["path", {
		d: "M16.247 7.761a6 6 0 0 1 0 8.478",
		key: "1fwjs5"
	}],
	["path", {
		d: "M19.075 4.933a10 10 0 0 1 0 14.134",
		key: "ehdyv1"
	}],
	["path", {
		d: "M4.925 19.067a10 10 0 0 1 0-14.134",
		key: "1q22gi"
	}],
	["path", {
		d: "M7.753 16.239a6 6 0 0 1 0-8.478",
		key: "r2q7qm"
	}],
	["circle", {
		cx: "12",
		cy: "12",
		r: "2",
		key: "1c9p78"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Zap = createLucideIcon("zap", [["path", {
	d: "M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",
	key: "1v7up4"
}]]);
//#endregion
//#region src/renderer/src/assets/device-renders/g502-x-plus.png
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var g502_x_plus_default = "" + new URL("g502-x-plus-BbuaWFd7.png", import.meta.url).href;
//#endregion
//#region src/renderer/src/assets/device-renders/g502-x-plus-white.png
var g502_x_plus_white_default = "" + new URL("g502-x-plus-white-DrsZ3iUa.png", import.meta.url).href;
//#endregion
//#region src/renderer/src/assets/device-renders/quadcast-2.png
var quadcast_2_default = "" + new URL("quadcast-2-B3agZTGE.png", import.meta.url).href;
//#endregion
//#region src/renderer/src/assets/device-renders/huntsman-v2-analog-official.jpg
var huntsman_v2_analog_official_default = "" + new URL("huntsman-v2-analog-official-CiVzMmp9.jpg", import.meta.url).href;
//#endregion
//#region src/renderer/src/components/shared/device-glyph.tsx
var icons = {
	mouse: Mouse,
	microphone: MicVocal,
	keyboard: Keyboard,
	headset: Radio,
	unknown: Radio
};
function DeviceGlyph({ kind, active = false, large = false, bare = false }) {
	const Icon = icons[kind];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("grid shrink-0 place-items-center text-muted-foreground", !bare && "rounded-md border border-border bg-muted", active && (bare ? "text-primary" : "border-primary/40 bg-primary/10 text-primary"), large ? "size-24" : "size-9"),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, {
			strokeWidth: 1.6,
			className: large ? "size-11" : "size-[17px]"
		})
	});
}
//#endregion
//#region src/renderer/src/components/shared/device-lighting.ts
function applyLighting(data, mask, enabled, color, brightness = 100) {
	const target = parseHexColor(color);
	if (mask === "g502-rgb") {
		applyG502Lighting(data, target, enabled ? clamp(brightness, 0, 100) / 100 : 0);
		return;
	}
	if (mask === "photographic-rgb") {
		applyPhotographicLighting(data, target, enabled ? clamp(brightness, 0, 100) / 100 : 0);
		return;
	}
	const targetMaximum = Math.max(target.red, target.green, target.blue, 1);
	const intensity = clamp(brightness, 0, 100) / 100;
	for (let offset = 0; offset < data.length; offset += 4) {
		if ((data[offset + 3] ?? 0) <= 0) continue;
		const red = data[offset] ?? 0;
		const green = data[offset + 1] ?? 0;
		const blue = data[offset + 2] ?? 0;
		const maximum = Math.max(red, green, blue);
		maximum - Math.min(red, green, blue);
		if (!(red > 70 && red - Math.max(green, blue) > 24)) continue;
		const neutral = Math.round(18 + maximum * .08);
		if (!enabled || intensity === 0) {
			data[offset] = neutral;
			data[offset + 1] = neutral;
			data[offset + 2] = neutral;
			continue;
		}
		const litRange = Math.max(0, maximum - neutral) * intensity;
		data[offset] = Math.round(neutral + target.red / targetMaximum * litRange);
		data[offset + 1] = Math.round(neutral + target.green / targetMaximum * litRange);
		data[offset + 2] = Math.round(neutral + target.blue / targetMaximum * litRange);
	}
}
function applyPhotographicLighting(data, target, intensity) {
	const targetHsl = rgbToHsl(target);
	for (let offset = 0; offset < data.length; offset += 4) {
		if ((data[offset + 3] ?? 0) <= 0) continue;
		const source = {
			red: data[offset] ?? 0,
			green: data[offset + 1] ?? 0,
			blue: data[offset + 2] ?? 0
		};
		const maximum = Math.max(source.red, source.green, source.blue);
		const chroma = maximum - Math.min(source.red, source.green, source.blue);
		if (maximum <= 0 || chroma <= 1) continue;
		const saturation = chroma / maximum;
		const maskStrength = smoothstep(1, 9, chroma) * smoothstep(.008, .06, saturation);
		if (maskStrength <= 0) continue;
		const sourceHsl = rgbToHsl(source);
		const colorized = hslToRgb({
			hue: targetHsl.hue,
			saturation: targetHsl.saturation,
			lightness: sourceHsl.lightness
		});
		const neutralValue = relativeLuminance(source) * .55;
		const output = mixColor(source, mixColor({
			red: neutralValue,
			green: neutralValue,
			blue: neutralValue
		}, colorized, intensity), maskStrength);
		data[offset] = Math.round(output.red);
		data[offset + 1] = Math.round(output.green);
		data[offset + 2] = Math.round(output.blue);
	}
}
function applyG502Lighting(data, target, intensity) {
	const targetHsl = rgbToHsl(target);
	for (let offset = 0; offset < data.length; offset += 4) {
		if ((data[offset + 3] ?? 0) <= 0) continue;
		const source = {
			red: data[offset] ?? 0,
			green: data[offset + 1] ?? 0,
			blue: data[offset + 2] ?? 0
		};
		const maximum = Math.max(source.red, source.green, source.blue);
		const chroma = maximum - Math.min(source.red, source.green, source.blue);
		if (maximum <= 0 || chroma <= 6) continue;
		const saturation = chroma / maximum;
		const maskStrength = smoothstep(6, 16, chroma) * smoothstep(.025, .075, saturation);
		if (maskStrength <= 0) continue;
		const sourceHsl = rgbToHsl(source);
		const colorized = hslToRgb({
			hue: targetHsl.hue,
			saturation: sourceHsl.saturation * targetHsl.saturation,
			lightness: sourceHsl.lightness
		});
		const neutralValue = relativeLuminance(source) * .24;
		const output = mixColor(source, mixColor({
			red: neutralValue,
			green: neutralValue,
			blue: neutralValue
		}, colorized, intensity), maskStrength);
		data[offset] = Math.round(output.red);
		data[offset + 1] = Math.round(output.green);
		data[offset + 2] = Math.round(output.blue);
	}
}
function adaptBlackHardwareForDarkSurface(data) {
	const maximumTone = 112;
	const maximumLift = 26;
	for (let offset = 0; offset < data.length; offset += 4) {
		const alpha = data[offset + 3] ?? 0;
		if (alpha <= 0) continue;
		const red = data[offset] ?? 0;
		const green = data[offset + 1] ?? 0;
		const blue = data[offset + 2] ?? 0;
		const maximum = Math.max(red, green, blue);
		const minimum = Math.min(red, green, blue);
		if (maximum >= maximumTone) continue;
		const chroma = maximum - minimum;
		const neutralWeight = clamp(1 - Math.max(0, chroma - 10) / 24, 0, 1);
		if (neutralWeight <= 0) continue;
		const shadowWeight = 1 - maximum / maximumTone;
		const opacityWeight = Math.min(1, alpha / 192);
		const lift = Math.round(maximumLift * neutralWeight * shadowWeight * opacityWeight);
		if (lift <= 0) continue;
		data[offset] = Math.min(255, red + lift);
		data[offset + 1] = Math.min(255, green + lift);
		data[offset + 2] = Math.min(255, blue + lift);
	}
}
function relativeLuminance(color) {
	return color.red * .2126 + color.green * .7152 + color.blue * .0722;
}
function rgbToHsl(color) {
	const red = color.red / 255;
	const green = color.green / 255;
	const blue = color.blue / 255;
	const maximum = Math.max(red, green, blue);
	const minimum = Math.min(red, green, blue);
	const chroma = maximum - minimum;
	const lightness = (maximum + minimum) / 2;
	if (chroma === 0) return {
		hue: 0,
		saturation: 0,
		lightness
	};
	const saturation = chroma / (1 - Math.abs(2 * lightness - 1));
	let hue;
	if (maximum === red) hue = (green - blue) / chroma % 6;
	else if (maximum === green) hue = (blue - red) / chroma + 2;
	else hue = (red - green) / chroma + 4;
	return {
		hue: (hue * 60 + 360) % 360,
		saturation,
		lightness
	};
}
function hslToRgb(color) {
	const chroma = (1 - Math.abs(2 * color.lightness - 1)) * color.saturation;
	const hue = color.hue / 60;
	const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
	let red = 0;
	let green = 0;
	let blue = 0;
	if (hue < 1) [red, green] = [chroma, secondary];
	else if (hue < 2) [red, green] = [secondary, chroma];
	else if (hue < 3) [green, blue] = [chroma, secondary];
	else if (hue < 4) [green, blue] = [secondary, chroma];
	else if (hue < 5) [red, blue] = [secondary, chroma];
	else [red, blue] = [chroma, secondary];
	const match = color.lightness - chroma / 2;
	return {
		red: (red + match) * 255,
		green: (green + match) * 255,
		blue: (blue + match) * 255
	};
}
function mixColor(from, to, amount) {
	return {
		red: from.red + (to.red - from.red) * amount,
		green: from.green + (to.green - from.green) * amount,
		blue: from.blue + (to.blue - from.blue) * amount
	};
}
function smoothstep(edge0, edge1, value) {
	const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
	return normalized * normalized * (3 - 2 * normalized);
}
function parseHexColor(value) {
	return {
		red: Number.parseInt(value.slice(1, 3), 16),
		green: Number.parseInt(value.slice(3, 5), 16),
		blue: Number.parseInt(value.slice(5, 7), 16)
	};
}
function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
//#endregion
//#region src/renderer/src/components/shared/device-render.tsx
var processedArtworkCache = /* @__PURE__ */ new Map();
var maximumCachedArtwork = 6;
var artworkByAssetKey = {
	"logitech-g502-x-plus-black": {
		src: g502_x_plus_default,
		lightingMask: "g502-rgb",
		presentation: {
			orientation: "portrait",
			galleryScale: 1.02,
			groundWidth: "46%"
		}
	},
	"logitech-g502-x-plus-white": {
		src: g502_x_plus_white_default,
		lightingMask: "g502-rgb",
		presentation: {
			orientation: "portrait",
			galleryScale: 1.02,
			groundWidth: "46%"
		}
	},
	"hyperx-quadcast-2": {
		src: quadcast_2_default,
		lightingMask: "red-dominant",
		toneProfile: "black-hardware-on-dark",
		presentation: {
			orientation: "portrait",
			galleryScale: .96,
			groundWidth: "42%"
		}
	},
	"razer-huntsman-v2-analog": {
		src: huntsman_v2_analog_official_default,
		lightingMask: "photographic-rgb",
		toneProfile: "black-hardware-on-dark-when-unlit",
		crop: {
			left: .09,
			top: .12,
			right: .91,
			bottom: .88
		},
		heroProcessingSize: 1100,
		presentation: {
			orientation: "landscape",
			galleryScale: .94,
			heroScale: 1.06,
			groundWidth: "72%"
		}
	}
};
function DeviceRender({ device, density, className, lightingPreview }) {
	const artwork = artworkByAssetKey[device.asset.key];
	const lighting = device.capabilities.lighting;
	const lightingEnabled = Boolean((lightingPreview?.enabled ?? lighting?.enabled) && !(lighting?.muteLinked && device.capabilities.muteState?.muted === true));
	const lightingColor = asColor(lightingPreview?.color ?? lighting?.color, device.kind === "microphone" ? "#e51937" : "#ff658a");
	const lightingBrightness = lightingPreview?.brightness ?? lighting?.brightness ?? 100;
	const preserveSourceColor = lightingPreview?.preserveSourceColor ?? [
		"spectrum",
		"wave-left",
		"wave-right"
	].includes(lighting?.activeEffectId ?? "");
	const label = [device.identity.manufacturer, device.displayName].filter(Boolean).join(" ");
	const presentation = artwork?.presentation ?? fallbackPresentation(device);
	const presentationStyle = {
		"--device-optical-scale": density === "gallery" ? presentation.galleryScale : presentation.heroScale ?? 1,
		"--device-ground-width": presentation.groundWidth,
		"--device-accent": lightingEnabled ? lightingColor : "var(--border-strong)"
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("device-render", `device-render--${density}`, className),
		style: presentationStyle,
		"data-asset-key": device.asset.key,
		"data-asset-match": device.asset.matchedBy,
		"data-colorway": device.identity.colorway ?? "unknown",
		"data-variant-source": device.variantResolution.source,
		"data-orientation": presentation.orientation,
		"data-lighting-enabled": lightingEnabled,
		"data-lighting-color": lightingColor,
		"data-lighting-brightness": lightingBrightness,
		"data-lighting-preview": lightingPreview ? "true" : void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "device-render__ground",
			"aria-hidden": true
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "device-render__artwork",
			children: artwork ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ProductCanvas, {
				artwork,
				density,
				label,
				lighting: {
					enabled: lightingEnabled,
					color: lightingColor,
					brightness: lightingBrightness,
					preserveSourceColor
				},
				fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FallbackRender, {
					device,
					label
				})
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FallbackRender, {
				device,
				label
			})
		})]
	});
}
function fallbackPresentation(device) {
	return device.kind === "keyboard" ? {
		orientation: "landscape",
		galleryScale: .96,
		groundWidth: "72%"
	} : {
		orientation: "portrait",
		galleryScale: .82,
		groundWidth: "48%"
	};
}
function FallbackRender({ device, label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		role: "img",
		"aria-label": label,
		className: "device-render__fallback",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceGlyph, {
			kind: device.kind,
			active: device.connected,
			large: true,
			bare: true
		})
	});
}
function ProductCanvas({ artwork, density, label, lighting, fallback }) {
	const canvasRef = (0, import_react.useRef)(null);
	const [status, setStatus] = (0, import_react.useState)("loading");
	(0, import_react.useEffect)(() => {
		let active = true;
		const cacheKey = [
			artwork.src,
			artwork.lightingMask ?? "no-lighting",
			artwork.toneProfile ?? "source-tone",
			density,
			artwork.lightingMask ? lighting.enabled ? "on" : "off" : "static",
			artwork.lightingMask ? lighting.color : "source-color",
			artwork.lightingMask ? lighting.brightness : "source-brightness",
			artwork.lightingMask ? lighting.preserveSourceColor : "source-mode"
		].join("|");
		const cached = processedArtworkCache.get(cacheKey);
		if (cached && canvasRef.current && paintProcessedArtwork(canvasRef.current, cached)) {
			setStatus("ready");
			return () => {
				active = false;
			};
		}
		const image = new Image();
		image.decoding = "async";
		setStatus("loading");
		image.onload = () => {
			if (!active || !canvasRef.current) return;
			const canvas = canvasRef.current;
			const ready = processedArtworkCache.get(cacheKey);
			if (ready && paintProcessedArtwork(canvas, ready)) {
				setStatus("ready");
				return;
			}
			const context = canvas.getContext("2d", { willReadFrequently: true });
			if (!context) {
				setStatus("failed");
				return;
			}
			const crop = resolveArtworkCrop(image, artwork.crop);
			const processingLimit = density === "hero" ? artwork.heroProcessingSize ?? 760 : 520;
			const processingScale = Math.min(1, processingLimit / Math.max(crop.width, crop.height));
			canvas.width = Math.round(crop.width * processingScale);
			canvas.height = Math.round(crop.height * processingScale);
			context.imageSmoothingEnabled = true;
			context.imageSmoothingQuality = "high";
			context.clearRect(0, 0, canvas.width, canvas.height);
			context.drawImage(image, crop.left, crop.top, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
			try {
				const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
				if (artwork.lightingMask && (!lighting.preserveSourceColor || !lighting.enabled)) applyLighting(pixels.data, artwork.lightingMask, lighting.enabled, lighting.color, lighting.brightness);
				if (artwork.toneProfile === "black-hardware-on-dark" || artwork.toneProfile === "black-hardware-on-dark-when-unlit" && !lighting.enabled) adaptBlackHardwareForDarkSurface(pixels.data);
				const bounds = findVisibleBounds(pixels.data, canvas.width, canvas.height);
				canvas.width = bounds.width;
				canvas.height = bounds.height;
				const output = canvas.getContext("2d");
				if (!output) {
					setStatus("failed");
					return;
				}
				output.imageSmoothingEnabled = true;
				output.imageSmoothingQuality = "high";
				output.putImageData(pixels, -bounds.left, -bounds.top);
				rememberProcessedArtwork(cacheKey, {
					pixels: output.getImageData(0, 0, bounds.width, bounds.height),
					width: bounds.width,
					height: bounds.height
				});
				setStatus("ready");
			} catch {
				setStatus("failed");
			}
		};
		image.onerror = () => active && setStatus("failed");
		image.src = artwork.src;
		return () => {
			active = false;
			image.onload = null;
			image.onerror = null;
		};
	}, [
		artwork.crop,
		artwork.heroProcessingSize,
		artwork.lightingMask,
		artwork.src,
		artwork.toneProfile,
		density,
		lighting.brightness,
		lighting.color,
		lighting.enabled,
		lighting.preserveSourceColor
	]);
	if (status === "failed") return fallback;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "device-render__media",
		"data-render-state": status,
		children: [status === "loading" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, {
			className: "device-render__skeleton",
			"aria-hidden": true
		}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("canvas", {
			ref: canvasRef,
			role: "img",
			"aria-label": label,
			"aria-busy": status === "loading",
			"data-render-state": status
		})]
	});
}
function resolveArtworkCrop(image, crop) {
	if (!crop) return {
		left: 0,
		top: 0,
		width: image.naturalWidth,
		height: image.naturalHeight
	};
	const left = Math.round(image.naturalWidth * crop.left);
	const top = Math.round(image.naturalHeight * crop.top);
	const right = Math.round(image.naturalWidth * crop.right);
	const bottom = Math.round(image.naturalHeight * crop.bottom);
	return {
		left,
		top,
		width: Math.max(1, right - left),
		height: Math.max(1, bottom - top)
	};
}
function paintProcessedArtwork(canvas, artwork) {
	canvas.width = artwork.width;
	canvas.height = artwork.height;
	const context = canvas.getContext("2d");
	if (!context) return false;
	context.putImageData(artwork.pixels, 0, 0);
	return true;
}
function rememberProcessedArtwork(key, artwork) {
	processedArtworkCache.delete(key);
	processedArtworkCache.set(key, artwork);
	if (processedArtworkCache.size <= maximumCachedArtwork) return;
	const oldest = processedArtworkCache.keys().next().value;
	if (typeof oldest === "string") processedArtworkCache.delete(oldest);
}
function findVisibleBounds(data, width, height) {
	let left = width;
	let top = height;
	let right = -1;
	let bottom = -1;
	for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
		if ((data[(y * width + x) * 4 + 3] ?? 0) <= 4) continue;
		if (x < left) left = x;
		if (y < top) top = y;
		if (x > right) right = x;
		if (y > bottom) bottom = y;
	}
	if (right < left || bottom < top) return {
		left: 0,
		top: 0,
		width,
		height
	};
	const padding = 2;
	const paddedLeft = Math.max(0, left - padding);
	const paddedTop = Math.max(0, top - padding);
	const paddedRight = Math.min(width - 1, right + padding);
	const paddedBottom = Math.min(height - 1, bottom + padding);
	return {
		left: paddedLeft,
		top: paddedTop,
		width: paddedRight - paddedLeft + 1,
		height: paddedBottom - paddedTop + 1
	};
}
function asColor(value, fallback) {
	return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
//#endregion
//#region src/shared/device-module-state.ts
function devicesFromEnabledModules(devices, modules) {
	const enabledModuleIds = new Set(modules.filter((module) => module.enabled).map((module) => module.id));
	return devices.filter((device) => enabledModuleIds.has(device.moduleId));
}
//#endregion
//#region src/renderer/src/components/device-controls/battery-status-format.ts
function formatBatteryRuntime(minutes) {
	const safeMinutes = Math.max(0, Math.round(minutes));
	if (safeMinutes < 60) return `~${Math.max(1, safeMinutes)}m remaining`;
	return `~${Math.max(1, Math.round(safeMinutes / 60))}h remaining`;
}
function batteryRuntimeLabel(battery, connected) {
	if (!connected) return "Estimate unavailable";
	if (battery.fullyCharged) return "Fully charged";
	if (battery.charging) return "Estimate unavailable";
	return battery.estimatedMinutesRemaining === void 0 ? "Estimate unavailable" : formatBatteryRuntime(battery.estimatedMinutesRemaining);
}
//#endregion
//#region src/renderer/src/components/device-controls/BatteryStatus.tsx
function BatteryStatus({ battery, connectionLabel, variant = "compact", connected = true, loading = false, className }) {
	if (loading) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryStatusSkeleton, {
		variant,
		className
	});
	if (!battery) return null;
	const roundedPercentage = Math.round(battery.percentage);
	const severity = roundedPercentage <= 5 ? "critical" : roundedPercentage <= 15 ? "low" : "normal";
	const isCharging = Boolean(battery.charging && !battery.fullyCharged);
	const state = !connected ? "disconnected" : battery.fullyCharged ? "full" : isCharging ? "charging" : severity;
	const runtimeLabel = batteryRuntimeLabel(battery, connected);
	const accessible = `${roundedPercentage} percent battery${isCharging ? ", charging" : ""}, ${runtimeLabel.toLocaleLowerCase()}`;
	const tooltipState = state === "full" ? "Fully charged" : state === "charging" ? "Charging" : state === "disconnected" ? "Disconnected" : "On battery";
	if (variant === "compact") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("battery-status battery-status--compact text-muted-foreground", className),
			"data-charging": isCharging || void 0,
			"data-severity": severity,
			"data-state": state,
			role: "group",
			"aria-label": accessible,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryLevelIcon, {
					percentage: battery.percentage,
					fullyCharged: battery.fullyCharged,
					charging: isCharging
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", {
					className: "battery-status__value tabular-nums",
					children: [roundedPercentage, "%"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "battery-status__separator",
					"aria-hidden": true,
					children: "·"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "battery-status__runtime text-muted-foreground",
					children: runtimeLabel
				})
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryStatusTooltip, {
		percentage: roundedPercentage,
		state: tooltipState,
		runtime: runtimeLabel,
		updatedAt: battery.updatedAt,
		connectionLabel
	})] });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: cn("battery-status", `battery-status--${variant}`, className),
			"data-charging": isCharging || void 0,
			"data-severity": severity,
			"data-state": state,
			role: "group",
			tabIndex: variant === "header" ? 0 : void 0,
			"aria-label": accessible,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryLevelIcon, {
				percentage: battery.percentage,
				fullyCharged: battery.fullyCharged,
				charging: isCharging
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "battery-status__copy",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "battery-status__topline",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", {
						className: "battery-status__value tabular-nums",
						children: [roundedPercentage, "%"]
					}), isCharging ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "battery-status__charging",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							"aria-hidden": true,
							children: "·"
						}), "Charging"]
					}) : null]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "battery-status__runtime",
					children: runtimeLabel
				})]
			})]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryStatusTooltip, {
		percentage: roundedPercentage,
		state: tooltipState,
		runtime: runtimeLabel,
		updatedAt: battery.updatedAt,
		connectionLabel,
		align: "end"
	})] });
}
function BatteryStatusTooltip({ percentage, state, runtime, updatedAt, connectionLabel, align = "center" }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipContent, {
		side: "bottom",
		align,
		className: "battery-status__tooltip",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("strong", { children: [
				percentage,
				"% · ",
				state
			] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: runtime }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Updated ", formatUpdatedTime(updatedAt)] }),
			connectionLabel && connectionLabel !== "Battery" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: connectionLabel }) : null
		]
	});
}
function BatteryLevelIcon({ percentage, fullyCharged, charging }) {
	const fillWidth = 12.5 * (fullyCharged ? 100 : Math.min(100, Math.max(0, percentage))) / 100;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "battery-status__icon-wrap",
		"aria-hidden": true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", {
			className: "battery-status__icon",
			viewBox: "0 0 26 26",
			fill: "none",
			xmlns: "http://www.w3.org/2000/svg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					x: "2.25",
					y: "6.75",
					width: "17.5",
					height: "12.5",
					rx: "2.25",
					stroke: "currentColor",
					strokeWidth: "1.5"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", {
					d: "M22.5 10.25v5.5",
					stroke: "currentColor",
					strokeWidth: "1.5",
					strokeLinecap: "round"
				}),
				fillWidth > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("rect", {
					className: "battery-status__icon-fill",
					x: "4.75",
					y: "9.25",
					width: fillWidth,
					height: "7.5",
					rx: Math.min(1, fillWidth / 2)
				}) : null
			]
		}), charging ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Zap, { className: "battery-status__icon-bolt" }) : null]
	});
}
function BatteryStatusSkeleton({ variant, className }) {
	if (variant === "compact") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("battery-status battery-status--compact battery-status--loading", className),
		role: "status",
		"aria-label": "Loading battery information",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "battery-status__icon-skeleton" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "battery-status__summary-skeleton" })]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("battery-status battery-status--loading", `battery-status--${variant}`, className),
		role: "status",
		"aria-label": "Loading battery information",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "battery-status__icon-skeleton" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "battery-status__copy",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "battery-status__value-skeleton" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "battery-status__runtime-skeleton" })]
		})]
	});
}
function formatUpdatedTime(updatedAt) {
	return new Intl.DateTimeFormat(void 0, {
		hour: "numeric",
		minute: "2-digit"
	}).format(updatedAt);
}
//#endregion
//#region src/renderer/src/components/audio/HorizontalLevelMeter.tsx
function levelToDb(level) {
	return level <= .001 ? -60 : Math.max(-60, 20 * Math.log10(level));
}
var HorizontalLevelMeter = (0, import_react.memo)(function HorizontalLevelMeter({ busId, active, inactiveLabel, label }) {
	const meterRef = (0, import_react.useRef)(null);
	const fillRef = (0, import_react.useRef)(null);
	const peakRef = (0, import_react.useRef)(null);
	const readoutRef = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		let frame = null;
		let heldPeak = 0;
		let heldAt = 0;
		let latest = {
			busId,
			level: 0,
			peak: 0,
			clipping: false
		};
		const render = () => {
			frame = null;
			const now = performance.now();
			const level = active ? latest.level : 0;
			const incomingPeak = active ? latest.peak : 0;
			if (incomingPeak >= heldPeak) {
				heldPeak = incomingPeak;
				heldAt = now;
			} else if (now - heldAt > 1100) heldPeak = Math.max(incomingPeak, heldPeak - .035);
			if (fillRef.current) fillRef.current.style.width = `${Math.min(100, Math.max(0, level * 100))}%`;
			if (peakRef.current) peakRef.current.style.left = `${Math.min(100, Math.max(0, heldPeak * 100))}%`;
			const db = levelToDb(level);
			const text = db <= -60 ? "−∞ dB" : `${Math.round(db)} dB`;
			if (readoutRef.current) readoutRef.current.textContent = active ? text : inactiveLabel;
			meterRef.current?.setAttribute("aria-valuenow", db.toFixed(1));
			meterRef.current?.setAttribute("aria-valuetext", active ? text : inactiveLabel);
		};
		const onMeter = (value) => {
			latest = value;
			if (frame === null) frame = requestAnimationFrame(render);
		};
		render();
		const unsubscribe = active ? switchboardApi.subscribeAudioMeters((frame) => {
			const value = frame.values.find((candidate) => candidate.busId === busId);
			if (value) onMeter(value);
		}) : () => void 0;
		return () => {
			unsubscribe();
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [
		active,
		busId,
		inactiveLabel
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "horizontal-meter",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "horizontal-meter__heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("output", {
				ref: readoutRef,
				children: inactiveLabel
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			ref: meterRef,
			className: "horizontal-meter__track",
			role: "meter",
			"aria-label": label,
			"aria-valuemin": -60,
			"aria-valuemax": 0,
			"aria-valuenow": -60,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: fillRef,
				className: "horizontal-meter__fill"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				ref: peakRef,
				className: "horizontal-meter__peak"
			})]
		})]
	});
});
//#endregion
//#region src/renderer/src/components/shared/human-controls.tsx
function SemanticChoice({ label, value, options, disabled, customIsOption = false, onChange, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("semantic-choice", className),
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "sr-only",
				children: label
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
				type: "single",
				value: value === "custom" && !customIsOption ? "" : value,
				disabled,
				"aria-label": label,
				onValueChange: (next) => next && onChange(next),
				children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
					value: option.value,
					children: option.label
				}, option.value))
			}),
			value === "custom" && !customIsOption ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "semantic-choice__custom",
				children: "Custom"
			}) : null
		]
	});
}
function PrimarySlider({ label, value, min, max, step, unit, disabled, description, onChange, onCommit, className }) {
	const [current, setCurrent] = (0, import_react.useState)(value);
	(0, import_react.useEffect)(() => setCurrent(value), [value]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: cn("primary-slider", className),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "primary-slider__heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), description ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: description }) : null] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [formatValue(current, step), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: unit })] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
			variant: "fader",
			min,
			max,
			step,
			value: [current],
			disabled,
			"aria-label": label,
			"aria-valuetext": `${formatValue(current, step)} ${unit}`.trim(),
			onValueChange: ([next]) => {
				if (typeof next === "number") {
					setCurrent(next);
					onChange?.(next);
				}
			},
			onValueCommit: ([next]) => {
				if (typeof next === "number") onCommit(next);
			}
		})]
	});
}
function formatValue(value, step) {
	if (step >= 1) return Math.round(value).toString();
	return value.toFixed(step < .1 ? 2 : 1);
}
//#endregion
//#region src/renderer/src/components/shared/surface.tsx
function StatusDot({ active, warning = false }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("inline-block size-[7px] rounded-full", warning ? "bg-warning" : active ? "bg-success" : "bg-status-neutral") });
}
//#endregion
//#region src/renderer/src/pages/devices.tsx
var KeyboardDeviceEditor = (0, import_react.lazy)(() => __vitePreload(() => import("./KeyboardDeviceEditor-4cmy6qui.js").then((module) => ({ default: module.KeyboardDeviceEditor })), __vite__mapDeps([0,1,2,3,4,5,6,7,8]), import.meta.url));
var MouseDeviceEditor = (0, import_react.lazy)(() => __vitePreload(() => import("./MouseDeviceEditor-CXWhHRVr.js").then((module) => ({ default: module.MouseDeviceEditor })), __vite__mapDeps([9,1,2,4,10,3,5,6,11,12,7,8,13]), import.meta.url));
function DevicesPage({ snapshot }) {
	const selectedDeviceId = useSystemStore((state) => state.selectedDeviceId);
	const selectDevice = useSystemStore((state) => state.selectDevice);
	const clearDeviceSelection = useSystemStore((state) => state.clearDeviceSelection);
	const devices = devicesFromEnabledModules(snapshot.devices, snapshot.modules);
	const selected = devices.find((device) => device.id === selectedDeviceId);
	const selectedModule = selected ? snapshot.modules.find((module) => module.id === selected.moduleId) : void 0;
	const selectedFromLocalAddon = selectedModule?.source === "local";
	const localModuleIds = new Set(snapshot.modules.filter((module) => module.source === "local").map((module) => module.id));
	const backButtonRef = (0, import_react.useRef)(null);
	const deviceButtonRefs = (0, import_react.useRef)(/* @__PURE__ */ new Map());
	const returnFocusDeviceId = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		const frame = requestAnimationFrame(() => {
			if (selected) {
				backButtonRef.current?.focus();
				return;
			}
			const deviceId = returnFocusDeviceId.current;
			if (!deviceId) return;
			deviceButtonRefs.current.get(deviceId)?.focus();
			returnFocusDeviceId.current = null;
		});
		return () => cancelAnimationFrame(frame);
	}, [selected?.id]);
	if (devices.length === 0) {
		const devicesHiddenByModules = snapshot.devices.length > 0;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "device-gallery-page",
			"data-state": "empty",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceGalleryHeader, { connectedCount: 0 }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "device-gallery-empty",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "text-center",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Usb, { className: "mx-auto size-6 text-muted-foreground" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-3 text-sm font-medium text-foreground",
							children: devicesHiddenByModules ? "No devices from enabled modules" : "No supported devices detected"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-xs text-muted-foreground",
							children: devicesHiddenByModules ? "Enable the device module in Settings to show its devices here." : "Install a device module and connect hardware to see it here."
						})
					]
				})
			})]
		});
	}
	if (!selected) {
		const connectedCount = devices.filter((device) => device.connected).length;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "device-gallery-page",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceGalleryHeader, { connectedCount }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "device-gallery-stage",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "device-gallery",
					"aria-label": "Switchboard devices",
					"data-device-count": devices.length,
					children: devices.map((device) => {
						const localAddon = localModuleIds.has(device.moduleId);
						return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "device-gallery__entry",
							"data-connected": device.connected,
							"data-kind": device.kind,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								ref: (node) => {
									if (node) deviceButtonRefs.current.set(device.id, node);
									else deviceButtonRefs.current.delete(device.id);
								},
								type: "button",
								onClick: () => {
									returnFocusDeviceId.current = device.id;
									selectDevice(device.id);
								},
								className: "device-gallery__item",
								"aria-label": `Open controls for ${device.identity.manufacturer ?? ""} ${device.displayName}`.trim(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
									device,
									density: "gallery"
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "device-gallery__copy",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "device-gallery__manufacturer",
											children: device.identity.manufacturer
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "device-gallery__title-row",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
												className: "device-gallery__name",
												children: device.displayName
											}), device.connected && (device.capabilities.battery?.percentage ?? 100) <= 15 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
												variant: "warning",
												children: "Low battery"
											}) : null]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "device-gallery__status",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { active: device.connected }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: device.connected ? "Connected" : "Disconnected" }),
												device.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
													"aria-hidden": true,
													children: "·"
												}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: connectionLabel(device) })] }) : null
											]
										}),
										localAddon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "device-gallery__addon-state",
											children: "Local add-on · identity only"
										}) : null,
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											className: "device-gallery__telemetry",
											children: device.capabilities.battery ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryStatus, {
												battery: device.capabilities.battery,
												connectionLabel: device.identity.connection === "wireless" ? "Wireless" : connectionLabel(device),
												connected: device.connected
											}) : null
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
											className: "device-gallery__configure",
											"aria-hidden": true,
											children: ["Configure ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowRight, {})]
										})
									]
								})]
							})
						}, device.id);
					})
				})
			})]
		});
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "device-workbench",
		"data-device-kind": selected.kind,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "device-workbench__toolbar",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
					ref: backButtonRef,
					type: "button",
					className: "device-workbench__back",
					onClick: () => {
						returnFocusDeviceId.current = selected.id;
						clearDeviceSelection();
					},
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowLeft, {
						"aria-hidden": true,
						className: "size-3.5"
					}), "All devices"]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "device-workbench__identity",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: selected.displayName }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "device-workbench__meta",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { active: selected.connected }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: selected.connected ? "Connected" : "Disconnected" }),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								children: "·"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: connectionLabel(selected) }),
							selectedFromLocalAddon ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": true,
								children: "·"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Local add-on · identity only" })] }) : null
						]
					})]
				}),
				selected.capabilities.battery ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BatteryStatus, {
					battery: selected.capabilities.battery,
					connected: selected.connected,
					variant: "header",
					className: "device-workbench__battery"
				}) : null
			]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
			fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "grid min-h-60 place-items-center text-xs text-muted-foreground",
				role: "status",
				children: "Loading device controls…"
			}),
			children: selectedFromLocalAddon ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LocalAddonDeviceSurface, {
				device: selected,
				moduleName: selectedModule?.name ?? selected.moduleId
			}) : selected.kind === "mouse" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MouseDeviceEditor, { device: selected }) : selected.kind === "keyboard" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyboardDeviceEditor, { device: selected }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "device-workbench__hero",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
					device: selected,
					density: "hero"
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "device-workbench__controls",
				children: selected.kind === "microphone" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneControls, {
					device: selected,
					snapshot
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "py-8 text-center text-xs text-muted-foreground",
					children: "This device does not expose a control surface yet."
				})
			})] })
		})]
	});
}
function LocalAddonDeviceSurface({ device, moduleName }) {
	const setPage = useSystemStore((state) => state.setPage);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "local-addon-device",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "device-workbench__hero",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
				device,
				density: "hero"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			className: "local-addon-device__boundary",
			"aria-labelledby": "local-addon-device-title",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Blocks, { "aria-hidden": true }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h3", {
					id: "local-addon-device-title",
					children: ["Identity supplied by ", moduleName]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "This sandboxed add-on matched the connected hardware. Module Host API v1 cannot publish writable controls or claim device-confirmed telemetry." }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", { children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "VID : PID" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", { children: [
						formatUsbId(device.identity.vendorId),
						" : ",
						formatUsbId(device.identity.productId)
					] })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Connection" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: connectionLabel(device) })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Capability state" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: "Read-only identity" })] })
				] }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "local-addon-device__settings",
					onClick: () => setPage("modules"),
					children: "Open module project"
				})
			] })]
		})]
	});
}
function DeviceGalleryHeader({ connectedCount }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
		className: "device-gallery-header",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: "Devices" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Your connected hardware" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "device-gallery-header__status",
			"aria-live": "polite",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(StatusDot, { active: connectedCount > 0 }),
				connectedCount,
				" connected"
			]
		})]
	});
}
function connectionLabel(device) {
	return device.identity.connectionLabel ?? (device.identity.connection === "wireless" ? "Wireless" : device.identity.connection?.toUpperCase()) ?? "Unknown connection";
}
function formatUsbId(value) {
	return typeof value === "number" ? value.toString(16).padStart(4, "0").toLocaleUpperCase() : "----";
}
function MicrophoneControls({ device, snapshot }) {
	const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
	const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
	const gain = asNumber(device.settings.gain, 58);
	const monitoring = asNumber(device.settings.monitoring, 18);
	const lighting = device.capabilities.lighting;
	const muteState = device.capabilities.muteState;
	const muted = muteState?.muted ?? null;
	const lightingDisabled = !device.connected || !lighting?.writable;
	const lightingSupportsSpeed = Boolean(lighting?.speedWritable && lighting.activeEffectId !== "solid");
	const engineRunning = snapshot.engines.find((candidate) => candidate.kind === "audio")?.state === "running";
	const microphoneBusEnabled = snapshot.audio.mixes.find((mix) => mix.id === "personal")?.buses.find((candidate) => candidate.id === "mic")?.enabled ?? false;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "device-controls microphone-hardware",
		"aria-labelledby": "microphone-hardware-heading",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "microphone-hardware__heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "microphone-hardware-heading",
					children: "Microphone controls"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "microphone-hardware__state",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardwareState, {
						tone: muted === null ? "unknown" : muted ? "muted" : "live",
						label: muted === null ? "Mute unknown" : muted ? "Muted" : "Live",
						detail: muteState?.unavailableReason ?? "Physical touch sensor"
					}), lighting ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardwareState, {
						tone: lighting.enabled && lighting.state === "maintained" ? "live" : "unknown",
						label: !lighting.enabled ? "Lighting off" : lighting.state === "maintained" ? "Lighting maintained" : "Lighting unknown",
						detail: !lighting.enabled ? "Maintained lighting is disabled" : lighting.state === "maintained" ? "No hardware readback" : lighting.stateReason ?? "Waiting for hardware"
					}) : null]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "microphone-hardware__primary",
				children: [device.capabilities.gain ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySlider, {
					label: "Input volume",
					value: gain,
					min: 0,
					max: 100,
					step: 1,
					unit: "%",
					onCommit: (value) => void setDeviceSetting({
						deviceId: device.id,
						key: "gain",
						value
					})
				}) : null, device.capabilities.monitoring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySlider, {
					label: "Direct monitoring",
					value: monitoring,
					min: 0,
					max: 100,
					step: 1,
					unit: "%",
					onCommit: (value) => void setDeviceSetting({
						deviceId: device.id,
						key: "monitoring",
						value
					})
				}) : null]
			}),
			lighting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "microphone-hardware__lighting",
				"aria-labelledby": "microphone-lighting-heading",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "microphone-hardware__lighting-topline",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "microphone-hardware__lighting-identity",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
								id: "microphone-lighting-heading",
								children: "Lighting"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
									className: "microphone-hardware__color",
									tabIndex: 0,
									"aria-label": "Fixed red lighting color",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
										style: { backgroundColor: "#f20000" },
										"aria-hidden": true
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Fixed red" })]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "The QuadCast 2 lighting LEDs are red; color writes are not supported." })] })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "microphone-switch-state",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lighting.enabled ? "On" : "Off" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
								id: `lighting-${device.id}`,
								checked: lighting.enabled,
								disabled: lightingDisabled,
								"aria-label": "Lighting",
								onCheckedChange: (enabled) => void setDeviceControl({
									deviceId: device.id,
									change: {
										type: "lighting-enabled",
										enabled
									}
								})
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "microphone-hardware__choices",
						children: [lighting.profiles.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "microphone-hardware__choice-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Profile" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SemanticChoice, {
								label: "Lighting profile",
								value: lighting.activeProfileId ?? "custom",
								options: lighting.profiles.map((profile) => ({
									value: profile.id,
									label: profile.label
								})),
								customIsOption: true,
								disabled: lightingDisabled,
								onChange: (profileId) => void setDeviceControl({
									deviceId: device.id,
									change: {
										type: "lighting-profile",
										profileId
									}
								})
							})]
						}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "microphone-hardware__choice-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Pattern" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SemanticChoice, {
								label: "Lighting pattern",
								value: lighting.activeEffectId,
								options: lighting.availableEffects.map((effect) => ({
									value: effect.id,
									label: effect.label
								})),
								disabled: lightingDisabled || !lighting.enabled,
								onChange: (effectId) => void setDeviceControl({
									deviceId: device.id,
									change: {
										type: "lighting-effect",
										effectId
									}
								})
							})]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "microphone-hardware__lighting-sliders",
						"data-single": !lightingSupportsSpeed,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySlider, {
							label: "Brightness",
							value: lighting.brightness ?? 72,
							min: 0,
							max: 100,
							step: 1,
							unit: "%",
							disabled: lightingDisabled || !lighting.enabled || !lighting.brightnessWritable,
							onCommit: (brightness) => void setDeviceControl({
								deviceId: device.id,
								change: {
									type: "lighting-brightness",
									brightness
								}
							})
						}), lightingSupportsSpeed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PrimarySlider, {
							label: "Effect speed",
							value: lighting.speed ?? 50,
							min: 1,
							max: 100,
							step: 1,
							unit: "%",
							disabled: lightingDisabled || !lighting.enabled,
							onCommit: (speed) => void setDeviceControl({
								deviceId: device.id,
								change: {
									type: "lighting-speed",
									speed
								}
							})
						}) : null]
					}),
					lighting.state === "unknown" && lighting.stateReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "microphone-hardware__lighting-error",
						role: "status",
						children: lighting.stateReason
					}) : null
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "microphone-hardware__advanced",
				"aria-labelledby": "microphone-advanced-heading",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						id: "microphone-advanced-heading",
						children: "Advanced"
					}),
					device.capabilities.mute && lighting?.muteLinkedWritable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneSwitchRow, {
						id: `follow-mute-${device.id}`,
						label: "Follow physical mute",
						detail: "Turns the maintained red light off while the touch sensor reports muted.",
						checked: lighting.muteLinked,
						disabled: lightingDisabled || !lighting.enabled,
						onCheckedChange: (enabled) => void setDeviceControl({
							deviceId: device.id,
							change: {
								type: "microphone-mute-lighting",
								enabled
							}
						})
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HorizontalLevelMeter, {
						busId: "mic",
						active: Boolean(engineRunning && microphoneBusEnabled && snapshot.audio.capabilities.realtimeMetering === "available"),
						inactiveLabel: snapshot.audio.capabilities.realtimeMetering === "simulation" ? "Live level unavailable" : "Audio off",
						label: "Input level"
					})
				]
			})
		]
	});
}
function HardwareState({ tone, label, detail }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "microphone-state",
			tabIndex: 0,
			"aria-label": `${label}. ${detail}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
				className: "microphone-state__dot",
				"data-tone": tone,
				"aria-hidden": true
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: label })]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: detail })] });
}
function MicrophoneSwitchRow({ id, label, detail, checked, disabled, onCheckedChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "microphone-switch-row",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
				htmlFor: id,
				tabIndex: 0,
				children: label
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: detail })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "microphone-switch-state",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: checked ? "On" : "Off" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
				id,
				checked,
				disabled,
				"aria-label": label,
				onCheckedChange
			})]
		})]
	});
}
function asNumber(value, fallback) {
	return typeof value === "number" ? value : fallback;
}
//#endregion
export { DevicesPage, DeviceRender as t };
