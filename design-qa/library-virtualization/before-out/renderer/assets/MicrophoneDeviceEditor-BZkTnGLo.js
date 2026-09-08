import { E as __toESM, S as require_jsx_runtime, _ as cn, t as switchboardApi, w as require_react } from "./demo-api-WdKuQJz2.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-DiXKon0p.js";
import { B as Switch, M as Slider, ut as Button, z as useSystemStore } from "./index-DUNxodKI.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-CcsUT_gm.js";
/* empty css                             */
import { t as DeviceRender } from "./devices-BdzqYmsZ.js";
//#region src/renderer/src/components/audio/HorizontalLevelMeter.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
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
//#endregion
//#region src/renderer/src/components/device-controls/MicrophoneDeviceEditor.tsx
function MicrophoneDeviceEditor({ device, snapshot }) {
	const setDeviceSetting = useSystemStore((state) => state.setDeviceSetting);
	const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
	const pending = useSystemStore((state) => state.pendingDeviceIds.includes(device.id));
	const refreshDevices = useSystemStore((state) => state.refreshDevices);
	const gain = asNumber(device.settings.gain, 58);
	const monitoring = asNumber(device.settings.monitoring, 18);
	const lighting = device.capabilities.lighting;
	const muteState = device.capabilities.muteState;
	const muted = device.connected ? muteState?.muted ?? null : null;
	const lightingDisabled = pending || !device.connected || !lighting?.writable;
	const lightingSupportsSpeed = Boolean(lighting?.speedWritable && lighting.activeEffectId !== "solid");
	const engineRunning = snapshot.engines.find((candidate) => candidate.kind === "audio")?.state === "running";
	const microphoneBusEnabled = snapshot.audio.mixes.find((mix) => mix.id === "personal")?.buses.find((candidate) => candidate.id === "mic")?.enabled ?? false;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "device-controls microphone-hardware",
		"aria-labelledby": "microphone-hardware-heading",
		"aria-busy": pending,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "microphone-stage",
				"aria-label": "Microphone preview",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
					device,
					density: "hero"
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", {
				className: "microphone-hardware__heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: "microphone-hardware-heading",
					children: "Input & monitoring"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "microphone-hardware__state",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(HardwareState, {
						tone: muted === null ? "unknown" : muted ? "muted" : "live",
						label: muted === null ? "Mute unknown" : muted ? "Muted" : "Unmuted",
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
				children: [
					!device.connected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "equipment-unavailable",
						role: "status",
						children: "Reconnect the microphone to change settings."
					}) : null,
					device.capabilities.gain ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneSlider, {
						label: "Input volume",
						disabled: !device.connected || pending,
						value: gain,
						min: 0,
						max: 100,
						step: 1,
						unit: "%",
						onCommit: (value) => setDeviceSetting({
							deviceId: device.id,
							key: "gain",
							value
						})
					}) : null,
					device.capabilities.monitoring ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneSlider, {
						label: "Direct monitoring",
						disabled: !device.connected || pending,
						value: monitoring,
						min: 0,
						max: 100,
						step: 1,
						unit: "%",
						onCommit: (value) => setDeviceSetting({
							deviceId: device.id,
							key: "monitoring",
							value
						})
					}) : null
				]
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
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneSlider, {
							label: "Brightness",
							value: lighting.brightness ?? 72,
							min: 0,
							max: 100,
							step: 1,
							unit: "%",
							disabled: lightingDisabled || !lighting.enabled || !lighting.brightnessWritable,
							onCommit: (brightness) => setDeviceControl({
								deviceId: device.id,
								change: {
									type: "lighting-brightness",
									brightness
								}
							})
						}), lightingSupportsSpeed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MicrophoneSlider, {
							label: "Effect speed",
							value: lighting.speed ?? 50,
							min: 1,
							max: 100,
							step: 1,
							unit: "%",
							disabled: lightingDisabled || !lighting.enabled,
							onCommit: (speed) => setDeviceControl({
								deviceId: device.id,
								change: {
									type: "lighting-speed",
									speed
								}
							})
						}) : null]
					}),
					!lighting.writable || lighting.state === "unknown" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "equipment-unavailable",
						role: "status",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: lighting.unavailableReason ?? lighting.stateReason ?? "Lighting controls are unavailable." }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "secondary",
							size: "sm",
							disabled: pending,
							onClick: () => void refreshDevices(),
							children: "Try again"
						})]
					}) : null
				]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "microphone-hardware__advanced",
				"aria-labelledby": "microphone-advanced-heading",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						id: "microphone-advanced-heading",
						children: "Mute & metering"
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
						active: Boolean(device.connected && engineRunning && microphoneBusEnabled && snapshot.audio.capabilities.realtimeMetering === "available"),
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
function MicrophoneSlider({ label, value, min, max, step, unit, disabled, onCommit }) {
	const [draft, setDraft] = (0, import_react.useState)(null);
	const [pending, setPending] = (0, import_react.useState)(false);
	const current = draft ?? value;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "primary-slider",
		"aria-busy": pending,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "primary-slider__heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [current, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: unit })] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
			min,
			max,
			step,
			value: [current],
			disabled: disabled || pending,
			"aria-label": label,
			"aria-valuetext": `${current} ${unit}`,
			onValueChange: ([next]) => typeof next === "number" && setDraft(next),
			onValueCommit: ([next]) => {
				if (typeof next !== "number") return;
				setPending(true);
				onCommit(next).finally(() => {
					setDraft(null);
					setPending(false);
				});
			}
		})]
	});
}
//#endregion
export { MicrophoneDeviceEditor };
