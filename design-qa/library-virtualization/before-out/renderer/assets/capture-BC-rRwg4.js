const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./ClipEditor-DsstA2Rl.js","./demo-api-WdKuQJz2.js","./tooltip-DiXKon0p.js","./dropdown-menu-BCfwO5lf.js","./dist-DwsPwt3N.js","./index-DUNxodKI.js","./check-oJKBko3B.js","./index-TfRLGA3a.css","./popover-D-tY7V_8.js","./ShareClipDialog-B2AynEgP.js","./toggle-group-CcsUT_gm.js","./channel-identity-COGCKoYc.js","./trash-2-DaPFSLcX.js","./ClipThumbnail-cKaTb2MQ.js","./skeleton-Cy2v75H0.js","./context-menu-Csq9A3YO.js","./ClipEditor-Bhr_GKus.css","./MontageComposer-DWEfvpGj.js","./music-2-Cp6Gdnic.js","./MontageComposer-CkEHQA8L.css"])))=>i.map(i=>d[i]);
import { E as __toESM, S as require_jsx_runtime, _ as cn, a as clipAudioTrackTrimsSchema, d as boolean, f as literal, h as string, m as object, o as clipCanvasSizeSchema, p as number, s as clipExportPresetSchema, u as array, v as createLucideIcon, w as require_react, y as Slot } from "./demo-api-WdKuQJz2.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-DiXKon0p.js";
import { a as DropdownMenuTrigger, c as AppWindow, i as DropdownMenuSeparator, n as DropdownMenuContent, o as SlidersHorizontal, r as DropdownMenuItem, s as Ellipsis, t as DropdownMenu } from "./dropdown-menu-BCfwO5lf.js";
import { t as Check } from "./check-oJKBko3B.js";
import { v as Pencil } from "./dist-DwsPwt3N.js";
import { t as Trash2 } from "./trash-2-DaPFSLcX.js";
import { $ as Primitive, A as gameEventTypeLabel, B as Switch, Bt as Download, C as createDialogScope, Ct as Video, Dt as Search, Et as Settings2, L as estimateClipSize, Lt as Gamepad2, O as Input, Rt as FolderOpen, S as WarningProvider, Tt as TriangleAlert, Ut as ChevronDown, V as Separator, X as useId, Z as useLayoutEffect2, _ as Overlay, a as formatRelativeTime, at as composeEventHandlers, b as Title, c as Dialog, ct as Checkbox, d as DialogHeader, dt as CaptureAudioDeviceSelect, f as DialogTitle, ft as Select, g as Description, gt as SelectValue, h as Content$1, ht as SelectTrigger, i as formatDuration, it as useComposedRefs, jt as Play, k as autoCaptureClipSummary, kt as RefreshCw, l as DialogContent, lt as ShortcutRecorderButton, m as Close, mt as SelectItem, n as formatBytes, nt as createContextScope, o as formatReplayLength, pt as SelectContent, r as formatClipDateGroup, s as formatVideoQuality, st as Kbd, t as __vitePreload, u as DialogDescription, ut as Button, v as Portal, x as Trigger$1, xt as X, y as Root$1, z as useSystemStore } from "./index-DUNxodKI.js";
import { n as clipGameLabel, r as filterAndSortClips, t as ClipThumbnail } from "./ClipThumbnail-cKaTb2MQ.js";
import { n as PopoverContent, r as PopoverTrigger, t as Popover } from "./popover-D-tY7V_8.js";
import { a as ContextMenuTrigger, i as ContextMenuSeparator, n as ContextMenuContent, r as ContextMenuItem, t as ContextMenu } from "./context-menu-Csq9A3YO.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-CcsUT_gm.js";
import { t as Badge } from "./badge-DWa3yvBF.js";
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ArrowDownUp = createLucideIcon("arrow-down-up", [
	["path", {
		d: "m3 16 4 4 4-4",
		key: "1co6wj"
	}],
	["path", {
		d: "M7 20V4",
		key: "1yoxec"
	}],
	["path", {
		d: "m21 8-4-4-4 4",
		key: "1c9v7m"
	}],
	["path", {
		d: "M17 4v16",
		key: "7dpous"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Clapperboard = createLucideIcon("clapperboard", [
	["path", {
		d: "m12.296 3.464 3.02 3.956",
		key: "qash78"
	}],
	["path", {
		d: "M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z",
		key: "1h7j8b"
	}],
	["path", {
		d: "M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
		key: "4lm6w1"
	}],
	["path", {
		d: "m6.18 5.276 3.1 3.899",
		key: "zjj9t3"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Grid2x2 = createLucideIcon("grid-2x2", [
	["path", {
		d: "M12 3v18",
		key: "108xh3"
	}],
	["path", {
		d: "M3 12h18",
		key: "1i2n21"
	}],
	["rect", {
		x: "3",
		y: "3",
		width: "18",
		height: "18",
		rx: "2",
		key: "h1oib"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var ImageOff = createLucideIcon("image-off", [
	["line", {
		x1: "2",
		x2: "22",
		y1: "2",
		y2: "22",
		key: "a6p6uj"
	}],
	["path", {
		d: "M10.41 10.41a2 2 0 1 1-2.83-2.83",
		key: "1bzlo9"
	}],
	["line", {
		x1: "13.5",
		x2: "6",
		y1: "13.5",
		y2: "21",
		key: "1q0aeu"
	}],
	["line", {
		x1: "18",
		x2: "21",
		y1: "12",
		y2: "15",
		key: "5mozeu"
	}],
	["path", {
		d: "M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59",
		key: "mmje98"
	}],
	["path", {
		d: "M21 15V5a2 2 0 0 0-2-2H9",
		key: "43el77"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var List = createLucideIcon("list", [
	["path", {
		d: "M3 5h.01",
		key: "18ugdj"
	}],
	["path", {
		d: "M3 12h.01",
		key: "nlz23k"
	}],
	["path", {
		d: "M3 19h.01",
		key: "noohij"
	}],
	["path", {
		d: "M8 5h13",
		key: "1pao27"
	}],
	["path", {
		d: "M8 12h13",
		key: "1za7za"
	}],
	["path", {
		d: "M8 19h13",
		key: "m83p4d"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Monitor = createLucideIcon("monitor", [
	["rect", {
		width: "20",
		height: "14",
		x: "2",
		y: "3",
		rx: "2",
		key: "48i651"
	}],
	["line", {
		x1: "8",
		x2: "16",
		y1: "21",
		y2: "21",
		key: "1svkeh"
	}],
	["line", {
		x1: "12",
		x2: "12",
		y1: "17",
		y2: "21",
		key: "vw1qmm"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Share2 = createLucideIcon("share-2", [
	["circle", {
		cx: "18",
		cy: "5",
		r: "3",
		key: "gq8acd"
	}],
	["circle", {
		cx: "6",
		cy: "12",
		r: "3",
		key: "w7nqdw"
	}],
	["circle", {
		cx: "18",
		cy: "19",
		r: "3",
		key: "1xt0gg"
	}],
	["line", {
		x1: "8.59",
		x2: "15.42",
		y1: "13.51",
		y2: "17.49",
		key: "47mynk"
	}],
	["line", {
		x1: "15.41",
		x2: "8.59",
		y1: "6.51",
		y2: "10.49",
		key: "1n3mei"
	}]
]);
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Star = createLucideIcon("star", [["path", {
	d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
	key: "r04s7s"
}]]);
//#endregion
//#region src/renderer/src/lib/montage-v2-api.ts
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
var runtimeApi = window.switchboard;
var demoDrafts = [];
var montageV2Api = runtimeApi && typeof runtimeApi.importMontageAudio === "function" && typeof runtimeApi.exportMontageV2 === "function" ? runtimeApi : {
	async importMontageAudio() {
		throw new Error("Music import is available only in the Switchboard desktop application.");
	},
	async loadMontageAudioWaveform(assetId) {
		return {
			assetId,
			samples: []
		};
	},
	async listMontageDrafts() {
		return structuredClone(demoDrafts);
	},
	async saveMontageDraft(project) {
		const saved = structuredClone({
			...project,
			updatedAt: Date.now()
		});
		demoDrafts = [saved, ...demoDrafts.filter((candidate) => candidate.id !== saved.id)].slice(0, 20);
		return structuredClone(saved);
	},
	async deleteMontageDraft(projectId) {
		demoDrafts = demoDrafts.filter((candidate) => candidate.id !== projectId);
	},
	async exportMontageV2() {
		throw new Error("Montage export is available only in the Switchboard desktop application.");
	},
	async cancelMontageV2Export() {}
};
var montageAudioAssetSchema = object({
	id: string().uuid(),
	name: string().trim().min(1).max(160),
	originalName: string().trim().min(1).max(260),
	durationMs: number().int().positive(),
	fileSize: number().int().nonnegative(),
	codec: string().trim().min(1).max(80).optional(),
	createdAt: number().int().nonnegative()
});
object({
	assetId: string().uuid(),
	samples: array(number().min(0).max(1)).max(512)
});
var montageV2SegmentSchema = object({
	id: string().uuid(),
	clipId: string().min(1).max(256),
	sourceDurationMs: number().int().positive(),
	trimStartMs: number().int().nonnegative(),
	trimEndMs: number().int().positive(),
	volume: number().min(0).max(1).default(1),
	muted: boolean().default(false),
	audioTrackLevels: array(number().int().min(0).max(100)).max(8).optional(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional()
}).superRefine((segment, context) => {
	if (segment.trimEndMs <= segment.trimStartMs) context.addIssue({
		code: "custom",
		message: "The segment trim end must be after its start.",
		path: ["trimEndMs"]
	});
	if (segment.trimEndMs > segment.sourceDurationMs) context.addIssue({
		code: "custom",
		message: "The segment trim exceeds its source duration.",
		path: ["trimEndMs"]
	});
	if (segment.trimEndMs - segment.trimStartMs < 100) context.addIssue({
		code: "custom",
		message: "Keep at least 0.1 seconds in each montage segment.",
		path: ["trimEndMs"]
	});
});
var montageMusicTrackSchema = object({
	id: string().uuid(),
	asset: montageAudioAssetSchema,
	timelineStartMs: number().int().nonnegative(),
	sourceStartMs: number().int().nonnegative(),
	sourceEndMs: number().int().positive(),
	volume: number().min(0).max(1).default(.18),
	muted: boolean().default(false),
	fadeInMs: number().int().min(0).max(3e4).default(1e3),
	fadeOutMs: number().int().min(0).max(3e4).default(1500),
	loop: boolean().default(true)
}).superRefine((track, context) => {
	if (track.sourceEndMs <= track.sourceStartMs) context.addIssue({
		code: "custom",
		message: "The music trim end must be after its start.",
		path: ["sourceEndMs"]
	});
	if (track.sourceEndMs > track.asset.durationMs) context.addIssue({
		code: "custom",
		message: "The music trim exceeds the imported file duration.",
		path: ["sourceEndMs"]
	});
	if (track.sourceEndMs - track.sourceStartMs < 100) context.addIssue({
		code: "custom",
		message: "Keep at least 0.1 seconds of the music track.",
		path: ["sourceEndMs"]
	});
});
var montageProjectV2Schema = object({
	schemaVersion: literal(2),
	type: literal("montage"),
	id: string().uuid(),
	name: string().trim().min(1).max(120),
	createdAt: number().int().nonnegative(),
	updatedAt: number().int().nonnegative(),
	durationMs: number().int().positive(),
	canvasSize: clipCanvasSizeSchema,
	segments: array(montageV2SegmentSchema).min(1).max(500),
	music: montageMusicTrackSchema.optional()
}).superRefine((project, context) => {
	const expectedDurationMs = project.segments.reduce((total, segment) => total + segment.trimEndMs - segment.trimStartMs, 0);
	if (project.durationMs !== expectedDurationMs) context.addIssue({
		code: "custom",
		message: "The montage duration does not match its segments.",
		path: ["durationMs"]
	});
	if (project.music && project.music.timelineStartMs >= project.durationMs) context.addIssue({
		code: "custom",
		message: "The music track must begin before the montage ends.",
		path: ["music", "timelineStartMs"]
	});
});
object({
	exportId: string().uuid(),
	project: montageProjectV2Schema,
	preset: clipExportPresetSchema
});
string().uuid();
string().uuid();
function createMontageProjectV2(clips) {
	const usableClips = clips.filter((clip) => clip.durationMs >= 100);
	if (usableClips.length === 0) throw new Error("Add at least one clip with a readable duration to create a montage.");
	const now = Date.now();
	return normalizeMontageProject({
		schemaVersion: 2,
		type: "montage",
		id: crypto.randomUUID(),
		name: "Untitled montage",
		createdAt: now,
		updatedAt: now,
		durationMs: 1,
		canvasSize: usableClips[0]?.canvasSize ?? "original",
		segments: usableClips.map(createMontageSegment)
	});
}
function createMontageSegment(clip) {
	if (clip.durationMs < 100) throw new Error(`${clip.name} does not have enough readable media to add to a montage.`);
	const requestedStartMs = Math.max(0, Math.round(clip.trimStartMs ?? 0));
	const trimStartMs = Math.min(clip.durationMs - 100, requestedStartMs);
	const requestedEndMs = Math.min(clip.durationMs, Math.round(clip.trimEndMs ?? clip.durationMs));
	const trimEndMs = Math.max(trimStartMs + 100, requestedEndMs);
	return {
		id: crypto.randomUUID(),
		clipId: clip.id,
		sourceDurationMs: clip.durationMs,
		trimStartMs,
		trimEndMs,
		volume: 1,
		muted: false,
		...clip.audioTrackLevels && clip.audioTrackLevels.length > 0 ? { audioTrackLevels: [...clip.audioTrackLevels] } : {},
		...clip.audioTrackTrims && clip.audioTrackTrims.length > 0 ? { audioTrackTrims: clip.audioTrackTrims.map((trim) => trim ? { ...trim } : null) } : {}
	};
}
function createMontageMusicTrack(asset) {
	return {
		id: crypto.randomUUID(),
		asset,
		timelineStartMs: 0,
		sourceStartMs: 0,
		sourceEndMs: asset.durationMs,
		volume: .18,
		muted: false,
		fadeInMs: Math.min(1e3, Math.floor(asset.durationMs / 4)),
		fadeOutMs: Math.min(1500, Math.floor(asset.durationMs / 4)),
		loop: true
	};
}
function normalizeMontageProject(project) {
	const durationMs = project.segments.reduce((total, segment) => total + segmentDurationMs(segment), 0);
	const safeDurationMs = Math.max(1, durationMs);
	const music = project.music ? normalizeMusicTrack(project.music, safeDurationMs) : void 0;
	return montageProjectV2Schema.parse({
		...project,
		durationMs: safeDurationMs,
		updatedAt: Date.now(),
		...music ? { music } : { music: void 0 }
	});
}
function reconcileMontageProject(project, clips) {
	const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
	const segments = project.segments.map((segment) => {
		const clip = clipsById.get(segment.clipId);
		if (!clip || clip.durationMs === segment.sourceDurationMs) return segment;
		const trimStartMs = Math.min(segment.trimStartMs, Math.max(0, clip.durationMs - 100));
		const trimEndMs = Math.max(trimStartMs + 100, Math.min(segment.trimEndMs, clip.durationMs));
		return {
			...segment,
			sourceDurationMs: clip.durationMs,
			trimStartMs,
			trimEndMs
		};
	});
	return normalizeMontageProject({
		...project,
		segments
	});
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
		if (!segment) continue;
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
	let startMs = 0;
	for (const segment of segments) {
		if (segment.id === segmentId) return startMs;
		startMs += segmentDurationMs(segment);
	}
	return 0;
}
function addClipsToMontage(project, clips, afterSegmentId) {
	if (clips.length === 0) return project;
	const segments = [...project.segments];
	const selectedIndex = afterSegmentId ? segments.findIndex((segment) => segment.id === afterSegmentId) : segments.length - 1;
	const insertionIndex = selectedIndex < 0 ? segments.length : selectedIndex + 1;
	segments.splice(insertionIndex, 0, ...clips.map(createMontageSegment));
	return normalizeMontageProject({
		...project,
		segments
	});
}
function duplicateMontageSegment(project, segmentId) {
	const index = project.segments.findIndex((segment) => segment.id === segmentId);
	const source = project.segments[index];
	if (!source) return project;
	const duplicate = {
		...source,
		id: crypto.randomUUID(),
		...source.audioTrackLevels ? { audioTrackLevels: [...source.audioTrackLevels] } : {},
		...source.audioTrackTrims ? { audioTrackTrims: source.audioTrackTrims.map((trim) => trim ? { ...trim } : null) } : {}
	};
	const segments = [...project.segments];
	segments.splice(index + 1, 0, duplicate);
	return normalizeMontageProject({
		...project,
		segments
	});
}
function splitMontageSegment(project, segmentId, requestedSourceTimeMs) {
	const index = project.segments.findIndex((segment) => segment.id === segmentId);
	const source = project.segments[index];
	if (!source || segmentDurationMs(source) < 200) return project;
	const splitMs = Math.min(source.trimEndMs - 100, Math.max(source.trimStartMs + 100, Math.round(requestedSourceTimeMs)));
	const first = {
		...source,
		trimEndMs: splitMs
	};
	const second = {
		...source,
		id: crypto.randomUUID(),
		trimStartMs: splitMs,
		...source.audioTrackLevels ? { audioTrackLevels: [...source.audioTrackLevels] } : {},
		...source.audioTrackTrims ? { audioTrackTrims: source.audioTrackTrims.map((trim) => trim ? { ...trim } : null) } : {}
	};
	const segments = [...project.segments];
	segments.splice(index, 1, first, second);
	return normalizeMontageProject({
		...project,
		segments
	});
}
function removeMontageSegment(project, segmentId) {
	if (project.segments.length <= 1) return project;
	const segments = project.segments.filter((segment) => segment.id !== segmentId);
	return segments.length === project.segments.length ? project : normalizeMontageProject({
		...project,
		segments
	});
}
function reorderMontageSegment(project, activeId, overId) {
	const from = project.segments.findIndex((segment) => segment.id === activeId);
	const to = project.segments.findIndex((segment) => segment.id === overId);
	if (from < 0 || to < 0 || from === to) return project;
	const segments = [...project.segments];
	const moved = segments.splice(from, 1)[0];
	if (!moved) return project;
	segments.splice(to, 0, moved);
	return normalizeMontageProject({
		...project,
		segments
	});
}
function updateMontageSegment(project, segmentId, update) {
	let changed = false;
	const segments = project.segments.map((segment) => {
		if (segment.id !== segmentId) return segment;
		changed = true;
		return normalizeSegment(update(segment));
	});
	return changed ? normalizeMontageProject({
		...project,
		segments
	}) : project;
}
function updateMontageMusic(project, update) {
	if (!project.music) return project;
	return normalizeMontageProject({
		...project,
		music: normalizeMusicTrack(update(project.music), project.durationMs)
	});
}
function musicPlaybackAt(track, montageTimeMs, projectDurationMs) {
	if (!track || track.muted || track.volume <= 0 || montageTimeMs < track.timelineStartMs) return {
		active: false,
		sourceTimeMs: track?.sourceStartMs ?? 0,
		gain: 0,
		activeDurationMs: 0
	};
	const sourceDurationMs = Math.max(1, track.sourceEndMs - track.sourceStartMs);
	const availableProjectMs = Math.max(0, projectDurationMs - track.timelineStartMs);
	const activeDurationMs = track.loop ? availableProjectMs : Math.min(sourceDurationMs, availableProjectMs);
	const localTimelineMs = montageTimeMs - track.timelineStartMs;
	if (localTimelineMs < 0 || localTimelineMs >= activeDurationMs) return {
		active: false,
		sourceTimeMs: track.sourceStartMs,
		gain: 0,
		activeDurationMs
	};
	const sourceOffsetMs = track.loop ? localTimelineMs % sourceDurationMs : localTimelineMs;
	const fadeIn = track.fadeInMs > 0 ? Math.min(1, localTimelineMs / track.fadeInMs) : 1;
	const remainingMs = activeDurationMs - localTimelineMs;
	const fadeOut = track.fadeOutMs > 0 ? Math.min(1, remainingMs / track.fadeOutMs) : 1;
	return {
		active: true,
		sourceTimeMs: track.sourceStartMs + sourceOffsetMs,
		gain: track.volume * Math.max(0, Math.min(fadeIn, fadeOut)),
		activeDurationMs
	};
}
function musicTimelineDurationMs(track, projectDurationMs) {
	const available = Math.max(0, projectDurationMs - track.timelineStartMs);
	return track.loop ? available : Math.min(available, track.sourceEndMs - track.sourceStartMs);
}
function normalizeSegment(segment) {
	const trimStartMs = Math.max(0, Math.min(segment.sourceDurationMs - 100, Math.round(segment.trimStartMs)));
	const trimEndMs = Math.max(trimStartMs + 100, Math.min(segment.sourceDurationMs, Math.round(segment.trimEndMs)));
	return {
		...segment,
		trimStartMs,
		trimEndMs,
		volume: Math.max(0, Math.min(1, segment.volume))
	};
}
function normalizeMusicTrack(track, projectDurationMs) {
	const sourceStartMs = Math.max(0, Math.min(track.asset.durationMs - 100, Math.round(track.sourceStartMs)));
	const sourceEndMs = Math.max(sourceStartMs + 100, Math.min(track.asset.durationMs, Math.round(track.sourceEndMs)));
	const activeDurationMs = track.loop ? Math.max(0, projectDurationMs - track.timelineStartMs) : Math.min(sourceEndMs - sourceStartMs, Math.max(0, projectDurationMs - track.timelineStartMs));
	const maxFadeMs = Math.max(0, Math.floor(activeDurationMs / 2));
	return {
		...track,
		timelineStartMs: Math.max(0, Math.min(projectDurationMs - 1, Math.round(track.timelineStartMs))),
		sourceStartMs,
		sourceEndMs,
		volume: Math.max(0, Math.min(1, track.volume)),
		fadeInMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeInMs))),
		fadeOutMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeOutMs)))
	};
}
//#endregion
//#region node_modules/.bun/@radix-ui+react-collapsible@1.1.12+f24ef18e65357769/node_modules/@radix-ui/react-collapsible/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
var useInsertionEffect = import_react[" useInsertionEffect ".trim().toString()] || useLayoutEffect2;
function useControllableState({ prop, defaultProp, onChange = () => {}, caller }) {
	const [uncontrolledProp, setUncontrolledProp, onChangeRef] = useUncontrolledState({
		defaultProp,
		onChange
	});
	const isControlled = prop !== void 0;
	const value = isControlled ? prop : uncontrolledProp;
	{
		const isControlledRef = import_react.useRef(prop !== void 0);
		import_react.useEffect(() => {
			const wasControlled = isControlledRef.current;
			if (wasControlled !== isControlled) console.warn(`${caller} is changing from ${wasControlled ? "controlled" : "uncontrolled"} to ${isControlled ? "controlled" : "uncontrolled"}. Components should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled value for the lifetime of the component.`);
			isControlledRef.current = isControlled;
		}, [isControlled, caller]);
	}
	return [value, import_react.useCallback((nextValue) => {
		if (isControlled) {
			const value2 = isFunction(nextValue) ? nextValue(prop) : nextValue;
			if (value2 !== prop) onChangeRef.current?.(value2);
		} else setUncontrolledProp(nextValue);
	}, [
		isControlled,
		prop,
		setUncontrolledProp,
		onChangeRef
	])];
}
function useUncontrolledState({ defaultProp, onChange }) {
	const [value, setValue] = import_react.useState(defaultProp);
	const prevValueRef = import_react.useRef(value);
	const onChangeRef = import_react.useRef(onChange);
	useInsertionEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);
	import_react.useEffect(() => {
		if (prevValueRef.current !== value) {
			onChangeRef.current?.(value);
			prevValueRef.current = value;
		}
	}, [value, prevValueRef]);
	return [
		value,
		setValue,
		onChangeRef
	];
}
function isFunction(value) {
	return typeof value === "function";
}
//#endregion
//#region node_modules/.bun/@radix-ui+react-collapsible@1.1.12+f24ef18e65357769/node_modules/@radix-ui/react-collapsible/node_modules/@radix-ui/react-presence/dist/index.mjs
function useStateMachine(initialState, machine) {
	return import_react.useReducer((state, event) => {
		return machine[state][event] ?? state;
	}, initialState);
}
var Presence = (props) => {
	const { present, children } = props;
	const presence = usePresence(present);
	const child = typeof children === "function" ? children({ present: presence.isPresent }) : import_react.Children.only(children);
	const ref = useComposedRefs(presence.ref, getElementRef(child));
	return typeof children === "function" || presence.isPresent ? import_react.cloneElement(child, { ref }) : null;
};
Presence.displayName = "Presence";
function usePresence(present) {
	const [node, setNode] = import_react.useState();
	const stylesRef = import_react.useRef(null);
	const prevPresentRef = import_react.useRef(present);
	const prevAnimationNameRef = import_react.useRef("none");
	const [state, send] = useStateMachine(present ? "mounted" : "unmounted", {
		mounted: {
			UNMOUNT: "unmounted",
			ANIMATION_OUT: "unmountSuspended"
		},
		unmountSuspended: {
			MOUNT: "mounted",
			ANIMATION_END: "unmounted"
		},
		unmounted: { MOUNT: "mounted" }
	});
	import_react.useEffect(() => {
		const currentAnimationName = getAnimationName(stylesRef.current);
		prevAnimationNameRef.current = state === "mounted" ? currentAnimationName : "none";
	}, [state]);
	useLayoutEffect2(() => {
		const styles = stylesRef.current;
		const wasPresent = prevPresentRef.current;
		if (wasPresent !== present) {
			const prevAnimationName = prevAnimationNameRef.current;
			const currentAnimationName = getAnimationName(styles);
			if (present) send("MOUNT");
			else if (currentAnimationName === "none" || styles?.display === "none") send("UNMOUNT");
			else if (wasPresent && prevAnimationName !== currentAnimationName) send("ANIMATION_OUT");
			else send("UNMOUNT");
			prevPresentRef.current = present;
		}
	}, [present, send]);
	useLayoutEffect2(() => {
		if (node) {
			let timeoutId;
			const ownerWindow = node.ownerDocument.defaultView ?? window;
			const handleAnimationEnd = (event) => {
				const isCurrentAnimation = getAnimationName(stylesRef.current).includes(CSS.escape(event.animationName));
				if (event.target === node && isCurrentAnimation) {
					send("ANIMATION_END");
					if (!prevPresentRef.current) {
						const currentFillMode = node.style.animationFillMode;
						node.style.animationFillMode = "forwards";
						timeoutId = ownerWindow.setTimeout(() => {
							if (node.style.animationFillMode === "forwards") node.style.animationFillMode = currentFillMode;
						});
					}
				}
			};
			const handleAnimationStart = (event) => {
				if (event.target === node) prevAnimationNameRef.current = getAnimationName(stylesRef.current);
			};
			node.addEventListener("animationstart", handleAnimationStart);
			node.addEventListener("animationcancel", handleAnimationEnd);
			node.addEventListener("animationend", handleAnimationEnd);
			return () => {
				ownerWindow.clearTimeout(timeoutId);
				node.removeEventListener("animationstart", handleAnimationStart);
				node.removeEventListener("animationcancel", handleAnimationEnd);
				node.removeEventListener("animationend", handleAnimationEnd);
			};
		} else send("ANIMATION_END");
	}, [node, send]);
	return {
		isPresent: ["mounted", "unmountSuspended"].includes(state),
		ref: import_react.useCallback((node2) => {
			stylesRef.current = node2 ? getComputedStyle(node2) : null;
			setNode(node2);
		}, [])
	};
}
function getAnimationName(styles) {
	return styles?.animationName || "none";
}
function getElementRef(element) {
	let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
	let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
	if (mayWarn) return element.ref;
	getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
	mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
	if (mayWarn) return element.props.ref;
	return element.props.ref || element.ref;
}
//#endregion
//#region node_modules/.bun/@radix-ui+react-collapsible@1.1.12+f24ef18e65357769/node_modules/@radix-ui/react-collapsible/dist/index.mjs
var COLLAPSIBLE_NAME = "Collapsible";
var [createCollapsibleContext, createCollapsibleScope] = createContextScope(COLLAPSIBLE_NAME);
var [CollapsibleProvider, useCollapsibleContext] = createCollapsibleContext(COLLAPSIBLE_NAME);
var Collapsible$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeCollapsible, open: openProp, defaultOpen, disabled, onOpenChange, ...collapsibleProps } = props;
	const [open, setOpen] = useControllableState({
		prop: openProp,
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		caller: COLLAPSIBLE_NAME
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleProvider, {
		scope: __scopeCollapsible,
		disabled,
		contentId: useId(),
		open,
		onOpenToggle: import_react.useCallback(() => setOpen((prevOpen) => !prevOpen), [setOpen]),
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
			"data-state": getState(open),
			"data-disabled": disabled ? "" : void 0,
			...collapsibleProps,
			ref: forwardedRef
		})
	});
});
Collapsible$1.displayName = COLLAPSIBLE_NAME;
var TRIGGER_NAME$1 = "CollapsibleTrigger";
var CollapsibleTrigger$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeCollapsible, ...triggerProps } = props;
	const context = useCollapsibleContext(TRIGGER_NAME$1, __scopeCollapsible);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.button, {
		type: "button",
		"aria-controls": context.contentId,
		"aria-expanded": context.open || false,
		"data-state": getState(context.open),
		"data-disabled": context.disabled ? "" : void 0,
		disabled: context.disabled,
		...triggerProps,
		ref: forwardedRef,
		onClick: composeEventHandlers(props.onClick, context.onOpenToggle)
	});
});
CollapsibleTrigger$1.displayName = TRIGGER_NAME$1;
var CONTENT_NAME$1 = "CollapsibleContent";
var CollapsibleContent$1 = import_react.forwardRef((props, forwardedRef) => {
	const { forceMount, ...contentProps } = props;
	const context = useCollapsibleContext(CONTENT_NAME$1, props.__scopeCollapsible);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Presence, {
		present: forceMount || context.open,
		children: ({ present }) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleContentImpl, {
			...contentProps,
			ref: forwardedRef,
			present
		})
	});
});
CollapsibleContent$1.displayName = CONTENT_NAME$1;
var CollapsibleContentImpl = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeCollapsible, present, children, ...contentProps } = props;
	const context = useCollapsibleContext(CONTENT_NAME$1, __scopeCollapsible);
	const [isPresent, setIsPresent] = import_react.useState(present);
	const ref = import_react.useRef(null);
	const composedRefs = useComposedRefs(forwardedRef, ref);
	const heightRef = import_react.useRef(0);
	const height = heightRef.current;
	const widthRef = import_react.useRef(0);
	const width = widthRef.current;
	const isOpen = context.open || isPresent;
	const isMountAnimationPreventedRef = import_react.useRef(isOpen);
	const originalStylesRef = import_react.useRef(void 0);
	import_react.useEffect(() => {
		const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
		return () => cancelAnimationFrame(rAF);
	}, []);
	useLayoutEffect2(() => {
		const node = ref.current;
		if (node) {
			originalStylesRef.current = originalStylesRef.current || {
				transitionDuration: node.style.transitionDuration,
				animationName: node.style.animationName
			};
			node.style.transitionDuration = "0s";
			node.style.animationName = "none";
			const rect = node.getBoundingClientRect();
			heightRef.current = rect.height;
			widthRef.current = rect.width;
			if (!isMountAnimationPreventedRef.current) {
				node.style.transitionDuration = originalStylesRef.current.transitionDuration;
				node.style.animationName = originalStylesRef.current.animationName;
			}
			setIsPresent(present);
		}
	}, [context.open, present]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.div, {
		"data-state": getState(context.open),
		"data-disabled": context.disabled ? "" : void 0,
		id: context.contentId,
		hidden: !isOpen,
		...contentProps,
		ref: composedRefs,
		style: {
			[`--radix-collapsible-content-height`]: height ? `${height}px` : void 0,
			[`--radix-collapsible-content-width`]: width ? `${width}px` : void 0,
			...props.style
		},
		children: isOpen && children
	});
});
function getState(open) {
	return open ? "open" : "closed";
}
var Root = Collapsible$1;
var Trigger = CollapsibleTrigger$1;
var Content = CollapsibleContent$1;
//#endregion
//#region src/renderer/src/components/ui/collapsible.tsx
var Collapsible = Root;
var CollapsibleTrigger = Trigger;
function CollapsibleContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content, {
		className: cn("overflow-hidden", className),
		...props
	});
}
//#endregion
//#region src/renderer/src/components/ui/field.tsx
function Field({ className, orientation = "vertical", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "field",
		"data-orientation": orientation,
		className: cn(orientation === "horizontal" ? "flex min-h-8 items-center justify-between gap-4" : "grid gap-1.5", className),
		...props
	});
}
function FieldLabel({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
		className: cn("text-[10.5px] font-medium text-text-secondary", className),
		...props
	});
}
function FieldContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("min-w-0", className),
		...props
	});
}
function FieldDescription({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("m-0 text-[9.5px] leading-4 text-muted-foreground", className),
		...props
	});
}
function FieldGroup({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("grid divide-y divide-border", className),
		...props
	});
}
//#endregion
//#region src/renderer/src/components/ui/input-group.tsx
function InputGroup({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "input-group",
		className: cn("group/input relative flex h-8 min-w-0 items-center rounded-md border border-input bg-surface-interactive transition-[border-color,background-color,box-shadow] duration-100", "hover:border-border-strong hover:bg-surface-hover focus-within:border-primary/55 focus-within:bg-surface-hover focus-within:ring-2 focus-within:ring-ring/18", className),
		...props
	});
}
var InputGroupInput = (0, import_react.forwardRef)(function InputGroupInput({ className, type = "text", ...props }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
		ref,
		type,
		"data-slot": "input-group-control",
		className: cn("h-full min-w-0 flex-1 border-0 bg-transparent px-2.5 text-xs text-foreground outline-none placeholder:text-text-description disabled:cursor-not-allowed disabled:opacity-50", className),
		...props
	});
});
function InputGroupAddon({ className, align = "inline-start", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "input-group-addon",
		"data-align": align,
		className: cn("flex h-full shrink-0 items-center gap-1.5 px-2.5 text-text-description [&_svg]:size-3.5", align === "inline-start" ? "order-first pr-0" : "order-last pl-0", className),
		...props
	});
}
function InputGroupButton({ className, asChild, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		"data-slot": "input-group-button",
		className: cn("grid size-6 place-items-center rounded-sm text-text-description transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-45", className),
		...props
	});
}
//#endregion
//#region src/renderer/src/components/capture/ClipLibraryToolbar.tsx
var sortOptions = [
	{
		value: "newest",
		label: "Newest"
	},
	{
		value: "oldest",
		label: "Oldest"
	},
	{
		value: "largest",
		label: "Largest"
	},
	{
		value: "smallest",
		label: "Smallest"
	},
	{
		value: "longest",
		label: "Longest"
	},
	{
		value: "shortest",
		label: "Shortest"
	}
];
var dateOptions = [
	{
		value: "any",
		label: "Any date"
	},
	{
		value: "today",
		label: "Today"
	},
	{
		value: "yesterday",
		label: "Yesterday"
	},
	{
		value: "last-7-days",
		label: "Last 7 days"
	},
	{
		value: "last-30-days",
		label: "Last 30 days"
	}
];
function ClipLibraryToolbar({ controls }) {
	const { totalClipCount, clips, hasFilters } = controls;
	const activeFilterCount = Number(controls.favoritesOnly) + Number(controls.game !== "all") + Number(controls.date !== "any") + Number(controls.source !== "all") + Number(controls.event !== "all");
	if (controls.montageSelectionMode) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "capture-montage-selection",
		role: "region",
		"aria-label": "Montage selection",
		"data-testid": "montage-selection-toolbar",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
				"aria-live": "polite",
				children: controls.selectedClipIds.length > 0 ? `${controls.selectedClipIds.length} selected` : "Select clips for a montage"
			}), controls.selectedClipIds.length < 2 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Choose at least 2 clips" }) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex shrink-0 items-center gap-2",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					className: "h-7 px-2.5 text-[11px]",
					disabled: clips.length === 0 || clips.every((clip) => controls.selectedClipIdSet.has(clip.id)),
					onClick: controls.onSelectAllVisible,
					children: ["Select all", hasFilters ? " shown" : ""]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					type: "button",
					variant: "ghost",
					size: "sm",
					className: "h-7 px-2.5 text-[11px]",
					onClick: controls.onCancelMontage,
					children: "Cancel"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "primary",
					size: "sm",
					className: "h-7 px-2.5 text-[11px]",
					disabled: controls.selectedClipIds.length < 2,
					onClick: controls.onCreateMontage,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clapperboard, {
						className: "size-3.5",
						"aria-hidden": "true"
					}), controls.selectedClipIds.length >= 2 ? `Create Montage · ${controls.selectedClipIds.length} clips` : "Create Montage"]
				})
			]
		})]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "capture-command-header__tools capture-library__tools",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
			className: "capture-library__search capture-tool-control capture-tool-control--search",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "sr-only",
				children: "Search clips"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(InputGroup, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InputGroupInput, {
					type: "search",
					value: controls.query,
					onChange: (event) => controls.onQueryChange(event.target.value),
					placeholder: "Search clips",
					"aria-label": "Search clips",
					className: "text-[11px]"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(InputGroupAddon, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { "aria-hidden": "true" }) }),
				controls.query ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InputGroupAddon, {
					align: "inline-end",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(InputGroupButton, {
						type: "button",
						"aria-label": "Clear search",
						onClick: () => controls.onQueryChange(""),
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(X, {})
					})
				}) : null
			] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "capture-library__actions",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "capture-library-menus",
					role: "group",
					"aria-label": "Filter and sort clips",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipFilters, {
						favoritesOnly: controls.favoritesOnly,
						game: controls.game,
						games: controls.games,
						date: controls.date,
						source: controls.source,
						event: controls.event,
						availableEvents: controls.availableEvents,
						activeFilterCount,
						onFavoritesChange: controls.onFavoritesChange,
						onGameChange: controls.onGameChange,
						onDateChange: controls.onDateChange,
						onSourceChange: controls.onSourceChange,
						onEventChange: controls.onEventChange,
						onClearFilters: controls.onClearFilters
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
						value: controls.sort,
						onValueChange: controls.onSortChange,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectTrigger, {
							"aria-label": "Sort clips",
							className: "capture-tool-control capture-tool-control--sort capture-sort-trigger h-8 w-28 shrink-0 text-[11px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ArrowDownUp, {
								className: "capture-tool-icon size-3.5 shrink-0",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, {
							className: "capture-tool-menu",
							children: sortOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: option.value,
								children: option.label
							}, option.value))
						})]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ToggleGroup, {
					type: "single",
					value: controls.layout,
					onValueChange: (value) => {
						if (value) controls.onLayoutChange(value);
					},
					"aria-label": "Clip view",
					className: "capture-tool-control capture-tool-control--view h-8 shrink-0 bg-surface-interactive",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
						value: "grid",
						"aria-label": "Grid view",
						title: "Grid view",
						className: "h-8 min-w-8 px-0",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Grid2x2, { className: "size-3.5" })
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
						value: "list",
						"aria-label": "List view",
						title: "List view",
						className: "h-8 min-w-8 px-0",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(List, { className: "size-3.5" })
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
					type: "button",
					variant: "secondary",
					size: "sm",
					className: "capture-montage-trigger h-8 shrink-0 gap-1.5 px-3 text-[11px]",
					"aria-label": "Create Montage",
					disabled: totalClipCount < 2,
					onClick: controls.onStartMontage,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clapperboard, {
							className: "size-3.5",
							"aria-hidden": "true"
						}),
						" ",
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "capture-montage-create",
							children: "Create "
						}), "Montage"] })
					]
				})
			]
		})]
	});
}
function ClipFilters({ favoritesOnly, game, games, date, source, event, availableEvents, activeFilterCount, onFavoritesChange, onGameChange, onDateChange, onSourceChange, onEventChange, onClearFilters }) {
	const active = activeFilterCount > 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
			type: "button",
			variant: "secondary",
			size: "sm",
			className: cn("capture-tool-control capture-tool-control--date h-8 gap-1.5 px-2.5 text-[11px]", active && "capture-filter-active"),
			"aria-label": active ? `Filters: ${activeFilterCount} active` : "Filter clips",
			"aria-pressed": active,
			"data-game": game,
			"data-favorites": favoritesOnly || void 0,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersHorizontal, { className: "size-3.5" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "capture-tool-label",
					children: ["Filter", active ? " · " : ""]
				}),
				active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					variant: "accent",
					className: "capture-filter-count border-0 bg-transparent px-0 py-0 text-[9px] tracking-normal",
					children: activeFilterCount
				}) : null
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuContent, {
		align: "end",
		className: "capture-tool-menu capture-filter-menu w-48 p-1.5",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
				onSelect: onFavoritesChange,
				className: cn("justify-between text-xs", favoritesOnly && "bg-accent text-foreground"),
				children: ["Favorites only", favoritesOnly ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
					className: "size-3.5 text-primary",
					"aria-hidden": "true"
				}) : null]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground",
				children: "Game"
			}),
			["all", ...games].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
				onSelect: () => onGameChange(value),
				className: cn("justify-between text-xs", game === value && "bg-accent text-foreground"),
				children: [value === "all" ? "All games" : value, game === value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
					className: "size-3.5 text-primary",
					"aria-hidden": "true"
				}) : null]
			}, value)),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground",
				children: "Source"
			}),
			[
				["all", "All clips"],
				["manual", "Manual captures"],
				["auto-capture", "Auto Captured"]
			].map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
				onSelect: () => onSourceChange(value),
				className: cn("justify-between text-xs", source === value && "bg-accent text-foreground"),
				children: [label, source === value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
					className: "size-3.5 text-primary",
					"aria-hidden": "true"
				}) : null]
			}, value)),
			availableEvents.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground",
					children: "Event"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
					onSelect: () => onEventChange("all"),
					className: cn("justify-between text-xs", event === "all" && "bg-accent text-foreground"),
					children: ["All events", event === "all" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
						className: "size-3.5 text-primary",
						"aria-hidden": "true"
					}) : null]
				}),
				availableEvents.map((type) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
					onSelect: () => onEventChange(type),
					className: cn("justify-between text-xs", event === type && "bg-accent text-foreground"),
					children: [gameEventTypeLabel(type), event === type ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
						className: "size-3.5 text-primary",
						"aria-hidden": "true"
					}) : null]
				}, type))
			] }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mb-1 mt-2 border-t border-border px-2 pt-2 text-[10px] font-medium text-muted-foreground",
				children: "Date"
			}),
			dateOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
				onSelect: () => onDateChange(option.value),
				className: cn("justify-between text-xs", date === option.value && "bg-accent text-foreground"),
				children: [option.label, date === option.value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
					className: "size-3.5 text-primary",
					"aria-hidden": "true"
				}) : null]
			}, option.value)),
			active ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuItem, {
				onSelect: onClearFilters,
				className: "mt-2 border-t border-border pt-2 text-xs text-muted-foreground",
				children: "Clear filters"
			}) : null
		]
	})] });
}
//#endregion
//#region src/renderer/src/components/capture/CaptureHeader.tsx
var durationOptions = [
	30,
	45,
	60,
	120,
	180,
	300
];
var qualityLabels = {
	1: "Economy",
	2: "Balanced",
	3: "Good",
	4: "High",
	5: "Ultra"
};
function CaptureHeader({ snapshot, controls }) {
	const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
	const config = snapshot.capture.config;
	const runtime = snapshot.capture.runtime;
	const sourceOptions = sourceChoices(config, snapshot.capture.sources);
	const selectedSourceValue = config.source === "automatic-game" ? "automatic-game" : config.source === "display" ? `display:${config.displayIndex}` : config.sourceId ?? "window:none";
	const supportedFps = (0, import_react.useMemo)(() => {
		const values = snapshot.capture.capabilities.maximumFps >= 120 ? [
			30,
			60,
			120
		] : [30, 60];
		if (!values.includes(config.fps)) values.push(config.fps);
		return values.sort((left, right) => left - right);
	}, [config.fps, snapshot.capture.capabilities.maximumFps]);
	const estimate = estimateClipSize(config, runtime.observedBitrateBps || void 0);
	const estimatedBytes = Math.round((estimate.lowerBoundBytes + estimate.upperBoundBytes) / 2);
	const notice = captureNotice(snapshot);
	const status = captureStatus(snapshot);
	const setupProblem = captureSetupProblem(snapshot);
	const clipCount = controls.hasFilters ? `${controls.clips.length} of ${controls.totalClipCount} clips` : `${controls.totalClipCount} ${controls.totalClipCount === 1 ? "clip" : "clips"}`;
	const changeSource = (value) => {
		if (value === "automatic-game") setCaptureConfig({
			source: "automatic-game",
			sourceId: null
		});
		else if (value.startsWith("display:")) setCaptureConfig({
			source: "display",
			sourceId: value,
			displayIndex: Number(value.split(":")[1] ?? 0)
		});
		else setCaptureConfig({
			source: "window",
			sourceId: value
		});
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		"aria-label": "Clips commands",
		className: "capture-command-header capture-toolbar sticky top-0 z-20",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "capture-command-header__capture-rail",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "capture-command-header__identity",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						id: "clips-heading",
						children: "Clips"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						"aria-live": "polite",
						children: clipCount
					})]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayConfiguration, {
					snapshot,
					sourceOptions,
					selectedSourceValue,
					supportedFps,
					estimatedBytes,
					setupProblem,
					status,
					onSourceChange: changeSource
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "capture-command-header__library-row",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipLibraryToolbar, { controls })
			}),
			notice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: cn("capture-toolbar__notice text-[11px]", notice.tone === "danger" ? "text-destructive" : "text-warning"),
				role: notice.tone === "danger" ? "alert" : "status",
				children: notice.message
			}) : null
		]
	});
}
function ReplayConfiguration({ snapshot, sourceOptions, selectedSourceValue, supportedFps, estimatedBytes, setupProblem, status, onSourceChange }) {
	const [replayOpen, setReplayOpen] = (0, import_react.useState)(false);
	const [advancedOpen, setAdvancedOpen] = (0, import_react.useState)(false);
	const replayTriggerRef = (0, import_react.useRef)(null);
	const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
	const chooseClipDirectory = useSystemStore((state) => state.chooseClipDirectory);
	const openClipsDirectory = useSystemStore((state) => state.openClipsDirectory);
	const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
	const [refreshPending, setRefreshPending] = (0, import_react.useState)(false);
	const config = snapshot.capture.config;
	const codecOptions = (snapshot.capture.capabilities.codecs.length > 0 ? snapshot.capture.capabilities.codecs : [config.codec]).map((value) => ({
		value,
		label: value === "h264" ? "H.264" : value === "hevc" ? "HEVC" : "AV1"
	}));
	const encoderOptions = encoderChoices(snapshot);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "capture-recorder-rail",
		role: "group",
		"aria-label": "Replay capture controls",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "capture-recorder-sentence",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "capture-recorder-status",
					"data-tone": status.tone,
					title: status.description,
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "capture-recorder-status__dot",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: status.label })]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "capture-recorder-source",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureSourcePicker, {
						value: selectedSourceValue,
						options: sourceOptions,
						active: config.enabled,
						compact: true,
						onChange: onSourceChange
					})
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "capture-recorder-toggle",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Replay" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					checked: config.enabled,
					"aria-label": "Instant Replay",
					onCheckedChange: (enabled) => void setCaptureConfig({ enabled })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
				open: replayOpen,
				onOpenChange: setReplayOpen,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						ref: replayTriggerRef,
						type: "button",
						variant: "ghost",
						size: "sm",
						className: "capture-recorder-settings-trigger",
						"data-tone": status.tone,
						"aria-label": `Open replay settings. Replay ${status.label}. ${status.description}`,
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings2, {
								className: "size-3.5",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "capture-recorder-length",
								title: `Replay length ${formatReplayLength(config.replaySeconds)}`,
								children: formatReplayLength(config.replaySeconds)
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
								className: "size-3.5",
								"aria-hidden": "true"
							})
						]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
					align: "end",
					sideOffset: 7,
					className: "capture-replay-popover p-0",
					"aria-label": "Replay configuration",
					onCloseAutoFocus: (event) => {
						event.preventDefault();
						replayTriggerRef.current?.focus();
						window.requestAnimationFrame(() => replayTriggerRef.current?.focus());
					},
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "capture-replay-popover__header",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Replay Capture" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureStatus, { status })]
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Changes apply to the recorder immediately." })]
							})
						}),
						setupProblem ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "capture-replay-popover__warning",
							role: "status",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
								className: "size-4 shrink-0",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Setup required." }),
								" ",
								setupProblem
							] })]
						}) : null,
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(FieldGroup, {
							className: "capture-replay-fields",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Source",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureSourcePicker, {
										value: selectedSourceValue,
										options: sourceOptions,
										active: config.enabled,
										onChange: onSourceChange
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Replay length",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
										value: String(config.replaySeconds),
										onChange: (value) => void setCaptureConfig({ replaySeconds: Number(value) }),
										ariaLabel: "Replay length",
										options: durationOptions.map((seconds) => ({
											value: String(seconds),
											label: formatReplayLength(seconds)
										}))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Resolution",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
										value: config.resolution,
										onChange: (value) => void setCaptureConfig({ resolution: value }),
										ariaLabel: "Capture resolution",
										options: [
											"720p",
											"1080p",
											"1440p",
											"2160p",
											"native"
										].map((value) => ({
											value,
											label: value === "native" ? "Native" : value
										}))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Frame rate",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
										value: String(config.fps),
										onChange: (value) => void setCaptureConfig({ fps: Number(value) }),
										ariaLabel: "Capture frame rate",
										options: supportedFps.map((fps) => ({
											value: String(fps),
											label: `${fps} FPS`
										}))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Quality",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
										value: String(config.quality),
										onChange: (value) => void setCaptureConfig({ quality: Number(value) }),
										ariaLabel: "Capture quality",
										options: [
											1,
											2,
											3,
											4,
											5
										].map((quality) => ({
											value: String(quality),
											label: qualityLabels[quality]
										}))
									})
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
									label: "Encoder",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
										value: config.encoder,
										onChange: (value) => void setCaptureConfig({ encoder: value }),
										ariaLabel: "Encoder",
										options: encoderOptions
									})
								})
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dl", {
							className: "capture-replay-storage",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Estimated replay size" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("dd", { children: ["~", formatBytes(estimatedBytes)] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("dt", { children: "Available disk" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("dd", { children: snapshot.capture.storage.availableBytes > 0 ? formatBytes(snapshot.capture.storage.availableBytes) : "Calculating…" })] })]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Collapsible, {
							open: advancedOpen,
							onOpenChange: setAdvancedOpen,
							className: "capture-replay-advanced",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CollapsibleTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "capture-replay-advanced__trigger",
									"aria-expanded": advancedOpen,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SlidersHorizontal, {
										className: "size-3.5",
										"aria-hidden": "true"
									}), " Advanced settings"] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
										className: "capture-replay-advanced__chevron size-3.5",
										"aria-hidden": "true"
									})]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CollapsibleContent, {
								className: "capture-replay-advanced__content",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(FieldGroup, { children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReplayField, {
											label: "Codec",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CompactSelect, {
												value: config.codec,
												onChange: (value) => void setCaptureConfig({ codec: value }),
												ariaLabel: "Codec",
												options: codecOptions
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
											orientation: "horizontal",
											className: "capture-replay-field",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(FieldContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldLabel, { children: "Save shortcut" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldDescription, { children: "Save the current replay buffer." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
												className: "flex items-center gap-2",
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Kbd, { children: config.hotkey }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShortcutRecorderButton, {
													value: config.hotkey,
													label: "Save replay shortcut",
													className: "h-8 px-2.5 text-[11px]",
													onValueChange: (hotkey) => void setCaptureConfig({ hotkey })
												})]
											})]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureAudioInputs, { snapshot }),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToggle, {
											label: "Capture cursor",
											checked: config.includeCursor,
											disabled: false,
											onChange: (checked) => void setCaptureConfig({ includeCursor: checked })
										})
									] }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
										className: "capture-replay-folder",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "text-[11px] font-medium text-foreground",
												children: "Clip folder"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
												className: "mt-1 truncate text-[10px] text-muted-foreground",
												title: snapshot.capture.storage.clipsDirectory,
												children: snapshot.capture.storage.clipsDirectory || "Windows Videos\\Switchboard\\Clips"
											})]
										}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
											className: "flex shrink-0 gap-2",
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
												type: "button",
												variant: "secondary",
												size: "sm",
												onClick: () => void openClipsDirectory(),
												children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FolderOpen, { className: "size-3.5" }), " Open"]
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
												type: "button",
												variant: "secondary",
												size: "sm",
												onClick: () => void chooseClipDirectory(),
												children: "Change"
											})]
										})]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										type: "button",
										variant: "ghost",
										size: "sm",
										className: "capture-replay-refresh",
										disabled: refreshPending,
										onClick: () => {
											setRefreshPending(true);
											refreshCaptureSources().finally(() => setRefreshPending(false));
										},
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: cn("size-3.5", refreshPending && "animate-spin motion-reduce:animate-none") }), refreshPending ? "Refreshing sources…" : "Refresh capture sources"]
									})
								]
							})]
						})
					]
				})]
			})
		]
	});
}
function ReplayField({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
		orientation: "horizontal",
		className: "capture-replay-field",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldLabel, { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "capture-replay-field__control",
			children
		})]
	});
}
function CaptureStatus({ status }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
		className: "capture-runtime-status",
		"data-tone": status.tone,
		title: status.description,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "capture-runtime-status__dot",
			"aria-hidden": "true"
		}), status.label]
	});
}
function CompactSelect({ value, options, onChange, ariaLabel, disabled }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
		value,
		onValueChange: onChange,
		disabled,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
			"aria-label": ariaLabel,
			className: "h-8 min-w-32 text-[11px]",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
			value: option.value,
			children: option.label
		}, option.value)) })]
	});
}
function CaptureSourcePicker({ value, options, active, compact = false, onChange }) {
	const refreshCaptureSources = useSystemStore((state) => state.refreshCaptureSources);
	const [open, setOpen] = (0, import_react.useState)(false);
	const triggerRef = (0, import_react.useRef)(null);
	const [previewRevision, setPreviewRevision] = (0, import_react.useState)(0);
	const [refreshPending, setRefreshPending] = (0, import_react.useState)(false);
	const selected = options.find((option) => option.value === value);
	const currentType = selected?.type ?? (value === "automatic-game" ? "automatic-game" : "display");
	const currentLabel = selected?.label ?? (value === "automatic-game" ? "Automatic game" : "Choose a display");
	const discoveredCount = options.length;
	const selectSource = (nextValue) => {
		onChange(nextValue);
		setOpen(false);
	};
	const refresh = async () => {
		setRefreshPending(true);
		try {
			await refreshCaptureSources();
			setPreviewRevision((revision) => revision + 1);
		} finally {
			setRefreshPending(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: (nextOpen) => {
			setOpen(nextOpen);
			if (nextOpen) refresh();
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
				ref: triggerRef,
				type: "button",
				className: cn("capture-source-trigger", compact && "capture-source-trigger--compact"),
				"data-active": active ? "true" : "false",
				"aria-label": `Capture source: ${currentLabel}`,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SourceIcon, { type: currentType }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "min-w-0 flex-1 truncate text-left",
						children: currentLabel
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, {
						className: "size-3.5 shrink-0 text-muted-foreground",
						"aria-hidden": "true"
					})
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
			align: "start",
			sideOffset: 6,
			className: "capture-source-popover p-0",
			"aria-label": "Choose capture source",
			onCloseAutoFocus: (event) => {
				event.preventDefault();
				triggerRef.current?.focus();
				window.requestAnimationFrame(() => triggerRef.current?.focus());
			},
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "capture-source-popover__header",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "text-[12px] font-semibold text-foreground",
							children: "Capture source"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-0.5 text-[10px] text-muted-foreground",
							children: "Choose what Instant Replay records. Preview images stay on this PC."
						})]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "secondary",
						size: "sm",
						disabled: refreshPending,
						onClick: () => void refresh(),
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RefreshCw, { className: cn("size-3.5", refreshPending && "animate-spin motion-reduce:animate-none") }), refreshPending ? "Refreshing…" : "Refresh"]
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "capture-source-grid",
					role: "group",
					"aria-label": "Available capture sources",
					children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureSourceOptionButton, {
						option,
						selected: option.value === value,
						previewRevision,
						onSelect: selectSource
					}, `${option.value}:${previewRevision}`))
				}),
				discoveredCount === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "capture-source-empty",
					role: "status",
					children: "No displays or windows are loaded. Refresh to scan available sources."
				}) : null
			]
		})]
	});
}
function CaptureSourceOptionButton({ option, selected, previewRevision, onSelect }) {
	const [previewFailed, setPreviewFailed] = (0, import_react.useState)(false);
	const automatic = option.type === "automatic-game";
	const previewUrl = automatic ? null : `switchboard-media://capture-source/${encodeURIComponent(option.value)}?v=${previewRevision}`;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		"aria-pressed": selected,
		className: "capture-source-option",
		"data-selected": selected ? "true" : "false",
		disabled: !option.available,
		onClick: () => onSelect(option.value),
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "capture-source-option__preview",
			"aria-hidden": "true",
			children: [automatic ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "capture-source-option__automatic",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Gamepad2, { className: "size-7" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Detect active game" })]
			}) : previewFailed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "capture-source-option__fallback",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ImageOff, { className: "size-5" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Preview unavailable" })]
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
				src: previewUrl ?? void 0,
				alt: "",
				draggable: false,
				onError: () => setPreviewFailed(true)
			}), !option.available ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "capture-source-option__unavailable",
				children: "Unavailable"
			}) : null]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "capture-source-option__copy",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "capture-source-option__name",
				title: option.label,
				children: option.label
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "capture-source-option__type",
				children: [sourceTypeLabel(option.type), selected ? " · Selected" : ""]
			})]
		})]
	});
}
function SourceIcon({ type }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(type === "display" ? Monitor : type === "window" ? AppWindow : Gamepad2, {
		className: "size-3.5 shrink-0 text-muted-foreground",
		"aria-hidden": "true"
	});
}
function CaptureToggle({ label, color, checked, disabled, unavailableReason, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "capture-replay-toggle",
		style: color ? { "--control-accent": color } : void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
			className: "flex min-w-0 items-center gap-2",
			children: [color ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "h-4 w-[3px] shrink-0 rounded-sm",
				style: { backgroundColor: color },
				"aria-hidden": "true"
			}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "block text-[11px] font-medium text-foreground",
					children: label
				}), unavailableReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mt-0.5 block text-[10px] text-muted-foreground",
					children: unavailableReason
				}) : null]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
			checked,
			disabled,
			"aria-label": label,
			onCheckedChange: onChange
		})]
	});
}
function CaptureAudioInputs({ snapshot }) {
	const setCaptureConfig = useSystemStore((state) => state.setCaptureConfig);
	const config = snapshot.capture.config;
	const capabilities = snapshot.capture.capabilities;
	const devices = snapshot.audio.devices;
	const systemAvailable = capabilities.systemAudio;
	const micAvailable = capabilities.microphoneAudio;
	const outputDevices = devices.filter((device) => device.direction === "output" && device.available && !device.isSwitchboard);
	const inputDevices = devices.filter((device) => device.direction === "input" && device.available && !device.isSwitchboard);
	const explicitMicUnavailable = Boolean(config.microphoneDeviceId) && !inputDevices.some((device) => device.id === config.microphoneDeviceId);
	const chatWithoutDevice = config.includeChatAudio && !config.chatAudioDeviceId;
	const gameAndChatSame = config.includeSystemAudio && config.includeChatAudio && (config.systemAudioDeviceId ?? "auto") === (config.chatAudioDeviceId ?? "auto");
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "capture-replay-audio",
		role: "group",
		"aria-label": "Replay audio inputs",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "text-[11px] font-medium text-foreground",
				children: "Audio inputs"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-[10px] leading-4 text-muted-foreground",
				children: "Each input is saved as its own track. Mute the microphone in the clip editor without losing game or chat audio. Sonar users can assign Sonar Game, Sonar Chat, and the microphone to separate inputs."
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mt-2 grid gap-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "capture-replay-audio__row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToggle, {
							label: "Game audio",
							color: "var(--channel-game)",
							checked: systemAvailable && config.includeSystemAudio,
							disabled: !systemAvailable,
							unavailableReason: !systemAvailable ? "Unavailable for this capture setup" : void 0,
							onChange: (checked) => void setCaptureConfig({ includeSystemAudio: checked })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureAudioDeviceSelect, {
							label: "Game audio device",
							value: config.systemAudioDeviceId,
							devices: outputDevices,
							automaticLabel: snapshot.audio.host?.running ? "Automatic (Switchboard clip mix)" : "Automatic (default system audio)",
							disabled: !systemAvailable || !config.includeSystemAudio,
							onChange: (systemAudioDeviceId) => void setCaptureConfig({ systemAudioDeviceId })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "capture-replay-audio__row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToggle, {
							label: "Chat audio",
							color: "var(--channel-chat)",
							checked: systemAvailable && config.includeChatAudio,
							disabled: !systemAvailable,
							unavailableReason: !systemAvailable ? "Unavailable for this capture setup" : void 0,
							onChange: (checked) => void setCaptureConfig({ includeChatAudio: checked })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureAudioDeviceSelect, {
							label: "Chat audio device",
							value: config.chatAudioDeviceId,
							devices: outputDevices,
							automaticLabel: "Automatic (default system audio)",
							disabled: !systemAvailable || !config.includeChatAudio,
							onChange: (chatAudioDeviceId) => void setCaptureConfig({ chatAudioDeviceId })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "capture-replay-audio__row",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToggle, {
							label: "Microphone",
							color: "var(--channel-microphone)",
							checked: micAvailable && config.includeMic,
							disabled: !micAvailable,
							unavailableReason: !micAvailable ? "Unavailable for this capture setup" : void 0,
							onChange: (checked) => void setCaptureConfig({ includeMic: checked })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureAudioDeviceSelect, {
							label: "Microphone device",
							value: config.microphoneDeviceId,
							devices: inputDevices,
							automaticLabel: snapshot.audio.microphoneDevice ? `Automatic (${snapshot.audio.microphoneDevice})` : "Automatic (follow Audio settings)",
							disabled: !micAvailable || !config.includeMic,
							onChange: (microphoneDeviceId) => void setCaptureConfig({ microphoneDeviceId })
						})]
					})
				]
			}),
			explicitMicUnavailable && config.includeMic ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[10px] leading-4 text-warning",
				role: "status",
				children: "The selected microphone is not currently available. Reconnect it or choose another input before saving clips."
			}) : null,
			chatWithoutDevice ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[10px] leading-4 text-muted-foreground",
				role: "status",
				children: "Chat is using the default system output. For separate Discord audio with Sonar, choose Sonar Chat here and Sonar Game above."
			}) : null,
			gameAndChatSame ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-2 text-[10px] leading-4 text-warning",
				role: "status",
				children: "Game and chat are using the same output, so their tracks will contain the same sound. Choose different devices to keep them separate."
			}) : null
		]
	});
}
function encoderChoices(snapshot) {
	const available = snapshot.capture.capabilities.encoders.join(" ").toLocaleLowerCase();
	return [
		{
			value: "auto",
			label: "Automatic"
		},
		{
			value: "nvenc",
			label: "NVIDIA NVENC",
			match: "nvenc"
		},
		{
			value: "amf",
			label: "AMD AMF",
			match: "amf"
		},
		{
			value: "qsv",
			label: "Intel Quick Sync",
			match: "qsv"
		},
		{
			value: "software",
			label: "Software",
			match: "libx"
		}
	].filter((option) => !option.match || available.includes(option.match) || option.value === snapshot.capture.config.encoder).map(({ value, label }) => ({
		value,
		label
	}));
}
function sourceChoices(config, sources) {
	const choices = [{
		value: "automatic-game",
		label: "Automatic game",
		type: "automatic-game",
		available: true
	}];
	const knownIds = new Set(choices.map((choice) => choice.value));
	for (const source of sources) {
		if (knownIds.has(source.id)) continue;
		choices.push({
			value: source.id,
			label: source.name,
			type: source.type,
			available: source.available
		});
		knownIds.add(source.id);
	}
	if (config.source === "display") {
		const selectedDisplay = `display:${config.displayIndex}`;
		if (!knownIds.has(selectedDisplay)) choices.push({
			value: selectedDisplay,
			label: `Display ${config.displayIndex + 1}`,
			type: "display",
			available: false
		});
	}
	if (config.source === "window" && config.sourceId && !knownIds.has(config.sourceId)) choices.push({
		value: config.sourceId,
		label: "Selected window",
		type: "window",
		available: false
	});
	return choices;
}
function sourceTypeLabel(type) {
	if (type === "automatic-game") return "Automatic";
	return type === "display" ? "Display" : "Window";
}
function captureSetupProblem(snapshot) {
	const { capabilities, config } = snapshot.capture;
	if (!config.enabled) return null;
	if (capabilities.backend === "unavailable") return "Windows capture is not available for this setup.";
	if (capabilities.encoders.length === 0) return "No compatible encoder is currently available, so Replay cannot start.";
	if (config.encoder === "auto") return null;
	return capabilities.encoders.join(" ").toLocaleLowerCase().includes({
		nvenc: "nvenc",
		amf: "amf",
		qsv: "qsv",
		software: "libx"
	}[config.encoder]) ? null : "The selected encoder is not available. Choose Automatic or another installed encoder.";
}
function captureNotice(snapshot) {
	if (snapshot.capture.storage.criticalSpace) return {
		message: "Storage is too low to save replays. Choose another clip folder.",
		tone: "danger"
	};
	if (snapshot.capture.storage.lowSpace) return {
		message: "Storage is running low. Choose another clip folder soon.",
		tone: "warning"
	};
	if (!snapshot.capture.config.enabled) return null;
	if (snapshot.capture.runtime.error) return {
		message: "Instant Replay couldn't start. Restart it in Capture Settings, or check Diagnostics.",
		tone: "danger"
	};
	if (snapshot.capture.runtime.warning) return {
		message: "Instant Replay is recovering. Check Diagnostics if this continues.",
		tone: "warning"
	};
	return null;
}
function captureStatus(snapshot) {
	if (!snapshot.capture.config.enabled || snapshot.capture.runtime.state === "stopped") return {
		label: "Off",
		description: "Instant Replay is turned off in Capture Settings.",
		tone: "neutral"
	};
	if (snapshot.capture.runtime.error || snapshot.capture.runtime.state === "error") return {
		label: "Error",
		description: "Instant Replay could not start.",
		tone: "danger"
	};
	if (snapshot.capture.runtime.warning || snapshot.capture.runtime.state === "recovering" || snapshot.capture.runtime.state === "starting") return {
		label: "Recovering",
		description: "Instant Replay is preparing the capture source.",
		tone: "warning"
	};
	if (snapshot.capture.runtime.state === "waiting") return {
		label: "Waiting",
		description: "Instant Replay is waiting for an eligible source.",
		tone: "warning"
	};
	if (snapshot.capture.runtime.state === "saving") return {
		label: "Saving",
		description: "Instant Replay is saving a clip.",
		tone: "ready"
	};
	return {
		label: "Ready",
		description: "Instant Replay is buffering this source.",
		tone: "ready"
	};
}
//#endregion
//#region node_modules/.bun/@radix-ui+react-alert-dialog@1.1.15+f24ef18e65357769/node_modules/@radix-ui/react-alert-dialog/node_modules/@radix-ui/react-slot/dist/index.mjs
var SLOTTABLE_IDENTIFIER = Symbol("radix.slottable");
// @__NO_SIDE_EFFECTS__
function createSlottable(ownerName) {
	const Slottable2 = ({ children }) => {
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
	};
	Slottable2.displayName = `${ownerName}.Slottable`;
	Slottable2.__radixId = SLOTTABLE_IDENTIFIER;
	return Slottable2;
}
//#endregion
//#region node_modules/.bun/@radix-ui+react-alert-dialog@1.1.15+f24ef18e65357769/node_modules/@radix-ui/react-alert-dialog/dist/index.mjs
var ROOT_NAME = "AlertDialog";
var [createAlertDialogContext, createAlertDialogScope] = createContextScope(ROOT_NAME, [createDialogScope]);
var useDialogScope = createDialogScope();
var AlertDialog$1 = (props) => {
	const { __scopeAlertDialog, ...alertDialogProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Root$1, {
		...dialogScope,
		...alertDialogProps,
		modal: true
	});
};
AlertDialog$1.displayName = ROOT_NAME;
var TRIGGER_NAME = "AlertDialogTrigger";
var AlertDialogTrigger = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...triggerProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trigger$1, {
		...dialogScope,
		...triggerProps,
		ref: forwardedRef
	});
});
AlertDialogTrigger.displayName = TRIGGER_NAME;
var PORTAL_NAME = "AlertDialogPortal";
var AlertDialogPortal = (props) => {
	const { __scopeAlertDialog, ...portalProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, {
		...dialogScope,
		...portalProps
	});
};
AlertDialogPortal.displayName = PORTAL_NAME;
var OVERLAY_NAME = "AlertDialogOverlay";
var AlertDialogOverlay = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...overlayProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Overlay, {
		...dialogScope,
		...overlayProps,
		ref: forwardedRef
	});
});
AlertDialogOverlay.displayName = OVERLAY_NAME;
var CONTENT_NAME = "AlertDialogContent";
var [AlertDialogContentProvider, useAlertDialogContentContext] = createAlertDialogContext(CONTENT_NAME);
var Slottable = /* @__PURE__ */ createSlottable("AlertDialogContent");
var AlertDialogContent$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, children, ...contentProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	const contentRef = import_react.useRef(null);
	const composedRefs = useComposedRefs(forwardedRef, contentRef);
	const cancelRef = import_react.useRef(null);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(WarningProvider, {
		contentName: CONTENT_NAME,
		titleName: TITLE_NAME,
		docsSlug: "alert-dialog",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogContentProvider, {
			scope: __scopeAlertDialog,
			cancelRef,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Content$1, {
				role: "alertdialog",
				...dialogScope,
				...contentProps,
				ref: composedRefs,
				onOpenAutoFocus: composeEventHandlers(contentProps.onOpenAutoFocus, (event) => {
					event.preventDefault();
					cancelRef.current?.focus({ preventScroll: true });
				}),
				onPointerDownOutside: (event) => event.preventDefault(),
				onInteractOutside: (event) => event.preventDefault(),
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slottable, { children }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DescriptionWarning, { contentRef })]
			})
		})
	});
});
AlertDialogContent$1.displayName = CONTENT_NAME;
var TITLE_NAME = "AlertDialogTitle";
var AlertDialogTitle$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...titleProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Title, {
		...dialogScope,
		...titleProps,
		ref: forwardedRef
	});
});
AlertDialogTitle$1.displayName = TITLE_NAME;
var DESCRIPTION_NAME = "AlertDialogDescription";
var AlertDialogDescription$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...descriptionProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Description, {
		...dialogScope,
		...descriptionProps,
		ref: forwardedRef
	});
});
AlertDialogDescription$1.displayName = DESCRIPTION_NAME;
var ACTION_NAME = "AlertDialogAction";
var AlertDialogAction$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...actionProps } = props;
	const dialogScope = useDialogScope(__scopeAlertDialog);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Close, {
		...dialogScope,
		...actionProps,
		ref: forwardedRef
	});
});
AlertDialogAction$1.displayName = ACTION_NAME;
var CANCEL_NAME = "AlertDialogCancel";
var AlertDialogCancel$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeAlertDialog, ...cancelProps } = props;
	const { cancelRef } = useAlertDialogContentContext(CANCEL_NAME, __scopeAlertDialog);
	const dialogScope = useDialogScope(__scopeAlertDialog);
	const ref = useComposedRefs(forwardedRef, cancelRef);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Close, {
		...dialogScope,
		...cancelProps,
		ref
	});
});
AlertDialogCancel$1.displayName = CANCEL_NAME;
var DescriptionWarning = ({ contentRef }) => {
	const MESSAGE = `\`${CONTENT_NAME}\` requires a description for the component to be accessible for screen reader users.

You can add a description to the \`${CONTENT_NAME}\` by passing a \`${DESCRIPTION_NAME}\` component as a child, which also benefits sighted users by adding visible context to the dialog.

Alternatively, you can use your own component as a description by assigning it an \`id\` and passing the same value to the \`aria-describedby\` prop in \`${CONTENT_NAME}\`. If the description is confusing or duplicative for sighted users, you can use the \`@radix-ui/react-visually-hidden\` primitive as a wrapper around your description component.

For more information, see https://radix-ui.com/primitives/docs/components/alert-dialog`;
	import_react.useEffect(() => {
		if (!document.getElementById(contentRef.current?.getAttribute("aria-describedby"))) console.warn(MESSAGE);
	}, [MESSAGE, contentRef]);
	return null;
};
var Root2 = AlertDialog$1;
var Portal2 = AlertDialogPortal;
var Overlay2 = AlertDialogOverlay;
var Content2 = AlertDialogContent$1;
var Action = AlertDialogAction$1;
var Cancel = AlertDialogCancel$1;
var Title2 = AlertDialogTitle$1;
var Description2 = AlertDialogDescription$1;
//#endregion
//#region src/renderer/src/components/ui/alert-dialog.tsx
var AlertDialog = Root2;
var AlertDialogCancel = Cancel;
var AlertDialogAction = Action;
var AlertDialogContent = (0, import_react.forwardRef)(function AlertDialogContent({ className, ...props }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Portal2, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Overlay2, { className: "fixed inset-0 z-[60] bg-black/62" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
		ref,
		className: cn("fixed left-1/2 top-1/2 z-[61] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none", className),
		...props
	})] });
});
function AlertDialogHeader({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("grid gap-1.5", className),
		...props
	});
}
function AlertDialogFooter({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("mt-4 flex justify-end gap-2", className),
		...props
	});
}
var AlertDialogTitle = (0, import_react.forwardRef)(function AlertDialogTitle({ className, ...props }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Title2, {
		ref,
		className: cn("m-0 text-[14px] font-semibold text-foreground", className),
		...props
	});
});
var AlertDialogDescription = (0, import_react.forwardRef)(function AlertDialogDescription({ className, ...props }, ref) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Description2, {
		ref,
		className: cn("m-0 text-[11px] leading-[18px] text-muted-foreground", className),
		...props
	});
});
//#endregion
//#region src/renderer/src/components/capture/ClipDialogs.tsx
function DeleteClipDialog({ clip, pending, onCancel, onConfirm }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialog, {
		open: true,
		onOpenChange: (open) => {
			if (!open && !pending) onCancel();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogTitle, { children: "Delete clip?" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogDescription, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
			className: "font-medium text-foreground",
			children: clip.name
		}), " and its media file will be moved to the Recycle Bin."] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AlertDialogFooter, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogCancel, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "secondary",
				size: "sm",
				disabled: pending,
				children: "Cancel"
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AlertDialogAction, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "danger",
				size: "sm",
				disabled: pending,
				onClick: onConfirm,
				children: pending ? "Deleting…" : "Delete clip"
			})
		})] })] })
	});
}
function RenameClipDialog({ clip, pending, onCancel, onConfirm }) {
	const [name, setName] = (0, import_react.useState)(clip.name);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open: true,
		onOpenChange: (open) => {
			if (!open && !pending) onCancel();
		},
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogContent, {
			className: "max-w-sm p-4",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("form", {
				onSubmit: (event) => {
					event.preventDefault();
					if (name.trim()) onConfirm(name.trim());
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogTitle, { children: "Rename clip" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: "Choose the name shown in your Clips library." })] }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Field, {
						className: "mt-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(FieldLabel, {
							htmlFor: "rename-clip-name",
							children: "Name"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "rename-clip-name",
							autoFocus: true,
							value: name,
							maxLength: 120,
							onChange: (event) => setName(event.target.value),
							className: "h-9 text-[12px]"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex justify-end gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "secondary",
							size: "sm",
							disabled: pending,
							onClick: onCancel,
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "submit",
							variant: "primary",
							size: "sm",
							disabled: pending || !name.trim(),
							children: pending ? "Renaming…" : "Rename"
						})]
					})
				]
			})
		})
	});
}
//#endregion
//#region src/renderer/src/components/ui/empty.tsx
function Empty({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "empty",
		className: cn("grid min-h-64 place-items-center py-12 text-center", className),
		...props
	});
}
function EmptyHeader({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("mx-auto grid max-w-sm justify-items-center gap-1.5", className),
		...props
	});
}
function EmptyMedia({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("mb-1 grid size-8 place-items-center text-muted-foreground [&_svg]:size-6", className),
		...props
	});
}
function EmptyTitle({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
		className: cn("m-0 text-[14px] font-semibold tracking-[-0.01em] text-foreground", className),
		...props
	});
}
function EmptyDescription({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
		className: cn("m-0 max-w-[38ch] text-[11px] leading-[18px] text-muted-foreground", className),
		...props
	});
}
function EmptyContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: cn("mt-2 flex items-center justify-center gap-2", className),
		...props
	});
}
//#endregion
//#region src/renderer/src/components/capture/ClipActions.tsx
function ClipActionsMenu({ clip, actions, className }) {
	const groups = clipActionGroups(clip, actions);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
				type: "button",
				"aria-label": `Actions for ${clip.name}`,
				className: cn("capture-clip-action", className),
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Ellipsis, { className: "size-4" })
			})
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "More actions" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuContent, {
		align: "end",
		className: "w-48 p-1.5",
		children: groups.map((group, groupIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [groupIndex > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownMenuSeparator, {}) : null, group.map((action) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DropdownAction, { action }, action.id))] }, group[0]?.id ?? groupIndex))
	})] });
}
function ClipContextMenu({ clip, actions, children }) {
	const groups = clipActionGroups(clip, actions);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuTrigger, {
		asChild: true,
		children
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuContent, {
		className: "w-48 p-1.5",
		children: groups.map((group, groupIndex) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [groupIndex > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuSeparator, {}) : null, group.map((action) => {
			const Icon = action.icon;
			return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuItem, {
				className: cn(action.destructive && "text-destructive focus:text-destructive"),
				onSelect: action.run,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-3.5" }), action.label]
			}, action.id);
		})] }, group[0]?.id ?? groupIndex))
	})] });
}
function DropdownAction({ action }) {
	const Icon = action.icon;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DropdownMenuItem, {
		className: cn(action.destructive && "text-destructive focus:text-destructive"),
		onSelect: action.run,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Icon, { className: "size-3.5" }), action.label]
	});
}
function clipActionGroups(clip, actions) {
	return [
		[
			{
				id: "open",
				label: "Open editor",
				icon: Play,
				run: () => actions.open(clip)
			},
			{
				id: "favorite",
				label: clip.favorite ? "Remove from favorites" : "Add to favorites",
				icon: Star,
				run: () => actions.favorite(clip, !clip.favorite)
			},
			{
				id: "rename",
				label: "Rename",
				icon: Pencil,
				run: () => actions.rename(clip)
			}
		],
		[{
			id: "export",
			label: "Export for sharing",
			icon: Download,
			run: () => actions.export(clip)
		}, {
			id: "reveal",
			label: "Show in folder",
			icon: FolderOpen,
			run: () => actions.reveal(clip)
		}],
		[{
			id: "delete",
			label: "Delete…",
			icon: Trash2,
			destructive: true,
			run: () => actions.delete(clip)
		}]
	];
}
function ClipShare({ clip, onShare, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			"aria-label": `Share ${clip.name}`,
			onClick: onShare,
			className: cn("capture-clip-action", className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Share2, { className: "size-3.5" })
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "Export for sharing" })] });
}
function ClipFavorite({ clip, onChange, className }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
			type: "button",
			"data-favorite": clip.favorite,
			"aria-label": clip.favorite ? `Remove ${clip.name} from favorites` : `Add ${clip.name} to favorites`,
			"aria-pressed": clip.favorite,
			onClick: () => onChange(!clip.favorite),
			className: cn("capture-clip-favorite", className),
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Star, { className: cn("size-4", clip.favorite && "fill-current") })
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: clip.favorite ? "Remove favorite" : "Favorite" })] });
}
//#endregion
//#region src/renderer/src/components/capture/ClipCard.tsx
var ClipCard = (0, import_react.memo)(function ClipCard({ clip, actions, selectionMode, selectedOrder, onToggleSelection }) {
	const selected = selectedOrder !== null;
	const autoCaptureSummary = autoCaptureClipSummary(clip);
	const activate = () => selectionMode ? onToggleSelection(clip) : actions.open(clip);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
		className: "min-w-0",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipContextMenu, {
			clip,
			actions,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "capture-clip-card group",
				"data-selection-mode": selectionMode || void 0,
				"data-selected": selected || void 0,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "capture-clip-card__media relative overflow-hidden rounded-[7px] border border-border",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipThumbnail, {
							clip,
							onOpen: activate,
							selectionMode,
							selected
						}),
						selectionMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
							className: "capture-clip-selection-control",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
								checked: selected,
								onCheckedChange: () => onToggleSelection(clip),
								"aria-label": `${selected ? "Remove" : "Add"} ${clip.name} ${selected ? "from" : "to"} montage`
							}), selectedOrder ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								children: selectedOrder
							}) : null]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipFavorite, {
							clip,
							onChange: (favorite) => actions.favorite(clip, favorite),
							className: "absolute bottom-2 right-2"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "capture-clip-card__quick-actions",
							hidden: selectionMode,
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipActionsMenu, {
								clip,
								actions
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipShare, {
								clip,
								onShare: () => actions.export(clip),
								className: "capture-clip-card__share"
							})]
						})
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "capture-clip-card__footer min-w-0",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "capture-clip-card__details min-w-0",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "m-0 text-[12.5px] font-semibold leading-5 text-foreground",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: activate,
								className: "capture-clip-card__title max-w-full text-left hover:text-primary focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4",
								children: clip.name
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "capture-clip-card__metadata m-0 flex min-w-0 items-center text-[9.5px] tabular-nums leading-4 text-muted-foreground",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "capture-clip-card__game truncate",
								children: [clipGameLabel(clip), autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : " · Manual Capture"]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "capture-clip-card__time shrink-0",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", {
									dateTime: new Date(clip.createdAt).toISOString(),
									title: new Date(clip.createdAt).toLocaleString(),
									children: formatRelativeTime(clip.createdAt)
								})
							})]
						})]
					})
				})]
			})
		})
	});
});
//#endregion
//#region src/renderer/src/components/capture/ClipGrid.tsx
var ClipGrid = (0, import_react.memo)(function ClipGrid({ clips, actions, grouped, selectionMode, selectedClipIds, onToggleSelection }) {
	const groups = (0, import_react.useMemo)(() => grouped ? groupClips(clips) : [], [clips, grouped]);
	const selectionOrder = (0, import_react.useMemo)(() => new Map(selectedClipIds.map((id, index) => [id, index + 1])), [selectedClipIds]);
	const card = (clip) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipCard, {
		clip,
		actions,
		selectionMode,
		selectedOrder: selectionOrder.get(clip.id) ?? null,
		onToggleSelection
	}, clip.id);
	if (!grouped) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
		className: "capture-clip-grid m-0 list-none p-0",
		children: clips.map(card)
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "capture-clip-groups",
		children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"aria-labelledby": `clip-group-${group.key}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "capture-clip-group__header flex items-center gap-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: `clip-group-${group.key}`,
					className: "m-0 text-[11px] font-semibold tracking-[-0.01em] text-text-secondary",
					children: group.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[9.5px] tabular-nums text-text-description",
					children: group.clips.length
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "capture-clip-grid m-0 list-none p-0",
				children: group.clips.map(card)
			})]
		}, group.label))
	});
});
function groupClips(clips) {
	const groups = /* @__PURE__ */ new Map();
	for (const clip of clips) {
		const date = new Date(clip.createdAt);
		const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
		const existing = groups.get(key);
		if (existing) existing.clips.push(clip);
		else groups.set(key, {
			key: key.replace(/[^a-z0-9-]/gi, ""),
			label: formatClipDateGroup(clip.createdAt),
			clips: [clip]
		});
	}
	return [...groups.values()];
}
//#endregion
//#region src/renderer/src/components/capture/ClipList.tsx
var ClipList = (0, import_react.memo)(function ClipList({ clips, actions, selectionMode, selectedClipIds, onToggleSelection }) {
	const groups = (0, import_react.useMemo)(() => groupClips(clips), [clips]);
	const selectionOrder = (0, import_react.useMemo)(() => new Map(selectedClipIds.map((id, index) => [id, index + 1])), [selectedClipIds]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "capture-clip-list-groups",
		children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
			"aria-labelledby": `clip-list-group-${group.key}`,
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "capture-clip-group__header flex items-center gap-2.5",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					id: `clip-list-group-${group.key}`,
					className: "m-0 text-[11px] font-semibold tracking-[-0.01em] text-text-secondary",
					children: group.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "text-[9.5px] tabular-nums text-text-description",
					children: group.clips.length
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
				className: "capture-clip-list",
				"aria-label": `${group.label} clips in list view`,
				children: group.clips.map((clip) => {
					const selectedOrder = selectionOrder.get(clip.id) ?? null;
					const selected = selectedOrder !== null;
					const activate = () => selectionMode ? onToggleSelection(clip) : actions.open(clip);
					const autoCaptureSummary = autoCaptureClipSummary(clip);
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipContextMenu, {
						clip,
						actions,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "capture-clip-list__item group",
							"data-selection-mode": selectionMode || void 0,
							"data-selected": selected || void 0,
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "capture-clip-list__preview",
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipThumbnail, {
										clip,
										onOpen: activate,
										className: "capture-clip-list__thumbnail rounded-md border border-border",
										selectionMode,
										selected
									}), selectionMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "capture-clip-selection-control",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Checkbox, {
											checked: selected,
											onCheckedChange: () => onToggleSelection(clip),
											"aria-label": `${selected ? "Remove" : "Add"} ${clip.name} ${selected ? "from" : "to"} montage`
										}), selectedOrder ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											children: selectedOrder
										}) : null]
									}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipFavorite, {
										clip,
										onChange: (favorite) => actions.favorite(clip, favorite),
										className: "absolute right-2 top-2 opacity-100"
									})]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "min-w-0",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
											className: "m-0 truncate text-[13px] font-semibold leading-5 text-foreground",
											children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
												type: "button",
												onClick: activate,
												className: "max-w-full truncate text-left hover:text-primary focus-visible:outline-none focus-visible:underline",
												children: clip.name
											})
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "m-0 mt-0.5 truncate text-[11px] font-medium leading-4 text-text-secondary",
											children: [clipGameLabel(clip), autoCaptureSummary ? ` · ${autoCaptureSummary} · Auto Capture` : " · Manual Capture"]
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
											className: "capture-clip-list__metadata",
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("time", {
													dateTime: new Date(clip.createdAt).toISOString(),
													title: new Date(clip.createdAt).toLocaleString(),
													children: formatRelativeTime(clip.createdAt)
												}) }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Video quality: ", formatVideoQuality(clip.width, clip.height, clip.fps)] }),
												/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Size: ", formatBytes(clip.fileSize)] })
											]
										})
									]
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
									className: "capture-clip-list__actions",
									hidden: selectionMode,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipShare, {
										clip,
										onShare: () => actions.export(clip),
										className: "border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground"
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipActionsMenu, {
										clip,
										actions,
										className: "border-0 bg-transparent text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground"
									})]
								})
							]
						})
					}, clip.id);
				})
			})]
		}, group.key))
	});
});
//#endregion
//#region src/renderer/src/components/capture/ClipLibrary.tsx
function ClipLibrary({ actions, replayEnabled, hotkey, captureUnavailableReason, controls }) {
	const { clips, layout, montageSelectionMode, selectedClipIds } = controls;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		"aria-labelledby": "clips-heading",
		className: "capture-library min-h-0 flex-1",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "capture-library__content",
			children: clips.length > 0 ? layout === "grid" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipGrid, {
				clips,
				actions,
				grouped: true,
				selectionMode: montageSelectionMode,
				selectedClipIds,
				onToggleSelection: controls.onToggleClipSelection
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipList, {
				clips,
				actions,
				selectionMode: montageSelectionMode,
				selectedClipIds,
				onToggleSelection: controls.onToggleClipSelection
			}) : controls.totalClipCount === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyLibrary, {
				replayEnabled,
				hotkey,
				captureUnavailableReason
			}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Empty, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(EmptyHeader, { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyMedia, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, { strokeWidth: 1.5 }) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyTitle, { children: "No clips match these filters" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyDescription, { children: "Clear the current search and filters to show your library." })
			] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyContent, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				type: "button",
				variant: "secondary",
				size: "sm",
				onClick: controls.onClearFilters,
				children: "Clear filters"
			}) })] })
		})
	});
}
function EmptyLibrary({ replayEnabled, hotkey, captureUnavailableReason }) {
	if (captureUnavailableReason) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(EmptyHeader, { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyMedia, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, { strokeWidth: 1.5 }) }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyTitle, { children: "Capture unavailable" }),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyDescription, { children: captureUnavailableReason })
	] }) });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Empty, {
		className: "min-h-72",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(EmptyHeader, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyMedia, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, { strokeWidth: 1.5 }) }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyTitle, { children: "No clips yet" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EmptyDescription, { children: replayEnabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				"Press ",
				hotkey,
				" when something worth saving happens."
			] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
				"Turn on Instant Replay in Capture Settings.",
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("br", {}),
				"Then press ",
				hotkey,
				" when something worth saving happens."
			] }) })
		] })
	});
}
//#endregion
//#region src/renderer/src/components/capture/MontageDraftStrip.tsx
function MontageDraftStrip({ drafts, clips, onResume, onDelete }) {
	if (drafts.length === 0) return null;
	const clipIds = new Set(clips.map((clip) => clip.id));
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-v2-drafts",
		"aria-label": "Recent montage drafts",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "montage-v2-drafts__label",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Clapperboard, { "aria-hidden": "true" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: "Montage drafts" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: "Autosaved locally" })] })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "montage-v2-drafts__list",
				children: drafts.slice(0, 3).map((draft) => {
					const missing = draft.segments.filter((segment) => !clipIds.has(segment.clipId)).length;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "montage-v2-draft",
						"data-missing": missing > 0 || void 0,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
							type: "button",
							onClick: () => onResume(draft),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: draft.name }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
								draft.segments.length,
								" clips · ",
								formatDuration(draft.durationMs / 1e3),
								missing > 0 ? ` · ${missing} missing` : ""
							] })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "ghost",
							size: "icon",
							className: "size-7",
							"aria-label": `Discard ${draft.name}`,
							onClick: () => onDelete(draft),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, { className: "size-3.5" })
						})]
					}, draft.id);
				})
			}),
			drafts.length > 3 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "montage-v2-drafts__more",
				children: [
					"+",
					drafts.length - 3,
					" more"
				]
			}) : null
		]
	});
}
//#endregion
//#region src/renderer/src/components/capture/clip-library-model.ts
function useClipLibraryControls(allClips, onCreateMontage) {
	const [query, setQuery] = (0, import_react.useState)("");
	const [game, setGame] = (0, import_react.useState)("all");
	const [date, setDate] = (0, import_react.useState)("any");
	const [favoritesOnly, setFavoritesOnly] = (0, import_react.useState)(false);
	const [source, setSource] = (0, import_react.useState)("all");
	const [event, setEvent] = (0, import_react.useState)("all");
	const [sort, setSort] = (0, import_react.useState)("newest");
	const [layout, setLayout] = (0, import_react.useState)("grid");
	const [montageSelectionMode, setMontageSelectionMode] = (0, import_react.useState)(false);
	const [selectedClipIds, setSelectedClipIds] = (0, import_react.useState)([]);
	const games = (0, import_react.useMemo)(() => [...new Set(allClips.map(clipGameLabel))].sort((left, right) => left.localeCompare(right)), [allClips]);
	const availableEvents = (0, import_react.useMemo)(() => [...new Set(allClips.flatMap((clip) => clip.autoCapture?.events.map((marker) => marker.type) ?? []))].sort(), [allClips]);
	const clips = (0, import_react.useMemo)(() => filterAndSortClips(allClips, {
		query,
		game,
		date,
		favoritesOnly,
		source,
		event,
		sort
	}), [
		allClips,
		date,
		event,
		favoritesOnly,
		game,
		query,
		sort,
		source
	]);
	const hasFilters = query.trim().length > 0 || game !== "all" || date !== "any" || favoritesOnly || source !== "all" || event !== "all";
	const selectedClipIdSet = (0, import_react.useMemo)(() => new Set(selectedClipIds), [selectedClipIds]);
	(0, import_react.useEffect)(() => {
		const available = new Set(allClips.map((clip) => clip.id));
		setSelectedClipIds((current) => {
			const next = current.filter((id) => available.has(id));
			return next.length === current.length ? current : next;
		});
	}, [allClips]);
	(0, import_react.useEffect)(() => {
		if (!montageSelectionMode) return;
		const cancelOnEscape = (event) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			if (document.querySelector("[data-radix-popper-content-wrapper], [role=\"dialog\"]")) return;
			event.preventDefault();
			setMontageSelectionMode(false);
			setSelectedClipIds([]);
		};
		window.addEventListener("keydown", cancelOnEscape);
		return () => window.removeEventListener("keydown", cancelOnEscape);
	}, [montageSelectionMode]);
	const toggleClipSelection = (0, import_react.useCallback)((clip) => {
		setSelectedClipIds((current) => current.includes(clip.id) ? current.filter((id) => id !== clip.id) : [...current, clip.id]);
	}, []);
	const cancelMontage = () => {
		setMontageSelectionMode(false);
		setSelectedClipIds([]);
	};
	const createMontage = () => {
		if (selectedClipIds.length < 2) return;
		const byId = new Map(allClips.map((clip) => [clip.id, clip]));
		const selected = selectedClipIds.map((id) => byId.get(id)).filter((clip) => Boolean(clip));
		if (selected.length < 2) return;
		onCreateMontage(selected);
		cancelMontage();
	};
	return {
		query,
		game,
		date,
		favoritesOnly,
		source,
		event,
		availableEvents,
		sort,
		layout,
		games,
		clips,
		totalClipCount: allClips.length,
		hasFilters,
		montageSelectionMode,
		selectedClipIds,
		selectedClipIdSet,
		onQueryChange: setQuery,
		onGameChange: setGame,
		onDateChange: setDate,
		onFavoritesChange: () => setFavoritesOnly((current) => !current),
		onSourceChange: setSource,
		onEventChange: setEvent,
		onSortChange: setSort,
		onLayoutChange: setLayout,
		onStartMontage: () => setMontageSelectionMode(true),
		onCancelMontage: cancelMontage,
		onSelectAllVisible: () => setSelectedClipIds((current) => {
			const next = [...current];
			const known = new Set(current);
			for (const clip of clips) if (!known.has(clip.id)) next.push(clip.id);
			return next;
		}),
		onCreateMontage: createMontage,
		onToggleClipSelection: toggleClipSelection,
		onClearFilters: () => {
			setQuery("");
			setGame("all");
			setDate("any");
			setFavoritesOnly(false);
			setSource("all");
			setEvent("all");
		}
	};
}
//#endregion
//#region src/renderer/src/pages/capture.tsx
var loadClipEditor = () => __vitePreload(() => import("./ClipEditor-DsstA2Rl.js"), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]), import.meta.url);
var loadMontageComposer = () => __vitePreload(() => import("./MontageComposer-DWEfvpGj.js"), __vite__mapDeps([17,1,2,18,9,6,5,7,10,11,12,19]), import.meta.url);
var ClipEditor = (0, import_react.lazy)(() => loadClipEditor().then((module) => ({ default: module.ClipEditor })));
var MontageComposer = (0, import_react.lazy)(() => loadMontageComposer().then((module) => ({ default: module.MontageComposer })));
function CapturePage({ snapshot, requestedClipId, onRequestedClipHandled }) {
	const setClipFavorite = useSystemStore((state) => state.setClipFavorite);
	const revealClip = useSystemStore((state) => state.revealClip);
	const deleteClip = useSystemStore((state) => state.deleteClip);
	const renameClip = useSystemStore((state) => state.renameClip);
	const exportClip = useSystemStore((state) => state.exportClip);
	const prepareClipShare = useSystemStore((state) => state.prepareClipShare);
	const cancelClipExport = useSystemStore((state) => state.cancelClipExport);
	const setClipCanvasSize = useSystemStore((state) => state.setClipCanvasSize);
	const setClipTrim = useSystemStore((state) => state.setClipTrim);
	const setClipAudioTrackLevel = useSystemStore((state) => state.setClipAudioTrackLevel);
	const updateSettings = useSystemStore((state) => state.updateSettings);
	const updateAutoCaptureSettings = useSystemStore((state) => state.updateAutoCaptureSettings);
	const setupAutoCaptureProvider = useSystemStore((state) => state.setupAutoCaptureProvider);
	const [editorClipId, setEditorClipId] = (0, import_react.useState)(null);
	const [montageProject, setMontageProject] = (0, import_react.useState)(null);
	const [montageDrafts, setMontageDrafts] = (0, import_react.useState)([]);
	const [deleteTarget, setDeleteTarget] = (0, import_react.useState)(null);
	const [renameTarget, setRenameTarget] = (0, import_react.useState)(null);
	const [toast, setToast] = (0, import_react.useState)(null);
	const [pendingClipActions, setPendingClipActions] = (0, import_react.useState)(() => /* @__PURE__ */ new Set());
	const previousSavedClipId = (0, import_react.useRef)(snapshot.clips[0]?.id);
	const restoreFocusClipId = (0, import_react.useRef)(null);
	const editorClip = snapshot.clips.find((clip) => clip.id === editorClipId) ?? null;
	const editorOpen = Boolean(editorClip || montageProject);
	const dialogOpen = Boolean(deleteTarget || renameTarget);
	const refreshMontageDrafts = (0, import_react.useCallback)(() => {
		montageV2Api.listMontageDrafts().then(setMontageDrafts).catch((error) => showTransientToast(`Could not load montage drafts: ${errorMessage(error)}`, setToast));
	}, []);
	(0, import_react.useEffect)(refreshMontageDrafts, [refreshMontageDrafts]);
	const clipLibraryControls = useClipLibraryControls(snapshot.clips, (clips) => {
		try {
			loadMontageComposer();
			setEditorClipId(null);
			setMontageProject(createMontageProjectV2(clips));
		} catch (error) {
			showTransientToast(errorMessage(error), setToast);
		}
	});
	const offeredAutoCaptureProvider = snapshot.capture.autoCapture.providers.find((provider) => !provider.developmentOnly && provider.gameId === snapshot.capture.autoCapture.runtime.activeGameId && provider.supportLevel === "supported" && provider.availability.state !== "unavailable" && !snapshot.capture.autoCapture.settings.enabled && !snapshot.capture.autoCapture.settings.dismissedAvailability[provider.gameId]);
	const runClipAction = (0, import_react.useCallback)(async (key, action) => {
		setPendingClipActions((current) => new Set(current).add(key));
		try {
			return await action();
		} finally {
			setPendingClipActions((current) => {
				const next = new Set(current);
				next.delete(key);
				return next;
			});
		}
	}, []);
	const closeEditor = (0, import_react.useCallback)(() => {
		restoreFocusClipId.current = editorClipId;
		setEditorClipId(null);
		setMontageProject(null);
	}, [editorClipId]);
	(0, import_react.useEffect)(() => {
		if (editorClipId || !restoreFocusClipId.current) return;
		const closingId = restoreFocusClipId.current;
		restoreFocusClipId.current = null;
		window.requestAnimationFrame(() => {
			document.querySelector(`[data-clip-id="${CSS.escape(closingId)}"]`)?.focus();
		});
	}, [editorClipId]);
	(0, import_react.useEffect)(() => {
		if (editorClipId && !editorClip) setEditorClipId(null);
	}, [editorClip, editorClipId]);
	(0, import_react.useEffect)(() => {
		if (!requestedClipId) return;
		if (snapshot.clips.some((clip) => clip.id === requestedClipId)) {
			setMontageProject(null);
			setEditorClipId(requestedClipId);
		}
		onRequestedClipHandled?.();
	}, [
		onRequestedClipHandled,
		requestedClipId,
		snapshot.clips
	]);
	(0, import_react.useEffect)(() => {
		const latest = snapshot.clips[0];
		if (!latest || latest.id === previousSavedClipId.current) return;
		previousSavedClipId.current = latest.id;
		if (!snapshot.capture.runtime.lastSavedAt || Math.abs(latest.createdAt - new Date(snapshot.capture.runtime.lastSavedAt).getTime()) > 5e3) return;
		if (latest.autoCapture) {
			if (!snapshot.capture.autoCapture.settings.notifyWhenSaved) return;
			showTransientToast(`Auto Capture saved · ${autoCaptureClipSummary(latest) ?? "Highlight"} · ${clipGameLabel(latest)}`, setToast);
			return;
		}
		showTransientToast(`Replay saved · ${clipGameLabel(latest)} · ${formatDuration(latest.durationMs / 1e3)} · ${formatBytes(latest.fileSize)}`, setToast);
	}, [
		snapshot.capture.autoCapture.settings.notifyWhenSaved,
		snapshot.capture.runtime.lastSavedAt,
		snapshot.clips
	]);
	const actions = (0, import_react.useMemo)(() => ({
		open: (clip) => {
			loadClipEditor();
			setMontageProject(null);
			setEditorClipId(clip.id);
		},
		favorite: (clip, favorite) => void setClipFavorite({
			id: clip.id,
			favorite
		}),
		rename: (clip) => setRenameTarget(clip),
		reveal: (clip) => void revealClip(clip.id),
		export: (clip) => void runClipAction(`clip:${clip.id}:export`, () => exportClip({
			id: clip.id,
			startMs: clip.trimStartMs ?? 0,
			endMs: clip.trimEndMs ?? clip.durationMs,
			preset: "original"
		})).then((exported) => {
			if (exported) showTransientToast("Clip exported", setToast);
		}),
		delete: (clip) => setDeleteTarget(clip)
	}), [
		exportClip,
		revealClip,
		runClipAction,
		setClipFavorite
	]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "relative flex min-h-full flex-1 flex-col",
		"data-testid": "capture-library",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "flex min-h-full flex-1 flex-col",
				"aria-hidden": editorOpen || dialogOpen ? true : void 0,
				inert: editorOpen || dialogOpen ? true : void 0,
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureHeader, {
						snapshot,
						controls: clipLibraryControls
					}),
					!clipLibraryControls.montageSelectionMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageDraftStrip, {
						drafts: montageDrafts,
						clips: snapshot.clips,
						onResume: (draft) => {
							setEditorClipId(null);
							setMontageProject(reconcileMontageProject(draft, snapshot.clips));
						},
						onDelete: (draft) => {
							montageV2Api.deleteMontageDraft(draft.id).then(() => {
								refreshMontageDrafts();
								showTransientToast("Montage draft discarded", setToast);
							}).catch((error) => showTransientToast(errorMessage(error), setToast));
						}
					}) : null,
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipLibrary, {
						actions,
						replayEnabled: snapshot.capture.config.enabled,
						hotkey: snapshot.capture.config.hotkey,
						captureUnavailableReason: snapshot.capture.capabilities.backend === "unavailable" ? "Windows capture is not available for this system configuration." : snapshot.capture.storage.criticalSpace ? "Free disk space or choose another clip folder before saving replays." : null,
						controls: clipLibraryControls
					})
				]
			}),
			editorClip ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "contents",
				"aria-hidden": dialogOpen ? true : void 0,
				inert: dialogOpen ? true : void 0,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
					fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToolLoading, { label: "Loading clip editor" }),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipEditor, {
						clip: editorClip,
						exportPending: pendingClipActions.has(`clip:${editorClip.id}:export`),
						trimPending: pendingClipActions.has(`clip:${editorClip.id}:trim`),
						canvasPending: pendingClipActions.has(`clip:${editorClip.id}:canvas`),
						inspectorOpen: snapshot.settings.clipEditorInspectorOpen,
						defaultTrackLevels: snapshot.capture.config.defaultTrackLevels,
						onClose: closeEditor,
						onFavorite: (favorite) => void setClipFavorite({
							id: editorClip.id,
							favorite
						}),
						onRename: () => setRenameTarget(editorClip),
						onReveal: () => void revealClip(editorClip.id),
						onInspectorOpenChange: (open) => void updateSettings({ clipEditorInspectorOpen: open }),
						onCanvasSizeChange: (canvasSize) => void runClipAction(`clip:${editorClip.id}:canvas`, () => setClipCanvasSize({
							id: editorClip.id,
							canvasSize
						})).then(() => {
							showTransientToast(canvasSize === "9:16" ? "Canvas set to 9:16" : "Canvas restored to original", setToast);
						}),
						onSaveTrim: (startMs, endMs, audioTrackTrims) => runClipAction(`clip:${editorClip.id}:trim`, () => setClipTrim({
							id: editorClip.id,
							startMs,
							endMs,
							audioTrackTrims
						})).then(() => {
							showTransientToast("Timeline edits saved", setToast);
						}),
						onAudioTrackLevelChange: (trackIndex, level) => setClipAudioTrackLevel({
							id: editorClip.id,
							trackIndex,
							level
						}),
						onExport: (preset, startMs, endMs, audioTrackTrims, exportId) => runClipAction(`clip:${editorClip.id}:export`, () => prepareClipShare({
							id: editorClip.id,
							startMs,
							endMs,
							preset,
							audioTrackTrims,
							exportId
						})).then((prepared) => {
							if (prepared) showTransientToast("Clip ready to drag", setToast);
							return prepared;
						}),
						onCancelExport: async (exportId) => {
							await cancelClipExport(exportId);
							showTransientToast("Export cancelled", setToast);
						},
						onDelete: () => setDeleteTarget(editorClip)
					})
				})
			}) : null,
			montageProject ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "contents",
				"aria-hidden": dialogOpen ? true : void 0,
				inert: dialogOpen ? true : void 0,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Suspense, {
					fallback: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CaptureToolLoading, { label: "Loading montage workspace" }),
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageComposer, {
						initialProject: montageProject,
						clips: snapshot.clips,
						inspectorOpen: snapshot.settings.clipEditorInspectorOpen,
						onClose: closeEditor,
						onReveal: (clip) => void revealClip(clip.id),
						onInspectorOpenChange: (open) => void updateSettings({ clipEditorInspectorOpen: open }),
						onDraftsChanged: refreshMontageDrafts
					}, montageProject.id)
				})
			}) : null,
			deleteTarget ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeleteClipDialog, {
				clip: deleteTarget,
				pending: pendingClipActions.has(`clip:${deleteTarget.id}:delete`),
				onCancel: () => setDeleteTarget(null),
				onConfirm: () => void runClipAction(`clip:${deleteTarget.id}:delete`, () => deleteClip(deleteTarget.id)).then(() => {
					if (editorClipId === deleteTarget.id) setEditorClipId(null);
					setDeleteTarget(null);
					showTransientToast("Clip moved to the Recycle Bin", setToast);
				})
			}) : null,
			renameTarget ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RenameClipDialog, {
				clip: renameTarget,
				pending: pendingClipActions.has(`clip:${renameTarget.id}:rename`),
				onCancel: () => setRenameTarget(null),
				onConfirm: (name) => void runClipAction(`clip:${renameTarget.id}:rename`, () => renameClip({
					id: renameTarget.id,
					name
				})).then(() => {
					setRenameTarget(null);
					showTransientToast("Clip renamed", setToast);
				})
			}) : null,
			toast ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "fixed bottom-5 right-5 z-[70] max-w-sm rounded-lg border border-border bg-popover px-4 py-3 text-[12px] text-foreground shadow-xl",
				role: "status",
				"aria-live": "polite",
				children: toast
			}) : null,
			offeredAutoCaptureProvider ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "fixed bottom-5 right-5 z-[69] w-[min(360px,calc(100vw-40px))] rounded-lg border border-border bg-popover px-4 py-3 shadow-xl",
				role: "status",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-[13px] font-medium text-foreground",
						children: [
							"Auto Capture is available for ",
							offeredAutoCaptureProvider.displayName,
							"."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-[12px] leading-5 text-muted-foreground",
						children: "Gameplay telemetry stays local and preserves highlights from the existing replay buffer."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex justify-end gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "ghost",
							onClick: () => void updateAutoCaptureSettings({ dismissedAvailability: { [offeredAutoCaptureProvider.gameId]: true } }),
							children: "Not now"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							size: "sm",
							variant: "primary",
							onClick: () => void updateAutoCaptureSettings({
								enabled: true,
								games: { [offeredAutoCaptureProvider.gameId]: { enabled: true } },
								dismissedAvailability: { [offeredAutoCaptureProvider.gameId]: true }
							}).then(() => offeredAutoCaptureProvider.availability.state === "setup-required" ? setupAutoCaptureProvider(offeredAutoCaptureProvider.id) : void 0),
							children: "Enable"
						})]
					})
				]
			}) : null
		]
	});
}
function CaptureToolLoading({ label }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "absolute inset-0 z-50 grid place-items-center bg-background text-[12px] text-muted-foreground",
		role: "status",
		children: label
	});
}
function showTransientToast(message, setToast) {
	setToast(message);
	window.setTimeout(() => setToast(null), 3200);
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
export { CapturePage, Star as _, montageStartForSegment as a, normalizeMontageProject as c, reorderMontageSegment as d, segmentDurationMs as f, montageV2Api as g, updateMontageSegment as h, mapMontageTime as i, reconcileMontageProject as l, updateMontageMusic as m, createMontageMusicTrack as n, musicPlaybackAt as o, splitMontageSegment as p, duplicateMontageSegment as r, musicTimelineDurationMs as s, addClipsToMontage as t, removeMontageSegment as u, Share2 as v, Clapperboard as y };
