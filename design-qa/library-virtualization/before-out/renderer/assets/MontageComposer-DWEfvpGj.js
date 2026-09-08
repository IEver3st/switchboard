import { E as __toESM, S as require_jsx_runtime, v as createLucideIcon, w as require_react } from "./demo-api-WdKuQJz2.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-DiXKon0p.js";
import { n as Copy, t as Music2 } from "./music-2-Cp6Gdnic.js";
import { a as PanelRightClose, i as PanelRightOpen, n as Undo2, o as Minimize, r as Scissors, s as Maximize, t as ShareClipDialog } from "./ShareClipDialog-B2AynEgP.js";
import { i as Save, r as VolumeX, t as channelColor } from "./channel-identity-COGCKoYc.js";
import { t as Trash2 } from "./trash-2-DaPFSLcX.js";
import { At as Plus, B as Switch, Dt as Search, H as RadioGroup, Kt as ArrowLeft, M as Slider, O as Input, R as ScrollArea, Rt as FolderOpen, St as Volume2, U as RadioGroupItem, V as Separator, c as Dialog, ct as Checkbox, d as DialogHeader, f as DialogTitle, i as formatDuration, l as DialogContent, n as formatBytes, s as formatVideoQuality, u as DialogDescription, ut as Button, zt as Film } from "./index-DUNxodKI.js";
import { a as montageStartForSegment, c as normalizeMontageProject, d as reorderMontageSegment, f as segmentDurationMs, g as montageV2Api, h as updateMontageSegment, i as mapMontageTime, l as reconcileMontageProject, m as updateMontageMusic, n as createMontageMusicTrack, o as musicPlaybackAt, p as splitMontageSegment, r as duplicateMontageSegment, s as musicTimelineDurationMs, t as addClipsToMontage, u as removeMontageSegment } from "./capture-BC-rRwg4.js";
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
//#region src/renderer/src/components/capture/AddMontageClipsDialog.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
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
//#region src/renderer/src/components/capture/MontageV2Timeline.tsx
var basePixelsPerSecond = 72;
function MontageV2Timeline({ project, clips, selectedSegmentId, currentMs, zoom, waveform, canUndo, canRedo, onZoomChange, onProjectChange, onSelectSegment, onSeek, onAddClips, onAddMusic, onDuplicate, onSplit, onRemove, onUndo, onRedo }) {
	const viewportRef = (0, import_react.useRef)(null);
	const draggedSegmentIdRef = (0, import_react.useRef)(null);
	const trimRef = (0, import_react.useRef)(null);
	const musicDragRef = (0, import_react.useRef)(null);
	const clipsById = (0, import_react.useMemo)(() => new Map(clips.map((clip) => [clip.id, clip])), [clips]);
	const pixelsPerMs = basePixelsPerSecond * zoom / 1e3;
	const width = Math.max(720, project.durationMs * pixelsPerMs);
	const selected = project.segments.find((segment) => segment.id === selectedSegmentId);
	const rulerTicks = (0, import_react.useMemo)(() => createRulerTicks(project.durationMs, pixelsPerMs), [pixelsPerMs, project.durationMs]);
	const fitTimeline = () => {
		onZoomChange(clamp$1((viewportRef.current?.clientWidth ?? 720) / Math.max(1, project.durationMs) * 1e3 / basePixelsPerSecond, .25, 4));
	};
	const continueTrim = (event) => {
		const drag = trimRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const deltaMs = Math.round((event.clientX - drag.startX) / pixelsPerMs);
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
		if (event.button !== 0) return;
		const rect = event.currentTarget.getBoundingClientRect();
		onSeek(clamp$1((event.clientX - rect.left) / pixelsPerMs, 0, project.durationMs));
	};
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
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "secondary",
						size: "sm",
						onClick: onAddClips,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, { className: "size-3.5" }), " Add clips"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Split at playhead",
						icon: Scissors,
						disabled: !selected || segmentDurationMs(selected) < 200,
						onClick: onSplit
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Duplicate segment",
						icon: Copy,
						disabled: !selected,
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
						disabled: zoom <= .25,
						onClick: () => onZoomChange(clamp$1(zoom / 1.25, .25, 4))
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "montage-v2-fit",
						onClick: fitTimeline,
						children: "Fit"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", {
						"aria-label": `Timeline zoom ${Math.round(zoom * 100)} percent`,
						children: [Math.round(zoom * 100), "%"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToolbarButton, {
						label: "Zoom in",
						icon: ZoomIn,
						disabled: zoom >= 4,
						onClick: () => onZoomChange(clamp$1(zoom * 1.25, .25, 4))
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
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "montage-v2-timeline__content",
					style: { width: `${width}px` },
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "montage-v2-ruler",
							onPointerDown: seekFromSurface,
							children: rulerTicks.map((tick) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								style: { left: `${tick.timeMs * pixelsPerMs}px` },
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
								const segmentWidth = Math.max(8, segmentDurationMs(segment) * pixelsPerMs);
								const isSelected = segment.id === selectedSegmentId;
								return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-segment-slot",
									style: { width: `${segmentWidth}px` },
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
											onClick: () => {
												onSelectSegment(segment.id);
												onSeek(montageStartForSegment(project.segments, segment.id));
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
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: formatTimecode(segmentDurationMs(segment), true) })
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
													edge: "start"
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
												const delta = event.key === "ArrowLeft" ? -33 : event.key === "ArrowRight" ? 33 : 0;
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
													edge: "end"
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
												const delta = event.key === "ArrowLeft" ? -33 : event.key === "ArrowRight" ? 33 : 0;
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
							onPointerDown: project.music ? void 0 : seekFromSurface,
							children: project.music ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "montage-v2-music-clip",
								style: {
									left: `${project.music.timelineStartMs * pixelsPerMs}px`,
									width: `${Math.max(12, musicTimelineDurationMs(project.music, project.durationMs) * pixelsPerMs)}px`
								},
								"data-muted": project.music.muted || project.music.volume <= 0 || void 0,
								"aria-label": `${project.music.asset.name} music track. Drag to change its timeline position.`,
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
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								className: "montage-v2-music-empty",
								onClick: onAddMusic,
								children: "Import music from your computer"
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
			major: index % majorEvery === 0
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
//#region src/renderer/src/components/capture/MontageComposer.tsx
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
function MontageComposer({ initialProject, clips, inspectorOpen, onClose, onInspectorOpenChange, onReveal, onDraftsChanged }) {
	const editorRef = (0, import_react.useRef)(null);
	const backRef = (0, import_react.useRef)(null);
	const videoARef = (0, import_react.useRef)(null);
	const videoBRef = (0, import_react.useRef)(null);
	const musicRef = (0, import_react.useRef)(null);
	const playbackFrameRef = (0, import_react.useRef)(null);
	const currentMsRef = (0, import_react.useRef)(0);
	const lastRenderedMsRef = (0, import_react.useRef)(0);
	const activeSlotRef = (0, import_react.useRef)(0);
	const playingRef = (0, import_react.useRef)(false);
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
		if (!playback.active) {
			audio.pause();
			return;
		}
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
		const targetSeconds = playback.sourceTimeMs / 1e3;
		if (Math.abs(audio.currentTime - targetSeconds) > .08) audio.currentTime = targetSeconds;
		audio.muted = previewMutedRef.current;
		audio.volume = clamp(playback.gain * masterVolumeRef.current, 0, 1);
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
		setPreviewState("loading");
		try {
			await prepareVideo(targetVideo, clip.id, mapping.sourceTimeMs);
			if (generation !== seekGenerationRef.current) return;
			activeSlotRef.current = targetSlot;
			setActiveSlot(targetSlot);
			setSelectedSegmentId(mapping.segment.id);
			const nextMs = clamp(requestedMs, 0, currentProject.durationMs);
			currentMsRef.current = nextMs;
			lastRenderedMsRef.current = nextMs;
			setCurrentMs(nextMs);
			applyVideoVolume(targetVideo, mapping.segment);
			setPreviewState("ready");
			await syncMusic(nextMs, resume);
			if (resume) {
				await targetVideo.play();
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
		if (!mapping || !video || video.paused) return;
		const sourceTimeMs = video.currentTime * 1e3;
		const thresholdMs = Math.max(8, 500 / Math.max(1, clipsRef.current.find((clip) => clip.id === mapping.segment.clipId)?.fps || 30));
		if (sourceTimeMs >= mapping.segment.trimEndMs - thresholdMs) {
			advancePlayback();
			return;
		}
		const nextMs = clamp(mapping.montageStartMs + sourceTimeMs - mapping.segment.trimStartMs, mapping.montageStartMs, mapping.montageEndMs);
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
				audio.volume = clamp(musicPlayback.gain * masterVolumeRef.current, 0, 1);
				if (audio.paused) audio.play().catch(() => void 0);
			}
		}
		playbackFrameRef.current = window.requestAnimationFrame(tickPlayback);
	}, [advancePlayback]);
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
		const videos = [videoARef.current, videoBRef.current].filter((video) => Boolean(video));
		const handleEnded = () => {
			if (playingRef.current) advancePlayback();
		};
		for (const video of videos) video.addEventListener("ended", handleEnded);
		return () => {
			for (const video of videos) video.removeEventListener("ended", handleEnded);
		};
	}, [advancePlayback]);
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
	(0, import_react.useEffect)(() => {
		const generation = project.updatedAt;
		setSaveState("saving");
		const timer = window.setTimeout(() => {
			montageV2Api.saveMontageDraft(project).then(() => {
				if (projectRef.current.updatedAt !== generation) return;
				setSaveState("saved");
				onDraftsChanged();
			}).catch((cause) => {
				if (projectRef.current.updatedAt !== generation) return;
				setSaveState("error");
				setError(`Autosave failed: ${errorMessage(cause)}`);
			});
		}, 450);
		return () => window.clearTimeout(timer);
	}, [onDraftsChanged, project]);
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
			await video.play();
			setPlaying(true);
			playingRef.current = true;
		} catch {
			setPreviewState("error");
			setError("Montage playback could not start.");
		}
	};
	const importMusic = async () => {
		setMusicPending(true);
		setError(null);
		try {
			const asset = await montageV2Api.importMontageAudio();
			if (!asset) return;
			changeProject({
				...projectRef.current,
				music: createMontageMusicTrack(asset)
			});
		} catch (cause) {
			setError(errorMessage(cause));
		} finally {
			setMusicPending(false);
		}
	};
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
		const sourceTimeMs = mapping?.segment.id === selectedSegment.id ? mapping.sourceTimeMs : selectedSegment.trimStartMs + segmentDurationMs(selectedSegment) / 2;
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
		pausePlayback();
		try {
			await montageV2Api.deleteMontageDraft(project.id);
			onDraftsChanged();
			onClose();
		} catch (cause) {
			setError(errorMessage(cause));
		}
	};
	const exportMontage = async (preset, exportId) => {
		setExportPending(true);
		setError(null);
		try {
			await montageV2Api.saveMontageDraft(projectRef.current);
			const exported = await montageV2Api.exportMontageV2({
				exportId,
				preset,
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
		const typing = [
			"INPUT",
			"TEXTAREA",
			"SELECT"
		].includes(target.tagName) || target.isContentEditable;
		if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") {
			event.preventDefault();
			if (event.shiftKey) redo();
			else undo();
			return;
		}
		if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "y") {
			event.preventDefault();
			redo();
			return;
		}
		if (!typing && event.code === "Space") {
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
							value: project.name,
							maxLength: 120,
							"aria-label": "Montage name",
							onChange: (event) => changeProject({
								...project,
								name: event.currentTarget.value || "Untitled montage"
							}, "project:name")
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							"data-state": saveState,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Save, { "aria-hidden": "true" }), saveState === "saving" ? "Saving" : saveState === "error" ? "Not saved" : "Saved"]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
						className: "montage-v2-header__metadata",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metadata, {
								label: "Duration",
								value: formatDuration(project.durationMs / 1e3)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metadata, {
								label: "Sequence",
								value: `${project.segments.length} ${project.segments.length === 1 ? "clip" : "clips"}`
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metadata, {
								label: "Audio",
								value: project.music ? project.music.asset.name : "Clip audio only"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metadata, {
								label: "Output",
								value: project.canvasSize === "9:16" ? "9:16 vertical" : "Original canvas"
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "montage-v2-header__actions",
						children: [
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
								sourceBytes: proportionalBytes,
								projectType: "montage",
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
				children: [error ?? (missingSegmentCount > 0 ? `${missingSegmentCount} montage ${missingSegmentCount === 1 ? "segment references" : "segments reference"} missing media. Remove or restore the source before export.` : musicPreviewWarning), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
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
						"data-state": previewState,
						"data-fullscreen": viewerFullscreen || void 0,
						"data-canvas": project.canvasSize,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
								ref: videoARef,
								"data-slot": "0",
								"data-active": activeSlot === 0 || void 0,
								preload: "metadata",
								"aria-label": "Montage preview"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("video", {
								ref: videoBRef,
								"data-slot": "1",
								"data-active": activeSlot === 1 || void 0,
								preload: "metadata",
								"aria-hidden": activeSlot !== 1
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("audio", {
								ref: musicRef,
								preload: "metadata"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "montage-v2-preview__transport no-drag",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: () => void togglePlayback(),
										children: playing ? "Pause" : "Play"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("output", { children: [
										formatEditorTime(currentMs),
										" / ",
										formatEditorTime(project.durationMs)
									] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
										type: "button",
										"aria-label": previewMuted ? "Unmute preview" : "Mute preview",
										onClick: () => {
											const next = !previewMuted;
											setPreviewMuted(next);
											previewMutedRef.current = next;
											for (const media of [
												videoARef.current,
												videoBRef.current,
												musicRef.current
											]) if (media) media.muted = next;
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
						onZoomChange: setZoom,
						onProjectChange: changeProject,
						onSelectSegment: setSelectedSegmentId,
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
					"aria-label": "Montage inspector",
					"aria-hidden": !inspectorOpen || void 0,
					inert: !inspectorOpen ? true : void 0,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollArea, {
						className: "h-full",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "montage-v2-inspector__content",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "montage-v2-inspector__heading",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Montage inspector" }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { children: selectedClip?.name ?? "Missing source" }),
										selectedClip ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
											type: "button",
											onClick: () => onReveal(selectedClip),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, {}), " Show source"]
										}) : null
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
									title: "Canvas",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroup, {
										className: "montage-v2-canvas",
										value: project.canvasSize,
										onValueChange: (value) => changeProject({
											...project,
											canvasSize: value
										}),
										children: canvasSizes.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
											"data-active": project.canvasSize === option.id || void 0,
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroupItem, {
													value: option.id,
													className: "sr-only"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "data-shape": option.id }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: option.label })
											]
										}, option.id))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
									title: "Selected segment",
									children: selectedSegment ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
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
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Source-channel levels are applied during export." }), selectedClip.audioChannels.map((channel, trackIndex) => {
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
										}) : null,
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "montage-v2-inline-fields",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Trim start",
												valueMs: selectedSegment.trimStartMs,
												maximumMs: selectedSegment.trimEndMs - 100,
												onChange: (value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
													...segment,
													trimStartMs: value
												})), `segment:${selectedSegment.id}:trim-start`)
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Trim end",
												valueMs: selectedSegment.trimEndMs,
												minimumMs: selectedSegment.trimStartMs + 100,
												maximumMs: selectedSegment.sourceDurationMs,
												onChange: (value) => changeProject(updateMontageSegment(project, selectedSegment.id, (segment) => ({
													...segment,
													trimEndMs: value
												})), `segment:${selectedSegment.id}:trim-end`)
											})]
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
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InspectorSection, {
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
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Timeline start",
												valueMs: project.music.timelineStartMs,
												maximumMs: project.durationMs - 1,
												onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
													...track,
													timelineStartMs: value
												})), "music:start")
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Fade in",
												valueMs: project.music.fadeInMs,
												maximumMs: 3e4,
												onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
													...track,
													fadeInMs: value
												})), "music:fade-in")
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "montage-v2-inline-fields",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Source in",
												valueMs: project.music.sourceStartMs,
												maximumMs: project.music.sourceEndMs - 100,
												onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
													...track,
													sourceStartMs: value
												})), "music:source-in")
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
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
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "montage-v2-inline-fields",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TimeField, {
												label: "Fade out",
												valueMs: project.music.fadeOutMs,
												maximumMs: 3e4,
												onChange: (value) => changeProject(updateMontageMusic(project, (track) => ({
													...track,
													fadeOutMs: value
												})), "music:fade-out")
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "montage-v2-switch-field",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Loop track" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Fill remaining montage" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
													checked: project.music.loop,
													onCheckedChange: (loop) => changeProject(updateMontageMusic(project, (track) => ({
														...track,
														loop
													}))),
													"aria-label": "Loop music track"
												})]
											})]
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
		video.muted = previewMutedRef.current;
		video.volume = clamp((segment.muted ? 0 : segment.volume) * masterVolumeRef.current, 0, 1);
	}
}
function InspectorSection({ title, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-v2-inspector__section",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: title }), children]
	});
}
function Metadata({ label, value }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", {
		title: value,
		children: value
	})] });
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
function TimeField({ label, valueMs, minimumMs = 0, maximumMs, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "montage-v2-time-field",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			type: "number",
			min: minimumMs / 1e3,
			max: maximumMs / 1e3,
			step: .01,
			value: (valueMs / 1e3).toFixed(2),
			onChange: (event) => {
				const value = Number(event.currentTarget.value) * 1e3;
				if (Number.isFinite(value)) onChange(clamp(Math.round(value), minimumMs, maximumMs));
			}
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("em", { children: "s" })] })]
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
	video.currentTime = Math.max(0, sourceTimeMs) / 1e3;
}
function waitForMetadata(media) {
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
			media.removeEventListener("loadedmetadata", finish);
			media.removeEventListener("error", fail);
		};
		media.addEventListener("loadedmetadata", finish, { once: true });
		media.addEventListener("error", fail, { once: true });
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
	return [...root.querySelectorAll("a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex=\"-1\"])")].filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function clamp(value, minimum, maximum) {
	return Math.min(maximum, Math.max(minimum, value));
}
//#endregion
export { MontageComposer };
