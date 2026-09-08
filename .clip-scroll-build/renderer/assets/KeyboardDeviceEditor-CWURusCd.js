import { L as require_jsx_runtime, N as createLucideIcon, V as __toESM, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-Dzg1fQmA.js";
import { Ft as Info, Mt as LoaderCircle, R as useSystemStore, Ut as ChevronDown, dt as SelectItem, ft as SelectTrigger, j as Slider, lt as Select, pt as SelectValue, st as Button, ut as SelectContent, z as Switch } from "./index-Cqk9uQ3G.js";
import { n as PopoverContent, r as PopoverTrigger, t as Popover } from "./popover-lRMNz-1W.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-Bj4P2x-X.js";
import { t as ColorPicker } from "./ColorPicker-Bay1fMqD.js";
/* empty css                             */
import { t as DeviceRender } from "./devices-CGuj63T5.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var RotateCw = createLucideIcon("rotate-cw", [["path", {
	d: "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
	key: "1p45f6"
}], ["path", {
	d: "M21 3v5h-5",
	key: "1q7to0"
}]]);
//#endregion
//#region src/renderer/src/components/device-controls/keyboard-device.css
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
//#endregion
//#region src/renderer/src/components/device-controls/KeyboardDeviceEditor.tsx
var import_jsx_runtime = require_jsx_runtime();
function KeyboardDeviceEditor({ device }) {
	const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
	const refreshDevices = useSystemStore((state) => state.refreshDevices);
	const pending = useSystemStore((state) => state.pendingDeviceIds.includes(device.id));
	const keyboard = device.capabilities.keyboard;
	const lighting = device.capabilities.lighting;
	const profiles = keyboard?.onboardProfiles;
	const controlsReady = Boolean(device.connected && keyboard?.transport === "native-hid");
	const lightingReady = Boolean(controlsReady && lighting?.writable);
	const activeEffect = lighting?.availableEffects.find((effect) => effect.id === lighting.activeEffectId);
	const customColorAvailable = Boolean(lightingReady && lighting?.enabled && lighting.colorWritable && activeEffect?.controls?.includes("color"));
	const [previewColor, setPreviewColor] = (0, import_react.useState)(null);
	const [previewBrightness, setPreviewBrightness] = (0, import_react.useState)(lighting?.brightness ?? 100);
	(0, import_react.useEffect)(() => setPreviewColor(null), [lighting?.color]);
	(0, import_react.useEffect)(() => setPreviewBrightness(lighting?.brightness ?? 100), [lighting?.brightness, pending]);
	const profileUnavailableReason = profiles?.unavailableReason ?? "Onboard profiles are unavailable.";
	const gamingUnavailableReason = keyboard?.gamingMode?.unavailableReason ?? "Gaming Mode is unavailable.";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "keyboard-workbench",
		"aria-busy": pending,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "keyboard-stage",
				"aria-label": "Keyboard preview",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
					device,
					density: "hero",
					lightingPreview: {
						enabled: lighting?.enabled,
						color: previewColor ?? lighting?.color,
						brightness: previewBrightness,
						preserveSourceColor: [
							"spectrum",
							"wave-left",
							"wave-right"
						].includes(lighting?.activeEffectId ?? "")
					}
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "keyboard-stage__footer",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
						className: "keyboard-stage__effect",
						children: [lighting?.state === "unknown" ? "Lighting state unavailable" : lighting?.enabled ? activeEffect?.label ?? "Lighting on" : "Lighting off", customColorAvailable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
							style: { backgroundColor: previewColor ?? lighting?.color },
							"aria-hidden": true
						}) : null]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							className: "keyboard-stage__info",
							"aria-label": "Device information",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, { "aria-hidden": true })
						})
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(TooltipContent, { children: [
						"Firmware ",
						keyboard?.firmwareVersion ?? "unavailable",
						keyboard?.pollingRateHz ? ` · ${keyboard.pollingRateHz.toLocaleString()} Hz` : ""
					] })] })]
				})]
			}),
			!controlsReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "keyboard-unavailable",
				role: "alert",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Keyboard controls unavailable" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Reconnect the keyboard, then try again." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					variant: "secondary",
					size: "sm",
					onClick: () => void refreshDevices(),
					disabled: pending,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCw, { "aria-hidden": true }), " Try again"]
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "keyboard-control-rail",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "keyboard-primary-controls",
					"aria-label": "Keyboard settings",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Keyboard settings" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlRow, {
							label: "Onboard profile",
							unavailableReason: !profiles?.writable ? profileUnavailableReason : void 0,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: profiles?.activeProfileId ?? void 0,
								disabled: pending || !controlsReady || !profiles?.writable || profiles.profiles.length === 0,
								onValueChange: (profileId) => void setDeviceControl({
									deviceId: device.id,
									change: {
										type: "keyboard-onboard-profile",
										profileId
									}
								}),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									className: "keyboard-profile-select",
									"aria-label": "Active onboard keyboard profile",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Unavailable" })
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: profiles?.profiles.map((profile) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: profile.id,
									children: profile.label
								}, profile.id)) })]
							})
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlRow, {
							label: "Gaming Mode",
							unavailableReason: !keyboard?.gamingMode?.writable ? gamingUnavailableReason : void 0,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
								checked: keyboard?.gamingMode?.enabled ?? false,
								disabled: pending || !controlsReady || !keyboard?.gamingMode?.writable,
								"aria-label": "Gaming Mode",
								onCheckedChange: (enabled) => void setDeviceControl({
									deviceId: device.id,
									change: {
										type: "keyboard-gaming-mode",
										enabled
									}
								})
							})
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
					className: "keyboard-lighting",
					"aria-labelledby": "keyboard-lighting-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
						className: "keyboard-lighting__header",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							id: "keyboard-lighting-heading",
							children: "Lighting"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							className: "keyboard-lighting__power",
							children: [
								pending ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, {
									className: "keyboard-pending",
									"aria-label": "Applying keyboard setting"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lighting?.state === "unknown" ? "Unknown" : lighting?.enabled ? "On" : "Off" }),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
									checked: lighting?.enabled ?? false,
									disabled: pending || !lightingReady,
									"aria-label": "Keyboard lighting",
									onCheckedChange: (enabled) => void setDeviceControl({
										deviceId: device.id,
										change: {
											type: "lighting-enabled",
											enabled
										}
									})
								})
							]
						})]
					}), lighting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "keyboard-lighting__body",
						"data-disabled": !lighting.enabled || void 0,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "keyboard-lighting__effects",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Effect" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
									type: "single",
									value: lighting.enabled ? lighting.activeEffectId : "",
									disabled: pending || !lightingReady || !lighting.enabled,
									"aria-label": "Keyboard lighting effect",
									onValueChange: (effectId) => effectId && void setDeviceControl({
										deviceId: device.id,
										change: {
											type: "lighting-effect",
											effectId
										}
									}),
									children: lighting.availableEffects.map((effect) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
										className: "keyboard-effect-option",
										value: effect.id,
										children: effect.label
									}, effect.id))
								})]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "keyboard-lighting__parameters",
								children: [lighting.brightness !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
									className: "keyboard-brightness",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Brightness ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [previewBrightness, "%"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
										min: 0,
										max: 100,
										step: 1,
										value: [previewBrightness],
										disabled: pending || !controlsReady || !lighting.enabled || !lighting.brightnessWritable,
										"aria-label": "Lighting brightness",
										"aria-valuetext": `${previewBrightness}%`,
										onValueChange: ([brightness]) => typeof brightness === "number" && setPreviewBrightness(brightness),
										onValueCommit: ([brightness]) => {
											if (typeof brightness !== "number") return;
											setDeviceControl({
												deviceId: device.id,
												change: {
													type: "lighting-brightness",
													brightness
												}
											});
										}
									})]
								}) : null, customColorAvailable ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "keyboard-color",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Color" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
										asChild: true,
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											className: "keyboard-color__trigger",
											disabled: pending,
											"aria-label": `Lighting color ${previewColor ?? lighting.color}`,
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", {
												style: { backgroundColor: previewColor ?? lighting.color },
												"aria-hidden": true
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: (previewColor ?? lighting.color ?? "#44AAFF").toUpperCase() })]
										})
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
										align: "end",
										className: "lighting-color-popover",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
											className: "popover-heading",
											children: "Lighting color"
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorPicker, {
											value: previewColor ?? lighting.color ?? "#44aaff",
											onChange: setPreviewColor,
											onCommit: (color) => {
												setPreviewColor(color);
												setDeviceControl({
													deviceId: device.id,
													change: {
														type: "lighting-color",
														color
													}
												}).finally(() => setPreviewColor(null));
											}
										})]
									})] })]
								}) : null]
							}),
							!lightingReady && controlsReady ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "keyboard-lighting__unavailable",
								role: "status",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: lighting.unavailableReason ?? "Lighting controls are unavailable. Reconnect the keyboard and try again." }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
									variant: "ghost",
									size: "sm",
									onClick: () => void refreshDevices(),
									disabled: pending,
									children: "Try again"
								})]
							}) : null
						]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "keyboard-lighting__empty",
						children: "Lighting is not available for this keyboard."
					})]
				})]
			}),
			keyboard?.features.some((feature) => feature.status !== "native") ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("details", {
				className: "keyboard-input-features",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("summary", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Input features" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Synapse controls & availability" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { "aria-hidden": true })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dl", { children: keyboard.features.filter((feature) => feature.status !== "native").map((feature) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dt", { children: [feature.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: feature.status === "synapse" ? "In Synapse" : "Unavailable" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: feature.summary })] }, feature.id)) })]
			}) : null
		]
	});
}
function ControlRow({ label, unavailableReason, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "keyboard-control-row",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "keyboard-control-row__label",
			children: [label, unavailableReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					"aria-label": `${label} availability`,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, { "aria-hidden": true })
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: unavailableReason })] }) : null]
		}), children]
	});
}
//#endregion
export { KeyboardDeviceEditor };
