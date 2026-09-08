import { BrowserWindow, Menu, Tray, app, desktopCapturer, dialog, globalShortcut, ipcMain, nativeImage, net, powerMonitor, protocol, screen, session, shell } from "electron";
import { createReadStream, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { access, appendFile, copyFile, mkdir, open, opendir, readFile, readdir, rename, rm, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { basename, delimiter, dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { z } from "zod";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { freemem, release, tmpdir, totalmem, version } from "node:os";
import { monitorEventLoopDelay, performance as performance$1 } from "node:perf_hooks";
import { HIDAsync, devicesAsync } from "node-hid";
import WebSocket from "ws";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { createServer } from "node:http";
// -- CommonJS Shims --
import __cjs_mod__ from "node:module";
import.meta.filename;
const __dirname = import.meta.dirname;
__cjs_mod__.createRequire(import.meta.url);
//#region src/main/application-identity.ts
var installedApplicationId = "dev.switchboard.prototype";
var developmentApplicationId = "dev.switchboard.prototype.dev";
function shouldApplyDevelopmentIdentity(input) {
	return !input.isPackaged && !input.isNativeReview;
}
function resolveApplicationIdentity(input) {
	if (input.isPackaged) return {
		appUserModelId: installedApplicationId,
		displayName: "Switchboard",
		userDataPath: null
	};
	return {
		appUserModelId: developmentApplicationId,
		displayName: "Switchboard Dev",
		userDataPath: join(input.appDataPath, "Switchboard Dev")
	};
}
//#endregion
//#region src/shared/video-edits.ts
var time = z.number().int().min(0).max(864e5);
var unit = z.number().min(0).max(1);
var interpolationSchema = z.enum([
	"linear",
	"smooth",
	"hold"
]);
var framingKeyframeSchema = z.object({
	timeMs: time,
	x: unit,
	y: unit,
	zoom: z.number().min(1).max(8),
	transition: interpolationSchema
});
var gainPointSchema = z.object({
	timeMs: time,
	gain: unit
});
var muteRangeSchema = z.object({
	startMs: time,
	endMs: time
}).refine((value) => value.endMs > value.startMs, "The end must follow the start.");
var audioAutomationSchema = z.object({
	trackIndex: z.number().int().min(0).max(7),
	points: z.array(gainPointSchema).max(128),
	mutes: z.array(muteRangeSchema).max(64)
});
var videoOverlaySchema = z.object({
	id: z.string().uuid(),
	kind: z.enum([
		"text",
		"blur",
		"pixelate"
	]),
	startMs: time,
	endMs: time,
	x: unit,
	y: unit,
	width: z.number().min(.02).max(1),
	height: z.number().min(.02).max(1),
	content: z.string().max(500).refine((value) => !/[\x00-\x08\x0b-\x1f]/.test(value), "Use printable text.").optional(),
	size: z.enum([
		"small",
		"medium",
		"large"
	]).optional()
}).superRefine((value, context) => {
	if (value.endMs <= value.startMs) context.addIssue({
		code: "custom",
		message: "The overlay must end after it starts."
	});
	if (value.x + value.width > 1.00001 || value.y + value.height > 1.00001) context.addIssue({
		code: "custom",
		message: "Keep the overlay within the frame."
	});
});
var videoTextSchema = z.object({
	content: z.string().max(160).refine((text) => !/[\x00-\x08\x0b-\x1f]/.test(text), "Use printable text."),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().positive(),
	position: z.enum([
		"top",
		"center",
		"bottom"
	]),
	size: z.enum([
		"small",
		"medium",
		"large"
	])
}).refine((text) => text.endMs > text.startMs, "Text must end after it starts.");
var videoEditsSchema = z.object({
	speed: z.number().min(.25).max(4).optional(),
	brightness: z.number().min(-.3).max(.3).optional(),
	contrast: z.number().min(.5).max(1.5).optional(),
	saturation: z.number().min(0).max(2).optional(),
	flipHorizontal: z.boolean().optional(),
	text: videoTextSchema.optional(),
	framing: z.object({
		mode: z.enum(["fill", "fit"]),
		background: z.enum(["black", "blur"]),
		keyframes: z.array(framingKeyframeSchema).max(128)
	}).optional(),
	overlays: z.array(videoOverlaySchema).max(32).optional(),
	speedPoints: z.array(z.object({
		timeMs: time,
		speed: z.number().min(.25).max(4),
		transition: z.enum(["linear", "hold"])
	})).max(64).optional(),
	freezes: z.array(z.object({
		timeMs: time,
		durationMs: z.number().int().min(100).max(3e4)
	})).max(32).optional(),
	audioAutomation: z.array(audioAutomationSchema).max(8).optional()
}).superRefine((value, context) => {
	for (const [name, points] of Object.entries({
		framing: value.framing?.keyframes,
		speedPoints: value.speedPoints,
		freezes: value.freezes
	})) if (points?.some((point, index) => index > 0 && point.timeMs <= points[index - 1].timeMs)) context.addIssue({
		code: "custom",
		message: `${name} points must have unique, increasing times.`,
		path: [name]
	});
	const tracks = value.audioAutomation ?? [];
	if (new Set(tracks.map((track) => track.trackIndex)).size !== tracks.length) context.addIssue({
		code: "custom",
		message: "Use one automation lane per audio track.",
		path: ["audioAutomation"]
	});
	for (const track of tracks) if (track.points.some((point, index) => index > 0 && point.timeMs <= track.points[index - 1].timeMs)) context.addIssue({
		code: "custom",
		message: "Volume points must have unique, increasing times.",
		path: ["audioAutomation"]
	});
});
var videoTextSize = {
	small: .035,
	medium: .055,
	large: .08
};
function titleOverlay(text, width, height) {
	const lines = text.content.split("\n"), longest = Math.max(1, ...lines.map((line) => [...line].length));
	const size = Math.min(height * videoTextSize[text.size], width * .88 / (longest * .65), height * .7 / (Math.max(1, lines.length) * 1.2));
	const boxHeight = Math.max(.02, lines.length * size * 1.2 / height);
	return {
		id: "legacy",
		kind: "text",
		content: text.content,
		startMs: text.startMs,
		endMs: text.endMs,
		size: text.size,
		x: .06,
		y: text.position === "top" ? .08 : text.position === "center" ? .5 - boxHeight / 2 : .92 - boxHeight,
		width: .88,
		height: boxHeight
	};
}
function editedDurationMs(startMs, endMs, edits) {
	return Math.round(movingDurationMs(startMs, endMs, edits) + (edits?.freezes ?? []).filter((hold) => hold.timeMs >= startMs && hold.timeMs < endMs).reduce((sum, hold) => sum + hold.durationMs, 0));
}
function hasVideoEdits(edits) {
	return !!edits && ((edits.speed ?? 1) !== 1 || (edits.brightness ?? 0) !== 0 || (edits.contrast ?? 1) !== 1 || (edits.saturation ?? 1) !== 1 || !!edits.flipHorizontal || !!edits.text?.content || !!edits.framing || !!edits.overlays?.length || !!edits.speedPoints?.length || !!edits.freezes?.length || !!edits.audioAutomation?.length);
}
function speedAt(timeMs, edits) {
	const points = edits?.speedPoints ?? [];
	let previous = {
		timeMs: 0,
		speed: edits?.speed ?? 1,
		transition: "hold"
	};
	for (const point of points) {
		if (point.timeMs > timeMs) {
			if (previous.transition === "hold" || point.timeMs === previous.timeMs) return previous.speed;
			return previous.speed + (point.speed - previous.speed) * Math.max(0, (timeMs - previous.timeMs) / (point.timeMs - previous.timeMs));
		}
		previous = point;
	}
	return previous.speed;
}
function movingDurationMs(startMs, endMs, edits) {
	if (endMs <= startMs) return 0;
	const boundaries = [
		startMs,
		...(edits?.speedPoints ?? []).map((point) => point.timeMs).filter((t) => t > startMs && t < endMs),
		endMs
	];
	let duration = 0;
	for (let i = 1; i < boundaries.length; i++) {
		const a = boundaries[i - 1], b = boundaries[i];
		const first = speedAt(a, edits), last = speedAt(b - 1e-6, edits);
		duration += Math.abs(last - first) < 1e-6 ? (b - a) / first : (b - a) * Math.log(last / first) / (last - first);
	}
	return duration;
}
var canvasRatios = {
	"16:9": 16 / 9,
	"9:16": 9 / 16,
	"1:1": 1,
	"4:5": 4 / 5
};
function canvasDimensions(width, height, layout) {
	const ratio = canvasRatios[layout];
	return {
		width: Math.max(2, Math.floor((ratio ? height * ratio : width) / 2) * 2),
		height: Math.max(2, Math.floor(height / 2) * 2)
	};
}
//#endregion
//#region src/shared/montage-audio.ts
var montageAudioAssetSchema = z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(160),
	originalName: z.string().trim().min(1).max(260),
	durationMs: z.number().int().positive(),
	fileSize: z.number().int().nonnegative(),
	codec: z.string().trim().min(1).max(80).optional(),
	createdAt: z.number().int().nonnegative()
});
z.object({
	assetId: z.string().uuid(),
	samples: z.array(z.number().min(0).max(1)).max(512)
});
var montageMusicTrackSchema = z.object({
	id: z.string().uuid(),
	asset: montageAudioAssetSchema,
	timelineStartMs: z.number().int().nonnegative(),
	sourceStartMs: z.number().int().nonnegative(),
	sourceEndMs: z.number().int().positive(),
	volume: z.number().min(0).max(1).default(.18),
	muted: z.boolean().default(false),
	fadeInMs: z.number().int().min(0).max(3e4).default(1e3),
	fadeOutMs: z.number().int().min(0).max(3e4).default(1500),
	loop: z.boolean().default(true),
	automation: z.object({
		points: z.array(gainPointSchema).max(128),
		mutes: z.array(muteRangeSchema).max(64)
	}).optional(),
	ducking: z.object({
		enabled: z.boolean(),
		amount: z.number().min(0).max(1),
		attackMs: z.number().int().min(10).max(1e3),
		releaseMs: z.number().int().min(50).max(3e3)
	}).optional()
}).superRefine((track, context) => {
	if (track.automation?.points.some((point, index, points) => index > 0 && point.timeMs <= points[index - 1].timeMs)) context.addIssue({
		code: "custom",
		message: "Music volume points must have unique, increasing times."
	});
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
function normalizeMusicTrack(track, projectDurationMs) {
	const sourceStartMs = Math.max(0, Math.min(track.asset.durationMs - 100, Math.round(track.sourceStartMs)));
	const sourceEndMs = Math.max(sourceStartMs + 100, Math.min(track.asset.durationMs, Math.round(track.sourceEndMs)));
	const timelineStartMs = Math.max(0, Math.min(projectDurationMs - 1, Math.round(track.timelineStartMs)));
	const activeDurationMs = track.loop ? Math.max(0, projectDurationMs - timelineStartMs) : Math.min(sourceEndMs - sourceStartMs, Math.max(0, projectDurationMs - timelineStartMs));
	const maxFadeMs = Math.max(0, Math.floor(activeDurationMs / 2));
	return {
		...track,
		timelineStartMs,
		sourceStartMs,
		sourceEndMs,
		volume: Math.max(0, Math.min(1, track.volume)),
		fadeInMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeInMs))),
		fadeOutMs: Math.max(0, Math.min(maxFadeMs, Math.round(track.fadeOutMs)))
	};
}
z.enum([
	"devices",
	"audio",
	"capture",
	"modules",
	"settings"
]);
var engineKindSchema = z.enum(["audio", "capture"]);
var engineStateSchema = z.enum([
	"stopped",
	"starting",
	"running",
	"error"
]);
var engineProcessResourceSchema = z.object({
	pid: z.number().int().positive(),
	role: z.string().trim().min(1).max(32).regex(/^[a-z0-9-]+$/),
	privateMemoryMb: z.number().min(0),
	workingSetMb: z.number().min(0)
});
var engineStatusSchema = z.object({
	kind: engineKindSchema,
	state: engineStateSchema,
	pid: z.number().int().positive().optional(),
	cpuPercent: z.number().min(0),
	memoryMb: z.number().min(0),
	uptimeSeconds: z.number().min(0),
	message: z.string().optional(),
	updatedAt: z.string(),
	processes: z.array(engineProcessResourceSchema).max(8).optional()
});
var moduleKindSchema = z.enum([
	"device",
	"capture",
	"audio",
	"integration"
]);
var moduleSourceSchema = z.enum(["bundled", "local"]);
var moduleRuntimeStatusSchema = z.enum([
	"ready",
	"validating",
	"active",
	"invalid",
	"incompatible",
	"missing",
	"runtime-error"
]);
var moduleValidationIssueSchema = z.object({
	severity: z.enum([
		"error",
		"warning",
		"info"
	]),
	code: z.string().min(1),
	message: z.string().min(1),
	file: z.string().min(1).optional()
});
var moduleDevelopmentStateSchema = z.object({
	projectPath: z.string().min(1),
	sdkVersion: z.literal(1),
	status: moduleRuntimeStatusSchema,
	lastValidatedAt: z.string().nullable(),
	issues: z.array(moduleValidationIssueSchema).max(64)
});
var moduleManifestSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	version: z.string(),
	kind: moduleKindSchema,
	sizeMb: z.number().nonnegative(),
	installed: z.boolean(),
	enabled: z.boolean(),
	official: z.boolean(),
	restartRequired: z.boolean().default(false),
	capabilities: z.array(z.string()),
	vendors: z.array(z.string()).default([]),
	source: moduleSourceSchema.default("bundled"),
	author: z.string().trim().min(1).max(120).optional(),
	development: moduleDevelopmentStateSchema.optional()
});
var moduleIdentifierSchema = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, "Use a namespaced lowercase ID such as device.my-company.product.");
var moduleVersionSchema = z.string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version such as 0.1.0.");
var moduleHexIdentifierSchema = z.string().trim().regex(/^[0-9a-fA-F]{4}$/, "Use exactly four hexadecimal characters.");
var addonHidPermissionSchema = z.object({
	vendorId: moduleHexIdentifierSchema,
	productIds: z.array(moduleHexIdentifierSchema).min(1).max(32)
});
var addonProjectManifestSchema = z.object({
	schemaVersion: z.literal(1),
	id: moduleIdentifierSchema,
	name: z.string().trim().min(2).max(80),
	description: z.string().trim().min(12).max(240),
	author: z.string().trim().min(2).max(120),
	version: moduleVersionSchema,
	minimumCoreVersion: moduleVersionSchema,
	kind: moduleKindSchema,
	entrypoint: z.string().trim().min(1).max(200),
	capabilities: z.array(z.string().trim().min(1).max(64)).min(1).max(32),
	permissions: z.object({ hid: z.array(addonHidPermissionSchema).min(1).max(16).default([]) })
});
var moduleProjectIdInputSchema = z.object({ moduleId: moduleIdentifierSchema });
var deviceKindSchema = z.enum([
	"mouse",
	"microphone",
	"keyboard",
	"headset",
	"unknown"
]);
var createModuleProjectInputSchema = z.object({
	id: moduleIdentifierSchema,
	name: z.string().trim().min(2).max(80),
	description: z.string().trim().min(12).max(240),
	author: z.string().trim().min(2).max(120),
	manufacturer: z.string().trim().min(1).max(80),
	model: z.string().trim().min(1).max(120),
	deviceKind: deviceKindSchema,
	vendorId: moduleHexIdentifierSchema,
	productId: moduleHexIdentifierSchema
});
var deviceConnectionSchema = z.enum([
	"usb",
	"wireless",
	"bluetooth",
	"unknown"
]);
var deviceSettingValueSchema = z.union([
	z.string(),
	z.number(),
	z.boolean(),
	z.array(z.number()),
	z.array(z.string())
]);
var deviceIdentitySchema = z.object({
	manufacturer: z.string().min(1).optional(),
	productFamily: z.string().min(1).optional(),
	model: z.string().min(1).optional(),
	variant: z.string().min(1).optional(),
	colorway: z.string().min(1).optional(),
	connection: deviceConnectionSchema.optional(),
	connectionLabel: z.string().min(1).optional(),
	hardwareRevision: z.string().min(1).optional(),
	vendorId: z.number().int().min(0).max(65535).optional(),
	productId: z.number().int().min(0).max(65535).optional(),
	transportProductId: z.number().int().min(0).max(65535).optional(),
	interfaceProductIds: z.array(z.number().int().min(0).max(65535)).optional(),
	serialNumber: z.string().min(1).optional(),
	productString: z.string().min(1).optional()
});
var deviceVariantConfidenceSchema = z.enum([
	"hardware",
	"product-id",
	"module-metadata",
	"user-override",
	"fallback"
]);
var deviceVariantResolutionSchema = z.object({
	confidence: deviceVariantConfidenceSchema,
	source: z.string().min(1),
	evidence: z.string().min(1).optional()
});
var productAssetResolutionSchema = z.object({
	key: z.string().min(1),
	matchedBy: z.enum([
		"exact-variant",
		"exact-model",
		"manufacturer-default",
		"generic"
	]),
	source: z.enum(["bundled-official", "bundled-generic"])
});
var deviceAppearanceOverrideSchema = z.object({
	variant: z.string().trim().min(1),
	colorway: z.string().trim().min(1).optional()
});
var batteryCapabilitySchema = z.object({
	percentage: z.number().min(0).max(100),
	charging: z.boolean().optional(),
	fullyCharged: z.boolean().optional(),
	estimatedMinutesRemaining: z.number().int().nonnegative().optional(),
	updatedAt: z.number().int().nonnegative()
});
var mouseBatteryLightingPolicySchema = z.object({
	flashEnabled: z.boolean().default(true),
	warningPercentage: z.number().int().min(1).max(100).default(20),
	flashIntervalMinutes: z.number().int().min(1).max(60).default(5),
	cutoffEnabled: z.boolean().default(true),
	cutoffPercentage: z.number().int().min(1).max(100).default(10)
});
var defaultMouseBatteryLightingPolicy = mouseBatteryLightingPolicySchema.parse({});
var deviceProfileModeSchema = z.enum(["software", "onboard"]);
var dpiCapabilitySchema = z.object({
	writable: z.boolean(),
	min: z.number().int().positive(),
	max: z.number().int().positive(),
	step: z.number().int().positive(),
	stages: z.array(z.number().int().positive()).min(1),
	activeDpi: z.number().int().positive(),
	defaultDpi: z.number().int().positive(),
	shiftDpi: z.number().int().positive().optional(),
	shiftMode: z.enum(["device-profile", "host-button-spy"]).optional(),
	maxStages: z.number().int().positive().optional(),
	profileMode: deviceProfileModeSchema,
	unavailableReason: z.string().optional()
});
var reportRateCapabilitySchema = z.object({
	writable: z.boolean(),
	value: z.number().int().positive(),
	supportedRates: z.array(z.number().int().positive()).min(1),
	profileMode: deviceProfileModeSchema,
	unavailableReason: z.string().optional()
});
var mouseActionCategorySchema = z.enum(["mouse", "system"]);
var mouseActionSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	category: mouseActionCategorySchema,
	searchTerms: z.array(z.string()).default([]),
	selectable: z.boolean().optional()
});
var deviceHotspotSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	position: z.object({
		x: z.number().min(0).max(100),
		y: z.number().min(0).max(100)
	}),
	calloutSide: z.enum(["left", "right"]),
	order: z.number().int().nonnegative(),
	capability: z.literal("button-assignment")
});
var buttonAssignmentBindingSchema = z.object({
	buttonId: z.string().min(1),
	slotId: z.string().min(1),
	currentActionId: z.string().min(1),
	hotspot: deviceHotspotSchema
});
var buttonAssignmentsCapabilitySchema = z.object({
	writable: z.boolean(),
	profileMode: deviceProfileModeSchema,
	bindings: z.array(buttonAssignmentBindingSchema),
	availableActions: z.array(mouseActionSchema),
	unavailableReason: z.string().optional()
});
var lightingEffectSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	controls: z.array(z.enum([
		"color",
		"zones",
		"brightness",
		"speed",
		"direction"
	])).optional()
});
var lightingDirectionSchema = z.enum([
	"cycle",
	"left",
	"right",
	"up",
	"down",
	"in",
	"out",
	"center-in",
	"center-out"
]);
var lightingZoneSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	color: z.string().regex(/^#[0-9a-f]{6}$/i),
	colorWritable: z.boolean()
});
var lightingProfileSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	effectId: z.string().min(1),
	brightness: z.number().min(0).max(100),
	speed: z.number().min(1).max(100)
});
var lightingCapabilitySchema = z.object({
	statusLightingSupported: z.boolean().optional(),
	batteryStatus: z.enum([
		"monitoring",
		"warning",
		"cutoff",
		"charging",
		"disabled",
		"unavailable",
		"error"
	]).optional(),
	batteryStatusReason: z.string().optional(),
	batteryLightingEnabled: z.boolean().optional(),
	writable: z.boolean(),
	enabled: z.boolean(),
	activeEffectId: z.string().min(1),
	availableEffects: z.array(lightingEffectSchema).min(1),
	color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
	colorWritable: z.boolean().default(false),
	brightness: z.number().min(0).max(100).optional(),
	brightnessWritable: z.boolean().default(false),
	speed: z.number().min(1).max(100).optional(),
	speedWritable: z.boolean().default(false),
	direction: lightingDirectionSchema.optional(),
	availableDirections: z.array(lightingDirectionSchema).optional(),
	directionWritable: z.boolean().optional(),
	zones: z.array(lightingZoneSchema).optional(),
	profiles: z.array(lightingProfileSchema).default([]),
	activeProfileId: z.string().min(1).optional(),
	muteLinked: z.boolean().default(false),
	muteLinkedWritable: z.boolean().default(false),
	state: z.enum([
		"maintained",
		"acknowledged",
		"unknown"
	]).optional(),
	stateReason: z.string().optional(),
	physicalEffectVerified: z.boolean().default(false),
	profileMode: deviceProfileModeSchema,
	source: z.enum(["software", "firmware"]),
	unavailableReason: z.string().optional()
});
var keyboardFeatureStatusSchema = z.enum([
	"native",
	"synapse",
	"observed",
	"unsupported"
]);
var keyboardFeatureSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	summary: z.string().min(1),
	status: keyboardFeatureStatusSchema,
	unavailableReason: z.string().optional()
});
var keyboardToggleCapabilitySchema = z.object({
	enabled: z.boolean().nullable(),
	writable: z.boolean(),
	unavailableReason: z.string().optional()
});
var keyboardOnboardProfileSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1)
});
var keyboardOnboardProfilesCapabilitySchema = z.object({
	activeProfileId: z.string().min(1).nullable(),
	profiles: z.array(keyboardOnboardProfileSchema),
	writable: z.boolean(),
	unavailableReason: z.string().optional()
});
var keyboardDiagnosticReadSchema = z.object({
	id: z.string().min(1),
	ok: z.boolean(),
	error: z.string().optional()
});
var keyboardDiagnosticsSchema = z.object({
	protocol: z.string().min(1),
	endpoint: z.enum([
		"ready",
		"partial",
		"unavailable"
	]),
	lastSyncAt: z.string().optional(),
	lastControlError: z.string().optional(),
	reads: z.array(keyboardDiagnosticReadSchema)
});
var keyboardCapabilitySchema = z.object({
	firmwareVersion: z.string().min(1).optional(),
	pollingRateHz: z.number().int().positive().optional(),
	transport: z.enum(["native-hid", "unavailable"]),
	features: z.array(keyboardFeatureSchema),
	gamingMode: keyboardToggleCapabilitySchema.optional(),
	rapidTrigger: keyboardToggleCapabilitySchema.optional(),
	snapTap: keyboardToggleCapabilitySchema.optional(),
	onboardProfiles: keyboardOnboardProfilesCapabilitySchema.optional(),
	diagnostics: keyboardDiagnosticsSchema.optional()
});
var microphoneMuteStateCapabilitySchema = z.object({
	muted: z.boolean().nullable(),
	source: z.literal("hardware"),
	updatedAt: z.string().optional(),
	unavailableReason: z.string().optional()
});
var onboardMemoryCapabilitySchema = z.object({
	writable: z.boolean(),
	enabled: z.boolean(),
	activeProfile: z.string().min(1).optional()
});
var deviceCapabilitiesSchema = z.object({
	battery: batteryCapabilitySchema.optional(),
	dpi: dpiCapabilitySchema.optional(),
	reportRate: reportRateCapabilitySchema.optional(),
	buttonAssignments: buttonAssignmentsCapabilitySchema.optional(),
	lighting: lightingCapabilitySchema.optional(),
	onboardMemory: onboardMemoryCapabilitySchema.optional(),
	gain: z.boolean().optional(),
	monitoring: z.boolean().optional(),
	mute: z.boolean().optional(),
	muteState: microphoneMuteStateCapabilitySchema.optional(),
	keyboard: keyboardCapabilitySchema.optional()
});
var deviceSchema = z.object({
	id: z.string(),
	moduleId: z.string(),
	displayName: z.string(),
	kind: deviceKindSchema,
	connected: z.boolean(),
	identity: deviceIdentitySchema,
	variantResolution: deviceVariantResolutionSchema,
	asset: productAssetResolutionSchema,
	capabilities: deviceCapabilitiesSchema,
	settings: z.record(z.string(), deviceSettingValueSchema)
});
var audioBusIdSchema = z.enum([
	"game",
	"chat",
	"media",
	"mic",
	"aux"
]);
var audioDeviceDirectionSchema = z.enum(["output", "input"]);
var audioEndpointFormFactorSchema = z.enum([
	"remote-network-device",
	"speakers",
	"line-level",
	"headphones",
	"microphone",
	"headset",
	"handset",
	"spdif",
	"digital-display",
	"unknown"
]);
var audioDeviceSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	direction: audioDeviceDirectionSchema,
	isDefault: z.boolean(),
	available: z.boolean(),
	formFactor: audioEndpointFormFactorSchema.nullable().optional(),
	isVirtual: z.boolean().default(false),
	isSwitchboard: z.boolean().default(false)
});
var audioBusSchema = z.object({
	id: audioBusIdSchema,
	label: z.string(),
	enabled: z.boolean().default(true),
	appCount: z.number().int().min(0),
	meter: z.number().min(0).max(1),
	endpoint: z.string(),
	deviceId: z.string().default("")
});
var audioMasterSchema = z.object({
	gain: z.number().min(0).max(1.5),
	enabled: z.boolean()
});
var audioMixIdSchema = z.enum([
	"personal",
	"stream",
	"clip"
]);
var audioMixBusSchema = z.object({
	id: audioBusIdSchema,
	gain: z.number().min(0).max(1.5),
	enabled: z.boolean()
});
var audioMixSchema = z.object({
	id: audioMixIdSchema,
	label: z.string().min(1),
	master: audioMasterSchema,
	buses: z.array(audioMixBusSchema)
});
var audioMeterValueSchema = z.object({
	busId: audioBusIdSchema,
	level: z.number().min(0).max(1),
	peak: z.number().min(0).max(1),
	clipping: z.boolean()
});
var audioMeterFrameSchema = z.object({
	sequence: z.number().int().nonnegative(),
	timestamp: z.string(),
	values: z.array(audioMeterValueSchema)
});
var audioPathIdSchema = z.enum([
	"game",
	"chat",
	"media",
	"microphone"
]);
var audioSupportLevelSchema = z.enum([
	"available",
	"simulation",
	"unavailable"
]);
var audioCapabilitiesSchema = z.object({
	virtualChannels: audioSupportLevelSchema,
	applicationRouting: audioSupportLevelSchema,
	channelDsp: audioSupportLevelSchema,
	microphoneDsp: audioSupportLevelSchema,
	noiseSuppression: audioSupportLevelSchema.default("unavailable"),
	realtimeMetering: audioSupportLevelSchema,
	microphoneTest: audioSupportLevelSchema,
	monitoring: audioSupportLevelSchema,
	spatialAudio: audioSupportLevelSchema,
	reason: z.string().nullable().optional()
});
var noiseSuppressionDiagnosticsSchema = z.object({
	backend: z.string(),
	available: z.boolean(),
	modelIdentifier: z.string().nullable().default(null),
	modelHash: z.string().nullable().default(null),
	nativeLibraryHash: z.string().nullable().default(null),
	state: z.enum([
		"not-loaded",
		"ready",
		"bypassed"
	]),
	modelInitializationMs: z.number().nonnegative(),
	inputSampleRate: z.number().int().nonnegative(),
	processingSampleRate: z.literal(48e3),
	frameLength: z.number().int().nonnegative(),
	algorithmicLatencyMs: z.number().nonnegative(),
	attenuationLimitDb: z.number().nonnegative(),
	localSnrDb: z.number().nullable().default(null),
	p50Ms: z.number().nonnegative(),
	p95Ms: z.number().nonnegative(),
	p99Ms: z.number().nonnegative(),
	maximumMs: z.number().nonnegative(),
	captureCallbackP99Ms: z.number().nonnegative(),
	captureOverruns: z.number().int().nonnegative(),
	monitorOverruns: z.number().int().nonnegative().default(0),
	monitorUnderruns: z.number().int().nonnegative(),
	droppedOrBypassedFrames: z.number().int().nonnegative(),
	recoveryCount: z.number().int().nonnegative(),
	lastError: z.string().nullable().default(null)
});
var virtualDriverStateSchema = z.object({
	state: z.enum([
		"ready",
		"not-installed",
		"incomplete"
	]),
	interfaceName: z.string(),
	missingEndpoints: z.array(z.string()),
	endpoints: z.array(z.object({
		id: z.string(),
		name: z.string(),
		flow: z.enum(["render", "capture"])
	})),
	message: z.string()
});
var audioApplicationSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	executableName: z.string().min(1),
	processId: z.number().int().positive(),
	iconDataUrl: z.string().startsWith("data:image/").optional(),
	destination: z.enum([
		"game",
		"chat",
		"media"
	]),
	currentDestination: z.enum([
		"game",
		"chat",
		"media"
	]),
	preferredDestination: z.enum([
		"game",
		"chat",
		"media"
	]).nullable(),
	routingState: z.enum([
		"unmanaged",
		"applied",
		"pending-restart"
	]),
	active: z.boolean()
});
var micProcessorIdSchema = z.enum([
	"gain",
	"noise-gate",
	"noise-suppression",
	"equalizer",
	"compressor",
	"limiter"
]);
var configuredMicProcessorSchema = z.object({
	id: micProcessorIdSchema,
	enabled: z.boolean(),
	parameters: z.record(z.string(), z.unknown())
});
var microphoneMonitoringRuntimeSchema = z.object({
	requested: z.boolean(),
	active: z.boolean(),
	level: z.number().min(0).max(1),
	requestedDeviceId: z.string().nullable().default(null),
	activeDeviceId: z.string().nullable().default(null)
});
var microphoneRuntimeSchema = z.object({
	configurationVersion: z.number().int().nonnegative(),
	requestedInputDeviceId: z.string().nullable().default(null),
	activeInputDeviceId: z.string().nullable().default(null),
	inputFormat: z.string().nullable().default(null),
	processors: z.array(configuredMicProcessorSchema),
	monitoring: microphoneMonitoringRuntimeSchema,
	error: z.string().nullable().default(null)
});
var audioHostSnapshotSchema = z.object({
	capabilities: audioCapabilitiesSchema,
	noiseSuppression: noiseSuppressionDiagnosticsSchema,
	inputDeviceId: z.string().nullable().default(null),
	inputFormat: z.string().nullable().default(null),
	monitoringDeviceId: z.string().nullable().default(null),
	running: z.boolean(),
	error: z.string().nullable().default(null),
	driver: virtualDriverStateSchema,
	applications: z.array(audioApplicationSchema),
	buses: z.array(z.object({
		id: audioBusIdSchema,
		applicationCount: z.number().int().nonnegative()
	})),
	mixes: z.array(audioMixSchema),
	microphone: microphoneRuntimeSchema.nullable().default(null)
});
var eqFilterTypeSchema = z.enum([
	"low-shelf",
	"bell",
	"high-shelf"
]);
var eqBandSchema = z.object({
	id: z.string().min(1),
	enabled: z.boolean(),
	type: eqFilterTypeSchema,
	frequency: z.number().min(20).max(2e4),
	gainDb: z.number().min(-12).max(12),
	q: z.number().min(.2).max(10)
});
var processorBaseSchema = {
	label: z.string(),
	enabled: z.boolean(),
	cost: z.enum([
		"none",
		"low",
		"medium"
	])
};
var micProcessorSchema = z.discriminatedUnion("id", [
	z.object({
		...processorBaseSchema,
		id: z.literal("gain"),
		parameters: z.object({ gainDb: z.number().min(-20).max(30) }).default({ gainDb: 0 })
	}),
	z.object({
		...processorBaseSchema,
		id: z.literal("noise-gate"),
		parameters: z.object({
			thresholdDb: z.number().min(-80).max(-10),
			attackMs: z.number().min(.1).max(100),
			releaseMs: z.number().min(10).max(1e3)
		}).default({
			thresholdDb: -48,
			attackMs: 10,
			releaseMs: 180
		})
	}),
	z.object({
		...processorBaseSchema,
		id: z.literal("noise-suppression"),
		parameters: z.object({ amount: z.number().min(0).max(100) }).default({ amount: 55 })
	}),
	z.object({
		...processorBaseSchema,
		id: z.literal("equalizer"),
		parameters: z.object({ bands: z.array(eqBandSchema).min(1).max(8) }).default({ bands: [
			{
				id: "low",
				enabled: true,
				type: "low-shelf",
				frequency: 90,
				gainDb: 0,
				q: .7
			},
			{
				id: "body",
				enabled: true,
				type: "bell",
				frequency: 250,
				gainDb: -1.5,
				q: 1
			},
			{
				id: "clarity",
				enabled: true,
				type: "bell",
				frequency: 2800,
				gainDb: 2,
				q: 1.2
			},
			{
				id: "air",
				enabled: true,
				type: "high-shelf",
				frequency: 9e3,
				gainDb: 1,
				q: .7
			}
		] })
	}),
	z.object({
		...processorBaseSchema,
		id: z.literal("compressor"),
		parameters: z.object({
			thresholdDb: z.number().min(-60).max(0),
			ratio: z.number().min(1).max(20),
			attackMs: z.number().min(.1).max(200),
			releaseMs: z.number().min(10).max(2e3),
			makeupDb: z.number().min(0).max(18)
		}).default({
			thresholdDb: -18,
			ratio: 4,
			attackMs: 12,
			releaseMs: 180,
			makeupDb: 2
		})
	}),
	z.object({
		...processorBaseSchema,
		id: z.literal("limiter"),
		parameters: z.object({
			thresholdDb: z.number().min(-18).max(0),
			releaseMs: z.number().min(10).max(1e3)
		}).default({
			thresholdDb: -1,
			releaseMs: 90
		})
	})
]);
var channelAudioBusIdSchema = z.enum([
	"game",
	"chat",
	"media"
]);
var channelProcessingSchema = z.object({
	busId: channelAudioBusIdSchema,
	equalizer: z.object({
		enabled: z.boolean(),
		bands: z.array(eqBandSchema).min(1).max(8)
	}),
	normalization: z.object({
		enabled: z.boolean(),
		targetLufs: z.number().min(-30).max(-10),
		maxGainDb: z.number().min(0).max(18)
	}),
	compressor: z.object({
		enabled: z.boolean(),
		thresholdDb: z.number().min(-60).max(0),
		ratio: z.number().min(1).max(20),
		attackMs: z.number().min(.1).max(200),
		releaseMs: z.number().min(10).max(2e3),
		makeupDb: z.number().min(0).max(18)
	}),
	limiter: z.object({
		enabled: z.boolean(),
		thresholdDb: z.number().min(-18).max(0),
		releaseMs: z.number().min(10).max(1e3)
	})
});
var audioPresetBaseSchema = {
	id: z.string().min(1),
	name: z.string().trim().min(1).max(64),
	builtIn: z.boolean(),
	schemaVersion: z.literal(1)
};
function channelPresetSchema(kind) {
	return z.object({
		...audioPresetBaseSchema,
		kind: z.literal(kind),
		processors: channelProcessingSchema.omit({ busId: true })
	});
}
var audioPathPresetSchema = z.discriminatedUnion("kind", [
	channelPresetSchema("game"),
	channelPresetSchema("chat"),
	channelPresetSchema("media"),
	z.object({
		...audioPresetBaseSchema,
		kind: z.literal("microphone"),
		processors: z.array(micProcessorSchema),
		monitoring: z.object({
			enabled: z.boolean(),
			level: z.number().min(0).max(1),
			deviceId: z.string()
		})
	})
]);
var audioPresetFileSchema = z.object({
	schemaVersion: z.literal(1),
	preset: audioPathPresetSchema
});
var audioStateSchema = z.object({
	enabled: z.boolean(),
	outputDevice: z.string(),
	microphoneDevice: z.string(),
	sampleRate: z.literal(48e3),
	mixes: z.array(audioMixSchema),
	chatMix: z.number().min(-1).max(1),
	monitoring: z.number().min(0).max(1),
	monitoringEnabled: z.boolean().default(false),
	monitoringDeviceId: z.string().default(""),
	buses: z.array(audioBusSchema),
	micProcessors: z.array(micProcessorSchema),
	channelProcessing: z.array(channelProcessingSchema).default([]),
	devices: z.array(audioDeviceSchema).default([]),
	applications: z.array(audioApplicationSchema).default([]),
	capabilities: audioCapabilitiesSchema.default({
		virtualChannels: "unavailable",
		applicationRouting: "unavailable",
		channelDsp: "unavailable",
		microphoneDsp: "unavailable",
		noiseSuppression: "unavailable",
		realtimeMetering: "unavailable",
		microphoneTest: "unavailable",
		monitoring: "unavailable",
		spatialAudio: "unavailable"
	}),
	host: audioHostSnapshotSchema.nullable().default(null),
	pathPresets: z.array(audioPathPresetSchema).default([]),
	activePresetIds: z.object({
		game: z.string().nullable(),
		chat: z.string().nullable(),
		media: z.string().nullable(),
		microphone: z.string().nullable()
	}).default({
		game: null,
		chat: null,
		media: null,
		microphone: null
	})
});
var captureSourceTypeSchema = z.enum([
	"automatic-game",
	"window",
	"display"
]);
var captureSourceSchema = z.object({
	id: z.string().min(1),
	type: captureSourceTypeSchema,
	name: z.string().min(1),
	processId: z.number().int().positive().optional(),
	windowHandle: z.string().optional(),
	displayId: z.string().optional(),
	available: z.boolean()
});
var captureResolutionSchema = z.enum([
	"720p",
	"1080p",
	"1440p",
	"2160p",
	"native"
]);
var captureCodecSchema = z.enum([
	"h264",
	"hevc",
	"av1"
]);
var captureEncoderPreferenceSchema = z.enum([
	"auto",
	"nvenc",
	"amf",
	"qsv",
	"software"
]);
var clipTrackLevelSchema = z.number().int().min(0).max(100);
var defaultClipTrackLevelsSchema = z.object({
	game: clipTrackLevelSchema,
	chat: clipTrackLevelSchema,
	microphone: clipTrackLevelSchema,
	media: clipTrackLevelSchema
});
var captureConfigSchema = z.object({
	enabled: z.boolean(),
	source: captureSourceTypeSchema,
	sourceId: z.string().min(1).nullable(),
	displayIndex: z.number().int().min(0),
	fps: z.union([
		z.literal(30),
		z.literal(60),
		z.literal(120)
	]),
	resolution: captureResolutionSchema,
	codec: z.union([z.literal("auto"), captureCodecSchema]),
	encoder: captureEncoderPreferenceSchema,
	quality: z.number().int().min(1).max(5),
	replaySeconds: z.number().int().min(15).max(300),
	includeMic: z.boolean(),
	includeSystemAudio: z.boolean(),
	systemAudioMode: z.enum(["system", "game"]).default("system"),
	includeChatAudio: z.boolean().default(false),
	includeCursor: z.boolean(),
	microphoneDeviceId: z.string().min(1).max(512).nullable().default(null),
	systemAudioDeviceId: z.string().min(1).max(512).nullable().default(null),
	chatAudioDeviceId: z.string().min(1).max(512).nullable().default(null),
	hotkey: z.string().min(1).max(128),
	clipsDirectory: z.string().max(4096).nullable(),
	defaultTrackLevels: defaultClipTrackLevelsSchema.default({
		game: 100,
		chat: 100,
		microphone: 100,
		media: 100
	})
});
var setCaptureConfigInputSchema = captureConfigSchema.omit({ clipsDirectory: true }).partial().extend({
	systemAudioMode: captureConfigSchema.shape.systemAudioMode.unwrap().optional(),
	includeChatAudio: captureConfigSchema.shape.includeChatAudio.unwrap().optional(),
	microphoneDeviceId: captureConfigSchema.shape.microphoneDeviceId.unwrap().optional(),
	systemAudioDeviceId: captureConfigSchema.shape.systemAudioDeviceId.unwrap().optional(),
	chatAudioDeviceId: captureConfigSchema.shape.chatAudioDeviceId.unwrap().optional(),
	defaultTrackLevels: defaultClipTrackLevelsSchema.partial().optional()
});
var replayStateSchema = z.enum([
	"stopped",
	"starting",
	"waiting",
	"buffering",
	"saving",
	"recovering",
	"error"
]);
var reactionDetectionRuntimeSchema = z.object({
	state: z.enum([
		"disabled",
		"waiting",
		"calibrating",
		"listening",
		"cooldown",
		"unavailable",
		"error"
	]),
	inputLevelDb: z.number().min(-120).max(0),
	noiseFloorDb: z.number().min(-120).max(0),
	triggerThresholdDb: z.number().min(-120).max(0),
	reactionsDetected: z.number().int().nonnegative(),
	analyzedFrames: z.number().int().nonnegative(),
	analysisAverageMs: z.number().nonnegative(),
	cooldownRemainingSeconds: z.number().int().nonnegative(),
	lastReactionAt: z.number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
	message: z.string().trim().min(1).max(240).nullable().optional().transform((value) => value ?? null)
});
var captureStorageSchema = z.object({
	clipsDirectory: z.string(),
	cacheDirectory: z.string(),
	availableBytes: z.number().nonnegative(),
	volumeTotalBytes: z.number().nonnegative(),
	volumeAvailableBytes: z.number().nonnegative(),
	clipsBytes: z.number().nonnegative(),
	replayCacheBytes: z.number().nonnegative(),
	lowSpace: z.boolean(),
	criticalSpace: z.boolean(),
	warning: z.string().optional()
});
var captureCapabilitiesSchema = z.object({
	backend: z.enum([
		"windows-graphics-capture",
		"desktop-duplication",
		"unavailable"
	]),
	encoders: z.array(z.string()),
	codecs: z.array(captureCodecSchema),
	maximumFps: z.union([
		z.literal(30),
		z.literal(60),
		z.literal(120)
	]),
	systemAudio: z.boolean(),
	microphoneAudio: z.boolean(),
	exclusiveFullscreen: z.literal(false)
});
var captureRuntimeSchema = z.object({
	state: replayStateSchema,
	bufferedSeconds: z.number().min(0),
	segmentCount: z.number().int().min(0),
	replayCacheBytes: z.number().min(0),
	observedBitrateBps: z.number().min(0),
	encoderLabel: z.string(),
	backendLabel: z.string(),
	droppedFrames: z.number().int().min(0),
	encodedFrames: z.number().int().min(0),
	audioSyncCorrections: z.number().int().min(0),
	activeSource: captureSourceSchema.nullish().transform((source) => source ?? null),
	saveQueueDepth: z.number().int().min(0),
	shortcutRegistered: z.boolean(),
	reactionClipping: reactionDetectionRuntimeSchema,
	warning: z.string().optional(),
	error: z.string().optional(),
	lastSavedAt: z.string().optional()
});
var captureHostSnapshotSchema = z.object({
	runtime: captureRuntimeSchema,
	storage: captureStorageSchema,
	capabilities: captureCapabilitiesSchema,
	sources: z.array(captureSourceSchema)
});
var gameEventTypeSchema = z.enum([
	"kill",
	"headshot",
	"multi_kill",
	"assist",
	"knockdown",
	"death",
	"round_win",
	"round_loss",
	"match_win",
	"match_loss",
	"objective",
	"achievement",
	"highlight",
	"custom"
]);
var gameEventSourceSchema = z.enum([
	"telemetry",
	"api",
	"websocket",
	"log",
	"vision",
	"ocr",
	"manual",
	"microphone",
	"test"
]);
var gameEventMetadataSchema = z.object({
	weapon: z.string().trim().min(1).max(64).optional(),
	headshot: z.boolean().optional(),
	count: z.number().int().min(2).max(20).optional(),
	derived: z.boolean().optional(),
	roundNumber: z.number().int().min(0).max(200).optional(),
	team: z.enum([
		"CT",
		"T",
		"ally",
		"enemy"
	]).optional(),
	scoreFor: z.number().int().min(0).max(999).optional(),
	scoreAgainst: z.number().int().min(0).max(999).optional(),
	objective: z.enum([
		"planted",
		"defused",
		"exploded",
		"captured",
		"completed",
		"custom"
	]).optional(),
	code: z.string().trim().min(1).max(64).optional(),
	sequence: z.number().int().nonnegative().optional()
}).strict();
z.object({
	id: z.string().min(1).max(160),
	gameId: z.string().min(1).max(96),
	providerId: z.string().min(1).max(96),
	type: gameEventTypeSchema,
	timestamp: z.number().int().nonnegative(),
	confidence: z.number().min(0).max(1).optional(),
	label: z.string().trim().min(1).max(80).optional(),
	metadata: gameEventMetadataSchema.optional(),
	source: gameEventSourceSchema
});
var providerSupportLevelSchema = z.enum([
	"supported",
	"experimental",
	"unavailable"
]);
var providerAvailabilitySchema = z.object({
	state: z.enum([
		"available",
		"setup-required",
		"unavailable"
	]),
	reason: z.string().trim().min(1).max(240).optional()
});
var providerStatusSchema = z.object({
	state: z.enum([
		"stopped",
		"starting",
		"listening",
		"degraded",
		"error"
	]),
	message: z.string().trim().min(1).max(240).optional(),
	lastEventAt: z.number().int().nonnegative().optional()
});
var autoCaptureProviderSchema = z.object({
	id: z.string().min(1).max(96),
	gameId: z.string().min(1).max(96),
	displayName: z.string().trim().min(1).max(120),
	supportLevel: providerSupportLevelSchema,
	source: gameEventSourceSchema,
	capabilities: z.object({
		events: z.array(gameEventTypeSchema).max(gameEventTypeSchema.options.length),
		nativeMultiKill: z.boolean()
	}),
	availability: providerAvailabilitySchema,
	status: providerStatusSchema,
	requiresPlayerName: z.boolean().default(false),
	supportsAnonymousName: z.boolean().optional(),
	developmentOnly: z.boolean().default(false)
});
var autoCaptureGameSettingsSchema = z.object({
	enabled: z.boolean().default(true),
	useGlobalTiming: z.boolean().default(true),
	preRollSeconds: z.number().int().min(5).max(120).optional(),
	postRollSeconds: z.number().int().min(0).max(60).optional(),
	playerName: z.string().trim().min(1).max(64).optional(),
	playerNameMode: z.enum(["nickname", "anonymous"]).optional(),
	playerSquadronTag: z.string().trim().min(1).max(64).optional(),
	events: z.partialRecord(gameEventTypeSchema, z.boolean()).default({})
});
var reactionClippingSettingsSchema = z.object({
	enabled: z.boolean(),
	sensitivity: z.enum([
		"low",
		"balanced",
		"high"
	]),
	preRollSeconds: z.number().int().min(5).max(60),
	postRollSeconds: z.number().int().min(0).max(30),
	cooldownSeconds: z.number().int().min(5).max(120)
});
var autoCaptureSettingsSchema = z.object({
	enabled: z.boolean(),
	preRollSeconds: z.number().int().min(5).max(120),
	postRollSeconds: z.number().int().min(0).max(60),
	mergeNearbyEvents: z.boolean(),
	mergeThresholdSeconds: z.number().int().min(0).max(60),
	notifyWhenSaved: z.boolean(),
	reactionClipping: reactionClippingSettingsSchema,
	games: z.record(z.string().min(1).max(96), autoCaptureGameSettingsSchema),
	dismissedAvailability: z.record(z.string().min(1).max(96), z.boolean())
});
var autoCaptureSettingsPatchSchema = z.object({
	enabled: z.boolean().optional(),
	preRollSeconds: z.number().int().min(5).max(120).optional(),
	postRollSeconds: z.number().int().min(0).max(60).optional(),
	mergeNearbyEvents: z.boolean().optional(),
	mergeThresholdSeconds: z.number().int().min(0).max(60).optional(),
	notifyWhenSaved: z.boolean().optional(),
	reactionClipping: reactionClippingSettingsSchema.partial().optional(),
	games: z.record(z.string().min(1).max(96), autoCaptureGameSettingsSchema.partial()).optional(),
	dismissedAvailability: z.record(z.string().min(1).max(96), z.boolean()).optional()
}).strict();
var autoCaptureProviderIdSchema = z.string().min(1).max(96);
var autoCaptureTestEventInputSchema = z.object({ type: z.enum([
	"kill",
	"headshot",
	"multi_kill",
	"death",
	"round_win",
	"match_win"
]) }).strict();
var autoCaptureRuntimeSchema = z.object({
	state: z.enum([
		"disabled",
		"idle",
		"listening",
		"pending",
		"saving",
		"degraded"
	]),
	activeGameId: z.string().max(96).nullable(),
	activeProviderId: z.string().max(96).nullable(),
	pendingCapture: z.object({
		startedAt: z.number().int().nonnegative(),
		endsAt: z.number().int().nonnegative(),
		eventCount: z.number().int().positive().max(128)
	}).nullable(),
	eventsReceived: z.number().int().nonnegative(),
	eventsDeduplicated: z.number().int().nonnegative(),
	eventsIgnored: z.number().int().nonnegative(),
	clipsCreated: z.number().int().nonnegative(),
	lastEvent: z.object({
		type: gameEventTypeSchema,
		at: z.number().int().nonnegative(),
		label: z.string().trim().min(1).max(80).optional()
	}).nullable(),
	lastError: z.string().trim().min(1).max(320).nullable()
});
var autoCaptureStateSchema = z.object({
	settings: autoCaptureSettingsSchema,
	providers: z.array(autoCaptureProviderSchema).max(32),
	runtime: autoCaptureRuntimeSchema
});
var clipAudioChannelSchema = z.enum([
	"game",
	"chat",
	"microphone",
	"media"
]);
var clipCanvasSizeSchema = z.enum([
	"original",
	"16:9",
	"9:16",
	"1:1",
	"4:5"
]);
var clipAudioWaveformTrackSchema = z.object({
	trackIndex: z.number().int().min(0).max(7),
	label: z.string().trim().min(1).max(80),
	channel: clipAudioChannelSchema.optional(),
	samples: z.array(z.number().min(0).max(1)).max(256)
});
z.object({
	clipId: z.string().min(1),
	tracks: z.array(clipAudioWaveformTrackSchema).max(8)
});
var clipAudioTrackTrimSchema = z.object({
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().positive()
}).refine((trim) => trim.endMs > trim.startMs, {
	message: "The audio track trim end must be after its start.",
	path: ["endMs"]
});
var clipAudioTrackTrimsSchema = z.array(clipAudioTrackTrimSchema.nullable()).max(8);
var clipEventMarkerSchema = z.object({
	id: z.string().min(1).max(160),
	type: gameEventTypeSchema,
	timestampMs: z.number().int().nonnegative(),
	label: z.string().trim().min(1).max(80).optional(),
	metadata: gameEventMetadataSchema.optional()
});
var clipAutoCaptureMetadataSchema = z.object({
	autoCaptured: z.literal(true),
	providerId: z.string().min(1).max(96),
	gameId: z.string().min(1).max(96),
	events: z.array(clipEventMarkerSchema).min(1).max(128)
});
var clipSchema = z.object({
	id: z.string().min(1),
	path: z.string().min(1),
	name: z.string().min(1),
	game: z.string().optional(),
	createdAt: z.number().int().nonnegative(),
	durationMs: z.number().int().nonnegative(),
	fileSize: z.number().int().nonnegative(),
	width: z.number().int().nonnegative(),
	height: z.number().int().nonnegative(),
	fps: z.number().nonnegative(),
	codec: z.string().optional(),
	thumbnailPath: z.string().optional(),
	favorite: z.boolean().default(false),
	titleEdited: z.boolean().default(false),
	music: montageMusicTrackSchema.optional(),
	videoEdits: videoEditsSchema.optional(),
	trimStartMs: z.number().int().nonnegative().optional(),
	trimEndMs: z.number().int().positive().optional(),
	canvasSize: clipCanvasSizeSchema.default("original"),
	audioChannels: z.array(clipAudioChannelSchema).max(4).optional(),
	audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
	autoCapture: clipAutoCaptureMetadataSchema.optional()
});
var clipReviewStateSchema = z.object({ reviewedThrough: z.number().int().nonnegative() });
var developerDiagnosticInputSchema = z.object({
	level: z.enum([
		"debug",
		"info",
		"warning",
		"error"
	]),
	event: z.string().min(1).max(96).regex(/^[a-zA-Z0-9_.:-]+$/),
	data: z.record(z.string().max(64), z.union([
		z.string().max(4096),
		z.number().finite(),
		z.boolean(),
		z.null()
	])).refine((data) => Object.keys(data).length <= 24, "Too many diagnostic fields")
});
var nativeDiagnosticsInputSchema = z.object({ enabled: z.boolean() });
var debugDiagnosticsSchema = z.object({
	startedAt: z.string(),
	sampledAt: z.string(),
	eventLoopUtilizationPercent: z.number().finite().min(0).max(100).nullable(),
	eventLoopDelayP99Ms: z.number().finite().nonnegative().nullable(),
	eventLoopDelayMaxMs: z.number().finite().nonnegative().nullable(),
	operations: z.array(z.object({
		name: z.string().max(96),
		calls: z.number().int().nonnegative(),
		failures: z.number().int().nonnegative(),
		inFlight: z.number().int().nonnegative(),
		totalMs: z.number().finite().nonnegative(),
		maxMs: z.number().finite().nonnegative()
	})).max(128),
	processes: z.array(z.object({
		pid: z.number().int(),
		role: z.string(),
		privateMb: z.number().nonnegative(),
		workingSetMb: z.number().nonnegative(),
		cpuPercent: z.number().nonnegative().nullable()
	}))
});
var performanceSnapshotSchema = z.object({
	debug: debugDiagnosticsSchema.optional(),
	coreMemoryMb: z.number().min(0),
	rendererMemoryMb: z.number().min(0),
	totalMemoryMb: z.number().min(0),
	residentMemoryMb: z.number().min(0).default(0),
	totalCpuPercent: z.number().min(0),
	activeProcesses: z.number().int().min(1),
	budgetMemoryMb: z.number().min(1),
	budgetCpuPercent: z.number().min(0),
	sampledAt: z.string().nullable().default(null),
	guardState: z.enum([
		"disabled",
		"collecting",
		"within-budget",
		"over-budget"
	]).default("collecting"),
	warning: z.string().nullable().default(null)
});
var detectedGameSourceSchema = z.enum([
	"steam",
	"epic",
	"manual"
]);
var detectedGameSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1).max(160),
	source: detectedGameSourceSchema,
	installDirectory: z.string().min(1),
	executablePath: z.string().min(1).nullable(),
	launchUri: z.string().min(1).nullable(),
	iconDataUrl: z.string().startsWith("data:image/").max(262144).optional(),
	addedAt: z.string()
});
var gameDetectionStateSchema = z.object({
	capability: z.enum(["available", "simulation"]),
	scanState: z.enum([
		"idle",
		"scanning",
		"error"
	]),
	games: z.array(detectedGameSchema),
	lastScanAt: z.string().nullable(),
	warning: z.string().optional(),
	error: z.string().optional()
});
var visibleWorkspaceSchema = z.enum([
	"devices",
	"audio",
	"capture"
]);
var appSettingsSchema = z.object({
	uiScalePercent: z.union([
		z.literal(90),
		z.literal(100),
		z.literal(110),
		z.literal(125),
		z.literal(150)
	]),
	launchAtStartup: z.boolean(),
	closeToTray: z.boolean(),
	destroyRendererInTray: z.boolean(),
	softwareRendering: z.boolean().default(false),
	automaticAppUpdates: z.boolean(),
	automaticAppUpdateDownloads: z.boolean(),
	installAppUpdatesOnNextStartup: z.boolean(),
	installAppUpdatesWhenIdle: z.boolean(),
	automaticModuleUpdates: z.boolean(),
	performanceGuard: z.boolean(),
	detailedDiagnostics: z.boolean().default(false),
	diagnosticsRetentionDays: z.number().int().min(1).max(30),
	telemetry: z.literal(false),
	scanGamesAutomatically: z.boolean(),
	clipEditorInspectorOpen: z.boolean(),
	deviceAppearanceOverrides: z.record(z.string(), deviceAppearanceOverrideSchema).default({}),
	mouseBatteryLighting: z.record(z.string(), mouseBatteryLightingPolicySchema).default({}),
	developerMode: z.boolean().default(false),
	visibleWorkspaces: z.array(visibleWorkspaceSchema).default([
		"devices",
		"audio",
		"capture"
	]),
	onboardingCompleted: z.boolean().default(false)
});
var appUpdateStateSchema = z.object({
	capability: z.enum(["available", "unavailable"]),
	status: z.enum([
		"idle",
		"checking",
		"available",
		"downloading",
		"downloaded",
		"installing",
		"error",
		"unavailable"
	]),
	currentVersion: z.string().min(1),
	availableVersion: z.string().min(1).nullable(),
	downloadProgress: z.number().min(0).max(100).nullable(),
	checkedAt: z.string().nullable(),
	error: z.string().nullable(),
	unavailableReason: z.string().nullable()
});
var diagnosticCheckSchema = z.object({
	id: z.string().min(1).max(100),
	label: z.string().min(1).max(160),
	status: z.enum([
		"running",
		"pass",
		"warning",
		"fail",
		"skipped"
	]),
	detail: z.string().max(8192),
	durationMs: z.number().finite().nonnegative().optional()
});
var diagnosticRunSchema = z.object({
	id: z.string().nullable(),
	status: z.enum([
		"idle",
		"running",
		"completed",
		"cancelled",
		"error"
	]),
	startedAt: z.string().nullable(),
	completedAt: z.string().nullable(),
	summary: z.string().max(2048),
	checks: z.array(diagnosticCheckSchema).max(64)
});
var idleDiagnosticRun = {
	id: null,
	status: "idle",
	startedAt: null,
	completedAt: null,
	summary: "",
	checks: []
};
var sceneDeviceSettingsSchema = z.object({
	deviceId: z.string().min(1).max(256),
	name: z.string().max(160),
	dpi: z.number().int().positive().optional(),
	reportRate: z.number().int().positive().optional(),
	lighting: z.object({
		enabled: z.boolean(),
		effectId: z.string().optional(),
		color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
		brightness: z.number().min(0).max(100).optional(),
		speed: z.number().min(1).max(100).optional(),
		zones: z.array(z.object({
			id: z.string(),
			color: z.string().regex(/^#[0-9a-f]{6}$/i)
		})).max(256).default([])
	}).optional()
});
var sceneAudioSchema = audioStateSchema.pick({
	enabled: true,
	outputDevice: true,
	microphoneDevice: true,
	mixes: true,
	chatMix: true,
	monitoring: true,
	monitoringEnabled: true,
	monitoringDeviceId: true,
	micProcessors: true,
	channelProcessing: true
}).extend({ buses: z.array(audioBusSchema.pick({
	id: true,
	enabled: true,
	deviceId: true
})) });
var sceneValuesSchema = z.object({
	audio: sceneAudioSchema.nullable(),
	capture: captureConfigSchema.omit({
		hotkey: true,
		clipsDirectory: true
	}).nullable(),
	devices: z.array(sceneDeviceSettingsSchema).max(32)
});
var setupSceneSchema = z.object({
	id: z.string().min(1).max(100),
	name: z.string().trim().min(1).max(64),
	executable: z.string().trim().max(120).regex(/^(?:[^\\/:*?"<>|]+\.exe)?$/i).default(""),
	automatic: z.boolean().default(false),
	restoreOnExit: z.boolean().default(true),
	values: sceneValuesSchema
});
var saveSceneInputSchema = setupSceneSchema.omit({
	id: true,
	values: true
}).extend({
	id: z.string().min(1).max(100).optional(),
	captureCurrent: z.boolean(),
	includeAudio: z.boolean(),
	includeCapture: z.boolean(),
	includeDevices: z.boolean()
});
var setupPreferencesSchema = z.object({
	quickControlsEnabled: z.boolean().default(false),
	quickShortcut: z.enum([
		"Control+Alt+Space",
		"Control+Shift+Space",
		"Alt+Space"
	]).default("Control+Alt+Space"),
	quickActions: z.array(z.enum([
		"scenes",
		"replay",
		"microphone",
		"output",
		"chatmix"
	])).max(5).default([
		"scenes",
		"replay",
		"microphone",
		"output",
		"chatmix"
	]),
	lighting: z.object({
		enabled: z.boolean().default(false),
		deviceIds: z.array(z.string().min(1).max(256)).max(32).default([]),
		clipSaved: z.boolean().default(true),
		microphoneMuted: z.boolean().default(true),
		captureError: z.boolean().default(true)
	}).default({
		enabled: false,
		deviceIds: [],
		clipSaved: true,
		microphoneMuted: true,
		captureError: true
	})
});
var quickActionInputSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("microphone"),
		muted: z.boolean()
	}),
	z.object({
		type: z.literal("output"),
		deviceId: z.string().min(1).max(512)
	}),
	z.object({
		type: z.literal("chatmix"),
		value: z.number().min(-1).max(1)
	})
]);
var setupRuntimeSchema = z.object({
	activeSceneId: z.string().nullable().default(null),
	state: z.enum([
		"idle",
		"applying",
		"active",
		"partial",
		"restoring"
	]).default("idle"),
	issues: z.array(z.string().max(2048)).max(64).default([]),
	desktopState: z.enum([
		"disabled",
		"starting",
		"ready",
		"error"
	]).default("disabled"),
	desktopError: z.string().nullable().default(null),
	lightingState: z.enum([
		"idle",
		"acknowledged",
		"error"
	]).default("idle"),
	lightingMessage: z.string().default("")
});
var setupStateSchema = z.object({
	scenes: z.array(setupSceneSchema).max(32).default([]),
	preferences: setupPreferencesSchema.default(() => setupPreferencesSchema.parse({})),
	runtime: setupRuntimeSchema.default(() => setupRuntimeSchema.parse({})),
	restore: z.object({
		before: sceneValuesSchema,
		applied: sceneValuesSchema,
		automatic: z.boolean(),
		executable: z.string(),
		restoreOnExit: z.boolean()
	}).nullable().default(null)
});
var systemSnapshotSchema = z.object({
	setup: setupStateSchema.default(() => setupStateSchema.parse({})),
	version: z.string(),
	prototypeMode: z.boolean(),
	appUpdate: appUpdateStateSchema,
	diagnostics: diagnosticRunSchema.default(idleDiagnosticRun),
	modules: z.array(moduleManifestSchema),
	devices: z.array(deviceSchema),
	engines: z.array(engineStatusSchema),
	audio: audioStateSchema,
	capture: z.object({
		config: captureConfigSchema,
		runtime: captureRuntimeSchema,
		storage: captureStorageSchema,
		capabilities: captureCapabilitiesSchema,
		sources: z.array(captureSourceSchema),
		autoCapture: autoCaptureStateSchema
	}),
	clips: z.array(clipSchema),
	clipReview: clipReviewStateSchema,
	gameDetection: gameDetectionStateSchema,
	performance: performanceSnapshotSchema,
	settings: appSettingsSchema
});
var setModuleStateInputSchema = z.object({
	moduleId: z.string(),
	enabled: z.boolean()
});
var setDeviceSettingInputSchema = z.object({
	deviceId: z.string(),
	key: z.string(),
	value: deviceSettingValueSchema
});
var deviceControlChangeSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("dpi"),
		value: z.number().int().positive()
	}),
	z.object({
		type: z.literal("dpi-stages"),
		stages: z.array(z.number().int().positive()).min(1)
	}),
	z.object({
		type: z.literal("dpi-shift"),
		value: z.number().int().positive()
	}),
	z.object({
		type: z.literal("report-rate"),
		value: z.number().int().positive()
	}),
	z.object({
		type: z.literal("button-assignment"),
		buttonId: z.string().min(1),
		actionId: z.string().min(1)
	}),
	z.object({
		type: z.literal("onboard-memory"),
		enabled: z.boolean()
	}),
	z.object({
		type: z.literal("lighting-enabled"),
		enabled: z.boolean()
	}),
	z.object({
		type: z.literal("lighting-color"),
		color: z.string().regex(/^#[0-9a-f]{6}$/i)
	}),
	z.object({
		type: z.literal("lighting-brightness"),
		brightness: z.number().min(0).max(100)
	}),
	z.object({
		type: z.literal("lighting-effect"),
		effectId: z.string().min(1)
	}),
	z.object({
		type: z.literal("lighting-speed"),
		speed: z.number().min(1).max(100)
	}),
	z.object({
		type: z.literal("lighting-direction"),
		direction: lightingDirectionSchema
	}),
	z.object({
		type: z.literal("lighting-zone-color"),
		zoneId: z.string().min(1),
		color: z.string().regex(/^#[0-9a-f]{6}$/i)
	}),
	z.object({
		type: z.literal("lighting-profile"),
		profileId: z.string().min(1)
	}),
	z.object({
		type: z.literal("keyboard-gaming-mode"),
		enabled: z.boolean()
	}),
	z.object({
		type: z.literal("keyboard-rapid-trigger"),
		enabled: z.boolean()
	}),
	z.object({
		type: z.literal("keyboard-snap-tap"),
		enabled: z.boolean()
	}),
	z.object({
		type: z.literal("keyboard-onboard-profile"),
		profileId: z.string().min(1)
	}),
	z.object({
		type: z.literal("microphone-mute-lighting"),
		enabled: z.boolean()
	})
]);
var setDeviceControlInputSchema = z.object({
	deviceId: z.string().min(1),
	change: deviceControlChangeSchema
});
var setDeviceAppearanceOverrideInputSchema = z.object({
	deviceId: z.string().min(1),
	override: deviceAppearanceOverrideSchema.nullable()
});
var setAudioBusGainInputSchema = z.object({
	mixId: audioMixIdSchema,
	busId: audioBusIdSchema,
	gain: z.number().min(0).max(1.5)
});
var setAudioMasterGainInputSchema = z.object({
	mixId: audioMixIdSchema,
	gain: z.number().min(0).max(1.5)
});
var setAudioMasterEnabledInputSchema = z.object({
	mixId: audioMixIdSchema,
	enabled: z.boolean()
});
var setAudioBusEnabledInputSchema = z.object({
	mixId: audioMixIdSchema,
	busId: audioBusIdSchema,
	enabled: z.boolean()
});
var setAudioChannelEnabledInputSchema = z.object({
	busId: audioBusIdSchema,
	enabled: z.boolean()
});
var setAudioBusDeviceInputSchema = z.object({
	busId: audioBusIdSchema,
	deviceId: z.string().min(1)
});
var setAudioApplicationRouteInputSchema = z.object({
	applicationId: z.string().min(1),
	destination: z.enum([
		"game",
		"chat",
		"media"
	])
});
var applyAudioPresetInputSchema = z.object({ presetId: z.string().min(1) });
var createAudioPresetInputSchema = z.object({
	kind: audioPathIdSchema,
	name: z.string().trim().min(1).max(64)
});
var renameAudioPresetInputSchema = z.object({
	presetId: z.string().min(1),
	name: z.string().trim().min(1).max(64)
});
var audioPresetIdInputSchema = z.object({ presetId: z.string().min(1) });
var setAudioMonitoringInputSchema = z.object({
	enabled: z.boolean().optional(),
	level: z.number().min(0).max(1).optional(),
	deviceId: z.string().min(1).optional()
});
var setAudioChannelProcessorInputSchema = z.discriminatedUnion("processorId", [
	z.object({
		busId: channelAudioBusIdSchema,
		processorId: z.literal("equalizer"),
		enabled: z.boolean().optional(),
		parameters: z.object({ bands: z.array(eqBandSchema).min(1).max(8).optional() }).optional()
	}),
	z.object({
		busId: channelAudioBusIdSchema,
		processorId: z.literal("normalization"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			targetLufs: z.number().min(-30).max(-10).optional(),
			maxGainDb: z.number().min(0).max(18).optional()
		}).optional()
	}),
	z.object({
		busId: channelAudioBusIdSchema,
		processorId: z.literal("compressor"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			thresholdDb: z.number().min(-60).max(0).optional(),
			ratio: z.number().min(1).max(20).optional(),
			attackMs: z.number().min(.1).max(200).optional(),
			releaseMs: z.number().min(10).max(2e3).optional(),
			makeupDb: z.number().min(0).max(18).optional()
		}).optional()
	}),
	z.object({
		busId: channelAudioBusIdSchema,
		processorId: z.literal("limiter"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			thresholdDb: z.number().min(-18).max(0).optional(),
			releaseMs: z.number().min(10).max(1e3).optional()
		}).optional()
	})
]);
var setMicProcessorInputSchema = z.discriminatedUnion("processorId", [
	z.object({
		processorId: z.literal("gain"),
		enabled: z.boolean().optional(),
		parameters: z.object({ gainDb: z.number().min(-20).max(30).optional() }).optional()
	}),
	z.object({
		processorId: z.literal("noise-gate"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			thresholdDb: z.number().min(-80).max(-10).optional(),
			attackMs: z.number().min(.1).max(100).optional(),
			releaseMs: z.number().min(10).max(1e3).optional()
		}).optional()
	}),
	z.object({
		processorId: z.literal("noise-suppression"),
		enabled: z.boolean().optional(),
		parameters: z.object({ amount: z.number().min(0).max(100).optional() }).optional()
	}),
	z.object({
		processorId: z.literal("equalizer"),
		enabled: z.boolean().optional(),
		parameters: z.object({ bands: z.array(eqBandSchema).min(1).max(8).optional() }).optional()
	}),
	z.object({
		processorId: z.literal("compressor"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			thresholdDb: z.number().min(-60).max(0).optional(),
			ratio: z.number().min(1).max(20).optional(),
			attackMs: z.number().min(.1).max(200).optional(),
			releaseMs: z.number().min(10).max(2e3).optional(),
			makeupDb: z.number().min(0).max(18).optional()
		}).optional()
	}),
	z.object({
		processorId: z.literal("limiter"),
		enabled: z.boolean().optional(),
		parameters: z.object({
			thresholdDb: z.number().min(-18).max(0).optional(),
			releaseMs: z.number().min(10).max(1e3).optional()
		}).optional()
	})
]);
var updateSettingsInputSchema = appSettingsSchema.partial().extend({
	detailedDiagnostics: appSettingsSchema.shape.detailedDiagnostics.removeDefault().optional(),
	softwareRendering: appSettingsSchema.shape.softwareRendering.removeDefault().optional(),
	deviceAppearanceOverrides: appSettingsSchema.shape.deviceAppearanceOverrides.removeDefault().optional(),
	mouseBatteryLighting: appSettingsSchema.shape.mouseBatteryLighting.removeDefault().optional(),
	developerMode: appSettingsSchema.shape.developerMode.removeDefault().optional(),
	visibleWorkspaces: appSettingsSchema.shape.visibleWorkspaces.removeDefault().optional(),
	onboardingCompleted: appSettingsSchema.shape.onboardingCompleted.removeDefault().optional()
});
var settingsResetScopeSchema = z.enum([
	"all",
	"general",
	"devices",
	"audio",
	"capture",
	"games",
	"modules",
	"diagnostics"
]);
var feedbackReportKindSchema = z.enum([
	"bug",
	"feature",
	"feedback"
]);
var feedbackSubmissionInputSchema = z.object({
	kind: feedbackReportKindSchema,
	title: z.string().trim().min(5).max(120),
	description: z.string().trim().min(10).max(2e3),
	supportingDetails: z.string().trim().max(1200).optional(),
	includeDiagnostics: z.boolean()
}).extend({ email: z.string().trim().max(254).email() });
z.object({
	submitted: z.boolean(),
	message: z.string().max(500)
});
z.object({
	copied: z.boolean(),
	opened: z.boolean()
});
var ipcChannels = {
	saveScene: "setup:save-scene",
	deleteScene: "setup:delete-scene",
	applyScene: "setup:apply-scene",
	restoreScene: "setup:restore-scene",
	setSetupPreferences: "setup:set-preferences",
	openQuickControls: "setup:open-quick-controls",
	closeQuickControls: "setup:close-quick-controls",
	runQuickAction: "setup:quick-action",
	getSnapshot: "system:get-snapshot",
	refreshDevices: "devices:refresh",
	setModuleState: "modules:set-state",
	createModuleProject: "modules:create-project",
	linkModuleProject: "modules:link-project",
	validateModuleProject: "modules:validate-project",
	revealModuleProject: "modules:reveal-project",
	unlinkModuleProject: "modules:unlink-project",
	setDeviceControl: "devices:set-control",
	setDeviceSetting: "devices:set-setting",
	setDeviceAppearanceOverride: "devices:set-appearance-override",
	setAudioEnabled: "audio:set-enabled",
	setAudioMasterGain: "audio:set-master-gain",
	setAudioMasterEnabled: "audio:set-master-enabled",
	setAudioBusGain: "audio:set-bus-gain",
	setAudioBusEnabled: "audio:set-bus-enabled",
	setAudioChannelEnabled: "audio:set-channel-enabled",
	setAudioBusDevice: "audio:set-bus-device",
	setAudioApplicationRoute: "audio:set-application-route",
	applyAudioPreset: "audio:apply-preset",
	createAudioPreset: "audio:create-preset",
	renameAudioPreset: "audio:rename-preset",
	duplicateAudioPreset: "audio:duplicate-preset",
	deleteAudioPreset: "audio:delete-preset",
	importAudioPreset: "audio:import-preset",
	exportAudioPreset: "audio:export-preset",
	setAudioChannelProcessor: "audio:set-channel-processor",
	setAudioMonitoring: "audio:set-monitoring",
	testMicrophone: "audio:test-microphone",
	setChatMix: "audio:set-chat-mix",
	setMicProcessor: "audio:set-mic-processor",
	setAudioMeterSubscription: "audio:set-meter-subscription",
	audioMeterUpdated: "audio:meter-updated",
	setCaptureConfig: "capture:set-config",
	saveReplay: "capture:save-replay",
	chooseClipDirectory: "capture:choose-clip-directory",
	openClipsDirectory: "capture:open-clips-directory",
	refreshCaptureSources: "capture:refresh-sources",
	updateAutoCaptureSettings: "capture:auto-capture:update-settings",
	setupAutoCaptureProvider: "capture:auto-capture:setup-provider",
	emitAutoCaptureTestEvent: "capture:auto-capture:emit-test-event",
	scanGames: "games:scan",
	addGame: "games:add",
	checkAppUpdates: "updates:check",
	downloadAppUpdate: "updates:download",
	installAppUpdate: "updates:install",
	updateSettings: "settings:update",
	exportResourceDiagnostics: "diagnostics:export-resources",
	runDiagnostics: "diagnostics:run",
	cancelDiagnostics: "diagnostics:cancel",
	resetSettings: "settings:reset",
	submitFeedbackReport: "feedback:submit-report",
	revealClip: "clips:reveal",
	deleteClip: "clips:delete",
	markClipsReviewed: "clips:mark-reviewed",
	renameClip: "clips:rename",
	setClipFavorite: "clips:set-favorite",
	setClipTrim: "clips:set-trim",
	setClipCanvasSize: "clips:set-canvas-size",
	setClipAudioTrackLevel: "clips:set-audio-track-level",
	loadClipAudioWaveform: "clips:load-audio-waveform",
	exportClip: "clips:export",
	prepareClipShare: "clips:prepare-share",
	startPreparedShareDrag: "clips:start-share-drag",
	revealPreparedShareFile: "clips:reveal-share-file",
	exportMontage: "clips:export-montage",
	cancelClipExport: "clips:cancel-export",
	clipExportProgress: "clips:export-progress",
	snapshotUpdated: "system:snapshot-updated"
};
var renameClipInputSchema = z.object({
	id: z.string().min(1).max(256),
	name: z.string().trim().min(1).max(120)
});
var markClipsReviewedInputSchema = z.object({ reviewedThrough: z.number().int().nonnegative() });
var setClipFavoriteInputSchema = z.object({
	id: z.string().min(1).max(256),
	favorite: z.boolean()
});
var setClipCanvasSizeInputSchema = z.object({
	id: z.string().min(1).max(256),
	canvasSize: clipCanvasSizeSchema
});
var setClipAudioTrackLevelInputSchema = z.object({
	id: z.string().min(1).max(256),
	trackIndex: z.number().int().min(0).max(7),
	level: z.number().int().min(0).max(100)
});
var clipTrimInputShape = {
	music: montageMusicTrackSchema.nullable().optional(),
	videoEdits: videoEditsSchema.optional(),
	id: z.string().min(1).max(256),
	startMs: z.number().int().nonnegative(),
	endMs: z.number().int().positive(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional()
};
var clipTrimInputSchema = z.object(clipTrimInputShape).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
var clipExportPresetSchema = z.enum([
	"original",
	"10mb",
	"25mb",
	"50mb"
]);
var exportClipInputSchema = z.object({
	...clipTrimInputShape,
	preset: clipExportPresetSchema,
	exportId: z.string().uuid().optional()
}).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
var prepareClipShareInputSchema = z.object({
	...clipTrimInputShape,
	preset: clipExportPresetSchema,
	exportId: z.string().uuid()
}).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
z.object({
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(260),
	fileSize: z.number().int().nonnegative()
});
z.object({
	exportId: z.string().uuid(),
	percent: z.number().int().min(0).max(100),
	stage: z.enum([
		"compressing",
		"finalizing",
		"complete"
	])
});
var montageProjectSegmentSchema = z.object({
	id: z.string().min(1).max(256),
	clipId: z.string().min(1).max(256),
	sourceDurationMs: z.number().int().positive(),
	trimStartMs: z.number().int().nonnegative(),
	trimEndMs: z.number().int().positive(),
	audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
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
var montageProjectSchema = z.object({
	type: z.literal("montage"),
	id: z.string().min(1).max(256),
	name: z.string().trim().min(1).max(120),
	durationMs: z.number().int().positive(),
	canvasSize: clipCanvasSizeSchema,
	segments: z.array(montageProjectSegmentSchema).min(1).max(500)
}).superRefine((project, context) => {
	const expectedDurationMs = project.segments.reduce((total, segment) => total + segment.trimEndMs - segment.trimStartMs, 0);
	if (project.durationMs !== expectedDurationMs) context.addIssue({
		code: "custom",
		message: "The montage duration does not match its segments.",
		path: ["durationMs"]
	});
	const clipIds = /* @__PURE__ */ new Set();
	project.segments.forEach((segment, index) => {
		if (clipIds.has(segment.clipId)) context.addIssue({
			code: "custom",
			message: "A clip can appear only once in a montage.",
			path: [
				"segments",
				index,
				"clipId"
			]
		});
		clipIds.add(segment.clipId);
	});
});
var exportMontageInputSchema = z.object({
	exportId: z.string().uuid(),
	project: montageProjectSchema,
	preset: clipExportPresetSchema
});
//#endregion
//#region src/shared/setup-scenes.ts
function snapshotSceneValues(snapshot, scope = {
	includeAudio: true,
	includeCapture: true,
	includeDevices: true
}) {
	const { hotkey: _hotkey, clipsDirectory: _directory, ...capture } = snapshot.capture.config;
	return sceneValuesSchema.parse({
		audio: scope.includeAudio ? sceneAudioSchema.parse(snapshot.audio) : null,
		capture: scope.includeCapture ? capture : null,
		devices: scope.includeDevices ? snapshot.devices.filter((device) => device.connected).map(snapshotSceneDevice).filter((device) => device.dpi !== void 0 || device.reportRate !== void 0 || device.lighting !== void 0) : []
	});
}
function snapshotSceneDevice(device) {
	const { dpi, reportRate, lighting } = device.capabilities;
	return {
		deviceId: device.id,
		name: device.displayName,
		dpi: dpi?.writable ? dpi.defaultDpi : void 0,
		reportRate: reportRate?.writable ? reportRate.value : void 0,
		lighting: lighting?.writable && lighting.state !== "unknown" ? {
			enabled: lighting.batteryLightingEnabled ?? lighting.enabled,
			effectId: lighting.activeEffectId,
			color: lighting.colorWritable ? lighting.color : void 0,
			brightness: lighting.brightnessWritable ? lighting.brightness : void 0,
			speed: lighting.speedWritable ? lighting.speed : void 0,
			zones: lighting.zones?.filter((zone) => zone.colorWritable && zone.color).map((zone) => ({
				id: zone.id,
				color: zone.color
			})) ?? []
		} : void 0
	};
}
function sceneDeviceCommands(target, device) {
	const current = snapshotSceneDevice(device);
	const commands = [];
	if (target.dpi !== void 0 && target.dpi !== current.dpi) commands.push({
		type: "dpi",
		value: target.dpi
	});
	if (target.reportRate !== void 0 && target.reportRate !== current.reportRate) commands.push({
		type: "report-rate",
		value: target.reportRate
	});
	const light = target.lighting;
	if (light && JSON.stringify(light) !== JSON.stringify(current.lighting)) {
		if (light.effectId) commands.push({
			type: "lighting-effect",
			effectId: light.effectId
		});
		if (light.color) commands.push({
			type: "lighting-color",
			color: light.color
		});
		if (light.brightness !== void 0) commands.push({
			type: "lighting-brightness",
			brightness: light.brightness
		});
		if (light.speed !== void 0) commands.push({
			type: "lighting-speed",
			speed: light.speed
		});
		for (const zone of light.zones) commands.push({
			type: "lighting-zone-color",
			zoneId: zone.id,
			color: zone.color
		});
		commands.push({
			type: "lighting-enabled",
			enabled: light.enabled
		});
	}
	return commands;
}
/** Automatic restoration leaves any subsystem the user changed during the scene alone. */
function sceneRestoreValues(before, applied, current, preserveChanges) {
	if (!preserveChanges) return structuredClone(before);
	const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
	return {
		audio: equal(applied.audio, current.audio) ? before.audio : null,
		capture: equal(applied.capture, current.capture) ? before.capture : null,
		devices: before.devices.filter((device) => equal(applied.devices.find((item) => item.deviceId === device.deviceId), current.devices.find((item) => item.deviceId === device.deviceId)))
	};
}
//#endregion
//#region src/main/services/setup-scenes.ts
var SetupScenes = class {
	store;
	io;
	busy = false;
	idle = Promise.resolve();
	finish;
	disposed = false;
	running = [];
	suppressed = /* @__PURE__ */ new Set();
	constructor(store, io) {
		this.store = store;
		this.io = io;
	}
	save(raw) {
		if (this.busy) throw new Error("Wait for the current scene to finish.");
		const input = saveSceneInputSchema.parse(raw);
		const snapshot = this.store.get();
		const previous = snapshot.setup.scenes.find((scene) => scene.id === input.id);
		if (input.id && !previous) throw new Error("This scene no longer exists.");
		if (!previous && snapshot.setup.scenes.length >= 32) throw new Error("You can save up to 32 scenes.");
		if (input.automatic && !input.executable) throw new Error("Choose an executable for automatic switching.");
		if (input.automatic && snapshot.setup.scenes.some((scene) => scene.id !== input.id && scene.automatic && scene.executable.toLowerCase() === input.executable.toLowerCase())) throw new Error("That application already has an automatic scene.");
		if (input.includeAudio && snapshot.settings.developerMode !== true && (input.captureCurrent || !previous)) throw new Error("Enable Developer mode before including Audio in a scene.");
		const values = input.captureCurrent || !previous ? snapshotSceneValues(snapshot, input) : previous.values;
		if (!values.audio && !values.capture && !values.devices.length) throw new Error("Include at least one available part of your setup.");
		return this.store.update((draft) => {
			const scene = {
				id: previous?.id ?? randomUUID(),
				name: input.name,
				executable: input.executable,
				automatic: input.automatic,
				restoreOnExit: input.restoreOnExit,
				values
			};
			if (previous) draft.setup.scenes[draft.setup.scenes.findIndex((item) => item.id === previous.id)] = scene;
			else draft.setup.scenes.push(scene);
		});
	}
	delete(id) {
		if (this.busy) throw new Error("Wait for the current scene to finish.");
		if (this.store.get().setup.runtime.activeSceneId === id) throw new Error("Restore your previous setup before deleting the active scene.");
		return this.store.update((draft) => {
			draft.setup.scenes = draft.setup.scenes.filter((scene) => scene.id !== id);
		});
	}
	async apply(id, automatic = false) {
		if (this.busy || this.disposed) throw new Error("A scene is already changing.");
		const scene = this.store.get().setup.scenes.find((item) => item.id === id);
		if (!scene) throw new Error("This scene no longer exists.");
		this.busy = true;
		this.idle = new Promise((resolve) => {
			this.finish = resolve;
		});
		if (!automatic) for (const exe of this.running) this.suppressed.add(exe);
		try {
			const original = this.store.get().setup.restore?.before ?? snapshotSceneValues(this.store.get());
			this.store.update((draft) => {
				draft.setup.runtime.state = "applying";
				draft.setup.runtime.issues = [];
				draft.setup.restore = {
					before: original,
					applied: snapshotSceneValues(draft),
					automatic,
					executable: scene.executable.toLowerCase(),
					restoreOnExit: scene.restoreOnExit
				};
			});
			const issues = await this.applyValues(scene.values);
			return this.store.update((draft) => {
				draft.setup.runtime.activeSceneId = scene.id;
				draft.setup.runtime.state = issues.length ? "partial" : "active";
				draft.setup.runtime.issues = issues;
				if (draft.setup.restore) draft.setup.restore.applied = snapshotSceneValues(draft);
			});
		} finally {
			this.busy = false;
			this.finish?.();
			this.finish = void 0;
		}
	}
	async restore(automatic = false) {
		if (this.busy || this.disposed) throw new Error("A scene is already changing.");
		const saved = this.store.get().setup.restore;
		if (!saved) return this.store.get();
		this.busy = true;
		this.idle = new Promise((resolve) => {
			this.finish = resolve;
		});
		if (!automatic) for (const exe of this.running) this.suppressed.add(exe);
		try {
			const values = sceneRestoreValues(saved.before, saved.applied, snapshotSceneValues(this.store.get()), automatic);
			this.store.update((draft) => {
				draft.setup.runtime.state = "restoring";
				draft.setup.runtime.issues = [];
			});
			const issues = await this.applyValues(values);
			return this.store.update((draft) => {
				draft.setup.runtime.state = issues.length ? "partial" : "idle";
				draft.setup.runtime.issues = issues;
				if (!issues.length) {
					draft.setup.restore = null;
					draft.setup.runtime.activeSceneId = null;
				}
			});
		} finally {
			this.busy = false;
			this.finish?.();
			this.finish = void 0;
		}
	}
	async runningApplications(executables) {
		this.running = executables.map((exe) => exe.toLowerCase());
		for (const exe of this.suppressed) if (!this.running.includes(exe)) this.suppressed.delete(exe);
		if (this.busy || this.disposed) return;
		const previous = this.store.get().setup.restore;
		if (previous?.automatic && !this.running.includes(previous.executable)) {
			if (previous.restoreOnExit) await this.restore(true);
			else this.store.update((draft) => {
				if (draft.setup.restore) draft.setup.restore.automatic = false;
			});
		}
		if (this.store.get().setup.restore?.automatic) return;
		const match = this.store.get().setup.scenes.find((scene) => scene.automatic && this.running.includes(scene.executable.toLowerCase()) && !this.suppressed.has(scene.executable.toLowerCase()));
		if (match) {
			this.suppressed.add(match.executable.toLowerCase());
			await this.apply(match.id, true);
		}
	}
	async dispose() {
		this.disposed = true;
		await this.idle;
	}
	async applyValues(values) {
		const issues = [];
		const attempt = async (label, action) => {
			if (this.disposed) {
				issues.push("Switchboard is shutting down.");
				return;
			}
			try {
				await action();
			} catch (error) {
				issues.push(`${label}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 2048));
			}
		};
		if (values.audio) await attempt("Audio", () => this.io.audio(values.audio));
		for (const target of values.devices) await attempt(target.name, async () => {
			const device = this.store.get().devices.find((item) => item.id === target.deviceId);
			if (!device?.connected) throw new Error("Device is disconnected.");
			for (const change of sceneDeviceCommands(target, device)) await this.io.device(target.deviceId, change);
		});
		if (values.capture) await attempt("Capture", () => this.io.capture(values.capture));
		return issues.slice(0, 64);
	}
};
//#endregion
//#region src/main/services/desktop-controls.ts
var desktopEventSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ready") }),
	z.object({
		type: z.literal("quick"),
		open: z.boolean()
	}),
	z.object({
		type: z.literal("applications"),
		executables: z.array(z.string().max(120)).max(32)
	}),
	z.object({
		type: z.literal("error"),
		message: z.string().max(2048)
	}),
	z.object({
		type: z.literal("metrics"),
		pid: z.number().int().positive(),
		privateMemoryMb: z.number().finite().nonnegative(),
		workingSetMb: z.number().finite().nonnegative(),
		cpuPercent: z.number().min(0).max(100)
	})
]);
/** One optional host using the existing bundled Capture.Host executable in a media-free mode. */
var DesktopControlsService = class {
	io;
	worker = null;
	signature = "";
	generation = 0;
	chain = Promise.resolve();
	closed = false;
	resources = null;
	lastMetricRequestAt = 0;
	constructor(io) {
		this.io = io;
	}
	configure(config) {
		const signature = JSON.stringify(config);
		if (this.closed || signature === this.signature) return;
		this.signature = signature;
		const generation = ++this.generation;
		this.chain = this.chain.catch(() => void 0).then(async () => {
			await this.stop();
			if (generation !== this.generation || this.closed) return;
			if (!config.quickControlsEnabled && !config.executables.length) {
				this.io.status("disabled", null);
				return;
			}
			if (process.env.SWITCHBOARD_NATIVE_FIXTURES === "1") {
				this.io.status("disabled", null);
				return;
			}
			this.io.status("starting", null);
			try {
				await this.start(config, generation);
			} catch (error) {
				if (generation === this.generation) this.io.status("error", error instanceof Error ? error.message : String(error));
			}
		});
	}
	start(config, generation) {
		const executable = app.isPackaged ? join(process.resourcesPath, "capture-host", "Capture.Host.exe") : process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST ?? join(app.getAppPath(), "engines", "capture-host", "bin", "Debug", "net10.0-windows", "Capture.Host.exe");
		if (process.platform !== "win32" || !existsSync(executable)) throw new Error("Desktop controls need the bundled Windows host. Build Capture.Host and retry.");
		const worker = spawn(executable, ["--desktop-controls"], {
			windowsHide: true,
			stdio: "pipe"
		});
		this.worker = worker;
		return new Promise((resolve, reject) => {
			let ready = false, buffer = "", failure = null;
			const timeout = setTimeout(() => {
				failure = "Desktop controls did not become ready.";
				worker.kill();
				reject(new Error(failure));
			}, 8e3);
			worker.stdout.setEncoding("utf8");
			worker.stdout.on("data", (chunk) => {
				if (generation !== this.generation || this.closed) return;
				buffer += chunk;
				if (buffer.length > 65536) {
					worker.kill();
					return;
				}
				let newline;
				while ((newline = buffer.indexOf("\n")) >= 0) {
					const line = buffer.slice(0, newline);
					buffer = buffer.slice(newline + 1);
					try {
						const event = desktopEventSchema.parse(JSON.parse(line));
						if (event.type === "ready") {
							ready = true;
							clearTimeout(timeout);
							this.io.status("ready", null);
							resolve();
						} else if (event.type === "metrics") {
							if (event.pid === worker.pid) this.resources = {
								...event,
								name: "Desktop controls"
							};
						} else if (event.type === "quick") this.io.quick(event.open);
						else if (event.type === "applications") this.io.applications(event.executables).catch((error) => this.io.status("error", String(error).slice(0, 2048)));
						else if (event.type === "error") {
							failure = event.message;
							this.io.status("error", event.message);
						}
					} catch {
						failure = "Desktop controls sent an invalid response.";
						worker.kill();
					}
				}
			});
			worker.stderr.resume();
			worker.stdin.on("error", () => void 0);
			worker.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
			worker.on("exit", () => {
				clearTimeout(timeout);
				if (this.worker === worker) {
					this.worker = null;
					this.resources = null;
				}
				if (generation !== this.generation || this.closed) return;
				this.io.quick(false);
				const message = failure ?? "Desktop controls stopped. Toggle Quick controls or an automatic scene to retry.";
				this.io.status("error", message);
				if (!ready) reject(new Error(message));
			});
			worker.stdin.write(`${JSON.stringify(config)}\n`);
		});
	}
	async stop() {
		this.io.quick(false);
		const worker = this.worker;
		this.worker = null;
		this.resources = null;
		if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
		await new Promise((resolve) => {
			const timeout = setTimeout(() => {
				worker.kill();
			}, 2e3);
			worker.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
			worker.stdin.end();
		});
	}
	async dispose() {
		this.closed = true;
		this.generation++;
		await this.chain;
		await this.stop();
	}
	getResources() {
		if (this.worker && Date.now() - this.lastMetricRequestAt >= 4900) {
			this.lastMetricRequestAt = Date.now();
			this.worker.stdin.write("metrics\n");
		}
		return this.worker && this.resources ? [{ ...this.resources }] : [];
	}
};
//#endregion
//#region src/main/services/status-lighting.ts
var StatusLighting = class {
	io;
	initialized = false;
	lastSave;
	pulse = false;
	timer = null;
	snapshot = null;
	signature = "";
	generation = 0;
	applied = /* @__PURE__ */ new Map();
	chain = Promise.resolve();
	closed = false;
	constructor(io) {
		this.io = io;
	}
	update(snapshot) {
		if (this.closed) return;
		this.snapshot = snapshot;
		const policy = snapshot.setup.preferences.lighting;
		const save = snapshot.capture.runtime.lastSavedAt;
		if (this.initialized && save && save !== this.lastSave && policy.enabled && policy.clipSaved) {
			this.pulse = true;
			if (this.timer) clearTimeout(this.timer);
			this.timer = setTimeout(() => {
				this.timer = null;
				this.pulse = false;
				if (this.snapshot) this.update(this.snapshot);
			}, 1500);
			this.timer.unref();
		}
		this.initialized = true;
		this.lastSave = save;
		if (!policy.enabled || !policy.clipSaved) {
			if (this.timer) clearTimeout(this.timer);
			this.timer = null;
			this.pulse = false;
		}
		const muted = snapshot.devices.some((device) => device.connected && device.capabilities.muteState?.muted === true) || snapshot.audio.enabled && snapshot.audio.buses.some((bus) => bus.id === "mic" && !bus.enabled);
		const color = !policy.enabled ? null : policy.captureError && snapshot.capture.config.enabled && snapshot.capture.runtime.state === "error" ? "#ff3b30" : this.pulse ? "#36d978" : policy.microphoneMuted && muted ? "#ffb347" : null;
		const targets = policy.enabled ? snapshot.devices.filter((device) => policy.deviceIds.includes(device.id) && device.connected && device.capabilities.lighting?.statusLightingSupported && snapshot.modules.some((module) => module.id === device.moduleId && module.enabled)).map((device) => device.id) : [];
		const signature = JSON.stringify([targets, color]);
		if (signature === this.signature) return;
		this.signature = signature;
		const generation = ++this.generation;
		this.chain = this.chain.catch(() => void 0).then(async () => {
			if (generation !== this.generation || this.closed) return;
			const errors = [];
			for (const id of /* @__PURE__ */ new Set([...this.applied.keys(), ...targets])) {
				const next = targets.includes(id) ? color : null;
				if (this.applied.has(id) && this.applied.get(id) === next) {
					if (!targets.includes(id)) this.applied.delete(id);
					continue;
				}
				try {
					this.applied.set(id, next);
					await this.io.apply(id, next);
					if (!targets.includes(id)) this.applied.delete(id);
				} catch (error) {
					errors.push(`${snapshot.devices.find((device) => device.id === id)?.displayName ?? "Device"}: ${String(error)}`);
				}
			}
			if (generation !== this.generation || this.closed) return;
			this.io.status(errors.length ? "error" : color && targets.length ? "acknowledged" : "idle", errors.join(" ").slice(0, 2048) || (color && targets.length ? "Status cue acknowledged. Battery warnings and cutoff take priority; physical light output is unverified." : ""));
		});
	}
	async dispose() {
		this.closed = true;
		this.generation++;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		await this.chain;
		for (const id of this.applied.keys()) await this.io.apply(id, null).catch(() => void 0);
		this.applied.clear();
	}
};
//#endregion
//#region src/main/services/prepared-share.ts
var PreparedShareService = class {
	records = /* @__PURE__ */ new Map();
	sessionDirectory = join(app.getPath("temp"), "Switchboard", "Share", String(process.pid));
	async allocate(id, fileName) {
		const safeName = basename(fileName);
		if (!safeName || safeName !== fileName) throw new Error("The prepared share file name is invalid.");
		const directory = join(this.sessionDirectory, id);
		await mkdir(directory, { recursive: true });
		return join(directory, safeName);
	}
	async register(id, path, name, options) {
		const resolvedPath = resolve(path);
		const file = await stat(resolvedPath);
		if (!file.isFile()) throw new Error("The prepared share output is not a file.");
		const result = {
			id,
			name: basename(name),
			fileSize: file.size
		};
		this.records.set(id, {
			...result,
			path: resolvedPath,
			...options.iconPath ? { iconPath: options.iconPath } : {},
			temporary: options.temporary
		});
		return result;
	}
	resolve(id) {
		const record = this.records.get(id);
		if (!record || !existsSync(record.path)) return null;
		return record;
	}
	reveal(id) {
		const record = this.resolve(id);
		if (!record) throw new Error("The prepared share file is no longer available. Prepare it again.");
		shell.showItemInFolder(record.path);
	}
	async discard(id) {
		this.records.delete(id);
		await rm(join(this.sessionDirectory, id), {
			recursive: true,
			force: true
		});
	}
	async dispose() {
		this.records.clear();
		await rm(this.sessionDirectory, {
			recursive: true,
			force: true
		});
	}
};
var preparedShareService = null;
function getPreparedShareService() {
	preparedShareService ??= new PreparedShareService();
	return preparedShareService;
}
async function disposePreparedShareService() {
	await preparedShareService?.dispose();
	preparedShareService = null;
}
var montageV2SegmentSchema = z.object({
	videoEdits: videoEditsSchema.optional(),
	id: z.string().uuid(),
	clipId: z.string().min(1).max(256),
	sourceDurationMs: z.number().int().positive(),
	trimStartMs: z.number().int().nonnegative(),
	trimEndMs: z.number().int().positive(),
	volume: z.number().min(0).max(1).default(1),
	muted: z.boolean().default(false),
	audioTrackLevels: z.array(z.number().int().min(0).max(100)).max(8).optional(),
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
var montageProjectV2Schema = z.object({
	schemaVersion: z.literal(2),
	type: z.literal("montage"),
	sourceClipId: z.string().min(1).max(256).optional(),
	id: z.string().uuid(),
	name: z.string().trim().min(1).max(120),
	createdAt: z.number().int().nonnegative(),
	updatedAt: z.number().int().nonnegative(),
	durationMs: z.number().int().positive(),
	canvasSize: clipCanvasSizeSchema,
	segments: z.array(montageV2SegmentSchema).min(1).max(500),
	music: montageMusicTrackSchema.optional()
}).superRefine((project, context) => {
	const expectedDurationMs = project.segments.reduce((total, segment) => total + editedDurationMs(segment.trimStartMs, segment.trimEndMs, segment.videoEdits), 0);
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
var exportMontageV2InputSchema = z.object({
	exportId: z.string().uuid(),
	project: montageProjectV2Schema,
	preset: clipExportPresetSchema,
	targetSizeMb: z.number().int().min(5).max(1e5).optional()
});
var montageDraftIdSchema = z.string().uuid();
var montageAudioAssetIdSchema = z.string().uuid();
var montageV2IpcChannels = {
	importAudio: "montage-v2:import-audio",
	loadAudioWaveform: "montage-v2:load-audio-waveform",
	listDrafts: "montage-v2:list-drafts",
	saveDraft: "montage-v2:save-draft",
	deleteDraft: "montage-v2:delete-draft",
	export: "montage-v2:export",
	cancelExport: "montage-v2:cancel-export"
};
//#endregion
//#region src/main/services/clip-effects-renderer.ts
var number = (value) => Number(value.toFixed(9)).toString();
var seconds = (ms) => number(ms / 1e3);
var even = (value) => Math.max(2, Math.floor(value / 2) * 2);
var filterPath$1 = (path) => `'${path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "'\\\\''")}'`;
function hasAdvancedEdits(edits) {
	return !!(edits?.text?.content || edits?.framing || edits?.overlays?.length || edits?.speedPoints?.length || edits?.freezes?.length || edits?.audioAutomation?.length);
}
function interpolate(points, variable, fallback) {
	if (!points.length) return number(fallback);
	let expression = number(points.at(-1).value);
	for (let index = points.length - 2; index >= 0; index--) {
		const a = points[index], b = points[index + 1];
		let t = `clip((${variable}-${seconds(a.timeMs)})/${seconds(b.timeMs - a.timeMs)},0,1)`;
		if (a.transition === "smooth") t = `(${t})*(${t})*(3-2*(${t}))`;
		const value = a.transition === "hold" ? number(a.value) : `${number(a.value)}+(${number(b.value - a.value)})*(${t})`;
		expression = `if(lt(${variable},${seconds(b.timeMs)}),${value},${expression})`;
	}
	return expression;
}
function automationExpression(automation, variable = "t") {
	const gain = interpolate((automation?.points ?? []).map((point) => ({
		...point,
		value: point.gain
	})), variable, 1);
	const mutes = automation?.mutes.map((range) => `(1-gte(${variable},${seconds(range.startMs)})*lt(${variable},${seconds(range.endMs)}))`) ?? [];
	return `(${gain})${mutes.length ? `*${mutes.join("*")}` : ""}`;
}
function editedPtsExpression(startMs, endMs, edits, variable = "T") {
	const bounds = [
		startMs,
		...(edits?.speedPoints ?? []).map((point) => point.timeMs).filter((t) => t > startMs && t < endMs),
		endMs
	];
	const terms = [];
	for (let i = 1; i < bounds.length; i++) {
		const a = bounds[i - 1], b = bounds[i];
		const from = speedAt(a, edits);
		const slope = (speedAt(b - 1e-6, edits) - from) / ((b - a) / 1e3);
		const u = `clip(${variable}-${seconds(a)},0,${seconds(b - a)})`;
		terms.push(Math.abs(slope) < 1e-6 ? `(${u})/${number(from)}` : `log((${number(from)}+(${number(slope)})*(${u}))/${number(from)})/(${number(slope)})`);
	}
	for (const hold of edits?.freezes ?? []) if (hold.timeMs >= startMs && hold.timeMs < endMs) terms.push(`gt(${variable},${seconds(hold.timeMs)})*${seconds(hold.durationMs)}`);
	return terms.join("+") || "0";
}
async function buildEditedVideoGraph(clip, segment, target, directory) {
	const edits = segment.videoEdits, start = segment.trimStartMs;
	const w = target.width, h = target.height, ratio = w / h;
	const sw = even(clip.width), sh = even(clip.height);
	const pw = even(Math.max(sw, sh * ratio)), ph = even(Math.max(sh, sw / ratio));
	const padX = (pw - sw) / 2, padY = (ph - sh) / 2;
	const mode = edits?.framing?.mode ?? (target.canvasSize === "original" ? "fit" : "fill");
	const points = edits?.framing?.keyframes ?? [];
	const zoom = interpolate(points.map((point) => ({
		...point,
		value: point.zoom
	})), `(in_time+${seconds(start)})`, 1);
	const x = interpolate(points.map((point) => ({
		...point,
		value: point.x
	})), `(in_time+${seconds(start)})`, .5);
	const y = interpolate(points.map((point) => ({
		...point,
		value: point.y
	})), `(in_time+${seconds(start)})`, .5);
	const look = [
		"setpts=PTS-STARTPTS",
		`scale=${sw}:${sh}`,
		"setsar=1"
	];
	if (edits?.flipHorizontal) look.push("hflip");
	if (edits?.brightness) {
		const value = `clip(val*${number(1 + edits.brightness)},0,255)`;
		look.push(`lutrgb=r='${value}':g='${value}':b='${value}'`);
	}
	if (edits?.contrast !== void 0 && edits.contrast !== 1) {
		const value = `clip((val-127.5)*${number(edits.contrast)}+127.5,0,255)`;
		look.push(`lutrgb=r='${value}':g='${value}':b='${value}'`);
	}
	if (edits?.saturation !== void 0 && edits.saturation !== 1) {
		const amount = edits.saturation, r = .213 * (1 - amount), g = .715 * (1 - amount), b = .072 * (1 - amount);
		look.push(`colorchannelmixer=rr=${r + amount}:rg=${g}:rb=${b}:gr=${r}:gg=${g + amount}:gb=${b}:br=${r}:bg=${g}:bb=${b + amount}`);
	}
	const filters = [`[0:v:0]${look.join(",")}[picture]`];
	if (mode === "fill") filters.push(`[picture]zoompan=z='${zoom}':x='(iw-iw/zoom)*(${x})':y='(ih-ih/zoom)*(${y})':d=1:s=${sw}x${sh}:fps=${number(target.fps)},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:x='(iw-ow)*(${x.replaceAll("in_time", "t")})':y='(ih-oh)*(${y.replaceAll("in_time", "t")})',setsar=1[framed]`);
	else {
		if (edits?.framing?.background === "blur") filters.push(`[picture]split[foreground][background]`, `[background]scale=${pw}:${ph}:force_original_aspect_ratio=increase,crop=${pw}:${ph},gblur=sigma=${Math.min(64, Math.max(3, ph * .02))}[blurred]`, `[blurred][foreground]overlay=x=${padX}:y=${padY}[padded]`);
		else filters.push(`[picture]pad=${pw}:${ph}:${padX}:${padY}:color=black[padded]`);
		filters.push(`[padded]zoompan=z='${zoom}':x='${padX}+(${sw}-iw/zoom)*(${x})':y='${padY}+(${sh}-ih/zoom)*(${y})':d=1:s=${w}x${h}:fps=${number(target.fps)},setsar=1[framed]`);
	}
	const overlays = [...edits?.overlays ?? []];
	if (edits?.text?.content) overlays.unshift(titleOverlay(edits.text, w, h));
	let label = "framed";
	for (const [index, item] of overlays.entries()) {
		if (item.endMs <= start || item.startMs >= segment.trimEndMs) continue;
		const out = `overlay${index}`;
		const enabled = `gte(t,${seconds(item.startMs - start)})*lt(t,${seconds(item.endMs - start)})`;
		const ox = Math.floor(item.x * w), oy = Math.floor(item.y * h), ow = even(item.width * w), oh = even(item.height * h);
		if (item.kind === "text") {
			if (!item.content) continue;
			const path = join(directory, `overlay-${index}.txt`);
			await writeFile(path, item.content, "utf8");
			const lines = item.content.split("\n"), longest = Math.max(1, ...lines.map((line) => [...line].length));
			const size = Math.max(1, Math.min(h * videoTextSize[item.size ?? "medium"], item.width * w / (longest * .65), item.height * h / (Math.max(1, lines.length) * 1.2)));
			const font = process.platform === "win32" ? `fontfile=${filterPath$1(join(process.env.WINDIR ?? "C:/Windows", "Fonts", "arialbd.ttf"))}` : "font=DejaVu Sans";
			filters.push(`[${label}]drawtext=${font}:textfile=${filterPath$1(path)}:expansion=none:fontsize=${number(size)}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=6:x=${number((item.x + item.width / 2) * w)}-text_w/2:y=${oy}:enable='${enabled}'[${out}]`);
		} else {
			filters.push(`[${label}]split[mask-base${index}][mask-source${index}]`);
			const effect = item.kind === "blur" ? `gblur=sigma=${Math.max(3, h * .02)}` : `scale=${Math.max(2, Math.round(ow / Math.max(6, h / 60)))}:${Math.max(2, Math.round(oh / Math.max(6, h / 60)))}:flags=neighbor,scale=${ow}:${oh}:flags=neighbor`;
			filters.push(`[mask-source${index}]crop=${ow}:${oh}:${Math.min(w - ow, ox)}:${Math.min(h - oh, oy)},${effect}[mask${index}]`, `[mask-base${index}][mask${index}]overlay=x=${ox}:y=${oy}:enable='${enabled}'[${out}]`);
		}
		label = out;
	}
	const duration = seconds(editedDurationMs(start, segment.trimEndMs, edits));
	const timing = editedPtsExpression(start, segment.trimEndMs, edits, `(T+${seconds(start)})`);
	filters.push(`[${label}]settb=AVTB,setpts='(${timing})/TB',tpad=stop_mode=clone:stop_duration=${duration},fps=${number(target.fps)},trim=duration=${duration},format=yuv420p[vout]`);
	return filters.join(";");
}
function audioTimingSlices(startMs, endMs, edits) {
	const keys = [.../* @__PURE__ */ new Set([
		startMs,
		endMs,
		...(edits?.speedPoints ?? []).map((point) => point.timeMs).filter((t) => t > startMs && t < endMs),
		...(edits?.freezes ?? []).map((hold) => hold.timeMs).filter((t) => t >= startMs && t < endMs)
	])].sort((a, b) => a - b), result = [];
	const stepMs = Math.max(100, (endMs - startMs) / 512);
	for (let index = 0; index < keys.length - 1; index++) {
		const start = keys[index], end = keys[index + 1];
		const hold = edits?.freezes?.find((item) => item.timeMs === start);
		if (hold) result.push({
			startMs: start,
			endMs: start,
			durationMs: hold.durationMs,
			frozen: true
		});
		const count = Math.abs(speedAt(start, edits) - speedAt(end - 1e-6, edits)) > 1e-6 ? Math.max(1, Math.ceil((end - start) / stepMs)) : 1;
		for (let n = 0; n < count; n++) {
			const a = start + (end - start) * n / count, b = start + (end - start) * (n + 1) / count;
			result.push({
				startMs: a,
				endMs: b,
				durationMs: movingDurationMs(a, b, edits),
				frozen: false
			});
		}
	}
	return result;
}
function tempo(speed) {
	const filters = [];
	while (speed < .499999) {
		filters.push("atempo=0.5");
		speed /= .5;
	}
	while (speed > 2 + 1e-6) {
		filters.push("atempo=2");
		speed /= 2;
	}
	if (Math.abs(speed - 1) > 1e-6) filters.push(`atempo=${number(speed)}`);
	return filters;
}
function buildEditedAudioGraph(clip, segment, streamCount, includeVoice) {
	const start = segment.trimStartMs, end = segment.trimEndMs, edits = segment.videoEdits;
	const total = seconds(editedDurationMs(start, end, edits));
	const filters = [], trackLabels = [];
	let voiceLabel = null;
	for (let track = 0; track < streamCount; track++) {
		const level = (segment.audioTrackLevels?.[track] ?? 100) / 100 * segment.volume;
		if (level <= 0 || segment.muted) continue;
		const automation = edits?.audioAutomation?.find((item) => item.trackIndex === track);
		const trackTrim = segment.audioTrackTrims?.[track];
		const labels = [];
		for (const [index, slice] of audioTimingSlices(start, end, edits).entries()) {
			const label = `audio-${track}-${index}`, duration = seconds(slice.durationMs);
			labels.push(`[${label}]`);
			if (slice.frozen) {
				filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS[${label}]`);
				continue;
			}
			const variable = `(t+${seconds(slice.startMs)})`;
			const trimGain = trackTrim ? `*gte(${variable},${seconds(trackTrim.startMs)})*lt(${variable},${seconds(trackTrim.endMs)})` : "";
			const gain = `${number(level)}*${automationExpression(automation, variable)}${trimGain}`;
			const chain = [
				`atrim=start=${seconds(slice.startMs - start)}:end=${seconds(slice.endMs - start)}`,
				"asetpts=PTS-STARTPTS",
				`volume='${gain}':eval=frame`,
				...tempo((slice.endMs - slice.startMs) / slice.durationMs),
				"aresample=48000",
				"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
				`apad=whole_dur=${duration}`,
				`atrim=duration=${duration}`,
				"asetpts=PTS-STARTPTS"
			];
			filters.push(`[0:a:${track}]${chain.join(",")}[${label}]`);
		}
		const joined = `track${track}`;
		filters.push(`${labels.join("")}${labels.length > 1 ? `concat=n=${labels.length}:v=0:a=1` : "anull"}[${joined}]`);
		if (includeVoice && clip.audioChannels?.[track] === "microphone" && voiceLabel === null) {
			filters.push(`[${joined}]asplit[${joined}-mix][voice-track]`);
			trackLabels.push(`[${joined}-mix]`);
			voiceLabel = "voice-track";
		} else trackLabels.push(`[${joined}]`);
	}
	filters.push(trackLabels.length ? `${trackLabels.join("")}${trackLabels.length > 1 ? `amix=inputs=${trackLabels.length}:normalize=0:dropout_transition=0` : "anull"},apad=whole_dur=${total},atrim=duration=${total},alimiter=limit=0.95:latency=1[aout]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${total}[aout]`);
	if (includeVoice) filters.push(voiceLabel ? `[${voiceLabel}]apad=whole_dur=${total},atrim=duration=${total}[voiceout]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${total}[voiceout]`);
	return filters.join(";");
}
//#endregion
//#region src/shared/clip-library.ts
var generatedCaptureName = /^(.*?)[_ -]\d{4}-\d{2}-\d{2}(?:[_ -]\d{2}[-_:]\d{2}[-_:]\d{2})?(?:_\d+)?$/i;
var desktopSourceName = /^(?:display|desktop|screen)\s*\d*$/i;
var switchboardCaptureTitle = /^switchboard capture\s*·\s*/i;
function inferClipGame(name) {
	const rawPrefix = generatedCaptureName.exec(name.trim())?.[1]?.replace(/[_-]+/g, " ").trim();
	if (!rawPrefix || desktopSourceName.test(rawPrefix)) return void 0;
	return rawPrefix;
}
function clipGameLabel(clip) {
	const explicit = clip.game?.trim();
	if (explicit) return desktopSourceName.test(explicit) ? "Desktop" : explicit;
	return inferClipGame(clip.path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? clip.name) ?? "Desktop";
}
function createDefaultClipTitle(_game, createdAt = Date.now()) {
	return `Switchboard Capture · ${new Date(createdAt).toLocaleString(void 0, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short"
	})}`;
}
function isGeneratedClipTitle(name) {
	return generatedCaptureName.test(name.trim());
}
function normalizeClipRecord(clip) {
	const legacyDefaultTitles = /* @__PURE__ */ new Set([`${clipGameLabel(clip)} clip`.toLocaleLowerCase(), ...clip.game?.trim() ? [`${clip.game.trim()} clip`.toLocaleLowerCase()] : []]);
	const generatedTitle = isGeneratedClipTitle(clip.name) || legacyDefaultTitles.has(clip.name.trim().toLocaleLowerCase()) || switchboardCaptureTitle.test(clip.name.trim());
	if (clip.titleEdited || !generatedTitle) return clip;
	return {
		...clip,
		name: createDefaultClipTitle(clipGameLabel(clip), clip.createdAt),
		titleEdited: false
	};
}
//#endregion
//#region src/shared/clip-track-levels.ts
function isClipAudioChannel(value) {
	return value === "game" || value === "chat" || value === "microphone" || value === "media";
}
function defaultClipTrackLevelForChannel(channel, defaults) {
	if (!channel || !defaults) return 100;
	const level = defaults[channel];
	return Number.isInteger(level) && level >= 0 && level <= 100 ? level : 100;
}
function resolveClipTrackLevel(levels, trackIndex, channel, defaults) {
	const explicit = levels?.[trackIndex];
	if (typeof explicit === "number" && Number.isInteger(explicit)) return Math.min(100, Math.max(0, explicit));
	return defaultClipTrackLevelForChannel(channel, defaults);
}
function channelForClipTrack(channels, trackIndex) {
	const channel = channels?.[trackIndex];
	return channel && isClipAudioChannel(channel) ? channel : void 0;
}
/**
* Store a per-clip track level while treating the configured defaults as
* "unset". Missing intermediate tracks are filled with their channel default
* so touching one fader never resets an untouched track to 100, and trailing
* tracks that match their default are trimmed to keep new clips inheriting
* future default changes.
*/
function applyClipTrackLevel(levels, channels, defaults, trackIndex, level) {
	const next = [...levels ?? []];
	while (next.length <= trackIndex) {
		const fillIndex = next.length;
		next.push(defaultClipTrackLevelForChannel(channelForClipTrack(channels, fillIndex), defaults));
	}
	next[trackIndex] = Math.min(100, Math.max(0, Math.round(level)));
	while (next.length > 0) {
		const lastIndex = next.length - 1;
		const lastDefault = defaultClipTrackLevelForChannel(channelForClipTrack(channels, lastIndex), defaults);
		if (next[lastIndex] !== lastDefault) break;
		next.pop();
	}
	return next;
}
/** Expand sparse per-clip levels into effective levels for every known channel. */
function effectiveClipTrackLevels(levels, channels, defaults) {
	const length = Math.max(levels?.length ?? 0, channels?.length ?? 0);
	return Array.from({ length }, (_, trackIndex) => resolveClipTrackLevel(levels, trackIndex, channelForClipTrack(channels, trackIndex), defaults));
}
/** True when the effective mix differs from a flat 100% mix (or trims exist). */
function hasEffectiveClipMixChanged(levels, channels, defaults) {
	return effectiveClipTrackLevels(levels, channels, defaults).some((level) => level !== 100);
}
//#endregion
//#region src/main/services/clip-library.ts
var supportedExtensions = /* @__PURE__ */ new Set([
	".mp4",
	".mkv",
	".webm",
	".mov"
]);
var waveformBucketCount = 180;
var waveformSampleRate = 8e3;
var waveformCacheLimit = 16;
var audioPreviewCacheLimit = 16;
var persistedAudioPreviewLimit = 32;
var ClipLibraryService = class {
	thumbnailDirectory;
	thumbnailQueue = Promise.resolve();
	waveformCache = /* @__PURE__ */ new Map();
	audioPreviewCache = /* @__PURE__ */ new Map();
	constructor(thumbnailDirectory) {
		this.thumbnailDirectory = thumbnailDirectory;
	}
	async reconcile(indexed, directory) {
		await mkdir(directory, { recursive: true });
		await mkdir(this.thumbnailDirectory, { recursive: true });
		await this.pruneAudioPreviews().catch((error) => console.warn("Clip audio preview cleanup failed.", error));
		const existing = [];
		for (const indexedClip of indexed) {
			const clip = normalizeClipRecord(indexedClip);
			try {
				await access(clip.path);
				if (clip.thumbnailPath) try {
					await access(clip.thumbnailPath);
					existing.push(clip);
				} catch {
					existing.push({
						...clip,
						thumbnailPath: void 0
					});
				}
				else existing.push(clip);
			} catch {
				if (clip.thumbnailPath) await rm(clip.thumbnailPath, { force: true });
			}
		}
		const byPath = new Map(existing.map((clip) => [resolve(clip.path).toLocaleLowerCase(), clip]));
		const handle = await opendir(directory);
		let inspected = 0;
		for await (const entry of handle) {
			if (!entry.isFile() || !supportedExtensions.has(extname(entry.name).toLocaleLowerCase())) continue;
			if (inspected >= 5e3) break;
			inspected += 1;
			const path = resolve(directory, entry.name);
			if (byPath.has(path.toLocaleLowerCase())) continue;
			try {
				const clip = await this.createClipFromFile(path);
				existing.push(clip);
				byPath.set(path.toLocaleLowerCase(), clip);
			} catch (error) {
				console.warn("Skipped an unreadable clip during library reconciliation.", basename(path), error);
			}
		}
		return existing.sort((left, right) => right.createdAt - left.createdAt);
	}
	needsEnrichment(clip) {
		return clip.audioChannels === void 0 || !clip.thumbnailPath || basename(clip.thumbnailPath) !== `${clip.id}.v2.jpg`;
	}
	enqueueThumbnail(clip, onReady) {
		this.thumbnailQueue = this.thumbnailQueue.catch(() => void 0).then(async () => {
			let audioChannels = clip.audioChannels;
			if (audioChannels === void 0) audioChannels = (await this.probe(clip.path)).audioChannels;
			if (clip.thumbnailPath && basename(clip.thumbnailPath) === `${clip.id}.v2.jpg`) try {
				await access(clip.thumbnailPath);
				onReady({
					thumbnailPath: clip.thumbnailPath,
					audioChannels
				});
				return;
			} catch {}
			const thumbnailPath = join(this.thumbnailDirectory, `${clip.id}.v2.jpg`);
			await this.generateThumbnail(clip.path, thumbnailPath, clip.durationMs);
			onReady({
				thumbnailPath,
				audioChannels
			});
			if (clip.thumbnailPath && resolve(clip.thumbnailPath) !== resolve(thumbnailPath)) await rm(clip.thumbnailPath, { force: true });
		}).catch((error) => console.warn("Clip thumbnail generation failed.", error));
	}
	async removeThumbnail(clip) {
		this.waveformCache.delete(clip.id);
		const previewKeys = [...this.audioPreviewCache.keys()].filter((key) => key.startsWith(`${clip.id}:`));
		const previewPaths = previewKeys.flatMap((key) => {
			const pending = this.audioPreviewCache.get(key);
			return pending ? [pending] : [];
		});
		for (const key of previewKeys) this.audioPreviewCache.delete(key);
		await Promise.all(previewPaths.map(async (pending) => {
			try {
				const path = await pending;
				await rm(path, { force: true });
			} catch {}
		}));
		if (clip.thumbnailPath) await rm(clip.thumbnailPath, { force: true });
	}
	loadAudioWaveform(clip) {
		const cached = this.waveformCache.get(clip.id);
		if (cached) {
			this.waveformCache.delete(clip.id);
			this.waveformCache.set(clip.id, cached);
			return cached;
		}
		const pending = this.analyzeAudioWaveform(clip).catch((error) => {
			this.waveformCache.delete(clip.id);
			throw error;
		});
		this.waveformCache.set(clip.id, pending);
		while (this.waveformCache.size > waveformCacheLimit) {
			const oldest = this.waveformCache.keys().next().value;
			if (!oldest) break;
			this.waveformCache.delete(oldest);
		}
		return pending;
	}
	prepareAudioPreview(clip, trackIndex) {
		if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 7) return Promise.reject(/* @__PURE__ */ new Error("The clip audio track index is invalid."));
		const cacheKey = `${clip.id}:${trackIndex}`;
		const cached = this.audioPreviewCache.get(cacheKey);
		if (cached) {
			this.audioPreviewCache.delete(cacheKey);
			this.audioPreviewCache.set(cacheKey, cached);
			return cached;
		}
		const pending = this.generateAudioPreview(clip, trackIndex).catch((error) => {
			this.audioPreviewCache.delete(cacheKey);
			throw error;
		});
		this.audioPreviewCache.set(cacheKey, pending);
		while (this.audioPreviewCache.size > audioPreviewCacheLimit) {
			const oldest = this.audioPreviewCache.keys().next().value;
			if (!oldest) break;
			this.audioPreviewCache.delete(oldest);
		}
		return pending;
	}
	async createClipFromFile(path) {
		const [file, media] = await Promise.all([stat(path), this.probe(path)]);
		const game = inferClipGame(parse(path).name);
		const createdAt = file.birthtimeMs > 0 ? Math.round(file.birthtimeMs) : Math.round(file.mtimeMs);
		return {
			id: randomUUID(),
			path,
			name: createDefaultClipTitle(game, createdAt),
			...game ? { game } : {},
			createdAt,
			durationMs: Math.max(0, Math.round(media.durationMs)),
			fileSize: file.size,
			width: media.width,
			height: media.height,
			fps: media.fps,
			...media.codec ? { codec: media.codec } : {},
			favorite: false,
			titleEdited: false,
			canvasSize: "original",
			audioChannels: media.audioChannels
		};
	}
	async renderExport(clip, destination, input, options = {}) {
		const startMs = Math.max(0, Math.min(input.startMs, clip.durationMs - 1));
		const endMs = Math.max(startMs + 1, Math.min(input.endMs, clip.durationMs));
		const durationSeconds = (endMs - startMs) / 1e3;
		const executable = findExecutable$1("SWITCHBOARD_FFMPEG", "ffmpeg");
		const seek = (startMs / 1e3).toFixed(3);
		const duration = durationSeconds.toFixed(3);
		const common = [
			"-hide_banner",
			"-loglevel",
			"error",
			"-ss",
			seek,
			"-i",
			clip.path,
			"-t",
			duration,
			"-map",
			"0:v:0",
			"-map_metadata",
			"0"
		];
		const originalVideo = [
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-pix_fmt",
			"yuv420p",
			"-vf",
			buildClipVideoFilter(clip.canvasSize)
		];
		const progress = options.onProgress ? {
			durationSeconds,
			onProgress: options.onProgress
		} : void 0;
		const audioLevels = clip.audioTrackLevels ?? [];
		const audioChannels = clip.audioChannels;
		const defaults = options.defaultTrackLevels;
		const audioTrackTrims = input.audioTrackTrims ?? clip.audioTrackTrims ?? [];
		const audioEditChanged = audioLevels.some((level) => level !== 100) || (audioChannels ?? []).some((channel, trackIndex) => (audioLevels[trackIndex] === void 0 ? resolveClipTrackLevel(audioLevels, trackIndex, channel, defaults) : audioLevels[trackIndex]) !== 100) || audioTrackTrims.some(Boolean);
		if (input.preset === "original" && !audioEditChanged) {
			await run$2(executable, [
				...common,
				"-map",
				"0:a?",
				...originalVideo,
				"-crf",
				"18",
				"-c:a",
				"aac",
				"-b:a",
				"160k",
				"-movflags",
				"+faststart",
				"-y",
				destination
			], options.signal, progress);
			return;
		}
		if (input.preset === "original") {
			const audioArguments = buildShareAudioArguments((await this.getAudioStreams(clip.path)).length, 160, audioLevels, audioTrackTrims, startMs, endMs, audioChannels, defaults);
			await run$2(executable, [
				...common,
				...audioArguments,
				...originalVideo,
				"-crf",
				"18",
				"-movflags",
				"+faststart",
				"-y",
				destination
			], options.signal, progress);
			return;
		}
		const targetBytes = exportPresetBytes$1[input.preset];
		const budgetKbps = targetBytes * 8 * .94 / durationSeconds / 1e3;
		const audioKbps = budgetKbps >= 420 ? 96 : 64;
		const sourceKbps = clip.fileSize * 8 / Math.max(1, clip.durationMs / 1e3) / 1e3;
		const videoKbps = Math.floor(Math.min(Math.max(120, budgetKbps - audioKbps), Math.max(120, sourceKbps - audioKbps)));
		if (budgetKbps < audioKbps + 120) throw new Error("This clip is too long for the selected file size. Choose a larger share preset or shorten the trim.");
		const audioArguments = buildShareAudioArguments((await this.getAudioStreams(clip.path)).length, audioKbps, audioLevels, audioTrackTrims, startMs, endMs, audioChannels, defaults);
		const bounds = shareVideoBounds(clip, videoKbps);
		const video = buildSizeLimitedShareVideoArguments(options.encoder ?? "libx264", videoKbps, buildClipVideoFilter(clip.canvasSize, bounds));
		await run$2(executable, [
			...common,
			...audioArguments,
			...video,
			"-movflags",
			"+faststart",
			"-y",
			destination
		], options.signal, progress);
		if ((await stat(destination)).size > targetBytes) throw new Error("The compressed clip exceeded the selected file size. Shorten the clip or choose a larger preset.");
	}
	async renderMontageExport(entries, destination, input, signal, options = {}) {
		const first = entries[0];
		if (!first) throw new Error("Add at least one clip before exporting the montage.");
		const executable = findExecutable$1("SWITCHBOARD_FFMPEG", "ffmpeg");
		const target = montageVideoTarget$1(first.clip, input.project.canvasSize);
		const temporaryDirectory = join(tmpdir(), `switchboard-montage-${randomUUID()}`);
		const concatPath = join(temporaryDirectory, "segments.txt");
		await mkdir(temporaryDirectory, { recursive: true });
		try {
			const renderedSegments = [];
			for (let index = 0; index < entries.length; index += 1) {
				if (signal?.aborted) throw abortError$1();
				const entry = entries[index];
				const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(4, "0")}.mp4`);
				await this.renderMontageSegment(executable, entry.clip, entry.segment, segmentPath, target, signal, options.defaultTrackLevels);
				renderedSegments.push(segmentPath);
			}
			await writeFile(concatPath, renderedSegments.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
			const common = [
				"-hide_banner",
				"-loglevel",
				"error",
				"-f",
				"concat",
				"-safe",
				"0",
				"-i",
				concatPath
			];
			if (input.preset === "original") {
				await run$2(executable, [
					...common,
					"-c",
					"copy",
					"-movflags",
					"+faststart",
					"-y",
					destination
				], signal);
				return;
			}
			const durationSeconds = input.project.durationMs / 1e3;
			const budgetKbps = exportPresetBytes$1[input.preset] * 8 * .94 / durationSeconds / 1e3;
			const audioKbps = budgetKbps >= 420 ? 96 : 64;
			const videoKbps = Math.floor(Math.max(120, budgetKbps - audioKbps));
			if (budgetKbps < audioKbps + 120) throw new Error("This montage is too long for the selected file size. Choose a larger share preset or shorten the sequence.");
			const passLog = join(temporaryDirectory, "montage-pass");
			await run$2(executable, [
				...common,
				"-map",
				"0:v:0",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-pix_fmt",
				"yuv420p",
				"-b:v",
				`${videoKbps}k`,
				"-pass",
				"1",
				"-passlogfile",
				passLog,
				"-an",
				"-f",
				"null",
				process.platform === "win32" ? "NUL" : "/dev/null"
			], signal);
			await run$2(executable, [
				...common,
				"-map",
				"0:v:0",
				"-map",
				"0:a:0",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-pix_fmt",
				"yuv420p",
				"-b:v",
				`${videoKbps}k`,
				"-pass",
				"2",
				"-passlogfile",
				passLog,
				"-c:a",
				"aac",
				"-b:a",
				`${audioKbps}k`,
				"-movflags",
				"+faststart",
				"-y",
				destination
			], signal);
		} finally {
			await rm(temporaryDirectory, {
				recursive: true,
				force: true
			});
		}
	}
	async renderMontageSegment(executable, clip, segment, destination, target, signal, defaultTrackLevels) {
		const streams = await this.getAudioStreams(clip.path);
		const durationSeconds = (segment.trimEndMs - segment.trimStartMs) / 1e3;
		const videoFilter = buildMontageVideoFilter(segment, target);
		const audio = buildMontageSegmentAudioFilter(streams.length, segment, clip.audioChannels, defaultTrackLevels);
		const inputArguments = ["-i", clip.path];
		let filter;
		let audioMap;
		if (audio) {
			filter = `${videoFilter};${audio.filter}`;
			audioMap = "[aout]";
		} else {
			inputArguments.push("-f", "lavfi", "-t", durationSeconds.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
			filter = videoFilter;
			audioMap = "1:a:0";
		}
		await run$2(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			...inputArguments,
			"-filter_complex",
			filter,
			"-map",
			"[vout]",
			"-map",
			audioMap,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"18",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"160k",
			"-ar",
			"48000",
			"-ac",
			"2",
			"-t",
			durationSeconds.toFixed(3),
			"-movflags",
			"+faststart",
			"-y",
			destination
		], signal);
	}
	async probe(path) {
		const output = await run$2(findExecutable$1("SWITCHBOARD_FFPROBE", "ffprobe"), [
			"-v",
			"error",
			"-print_format",
			"json",
			"-show_entries",
			"format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate:stream_tags=title,name,handler_name",
			path
		]);
		const parsed = JSON.parse(output);
		const video = parsed.streams?.find((stream) => stream.codec_type === "video");
		if (!video) throw new Error("Video stream not found.");
		return {
			durationMs: Number(parsed.format?.duration ?? 0) * 1e3,
			width: video.width ?? 0,
			height: video.height ?? 0,
			fps: parseRate(video.avg_frame_rate),
			...video.codec_name ? { codec: video.codec_name } : {},
			audioChannels: [...new Set((parsed.streams ?? []).filter((stream) => stream.codec_type === "audio").map((stream) => audioChannelFromTitle(audioStreamLabel(stream.tags))).filter((channel) => channel !== null))]
		};
	}
	async getAudioStreams(path) {
		const output = await run$2(findExecutable$1("SWITCHBOARD_FFPROBE", "ffprobe"), [
			"-v",
			"error",
			"-select_streams",
			"a",
			"-show_entries",
			"stream=index:stream_tags=title,name,handler_name",
			"-of",
			"json",
			path
		]);
		return (JSON.parse(output).streams ?? []).slice(0, 8).map((stream, trackIndex) => {
			const label = audioStreamLabel(stream.tags);
			return {
				trackIndex,
				label: label || `Audio ${trackIndex + 1}`,
				channel: audioChannelFromTitle(label)
			};
		});
	}
	async analyzeAudioWaveform(clip) {
		const streams = await this.getAudioStreams(clip.path);
		const indexedChannels = clip.audioChannels?.length === streams.length ? clip.audioChannels : [];
		const tracks = [];
		for (const stream of streams) {
			const samples = await readWaveformSamples(clip.path, stream.trackIndex, clip.durationMs);
			const channel = stream.channel ?? indexedChannels[stream.trackIndex];
			tracks.push({
				trackIndex: stream.trackIndex,
				label: channel && stream.label.startsWith("Audio ") ? audioChannelLabel(channel) : stream.label,
				...channel ? { channel } : {},
				samples
			});
		}
		return {
			clipId: clip.id,
			tracks
		};
	}
	async generateAudioPreview(clip, trackIndex) {
		if (!(await this.getAudioStreams(clip.path)).some((stream) => stream.trackIndex === trackIndex)) throw new Error("The clip audio track no longer exists.");
		const source = await stat(clip.path);
		const identity = createHash("sha1").update(`${clip.id}\0${clip.path}\0${source.size}\0${source.mtimeMs}\0${trackIndex}`).digest("hex");
		const previewDirectory = join(this.thumbnailDirectory, "audio-preview");
		const destination = join(previewDirectory, `${identity}.m4a`);
		if (existsSync(destination)) return destination;
		await mkdir(previewDirectory, { recursive: true });
		const temporary = `${destination}.${randomUUID()}.tmp.m4a`;
		const executable = findExecutable$1("SWITCHBOARD_FFMPEG", "ffmpeg");
		try {
			await run$2(executable, [
				"-hide_banner",
				"-loglevel",
				"error",
				"-i",
				clip.path,
				"-map",
				`0:a:${trackIndex}`,
				"-vn",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-movflags",
				"+faststart",
				"-y",
				temporary
			]);
			await rename(temporary, destination);
			return destination;
		} finally {
			await rm(temporary, { force: true });
		}
	}
	async pruneAudioPreviews() {
		const previewDirectory = join(this.thumbnailDirectory, "audio-preview");
		await mkdir(previewDirectory, { recursive: true });
		const handle = await opendir(previewDirectory);
		const previews = [];
		for await (const entry of handle) {
			if (!entry.isFile() || extname(entry.name).toLocaleLowerCase() !== ".m4a") continue;
			const path = join(previewDirectory, entry.name);
			try {
				previews.push({
					path,
					mtimeMs: (await stat(path)).mtimeMs
				});
			} catch {}
		}
		previews.sort((left, right) => right.mtimeMs - left.mtimeMs);
		await Promise.all(previews.slice(persistedAudioPreviewLimit).map(({ path }) => rm(path, { force: true })));
	}
	async generateThumbnail(path, thumbnailPath, durationMs) {
		await mkdir(dirname(thumbnailPath), { recursive: true });
		const executable = findExecutable$1("SWITCHBOARD_FFMPEG", "ffmpeg");
		const durationSeconds = durationMs / 1e3;
		const seekSeconds = durationSeconds <= 1 ? 0 : Math.max(.5, Math.min(durationSeconds - .25, durationSeconds * .32));
		const temporary = `${thumbnailPath}.${createHash("sha1").update(path).digest("hex").slice(0, 8)}.tmp.jpg`;
		try {
			await run$2(executable, [
				"-hide_banner",
				"-loglevel",
				"error",
				"-ss",
				seekSeconds.toFixed(3),
				"-i",
				path,
				"-frames:v",
				"1",
				"-vf",
				"scale='min(960,iw)':-2:flags=lanczos",
				"-q:v",
				"2",
				"-y",
				temporary
			]);
			await rename(temporary, thumbnailPath);
		} finally {
			await rm(temporary, { force: true });
		}
	}
};
var exportPresetBytes$1 = {
	"10mb": 10485760,
	"25mb": 26214400,
	"50mb": 52428800
};
function selectShareVideoEncoder(encoders) {
	const available = new Set(encoders.map((encoder) => encoder.toLocaleLowerCase()));
	for (const encoder of [
		"h264_nvenc",
		"h264_amf",
		"h264_qsv"
	]) if (available.has(encoder)) return encoder;
	return "libx264";
}
function shareVideoBounds(clip, videoKbps) {
	const fps = Math.max(1, clip.fps || 30);
	const bitrateAt60Fps = videoKbps * 60 / fps;
	const height = bitrateAt60Fps < 1800 ? 720 : bitrateAt60Fps < 4500 ? 1080 : bitrateAt60Fps < 8e3 ? 1440 : void 0;
	if (!height) return void 0;
	return clip.canvasSize === "9:16" || clip.height > clip.width ? {
		width: height,
		height: Math.round(height * 16 / 9)
	} : {
		width: Math.round(height * 16 / 9),
		height
	};
}
function buildSizeLimitedShareVideoArguments(encoder, videoKbps, videoFilter) {
	const rateControl = [
		"-b:v",
		`${videoKbps}k`,
		"-maxrate",
		`${videoKbps}k`,
		"-bufsize",
		`${videoKbps * 2}k`
	];
	return [
		...encoder === "h264_nvenc" ? [
			"-c:v",
			encoder,
			"-preset",
			"p4",
			"-tune",
			"hq",
			"-rc",
			"vbr",
			"-multipass",
			"qres"
		] : encoder === "h264_amf" ? [
			"-c:v",
			encoder,
			"-quality",
			"balanced",
			"-rc",
			"vbr_peak"
		] : encoder === "h264_qsv" ? [
			"-c:v",
			encoder,
			"-preset",
			"medium"
		] : [
			"-c:v",
			"libx264",
			"-preset",
			"veryfast"
		],
		...rateControl,
		"-pix_fmt",
		"yuv420p",
		"-vf",
		videoFilter
	];
}
function montageVideoTarget$1(clip, canvasSize) {
	if (clip.width <= 0 || clip.height <= 0) throw new Error(`Video dimensions are unavailable for ${clip.name}.`);
	const sourceWidth = Math.max(2, Math.floor(clip.width / 2) * 2);
	const sourceHeight = Math.max(2, Math.floor(clip.height / 2) * 2);
	if (canvasSize === "9:16") return {
		width: Math.max(2, Math.floor(sourceHeight * 9 / 16 / 2) * 2),
		height: sourceHeight,
		fps: Math.max(1, clip.fps || 30),
		canvasSize
	};
	return {
		width: sourceWidth,
		height: sourceHeight,
		fps: Math.max(1, clip.fps || 30),
		canvasSize
	};
}
function buildMontageVideoFilter(segment, target) {
	return `[0:v:0]trim=start=${(segment.trimStartMs / 1e3).toFixed(3)}:end=${(segment.trimEndMs / 1e3).toFixed(3)},setpts=PTS-STARTPTS,${target.canvasSize === "9:16" ? `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=${target.width}:${target.height}:flags=lanczos` : `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`},setsar=1,fps=${target.fps.toFixed(3)},format=yuv420p[vout]`;
}
function buildMontageSegmentAudioFilter(streamCount, segment, channels, defaults) {
	const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
		trackIndex,
		level: resolveClipTrackLevel(segment.audioTrackLevels, trackIndex, channels?.[trackIndex], defaults),
		startMs: Math.max(segment.trimStartMs, segment.audioTrackTrims?.[trackIndex]?.startMs ?? segment.trimStartMs),
		endMs: Math.min(segment.trimEndMs, segment.audioTrackTrims?.[trackIndex]?.endMs ?? segment.trimEndMs)
	})).filter((track) => track.level > 0 && track.endMs > track.startMs);
	if (active.length === 0) return null;
	const segmentDurationSeconds = (segment.trimEndMs - segment.trimStartMs) / 1e3;
	const filters = active.map((track, index) => {
		const delayMs = track.startMs - segment.trimStartMs;
		const chain = [`atrim=start=${(track.startMs / 1e3).toFixed(3)}:end=${(track.endMs / 1e3).toFixed(3)}`, "asetpts=PTS-STARTPTS"];
		if (delayMs > 0) chain.push(`adelay=${delayMs}:all=1`);
		chain.push(`volume=${(track.level / 100).toFixed(2)}`);
		return `[0:a:${track.trackIndex}]${chain.join(",")}[montage-track-${index}]`;
	});
	const inputs = active.map((_track, index) => `[montage-track-${index}]`).join("");
	filters.push(active.length > 1 ? `${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=1[montage-mix]` : `${inputs}anull[montage-mix]`);
	filters.push(`[montage-mix]apad=whole_dur=${segmentDurationSeconds.toFixed(3)},atrim=duration=${segmentDurationSeconds.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`);
	return { filter: filters.join(";") };
}
function buildShareAudioArguments(streamCount, bitrateKbps, levels = [], trims = [], selectionStartMs = 0, selectionEndMs = Number.POSITIVE_INFINITY, channels, defaults) {
	if (streamCount <= 0) return ["-an"];
	const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
		trackIndex,
		level: resolveClipTrackLevel(levels, trackIndex, channels?.[trackIndex], defaults),
		startMs: Math.max(selectionStartMs, trims[trackIndex]?.startMs ?? selectionStartMs),
		endMs: Math.min(selectionEndMs, trims[trackIndex]?.endMs ?? selectionEndMs)
	})).filter((track) => track.level > 0 && track.endMs > track.startMs);
	if (active.length === 0) return ["-an"];
	const hasTrackTrims = active.some((track) => track.startMs > selectionStartMs || track.endMs < selectionEndMs);
	if (active.length === 1 && active[0].level === 100 && !hasTrackTrims) return [
		"-map",
		`0:a:${active[0].trackIndex}`,
		"-c:a",
		"aac",
		"-b:a",
		`${bitrateKbps}k`
	];
	const filters = active.map((track, index) => {
		const filtersForTrack = [];
		if (track.startMs > selectionStartMs || track.endMs < selectionEndMs) {
			const relativeStartSeconds = (track.startMs - selectionStartMs) / 1e3;
			const relativeEndSeconds = (track.endMs - selectionStartMs) / 1e3;
			filtersForTrack.push(`atrim=start=${relativeStartSeconds.toFixed(3)}:end=${relativeEndSeconds.toFixed(3)}`, "asetpts=PTS-STARTPTS");
			const delayMs = Math.round(track.startMs - selectionStartMs);
			if (delayMs > 0) filtersForTrack.push(`adelay=${delayMs}:all=1`);
		}
		filtersForTrack.push(`volume=${(track.level / 100).toFixed(2)}`);
		return `[0:a:${track.trackIndex}]${filtersForTrack.join(",")}[track${index}]`;
	});
	const inputs = active.map((_track, index) => `[track${index}]`).join("");
	if (active.length > 1) filters.push(`${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=1[aout]`);
	else filters.push(`${inputs}anull[aout]`);
	return [
		"-filter_complex",
		filters.join(";"),
		"-map",
		"[aout]",
		"-c:a",
		"aac",
		"-b:a",
		`${bitrateKbps}k`
	];
}
function audioChannelFromTitle(title) {
	const normalized = title?.trim().toLocaleLowerCase();
	if (!normalized) return null;
	if (normalized.includes("+")) return null;
	if (normalized.includes("microphone") || normalized === "mic") return "microphone";
	if (normalized.includes("chat")) return "chat";
	if (normalized.includes("media")) return "media";
	if (normalized.includes("game") || normalized.includes("system")) return "game";
	if (normalized.includes("switchboard clip mix")) return "game";
	return null;
}
function audioStreamLabel(tags) {
	return [
		tags?.title,
		tags?.name,
		tags?.handler_name
	].map((value) => value?.trim()).find((value) => value && value.toLocaleLowerCase() !== "soundhandler");
}
function audioChannelLabel(channel) {
	if (channel === "microphone") return "Microphone";
	return channel.charAt(0).toUpperCase() + channel.slice(1);
}
function parseRate(value) {
	if (!value) return 0;
	const [numerator, denominator = "1"] = value.split("/");
	const result = Number(numerator) / Number(denominator);
	return Number.isFinite(result) ? Math.round(result * 1e3) / 1e3 : 0;
}
function readWaveformSamples(path, trackIndex, durationMs) {
	const executable = findExecutable$1("SWITCHBOARD_FFMPEG", "ffmpeg");
	return new Promise((resolvePromise, reject) => {
		const child = spawn(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			path,
			"-map",
			`0:a:${trackIndex}`,
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(waveformSampleRate),
			"-f",
			"s16le",
			"pipe:1"
		], {
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const peaks = new Float32Array(waveformBucketCount);
		const expectedSamples = Math.max(1, Math.round(durationMs / 1e3 * waveformSampleRate));
		let sampleIndex = 0;
		let carry = null;
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			const bytes = carry ? Buffer.concat([carry, chunk]) : chunk;
			const evenLength = bytes.length - bytes.length % 2;
			for (let offset = 0; offset < evenLength; offset += 2) {
				const bucket = Math.min(179, Math.floor(sampleIndex / expectedSamples * waveformBucketCount));
				const amplitude = Math.abs(bytes.readInt16LE(offset)) / 32768;
				if (amplitude > peaks[bucket]) peaks[bucket] = amplitude;
				sampleIndex += 1;
			}
			carry = evenLength < bytes.length ? bytes.subarray(evenLength) : null;
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => {
			if (stderr.length < 16384) stderr += chunk;
		});
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `${executable} exited with code ${code}`));
				return;
			}
			const peak = peaks.reduce((maximum, value) => Math.max(maximum, value), 0);
			if (peak <= 0) {
				resolvePromise(Array.from(peaks, () => 0));
				return;
			}
			resolvePromise(Array.from(peaks, (value) => Math.round(Math.pow(value / peak, .58) * 1e3) / 1e3));
		});
	});
}
function buildClipVideoFilter(canvasSize, bounds) {
	const scale = bounds ? `scale=w='min(iw,${bounds.width})':h='min(ih,${bounds.height})':force_original_aspect_ratio=decrease:force_divisible_by=2` : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
	if (canvasSize === "9:16") return `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',${scale}`;
	return scale;
}
function findExecutable$1(environmentName, baseName) {
	const configured = process.env[environmentName];
	if (configured) return configured;
	const executable = process.platform === "win32" ? `${baseName}.exe` : baseName;
	const packagedCandidate = join(process.resourcesPath, "capture-host", "ffmpeg", executable);
	if (existsSync(packagedCandidate)) return packagedCandidate;
	for (const segment of (process.env.PATH ?? "").split(delimiter)) {
		const candidate = join(segment, executable);
		try {
			if (existsSync(candidate)) return candidate;
		} catch {}
	}
	return executable;
}
function parseFfmpegProgressLine(line, durationSeconds) {
	const [key, rawValue] = line.trim().split("=", 2);
	if (key === "progress" && rawValue === "end") return 1;
	if (key !== "out_time_us" && key !== "out_time_ms") return null;
	const elapsedMicroseconds = Number(rawValue);
	if (!Number.isFinite(elapsedMicroseconds) || durationSeconds <= 0) return null;
	return Math.min(1, Math.max(0, elapsedMicroseconds / 1e6 / durationSeconds));
}
function run$2(executable, arguments_, signal, progress) {
	return new Promise((resolvePromise, reject) => {
		if (signal?.aborted) {
			reject(abortError$1());
			return;
		}
		const effectiveArguments = progress ? [
			"-progress",
			"pipe:1",
			"-nostats",
			...arguments_
		] : arguments_;
		const child = spawn(executable, effectiveArguments, {
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			...signal ? { signal } : {}
		});
		let stdout = "";
		let stderr = "";
		let progressBuffer = "";
		let lastProgress = -1;
		let processError = null;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			if (!progress) {
				stdout += chunk;
				return;
			}
			progressBuffer += chunk;
			const lines = progressBuffer.split(/\r?\n/);
			progressBuffer = lines.pop() ?? "";
			for (const line of lines) {
				const value = parseFfmpegProgressLine(line, progress.durationSeconds);
				if (value === null || value <= lastProgress) continue;
				lastProgress = value;
				progress.onProgress(value);
			}
		});
		child.stderr.on("data", (chunk) => {
			if (stderr.length < 65536) stderr += chunk;
		});
		child.once("error", (error) => {
			processError = error;
		});
		child.once("close", (code) => {
			if (signal?.aborted) reject(abortError$1());
			else if (processError) reject(processError);
			else if (code === 0) resolvePromise(stdout);
			else reject(new Error(stderr.trim() || `${executable} exited with code ${code}`));
		});
	});
}
function abortError$1() {
	const error = /* @__PURE__ */ new Error("Export cancelled.");
	error.name = "AbortError";
	return error;
}
//#endregion
//#region src/main/services/montage-v2-renderer.ts
var exportPresetBytes = {
	"10mb": 10485760,
	"25mb": 26214400,
	"50mb": 52428800
};
async function renderMontageV2(input) {
	const first = input.entries[0];
	if (!first) throw new Error("Add at least one clip before exporting the montage.");
	const executable = findExecutable("SWITCHBOARD_FFMPEG", "ffmpeg");
	const target = montageVideoTarget(first.clip, input.project.canvasSize);
	const temporaryDirectory = join(tmpdir(), `switchboard-montage-v2-${randomUUID()}`);
	const concatPath = join(temporaryDirectory, "segments.txt");
	await mkdir(temporaryDirectory, { recursive: true });
	const targetBytes = input.targetSizeMb ? input.targetSizeMb * 1048576 : input.preset !== "original" ? exportPresetBytes[input.preset] : void 0;
	const budgetKbps = targetBytes ? targetBytes * 8 * .9 / Math.max(.1, input.project.durationMs / 1e3) / 1e3 : void 0;
	const audioKbps = budgetKbps && budgetKbps < 420 ? 64 : 128;
	const videoKbps = budgetKbps ? Math.floor(budgetKbps - audioKbps) : void 0;
	try {
		if (videoKbps !== void 0 && videoKbps < 120) throw new Error("This size is too small for the montage runtime. Choose a larger target.");
		const renderedSegments = [];
		let beforeMs = 0;
		let encoder = input.encoder ?? "libx264";
		for (let index = 0; index < input.entries.length; index += 1) {
			if (input.signal?.aborted) throw abortError();
			const entry = input.entries[index];
			if (!entry) continue;
			const segmentPath = join(temporaryDirectory, `segment-${String(index).padStart(4, "0")}.mp4`);
			const durationMs = editedDurationMs(entry.segment.trimStartMs, entry.segment.trimEndMs, entry.segment.videoEdits);
			encoder = await renderMontageSegment(executable, entry, segmentPath, target, input.signal, encoder, videoKbps, audioKbps, (fraction) => input.onProgress?.((beforeMs + fraction * durationMs) / input.project.durationMs * .9), Boolean(input.project.music?.ducking?.enabled));
			renderedSegments.push(segmentPath);
			beforeMs += durationMs;
			input.onProgress?.(beforeMs / input.project.durationMs * .9);
		}
		await writeFile(concatPath, renderedSegments.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
		const concatInput = [
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			concatPath
		];
		const mixPlan = input.project.music && input.musicPath ? buildMontageMusicMixPlan(input.project.music, input.project.durationMs, input.musicPath) : null;
		input.onProgress?.(.92);
		if (!mixPlan) await run$1(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			...concatInput,
			"-map",
			"0:v:0",
			"-map",
			"0:a:0",
			"-c",
			"copy",
			"-movflags",
			"+faststart",
			"-y",
			input.destination
		], input.signal);
		else await run$1(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			...concatInput,
			...mixPlan.inputArguments,
			"-filter_complex",
			mixPlan.filter,
			"-map",
			"0:v:0",
			"-map",
			mixPlan.audioMap,
			"-c:v",
			"copy",
			"-c:a",
			"aac",
			"-b:a",
			`${audioKbps}k`,
			"-ar",
			"48000",
			"-ac",
			"2",
			"-movflags",
			"+faststart",
			"-y",
			input.destination
		], input.signal);
		if (targetBytes && (await stat(input.destination)).size > targetBytes) throw new Error("The encoded file exceeded its size target. Choose a larger target and try again.");
		input.onProgress?.(1);
	} finally {
		await rm(temporaryDirectory, {
			recursive: true,
			force: true
		});
	}
}
async function renderMontageSegment(executable, entry, destination, target, signal, encoder = "libx264", videoKbps, audioKbps = 128, onProgress, includeVoice = false) {
	const { clip } = entry;
	const sourceStartMs = entry.segment.trimStartMs;
	const segment = {
		...entry.segment,
		trimStartMs: 0,
		trimEndMs: entry.segment.trimEndMs - sourceStartMs,
		audioTrackTrims: entry.segment.audioTrackTrims?.map((trim) => trim ? {
			startMs: Math.max(0, trim.startMs - sourceStartMs),
			endMs: Math.max(0, trim.endMs - sourceStartMs)
		} : null),
		videoEdits: entry.segment.videoEdits ? {
			...entry.segment.videoEdits,
			text: entry.segment.videoEdits.text ? {
				...entry.segment.videoEdits.text,
				startMs: entry.segment.videoEdits.text.startMs - sourceStartMs,
				endMs: entry.segment.videoEdits.text.endMs - sourceStartMs
			} : void 0
		} : void 0
	};
	const streamCount = await getAudioStreamCount(clip.path, signal);
	const durationSeconds = editedDurationMs(entry.segment.trimStartMs, entry.segment.trimEndMs, entry.segment.videoEdits) / 1e3;
	const textPath = segment.videoEdits?.text?.content ? `${destination}.txt` : void 0;
	if (textPath) await writeFile(textPath, segment.videoEdits.text.content, "utf8");
	const advanced = hasAdvancedEdits(entry.segment.videoEdits) || !["original", "9:16"].includes(target.canvasSize) || includeVoice;
	const inputArguments = [
		"-ss",
		(sourceStartMs / 1e3).toFixed(3),
		"-t",
		(segment.trimEndMs / 1e3).toFixed(3),
		"-i",
		clip.path
	];
	let filter;
	let audioMap;
	if (advanced) {
		const effectDirectory = `${destination}.effects`;
		await mkdir(effectDirectory, { recursive: true });
		filter = `${await buildEditedVideoGraph(clip, entry.segment, target, effectDirectory)};${buildEditedAudioGraph(clip, entry.segment, streamCount, includeVoice)}`;
		audioMap = "[aout]";
	} else {
		const videoFilter = buildMontageV2VideoFilter(segment, target, textPath);
		const audioFilter = buildMontageV2SegmentAudioFilter(streamCount, segment);
		if (audioFilter) {
			filter = `${videoFilter};${audioFilter}`;
			audioMap = "[aout]";
		} else {
			inputArguments.push("-f", "lavfi", "-t", durationSeconds.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
			filter = videoFilter;
			audioMap = "1:a:0";
		}
	}
	const encode = async (selectedEncoder) => {
		const codec = videoKbps !== void 0 ? buildSizeLimitedShareVideoArguments(selectedEncoder, videoKbps, "").slice(0, -2) : selectedEncoder === "h264_nvenc" ? [
			"-c:v",
			selectedEncoder,
			"-preset",
			"p4",
			"-rc",
			"vbr",
			"-cq",
			"18",
			"-b:v",
			"0"
		] : selectedEncoder === "h264_amf" ? [
			"-c:v",
			selectedEncoder,
			"-quality",
			"balanced",
			"-rc",
			"cqp",
			"-qp_i",
			"18",
			"-qp_p",
			"18"
		] : selectedEncoder === "h264_qsv" ? [
			"-c:v",
			selectedEncoder,
			"-preset",
			"fast",
			"-global_quality",
			"18"
		] : [
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"18"
		];
		await run$1(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			...inputArguments,
			"-filter_complex_threads",
			"2",
			"-filter_complex",
			filter,
			"-map",
			"[vout]",
			"-map",
			audioMap,
			...includeVoice ? ["-map", "[voiceout]"] : [],
			...codec,
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			`${audioKbps}k`,
			"-ar",
			"48000",
			"-ac",
			"2",
			"-t",
			durationSeconds.toFixed(3),
			"-movflags",
			"+faststart",
			"-y",
			destination
		], signal, durationSeconds, onProgress);
	};
	try {
		await encode(encoder);
		return encoder;
	} catch (error) {
		if (encoder === "libx264" || signal?.aborted) throw error;
		await encode("libx264");
		return "libx264";
	}
}
function buildMontageV2VideoFilter(segment, target, textPath) {
	const start = (segment.trimStartMs / 1e3).toFixed(3);
	const end = (segment.trimEndMs / 1e3).toFixed(3);
	const normalize = target.canvasSize === "9:16" ? `crop='if(gte(iw/ih,0.5625),trunc(ih*0.5625/2)*2,iw)':'if(gte(iw/ih,0.5625),ih,trunc(iw/0.5625/2)*2)',scale=${target.width}:${target.height}:flags=lanczos` : `scale=${target.width}:${target.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${target.width}:${target.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
	const edits = segment.videoEdits;
	const speed = edits?.speed ?? 1;
	const adjustments = [];
	if (edits?.flipHorizontal) adjustments.push("hflip");
	if (edits?.brightness) {
		const expression = `clip(val*${1 + edits.brightness},0,255)`;
		adjustments.push(`lutrgb=r='${expression}':g='${expression}':b='${expression}'`);
	}
	if (edits?.contrast !== void 0 && edits.contrast !== 1) {
		const expression = `clip((val-127.5)*${edits.contrast}+127.5,0,255)`;
		adjustments.push(`lutrgb=r='${expression}':g='${expression}':b='${expression}'`);
	}
	if (edits?.saturation !== void 0 && edits.saturation !== 1) {
		const amount = edits.saturation;
		const r = .213 * (1 - amount), g = .715 * (1 - amount), b = .072 * (1 - amount);
		adjustments.push(`colorchannelmixer=rr=${r + amount}:rg=${g}:rb=${b}:gr=${r}:gg=${g + amount}:gb=${b}:br=${r}:bg=${g}:bb=${b + amount}`);
	}
	const text = edits?.text;
	if (text?.content && textPath) {
		const from = Math.max(0, (text.startMs - segment.trimStartMs) / speed / 1e3);
		const to = Math.max(0, (text.endMs - segment.trimStartMs) / speed / 1e3);
		const y = text.position === "top" ? "h*0.08" : text.position === "bottom" ? "h*0.92-text_h" : "(h-text_h)/2";
		const longest = Math.max(1, ...text.content.split("\n").map((line) => [...line].length));
		const fontSize = Math.max(1, Math.round(Math.min(target.height * videoTextSize[text.size], target.width * .88 / (longest * .65), target.height * .7 / Math.max(1, text.content.split("\n").length) / 1.2)));
		const font = process.platform === "win32" ? `fontfile=${filterPath(join(process.env.WINDIR ?? "C:/Windows", "Fonts", "arialbd.ttf"))}:` : "font=DejaVu Sans:";
		adjustments.push(`drawtext=${font}textfile=${filterPath(textPath)}:expansion=none:fontsize=${fontSize}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-text_w)/2:y=${y}:enable='gte(t,${from.toFixed(3)})*lt(t,${to.toFixed(3)})'`);
	}
	const look = adjustments.length ? `,${adjustments.join(",")}` : "";
	return `[0:v:0]trim=start=${start}:end=${end},setpts=${speed === 1 ? "PTS-STARTPTS" : `(PTS-STARTPTS)/${speed}`},${normalize},setsar=1,fps=${target.fps.toFixed(3)}${look},format=yuv420p[vout]`;
}
function buildMontageV2SegmentAudioFilter(streamCount, segment) {
	if (segment.muted || segment.volume <= 0) return null;
	const active = Array.from({ length: streamCount }, (_, trackIndex) => ({
		trackIndex,
		level: Math.min(100, Math.max(0, segment.audioTrackLevels?.[trackIndex] ?? 100)),
		startMs: Math.max(segment.trimStartMs, segment.audioTrackTrims?.[trackIndex]?.startMs ?? segment.trimStartMs),
		endMs: Math.min(segment.trimEndMs, segment.audioTrackTrims?.[trackIndex]?.endMs ?? segment.trimEndMs)
	})).filter((track) => track.level > 0 && track.endMs > track.startMs);
	if (active.length === 0) return null;
	const speed = segment.videoEdits?.speed ?? 1;
	const segmentDurationSeconds = editedDurationMs(segment.trimStartMs, segment.trimEndMs, segment.videoEdits) / 1e3;
	const filters = active.map((track, index) => {
		const delayMs = (track.startMs - segment.trimStartMs) / speed;
		const gain = track.level / 100 * segment.volume;
		const chain = [`atrim=start=${(track.startMs / 1e3).toFixed(3)}:end=${(track.endMs / 1e3).toFixed(3)}`, "asetpts=PTS-STARTPTS"];
		chain.push(...tempoFilters(speed));
		if (delayMs > 0) chain.push(`adelay=${Math.round(delayMs)}:all=1`);
		chain.push(`volume=${gain.toFixed(4)}`);
		return `[0:a:${track.trackIndex}]${chain.join(",")}[montage-v2-track-${index}]`;
	});
	const inputs = active.map((_track, index) => `[montage-v2-track-${index}]`).join("");
	filters.push(active.length > 1 ? `${inputs}amix=inputs=${active.length}:duration=longest:dropout_transition=0:normalize=0[montage-v2-mix]` : `${inputs}anull[montage-v2-mix]`);
	filters.push(`[montage-v2-mix]apad=whole_dur=${segmentDurationSeconds.toFixed(3)},atrim=duration=${segmentDurationSeconds.toFixed(3)},aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95[aout]`);
	return filters.join(";");
}
function buildMontageMusicMixPlan(track, projectDurationMs, musicPath) {
	if (track.muted || track.volume <= 0 || track.timelineStartMs >= projectDurationMs) return null;
	const sourceDurationMs = track.sourceEndMs - track.sourceStartMs;
	const remainingProjectMs = projectDurationMs - track.timelineStartMs;
	const activeDurationMs = track.loop ? remainingProjectMs : Math.min(sourceDurationMs, remainingProjectMs);
	if (sourceDurationMs < 100 || activeDurationMs < 1) return null;
	const sourceStartSeconds = (track.sourceStartMs / 1e3).toFixed(3);
	const sourceEndSeconds = (track.sourceEndMs / 1e3).toFixed(3);
	const activeDurationSeconds = (activeDurationMs / 1e3).toFixed(3);
	const musicChain = [
		`atrim=start=${sourceStartSeconds}:end=${sourceEndSeconds}`,
		"asetpts=PTS-STARTPTS",
		"aresample=48000",
		"aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo"
	];
	if (track.loop && activeDurationMs > sourceDurationMs) musicChain.push(`aloop=loop=-1:size=${Math.max(1, Math.round(sourceDurationMs * 48))}`);
	musicChain.push(`atrim=duration=${activeDurationSeconds}`);
	const fadeInMs = Math.min(track.fadeInMs, Math.floor(activeDurationMs / 2));
	const fadeOutMs = Math.min(track.fadeOutMs, Math.floor(activeDurationMs / 2));
	if (fadeInMs > 0) musicChain.push(`afade=t=in:st=0:d=${(fadeInMs / 1e3).toFixed(3)}`);
	if (fadeOutMs > 0) musicChain.push(`afade=t=out:st=${((activeDurationMs - fadeOutMs) / 1e3).toFixed(3)}:d=${(fadeOutMs / 1e3).toFixed(3)}`);
	musicChain.push(`volume=${track.volume.toFixed(4)}`);
	if (track.timelineStartMs > 0) musicChain.push(`adelay=${track.timelineStartMs}:all=1`);
	musicChain.push(`apad=whole_dur=${(projectDurationMs / 1e3).toFixed(3)}`, `atrim=duration=${(projectDurationMs / 1e3).toFixed(3)}`);
	musicChain.push(`volume='${automationExpression(track.automation)}':eval=frame`);
	const ducking = track.ducking?.enabled ? track.ducking : null;
	const filter = [
		`[0:a:0]aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[montage-clips]`,
		`[1:a:0]${musicChain.join(",")}[montage-music]`,
		...ducking ? [`[montage-music][0:a:1]sidechaincompress=threshold=0.02:ratio=8:attack=${ducking.attackMs}:release=${ducking.releaseMs}:mix=${ducking.amount}[ducked-music]`] : [],
		`[montage-clips][${ducking ? "ducked-music" : "montage-music"}]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`
	].join(";");
	return {
		inputArguments: ["-i", musicPath],
		filter,
		audioMap: "[aout]"
	};
}
function readMontageAudioWaveform(path, durationMs, bucketCount = 240) {
	const executable = findExecutable("SWITCHBOARD_FFMPEG", "ffmpeg");
	const sampleRate = 8e3;
	return new Promise((resolvePromise, reject) => {
		const child = spawn(executable, [
			"-hide_banner",
			"-loglevel",
			"error",
			"-i",
			path,
			"-map",
			"0:a:0",
			"-vn",
			"-ac",
			"1",
			"-ar",
			String(sampleRate),
			"-f",
			"s16le",
			"pipe:1"
		], {
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		const peaks = new Float32Array(bucketCount);
		const expectedSamples = Math.max(1, Math.round(durationMs / 1e3 * sampleRate));
		let sampleIndex = 0;
		let carry = null;
		let stderr = "";
		child.stdout.on("data", (chunk) => {
			const bytes = carry ? Buffer.concat([carry, chunk]) : chunk;
			const evenLength = bytes.length - bytes.length % 2;
			for (let offset = 0; offset < evenLength; offset += 2) {
				const bucket = Math.min(bucketCount - 1, Math.floor(sampleIndex / expectedSamples * bucketCount));
				const amplitude = Math.abs(bytes.readInt16LE(offset)) / 32768;
				if (amplitude > (peaks[bucket] ?? 0)) peaks[bucket] = amplitude;
				sampleIndex += 1;
			}
			carry = evenLength < bytes.length ? bytes.subarray(evenLength) : null;
		});
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk) => {
			if (stderr.length < 16384) stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `${executable} exited with code ${code}`));
				return;
			}
			const peak = peaks.reduce((maximum, value) => Math.max(maximum, value), 0);
			if (peak <= 0) {
				resolvePromise(Array.from(peaks, () => 0));
				return;
			}
			resolvePromise(Array.from(peaks, (value) => Math.round(Math.pow(value / peak, .58) * 1e3) / 1e3));
		});
	});
}
async function probeMontageAudio(path) {
	const output = await run$1(findExecutable("SWITCHBOARD_FFPROBE", "ffprobe"), [
		"-v",
		"error",
		"-print_format",
		"json",
		"-show_entries",
		"format=duration:stream=codec_type,codec_name",
		path
	]);
	const parsed = JSON.parse(output);
	const audio = parsed.streams?.find((stream) => stream.codec_type === "audio");
	const durationMs = Math.round(Number(parsed.format?.duration ?? 0) * 1e3);
	if (!audio || !Number.isFinite(durationMs) || durationMs < 100) throw new Error("The selected file does not contain a usable audio stream.");
	return {
		durationMs,
		...audio.codec_name ? { codec: audio.codec_name } : {}
	};
}
function montageVideoTarget(clip, canvasSize) {
	if (clip.width <= 0 || clip.height <= 0) throw new Error(`Video dimensions are unavailable for ${clip.name}.`);
	return {
		...canvasDimensions(clip.width, clip.height, canvasSize),
		fps: Math.max(1, clip.fps || 30),
		canvasSize
	};
}
async function getAudioStreamCount(path, signal) {
	const output = await run$1(findExecutable("SWITCHBOARD_FFPROBE", "ffprobe"), [
		"-v",
		"error",
		"-select_streams",
		"a",
		"-show_entries",
		"stream=index",
		"-of",
		"json",
		path
	], signal);
	const parsed = JSON.parse(output);
	return Math.min(8, parsed.streams?.length ?? 0);
}
function findExecutable(environmentName, baseName) {
	const configured = process.env[environmentName];
	if (configured) return configured;
	const executable = process.platform === "win32" ? `${baseName}.exe` : baseName;
	const packagedCandidate = join(process.resourcesPath ?? "", "capture-host", "ffmpeg", executable);
	if (existsSync(packagedCandidate)) return packagedCandidate;
	for (const segment of (process.env.PATH ?? "").split(delimiter)) {
		const candidate = join(segment, executable);
		try {
			if (existsSync(candidate)) return candidate;
		} catch {}
	}
	return executable;
}
function run$1(executable, arguments_, signal, durationSeconds, onProgress) {
	return new Promise((resolvePromise, reject) => {
		if (signal?.aborted) {
			reject(abortError());
			return;
		}
		const child = spawn(executable, onProgress ? [
			"-progress",
			"pipe:1",
			"-nostats",
			...arguments_
		] : arguments_, {
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			...signal ? { signal } : {}
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			if (error) reject(error);
			else resolvePromise(stdout);
		};
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		let progressBuffer = "";
		child.stdout.on("data", (chunk) => {
			if (!onProgress) {
				if (stdout.length < 1048576) stdout += chunk;
				return;
			}
			progressBuffer += chunk;
			const lines = progressBuffer.split("\n");
			progressBuffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.startsWith("out_time_us=")) continue;
				const seconds = Number(line.slice(12).trim()) / 1e6;
				if (Number.isFinite(seconds) && durationSeconds) onProgress(Math.min(1, Math.max(0, seconds / durationSeconds)));
			}
		});
		child.stderr.on("data", (chunk) => {
			if (stderr.length < 65536) stderr += chunk;
		});
		child.once("error", (error) => {
			if (!signal?.aborted) finish(error);
		});
		child.once("close", (code) => {
			if (signal?.aborted) finish(abortError());
			else if (code === 0) finish();
			else finish(new Error(stderr.trim() || `${executable} exited with code ${code}`));
		});
	});
}
function abortError() {
	const error = /* @__PURE__ */ new Error("Export cancelled.");
	error.name = "AbortError";
	return error;
}
function filterPath(path) {
	return "'" + path.replaceAll("\\", "/").replaceAll(":", "\\:").replaceAll("'", "'\\''") + "'";
}
function tempoFilters(speed) {
	const filters = [];
	while (speed < .5) {
		filters.push("atempo=0.5");
		speed /= .5;
	}
	while (speed > 2) {
		filters.push("atempo=2");
		speed /= 2;
	}
	if (speed !== 1) filters.push(`atempo=${speed}`);
	return filters;
}
//#endregion
//#region src/main/services/montage-v2.ts
var supportedAudioExtensions = /* @__PURE__ */ new Set([
	".mp3",
	".wav",
	".m4a",
	".aac",
	".flac",
	".ogg",
	".opus"
]);
var maximumImportedAudioBytes = 4294967296;
var maximumDrafts = 500;
var managedAssetSchema = montageAudioAssetSchema.extend({ fileName: z.string().regex(/^[0-9a-f-]+\.[a-z0-9]+$/i) });
var montageManifestSchema = z.object({
	schemaVersion: z.literal(1),
	assets: z.array(managedAssetSchema).max(1e3),
	drafts: z.array(montageProjectV2Schema).max(maximumDrafts)
});
var MontageV2Service = class {
	get hasActiveExports() {
		return this.activeExports.size > 0;
	}
	activeExports = /* @__PURE__ */ new Map();
	waveformCache = /* @__PURE__ */ new Map();
	manifest = {
		schemaVersion: 1,
		assets: [],
		drafts: []
	};
	loadPromise = null;
	disposed = false;
	writeQueue = Promise.resolve();
	async importAudio() {
		this.assertActive();
		await this.ensureLoaded();
		const selection = await dialog.showOpenDialog({
			title: "Add music to montage",
			properties: ["openFile"],
			filters: [{
				name: "Audio",
				extensions: [
					"mp3",
					"wav",
					"m4a",
					"aac",
					"flac",
					"ogg",
					"opus"
				]
			}]
		});
		const sourcePath = selection.filePaths[0];
		if (selection.canceled || !sourcePath) return null;
		const extension = extname(sourcePath).toLocaleLowerCase();
		if (!supportedAudioExtensions.has(extension)) throw new Error("Choose an MP3, WAV, M4A, AAC, FLAC, OGG, or Opus file.");
		const [file, media] = await Promise.all([stat(sourcePath), probeMontageAudio(sourcePath)]);
		if (!file.isFile()) throw new Error("The selected music source is not a file.");
		if (file.size > maximumImportedAudioBytes) throw new Error("Music files must be smaller than 4 GB.");
		if (media.durationMs > 216e5) throw new Error("Music files must be shorter than six hours.");
		const id = randomUUID();
		const fileName = `${id}${extension}`;
		const destination = join(this.assetDirectory(), fileName);
		await mkdir(this.assetDirectory(), { recursive: true });
		await copyFile(sourcePath, destination);
		const asset = managedAssetSchema.parse({
			id,
			fileName,
			name: parse(sourcePath).name,
			originalName: basename(sourcePath),
			durationMs: media.durationMs,
			fileSize: file.size,
			...media.codec ? { codec: media.codec } : {},
			createdAt: Date.now()
		});
		try {
			await this.mutateManifest((manifest) => {
				manifest.assets.push(asset);
			});
		} catch (error) {
			await rm(destination, { force: true });
			throw error;
		}
		return publicAsset(asset);
	}
	async loadAudioWaveform(assetId) {
		this.assertActive();
		await this.ensureLoaded();
		const asset = this.manifest.assets.find((candidate) => candidate.id === assetId);
		if (!asset) throw new Error("The imported music asset no longer exists.");
		const cached = this.waveformCache.get(assetId);
		if (cached) return cached;
		const path = this.assetPath(asset);
		if (!existsSync(path)) throw new Error("The imported music file is missing. Replace it before exporting.");
		const pending = readMontageAudioWaveform(path, asset.durationMs).then((samples) => ({
			assetId,
			samples
		})).catch((error) => {
			this.waveformCache.delete(assetId);
			throw error;
		});
		this.waveformCache.set(assetId, pending);
		return pending;
	}
	async listDrafts() {
		this.assertActive();
		await this.ensureLoaded();
		return structuredClone([...this.manifest.drafts].sort((left, right) => right.updatedAt - left.updatedAt));
	}
	async saveDraft(input) {
		this.assertActive();
		await this.ensureLoaded();
		const project = this.canonicalizeProject(input);
		const saved = montageProjectV2Schema.parse({
			...project,
			updatedAt: Date.now()
		});
		await this.mutateManifest((manifest) => {
			const existingIndex = manifest.drafts.findIndex((candidate) => candidate.id === saved.id);
			if (existingIndex < 0 && manifest.drafts.length >= maximumDrafts) throw new Error("The draft library is full. Discard an older draft before saving another.");
			if (existingIndex >= 0) manifest.drafts.splice(existingIndex, 1);
			manifest.drafts.unshift(saved);
			manifest.drafts.sort((left, right) => right.updatedAt - left.updatedAt);
		});
		return structuredClone(saved);
	}
	async deleteDraft(projectId) {
		this.assertActive();
		await this.ensureLoaded();
		await this.mutateManifest((manifest) => {
			manifest.drafts = manifest.drafts.filter((candidate) => candidate.id !== projectId);
		});
	}
	async export(input, clips, encoder = "libx264", onProgress) {
		this.assertActive();
		await this.ensureLoaded();
		const project = this.canonicalizeProject(input.project);
		const clipsById = new Map(clips.map((clip) => [clip.id, clip]));
		const entries = project.segments.map((segment) => ({
			segment,
			clip: clipsById.get(segment.clipId)
		}));
		const missing = entries.filter((entry) => !entry.clip || !existsSync(entry.clip.path));
		if (missing.length > 0) {
			const names = missing.slice(0, 3).map((entry) => entry.clip?.name ?? entry.segment.clipId).join(", ");
			throw new Error(`Montage source unavailable: ${names}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}. Remove or restore it before exporting.`);
		}
		for (const entry of entries) {
			const clip = entry.clip;
			if (!clip) continue;
			if (entry.segment.sourceDurationMs !== clip.durationMs) throw new Error(`${clip.name} changed after this montage was opened. Reopen the draft to refresh its media metadata.`);
		}
		const musicAsset = project.music ? this.manifest.assets.find((candidate) => candidate.id === project.music?.asset.id) : void 0;
		const musicPath = musicAsset ? this.assetPath(musicAsset) : void 0;
		if (project.music && (!musicPath || !existsSync(musicPath))) throw new Error("The imported music file is missing. Replace it or remove the music track before exporting.");
		const suffix = input.targetSizeMb ? `-${input.targetSizeMb}mb` : input.preset === "original" ? "" : `-${input.preset}`;
		const canvasSuffix = project.canvasSize === "original" ? "" : `-${project.canvasSize.replace(":", "x")}`;
		const selection = await dialog.showSaveDialog({
			title: project.sourceClipId ? "Export clip" : "Export montage",
			defaultPath: join(app.getPath("videos"), `${sanitizeFileBase(project.name)}${canvasSuffix}${suffix}.mp4`),
			filters: [{
				name: "Video",
				extensions: ["mp4"]
			}]
		});
		if (selection.canceled || !selection.filePath) return null;
		const destination = resolve(selection.filePath);
		const destinationKey = destination.toLocaleLowerCase();
		if (entries.some((entry) => entry.clip && resolve(entry.clip.path).toLocaleLowerCase() === destinationKey)) throw new Error("Choose a different file name so every source clip stays intact.");
		if (musicPath && resolve(musicPath).toLocaleLowerCase() === destinationKey) throw new Error("Choose a different file name so the imported music stays intact.");
		const proportionalSourceBytes = entries.reduce((total, entry) => {
			if (!entry.clip) return total;
			const duration = entry.segment.trimEndMs - entry.segment.trimStartMs;
			return total + entry.clip.fileSize * duration / Math.max(1, entry.clip.durationMs);
		}, 0);
		const finalBytes = input.targetSizeMb ? input.targetSizeMb * 1048576 : input.preset === "original" ? proportionalSourceBytes : presetTargetBytes(input.preset);
		await Promise.all([ensureDiskSpace(dirname(destination), Math.ceil(finalBytes + 100663296), "destination"), ensureDiskSpace(tmpdir(), Math.ceil(proportionalSourceBytes * 1.35 + 201326592), "temporary export")]);
		if (this.activeExports.has(input.exportId)) throw new Error("This export is already running.");
		const workingDestination = join(dirname(destination), `.switchboard-${randomUUID()}.mp4`);
		const controller = new AbortController();
		this.activeExports.set(input.exportId, controller);
		try {
			await this.saveDraft(project);
			await renderMontageV2({
				project,
				entries: entries.map((entry) => ({
					clip: entry.clip,
					segment: entry.segment
				})),
				...musicPath ? { musicPath } : {},
				destination: workingDestination,
				targetSizeMb: input.targetSizeMb,
				encoder,
				onProgress,
				preset: input.preset,
				signal: controller.signal
			});
			await rename(workingDestination, destination);
		} catch (error) {
			await rm(workingDestination, { force: true });
			if (controller.signal.aborted) return null;
			throw error;
		} finally {
			this.activeExports.delete(input.exportId);
		}
		return getPreparedShareService().register(input.exportId, destination, basename(destination), {
			temporary: false,
			...entries[0]?.clip?.thumbnailPath ? { iconPath: entries[0].clip.thumbnailPath } : {}
		});
	}
	cancelExport(exportId) {
		this.activeExports.get(exportId)?.abort();
	}
	async resolveMusic(track) {
		this.assertActive();
		await this.ensureLoaded();
		const asset = this.manifest.assets.find((item) => item.id === track.asset.id);
		if (!asset || !existsSync(this.assetPath(asset))) throw new Error("The imported music is missing. Replace it or remove the music track.");
		return {
			track: montageMusicTrackSchema.parse({
				...track,
				asset: publicAsset(asset)
			}),
			path: this.assetPath(asset)
		};
	}
	async resolveAssetPath(assetId) {
		if (this.disposed) return null;
		await this.ensureLoaded();
		const asset = this.manifest.assets.find((candidate) => candidate.id === assetId);
		if (!asset) return null;
		const path = this.assetPath(asset);
		return existsSync(path) ? path : null;
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		for (const controller of this.activeExports.values()) controller.abort();
		this.activeExports.clear();
		this.waveformCache.clear();
	}
	canonicalizeProject(input) {
		const parsed = montageProjectV2Schema.parse(input);
		if (!parsed.music) return parsed;
		const managed = this.manifest.assets.find((candidate) => candidate.id === parsed.music?.asset.id);
		if (!managed) throw new Error("The montage references an imported music asset that no longer exists.");
		return montageProjectV2Schema.parse({
			...parsed,
			music: {
				...parsed.music,
				asset: publicAsset(managed)
			}
		});
	}
	async ensureLoaded() {
		if (this.loadPromise) return this.loadPromise;
		this.loadPromise = this.load();
		return this.loadPromise;
	}
	async load() {
		await Promise.all([mkdir(this.rootDirectory(), { recursive: true }), mkdir(this.assetDirectory(), { recursive: true })]);
		try {
			const source = await readFile(this.manifestPath(), "utf8");
			this.manifest = montageManifestSchema.parse(JSON.parse(source));
		} catch (error) {
			if ((error && typeof error === "object" && "code" in error ? String(error.code) : "") !== "ENOENT") {
				const backup = `${this.manifestPath()}.invalid-${Date.now()}`;
				try {
					await rename(this.manifestPath(), backup);
				} catch {}
				console.warn("Montage v2 state was invalid and has been preserved for recovery.", error);
			}
			this.manifest = {
				schemaVersion: 1,
				assets: [],
				drafts: []
			};
			await this.persist();
		}
	}
	async persist() {
		return this.mutateManifest(() => {});
	}
	async mutateManifest(mutate) {
		const write = this.writeQueue.catch(() => void 0).then(async () => {
			const next = structuredClone(this.manifest);
			mutate(next);
			const parsed = montageManifestSchema.parse(next);
			const temporary = `${this.manifestPath()}.${randomUUID()}.tmp`;
			await mkdir(this.rootDirectory(), { recursive: true });
			try {
				await writeFile(temporary, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
				await rename(temporary, this.manifestPath());
				this.manifest = parsed;
			} finally {
				await rm(temporary, { force: true });
			}
		});
		this.writeQueue = write;
		return write;
	}
	rootDirectory() {
		return join(app.getPath("userData"), "montage-v2");
	}
	assetDirectory() {
		return join(this.rootDirectory(), "audio");
	}
	manifestPath() {
		return join(this.rootDirectory(), "manifest.json");
	}
	assetPath(asset) {
		return join(this.assetDirectory(), asset.fileName);
	}
	assertActive() {
		if (this.disposed) throw new Error("Montage service is shutting down.");
	}
};
var montageV2Service = null;
function getMontageV2Service() {
	montageV2Service ??= new MontageV2Service();
	return montageV2Service;
}
function disposeMontageV2Service() {
	montageV2Service?.dispose();
	montageV2Service = null;
}
function publicAsset(asset) {
	const { fileName: _fileName, ...publicFields } = asset;
	return publicFields;
}
function sanitizeFileBase(value) {
	return value.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").replace(/[. ]+$/g, "").trim().slice(0, 100) || "Switchboard montage";
}
function presetTargetBytes(preset) {
	if (preset === "10mb") return 10485760;
	if (preset === "25mb") return 26214400;
	return 52428800;
}
async function ensureDiskSpace(path, requiredBytes, label) {
	const volume = await statfs(path);
	const availableBytes = Number(volume.bavail) * Number(volume.bsize);
	if (availableBytes < requiredBytes) throw new Error(`Not enough free space on the ${label} drive. Free at least ${formatBytes(requiredBytes - availableBytes)} and try again.`);
}
function formatBytes(bytes) {
	const value = Math.max(0, bytes);
	if (value >= 1024 ** 3) return `${Math.ceil(value / 1024 ** 3 * 10) / 10} GB`;
	return `${Math.ceil(value / 1024 ** 2)} MB`;
}
//#endregion
//#region src/main/services/debug-diagnostics.ts
var noop = (_failed) => {};
/** Bounded, opt-in main-process instrumentation. Labels must be code-owned, never payloads. */
var DebugDiagnosticsCollector = class {
	operations = /* @__PURE__ */ new Map();
	histogram = null;
	baseline = performance$1.eventLoopUtilization();
	startedAt = null;
	generation = 0;
	setEnabled(enabled) {
		if (enabled === Boolean(this.startedAt)) return;
		this.generation++;
		this.histogram?.disable();
		this.histogram = null;
		this.operations.clear();
		this.startedAt = enabled ? (/* @__PURE__ */ new Date()).toISOString() : null;
		if (enabled) {
			this.baseline = performance$1.eventLoopUtilization();
			this.histogram = monitorEventLoopDelay({ resolution: 20 });
			this.histogram.enable();
		}
	}
	begin(label) {
		if (!this.startedAt) return noop;
		const key = label.slice(0, 96);
		if (!this.operations.has(key) && this.operations.size >= 128) return noop;
		let row = this.operations.get(key);
		if (!row) {
			row = {
				name: key,
				calls: 0,
				failures: 0,
				inFlight: 0,
				totalMs: 0,
				maxMs: 0
			};
			this.operations.set(key, row);
		}
		row.inFlight++;
		const start = performance$1.now();
		const generation = this.generation;
		let finished = false;
		return (failed = false) => {
			if (finished || generation !== this.generation) return;
			finished = true;
			const duration = performance$1.now() - start;
			row.inFlight--;
			row.calls++;
			row.failures += Number(failed);
			row.totalMs += duration;
			row.maxMs = Math.max(row.maxMs, duration);
		};
	}
	measure(label, action) {
		const finish = this.begin(label);
		try {
			const result = action();
			finish();
			return result;
		} catch (error) {
			finish(true);
			throw error;
		}
	}
	async measureAsync(label, action) {
		const finish = this.begin(label);
		try {
			const result = await action();
			finish();
			return result;
		} catch (error) {
			finish(true);
			throw error;
		}
	}
	snapshot() {
		if (!this.startedAt || !this.histogram) return void 0;
		const current = performance$1.eventLoopUtilization();
		const utilization = performance$1.eventLoopUtilization(current, this.baseline);
		this.baseline = current;
		const result = {
			startedAt: this.startedAt,
			sampledAt: (/* @__PURE__ */ new Date()).toISOString(),
			eventLoopUtilizationPercent: utilization.active + utilization.idle > 0 ? round$1(utilization.utilization * 100) : null,
			eventLoopDelayP99Ms: this.histogram.count ? round$1(this.histogram.percentile(99) / 1e6) : null,
			eventLoopDelayMaxMs: this.histogram.count ? round$1(this.histogram.max / 1e6) : null,
			operations: [...this.operations.values()].map((row) => ({
				...row,
				totalMs: round$1(row.totalMs),
				maxMs: round$1(row.maxMs)
			})).sort((a, b) => b.totalMs - a.totalMs),
			processes: []
		};
		this.histogram.reset();
		return result;
	}
	dispose() {
		this.setEnabled(false);
	}
};
function round$1(value) {
	return Math.round(value * 100) / 100;
}
var debugDiagnostics = new DebugDiagnosticsCollector();
//#endregion
//#region src/main/services/developer-diagnostics.ts
var maximumEvents = 2e3;
var maximumBytes = 2097152;
var maximumEventBytes = 8192;
/** Event-driven developer trace. No timer, file handle, or retained events while disabled. */
var DeveloperDiagnosticsCollector = class {
	active = false;
	sessionId = "";
	startedAt = null;
	sequence = 0;
	entries = [];
	bytes = 0;
	discardedEvents = 0;
	rateWindow = 0;
	rateCount = 0;
	sink;
	get enabled() {
		return this.active;
	}
	get recordingId() {
		return this.active ? this.sessionId : null;
	}
	setSink(sink) {
		this.sink = sink;
	}
	setEnabled(enabled) {
		if (enabled === this.active) return;
		this.active = enabled;
		this.entries = [];
		this.bytes = 0;
		this.sequence = 0;
		this.discardedEvents = 0;
		this.rateWindow = 0;
		this.rateCount = 0;
		this.sessionId = enabled ? randomUUID() : "";
		this.startedAt = enabled ? (/* @__PURE__ */ new Date()).toISOString() : null;
		if (enabled) this.record("main", "info", "diagnostics.enabled");
	}
	record(source, level, event, data = {}) {
		if (!this.active) return;
		this.receive(source, {
			level,
			event,
			data
		});
	}
	receive(source, input) {
		if (!this.active) return;
		const now = Date.now();
		if (now - this.rateWindow >= 1e3) {
			this.rateWindow = now;
			this.rateCount = 0;
		}
		if (++this.rateCount > 120) {
			this.discardedEvents++;
			return;
		}
		const parsed = developerDiagnosticInputSchema.safeParse(input);
		if (!parsed.success) {
			this.discardedEvents++;
			return;
		}
		const data = {};
		for (const [key, value] of Object.entries(parsed.data.data)) {
			if (/password|secret|token|authorization|cookie|credential/i.test(key)) {
				data[key] = "<redacted>";
				continue;
			}
			data[key] = typeof value === "string" ? redactDiagnosticText(value) : value;
		}
		const event = {
			...parsed.data,
			data,
			schemaVersion: 1,
			kind: "developer-event",
			sessionId: this.sessionId,
			sequence: ++this.sequence,
			sampledAt: new Date(now).toISOString(),
			source
		};
		const bytes = Buffer.byteLength(JSON.stringify(event));
		if (bytes > maximumEventBytes) {
			this.discardedEvents++;
			return;
		}
		this.entries.push({
			event,
			bytes
		});
		this.bytes += bytes;
		while (this.entries.length > maximumEvents || this.bytes > maximumBytes) {
			this.bytes -= this.entries.shift().bytes;
			this.discardedEvents++;
		}
		try {
			this.sink?.(event);
		} catch {
			this.discardedEvents++;
		}
	}
	snapshot() {
		return {
			enabled: this.active,
			sessionId: this.sessionId || null,
			startedAt: this.startedAt,
			discardedEvents: this.discardedEvents,
			limits: "Latest 2,000 events / 2 MiB; 8 KiB per event; 120 events per second. Discarded events include evictions, rate limits, and invalid records.",
			events: this.entries.map(({ event }) => structuredClone(event))
		};
	}
	async trace(source, operation, action) {
		if (!this.active) return action();
		const session = this.sessionId;
		const request = randomUUID();
		const started = performance.now();
		this.record(source, "debug", "operation.started", {
			operation,
			request
		});
		try {
			const result = await action();
			if (session === this.sessionId) this.record(source, "debug", "operation.completed", {
				operation,
				request,
				elapsedMs: performance.now() - started
			});
			return result;
		} catch (error) {
			if (session === this.sessionId) this.record(source, "error", "operation.failed", {
				operation,
				request,
				elapsedMs: performance.now() - started,
				error: (error instanceof Error ? error.stack ?? error.message : String(error)).slice(0, 4096)
			});
			throw error;
		}
	}
	dispose() {
		this.setEnabled(false);
		this.sink = void 0;
	}
};
function redactDiagnosticText(value) {
	return value.replace(/\bBearer\s+[A-Za-z0-9+/_=.-]+/gi, "<credentials>").replace(/\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/gi, "<credentials>").replace(/\b(?:password|token|secret|api[_-]?key|authorization|cookie)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "<credentials>").replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi, "<url>").replace(/\bfile:\/\/[^\r\n<>"']*/gi, "<path>").replace(/(?:[a-z]:[\\/]|\\\\)[^\r\n<>"'|]*/gi, "<path>").replace(/\/(?:home|Users|tmp|var)\/[^\r\n<>"'|]*/g, "<path>").replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<email>").slice(0, 4096);
}
var developerDiagnostics = new DeveloperDiagnosticsCollector();
//#endregion
//#region src/main/services/diagnostics-export.ts
function captureDiagnosticSettings(config) {
	return {
		enabled: config.enabled,
		source: config.source,
		sourceSelected: Boolean(config.sourceId),
		displayIndex: config.displayIndex,
		encoder: config.encoder,
		codec: config.codec,
		resolution: config.resolution,
		fps: config.fps,
		quality: config.quality,
		replaySeconds: config.replaySeconds,
		includeSystemAudio: config.includeSystemAudio,
		includeMic: config.includeMic,
		includeChatAudio: config.includeChatAudio,
		includeCursor: config.includeCursor
	};
}
var gpuDeviceSchema = z.object({
	active: z.boolean().optional(),
	vendorId: z.number().optional(),
	deviceId: z.number().optional(),
	vendorString: z.string().optional(),
	deviceString: z.string().optional(),
	driverVendor: z.string().optional(),
	driverVersion: z.string().optional()
});
var gpuInfoSchema = z.object({
	gpuDevice: z.array(gpuDeviceSchema).max(16).optional(),
	auxAttributes: z.object({
		directRenderingVersion: z.string().optional(),
		glRenderer: z.string().optional(),
		glVersion: z.string().optional(),
		glVendor: z.string().optional(),
		displayType: z.string().optional(),
		optimus: z.boolean().optional(),
		amdSwitchable: z.boolean().optional(),
		sandboxed: z.boolean().optional()
	}).optional()
});
function diagnosticGpuInfo(input) {
	const parsed = gpuInfoSchema.safeParse(input);
	if (!parsed.success) return { unavailable: "GPU metadata did not match the supported fields." };
	return JSON.parse(JSON.stringify(parsed.data, (_key, value) => typeof value === "string" ? redactDiagnosticText(value) : value));
}
function captureDiagnosticContext(snapshot) {
	const { config, runtime, capabilities, sources, storage } = snapshot.capture;
	return {
		settings: captureDiagnosticSettings(config),
		runtime: {
			state: runtime.state,
			backend: runtime.backendLabel,
			encoder: runtime.encoderLabel,
			encodedFrames: runtime.encodedFrames,
			droppedFrames: runtime.droppedFrames,
			bufferedSeconds: runtime.bufferedSeconds,
			segmentCount: runtime.segmentCount,
			saveQueueDepth: runtime.saveQueueDepth,
			observedBitrateBps: runtime.observedBitrateBps,
			error: runtime.error ? redactDiagnosticText(runtime.error) : null,
			warning: runtime.warning ? redactDiagnosticText(runtime.warning) : null,
			activeSourceType: runtime.activeSource?.type ?? null,
			activeSourceAvailable: runtime.activeSource?.available ?? null
		},
		capabilities,
		sources: {
			displays: sources.filter((source) => source.type === "display").length,
			windows: sources.filter((source) => source.type === "window").length,
			available: sources.filter((source) => source.available).length
		},
		storage: {
			availableBytes: storage.availableBytes,
			replayCacheBytes: storage.replayCacheBytes,
			lowSpace: storage.lowSpace,
			criticalSpace: storage.criticalSpace
		},
		engines: snapshot.engines.map((engine) => ({
			kind: engine.kind,
			state: engine.state,
			pid: engine.pid,
			message: engine.message ? redactDiagnosticText(engine.message) : null,
			processes: engine.processes
		}))
	};
}
//#endregion
//#region src/main/services/diagnostic-results.ts
function sanitizeDiagnosticCheck(input) {
	const check = diagnosticCheckSchema.parse(input);
	return {
		...check,
		label: redactDiagnosticText(check.label),
		detail: redactDiagnosticText(check.detail).slice(0, 8192)
	};
}
function summarizeDiagnosticChecks(checks) {
	const status = (id) => checks.find((check) => check.id === id)?.status;
	if (status("capture.software") === "fail" && status("capture.duplication") === "pass") return "Windows Graphics Capture failed, but the Desktop Duplication display test passed. Share the diagnostics file to investigate the capture backend.";
	if (status("capture.hardware") === "fail" && status("capture.software") === "pass") return "The hardware capture path failed while software H.264 worked. Use software H.264 for now and share the diagnostics file.";
	if (status("capture.hardware") === "fail" && status("capture.software") === "fail") return "Both hardware and software display capture failed. Codec selection alone does not explain the problem; the file includes the capture errors.";
	if (status("game-detection") === "warning" && (status("capture.hardware") === "pass" || status("capture.software") === "pass")) return "Display capture works, but automatic game detection did not select a game. Keep the game open and unminimized, or select its window or display.";
	const failed = checks.filter((check) => check.status === "fail").length;
	const warnings = checks.filter((check) => check.status === "warning").length;
	if (failed || warnings) return `${failed} failed ${failed === 1 ? "check" : "checks"} and ${warnings} ${warnings === 1 ? "warning" : "warnings"}. Review the results and save the diagnostics file.`;
	if (status("capture.active") === "skipped") return "Replay stayed running. Non-invasive checks completed; direct encoder and capture tests were skipped.";
	return "The checks that ran passed. This short test does not prove long-running replay or recorded audio. Save diagnostics to share the results.";
}
var package_default = {
	name: "switchboard-prototype",
	version: "0.8.7",
	"private": true,
	description: "A modular, low-overhead Electron control plane for devices, capture, and audio routing.",
	type: "module",
	workspaces: ["packages/*"],
	main: "./out/main/index.js",
	scripts: {
		"dev": "node ./scripts/dev.mjs",
		"build": "electron-vite build",
		"preview": "electron-vite preview",
		"review:native": "bun run build && bun ./scripts/run-native-review.mjs capture",
		"verify:native-ui": "bun run build && bun ./scripts/run-native-review.mjs verify",
		"verify:app-update-ui": "bun run build && bun ./scripts/run-native-review.mjs app-updates",
		"verify:device-popovers": "bun run build && bun ./scripts/run-native-review.mjs device-popovers",
		"verify:module-sandbox": "node ./scripts/verify-module-sandbox.mjs",
		"verify:module-authoring-ui": "bun run build && bun ./scripts/run-native-review.mjs module-authoring",
		"verify:razer-hardware": "bun ./scripts/verify-razer-hardware.ts",
		"verify:audio-noise-native": "bun run build && bun ./scripts/run-native-review.mjs audio-noise",
		"verify:packaged-audio-host": "node ./scripts/verify-packaged-audio-host.mjs",
		"verify:packaged-updater": "node ./scripts/verify-packaged-updater.mjs",
		"verify:installed-update": "node ./scripts/verify-installed-update.mjs",
		"preview:static": "node ./scripts/build-standalone-preview.mjs",
		"build:capture-host": "node ./scripts/publish-capture-host.mjs",
		"build:audio-host": "node ./scripts/publish-audio-host.mjs",
		"build:noise-native": "node ./scripts/build-noise-native.mjs",
		"build:virtual-audio-driver": "powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/build-virtual-audio-driver.ps1",
		"build:deepfilternet-native": "node ./scripts/build-deepfilternet-native.mjs",
		"acquire:deepfilternet-model": "node ./scripts/acquire-deepfilternet-model.mjs",
		"measure:audio-host": "node ./scripts/measure-audio-host.mjs",
		"measure:startup": "bun run build && node ./scripts/run-native-review.mjs startup",
		"measure:settings": "bun run build && node ./scripts/run-native-review.mjs settings-navigation",
		"measure:routes": "bun run build && node ./scripts/run-native-review.mjs route-navigation",
		"measure:idle": "bun run build && node ./scripts/run-native-review.mjs idle",
		"measure:capture-host": "node ./scripts/measure-capture-host.mjs",
		"diagnose:live": "powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/measure-live-memory.ps1",
		"diagnose:resources": "node ./scripts/analyze-resource-log.mjs",
		"build:hosts": "bun run build:capture-host && bun run build:audio-host",
		"dist:win": "bun run build:hosts && bun run build && electron-builder --win nsis",
		"release:win": "bun run build:hosts && bun run build && electron-builder --win nsis --publish always",
		"check": "node ./scripts/check.mjs",
		"check:source": "node ./scripts/transpile-check.mjs",
		"check:types": "tsc -p tsconfig.node.json --noEmit --pretty false && tsc -p tsconfig.web.json --noEmit --pretty false",
		"test:audio-host": "cargo build --manifest-path ./native/noise-bridge/Cargo.toml --release && dotnet run --configuration Release --project ./engines/audio-host-tests/Audio.Host.Tests.csproj",
		"test": "bun test && dotnet run --configuration Release --project ./engines/capture-host-tests/Capture.Host.Tests.csproj && bun run test:audio-host",
		"validate": "bun run check && bun run check:types && bun run build",
		"check:workers": "node ./scripts/worker-smoke.cjs"
	},
	dependencies: {
		"@radix-ui/react-alert-dialog": "1.1.15",
		"@radix-ui/react-checkbox": "^1.3.11",
		"@radix-ui/react-collapsible": "1.1.12",
		"@radix-ui/react-context-menu": "2.2.16",
		"@radix-ui/react-dialog": "1.1.15",
		"@radix-ui/react-dropdown-menu": "2.1.16",
		"@radix-ui/react-popover": "1.1.15",
		"@radix-ui/react-radio-group": "1.3.8",
		"@radix-ui/react-scroll-area": "1.2.18",
		"@radix-ui/react-select": "2.3.7",
		"@radix-ui/react-slider": "1.4.7",
		"@radix-ui/react-slot": "1.3.3",
		"@radix-ui/react-switch": "1.3.7",
		"@radix-ui/react-toggle-group": "1.1.11",
		"@radix-ui/react-tooltip": "1.2.16",
		"class-variance-authority": "0.7.1",
		"clsx": "2.1.1",
		"cmdk": "1.1.1",
		"electron-updater": "6.8.9",
		"lucide-react": "1.34.0",
		"motion": "^13.1.1",
		"node-hid": "3.4.0",
		"react": "19.2.0",
		"react-dom": "19.2.0",
		"tailwind-merge": "3.6.0",
		"ws": "8.21.3",
		"zod": "4.4.3",
		"zustand": "5.0.15"
	},
	devDependencies: {
		"@electron/asar": "3.4.1",
		"@tailwindcss/vite": "4.3.3",
		"@types/node": "24.3.0",
		"@types/react": "19.2.18",
		"@types/react-dom": "19.2.4",
		"@types/ws": "8.18.1",
		"@vitejs/plugin-react": "6.1.0",
		"electron": "44.0.0",
		"electron-builder": "26.15.3",
		"electron-vite": "5.0.0",
		"tailwindcss": "4.3.3",
		"typescript": "5.9.2",
		"vite": "8.2.2"
	},
	packageManager: "bun@1.4.0",
	engines: { "node": ">=22.16.0" }
};
//#endregion
//#region src/shared/huntsman-features.ts
var huntsmanKeyboardFeatures = [
	{
		id: "lighting",
		label: "Quick lighting",
		summary: "Brightness and device-firmware quick effects use the native HID control endpoint.",
		status: "native"
	},
	{
		id: "actuation",
		label: "Per-key actuation",
		summary: "Adjustable 1.5–3.6 mm actuation and two-stage inputs are supported by the keyboard.",
		status: "synapse",
		unavailableReason: "The actuation protocol is not safely documented or verified for direct writes yet."
	},
	{
		id: "analog",
		label: "Analog input",
		summary: "Selected keys can emulate joystick axes and controller triggers.",
		status: "synapse",
		unavailableReason: "Analog mapping remains owned by Synapse until its native profile format is verified."
	},
	{
		id: "mapping",
		label: "Key mapping",
		summary: "Remapping, macros, Hypershift, and analog controller bindings remain in Synapse.",
		status: "synapse",
		unavailableReason: "Switchboard does not write undocumented key maps or macro payloads."
	},
	{
		id: "rapid-trigger",
		label: "Rapid Trigger",
		summary: "Resets keys as you release them. Requires Razer Synapse running on this model.",
		status: "synapse",
		unavailableReason: "Configure in Synapse. Switchboard cannot control Rapid Trigger yet."
	},
	{
		id: "rapid-input",
		label: "Snap Tap",
		summary: "Razer does not currently support Snap Tap on the Huntsman V2 Analog.",
		status: "unsupported",
		unavailableReason: "Not available for this model, including in Synapse."
	}
];
//#endregion
//#region src/shared/audio-presets.ts
function clone(value) {
	return structuredClone(value);
}
function bands(prefix, values) {
	return values.map(([frequency, gainDb, q, type], index) => ({
		id: `${prefix}-${index + 1}`,
		enabled: true,
		type,
		frequency,
		gainDb,
		q
	}));
}
var FLAT_BANDS = bands("flat", [
	[
		80,
		0,
		.7,
		"low-shelf"
	],
	[
		180,
		0,
		1,
		"bell"
	],
	[
		700,
		0,
		1,
		"bell"
	],
	[
		2500,
		0,
		1,
		"bell"
	],
	[
		6e3,
		0,
		1,
		"bell"
	],
	[
		1e4,
		0,
		.7,
		"high-shelf"
	]
]);
function createDefaultChannelProcessing(busId) {
	return {
		busId,
		equalizer: {
			enabled: true,
			bands: clone(FLAT_BANDS)
		},
		normalization: {
			enabled: false,
			targetLufs: -18,
			maxGainDb: 8
		},
		compressor: {
			enabled: false,
			thresholdDb: -18,
			ratio: 3,
			attackMs: 15,
			releaseMs: 180,
			makeupDb: 0
		},
		limiter: {
			enabled: true,
			thresholdDb: -1,
			releaseMs: 90
		}
	};
}
function createNaturalMicrophoneProcessors() {
	return [
		{
			id: "gain",
			label: "Input gain",
			enabled: true,
			cost: "none",
			parameters: { gainDb: 0 }
		},
		{
			id: "noise-gate",
			label: "Noise gate",
			enabled: true,
			cost: "low",
			parameters: {
				thresholdDb: -48,
				attackMs: 10,
				releaseMs: 180
			}
		},
		{
			id: "noise-suppression",
			label: "Noise suppression",
			enabled: true,
			cost: "medium",
			parameters: { amount: 45 }
		},
		{
			id: "equalizer",
			label: "Parametric EQ",
			enabled: true,
			cost: "low",
			parameters: { bands: bands("mic-natural", [
				[
					80,
					-1,
					.7,
					"low-shelf"
				],
				[
					180,
					-1.5,
					1,
					"bell"
				],
				[
					500,
					0,
					1.1,
					"bell"
				],
				[
					2800,
					2,
					1.2,
					"bell"
				],
				[
					5500,
					1,
					1,
					"bell"
				],
				[
					1e4,
					1,
					.7,
					"high-shelf"
				]
			]) }
		},
		{
			id: "compressor",
			label: "Compressor",
			enabled: true,
			cost: "low",
			parameters: {
				thresholdDb: -18,
				ratio: 3,
				attackMs: 12,
				releaseMs: 180,
				makeupDb: 2
			}
		},
		{
			id: "limiter",
			label: "Limiter",
			enabled: true,
			cost: "low",
			parameters: {
				thresholdDb: -1,
				releaseMs: 90
			}
		}
	];
}
function outputPreset(kind, id, name, configure) {
	const processing = createDefaultChannelProcessing(kind);
	configure(processing);
	const { busId: _busId, ...processors } = processing;
	return {
		id,
		name,
		kind,
		builtIn: true,
		schemaVersion: 1,
		processors
	};
}
function microphonePreset(id, name, configure) {
	const processors = createNaturalMicrophoneProcessors();
	configure(processors);
	return {
		id,
		name,
		kind: "microphone",
		builtIn: true,
		schemaVersion: 1,
		processors,
		monitoring: {
			enabled: false,
			level: .18,
			deviceId: ""
		}
	};
}
function mic(processors, id) {
	const processor = processors.find((candidate) => candidate.id === id);
	if (!processor) throw new Error(`Missing microphone processor: ${id}`);
	return processor;
}
var defaultAudioPathPresets = [
	outputPreset("game", "game-flat", "Flat", () => void 0),
	outputPreset("game", "game-competitive-fps", "Competitive FPS", (processing) => {
		processing.equalizer.bands = bands("game-fps", [
			[
				80,
				-3,
				.7,
				"low-shelf"
			],
			[
				180,
				-2,
				1,
				"bell"
			],
			[
				700,
				-1,
				1.1,
				"bell"
			],
			[
				2500,
				3.5,
				1.1,
				"bell"
			],
			[
				5500,
				2.5,
				1.2,
				"bell"
			],
			[
				1e4,
				1,
				.7,
				"high-shelf"
			]
		]);
		processing.normalization = {
			enabled: true,
			targetLufs: -17,
			maxGainDb: 6
		};
		processing.compressor = {
			enabled: true,
			thresholdDb: -20,
			ratio: 2.5,
			attackMs: 12,
			releaseMs: 140,
			makeupDb: 1
		};
	}),
	outputPreset("game", "game-immersive", "Immersive", (processing) => {
		processing.equalizer.bands = bands("game-immersive", [
			[
				70,
				3,
				.7,
				"low-shelf"
			],
			[
				180,
				1.5,
				1,
				"bell"
			],
			[
				700,
				-.5,
				1,
				"bell"
			],
			[
				2500,
				1,
				1,
				"bell"
			],
			[
				6e3,
				1.5,
				1,
				"bell"
			],
			[
				11e3,
				2,
				.7,
				"high-shelf"
			]
		]);
	}),
	outputPreset("chat", "chat-natural", "Natural", () => void 0),
	outputPreset("chat", "chat-clear-voice", "Clear Voice", (processing) => {
		processing.equalizer.bands = bands("chat-clear", [
			[
				100,
				-4,
				.7,
				"low-shelf"
			],
			[
				220,
				-2,
				1,
				"bell"
			],
			[
				700,
				-1,
				1,
				"bell"
			],
			[
				2200,
				3,
				1.1,
				"bell"
			],
			[
				4500,
				2,
				1.2,
				"bell"
			],
			[
				9e3,
				1,
				.7,
				"high-shelf"
			]
		]);
		processing.normalization = {
			enabled: true,
			targetLufs: -19,
			maxGainDb: 7
		};
		processing.compressor = {
			enabled: true,
			thresholdDb: -22,
			ratio: 3,
			attackMs: 10,
			releaseMs: 160,
			makeupDb: 1
		};
	}),
	outputPreset("chat", "chat-reduced-bass", "Reduced Bass", (processing) => {
		processing.equalizer.bands[0] = {
			...processing.equalizer.bands[0],
			gainDb: -5
		};
		processing.equalizer.bands[1] = {
			...processing.equalizer.bands[1],
			gainDb: -2
		};
	}),
	outputPreset("media", "media-flat", "Flat", () => void 0),
	outputPreset("media", "media-music", "Music", (processing) => {
		processing.equalizer.bands = bands("media-music", [
			[
				70,
				2,
				.7,
				"low-shelf"
			],
			[
				180,
				.5,
				1,
				"bell"
			],
			[
				700,
				-1,
				1,
				"bell"
			],
			[
				2500,
				1,
				1,
				"bell"
			],
			[
				6e3,
				1.5,
				1,
				"bell"
			],
			[
				11e3,
				2,
				.7,
				"high-shelf"
			]
		]);
	}),
	outputPreset("media", "media-movies", "Movies", (processing) => {
		processing.equalizer.bands = bands("media-movies", [
			[
				65,
				2.5,
				.7,
				"low-shelf"
			],
			[
				180,
				1,
				1,
				"bell"
			],
			[
				700,
				-1.5,
				1,
				"bell"
			],
			[
				2200,
				2.5,
				1.1,
				"bell"
			],
			[
				5500,
				1,
				1,
				"bell"
			],
			[
				1e4,
				1.5,
				.7,
				"high-shelf"
			]
		]);
		processing.normalization = {
			enabled: true,
			targetLufs: -18,
			maxGainDb: 5
		};
	}),
	microphonePreset("mic-natural-voice", "Natural Voice", () => void 0),
	microphonePreset("mic-clear-speech", "Clear Speech", (processors) => {
		mic(processors, "noise-suppression").parameters.amount = 60;
		mic(processors, "noise-gate").parameters.thresholdDb = -44;
		mic(processors, "equalizer").parameters.bands = bands("mic-clear", [
			[
				90,
				-3,
				.7,
				"low-shelf"
			],
			[
				220,
				-2,
				1,
				"bell"
			],
			[
				650,
				-1,
				1,
				"bell"
			],
			[
				2800,
				3,
				1.1,
				"bell"
			],
			[
				5500,
				2,
				1.2,
				"bell"
			],
			[
				1e4,
				1,
				.7,
				"high-shelf"
			]
		]);
		mic(processors, "compressor").parameters = {
			thresholdDb: -20,
			ratio: 3.5,
			attackMs: 10,
			releaseMs: 150,
			makeupDb: 2.5
		};
	}),
	microphonePreset("mic-broadcast", "Broadcast", (processors) => {
		mic(processors, "gain").parameters.gainDb = 1.5;
		mic(processors, "noise-suppression").parameters.amount = 50;
		mic(processors, "equalizer").parameters.bands = bands("mic-broadcast", [
			[
				75,
				1.5,
				.7,
				"low-shelf"
			],
			[
				180,
				1,
				1,
				"bell"
			],
			[
				450,
				-2,
				1.1,
				"bell"
			],
			[
				2400,
				2.5,
				1.1,
				"bell"
			],
			[
				5e3,
				1.5,
				1,
				"bell"
			],
			[
				1e4,
				2,
				.7,
				"high-shelf"
			]
		]);
		mic(processors, "compressor").parameters = {
			thresholdDb: -22,
			ratio: 4,
			attackMs: 8,
			releaseMs: 130,
			makeupDb: 3
		};
	}),
	microphonePreset("mic-studio", "Studio", (processors) => {
		mic(processors, "noise-suppression").parameters.amount = 20;
		mic(processors, "noise-gate").parameters.thresholdDb = -56;
		mic(processors, "compressor").parameters = {
			thresholdDb: -16,
			ratio: 2.2,
			attackMs: 18,
			releaseMs: 220,
			makeupDb: 1
		};
	})
];
function snapshotAudioPathPreset(audio, kind, id, name) {
	if (kind === "microphone") return {
		id,
		name,
		kind,
		builtIn: false,
		schemaVersion: 1,
		processors: clone(audio.micProcessors),
		monitoring: {
			enabled: audio.monitoringEnabled,
			level: audio.monitoring,
			deviceId: audio.monitoringDeviceId
		}
	};
	const { busId: _busId, ...processors } = clone(audio.channelProcessing.find((candidate) => candidate.busId === kind) ?? createDefaultChannelProcessing(kind));
	return {
		id,
		name,
		kind,
		builtIn: false,
		schemaVersion: 1,
		processors
	};
}
function applyAudioPathPreset(audio, preset) {
	if (preset.kind === "microphone") {
		const currentMonitoringDeviceId = audio.monitoringDeviceId;
		audio.micProcessors = clone(preset.processors);
		audio.monitoring = preset.monitoring.level;
		const monitoringDevice = audio.devices.find((device) => device.id === preset.monitoring.deviceId && device.direction === "output" && device.available && !device.isSwitchboard) ?? audio.devices.find((device) => device.id === currentMonitoringDeviceId && device.direction === "output" && device.available && !device.isSwitchboard) ?? audio.devices.find((device) => device.direction === "output" && device.available && device.isDefault && !device.isSwitchboard);
		audio.monitoringDeviceId = monitoringDevice?.id ?? "";
		audio.monitoringEnabled = preset.monitoring.enabled && Boolean(monitoringDevice);
		audio.activePresetIds.microphone = audio.monitoringEnabled === preset.monitoring.enabled && audio.monitoringDeviceId === preset.monitoring.deviceId ? preset.id : null;
		return;
	}
	const next = {
		busId: preset.kind,
		...clone(preset.processors)
	};
	const index = audio.channelProcessing.findIndex((candidate) => candidate.busId === preset.kind);
	if (index >= 0) audio.channelProcessing[index] = next;
	else audio.channelProcessing.push(next);
	audio.activePresetIds[preset.kind] = preset.id;
}
function findMatchingAudioPresetId(audio, kind) {
	const current = snapshotAudioPathPreset(audio, kind, "current", "Current");
	for (const preset of audio.pathPresets) {
		if (preset.kind !== kind) continue;
		const candidate = {
			...preset,
			id: "current",
			name: "Current",
			builtIn: false
		};
		if (JSON.stringify(candidate) === JSON.stringify(current)) return preset.id;
	}
	return null;
}
//#endregion
//#region src/shared/defaults.ts
function previewBinding(buttonId, label, slot, currentActionId, calloutSide, order, x, y) {
	return {
		buttonId,
		slotId: `g502x-plus_${slot}_m1`,
		currentActionId,
		hotspot: {
			id: buttonId,
			label,
			position: {
				x,
				y
			},
			calloutSide,
			order,
			capability: "button-assignment"
		}
	};
}
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var defaultModules = [
	{
		id: "device.razer-huntsman",
		name: "Razer Huntsman",
		description: "Native low-frequency lighting controls and honest capability reporting for Huntsman analog keyboards.",
		version: "0.1.0",
		kind: "device",
		sizeMb: .2,
		installed: true,
		enabled: true,
		official: true,
		restartRequired: false,
		capabilities: [
			"keyboard",
			"firmware",
			"lighting"
		],
		vendors: ["1532"],
		source: "bundled"
	},
	{
		id: "device.hyperx-quadcast",
		name: "HyperX QuadCast",
		description: "QuadCast, QuadCast S, and QuadCast 2 controls through one capability module.",
		version: "0.1.0",
		kind: "device",
		sizeMb: 1.2,
		installed: true,
		enabled: true,
		official: true,
		restartRequired: false,
		capabilities: [
			"microphone",
			"gain",
			"monitoring",
			"lighting",
			"firmware"
		],
		vendors: ["0951"],
		source: "bundled"
	},
	{
		id: "device.logitech-hidpp",
		name: "Logitech HID++",
		description: "Self-describing Logitech mouse and keyboard support without one package per model.",
		version: "0.1.0",
		kind: "device",
		sizeMb: 1.8,
		installed: true,
		enabled: true,
		official: true,
		restartRequired: false,
		capabilities: [
			"mouse",
			"dpi",
			"polling-rate",
			"buttons",
			"battery",
			"profiles"
		],
		vendors: ["046d"],
		source: "bundled"
	},
	{
		id: "capability.replay",
		name: "Instant Replay",
		description: "Isolated capture process with a disk-backed rolling buffer and hardware encoder selection.",
		version: "0.1.0",
		kind: "capture",
		sizeMb: 84,
		installed: true,
		enabled: false,
		official: true,
		restartRequired: false,
		capabilities: [
			"display-capture",
			"window-capture",
			"replay-buffer",
			"clips"
		],
		vendors: [],
		source: "bundled"
	},
	{
		id: "capability.audio-router",
		name: "Audio Router",
		description: "Game, chat, media, and aux buses with independent personal, stream, and clip mixes.",
		version: "0.1.0",
		kind: "audio",
		sizeMb: 11.6,
		installed: true,
		enabled: false,
		official: true,
		restartRequired: false,
		capabilities: [
			"audio-buses",
			"chatmix",
			"microphone-dsp",
			"stream-mix"
		],
		vendors: [],
		source: "bundled"
	},
	{
		id: "device.steelseries-hid",
		name: "SteelSeries Devices",
		description: "Optional SteelSeries HID support without installing the GG suite.",
		version: "0.0.1",
		kind: "device",
		sizeMb: 2.4,
		installed: false,
		enabled: false,
		official: true,
		restartRequired: false,
		capabilities: [
			"mouse",
			"keyboard",
			"headset",
			"lighting"
		],
		vendors: ["1038"],
		source: "bundled"
	},
	{
		id: "integration.obs",
		name: "OBS Integration",
		description: "Expose clip, stream mix, and scene actions through OBS WebSocket.",
		version: "0.0.1",
		kind: "integration",
		sizeMb: .7,
		installed: false,
		enabled: false,
		official: false,
		restartRequired: false,
		capabilities: ["obs-websocket", "scene-actions"],
		vendors: [],
		source: "bundled"
	}
];
var defaultDevices = [
	{
		id: "logitech-g502x-plus-1",
		moduleId: "device.logitech-hidpp",
		displayName: "G502 X Plus",
		kind: "mouse",
		connected: true,
		identity: {
			manufacturer: "Logitech",
			productFamily: "G502",
			model: "G502 X Plus",
			variant: "white",
			colorway: "White",
			connection: "wireless",
			connectionLabel: "LIGHTSPEED",
			vendorId: 1133,
			productId: 16537,
			transportProductId: 50503,
			serialNumber: "PREVIEW-G502X",
			productString: "G502 X PLUS"
		},
		variantResolution: {
			confidence: "hardware",
			source: "Logitech DEVIO extended model",
			evidence: "extendedModel 1"
		},
		asset: {
			key: "logitech-g502-x-plus-white",
			matchedBy: "exact-variant",
			source: "bundled-official"
		},
		capabilities: {
			battery: {
				percentage: 82,
				charging: false,
				fullyCharged: false,
				estimatedMinutesRemaining: 2820,
				updatedAt: Date.now()
			},
			dpi: {
				writable: true,
				min: 100,
				max: 25600,
				step: 50,
				stages: [
					800,
					1600,
					3200
				],
				activeDpi: 1600,
				defaultDpi: 800,
				shiftDpi: 800,
				maxStages: 5,
				profileMode: "software"
			},
			reportRate: {
				writable: true,
				value: 1e3,
				supportedRates: [
					125,
					250,
					500,
					1e3
				],
				profileMode: "software"
			},
			buttonAssignments: {
				writable: true,
				profileMode: "software",
				availableActions: [
					{
						id: "mouse.primary-click",
						label: "Left click",
						category: "mouse",
						searchTerms: ["primary click", "mb1"]
					},
					{
						id: "mouse.secondary-click",
						label: "Right click",
						category: "mouse",
						searchTerms: ["secondary click", "mb2"]
					},
					{
						id: "mouse.middle-click",
						label: "Middle click",
						category: "mouse",
						searchTerms: ["wheel press", "mb3"]
					},
					{
						id: "mouse.back",
						label: "Back",
						category: "mouse",
						searchTerms: ["browser back", "mb4"]
					},
					{
						id: "mouse.forward",
						label: "Forward",
						category: "mouse",
						searchTerms: ["browser forward", "mb5"]
					},
					{
						id: "mouse.dpi-up",
						label: "DPI up",
						category: "mouse",
						searchTerms: ["sensitivity increase"]
					},
					{
						id: "mouse.dpi-down",
						label: "DPI down",
						category: "mouse",
						searchTerms: ["sensitivity decrease"]
					},
					{
						id: "mouse.dpi-shift",
						label: "DPI shift",
						category: "mouse",
						searchTerms: ["sniper", "temporary dpi"]
					}
				],
				bindings: [
					previewBinding("primary", "Primary click", "g1", "mouse.primary-click", "left", 0, 44, 23),
					previewBinding("back", "Back", "g4", "mouse.back", "left", 1, 34, 55),
					previewBinding("dpi-shift", "DPI shift", "g5", "mouse.dpi-shift", "left", 2, 36, 43),
					previewBinding("secondary", "Secondary click", "g2", "mouse.secondary-click", "right", 0, 60, 23),
					previewBinding("wheel", "Wheel press", "g3", "mouse.middle-click", "right", 1, 53, 35),
					previewBinding("forward", "Forward", "g6", "mouse.forward", "right", 2, 35, 49)
				]
			},
			lighting: {
				batteryStatus: "monitoring",
				writable: true,
				enabled: true,
				activeEffectId: "static",
				availableEffects: [
					{
						id: "static",
						label: "Static",
						controls: [
							"color",
							"zones",
							"brightness"
						]
					},
					{
						id: "breathing",
						label: "Breathing",
						controls: [
							"color",
							"brightness",
							"speed"
						]
					},
					{
						id: "cycle",
						label: "Color cycle",
						controls: ["brightness", "speed"]
					},
					{
						id: "wave",
						label: "Color wave",
						controls: [
							"brightness",
							"speed",
							"direction"
						]
					},
					{
						id: "ripple",
						label: "Ripple",
						controls: ["color", "speed"]
					}
				],
				color: "#7dd3fc",
				colorWritable: true,
				brightness: 75,
				brightnessWritable: true,
				speed: 50,
				speedWritable: false,
				direction: "right",
				availableDirections: [
					"cycle",
					"left",
					"right",
					"up",
					"down",
					"in",
					"out",
					"center-in",
					"center-out"
				],
				directionWritable: false,
				zones: [
					{
						id: "zone-1",
						label: "Zone 1",
						color: "#7dd3fc",
						colorWritable: true
					},
					{
						id: "zone-2",
						label: "Zone 2",
						color: "#a78bfa",
						colorWritable: true
					},
					{
						id: "zone-3",
						label: "Zone 3",
						color: "#f472b6",
						colorWritable: true
					},
					{
						id: "zone-4",
						label: "Zone 4",
						color: "#fb7185",
						colorWritable: true
					},
					{
						id: "zone-5",
						label: "Zone 5",
						color: "#fbbf24",
						colorWritable: true
					},
					{
						id: "zone-6",
						label: "Zone 6",
						color: "#34d399",
						colorWritable: true
					},
					{
						id: "zone-7",
						label: "Zone 7",
						color: "#22d3ee",
						colorWritable: true
					},
					{
						id: "zone-8",
						label: "Zone 8",
						color: "#60a5fa",
						colorWritable: true
					}
				],
				profiles: [],
				muteLinked: false,
				muteLinkedWritable: false,
				physicalEffectVerified: false,
				profileMode: "software",
				source: "software",
				state: "unknown",
				stateReason: "Preview data mirrors a device-reported LIGHTSYNC layout; physical output still requires connected-hardware confirmation."
			},
			onboardMemory: {
				writable: true,
				enabled: false,
				activeProfile: "PROFILE_1"
			}
		},
		settings: {}
	},
	{
		id: "hyperx-quadcast2-1",
		moduleId: "device.hyperx-quadcast",
		displayName: "QuadCast 2",
		kind: "microphone",
		connected: true,
		identity: {
			manufacturer: "HyperX",
			productFamily: "QuadCast",
			model: "QuadCast 2",
			variant: "default",
			connection: "usb",
			vendorId: 1008,
			productId: 1972,
			interfaceProductIds: [1972, 2479],
			serialNumber: "PREVIEW-QUADCAST2",
			productString: "HyperX QuadCast 2"
		},
		variantResolution: {
			confidence: "fallback",
			source: "No cosmetic SKU reported by hardware"
		},
		asset: {
			key: "hyperx-quadcast-2",
			matchedBy: "exact-model",
			source: "bundled-official"
		},
		capabilities: {
			gain: true,
			monitoring: true,
			mute: true,
			muteState: {
				muted: false,
				source: "hardware",
				updatedAt: (/* @__PURE__ */ new Date()).toISOString()
			},
			lighting: {
				writable: true,
				enabled: true,
				activeEffectId: "solid",
				availableEffects: [
					{
						id: "solid",
						label: "Solid"
					},
					{
						id: "breathing",
						label: "Breathing"
					},
					{
						id: "pulse",
						label: "Pulse"
					}
				],
				color: "#f20000",
				colorWritable: false,
				brightness: 72,
				brightnessWritable: true,
				speed: 50,
				speedWritable: true,
				profiles: [
					{
						id: "broadcast",
						label: "Broadcast",
						effectId: "solid",
						brightness: 72,
						speed: 50
					},
					{
						id: "breathe",
						label: "Breathe",
						effectId: "breathing",
						brightness: 55,
						speed: 42
					},
					{
						id: "night",
						label: "Night",
						effectId: "solid",
						brightness: 25,
						speed: 50
					},
					{
						id: "custom",
						label: "Custom",
						effectId: "solid",
						brightness: 55,
						speed: 50
					}
				],
				activeProfileId: "broadcast",
				muteLinked: true,
				muteLinkedWritable: true,
				state: "maintained",
				physicalEffectVerified: false,
				profileMode: "software",
				source: "software"
			}
		},
		settings: {
			gain: 58,
			monitoring: 18,
			muteLed: true,
			lightingEnabled: true,
			lightingColor: "#f20000",
			lightingBrightness: 72,
			lightingEffect: "solid",
			lightingSpeed: 50,
			lightingProfileId: "broadcast",
			customLightingBrightness: 55,
			customLightingEffect: "solid",
			customLightingSpeed: 50
		}
	},
	{
		id: "razer-huntsman-v2-analog-1",
		moduleId: "device.razer-huntsman",
		displayName: "Huntsman V2 Analog",
		kind: "keyboard",
		connected: true,
		identity: {
			manufacturer: "Razer",
			productFamily: "Huntsman",
			model: "Huntsman V2 Analog",
			variant: "black",
			colorway: "Black",
			connection: "usb",
			connectionLabel: "USB",
			hardwareRevision: "0106",
			vendorId: 5426,
			productId: 614,
			interfaceProductIds: [614],
			serialNumber: "PREVIEW-HUNTSMAN-V2-ANALOG",
			productString: "Razer Huntsman V2 Analog"
		},
		variantResolution: {
			confidence: "product-id",
			source: "Razer USB product ID",
			evidence: "1532:0266"
		},
		asset: {
			key: "razer-huntsman-v2-analog",
			matchedBy: "exact-model",
			source: "bundled-official"
		},
		capabilities: {
			keyboard: {
				firmwareVersion: "1.06",
				pollingRateHz: 1e3,
				transport: "native-hid",
				features: huntsmanKeyboardFeatures.map((feature) => ({ ...feature })),
				gamingMode: {
					enabled: false,
					writable: true
				},
				onboardProfiles: {
					activeProfileId: "1",
					profiles: [{
						id: "1",
						label: "Profile 1"
					}, {
						id: "2",
						label: "Profile 2"
					}],
					writable: true
				},
				diagnostics: {
					protocol: "Razer feature reports",
					endpoint: "ready",
					lastSyncAt: "2026-08-27T00:00:00.000Z",
					reads: [
						"firmware",
						"serial-number",
						"brightness",
						"lighting-effect",
						"lighting-effects",
						"gaming-mode",
						"onboard-profiles",
						"active-profile"
					].map((id) => ({
						id,
						ok: true
					}))
				}
			},
			lighting: {
				writable: true,
				enabled: true,
				activeEffectId: "spectrum",
				availableEffects: [
					{
						id: "static",
						label: "Static",
						controls: ["color", "brightness"]
					},
					{
						id: "breathing",
						label: "Breathing",
						controls: ["color", "brightness"]
					},
					{
						id: "spectrum",
						label: "Spectrum",
						controls: ["brightness"]
					},
					{
						id: "reactive",
						label: "Reactive",
						controls: ["color", "brightness"]
					},
					{
						id: "starlight",
						label: "Starlight",
						controls: ["color", "brightness"]
					},
					{
						id: "wave-left",
						label: "Wave left",
						controls: ["brightness"]
					},
					{
						id: "wave-right",
						label: "Wave right",
						controls: ["brightness"]
					}
				],
				color: "#44aaff",
				colorWritable: true,
				brightness: 100,
				brightnessWritable: true,
				speedWritable: false,
				profiles: [],
				muteLinked: false,
				muteLinkedWritable: false,
				state: "maintained",
				stateReason: "Fixture: active effect and brightness were read back from keyboard firmware.",
				physicalEffectVerified: false,
				profileMode: "software",
				source: "firmware"
			}
		},
		settings: {
			lightingEnabled: true,
			lightingBrightness: 100,
			lightingEffect: "spectrum",
			lightingColor: "#44aaff"
		}
	}
];
var defaultAudio = {
	enabled: false,
	outputDevice: "",
	microphoneDevice: "",
	sampleRate: 48e3,
	mixes: [
		{
			id: "personal",
			label: "Personal",
			master: {
				gain: 1,
				enabled: true
			},
			buses: [
				{
					id: "game",
					gain: 1,
					enabled: true
				},
				{
					id: "chat",
					gain: .76,
					enabled: true
				},
				{
					id: "media",
					gain: .42,
					enabled: true
				},
				{
					id: "aux",
					gain: 1,
					enabled: true
				},
				{
					id: "mic",
					gain: .92,
					enabled: true
				}
			]
		},
		{
			id: "stream",
			label: "Stream",
			master: {
				gain: 1,
				enabled: true
			},
			buses: [
				{
					id: "game",
					gain: 1,
					enabled: true
				},
				{
					id: "chat",
					gain: 1,
					enabled: true
				},
				{
					id: "media",
					gain: .8,
					enabled: true
				},
				{
					id: "aux",
					gain: 0,
					enabled: false
				},
				{
					id: "mic",
					gain: 1,
					enabled: true
				}
			]
		},
		{
			id: "clip",
			label: "Clip",
			master: {
				gain: 1,
				enabled: true
			},
			buses: [
				{
					id: "game",
					gain: 1,
					enabled: true
				},
				{
					id: "chat",
					gain: .55,
					enabled: true
				},
				{
					id: "media",
					gain: .75,
					enabled: true
				},
				{
					id: "aux",
					gain: 0,
					enabled: false
				},
				{
					id: "mic",
					gain: 1,
					enabled: true
				}
			]
		}
	],
	chatMix: .15,
	monitoring: .18,
	monitoringEnabled: false,
	monitoringDeviceId: "",
	buses: [
		{
			id: "game",
			label: "Game",
			enabled: true,
			appCount: 0,
			meter: .72,
			endpoint: "Switchboard Audio - Gaming",
			deviceId: ""
		},
		{
			id: "chat",
			label: "Chat",
			enabled: true,
			appCount: 0,
			meter: .38,
			endpoint: "Switchboard Audio - Chat",
			deviceId: ""
		},
		{
			id: "media",
			label: "Media",
			enabled: true,
			appCount: 0,
			meter: .21,
			endpoint: "Switchboard Audio - Media",
			deviceId: ""
		},
		{
			id: "aux",
			label: "Aux",
			enabled: true,
			appCount: 0,
			meter: 0,
			endpoint: "Switchboard Audio - Aux",
			deviceId: ""
		},
		{
			id: "mic",
			label: "Microphone",
			enabled: true,
			appCount: 0,
			meter: .56,
			endpoint: "Switchboard Audio - Microphone",
			deviceId: ""
		}
	],
	micProcessors: createNaturalMicrophoneProcessors(),
	channelProcessing: [
		createDefaultChannelProcessing("game"),
		createDefaultChannelProcessing("chat"),
		createDefaultChannelProcessing("media")
	],
	devices: [],
	applications: [],
	capabilities: {
		virtualChannels: "unavailable",
		applicationRouting: "unavailable",
		channelDsp: "unavailable",
		microphoneDsp: "unavailable",
		noiseSuppression: "unavailable",
		realtimeMetering: "unavailable",
		microphoneTest: "unavailable",
		monitoring: "unavailable",
		spatialAudio: "unavailable"
	},
	host: null,
	pathPresets: structuredClone(defaultAudioPathPresets),
	activePresetIds: {
		game: "game-flat",
		chat: "chat-natural",
		media: "media-flat",
		microphone: "mic-natural-voice"
	}
};
var defaultCaptureConfig = {
	systemAudioMode: "system",
	enabled: false,
	source: "automatic-game",
	sourceId: null,
	displayIndex: 0,
	fps: 60,
	resolution: "1440p",
	codec: "auto",
	encoder: "auto",
	quality: 4,
	replaySeconds: 60,
	includeMic: true,
	includeSystemAudio: true,
	includeChatAudio: false,
	includeCursor: false,
	microphoneDeviceId: null,
	systemAudioDeviceId: null,
	chatAudioDeviceId: null,
	hotkey: "Ctrl+Shift+F10",
	clipsDirectory: null,
	defaultTrackLevels: {
		game: 100,
		chat: 100,
		microphone: 100,
		media: 100
	}
};
var defaultCaptureRuntime = {
	state: "stopped",
	bufferedSeconds: 0,
	segmentCount: 0,
	replayCacheBytes: 0,
	observedBitrateBps: 0,
	encoderLabel: "Not selected",
	backendLabel: "Windows Graphics Capture",
	droppedFrames: 0,
	encodedFrames: 0,
	audioSyncCorrections: 0,
	activeSource: null,
	saveQueueDepth: 0,
	shortcutRegistered: false,
	reactionClipping: {
		state: "disabled",
		inputLevelDb: -96,
		noiseFloorDb: -60,
		triggerThresholdDb: -18,
		reactionsDetected: 0,
		analyzedFrames: 0,
		analysisAverageMs: 0,
		cooldownRemainingSeconds: 0,
		lastReactionAt: null,
		message: null
	}
};
var defaultCaptureStorage = {
	clipsDirectory: "",
	cacheDirectory: "",
	availableBytes: 0,
	volumeTotalBytes: 0,
	volumeAvailableBytes: 0,
	clipsBytes: 0,
	replayCacheBytes: 0,
	lowSpace: false,
	criticalSpace: false
};
var defaultCaptureCapabilities = {
	backend: "unavailable",
	encoders: [],
	codecs: ["h264"],
	maximumFps: 60,
	systemAudio: false,
	microphoneAudio: false,
	exclusiveFullscreen: false
};
var defaultAutoCapture = {
	settings: {
		enabled: false,
		preRollSeconds: 20,
		postRollSeconds: 10,
		mergeNearbyEvents: true,
		mergeThresholdSeconds: 15,
		notifyWhenSaved: false,
		reactionClipping: {
			enabled: false,
			sensitivity: "balanced",
			preRollSeconds: 20,
			postRollSeconds: 10,
			cooldownSeconds: 60
		},
		games: {},
		dismissedAvailability: {}
	},
	providers: [],
	runtime: {
		state: "disabled",
		activeGameId: null,
		activeProviderId: null,
		pendingCapture: null,
		eventsReceived: 0,
		eventsDeduplicated: 0,
		eventsIgnored: 0,
		clipsCreated: 0,
		lastEvent: null,
		lastError: null
	}
};
var defaultGameDetection = {
	capability: "available",
	scanState: "idle",
	games: [],
	lastScanAt: null
};
var defaultSettings = {
	uiScalePercent: 125,
	launchAtStartup: false,
	closeToTray: true,
	destroyRendererInTray: true,
	softwareRendering: false,
	automaticAppUpdates: true,
	automaticAppUpdateDownloads: true,
	installAppUpdatesOnNextStartup: true,
	installAppUpdatesWhenIdle: true,
	automaticModuleUpdates: true,
	performanceGuard: true,
	detailedDiagnostics: false,
	diagnosticsRetentionDays: 7,
	telemetry: false,
	scanGamesAutomatically: true,
	clipEditorInspectorOpen: true,
	deviceAppearanceOverrides: {},
	mouseBatteryLighting: {},
	developerMode: false,
	visibleWorkspaces: [
		"devices",
		"audio",
		"capture"
	],
	onboardingCompleted: false
};
var defaultAppUpdate = {
	capability: "unavailable",
	status: "unavailable",
	currentVersion: "0.8.7",
	availableVersion: null,
	downloadProgress: null,
	checkedAt: null,
	error: null,
	unavailableReason: "Application updates are available only in an installed Windows build."
};
var stoppedEngines = [{
	kind: "audio",
	state: "stopped",
	cpuPercent: 0,
	memoryMb: 0,
	uptimeSeconds: 0,
	updatedAt: now()
}, {
	kind: "capture",
	state: "stopped",
	cpuPercent: 0,
	memoryMb: 0,
	uptimeSeconds: 0,
	updatedAt: now()
}];
var defaultPerformance = {
	coreMemoryMb: 0,
	rendererMemoryMb: 0,
	totalMemoryMb: 0,
	residentMemoryMb: 0,
	totalCpuPercent: 0,
	activeProcesses: 1,
	budgetMemoryMb: 180,
	budgetCpuPercent: .7,
	sampledAt: null,
	guardState: "collecting",
	warning: null
};
var seedClips = [];
function createDefaultSnapshot() {
	return {
		setup: setupStateSchema.parse({}),
		version: "0.8.7",
		diagnostics: structuredClone(idleDiagnosticRun),
		prototypeMode: true,
		appUpdate: structuredClone(defaultAppUpdate),
		modules: structuredClone(defaultModules),
		devices: structuredClone(defaultDevices),
		engines: structuredClone(stoppedEngines),
		audio: structuredClone(defaultAudio),
		capture: {
			config: structuredClone(defaultCaptureConfig),
			runtime: structuredClone(defaultCaptureRuntime),
			storage: structuredClone(defaultCaptureStorage),
			capabilities: structuredClone(defaultCaptureCapabilities),
			sources: [],
			autoCapture: structuredClone(defaultAutoCapture)
		},
		clips: structuredClone(seedClips),
		clipReview: { reviewedThrough: 0 },
		gameDetection: structuredClone(defaultGameDetection),
		performance: structuredClone(defaultPerformance),
		settings: structuredClone(defaultSettings)
	};
}
//#endregion
//#region src/shared/device-variant.ts
/**
* Resolves cosmetic identity without knowing anything about a particular vendor.
* Vendor modules provide candidates; a stable user override is considered only
* when automatic evidence did not identify a variant.
*/
function resolveDeviceVariant(deviceIdentity, moduleMetadata = [], fallbackOverride) {
	const automatic = [...moduleMetadata].sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence))[0];
	if (automatic) return {
		identity: {
			...deviceIdentity,
			variant: automatic.variant,
			colorway: automatic.colorway ?? deviceIdentity.colorway
		},
		resolution: {
			confidence: automatic.confidence,
			source: automatic.source,
			evidence: automatic.evidence
		}
	};
	if (fallbackOverride) return {
		identity: {
			...deviceIdentity,
			variant: fallbackOverride.variant,
			colorway: fallbackOverride.colorway
		},
		resolution: {
			confidence: "user-override",
			source: "Stable device appearance override",
			evidence: `Stored for ${stableIdentityLabel(deviceIdentity)}`
		}
	};
	return {
		identity: {
			...deviceIdentity,
			variant: deviceIdentity.variant ?? "default"
		},
		resolution: {
			confidence: "fallback",
			source: "No cosmetic SKU reported by hardware"
		}
	};
}
function confidenceRank(confidence) {
	if (confidence === "hardware") return 3;
	if (confidence === "product-id") return 2;
	return 1;
}
function stableIdentityLabel(identity) {
	return identity.serialNumber ?? ([identity.vendorId, identity.productId].filter((value) => value !== void 0).join(":") || "device identity");
}
//#endregion
//#region src/shared/product-assets.ts
var productAssets = [
	{
		key: "logitech-g502-x-plus-white",
		manufacturer: "logitech",
		model: "g502 x plus",
		variant: "white",
		colorway: "white",
		matchedBy: "exact-variant",
		source: "bundled-official"
	},
	{
		key: "logitech-g502-x-plus-black",
		manufacturer: "logitech",
		model: "g502 x plus",
		variant: "black",
		colorway: "black",
		matchedBy: "exact-variant",
		source: "bundled-official"
	},
	{
		key: "logitech-g502-x-plus-black",
		manufacturer: "logitech",
		model: "g502 x plus",
		matchedBy: "exact-model",
		source: "bundled-official"
	},
	{
		key: "hyperx-quadcast-2",
		manufacturer: "hyperx",
		model: "quadcast 2",
		matchedBy: "exact-model",
		source: "bundled-official"
	},
	{
		key: "razer-huntsman-v2-analog",
		manufacturer: "razer",
		model: "huntsman v2 analog",
		matchedBy: "exact-model",
		source: "bundled-official"
	}
];
function resolveProductAsset(identity, kind) {
	const manufacturer = normalize$4(identity.manufacturer);
	const model = normalize$4(identity.model);
	const variant = normalize$4(identity.variant);
	const colorway = normalize$4(identity.colorway);
	const exactVariant = productAssets.find((asset) => asset.matchedBy === "exact-variant" && asset.manufacturer === manufacturer && asset.model === model && (asset.variant === variant || asset.colorway === colorway));
	if (exactVariant) return stripLookupFields(exactVariant);
	const exactModel = productAssets.find((asset) => asset.matchedBy === "exact-model" && asset.manufacturer === manufacturer && asset.model === model);
	if (exactModel) return stripLookupFields(exactModel);
	const manufacturerDefault = productAssets.find((asset) => asset.matchedBy === "manufacturer-default" && asset.manufacturer === manufacturer);
	if (manufacturerDefault) return stripLookupFields(manufacturerDefault);
	return {
		key: `generic-${kind}`,
		matchedBy: "generic",
		source: "bundled-generic"
	};
}
function stripLookupFields(asset) {
	return {
		key: asset.key,
		matchedBy: asset.matchedBy,
		source: asset.source
	};
}
function normalize$4(value) {
	return value?.trim().toLocaleLowerCase("en-US");
}
//#endregion
//#region src/shared/capture-presets.ts
var BASE_60_FPS_MBPS = {
	"720p": [
		3,
		5,
		7.5,
		11,
		15
	],
	"1080p": [
		6,
		9,
		14,
		20,
		28
	],
	"1440p": [
		10,
		16,
		24,
		35,
		48
	],
	"2160p": [
		18,
		28,
		42,
		60,
		85
	]
};
var CODEC_FACTOR = {
	h264: 1,
	hevc: .74,
	av1: .64
};
var FPS_FACTOR = {
	30: .66,
	60: 1,
	120: 1.72
};
function inferredResolution(config) {
	return config.resolution === "native" ? "1440p" : config.resolution;
}
function getEncodingPreset(config) {
	const resolution = inferredResolution(config);
	const qualityIndex = Math.max(0, Math.min(4, config.quality - 1));
	const targetMbps = BASE_60_FPS_MBPS[resolution][qualityIndex] * CODEC_FACTOR[config.codec === "auto" ? "h264" : config.codec] * FPS_FACTOR[config.fps];
	const targetVideoBitrateBps = Math.round(targetMbps * 1e6);
	return {
		targetVideoBitrateBps,
		maximumVideoBitrateBps: Math.round(targetVideoBitrateBps * 1.28),
		systemAudioBitrateBps: 192e3,
		microphoneBitrateBps: config.includeMic ? 128e3 : 0,
		chatAudioBitrateBps: config.includeChatAudio === true ? 128e3 : 0
	};
}
function sanitizeClipBaseName(value) {
	const sanitized = value.normalize("NFKC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/[. ]+$/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
	if (!sanitized || /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(sanitized)) return "Capture";
	return sanitized.replace(/\s+/g, "");
}
//#endregion
//#region src/shared/audio-devices.ts
var personalOutputFormFactors = /* @__PURE__ */ new Set(["headphones", "headset"]);
function availableDevices(devices, direction) {
	return devices.filter((device) => device.available && device.direction === direction && !device.isSwitchboard);
}
function preferredFallback(devices, direction) {
	const candidates = availableDevices(devices, direction);
	const defaultDevice = candidates.find((device) => device.isDefault);
	if (defaultDevice && !defaultDevice.isVirtual) return defaultDevice;
	return (direction === "output" ? candidates.find((device) => !device.isVirtual && device.formFactor && personalOutputFormFactors.has(device.formFactor)) : candidates.find((device) => !device.isVirtual && device.formFactor === "microphone")) ?? defaultDevice ?? candidates.find((device) => !device.isVirtual) ?? candidates[0];
}
function selectedOrFallback(devices, direction, selectedId) {
	return availableDevices(devices, direction).find((device) => device.id === selectedId) ?? preferredFallback(devices, direction);
}
function reconcileAudioDevices(audio, discoveredDevices) {
	const uniqueDevices = /* @__PURE__ */ new Map();
	for (const device of discoveredDevices) {
		if (!device.available || uniqueDevices.has(device.id)) continue;
		uniqueDevices.set(device.id, structuredClone(device));
	}
	audio.devices = [...uniqueDevices.values()];
	for (const bus of audio.buses) {
		const direction = bus.id === "mic" ? "input" : "output";
		bus.deviceId = selectedOrFallback(audio.devices, direction, bus.deviceId)?.id ?? "";
	}
	const gameDeviceId = audio.buses.find((bus) => bus.id === "game")?.deviceId ?? "";
	const microphoneDeviceId = audio.buses.find((bus) => bus.id === "mic")?.deviceId ?? "";
	audio.outputDevice = audio.devices.find((device) => device.id === gameDeviceId)?.name ?? "";
	audio.microphoneDevice = audio.devices.find((device) => device.id === microphoneDeviceId)?.name ?? "";
	const monitoringDevice = selectedOrFallback(audio.devices, "output", audio.monitoringDeviceId);
	audio.monitoringDeviceId = monitoringDevice?.id ?? "";
	if (!monitoringDevice) audio.monitoringEnabled = false;
	const outputIds = new Set(availableDevices(audio.devices, "output").map((device) => device.id));
	for (const preset of audio.pathPresets) {
		if (preset.kind !== "microphone") continue;
		if (!outputIds.has(preset.monitoring.deviceId)) {
			preset.monitoring.deviceId = monitoringDevice?.id ?? "";
			if (!monitoringDevice) preset.monitoring.enabled = false;
		}
	}
}
//#endregion
//#region src/main/services/capture-storage.ts
var GIB = 1024 ** 3;
var CaptureStorageService = class {
	videosDirectory;
	userDataDirectory;
	constructor(videosDirectory, userDataDirectory) {
		this.videosDirectory = videosDirectory;
		this.userDataDirectory = userDataDirectory;
	}
	getDefaultClipsDirectory() {
		return join(this.videosDirectory, "Switchboard", "Clips");
	}
	resolvePaths(customDirectory) {
		return {
			clipsDirectory: resolve(customDirectory ?? this.getDefaultClipsDirectory()),
			cacheDirectory: join(this.userDataDirectory, "cache", "replay"),
			thumbnailDirectory: join(this.userDataDirectory, "cache", "thumbnails")
		};
	}
	async validate(customDirectory) {
		const paths = this.resolvePaths(customDirectory);
		await Promise.all([
			this.assertWritableDirectory(paths.clipsDirectory),
			this.assertWritableDirectory(paths.cacheDirectory),
			this.assertWritableDirectory(paths.thumbnailDirectory)
		]);
		return paths;
	}
	async getStorageStatus(paths, clipsBytes, replayCacheBytes) {
		let availableBytes = 0;
		let volumeTotalBytes = 0;
		let volumeAvailableBytes = 0;
		let warning;
		try {
			const [cacheStats, clipsStats] = await Promise.all([statfs(paths.cacheDirectory, { bigint: true }), statfs(paths.clipsDirectory, { bigint: true })]);
			availableBytes = Math.min(Number(cacheStats.bavail * cacheStats.bsize), Number(clipsStats.bavail * clipsStats.bsize));
			volumeTotalBytes = Number(clipsStats.blocks * clipsStats.bsize);
			volumeAvailableBytes = Number(clipsStats.bavail * clipsStats.bsize);
		} catch (error) {
			warning = `Storage is unavailable: ${error instanceof Error ? error.message : String(error)}`;
		}
		const lowSpace = availableBytes > 0 && availableBytes < 5 * GIB;
		const criticalSpace = availableBytes > 0 && availableBytes < GIB;
		if (!warning && criticalSpace) warning = "Storage is critically low. Instant Replay cannot safely write new data.";
		else if (!warning && lowSpace) warning = "Storage is running low.";
		return {
			clipsDirectory: paths.clipsDirectory,
			cacheDirectory: paths.cacheDirectory,
			availableBytes,
			volumeTotalBytes,
			volumeAvailableBytes,
			clipsBytes,
			replayCacheBytes,
			lowSpace,
			criticalSpace,
			...warning ? { warning } : {}
		};
	}
	async assertWritableDirectory(directory) {
		await mkdir(directory, { recursive: true });
		const testPath = join(directory, `.switchboard-write-test-${randomUUID()}.tmp`);
		let file;
		try {
			file = await open(testPath, "wx");
			await file.write("Switchboard storage check");
			await file.sync();
		} finally {
			await file?.close();
			await rm(testPath, { force: true });
		}
	}
};
//#endregion
//#region src/main/services/audio-endpoint-discovery.ts
var discoveredEndpointSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(1),
	flow: z.enum(["render", "capture"]),
	isDefault: z.boolean(),
	formFactor: audioEndpointFormFactorSchema.nullable(),
	interfaceName: z.string().nullable(),
	volume: z.number(),
	muted: z.boolean(),
	isSwitchboard: z.boolean().default(false)
});
var discoveredEndpointsSchema = z.array(discoveredEndpointSchema);
var virtualDevicePattern = /\bvirtual(?: audio)? device\b/i;
var maximumOutputBytes$1 = 2097152;
var AudioEndpointDiscovery = class {
	options;
	constructor(options) {
		this.options = options;
	}
	async list() {
		if ((this.options.platform ?? process.platform) !== "win32") return [];
		const { command, arguments: commandArguments, cwd } = this.resolveCommand();
		const environment = { ...process.env };
		delete environment.ELECTRON_RUN_AS_NODE;
		const stdout = await run(command, commandArguments, cwd, environment, this.options.timeoutMs ?? 15e3);
		return discoveredEndpointsSchema.parse(JSON.parse(stdout)).map((endpoint) => ({
			id: endpoint.id,
			name: endpoint.name,
			direction: endpoint.flow === "render" ? "output" : "input",
			isDefault: endpoint.isDefault,
			available: true,
			formFactor: endpoint.formFactor,
			isVirtual: virtualDevicePattern.test(endpoint.interfaceName ?? endpoint.name),
			isSwitchboard: endpoint.isSwitchboard
		}));
	}
	resolveCommand() {
		if (this.options.isPackaged) {
			const directory = join(this.options.resourcesPath, "audio-host");
			return {
				command: join(directory, "Audio.Host.exe"),
				arguments: ["--list-endpoints"],
				cwd: directory
			};
		}
		if (process.env.SWITCHBOARD_NATIVE_REVIEW === "1") {
			const reviewExecutable = process.env.SWITCHBOARD_NATIVE_REVIEW_AUDIO_HOST;
			if (reviewExecutable && existsSync(reviewExecutable)) return {
				command: reviewExecutable,
				arguments: ["--list-endpoints"],
				cwd: dirname(reviewExecutable)
			};
			const directory = join(this.options.appPath, "engines", "audio-host", "bin", "Debug", "net10.0-windows");
			const executable = join(directory, "Audio.Host.exe");
			if (existsSync(executable)) return {
				command: executable,
				arguments: ["--list-endpoints"],
				cwd: directory
			};
		}
		const configuredExecutable = process.env.SWITCHBOARD_DEVELOPMENT_AUDIO_HOST;
		if (configuredExecutable && existsSync(configuredExecutable)) return {
			command: configuredExecutable,
			arguments: ["--list-endpoints"],
			cwd: dirname(configuredExecutable)
		};
		return {
			command: "dotnet",
			arguments: [
				"run",
				"--project",
				join(this.options.appPath, "engines", "audio-host", "Audio.Host.csproj"),
				"--no-launch-profile",
				"--",
				"--list-endpoints"
			],
			cwd: this.options.appPath
		};
	}
};
function run(command, commandArguments, cwd, environment, timeoutMs) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, commandArguments, {
			cwd,
			env: environment,
			windowsHide: true,
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			]
		});
		let stdout = "";
		let stderr = "";
		let settled = false;
		const finish = (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			if (error) reject(error);
			else resolve(stdout.trim());
		};
		const timeout = setTimeout(() => {
			child.kill();
			finish(/* @__PURE__ */ new Error("Windows audio endpoint discovery timed out."));
		}, timeoutMs);
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
			if (stdout.length > maximumOutputBytes$1) {
				child.kill();
				finish(/* @__PURE__ */ new Error("Windows audio endpoint discovery returned too much data."));
			}
		});
		child.stderr.on("data", (chunk) => {
			if (stderr.length <= maximumOutputBytes$1) stderr += String(chunk);
		});
		child.once("error", (error) => finish(error));
		child.once("close", (code) => {
			if (code === 0) finish();
			else finish(/* @__PURE__ */ new Error(`Windows audio endpoint discovery exited with code ${code}: ${stderr.trim()}`));
		});
	});
}
//#endregion
//#region src/shared/microphone-runtime.ts
function parametersMatch(configured, expected) {
	return JSON.stringify(configured.parameters) === JSON.stringify(expected.parameters);
}
function microphoneDspConfigurationApplied(audio) {
	const runtime = audio.host?.microphone;
	if (!audio.host?.running || !runtime || runtime.configurationVersion <= 0) return false;
	if (runtime.processors.length !== audio.micProcessors.length) return false;
	return audio.micProcessors.every((expected) => {
		const configured = runtime.processors.find((candidate) => candidate.id === expected.id);
		return Boolean(configured && configured.enabled === expected.enabled && parametersMatch(configured, expected));
	});
}
function microphoneInputApplied(audio) {
	const selectedInputId = audio.buses.find((bus) => bus.id === "mic")?.deviceId;
	return Boolean(audio.host?.running && selectedInputId && audio.host.microphone?.requestedInputDeviceId === selectedInputId && audio.host.microphone.activeInputDeviceId === selectedInputId);
}
function microphoneMonitoringApplied(audio) {
	const monitoring = audio.host?.microphone?.monitoring;
	if (!audio.host?.running || !monitoring) return false;
	if (monitoring.requested !== audio.monitoringEnabled) return false;
	if (Math.abs(monitoring.level - audio.monitoring) > 1e-4) return false;
	if (!audio.monitoringEnabled) return !monitoring.active;
	return monitoring.active && monitoring.requestedDeviceId === audio.monitoringDeviceId && monitoring.activeDeviceId === audio.monitoringDeviceId;
}
//#endregion
//#region src/main/services/audio-configuration.ts
var preferenceKeys = [
	"outputDevice",
	"microphoneDevice",
	"mixes",
	"chatMix",
	"monitoring",
	"monitoringEnabled",
	"monitoringDeviceId",
	"buses",
	"micProcessors",
	"channelProcessing",
	"pathPresets",
	"activePresetIds"
];
function applyAudioPreferenceChanges(current, before, next) {
	for (const key of preferenceKeys) {
		if (JSON.stringify(before[key]) === JSON.stringify(next[key])) continue;
		if (key === "buses") current.buses = next.buses.map((bus) => ({
			...bus,
			appCount: current.buses.find((item) => item.id === bus.id)?.appCount ?? 0
		}));
		else Object.assign(current, { [key]: structuredClone(next[key]) });
	}
}
var AudioConfiguration = class {
	dependencies;
	tail = Promise.resolve();
	constructor(dependencies) {
		this.dependencies = dependencies;
	}
	run(operation) {
		const result = this.tail.then(operation);
		this.tail = result.catch(() => void 0);
		return result;
	}
	update(change) {
		return this.run(async () => {
			const before = this.dependencies.read();
			const draft = structuredClone(before);
			change(draft);
			const next = audioStateSchema.parse(draft);
			let host;
			const changesHost = preferenceKeys.some((key) => key !== "pathPresets" && key !== "activePresetIds" && JSON.stringify(before[key]) !== JSON.stringify(next[key]));
			if (before.enabled && changesHost) try {
				host = await this.dependencies.configure(next);
				assertAudioConfigurationApplied(before, next, host);
			} catch (error) {
				try {
					this.dependencies.publish(await this.dependencies.configure(this.dependencies.read()));
				} catch {}
				throw error;
			}
			this.dependencies.commit(before, next);
			if (host) this.dependencies.publish(host);
		});
	}
};
function assertAudioConfigurationApplied(before, next, host) {
	if (!host.running) throw new Error("The audio engine stopped before accepting the change.");
	const applied = {
		...next,
		host
	};
	if (JSON.stringify(before.mixes) !== JSON.stringify(next.mixes) && JSON.stringify(next.mixes) !== JSON.stringify(host.mixes)) throw new Error("The audio engine did not accept the mix levels.");
	if (before.buses.find((bus) => bus.id === "mic")?.deviceId !== next.buses.find((bus) => bus.id === "mic")?.deviceId && !microphoneInputApplied(applied)) throw new Error(host.microphone?.error ?? "The selected microphone could not start.");
	if (JSON.stringify(before.micProcessors) !== JSON.stringify(next.micProcessors) && (!microphoneDspConfigurationApplied(applied) || host.capabilities.microphoneDsp !== "available")) throw new Error(host.microphone?.error ?? "The microphone did not accept its processing settings.");
	if ((before.monitoringEnabled !== next.monitoringEnabled || before.monitoringDeviceId !== next.monitoringDeviceId || before.monitoring !== next.monitoring) && !microphoneMonitoringApplied(applied)) throw new Error(host.microphone?.error ?? "The monitoring output did not accept the change.");
	if (before.capabilities.virtualChannels === "available" && host.capabilities.virtualChannels !== "available") throw new Error(host.error ?? "The audio route could not accept the change.");
}
//#endregion
//#region src/main/services/app-update-service.ts
var updateInfoSchema = z.object({ version: z.string().min(1) }).passthrough();
var downloadProgressSchema = z.object({ percent: z.number().finite() }).passthrough();
var startupDelayMs = 15e3;
var idleThresholdSeconds = 600;
var idlePollIntervalMs = 6e4;
var AppUpdateService = class {
	options;
	state;
	updater = null;
	preferences = {
		automaticChecks: true,
		automaticDownloads: true,
		installOnNextStartup: true,
		installWhenIdle: true
	};
	demoUpdateEnabled;
	initialized = false;
	disposed = false;
	scheduledCheck = null;
	scheduledIdleCheck = null;
	activeCheck = null;
	downloadedVersion = null;
	listeners = [];
	constructor(options) {
		this.options = options;
		this.demoUpdateEnabled = options.demoUpdate === true && !options.isPackaged;
		this.state = appUpdateStateSchema.parse({
			capability: "unavailable",
			status: "unavailable",
			currentVersion: options.currentVersion,
			availableVersion: null,
			downloadProgress: null,
			checkedAt: null,
			error: null,
			unavailableReason: "Application updates are available only in an installed Windows build."
		});
	}
	async initialize(preferences) {
		this.preferences = structuredClone(preferences);
		if (this.initialized || this.disposed) return this.getState();
		this.initialized = true;
		if (this.demoUpdateEnabled) return this.publishDemoUpdate();
		if (!this.options.isPackaged || this.options.platform !== "win32") return this.publish({
			capability: "unavailable",
			status: "unavailable",
			unavailableReason: this.options.isPackaged ? "Application updates are currently supported only on Windows." : "Application updates are available only in an installed Windows build."
		});
		try {
			const loadUpdater = this.options.loadUpdater ?? loadDefaultAppUpdaterClient;
			this.updater = await loadUpdater();
			if (this.disposed) {
				this.updater = null;
				return this.getState();
			}
			this.applyPreferencesToUpdater(this.updater);
			this.attachListeners(this.updater);
			const next = this.publish({
				capability: "available",
				status: "idle",
				error: null,
				unavailableReason: null
			});
			if (this.preferences.automaticChecks) this.scheduleCheck(this.options.startupDelayMs ?? startupDelayMs);
			return next;
		} catch (error) {
			console.error("Switchboard app updater failed to initialize.", error);
			return this.publish({
				capability: "unavailable",
				status: "unavailable",
				error: null,
				unavailableReason: "The application updater could not start in this installation."
			});
		}
	}
	enableDemoUpdate() {
		if (this.options.isPackaged || this.disposed) return this.getState();
		this.demoUpdateEnabled = true;
		this.clearScheduledCheck();
		return this.publishDemoUpdate();
	}
	setPreferences(preferences) {
		const shouldStartDownload = !this.preferences.automaticDownloads && preferences.automaticDownloads && this.state.status === "available";
		this.preferences = structuredClone(preferences);
		if (this.updater) this.applyPreferencesToUpdater(this.updater);
		if (!preferences.automaticChecks) this.clearScheduledCheck();
		else if (this.updater && !this.disposed) this.scheduleCheck(this.options.startupDelayMs ?? startupDelayMs);
		if (shouldStartDownload) this.downloadAvailableUpdate();
		this.syncIdleInstallTimer();
		return this.getState();
	}
	checkForUpdates() {
		if (this.demoUpdateEnabled) return Promise.resolve(this.publishDemoUpdate());
		if (!this.updater || this.disposed || this.state.capability !== "available") return Promise.resolve(this.getState());
		if (this.activeCheck) return this.activeCheck;
		if (["downloading", "installing"].includes(this.state.status)) return Promise.resolve(this.getState());
		const check = this.performCheck().finally(() => {
			if (this.activeCheck === check) this.activeCheck = null;
		});
		this.activeCheck = check;
		return check;
	}
	async downloadAvailableUpdate() {
		if (this.demoUpdateEnabled) {
			if (this.state.status !== "available") return this.getState();
			return this.publish({
				status: "downloaded",
				downloadProgress: 100,
				error: null
			});
		}
		if (!this.updater || this.disposed || this.state.status !== "available") throw new Error("No Switchboard update is available to download.");
		this.publish({
			status: "downloading",
			downloadProgress: 0,
			error: null
		});
		this.downloadedVersion = null;
		try {
			await this.updater.downloadUpdate();
		} catch (error) {
			console.error("Switchboard app update download failed.", error);
			this.publish({
				status: "error",
				error: "Switchboard could not download the update. Check your connection and try again."
			});
		}
		return this.getState();
	}
	async installDownloadedUpdate(background = false) {
		if (this.demoUpdateEnabled) throw new Error("The development update preview does not include an installer.");
		if (!this.updater || this.disposed || this.state.status !== "downloaded") throw new Error("No downloaded Switchboard update is ready to install.");
		await this.checkForUpdates();
		if (this.disposed || this.state.status !== "downloaded") return;
		if (background && (!this.preferences.installWhenIdle || !this.preferences.automaticChecks || !this.options.canInstallInBackground?.() || (this.options.getSystemIdleTime?.() ?? 0) < idleThresholdSeconds)) return;
		this.publish({
			status: "installing",
			error: null
		});
		try {
			this.options.onInstallRequested?.(true, background);
			this.updater.quitAndInstall(true, true);
		} catch (error) {
			this.options.onInstallRequested?.(false, background);
			console.error("Switchboard failed to launch the downloaded update.", error);
			this.publish({
				status: "error",
				error: "The downloaded update could not be started. Try again or reinstall Switchboard manually."
			});
			throw error;
		}
	}
	getState() {
		return structuredClone(this.state);
	}
	dispose() {
		if (this.disposed) return;
		this.disposed = true;
		this.clearScheduledCheck();
		this.clearIdleInstallTimer();
		if (this.updater) for (const { event, listener } of this.listeners) this.updater.removeListener(event, listener);
		this.listeners.length = 0;
		this.updater = null;
	}
	async performCheck() {
		this.publish({
			status: "checking",
			downloadProgress: null,
			error: null
		});
		try {
			await this.updater?.checkForUpdates();
		} catch (error) {
			console.error("Switchboard app update check failed.", error);
			if (this.state.status !== "error") this.publish({
				status: "error",
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: "Switchboard could not reach its update feed. Check your connection and try again."
			});
		}
		return this.getState();
	}
	attachListeners(updater) {
		this.listen(updater, "checking-for-update", () => {
			this.publish({
				status: "checking",
				downloadProgress: null,
				error: null
			});
		});
		this.listen(updater, "update-available", (payload) => {
			const parsed = updateInfoSchema.safeParse(payload);
			if (!parsed.success) return this.handleInvalidProviderPayload("available update metadata");
			if (parsed.data.version === this.downloadedVersion) {
				this.publish({
					status: "downloaded",
					availableVersion: parsed.data.version,
					downloadProgress: 100,
					checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
					error: null
				});
				return;
			}
			this.publish({
				status: "available",
				availableVersion: parsed.data.version,
				downloadProgress: 0,
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: null
			});
			if (this.preferences.automaticDownloads) this.downloadAvailableUpdate();
		});
		this.listen(updater, "update-not-available", () => {
			this.publish({
				status: "idle",
				availableVersion: null,
				downloadProgress: null,
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: null
			});
		});
		this.listen(updater, "download-progress", (payload) => {
			const parsed = downloadProgressSchema.safeParse(payload);
			if (!parsed.success) return this.handleInvalidProviderPayload("download progress");
			this.publish({
				status: "downloading",
				downloadProgress: Math.min(100, Math.max(0, parsed.data.percent)),
				error: null
			});
		});
		this.listen(updater, "update-downloaded", (payload) => {
			const parsed = updateInfoSchema.safeParse(payload);
			if (!parsed.success) return this.handleInvalidProviderPayload("downloaded update metadata");
			if (this.state.availableVersion && parsed.data.version !== this.state.availableVersion) return;
			this.downloadedVersion = parsed.data.version;
			this.publish({
				status: "downloaded",
				availableVersion: parsed.data.version,
				downloadProgress: 100,
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: null
			});
			this.clearScheduledCheck();
			this.scheduleCheck(0);
		});
		this.listen(updater, "error", (payload) => {
			if (this.state.status === "installing") this.options.onInstallRequested?.(false, true);
			console.error("Switchboard app updater reported an error.", payload);
			this.publish({
				status: "error",
				checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
				error: "Switchboard could not complete the update. Check your connection and try again."
			});
		});
	}
	applyPreferencesToUpdater(updater) {
		updater.autoDownload = false;
		updater.autoInstallOnAppQuit = this.preferences.installOnNextStartup && this.state.status === "downloaded" && this.state.availableVersion === this.downloadedVersion;
	}
	publishDemoUpdate() {
		return this.publish({
			capability: "available",
			status: "available",
			availableVersion: getDemoAvailableVersion(this.options.currentVersion),
			downloadProgress: 0,
			checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
			error: null,
			unavailableReason: null
		});
	}
	listen(updater, event, listener) {
		updater.on(event, listener);
		this.listeners.push({
			event,
			listener
		});
	}
	handleInvalidProviderPayload(kind) {
		console.error(`Switchboard updater received invalid ${kind}.`);
		this.publish({
			status: "error",
			checkedAt: (/* @__PURE__ */ new Date()).toISOString(),
			error: "The update feed returned invalid release information. Try again later."
		});
	}
	scheduleCheck(delayMs) {
		if (!this.preferences.automaticChecks || !this.updater || this.disposed || this.scheduledCheck) return;
		this.scheduledCheck = setTimeout(() => {
			this.scheduledCheck = null;
			this.checkForUpdates().finally(() => {
				this.scheduleCheck(this.options.repeatIntervalMs ?? 18e5);
			});
		}, delayMs);
		this.scheduledCheck.unref?.();
	}
	clearScheduledCheck() {
		if (this.scheduledCheck) clearTimeout(this.scheduledCheck);
		this.scheduledCheck = null;
	}
	publish(patch) {
		this.state = appUpdateStateSchema.parse({
			...this.state,
			...patch
		});
		if (this.updater) this.applyPreferencesToUpdater(this.updater);
		const snapshot = this.getState();
		this.options.onStateChanged(snapshot);
		this.syncIdleInstallTimer();
		return snapshot;
	}
	syncIdleInstallTimer() {
		if (this.disposed || !this.updater || !this.preferences.automaticChecks || !this.preferences.installWhenIdle || this.state.status !== "downloaded" || !this.options.getSystemIdleTime || !this.options.canInstallInBackground) {
			this.clearIdleInstallTimer();
			return;
		}
		if (this.scheduledIdleCheck) return;
		this.scheduledIdleCheck = setTimeout(async () => {
			this.scheduledIdleCheck = null;
			try {
				const idleSeconds = this.options.getSystemIdleTime();
				if (Number.isFinite(idleSeconds) && idleSeconds >= idleThresholdSeconds && this.options.canInstallInBackground()) await this.installDownloadedUpdate(true);
			} catch (error) {
				console.error("Switchboard background update could not start.", error);
			}
			this.syncIdleInstallTimer();
		}, this.options.idlePollIntervalMs ?? idlePollIntervalMs);
		this.scheduledIdleCheck.unref?.();
	}
	clearIdleInstallTimer() {
		if (this.scheduledIdleCheck) clearTimeout(this.scheduledIdleCheck);
		this.scheduledIdleCheck = null;
	}
};
function getDemoAvailableVersion(currentVersion) {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(currentVersion);
	if (!match) return "0.2.0";
	return `${match[1]}.${Number(match[2]) + 1}.0`;
}
async function loadDefaultAppUpdaterClient() {
	return resolveAppUpdaterClient(await import("electron-updater"));
}
function resolveAppUpdaterClient(updaterModule) {
	const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
	if (!autoUpdater) throw new Error("electron-updater did not expose autoUpdater.");
	return autoUpdater;
}
//#endregion
//#region src/main/modules/hyperx/quadcast2-protocol.ts
var quadCast2StatusRed = "#f20000";
/**
* The QuadCast 2 audio function emits an absolute tap-mute state on its
* vendor-defined 0xFFC0 collection. Other input reports are intentionally
* ignored instead of being interpreted as toggle events.
*/
function parseQuadCast2MuteReport(report) {
	if (report.byteLength < 3 || report[0] !== 119 || report[1] !== 6) return null;
	return report[2] !== 0;
}
function buildQuadCast2LightingReports(config, frameIndex, physicalMuted) {
	const intensity = lightingIntensity(config, frameIndex, physicalMuted);
	const red = Math.floor(242 * intensity);
	const header = Buffer.alloc(65);
	header.set([
		0,
		4,
		242
	], 0);
	header[9] = 1;
	const frame = Buffer.alloc(65);
	frame.set([
		0,
		129,
		red,
		0,
		0,
		129,
		red,
		0,
		0
	], 0);
	return [header, frame];
}
function lightingIntensity(config, frameIndex, physicalMuted) {
	if (!config.enabled || config.muteLinked && physicalMuted === true) return 0;
	const brightness = clamp$2(config.brightness, 0, 100) / 100;
	if (config.effectId === "solid") return brightness;
	const durationMs = 1e4 - (clamp$2(config.speed, 1, 100) - 1) / 99 * 8900;
	const phase = Math.max(0, frameIndex) * 55 / durationMs % 1;
	const sine = (1 - Math.cos(phase * Math.PI * 2)) / 2;
	if (config.effectId === "pulse") return brightness * (.04 + Math.pow(sine, 4) * .96);
	return brightness * (.06 + sine * .94);
}
function clamp$2(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
//#endregion
//#region src/main/modules/hyperx/quadcast2-session.ts
var nativeHidIo$1 = { open: (path) => HIDAsync.open(path, { nonExclusive: true }) };
var quadCast2LightingProfiles = [
	{
		id: "broadcast",
		label: "Broadcast",
		effectId: "solid",
		brightness: 72,
		speed: 50
	},
	{
		id: "breathe",
		label: "Breathe",
		effectId: "breathing",
		brightness: 55,
		speed: 42
	},
	{
		id: "night",
		label: "Night",
		effectId: "solid",
		brightness: 25,
		speed: 50
	},
	{
		id: "custom",
		label: "Custom",
		effectId: "solid",
		brightness: 55,
		speed: 50
	}
];
var QuadCast2Session = class {
	descriptors;
	onUpdate;
	hidIo;
	settings;
	physicalMuted = null;
	muteStateUpdatedAt;
	muteStateUnavailableReason = "Waiting for the microphone's next absolute mute event.";
	lightingStatus = "unknown";
	lightingStateReason = "Waiting for the maintained lighting stream.";
	muteHandle = null;
	lightingHandle = null;
	muteStart = null;
	lightingStart = null;
	lightingQueue = Promise.resolve();
	muteRetryTimer = null;
	lightingTimer = null;
	lightingFrameIndex = 0;
	closed = false;
	constructor(descriptors, previousSettings, onUpdate, hidIo = nativeHidIo$1) {
		this.descriptors = descriptors;
		this.onUpdate = onUpdate;
		this.hidIo = hidIo;
		this.settings = normalizeSettings$1(previousSettings);
	}
	updateDescriptors(descriptors) {
		this.descriptors = descriptors;
		if (!this.muteHandle) this.ensureMuteMonitor();
		if (!this.lightingHandle) this.ensureLightingStream();
	}
	start() {
		this.ensureMuteMonitor();
		this.ensureLightingStream();
	}
	getState() {
		const profiles = quadCast2LightingProfiles.map((profile) => profile.id === "custom" ? {
			...profile,
			effectId: this.settings.customLightingEffect,
			brightness: this.settings.customLightingBrightness,
			speed: this.settings.customLightingSpeed
		} : { ...profile });
		return {
			physicalMuted: this.physicalMuted,
			...this.muteStateUpdatedAt ? { muteStateUpdatedAt: this.muteStateUpdatedAt } : {},
			...this.muteStateUnavailableReason ? { muteStateUnavailableReason: this.muteStateUnavailableReason } : {},
			lightingStatus: this.lightingStatus,
			...this.lightingStateReason ? { lightingStateReason: this.lightingStateReason } : {},
			config: this.currentConfig(),
			activeProfileId: this.settings.lightingProfileId,
			profiles,
			settings: { ...this.settings }
		};
	}
	async applyEnabled(enabled) {
		await this.applyConfig({
			...this.currentConfig(),
			enabled
		}, { lightingEnabled: enabled });
	}
	async applyBrightness(brightness) {
		const value = clamp$1(Math.round(brightness), 0, 100);
		await this.applyCustomConfig({
			...this.currentConfig(),
			brightness: value
		}, {
			lightingBrightness: value,
			customLightingBrightness: value
		});
	}
	async applyEffect(effectId) {
		if (!isLightingEffect(effectId)) throw new Error("That lighting effect is not supported by QuadCast 2.");
		await this.applyCustomConfig({
			...this.currentConfig(),
			effectId
		}, {
			lightingEffect: effectId,
			customLightingEffect: effectId
		});
	}
	async applySpeed(speed) {
		const value = clamp$1(Math.round(speed), 1, 100);
		await this.applyCustomConfig({
			...this.currentConfig(),
			speed: value
		}, {
			lightingSpeed: value,
			customLightingSpeed: value
		});
	}
	async applyMuteLinked(muteLinked) {
		await this.applyConfig({
			...this.currentConfig(),
			muteLinked
		}, { muteLed: muteLinked });
	}
	async applyProfile(profileId) {
		const profile = this.getState().profiles.find((candidate) => candidate.id === profileId);
		if (!profile) throw new Error("Unknown QuadCast 2 lighting profile.");
		await this.applyConfig({
			...this.currentConfig(),
			brightness: profile.brightness,
			effectId: profile.effectId,
			speed: profile.speed
		}, {
			lightingProfileId: profile.id,
			lightingBrightness: profile.brightness,
			lightingEffect: profile.effectId,
			lightingSpeed: profile.speed
		});
	}
	async close() {
		if (this.closed) return;
		this.closed = true;
		if (this.muteRetryTimer) clearTimeout(this.muteRetryTimer);
		if (this.lightingTimer) clearTimeout(this.lightingTimer);
		this.muteRetryTimer = null;
		this.lightingTimer = null;
		const muteHandle = this.muteHandle;
		const lightingHandle = this.lightingHandle;
		this.muteHandle = null;
		this.lightingHandle = null;
		await Promise.all([
			muteHandle?.close().catch(() => void 0),
			lightingHandle?.close().catch(() => void 0),
			this.lightingQueue.catch(() => void 0)
		]);
	}
	currentConfig() {
		return {
			enabled: this.settings.lightingEnabled,
			brightness: this.settings.lightingBrightness,
			effectId: this.settings.lightingEffect,
			speed: this.settings.lightingSpeed,
			muteLinked: this.settings.muteLed
		};
	}
	async applyCustomConfig(config, patch) {
		await this.applyConfig(config, {
			...patch,
			lightingProfileId: "custom",
			customLightingBrightness: config.brightness,
			customLightingEffect: config.effectId,
			customLightingSpeed: config.speed
		});
	}
	async applyConfig(config, patch) {
		if (this.closed) throw new Error("The QuadCast 2 session is closed.");
		await this.writeConfig(config);
		this.settings = {
			...this.settings,
			...patch
		};
		this.lightingStatus = "maintained";
		this.lightingStateReason = "";
		this.onUpdate(true);
	}
	async writeConfig(config) {
		await this.ensureLightingStream(config);
		if (!this.lightingHandle) throw new Error(this.lightingStateReason || "The lighting interface is unavailable.");
		await this.enqueueLighting(async () => {
			if (!this.lightingHandle) throw new Error("The lighting interface was released.");
			await sendLightingReports(this.lightingHandle, config, 0, this.physicalMuted);
		});
	}
	async ensureMuteMonitor() {
		if (this.closed || this.muteHandle || this.muteStart) return this.muteStart ?? void 0;
		this.muteStart = this.runMuteMonitor().finally(() => {
			this.muteStart = null;
		});
		return this.muteStart;
	}
	async runMuteMonitor() {
		const descriptor = this.descriptors.find(isMuteInterface);
		if (!descriptor?.path) {
			this.physicalMuted = null;
			this.muteStateUnavailableReason = "The microphone mute-state collection is unavailable.";
			this.onUpdate(false);
			return;
		}
		let handle = null;
		try {
			handle = await this.hidIo.open(descriptor.path);
			if (this.closed) {
				await handle.close().catch(() => void 0);
				return;
			}
			this.muteHandle = handle;
			this.muteStateUnavailableReason = this.physicalMuted === null ? "Waiting for the microphone's next absolute mute event." : void 0;
			while (!this.closed && this.muteHandle === handle) {
				const report = await handle.read(1e3);
				if (!report) continue;
				const muted = parseQuadCast2MuteReport(report);
				if (muted === null || muted === this.physicalMuted) continue;
				this.physicalMuted = muted;
				this.muteStateUpdatedAt = (/* @__PURE__ */ new Date()).toISOString();
				this.muteStateUnavailableReason = void 0;
				this.onUpdate(false);
				if (this.settings.muteLed && this.lightingHandle) this.enqueueLighting(async () => {
					if (this.lightingHandle) await sendLightingReports(this.lightingHandle, this.currentConfig(), this.lightingFrameIndex, muted);
				}).catch((error) => this.loseLighting(error));
			}
		} catch (error) {
			if (!this.closed) {
				this.physicalMuted = null;
				this.muteStateUnavailableReason = errorMessage$4(error, "The physical mute state could not be read.");
				this.onUpdate(false);
			}
		} finally {
			if (this.muteHandle === handle) this.muteHandle = null;
			await handle?.close().catch(() => void 0);
			if (!this.closed) this.scheduleMuteRetry();
		}
	}
	scheduleMuteRetry() {
		if (this.muteRetryTimer || this.closed) return;
		this.muteRetryTimer = setTimeout(() => {
			this.muteRetryTimer = null;
			this.ensureMuteMonitor();
		}, 1e3);
		this.muteRetryTimer.unref?.();
	}
	async ensureLightingStream(config = this.currentConfig()) {
		if (this.closed || this.lightingHandle) return;
		if (this.lightingStart) return this.lightingStart;
		this.lightingStart = this.startLightingStream(config).finally(() => {
			this.lightingStart = null;
		});
		return this.lightingStart;
	}
	async startLightingStream(config) {
		const candidates = this.descriptors.filter(isLightingInterface).sort(lightingInterfaceScore);
		let lastError;
		for (const descriptor of candidates) {
			if (!descriptor.path || this.closed) continue;
			let handle = null;
			try {
				handle = await this.hidIo.open(descriptor.path);
				await sendLightingReports(handle, config, 0, this.physicalMuted);
				if (this.closed) {
					await handle.close().catch(() => void 0);
					return;
				}
				this.lightingHandle = handle;
				this.lightingFrameIndex = 1;
				this.lightingStatus = "maintained";
				this.lightingStateReason = "";
				this.onUpdate(false);
				this.scheduleLightingFrame();
				return;
			} catch (error) {
				lastError = error;
				await handle?.close().catch(() => void 0);
			}
		}
		this.lightingStatus = "unknown";
		this.lightingStateReason = candidates.length === 0 ? "No researched QuadCast 2 lighting collection is available." : errorMessage$4(lastError, "The maintained lighting stream could not start.");
		this.onUpdate(false);
	}
	scheduleLightingFrame() {
		if (this.closed || !this.lightingHandle || this.lightingTimer) return;
		this.lightingTimer = setTimeout(() => {
			this.lightingTimer = null;
			this.enqueueLighting(async () => {
				if (!this.lightingHandle) return;
				await sendLightingReports(this.lightingHandle, this.currentConfig(), this.lightingFrameIndex, this.physicalMuted);
				this.lightingFrameIndex += 1;
				this.scheduleLightingFrame();
			}).catch((error) => this.loseLighting(error));
		}, 55);
		this.lightingTimer.unref?.();
	}
	loseLighting(error) {
		if (this.closed) return;
		if (this.lightingTimer) clearTimeout(this.lightingTimer);
		this.lightingTimer = null;
		const handle = this.lightingHandle;
		this.lightingHandle = null;
		handle?.close().catch(() => void 0);
		this.lightingStatus = "unknown";
		this.lightingStateReason = errorMessage$4(error, "The maintained lighting stream stopped.");
		this.onUpdate(false);
	}
	enqueueLighting(operation) {
		const result = this.lightingQueue.then(operation, operation);
		this.lightingQueue = result.then(() => void 0, () => void 0);
		return result;
	}
};
async function sendLightingReports(handle, config, frameIndex, physicalMuted) {
	for (const report of buildQuadCast2LightingReports(config, frameIndex, physicalMuted)) {
		const written = await handle.sendFeatureReport(report);
		if (written !== report.byteLength && written !== report.byteLength - 1) throw new Error(`HIDAPI reported ${written} of ${report.byteLength} lighting bytes.`);
	}
}
function isMuteInterface(descriptor) {
	return descriptor.vendorId === 1008 && descriptor.productId === 1972 && descriptor.usagePage === 65472 && descriptor.usage === 1 && Boolean(descriptor.path);
}
function isLightingInterface(descriptor) {
	return descriptor.vendorId === 1008 && descriptor.productId === 2479 && (descriptor.usagePage ?? 0) >= 65280 && Boolean(descriptor.path);
}
function lightingInterfaceScore(left, right) {
	return score(right) - score(left);
}
function score(descriptor) {
	return (descriptor.interface === 0 ? 2e3 : 0) + (descriptor.usagePage === 65424 ? 1500 : 0) + (descriptor.usage === 65280 ? 750 : 0);
}
function normalizeSettings$1(settings) {
	const effect = isLightingEffect(settings?.lightingEffect) ? settings.lightingEffect : "solid";
	const customEffect = isLightingEffect(settings?.customLightingEffect) ? settings.customLightingEffect : effect;
	const storedProfileId = stringSetting(settings?.lightingProfileId, "broadcast");
	const lightingProfileId = quadCast2LightingProfiles.some((profile) => profile.id === storedProfileId) ? storedProfileId : "broadcast";
	return {
		lightingEnabled: booleanSetting(settings?.lightingEnabled, true),
		lightingBrightness: numberSetting$1(settings?.lightingBrightness, 72, 0, 100),
		lightingEffect: effect,
		lightingSpeed: numberSetting$1(settings?.lightingSpeed, 50, 1, 100),
		lightingProfileId,
		customLightingBrightness: numberSetting$1(settings?.customLightingBrightness, 55, 0, 100),
		customLightingEffect: customEffect,
		customLightingSpeed: numberSetting$1(settings?.customLightingSpeed, 50, 1, 100),
		muteLed: booleanSetting(settings?.muteLed, true),
		lightingColor: "#f20000"
	};
}
function isLightingEffect(value) {
	return value === "solid" || value === "breathing" || value === "pulse";
}
function booleanSetting(value, fallback) {
	return typeof value === "boolean" ? value : fallback;
}
function numberSetting$1(value, fallback, min, max) {
	return typeof value === "number" ? clamp$1(Math.round(value), min, max) : fallback;
}
function stringSetting(value, fallback) {
	return typeof value === "string" && value.length > 0 ? value : fallback;
}
function clamp$1(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function errorMessage$4(error, fallback) {
	return error instanceof Error && error.message ? error.message : fallback;
}
//#endregion
//#region src/main/modules/hyperx/index.ts
var hyperXVendorId = 1008;
var quadCast2BaseProductId = 1972;
var quadCast2InterfaceProductId = 2479;
var HyperXDeviceModule = class {
	onStateChanged;
	id = "device.hyperx-quadcast";
	session = null;
	sessionDeviceId = null;
	currentBase = null;
	constructor(onStateChanged = () => void 0) {
		this.onStateChanged = onStateChanged;
	}
	async discover(context) {
		const descriptors = context.hidDevices.filter((device) => device.vendorId === hyperXVendorId && [quadCast2BaseProductId, quadCast2InterfaceProductId].includes(device.productId));
		if (descriptors.length === 0) {
			await this.releaseSession();
			return [];
		}
		const primary = descriptors.find((device) => device.productId === quadCast2BaseProductId) ?? descriptors[0];
		if (!primary) return [];
		const serialNumber = descriptors.find((device) => device.serialNumber)?.serialNumber;
		const deviceId = `hyperx:${serialNumber || quadCast2BaseProductId.toString(16)}`;
		const previous = context.previousDevices.find((device) => device.id === deviceId) ?? context.previousDevices.find((device) => device.moduleId === this.id && device.identity.model === "QuadCast 2");
		const resolved = resolveDeviceVariant({
			manufacturer: "HyperX",
			productFamily: "QuadCast",
			model: "QuadCast 2",
			connection: "usb",
			hardwareRevision: primary.release ? primary.release.toString(16).padStart(4, "0").toUpperCase() : void 0,
			vendorId: hyperXVendorId,
			productId: quadCast2BaseProductId,
			interfaceProductIds: [...new Set(descriptors.map((device) => device.productId))].sort((left, right) => left - right),
			serialNumber,
			productString: primary.product || descriptors.find((device) => device.product)?.product
		}, [], context.appearanceOverrides[deviceId]);
		const nextBase = {
			id: deviceId,
			moduleId: this.id,
			displayName: "QuadCast 2",
			kind: "microphone",
			connected: true,
			identity: resolved.identity,
			variantResolution: resolved.resolution,
			asset: resolveProductAsset(resolved.identity, "microphone")
		};
		if (!this.session || this.sessionDeviceId !== deviceId) {
			await this.releaseSession();
			this.currentBase = nextBase;
			this.sessionDeviceId = deviceId;
			this.session = new QuadCast2Session(descriptors, previous?.settings, (persist) => this.publish(persist));
			this.session.start();
		} else {
			this.currentBase = nextBase;
			this.session.updateDescriptors(descriptors);
		}
		return [this.buildDevice()];
	}
	async setControl(device, change) {
		if (!this.session || device.id !== this.sessionDeviceId) throw new Error("The QuadCast 2 hardware session is unavailable.");
		if (change.type === "lighting-enabled") return this.session.applyEnabled(change.enabled);
		if (change.type === "lighting-brightness") return this.session.applyBrightness(change.brightness);
		if (change.type === "lighting-effect") return this.session.applyEffect(change.effectId);
		if (change.type === "lighting-speed") return this.session.applySpeed(change.speed);
		if (change.type === "lighting-profile") return this.session.applyProfile(change.profileId);
		if (change.type === "microphone-mute-lighting") return this.session.applyMuteLinked(change.enabled);
		if (change.type === "lighting-color") throw new Error("QuadCast 2 lighting is fixed red and does not support color writes.");
		throw new Error(`${device.displayName} does not support the requested device control.`);
	}
	async deactivate() {
		await this.releaseSession();
	}
	async dispose() {
		await this.releaseSession();
	}
	buildDevice() {
		if (!this.currentBase || !this.session) throw new Error("The QuadCast 2 session has not been initialized.");
		const state = this.session.getState();
		return {
			...this.currentBase,
			capabilities: {
				gain: true,
				monitoring: true,
				mute: true,
				muteState: {
					muted: state.physicalMuted,
					source: "hardware",
					...state.muteStateUpdatedAt ? { updatedAt: state.muteStateUpdatedAt } : {},
					...state.muteStateUnavailableReason ? { unavailableReason: state.muteStateUnavailableReason } : {}
				},
				lighting: {
					writable: true,
					enabled: state.config.enabled,
					activeEffectId: state.config.effectId,
					availableEffects: [
						{
							id: "solid",
							label: "Solid"
						},
						{
							id: "breathing",
							label: "Breathing"
						},
						{
							id: "pulse",
							label: "Pulse"
						}
					],
					color: quadCast2StatusRed,
					colorWritable: false,
					brightness: state.config.brightness,
					brightnessWritable: true,
					speed: state.config.speed,
					speedWritable: true,
					profiles: state.profiles,
					activeProfileId: state.activeProfileId,
					muteLinked: state.config.muteLinked,
					muteLinkedWritable: true,
					state: state.lightingStatus,
					...state.lightingStateReason ? { stateReason: state.lightingStateReason } : {},
					physicalEffectVerified: false,
					profileMode: "software",
					source: "software"
				}
			},
			settings: state.settings
		};
	}
	publish(persist) {
		if (!this.currentBase || !this.session) return;
		this.onStateChanged([this.buildDevice()], persist);
	}
	async releaseSession() {
		const session = this.session;
		this.session = null;
		this.sessionDeviceId = null;
		this.currentBase = null;
		await session?.close();
	}
};
//#endregion
//#region src/main/modules/logitech/ghub-metadata.ts
var activeInterfaceSchema = z.object({
	type: z.string(),
	id: z.string(),
	pid: z.number().int().nonnegative(),
	extendedModel: z.number().int().nonnegative().optional(),
	serialNumber: z.string().optional(),
	path: z.string().optional(),
	firmwareVersion: z.string().optional(),
	hardwareRevision: z.number().int().nonnegative().optional(),
	connectionType: z.string().optional()
});
var deviceInfoSchema = z.object({
	id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
	pid: z.number().int().nonnegative(),
	state: z.string(),
	connectionType: z.string().optional(),
	displayConnectionType: z.string().optional(),
	deviceType: z.string(),
	deviceModel: z.string(),
	deviceBaseModel: z.string(),
	displayName: z.string(),
	deviceExt: z.number().int().nonnegative().optional(),
	deviceUnitId: z.string().optional(),
	activeInterfaces: z.array(activeInterfaceSchema).default([])
});
var deviceListSchema = z.object({ deviceInfos: z.array(deviceInfoSchema) });
var batterySchema = z.object({
	percentage: z.number().min(0).max(100).optional(),
	charging: z.boolean().optional(),
	fullyCharged: z.boolean().optional(),
	mileage: z.number().nonnegative().optional(),
	batteryMileageSupport: z.string().optional(),
	support: z.string().optional()
});
var responseSchema = z.object({
	msgId: z.string(),
	result: z.object({
		code: z.string(),
		what: z.string().optional()
	}).optional(),
	payload: z.unknown().optional()
});
var agentUrl = "ws://127.0.0.1:9010";
var requestTimeoutMs$1 = 1800;
/**
* G HUB exposes Logitech's already-decoded DEVIO control protocol on localhost.
* It is optional: discovery still falls back to HID identity when unavailable.
*/
async function readLogitechAgentDevices() {
	try {
		const payload = await requestLogitechAgent("GET", "/devices/list");
		return deviceListSchema.parse(payload).deviceInfos.filter((device) => device.state === "ACTIVE");
	} catch {
		return [];
	}
}
async function readLogitechBattery(deviceId) {
	try {
		return batterySchema.parse(await requestLogitechAgent("GET", `/battery/${deviceId}/state`));
	} catch {
		return;
	}
}
function getLogitechAgent(path, payload) {
	return requestLogitechAgent("GET", path, payload);
}
function setLogitechAgent(path, payload) {
	return requestLogitechAgent("SET", path, payload);
}
function requestLogitechAgent(verb, path, payload) {
	return new Promise((resolve, reject) => {
		const msgId = `switchboard-${randomUUID()}`;
		const socket = new WebSocket(agentUrl, "json", { headers: { Origin: "file://" } });
		let settled = false;
		const timer = setTimeout(() => finish(/* @__PURE__ */ new Error(`Logitech agent timed out at ${verb} ${path}`)), requestTimeoutMs$1);
		const finish = (error, responsePayload) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
			if (error) reject(error);
			else resolve(responsePayload);
		};
		socket.addEventListener("open", () => {
			socket.send(JSON.stringify({
				msgId,
				verb,
				path,
				payload
			}));
		});
		socket.addEventListener("message", (event) => {
			try {
				const response = responseSchema.parse(JSON.parse(String(event.data)));
				if (response.msgId !== msgId) return;
				if (response.result?.code !== "SUCCESS") {
					finish(new Error(response.result?.what || `Logitech agent rejected ${verb} ${path}`));
					return;
				}
				finish(void 0, response.payload);
			} catch {}
		});
		socket.addEventListener("error", () => finish(/* @__PURE__ */ new Error("Logitech agent unavailable")));
		socket.addEventListener("close", () => {
			if (!settled) finish(/* @__PURE__ */ new Error("Logitech agent closed the connection"));
		});
	});
}
//#endregion
//#region src/main/modules/logitech/devices/g502-x-plus/definition.ts
var g502XPlusDefinition = {
	manufacturer: "Logitech",
	productFamily: "G502",
	model: "G502 X Plus",
	wirelessProductId: 16537,
	wiredProductId: 49301,
	receiverProductIds: [50503],
	deviceBaseModel: "g502x_plus",
	slotPrefix: "g502x-plus"
};
var g502XPlusActions = [
	{
		id: "mouse.primary-click",
		label: "Left click",
		category: "mouse",
		searchTerms: ["primary click", "mb1"],
		selectable: true
	},
	{
		id: "mouse.secondary-click",
		label: "Right click",
		category: "mouse",
		searchTerms: ["secondary click", "mb2"],
		selectable: true
	},
	{
		id: "mouse.middle-click",
		label: "Middle click",
		category: "mouse",
		searchTerms: ["wheel press", "mb3"],
		selectable: true
	},
	{
		id: "mouse.back",
		label: "Back",
		category: "mouse",
		searchTerms: ["browser back", "mb4"],
		selectable: true
	},
	{
		id: "mouse.forward",
		label: "Forward",
		category: "mouse",
		searchTerms: ["browser forward", "mb5"],
		selectable: true
	},
	{
		id: "mouse.dpi-up",
		label: "DPI up",
		category: "mouse",
		searchTerms: ["sensitivity increase"],
		selectable: true
	},
	{
		id: "mouse.dpi-down",
		label: "DPI down",
		category: "mouse",
		searchTerms: ["sensitivity decrease"],
		selectable: true
	},
	{
		id: "mouse.dpi-shift",
		label: "DPI shift",
		category: "mouse",
		searchTerms: ["sniper", "temporary dpi"],
		selectable: true
	}
];
var g502ActionCardSuffixes = {
	"mouse.primary-click": "020100000000",
	"mouse.secondary-click": "020200000000",
	"mouse.middle-click": "020300000000",
	"mouse.back": "020400000000",
	"mouse.forward": "020500000000",
	"mouse.dpi-up": "040100000000",
	"mouse.dpi-down": "040200000000",
	"mouse.dpi-shift": "040300000000"
};
var g502XPlusBindings = [
	createBinding("primary", "Primary click", "g1", "mouse.primary-click", "left", 0, 44, 23),
	createBinding("back", "Back", "g4", "mouse.back", "left", 1, 34, 55),
	createBinding("dpi-shift", "DPI shift", "g5", "mouse.dpi-shift", "left", 2, 36, 43),
	createBinding("secondary", "Secondary click", "g2", "mouse.secondary-click", "right", 0, 60, 23),
	createBinding("wheel", "Wheel press", "g3", "mouse.middle-click", "right", 1, 53, 35),
	createBinding("forward", "Forward", "g6", "mouse.forward", "right", 2, 35, 49)
];
function createBinding(buttonId, label, slot, currentActionId, calloutSide, order, x, y) {
	return {
		buttonId,
		slotId: `${g502XPlusDefinition.slotPrefix}_${slot}_m1`,
		currentActionId,
		hotspot: {
			id: buttonId,
			label,
			position: {
				x,
				y
			},
			calloutSide,
			order,
			capability: "button-assignment"
		}
	};
}
function actionIdFromCardId(cardId) {
	if (!cardId) return void 0;
	return Object.entries(g502ActionCardSuffixes).find(([, suffix]) => cardId.endsWith(suffix))?.[0];
}
function cardLibraryPrefix(assignments) {
	const knownSuffixes = new Set(Object.values(g502ActionCardSuffixes));
	return assignments.map((assignment) => assignment.cardId).find((candidate) => candidate && knownSuffixes.has(candidate.slice(-12)))?.slice(0, -12);
}
function resolveG502XPlusVariant(extendedModel) {
	if (extendedModel === 1) return [{
		variant: "white",
		colorway: "White",
		confidence: "hardware",
		source: "Logitech DEVIO extended model",
		evidence: "extendedModel 1"
	}];
	if (extendedModel === 0) return [{
		variant: "black",
		colorway: "Black",
		confidence: "hardware",
		source: "Logitech DEVIO extended model",
		evidence: "extendedModel 0"
	}];
	return [];
}
//#endregion
//#region src/main/modules/logitech/devices/g502-x-plus/agent.ts
var dpiTableSchema = z.object({
	levels: z.array(z.number().int().positive()).min(1),
	defaultDpi: z.number().int().positive(),
	shiftDpi: z.number().int().positive(),
	activeDpi: z.number().int().positive()
});
var mouseSettingsSchema = z.object({
	reportRate: z.object({ value: z.number().int().positive() }),
	dpiTable: dpiTableSchema
});
var cardSchema = z.object({
	id: z.string().min(1),
	attribute: z.string(),
	mouseSettings: mouseSettingsSchema.optional(),
	firmwareLightingSettings: z.object({ effects: z.array(z.object({
		id: z.string(),
		zoneType: z.string().optional(),
		persistent: z.boolean().optional(),
		fixedParams: z.object({ color: z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i) }) }).optional()
	}).passthrough()).default([]) }).optional()
}).passthrough();
var profileSchema = z.object({
	id: z.string().min(1),
	assignments: z.array(z.object({
		slotId: z.string(),
		cardId: z.string()
	}))
});
var mouseInfoSchema = z.object({
	reportRates: z.object({
		rates: z.array(z.number().int().positive()),
		wirelessRates: z.array(z.number().int().positive()).default([])
	}),
	dpiInfo: z.object({
		range: z.object({
			min: z.number().int().positive(),
			max: z.number().int().positive(),
			steps: z.number().int().positive(),
			maxLevels: z.number().int().nonnegative().default(0)
		}),
		defaultDpi: z.number().int().positive()
	})
});
var onboardModeSchema = z.object({
	mode: z.enum(["HOST", "ONBOARD"]).optional(),
	enabled: z.boolean().optional()
});
var onboardButtonMappingSchema = z.object({
	button: z.number().int().nonnegative().default(0),
	macro: z.object({
		type: z.string(),
		mouse: z.object({ action: z.string() }).optional()
	}).optional()
});
var onboardProfileSchema = z.object({
	onboardSlotId: z.string(),
	enabled: z.boolean(),
	mouseSettings: mouseSettingsSchema,
	lighting: z.object({ effects: z.array(z.object({
		id: z.string(),
		frameDataParams: z.object({ intensity: z.number().min(0).max(1) }).optional()
	}).passthrough()).default([]) }).optional(),
	buttonMappings: z.array(onboardButtonMappingSchema).default([])
}).passthrough();
var onboardDirectorySchema = z.object({
	directoryEntries: z.array(onboardProfileSchema),
	activeProfile: z.string().optional()
});
var brightnessSchema = z.object({ value: z.number().min(0).max(1) });
async function readG502Capabilities(agentDeviceId, connection) {
	const mouseInfoPayload = await getLogitechAgent(`/mouse/${agentDeviceId}/info`);
	const modePayload = await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`);
	const directoryPayload = await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/profiles`);
	const brightnessPayload = await getLogitechAgent(`/lighting/${agentDeviceId}/brightness`);
	const bundle = await loadSoftwareProfile();
	const mouseInfo = mouseInfoSchema.parse(mouseInfoPayload);
	const mode = isOnboardMode(onboardModeSchema.parse(modePayload)) ? "onboard" : "software";
	const directory = onboardDirectorySchema.parse(directoryPayload);
	const activeOnboard = directory.directoryEntries.find((entry) => entry.onboardSlotId === directory.activeProfile) ?? directory.directoryEntries.find((entry) => entry.enabled) ?? directory.directoryEntries[0];
	const activeSettings = mode === "onboard" ? activeOnboard?.mouseSettings : bundle.mouseCard.mouseSettings;
	if (!activeSettings) throw new Error("Logitech profile does not expose mouse settings.");
	const unavailableReason = mode === "onboard" ? "Stored onboard profiles are active. Turn off onboard memory to edit the software profile." : void 0;
	const bindings = mode === "onboard" ? buildOnboardBindings(activeOnboard) : buildSoftwareBindings(bundle.profile);
	const availableActions = withCurrentCustomAction(bindings);
	const firmwareEffect = bundle.lightingCard?.firmwareLightingSettings?.effects[0];
	const softwareLightingWritable = !firmwareEffect || ["OFF", "FIXED"].includes(firmwareEffect.id);
	const firmwareColor = firmwareEffect?.id === "FIXED" ? firmwareEffect.fixedParams?.color.hex : void 0;
	const onboardEffect = activeOnboard?.lighting?.effects[0];
	const supportedRates = connection === "wireless" && mouseInfo.reportRates.wirelessRates.length > 0 ? mouseInfo.reportRates.wirelessRates : mouseInfo.reportRates.rates;
	return {
		dpi: {
			writable: mode === "software",
			min: mouseInfo.dpiInfo.range.min,
			max: mouseInfo.dpiInfo.range.max,
			step: mouseInfo.dpiInfo.range.steps,
			stages: [...activeSettings.dpiTable.levels],
			activeDpi: activeSettings.dpiTable.activeDpi,
			defaultDpi: activeSettings.dpiTable.defaultDpi,
			shiftDpi: activeSettings.dpiTable.shiftDpi,
			shiftMode: "device-profile",
			maxStages: mouseInfo.dpiInfo.range.maxLevels || 5,
			profileMode: mode,
			unavailableReason
		},
		reportRate: {
			writable: mode === "software",
			value: activeSettings.reportRate.value,
			supportedRates: [...supportedRates].sort((left, right) => left - right),
			profileMode: mode,
			unavailableReason
		},
		buttonAssignments: {
			writable: mode === "software",
			profileMode: mode,
			bindings,
			availableActions,
			unavailableReason
		},
		lighting: mode === "onboard" ? {
			writable: false,
			enabled: Boolean(onboardEffect && onboardEffect.id !== "OFF"),
			activeEffectId: onboardEffect?.id === "OFF" ? "off" : "signature",
			availableEffects: [{
				id: "signature",
				label: "G signature"
			}],
			colorWritable: false,
			brightness: Math.round((onboardEffect?.frameDataParams?.intensity ?? 1) * 100),
			brightnessWritable: false,
			speedWritable: false,
			profiles: [],
			muteLinked: false,
			muteLinkedWritable: false,
			physicalEffectVerified: false,
			profileMode: mode,
			source: "firmware",
			unavailableReason
		} : {
			writable: softwareLightingWritable,
			enabled: Boolean(firmwareEffect && firmwareEffect.id !== "OFF"),
			activeEffectId: softwareLightingWritable ? "solid" : firmwareEffect?.id.toLowerCase() ?? "profile",
			availableEffects: softwareLightingWritable ? [{
				id: "solid",
				label: "Static"
			}] : [{
				id: firmwareEffect?.id.toLowerCase() ?? "profile",
				label: "Existing G HUB effect"
			}],
			color: firmwareColor,
			colorWritable: softwareLightingWritable,
			brightness: Math.round(brightnessSchema.parse(brightnessPayload).value * 100),
			brightnessWritable: true,
			speedWritable: false,
			profiles: [],
			muteLinked: false,
			muteLinkedWritable: false,
			physicalEffectVerified: false,
			profileMode: mode,
			source: "firmware",
			unavailableReason: softwareLightingWritable ? void 0 : "This profile uses a G HUB lighting effect that Switchboard does not overwrite automatically."
		},
		onboardMemory: {
			writable: true,
			enabled: mode === "onboard",
			activeProfile: directory.activeProfile
		}
	};
}
async function writeG502Control(agentDeviceId, device, change) {
	if (change.type === "onboard-memory") {
		await setLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`, { mode: change.enabled ? "ONBOARD" : "HOST" });
		await waitForOnboardMode(agentDeviceId, change.enabled ? "ONBOARD" : "HOST");
		return;
	}
	if ((/* @__PURE__ */ new Set([
		"dpi",
		"dpi-stages",
		"dpi-shift",
		"report-rate",
		"button-assignment",
		"lighting-enabled",
		"lighting-color",
		"lighting-effect",
		"lighting-brightness",
		"lighting-speed",
		"lighting-direction",
		"lighting-zone-color"
	])).has(change.type)) await assertSoftwareMode(agentDeviceId);
	if (change.type === "dpi") {
		validateDpi(device, change.value);
		await writeMouseSettings((settings) => {
			const previousActiveDpi = settings.dpiTable.activeDpi;
			settings.dpiTable.activeDpi = change.value;
			if (!settings.dpiTable.levels.includes(change.value)) {
				const activeStageIndex = settings.dpiTable.levels.indexOf(previousActiveDpi);
				if (activeStageIndex >= 0) settings.dpiTable.levels[activeStageIndex] = change.value;
				else settings.dpiTable.levels[settings.dpiTable.levels.length - 1] = change.value;
				settings.dpiTable.levels = [...new Set(settings.dpiTable.levels)].sort((a, b) => a - b);
				if (settings.dpiTable.defaultDpi === previousActiveDpi) settings.dpiTable.defaultDpi = change.value;
			}
		});
		return;
	}
	if (change.type === "dpi-stages") {
		const capability = device.capabilities.dpi;
		if (!capability) throw new Error("This device does not expose DPI stages.");
		const stages = [...new Set(change.stages)].sort((a, b) => a - b);
		if (stages.length > (capability.maxStages ?? 5)) throw new Error("The device rejected too many DPI stages.");
		stages.forEach((value) => validateDpi(device, value));
		await writeMouseSettings((settings) => {
			settings.dpiTable.levels = stages;
			if (!stages.includes(settings.dpiTable.activeDpi)) settings.dpiTable.activeDpi = stages[0];
			if (!stages.includes(settings.dpiTable.defaultDpi)) settings.dpiTable.defaultDpi = stages[0];
			if (!stages.includes(settings.dpiTable.shiftDpi)) settings.dpiTable.shiftDpi = stages[0];
		});
		return;
	}
	if (change.type === "dpi-shift") {
		validateDpi(device, change.value);
		await writeMouseSettings((settings) => {
			settings.dpiTable.shiftDpi = change.value;
		});
		return;
	}
	if (change.type === "report-rate") {
		if (!device.capabilities.reportRate?.supportedRates.includes(change.value)) throw new Error("That report rate is unavailable for this connection.");
		await writeMouseSettings((settings) => {
			settings.reportRate.value = change.value;
		});
		return;
	}
	if (change.type === "button-assignment") {
		const capability = device.capabilities.buttonAssignments;
		const binding = capability?.bindings.find((candidate) => candidate.buttonId === change.buttonId);
		if (!binding || !capability?.availableActions.some((action) => action.id === change.actionId && action.selectable !== false)) throw new Error("That button assignment is not supported by this device.");
		const bundle = await loadSoftwareProfile();
		const prefix = cardLibraryPrefix(bundle.profile.assignments);
		const suffix = g502ActionCardSuffixes[change.actionId];
		if (!prefix || !suffix) throw new Error("The Logitech standard action library is unavailable.");
		const card = cardSchema.parse(await getLogitechAgent("/card", { id: `${prefix}${suffix}` }));
		await setLogitechAgent("/assignment", {
			profile: bundle.profile.id,
			slotId: binding.slotId,
			card
		});
		return;
	}
	if (change.type === "lighting-enabled") {
		assertLightingWritable(device);
		if (change.enabled) await setFirmwareLightingSolid(device.capabilities.lighting?.color ?? "#ff1744");
		else await setFirmwareLightingOff();
		return;
	}
	if (change.type === "lighting-color") {
		assertLightingWritable(device);
		await setFirmwareLightingSolid(change.color);
		return;
	}
	if (change.type === "lighting-brightness") {
		if (!device.capabilities.lighting?.brightnessWritable) throw new Error("Lighting brightness is not writable in this profile mode.");
		await setLogitechAgent(`/lighting/${agentDeviceId}/brightness`, { value: change.brightness / 100 });
		return;
	}
	if (change.type === "lighting-effect") {
		assertLightingWritable(device);
		if (change.effectId !== "solid") throw new Error("That lighting effect is not supported by this device.");
		await setFirmwareLightingSolid(device.capabilities.lighting?.color ?? "#ff1744");
		return;
	}
	throw new Error("That control is not supported by the local G HUB integration.");
}
function buildSoftwareBindings(profile) {
	return g502XPlusBindings.map((binding) => {
		const assignment = profile.assignments.find((candidate) => candidate.slotId === binding.slotId);
		return {
			...binding,
			currentActionId: actionIdFromCardId(assignment?.cardId) ?? "system.custom"
		};
	});
}
function buildOnboardBindings(profile) {
	const mappingIndexes = {
		primary: 0,
		secondary: 1,
		wheel: 2,
		back: 3,
		"dpi-shift": 4,
		forward: 5
	};
	return g502XPlusBindings.map((binding) => ({
		...binding,
		currentActionId: onboardActionId(profile?.buttonMappings[mappingIndexes[binding.buttonId] ?? -1]) ?? "system.custom"
	}));
}
function onboardActionId(mapping) {
	if (!mapping) return void 0;
	if (mapping.button >= 1 && mapping.button <= 5) return [
		"",
		"mouse.primary-click",
		"mouse.secondary-click",
		"mouse.middle-click",
		"mouse.back",
		"mouse.forward"
	][mapping.button];
	const action = mapping.macro?.mouse?.action;
	if (action === "DPI_SHIFT") return "mouse.dpi-shift";
	if (action === "DPI_UP") return "mouse.dpi-up";
	if (action === "DPI_DOWN") return "mouse.dpi-down";
}
function withCurrentCustomAction(bindings) {
	if (!bindings.some((binding) => binding.currentActionId === "system.custom")) return structuredClone(g502XPlusActions);
	return [...structuredClone(g502XPlusActions), {
		id: "system.custom",
		label: "Custom G HUB assignment",
		category: "system",
		searchTerms: ["custom", "macro"],
		selectable: false
	}];
}
async function loadSoftwareProfile() {
	const active = z.object({ id: z.string().min(1) }).parse(await getLogitechAgent("/profile/active"));
	const profile = profileSchema.parse(await getLogitechAgent("/profile", { id: active.id }));
	const mouseAssignment = profile.assignments.find((assignment) => assignment.slotId === `${g502XPlusDefinition.slotPrefix}_mouse_settings`);
	if (!mouseAssignment) throw new Error("The active Logitech profile has no mouse-settings card.");
	const mouseCard = cardSchema.parse(await getLogitechAgent("/card", { id: mouseAssignment.cardId }));
	if (!mouseCard.mouseSettings) throw new Error("The Logitech mouse-settings card is invalid.");
	const lightingAssignment = profile.assignments.find((assignment) => assignment.slotId === `${g502XPlusDefinition.slotPrefix}_lighting_setting_firmware`);
	return {
		profile,
		mouseCard,
		lightingCard: lightingAssignment ? cardSchema.parse(await getLogitechAgent("/card", { id: lightingAssignment.cardId })) : void 0
	};
}
async function writeMouseSettings(mutator) {
	const bundle = await loadSoftwareProfile();
	const settings = structuredClone(bundle.mouseCard.mouseSettings);
	if (!settings) throw new Error("The active Logitech profile has no mouse settings.");
	mutator(settings);
	await setLogitechAgent("/card", {
		...bundle.mouseCard,
		mouseSettings: settings
	});
}
async function assertSoftwareMode(agentDeviceId) {
	if (isOnboardMode(onboardModeSchema.parse(await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`)))) throw new Error("Turn off onboard memory before editing the software profile.");
}
async function waitForOnboardMode(agentDeviceId, expected) {
	let lastError;
	for (let attempt = 0; attempt < 12; attempt += 1) {
		if (attempt > 0) await delay$3(250);
		try {
			if ((isOnboardMode(onboardModeSchema.parse(await getLogitechAgent(`/onboard_profiles/${agentDeviceId}/onboard_mode`))) ? "ONBOARD" : "HOST") === expected) {
				await delay$3(250);
				return;
			}
		} catch (error) {
			lastError = error;
		}
	}
	throw new Error(`Logitech did not enter ${expected.toLowerCase()} profile mode.`, { cause: lastError });
}
function isOnboardMode(value) {
	return value.mode === "ONBOARD" || value.enabled === true;
}
async function setFirmwareLightingOff() {
	await writeFirmwareLightingEffect({
		id: "OFF",
		zoneType: "ZONE_PRIMARY",
		persistent: false
	});
}
async function setFirmwareLightingSolid(color) {
	await writeFirmwareLightingEffect({
		id: "FIXED",
		zoneType: "ZONE_PRIMARY",
		persistent: false,
		fixedParams: { color: { hex: color.toUpperCase() } }
	});
}
async function writeFirmwareLightingEffect(effect) {
	const card = (await loadSoftwareProfile()).lightingCard;
	if (!card) throw new Error("The active Logitech profile has no lighting card.");
	if (!card.firmwareLightingSettings) return;
	await setLogitechAgent("/card", {
		...card,
		firmwareLightingSettings: {
			...card.firmwareLightingSettings,
			effects: [effect]
		}
	});
}
function validateDpi(device, value) {
	const capability = device.capabilities.dpi;
	if (!capability) throw new Error("This device does not expose DPI controls.");
	if (value < capability.min || value > capability.max || (value - capability.min) % capability.step !== 0) throw new Error(`DPI must be ${capability.min}-${capability.max} in ${capability.step} DPI steps.`);
}
function assertLightingWritable(device) {
	if (!device.capabilities.lighting?.writable) throw new Error(device.capabilities.lighting?.unavailableReason ?? "Lighting is not writable in this profile mode.");
}
function delay$3(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//#endregion
//#region src/main/modules/logitech/devices/g502-x-plus/battery-estimate.ts
var ratedMinutesRgbOff = 7800;
var ratedMinutesRgbOn = 2220;
function withG502BatteryEstimate(battery, lightingEnabled) {
	if (!battery || battery.estimatedMinutesRemaining !== void 0 || battery.charging || battery.fullyCharged) return battery;
	const ratedMinutes = lightingEnabled === false ? ratedMinutesRgbOff : ratedMinutesRgbOn;
	return {
		...battery,
		estimatedMinutesRemaining: Math.round(ratedMinutes * battery.percentage / 100)
	};
}
//#endregion
//#region src/main/modules/logitech/hidpp-long-transport.ts
var longReportId = 17;
var longReportLength = 20;
var installedSoftwareId = 7;
var developmentSoftwareId = 8;
var nativeReviewSoftwareId = 9;
var defaultRequestTimeoutMs = 1200;
var replyDrainDurationMs = 20;
/**
* One non-exclusive HID++ long-report channel.
*
* Requests are serialized because HID++ has no request ID beyond the feature,
* function, and four-bit software ID. Unsolicited reports remain event-driven
* so MouseButtonSpy never introduces a polling loop.
*/
var HidppLongTransport = class HidppLongTransport {
	handle;
	softwareId;
	pending = null;
	tail = Promise.resolve();
	notificationListeners = /* @__PURE__ */ new Set();
	closed = false;
	constructor(handle, softwareId = resolveHidppSoftwareId()) {
		this.handle = handle;
		this.softwareId = softwareId;
		if (!Number.isInteger(softwareId) || softwareId < 1 || softwareId > 15) throw new Error("The HID++ software ID must be a non-zero four-bit value.");
		this.handle.on("data", this.onData);
		this.handle.on("error", this.onError);
	}
	static async open(path) {
		const handle = await HIDAsync.open(path, { nonExclusive: true });
		return new HidppLongTransport(handle);
	}
	request(deviceIndex, featureIndex, functionId, parameters = [], timeoutMs = defaultRequestTimeoutMs) {
		if (parameters.length > 16) throw new Error("A HID++ long report accepts at most 16 parameter bytes.");
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("The HID++ channel is closed."));
		const operation = this.tail.then(() => this.performRequest(deviceIndex, featureIndex, functionId, parameters, timeoutMs), () => this.performRequest(deviceIndex, featureIndex, functionId, parameters, timeoutMs));
		this.tail = operation.then(waitForReplyDrain, waitForReplyDrain);
		return operation;
	}
	async getFeatureIndex(deviceIndex, featureId, timeoutMs) {
		const response = await this.request(deviceIndex, 0, 0, [
			featureId >>> 8,
			featureId & 255,
			0
		], timeoutMs);
		return response[4] ? response[4] : null;
	}
	subscribe(listener) {
		this.notificationListeners.add(listener);
		return () => this.notificationListeners.delete(listener);
	}
	async close() {
		if (this.closed) return;
		this.closed = true;
		this.handle.off("data", this.onData);
		this.handle.off("error", this.onError);
		this.rejectPending(/* @__PURE__ */ new Error("The HID++ channel closed."));
		this.notificationListeners.clear();
		await this.handle.close();
	}
	performRequest(deviceIndex, featureIndex, functionId, parameters, timeoutMs) {
		if (this.closed) return Promise.reject(/* @__PURE__ */ new Error("The HID++ channel is closed."));
		const address = functionId << 4 | this.softwareId;
		const report = Buffer.alloc(longReportLength);
		report.set([
			longReportId,
			deviceIndex,
			featureIndex,
			address,
			...parameters
		]);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				if (this.pending?.resolve !== resolve) return;
				this.pending = null;
				reject(/* @__PURE__ */ new Error(`HID++ request timed out for feature 0x${featureIndex.toString(16).padStart(2, "0")}, function ${functionId}.`));
			}, timeoutMs);
			this.pending = {
				deviceIndex,
				featureIndex,
				address,
				resolve,
				reject,
				timer
			};
			this.handle.write(report).catch((error) => {
				if (this.pending?.resolve !== resolve) return;
				clearTimeout(timer);
				this.pending = null;
				reject(error instanceof Error ? error : new Error(String(error)));
			});
		});
	}
	onData = (data) => {
		if (data[0] !== longReportId) return;
		const pending = this.pending;
		if (pending && data[1] === pending.deviceIndex) {
			if (data[2] === pending.featureIndex && data[3] === pending.address) {
				clearTimeout(pending.timer);
				this.pending = null;
				pending.resolve(Buffer.from(data));
				return;
			}
			if (data[2] === 255 && data[3] === pending.featureIndex && data[4] === pending.address) {
				clearTimeout(pending.timer);
				this.pending = null;
				pending.reject(new Error(hidppErrorMessage(data[5] ?? 255)));
				return;
			}
		}
		for (const listener of this.notificationListeners) listener(Buffer.from(data));
	};
	onError = (error) => {
		this.rejectPending(error);
	};
	rejectPending(error) {
		if (!this.pending) return;
		clearTimeout(this.pending.timer);
		const { reject } = this.pending;
		this.pending = null;
		reject(error);
	}
};
function resolveHidppSoftwareId(environment = process.env) {
	const configured = Number.parseInt(environment.SWITCHBOARD_HIDPP_SOFTWARE_ID ?? "", 16);
	if (Number.isInteger(configured) && configured >= 1 && configured <= 15) return configured;
	if (environment.SWITCHBOARD_NATIVE_REVIEW === "1") return nativeReviewSoftwareId;
	if (environment.ELECTRON_RENDERER_URL) return developmentSoftwareId;
	return installedSoftwareId;
}
function waitForReplyDrain() {
	return new Promise((resolve) => setTimeout(resolve, replyDrainDurationMs));
}
function hidppErrorMessage(code) {
	const label = (/* @__PURE__ */ new Map([
		[1, "invalid argument"],
		[2, "out of range"],
		[3, "hardware error"],
		[4, "Logitech protocol error"],
		[5, "invalid feature index"],
		[6, "invalid function"],
		[7, "busy"],
		[8, "unsupported"]
	])).get(code);
	return `HID++ rejected the request${label ? `: ${label}` : ` with error 0x${code.toString(16).padStart(2, "0")}`}.`;
}
//#endregion
//#region src/main/modules/logitech/devices/g502-x-plus/onboard-profile.ts
var supportedMemoryModel = 1;
var supportedProfileFormats = /* @__PURE__ */ new Set([3, 5]);
var profileDpiCount = 5;
var profileButtonTableOffset = 32;
var profileButtonEntrySize = 4;
var profileLightingOffset = 219;
var G502OnboardProfileCrcError = class extends Error {
	constructor() {
		super("The onboard profile CRC is invalid.");
		this.name = "G502OnboardProfileCrcError";
	}
};
var directButtonSlots = {
	primary: 0,
	secondary: 1,
	wheel: 2,
	back: 3,
	"dpi-shift": 4,
	forward: 5
};
var actionEntries = {
	"mouse.primary-click": [
		128,
		1,
		0,
		1
	],
	"mouse.secondary-click": [
		128,
		1,
		0,
		2
	],
	"mouse.middle-click": [
		128,
		1,
		0,
		4
	],
	"mouse.back": [
		128,
		1,
		0,
		8
	],
	"mouse.forward": [
		128,
		1,
		0,
		16
	],
	"mouse.dpi-up": [
		144,
		3,
		0,
		0
	],
	"mouse.dpi-down": [
		144,
		4,
		0,
		0
	],
	"mouse.dpi-shift": [
		144,
		7,
		0,
		0
	]
};
function parseOnboardProfilesInfo(payload) {
	const sectorSize = (payload[7] ?? 0) << 8 | (payload[8] ?? 0);
	if (payload.length < 11 || sectorSize < 16) throw new Error("The mouse returned invalid onboard-profile metadata.");
	return {
		memoryModelId: payload[0],
		profileFormatId: payload[1],
		macroFormatId: payload[2],
		profileCount: payload[3],
		profileCountOob: payload[4],
		buttonCount: payload[5],
		sectorCount: payload[6],
		sectorSize,
		mechanicalLayout: payload[9],
		variousInfo: payload[10]
	};
}
function parseProfileDirectory(sector) {
	const addresses = [];
	for (let offset = 0; offset + 3 < sector.length; offset += 4) {
		const address = (sector[offset] ?? 0) << 8 | (sector[offset + 1] ?? 0);
		if (address === 65535) break;
		if (address > 0) addresses.push(address);
	}
	return addresses;
}
function crcCcitt(data) {
	let crc = 65535;
	for (const byte of data) {
		const temp = crc >>> 8 ^ byte;
		crc = crc << 8 & 65535;
		let quick = temp ^ temp >>> 4;
		crc ^= quick;
		quick <<= 5;
		crc ^= quick;
		quick <<= 7;
		crc ^= quick;
		crc &= 65535;
	}
	return crc;
}
var G502OnboardProfile = class {
	info;
	data;
	constructor(info, sector) {
		this.info = info;
		if (info.memoryModelId !== supportedMemoryModel || !supportedProfileFormats.has(info.profileFormatId)) throw new Error(`Onboard profile layout ${info.memoryModelId}/${info.profileFormatId} is not verified for safe writes.`);
		if (sector.length !== info.sectorSize || sector.length < 232) throw new Error("The onboard profile sector has an invalid size.");
		if (((sector[sector.length - 2] ?? 0) << 8 | (sector[sector.length - 1] ?? 0)) !== crcCcitt(sector.subarray(0, sector.length - 2))) throw new G502OnboardProfileCrcError();
		if ((sector[1] ?? profileDpiCount) >= profileDpiCount || (sector[2] ?? profileDpiCount) >= profileDpiCount) throw new Error("The onboard profile contains an invalid DPI stage index.");
		this.data = Buffer.from(sector);
	}
	get reportRate() {
		return 1e3 / Math.max(1, this.data[0]);
	}
	get stages() {
		return Array.from({ length: profileDpiCount }, (_, index) => this.dpiAt(index)).filter((value) => value > 0 && value !== 65535);
	}
	get defaultDpi() {
		return this.dpiAt(this.data[1]);
	}
	get shiftDpi() {
		return this.dpiAt(this.data[2]);
	}
	get shiftButtonMask() {
		for (let slot = 0; slot < Math.min(this.info.buttonCount, 16); slot += 1) if (this.actionAt(slot) === "mouse.dpi-shift") return 1 << slot;
		return 0;
	}
	get buttonAssignments() {
		return this.buildButtonAssignments("onboard", true);
	}
	buildButtonAssignments(profileMode, writable) {
		const unavailableReason = writable ? void 0 : "Enable onboard memory to change stored button assignments.";
		const bindings = g502XPlusBindings.map((binding) => ({
			...binding,
			currentActionId: this.actionAt(directButtonSlots[binding.buttonId]) ?? "system.custom"
		}));
		return {
			writable,
			profileMode,
			bindings,
			availableActions: bindings.some((binding) => binding.currentActionId === "system.custom") ? [...structuredClone(g502XPlusActions), {
				id: "system.custom",
				label: "Existing onboard assignment",
				category: "system",
				searchTerms: ["custom", "onboard"],
				selectable: false
			}] : structuredClone(g502XPlusActions),
			unavailableReason
		};
	}
	buildLighting(profileMode, writable) {
		const mode = this.data[profileLightingOffset];
		const solid = mode === 1;
		const off = mode === 0;
		const activeEffectId = solid || off ? "solid" : "stored";
		return {
			writable,
			enabled: !off,
			activeEffectId,
			availableEffects: activeEffectId === "stored" ? [{
				id: "stored",
				label: "Stored effect"
			}, {
				id: "solid",
				label: "Static"
			}] : [{
				id: "solid",
				label: "Static"
			}],
			color: solid ? rgbToHex(this.data.subarray(220, 223)) : void 0,
			colorWritable: writable && solid,
			brightnessWritable: false,
			speedWritable: false,
			profiles: [],
			muteLinked: false,
			muteLinkedWritable: false,
			physicalEffectVerified: false,
			profileMode,
			source: "firmware",
			unavailableReason: writable ? void 0 : "Enable onboard memory to change stored lighting."
		};
	}
	setBaseDpi(value) {
		const existing = this.stageIndex(value);
		const shiftIndex = this.data[2];
		const defaultIndex = this.data[1];
		const target = existing >= 0 ? existing : defaultIndex !== shiftIndex ? defaultIndex : Array.from({ length: profileDpiCount }, (_, index) => index).find((index) => index !== shiftIndex);
		if (target === void 0 || target < 0) throw new Error("The onboard profile has no safe DPI stage for the base sensitivity.");
		this.writeDpi(target, value);
		this.data[1] = target;
	}
	setStages(values, activeDpi) {
		const stages = [...new Set(values)].sort((left, right) => left - right);
		if (!stages.includes(activeDpi)) stages.push(activeDpi);
		const shiftDpi = this.shiftDpi;
		if (!stages.includes(shiftDpi)) stages.push(shiftDpi);
		if (stages.length > profileDpiCount) throw new Error("The mouse can store at most five DPI stages, including DPI Shift.");
		stages.sort((left, right) => left - right);
		for (let index = 0; index < profileDpiCount; index += 1) this.writeDpi(index, stages[index] ?? 0);
		this.data[1] = stages.indexOf(activeDpi);
		this.data[2] = stages.indexOf(shiftDpi);
	}
	setShiftDpi(value) {
		const defaultIndex = this.data[1];
		const currentShiftIndex = this.data[2];
		const existing = this.stageIndex(value);
		const unused = Array.from({ length: profileDpiCount }, (_, index) => index).find((index) => index !== defaultIndex && this.dpiAt(index) === 0);
		const target = currentShiftIndex !== defaultIndex && this.shiftButtonMask !== 0 ? currentShiftIndex : existing >= 0 && existing !== defaultIndex ? existing : unused;
		if (target === void 0) throw new Error("All non-default DPI stages are in use; no safe DPI Shift slot is available.");
		this.writeDpi(target, value);
		this.data[2] = target;
		this.setButtonAction("dpi-shift", "mouse.dpi-shift");
	}
	setReportRate(value) {
		const interval = 1e3 / value;
		if (!Number.isInteger(interval) || interval < 1 || interval > 8) throw new Error(`${value.toLocaleString()} Hz cannot be stored by this mouse.`);
		this.data[0] = interval;
	}
	setButtonAction(buttonId, actionId) {
		const slot = directButtonSlots[buttonId];
		const entry = actionEntries[actionId];
		if (slot === void 0 || slot >= this.info.buttonCount || !entry) throw new Error("That onboard button assignment is not supported.");
		this.data.set(entry, profileButtonTableOffset + slot * profileButtonEntrySize);
	}
	setLightingEnabled(enabled, fallbackColor = "#ff1744") {
		if (!enabled) {
			this.data.fill(0, profileLightingOffset, 230);
			return;
		}
		this.setLightingColor(this.lightingColor ?? fallbackColor);
	}
	setLightingColor(color) {
		const rgb = parseHexColor(color);
		this.data.fill(0, profileLightingOffset, 230);
		this.data[profileLightingOffset] = 1;
		this.data.set(rgb, 220);
	}
	get lightingColor() {
		return this.data[profileLightingOffset] === 1 ? rgbToHex(this.data.subarray(220, 223)) : void 0;
	}
	toSector() {
		const next = Buffer.from(this.data);
		const crc = crcCcitt(next.subarray(0, next.length - 2));
		next.writeUInt16BE(crc, next.length - 2);
		return next;
	}
	actionAt(slot) {
		const offset = profileButtonTableOffset + slot * profileButtonEntrySize;
		const encoded = this.data.subarray(offset, offset + profileButtonEntrySize);
		return Object.entries(actionEntries).find(([, entry]) => entry.every((byte, index) => encoded[index] === byte))?.[0];
	}
	dpiAt(index) {
		return this.data.readUInt16LE(3 + index * 2);
	}
	stageIndex(value) {
		return Array.from({ length: profileDpiCount }, (_, index) => this.dpiAt(index)).indexOf(value);
	}
	writeDpi(index, value) {
		if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error("DPI is outside the onboard profile range.");
		this.data.writeUInt16LE(value, 3 + index * 2);
	}
};
function parseHexColor(color) {
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Lighting color must use #RRGGBB format.");
	return Buffer.from(color.slice(1), "hex");
}
function rgbToHex(rgb) {
	return `#${Buffer.from(rgb).toString("hex").padEnd(6, "0")}`;
}
//#endregion
//#region src/main/modules/logitech/rgb-effects.ts
var allClusters = 255;
var infoGeneral = 0;
var persistUntilRelease = 1;
var softwareControlActive = [
	1,
	3,
	4
];
var softwareControlReleased = [
	1,
	0,
	0
];
var effectDefinitions = [
	{
		id: "off",
		label: "Off",
		wireIds: [0],
		controls: []
	},
	{
		id: "static",
		label: "Static",
		wireIds: [1],
		controls: [
			"color",
			"zones",
			"brightness"
		]
	},
	{
		id: "pulse",
		label: "Pulse",
		wireIds: [2],
		controls: [
			"color",
			"brightness",
			"speed"
		]
	},
	{
		id: "cycle",
		label: "Color cycle",
		wireIds: [21, 3],
		controls: ["brightness", "speed"]
	},
	{
		id: "wave",
		label: "Color wave",
		wireIds: [22, 4],
		controls: [
			"brightness",
			"speed",
			"direction"
		]
	},
	{
		id: "breathing",
		label: "Breathing",
		wireIds: [10],
		controls: [
			"color",
			"brightness",
			"speed"
		]
	},
	{
		id: "ripple",
		label: "Ripple",
		wireIds: [23, 11],
		controls: ["color", "speed"]
	},
	{
		id: "signature",
		label: "G signature",
		wireIds: [15, 16],
		controls: ["brightness", "speed"]
	},
	{
		id: "decomposition",
		label: "Decomposition",
		wireIds: [14],
		controls: ["brightness", "speed"]
	}
];
var directions = [
	"cycle",
	"left",
	"right",
	"up",
	"down",
	"in",
	"out",
	"center-in",
	"center-out"
];
var directionBytes = {
	cycle: 0,
	right: 1,
	down: 2,
	"center-out": 3,
	in: 4,
	out: 5,
	left: 6,
	up: 7,
	"center-in": 8
};
var LogitechRgbEffectsController = class LogitechRgbEffectsController {
	transport;
	deviceIndex;
	featureIndex;
	perKeyFeatureIndex;
	clusters;
	availableEffects;
	color;
	brightness;
	speed;
	direction;
	activeEffectId;
	enabled;
	acknowledged = false;
	hasSelection = false;
	unknownReason;
	claimed = false;
	perKeyPrepared = false;
	batteryOverride = false;
	batteryValue = null;
	statusColor = null;
	restoreSoftwareLighting = false;
	restoreFirmwarePower = true;
	zoneColors = /* @__PURE__ */ new Map();
	constructor(transport, deviceIndex, featureIndex, perKeyFeatureIndex, clusters, availableEffects, zoneIds, previous) {
		this.transport = transport;
		this.deviceIndex = deviceIndex;
		this.featureIndex = featureIndex;
		this.perKeyFeatureIndex = perKeyFeatureIndex;
		this.clusters = clusters;
		this.availableEffects = availableEffects;
		previous = previous?.source === "software" ? previous : void 0;
		this.hasSelection = previous?.state === "acknowledged" || previous?.state === "maintained";
		this.color = previous?.color ?? "#89cff0";
		this.brightness = previous?.brightness ?? 100;
		this.speed = previous?.speed ?? 50;
		this.direction = previous?.direction ?? "right";
		this.activeEffectId = this.availableEffects.some((effect) => effect.id === previous?.activeEffectId) ? previous.activeEffectId : this.availableEffects[0]?.id ?? "static";
		this.enabled = previous?.batteryLightingEnabled ?? previous?.enabled ?? true;
		for (const [index, zoneId] of zoneIds.entries()) {
			const previousZone = previous?.zones?.find((zone) => zone.id === zoneKey(zoneId));
			this.zoneColors.set(zoneId, previousZone?.color ?? this.color);
			if (index === 0 && previousZone) this.color = previousZone.color;
		}
	}
	static async probe(transport, deviceIndex, featureIndex, perKeyFeatureIndex, previous) {
		if (featureIndex === null) return null;
		const clusterCount = (await transport.request(deviceIndex, featureIndex, 0, [
			allClusters,
			allClusters,
			infoGeneral
		]))[6] ?? 0;
		if (clusterCount === 0 || clusterCount > 16) return null;
		const clusters = [];
		for (let clusterIndex = 0; clusterIndex < clusterCount; clusterIndex += 1) {
			const effectCount = (await transport.request(deviceIndex, featureIndex, 0, [
				clusterIndex,
				allClusters,
				infoGeneral
			]))[8] ?? 0;
			if (effectCount === 0 || effectCount > 32) continue;
			const effects = [];
			for (let effectIndex = 0; effectIndex < effectCount; effectIndex += 1) {
				const response = await transport.request(deviceIndex, featureIndex, 0, [
					clusterIndex,
					effectIndex,
					infoGeneral
				]);
				const wireId = (response[6] ?? 0) << 8 | (response[7] ?? 0);
				const definition = effectDefinitions.find((candidate) => candidate.wireIds.some((candidateId) => candidateId === wireId));
				if (!definition) continue;
				effects.push({
					index: effectIndex,
					wireId,
					canonicalId: definition.id,
					period: (response[10] ?? 0) << 8 | (response[11] ?? 0)
				});
			}
			if (effects.some((effect) => effect.canonicalId !== "off")) clusters.push({
				index: clusterIndex,
				effectCount,
				effects
			});
		}
		if (clusters.length === 0) return null;
		const availableEffects = effectDefinitions.filter((definition) => definition.id !== "off").filter((definition) => clusters.every((cluster) => cluster.effects.some((effect) => effect.canonicalId === definition.id))).map(({ id, label, controls }) => ({
			id,
			label,
			controls: [...controls]
		}));
		if (availableEffects.length === 0) return null;
		const zoneIds = perKeyFeatureIndex === null ? [] : await readPerKeyZoneIds(transport, deviceIndex, perKeyFeatureIndex).catch(() => []);
		return new LogitechRgbEffectsController(transport, deviceIndex, featureIndex, perKeyFeatureIndex, clusters, availableEffects, zoneIds, previous);
	}
	buildCapability(writable) {
		const active = this.activeDefinition;
		const unavailableReason = writable ? void 0 : "Turn off onboard memory to use live LIGHTSYNC effects and zone colors.";
		const zonesWritable = writable && active?.id === "static";
		return {
			writable,
			enabled: this.enabled,
			activeEffectId: this.activeEffectId,
			availableEffects: structuredClone(this.availableEffects),
			color: this.color,
			colorWritable: writable && Boolean(active?.controls.includes("color")),
			brightness: this.brightness,
			brightnessWritable: writable && Boolean(active?.controls.includes("brightness")),
			speed: this.speed,
			speedWritable: writable && Boolean(active?.controls.includes("speed")),
			direction: this.direction,
			availableDirections: [...directions],
			directionWritable: writable && Boolean(active?.controls.includes("direction")),
			zones: [...this.zoneColors].map(([zoneId, color], index) => ({
				id: zoneKey(zoneId),
				label: `Zone ${index + 1}`,
				color,
				colorWritable: zonesWritable
			})),
			profiles: [],
			muteLinked: false,
			muteLinkedWritable: false,
			state: this.acknowledged ? "acknowledged" : "unknown",
			stateReason: this.acknowledged ? this.enabled ? "RGB power is on and the mouse acknowledged the effect. The visible effect has no readback." : "The mouse reports RGB power off. Switchboard keeps control while it is running." : this.unknownReason ?? "Current lighting is unknown. Choose an effect or Turn off to take control.",
			physicalEffectVerified: false,
			profileMode: "software",
			source: "software",
			unavailableReason
		};
	}
	async setEnabled(enabled) {
		await this.claim();
		if (enabled) {
			await this.applyEffect(this.activeEffectId);
			if (this.activeEffectId === "static") await this.paintAllZones();
		} else await this.applyOff();
		await this.confirmPower(enabled);
		this.enabled = enabled;
		this.acknowledged = true;
		this.hasSelection = true;
	}
	async setEffect(effectId) {
		if (!this.availableEffects.some((effect) => effect.id === effectId)) throw new Error("That LIGHTSYNC effect was not reported by this device.");
		await this.claim();
		await this.applyEffect(effectId);
		if (effectId === "static") await this.paintAllZones();
		await this.confirmPower(true);
		this.activeEffectId = effectId;
		this.enabled = true;
		this.acknowledged = true;
		this.hasSelection = true;
	}
	async setColor(color) {
		assertColor(color);
		const previousColor = this.color;
		const previousEffect = this.activeEffectId;
		const previousEnabled = this.enabled;
		const previousZones = new Map(this.zoneColors);
		const targetEffect = this.activeDefinition?.controls.includes("color") ? this.activeEffectId : "static";
		if (!this.availableEffects.some((effect) => effect.id === targetEffect)) throw new Error("The active LIGHTSYNC effect does not accept a custom color.");
		try {
			this.color = color.toLowerCase();
			if (targetEffect === "static") for (const zoneId of this.zoneColors.keys()) this.zoneColors.set(zoneId, this.color);
			await this.claim();
			await this.applyEffect(targetEffect);
			if (targetEffect === "static") await this.paintAllZones();
			await this.confirmPower(true);
			this.activeEffectId = targetEffect;
			this.enabled = true;
			this.acknowledged = true;
			this.hasSelection = true;
		} catch (error) {
			this.color = previousColor;
			this.activeEffectId = previousEffect;
			this.enabled = previousEnabled;
			this.zoneColors.clear();
			for (const [zoneId, previousColorValue] of previousZones) this.zoneColors.set(zoneId, previousColorValue);
			throw error;
		}
	}
	async setZoneColor(zoneId, color) {
		assertColor(color);
		const numericId = parseZoneKey(zoneId);
		if (numericId === null || !this.zoneColors.has(numericId) || this.perKeyFeatureIndex === null) throw new Error("That LIGHTSYNC zone is not available on this device.");
		if (!this.availableEffects.some((effect) => effect.id === "static")) throw new Error("This device does not report the Static effect required for zone colors.");
		const previousColor = this.zoneColors.get(numericId);
		const previousEffect = this.activeEffectId;
		const previousEnabled = this.enabled;
		try {
			this.zoneColors.set(numericId, color.toLowerCase());
			await this.claim();
			await this.applyEffect("static");
			this.activeEffectId = "static";
			this.enabled = true;
			await this.paintAllZones();
			await this.confirmPower(true);
			this.acknowledged = true;
			this.hasSelection = true;
		} catch (error) {
			this.zoneColors.set(numericId, previousColor);
			this.activeEffectId = previousEffect;
			this.enabled = previousEnabled;
			throw error;
		}
	}
	async setBrightness(brightness) {
		if (!this.activeDefinition?.controls.includes("brightness")) throw new Error("The selected LIGHTSYNC effect has no brightness control.");
		const previousBrightness = this.brightness;
		const previousEnabled = this.enabled;
		try {
			this.brightness = clamp(Math.round(brightness), 0, 100);
			await this.claim();
			await this.applyEffect(this.activeEffectId);
			if (this.activeEffectId === "static") await this.paintAllZones();
			await this.confirmPower(true);
			this.enabled = true;
			this.acknowledged = true;
			this.hasSelection = true;
		} catch (error) {
			this.brightness = previousBrightness;
			this.enabled = previousEnabled;
			throw error;
		}
	}
	async setSpeed(speed) {
		if (!this.activeDefinition?.controls.includes("speed")) throw new Error("The selected LIGHTSYNC effect has no speed control.");
		const previousSpeed = this.speed;
		const previousEnabled = this.enabled;
		try {
			this.speed = clamp(Math.round(speed), 1, 100);
			await this.claim();
			await this.applyEffect(this.activeEffectId);
			await this.confirmPower(true);
			this.enabled = true;
			this.acknowledged = true;
			this.hasSelection = true;
		} catch (error) {
			this.speed = previousSpeed;
			this.enabled = previousEnabled;
			throw error;
		}
	}
	async setDirection(direction) {
		if (!this.activeDefinition?.controls.includes("direction")) throw new Error("The selected LIGHTSYNC effect has no direction control.");
		if (!directions.includes(direction)) throw new Error("That LIGHTSYNC direction is unavailable.");
		const previousDirection = this.direction;
		const previousEnabled = this.enabled;
		try {
			this.direction = direction;
			await this.claim();
			await this.applyEffect(this.activeEffectId);
			await this.confirmPower(true);
			this.enabled = true;
			this.acknowledged = true;
			this.hasSelection = true;
		} catch (error) {
			this.direction = previousDirection;
			this.enabled = previousEnabled;
			throw error;
		}
	}
	get supportsBatteryLighting() {
		return this.availableEffects.some((effect) => effect.id === "static");
	}
	/** Temporary RAM-only override. Never mutate the user's effect, colors, or zones. */
	async setBatteryOverride(value) {
		this.batteryValue = value;
		await this.setTemporaryOverride(value ?? this.statusColor);
	}
	async setStatusOverride(color) {
		if (color !== null) assertColor(color);
		this.statusColor = color;
		await this.setTemporaryOverride(this.batteryValue ?? color);
	}
	async setTemporaryOverride(value) {
		if (value === null) {
			if (!this.batteryOverride) return;
			this.perKeyPrepared = false;
			if (this.restoreSoftwareLighting) {
				if (this.enabled) {
					await this.applyEffect(this.activeEffectId);
					if (this.activeEffectId === "static") await this.paintAllZones();
				} else await this.applyOff();
				await this.confirmPower(this.enabled);
			} else {
				await this.confirmPower(this.restoreFirmwarePower);
				await this.release();
			}
			this.batteryOverride = false;
			return;
		}
		if (!this.batteryOverride) {
			this.restoreSoftwareLighting = this.claimed;
			if (!this.claimed) {
				const power = await this.transport.request(this.deviceIndex, this.featureIndex, 8, [
					0,
					0,
					0
				]);
				if (power[5] !== 1 && power[5] !== 3) throw new Error("The mouse RGB power state is unavailable; battery lighting was not changed.");
				this.restoreFirmwarePower = power[5] === 1;
			}
		}
		this.batteryOverride = true;
		await this.claim();
		this.perKeyPrepared = false;
		if (value === "off") {
			await this.applyOff();
			await this.confirmPower(false);
			return;
		}
		for (const cluster of this.clusters) {
			const effect = preferredEffect(cluster, "static");
			if (!effect) throw new Error("The mouse does not support a static red battery warning.");
			await this.transport.request(this.deviceIndex, this.featureIndex, 1, [
				cluster.index,
				effect.index,
				...buildEffectParameters(effect, value === "red" ? "#ff0000" : value, 25, 50, "right"),
				persistUntilRelease
			]);
		}
		if (this.perKeyFeatureIndex !== null && this.zoneColors.size > 0) {
			await this.preparePerKey();
			for (const zoneId of this.zoneColors.keys()) {
				const color = value === "red" ? "#ff0000" : value;
				const rgb = [
					1,
					3,
					5
				].map((offset) => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .25));
				await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 1, [zoneId, ...rgb]);
			}
			await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 7, [0]);
		}
		await this.confirmPower(true);
	}
	invalidate(reason) {
		this.perKeyPrepared = false;
		this.acknowledged = false;
		this.unknownReason = reason;
	}
	async refreshState() {
		if (!this.acknowledged || this.batteryOverride) return;
		try {
			const ownership = await this.transport.request(this.deviceIndex, this.featureIndex, 5, [
				0,
				0,
				0
			]);
			const power = await this.transport.request(this.deviceIndex, this.featureIndex, 8, [
				0,
				0,
				0
			]);
			if ((ownership[5] & 3) !== 3 || power[5] !== (this.enabled ? 1 : 3)) this.invalidate("The mouse changed RGB control or power state. Choose an effect or Turn off to reapply lighting.");
		} catch {
			this.invalidate("Current lighting could not be checked. Choose an effect or Turn off to retry.");
		}
	}
	async restoreSelection() {
		if (!this.hasSelection) return;
		await this.setEnabled(this.enabled);
	}
	async release(force = false) {
		if (!this.claimed && !force) return;
		await this.transport.request(this.deviceIndex, this.featureIndex, 5, softwareControlReleased, 350);
		this.claimed = false;
		this.perKeyPrepared = false;
		this.acknowledged = false;
	}
	get activeDefinition() {
		return effectDefinitions.find((definition) => definition.id === this.activeEffectId);
	}
	async claim() {
		await this.transport.request(this.deviceIndex, this.featureIndex, 5, softwareControlActive);
		this.claimed = true;
		this.perKeyPrepared = false;
	}
	async confirmPower(enabled) {
		const requestedMode = enabled ? 1 : 3;
		try {
			await this.transport.request(this.deviceIndex, this.featureIndex, 8, [
				1,
				requestedMode,
				0
			]);
			if ((await this.transport.request(this.deviceIndex, this.featureIndex, 8, [
				0,
				0,
				0
			]))[5] !== requestedMode) throw new Error("The mouse did not confirm the requested RGB power state.");
		} catch (error) {
			this.acknowledged = false;
			this.unknownReason = "The mouse did not confirm RGB power. Retry the lighting change.";
			throw error;
		}
	}
	async applyOff() {
		for (const cluster of this.clusters) {
			const off = preferredEffect(cluster, "off");
			await this.transport.request(this.deviceIndex, this.featureIndex, 1, [
				cluster.index,
				off?.index ?? cluster.effectCount,
				...Array(10).fill(0),
				persistUntilRelease
			]);
		}
	}
	async applyEffect(effectId) {
		for (const cluster of this.clusters) {
			const effect = preferredEffect(cluster, effectId);
			if (!effect) throw new Error("The selected LIGHTSYNC effect is not available in every lighting cluster.");
			const parameters = buildEffectParameters(effect, this.color, this.brightness, this.speed, this.direction);
			await this.transport.request(this.deviceIndex, this.featureIndex, 1, [
				cluster.index,
				effect.index,
				...parameters,
				persistUntilRelease
			]);
		}
	}
	async preparePerKey() {
		if (this.perKeyPrepared || this.perKeyFeatureIndex === null || this.zoneColors.size === 0) return;
		const firstCluster = this.clusters[0];
		await this.transport.request(this.deviceIndex, this.featureIndex, 1, [
			allClusters,
			firstCluster?.effectCount ?? 0,
			...Array(10).fill(0),
			persistUntilRelease
		]);
		this.perKeyPrepared = true;
	}
	async paintAllZones() {
		if (this.perKeyFeatureIndex === null || this.zoneColors.size === 0) return;
		await this.preparePerKey();
		for (const [zoneId, color] of this.zoneColors) {
			const [red, green, blue] = scaledRgb(color, this.brightness);
			await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 1, [
				zoneId,
				red,
				green,
				blue
			]);
		}
		await this.transport.request(this.deviceIndex, this.perKeyFeatureIndex, 7, [0]);
	}
};
async function readPerKeyZoneIds(transport, deviceIndex, featureIndex) {
	const bitmap = [];
	for (let page = 0; page < 3; page += 1) {
		const response = await transport.request(deviceIndex, featureIndex, 0, [0, page]);
		bitmap.push(...response.subarray(6, 20));
	}
	const zoneIds = [];
	for (let zoneId = 1; zoneId < Math.min(255, bitmap.length * 8); zoneId += 1) if ((bitmap[Math.floor(zoneId / 8)] ?? 0) >> zoneId % 8 & 1) zoneIds.push(zoneId);
	return zoneIds;
}
function preferredEffect(cluster, canonicalId) {
	const definition = effectDefinitions.find((candidate) => candidate.id === canonicalId);
	if (!definition) return void 0;
	for (const wireId of definition.wireIds) {
		const effect = cluster.effects.find((candidate) => candidate.wireId === wireId);
		if (effect) return effect;
	}
}
function buildEffectParameters(effect, color, brightness, speed, direction) {
	const parameters = Array(10).fill(0);
	const [red, green, blue] = scaledRgb(color, brightness);
	const intensity = clamp(Math.round(brightness), 0, 100);
	const period = speedPeriod(effect.wireId, speed, effect.period);
	const writeColor = (offset = 0) => parameters.splice(offset, 3, red, green, blue);
	const writePeriod = (offset) => parameters.splice(offset, 2, period >>> 8, period & 255);
	if (effect.wireId === 1) {
		writeColor();
		parameters[3] = 2;
	} else if (effect.wireId === 2) {
		writeColor();
		parameters[3] = clamp(Math.round(speed / 100 * 255), 1, 255);
	} else if (effect.wireId === 3) {
		writePeriod(5);
		parameters[7] = intensity;
	} else if (effect.wireId === 4) {
		writePeriod(6);
		parameters[9] = directionBytes[direction];
	} else if (effect.wireId === 10) {
		writeColor();
		writePeriod(3);
		parameters[5] = 1;
		parameters[6] = intensity;
	} else if (effect.wireId === 11) {
		writeColor();
		writePeriod(4);
	} else if (effect.wireId === 14) {
		writePeriod(6);
		parameters[8] = intensity;
	} else if (effect.wireId === 15 || effect.wireId === 16) {
		writePeriod(5);
		parameters[7] = intensity;
	} else if (effect.wireId === 21) {
		parameters[1] = 255;
		writePeriod(6);
		parameters[8] = intensity;
	} else if (effect.wireId === 22) {
		parameters[1] = 255;
		writePeriod(6);
		parameters[8] = intensity;
		parameters[9] = directionBytes[direction];
	} else if (effect.wireId === 23) {
		writeColor();
		parameters[3] = 255;
		writePeriod(6);
	}
	return parameters;
}
function speedPeriod(wireId, speed, reportedDefault) {
	const normalized = clamp(speed, 1, 100) / 100;
	const ripple = wireId === 11 || wireId === 23;
	const minimum = ripple ? 2 : 200;
	const maximum = ripple ? 200 : 1e4;
	const derived = Math.round(maximum - normalized * (maximum - minimum));
	if (reportedDefault <= 0) return derived;
	return clamp(derived, minimum, maximum);
}
function scaledRgb(color, brightness) {
	assertColor(color);
	const scale = clamp(brightness, 0, 100) / 100;
	return [
		Math.round(Number.parseInt(color.slice(1, 3), 16) * scale),
		Math.round(Number.parseInt(color.slice(3, 5), 16) * scale),
		Math.round(Number.parseInt(color.slice(5, 7), 16) * scale)
	];
}
function zoneKey(zoneId) {
	return `zone-${zoneId}`;
}
function parseZoneKey(value) {
	const match = /^zone-(\d{1,3})$/.exec(value);
	if (!match) return null;
	const zoneId = Number.parseInt(match[1], 10);
	return zoneId > 0 && zoneId < 255 ? zoneId : null;
}
function assertColor(color) {
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Lighting color must use #RRGGBB format.");
}
function clamp(value, minimum, maximum) {
	return Math.max(minimum, Math.min(maximum, value));
}
//#endregion
//#region src/main/modules/logitech/battery-lighting.ts
/** Reuses discovery readings; one cancellable timer advances a three-flash burst. */
var MouseBatteryLighting = class {
	io;
	status = "monitoring";
	reason;
	override = null;
	cancelFlash;
	lastFlashAt = Number.NEGATIVE_INFINITY;
	warningFailure;
	generation = 0;
	closed = false;
	constructor(io) {
		this.io = io;
	}
	async update(policy, battery) {
		if (this.closed) return;
		const fresh = battery && this.io.now() - battery.updatedAt <= 15e3 && battery.updatedAt <= this.io.now();
		const status = !policy.flashEnabled && !policy.cutoffEnabled ? "disabled" : !fresh ? "unavailable" : battery.charging || battery.fullyCharged ? "charging" : policy.cutoffEnabled && battery.percentage <= policy.cutoffPercentage ? "cutoff" : policy.flashEnabled && battery.percentage <= policy.warningPercentage ? "warning" : "monitoring";
		try {
			if (this.status === "error") await this.restore();
			if (status === "cutoff") {
				this.clearTimer();
				if (this.override !== "off") await this.apply("off");
			} else if (status !== "warning") await this.restore();
			else if (this.override === "off" && !this.cancelFlash) await this.restore();
			if (status === "warning" && this.override === null && this.io.now() - this.lastFlashAt >= policy.flashIntervalMinutes * 6e4) {
				this.lastFlashAt = this.io.now();
				try {
					await this.apply("red");
					this.warningFailure = void 0;
				} catch (error) {
					this.warningFailure = error instanceof Error ? error.message : "mouse unavailable";
					throw error;
				}
				this.scheduleFlashStep(++this.generation, 3, true);
			}
			this.status = status;
			this.reason = status === "unavailable" ? "Waiting for a fresh mouse battery reading." : void 0;
			if (status !== "warning") this.warningFailure = void 0;
			else if (this.warningFailure) this.fail(new Error(this.warningFailure));
		} catch (error) {
			this.fail(error);
			try {
				await this.restore();
			} catch {}
		}
	}
	async restore() {
		this.clearTimer();
		if (this.override === null) return;
		await this.io.apply(null);
		this.override = null;
	}
	scheduleFlashStep(generation, remaining, red) {
		this.cancelFlash = this.io.schedule(() => this.io.enqueue(async () => {
			if (this.closed || generation !== this.generation) return;
			this.cancelFlash?.();
			this.cancelFlash = void 0;
			try {
				if (red && remaining === 1) {
					await this.restore();
					return;
				}
				await this.apply(red ? "off" : "red");
				this.scheduleFlashStep(generation, red ? remaining - 1 : remaining, !red);
			} catch (error) {
				this.fail(error);
				this.warningFailure = error instanceof Error ? error.message : "mouse unavailable";
				try {
					await this.restore();
				} catch {}
			}
		}), red ? 2e3 : 500);
	}
	async dispose() {
		if (this.closed) return;
		this.closed = true;
		try {
			await this.restore();
		} catch {}
	}
	async apply(value) {
		this.override = value;
		await this.io.apply(value);
	}
	clearTimer() {
		this.generation += 1;
		this.cancelFlash?.();
		this.cancelFlash = void 0;
	}
	fail(error) {
		this.status = "error";
		this.reason = `Battery lighting could not be applied: ${error instanceof Error ? error.message : "mouse unavailable"}`;
	}
};
//#endregion
//#region src/main/modules/logitech/devices/g502-x-plus/sniper-dpi.ts
var deviceNameFeatureId = 5;
var unifiedBatteryFeatureId = 4100;
var adjustableDpiFeatureId = 8705;
var adjustableReportRateFeatureId = 32864;
var rgbEffectsFeatureId = 32881;
var perKeyLightingV2FeatureId = 32897;
var onboardProfilesFeatureId = 33024;
var mouseButtonSpyFeatureId = 33040;
var g502XSniperButtonMask = 16;
var sensorIndex = 0;
var receiverSlotIndexes = [1];
/**
* Keeps the user's base DPI separate from the temporary held value. The queue
* guarantees that a quick press/release always writes shift then restore in
* order, and dispose restores before the HID handle is released.
*/
var SniperDpiRuntime = class {
	io;
	onBackgroundError;
	buttonMask;
	baseDpi;
	shiftDpi;
	held = false;
	restoreDpi = null;
	tail = Promise.resolve();
	acceptingInput = true;
	constructor(io, initialDpi, initialShiftDpi, onBackgroundError = () => void 0, buttonMask = g502XSniperButtonMask) {
		this.io = io;
		this.onBackgroundError = onBackgroundError;
		this.buttonMask = buttonMask;
		this.baseDpi = initialDpi;
		this.shiftDpi = initialShiftDpi;
	}
	get currentBaseDpi() {
		return this.baseDpi;
	}
	get currentShiftDpi() {
		return this.shiftDpi;
	}
	handleButtonBitmap(bitmap) {
		if (!this.acceptingInput) return;
		const nextHeld = this.buttonMask !== 0 && (bitmap & this.buttonMask) !== 0;
		if (nextHeld === this.held) return;
		this.held = nextHeld;
		if (nextHeld) {
			this.restoreDpi = this.baseDpi;
			this.enqueue(() => this.io.write(this.shiftDpi)).catch(this.onBackgroundError);
			return;
		}
		const restore = this.restoreDpi;
		this.restoreDpi = null;
		if (restore !== null) this.enqueue(() => this.io.write(restore)).catch(this.onBackgroundError);
	}
	setButtonMask(mask) {
		if (mask === this.buttonMask) return;
		if (this.held) this.handleButtonBitmap(0);
		this.buttonMask = mask;
	}
	async refreshBaseDpi() {
		if (this.held) return this.baseDpi;
		const value = await this.enqueue(() => this.io.read());
		this.baseDpi = value;
		return value;
	}
	async setBaseDpi(value) {
		if (this.held) {
			this.baseDpi = value;
			this.restoreDpi = value;
			return;
		}
		await this.enqueue(() => this.io.write(value));
		this.baseDpi = value;
	}
	async setShiftDpi(value) {
		this.shiftDpi = value;
		if (this.held) await this.enqueue(() => this.io.write(value));
	}
	async dispose() {
		if (!this.acceptingInput) return;
		this.acceptingInput = false;
		const restore = this.restoreDpi;
		this.restoreDpi = null;
		this.held = false;
		if (restore !== null) try {
			await this.enqueue(() => this.io.write(restore));
		} catch (error) {
			this.onBackgroundError(error instanceof Error ? error : new Error(String(error)));
		}
		await this.tail;
	}
	idle() {
		return this.tail;
	}
	enqueue(operation) {
		const result = this.tail.then(operation, operation);
		this.tail = result.then(() => void 0, () => void 0);
		return result;
	}
};
var G502NativeSession = class G502NativeSession {
	transport;
	deviceIndex;
	dpiFeatureIndex;
	buttonSpyFeatureIndex;
	batteryFeatureIndex;
	reportRateFeatureIndex;
	onboardProfilesFeatureIndex;
	rgbLighting;
	operations = Promise.resolve();
	batteryLighting;
	runtime;
	supportedDpi;
	supportedReportRates = [];
	stages;
	onboard;
	onboardRefreshedAt;
	unsubscribe;
	closed = false;
	constructor(transport, deviceIndex, dpiFeatureIndex, buttonSpyFeatureIndex, batteryFeatureIndex, reportRateFeatureIndex, onboardProfilesFeatureIndex, rgbLighting, supportedDpi, currentDpi, preferredShiftDpi, preferredStages, onboard) {
		this.transport = transport;
		this.deviceIndex = deviceIndex;
		this.dpiFeatureIndex = dpiFeatureIndex;
		this.buttonSpyFeatureIndex = buttonSpyFeatureIndex;
		this.batteryFeatureIndex = batteryFeatureIndex;
		this.reportRateFeatureIndex = reportRateFeatureIndex;
		this.onboardProfilesFeatureIndex = onboardProfilesFeatureIndex;
		this.rgbLighting = rgbLighting;
		this.supportedDpi = supportedDpi;
		this.onboard = onboard;
		this.onboardRefreshedAt = onboard ? Date.now() : 0;
		const shiftDpi = onboard?.profile.shiftDpi ?? selectShiftDpi(supportedDpi, currentDpi, preferredShiftDpi);
		this.stages = onboard?.profile.stages ?? selectStages(supportedDpi, currentDpi, preferredStages);
		const io = {
			read: () => this.readCurrentDpi(),
			write: (dpi) => this.writeCurrentDpi(dpi)
		};
		this.runtime = new SniperDpiRuntime(io, currentDpi, shiftDpi, (error) => {
			console.warn("G502 X Plus DPI Shift transition failed.", error);
		}, onboard?.profile.shiftButtonMask ?? g502XSniperButtonMask);
		this.unsubscribe = this.transport.subscribe((report) => this.handleNotification(report));
		this.batteryLighting = rgbLighting?.supportsBatteryLighting && batteryFeatureIndex !== null ? new MouseBatteryLighting({
			apply: (value) => rgbLighting.setBatteryOverride(value),
			enqueue: (task) => {
				this.serialize(task).catch(() => void 0);
			},
			now: Date.now,
			schedule: (task, delay) => {
				const timer = setTimeout(task, delay);
				timer.unref();
				return () => clearTimeout(timer);
			}
		}) : null;
	}
	static async open(endpoint, previous) {
		if (!endpoint.path) throw new Error("The Logitech HID++ long-report path is unavailable.");
		const transport = await HidppLongTransport.open(endpoint.path);
		let session;
		try {
			const deviceIndex = await findG502XPlusIndex(transport, endpoint.productId);
			const dpiFeatureIndex = await transport.getFeatureIndex(deviceIndex, adjustableDpiFeatureId);
			const buttonSpyFeatureIndex = await transport.getFeatureIndex(deviceIndex, mouseButtonSpyFeatureId);
			const batteryFeatureIndex = await transport.getFeatureIndex(deviceIndex, unifiedBatteryFeatureId);
			const reportRateFeatureIndex = await transport.getFeatureIndex(deviceIndex, adjustableReportRateFeatureId);
			const rgbEffectsFeatureIndex = await transport.getFeatureIndex(deviceIndex, rgbEffectsFeatureId);
			const perKeyLightingFeatureIndex = await transport.getFeatureIndex(deviceIndex, perKeyLightingV2FeatureId);
			const onboardProfilesFeatureIndex = await transport.getFeatureIndex(deviceIndex, onboardProfilesFeatureId);
			if (dpiFeatureIndex === null || buttonSpyFeatureIndex === null) throw new Error("The connected G502 X Plus does not expose live DPI Shift support.");
			if (((await transport.request(deviceIndex, buttonSpyFeatureIndex, 0))[4] ?? 0) < 6) throw new Error("The mouse button-spy bitmap does not include the sniper button.");
			const supportedDpi = parseAdjustableDpiListPayload((await transport.request(deviceIndex, dpiFeatureIndex, 1, [
				sensorIndex,
				0,
				0
			])).subarray(4));
			const currentDpi = parseCurrentDpiPayload((await transport.request(deviceIndex, dpiFeatureIndex, 2, [
				sensorIndex,
				0,
				0
			])).subarray(4));
			let onboard = null;
			if (onboardProfilesFeatureIndex !== null) try {
				onboard = await readOnboardState(transport, deviceIndex, onboardProfilesFeatureIndex);
			} catch (error) {
				console.warn("Direct G502 X Plus onboard profile is temporarily unavailable.", error);
			}
			let rgbLighting = null;
			try {
				rgbLighting = await LogitechRgbEffectsController.probe(transport, deviceIndex, rgbEffectsFeatureIndex, perKeyLightingFeatureIndex, previous?.lighting);
			} catch (error) {
				console.warn("Direct G502 X Plus LIGHTSYNC discovery is temporarily unavailable.", error);
			}
			session = new G502NativeSession(transport, deviceIndex, dpiFeatureIndex, buttonSpyFeatureIndex, batteryFeatureIndex, reportRateFeatureIndex, onboardProfilesFeatureIndex, rgbLighting, supportedDpi, currentDpi, previous?.dpi?.shiftDpi, previous?.dpi?.stages, onboard);
			await session.enableButtonReports();
			await session.restoreLightingSelection();
			return session;
		} catch (error) {
			if (session) await session.close();
			else await transport.close();
			throw error;
		}
	}
	get isClosed() {
		return this.closed;
	}
	getCapabilities(policy = defaultMouseBatteryLightingPolicy) {
		return this.serialize(() => this.readCapabilities(policy));
	}
	async readCapabilities(policy) {
		if (this.closed) throw new Error("The G502 X Plus native session is closed.");
		await this.refreshOnboardState();
		await this.enableButtonReports();
		const capabilities = { dpi: await this.getDpiCapability() };
		try {
			const reportRate = await this.getReportRateCapability();
			if (reportRate) capabilities.reportRate = reportRate;
		} catch (error) {
			console.warn("Direct G502 X Plus polling rate is temporarily unavailable.", error);
		}
		try {
			const battery = await this.getBatteryCapability();
			if (battery) capabilities.battery = battery;
		} catch (error) {
			console.warn("Direct G502 X Plus battery state is temporarily unavailable.", error);
		}
		if (this.onboard) {
			const onboardWritable = this.onboard.mode === "onboard";
			capabilities.buttonAssignments = this.onboard.profile.buildButtonAssignments(this.onboard.mode, onboardWritable);
			capabilities.onboardMemory = {
				writable: true,
				enabled: onboardWritable,
				activeProfile: `Profile ${this.onboard.activeSector}`
			};
		} else if (this.onboardProfilesFeatureIndex !== null) capabilities.onboardMemory = {
			writable: true,
			enabled: false
		};
		if (!capabilities.lighting && this.rgbLighting) {
			await this.rgbLighting.refreshState();
			capabilities.lighting = this.rgbLighting.buildCapability(true);
		}
		if (this.batteryLighting && capabilities.lighting) {
			capabilities.lighting.statusLightingSupported = true;
			capabilities.lighting.batteryLightingEnabled = capabilities.lighting.enabled;
			await this.batteryLighting.update(policy, capabilities.battery);
			capabilities.lighting.batteryStatus = this.batteryLighting.status;
			capabilities.lighting.batteryStatusReason = this.batteryLighting.reason;
			if (this.batteryLighting.status === "cutoff") {
				Object.assign(capabilities.lighting, {
					enabled: false,
					writable: false,
					colorWritable: false,
					brightnessWritable: false,
					speedWritable: false,
					directionWritable: false,
					unavailableReason: `Lighting is off to save battery at ${policy.cutoffPercentage}% or lower. Charge the mouse or change Battery lighting below.`
				});
				capabilities.lighting.zones = capabilities.lighting.zones?.map((zone) => ({
					...zone,
					colorWritable: false
				}));
			}
		}
		capabilities.battery = withG502BatteryEstimate(capabilities.battery, capabilities.lighting?.enabled);
		return capabilities;
	}
	setControl(change) {
		return this.serialize(async () => {
			if (change.type.startsWith("lighting-") || change.type === "onboard-memory") {
				if (change.type.startsWith("lighting-") && this.batteryLighting?.status === "cutoff") throw new Error("Lighting is off to save battery. Charge the mouse or change the battery lighting cutoff.");
				await this.batteryLighting?.restore();
				await this.rgbLighting?.setStatusOverride(null);
			}
			await this.writeControl(change);
		});
	}
	setStatusLighting(color) {
		return this.serialize(async () => {
			if (!this.rgbLighting?.supportsBatteryLighting) throw new Error("Status lighting is unavailable on this mouse.");
			await this.rgbLighting.setStatusOverride(color);
		});
	}
	async writeControl(change) {
		if (this.closed) throw new Error("The G502 X Plus native session is closed.");
		if (change.type === "dpi") {
			this.assertSupported(change.value);
			if (this.onboard) await this.mutateProfile((profile) => profile.setBaseDpi(change.value));
			await this.runtime.setBaseDpi(change.value);
			if (!this.stages.includes(change.value)) this.stages = selectStages(this.supportedDpi, change.value, [...this.stages, change.value]);
			return;
		}
		if (change.type === "dpi-shift") {
			this.assertSupported(change.value);
			if (this.onboard) {
				await this.mutateProfile((profile) => profile.setShiftDpi(change.value));
				this.runtime.setButtonMask(this.onboard.profile.shiftButtonMask);
				this.stages = this.onboard.profile.stages;
			}
			await this.runtime.setShiftDpi(change.value);
			return;
		}
		if (change.type === "dpi-stages") {
			this.assertStages(change.stages);
			if (this.onboard) {
				await this.mutateProfile((profile) => profile.setStages(change.stages, this.runtime.currentBaseDpi));
				this.stages = this.onboard.profile.stages;
			} else this.stages = [...new Set(change.stages)].sort((left, right) => left - right);
			return;
		}
		if (change.type === "report-rate") {
			await this.setReportRate(change.value);
			return;
		}
		if (change.type === "onboard-memory") {
			await this.setOnboardMode(change.enabled);
			return;
		}
		if (change.type === "button-assignment") {
			this.assertOnboardWritable();
			await this.mutateProfile((profile) => profile.setButtonAction(change.buttonId, change.actionId));
			this.runtime.setButtonMask(this.onboard.profile.shiftButtonMask);
			return;
		}
		if (change.type === "lighting-enabled") {
			this.assertLiveLighting();
			await this.rgbLighting.setEnabled(change.enabled);
			return;
		}
		if (change.type === "lighting-color") {
			this.assertLiveLighting();
			await this.rgbLighting.setColor(change.color);
			return;
		}
		if (change.type === "lighting-effect") {
			this.assertLiveLighting();
			await this.rgbLighting.setEffect(change.effectId);
			return;
		}
		if (change.type === "lighting-brightness") {
			this.assertLiveLighting();
			await this.rgbLighting.setBrightness(change.brightness);
			return;
		}
		if (change.type === "lighting-speed") {
			this.assertLiveLighting();
			await this.rgbLighting.setSpeed(change.speed);
			return;
		}
		if (change.type === "lighting-direction") {
			this.assertLiveLighting();
			await this.rgbLighting.setDirection(change.direction);
			return;
		}
		if (change.type === "lighting-zone-color") {
			this.assertLiveLighting();
			await this.rgbLighting.setZoneColor(change.zoneId, change.color);
			return;
		}
		throw new Error("That control is not supported by the G502 X Plus native HID++ backend.");
	}
	async getDpiCapability() {
		const currentDpi = await this.runtime.refreshBaseDpi();
		return {
			writable: true,
			min: this.supportedDpi[0],
			max: this.supportedDpi.at(-1),
			step: inferDpiStep(this.supportedDpi),
			stages: [...this.stages],
			activeDpi: currentDpi,
			defaultDpi: currentDpi,
			shiftDpi: this.runtime.currentShiftDpi,
			shiftMode: this.onboard?.profile.shiftButtonMask ? "device-profile" : "host-button-spy",
			maxStages: 5,
			profileMode: this.onboard?.mode ?? "software"
		};
	}
	async getBatteryCapability(now = Date.now()) {
		if (this.batteryFeatureIndex === null) return void 0;
		return parseUnifiedBatteryInfoPayload((await this.transport.request(this.deviceIndex, this.batteryFeatureIndex, 1)).subarray(4), now);
	}
	async getReportRateCapability() {
		if (this.reportRateFeatureIndex === null) return void 0;
		const listResponse = await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 0);
		const currentResponse = await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 1);
		const supportedRates = parseAdjustableReportRateListPayload(listResponse.subarray(4));
		const value = parseAdjustableReportRatePayload(currentResponse.subarray(4));
		if (!supportedRates.includes(value)) throw new Error("The mouse reported an active polling rate outside its supported list.");
		this.supportedReportRates = supportedRates;
		const writable = this.onboard?.mode === "onboard";
		return {
			writable,
			value,
			supportedRates,
			profileMode: this.onboard?.mode ?? "software",
			unavailableReason: writable ? void 0 : "Enable onboard memory to store polling-rate changes on this mouse."
		};
	}
	async close() {
		if (this.closed) return;
		this.closed = true;
		await this.operations;
		await this.batteryLighting?.dispose();
		this.unsubscribe?.();
		this.unsubscribe = null;
		await this.runtime.dispose();
		try {
			await this.rgbLighting?.release();
		} catch (error) {
			console.warn("G502 RGB ownership release failed during shutdown.", error);
		}
		try {
			await this.transport.request(this.deviceIndex, this.buttonSpyFeatureIndex, 2, [], 300);
		} catch {}
		await this.transport.close();
	}
	serialize(task) {
		const result = this.operations.then(() => {
			if (this.closed) throw new Error("The G502 X Plus native session is closed.");
			return task();
		});
		this.operations = result.catch(() => void 0);
		return result;
	}
	handleNotification(report) {
		const bitmap = parseMouseButtonSpyNotification(report, this.deviceIndex, this.buttonSpyFeatureIndex);
		if (bitmap !== null) this.runtime.handleButtonBitmap(bitmap);
	}
	async enableButtonReports() {
		if (this.closed) throw new Error("The G502 X Plus native session is closed.");
		await this.transport.request(this.deviceIndex, this.buttonSpyFeatureIndex, 1);
	}
	readCurrentDpi = async () => {
		return parseCurrentDpiPayload((await this.transport.request(this.deviceIndex, this.dpiFeatureIndex, 2, [
			sensorIndex,
			0,
			0
		])).subarray(4));
	};
	writeCurrentDpi = async (dpi) => {
		const [high, low] = toUint16(dpi);
		await this.transport.request(this.deviceIndex, this.dpiFeatureIndex, 3, [
			sensorIndex,
			high,
			low
		]);
	};
	async setReportRate(value) {
		if (this.reportRateFeatureIndex === null || !this.supportedReportRates.includes(value)) throw new Error(`${value.toLocaleString()} Hz is not supported by this mouse.`);
		this.assertOnboardWritable();
		await this.mutateProfile((profile) => profile.setReportRate(value));
		await this.transport.request(this.deviceIndex, this.onboardProfilesFeatureIndex, 3, [
			0,
			this.onboard.activeSector,
			0
		]);
		if (parseAdjustableReportRatePayload((await this.transport.request(this.deviceIndex, this.reportRateFeatureIndex, 1)).subarray(4)) !== value) throw new Error("The mouse stored the polling rate but did not activate it.");
	}
	async setOnboardMode(enabled) {
		if (this.onboardProfilesFeatureIndex === null) throw new Error("This mouse does not expose onboard profile mode.");
		this.rgbLighting?.invalidate();
		await this.transport.request(this.deviceIndex, this.onboardProfilesFeatureIndex, 1, [
			enabled ? 1 : 2,
			0,
			0
		]);
		const actual = (await this.transport.request(this.deviceIndex, this.onboardProfilesFeatureIndex, 2))[4] === 1;
		if (actual !== enabled) throw new Error("The mouse did not acknowledge the requested onboard-memory mode.");
		if (this.onboard) this.onboard.mode = actual ? "onboard" : "software";
		this.onboardRefreshedAt = Date.now();
		await this.restoreLightingSelection();
	}
	async restoreLightingSelection() {
		try {
			await this.rgbLighting?.restoreSelection();
		} catch (error) {
			this.rgbLighting?.invalidate("The profile mode changed, but lighting could not be restored. Choose an effect or Turn off to retry.");
			console.warn("G502 live lighting restoration failed.", error);
		}
	}
	async refreshOnboardState(now = Date.now()) {
		if (this.onboardProfilesFeatureIndex === null || now - this.onboardRefreshedAt < 1e3) return;
		try {
			const onboard = await readOnboardState(this.transport, this.deviceIndex, this.onboardProfilesFeatureIndex);
			const profileChanged = this.onboard?.mode !== onboard.mode || this.onboard.activeSector !== onboard.activeSector;
			if (profileChanged) {
				await this.batteryLighting?.restore();
				this.rgbLighting?.invalidate();
			}
			this.onboard = onboard;
			if (profileChanged) await this.restoreLightingSelection();
			this.onboardRefreshedAt = now;
			this.stages = onboard.profile.stages;
			this.runtime.setButtonMask(onboard.profile.shiftButtonMask);
			if (this.runtime.currentShiftDpi !== onboard.profile.shiftDpi) await this.runtime.setShiftDpi(onboard.profile.shiftDpi);
		} catch (error) {
			console.warn("Direct G502 X Plus onboard profile refresh is temporarily unavailable.", error);
		}
	}
	async mutateProfile(mutator) {
		if (!this.onboard || this.onboardProfilesFeatureIndex === null) throw new Error("The active onboard profile is unavailable.");
		const next = new G502OnboardProfile(this.onboard.info, this.onboard.profile.toSector());
		mutator(next);
		const intended = next.toSector();
		if (intended.equals(this.onboard.profile.toSector())) return;
		await this.batteryLighting?.restore();
		await this.rgbLighting?.release();
		try {
			await writeOnboardSector(this.transport, this.deviceIndex, this.onboardProfilesFeatureIndex, this.onboard.activeSector, intended);
			const verifiedBytes = await readOnboardSector(this.transport, this.deviceIndex, this.onboardProfilesFeatureIndex, this.onboard.activeSector, this.onboard.info.sectorSize);
			if (!verifiedBytes.equals(intended)) throw new Error("The mouse did not verify the onboard profile write.");
			this.onboard.profile = new G502OnboardProfile(this.onboard.info, verifiedBytes);
			this.onboardRefreshedAt = Date.now();
		} finally {
			await this.restoreLightingSelection();
		}
	}
	assertOnboardWritable() {
		if (!this.onboard || this.onboard.mode !== "onboard") throw new Error("Enable onboard memory before changing stored buttons.");
	}
	get usesLiveLighting() {
		return this.rgbLighting !== null;
	}
	assertLiveLighting() {
		if (!this.usesLiveLighting) throw new Error("Live LIGHTSYNC control is unavailable on this mouse.");
	}
	assertStages(values) {
		const stages = [...new Set(values)];
		if (stages.length === 0 || stages.length > 5 || stages.some((value) => !this.supportedDpi.includes(value))) throw new Error("DPI stages must contain one to five values supported by this mouse.");
	}
	assertSupported(value) {
		if (!this.supportedDpi.includes(value)) throw new Error(`${value.toLocaleString()} DPI is not supported by this mouse.`);
	}
};
async function readOnboardState(transport, deviceIndex, featureIndex) {
	const info = parseOnboardProfilesInfo((await transport.request(deviceIndex, featureIndex, 0)).subarray(4));
	const [modeResponse, currentResponse, directory] = await Promise.all([
		transport.request(deviceIndex, featureIndex, 2),
		transport.request(deviceIndex, featureIndex, 4),
		readOnboardSector(transport, deviceIndex, featureIndex, 0, info.sectorSize)
	]);
	const addresses = parseProfileDirectory(directory);
	const reportedActive = currentResponse[5] ?? 0;
	const activeSector = reportedActive > 0 && addresses.includes(reportedActive) ? reportedActive : addresses[0];
	if (activeSector === void 0) throw new Error("The mouse has no readable onboard profile.");
	let sector = await readOnboardSector(transport, deviceIndex, featureIndex, activeSector, info.sectorSize);
	let profile;
	try {
		profile = new G502OnboardProfile(info, sector);
	} catch (error) {
		if (!(error instanceof G502OnboardProfileCrcError)) throw error;
		sector = await readOnboardSector(transport, deviceIndex, featureIndex, activeSector, info.sectorSize);
		profile = new G502OnboardProfile(info, sector);
	}
	return {
		info,
		mode: modeResponse[4] === 1 ? "onboard" : "software",
		activeSector,
		profile
	};
}
async function readOnboardSector(transport, deviceIndex, featureIndex, sector, sectorSize) {
	const data = Buffer.alloc(sectorSize);
	for (let offset = 0; offset < sectorSize; offset += 16) {
		const readOffset = sectorSize - offset < 16 ? sectorSize - 16 : offset;
		(await transport.request(deviceIndex, featureIndex, 5, [
			sector >>> 8,
			sector & 255,
			readOffset >>> 8,
			readOffset & 255
		])).copy(data, readOffset, 4, 20);
		if (offset + 16 >= sectorSize) break;
	}
	return data;
}
async function writeOnboardSector(transport, deviceIndex, featureIndex, sector, data) {
	const start = Array(16).fill(0);
	start.splice(0, 6, sector >>> 8, sector & 255, 0, 0, data.length >>> 8, data.length & 255);
	await transport.request(deviceIndex, featureIndex, 6, start);
	for (let offset = 0; offset < data.length; offset += 16) await transport.request(deviceIndex, featureIndex, 7, [...data.subarray(offset, offset + 16)]);
	await transport.request(deviceIndex, featureIndex, 8);
}
function parseUnifiedBatteryInfoPayload(payload, updatedAt = Date.now()) {
	const percentage = payload[0] ?? -1;
	const status = payload[2] ?? -1;
	if (percentage < 0 || percentage > 100) throw new Error("The mouse returned an invalid battery percentage.");
	if (status < 0 || status > 4) throw new Error("The mouse returned an unknown battery status.");
	if (status === 4) throw new Error("The mouse reported a battery subsystem error.");
	return {
		percentage,
		charging: status === 1 || status === 2,
		fullyCharged: status === 3,
		updatedAt
	};
}
function parseAdjustableReportRateListPayload(payload) {
	const bitFlags = payload[0] ?? 0;
	const rates = Array.from({ length: 8 }, (_, index) => index + 1).filter((interval) => (bitFlags & 1 << interval - 1) !== 0).map((interval) => reportRateFromInterval(interval)).filter((rate) => rate !== null).sort((left, right) => left - right);
	if (rates.length === 0) throw new Error("The mouse did not report any supported polling rates.");
	return rates;
}
function parseAdjustableReportRatePayload(payload) {
	const rate = reportRateFromInterval(payload[0] ?? 0);
	if (rate === null) throw new Error("The mouse returned an invalid polling-rate interval.");
	return rate;
}
function reportRateFromInterval(intervalMilliseconds) {
	if (intervalMilliseconds <= 0 || 1e3 % intervalMilliseconds !== 0) return null;
	return 1e3 / intervalMilliseconds;
}
function parseMouseButtonSpyNotification(report, deviceIndex, featureIndex) {
	if (report[0] !== 17 || report[1] !== deviceIndex || report[2] !== featureIndex || report[3] !== 0) return null;
	return (report[4] ?? 0) << 8 | (report[5] ?? 0);
}
function parseAdjustableDpiListPayload(payload) {
	const values = [];
	let offset = 1;
	while (offset + 1 < payload.length) {
		const value = (payload[offset] ?? 0) << 8 | (payload[offset + 1] ?? 0);
		if (value === 0) break;
		if (value >>> 13 === 7) {
			const step = value & 8191;
			if (step === 0 || values.length === 0 || offset + 3 >= payload.length) throw new Error("The mouse returned an invalid DPI range.");
			const end = (payload[offset + 2] ?? 0) << 8 | (payload[offset + 3] ?? 0);
			const start = values.at(-1);
			if (end < start) throw new Error("The mouse returned a descending DPI range.");
			for (let next = start + step; next < end; next += step) values.push(next);
			values.push(end);
			offset += 4;
			continue;
		}
		values.push(value);
		offset += 2;
	}
	const normalized = [...new Set(values)].sort((left, right) => left - right);
	if (normalized.length === 0) throw new Error("The mouse did not report any supported DPI values.");
	return normalized;
}
function inferDpiStep(values) {
	let step = Number.POSITIVE_INFINITY;
	for (let index = 1; index < values.length; index += 1) {
		const difference = values[index] - values[index - 1];
		if (difference > 0) step = Math.min(step, difference);
	}
	return Number.isFinite(step) ? step : 1;
}
async function findG502XPlusIndex(transport, productId) {
	const indexes = productId === 49301 ? [255] : receiverSlotIndexes;
	let lastError;
	for (const index of indexes) for (let attempt = 0; attempt < 3; attempt += 1) try {
		await transport.request(index, 0, 1, [
			2,
			0,
			0
		], 650);
		const nameFeatureIndex = await transport.getFeatureIndex(index, deviceNameFeatureId, 650);
		if (nameFeatureIndex === null) break;
		const name = await readDeviceName(transport, index, nameFeatureIndex);
		if (/g502\s*x\s*plus/i.test(name)) return index;
		break;
	} catch (error) {
		lastError = error;
		if (attempt < 2) await delay$2(80 * (attempt + 1));
	}
	throw new Error("No responsive G502 X Plus was found on this Logitech transport.", { cause: lastError });
}
async function readDeviceName(transport, deviceIndex, featureIndex) {
	const count = (await transport.request(deviceIndex, featureIndex, 0))[4] ?? 0;
	const bytes = [];
	while (bytes.length < count) {
		const response = await transport.request(deviceIndex, featureIndex, 1, [
			bytes.length,
			0,
			0
		]);
		bytes.push(...response.subarray(4, 4 + Math.min(16, count - bytes.length)));
	}
	return Buffer.from(bytes).toString("utf8").replace(/\0+$/g, "");
}
function parseCurrentDpiPayload(payload) {
	const value = (payload[1] ?? 0) << 8 | (payload[2] ?? 0);
	if (value <= 0) throw new Error("The mouse returned an invalid active DPI value.");
	return value;
}
function selectShiftDpi(values, currentDpi, preferred) {
	if (preferred !== void 0 && values.includes(preferred)) return preferred;
	const lower = values.filter((value) => value < currentDpi);
	if (lower.includes(800)) return 800;
	return lower.at(Math.max(0, lower.length - 1)) ?? values[0];
}
function selectStages(values, currentDpi, preferred) {
	const validPreferred = [...new Set(preferred ?? [])].filter((value) => values.includes(value));
	const defaults = [
		800,
		1600,
		3200
	].filter((value) => values.includes(value));
	const stages = validPreferred.length > 0 ? validPreferred : defaults;
	if (!stages.includes(currentDpi)) stages.push(currentDpi);
	return stages.sort((left, right) => left - right).slice(0, 5);
}
function toUint16(value) {
	return [value >>> 8 & 255, value & 255];
}
function delay$2(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//#endregion
//#region src/main/modules/logitech/index.ts
var logitechVendorId = 1133;
var directSessionRetryDelayMs = 5e3;
var defaultDependencies$1 = {
	readAgentDevices: readLogitechAgentDevices,
	readBattery: readLogitechBattery,
	readCapabilities: readG502Capabilities,
	writeControl: writeG502Control,
	openDirectSession: G502NativeSession.open
};
var LogitechDeviceModule = class {
	dependencies;
	id = "device.logitech-hidpp";
	agentIds = /* @__PURE__ */ new Map();
	directSession = null;
	directPath = null;
	directDeviceId = null;
	failedDirectPath = null;
	directRetryAfter = 0;
	constructor(dependencies = defaultDependencies$1) {
		this.dependencies = dependencies;
	}
	async discover(context) {
		const logitechHid = context.hidDevices.filter((device) => device.vendorId === logitechVendorId);
		this.agentIds.clear();
		if (logitechHid.length === 0) {
			this.clearDirectRetry();
			await this.stopDirectSession();
			return [];
		}
		const matchingAgentDevices = (await this.dependencies.readAgentDevices()).filter((device) => device.deviceBaseModel === g502XPlusDefinition.deviceBaseModel);
		const receiver = logitechHid.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId));
		const transport = logitechHid.find((device) => device.productId === g502XPlusDefinition.wiredProductId) ?? receiver;
		const directEndpoint = findLongHidppEndpoint(logitechHid, transport?.productId);
		if (this.failedDirectPath && directEndpoint?.path !== this.failedDirectPath) this.clearDirectRetry();
		if (matchingAgentDevices.length > 0) return Promise.all(matchingAgentDevices.map((device) => this.createG502XPlus(device, logitechHid, directEndpoint, context)));
		return transport ? [await this.createG502XPlusFallback(transport, directEndpoint, context)] : [];
	}
	async setControl(device, change) {
		if (!device.connected) throw new Error(`${device.displayName} is disconnected.`);
		if (this.directSession && device.id === this.directDeviceId) {
			await this.directSession.setControl(change);
			return;
		}
		const agentDeviceId = this.agentIds.get(device.id);
		if (!agentDeviceId) throw new Error("Logitech configuration requires the local G HUB device service.");
		await this.dependencies.writeControl(agentDeviceId, device, change);
	}
	async setStatusLighting(device, color) {
		if (device.id !== this.directDeviceId || !this.directSession?.setStatusLighting) throw new Error("The native mouse lighting session is unavailable.");
		await this.directSession.setStatusLighting(color);
	}
	deactivate() {
		this.clearDirectRetry();
		return this.stopDirectSession();
	}
	dispose() {
		this.clearDirectRetry();
		return this.stopDirectSession();
	}
	async createG502XPlus(metadata, hidDevices, directEndpoint, context) {
		const activeInterface = metadata.activeInterfaces.find((entry) => entry.type === "DEVIO") ?? metadata.activeInterfaces[0];
		const stableUnitId = activeInterface?.serialNumber || metadata.deviceUnitId;
		const id = `logitech:${stableUnitId || metadata.pid.toString(16).padStart(4, "0")}`;
		const transportProductId = findTransportProductId(activeInterface?.path, hidDevices);
		const hardwareRevision = activeInterface?.firmwareVersion || (activeInterface?.hardwareRevision !== void 0 ? String(activeInterface.hardwareRevision) : void 0);
		const identity = {
			manufacturer: g502XPlusDefinition.manufacturer,
			productFamily: g502XPlusDefinition.productFamily,
			model: g502XPlusDefinition.model,
			connection: metadata.connectionType === "WIRELESS" ? "wireless" : "usb",
			connectionLabel: metadata.displayConnectionType || (metadata.connectionType === "WIRELESS" ? "LIGHTSPEED" : "USB"),
			hardwareRevision,
			vendorId: logitechVendorId,
			productId: activeInterface?.pid || metadata.pid,
			transportProductId,
			serialNumber: stableUnitId,
			productString: metadata.displayName
		};
		const resolved = resolveDeviceVariant(identity, resolveG502XPlusVariant(activeInterface?.extendedModel ?? metadata.deviceExt), context.appearanceOverrides[id]);
		const previous = findPreviousDevice(context.previousDevices, id, g502XPlusDefinition.model);
		let capabilities;
		if (directEndpoint?.path) {
			capabilities = await this.readDirectCapabilities(directEndpoint, previous, id, context.mouseBatteryLighting?.[id] ?? (previous ? context.mouseBatteryLighting?.[previous.id] : void 0));
			capabilities.battery = withG502BatteryEstimate(capabilities.battery, capabilities.lighting?.enabled);
		} else {
			await this.stopDirectSession();
			this.agentIds.set(id, metadata.id);
			const [agentCapabilities, batteryReading] = await Promise.all([this.readCapabilities(metadata.id, previous, identity.connection), this.readBattery(metadata.id, previous?.capabilities.battery)]);
			capabilities = {
				...agentCapabilities,
				battery: withG502BatteryEstimate(batteryReading, agentCapabilities.lighting?.enabled)
			};
		}
		return {
			id,
			moduleId: this.id,
			displayName: g502XPlusDefinition.model,
			kind: "mouse",
			connected: true,
			identity: resolved.identity,
			variantResolution: resolved.resolution,
			asset: resolveProductAsset(resolved.identity, "mouse"),
			capabilities,
			settings: withoutLegacyMouseSettings(previous?.settings)
		};
	}
	async createG502XPlusFallback(transport, directEndpoint, context) {
		const wireless = g502XPlusDefinition.receiverProductIds.includes(transport.productId);
		const id = `logitech:${wireless ? `receiver-${transport.productId.toString(16)}` : `wired-${transport.productId.toString(16)}`}`;
		const previous = findPreviousDevice(context.previousDevices, id, g502XPlusDefinition.model);
		const identity = {
			manufacturer: g502XPlusDefinition.manufacturer,
			productFamily: g502XPlusDefinition.productFamily,
			model: g502XPlusDefinition.model,
			connection: wireless ? "wireless" : "usb",
			connectionLabel: wireless ? "LIGHTSPEED" : "USB",
			hardwareRevision: transport.release ? transport.release.toString(16).padStart(4, "0").toUpperCase() : void 0,
			vendorId: logitechVendorId,
			productId: wireless ? g502XPlusDefinition.wirelessProductId : transport.productId,
			transportProductId: transport.productId,
			productString: transport.product
		};
		const previousOverride = previous?.variantResolution.confidence === "user-override" && previous.identity.variant && previous.identity.variant !== "default" ? {
			variant: previous.identity.variant,
			colorway: previous.identity.colorway
		} : void 0;
		const resolved = resolveDeviceVariant(identity, previousVariantCandidates(previous), context.appearanceOverrides[id] ?? (previous ? context.appearanceOverrides[previous.id] : void 0) ?? previousOverride);
		let capabilities = {};
		if (directEndpoint?.path) capabilities = await this.readDirectCapabilities(directEndpoint, previous, id, context.mouseBatteryLighting?.[id] ?? (previous ? context.mouseBatteryLighting?.[previous.id] : void 0));
		else {
			capabilities = disableControls(previous?.capabilities, "The Logitech HID++ control interface is unavailable. Reconnect the mouse or receiver.");
			delete capabilities.battery;
			await this.stopDirectSession();
		}
		return {
			id,
			moduleId: this.id,
			displayName: g502XPlusDefinition.model,
			kind: "mouse",
			connected: true,
			identity: resolved.identity,
			variantResolution: resolved.resolution,
			asset: resolveProductAsset(resolved.identity, "mouse"),
			capabilities,
			settings: withoutLegacyMouseSettings(previous?.settings)
		};
	}
	async ensureDirectSession(endpoint, previous) {
		if (this.directSession && !this.directSession.isClosed && this.directPath === endpoint.path) return this.directSession;
		await this.stopDirectSession();
		const session = await (this.dependencies.openDirectSession ?? G502NativeSession.open)(endpoint, previous?.capabilities);
		this.directSession = session;
		this.directPath = endpoint.path ?? null;
		return session;
	}
	async readDirectCapabilities(endpoint, previous, deviceId, policy) {
		if (endpoint.path && endpoint.path === this.failedDirectPath && Date.now() < this.directRetryAfter) return unavailableDirectCapabilities(previous);
		try {
			const capabilities = await (await this.ensureDirectSession(endpoint, previous)).getCapabilities(policy);
			this.directDeviceId = deviceId;
			this.clearDirectRetry();
			return capabilities;
		} catch (error) {
			console.warn("Native G502 X Plus controls are temporarily unavailable.", error);
			this.failedDirectPath = endpoint.path ?? null;
			this.directRetryAfter = Date.now() + directSessionRetryDelayMs;
			const capabilities = unavailableDirectCapabilities(previous);
			await this.stopDirectSession();
			return capabilities;
		}
	}
	async stopDirectSession() {
		const session = this.directSession;
		this.directSession = null;
		this.directPath = null;
		this.directDeviceId = null;
		if (session) await session.close();
	}
	clearDirectRetry() {
		this.failedDirectPath = null;
		this.directRetryAfter = 0;
	}
	async readCapabilities(agentDeviceId, previous, connection) {
		for (let attempt = 0; attempt < 3; attempt += 1) try {
			const value = await this.dependencies.readCapabilities(agentDeviceId, connection);
			return structuredClone(value);
		} catch (error) {
			if (attempt < 2 && isTransientAgentError(error)) {
				await delay$1(250 * (attempt + 1));
				continue;
			}
			console.warn("Logitech controls are temporarily unavailable.", error);
			return disableControls(previous?.capabilities);
		}
		return disableControls(previous?.capabilities);
	}
	async readBattery(agentDeviceId, previous) {
		const state = await this.dependencies.readBattery(agentDeviceId);
		const updatedAt = Date.now();
		const value = typeof state?.percentage === "number" ? {
			percentage: state.percentage,
			charging: state.charging,
			fullyCharged: state.fullyCharged,
			estimatedMinutesRemaining: state.batteryMileageSupport === "MILEAGE_SUPPORTED" && typeof state.mileage === "number" ? Math.round(state.mileage * 60) : void 0,
			updatedAt
		} : previous;
		return structuredClone(value);
	}
};
function unavailableDirectCapabilities(previous) {
	const capabilities = disableControls(previous?.capabilities, "Native control is unavailable. Close G HUB, OpenLogi, or another app using the Logitech receiver, then reconnect the mouse.");
	delete capabilities.battery;
	return capabilities;
}
function disableControls(previous, reason = "Configuration is unavailable while the local Logitech device service is not responding.") {
	if (!previous) return {};
	const next = structuredClone(previous);
	if (next.dpi) Object.assign(next.dpi, {
		writable: false,
		unavailableReason: reason
	});
	if (next.reportRate) Object.assign(next.reportRate, {
		writable: false,
		unavailableReason: reason
	});
	if (next.buttonAssignments) Object.assign(next.buttonAssignments, {
		writable: false,
		unavailableReason: reason
	});
	if (next.lighting) Object.assign(next.lighting, {
		...next.lighting.batteryStatus ? {
			batteryStatus: "unavailable",
			batteryStatusReason: reason
		} : {},
		writable: false,
		colorWritable: false,
		brightnessWritable: false,
		speedWritable: false,
		directionWritable: false,
		zones: next.lighting.zones?.map((zone) => ({
			...zone,
			colorWritable: false
		})),
		unavailableReason: reason
	});
	if (next.onboardMemory) next.onboardMemory.writable = false;
	return next;
}
function findTransportProductId(path, hidDevices) {
	const pathProductId = path?.match(/pid_([0-9a-f]{4})/i)?.[1];
	if (pathProductId) return Number.parseInt(pathProductId, 16);
	return hidDevices.find((device) => g502XPlusDefinition.receiverProductIds.includes(device.productId))?.productId;
}
function findLongHidppEndpoint(hidDevices, productId) {
	if (productId === void 0) return void 0;
	return hidDevices.find((device) => device.productId === productId && device.usagePage === 65280 && device.usage === 2 && Boolean(device.path));
}
function findPreviousDevice(previous, id, model) {
	return previous.find((device) => device.id === id) ?? previous.find((device) => device.moduleId === "device.logitech-hidpp" && device.identity.model === model);
}
function previousVariantCandidates(previous) {
	if (!previous || previous.identity.variant === void 0 || previous.identity.variant === "default") return [];
	const { confidence } = previous.variantResolution;
	if (confidence !== "hardware" && confidence !== "product-id" && confidence !== "module-metadata") return [];
	return [{
		variant: previous.identity.variant,
		colorway: previous.identity.colorway,
		confidence,
		source: `Previously observed ${previous.variantResolution.source.replace(/^(?:Previously observed )+/, "")}`,
		evidence: previous.variantResolution.evidence
	}];
}
var legacyMouseSettingKeys = /* @__PURE__ */ new Set([
	"activeDpi",
	"dpiStages",
	"lightingColor",
	"lightingEnabled",
	"onboardMemory",
	"pollingRate"
]);
function withoutLegacyMouseSettings(settings) {
	return Object.fromEntries(Object.entries(settings ?? {}).filter(([key]) => !legacyMouseSettingKeys.has(key)));
}
function isTransientAgentError(error) {
	const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return message.includes("message path") || message.includes("invalid device") || message.includes("timed out") || message.includes("socket closed");
}
function delay$1(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
//#endregion
//#region src/main/modules/razer/huntsman-v2-analog-protocol.ts
var razerVendorId = 5426;
var lightingTransactionId = 31;
var generalTransactionId = 255;
var lightingCommandClass = 15;
function buildRazerReport(command) {
	if (command.arguments.length > 80) throw new Error("Razer HID commands accept at most 80 argument bytes.");
	const report = Buffer.alloc(91);
	report[2] = byte(command.transactionId);
	report[6] = command.arguments.length;
	report[7] = byte(command.commandClass);
	report[8] = byte(command.commandId);
	report.set(command.arguments.map(byte), 9);
	report[89] = razerCrc(report);
	return report;
}
function parseRazerResponse(report, request) {
	if (report.byteLength !== 91) throw new Error(`Expected a 91-byte Razer response, received ${report.byteLength}.`);
	if (report[2] !== byte(request.transactionId) || report[7] !== byte(request.commandClass) || report[8] !== byte(request.commandId)) throw new Error("The Razer response did not match the pending command.");
	if (report[89] !== razerCrc(report)) throw new Error("The Razer response checksum was invalid.");
	const size = report[6] ?? 0;
	if (size > 80) throw new Error("The Razer response declared an invalid payload size.");
	return {
		status: report[1] ?? 0,
		arguments: Buffer.from(report.subarray(9, 9 + size))
	};
}
function razerCrc(report) {
	let crc = 0;
	for (let index = 3; index <= 88; index += 1) crc ^= report[index] ?? 0;
	return crc;
}
function firmwareVersionCommand() {
	return {
		transactionId: generalTransactionId,
		commandClass: 0,
		commandId: 129,
		arguments: [0, 0]
	};
}
function serialNumberCommand() {
	return {
		transactionId: generalTransactionId,
		commandClass: 0,
		commandId: 130,
		arguments: Array(22).fill(0)
	};
}
function brightnessReadCommand() {
	return {
		transactionId: lightingTransactionId,
		commandClass: lightingCommandClass,
		commandId: 132,
		arguments: [
			1,
			5,
			0
		]
	};
}
function brightnessWriteCommand(brightness) {
	return {
		transactionId: lightingTransactionId,
		commandClass: lightingCommandClass,
		commandId: 4,
		arguments: [
			1,
			5,
			percentToByte(brightness)
		]
	};
}
function effectReadCommand() {
	return {
		transactionId: lightingTransactionId,
		commandClass: lightingCommandClass,
		commandId: 130,
		arguments: [
			1,
			5,
			...Array(78).fill(0)
		]
	};
}
function effectIdListCommand() {
	return {
		transactionId: lightingTransactionId,
		commandClass: lightingCommandClass,
		commandId: 129,
		arguments: [5, ...Array(79).fill(0)]
	};
}
function effectWriteCommand(effectId, color) {
	const [red, green, blue] = parseColor(color);
	return {
		transactionId: lightingTransactionId,
		commandClass: lightingCommandClass,
		commandId: 2,
		arguments: {
			off: [
				1,
				5,
				0,
				0,
				0,
				0
			],
			static: [
				1,
				5,
				1,
				0,
				0,
				1,
				red,
				green,
				blue
			],
			breathing: [
				1,
				5,
				2,
				1,
				0,
				1,
				red,
				green,
				blue
			],
			spectrum: [
				1,
				5,
				3,
				0,
				0,
				0
			],
			"wave-left": [
				1,
				5,
				4,
				1,
				40,
				0
			],
			"wave-right": [
				1,
				5,
				4,
				2,
				40,
				0
			],
			reactive: [
				1,
				5,
				5,
				0,
				2,
				1,
				red,
				green,
				blue
			],
			starlight: [
				1,
				5,
				7,
				0,
				2,
				1,
				red,
				green,
				blue
			]
		}[effectId]
	};
}
function gamingModeReadCommand() {
	return {
		transactionId: generalTransactionId,
		commandClass: 3,
		commandId: 128,
		arguments: [
			1,
			8,
			0
		]
	};
}
function gamingModeWriteCommand(enabled) {
	return {
		transactionId: generalTransactionId,
		commandClass: 3,
		commandId: 0,
		arguments: [
			1,
			8,
			enabled ? 1 : 0
		]
	};
}
function onboardProfileListCommand() {
	return {
		transactionId: generalTransactionId,
		commandClass: 5,
		commandId: 129,
		arguments: Array(80).fill(0)
	};
}
function activeOnboardProfileReadCommand() {
	return {
		transactionId: generalTransactionId,
		commandClass: 5,
		commandId: 132,
		arguments: [0]
	};
}
function activeOnboardProfileWriteCommand(profileId) {
	return {
		transactionId: generalTransactionId,
		commandClass: 5,
		commandId: 4,
		arguments: [profileByte(profileId)]
	};
}
function parseFirmwareVersion(response) {
	if (response.arguments.length < 2) throw new Error("The keyboard returned an incomplete firmware version.");
	return `${response.arguments[0]}.${String(response.arguments[1]).padStart(2, "0")}`;
}
function parseSerialNumber(response) {
	return response.arguments.toString("ascii").replaceAll("\0", "").trim() || void 0;
}
function parseBrightness(response) {
	if (response.arguments.length < 3) throw new Error("The keyboard returned an incomplete brightness value.");
	return Math.round((response.arguments[2] ?? 0) / 255 * 100);
}
function parseLightingState(response) {
	if (response.arguments.length < 6) throw new Error("The keyboard returned an incomplete lighting effect.");
	const effectCode = response.arguments[2] ?? -1;
	const flags = response.arguments[3] ?? 0;
	const effectId = effectCode === 0 ? "off" : effectCode === 1 ? "static" : effectCode === 2 ? "breathing" : effectCode === 3 ? "spectrum" : effectCode === 4 ? flags === 2 ? "wave-right" : "wave-left" : effectCode === 5 ? "reactive" : effectCode === 7 ? "starlight" : void 0;
	if (!effectId) throw new Error(`The keyboard reported an unknown lighting effect (0x${effectCode.toString(16).padStart(2, "0")}).`);
	const color = (response.arguments[5] ?? 0) > 0 && response.arguments.length >= 9 ? rgbToColor(response.arguments[6] ?? 0, response.arguments[7] ?? 0, response.arguments[8] ?? 0) : void 0;
	return {
		effectId,
		...color ? { color } : {}
	};
}
function parseLightingEffectCodes(response) {
	if (response.arguments.length < 2) throw new Error("The keyboard returned an incomplete lighting effect list.");
	return [...new Set([...response.arguments.subarray(1)].filter((effectId) => effectId >= 0 && effectId <= 7))];
}
function parseGamingMode(response) {
	if (response.arguments.length < 3) throw new Error("The keyboard returned an incomplete Gaming Mode state.");
	return response.arguments[2] === 1;
}
function parseOnboardProfileIds(response) {
	const count = response.arguments[0] ?? 0;
	if (count < 1 || response.arguments.length < count + 1) throw new Error("The keyboard returned an incomplete onboard profile list.");
	return [...response.arguments.subarray(1, count + 1)].filter((profileId) => profileId > 0);
}
function parseActiveOnboardProfile(response) {
	const profileId = response.arguments[0] ?? 0;
	if (profileId < 1) throw new Error("The keyboard returned an invalid active onboard profile.");
	return profileId;
}
function isHuntsmanLightingEffect(value) {
	return typeof value === "string" && [
		"off",
		"static",
		"breathing",
		"spectrum",
		"wave-left",
		"wave-right",
		"reactive",
		"starlight"
	].includes(value);
}
function parseColor(color) {
	if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Lighting color must be a six-digit hex value.");
	return [
		Number.parseInt(color.slice(1, 3), 16),
		Number.parseInt(color.slice(3, 5), 16),
		Number.parseInt(color.slice(5, 7), 16)
	];
}
function percentToByte(value) {
	if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Brightness must be between 0 and 100.");
	return Math.round(value / 100 * 255);
}
function profileByte(profileId) {
	if (!Number.isInteger(profileId) || profileId < 1 || profileId > 255) throw new Error("The onboard profile ID was invalid.");
	return profileId;
}
function rgbToColor(red, green, blue) {
	return `#${[
		red,
		green,
		blue
	].map((value) => byte(value).toString(16).padStart(2, "0")).join("")}`;
}
function byte(value) {
	return value & 255;
}
//#endregion
//#region src/main/modules/razer/huntsman-v2-analog-transport.ts
var nativeHidIo = { open: (path) => HIDAsync.open(path, { nonExclusive: true }) };
var responseDelayMs = 35;
var retryDelayMs = 45;
var maximumAttempts = 3;
var defaultOperationTimeoutMs = 2e3;
var HuntsmanV2AnalogTransport = class {
	hidIo;
	operationTimeoutMs;
	handle = null;
	handlePath = null;
	constructor(hidIo = nativeHidIo, operationTimeoutMs = defaultOperationTimeoutMs) {
		this.hidIo = hidIo;
		this.operationTimeoutMs = operationTimeoutMs;
	}
	async probe(path) {
		return this.withHandle(path, async (handle) => {
			const readFailures = {};
			const read = async (id, operation) => {
				try {
					return await operation();
				} catch (error) {
					readFailures[id] = error instanceof Error ? error.message : String(error);
					return;
				}
			};
			const firmwareVersion = await read("firmware", async () => parseFirmwareVersion(await this.request(handle, firmwareVersionCommand())));
			const serialNumber = await read("serial-number", async () => parseSerialNumber(await this.request(handle, serialNumberCommand())));
			const brightness = await read("brightness", async () => parseBrightness(await this.request(handle, brightnessReadCommand())));
			const lightingState = await read("lighting-effect", async () => parseLightingState(await this.request(handle, effectReadCommand())));
			const lightingEffectCodes = await read("lighting-effects", async () => parseLightingEffectCodes(await this.request(handle, effectIdListCommand())));
			const gamingMode = await read("gaming-mode", async () => parseGamingMode(await this.request(handle, gamingModeReadCommand())));
			const onboardProfileIds = await read("onboard-profiles", async () => parseOnboardProfileIds(await this.request(handle, onboardProfileListCommand())));
			const activeOnboardProfileId = await read("active-profile", async () => parseActiveOnboardProfile(await this.request(handle, activeOnboardProfileReadCommand())));
			return {
				...firmwareVersion ? { firmwareVersion } : {},
				...serialNumber ? { serialNumber } : {},
				...brightness !== void 0 ? { brightness } : {},
				...lightingState ? { lightingState } : {},
				...lightingEffectCodes ? { lightingEffectCodes } : {},
				...gamingMode !== void 0 ? { gamingMode } : {},
				...onboardProfileIds ? { onboardProfileIds } : {},
				...activeOnboardProfileId !== void 0 ? { activeOnboardProfileId } : {},
				readFailures
			};
		});
	}
	async setBrightness(path, brightness) {
		return this.withHandle(path, async (handle) => {
			await this.request(handle, brightnessWriteCommand(brightness));
			return parseBrightness(await this.request(handle, brightnessReadCommand()));
		});
	}
	async setEffect(path, effectId, color) {
		return this.withHandle(path, async (handle) => {
			await this.request(handle, effectWriteCommand(effectId, color));
			return parseLightingState(await this.request(handle, effectReadCommand()));
		});
	}
	async setGamingMode(path, enabled) {
		return this.withHandle(path, async (handle) => {
			await this.request(handle, gamingModeWriteCommand(enabled));
			return parseGamingMode(await this.request(handle, gamingModeReadCommand()));
		});
	}
	async setActiveOnboardProfile(path, profileId) {
		return this.withHandle(path, async (handle) => {
			await this.request(handle, activeOnboardProfileWriteCommand(profileId));
			return parseActiveOnboardProfile(await this.request(handle, activeOnboardProfileReadCommand()));
		});
	}
	async release(path) {
		if (!this.handle || path && path !== this.handlePath) return;
		const handle = this.handle;
		this.handle = null;
		this.handlePath = null;
		await withTimeout$2(handle.close(), this.operationTimeoutMs, "Closing the Razer control endpoint timed out.").catch(() => void 0);
	}
	async withHandle(path, operation) {
		return operation(await this.getHandle(path));
	}
	async getHandle(path) {
		if (this.handle && this.handlePath === path) return this.handle;
		if (this.handle) await this.release();
		const pendingHandle = this.hidIo.open(path);
		try {
			const handle = await withTimeout$2(pendingHandle, this.operationTimeoutMs, "Opening the Razer control endpoint timed out.");
			this.handle = handle;
			this.handlePath = path;
			return handle;
		} catch (error) {
			pendingHandle.then((lateHandle) => lateHandle.close()).catch(() => void 0);
			throw error;
		}
	}
	async request(handle, command) {
		const report = buildRazerReport(command);
		let lastResponseError;
		for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
			const written = await withTimeout$2(handle.sendFeatureReport(report), this.operationTimeoutMs, "Sending the Razer feature report timed out.");
			if (written !== report.byteLength && written !== report.byteLength - 1) throw new Error(`HIDAPI reported ${written} of ${report.byteLength} Razer command bytes.`);
			await delay(responseDelayMs);
			let response;
			try {
				response = parseRazerResponse(await withTimeout$2(handle.getFeatureReport(0, 91), this.operationTimeoutMs, "Reading the Razer feature response timed out."), command);
			} catch (error) {
				lastResponseError = error instanceof Error ? error : new Error(String(error));
				if (attempt === maximumAttempts) throw lastResponseError;
				await delay(retryDelayMs * attempt);
				continue;
			}
			if (response.status === 2) return response;
			if (response.status !== 1 || attempt === maximumAttempts) throw new RazerCommandStatusError(response.status);
			await delay(retryDelayMs * attempt);
		}
		throw lastResponseError ?? /* @__PURE__ */ new Error("The keyboard did not complete the Razer HID command.");
	}
};
var RazerCommandStatusError = class extends Error {
	status;
	constructor(status) {
		super(razerStatusMessage(status));
		this.status = status;
		this.name = "RazerCommandStatusError";
	}
};
function razerStatusMessage(status) {
	const label = (/* @__PURE__ */ new Map([
		[0, "new command state"],
		[1, "busy"],
		[3, "command failure"],
		[4, "command timeout"],
		[5, "unsupported command"]
	])).get(status);
	return `The keyboard rejected the Razer HID command${label ? `: ${label}` : ` with status 0x${status.toString(16).padStart(2, "0")}`}.`;
}
function delay(milliseconds) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
function withTimeout$2(operation, milliseconds, message) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(message)), milliseconds);
	});
	return Promise.race([operation, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}
//#endregion
//#region src/main/modules/razer/index.ts
var probeCacheDurationMs = 15e3;
var model = "Huntsman V2 Analog";
var nativeUnavailableReason = "The dedicated Razer HID control endpoint is unavailable. Reconnect the keyboard or close another utility that owns it.";
var userUnavailableReason = "This setting is unavailable. Reconnect the keyboard and try again.";
var huntsmanLightingEffects = [
	{
		id: "static",
		label: "Static",
		controls: ["color", "brightness"]
	},
	{
		id: "breathing",
		label: "Breathing",
		controls: ["color", "brightness"]
	},
	{
		id: "spectrum",
		label: "Spectrum",
		controls: ["brightness"]
	},
	{
		id: "reactive",
		label: "Reactive",
		controls: ["color", "brightness"]
	},
	{
		id: "starlight",
		label: "Starlight",
		controls: ["color", "brightness"]
	},
	{
		id: "wave-left",
		label: "Wave left",
		controls: ["brightness"]
	},
	{
		id: "wave-right",
		label: "Wave right",
		controls: ["brightness"]
	}
];
var defaultDependencies = {
	transport: new HuntsmanV2AnalogTransport(),
	now: Date.now
};
var RazerHuntsmanV2AnalogModule = class {
	dependencies;
	id = "device.razer-huntsman";
	path = null;
	deviceId = null;
	probe = null;
	probeUpdatedAt = 0;
	settings = normalizeSettings();
	effectAcknowledged = false;
	lastControlError;
	operationQueue = Promise.resolve();
	disposed = false;
	constructor(dependencies = defaultDependencies) {
		this.dependencies = dependencies;
	}
	discover(context) {
		return this.enqueue(() => this.discoverNow(context));
	}
	async discoverNow(context) {
		if (this.disposed) return [];
		const descriptors = context.hidDevices.filter((descriptor) => descriptor.vendorId === 5426 && descriptor.productId === 614);
		if (descriptors.length === 0) {
			await this.release();
			return [];
		}
		const endpoint = findControlEndpoint(descriptors);
		const primary = descriptors.find((descriptor) => descriptor.interface === 0) ?? descriptors[0];
		const nextPath = endpoint?.path ?? null;
		const previous = context.previousDevices.find((device) => device.moduleId === this.id && device.identity.model === model);
		if (nextPath !== this.path) {
			await this.dependencies.transport.release?.(this.path ?? void 0);
			this.path = nextPath;
			this.probe = null;
			this.probeUpdatedAt = 0;
			this.effectAcknowledged = false;
			this.settings = normalizeSettings(previous?.settings);
		}
		let unavailableReason;
		if (this.path) try {
			if (!this.probe || this.dependencies.now() - this.probeUpdatedAt >= probeCacheDurationMs) {
				this.probe = await this.dependencies.transport.probe(this.path);
				this.probeUpdatedAt = this.dependencies.now();
			}
		} catch (error) {
			unavailableReason = errorMessage$3(error, nativeUnavailableReason);
		}
		else unavailableReason = nativeUnavailableReason;
		if (this.probe?.lightingState) {
			const { effectId, color } = this.probe.lightingState;
			this.settings.lightingEnabled = effectId !== "off";
			if (effectId !== "off") this.settings.lightingEffect = effectId;
			if (color) this.settings.lightingColor = color;
		}
		const serialNumber = this.probe?.serialNumber ?? previous?.identity.serialNumber;
		const id = `razer:${serialNumber || 614 .toString(16).padStart(4, "0")}`;
		this.deviceId = id;
		const identity = {
			manufacturer: "Razer",
			productFamily: "Huntsman",
			model,
			variant: "black",
			colorway: "Black",
			connection: "usb",
			connectionLabel: "USB",
			hardwareRevision: primary?.release ? primary.release.toString(16).padStart(4, "0").toUpperCase() : void 0,
			vendorId: razerVendorId,
			productId: 614,
			interfaceProductIds: [614],
			serialNumber,
			productString: primary?.product ?? descriptors.find((descriptor) => descriptor.product)?.product
		};
		const nativeReady = Boolean(this.path && this.probe && !unavailableReason);
		const brightness = this.probe?.brightness;
		const availableEffects = supportedLightingEffects(this.probe?.lightingEffectCodes);
		if (brightness !== void 0) this.settings.lightingBrightness = brightness;
		const effectWritable = Boolean(nativeReady && this.probe?.lightingState && this.probe?.lightingEffectCodes?.length && availableEffects.length);
		const brightnessWritable = Boolean(nativeReady && brightness !== void 0);
		const gamingModeWritable = Boolean(nativeReady && this.probe?.gamingMode !== void 0);
		const profilesWritable = Boolean(nativeReady && this.probe?.activeOnboardProfileId !== void 0 && this.probe.onboardProfileIds?.includes(this.probe.activeOnboardProfileId));
		return [{
			id,
			moduleId: this.id,
			displayName: model,
			kind: "keyboard",
			connected: true,
			identity,
			variantResolution: {
				confidence: "product-id",
				source: "Razer USB product ID",
				evidence: "1532:0266"
			},
			asset: resolveProductAsset(identity, "keyboard"),
			capabilities: {
				keyboard: {
					...this.probe?.firmwareVersion ? { firmwareVersion: this.probe.firmwareVersion } : {},
					pollingRateHz: 1e3,
					transport: nativeReady ? "native-hid" : "unavailable",
					features: huntsmanKeyboardFeatures.map((feature) => ({ ...feature })),
					gamingMode: {
						enabled: this.probe?.gamingMode ?? null,
						writable: gamingModeWritable,
						...!gamingModeWritable ? { unavailableReason: userUnavailableReason } : {}
					},
					onboardProfiles: {
						activeProfileId: this.probe?.activeOnboardProfileId !== void 0 ? String(this.probe.activeOnboardProfileId) : null,
						profiles: (this.probe?.onboardProfileIds ?? []).map((profileId, index) => ({
							id: String(profileId),
							label: `Profile ${index + 1}`
						})),
						writable: profilesWritable,
						...!profilesWritable ? { unavailableReason: userUnavailableReason } : {}
					},
					diagnostics: keyboardDiagnostics(this.probe, unavailableReason, this.probeUpdatedAt, this.lastControlError)
				},
				lighting: {
					writable: effectWritable,
					enabled: this.settings.lightingEnabled,
					activeEffectId: this.settings.lightingEffect,
					availableEffects,
					color: this.settings.lightingColor,
					colorWritable: effectWritable,
					...brightness !== void 0 ? { brightness } : {},
					brightnessWritable,
					speedWritable: false,
					profiles: [],
					muteLinked: false,
					muteLinkedWritable: false,
					state: this.probe?.lightingState ? "maintained" : this.effectAcknowledged ? "acknowledged" : "unknown",
					stateReason: this.probe?.lightingState ? "Active effect and brightness were read back from keyboard firmware." : unavailableReason ?? "The keyboard has not returned an effect state yet.",
					physicalEffectVerified: false,
					profileMode: "software",
					source: "firmware",
					...!effectWritable ? { unavailableReason: userUnavailableReason } : {}
				}
			},
			settings: serializeSettings(this.settings)
		}];
	}
	async setControl(device, change) {
		try {
			const result = await this.enqueue(async () => {
				if (!device.connected || device.id !== this.deviceId || !this.path) throw new Error(`${device.displayName} native controls are unavailable.`);
				if (change.type === "lighting-brightness") {
					const confirmed = await this.dependencies.transport.setBrightness(this.path, change.brightness);
					this.settings.lightingBrightness = confirmed;
					if (this.probe) this.probe = {
						...this.probe,
						brightness: confirmed
					};
					this.probeUpdatedAt = this.dependencies.now();
					return confirmedControl({
						type: "lighting-brightness",
						brightness: confirmed
					});
				}
				if (change.type === "lighting-enabled") {
					const confirmed = await this.dependencies.transport.setEffect(this.path, change.enabled ? this.settings.lightingEffect : "off", this.settings.lightingColor);
					this.applyLightingReadback(confirmed);
					this.effectAcknowledged = true;
					return confirmedControl({
						type: "lighting-enabled",
						enabled: confirmed.effectId !== "off"
					});
				}
				if (change.type === "lighting-effect") {
					if (!isHuntsmanLightingEffect(change.effectId) || change.effectId === "off") throw new Error("That quick effect is not supported by this keyboard module.");
					if (!this.settings.lightingEnabled) throw new Error("Turn keyboard lighting on before changing the quick effect.");
					const confirmed = await this.dependencies.transport.setEffect(this.path, change.effectId, this.settings.lightingColor);
					this.applyLightingReadback(confirmed);
					this.effectAcknowledged = true;
					return confirmed.effectId === "off" ? confirmedControl({
						type: "lighting-enabled",
						enabled: false
					}) : confirmedControl({
						type: "lighting-effect",
						effectId: confirmed.effectId
					});
				}
				if (change.type === "lighting-color") {
					if (!this.settings.lightingEnabled || !effectUsesColor(this.settings.lightingEffect)) throw new Error("The selected quick effect does not use a custom color.");
					const confirmed = await this.dependencies.transport.setEffect(this.path, this.settings.lightingEffect, change.color);
					this.applyLightingReadback(confirmed);
					this.effectAcknowledged = true;
					if (!confirmed.color) throw new Error("The keyboard did not return the applied lighting color.");
					return confirmedControl({
						type: "lighting-color",
						color: confirmed.color
					});
				}
				if (change.type === "keyboard-gaming-mode") {
					if (!this.probe) throw new Error("Gaming Mode is unavailable until the keyboard responds.");
					const enabled = await this.dependencies.transport.setGamingMode(this.path, change.enabled);
					this.probe = {
						...this.probe,
						gamingMode: enabled
					};
					this.probeUpdatedAt = this.dependencies.now();
					return confirmedControl({
						type: "keyboard-gaming-mode",
						enabled
					});
				}
				if (change.type === "keyboard-onboard-profile") {
					if (!this.probe) throw new Error("Onboard profiles are unavailable until the keyboard responds.");
					const profileId = Number.parseInt(change.profileId, 10);
					if (!this.probe.onboardProfileIds?.includes(profileId)) throw new Error("That onboard profile is not present on this keyboard.");
					const confirmed = await this.dependencies.transport.setActiveOnboardProfile(this.path, profileId);
					this.probe = {
						...this.probe,
						activeOnboardProfileId: confirmed
					};
					this.probeUpdatedAt = this.dependencies.now();
					return confirmedControl({
						type: "keyboard-onboard-profile",
						profileId: String(confirmed)
					});
				}
				throw new Error(`${device.displayName} does not support the requested device control.`);
			});
			this.lastControlError = void 0;
			return result;
		} catch (error) {
			this.lastControlError = errorMessage$3(error, "Unknown Razer control failure.");
			throw new Error(controlFailureMessage(change));
		}
	}
	deactivate() {
		return this.enqueue(() => this.release());
	}
	async dispose() {
		this.disposed = true;
		await this.enqueue(() => this.release());
	}
	enqueue(operation) {
		const result = this.operationQueue.then(operation, operation);
		this.operationQueue = result.then(() => void 0, () => void 0);
		return result;
	}
	applyLightingReadback(state) {
		this.settings.lightingEnabled = state.effectId !== "off";
		if (state.effectId !== "off") this.settings.lightingEffect = state.effectId;
		if (state.color) this.settings.lightingColor = state.color.toLowerCase();
		if (this.probe) this.probe = {
			...this.probe,
			lightingState: state
		};
		this.probeUpdatedAt = this.dependencies.now();
	}
	async release() {
		await this.dependencies.transport.release?.(this.path ?? void 0);
		this.path = null;
		this.deviceId = null;
		this.probe = null;
		this.probeUpdatedAt = 0;
		this.effectAcknowledged = false;
		this.lastControlError = void 0;
	}
};
function confirmedControl(change) {
	return { confirmedChanges: [change] };
}
function findControlEndpoint(descriptors) {
	return descriptors.find((descriptor) => descriptor.interface === 3 && descriptor.usagePage === 12 && descriptor.usage === 1 && Boolean(descriptor.path));
}
function normalizeSettings(settings) {
	return {
		lightingEnabled: typeof settings?.lightingEnabled === "boolean" ? settings.lightingEnabled : true,
		lightingBrightness: numberSetting(settings?.lightingBrightness, 100),
		lightingEffect: isHuntsmanLightingEffect(settings?.lightingEffect) && settings.lightingEffect !== "off" ? settings.lightingEffect : "spectrum",
		lightingColor: typeof settings?.lightingColor === "string" && /^#[0-9a-f]{6}$/i.test(settings.lightingColor) ? settings.lightingColor.toLowerCase() : "#44aaff"
	};
}
function serializeSettings(settings) {
	return { ...settings };
}
function numberSetting(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : fallback;
}
function effectUsesColor(effectId) {
	return [
		"static",
		"breathing",
		"reactive",
		"starlight"
	].includes(effectId);
}
function supportedLightingEffects(effectCodes) {
	if (!effectCodes) return huntsmanLightingEffects.map((effect) => ({ ...effect }));
	const codeByEffect = {
		static: 1,
		breathing: 2,
		spectrum: 3,
		"wave-left": 4,
		"wave-right": 4,
		reactive: 5,
		starlight: 7
	};
	return huntsmanLightingEffects.filter((effect) => effectCodes.includes(codeByEffect[effect.id] ?? -1)).map((effect) => ({ ...effect }));
}
function errorMessage$3(error, fallback) {
	return error instanceof Error && error.message ? error.message : fallback;
}
var huntsmanDiagnosticReads = [
	"firmware",
	"serial-number",
	"brightness",
	"lighting-effect",
	"lighting-effects",
	"gaming-mode",
	"onboard-profiles",
	"active-profile"
];
function keyboardDiagnostics(probe, unavailableReason, updatedAt, lastControlError) {
	const failures = probe?.readFailures ?? {};
	return {
		protocol: "Razer feature reports",
		endpoint: !probe ? "unavailable" : Object.keys(failures).length ? "partial" : "ready",
		...updatedAt > 0 ? { lastSyncAt: new Date(updatedAt).toISOString() } : {},
		...lastControlError ? { lastControlError } : {},
		reads: huntsmanDiagnosticReads.map((id) => ({
			id,
			ok: Boolean(probe) && !failures[id],
			...failures[id] ? { error: failures[id] } : unavailableReason ? { error: unavailableReason } : {}
		}))
	};
}
function controlFailureMessage(change) {
	if (change.type.startsWith("lighting-")) return "Keyboard lighting could not be updated. Reconnect the keyboard and try again.";
	return "The keyboard setting could not be updated. Reconnect the keyboard and try again.";
}
//#endregion
//#region src/main/services/windows-hid-enumerator.ts
var hidClassGuid = "{745a17a0-74d3-11d0-b6fe-00a0c90f57da}";
var hidInterfaceGuid = "{4d1e55b2-f16f-11cf-88cb-001111000030}";
var maximumOutputBytes = 4194304;
var enumerationTimeoutMs = 2500;
async function enumerateWindowsHidDevices() {
	return parsePnpUtilHidDevices(await runPnpUtil([
		"/enum-devices",
		"/connected",
		"/class",
		hidClassGuid,
		"/deviceids",
		"/interfaces",
		"/format",
		"csv"
	]));
}
function parsePnpUtilHidDevices(csv) {
	const rows = parseCsv(csv).filter((row) => row.length >= 11);
	const metadataByInstanceId = /* @__PURE__ */ new Map();
	for (const row of rows) {
		const instanceId = row[0]?.trim();
		const hardwareIds = row[10]?.trim();
		if (!instanceId || !hardwareIds) continue;
		metadataByInstanceId.set(instanceId.toLowerCase(), row);
	}
	const devices = [];
	for (const row of rows) {
		const instanceId = row[0]?.trim();
		const path = row[12]?.trim();
		if (!instanceId || !path || !path.toLowerCase().endsWith(`#${hidInterfaceGuid}`)) continue;
		const metadata = metadataByInstanceId.get(instanceId.toLowerCase());
		if (!metadata) continue;
		const hardwareIds = metadata[10] ?? "";
		const product = `${instanceId};${hardwareIds}`.match(/VID_([0-9a-f]{4})&PID_([0-9a-f]{4})/i);
		if (!product) continue;
		const usage = hardwareIds.match(/UP:([0-9a-f]{4})_U:([0-9a-f]{4})/i);
		const revision = hardwareIds.match(/REV_([0-9a-f]{4})/i);
		const interfaceNumber = instanceId.match(/&MI_([0-9a-f]{2})/i);
		devices.push({
			vendorId: Number.parseInt(product[1], 16),
			productId: Number.parseInt(product[2], 16),
			path,
			manufacturer: metadata[4] || void 0,
			product: metadata[1] || void 0,
			release: revision ? Number.parseInt(revision[1], 16) : 0,
			interface: interfaceNumber ? Number.parseInt(interfaceNumber[1], 16) : -1,
			...usage ? {
				usagePage: Number.parseInt(usage[1], 16),
				usage: Number.parseInt(usage[2], 16)
			} : {}
		});
	}
	return devices;
}
function runPnpUtil(args) {
	return new Promise((resolve, reject) => {
		execFile("pnputil.exe", args, {
			encoding: "utf8",
			maxBuffer: maximumOutputBytes,
			timeout: enumerationTimeoutMs,
			windowsHide: true
		}, (error, stdout) => {
			if (error) {
				reject(/* @__PURE__ */ new Error(`Windows HID interface discovery failed: ${error.message}`));
				return;
			}
			resolve(stdout);
		});
	});
}
function parseCsv(value) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (character === "\"") {
			if (quoted && value[index + 1] === "\"") {
				field += "\"";
				index += 1;
			} else quoted = !quoted;
		} else if (character === "," && !quoted) {
			row.push(field);
			field = "";
		} else if ((character === "\n" || character === "\r") && !quoted) {
			if (character === "\r" && value[index + 1] === "\n") index += 1;
			row.push(field);
			if (row.some(Boolean)) rows.push(row);
			row = [];
			field = "";
		} else field += character;
	}
	if (field || row.length > 0) {
		row.push(field);
		if (row.some(Boolean)) rows.push(row);
	}
	return rows;
}
//#endregion
//#region src/main/services/device-registry.ts
var discoveryIntervalMs = 5e3;
var legacyFixtureIds = /* @__PURE__ */ new Set([
	"logitech-g502x-plus-1",
	"hyperx-quadcast2-1",
	"razer-huntsman-v2-analog-1"
]);
var DeviceRegistry = class {
	getSnapshot;
	applyDevices;
	modules;
	additionalModules;
	listHidDevices;
	fixtureMode;
	enumerationTimeoutMs;
	enumerationPromise = null;
	timer = null;
	refreshPromise = null;
	disposePromise = null;
	fixtureConnectionStates = /* @__PURE__ */ new Map();
	disposed = false;
	started = false;
	constructor(getSnapshot, applyDevices, options = {}) {
		this.getSnapshot = getSnapshot;
		this.applyDevices = applyDevices;
		this.modules = options.modules ?? [
			new RazerHuntsmanV2AnalogModule(),
			new LogitechDeviceModule(),
			new HyperXDeviceModule((devices, persist) => this.applyModuleDevices("device.hyperx-quadcast", devices, persist))
		];
		this.additionalModules = options.additionalModules ?? (() => []);
		this.listHidDevices = options.listHidDevices ?? selectHidDeviceEnumerator(process.platform, enumerateWindowsHidDevices, devicesAsync);
		this.fixtureMode = options.fixtureMode ?? process.env.SWITCHBOARD_NATIVE_FIXTURES === "1";
		this.enumerationTimeoutMs = options.enumerationTimeoutMs ?? 3e3;
	}
	async start() {
		if (this.started || this.disposed) return;
		this.started = true;
		await this.refresh();
		if (this.disposed) return;
		const enabledIds = new Set(this.getSnapshot().modules.filter((module) => module.enabled).map((module) => module.id));
		this.syncDiscoveryTimer(this.allModules().some((module) => enabledIds.has(module.id)));
	}
	syncDiscoveryTimer(hasActiveModules) {
		if (!this.started || this.disposed) return;
		if (!hasActiveModules) {
			if (this.timer) clearInterval(this.timer);
			this.timer = null;
			return;
		}
		if (this.timer) return;
		this.timer = setInterval(() => void this.refresh(), discoveryIntervalMs);
		this.timer.unref();
	}
	removeLegacyFixtures() {
		if (this.fixtureMode) return;
		const snapshot = this.getSnapshot();
		const devices = snapshot.devices.filter((device) => !legacyFixtureIds.has(device.id));
		if (devices.length !== snapshot.devices.length) this.applyDevices(devices, { persist: false });
	}
	refresh() {
		if (this.refreshPromise) return this.refreshPromise;
		this.refreshPromise = this.discover().catch((error) => console.warn("Device discovery failed.", error)).finally(() => {
			this.refreshPromise = null;
		});
		return this.refreshPromise;
	}
	async refreshBatteryLighting() {
		if (this.fixtureMode || this.disposed) return;
		if (this.refreshPromise) await this.refreshPromise;
		await this.refresh();
	}
	async setControl(deviceId, change) {
		const snapshot = this.getSnapshot();
		const device = snapshot.devices.find((candidate) => candidate.id === deviceId);
		if (!device) throw new Error("Device not found.");
		if (!snapshot.modules.some((module) => module.id === device.moduleId && module.enabled)) throw new Error(`${device.displayName} is unavailable because its module is disabled.`);
		if (this.fixtureMode) {
			this.setFixtureControl(deviceId, change);
			return;
		}
		const module = this.allModules().find((candidate) => candidate.id === device.moduleId);
		if (!module?.setControl) throw new Error(`${device.displayName} does not expose writable device controls.`);
		const result = await module.setControl(device, change);
		if (result?.confirmedChanges.length) {
			for (const confirmed of result.confirmedChanges) {
				if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, confirmed, this.applyDevices)) continue;
				if (applyConfirmedKeyboardControl(this.getSnapshot(), deviceId, confirmed, this.applyDevices)) continue;
				throw new Error(`${device.displayName} returned an unsupported confirmed control state.`);
			}
			return;
		}
		if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, change, this.applyDevices)) return;
		if (this.refreshPromise) await this.refreshPromise;
		await this.refresh();
	}
	async setStatusLighting(deviceId, color) {
		const snapshot = this.getSnapshot();
		const device = snapshot.devices.find((item) => item.id === deviceId);
		if (!device?.connected || !snapshot.modules.some((item) => item.id === device.moduleId && item.enabled)) throw new Error("Device is unavailable.");
		if (!device.capabilities.lighting?.statusLightingSupported) throw new Error("This device does not support status lighting.");
		if (this.fixtureMode) return;
		const module = this.allModules().find((item) => item.id === device.moduleId);
		if (!module?.setStatusLighting) throw new Error("Status lighting is unavailable.");
		await module.setStatusLighting(device, color);
	}
	dispose() {
		if (this.disposePromise) return this.disposePromise;
		this.disposed = true;
		this.started = false;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		const activeRefresh = this.refreshPromise;
		this.disposePromise = (async () => {
			if (activeRefresh) await activeRefresh;
			await Promise.all(this.allModules().map((module) => module.dispose?.()));
		})();
		return this.disposePromise;
	}
	async reconcileModuleState(moduleId, enabled) {
		if (this.refreshPromise) await this.refreshPromise;
		if (this.disposed) return;
		const snapshot = this.getSnapshot();
		const enabledIds = new Set(snapshot.modules.filter((module) => module.enabled).map((module) => module.id));
		this.syncDiscoveryTimer(this.allModules().some((module) => enabledIds.has(module.id)));
		const moduleState = snapshot.modules.find((module) => module.id === moduleId);
		const usesBundledFixtures = this.fixtureMode && moduleState?.source === "bundled";
		if (enabled) {
			if (usesBundledFixtures) {
				this.restoreFixtureModuleConnections(moduleId);
				return;
			}
			await this.refresh();
			return;
		}
		if (usesBundledFixtures) this.fixtureConnectionStates.set(moduleId, new Map(this.getSnapshot().devices.filter((device) => device.moduleId === moduleId).map((device) => [device.id, device.connected])));
		await this.allModules().find((candidate) => candidate.id === moduleId)?.deactivate?.();
		this.markModuleDevicesDisconnected(moduleId);
	}
	setFixtureControl(deviceId, change) {
		if (applyConfirmedLightingControl(this.getSnapshot(), deviceId, change, this.applyDevices)) return;
		const devices = structuredClone(this.getSnapshot().devices);
		const device = devices.find((candidate) => candidate.id === deviceId);
		if (!device) throw new Error("Fixture device not found.");
		if (change.type === "dpi" && device.capabilities.dpi) device.capabilities.dpi.activeDpi = change.value;
		if (change.type === "dpi-stages" && device.capabilities.dpi) device.capabilities.dpi.stages = change.stages;
		if (change.type === "dpi-shift" && device.capabilities.dpi) device.capabilities.dpi.shiftDpi = change.value;
		if (change.type === "report-rate" && device.capabilities.reportRate) device.capabilities.reportRate.value = change.value;
		if (change.type === "button-assignment" && device.capabilities.buttonAssignments) {
			const binding = device.capabilities.buttonAssignments.bindings.find((candidate) => candidate.buttonId === change.buttonId);
			if (binding) binding.currentActionId = change.actionId;
		}
		if (change.type === "onboard-memory" && device.capabilities.onboardMemory) {
			device.capabilities.onboardMemory.enabled = change.enabled;
			const profileMode = change.enabled ? "onboard" : "software";
			const unavailableReason = change.enabled ? "Stored onboard profiles are active. Turn off onboard memory to edit the software profile." : void 0;
			if (device.capabilities.dpi) Object.assign(device.capabilities.dpi, {
				profileMode,
				writable: !change.enabled,
				unavailableReason
			});
			if (device.capabilities.reportRate) Object.assign(device.capabilities.reportRate, {
				profileMode,
				writable: !change.enabled,
				unavailableReason
			});
			if (device.capabilities.buttonAssignments) Object.assign(device.capabilities.buttonAssignments, {
				profileMode,
				writable: !change.enabled,
				unavailableReason
			});
			if (device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
				profileMode,
				writable: !change.enabled,
				colorWritable: !change.enabled,
				brightnessWritable: !change.enabled,
				speedWritable: !change.enabled,
				directionWritable: !change.enabled && device.capabilities.lighting.directionWritable,
				zones: device.capabilities.lighting.zones?.map((zone) => ({
					...zone,
					colorWritable: !change.enabled
				})),
				unavailableReason
			});
		}
		if (change.type === "keyboard-gaming-mode" && device.capabilities.keyboard?.gamingMode) device.capabilities.keyboard.gamingMode.enabled = change.enabled;
		if (change.type === "keyboard-onboard-profile" && device.capabilities.keyboard?.onboardProfiles) {
			const profile = device.capabilities.keyboard.onboardProfiles.profiles.find((candidate) => candidate.id === change.profileId);
			if (!profile) throw new Error("Fixture onboard profile not found.");
			device.capabilities.keyboard.onboardProfiles.activeProfileId = profile.id;
		}
		if (change.type === "keyboard-rapid-trigger" && device.capabilities.keyboard?.rapidTrigger?.writable) device.capabilities.keyboard.rapidTrigger.enabled = change.enabled;
		if (change.type === "keyboard-snap-tap" && device.capabilities.keyboard?.snapTap?.writable) device.capabilities.keyboard.snapTap.enabled = change.enabled;
		this.applyDevices(devices);
	}
	async discover() {
		if (this.disposed) return;
		const snapshot = this.getSnapshot();
		const enabledModuleIds = new Set(snapshot.modules.filter((module) => module.enabled).map((module) => module.id));
		const modules = this.allModules();
		const activeModules = modules.filter((module) => enabledModuleIds.has(module.id));
		this.syncDiscoveryTimer(activeModules.length > 0);
		const hidDevices = activeModules.length > 0 ? await debugDiagnostics.measureAsync("devices.hid-enumeration", () => this.enumerateHidDevices()) : [];
		if (this.disposed) return;
		await Promise.all(modules.filter((module) => !enabledModuleIds.has(module.id)).map((module) => module.deactivate?.()));
		const groups = await Promise.all(activeModules.map((module) => debugDiagnostics.measureAsync(`devices.discover:${module.id}`, () => module.discover({
			hidDevices,
			previousDevices: snapshot.devices,
			appearanceOverrides: snapshot.settings.deviceAppearanceOverrides,
			mouseBatteryLighting: snapshot.settings.mouseBatteryLighting
		}))));
		if (this.disposed) return;
		const connected = groups.flat().map((device) => mergeDeviceSettings(device, snapshot.devices));
		const connectedIds = new Set(connected.map((device) => device.id));
		const moduleIds = new Set(snapshot.modules.map((module) => module.id));
		const disconnected = snapshot.devices.filter((device) => moduleIds.has(device.moduleId) && !legacyFixtureIds.has(device.id) && !connectedIds.has(device.id) && !connected.some((candidate) => candidate.moduleId === device.moduleId && candidate.identity.model === device.identity.model)).map((device) => ({
			...device,
			connected: false
		}));
		const unmanaged = snapshot.devices.filter((device) => !moduleIds.has(device.moduleId));
		const next = [
			...connected,
			...disconnected,
			...unmanaged
		].sort((left, right) => {
			if (left.connected !== right.connected) return left.connected ? -1 : 1;
			return left.displayName.localeCompare(right.displayName);
		});
		if (JSON.stringify(next) !== JSON.stringify(snapshot.devices)) this.applyDevices(next);
	}
	enumerateHidDevices() {
		if (!this.enumerationPromise) {
			const trackedEnumeration = this.listHidDevices().finally(() => {
				if (this.enumerationPromise === trackedEnumeration) this.enumerationPromise = null;
			});
			this.enumerationPromise = trackedEnumeration;
		}
		return withTimeout$1(this.enumerationPromise, this.enumerationTimeoutMs, "HID device enumeration timed out.");
	}
	applyModuleDevices(moduleId, published, persist) {
		if (this.disposed) return;
		const snapshot = this.getSnapshot();
		if (!snapshot.modules.some((module) => module.id === moduleId && module.enabled)) {
			this.markModuleDevicesDisconnected(moduleId);
			return;
		}
		const next = [...published.map((device) => mergeDeviceSettings(device, snapshot.devices)), ...snapshot.devices.filter((device) => device.moduleId !== moduleId)].sort((left, right) => {
			if (left.connected !== right.connected) return left.connected ? -1 : 1;
			return left.displayName.localeCompare(right.displayName);
		});
		if (JSON.stringify(next) !== JSON.stringify(snapshot.devices)) this.applyDevices(next, { persist });
	}
	removeModuleDevices(moduleId) {
		const devices = this.getSnapshot().devices.filter((device) => device.moduleId !== moduleId);
		this.applyDevices(devices);
	}
	markModuleDevicesDisconnected(moduleId) {
		const snapshot = this.getSnapshot();
		let changed = false;
		const devices = snapshot.devices.map((device) => {
			if (device.moduleId !== moduleId || !device.connected) return device;
			changed = true;
			return {
				...device,
				connected: false
			};
		});
		if (changed) this.applyDevices(devices);
	}
	restoreFixtureModuleConnections(moduleId) {
		const connectionStates = this.fixtureConnectionStates.get(moduleId);
		if (!connectionStates) return;
		this.fixtureConnectionStates.delete(moduleId);
		const snapshot = this.getSnapshot();
		let changed = false;
		const devices = snapshot.devices.map((device) => {
			const connected = connectionStates.get(device.id);
			if (device.moduleId !== moduleId || connected === void 0 || connected === device.connected) return device;
			changed = true;
			return {
				...device,
				connected
			};
		});
		if (changed) this.applyDevices(devices);
	}
	allModules() {
		const modules = [...this.modules, ...this.additionalModules()];
		return [...new Map(modules.map((module) => [module.id, module])).values()];
	}
};
function selectHidDeviceEnumerator(platform, windowsEnumerator, portableEnumerator) {
	return platform === "win32" ? windowsEnumerator : portableEnumerator;
}
function withTimeout$1(operation, milliseconds, message) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(message)), milliseconds);
	});
	return Promise.race([operation, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}
var lightingControlTypes = /* @__PURE__ */ new Set([
	"lighting-enabled",
	"lighting-color",
	"lighting-brightness",
	"lighting-effect",
	"lighting-speed",
	"lighting-direction",
	"lighting-zone-color",
	"lighting-profile",
	"microphone-mute-lighting"
]);
function applyConfirmedLightingControl(snapshot, deviceId, change, applyDevices) {
	if (!lightingControlTypes.has(change.type)) return false;
	const devices = structuredClone(snapshot.devices);
	const device = devices.find((candidate) => candidate.id === deviceId);
	if (!device) throw new Error("Device not found after the control write completed.");
	const lighting = device.capabilities.lighting;
	if (!lighting) throw new Error(`${device.displayName} no longer exposes lighting controls.`);
	if (change.type === "lighting-enabled") {
		lighting.enabled = change.enabled;
		setExistingSetting(device, "lightingEnabled", change.enabled);
	} else if (change.type === "lighting-color") {
		lighting.color = change.color.toLowerCase();
		lighting.enabled = true;
		if (!lighting.availableEffects.find((effect) => effect.id === lighting.activeEffectId)?.controls?.includes("color")) lighting.activeEffectId = lighting.availableEffects.find((effect) => effect.id === "static" || effect.id === "solid")?.id ?? lighting.activeEffectId;
		lighting.activeProfileId = "custom";
		setExistingSetting(device, "lightingColor", lighting.color);
	} else if (change.type === "lighting-brightness") {
		lighting.brightness = Math.round(change.brightness);
		lighting.activeProfileId = "custom";
		setExistingSetting(device, "lightingBrightness", lighting.brightness);
	} else if (change.type === "lighting-effect") {
		lighting.activeEffectId = change.effectId;
		lighting.enabled = true;
		lighting.activeProfileId = "custom";
		setExistingSetting(device, "lightingEffect", change.effectId);
	} else if (change.type === "lighting-speed") {
		lighting.speed = Math.round(change.speed);
		lighting.activeProfileId = "custom";
		setExistingSetting(device, "lightingSpeed", lighting.speed);
	} else if (change.type === "lighting-direction") {
		lighting.direction = change.direction;
		lighting.enabled = true;
	} else if (change.type === "lighting-zone-color") {
		const zone = lighting.zones?.find((candidate) => candidate.id === change.zoneId);
		if (!zone) throw new Error("The confirmed lighting zone is no longer available.");
		zone.color = change.color.toLowerCase();
		lighting.activeEffectId = lighting.availableEffects.some((effect) => effect.id === "static") ? "static" : lighting.activeEffectId;
		lighting.enabled = true;
	} else if (change.type === "lighting-profile") {
		const profile = lighting.profiles.find((candidate) => candidate.id === change.profileId);
		if (!profile) throw new Error("The confirmed lighting profile is no longer available.");
		Object.assign(lighting, {
			activeProfileId: profile.id,
			activeEffectId: profile.effectId,
			brightness: profile.brightness,
			speed: profile.speed
		});
		setExistingSetting(device, "lightingProfileId", profile.id);
		setExistingSetting(device, "lightingEffect", profile.effectId);
		setExistingSetting(device, "lightingBrightness", profile.brightness);
		setExistingSetting(device, "lightingSpeed", profile.speed);
	} else if (change.type === "microphone-mute-lighting") {
		lighting.muteLinked = change.enabled;
		setExistingSetting(device, "muteLed", change.enabled);
	}
	if (lighting.batteryLightingEnabled !== void 0) lighting.batteryLightingEnabled = lighting.enabled;
	syncLightingWritability(lighting);
	if (lighting.state !== "maintained") {
		lighting.state = "acknowledged";
		lighting.stateReason = "The device acknowledged the requested lighting change.";
	}
	applyDevices(devices);
	return true;
}
function applyConfirmedKeyboardControl(snapshot, deviceId, change, applyDevices) {
	if (![
		"keyboard-gaming-mode",
		"keyboard-onboard-profile",
		"keyboard-rapid-trigger",
		"keyboard-snap-tap"
	].includes(change.type)) return false;
	const devices = structuredClone(snapshot.devices);
	const device = devices.find((candidate) => candidate.id === deviceId);
	if (!device?.capabilities.keyboard) throw new Error("Keyboard state is no longer available after the control write completed.");
	const keyboard = device.capabilities.keyboard;
	if (change.type === "keyboard-gaming-mode" && keyboard.gamingMode) keyboard.gamingMode.enabled = change.enabled;
	else if (change.type === "keyboard-onboard-profile" && keyboard.onboardProfiles) {
		if (!keyboard.onboardProfiles.profiles.some((profile) => profile.id === change.profileId)) throw new Error("The confirmed onboard profile is no longer reported by this keyboard.");
		keyboard.onboardProfiles.activeProfileId = change.profileId;
	} else if (change.type === "keyboard-rapid-trigger" && keyboard.rapidTrigger?.writable) keyboard.rapidTrigger.enabled = change.enabled;
	else if (change.type === "keyboard-snap-tap" && keyboard.snapTap?.writable) keyboard.snapTap.enabled = change.enabled;
	else throw new Error("The confirmed keyboard control is no longer available.");
	applyDevices(devices);
	return true;
}
function syncLightingWritability(lighting) {
	if (!lighting) return;
	const effect = lighting.availableEffects.find((candidate) => candidate.id === lighting.activeEffectId);
	if (!effect?.controls) return;
	lighting.colorWritable = lighting.writable && effect.controls.includes("color");
	lighting.brightnessWritable = lighting.writable && effect.controls.includes("brightness");
	lighting.speedWritable = lighting.writable && effect.controls.includes("speed");
	lighting.directionWritable = lighting.writable && effect.controls.includes("direction");
	if (lighting.zones) {
		const writable = lighting.writable && effect.controls.includes("zones");
		lighting.zones = lighting.zones.map((zone) => ({
			...zone,
			colorWritable: writable
		}));
	}
}
function setExistingSetting(device, key, value) {
	if (Object.hasOwn(device.settings, key)) device.settings[key] = value;
}
function mergeDeviceSettings(device, previousDevices) {
	const previous = previousDevices.find((candidate) => candidate.id === device.id) ?? previousDevices.find((candidate) => candidate.moduleId === device.moduleId && candidate.identity.model === device.identity.model);
	return previous ? {
		...device,
		settings: {
			...previous.settings,
			...device.settings
		}
	} : device;
}
//#endregion
//#region src/main/services/engine-supervisor.ts
var workerMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("status"),
		status: engineStatusSchema
	}),
	z.object({
		type: z.literal("response"),
		requestId: z.string().min(1),
		result: z.unknown().optional(),
		error: z.string().optional()
	}),
	z.object({
		type: z.literal("meters"),
		frame: audioMeterFrameSchema
	}),
	z.object({
		type: z.literal("event"),
		event: z.string().min(1),
		payload: z.unknown().optional()
	})
]);
var EngineSupervisor = class {
	onStatus;
	onAudioMeters;
	onEvent;
	processes = /* @__PURE__ */ new Map();
	statuses = /* @__PURE__ */ new Map();
	pending = /* @__PURE__ */ new Map();
	starts = /* @__PURE__ */ new Map();
	expectedStops = /* @__PURE__ */ new Set();
	lastStderr = /* @__PURE__ */ new Map();
	constructor(onStatus, onAudioMeters = () => void 0, onEvent = () => void 0) {
		this.onStatus = onStatus;
		this.onAudioMeters = onAudioMeters;
		this.onEvent = onEvent;
		for (const kind of engineKindSchema.options) this.statuses.set(kind, this.stoppedStatus(kind));
	}
	getStatus(kind) {
		return structuredClone(this.statuses.get(kind) ?? this.stoppedStatus(kind));
	}
	hasLiveProcess(kind) {
		const worker = this.processes.get(kind);
		return Boolean(worker?.pid && worker.exitCode === null && worker.signalCode === null);
	}
	start(kind) {
		if (this.processes.get(kind)?.pid) return Promise.resolve(this.getStatus(kind));
		const inFlight = this.starts.get(kind);
		if (inFlight) return inFlight;
		const operation = this.startProcess(kind).finally(() => {
			this.starts.delete(kind);
		});
		this.starts.set(kind, operation);
		return operation;
	}
	async stop(kind) {
		const inFlight = this.starts.get(kind);
		if (inFlight) try {
			await inFlight;
		} catch {}
		const worker = this.processes.get(kind);
		if (!worker) {
			const stopped = this.stoppedStatus(kind);
			this.updateStatus(stopped);
			return stopped;
		}
		this.expectedStops.add(kind);
		try {
			const exit = this.waitForExit(worker, kind === "capture" ? 12e3 : 5e3);
			this.sendEnvelope(worker, { command: "shutdown" });
			if (!await exit) {
				worker.kill();
				if (!await this.waitForExit(worker, 2e3)) throw new Error(`${kind} engine did not exit after termination.`);
			}
		} catch (error) {
			this.expectedStops.delete(kind);
			throw error;
		} finally {
			this.processes.delete(kind);
			this.failPending(kind, /* @__PURE__ */ new Error(`${kind} engine stopped`));
		}
		const stopped = this.stoppedStatus(kind);
		this.updateStatus(stopped);
		return stopped;
	}
	send(kind, command, payload) {
		const worker = this.processes.get(kind);
		if (!worker?.pid) return;
		if (command !== "setMeterDemand") developerDiagnostics.record(kind, "debug", "host.send", { command });
		debugDiagnostics.measure(`host.send:${kind}:${command}`, () => this.sendEnvelope(worker, {
			command,
			payload
		}));
	}
	request(kind, command, payload, timeoutMs = 1e4) {
		if (!developerDiagnostics.enabled) return debugDiagnostics.measureAsync(`host.request:${kind}:${command}`, () => this.requestUnmeasured(kind, command, payload, timeoutMs));
		return debugDiagnostics.measureAsync(`host.request:${kind}:${command}`, async () => {
			const started = performance.now();
			const recording = developerDiagnostics.recordingId;
			const request = randomUUID();
			developerDiagnostics.record(kind, "debug", "host.request", {
				command,
				request,
				timeoutMs
			});
			try {
				const result = await this.requestUnmeasured(kind, command, payload, timeoutMs);
				if (recording === developerDiagnostics.recordingId) developerDiagnostics.record(kind, "debug", "host.response", {
					command,
					request,
					elapsedMs: performance.now() - started
				});
				return result;
			} catch (error) {
				if (recording === developerDiagnostics.recordingId) developerDiagnostics.record(kind, "error", "host.request-failed", {
					command,
					request,
					elapsedMs: performance.now() - started,
					error: String(error).slice(0, 4096)
				});
				throw error;
			}
		});
	}
	async syncDeveloperDiagnostics() {
		const worker = this.processes.get("capture");
		if (worker?.pid && worker.exitCode === null && worker.signalCode === null) await this.request("capture", "setDiagnostics", nativeDiagnosticsInputSchema.parse({ enabled: developerDiagnostics.enabled }));
	}
	requestUnmeasured(kind, command, payload, timeoutMs) {
		const worker = this.processes.get(kind);
		if (!worker?.pid || worker.exitCode !== null || worker.signalCode !== null) {
			const detail = this.describeUnavailable(kind);
			return Promise.reject(/* @__PURE__ */ new Error(`${kind} engine is not running${detail}`));
		}
		const requestId = randomUUID();
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(requestId);
				reject(/* @__PURE__ */ new Error(`${kind} engine request timed out: ${command}`));
			}, timeoutMs);
			this.pending.set(requestId, {
				kind,
				resolve: (value) => resolve(value),
				reject,
				timeout
			});
			try {
				this.sendEnvelope(worker, {
					requestId,
					command,
					payload
				});
			} catch (error) {
				clearTimeout(timeout);
				this.pending.delete(requestId);
				const detail = error instanceof Error ? `: ${error.message}` : "";
				reject(/* @__PURE__ */ new Error(`${kind} engine could not accept ${command}${detail}`));
			}
		});
	}
	async dispose() {
		await Promise.allSettled(engineKindSchema.options.map((kind) => this.stop(kind)));
		for (const request of this.pending.values()) {
			clearTimeout(request.timeout);
			request.reject(/* @__PURE__ */ new Error("Engine supervisor disposed"));
		}
		this.pending.clear();
	}
	async startProcess(kind) {
		this.lastStderr.delete(kind);
		this.updateStatus({
			...this.stoppedStatus(kind),
			state: "starting",
			message: "Starting isolated engine host…"
		});
		let worker;
		try {
			worker = kind === "capture" ? this.spawnCaptureHost() : this.spawnAudioHost();
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			this.updateStatus({
				...this.stoppedStatus(kind),
				state: "error",
				message: normalized.message
			});
			throw normalized;
		}
		this.processes.set(kind, worker);
		this.attachWorkerListeners(kind, worker);
		try {
			await this.waitForSpawn(worker, 8e3);
			return this.getStatus(kind);
		} catch (error) {
			const normalized = error instanceof Error ? error : new Error(String(error));
			this.processes.delete(kind);
			this.failPending(kind, normalized);
			worker.kill();
			this.updateStatus({
				...this.stoppedStatus(kind),
				state: "error",
				message: normalized.message
			});
			throw normalized;
		}
	}
	spawnCaptureHost() {
		const resolved = this.resolveCaptureHost();
		const environment = { ...process.env };
		delete environment.ELECTRON_RUN_AS_NODE;
		environment.SWITCHBOARD_DEVELOPER_DIAGNOSTICS = developerDiagnostics.enabled ? "1" : "0";
		developerDiagnostics.record("capture", "info", "host.spawn", { packaged: app.isPackaged });
		return spawn(resolved.command, resolved.arguments, {
			cwd: app.isPackaged ? join(process.resourcesPath, "capture-host") : app.getAppPath(),
			env: environment,
			windowsHide: true,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
	}
	spawnAudioHost() {
		const resolved = this.resolveAudioHost();
		const environment = { ...process.env };
		delete environment.ELECTRON_RUN_AS_NODE;
		developerDiagnostics.record("audio", "info", "host.spawn", { packaged: app.isPackaged });
		return spawn(resolved.command, resolved.arguments, {
			cwd: app.isPackaged ? join(process.resourcesPath, "audio-host") : app.getAppPath(),
			env: environment,
			windowsHide: true,
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			]
		});
	}
	attachWorkerListeners(kind, worker) {
		createInterface({ input: worker.stdout }).on("line", (line) => {
			try {
				this.handleWorkerMessage(kind, JSON.parse(line));
			} catch (error) {
				developerDiagnostics.record(kind, "error", "host.invalid-json", { error: String(error).slice(0, 4096) });
				console.warn(`[${kind}] ignored malformed host output`, error);
			}
		});
		worker.stderr.on("data", (chunk) => {
			const message = String(chunk).trim();
			if (message) {
				developerDiagnostics.record(kind, "warning", "host.stderr", { message: message.slice(-4096) });
				const previous = this.lastStderr.get(kind) ?? "";
				this.lastStderr.set(kind, `${previous}${previous ? "\n" : ""}${message}`.slice(-4096));
				console.warn(`[${kind}] ${message}`);
			}
		});
		worker.stdin.on("error", (streamError) => {
			developerDiagnostics.record(kind, "error", "host.stdin-error", { error: streamError.message.slice(0, 4096) });
			console.warn(`[${kind}] engine stdin error`, streamError);
		});
		worker.on("error", (processError) => this.handleProcessError(kind, processError));
		worker.on("exit", (code, signal) => {
			if (this.processes.get(kind) === worker) this.processes.delete(kind);
			const expected = this.expectedStops.delete(kind);
			developerDiagnostics.record(kind, expected ? "info" : "error", "host.exit", {
				code,
				signal,
				expected,
				pid: worker.pid ?? null
			});
			const stderrTail = (this.lastStderr.get(kind) ?? "").trim().split("\n").slice(-3).join(" ").slice(0, 240);
			const exitDetail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
			const detail = stderrTail ? ` (${exitDetail}; ${stderrTail})` : ` (${exitDetail})`;
			this.failPending(kind, /* @__PURE__ */ new Error(`${kind} engine exited${detail}`));
			this.updateStatus({
				...this.stoppedStatus(kind),
				state: expected || code === 0 ? "stopped" : "error",
				message: expected || code === 0 ? void 0 : `Engine exited with ${exitDetail}${stderrTail ? `: ${stderrTail}` : ""}`
			});
			if (expected) this.lastStderr.delete(kind);
		});
	}
	handleProcessError(kind, error) {
		developerDiagnostics.record(kind, "error", "host.process-error", { error: error.message.slice(0, 4096) });
		this.failPending(kind, error);
		this.updateStatus({
			...this.stoppedStatus(kind),
			state: "error",
			message: error.message
		});
	}
	handleWorkerMessage(kind, raw) {
		const parsed = workerMessageSchema.safeParse(raw);
		if (!parsed.success) {
			developerDiagnostics.record(kind, "error", "host.invalid-message", { issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).join(", ").slice(0, 4096) });
			console.warn(`[${kind}] ignored malformed worker message`, parsed.error);
			return;
		}
		const message = parsed.data;
		if (message.type === "status") {
			if (message.status.kind !== kind) {
				console.warn(`[${kind}] ignored status for ${message.status.kind}`);
				return;
			}
			this.updateStatus(message.status);
			return;
		}
		if (message.type === "meters") {
			if (kind === "audio") this.onAudioMeters(message.frame);
			return;
		}
		if (message.type === "event") {
			if (message.event === "captureDiagnostic" && kind === "capture") {
				developerDiagnostics.receive("capture", message.payload);
				return;
			}
			this.onEvent(kind, message.event, message.payload);
			return;
		}
		const request = this.pending.get(message.requestId);
		if (!request || request.kind !== kind) return;
		clearTimeout(request.timeout);
		this.pending.delete(message.requestId);
		if (message.error) request.reject(new Error(message.error));
		else request.resolve(message.result);
	}
	failPending(kind, error) {
		for (const [requestId, request] of this.pending.entries()) {
			if (request.kind !== kind) continue;
			clearTimeout(request.timeout);
			request.reject(error);
			this.pending.delete(requestId);
		}
	}
	describeUnavailable(kind) {
		const status = this.statuses.get(kind);
		if (status?.message) return `: ${status.message}`;
		const stderrTail = (this.lastStderr.get(kind) ?? "").trim().split("\n").slice(-1)[0]?.slice(0, 240);
		return stderrTail ? `: ${stderrTail}` : "";
	}
	sendEnvelope(worker, message) {
		if (worker.exitCode !== null || worker.signalCode !== null) throw new Error("engine process already exited");
		if (!worker.stdin.write(`${JSON.stringify(message)}\n`, "utf8")) console.warn("[engine] stdin buffer full when sending", message.command ?? "unknown command");
	}
	waitForSpawn(worker, timeoutMs) {
		if (worker.pid) return Promise.resolve();
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				cleanup();
				reject(/* @__PURE__ */ new Error("Engine process did not spawn before the timeout."));
			}, timeoutMs);
			const onSpawn = () => {
				cleanup();
				resolve();
			};
			const onError = (...details) => {
				cleanup();
				reject(new Error(details.map(String).join(" ")));
			};
			const onExit = (code) => {
				cleanup();
				reject(/* @__PURE__ */ new Error(`Engine exited during startup with code ${code}`));
			};
			const cleanup = () => {
				clearTimeout(timeout);
				const emitter = worker;
				emitter.removeListener("spawn", onSpawn);
				emitter.removeListener("error", onError);
				emitter.removeListener("exit", onExit);
			};
			const emitter = worker;
			emitter.once("spawn", onSpawn);
			emitter.once("error", onError);
			emitter.once("exit", onExit);
		});
	}
	waitForExit(worker, timeoutMs) {
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				worker.removeListener("exit", onExit);
				resolve(false);
			}, timeoutMs);
			const onExit = () => {
				clearTimeout(timeout);
				resolve(true);
			};
			worker.once("exit", onExit);
		});
	}
	resolveCaptureHost() {
		if (app.isPackaged) {
			const executable = join(process.resourcesPath, "capture-host", "Capture.Host.exe");
			if (!existsSync(executable)) throw new Error("The Capture.Host executable is missing from this installation.");
			return {
				command: executable,
				arguments: []
			};
		}
		const configuredExecutable = process.env.SWITCHBOARD_DEVELOPMENT_CAPTURE_HOST;
		if (configuredExecutable && existsSync(configuredExecutable)) return {
			command: configuredExecutable,
			arguments: []
		};
		const executable = join(app.getAppPath(), "engines", "capture-host", "bin", "Debug", "net10.0-windows", "Capture.Host.exe");
		if (existsSync(executable)) return {
			command: executable,
			arguments: []
		};
		return {
			command: "dotnet",
			arguments: [
				"run",
				"--project",
				join(app.getAppPath(), "engines", "capture-host", "Capture.Host.csproj"),
				"--no-launch-profile"
			]
		};
	}
	resolveAudioHost() {
		if (app.isPackaged) {
			const executable = join(process.resourcesPath, "audio-host", "Audio.Host.exe");
			if (!existsSync(executable)) throw new Error("The Audio.Host executable is missing from this installation.");
			return {
				command: executable,
				arguments: []
			};
		}
		if (process.env.SWITCHBOARD_NATIVE_REVIEW === "1") {
			const reviewExecutable = process.env.SWITCHBOARD_NATIVE_REVIEW_AUDIO_HOST;
			if (reviewExecutable && existsSync(reviewExecutable)) return {
				command: reviewExecutable,
				arguments: []
			};
		}
		const configuredExecutable = process.env.SWITCHBOARD_DEVELOPMENT_AUDIO_HOST;
		if (configuredExecutable && existsSync(configuredExecutable)) return {
			command: configuredExecutable,
			arguments: []
		};
		const executable = join(app.getAppPath(), "engines", "audio-host", "bin", "Debug", "net10.0-windows", "Audio.Host.exe");
		if (existsSync(executable)) return {
			command: executable,
			arguments: []
		};
		return {
			command: "dotnet",
			arguments: [
				"run",
				"--project",
				join(app.getAppPath(), "engines", "audio-host", "Audio.Host.csproj"),
				"--no-launch-profile"
			]
		};
	}
	updateStatus(status) {
		const normalized = engineStatusSchema.parse({
			...status,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		});
		const previous = this.statuses.get(status.kind);
		if (previous?.state !== normalized.state || previous?.message !== normalized.message || previous?.pid !== normalized.pid) developerDiagnostics.record(status.kind, normalized.state === "error" ? "error" : "info", "host.state", {
			state: normalized.state,
			previousState: previous?.state ?? null,
			pid: normalized.pid ?? null,
			message: normalized.message?.slice(0, 4096) ?? null
		});
		this.statuses.set(status.kind, normalized);
		this.onStatus(structuredClone(normalized));
	}
	stoppedStatus(kind) {
		return {
			kind,
			state: "stopped",
			cpuPercent: 0,
			memoryMb: 0,
			uptimeSeconds: 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		};
	}
};
//#endregion
//#region src/main/services/game-discovery.ts
var execFileAsync = promisify(execFile);
var GameDiscoveryService = class {
	environment;
	steamRoots;
	epicManifestDirectories;
	queryRegistry;
	extractExecutableIcon;
	constructor(options = {}) {
		this.environment = options.environment ?? process.env;
		this.steamRoots = options.steamRoots ?? readPathList(this.environment.SWITCHBOARD_GAME_SCAN_STEAM_ROOTS);
		this.epicManifestDirectories = options.epicManifestDirectories ?? readPathList(this.environment.SWITCHBOARD_GAME_SCAN_EPIC_MANIFESTS);
		this.queryRegistry = options.queryRegistry ?? (process.platform === "win32" && this.environment.SWITCHBOARD_NATIVE_FIXTURES !== "1");
		this.extractExecutableIcon = options.extractExecutableIcon;
	}
	async scan() {
		const warnings = [];
		const [steamGames, epicGames] = await Promise.all([this.scanSteam(warnings), this.scanEpic(warnings)]);
		const games = deduplicateGames([...steamGames, ...epicGames]);
		games.sort((left, right) => left.name.localeCompare(right.name, void 0, { sensitivity: "base" }));
		return {
			games,
			warnings
		};
	}
	async fromExecutable(executablePath) {
		const resolvedPath = resolve(executablePath);
		if (extname(resolvedPath).toLocaleLowerCase() !== ".exe") throw new Error("Choose a Windows game executable (.exe).");
		if (!(await stat(resolvedPath)).isFile()) throw new Error("The selected game executable is not a file.");
		const name = basename(resolvedPath, extname(resolvedPath)).trim();
		if (!name) throw new Error("The selected executable does not have a usable game name.");
		return createGame({
			name,
			source: "manual",
			installDirectory: dirname(resolvedPath),
			executablePath: resolvedPath,
			launchUri: null,
			iconDataUrl: await this.readExecutableIcon(resolvedPath)
		});
	}
	async scanSteam(warnings) {
		const roots = this.steamRoots ? [...this.steamRoots] : await this.findSteamRoots();
		const libraries = /* @__PURE__ */ new Set();
		for (const root of roots) {
			if (!await directoryExists(root)) continue;
			libraries.add(resolve(root));
			const libraryFile = join(root, "steamapps", "libraryfolders.vdf");
			try {
				const contents = await readFile(libraryFile, "utf8");
				for (const path of parseSteamLibraryPaths(contents)) libraries.add(resolve(path));
			} catch (error) {
				if (!isMissing(error)) warnings.push(`Steam libraries could not be read from ${root}.`);
			}
		}
		const games = [];
		for (const library of libraries) {
			const steamApps = join(library, "steamapps");
			let manifests;
			try {
				manifests = (await readdir(steamApps)).filter((entry) => /^appmanifest_\d+\.acf$/i.test(entry));
			} catch (error) {
				if (!isMissing(error)) warnings.push(`A Steam library could not be scanned at ${library}.`);
				continue;
			}
			for (const manifest of manifests) try {
				const contents = await readFile(join(steamApps, manifest), "utf8");
				const name = readVdfString(contents, "name");
				const installFolder = readVdfString(contents, "installdir");
				const appId = manifest.match(/appmanifest_(\d+)\.acf/i)?.[1];
				if (!name || !installFolder || !appId) continue;
				const installDirectory = join(steamApps, "common", installFolder);
				if (!await directoryExists(installDirectory)) continue;
				games.push(createGame({
					name,
					source: "steam",
					installDirectory,
					executablePath: null,
					launchUri: `steam://rungameid/${appId}`,
					iconDataUrl: await readSteamIconDataUrl([...roots, ...libraries], appId)
				}));
			} catch {
				warnings.push(`A Steam game manifest could not be read at ${join(steamApps, manifest)}.`);
			}
		}
		return games;
	}
	async scanEpic(warnings) {
		const manifestDirectories = this.epicManifestDirectories ? [...this.epicManifestDirectories] : this.defaultEpicManifestDirectories();
		const games = [];
		for (const manifestDirectory of manifestDirectories) {
			let manifests;
			try {
				manifests = (await readdir(manifestDirectory)).filter((entry) => entry.toLocaleLowerCase().endsWith(".item"));
			} catch (error) {
				if (!isMissing(error)) warnings.push(`Epic Games manifests could not be read from ${manifestDirectory}.`);
				continue;
			}
			for (const manifest of manifests) try {
				const value = JSON.parse(await readFile(join(manifestDirectory, manifest), "utf8"));
				const name = typeof value.DisplayName === "string" ? value.DisplayName.trim() : "";
				const installDirectory = typeof value.InstallLocation === "string" ? value.InstallLocation.trim() : "";
				const executable = typeof value.LaunchExecutable === "string" ? value.LaunchExecutable.trim() : "";
				if (!name || !installDirectory || !await directoryExists(installDirectory)) continue;
				const executablePath = executable ? isAbsolute(executable) ? executable : join(installDirectory, executable) : null;
				const appName = typeof value.AppName === "string" ? value.AppName.trim() : "";
				games.push(createGame({
					name,
					source: "epic",
					installDirectory,
					executablePath,
					launchUri: appName ? `com.epicgames.launcher://apps/${encodeURIComponent(appName)}?action=launch` : null,
					iconDataUrl: executablePath ? await this.readExecutableIcon(executablePath) : void 0
				}));
			} catch {
				warnings.push(`An Epic Games manifest could not be read at ${join(manifestDirectory, manifest)}.`);
			}
		}
		return games;
	}
	async findSteamRoots() {
		const roots = /* @__PURE__ */ new Set();
		const programFilesX86 = readEnvironment(this.environment, "PROGRAMFILES(X86)");
		const programFiles = readEnvironment(this.environment, "PROGRAMFILES");
		if (programFilesX86) roots.add(join(programFilesX86, "Steam"));
		if (programFiles) roots.add(join(programFiles, "Steam"));
		if (this.queryRegistry) {
			const [currentUser, localMachine] = await Promise.all([readRegistryString("HKCU\\Software\\Valve\\Steam", "SteamPath"), readRegistryString("HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "InstallPath")]);
			if (currentUser) roots.add(currentUser);
			if (localMachine) roots.add(localMachine);
		}
		return [...roots];
	}
	defaultEpicManifestDirectories() {
		const programData = readEnvironment(this.environment, "PROGRAMDATA");
		return programData ? [join(programData, "Epic", "EpicGamesLauncher", "Data", "Manifests")] : [];
	}
	async readExecutableIcon(executablePath) {
		if (!this.extractExecutableIcon) return void 0;
		try {
			return await this.extractExecutableIcon(executablePath);
		} catch {
			return;
		}
	}
};
function gameIdentityKey(game) {
	return (game.executablePath ?? game.installDirectory ?? game.launchUri ?? "").replace(/[\\/]+$/, "").toLocaleLowerCase();
}
function createGame(input) {
	const identity = gameIdentityKey(input);
	return {
		...input,
		id: `game-${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`,
		addedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
function deduplicateGames(games) {
	const byIdentity = /* @__PURE__ */ new Map();
	for (const game of games) {
		const key = gameIdentityKey(game);
		if (!byIdentity.has(key)) byIdentity.set(key, game);
	}
	return [...byIdentity.values()];
}
async function readSteamIconDataUrl(roots, appId) {
	const visited = /* @__PURE__ */ new Set();
	for (const root of roots) {
		const iconDirectory = join(root, "appcache", "librarycache", appId);
		const normalizedDirectory = resolve(iconDirectory).toLocaleLowerCase();
		if (visited.has(normalizedDirectory)) continue;
		visited.add(normalizedDirectory);
		try {
			const iconFile = (await readdir(iconDirectory)).filter((entry) => /^[a-f0-9]{40}\.(?:jpe?g|png)$/i.test(entry)).sort((left, right) => left.localeCompare(right, void 0, { sensitivity: "base" }))[0];
			if (!iconFile) continue;
			const iconPath = join(iconDirectory, iconFile);
			const file = await stat(iconPath);
			if (!file.isFile() || file.size > 196e3) continue;
			return `data:${/\.png$/i.test(iconFile) ? "image/png" : "image/jpeg"};base64,${(await readFile(iconPath)).toString("base64")}`;
		} catch {}
	}
}
function parseSteamLibraryPaths(contents) {
	const paths = [];
	for (const match of contents.matchAll(/"path"\s+"((?:\\.|[^"])*)"/gi)) {
		const path = match[1]?.replace(/\\\\/g, "\\").replace(/\\"/g, "\"").trim();
		if (path) paths.push(path);
	}
	return paths;
}
function readVdfString(contents, key) {
	const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return contents.match(new RegExp(`"${escapedKey}"\\s+"((?:\\\\.|[^"])*)"`, "i"))?.[1]?.replace(/\\\\/g, "\\").replace(/\\"/g, "\"").trim() || null;
}
async function readRegistryString(key, valueName) {
	try {
		const { stdout } = await execFileAsync("reg.exe", [
			"query",
			key,
			"/v",
			valueName
		], {
			encoding: "utf8",
			timeout: 3e3,
			windowsHide: true
		});
		return stdout.split(/\r?\n/).find((candidate) => candidate.toLocaleLowerCase().includes(valueName.toLocaleLowerCase()))?.match(/REG_SZ\s+(.+)$/i)?.[1]?.trim() ?? null;
	} catch {
		return null;
	}
}
async function directoryExists(path) {
	try {
		await access(path);
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}
function readEnvironment(environment, name) {
	return Object.entries(environment).find(([key]) => key.toLocaleUpperCase() === name.toLocaleUpperCase())?.[1];
}
function readPathList(value) {
	if (!value) return void 0;
	const paths = value.split(delimiter).map((path) => path.trim()).filter(Boolean);
	return paths.length > 0 ? paths : void 0;
}
function isMissing(error) {
	return error.code === "ENOENT";
}
//#endregion
//#region src/shared/feedback-report.ts
function buildFeedbackReportMarkdown(input, environment) {
	const isBug = input.kind === "bug";
	const sections = [`## ${isBug ? "Bug description" : input.kind === "feature" ? "Requested capability" : "Feedback"}`, input.description.trim()];
	const supportingDetails = input.supportingDetails?.trim();
	if (supportingDetails) sections.push(`## ${isBug ? "Steps to reproduce" : "Additional details"}`, supportingDetails);
	if (input.includeDiagnostics && environment) sections.push("## Environment", [
		`- Switchboard: ${environment.version}${environment.prototypeMode ? " (prototype mode)" : ""}`,
		`- Runtime: ${environment.runtime}`,
		`- Platform: ${environment.platform}`
	].join("\n"));
	return sections.join("\n\n");
}
function buildFeedbackClipboardText(input, environment) {
	return `# [${input.kind === "bug" ? "Bug" : input.kind === "feature" ? "Feature" : "Feedback"}] ${input.title.trim()}\n\n${buildFeedbackReportMarkdown(input, environment)}`;
}
//#endregion
//#region src/main/services/feedback-submission.ts
var feedbackEndpoint = "https://frommeans.com/api/correspond";
var receiptSchema = z.object({ ok: z.literal(true) });
async function submitFeedbackReport(raw, environment, send = fetch) {
	const input = feedbackSubmissionInputSchema.parse(raw);
	try {
		const response = await send(feedbackEndpoint, {
			method: "POST",
			redirect: "error",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json"
			},
			body: JSON.stringify({
				name: "Switchboard feedback",
				email: input.email,
				message: buildFeedbackClipboardText(input, environment),
				website: ""
			}),
			signal: AbortSignal.timeout(15e3)
		});
		if (response.ok && receiptSchema.safeParse(await response.json()).success) return {
			submitted: true,
			message: "Feedback sent. Thank you for helping improve Switchboard."
		};
		return {
			submitted: false,
			message: response.status === 429 ? "Too many submissions. Wait a few minutes before trying again. Your draft is still here." : "The feedback service could not accept your message. Your draft is still here; try again later."
		};
	} catch {
		return {
			submitted: false,
			message: "Delivery could not be confirmed. Check your connection before trying again. Your draft is still here; retrying may send a duplicate."
		};
	}
}
//#endregion
//#region src/shared/workspace-profile.ts
var workspaceOrder = [
	"devices",
	"audio",
	"capture"
];
var defaultVisibleWorkspaces = [
	"devices",
	"audio",
	"capture"
];
function normalizeVisibleWorkspaces(value) {
	if (!Array.isArray(value)) return null;
	const selected = /* @__PURE__ */ new Set();
	for (const candidate of value) if (candidate === "devices" || candidate === "audio" || candidate === "capture") selected.add(candidate);
	selected.add("capture");
	return workspaceOrder.filter((workspace) => selected.has(workspace));
}
function migrateVisibleWorkspaces(value, legacyProfile) {
	if (legacyProfile === "clipping") return ["capture"];
	return normalizeVisibleWorkspaces(value) ?? [...defaultVisibleWorkspaces];
}
//#endregion
//#region src/shared/clip-review.ts
function latestClipCreatedAt(clips) {
	return clips.reduce((latest, clip) => Math.max(latest, clip.createdAt), 0);
}
//#endregion
//#region src/main/services/state-store.ts
var runtimeEngineKinds = ["audio", "capture"];
var StateStore = class {
	filePath;
	snapshot = createDefaultSnapshot();
	listeners = /* @__PURE__ */ new Set();
	persistChain = Promise.resolve();
	persistedPayload = null;
	constructor(filePath) {
		this.filePath = filePath;
	}
	async load() {
		let raw = null;
		try {
			raw = await readFile(this.filePath, "utf8");
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
		if (raw !== null) try {
			this.snapshot = this.resetRuntimeState(parsePersistedState(raw));
			this.persistedPayload = raw;
			return;
		} catch (error) {
			const preservedPath = `${this.filePath}.corrupt-${Date.now()}-${randomUUID()}`;
			await rename(this.filePath, preservedPath);
			console.warn("Switchboard state was invalid. The original file was preserved; trying the backup.", preservedPath, error);
		}
		try {
			const backup = await readFile(`${this.filePath}.bak`, "utf8");
			this.snapshot = this.resetRuntimeState(parsePersistedState(backup));
			this.persistedPayload = backup;
			await this.persist();
			console.warn("Switchboard state was recovered from its last valid backup.");
			return;
		} catch (error) {
			if (error.code !== "ENOENT") console.warn("Switchboard state backup could not be loaded. Defaults will be used.", error);
		}
		this.snapshot = createDefaultSnapshot();
		await this.persist();
	}
	get() {
		return debugDiagnostics.measure("state.clone", () => structuredClone(this.snapshot));
	}
	getDetailedDiagnosticsEnabled() {
		return this.snapshot.settings.developerMode === true && this.snapshot.settings.detailedDiagnostics;
	}
	getPerformanceGuardEnabled() {
		return this.snapshot.settings.performanceGuard;
	}
	update(mutator, options = {}) {
		const { persist = true, emit = true } = options;
		const next = debugDiagnostics.measure("state.clone-update", () => structuredClone(this.snapshot));
		mutator(next);
		this.snapshot = debugDiagnostics.measure("state.validate", () => systemSnapshotSchema.parse(next));
		if (emit) debugDiagnostics.measure("state.emit", () => this.emit());
		if (persist) this.persist();
		return this.get();
	}
	restore(snapshot) {
		const parsed = systemSnapshotSchema.parse(structuredClone(snapshot));
		this.snapshot = parsed;
		this.emit();
		this.persist();
		return this.get();
	}
	setPerformance(performance) {
		return this.update((draft) => {
			draft.performance = performance;
		}, { persist: false });
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	async flush() {
		await this.persistChain;
	}
	resetRuntimeState(snapshot) {
		const next = structuredClone(snapshot);
		const defaults = createDefaultSnapshot();
		next.diagnostics = structuredClone(defaults.diagnostics);
		const modulesById = new Map(next.modules.map((module) => [module.id, module]));
		const bundledModules = defaults.modules.map((fallback) => {
			const existing = modulesById.get(fallback.id);
			return existing ? {
				...structuredClone(fallback),
				enabled: existing.enabled
			} : structuredClone(fallback);
		});
		const localModules = next.modules.filter((module) => module.source === "local" && module.development).map((module) => ({
			...module,
			enabled: module.enabled,
			development: module.development ? {
				...module.development,
				status: "validating"
			} : void 0
		}));
		next.modules = [...bundledModules, ...localModules];
		next.audio.devices = [];
		next.audio.outputDevice = "";
		next.audio.microphoneDevice = "";
		const currentBuses = new Map(next.audio.buses.map((bus) => [bus.id, bus]));
		const legacyAux = currentBuses.get("aux");
		next.audio.buses = defaults.audio.buses.map((fallback) => {
			const existing = currentBuses.get(fallback.id) ?? (fallback.id === "mic" ? legacyAux : void 0);
			if (!existing) return structuredClone(fallback);
			return {
				...structuredClone(fallback),
				...existing,
				id: fallback.id,
				label: fallback.label,
				endpoint: fallback.endpoint,
				deviceId: existing.deviceId || fallback.deviceId
			};
		});
		const processingByBus = new Map(next.audio.channelProcessing.map((processing) => [processing.busId, processing]));
		next.audio.channelProcessing = defaults.audio.channelProcessing.map((fallback) => structuredClone(processingByBus.get(fallback.busId) ?? fallback));
		const knownPresets = new Map(next.audio.pathPresets.map((preset) => [preset.id, preset]));
		for (const preset of defaults.audio.pathPresets) if (!knownPresets.has(preset.id)) knownPresets.set(preset.id, structuredClone(preset));
		next.audio.pathPresets = [...knownPresets.values()];
		for (const kind of [
			"game",
			"chat",
			"media",
			"microphone"
		]) {
			const activeId = next.audio.activePresetIds[kind];
			if (activeId && !knownPresets.has(activeId)) next.audio.activePresetIds[kind] = null;
		}
		next.audio.capabilities = structuredClone(defaults.audio.capabilities);
		next.audio.host = null;
		if (next.audio.capabilities.applicationRouting === "unavailable") {
			next.audio.applications = [];
			for (const bus of next.audio.buses) bus.appCount = 0;
		} else {
			const applicationCounts = /* @__PURE__ */ new Map();
			for (const application of next.audio.applications) {
				if (!application.active) continue;
				applicationCounts.set(application.destination, (applicationCounts.get(application.destination) ?? 0) + 1);
			}
			for (const bus of next.audio.buses) bus.appCount = applicationCounts.get(bus.id) ?? 0;
		}
		next.prototypeMode = true;
		next.setup.runtime.desktopState = "disabled";
		next.setup.runtime.desktopError = null;
		next.setup.runtime.lightingState = "idle";
		next.setup.runtime.lightingMessage = "";
		if (next.setup.restore) {
			next.setup.runtime.state = "partial";
			next.setup.runtime.issues = ["A previous scene is saved. Restore it or apply a scene to continue."];
		} else {
			next.setup.runtime.state = "idle";
			next.setup.runtime.activeSceneId = null;
			next.setup.runtime.issues = [];
		}
		next.engines = runtimeEngineKinds.map((kind) => ({
			kind,
			state: "stopped",
			cpuPercent: 0,
			memoryMb: 0,
			uptimeSeconds: 0,
			updatedAt: (/* @__PURE__ */ new Date()).toISOString()
		}));
		next.capture.runtime = {
			...defaults.capture.runtime,
			shortcutRegistered: false,
			state: "stopped"
		};
		next.capture.autoCapture.runtime = structuredClone(defaults.capture.autoCapture.runtime);
		next.capture.autoCapture.providers = [];
		next.capture.storage.replayCacheBytes = 0;
		next.capture.sources = [];
		next.gameDetection.scanState = "idle";
		next.gameDetection.error = void 0;
		next.performance = structuredClone(defaults.performance);
		return systemSnapshotSchema.parse(next);
	}
	emit() {
		const snapshot = this.get();
		for (const listener of this.listeners) listener(snapshot);
	}
	persist() {
		const payload = debugDiagnostics.measure("state.serialize", () => JSON.stringify({
			...this.snapshot,
			performance: {
				...this.snapshot.performance,
				debug: void 0
			}
		}, null, 2));
		this.persistChain = this.persistChain.catch(() => void 0).then(async () => {
			await mkdir(dirname(this.filePath), { recursive: true });
			if (this.persistedPayload !== null) {
				const previousPayload = this.persistedPayload;
				await debugDiagnostics.measureAsync("state.backup-write", () => writeDurableState(`${this.filePath}.bak`, previousPayload));
			}
			await debugDiagnostics.measureAsync("state.disk-write", () => writeDurableState(this.filePath, payload));
			this.persistedPayload = payload;
		}).catch((error) => {
			console.error("Failed to persist Switchboard state.", error);
		});
		return this.persistChain;
	}
};
function parsePersistedState(raw) {
	let value = JSON.parse(raw.replace(/^\uFEFF/, ""));
	value = migrateLegacyDeviceState(value);
	value = migrateAudioMixState(value);
	value = migrateLegacyCaptureState(value);
	value = migrateClipReviewState(value);
	value = migrateGameDetectionState(value);
	return systemSnapshotSchema.parse(migrateAppUpdateState(value));
}
async function writeDurableState(filePath, payload) {
	const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		const file = await open(temporaryPath, "wx");
		try {
			await file.writeFile(payload, "utf8");
			await file.sync();
		} finally {
			await file.close();
		}
		await rename(temporaryPath, filePath);
	} finally {
		await rm(temporaryPath, { force: true });
	}
}
function migrateLegacyDeviceState(value) {
	if (!isRecord$1(value) || !Array.isArray(value.devices)) return value;
	const defaults = createDefaultSnapshot();
	const byModule = new Map(defaults.devices.map((device) => [device.moduleId, device]));
	const migratedDevices = value.devices.map((candidate) => {
		if (!isRecord$1(candidate)) return candidate;
		const moduleId = typeof candidate.moduleId === "string" ? candidate.moduleId : "";
		const fallback = byModule.get(moduleId);
		if (!fallback) return candidate;
		const capabilities = isRecord$1(candidate.capabilities) ? candidate.capabilities : structuredClone(fallback.capabilities);
		if (typeof candidate.batteryPercent === "number" && isRecord$1(capabilities) && isRecord$1(capabilities.battery)) {
			capabilities.battery.percentage = candidate.batteryPercent;
			capabilities.battery.updatedAt = Date.now();
		}
		return {
			...structuredClone(fallback),
			...candidate,
			id: typeof candidate.id === "string" ? candidate.id : fallback.id,
			connected: typeof candidate.connected === "boolean" ? candidate.connected : fallback.connected,
			identity: isRecord$1(candidate.identity) ? candidate.identity : structuredClone(fallback.identity),
			capabilities,
			settings: isRecord$1(candidate.settings) ? {
				...structuredClone(fallback.settings),
				...candidate.settings
			} : structuredClone(fallback.settings)
		};
	});
	return {
		...value,
		devices: migratedDevices
	};
}
function migrateLegacyCaptureState(value) {
	if (!isRecord$1(value)) return value;
	const defaults = createDefaultSnapshot();
	const capture = isRecord$1(value.capture) ? value.capture : {};
	const config = isRecord$1(capture.config) ? capture.config : {};
	const runtime = isRecord$1(capture.runtime) ? capture.runtime : {};
	const legacySource = config.source;
	const source = legacySource === "game" ? "automatic-game" : legacySource === "display" || legacySource === "window" || legacySource === "automatic-game" ? legacySource : defaults.capture.config.source;
	const clips = Array.isArray(value.clips) ? value.clips.filter((clip) => isRecord$1(clip) && typeof clip.durationMs === "number" && typeof clip.fileSize === "number") : [];
	return {
		...value,
		clips,
		capture: {
			...capture,
			config: {
				...defaults.capture.config,
				...config,
				source,
				sourceId: typeof config.sourceId === "string" ? config.sourceId : null,
				includeSystemAudio: typeof config.includeSystemAudio === "boolean" ? config.includeSystemAudio : true,
				includeChatAudio: typeof config.includeChatAudio === "boolean" ? config.includeChatAudio : false,
				microphoneDeviceId: typeof config.microphoneDeviceId === "string" ? config.microphoneDeviceId : null,
				systemAudioDeviceId: typeof config.systemAudioDeviceId === "string" ? config.systemAudioDeviceId : null,
				chatAudioDeviceId: typeof config.chatAudioDeviceId === "string" ? config.chatAudioDeviceId : null,
				clipsDirectory: typeof config.clipsDirectory === "string" ? config.clipsDirectory : null,
				defaultTrackLevels: sanitizeDefaultTrackLevels(config.defaultTrackLevels, defaults.capture.config.defaultTrackLevels)
			},
			runtime: {
				...defaults.capture.runtime,
				...runtime,
				reactionClipping: isRecord$1(runtime.reactionClipping) ? {
					...defaults.capture.runtime.reactionClipping,
					...runtime.reactionClipping
				} : defaults.capture.runtime.reactionClipping
			},
			storage: isRecord$1(capture.storage) ? {
				...defaults.capture.storage,
				...capture.storage
			} : defaults.capture.storage,
			capabilities: isRecord$1(capture.capabilities) ? {
				...defaults.capture.capabilities,
				...capture.capabilities
			} : defaults.capture.capabilities,
			sources: Array.isArray(capture.sources) ? capture.sources : [],
			autoCapture: isRecord$1(capture.autoCapture) ? {
				settings: isRecord$1(capture.autoCapture.settings) ? {
					...defaults.capture.autoCapture.settings,
					...capture.autoCapture.settings,
					reactionClipping: isRecord$1(capture.autoCapture.settings.reactionClipping) ? {
						...defaults.capture.autoCapture.settings.reactionClipping,
						...capture.autoCapture.settings.reactionClipping
					} : defaults.capture.autoCapture.settings.reactionClipping
				} : defaults.capture.autoCapture.settings,
				providers: [],
				runtime: defaults.capture.autoCapture.runtime
			} : defaults.capture.autoCapture
		}
	};
}
function migrateAudioMixState(value) {
	if (!isRecord$1(value) || !isRecord$1(value.audio)) return value;
	const defaults = createDefaultSnapshot();
	if (Array.isArray(value.audio.mixes)) return {
		...value,
		audio: {
			...value.audio,
			host: null
		}
	};
	const legacyBuses = Array.isArray(value.audio.buses) ? value.audio.buses : [];
	const legacyMaster = isRecord$1(value.audio.master) ? value.audio.master : {};
	const mixes = structuredClone(defaults.audio.mixes);
	const personal = mixes.find((mix) => mix.id === "personal");
	if (personal) {
		if (typeof legacyMaster.gain === "number") personal.master.gain = legacyMaster.gain;
		if (typeof legacyMaster.enabled === "boolean") personal.master.enabled = legacyMaster.enabled;
		for (const candidate of legacyBuses) {
			if (!isRecord$1(candidate) || typeof candidate.id !== "string") continue;
			const bus = personal.buses.find((entry) => entry.id === candidate.id);
			if (!bus) continue;
			if (typeof candidate.gain === "number") bus.gain = candidate.gain;
			if (typeof candidate.enabled === "boolean") bus.enabled = candidate.enabled;
			else if (typeof candidate.muted === "boolean") bus.enabled = !candidate.muted;
		}
	}
	return {
		...value,
		audio: {
			...value.audio,
			mixes,
			host: null
		}
	};
}
function migrateGameDetectionState(value) {
	if (!isRecord$1(value)) return value;
	const defaults = createDefaultSnapshot();
	const settings = isRecord$1(value.settings) ? value.settings : {};
	const gameDetection = isRecord$1(value.gameDetection) ? value.gameDetection : {};
	return {
		...value,
		settings: {
			...defaults.settings,
			...settings,
			visibleWorkspaces: migrateVisibleWorkspaces(settings.visibleWorkspaces, settings.workspaceProfile)
		},
		gameDetection: {
			...defaults.gameDetection,
			...gameDetection,
			games: Array.isArray(gameDetection.games) ? gameDetection.games : [],
			scanState: "idle",
			error: void 0
		}
	};
}
function migrateClipReviewState(value) {
	if (!isRecord$1(value)) return value;
	const clips = Array.isArray(value.clips) ? value.clips.filter((clip) => isRecord$1(clip)) : [];
	const existing = isRecord$1(value.clipReview) ? value.clipReview.reviewedThrough : void 0;
	const reviewedThrough = typeof existing === "number" && Number.isSafeInteger(existing) && existing >= 0 ? existing : latestClipCreatedAt(clips.filter((clip) => typeof clip.createdAt === "number" && Number.isSafeInteger(clip.createdAt) && clip.createdAt >= 0).map((clip) => ({ createdAt: clip.createdAt })));
	return {
		...value,
		clipReview: { reviewedThrough }
	};
}
function migrateAppUpdateState(value) {
	if (!isRecord$1(value)) return value;
	const defaults = createDefaultSnapshot();
	return {
		...value,
		appUpdate: defaults.appUpdate
	};
}
function sanitizeDefaultTrackLevels(value, fallback) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return { ...fallback };
	const candidate = value;
	const sanitize = (entry, fallbackLevel) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= 100 ? entry : fallbackLevel;
	return {
		game: sanitize(candidate.game, fallback.game),
		chat: sanitize(candidate.chat, fallback.chat),
		microphone: sanitize(candidate.microphone, fallback.microphone),
		media: sanitize(candidate.media, fallback.media)
	};
}
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region src/main/services/performance-monitor.ts
var sampleIntervalMs = 5e3;
var publishIntervalMs = 3e4;
var rollingWindowSamples = 12;
var consecutiveFailedWindows = 3;
var resourceRecordIntervalMs = 3e4;
var anomalyRecordIntervalMs = 15e3;
var performanceMemoryBudgetsMb = {
	coreTray: 270,
	rendererOpen: 340,
	audioEngine: 65,
	captureEngine: 1e3
};
var PerformanceBudgetGuard = class {
	samples = [];
	failedWindows = 0;
	budgetSignature = "";
	evaluate(sample, enabled) {
		if (!enabled) {
			this.reset();
			return {
				guardState: "disabled",
				warning: null
			};
		}
		const signature = `${sample.budgetMemoryMb}:${sample.budgetCpuPercent}`;
		if (signature !== this.budgetSignature) {
			this.samples = [];
			this.failedWindows = 0;
			this.budgetSignature = signature;
		}
		this.samples.push(sample);
		if (this.samples.length > rollingWindowSamples) this.samples.shift();
		if (this.samples.length < rollingWindowSamples) return {
			guardState: "collecting",
			warning: null
		};
		const medianMemory = median(this.samples.map((candidate) => candidate.totalMemoryMb));
		const medianCpu = median(this.samples.map((candidate) => candidate.totalCpuPercent));
		const memoryFailed = medianMemory >= sample.budgetMemoryMb;
		const cpuFailed = medianCpu >= sample.budgetCpuPercent;
		this.failedWindows = memoryFailed || cpuFailed ? this.failedWindows + 1 : 0;
		if (this.failedWindows < consecutiveFailedWindows) return {
			guardState: memoryFailed || cpuFailed ? "collecting" : "within-budget",
			warning: null
		};
		return {
			guardState: "over-budget",
			warning: `Sustained resource use is above budget: ${[memoryFailed ? `${round(medianMemory)} MB private memory (budget ${sample.budgetMemoryMb} MB)` : null, cpuFailed ? `${round(medianCpu)}% CPU (budget ${sample.budgetCpuPercent}%)` : null].filter(Boolean).join(" and ")}.`
		};
	}
	reset() {
		this.samples = [];
		this.failedWindows = 0;
		this.budgetSignature = "";
	}
};
var PerformanceMonitor = class {
	options;
	guard = new PerformanceBudgetGuard();
	now;
	timer = null;
	started = false;
	lastPublishedAt = 0;
	lastResourceRecordedAt = 0;
	lastGuardState = null;
	previousTotalMemoryMb = null;
	sequence = 0;
	sampling = false;
	disposed = false;
	pendingRendererProbe = null;
	debugEpoch = 0;
	debugHistory = [];
	getDebugHistory() {
		return structuredClone(this.debugHistory);
	}
	clearDebugHistory() {
		this.debugEpoch++;
		this.debugHistory = [];
	}
	invalidateDebugSample() {
		this.debugEpoch++;
	}
	constructor(options) {
		this.options = options;
		this.now = options.now ?? Date.now;
	}
	start() {
		if (this.timer || this.disposed) return;
		this.started = true;
		this.sample(true);
		this.timer = setInterval(() => void this.sample(false), sampleIntervalMs);
		this.timer.unref();
	}
	refresh() {
		if (this.disposed || !this.started) return;
		this.sample(true);
	}
	dispose() {
		this.disposed = true;
		this.started = false;
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
	}
	async sample(forcePublish) {
		if (this.disposed || this.sampling) return;
		this.sampling = true;
		try {
			const context = this.options.getContext();
			const debugEpoch = this.debugEpoch;
			const debugGeneration = context.detailedDiagnostics === true;
			const measuredAt = this.now();
			const metrics = this.options.getProcessMetrics();
			const measured = measurePerformance(metrics, context, measuredAt);
			const guard = this.guard.evaluate(measured, context.guardEnabled);
			const snapshot = {
				...measured,
				...guard
			};
			if (debugGeneration) snapshot.debug = debugDiagnostics.snapshot();
			const guardChanged = this.lastGuardState !== snapshot.guardState;
			const rapidGrowth = this.previousTotalMemoryMb !== null && measured.totalMemoryMb - this.previousTotalMemoryMb >= Math.max(32, measured.budgetMemoryMb * .1);
			const overBudget = measured.totalMemoryMb >= measured.budgetMemoryMb;
			this.previousTotalMemoryMb = measured.totalMemoryMb;
			const recordInterval = debugGeneration ? sampleIntervalMs : overBudget || rapidGrowth ? anomalyRecordIntervalMs : resourceRecordIntervalMs;
			if (Boolean(this.options.recordSample) && (forcePublish || guardChanged || measuredAt - this.lastResourceRecordedAt >= recordInterval)) {
				let rendererRuntime = null;
				if ((shouldCollectRendererRuntime({
					rendererActive: context.rendererActive,
					hasProbe: Boolean(this.options.getRendererRuntime),
					overBudget,
					rapidGrowth,
					guardState: snapshot.guardState
				}) || debugGeneration && context.rendererActive) && this.options.getRendererRuntime) try {
					if (!this.pendingRendererProbe) {
						const probe = this.options.getRendererRuntime();
						this.pendingRendererProbe = probe;
						const clear = () => {
							if (this.pendingRendererProbe === probe) this.pendingRendererProbe = null;
						};
						probe.then(clear, clear);
						rendererRuntime = await boundedRendererProbe(() => probe);
					}
				} catch {}
				this.lastResourceRecordedAt = measuredAt;
				this.sequence += 1;
				if (this.disposed || debugEpoch !== this.debugEpoch) return;
				if (debugGeneration && !this.options.getContext().detailedDiagnostics) return;
				const resourceSample = buildResourceTelemetrySample({
					metrics,
					context,
					performance: snapshot,
					rendererRuntime,
					sequence: this.sequence,
					flags: [overBudget ? "over-budget" : null, rapidGrowth ? "rapid-growth" : null].filter((flag) => flag !== null)
				});
				if (snapshot.debug) {
					snapshot.debug.processes = [...resourceSample.electronProcesses.map((p) => ({
						...p,
						role: p.type
					})), ...resourceSample.engines.filter((e) => e.state === "running" || e.state === "starting").flatMap((e) => e.processes.length ? e.processes.map((p) => ({
						pid: p.pid,
						role: `${e.kind}:${p.role}`,
						privateMb: p.privateMemoryMb,
						workingSetMb: p.workingSetMb,
						cpuPercent: null
					})) : [{
						pid: e.pid ?? 0,
						role: e.kind,
						privateMb: e.reportedMemoryMb,
						workingSetMb: e.reportedMemoryMb,
						cpuPercent: e.cpuPercent
					}])].sort((a, b) => b.privateMb - a.privateMb);
					resourceSample.debug = snapshot.debug;
					this.debugHistory.push(resourceSample);
					if (this.debugHistory.length > 120) this.debugHistory.shift();
				}
				this.options.recordSample?.(resourceSample);
			}
			if (forcePublish || guardChanged || measuredAt - this.lastPublishedAt >= publishIntervalMs) {
				this.lastPublishedAt = measuredAt;
				this.lastGuardState = snapshot.guardState;
				this.options.publish(snapshot);
			}
		} catch (error) {
			console.warn("Performance sampling failed.", error);
		} finally {
			this.sampling = false;
		}
	}
};
function shouldCollectRendererRuntime(input) {
	return input.rendererActive && input.hasProbe && (input.overBudget || input.rapidGrowth || input.guardState === "over-budget");
}
var rendererRuntimeProbeSchema = z.object({
	longTasks: z.object({
		supported: z.boolean(),
		count: z.number().int().nonnegative(),
		totalMs: z.number().finite().nonnegative(),
		maxMs: z.number().finite().nonnegative()
	}).strict().nullable().optional(),
	route: z.string().trim().min(1).max(32),
	jsHeapUsedBytes: z.number().finite().nonnegative().nullable(),
	jsHeapTotalBytes: z.number().finite().nonnegative().nullable(),
	jsHeapLimitBytes: z.number().finite().nonnegative().nullable(),
	domNodes: z.number().int().nonnegative(),
	canvasCount: z.number().int().nonnegative(),
	imageCount: z.number().int().nonnegative(),
	videoCount: z.number().int().nonnegative(),
	playingVideoCount: z.number().int().nonnegative(),
	resourceEntryCount: z.number().int().nonnegative()
}).strict();
function buildResourceTelemetrySample(input) {
	const activeEngines = input.context.engines.filter((engine) => engine.state === "running" || engine.state === "starting");
	const electronPrivateMb = kilobytesToMb(sum(input.metrics.map((metric) => metric.memory.privateBytes ?? 0)));
	const electronWorkingSetMb = kilobytesToMb(sum(input.metrics.map((metric) => metric.memory.workingSetSize)));
	const engineReportedMemoryMb = sum(activeEngines.map((engine) => engine.memoryMb));
	const enginePrivateMb = sum(activeEngines.map(enginePrivateMemoryMb));
	const engineWorkingSetMb = sum(activeEngines.map(engineWorkingSetMemoryMb));
	const mainMemory = process.memoryUsage();
	const activeResourceCounts = (typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo() : []).reduce((counts, resource) => {
		counts[resource] = (counts[resource] ?? 0) + 1;
		return counts;
	}, {});
	const rendererProbe = rendererRuntimeProbeSchema.safeParse(input.rendererRuntime);
	const rendererRuntime = rendererProbe.success ? {
		route: rendererProbe.data.route,
		longTasks: rendererProbe.data.longTasks ?? null,
		jsHeapUsedMb: bytesToMbOrNull(rendererProbe.data.jsHeapUsedBytes),
		jsHeapTotalMb: bytesToMbOrNull(rendererProbe.data.jsHeapTotalBytes),
		jsHeapLimitMb: bytesToMbOrNull(rendererProbe.data.jsHeapLimitBytes),
		domNodes: rendererProbe.data.domNodes,
		canvasCount: rendererProbe.data.canvasCount,
		imageCount: rendererProbe.data.imageCount,
		videoCount: rendererProbe.data.videoCount,
		playingVideoCount: rendererProbe.data.playingVideoCount,
		resourceEntryCount: rendererProbe.data.resourceEntryCount
	} : null;
	return {
		schemaVersion: 1,
		kind: "resource-sample",
		sampledAt: input.performance.sampledAt ?? (/* @__PURE__ */ new Date()).toISOString(),
		sequence: input.sequence,
		uptimeSeconds: round(process.uptime()),
		rendererActive: input.context.rendererActive,
		guardState: input.performance.guardState,
		flags: input.flags,
		budget: {
			memoryMb: input.performance.budgetMemoryMb,
			cpuPercent: input.performance.budgetCpuPercent
		},
		totals: {
			electronPrivateMb: round(electronPrivateMb),
			electronWorkingSetMb: round(electronWorkingSetMb),
			engineReportedMemoryMb: round(engineReportedMemoryMb),
			enginePrivateMb: round(enginePrivateMb),
			engineWorkingSetMb: round(engineWorkingSetMb),
			attributedMemoryMb: round(electronPrivateMb + enginePrivateMb + sum((input.context.externalProcesses ?? []).map((item) => item.privateMemoryMb))),
			cpuPercent: input.performance.totalCpuPercent,
			processCount: input.performance.activeProcesses
		},
		externalProcesses: input.context.externalProcesses ?? [],
		electronProcesses: input.metrics.map((metric) => ({
			pid: metric.pid,
			type: metric.type,
			privateMb: round(kilobytesToMb(metric.memory.privateBytes ?? 0)),
			workingSetMb: round(kilobytesToMb(metric.memory.workingSetSize)),
			peakWorkingSetMb: round(kilobytesToMb(metric.memory.peakWorkingSetSize ?? metric.memory.workingSetSize)),
			cpuPercent: round(metric.cpu.percentCPUUsage)
		})).sort((left, right) => right.privateMb - left.privateMb),
		engines: input.context.engines.map((engine) => ({
			kind: engine.kind,
			pid: engine.pid ?? null,
			state: engine.state,
			reportedMemoryMb: round(engine.memoryMb),
			cpuPercent: round(engine.cpuPercent),
			processes: (engine.processes ?? []).map((resource) => ({
				pid: resource.pid,
				role: resource.role,
				privateMemoryMb: round(resource.privateMemoryMb),
				workingSetMb: round(resource.workingSetMb)
			}))
		})),
		mainRuntime: {
			rssMb: bytesToMb(mainMemory.rss),
			heapUsedMb: bytesToMb(mainMemory.heapUsed),
			heapTotalMb: bytesToMb(mainMemory.heapTotal),
			externalMb: bytesToMb(mainMemory.external),
			arrayBuffersMb: bytesToMb(mainMemory.arrayBuffers),
			activeResources: activeResourceCounts
		},
		rendererRuntime,
		system: {
			totalMemoryMb: bytesToMb(totalmem()),
			freeMemoryMb: bytesToMb(freemem())
		}
	};
}
function measurePerformance(metrics, context, measuredAt) {
	const rendererMetrics = metrics.filter((metric) => metric.type === "Tab");
	const external = context.externalProcesses ?? [];
	const coreMetrics = metrics.filter((metric) => metric.type !== "Tab");
	const activeEngines = context.engines.filter((engine) => engine.state === "running" || engine.state === "starting");
	const enginePrivateMb = sum(activeEngines.map(enginePrivateMemoryMb));
	const engineWorkingSetMb = sum(activeEngines.map(engineWorkingSetMemoryMb));
	const engineCpuPercent = sum(activeEngines.map((engine) => engine.cpuPercent));
	const rendererMemoryMb = kilobytesToMb(sum(rendererMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
	const coreMemoryMb = kilobytesToMb(sum(coreMetrics.map((metric) => metric.memory.privateBytes ?? 0)));
	const residentMemoryMb = kilobytesToMb(sum(metrics.map((metric) => metric.memory.workingSetSize))) + engineWorkingSetMb;
	const audioActive = activeEngines.some((engine) => engine.kind === "audio");
	const captureActive = activeEngines.some((engine) => engine.kind === "capture");
	const activeEngineProcesses = sum(activeEngines.map((engine) => engine.processes?.length || 1));
	return {
		coreMemoryMb: round(coreMemoryMb),
		rendererMemoryMb: round(rendererMemoryMb),
		totalMemoryMb: round(coreMemoryMb + rendererMemoryMb + enginePrivateMb + sum(external.map((item) => item.privateMemoryMb))),
		residentMemoryMb: round(residentMemoryMb + sum(external.map((item) => item.workingSetMb))),
		totalCpuPercent: round(sum(metrics.map((metric) => metric.cpu.percentCPUUsage)) + engineCpuPercent + sum(external.map((item) => item.cpuPercent))),
		activeProcesses: metrics.length + activeEngineProcesses + external.length,
		budgetMemoryMb: (context.rendererActive ? performanceMemoryBudgetsMb.rendererOpen : performanceMemoryBudgetsMb.coreTray) + (audioActive ? performanceMemoryBudgetsMb.audioEngine : 0) + (captureActive ? performanceMemoryBudgetsMb.captureEngine : 0),
		budgetCpuPercent: (context.rendererActive ? .7 : .3) + (audioActive ? 1 : 0) + (captureActive ? 2 : 0),
		sampledAt: new Date(measuredAt).toISOString()
	};
}
function median(values) {
	const sorted = [...values].sort((left, right) => left - right);
	const midpoint = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[midpoint - 1] + sorted[midpoint]) / 2 : sorted[midpoint];
}
function kilobytesToMb(value) {
	return value / 1024;
}
function enginePrivateMemoryMb(engine) {
	return engine.processes?.length ? sum(engine.processes.map((resource) => resource.privateMemoryMb)) : engine.memoryMb;
}
function engineWorkingSetMemoryMb(engine) {
	return engine.processes?.length ? sum(engine.processes.map((resource) => resource.workingSetMb)) : engine.memoryMb;
}
function bytesToMb(value) {
	return round(value / 1024 / 1024);
}
function bytesToMbOrNull(value) {
	return value === null ? null : bytesToMb(value);
}
function sum(values) {
	return values.reduce((total, value) => total + value, 0);
}
function round(value) {
	return Math.round(value * 10) / 10;
}
async function boundedRendererProbe(probe) {
	let timer;
	try {
		return await Promise.race([probe(), new Promise((resolve) => {
			timer = setTimeout(() => resolve(null), 1500);
			timer.unref();
		})]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
//#endregion
//#region src/main/services/resource-journal.ts
var defaultMaximumFileBytes = 8388608;
var pruneIntervalMs = 216e5;
var ResourceJournal = class {
	options;
	sessionId = randomUUID();
	maximumFileBytes;
	now;
	startedAt;
	writeChain = Promise.resolve();
	fileBytes = 0;
	part = 0;
	lastPrunedAt = 0;
	disposed = false;
	pendingWrites = 0;
	droppedWrites = 0;
	getDroppedWrites() {
		return this.droppedWrites;
	}
	constructor(options) {
		this.options = options;
		this.maximumFileBytes = options.maximumFileBytes ?? defaultMaximumFileBytes;
		this.now = options.now ?? Date.now;
		this.startedAt = this.now();
	}
	record(sample) {
		if (this.disposed) return;
		if (this.pendingWrites >= 4) {
			this.droppedWrites++;
			return;
		}
		const line = `${JSON.stringify(sample)}\n`;
		this.pendingWrites++;
		const lineBytes = Buffer.byteLength(line);
		this.writeChain = this.writeChain.then(async () => {
			await mkdir(this.options.directory, { recursive: true });
			await this.pruneIfDue();
			if (this.fileBytes > 0 && this.fileBytes + lineBytes > this.maximumFileBytes) {
				this.part += 1;
				this.fileBytes = 0;
			}
			await appendFile(this.currentFilePath(), line, "utf8");
			this.fileBytes += lineBytes;
		}).catch((error) => {
			this.droppedWrites++;
			console.warn("Resource journal write failed.", error);
		}).finally(() => {
			this.pendingWrites--;
		});
	}
	async dispose() {
		this.disposed = true;
		await this.writeChain;
	}
	getDirectory() {
		return this.options.directory;
	}
	currentFilePath() {
		const started = new Date(this.startedAt).toISOString().replaceAll(":", "").replaceAll(".", "-");
		return join(this.options.directory, `resource-${started}-${this.sessionId}-${this.part}.jsonl`);
	}
	async pruneIfDue() {
		const now = this.now();
		if (this.lastPrunedAt && now - this.lastPrunedAt < pruneIntervalMs) return;
		this.lastPrunedAt = now;
		const cutoff = now - Math.min(30, Math.max(1, Math.round(this.options.getRetentionDays()))) * 24 * 60 * 60 * 1e3;
		const entries = await readdir(this.options.directory, { withFileTypes: true });
		await Promise.all(entries.filter((entry) => entry.isFile() && /^resource-.*\.jsonl$/i.test(entry.name)).map(async (entry) => {
			const path = join(this.options.directory, entry.name);
			if ((await stat(path)).mtimeMs < cutoff) await unlink(path);
		}));
	}
};
//#endregion
//#region src/main/services/runtime-update-gates.ts
var defaultTelemetryIntervalMs = 5e3;
var defaultAudioDiagnosticsIntervalMs = 3e4;
function audioTransitionSignature(snapshot) {
	const { localSnrDb: _localSnrDb, p50Ms: _p50Ms, p95Ms: _p95Ms, p99Ms: _p99Ms, maximumMs: _maximumMs, captureCallbackP99Ms: _captureCallbackP99Ms, ...diagnosticState } = snapshot.noiseSuppression;
	return JSON.stringify({
		...snapshot,
		noiseSuppression: diagnosticState
	});
}
var AudioSnapshotUpdateGate = class {
	intervalMs;
	lastAppliedAt = Number.NEGATIVE_INFINITY;
	transitionSignature = null;
	constructor(intervalMs = defaultAudioDiagnosticsIntervalMs) {
		this.intervalMs = intervalMs;
	}
	shouldApply(snapshot, now = Date.now()) {
		const nextSignature = audioTransitionSignature(snapshot);
		if (!(nextSignature !== this.transitionSignature) && now - this.lastAppliedAt < this.intervalMs) return false;
		this.transitionSignature = nextSignature;
		this.lastAppliedAt = now;
		return true;
	}
};
var AudioMeterDemandGate = class {
	rendererActive = true;
	rendererRequested = false;
	get enabled() {
		return this.rendererActive && this.rendererRequested;
	}
	setRendererActive(active) {
		const before = this.enabled;
		this.rendererActive = active;
		return before !== this.enabled;
	}
	setRendererRequested(requested) {
		const before = this.enabled;
		this.rendererRequested = requested;
		return before !== this.enabled;
	}
};
function captureTransitionSignature(snapshot) {
	const { runtime, storage, capabilities, sources } = snapshot;
	return JSON.stringify({
		state: runtime.state,
		sourceId: runtime.activeSource?.id ?? null,
		saveQueueDepth: runtime.saveQueueDepth,
		warning: runtime.warning ?? null,
		error: runtime.error ?? null,
		lastSavedAt: runtime.lastSavedAt ?? null,
		reaction: {
			state: runtime.reactionClipping.state,
			reactionsDetected: runtime.reactionClipping.reactionsDetected,
			lastReactionAt: runtime.reactionClipping.lastReactionAt,
			message: runtime.reactionClipping.message
		},
		storage: {
			lowSpace: storage.lowSpace,
			criticalSpace: storage.criticalSpace,
			warning: storage.warning ?? null
		},
		capabilities,
		sources: sources.map((source) => [source.id, source.available])
	});
}
var CaptureSnapshotUpdateGate = class {
	intervalMs;
	lastAppliedAt = Number.NEGATIVE_INFINITY;
	transitionSignature = null;
	constructor(intervalMs = defaultTelemetryIntervalMs) {
		this.intervalMs = intervalMs;
	}
	shouldApply(snapshot, now = Date.now()) {
		const nextSignature = captureTransitionSignature(snapshot);
		if (!(nextSignature !== this.transitionSignature) && now - this.lastAppliedAt < this.intervalMs) return false;
		this.transitionSignature = nextSignature;
		this.lastAppliedAt = now;
		return true;
	}
};
function isMaterialEngineStatusChange(previous, next) {
	return !previous || previous.state !== next.state || previous.pid !== next.pid || previous.message !== next.message;
}
//#endregion
//#region src/shared/auto-capture.ts
var defaultAutoCaptureEventPreferences = {
	kill: true,
	headshot: true,
	multi_kill: true,
	assist: true,
	knockdown: false,
	death: false,
	round_win: true,
	round_loss: false,
	match_win: true,
	match_loss: false,
	objective: true,
	achievement: true,
	highlight: true,
	custom: false
};
function defaultAutoCaptureEventEnabled(type) {
	return defaultAutoCaptureEventPreferences[type];
}
//#endregion
//#region src/main/autocapture/capture-window-planner.ts
function planCaptureWindow(event, preRollMs, postRollMs) {
	return {
		id: randomUUID(),
		gameId: event.gameId,
		providerId: event.providerId,
		startedAt: Math.max(0, event.timestamp - Math.max(0, preRollMs)),
		endsAt: event.timestamp + Math.max(0, postRollMs),
		events: [event]
	};
}
function mergeCaptureWindows(current, next, mergeThresholdMs, maximumDurationMs) {
	if (current.gameId !== next.gameId || current.providerId !== next.providerId) return null;
	if (next.startedAt > current.endsAt + Math.max(0, mergeThresholdMs)) return null;
	const startedAt = Math.min(current.startedAt, next.startedAt);
	const endsAt = Math.max(current.endsAt, next.endsAt);
	if (endsAt - startedAt > maximumDurationMs) return null;
	return {
		...current,
		startedAt,
		endsAt,
		events: [...current.events, ...next.events].slice(0, 128)
	};
}
function addDerivedMultiKill(events) {
	const output = [...events];
	if (events.some((event) => event.type === "multi_kill")) return output;
	const kills = events.filter((event) => event.type === "kill" || event.type === "headshot");
	if (kills.length < 2) return output;
	const last = kills.at(-1);
	output.push({
		id: `${last.id}:derived-multi-${kills.length}`,
		gameId: last.gameId,
		providerId: last.providerId,
		type: "multi_kill",
		timestamp: last.timestamp,
		confidence: last.confidence,
		label: `${kills.length} Kills`,
		metadata: {
			count: Math.min(20, kills.length),
			derived: true
		},
		source: last.source
	});
	return output;
}
function markersForClip(events, clipStartedAt, durationMs) {
	return events.map((event) => ({
		id: event.id,
		type: event.type,
		timestampMs: Math.min(durationMs, Math.max(0, Math.round(event.timestamp - clipStartedAt))),
		...event.label ? { label: event.label } : {},
		...event.metadata ? { metadata: event.metadata } : {}
	})).sort((left, right) => left.timestampMs - right.timestampMs).slice(0, 128);
}
function autoCaptureTitle(game, events) {
	const nativeOrDerivedMulti = events.filter((event) => event.type === "multi_kill").at(-1);
	const kills = events.filter((event) => event.type === "kill" || event.type === "headshot").length;
	if (nativeOrDerivedMulti?.label) return `${game} - ${nativeOrDerivedMulti.label}`;
	if (kills > 1) return `${game} - ${kills} Kills`;
	const highlight = [
		"match_win",
		"round_win",
		"headshot",
		"kill",
		"objective",
		"assist",
		"knockdown",
		"death"
	].map((type) => events.find((event) => event.type === type)).find(Boolean) ?? events[0];
	return `${game} - ${highlight?.label ?? eventTypeLabel(highlight?.type ?? "highlight")}`;
}
function eventTypeLabel(type) {
	return {
		kill: "Kill",
		headshot: "Headshot",
		multi_kill: "Multi-kill",
		assist: "Assist",
		knockdown: "Knockdown",
		death: "Death",
		round_win: "Round Win",
		round_loss: "Round Loss",
		match_win: "Match Win",
		match_loss: "Match Loss",
		objective: "Objective",
		achievement: "Achievement",
		highlight: "Highlight",
		custom: "Highlight"
	}[type];
}
var EventDeduplicator = class {
	windowMs;
	maximumEntries;
	seenAt = /* @__PURE__ */ new Map();
	constructor(windowMs = 500, maximumEntries = 512) {
		this.windowMs = windowMs;
		this.maximumEntries = maximumEntries;
	}
	isDuplicate(event) {
		this.prune(event.timestamp);
		const fingerprint = eventFingerprint(event);
		const previous = this.seenAt.get(fingerprint);
		this.seenAt.delete(fingerprint);
		this.seenAt.set(fingerprint, event.timestamp);
		return previous !== void 0 && Math.abs(event.timestamp - previous) <= this.windowMs;
	}
	clear() {
		this.seenAt.clear();
	}
	prune(now) {
		const cutoff = now - Math.max(this.windowMs * 4, 2e3);
		for (const [fingerprint, timestamp] of this.seenAt) {
			if (timestamp >= cutoff && this.seenAt.size <= this.maximumEntries) break;
			this.seenAt.delete(fingerprint);
		}
	}
};
function eventFingerprint(event) {
	return [
		event.providerId,
		event.gameId,
		event.type,
		stableMetadata(event.metadata)
	].join("|");
}
function stableMetadata(metadata) {
	if (!metadata) return "";
	return Object.entries(metadata).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}:${String(value)}`).join(",");
}
//#endregion
//#region src/main/autocapture/auto-capture-engine.ts
var finalizeSegmentSlackMs = 1250;
var maximumPendingWindows = 8;
var maximumEventAgeMs = 6e4;
var maximumFutureSkewMs = 5e3;
var reactionClippingProviderId = "microphone-reaction";
var AutoCaptureEngine = class {
	options;
	deduplicator = new EventDeduplicator();
	pending = /* @__PURE__ */ new Map();
	now;
	setTimer;
	clearTimer;
	activeGameId = null;
	activeProviderId = null;
	listening = false;
	providerError = null;
	saving = 0;
	disposed = false;
	lastReaction = null;
	runtime = {
		state: "disabled",
		activeGameId: null,
		activeProviderId: null,
		pendingCapture: null,
		eventsReceived: 0,
		eventsDeduplicated: 0,
		eventsIgnored: 0,
		clipsCreated: 0,
		lastEvent: null,
		lastError: null
	};
	constructor(options) {
		this.options = options;
		this.now = options.now ?? Date.now;
		this.setTimer = options.setTimer ?? ((listener, delayMs) => setTimeout(listener, delayMs));
		this.clearTimer = options.clearTimer ?? clearTimeout;
		this.publish();
	}
	setActiveProvider(gameId, providerId, listening) {
		if (listening || providerId !== this.activeProviderId) {
			if (this.providerError && this.runtime.lastError === this.providerError) this.runtime.lastError = null;
			this.providerError = null;
		}
		this.activeGameId = gameId;
		this.activeProviderId = providerId;
		this.listening = listening;
		this.publish();
	}
	setDegraded(message) {
		this.providerError = message;
		this.runtime.lastError = message;
		this.listening = false;
		this.publish("degraded");
	}
	handleEvent(event, policy) {
		if (this.disposed) return false;
		this.runtime.eventsReceived += 1;
		this.runtime.lastEvent = {
			type: event.type,
			at: event.timestamp,
			...event.label ? { label: event.label } : {}
		};
		const settings = this.options.getSettings();
		const gameSettings = settings.games[event.gameId];
		const now = this.now();
		if (!(policy?.enabled ?? settings.enabled) || !policy && gameSettings?.enabled === false || !policy && !eventEnabled(event.type, gameSettings?.events) || event.timestamp < now - maximumEventAgeMs || event.timestamp > now + maximumFutureSkewMs) {
			this.runtime.eventsIgnored += 1;
			this.options.log("event_ignored", {
				game: event.gameId,
				provider: event.providerId,
				type: event.type
			});
			this.publish();
			return false;
		}
		if (this.deduplicator.isDuplicate(event)) {
			this.runtime.eventsDeduplicated += 1;
			this.options.log("event_deduplicated", {
				game: event.gameId,
				provider: event.providerId,
				type: event.type
			});
			this.publish();
			return false;
		}
		const maximumWindowMs = Math.max(15e3, this.options.getMaximumWindowMs());
		const requestedPreMs = (policy?.preRollSeconds ?? (gameSettings && !gameSettings.useGlobalTiming ? gameSettings.preRollSeconds ?? settings.preRollSeconds : settings.preRollSeconds)) * 1e3;
		const requestedPostMs = (policy?.postRollSeconds ?? (gameSettings && !gameSettings.useGlobalTiming ? gameSettings.postRollSeconds ?? settings.postRollSeconds : settings.postRollSeconds)) * 1e3;
		const postRollMs = Math.min(requestedPostMs, maximumWindowMs);
		const next = planCaptureWindow(event, Math.min(requestedPreMs, Math.max(0, maximumWindowMs - postRollMs)), postRollMs);
		const isReaction = event.providerId === reactionClippingProviderId;
		if (isReaction) {
			const savedAt = this.options.getLastReactionSavedAt?.() ?? 0;
			const lastAt = Math.max(this.lastReaction?.timestamp ?? 0, savedAt);
			const lastEnd = Math.max(this.lastReaction?.endsAt ?? 0, savedAt);
			if (lastAt > 0 && (event.timestamp - lastAt < settings.reactionClipping.cooldownSeconds * 1e3 || next.startedAt < lastEnd)) {
				this.runtime.eventsIgnored += 1;
				this.options.log("reaction_suppressed", { reason: "cooldown_or_overlap" });
				this.publish();
				return false;
			}
		}
		const latest = [...this.pending.values()].at(-1);
		const mergeNearbyEvents = policy?.mergeNearbyEvents ?? settings.mergeNearbyEvents;
		const mergeThresholdMs = mergeNearbyEvents ? (policy?.mergeThresholdSeconds ?? settings.mergeThresholdSeconds) * 1e3 : 0;
		const merged = latest && mergeNearbyEvents ? mergeCaptureWindows(latest, next, mergeThresholdMs, maximumWindowMs) : null;
		if (merged && latest) {
			if (latest.timer) this.clearTimer(latest.timer);
			const scheduled = this.schedule(merged);
			this.pending.set(latest.id, scheduled);
			this.options.log("capture_window_extended", {
				game: event.gameId,
				provider: event.providerId,
				events: scheduled.events.length,
				durationMs: scheduled.endsAt - scheduled.startedAt
			});
		} else {
			if (this.pending.size >= maximumPendingWindows) {
				this.runtime.eventsIgnored += 1;
				this.runtime.lastError = "Auto Capture reached its bounded pending-window limit; the newest event was ignored.";
				this.publish("degraded");
				return false;
			}
			this.pending.set(next.id, this.schedule(next));
			this.options.log("capture_window_created", {
				game: event.gameId,
				provider: event.providerId,
				type: event.type,
				durationMs: next.endsAt - next.startedAt
			});
		}
		if (isReaction) this.lastReaction = {
			timestamp: event.timestamp,
			endsAt: next.endsAt
		};
		this.options.log("event_received", {
			game: event.gameId,
			provider: event.providerId,
			type: event.type,
			timestamp: event.timestamp
		});
		this.publish();
		return true;
	}
	async flush(reason) {
		const now = this.now();
		const windows = [...this.pending.values()];
		for (const window of windows) {
			if (window.timer) this.clearTimer(window.timer);
			window.timer = null;
		}
		await Promise.allSettled(windows.map((window) => this.finalize(window.id, Math.min(window.endsAt, now), reason)));
	}
	async dispose() {
		if (this.disposed) return;
		await this.flush("shutdown");
		this.disposed = true;
		this.deduplicator.clear();
		this.activeGameId = null;
		this.activeProviderId = null;
		this.listening = false;
		this.publish();
	}
	schedule(window) {
		const delayMs = Math.max(0, window.endsAt + finalizeSegmentSlackMs - this.now());
		const timer = this.setTimer(() => {
			this.finalize(window.id, window.endsAt, "stable");
		}, delayMs);
		timer.unref?.();
		return {
			...window,
			timer
		};
	}
	async finalize(id, endsAt, reason) {
		const window = this.pending.get(id);
		if (!window) return;
		this.pending.delete(id);
		if (window.timer) this.clearTimer(window.timer);
		const boundedEnd = Math.max(window.startedAt + 1, endsAt);
		this.saving += 1;
		this.publish();
		try {
			const events = addDerivedMultiKill(window.events);
			await this.options.preserve({
				...window,
				endsAt: boundedEnd,
				events
			});
			this.runtime.clipsCreated += 1;
			this.runtime.lastError = null;
			this.options.log("clip_saved", {
				game: window.gameId,
				provider: window.providerId,
				events: events.length,
				durationMs: boundedEnd - window.startedAt,
				reason
			});
		} catch (error) {
			this.runtime.lastError = error instanceof Error ? error.message : String(error);
			this.options.log("clip_save_failed", {
				game: window.gameId,
				provider: window.providerId,
				error: this.runtime.lastError
			});
		} finally {
			this.saving -= 1;
			this.publish();
		}
	}
	publish(forcedState) {
		const settings = this.options.getSettings();
		const automationEnabled = settings.enabled || settings.reactionClipping.enabled;
		const latest = [...this.pending.values()].at(-1);
		const state = forcedState ?? (!automationEnabled || this.disposed ? "disabled" : this.saving > 0 ? "saving" : latest ? "pending" : this.providerError ? "degraded" : this.listening ? "listening" : "idle");
		this.runtime = {
			...this.runtime,
			state,
			activeGameId: this.activeGameId,
			activeProviderId: this.activeProviderId,
			pendingCapture: latest ? {
				startedAt: latest.startedAt,
				endsAt: latest.endsAt,
				eventCount: latest.events.length
			} : null
		};
		this.options.onRuntime(structuredClone(this.runtime));
	}
};
function eventEnabled(type, preferences) {
	const configured = preferences?.[type];
	if (configured !== void 0) return configured;
	return defaultAutoCaptureEventEnabled(type);
}
//#endregion
//#region src/main/autocapture/provider.ts
function providerSnapshot(provider, availability) {
	return {
		id: provider.id,
		gameId: provider.gameId,
		displayName: provider.displayName,
		supportLevel: provider.supportLevel,
		source: provider.source,
		capabilities: {
			events: [...provider.capabilities.events],
			nativeMultiKill: provider.capabilities.nativeMultiKill
		},
		availability,
		status: provider.getStatus(),
		requiresPlayerName: provider.requiresPlayerName ?? false,
		...provider.supportsAnonymousName ? { supportsAnonymousName: true } : {},
		developmentOnly: provider.developmentOnly ?? false
	};
}
//#endregion
//#region src/main/autocapture/registry.ts
var AutoCaptureRegistry = class {
	log;
	providers = /* @__PURE__ */ new Map();
	eventListeners = /* @__PURE__ */ new Set();
	changedListeners = /* @__PURE__ */ new Set();
	constructor(log) {
		this.log = log;
	}
	register(provider) {
		if (this.providers.has(provider.id)) throw new Error(`Auto Capture provider already registered: ${provider.id}`);
		this.providers.set(provider.id, {
			provider,
			availability: {
				state: "unavailable",
				reason: "Availability has not been checked yet."
			},
			unsubscribe: null,
			unsubscribeStatus: null,
			start: null
		});
	}
	get(providerId) {
		return this.providers.get(providerId)?.provider;
	}
	getForSource(source, detectedGames) {
		return [...this.providers.values()].map((entry) => entry.provider).find((provider) => !provider.developmentOnly && provider.matchesGame(source, detectedGames));
	}
	getDetectedGame(providerId, detectedGames) {
		const provider = this.providers.get(providerId)?.provider;
		if (!provider) return void 0;
		return provider.findDetectedGame?.(detectedGames) ?? detectedGames.find((game) => normalizeName(game.name) === normalizeName(provider.displayName));
	}
	snapshots(includeDevelopment) {
		return [...this.providers.values()].filter(({ provider }) => includeDevelopment || !provider.developmentOnly).map(({ provider, availability }) => providerSnapshot(provider, availability));
	}
	subscribe(listener) {
		this.eventListeners.add(listener);
		return () => this.eventListeners.delete(listener);
	}
	onChanged(listener) {
		this.changedListeners.add(listener);
		return () => this.changedListeners.delete(listener);
	}
	async refreshAvailability(context) {
		await Promise.all([...this.providers.values()].map(async (entry) => {
			try {
				entry.availability = await entry.provider.detectAvailability(context);
			} catch (error) {
				entry.availability = {
					state: "unavailable",
					reason: normalizeError(error)
				};
			}
		}));
		this.emitChanged();
	}
	async setup(providerId, context) {
		const entry = this.providers.get(providerId);
		if (!entry) throw new Error(`Unknown Auto Capture provider: ${providerId}`);
		if (!entry.provider.setup) throw new Error(`${entry.provider.displayName} does not require setup.`);
		entry.availability = await entry.provider.setup(context);
		this.emitChanged();
		return entry.availability;
	}
	async start(providerId, context) {
		const entry = this.providers.get(providerId);
		if (!entry) throw new Error(`Unknown Auto Capture provider: ${providerId}`);
		if (context.gameSettings) await entry.provider.configure?.(context.gameSettings);
		if (entry.provider.getStatus().state === "listening") return;
		if (entry.start) return entry.start;
		entry.start = (async () => {
			entry.availability = await entry.provider.detectAvailability(context);
			if (entry.availability.state !== "available") throw new Error(entry.availability.reason ?? `${entry.provider.displayName} is unavailable.`);
			entry.unsubscribe ??= entry.provider.subscribe((event) => {
				for (const listener of this.eventListeners) listener(event);
				this.emitChanged();
			});
			entry.unsubscribeStatus ??= entry.provider.subscribeStatus?.(() => this.emitChanged()) ?? null;
			await entry.provider.start({
				...context,
				log: this.log
			});
			this.log("provider_started", {
				game: entry.provider.gameId,
				provider: entry.provider.id
			});
			this.emitChanged();
		})().catch((error) => {
			this.log("provider_start_failed", {
				provider: providerId,
				error: normalizeError(error)
			});
			this.emitChanged();
			throw error;
		}).finally(() => {
			entry.start = null;
		});
		return entry.start;
	}
	async stop(providerId) {
		const entry = this.providers.get(providerId);
		if (!entry) return;
		const wasActive = entry.start !== null || entry.unsubscribe !== null || entry.unsubscribeStatus !== null || entry.provider.getStatus().state !== "stopped";
		await entry.start?.catch(() => void 0);
		await entry.provider.stop();
		entry.unsubscribe?.();
		entry.unsubscribe = null;
		entry.unsubscribeStatus?.();
		entry.unsubscribeStatus = null;
		if (wasActive) this.log("provider_stopped", {
			game: entry.provider.gameId,
			provider: entry.provider.id
		});
		this.emitChanged();
	}
	async stopAll() {
		await Promise.allSettled([...this.providers.keys()].map((providerId) => this.stop(providerId)));
	}
	emitChanged() {
		for (const listener of this.changedListeners) listener();
	}
};
function normalizeName(value) {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normalizeError(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/main/autocapture/coordinator.ts
var AutoCaptureCoordinator = class {
	options;
	activeProviderId = null;
	detectedGames = [];
	captureEnabled = false;
	activeSource = null;
	operation = Promise.resolve();
	reconcileSignature = "";
	disposed = false;
	unsubscribeEvents;
	unsubscribeChanged;
	constructor(options) {
		this.options = options;
		this.unsubscribeEvents = options.registry.subscribe((event) => {
			options.engine.handleEvent(event);
		});
		this.unsubscribeChanged = options.registry.onChanged(() => this.publishProviders());
	}
	async initialize(detectedGames) {
		this.detectedGames = detectedGames;
		await this.options.registry.refreshAvailability(this.discoveryContext());
		this.publishProviders();
	}
	reconcile(activeSource, captureEnabled, detectedGames) {
		this.activeSource = activeSource;
		this.captureEnabled = captureEnabled;
		this.detectedGames = detectedGames;
		const settings = this.options.getSettings();
		const signature = JSON.stringify([
			activeSource?.id ?? null,
			activeSource?.name ?? null,
			captureEnabled,
			settings.enabled,
			settings.games
		]);
		if (signature === this.reconcileSignature) return this.operation;
		this.reconcileSignature = signature;
		return this.enqueue(() => this.reconcileNow());
	}
	refreshAvailability(detectedGames) {
		this.detectedGames = detectedGames;
		this.reconcileSignature = "";
		return this.enqueue(async () => {
			await this.options.registry.refreshAvailability(this.discoveryContext());
			this.publishProviders();
			await this.reconcileNow();
		});
	}
	setup(providerId) {
		let result = null;
		return this.enqueue(async () => {
			result = await this.options.registry.setup(providerId, this.discoveryContext());
			this.reconcileSignature = "";
			this.publishProviders();
			await this.reconcileNow();
		}).then(() => result ?? {
			state: "unavailable",
			reason: "Provider setup did not complete."
		});
	}
	emitTestEvent(type, timestamp = Date.now()) {
		return this.enqueue(async () => {
			if (!this.options.getSettings().enabled) throw new Error("Enable Auto Capture before emitting a test event.");
			if (!this.captureEnabled) throw new Error("Enable Instant Replay before emitting a test event.");
			if (this.activeProviderId && this.activeProviderId !== this.options.testProvider.id) {
				await this.options.engine.flush("test-provider-activated");
				await this.options.registry.stop(this.activeProviderId);
			}
			const source = {
				id: "auto-capture-test",
				type: "automatic-game",
				name: this.options.testProvider.displayName,
				available: true
			};
			await this.options.registry.start(this.options.testProvider.id, {
				gameId: this.options.testProvider.gameId,
				displayName: this.options.testProvider.displayName,
				source,
				detectedGames: this.detectedGames,
				platform: process.platform
			});
			this.activeProviderId = this.options.testProvider.id;
			this.options.engine.setActiveProvider(this.options.testProvider.gameId, this.options.testProvider.id, true);
			this.options.testProvider.emit(type, timestamp);
			this.publishProviders();
		});
	}
	async flushBeforeCaptureStops(reason) {
		await this.enqueue(async () => {
			this.reconcileSignature = "";
			await this.options.engine.flush(reason);
			if (this.activeProviderId) await this.options.registry.stop(this.activeProviderId);
			this.activeProviderId = null;
			this.options.engine.setActiveProvider(null, null, false);
		});
	}
	async dispose() {
		if (this.disposed) return;
		await this.flushBeforeCaptureStops("app-shutdown");
		this.disposed = true;
		this.unsubscribeEvents();
		this.unsubscribeChanged();
		await this.options.registry.stopAll();
		await this.options.engine.dispose();
	}
	async reconcileNow() {
		if (this.disposed) return;
		const settings = this.options.getSettings();
		const detectedProvider = this.captureEnabled && this.activeSource ? this.options.registry.getForSource(this.activeSource, this.detectedGames) : void 0;
		const nextProvider = settings.enabled ? detectedProvider : void 0;
		const nextProviderId = (nextProvider ? settings.games[nextProvider.gameId]?.enabled !== false : false) ? nextProvider?.id ?? null : null;
		if (this.activeProviderId && this.activeProviderId !== nextProviderId) {
			await this.options.engine.flush(this.activeSource ? "game-changed" : "game-exited");
			await this.options.registry.stop(this.activeProviderId);
			this.activeProviderId = null;
		}
		if (!nextProvider || !nextProviderId) {
			this.options.engine.setActiveProvider(detectedProvider?.gameId ?? null, null, false);
			this.publishProviders();
			return;
		}
		if (this.activeProviderId === nextProviderId && nextProvider.getStatus().state === "listening") {
			await nextProvider.configure?.(settings.games[nextProvider.gameId] ?? {
				enabled: true,
				useGlobalTiming: true,
				events: {}
			});
			this.publishProviders();
			return;
		}
		const detectedGame = this.options.registry.getDetectedGame(nextProvider.id, this.detectedGames);
		try {
			await this.options.registry.start(nextProviderId, {
				gameId: nextProvider.gameId,
				displayName: nextProvider.displayName,
				source: this.activeSource,
				...detectedGame ? { detectedGame } : {},
				detectedGames: this.detectedGames,
				platform: process.platform,
				gameSettings: settings.games[nextProvider.gameId] ?? {
					enabled: true,
					useGlobalTiming: true,
					events: {}
				}
			});
			this.activeProviderId = nextProviderId;
		} catch (error) {
			this.options.engine.setActiveProvider(nextProvider.gameId, nextProvider.id, false);
			this.options.engine.setDegraded(error instanceof Error ? error.message : String(error));
		}
		this.publishProviders();
	}
	enqueue(operation) {
		const next = this.operation.catch(() => void 0).then(operation);
		this.operation = next.catch(() => void 0);
		return next;
	}
	discoveryContext() {
		return {
			detectedGames: this.detectedGames,
			platform: process.platform
		};
	}
	publishProviders() {
		const provider = this.activeProviderId ? this.options.registry.get(this.activeProviderId) : void 0;
		if (provider) {
			const status = provider.getStatus();
			this.options.engine.setActiveProvider(provider.gameId, provider.id, status.state === "listening");
			if (status.state === "degraded" || status.state === "error") this.options.engine.setDegraded(status.message ?? `${provider.displayName} needs attention.`);
		}
		this.options.onProvidersChanged(this.options.registry.snapshots(this.options.includeDevelopmentProviders()));
	}
};
//#endregion
//#region src/main/autocapture/providers/test-event-provider.ts
var supportedTestEvents = [
	"kill",
	"headshot",
	"multi_kill",
	"death",
	"round_win",
	"match_win"
];
var TestEventProvider = class {
	id = "switchboard-test-events";
	gameId = "switchboard-test";
	displayName = "Switchboard Test Game";
	supportLevel = "supported";
	source = "test";
	developmentOnly = true;
	capabilities = {
		events: supportedTestEvents,
		nativeMultiKill: true
	};
	listeners = /* @__PURE__ */ new Set();
	status = { state: "stopped" };
	starts = 0;
	matchesGame() {
		return false;
	}
	async detectAvailability(_context) {
		return { state: "available" };
	}
	async start(_context) {
		if (this.status.state === "listening") return;
		this.starts += 1;
		this.status = { state: "listening" };
	}
	async stop() {
		this.status = { state: "stopped" };
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	getStatus() {
		return { ...this.status };
	}
	emit(type, timestamp = Date.now()) {
		if (!supportedTestEvents.includes(type)) throw new Error(`The test provider cannot emit ${type}.`);
		if (this.status.state !== "listening") throw new Error("Start the Test Event Provider before emitting events.");
		const event = {
			id: randomUUID(),
			gameId: this.gameId,
			providerId: this.id,
			type,
			timestamp,
			confidence: 1,
			label: testLabel(type),
			...type === "multi_kill" ? { metadata: { count: 2 } } : {},
			source: "test"
		};
		this.status = {
			state: "listening",
			lastEventAt: timestamp
		};
		for (const listener of this.listeners) listener(event);
		return event;
	}
	get listenerCount() {
		return this.listeners.size;
	}
	get startCount() {
		return this.starts;
	}
};
function testLabel(type) {
	return {
		kill: "Kill",
		headshot: "Headshot",
		multi_kill: "Double Kill",
		death: "Death",
		round_win: "Round Win",
		match_win: "Match Win"
	}[type] ?? "Test Highlight";
}
//#endregion
//#region src/main/autocapture/providers/cs2/parser.ts
var cs2StateSchema = z.object({
	auth: z.object({ token: z.string().min(16).max(256) }).passthrough(),
	provider: z.object({
		appid: z.number().int().optional(),
		timestamp: z.number().int().nonnegative().optional()
	}).passthrough(),
	map: z.object({
		name: z.string().max(128).optional(),
		phase: z.string().max(32).optional(),
		round: z.number().int().nonnegative().optional(),
		team_ct: z.object({ score: z.number().int().nonnegative().optional() }).passthrough().optional(),
		team_t: z.object({ score: z.number().int().nonnegative().optional() }).passthrough().optional()
	}).passthrough().optional(),
	round: z.object({
		phase: z.string().max(32).optional(),
		win_team: z.enum(["CT", "T"]).optional()
	}).passthrough().optional(),
	player: z.object({
		team: z.enum(["CT", "T"]).optional(),
		activity: z.string().max(32).optional(),
		state: z.object({
			health: z.number().int().min(0).max(100).optional(),
			round_kills: z.number().int().nonnegative().optional(),
			round_killhs: z.number().int().nonnegative().optional()
		}).passthrough().optional(),
		match_stats: z.object({
			kills: z.number().int().nonnegative().optional(),
			assists: z.number().int().nonnegative().optional(),
			deaths: z.number().int().nonnegative().optional()
		}).passthrough().optional()
	}).passthrough().optional()
}).passthrough();
var cs2AuthSchema = z.object({ auth: z.object({ token: z.string().min(16).max(256) }).passthrough() }).passthrough();
function readCS2AuthToken(raw) {
	return cs2AuthSchema.parse(raw).auth.token;
}
var reconnectResetMs = 15e3;
var CS2TelemetryParser = class {
	previous = null;
	lastProviderTimestamp = 0;
	lastReceivedAt = 0;
	sequence = 0;
	parse(raw, receivedAt = Date.now()) {
		const state = cs2StateSchema.parse(raw);
		if (state.provider.appid !== void 0 && state.provider.appid !== 730) throw new Error("Ignored telemetry for a non-CS2 application.");
		const providerTimestamp = state.provider.timestamp ?? 0;
		if (providerTimestamp > 0 && providerTimestamp < this.lastProviderTimestamp) return {
			token: state.auth.token,
			events: []
		};
		this.lastProviderTimestamp = Math.max(this.lastProviderTimestamp, providerTimestamp);
		const current = counters(state);
		const disconnected = this.lastReceivedAt > 0 && receivedAt - this.lastReceivedAt > reconnectResetMs;
		this.lastReceivedAt = receivedAt;
		if (!this.previous || disconnected || current.mapName !== this.previous.mapName) {
			this.previous = current;
			return {
				token: state.auth.token,
				events: []
			};
		}
		const previous = this.previous;
		this.previous = current;
		const events = [];
		if (current.roundNumber === previous.roundNumber && current.roundKills >= previous.roundKills) {
			const killDelta = current.roundKills - previous.roundKills;
			const headshotDelta = Math.min(killDelta, Math.max(0, current.roundHeadshots - previous.roundHeadshots));
			for (let index = 0; index < killDelta; index += 1) {
				const headshot = index < headshotDelta;
				events.push(this.event(headshot ? "headshot" : "kill", receivedAt, {
					label: headshot ? "Headshot" : "Kill",
					metadata: {
						headshot,
						...current.roundNumber !== null ? { roundNumber: current.roundNumber } : {},
						sequence: this.nextSequence()
					}
				}));
			}
		}
		const assistDelta = positiveDelta(previous.assists, current.assists);
		for (let index = 0; index < assistDelta; index += 1) events.push(this.event("assist", receivedAt, {
			label: "Assist",
			metadata: {
				...current.roundNumber !== null ? { roundNumber: current.roundNumber } : {},
				sequence: this.nextSequence()
			}
		}));
		const deathDelta = positiveDelta(previous.deaths, current.deaths);
		for (let index = 0; index < deathDelta; index += 1) events.push(this.event("death", receivedAt, {
			label: "Death",
			metadata: {
				...current.roundNumber !== null ? { roundNumber: current.roundNumber } : {},
				sequence: this.nextSequence()
			}
		}));
		const roundFinished = current.roundPhase === "over" && previous.roundPhase !== "over";
		const winningTeam = state.round?.win_team;
		if (roundFinished && winningTeam && current.team) {
			const won = winningTeam === current.team;
			events.push(this.event(won ? "round_win" : "round_loss", receivedAt, {
				label: won ? "Round Win" : "Round Loss",
				metadata: {
					...current.roundNumber !== null ? { roundNumber: current.roundNumber } : {},
					team: current.team,
					sequence: this.nextSequence()
				}
			}));
		}
		if (current.mapPhase === "gameover" && previous.mapPhase !== "gameover" && current.team) {
			const scoreFor = current.team === "CT" ? current.scoreCT : current.scoreT;
			const scoreAgainst = current.team === "CT" ? current.scoreT : current.scoreCT;
			if (scoreFor !== scoreAgainst) {
				const won = scoreFor > scoreAgainst;
				events.push(this.event(won ? "match_win" : "match_loss", receivedAt, {
					label: won ? "Match Win" : "Match Loss",
					metadata: {
						scoreFor,
						scoreAgainst,
						team: current.team,
						sequence: this.nextSequence()
					}
				}));
			}
		}
		return {
			token: state.auth.token,
			events
		};
	}
	reset() {
		this.previous = null;
		this.lastProviderTimestamp = 0;
		this.lastReceivedAt = 0;
	}
	event(type, timestamp, details) {
		const sequence = details.metadata?.sequence ?? this.nextSequence();
		return {
			id: `cs2-${type}-${timestamp}-${sequence}-${createHash("sha256").update(`${type}:${timestamp}:${sequence}`).digest("hex").slice(0, 8)}`,
			gameId: "counter-strike-2",
			providerId: "cs2-gsi",
			type,
			timestamp,
			confidence: 1,
			...details,
			source: "telemetry"
		};
	}
	nextSequence() {
		this.sequence += 1;
		return this.sequence;
	}
};
function counters(state) {
	return {
		mapName: state.map?.name ?? null,
		mapPhase: state.map?.phase ?? null,
		roundNumber: state.map?.round ?? null,
		roundPhase: state.round?.phase ?? null,
		roundKills: state.player?.state?.round_kills ?? 0,
		roundHeadshots: state.player?.state?.round_killhs ?? 0,
		matchKills: state.player?.match_stats?.kills ?? 0,
		assists: state.player?.match_stats?.assists ?? 0,
		deaths: state.player?.match_stats?.deaths ?? 0,
		health: state.player?.state?.health ?? 0,
		team: state.player?.team ?? null,
		scoreCT: state.map?.team_ct?.score ?? 0,
		scoreT: state.map?.team_t?.score ?? 0
	};
}
function positiveDelta(previous, current) {
	return current >= previous ? Math.min(20, current - previous) : 0;
}
//#endregion
//#region src/main/autocapture/providers/cs2/cs2-provider.ts
var cs2Port = 32145;
var maximumPayloadBytes$1 = 262144;
var integrationFileName = "gamestate_integration_switchboard.cfg";
var CS2Provider = class {
	tokenPath;
	port;
	id = "cs2-gsi";
	gameId = "counter-strike-2";
	displayName = "Counter-Strike 2";
	supportLevel = "supported";
	source = "telemetry";
	capabilities = {
		events: [
			"kill",
			"headshot",
			"assist",
			"death",
			"round_win",
			"round_loss",
			"match_win",
			"match_loss"
		],
		nativeMultiKill: false
	};
	parser = new CS2TelemetryParser();
	listeners = /* @__PURE__ */ new Set();
	server = null;
	status = { state: "stopped" };
	token = null;
	payloadsReceived = 0;
	invalidPayloads = 0;
	eventsEmitted = 0;
	constructor(tokenPath, port = cs2Port) {
		this.tokenPath = tokenPath;
		this.port = port;
	}
	matchesGame(source, detectedGames) {
		const name = normalize$3(source.name);
		return name.includes("counter strike 2") || name === "cs2" || name.startsWith("cs2 ") || Boolean(this.findDetectedGame(detectedGames) && name.includes("counter strike"));
	}
	findDetectedGame(detectedGames) {
		return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === "steam://rungameid/730" || normalize$3(game.name).includes("counter strike 2"));
	}
	async detectAvailability(context) {
		if (context.platform !== "win32") return {
			state: "unavailable",
			reason: "CS2 Game State Integration is supported on Windows."
		};
		const game = this.findDetectedGame(context.detectedGames);
		if (!game) return {
			state: "unavailable",
			reason: "Counter-Strike 2 was not found in the detected game library."
		};
		const integrationPath = getIntegrationPath(game);
		try {
			const [token, config] = await Promise.all([readFile(this.tokenPath, "utf8"), readFile(integrationPath, "utf8")]);
			if (token.trim().length >= 32 && config.includes(token.trim())) return { state: "available" };
		} catch {}
		return {
			state: "setup-required",
			reason: "Install Switchboard’s local CS2 Game State Integration file before launching the game."
		};
	}
	async setup(context) {
		const game = this.findDetectedGame(context.detectedGames);
		if (!game) throw new Error("Counter-Strike 2 must be detected before its integration can be installed.");
		const integrationPath = getIntegrationPath(game);
		assertInside(game.installDirectory, integrationPath);
		const token = randomBytes(32).toString("hex");
		await mkdir(join(game.installDirectory, "game", "csgo", "cfg"), { recursive: true });
		await mkdir(dirname(this.tokenPath), { recursive: true });
		await atomicWrite(this.tokenPath, `${token}\n`);
		await atomicWrite(integrationPath, createIntegrationConfig(token));
		this.token = token;
		return { state: "available" };
	}
	async start(_context) {
		if (this.server) return;
		this.status = { state: "starting" };
		try {
			this.token = (await readFile(this.tokenPath, "utf8")).trim();
			if (this.token.length < 32) throw new Error("The CS2 integration token is missing or invalid.");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.status = {
				state: "error",
				message
			};
			throw error;
		}
		this.parser.reset();
		const server = createServer((request, response) => {
			this.handleRequest(request, response).catch((error) => {
				this.invalidPayloads += 1;
				if (!response.headersSent) response.writeHead(400);
				if (!response.writableEnded) response.end();
				this.status = {
					state: "degraded",
					message: error instanceof Error ? error.message : String(error)
				};
			});
		});
		server.requestTimeout = 5e3;
		server.headersTimeout = 5e3;
		this.server = server;
		await new Promise((resolvePromise, reject) => {
			const onError = (error) => {
				cleanup();
				this.server = null;
				this.status = {
					state: "error",
					message: error.message
				};
				reject(error);
			};
			const onListening = () => {
				cleanup();
				this.status = { state: "listening" };
				resolvePromise();
			};
			const cleanup = () => {
				server.removeListener("error", onError);
				server.removeListener("listening", onListening);
			};
			server.once("error", onError);
			server.once("listening", onListening);
			server.listen(this.port, "127.0.0.1");
		});
	}
	async stop() {
		const server = this.server;
		this.server = null;
		this.parser.reset();
		if (server) {
			server.closeAllConnections?.();
			await new Promise((resolvePromise) => server.close(() => resolvePromise()));
		}
		this.status = { state: "stopped" };
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	getStatus() {
		return { ...this.status };
	}
	async getDiagnostics() {
		const address = this.server?.address();
		return {
			port: typeof address === "object" && address ? address.port : this.port,
			payloadsReceived: this.payloadsReceived,
			invalidPayloads: this.invalidPayloads,
			eventsEmitted: this.eventsEmitted,
			listening: this.status.state === "listening"
		};
	}
	async handleRequest(request, response) {
		if (request.method !== "POST" || request.url !== "/game-state" || !isLoopback(request.socket.remoteAddress)) {
			response.writeHead(404).end();
			return;
		}
		let bytes = 0;
		const chunks = [];
		for await (const chunk of request) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += buffer.length;
			if (bytes > maximumPayloadBytes$1) throw new Error("CS2 telemetry exceeded the local payload limit.");
			chunks.push(buffer);
		}
		const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		const suppliedToken = readCS2AuthToken(payload);
		if (!this.token || !tokensMatch(suppliedToken, this.token)) throw new Error("CS2 telemetry authentication failed.");
		const parsed = this.parser.parse(payload);
		this.payloadsReceived += 1;
		for (const event of parsed.events) {
			this.eventsEmitted += 1;
			this.status = {
				state: "listening",
				lastEventAt: event.timestamp
			};
			for (const listener of this.listeners) listener(event);
		}
		response.writeHead(204).end();
	}
};
function createIntegrationConfig(token) {
	return `"Switchboard Auto Capture"\n{\n  "uri" "http://127.0.0.1:${cs2Port}/game-state"\n  "timeout" "5.0"\n  "buffer" "0.1"\n  "throttle" "0.1"\n  "heartbeat" "30.0"\n  "auth"\n  {\n    "token" "${token}"\n  }\n  "data"\n  {\n    "provider" "1"\n    "map" "1"\n    "round" "1"\n    "player_id" "1"\n    "player_state" "1"\n    "player_match_stats" "1"\n  }\n}\n`;
}
function getIntegrationPath(game) {
	return join(game.installDirectory, "game", "csgo", "cfg", integrationFileName);
}
function assertInside(root, target) {
	const normalizedRoot = resolve(root);
	const normalizedTarget = resolve(target);
	const child = relative(normalizedRoot, normalizedTarget);
	if (!child || child.startsWith(`..${sep}`) || child === ".." || isAbsolute(child)) throw new Error("Refused to write the CS2 integration outside the detected game directory.");
}
async function atomicWrite(path, contents) {
	const temporary = `${path}.switchboard-writing`;
	await writeFile(temporary, contents, "utf8");
	await rename(temporary, path);
	await access(path);
}
function tokensMatch(left, right) {
	const a = Buffer.from(left);
	const b = Buffer.from(right);
	return a.length === b.length && timingSafeEqual(a, b);
}
function normalize$3(value) {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function isLoopback(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
//#endregion
//#region src/main/autocapture/providers/war-thunder/parser.ts
var hudMessageSchema = z.object({
	id: z.number().int().nonnegative(),
	msg: z.string().trim().min(1).max(512),
	time: z.number().nonnegative().optional()
});
var warThunderHudResponseSchema = z.object({
	events: z.array(hudMessageSchema).max(4096).default([]),
	damage: z.array(hudMessageSchema).max(4096).default([])
});
var combatActions = [" destroyed ", " shot down "];
var WarThunderTelemetryParser = class {
	lastEventId = 0;
	lastDamageId = 0;
	reset() {
		this.lastEventId = 0;
		this.lastDamageId = 0;
	}
	baseline(payload) {
		const parsed = warThunderHudResponseSchema.parse(payload);
		this.lastEventId = highestId(parsed.events, this.lastEventId);
		this.lastDamageId = highestId(parsed.damage, this.lastDamageId);
	}
	parse(payload, player, receivedAt = Date.now()) {
		const parsed = warThunderHudResponseSchema.parse(payload);
		const messages = [...parsed.events.filter((message) => message.id > this.lastEventId).map((message) => ({
			...message,
			stream: "event"
		})), ...parsed.damage.filter((message) => message.id > this.lastDamageId).map((message) => ({
			...message,
			stream: "damage"
		}))].sort((left, right) => left.id - right.id);
		this.lastEventId = highestId(parsed.events, this.lastEventId);
		this.lastDamageId = highestId(parsed.damage, this.lastDamageId);
		if (!player) return [];
		const identity = typeof player === "string" ? {
			mode: "nickname",
			nickname: player
		} : player;
		const events = [];
		const emitted = /* @__PURE__ */ new Set();
		for (const message of messages) {
			const event = eventFromMessage(message, identity, receivedAt);
			if (!event || emitted.has(event.id)) continue;
			emitted.add(event.id);
			events.push(event);
		}
		return events;
	}
	cursor() {
		return {
			lastEventId: this.lastEventId,
			lastDamageId: this.lastDamageId
		};
	}
};
function eventFromMessage(message, identity, timestamp) {
	const combat = parseCombatAction(message.msg);
	if (combat) {
		if (combatantMatches(combat.actor, identity)) {
			if (isBaseTarget(combat.target)) return createEvent(message.stream, message.id, "objective", timestamp, "Base destroyed", {
				sequence: message.id,
				objective: "completed",
				code: "base_destroyed"
			});
			return createEvent(message.stream, message.id, "kill", timestamp, combat.action === "shot down" ? "Aircraft shot down" : "Target destroyed", {
				sequence: message.id,
				code: combat.action.replace(" ", "_")
			});
		}
		if (combatantMatches(combat.target, identity)) return createEvent(message.stream, message.id, "death", timestamp, "Vehicle lost", {
			sequence: message.id,
			code: combat.action.replace(" ", "_")
		});
		return null;
	}
	const crashActor = actorBeforeSuffix(message.msg, " has crashed");
	if (crashActor && combatantMatches(crashActor, identity)) return createEvent(message.stream, message.id, "death", timestamp, "Vehicle lost", {
		sequence: message.id,
		code: "crashed"
	});
	return null;
}
function createEvent(stream, sequence, type, timestamp, label, metadata) {
	return {
		id: `war-thunder-8111:${stream}:${sequence}:${type}`,
		gameId: "war-thunder",
		providerId: "war-thunder-8111",
		type,
		timestamp,
		confidence: 1,
		label,
		metadata,
		source: "api"
	};
}
function parseCombatAction(message) {
	const normalized = message.trim().replace(/[.!]+$/u, "");
	const lower = normalized.toLocaleLowerCase();
	for (const separator of combatActions) {
		const index = lower.indexOf(separator);
		if (index <= 0) continue;
		const targetStart = index + separator.length;
		const actor = normalized.slice(0, index).trim();
		const target = normalized.slice(targetStart).trim();
		if (!actor || !target) return null;
		return {
			actor,
			action: separator.trim(),
			target
		};
	}
	return null;
}
function actorBeforeSuffix(message, suffix) {
	const normalized = message.trim().replace(/[.!]+$/u, "");
	const index = normalized.toLocaleLowerCase().indexOf(suffix);
	if (index <= 0) return null;
	return normalized.slice(0, index).trim() || null;
}
function combatantMatches(value, identity) {
	const actor = normalizeCombatant(stripTrailingVehicle(value));
	const tagged = splitSquadron(actor);
	if (identity.mode === "anonymous") {
		const tag = normalizeSquadronTag(identity.squadronTag);
		return Boolean(tag) && tagged?.tag === tag && tagged.name === "player";
	}
	const player = normalizeCombatant(identity.nickname);
	return Boolean(player) && (actor === player || tagged?.name === player);
}
function splitSquadron(value) {
	const match = /^(?:\[([^\]]+)\]|=([^=]+)=|\^([^\^]+)\^|-([^-]+)-|\*([^*]+)\*)\s+(.+)$/u.exec(value);
	if (!match) return null;
	return {
		tag: (match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5]).trim(),
		name: match[6]
	};
}
function normalizeSquadronTag(value) {
	const normalized = normalizeCombatant(value);
	return splitSquadron(`${normalized} player`)?.tag ?? normalized;
}
function stripTrailingVehicle(value) {
	const input = value.trim();
	if (!input.endsWith(")")) return input;
	let depth = 0;
	for (let index = input.length - 1; index >= 0; index -= 1) {
		const character = input[index];
		if (character === ")") depth += 1;
		else if (character === "(") {
			depth -= 1;
			if (depth === 0 && index > 0 && input[index - 1] === " ") return input.slice(0, index - 1).trim();
		}
	}
	return input;
}
function normalizeCombatant(value) {
	return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}
function isBaseTarget(value) {
	const normalized = normalizeCombatant(value);
	return normalized === "a base" || normalized === "enemy base" || normalized.endsWith(" base");
}
function highestId(messages, current) {
	return messages.reduce((highest, message) => Math.max(highest, message.id), current);
}
//#endregion
//#region src/main/autocapture/providers/war-thunder/war-thunder-provider.ts
var steamAppId$1 = "236390";
var defaultPollIntervalMs = 750;
var requestTimeoutMs = 1e3;
var maximumPayloadBytes = 1048576;
var WarThunderProvider = class {
	id = "war-thunder-8111";
	gameId = "war-thunder";
	displayName = "War Thunder";
	supportLevel = "experimental";
	source = "api";
	capabilities = {
		events: [
			"kill",
			"death",
			"objective"
		],
		nativeMultiKill: false
	};
	requiresPlayerName = true;
	supportsAnonymousName = true;
	parser = new WarThunderTelemetryParser();
	listeners = /* @__PURE__ */ new Set();
	statusListeners = /* @__PURE__ */ new Set();
	publishedStatus = "";
	fetchImplementation;
	pollIntervalMs;
	endpoint;
	status = { state: "stopped" };
	playerIdentity = null;
	missingIdentityMessage = "Enter your War Thunder nickname to identify personal events.";
	timer = null;
	request = null;
	lifecycle = 0;
	initialized = false;
	degradedForMissingPlayerName = false;
	pollsCompleted = 0;
	failedPolls = 0;
	eventsEmitted = 0;
	constructor(options = {}) {
		this.fetchImplementation = options.fetch ?? fetch;
		this.pollIntervalMs = options.pollIntervalMs ?? defaultPollIntervalMs;
		this.endpoint = options.endpoint ?? "http://127.0.0.1:8111";
	}
	matchesGame(source, detectedGames) {
		const name = normalize$2(source.name);
		return name.includes("war thunder") || name === "aces" || name === "aces exe" || name === "aces be" || name === "aces be exe" || Boolean(this.findDetectedGame(detectedGames) && name.includes("war thunder"));
	}
	findDetectedGame(detectedGames) {
		return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${steamAppId$1}` || normalize$2(game.name) === "war thunder");
	}
	async detectAvailability(context) {
		if (context.platform !== "win32") return {
			state: "unavailable",
			reason: "War Thunder Auto Capture is supported on Windows."
		};
		if (!this.findDetectedGame(context.detectedGames)) return {
			state: "unavailable",
			reason: "War Thunder was not found in the detected game library."
		};
		return { state: "available" };
	}
	configure(settings) {
		const anonymous = settings.playerNameMode === "anonymous";
		const tag = normalizeSquadronTag(settings.playerSquadronTag ?? "");
		const nickname = settings.playerName?.trim();
		const anonymousPlaceholder = nickname?.toLocaleLowerCase() === "player";
		this.playerIdentity = anonymous ? tag ? {
			mode: "anonymous",
			squadronTag: tag
		} : null : nickname && !anonymousPlaceholder ? {
			mode: "nickname",
			nickname
		} : null;
		this.missingIdentityMessage = anonymous ? "Enter your squadron tag to match Player in War Thunder anonymous mode." : anonymousPlaceholder ? "Player is an anonymous name. Enable anonymous mode and enter your squadron tag." : "Enter your War Thunder nickname to identify personal events.";
		const wasMissingPlayerName = this.degradedForMissingPlayerName;
		this.degradedForMissingPlayerName = !this.playerIdentity;
		if (!this.playerIdentity && this.status.state !== "stopped" && this.status.state !== "starting") this.status = {
			state: "degraded",
			message: this.missingIdentityMessage
		};
		else if (this.playerIdentity && wasMissingPlayerName && this.initialized && this.status.state === "degraded") this.status = {
			state: "listening",
			...this.status.lastEventAt ? { lastEventAt: this.status.lastEventAt } : {}
		};
		this.publishStatus();
	}
	async start(context) {
		if (this.timer || this.request || this.status.state === "listening" || this.status.state === "degraded") return;
		this.configure(context.gameSettings ?? {
			enabled: true,
			useGlobalTiming: true,
			events: {}
		});
		const lifecycle = ++this.lifecycle;
		this.status = { state: "starting" };
		this.parser.reset();
		this.initialized = false;
		this.degradedForMissingPlayerName = false;
		await this.poll(lifecycle, true);
		this.schedule(lifecycle);
	}
	async stop() {
		this.lifecycle += 1;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
		this.request?.abort();
		this.request = null;
		this.parser.reset();
		this.initialized = false;
		this.status = { state: "stopped" };
		this.publishStatus();
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	getStatus() {
		return { ...this.status };
	}
	subscribeStatus(listener) {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}
	publishStatus() {
		const signature = JSON.stringify(this.status);
		if (signature === this.publishedStatus) return;
		this.publishedStatus = signature;
		for (const listener of this.statusListeners) listener();
	}
	async getDiagnostics() {
		return {
			endpoint: this.endpoint,
			pollIntervalMs: this.pollIntervalMs,
			pollsCompleted: this.pollsCompleted,
			failedPolls: this.failedPolls,
			eventsEmitted: this.eventsEmitted,
			initialized: this.initialized,
			playerNameConfigured: Boolean(this.playerIdentity),
			identityMode: this.playerIdentity?.mode ?? "unconfigured"
		};
	}
	schedule(lifecycle) {
		if (lifecycle !== this.lifecycle) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.poll(lifecycle, false).finally(() => this.schedule(lifecycle));
		}, this.pollIntervalMs);
		this.timer.unref?.();
	}
	async poll(lifecycle, baseline) {
		if (lifecycle !== this.lifecycle) return;
		try {
			const payload = await this.fetchHud(lifecycle, baseline);
			if (lifecycle !== this.lifecycle) return;
			this.pollsCompleted += 1;
			if (baseline || !this.initialized) {
				this.parser.baseline(payload);
				this.initialized = true;
			} else for (const event of this.parser.parse(payload, this.playerIdentity)) {
				this.eventsEmitted += 1;
				this.status = {
					state: "listening",
					lastEventAt: event.timestamp
				};
				for (const listener of this.listeners) listener(event);
			}
			if (!this.playerIdentity) {
				this.degradedForMissingPlayerName = true;
				this.status = {
					state: "degraded",
					message: this.missingIdentityMessage
				};
			} else if (this.status.state !== "listening" || !this.status.lastEventAt) {
				this.degradedForMissingPlayerName = false;
				this.status = { state: "listening" };
			}
		} catch (error) {
			if (lifecycle !== this.lifecycle) return;
			this.failedPolls += 1;
			this.degradedForMissingPlayerName = false;
			this.status = {
				state: "degraded",
				message: error instanceof Error && error.name !== "AbortError" ? `War Thunder local API: ${error.message}` : "Waiting for War Thunder’s local API."
			};
		} finally {
			if (lifecycle === this.lifecycle) this.publishStatus();
		}
	}
	async fetchHud(lifecycle, baseline) {
		const cursor = baseline ? {
			lastEventId: 0,
			lastDamageId: 0
		} : this.parser.cursor();
		const request = new AbortController();
		this.request = request;
		const timeout = setTimeout(() => request.abort(), requestTimeoutMs);
		timeout.unref?.();
		try {
			const response = await this.fetchImplementation(`${this.endpoint}/hudmsg?lastEvt=${cursor.lastEventId}&lastDmg=${cursor.lastDamageId}`, {
				headers: { Accept: "application/json" },
				signal: request.signal
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			if (Number(response.headers.get("content-length") ?? 0) > maximumPayloadBytes) throw new Error("telemetry exceeded the local payload limit");
			const buffer = await response.arrayBuffer();
			if (buffer.byteLength > maximumPayloadBytes) throw new Error("telemetry exceeded the local payload limit");
			return JSON.parse(new TextDecoder().decode(buffer));
		} finally {
			clearTimeout(timeout);
			if (lifecycle === this.lifecycle && this.request === request) this.request = null;
		}
	}
};
function normalize$2(value) {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
//#endregion
//#region src/main/capture-source-previews.ts
function desktopCaptureTypesForSources(sources) {
	const types = [];
	if (sources.some((source) => source.type === "display")) types.push("screen");
	if (sources.some((source) => source.type === "window")) types.push("window");
	return types;
}
function desktopCaptureRequestsForSources(sources, platform = process.platform) {
	const types = desktopCaptureTypesForSources(sources);
	if (types.length === 0) return [];
	if (platform !== "win32" || !types.includes("window")) return [{
		types,
		thumbnailSize: {
			width: 320,
			height: 180
		}
	}];
	const requests = [];
	if (types.includes("screen")) requests.push({
		types: ["screen"],
		thumbnailSize: {
			width: 320,
			height: 180
		}
	});
	requests.push({
		types: ["window"],
		thumbnailSize: {
			width: 0,
			height: 0
		}
	});
	return requests;
}
function matchDesktopCaptureSource(source, nativeSources, captureIndexedDisplayIds) {
	if (source.type === "display") {
		const displays = nativeSources.filter((candidate) => candidate.id.startsWith("screen:"));
		const displayIndex = Number(source.displayId ?? source.id.replace(/^display:/, ""));
		const windowsDisplayId = captureIndexedDisplayIds[displayIndex];
		return displays.find((candidate) => candidate.display_id === String(windowsDisplayId)) ?? displays[displayIndex];
	}
	if (source.type === "window") {
		const windowHandle = source.windowHandle ?? source.id.replace(/^window:/, "");
		return nativeSources.find((candidate) => {
			if (!candidate.id.startsWith("window:")) return false;
			const [nativeWindowHandle] = candidate.id.slice(7).split(":");
			return nativeWindowHandle === windowHandle;
		});
	}
}
function onlySourcesAvailableToElectron(sources, nativeSources, captureIndexedDisplayIds) {
	return sources.filter((source) => {
		if (source.type !== "window") return true;
		if (isSystemOrOverlayWindow(source.name)) return false;
		return matchDesktopCaptureSource(source, nativeSources, captureIndexedDisplayIds) !== void 0;
	});
}
function isSystemOrOverlayWindow(name) {
	const normalized = name.trim().toLocaleLowerCase();
	return normalized === "program manager" || normalized.startsWith("cua.agentcursoroverlay.");
}
function preserveValidatedWindowSources(incomingSources, validatedSources) {
	const validatedWindowIds = new Set(validatedSources.filter((source) => source.type === "window").map((source) => source.id));
	return incomingSources.filter((source) => source.type !== "window" || validatedWindowIds.has(source.id));
}
//#endregion
//#region src/main/autocapture/providers/wardogs/wardogs-provider.ts
var steamAppIds = ["1867240", "4809930"];
var unavailableKillFeedReason = "WARDOGS does not expose a verified local kill feed yet. Manual replay and reaction clipping remain available.";
/**
* WARDOGS kill/death capability placeholder.
*
* The Unreal Engine 5 client runs under Easy Anti-Cheat, publishes no documented
* local telemetry, and writes no kill-bearing client log or localhost feed that
* Switchboard could read safely. The provider therefore stays unavailable: it
* matches the running game so Settings can explain the gap, but it never starts
* a runtime, timer, listener, or handle. A future safe source (read-only client
* log format validated against a retail build, or an official event API) can
* implement `start` behind this same game identity without renderer changes.
*/
var WardogsProvider = class {
	id = "wardogs-events";
	gameId = "wardogs";
	displayName = "WARDOGS";
	supportLevel = "unavailable";
	source = "log";
	capabilities = {
		events: ["kill", "death"],
		nativeMultiKill: false
	};
	listeners = /* @__PURE__ */ new Set();
	status = { state: "stopped" };
	matchesGame(source, detectedGames) {
		const name = normalize$1(source.name);
		if (name.includes("launcher")) return false;
		if (name.includes("wardogs")) return true;
		return Boolean(this.findDetectedGame(detectedGames) && name.includes("wardog"));
	}
	findDetectedGame(detectedGames) {
		return detectedGames.find((game) => game.launchUri && steamAppIds.some((appId) => game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${appId}`) || normalize$1(game.name) === "wardogs" || normalize$1(game.name) === "wardogs playtest");
	}
	async detectAvailability(context) {
		if (context.platform !== "win32") return {
			state: "unavailable",
			reason: "WARDOGS Auto Capture is supported on Windows."
		};
		if (!this.findDetectedGame(context.detectedGames)) return {
			state: "unavailable",
			reason: "WARDOGS was not found in the detected game library."
		};
		return {
			state: "unavailable",
			reason: unavailableKillFeedReason
		};
	}
	async start(_context) {
		this.status = {
			state: "degraded",
			message: unavailableKillFeedReason
		};
	}
	async stop() {
		this.status = { state: "stopped" };
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	getStatus() {
		return { ...this.status };
	}
	async getDiagnostics() {
		return {
			integration: "unverified",
			killFeed: "unavailable",
			listeners: this.listeners.size
		};
	}
};
function normalize$1(value) {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
//#endregion
//#region src/main/autocapture/providers/battlefield-6/parser.ts
var gepEventSchema = z.object({
	name: z.string().trim().min(1).max(64),
	data: z.union([z.string().max(64), z.null()]).optional()
});
var battlefield6GepPayloadSchema = z.object({ events: z.array(gepEventSchema).max(32) });
var battlefield6GepInfoSchema = z.object({
	feature: z.string().trim().min(1).max(64),
	category: z.string().trim().min(1).max(64),
	key: z.string().trim().min(1).max(64),
	value: z.string().max(64)
});
var Battlefield6EventParser = class {
	createSessionId;
	sequence = 0;
	sessionId = "";
	constructor(createSessionId = randomUUID) {
		this.createSessionId = createSessionId;
		this.beginSession();
	}
	beginSession() {
		this.sessionId = this.createSessionId();
		this.sequence = 0;
	}
	parse(payload, receivedAt = Date.now()) {
		const parsed = battlefield6GepPayloadSchema.parse(payload);
		const events = [];
		for (const event of parsed.events) {
			const normalized = normalizeEvent(event.name, event.data);
			if (!normalized) continue;
			this.sequence += 1;
			events.push({
				id: `battlefield-6-overwolf-gep:${this.sessionId}:${this.sequence}`,
				gameId: "battlefield-6",
				providerId: "battlefield-6-overwolf-gep",
				type: normalized.type,
				timestamp: receivedAt,
				confidence: 1,
				label: normalized.label,
				metadata: {
					code: normalized.code,
					sequence: this.sequence
				},
				source: "api"
			});
		}
		return events;
	}
	readScene(payload) {
		const parsed = battlefield6GepInfoSchema.safeParse(payload);
		if (!parsed.success || parsed.data.feature !== "game_info" || parsed.data.key !== "scene") return null;
		return parsed.data.value === "lobby" || parsed.data.value === "ingame" || parsed.data.value === "summary" ? parsed.data.value : null;
	}
};
function normalizeEvent(name, data) {
	if (name === "elimination" && (data === void 0 || data === null || data === "" || data === "elimination")) return {
		type: "kill",
		label: "Elimination",
		code: "elimination"
	};
	if (name === "knockdown" && (data === void 0 || data === null || data === "" || data === "knockdown")) return {
		type: "knockdown",
		label: "Knocked Down",
		code: "knockdown"
	};
	if (name === "round_outcome" && data === "victory") return {
		type: "round_win",
		label: "Victory",
		code: "victory"
	};
	if (name === "round_outcome" && data === "defeat") return {
		type: "round_loss",
		label: "Defeat",
		code: "defeat"
	};
	return null;
}
//#endregion
//#region src/main/autocapture/providers/battlefield-6/overwolf-gep-session.ts
var battlefield6GepGameId = 26462;
var requiredFeatures = ["game_info", "match_info"];
var packageReadyTimeoutMs = 1e4;
function hasOverwolfGepRuntime(runtime) {
	const packages = runtime.overwolf?.packages;
	return Boolean(packages && typeof packages.on === "function" && typeof packages.removeListener === "function");
}
var OverwolfBattlefield6GepSession = class {
	runtime;
	callbacks = null;
	packages = null;
	api = null;
	readyTimeout = null;
	started = false;
	constructor(runtime) {
		this.runtime = runtime;
	}
	start(callbacks) {
		if (this.started) return;
		const packages = this.runtime.overwolf?.packages;
		if (!packages) {
			callbacks.onError("The Overwolf Game Events runtime is unavailable.");
			return;
		}
		this.started = true;
		this.callbacks = callbacks;
		this.packages = packages;
		packages.on("ready", this.onPackageReady);
		if (packages.gep) this.attachApi(packages.gep);
		if (!this.api) {
			callbacks.onWaiting("Waiting for the Overwolf Game Events package.");
			this.readyTimeout = setTimeout(() => {
				this.readyTimeout = null;
				this.callbacks?.onError("The Overwolf Game Events package did not become ready.");
			}, packageReadyTimeoutMs);
			this.readyTimeout.unref?.();
		}
	}
	stop() {
		if (this.readyTimeout) clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
		this.packages?.removeListener("ready", this.onPackageReady);
		this.detachApi();
		this.packages = null;
		this.callbacks = null;
		this.started = false;
	}
	onPackageReady = (...arguments_) => {
		if (readStringArgument(arguments_, 1) !== "gep") return;
		const api = this.packages?.gep;
		if (!api) {
			this.callbacks?.onError("The Overwolf Game Events package reported ready without an API.");
			return;
		}
		this.attachApi(api);
	};
	attachApi(api) {
		if (this.api === api) return;
		this.detachApi();
		this.api = api;
		if (this.readyTimeout) clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
		api.on("game-detected", this.onGameDetected);
		api.on("elevated-privileges-required", this.onElevatedPrivilegesRequired);
		api.on("new-info-update", this.onInfoUpdate);
		api.on("new-game-event", this.onGameEvent);
		api.on("error", this.onError);
		api.on("game-exit", this.onGameExit);
		this.callbacks?.onWaiting("Waiting for Battlefield 6 telemetry.");
	}
	detachApi() {
		const api = this.api;
		if (!api) return;
		api.removeListener("game-detected", this.onGameDetected);
		api.removeListener("elevated-privileges-required", this.onElevatedPrivilegesRequired);
		api.removeListener("new-info-update", this.onInfoUpdate);
		api.removeListener("new-game-event", this.onGameEvent);
		api.removeListener("error", this.onError);
		api.removeListener("game-exit", this.onGameExit);
		this.api = null;
	}
	onGameDetected = (...arguments_) => {
		if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
		const launchEvent = arguments_[0];
		if (!isGepLaunchEvent(launchEvent)) {
			this.callbacks?.onError("Battlefield 6 telemetry returned an invalid launch event.");
			return;
		}
		try {
			launchEvent.enable();
		} catch (error) {
			this.callbacks?.onError(`Battlefield 6 telemetry could not be enabled: ${errorMessage$2(error)}`);
			return;
		}
		this.api?.setRequiredFeatures(battlefield6GepGameId, requiredFeatures).then(() => this.callbacks?.onListening()).catch((error) => {
			this.callbacks?.onError(`Battlefield 6 telemetry features could not be enabled: ${errorMessage$2(error)}`);
		});
	};
	onElevatedPrivilegesRequired = (...arguments_) => {
		if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
		this.callbacks?.onError("Battlefield 6 is elevated. Run the Overwolf Switchboard build at the same privilege level.");
	};
	onInfoUpdate = (...arguments_) => {
		if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
		this.callbacks?.onListening();
		this.callbacks?.onInfo(arguments_[2]);
	};
	onGameEvent = (...arguments_) => {
		if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
		this.callbacks?.onListening();
		this.callbacks?.onEvent(arguments_[2]);
	};
	onError = (...arguments_) => {
		const gameId = readNumberArgument(arguments_, 1);
		if (gameId !== null && gameId !== battlefield6GepGameId) return;
		this.callbacks?.onError(`Overwolf Game Events error: ${boundedMessage(arguments_[2])}`);
	};
	onGameExit = (...arguments_) => {
		if (readNumberArgument(arguments_, 1) !== battlefield6GepGameId) return;
		this.callbacks?.onWaiting("Waiting for Battlefield 6 telemetry.");
	};
};
function isGepLaunchEvent(value) {
	return typeof value === "object" && value !== null && typeof value.enable === "function";
}
function readNumberArgument(arguments_, index) {
	const value = arguments_[index];
	return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function readStringArgument(arguments_, index) {
	const value = arguments_[index];
	return typeof value === "string" ? value : null;
}
function errorMessage$2(error) {
	return boundedMessage(error instanceof Error ? error.message : error);
}
function boundedMessage(value) {
	return (typeof value === "string" ? value : "unknown error").trim().slice(0, 160) || "unknown error";
}
//#endregion
//#region src/main/autocapture/providers/battlefield-6/battlefield-6-provider.ts
var steamAppId = "2807960";
var Battlefield6Provider = class {
	options;
	id = "battlefield-6-overwolf-gep";
	gameId = "battlefield-6";
	displayName = "Battlefield 6";
	supportLevel = "experimental";
	source = "api";
	capabilities = {
		events: [
			"kill",
			"knockdown",
			"round_win",
			"round_loss"
		],
		nativeMultiKill: false
	};
	listeners = /* @__PURE__ */ new Set();
	statusListeners = /* @__PURE__ */ new Set();
	parser;
	createSession;
	session = null;
	status = { state: "stopped" };
	eventsReceived = 0;
	eventsEmitted = 0;
	invalidPayloads = 0;
	scene = null;
	constructor(options) {
		this.options = options;
		this.parser = options.createParser?.() ?? new Battlefield6EventParser();
		this.createSession = options.createSession ?? (() => new OverwolfBattlefield6GepSession(options.runtime));
	}
	matchesGame(source, detectedGames) {
		const name = normalize(source.name);
		return name === "bf6" || name === "bf6 exe" || name.includes("battlefield 6") || Boolean(this.findDetectedGame(detectedGames) && name.includes("battlefield"));
	}
	findDetectedGame(detectedGames) {
		return detectedGames.find((game) => game.launchUri?.toLocaleLowerCase() === `steam://rungameid/${steamAppId}` || normalize(game.name) === "battlefield 6" || normalize(game.executablePath ? basename(game.executablePath) : "") === "bf6 exe");
	}
	async detectAvailability(context) {
		if (context.platform !== "win32") return {
			state: "unavailable",
			reason: "Battlefield 6 Auto Capture is supported on Windows."
		};
		if (!this.findDetectedGame(context.detectedGames)) return {
			state: "unavailable",
			reason: "Battlefield 6 was not found in the detected game library."
		};
		if (!hasOverwolfGepRuntime(this.options.runtime)) return {
			state: "unavailable",
			reason: "Battlefield 6 events require an Overwolf-enabled Switchboard build."
		};
		if (!this.options.gameEventsEnabled) return {
			state: "unavailable",
			reason: "Overwolf has not enabled Battlefield 6 events for this Switchboard build."
		};
		return { state: "available" };
	}
	async start(_context) {
		if (this.session) return;
		this.parser.beginSession();
		this.setStatus({
			state: "starting",
			message: "Waiting for Battlefield 6 telemetry."
		});
		const session = this.createSession();
		this.session = session;
		session.start({
			onListening: () => this.setStatus({
				state: "listening",
				...this.status.lastEventAt ? { lastEventAt: this.status.lastEventAt } : {}
			}),
			onWaiting: (message) => this.setStatus({
				state: "starting",
				message
			}),
			onEvent: (payload) => this.handlePayload(payload),
			onInfo: (payload) => this.handleInfo(payload),
			onError: (message) => this.setStatus({
				state: "degraded",
				message
			})
		});
	}
	async stop() {
		this.session?.stop();
		this.session = null;
		this.scene = null;
		this.setStatus({ state: "stopped" });
	}
	subscribe(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	subscribeStatus(listener) {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}
	getStatus() {
		return { ...this.status };
	}
	async getDiagnostics() {
		return {
			integration: "overwolf-gep",
			overwolfGameId: 26462,
			runtimeAvailable: hasOverwolfGepRuntime(this.options.runtime),
			gameEventsEnabled: this.options.gameEventsEnabled ?? false,
			sessionActive: Boolean(this.session),
			scene: this.scene,
			eventsReceived: this.eventsReceived,
			eventsEmitted: this.eventsEmitted,
			invalidPayloads: this.invalidPayloads
		};
	}
	handlePayload(payload) {
		this.eventsReceived += 1;
		try {
			for (const event of this.parser.parse(payload)) {
				this.eventsEmitted += 1;
				this.setStatus({
					state: "listening",
					lastEventAt: event.timestamp
				});
				for (const listener of this.listeners) listener(event);
			}
		} catch {
			this.invalidPayloads += 1;
			this.setStatus({
				state: "degraded",
				message: "Battlefield 6 returned an invalid telemetry payload."
			});
		}
	}
	handleInfo(payload) {
		const scene = this.parser.readScene(payload);
		if (scene) this.scene = scene;
	}
	setStatus(status) {
		if (JSON.stringify(status) === JSON.stringify(this.status)) return;
		this.status = status;
		for (const listener of this.statusListeners) listener();
	}
};
function normalize(value) {
	return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
//#endregion
//#region src/main/capture-microphone-routing.ts
function matchesSelectedMicrophone(device, selectedName) {
	return device.direction === "input" && device.available && device.name === selectedName;
}
function findAvailableDevice(devices, deviceId, direction) {
	if (!deviceId) return null;
	return devices.find((device) => device.id === deviceId && device.direction === direction && device.available)?.id ?? null;
}
function resolveCaptureMicrophoneDeviceId(audio) {
	const explicit = audio.capture?.microphoneDeviceId;
	const explicitMatch = explicit ? findAvailableDevice(audio.devices, explicit, "input") : null;
	if (explicitMatch) return explicitMatch;
	if (explicit) return null;
	const confirmedInput = audio.host?.microphone?.activeInputDeviceId;
	if (confirmedInput) return confirmedInput;
	if (!audio.microphoneDevice) return null;
	return audio.devices.find((device) => matchesSelectedMicrophone(device, audio.microphoneDevice))?.id ?? null;
}
function resolveCaptureSystemAudioDeviceId(audio) {
	return findAvailableDevice(audio.devices, audio.capture?.systemAudioDeviceId, "output");
}
function resolveCaptureChatAudioDeviceId(audio) {
	return findAvailableDevice(audio.devices, audio.capture?.chatAudioDeviceId, "output");
}
//#endregion
//#region src/main/services/module-authoring.ts
var moduleManifestFilename = "switchboard.module.json";
var maximumModuleSourceBytes = 524288;
async function createModuleProject(parentDirectory, input, coreVersion) {
	const parent = resolve(parentDirectory);
	const target = resolve(parent, projectFolderName(input.id));
	assertChildPath(parent, target);
	await mkdir(target, { recursive: false });
	try {
		await mkdir(resolve(target, "src"));
		await mkdir(resolve(target, "test"));
		const files = scaffoldFiles(input, createManifest(input, coreVersion));
		await Promise.all(Object.entries(files).map(([file, contents]) => {
			const destination = resolve(target, file);
			assertChildPath(target, destination);
			return writeFile(destination, contents, "utf8");
		}));
		return target;
	} catch (error) {
		await rm(target, {
			recursive: true,
			force: true
		});
		throw error;
	}
}
async function validateModuleProject(projectDirectory, coreVersion) {
	const projectPath = resolve(projectDirectory);
	const issues = [];
	const manifestPath = resolve(projectPath, moduleManifestFilename);
	let manifestSource;
	try {
		if (!(await stat(projectPath)).isDirectory()) throw new Error("The selected path is not a directory.");
		manifestSource = await readFile(manifestPath, "utf8");
	} catch (error) {
		const code = error.code;
		issues.push({
			severity: "error",
			code: code === "ENOENT" ? "manifest-missing" : "project-unreadable",
			message: code === "ENOENT" ? `${moduleManifestFilename} was not found in this project.` : `The project could not be read: ${errorMessage$1(error)}`,
			file: moduleManifestFilename
		});
		return {
			issues,
			status: "missing",
			sizeMb: 0
		};
	}
	if (Buffer.byteLength(manifestSource, "utf8") > 131072) {
		issues.push({
			severity: "error",
			code: "manifest-too-large",
			message: "The manifest exceeds the 128 KB authoring limit.",
			file: moduleManifestFilename
		});
		return {
			issues,
			status: "invalid",
			sizeMb: 0
		};
	}
	let rawManifest;
	try {
		rawManifest = JSON.parse(manifestSource);
	} catch (error) {
		issues.push({
			severity: "error",
			code: "manifest-json",
			message: `The manifest is not valid JSON: ${errorMessage$1(error)}`,
			file: moduleManifestFilename
		});
		return {
			issues,
			status: "invalid",
			sizeMb: 0
		};
	}
	const parsed = addonProjectManifestSchema.safeParse(rawManifest);
	if (!parsed.success) {
		for (const issue of parsed.error.issues.slice(0, 32)) issues.push({
			severity: "error",
			code: "manifest-schema",
			message: `${issue.path.join(".") || "manifest"}: ${issue.message}`,
			file: moduleManifestFilename
		});
		return {
			issues,
			status: "invalid",
			sizeMb: 0
		};
	}
	const manifest = parsed.data;
	if (manifest.kind !== "device") issues.push({
		severity: "error",
		code: "api-kind-unavailable",
		message: `Module Host API v1 runs device-discovery add-ons only; ${manifest.kind} hooks are not available yet.`,
		file: moduleManifestFilename
	});
	if (!manifest.capabilities.includes("device-discovery")) issues.push({
		severity: "error",
		code: "capability-required",
		message: "API v1 requires the device-discovery capability.",
		file: moduleManifestFilename
	});
	const unsupportedCapabilities = manifest.capabilities.filter((capability) => capability !== "device-discovery");
	if (unsupportedCapabilities.length > 0) issues.push({
		severity: "warning",
		code: "capability-not-brokered",
		message: `These capabilities are descriptive only in API v1: ${unsupportedCapabilities.join(", ")}.`,
		file: moduleManifestFilename
	});
	if (compareVersions(manifest.minimumCoreVersion, coreVersion) > 0) issues.push({
		severity: "error",
		code: "core-version",
		message: `This project requires Switchboard ${manifest.minimumCoreVersion}; the current core is ${coreVersion}.`,
		file: moduleManifestFilename
	});
	const entrypointPath = resolve(projectPath, manifest.entrypoint);
	const entrypointRelative = relative(projectPath, entrypointPath);
	if (isAbsolute(manifest.entrypoint) || entrypointRelative.startsWith("..") || isAbsolute(entrypointRelative)) {
		issues.push({
			severity: "error",
			code: "entrypoint-outside-project",
			message: "The entrypoint must stay inside the module project directory.",
			file: moduleManifestFilename
		});
		return finishValidation(manifest, void 0, issues, 0);
	}
	if (![".js", ".mjs"].includes(extname(entrypointPath).toLocaleLowerCase())) {
		issues.push({
			severity: "error",
			code: "entrypoint-format",
			message: "The sandbox entrypoint must be a JavaScript .js or .mjs file.",
			file: manifest.entrypoint
		});
		return finishValidation(manifest, void 0, issues, 0);
	}
	let entrypointSource;
	let entrypointBytes = 0;
	try {
		const entrypointStat = await stat(entrypointPath);
		if (!entrypointStat.isFile()) throw new Error("The entrypoint is not a file.");
		entrypointBytes = entrypointStat.size;
		if (entrypointBytes > 524288) throw new Error(`The entrypoint exceeds the ${maximumModuleSourceBytes / 1024} KB limit.`);
		entrypointSource = await readFile(entrypointPath, "utf8");
	} catch (error) {
		issues.push({
			severity: "error",
			code: "entrypoint-unreadable",
			message: `The entrypoint could not be loaded: ${errorMessage$1(error)}`,
			file: manifest.entrypoint
		});
		return finishValidation(manifest, void 0, issues, entrypointBytes);
	}
	if (containsModuleImport(entrypointSource)) issues.push({
		severity: "error",
		code: "entrypoint-import",
		message: "Module Host API v1 uses a single-file entrypoint; static and dynamic imports are not allowed.",
		file: manifest.entrypoint
	});
	if (!/\bexport\s+default\b/.test(entrypointSource)) issues.push({
		severity: "error",
		code: "entrypoint-export",
		message: "The entrypoint must export one add-on object as its default export.",
		file: manifest.entrypoint
	});
	const permissionKeys = /* @__PURE__ */ new Set();
	for (const permission of manifest.permissions.hid) for (const productId of permission.productIds) {
		const key = `${permission.vendorId.toLocaleLowerCase()}:${productId.toLocaleLowerCase()}`;
		if (permissionKeys.has(key)) issues.push({
			severity: "warning",
			code: "permission-duplicate",
			message: `HID permission ${key} is declared more than once.`,
			file: moduleManifestFilename
		});
		permissionKeys.add(key);
	}
	return finishValidation(manifest, entrypointPath, issues, entrypointBytes + Buffer.byteLength(manifestSource, "utf8"));
}
function moduleManifestFromProject(projectPath, validation, enabled) {
	if (!validation.manifest) throw new Error("A valid manifest is required before the project can be linked.");
	const manifest = validation.manifest;
	return {
		id: manifest.id,
		name: manifest.name,
		description: manifest.description,
		version: manifest.version,
		kind: manifest.kind,
		sizeMb: validation.sizeMb,
		installed: true,
		enabled,
		official: false,
		restartRequired: false,
		capabilities: [...manifest.capabilities],
		vendors: manifest.permissions.hid.map((permission) => permission.vendorId.toLocaleLowerCase()),
		source: "local",
		author: manifest.author,
		development: {
			projectPath: resolve(projectPath),
			sdkVersion: 1,
			status: validation.status,
			lastValidatedAt: (/* @__PURE__ */ new Date()).toISOString(),
			issues: validation.issues
		}
	};
}
function scaffoldFiles(input, manifest) {
	const manifestJson = `${JSON.stringify({
		$schema: "./switchboard-module.schema.json",
		...manifest
	}, null, 2)}\n`;
	const entrypoint = `const MODULE_ID = ${JSON.stringify(input.id)};
const MATCH_VENDOR_ID = 0x${input.vendorId.toLocaleLowerCase()};
const MATCH_PRODUCT_ID = 0x${input.productId.toLocaleLowerCase()};

export default {
  async detect(context) {
    return context.hidDevices
      .filter((device) => device.vendorId === MATCH_VENDOR_ID && device.productId === MATCH_PRODUCT_ID)
      .map((device) => ({
        deviceKey: device.deviceKey,
        displayName: ${JSON.stringify(input.model)},
        kind: ${JSON.stringify(input.deviceKind)},
        identity: {
          manufacturer: device.manufacturer || ${JSON.stringify(input.manufacturer)},
          model: ${JSON.stringify(input.model)},
          connection: 'usb',
          connectionLabel: 'USB',
        },
      }));
  },
};

// ${input.name} runs in Module Host API v1. It cannot access Node,
// Electron, the filesystem, the network, raw IPC, or devices outside the
// VID/PID pairs declared in switchboard.module.json.
void MODULE_ID;
`;
	const packageJson = `${JSON.stringify({
		name: input.id,
		version: "0.1.0",
		private: true,
		type: "module",
		scripts: {
			check: "node --check ./src/index.js",
			test: "node --test ./test/module.test.js"
		}
	}, null, 2)}\n`;
	const importKeyword = "import";
	const test = `${importKeyword} test from 'node:test';
${importKeyword} assert from 'node:assert/strict';
${importKeyword} addon from '../src/index.js';

test('detects only the declared device', async () => {
  const devices = await addon.detect({
    apiVersion: 1,
    platform: 'win32',
    hidDevices: [
      { deviceKey: 'match', vendorId: 0x${input.vendorId.toLocaleLowerCase()}, productId: 0x${input.productId.toLocaleLowerCase()} },
      { deviceKey: 'other', vendorId: 0xffff, productId: 0xffff },
    ],
  });
  assert.equal(devices.length, 1);
  assert.equal(devices[0].deviceKey, 'match');
  assert.equal(devices[0].displayName, ${JSON.stringify(input.model)});
});
`;
	const readme = `# ${input.name}

${input.description}

This is a Switchboard local device-discovery add-on for Module Host API v1.

## Develop

1. Edit \`src/index.js\`.
2. Run \`npm test\` or \`bun test\` in this directory.
3. In Switchboard, open **Settings > Modules**, select **Validate** on this linked project, then enable it.
4. Use **Refresh devices** from the Devices workspace after connecting matching hardware.

The starter matches USB HID \`${input.vendorId.toLocaleUpperCase()}:${input.productId.toLocaleUpperCase()}\` and reports identity only. The host validates every result and builds the canonical Switchboard device object itself.

## Security and capability boundary

The entrypoint runs in a hidden sandboxed Chromium renderer with Node integration disabled. Network requests, navigation, popups, permissions, filesystem access, process execution, Electron APIs, and raw IPC are unavailable. Discovery receives only HID metadata matching the manifest permission.

API v1 intentionally does not broker HID writes or custom renderer surfaces. Writable controls require a reviewed core capability adapter so acknowledgement and hardware readback can preserve the last confirmed value.
`;
	return {
		[moduleManifestFilename]: manifestJson,
		"switchboard-module.schema.json": `${JSON.stringify(moduleJsonSchema(), null, 2)}\n`,
		"package.json": packageJson,
		"src/index.js": entrypoint,
		"test/module.test.js": test,
		"README.md": readme,
		".gitignore": "node_modules/\n.DS_Store\n"
	};
}
function createManifest(input, coreVersion) {
	return {
		schemaVersion: 1,
		id: input.id,
		name: input.name,
		description: input.description,
		author: input.author,
		version: "0.1.0",
		minimumCoreVersion: normalizeCoreVersion(coreVersion),
		kind: "device",
		entrypoint: "src/index.js",
		capabilities: ["device-discovery"],
		permissions: { hid: [{
			vendorId: input.vendorId.toLocaleLowerCase(),
			productIds: [input.productId.toLocaleLowerCase()]
		}] }
	};
}
function finishValidation(manifest, entrypointPath, issues, bytes) {
	const incompatible = issues.some((issue) => issue.code === "api-kind-unavailable" || issue.code === "core-version");
	const invalid = issues.some((issue) => issue.severity === "error");
	return {
		manifest,
		entrypointPath,
		issues,
		status: incompatible ? "incompatible" : invalid ? "invalid" : "ready",
		sizeMb: Math.round(bytes / 1048576 * 100) / 100
	};
}
function containsModuleImport(source) {
	return /(^|\n)\s*import\s*(?:[\w{*]|['"])/m.test(source) || /(^|\n)\s*export\s+[^\n;]+\s+from\s*['"]/m.test(source) || /\bimport\s*\(/.test(source);
}
function compareVersions(left, right) {
	const parse = (value) => value.split("-", 1)[0].split(".").map((part) => Number(part));
	const leftParts = parse(left);
	const rightParts = parse(right);
	for (let index = 0; index < 3; index += 1) {
		const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}
function normalizeCoreVersion(version) {
	return version.match(/^\d+\.\d+\.\d+/)?.[0] ?? "0.1.0";
}
function projectFolderName(moduleId) {
	return moduleId.replace(/[^a-z0-9.-]+/gi, "-").replace(/^[.-]+|[.-]+$/g, "");
}
function assertChildPath(parent, child) {
	const childRelative = relative(parent, child);
	if (!childRelative || childRelative.startsWith("..") || isAbsolute(childRelative)) throw new Error("The module project must be created inside the selected directory.");
}
function errorMessage$1(error) {
	return error instanceof Error ? error.message : String(error);
}
function moduleJsonSchema() {
	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		title: "Switchboard Module Manifest",
		type: "object",
		additionalProperties: false,
		required: [
			"schemaVersion",
			"id",
			"name",
			"description",
			"author",
			"version",
			"minimumCoreVersion",
			"kind",
			"entrypoint",
			"capabilities",
			"permissions"
		],
		properties: {
			$schema: { type: "string" },
			schemaVersion: { const: 1 },
			id: {
				type: "string",
				pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)+$"
			},
			name: {
				type: "string",
				minLength: 2,
				maxLength: 80
			},
			description: {
				type: "string",
				minLength: 12,
				maxLength: 240
			},
			author: {
				type: "string",
				minLength: 2,
				maxLength: 120
			},
			version: {
				type: "string",
				pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
			},
			minimumCoreVersion: {
				type: "string",
				pattern: "^\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?$"
			},
			kind: { enum: [
				"device",
				"capture",
				"audio",
				"integration"
			] },
			entrypoint: {
				type: "string",
				minLength: 1,
				maxLength: 200
			},
			capabilities: {
				type: "array",
				minItems: 1,
				maxItems: 32,
				items: { type: "string" }
			},
			permissions: {
				type: "object",
				additionalProperties: false,
				required: ["hid"],
				properties: { hid: {
					type: "array",
					minItems: 1,
					maxItems: 16,
					items: {
						type: "object",
						additionalProperties: false,
						required: ["vendorId", "productIds"],
						properties: {
							vendorId: {
								type: "string",
								pattern: "^[0-9a-fA-F]{4}$"
							},
							productIds: {
								type: "array",
								minItems: 1,
								maxItems: 32,
								items: {
									type: "string",
									pattern: "^[0-9a-fA-F]{4}$"
								}
							}
						}
					}
				} }
			}
		}
	};
}
//#endregion
//#region src/main/modules/addon-partition.ts
function addonPartitionName(moduleId) {
	return `switchboard-addon-${createHash("sha256").update(moduleId).digest("hex").slice(0, 24)}`;
}
//#endregion
//#region src/main/modules/sandboxed-device-addon.ts
var detectionTimeoutMs = 2500;
var initializationTimeoutMs = 4e3;
var detectedDeviceSchema = z.object({
	deviceKey: z.string().min(1).max(96),
	displayName: z.string().trim().min(1).max(120),
	kind: z.enum([
		"mouse",
		"microphone",
		"keyboard",
		"headset",
		"unknown"
	]),
	identity: z.object({
		manufacturer: z.string().trim().min(1).max(80).optional(),
		productFamily: z.string().trim().min(1).max(120).optional(),
		model: z.string().trim().min(1).max(120).optional(),
		variant: z.string().trim().min(1).max(120).optional(),
		colorway: z.string().trim().min(1).max(80).optional(),
		connection: z.enum([
			"usb",
			"wireless",
			"bluetooth",
			"unknown"
		]).optional(),
		connectionLabel: z.string().trim().min(1).max(80).optional(),
		hardwareRevision: z.string().trim().min(1).max(80).optional()
	})
});
var detectedDevicesSchema = z.array(detectedDeviceSchema).max(32);
var SandboxedDeviceAddon = class {
	manifest;
	entrypointPath;
	onRuntimeState;
	id;
	host = null;
	hostInitialization = null;
	intentionalHostClosures = /* @__PURE__ */ new WeakSet();
	disposed = false;
	constructor(manifest, entrypointPath, onRuntimeState) {
		this.manifest = manifest;
		this.entrypointPath = entrypointPath;
		this.onRuntimeState = onRuntimeState;
		this.id = manifest.id;
	}
	async discover(context) {
		if (this.disposed) return [];
		try {
			const allowedDevices = context.hidDevices.filter((device) => this.isPermitted(device)).map((device) => toAddonHidDevice(this.id, device));
			if (allowedDevices.length === 0) {
				this.onRuntimeState(this.id, "ready");
				return [];
			}
			const raw = await withTimeout((await this.ensureHost()).webContents.executeJavaScript(`globalThis.__switchboardModuleHost.detect(${JSON.stringify({
				apiVersion: 1,
				platform: normalizePlatform(process.platform),
				hidDevices: allowedDevices
			})})`, true), detectionTimeoutMs, `${this.manifest.name} discovery timed out.`);
			const detected = detectedDevicesSchema.parse(raw);
			const byKey = new Map(allowedDevices.map((device) => [device.deviceKey, device]));
			const publishedKeys = /* @__PURE__ */ new Set();
			const devices = detected.map((candidate) => {
				const source = byKey.get(candidate.deviceKey);
				if (!source) throw new Error(`${this.manifest.name} returned a device outside its HID permission.`);
				if (publishedKeys.has(candidate.deviceKey)) throw new Error(`${this.manifest.name} returned the same device more than once.`);
				publishedKeys.add(candidate.deviceKey);
				const identity = {
					...candidate.identity,
					manufacturer: candidate.identity.manufacturer ?? source.manufacturer,
					model: candidate.identity.model ?? source.product,
					connection: candidate.identity.connection ?? "usb",
					connectionLabel: candidate.identity.connectionLabel ?? "USB",
					vendorId: source.vendorId,
					productId: source.productId,
					serialNumber: source.serialNumber,
					productString: source.product
				};
				return {
					id: `addon:${this.id}:${candidate.deviceKey}`,
					moduleId: this.id,
					displayName: candidate.displayName,
					kind: candidate.kind,
					connected: true,
					identity,
					variantResolution: {
						confidence: "module-metadata",
						source: this.id,
						evidence: `Sandboxed add-on matched ${hex(source.vendorId)}:${hex(source.productId)}.`
					},
					asset: resolveProductAsset(identity, candidate.kind),
					capabilities: {},
					settings: {}
				};
			});
			this.onRuntimeState(this.id, "active");
			return devices;
		} catch (error) {
			await this.closeHost();
			this.onRuntimeState(this.id, "runtime-error", errorMessage(error));
			return [];
		}
	}
	async deactivate() {
		await this.closeHost();
	}
	async dispose() {
		this.disposed = true;
		await this.closeHost();
	}
	async ensureHost() {
		if (this.disposed) throw new Error(`${this.manifest.name} is disposed.`);
		if (this.host && !this.host.isDestroyed()) return this.host;
		this.hostInitialization ??= withTimeout(this.createHost(), initializationTimeoutMs, `${this.manifest.name} sandbox did not start.`).finally(() => {
			this.hostInitialization = null;
		});
		return this.hostInitialization;
	}
	async createHost() {
		const partitionName = addonPartitionName(this.id);
		const isolatedSession = session.fromPartition(partitionName, { cache: false });
		isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
		isolatedSession.setPermissionCheckHandler(() => false);
		isolatedSession.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (_details, callback) => callback({ cancel: true }));
		const host = new BrowserWindow({
			show: false,
			webPreferences: {
				partition: partitionName,
				contextIsolation: true,
				sandbox: true,
				nodeIntegration: false,
				webSecurity: true,
				allowRunningInsecureContent: false,
				webviewTag: false
			}
		});
		this.host = host;
		host.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		host.webContents.on("will-attach-webview", (event) => event.preventDefault());
		host.webContents.on("render-process-gone", (_event, details) => {
			if (this.disposed || this.intentionalHostClosures.has(host)) return;
			this.host = null;
			this.onRuntimeState(this.id, "runtime-error", `The sandbox exited (${details.reason}).`);
		});
		await host.loadURL(moduleHostDocument());
		host.webContents.on("will-navigate", (event) => event.preventDefault());
		const source = await readFile(this.entrypointPath, "utf8");
		await host.webContents.executeJavaScript(`globalThis.__switchboardModuleHost.load(${JSON.stringify(source)})`, true);
		return host;
	}
	async closeHost() {
		const initialization = this.hostInitialization;
		this.hostInitialization = null;
		if (initialization) await initialization.catch(() => void 0);
		const host = this.host;
		this.host = null;
		if (host && !host.isDestroyed()) {
			this.intentionalHostClosures.add(host);
			host.destroy();
		}
	}
	isPermitted(device) {
		return this.manifest.permissions.hid.some((permission) => Number.parseInt(permission.vendorId, 16) === device.vendorId && permission.productIds.some((productId) => Number.parseInt(productId, 16) === device.productId));
	}
};
function toAddonHidDevice(moduleId, device) {
	const source = [
		moduleId,
		device.path,
		device.vendorId,
		device.productId,
		device.serialNumber,
		device.usagePage,
		device.usage
	].map((part) => part ?? "").join("\0");
	return {
		deviceKey: createHash("sha256").update(source).digest("hex").slice(0, 24),
		vendorId: device.vendorId,
		productId: device.productId,
		usagePage: device.usagePage,
		usage: device.usage,
		manufacturer: cleanOptional(device.manufacturer),
		product: cleanOptional(device.product),
		serialNumber: cleanOptional(device.serialNumber)
	};
}
function moduleHostDocument() {
	return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'; img-src 'none'; style-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"></head><body><script>
    (() => {
      let addon = null;
      const api = {
        async load(source) {
          const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          try {
            const namespace = await import(url);
            if (!namespace.default || typeof namespace.default.detect !== 'function') {
              throw new Error('The default export must provide a detect(context) function.');
            }
            addon = namespace.default;
            return true;
          } finally {
            URL.revokeObjectURL(url);
          }
        },
        async detect(context) {
          if (!addon) throw new Error('The add-on has not been loaded.');
          return await addon.detect(structuredClone(context));
        },
      };
      Object.defineProperty(globalThis, '__switchboardModuleHost', {
        value: Object.freeze(api),
        configurable: false,
        enumerable: false,
        writable: false,
      });
    })();
  <\/script></body></html>`)}`;
}
function normalizePlatform(platform) {
	if (platform === "darwin" || platform === "linux") return platform;
	return "win32";
}
function cleanOptional(value) {
	const cleaned = value?.trim();
	return cleaned ? cleaned.slice(0, 160) : void 0;
}
function hex(value) {
	return value.toString(16).padStart(4, "0");
}
function withTimeout(operation, timeoutMs, message) {
	let timer;
	const timeout = new Promise((_resolve, reject) => {
		timer = setTimeout(() => reject(new Error(message)), timeoutMs);
	});
	return Promise.race([operation, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}
function errorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
//#endregion
//#region src/main/controller.ts
var workerSavedClipSchema = z.object({
	path: z.string().min(1),
	name: z.string().min(1),
	game: z.string().nullable().optional(),
	createdAt: z.number().int().nonnegative(),
	durationMs: z.number().int().nonnegative(),
	fileSize: z.number().int().nonnegative(),
	width: z.number().int().nonnegative(),
	height: z.number().int().nonnegative(),
	fps: z.number().nonnegative(),
	codec: z.string().nullable().optional(),
	thumbnailPath: z.string().nullable().optional(),
	captureStartedAt: z.number().int().nonnegative().nullable().optional(),
	captureEndedAt: z.number().int().nonnegative().nullable().optional()
});
var workerReactionDetectionSchema = z.object({
	timestamp: z.number().int().nonnegative(),
	confidence: z.number().min(0).max(1),
	levelDb: z.number().min(-120).max(0),
	baselineDb: z.number().min(-120).max(0)
}).strict();
var audioEndpointRefreshMinimumIntervalMs = 1e4;
var captureSourceThumbnailRefreshMinimumIntervalMs = 1e4;
function sameAudioChannels(left, right) {
	return left?.length === right.length && left.every((channel, index) => channel === right[index]);
}
var AppController = class {
	options;
	scenes;
	desktopControls;
	statusLighting;
	unsubscribeSetup = null;
	store;
	engines;
	devices;
	audioMeterListeners = /* @__PURE__ */ new Set();
	clipExportProgressListeners = /* @__PURE__ */ new Set();
	captureStorage;
	clipLibrary;
	audioEndpointDiscovery;
	gameDiscovery;
	appUpdates;
	performance;
	resourceJournal;
	diagnosticRunTask = null;
	diagnosticRunHost = null;
	diagnosticRunCancelled = false;
	diagnosticCaptureContext = null;
	diagnosticRunGraphics = { unavailable: "Diagnostics have not run." };
	appliedEngineStatuses = /* @__PURE__ */ new Map();
	audioSnapshotUpdateGate = new AudioSnapshotUpdateGate();
	audioConfiguration = new AudioConfiguration({
		read: () => this.store.get().audio,
		configure: async (audio) => audioHostSnapshotSchema.parse(await this.engines.request("audio", "configure", audio, 3e4)),
		commit: (before, next) => {
			this.store.update((draft) => applyAudioPreferenceChanges(draft.audio, before, next));
		},
		publish: (host) => this.applyAudioHostSnapshot(host)
	});
	audioMeterDemandGate = new AudioMeterDemandGate();
	captureSnapshotUpdateGate = new CaptureSnapshotUpdateGate();
	autoCaptureRegistry;
	autoCaptureEngine;
	autoCaptureCoordinator;
	testEventProvider;
	localDeviceModules = /* @__PURE__ */ new Map();
	capturePaths;
	registeredShortcut = null;
	captureRestartTimer = null;
	captureRestartAttempts = 0;
	captureAudioIntegrationSignature = null;
	captureAudioIntegrationUpdate = null;
	audioRestartTimer = null;
	audioRestartAttempts = 0;
	audioDeviceRefresh = null;
	audioDevicesRefreshedAt = 0;
	captureSourceThumbnails = /* @__PURE__ */ new Map();
	validatedCaptureWindowSourceIds = /* @__PURE__ */ new Set();
	captureSourceThumbnailRefresh = null;
	captureSourceThumbnailsRefreshedAt = 0;
	gameScan = null;
	activeClipExports = /* @__PURE__ */ new Map();
	snapshotPreparation = null;
	initialization = null;
	disposed = false;
	rendererActive = true;
	diagnosticsGeneration = 0;
	diagnosticsGpu = { unavailable: "Developer mode is off." };
	constructor(options = {}) {
		this.options = options;
		this.store = new StateStore(join(app.getPath("userData"), "switchboard-state.json"));
		this.scenes = new SetupScenes(this.store, {
			audio: (value) => this.applySceneAudio(value),
			capture: async (value) => {
				if (JSON.stringify(value) !== JSON.stringify(snapshotSceneValues(this.store.get()).capture)) await this.setCaptureConfig(value);
			},
			device: async (deviceId, change) => {
				await this.setDeviceControl({
					deviceId,
					change
				});
			}
		});
		this.desktopControls = new DesktopControlsService({
			quick: (open) => this.options.onQuickControls?.(open, true),
			applications: (executables) => this.scenes.runningApplications(executables),
			status: (state, error) => {
				if (!this.disposed) this.store.update((draft) => {
					draft.setup.runtime.desktopState = state;
					draft.setup.runtime.desktopError = error;
				}, { persist: false });
			}
		});
		this.statusLighting = new StatusLighting({
			apply: (id, color) => this.devices.setStatusLighting(id, color),
			status: (state, message) => {
				if (!this.disposed) this.store.update((draft) => {
					draft.setup.runtime.lightingState = state;
					draft.setup.runtime.lightingMessage = message;
				}, { persist: false });
			}
		});
		this.resourceJournal = new ResourceJournal({
			directory: join(app.getPath("userData"), "diagnostics", "resources"),
			getRetentionDays: () => this.store.get().settings.diagnosticsRetentionDays
		});
		developerDiagnostics.setSink((event) => this.resourceJournal.record(event));
		this.appUpdates = new AppUpdateService({
			currentVersion: currentCoreVersion(),
			isPackaged: app.isPackaged,
			platform: process.platform,
			demoUpdate: options.demoUpdate,
			onStateChanged: (appUpdate) => {
				this.store.update((draft) => {
					draft.appUpdate = appUpdate;
				}, { persist: false });
			},
			onInstallRequested: options.onUpdateInstallRequested,
			getSystemIdleTime: () => powerMonitor.getSystemIdleTime(),
			canInstallInBackground: () => !this.disposed && !this.rendererActive && !this.diagnosticRunTask && ["audio", "capture"].every((kind) => this.engines.getStatus(kind).state === "stopped") && this.activeClipExports.size === 0 && !getMontageV2Service().hasActiveExports && !this.gameScan
		});
		this.captureStorage = new CaptureStorageService(app.getPath("videos"), app.getPath("userData"));
		this.capturePaths = this.captureStorage.resolvePaths(null);
		this.clipLibrary = new ClipLibraryService(this.capturePaths.thumbnailDirectory);
		this.audioEndpointDiscovery = new AudioEndpointDiscovery({
			appPath: app.getAppPath(),
			isPackaged: app.isPackaged,
			resourcesPath: process.resourcesPath
		});
		this.gameDiscovery = new GameDiscoveryService({ extractExecutableIcon: async (executablePath) => {
			const icon = await app.getFileIcon(executablePath, { size: "normal" });
			return icon.isEmpty() ? void 0 : icon.toDataURL();
		} });
		this.engines = new EngineSupervisor((status) => this.applyEngineStatus(status), (frame) => this.emitAudioMeters(frame), (kind, event, payload) => this.applyEngineEvent(kind, event, payload));
		this.devices = new DeviceRegistry(() => this.store.get(), (devices, options) => {
			this.store.update((draft) => {
				draft.devices = devices;
			}, { persist: options?.persist ?? true });
		}, { additionalModules: () => [...this.localDeviceModules.values()] });
		this.performance = new PerformanceMonitor({
			getProcessMetrics: () => app.getAppMetrics(),
			getContext: () => ({
				externalProcesses: this.desktopControls.getResources(),
				rendererActive: this.rendererActive,
				guardEnabled: this.store.getPerformanceGuardEnabled(),
				detailedDiagnostics: this.store.getDetailedDiagnosticsEnabled(),
				engines: ["audio", "capture"].map((kind) => this.engines.getStatus(kind))
			}),
			publish: (performance) => {
				this.store.setPerformance(performance);
			},
			getRendererRuntime: options.getRendererRuntime,
			recordSample: (sample) => this.resourceJournal.record(sample)
		});
		const autoCaptureLog = (event, fields = {}) => {
			const details = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" ");
			console.info(`[autocapture] ${event}${details ? ` ${details}` : ""}`);
		};
		this.autoCaptureRegistry = new AutoCaptureRegistry(autoCaptureLog);
		this.testEventProvider = new TestEventProvider();
		this.autoCaptureRegistry.register(new CS2Provider(join(app.getPath("userData"), "autocapture", "cs2-gsi-token")));
		this.autoCaptureRegistry.register(new Battlefield6Provider({
			runtime: app,
			gameEventsEnabled: process.env.SWITCHBOARD_BF6_OVERWOLF_ENABLED === "1"
		}));
		this.autoCaptureRegistry.register(new WarThunderProvider());
		this.autoCaptureRegistry.register(new WardogsProvider());
		this.autoCaptureRegistry.register(this.testEventProvider);
		this.autoCaptureEngine = new AutoCaptureEngine({
			getSettings: () => this.store.get().capture.autoCapture.settings,
			getMaximumWindowMs: () => this.store.get().capture.config.replaySeconds * 1e3,
			getLastReactionSavedAt: () => this.store.get().clips.reduce((latest, clip) => clip.autoCapture?.providerId === "microphone-reaction" ? Math.max(latest, clip.createdAt) : latest, 0),
			preserve: (request) => this.preserveAutoCaptureWindow(request),
			onRuntime: (runtime) => {
				this.store.update((draft) => {
					draft.capture.autoCapture.runtime = runtime;
				}, { persist: false });
			},
			log: autoCaptureLog
		});
		this.autoCaptureCoordinator = new AutoCaptureCoordinator({
			registry: this.autoCaptureRegistry,
			engine: this.autoCaptureEngine,
			testProvider: this.testEventProvider,
			getSettings: () => this.store.get().capture.autoCapture.settings,
			includeDevelopmentProviders: () => this.store.get().prototypeMode,
			onProvidersChanged: (providers) => {
				this.store.update((draft) => {
					draft.capture.autoCapture.providers = providers;
				}, { persist: false });
			}
		});
	}
	initialize() {
		this.initialization ??= this.initializeOnce();
		return this.initialization;
	}
	prepareSnapshot() {
		this.snapshotPreparation ??= this.prepareSnapshotOnce();
		return this.snapshotPreparation;
	}
	async prepareSnapshotOnce() {
		await this.store.load();
		if (this.disposed) return;
		if (process.env.SWITCHBOARD_NATIVE_FIXTURES === "1") this.store.update((draft) => {
			draft.devices = structuredClone(defaultDevices);
		}, { persist: false });
		else this.devices.removeLegacyFixtures();
		this.store.update((draft) => {
			draft.version = currentCoreVersion();
			draft.prototypeMode = !app.isPackaged;
		}, { persist: false });
		await this.syncDeveloperDiagnostics();
	}
	async initializeOnce() {
		await this.prepareSnapshot();
		if (this.disposed) return;
		debugDiagnostics.setEnabled(this.store.getDetailedDiagnosticsEnabled());
		this.performance.start();
		await this.appUpdates.initialize(appUpdatePreferences(this.store.get().settings));
		if (this.disposed) return;
		await this.loadPersistedLocalModules();
		if (this.disposed) return;
		await this.refreshAudioDevices(true);
		if (this.disposed) return;
		if (process.env.SWITCHBOARD_NATIVE_FIXTURES !== "1") await this.devices.start();
		if (this.disposed) return;
		const snapshot = this.store.get();
		this.applyLoginItemSetting(snapshot.settings.launchAtStartup);
		await this.initializeCaptureStorage();
		if (this.disposed) return;
		await this.autoCaptureCoordinator.initialize(this.store.get().gameDetection.games);
		if (this.disposed) return;
		this.registerCaptureShortcut(snapshot.capture.config.hotkey, false);
		this.reconcileClipLibrary();
		const starts = [];
		if (snapshot.audio.enabled && snapshot.settings.developerMode === true) starts.push(this.startAudioEngine());
		else if (snapshot.audio.enabled) this.store.update((draft) => {
			draft.audio.enabled = false;
			const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
			if (module) module.enabled = false;
		});
		const currentCapture = this.store.get().capture;
		if (currentCapture.config.enabled && !currentCapture.storage.warning) starts.push(this.startCaptureEngine(currentCapture.config));
		const results = await Promise.allSettled(starts);
		for (const result of results) if (result.status === "rejected") console.error("Failed to restore an enabled engine.", result.reason);
		if (this.disposed) return;
		if (snapshot.settings.scanGamesAutomatically) this.scanGames().catch((error) => console.warn("Automatic game scan failed.", error));
		this.unsubscribeSetup = this.store.subscribe((next) => this.syncSetup(next));
		this.syncSetup(this.store.get());
	}
	getSnapshot() {
		return this.store.get();
	}
	async saveScene(input) {
		await this.initialize();
		return this.scenes.save(input);
	}
	deleteScene(id) {
		return this.scenes.delete(id);
	}
	async applyScene(id) {
		await this.initialize();
		return this.scenes.apply(id);
	}
	async restoreScene() {
		await this.initialize();
		return this.scenes.restore();
	}
	setSetupPreferences(input) {
		const preferences = setupPreferencesSchema.parse(input);
		return this.store.update((draft) => {
			draft.setup.preferences = preferences;
		});
	}
	openQuickControls() {
		this.options.onQuickControls?.(true, false);
	}
	closeQuickControls() {
		this.options.onQuickControls?.(false, false);
	}
	async runQuickAction(raw) {
		const input = quickActionInputSchema.parse(raw);
		const snapshot = this.store.get();
		if (!snapshot.settings.developerMode || !snapshot.audio.enabled || !snapshot.audio.host?.running) throw new Error("Enable Audio in Developer mode to use this control.");
		const audio = sceneAudioSchema.parse(snapshot.audio);
		if (input.type === "chatmix") audio.chatMix = input.value;
		if (input.type === "microphone") {
			const mic = audio.buses.find((bus) => bus.id === "mic");
			if (!mic) throw new Error("The microphone channel is unavailable.");
			mic.enabled = !input.muted;
		}
		if (input.type === "output") {
			const device = snapshot.audio.devices.find((item) => item.id === input.deviceId && item.available && item.direction === "output" && !item.isSwitchboard);
			if (!device) throw new Error("This output is unavailable.");
			const game = audio.buses.find((bus) => bus.id === "game");
			if (!game) throw new Error("The output channel is unavailable.");
			game.deviceId = device.id;
			audio.outputDevice = device.name;
		}
		await this.applySceneAudio(audio);
		return this.store.get();
	}
	syncSetup(snapshot) {
		if (this.disposed) return;
		this.desktopControls.configure({
			quickControlsEnabled: snapshot.setup.preferences.quickControlsEnabled,
			quickShortcut: snapshot.setup.preferences.quickShortcut,
			executables: [...new Set(snapshot.setup.scenes.filter((scene) => scene.automatic && scene.executable).map((scene) => scene.executable.toLowerCase()))].sort()
		});
		this.statusLighting.update(snapshot);
	}
	applySceneAudio(value) {
		return this.audioConfiguration.run(() => this.applySceneAudioCore(value));
	}
	async applySceneAudioCore(value) {
		const before = this.store.get();
		if (JSON.stringify(sceneAudioSchema.parse(before.audio)) === JSON.stringify(value)) return;
		if (!before.settings.developerMode) throw new Error("Audio scenes require Developer mode.");
		const next = structuredClone(before);
		Object.assign(next.audio, value, { buses: next.audio.buses.map((bus) => ({
			...bus,
			...value.buses.find((item) => item.id === bus.id)
		})) });
		if (value.enabled) {
			if (!before.audio.enabled) await this.engines.start("audio");
			try {
				const host = audioHostSnapshotSchema.parse(await this.engines.request("audio", before.audio.enabled ? "configure" : "start", next.audio, 3e4));
				assertAudioConfigurationApplied(before.audio, next.audio, host);
				this.store.update((draft) => {
					applyAudioPreferenceChanges(draft.audio, before.audio, next.audio);
					draft.audio.enabled = true;
					const module = draft.modules.find((item) => item.id === "capability.audio-router");
					if (module) {
						module.installed = true;
						module.enabled = true;
					}
				});
				this.applyAudioHostSnapshot(host);
			} catch (error) {
				if (!before.audio.enabled) await this.engines.stop("audio");
				else await this.engines.request("audio", "configure", before.audio, 3e4).catch(() => void 0);
				throw error;
			}
		} else {
			await this.setAudioEnabledCore(false);
			this.store.update((draft) => {
				Object.assign(draft.audio, value, { buses: draft.audio.buses.map((bus) => ({
					...bus,
					...value.buses.find((item) => item.id === bus.id)
				})) });
			});
		}
	}
	subscribe(listener) {
		return this.store.subscribe(listener);
	}
	subscribeAudioMeters(listener) {
		this.audioMeterListeners.add(listener);
		return () => this.audioMeterListeners.delete(listener);
	}
	subscribeClipExportProgress(listener) {
		this.clipExportProgressListeners.add(listener);
		return () => this.clipExportProgressListeners.delete(listener);
	}
	setRendererActive(active) {
		if (this.rendererActive === active) return this.store.get();
		this.rendererActive = active;
		if (this.audioMeterDemandGate.setRendererActive(active)) this.syncAudioMeterDemand();
		if (active) this.refreshAudioDevices();
		this.performance.refresh();
		return this.store.get();
	}
	setAudioMeteringRequested(requested) {
		if (this.audioMeterDemandGate.setRendererRequested(requested)) this.syncAudioMeterDemand();
	}
	refreshAudioDevices(force = false) {
		if (this.audioDeviceRefresh) return this.audioDeviceRefresh;
		if (!force && Date.now() - this.audioDevicesRefreshedAt < audioEndpointRefreshMinimumIntervalMs) return Promise.resolve(this.store.get());
		const refresh = this.audioEndpointDiscovery.list().then(async (devices) => {
			const current = this.store.get();
			const audio = structuredClone(current.audio);
			reconcileAudioDevices(audio, devices);
			this.audioDevicesRefreshedAt = Date.now();
			if (JSON.stringify(audio) === JSON.stringify(current.audio)) return current;
			this.store.update((draft) => {
				draft.audio.devices = audio.devices;
			}, { persist: false });
			if (!this.engines.hasLiveProcess("audio") && this.engines.getStatus("audio").state === "stopped") return this.audioConfiguration.run(async () => this.store.update((draft) => reconcileAudioDevices(draft.audio, devices)));
			return this.updateAudioConfiguration((draft) => reconcileAudioDevices(draft.audio, devices));
		}).catch((error) => {
			console.warn("Windows audio endpoint discovery failed.", error);
			return this.store.get();
		}).finally(() => {
			if (this.audioDeviceRefresh === refresh) this.audioDeviceRefresh = null;
		});
		this.audioDeviceRefresh = refresh;
		return refresh;
	}
	async setModuleState(input) {
		const module = this.store.get().modules.find((candidate) => candidate.id === input.moduleId);
		if (!module) throw new Error(`Unknown module: ${input.moduleId}`);
		if (module.source === "local") {
			if (input.enabled && !["ready", "active"].includes(module.development?.status ?? "invalid")) {
				await this.validateModuleProject({ moduleId: input.moduleId });
				const validated = this.store.get().modules.find((candidate) => candidate.id === input.moduleId);
				if (!validated || validated.development?.status !== "ready") throw new Error(`${module.name} must pass validation before it can be enabled.`);
			}
			this.store.update((draft) => {
				const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
				if (!target?.development) throw new Error(`Local module metadata is missing for ${input.moduleId}.`);
				target.enabled = input.enabled;
				target.development.status = "ready";
				target.development.issues = target.development.issues.filter((issue) => issue.code !== "runtime-error");
			});
			await this.devices.reconcileModuleState(input.moduleId, input.enabled);
			return this.store.get();
		}
		if (module.kind === "capture") return this.setCaptureConfig({ enabled: input.enabled });
		if (module.kind === "audio") return this.setAudioEnabled(input.enabled);
		this.store.update((draft) => {
			const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
			if (!target) throw new Error(`Unknown module: ${input.moduleId}`);
			target.installed = target.installed || input.enabled;
			target.enabled = input.enabled;
		});
		await this.devices.reconcileModuleState(input.moduleId, input.enabled);
		return this.store.get();
	}
	async createModuleProject(input) {
		if (this.store.get().modules.some((module) => module.id === input.id)) throw new Error(`A module with the ID ${input.id} is already installed or linked.`);
		const reviewParent = nativeReviewPath("SWITCHBOARD_MODULE_PROJECT_REVIEW_PARENT");
		const selection = reviewParent ? null : await dialog.showOpenDialog({
			title: "Choose a parent folder for the module project",
			defaultPath: app.getPath("documents"),
			buttonLabel: "Create project here",
			properties: ["openDirectory", "createDirectory"]
		});
		const parentDirectory = reviewParent ?? selection?.filePaths[0];
		if (selection?.canceled || !parentDirectory) return this.store.get();
		const projectPath = await createModuleProject(parentDirectory, input, currentCoreVersion());
		const validation = await validateModuleProject(projectPath, currentCoreVersion());
		await this.linkValidatedModuleProject(projectPath, validation);
		return this.store.get();
	}
	async linkModuleProject() {
		const reviewProject = nativeReviewPath("SWITCHBOARD_MODULE_PROJECT_REVIEW_LINK");
		const selection = reviewProject ? null : await dialog.showOpenDialog({
			title: "Link a Switchboard module project",
			defaultPath: app.getPath("documents"),
			buttonLabel: "Link project",
			properties: ["openDirectory"]
		});
		const projectPath = reviewProject ?? selection?.filePaths[0];
		if (selection?.canceled || !projectPath) return this.store.get();
		const validation = await validateModuleProject(projectPath, currentCoreVersion());
		await this.linkValidatedModuleProject(projectPath, validation);
		return this.store.get();
	}
	async validateModuleProject(input) {
		const current = this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === "local");
		if (!current?.development) throw new Error(`Unknown local module: ${input.moduleId}`);
		this.store.update((draft) => {
			const target = draft.modules.find((candidate) => candidate.id === input.moduleId);
			if (target?.development) target.development.status = "validating";
		}, { persist: false });
		const validation = await validateModuleProject(current.development.projectPath, currentCoreVersion());
		if (validation.manifest && validation.manifest.id !== current.id) {
			validation.issues.push({
				severity: "error",
				code: "module-id-changed",
				message: `The linked manifest ID changed from ${current.id} to ${validation.manifest.id}. Unlink it before changing IDs.`,
				file: "switchboard.module.json"
			});
			validation.status = "invalid";
		}
		await this.replaceLinkedModule(current, validation);
		if (this.store.get().modules.find((candidate) => candidate.id === input.moduleId)?.enabled) await this.devices.refresh();
		return this.store.get();
	}
	async revealModuleProject(input) {
		const projectPath = this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === "local")?.development?.projectPath;
		if (!projectPath) throw new Error(`Unknown local module: ${input.moduleId}`);
		const error = await shell.openPath(projectPath);
		if (error) throw new Error(error);
	}
	async unlinkModuleProject(input) {
		if (!this.store.get().modules.find((candidate) => candidate.id === input.moduleId && candidate.source === "local")) throw new Error(`Unknown local module: ${input.moduleId}`);
		const runtime = this.localDeviceModules.get(input.moduleId);
		this.localDeviceModules.delete(input.moduleId);
		await runtime?.dispose();
		this.devices.removeModuleDevices(input.moduleId);
		return this.store.update((draft) => {
			draft.modules = draft.modules.filter((candidate) => candidate.id !== input.moduleId);
			for (const deviceId of Object.keys(draft.settings.deviceAppearanceOverrides)) if (!draft.devices.some((device) => device.id === deviceId)) delete draft.settings.deviceAppearanceOverrides[deviceId];
		});
	}
	async loadPersistedLocalModules() {
		const localModules = this.store.get().modules.filter((module) => module.source === "local" && module.development);
		for (const module of localModules) {
			if (this.disposed || !module.development) return;
			const validation = await validateModuleProject(module.development.projectPath, currentCoreVersion());
			if (validation.manifest && validation.manifest.id !== module.id) {
				validation.issues.push({
					severity: "error",
					code: "module-id-changed",
					message: `The linked manifest ID changed from ${module.id} to ${validation.manifest.id}.`,
					file: "switchboard.module.json"
				});
				validation.status = "invalid";
			}
			await this.replaceLinkedModule(module, validation);
		}
	}
	async linkValidatedModuleProject(projectPath, validation) {
		if (!validation.manifest) throw new Error(validation.issues[0]?.message ?? "The selected folder is not a valid Switchboard module project.");
		const existing = this.store.get().modules.find((candidate) => candidate.id === validation.manifest?.id);
		if (existing && (existing.source !== "local" || existing.development?.projectPath !== resolve(projectPath))) throw new Error(`A module with the ID ${validation.manifest.id} is already installed or linked.`);
		if (existing) {
			await this.replaceLinkedModule(existing, validation);
			return;
		}
		const linked = moduleManifestFromProject(projectPath, validation, false);
		this.store.update((draft) => {
			draft.modules.push(linked);
			draft.modules.sort((left, right) => left.name.localeCompare(right.name));
		});
		await this.installLocalRuntime(linked, validation);
	}
	async replaceLinkedModule(current, validation) {
		const runtime = this.localDeviceModules.get(current.id);
		this.localDeviceModules.delete(current.id);
		await runtime?.dispose();
		if (!validation.manifest || validation.manifest.id !== current.id) {
			this.store.update((draft) => {
				const target = draft.modules.find((candidate) => candidate.id === current.id);
				if (!target?.development) return;
				target.enabled = false;
				target.sizeMb = validation.sizeMb;
				target.development.status = validation.status;
				target.development.lastValidatedAt = (/* @__PURE__ */ new Date()).toISOString();
				target.development.issues = validation.issues;
			});
			this.devices.removeModuleDevices(current.id);
			return;
		}
		const linked = moduleManifestFromProject(current.development?.projectPath ?? "", validation, current.enabled && validation.status === "ready");
		this.store.update((draft) => {
			const index = draft.modules.findIndex((candidate) => candidate.id === current.id);
			if (index >= 0) draft.modules[index] = linked;
		});
		await this.installLocalRuntime(linked, validation);
		if (validation.status !== "ready") this.devices.removeModuleDevices(current.id);
	}
	async installLocalRuntime(module, validation) {
		if (validation.status !== "ready" || !validation.manifest || !validation.entrypointPath) return;
		const runtime = new SandboxedDeviceAddon(validation.manifest, validation.entrypointPath, (moduleId, status, message) => this.applyLocalModuleRuntimeState(moduleId, status, message));
		this.localDeviceModules.set(module.id, runtime);
	}
	applyLocalModuleRuntimeState(moduleId, status, message) {
		const current = this.store.get().modules.find((candidate) => candidate.id === moduleId);
		if (!current?.development || status === "active" && !current.enabled) return;
		const runtimeIssue = current.development.issues.find((issue) => issue.code === "runtime-error");
		if (current.development.status === status && (status !== "runtime-error" || runtimeIssue?.message === message)) return;
		this.store.update((draft) => {
			const module = draft.modules.find((candidate) => candidate.id === moduleId);
			if (!module?.development) return;
			module.development.status = status;
			module.development.issues = module.development.issues.filter((issue) => issue.code !== "runtime-error");
			if (status === "runtime-error") {
				module.enabled = false;
				module.development.issues.unshift({
					severity: "error",
					code: "runtime-error",
					message: message ?? "The sandboxed module stopped unexpectedly."
				});
			}
		});
	}
	setDeviceSetting(input) {
		return this.store.update((draft) => {
			const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
			if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
			if (!Object.hasOwn(device.settings, input.key)) throw new Error(`Unsupported setting for ${device.displayName}: ${input.key}`);
			device.settings[input.key] = input.value;
		});
	}
	async setDeviceControl(input) {
		await this.devices.setControl(input.deviceId, input.change);
		return this.store.get();
	}
	async refreshDevices() {
		await this.devices.refresh();
		return this.store.get();
	}
	setDeviceAppearanceOverride(input) {
		return this.store.update((draft) => {
			const device = draft.devices.find((candidate) => candidate.id === input.deviceId);
			if (!device) throw new Error(`Unknown device: ${input.deviceId}`);
			if (input.override) draft.settings.deviceAppearanceOverrides[input.deviceId] = input.override;
			else delete draft.settings.deviceAppearanceOverrides[input.deviceId];
			if (device.variantResolution.confidence === "hardware") return;
			const resolved = resolveDeviceVariant({
				...device.identity,
				variant: void 0,
				colorway: void 0
			}, [], input.override ?? void 0);
			device.identity = resolved.identity;
			device.variantResolution = resolved.resolution;
			device.asset = resolveProductAsset(resolved.identity, device.kind);
		});
	}
	async setAudioEnabled(enabled) {
		if (enabled) await this.initialize();
		return this.audioConfiguration.run(() => this.setAudioEnabledCore(enabled));
	}
	async setAudioEnabledCore(enabled) {
		if (this.store.get().audio.enabled === enabled) return this.store.get();
		if (enabled) {
			if (this.store.get().settings.developerMode !== true) throw new Error("Audio is available only when Developer mode is enabled in Settings, General.");
			this.store.update((draft) => {
				draft.audio.enabled = true;
				const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
				if (module) {
					module.installed = true;
					module.enabled = true;
				}
			});
			try {
				await this.startAudioEngine();
				return this.store.get();
			} catch (error) {
				this.store.update((draft) => {
					draft.audio.enabled = false;
					const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
					if (module) module.enabled = false;
				});
				throw error;
			}
		}
		if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
		this.audioRestartTimer = null;
		this.audioRestartAttempts = 0;
		await this.engines.stop("audio");
		return this.store.update((draft) => {
			draft.audio.enabled = false;
			const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
			if (module) module.enabled = false;
		});
	}
	setAudioBusGain(input) {
		return this.updateAudioConfiguration((draft) => {
			const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
			if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
			const bus = mix.buses.find((candidate) => candidate.id === input.busId);
			if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
			bus.gain = input.gain;
		});
	}
	setAudioMasterGain(input) {
		return this.updateAudioConfiguration((draft) => {
			const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
			if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
			mix.master.gain = input.gain;
		});
	}
	setAudioMasterEnabled(input) {
		return this.updateAudioConfiguration((draft) => {
			const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
			if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
			mix.master.enabled = input.enabled;
		});
	}
	setAudioBusEnabled(input) {
		return this.updateAudioConfiguration((draft) => {
			const mix = draft.audio.mixes.find((candidate) => candidate.id === input.mixId);
			if (!mix) throw new Error(`Unknown audio mix: ${input.mixId}`);
			const bus = mix.buses.find((candidate) => candidate.id === input.busId);
			if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
			bus.enabled = input.enabled;
		});
	}
	setAudioChannelEnabled(input) {
		return this.updateAudioConfiguration((draft) => {
			const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
			if (!bus) throw new Error(`Unknown audio channel: ${input.busId}`);
			bus.enabled = input.enabled;
		});
	}
	async setAudioBusDevice(input) {
		return this.updateAudioConfiguration((draft) => {
			const bus = draft.audio.buses.find((candidate) => candidate.id === input.busId);
			if (!bus) throw new Error(`Unknown audio bus: ${input.busId}`);
			const device = draft.audio.devices.find((candidate) => candidate.id === input.deviceId);
			if (!device) throw new Error(`Unknown audio device: ${input.deviceId}`);
			if (!device.available) throw new Error(`${device.name} is not currently available.`);
			const requiredDirection = bus.id === "mic" ? "input" : "output";
			if (device.direction !== requiredDirection) throw new Error(`${device.name} cannot be assigned to the ${bus.label} channel.`);
			if (device.isSwitchboard) throw new Error("Choose a physical Windows audio device instead of a Switchboard transport endpoint.");
			bus.deviceId = input.deviceId;
			if (bus.id === "mic") draft.audio.microphoneDevice = device.name;
			if (bus.id === "game") draft.audio.outputDevice = device.name;
		});
	}
	async setAudioApplicationRoute(input) {
		const before = this.store.get();
		if (before.audio.capabilities.applicationRouting !== "available") throw new Error(before.audio.capabilities.reason ?? "Application audio routing is unavailable.");
		const application = before.audio.applications.find((candidate) => candidate.id === input.applicationId);
		if (!application) throw new Error("That audio session is no longer available.");
		const hostSnapshot = audioHostSnapshotSchema.parse(await this.engines.request("audio", "routeApplication", {
			processId: application.processId,
			destination: input.destination
		}, 15e3));
		this.applyAudioHostSnapshot(hostSnapshot);
		return this.store.get();
	}
	async applyAudioPreset(input) {
		return this.updateAudioConfiguration((draft) => {
			const preset = draft.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
			if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
			applyAudioPathPreset(draft.audio, preset);
		});
	}
	createAudioPreset(input) {
		const id = `user-${input.kind}-${randomUUID()}`;
		return this.updateAudioConfiguration((draft) => {
			const preset = snapshotAudioPathPreset(draft.audio, input.kind, id, input.name);
			draft.audio.pathPresets.push(preset);
			draft.audio.activePresetIds[input.kind] = id;
		});
	}
	renameAudioPreset(input) {
		return this.updateAudioConfiguration((draft) => {
			const preset = draft.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
			if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
			if (preset.builtIn) throw new Error("Built-in presets cannot be renamed. Duplicate it first.");
			preset.name = input.name;
		});
	}
	duplicateAudioPreset(input) {
		return this.updateAudioConfiguration((draft) => {
			const source = draft.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
			if (!source) throw new Error(`Unknown audio preset: ${input.presetId}`);
			const copy = {
				...structuredClone(source),
				id: `user-${source.kind}-${randomUUID()}`,
				name: `${source.name} copy`,
				builtIn: false
			};
			draft.audio.pathPresets.push(copy);
			applyAudioPathPreset(draft.audio, copy);
		});
	}
	deleteAudioPreset(input) {
		return this.updateAudioConfiguration((draft) => {
			const index = draft.audio.pathPresets.findIndex((candidate) => candidate.id === input.presetId);
			if (index < 0) throw new Error(`Unknown audio preset: ${input.presetId}`);
			const preset = draft.audio.pathPresets[index];
			if (preset.builtIn) throw new Error("Built-in presets cannot be deleted.");
			draft.audio.pathPresets.splice(index, 1);
			if (draft.audio.activePresetIds[preset.kind] === preset.id) draft.audio.activePresetIds[preset.kind] = findMatchingAudioPresetId(draft.audio, preset.kind);
		});
	}
	async importAudioPreset() {
		const selection = await dialog.showOpenDialog({
			title: "Import audio preset",
			properties: ["openFile"],
			filters: [{
				name: "Switchboard audio preset",
				extensions: ["json"]
			}]
		});
		if (selection.canceled || !selection.filePaths[0]) return this.store.get();
		const source = await readFile(selection.filePaths[0], "utf8");
		if (Buffer.byteLength(source, "utf8") > 1e6) throw new Error("Audio preset files must be smaller than 1 MB.");
		const imported = audioPresetFileSchema.parse(JSON.parse(source));
		return this.updateAudioConfiguration((draft) => {
			const id = `user-${imported.preset.kind}-${randomUUID()}`;
			const preset = {
				...structuredClone(imported.preset),
				id,
				builtIn: false
			};
			draft.audio.pathPresets.push(preset);
			applyAudioPathPreset(draft.audio, preset);
		});
	}
	async exportAudioPreset(input) {
		const preset = this.store.get().audio.pathPresets.find((candidate) => candidate.id === input.presetId);
		if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
		const safeName = preset.name.replace(/[^a-z0-9 _-]/gi, "").trim() || "audio-preset";
		const selection = await dialog.showSaveDialog({
			title: "Export audio preset",
			defaultPath: `${safeName}.json`,
			filters: [{
				name: "Switchboard audio preset",
				extensions: ["json"]
			}]
		});
		if (selection.canceled || !selection.filePath) return;
		const payload = audioPresetFileSchema.parse({
			schemaVersion: 1,
			preset
		});
		await writeFile(selection.filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
	}
	setAudioChannelProcessor(input) {
		return this.updateAudioConfiguration((draft) => {
			const processing = draft.audio.channelProcessing.find((candidate) => candidate.busId === input.busId);
			if (!processing) throw new Error(`Unknown audio processing path: ${input.busId}`);
			if (input.processorId === "equalizer") processing.equalizer = {
				...processing.equalizer,
				enabled: input.enabled ?? processing.equalizer.enabled,
				...input.parameters
			};
			else if (input.processorId === "normalization") processing.normalization = {
				...processing.normalization,
				enabled: input.enabled ?? processing.normalization.enabled,
				...input.parameters
			};
			else if (input.processorId === "compressor") processing.compressor = {
				...processing.compressor,
				enabled: input.enabled ?? processing.compressor.enabled,
				...input.parameters
			};
			else processing.limiter = {
				...processing.limiter,
				enabled: input.enabled ?? processing.limiter.enabled,
				...input.parameters
			};
			const index = draft.audio.channelProcessing.indexOf(processing);
			draft.audio.channelProcessing[index] = channelProcessingSchema.parse(processing);
			draft.audio.activePresetIds[input.busId] = findMatchingAudioPresetId(draft.audio, input.busId);
		});
	}
	async setAudioMonitoring(input) {
		return this.updateAudioConfiguration((draft) => {
			if (draft.audio.capabilities.monitoring === "unavailable" && input.enabled !== false) throw new Error("Low-latency microphone monitoring is unavailable until Audio.Host owns the microphone stream.");
			const nextDeviceId = input.deviceId ?? draft.audio.monitoringDeviceId;
			const nextEnabled = input.enabled ?? draft.audio.monitoringEnabled;
			const nextDevice = draft.audio.devices.find((candidate) => candidate.id === nextDeviceId);
			if (nextEnabled && (!nextDevice?.available || nextDevice.direction !== "output" || nextDevice.isSwitchboard)) throw new Error("Select an available physical output before enabling microphone monitoring.");
			if (typeof input.enabled === "boolean") draft.audio.monitoringEnabled = input.enabled;
			if (typeof input.level === "number") draft.audio.monitoring = input.level;
			if (input.deviceId) {
				const device = draft.audio.devices.find((candidate) => candidate.id === input.deviceId);
				if (!device?.available || device.direction !== "output" || device.isSwitchboard) throw new Error("Select an available physical output device for monitoring.");
				draft.audio.monitoringDeviceId = input.deviceId;
			}
			draft.audio.activePresetIds.microphone = findMatchingAudioPresetId(draft.audio, "microphone");
		});
	}
	async testMicrophone() {
		const snapshot = this.store.get();
		if (snapshot.audio.capabilities.microphoneTest !== "available") throw new Error(snapshot.audio.host?.capabilities.reason ?? "Microphone testing is unavailable with the current audio setup.");
		await this.engines.request("audio", "testMicrophone", void 0, 1e4);
	}
	setChatMix(value) {
		const normalized = Math.max(-1, Math.min(1, value));
		return this.updateAudioConfiguration((draft) => {
			draft.audio.chatMix = normalized;
		});
	}
	async setMicProcessor(input) {
		return this.updateAudioConfiguration((draft) => {
			const processor = draft.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
			if (!processor) throw new Error(`Unknown microphone processor: ${input.processorId}`);
			const index = draft.audio.micProcessors.indexOf(processor);
			draft.audio.micProcessors[index] = micProcessorSchema.parse({
				...processor,
				enabled: input.enabled ?? processor.enabled,
				parameters: {
					...processor.parameters,
					...input.parameters
				}
			});
			draft.audio.activePresetIds.microphone = findMatchingAudioPresetId(draft.audio, "microphone");
		});
	}
	async setCaptureConfig(input) {
		await this.cancelDiagnostics();
		const before = this.store.get();
		const mergedInput = { ...input };
		if (input.defaultTrackLevels) mergedInput.defaultTrackLevels = {
			...before.capture.config.defaultTrackLevels,
			...input.defaultTrackLevels
		};
		const nextConfig = captureConfigSchema.parse({
			...before.capture.config,
			...mergedInput
		});
		if (nextConfig.includeSystemAudio && nextConfig.systemAudioMode === "game" && nextConfig.source === "display") throw new Error("Game-only audio needs a game or window source. Choose one or switch audio to All desktop audio.");
		developerDiagnostics.record("main", "info", "capture.configure-requested", captureDiagnosticSettings(nextConfig));
		const requestedHotkey = input.hotkey;
		const hotkeyChanged = typeof requestedHotkey === "string" && requestedHotkey !== before.capture.config.hotkey;
		if (hotkeyChanged) this.registerCaptureShortcut(requestedHotkey, true);
		const disabling = before.capture.config.enabled && !nextConfig.enabled;
		const replayWindowChanged = before.capture.config.enabled && nextConfig.enabled && before.capture.config.replaySeconds !== nextConfig.replaySeconds;
		if (disabling || replayWindowChanged) await this.autoCaptureCoordinator.flushBeforeCaptureStops(disabling ? "capture-disabled" : "replay-buffer-changed");
		if (disabling) {
			if (this.captureRestartTimer) clearTimeout(this.captureRestartTimer);
			this.captureRestartTimer = null;
			this.captureRestartAttempts = 0;
			this.captureAudioIntegrationSignature = null;
			this.store.update((draft) => {
				draft.capture.config = nextConfig;
				draft.capture.runtime = {
					...draft.capture.runtime,
					state: "stopped",
					bufferedSeconds: 0,
					segmentCount: 0,
					replayCacheBytes: 0,
					observedBitrateBps: 0,
					activeSource: null,
					saveQueueDepth: 0,
					error: void 0,
					warning: draft.capture.runtime.warning?.includes("could not be registered") ? draft.capture.runtime.warning : void 0
				};
				draft.capture.storage.replayCacheBytes = 0;
				const module = draft.modules.find((candidate) => candidate.id === "capability.replay");
				if (module) module.enabled = false;
			});
		}
		try {
			if (!before.capture.config.enabled && nextConfig.enabled) await this.startCaptureEngine(nextConfig);
			if (disabling) await this.engines.stop("capture");
			if (before.capture.config.enabled && nextConfig.enabled) {
				const engineStatus = this.engines.getStatus("capture");
				if (!(engineStatus.state === "running" || engineStatus.state === "starting")) await this.startCaptureEngine(nextConfig);
				else try {
					const hostSnapshot = captureHostSnapshotSchema.parse(await this.engines.request("capture", "configure", this.toHostSettings(nextConfig), 45e3));
					this.captureAudioIntegrationSignature = this.getCaptureAudioIntegrationSignature(nextConfig);
					this.applyCaptureSnapshot(hostSnapshot);
				} catch (configureError) {
					if (nextConfig.enabled && isEngineNotRunningError(configureError)) await this.startCaptureEngine(nextConfig);
					else throw configureError;
				}
			}
		} catch (operationError) {
			developerDiagnostics.record("main", "error", "capture.configure-rejected", {
				error: String(operationError).slice(0, 4096),
				previousSource: before.capture.config.source,
				requestedSource: nextConfig.source,
				requestedEncoder: nextConfig.encoder
			});
			if (hotkeyChanged) this.registerCaptureShortcut(before.capture.config.hotkey, false);
			if (nextConfig.enabled) this.store.update((draft) => {
				draft.capture.runtime.state = "error";
				draft.capture.runtime.error = operationError instanceof Error ? operationError.message : String(operationError);
				draft.capture.runtime.warning = void 0;
			}, { persist: false });
			throw operationError;
		}
		return this.store.update((draft) => {
			draft.capture.config = nextConfig;
			const module = draft.modules.find((candidate) => candidate.id === "capability.replay");
			if (module) {
				module.installed = true;
				module.enabled = nextConfig.enabled;
			}
		});
	}
	async updateAutoCaptureSettings(input) {
		const patch = autoCaptureSettingsPatchSchema.parse(input);
		const current = this.store.get().capture.autoCapture.settings;
		const games = { ...current.games };
		for (const [gameId, gamePatch] of Object.entries(patch.games ?? {})) games[gameId] = {
			enabled: true,
			useGlobalTiming: true,
			...games[gameId],
			...gamePatch,
			events: {
				...games[gameId]?.events,
				...gamePatch.events
			}
		};
		const next = autoCaptureSettingsSchema.parse({
			...current,
			...patch,
			reactionClipping: {
				...current.reactionClipping,
				...patch.reactionClipping
			},
			games,
			dismissedAvailability: {
				...current.dismissedAvailability,
				...patch.dismissedAvailability
			}
		});
		this.store.update((draft) => {
			draft.capture.autoCapture.settings = next;
		});
		const snapshot = this.store.get();
		await this.autoCaptureCoordinator.reconcile(snapshot.capture.runtime.activeSource, snapshot.capture.config.enabled, snapshot.gameDetection.games);
		this.scheduleCaptureAudioIntegrationSync();
		await this.captureAudioIntegrationUpdate;
		return this.store.get();
	}
	async setupAutoCaptureProvider(providerId) {
		await this.autoCaptureCoordinator.setup(providerId);
		return this.store.get();
	}
	async emitAutoCaptureTestEvent(input) {
		if (!this.store.get().prototypeMode) throw new Error("Auto Capture test events are available only in development builds.");
		await this.autoCaptureCoordinator.emitTestEvent(input.type);
		return this.store.get();
	}
	async saveReplay() {
		if (!this.store.get().capture.config.enabled) throw new Error("Enable Instant Replay before saving a clip.");
		const response = await this.engines.request("capture", "saveReplay", { requestedAt: Date.now() }, 12e4);
		const result = workerSavedClipSchema.parse(response);
		return this.persistSavedClip(result);
	}
	async preserveAutoCaptureWindow(request) {
		const snapshot = this.store.get();
		if (!snapshot.capture.config.enabled) throw new Error("Instant Replay stopped before the Auto Capture window could be preserved.");
		const response = await this.engines.request("capture", "saveReplay", {
			startedAt: request.startedAt,
			endedAt: request.endsAt
		}, 12e4);
		const result = workerSavedClipSchema.parse(response);
		const game = snapshot.capture.autoCapture.providers.find((candidate) => candidate.id === request.providerId)?.displayName ?? result.game ?? request.gameId;
		const clipStartedAt = result.captureStartedAt ?? Math.max(0, (result.captureEndedAt ?? request.endsAt) - result.durationMs);
		const markers = markersForClip(request.events, clipStartedAt, result.durationMs);
		this.persistSavedClip(result, {
			game,
			name: autoCaptureTitle(game, request.events),
			autoCapture: {
				autoCaptured: true,
				providerId: request.providerId,
				gameId: request.gameId,
				events: markers
			}
		});
	}
	persistSavedClip(result, overrides = {}) {
		const game = overrides.game ?? result.game ?? void 0;
		const clip = {
			id: randomUUID(),
			path: result.path,
			name: overrides.name ?? createDefaultClipTitle(game, result.createdAt),
			...game ? { game } : {},
			createdAt: result.createdAt,
			durationMs: result.durationMs,
			fileSize: result.fileSize,
			width: result.width,
			height: result.height,
			fps: result.fps,
			...result.codec ? { codec: result.codec } : {},
			...result.thumbnailPath ? { thumbnailPath: result.thumbnailPath } : {},
			favorite: false,
			titleEdited: false,
			canvasSize: "original",
			...overrides.autoCapture ? { autoCapture: overrides.autoCapture } : {}
		};
		const updated = this.store.update((draft) => {
			draft.capture.runtime.lastSavedAt = new Date(result.createdAt).toISOString();
			draft.clips.unshift(clip);
			draft.capture.storage.clipsBytes = draft.clips.reduce((sum, candidate) => sum + candidate.fileSize, 0);
		});
		this.clipLibrary.enqueueThumbnail(clip, (enrichment) => {
			this.store.update((draft) => {
				const current = draft.clips.find((candidate) => candidate.id === clip.id);
				if (current) Object.assign(current, enrichment);
			});
		});
		return updated;
	}
	async chooseClipDirectory() {
		const selection = await dialog.showOpenDialog({
			title: "Choose Switchboard Clips folder",
			defaultPath: this.capturePaths.clipsDirectory,
			properties: ["openDirectory", "createDirectory"]
		});
		if (selection.canceled || selection.filePaths.length === 0) return this.store.get();
		const selected = selection.filePaths[0];
		const paths = await this.captureStorage.validate(selected);
		const before = this.store.get();
		if (before.capture.config.enabled) {
			const hostSnapshot = captureHostSnapshotSchema.parse(await this.engines.request("capture", "configure", this.toHostSettings({
				...before.capture.config,
				clipsDirectory: selected
			}, paths), 45e3));
			this.applyCaptureSnapshot(hostSnapshot);
		}
		this.capturePaths = paths;
		const storage = await this.captureStorage.getStorageStatus(paths, before.clips.reduce((sum, clip) => sum + clip.fileSize, 0), before.capture.runtime.replayCacheBytes);
		const snapshot = this.store.update((draft) => {
			draft.capture.config.clipsDirectory = selected;
			draft.capture.storage = storage;
		});
		this.reconcileClipLibrary();
		return snapshot;
	}
	async openClipsDirectory() {
		this.capturePaths = await this.captureStorage.validate(this.store.get().capture.config.clipsDirectory);
		const result = await shell.openPath(this.capturePaths.clipsDirectory);
		if (result) throw new Error(result);
	}
	async refreshCaptureSources() {
		const wasRunning = this.engines.hasLiveProcess("capture");
		if (!wasRunning) await this.engines.start("capture");
		try {
			const sources = z.array(captureSourceSchema).parse(await this.engines.request("capture", "listSources", void 0, 15e3));
			const nativeSources = await this.listNativeCaptureSources(sources);
			const visibleSources = onlySourcesAvailableToElectron(sources, nativeSources, captureIndexedDisplays().map((display) => display.id));
			this.validatedCaptureWindowSourceIds.clear();
			for (const source of visibleSources) if (source.type === "window") this.validatedCaptureWindowSourceIds.add(source.id);
			const orderedSources = orderCaptureSourcesByDisplayPosition(visibleSources);
			const snapshot = this.store.update((draft) => {
				draft.capture.sources = orderedSources;
			}, { persist: false });
			this.replaceCaptureSourceThumbnails(orderedSources, nativeSources);
			return snapshot;
		} finally {
			if (!wasRunning) await this.engines.stop("capture");
		}
	}
	scanGames() {
		if (this.gameScan) return this.gameScan;
		this.gameScan = this.performGameScan();
		return this.gameScan;
	}
	async addGame() {
		const selection = await dialog.showOpenDialog({
			title: "Add a game executable",
			buttonLabel: "Add game",
			properties: ["openFile"],
			filters: [{
				name: "Windows games",
				extensions: ["exe"]
			}]
		});
		if (selection.canceled || selection.filePaths.length === 0) return this.store.get();
		const game = await this.gameDiscovery.fromExecutable(selection.filePaths[0]);
		const key = gameIdentityKey(game);
		const current = this.store.get();
		if (current.gameDetection.games.some((candidate) => gameIdentityKey(candidate) === key)) return current;
		return this.store.update((draft) => {
			draft.gameDetection.games.push(game);
			draft.gameDetection.games.sort((left, right) => left.name.localeCompare(right.name, void 0, { sensitivity: "base" }));
			draft.gameDetection.error = void 0;
		});
	}
	async updateSettings(input) {
		const diagnosticsWereEnabled = this.store.getDetailedDiagnosticsEnabled();
		const automaticScanWasEnabled = this.store.get().settings.scanGamesAutomatically;
		const disablingDeveloperMode = input.developerMode === false;
		if (disablingDeveloperMode) {
			if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
			this.audioRestartTimer = null;
			this.audioRestartAttempts = 0;
			await this.engines.stop("audio");
		}
		const snapshot = this.store.update((draft) => {
			draft.settings = {
				...draft.settings,
				...input
			};
			if (disablingDeveloperMode) {
				draft.settings.detailedDiagnostics = false;
				draft.audio.enabled = false;
				const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
				if (module) module.enabled = false;
			}
		});
		const diagnosticsEnabled = this.store.getDetailedDiagnosticsEnabled();
		if (diagnosticsEnabled !== diagnosticsWereEnabled) {
			debugDiagnostics.setEnabled(diagnosticsEnabled);
			if (diagnosticsEnabled) this.performance.clearDebugHistory();
			else {
				this.performance.invalidateDebugSample();
				this.store.update((draft) => {
					delete draft.performance.debug;
				}, { persist: false });
			}
			this.performance.refresh();
		}
		if (typeof input.developerMode === "boolean") await this.syncDeveloperDiagnostics();
		if (typeof input.launchAtStartup === "boolean") this.applyLoginItemSetting(input.launchAtStartup);
		if (typeof input.automaticAppUpdates === "boolean" || typeof input.automaticAppUpdateDownloads === "boolean" || typeof input.installAppUpdatesOnNextStartup === "boolean" || typeof input.installAppUpdatesWhenIdle === "boolean") this.appUpdates.setPreferences(appUpdatePreferences(snapshot.settings));
		if (input.scanGamesAutomatically === true && !automaticScanWasEnabled) return this.scanGames();
		if (input.mouseBatteryLighting) {
			await this.devices.refreshBatteryLighting();
			return this.store.get();
		}
		return snapshot;
	}
	async exportResourceDiagnostics() {
		const snapshot = this.store.get();
		const run = snapshot.diagnostics;
		const exportRun = run.id !== null && run.status !== "running";
		const exportCapture = structuredClone(exportRun ? this.diagnosticCaptureContext ?? captureDiagnosticContext(snapshot) : captureDiagnosticContext(snapshot));
		const exportGraphics = structuredClone(exportRun ? this.diagnosticRunGraphics : this.diagnosticsGpu);
		if (!developerDiagnostics.enabled && !exportRun) throw new Error("Run diagnostics or enable Developer mode before exporting diagnostics.");
		const samples = this.performance.getDebugHistory();
		developerDiagnostics.record("main", "info", "diagnostics.export-requested", { resourceSamples: samples.length });
		const result = await dialog.showSaveDialog({
			title: "Export diagnostics",
			defaultPath: `switchboard-diagnostics-${Date.now()}.json`,
			filters: [{
				name: "JSON report",
				extensions: ["json"]
			}]
		});
		if (result.canceled || !result.filePath) return false;
		if (!developerDiagnostics.enabled && !exportRun) throw new Error("Developer mode was disabled before the export completed.");
		await writeFile(result.filePath, JSON.stringify({
			schemaVersion: 2,
			version: snapshot.version,
			exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
			droppedJournalWrites: this.resourceJournal.getDroppedWrites(),
			limits: "Developer events and capture context plus the last 120 optional resource samples. Timings are inclusive wall time, not CPU attribution. Native child CPU, GPU load and Windows handle counts are unavailable. Renderer heap is approximate. Paths, URLs, and credentials are redacted; window titles and media are omitted.",
			environment: {
				platform: process.platform,
				arch: process.arch,
				windowsRelease: release(),
				windowsVersion: version(),
				electron: process.versions.electron,
				chrome: process.versions.chrome,
				node: process.versions.node,
				packaged: app.isPackaged,
				softwareRendering: snapshot.settings.softwareRendering,
				graphics: exportGraphics,
				graphicsFeatures: app.getGPUFeatureStatus(),
				displays: screen.getAllDisplays().map((display) => ({
					width: display.size.width,
					height: display.size.height,
					scaleFactor: display.scaleFactor,
					displayFrequency: display.displayFrequency,
					colorDepth: display.colorDepth,
					rotation: display.rotation
				}))
			},
			capture: exportCapture,
			...exportRun ? { diagnosticRun: run } : {},
			developer: developerDiagnostics.snapshot(),
			samples
		}, null, 2), "utf8");
		return true;
	}
	runDiagnostics() {
		if (this.diagnosticRunTask || this.disposed) return this.store.get();
		const runId = randomUUID();
		this.diagnosticRunCancelled = false;
		this.diagnosticCaptureContext = captureDiagnosticContext(this.store.get());
		const snapshot = this.store.update((draft) => {
			draft.diagnostics = {
				id: runId,
				status: "running",
				startedAt: (/* @__PURE__ */ new Date()).toISOString(),
				completedAt: null,
				summary: "Checking this installation and capture setup…",
				checks: []
			};
		}, { persist: false });
		this.diagnosticRunTask = this.executeDiagnosticRun(runId).finally(() => {
			this.diagnosticRunTask = null;
		});
		return snapshot;
	}
	async cancelDiagnostics() {
		if (this.diagnosticRunTask) {
			this.diagnosticRunCancelled = true;
			this.diagnosticRunHost?.send("capture", "cancelDiagnostics", { runId: this.store.get().diagnostics.id });
			await this.diagnosticRunTask;
		}
		return this.store.get();
	}
	recordDiagnosticCheck(runId, input) {
		const run = this.store.get().diagnostics;
		if (run.id !== runId || run.status !== "running") return;
		const check = sanitizeDiagnosticCheck(input);
		this.store.update((draft) => {
			const index = draft.diagnostics.checks.findIndex((previous) => previous.id === check.id);
			if (index >= 0) draft.diagnostics.checks[index] = check;
			else if (draft.diagnostics.checks.length < 64) draft.diagnostics.checks.push(check);
		}, { persist: false });
	}
	async executeDiagnosticRun(runId) {
		let ownedHost = null;
		let failure = null;
		try {
			this.recordDiagnosticCheck(runId, {
				id: "environment",
				label: "Windows and graphics",
				status: "running",
				detail: "Reading installation and GPU information."
			});
			let gpuTimeout;
			const gpu = await Promise.race([app.getGPUInfo("basic"), new Promise((_resolve, reject) => {
				gpuTimeout = setTimeout(() => reject(/* @__PURE__ */ new Error("GPU information timed out.")), 5e3);
				gpuTimeout.unref();
			})]).catch(() => null).finally(() => clearTimeout(gpuTimeout));
			this.diagnosticRunGraphics = gpu ? diagnosticGpuInfo(gpu) : { unavailable: "GPU information is unavailable." };
			this.recordDiagnosticCheck(runId, {
				id: "environment",
				label: "Windows and graphics",
				status: gpu ? "pass" : "warning",
				detail: `${version()} (${release()}) · Switchboard ${package_default.version}. ${gpu ? "GPU and driver details collected for export." : "GPU details could not be read."}`
			});
			if (this.diagnosticRunCancelled) return;
			const host = this.engines.hasLiveProcess("capture") ? this.engines : ownedHost = new EngineSupervisor(() => void 0, () => void 0, (kind, event, payload) => {
				if (kind === "capture" && event === "diagnosticCheck") this.applyDiagnosticCheck(payload);
			});
			this.diagnosticRunHost = host;
			if (ownedHost) await host.start("capture");
			if (this.diagnosticRunCancelled) return;
			z.object({ completed: z.literal(true) }).parse(await host.request("capture", "runDiagnostics", {
				runId,
				settings: this.toHostSettings(this.store.get().capture.config)
			}, 95e3));
		} catch (error) {
			if (!this.diagnosticRunCancelled) {
				failure = error instanceof Error ? error.message : String(error);
				this.recordDiagnosticCheck(runId, {
					id: "run-error",
					label: "Diagnostic run",
					status: "fail",
					detail: failure.slice(0, 8192)
				});
			}
		} finally {
			if (ownedHost) await ownedHost.stop("capture").catch(() => void 0);
			this.diagnosticRunHost = null;
			this.store.update((draft) => {
				draft.diagnostics.status = this.diagnosticRunCancelled ? "cancelled" : failure ? "error" : "completed";
				draft.diagnostics.completedAt = (/* @__PURE__ */ new Date()).toISOString();
				draft.diagnostics.checks = draft.diagnostics.checks.map((check) => check.status === "running" ? {
					...check,
					status: "skipped",
					detail: "This check did not finish."
				} : check);
				draft.diagnostics.summary = this.diagnosticRunCancelled ? "Diagnostics cancelled. Completed checks can still be saved." : summarizeDiagnosticChecks(draft.diagnostics.checks);
			}, { persist: false });
		}
	}
	applyDiagnosticCheck(payload) {
		const parsed = z.object({
			runId: z.string().uuid(),
			check: diagnosticCheckSchema
		}).safeParse(payload);
		if (parsed.success) this.recordDiagnosticCheck(parsed.data.runId, parsed.data.check);
	}
	async syncDeveloperDiagnostics() {
		const enabled = this.store.get().settings.developerMode === true;
		if (enabled === developerDiagnostics.enabled) return;
		const generation = ++this.diagnosticsGeneration;
		developerDiagnostics.setEnabled(enabled);
		this.diagnosticsGpu = { unavailable: enabled ? "GPU metadata is being collected." : "Developer mode is off." };
		try {
			await this.engines.syncDeveloperDiagnostics();
		} catch (error) {
			developerDiagnostics.record("main", "warning", "diagnostics.host-sync-failed", { error: String(error).slice(0, 4096) });
		}
		if (generation !== this.diagnosticsGeneration || !enabled || !developerDiagnostics.enabled) return;
		developerDiagnostics.record("main", "info", "environment", {
			version: currentCoreVersion(),
			platform: process.platform,
			arch: process.arch,
			osRelease: release(),
			osVersion: version(),
			electron: process.versions.electron ?? "",
			packaged: app.isPackaged,
			softwareRendering: this.store.get().settings.softwareRendering
		});
		developerDiagnostics.record("main", "info", "capture.settings", captureDiagnosticSettings(this.store.get().capture.config));
		app.getGPUInfo("complete").then((info) => {
			if (generation !== this.diagnosticsGeneration || !developerDiagnostics.enabled) return;
			this.diagnosticsGpu = diagnosticGpuInfo(info);
			developerDiagnostics.record("main", "info", "graphics.info", { details: JSON.stringify(this.diagnosticsGpu).slice(0, 4096) });
		}).catch((error) => {
			if (generation !== this.diagnosticsGeneration || !developerDiagnostics.enabled) return;
			this.diagnosticsGpu = { unavailable: "GPU metadata query failed." };
			developerDiagnostics.record("main", "warning", "graphics.query-failed", { error: String(error).slice(0, 4096) });
		});
	}
	async checkAppUpdates() {
		await this.appUpdates.checkForUpdates();
		return this.store.get();
	}
	async downloadAppUpdate() {
		await this.appUpdates.downloadAvailableUpdate();
		return this.store.get();
	}
	async installAppUpdate() {
		await this.appUpdates.installDownloadedUpdate();
	}
	enableDemoUpdate() {
		this.appUpdates.enableDemoUpdate();
		return this.store.get();
	}
	async submitFeedbackReport(input) {
		return submitFeedbackReport(input, {
			version: this.store.get().version,
			runtime: `Electron ${process.versions.electron ?? "unknown"}`,
			platform: `${process.platform} ${process.arch}`,
			prototypeMode: this.store.get().prototypeMode
		});
	}
	async resetSettings(scope) {
		if (scope === "all" || scope === "audio") await this.engines.stop("audio");
		if (scope === "all" || scope === "capture") await this.engines.stop("capture");
		if (scope === "general" && this.store.get().settings.developerMode === true && defaultSettings.developerMode !== true) await this.engines.stop("audio");
		let snapshot = this.store.update((draft) => {
			if (scope === "all") {
				draft.settings = structuredClone(defaultSettings);
				draft.audio = createResetAudioState(draft.audio);
				draft.capture.config = structuredClone(defaultCaptureConfig);
				draft.capture.autoCapture.settings = structuredClone(defaultAutoCapture.settings);
				draft.gameDetection = structuredClone(defaultGameDetection);
				const audioModule = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
				if (audioModule) audioModule.enabled = false;
				const captureModule = draft.modules.find((candidate) => candidate.id === "capability.replay");
				if (captureModule) captureModule.enabled = false;
				return;
			}
			if (scope === "general") {
				draft.settings.uiScalePercent = defaultSettings.uiScalePercent;
				draft.settings.launchAtStartup = defaultSettings.launchAtStartup;
				draft.settings.closeToTray = defaultSettings.closeToTray;
				draft.settings.destroyRendererInTray = defaultSettings.destroyRendererInTray;
				draft.settings.softwareRendering = defaultSettings.softwareRendering;
				draft.settings.automaticAppUpdates = defaultSettings.automaticAppUpdates;
				draft.settings.automaticAppUpdateDownloads = defaultSettings.automaticAppUpdateDownloads;
				draft.settings.installAppUpdatesOnNextStartup = defaultSettings.installAppUpdatesOnNextStartup;
				draft.settings.installAppUpdatesWhenIdle = defaultSettings.installAppUpdatesWhenIdle;
				draft.settings.developerMode = defaultSettings.developerMode;
				if (defaultSettings.developerMode !== true) {
					draft.settings.detailedDiagnostics = false;
					draft.audio.enabled = false;
					const audioModule = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
					if (audioModule) audioModule.enabled = false;
				}
			}
			if (scope === "devices") {
				draft.settings.deviceAppearanceOverrides = {};
				draft.settings.mouseBatteryLighting = {};
			}
			if (scope === "audio") {
				draft.audio = createResetAudioState(draft.audio);
				const module = draft.modules.find((candidate) => candidate.id === "capability.audio-router");
				if (module) module.enabled = false;
			}
			if (scope === "capture") {
				draft.capture.config = structuredClone(defaultCaptureConfig);
				draft.capture.autoCapture.settings = structuredClone(defaultAutoCapture.settings);
				const module = draft.modules.find((candidate) => candidate.id === "capability.replay");
				if (module) module.enabled = false;
			}
			if (scope === "games") {
				draft.settings.scanGamesAutomatically = defaultSettings.scanGamesAutomatically;
				draft.gameDetection = structuredClone(defaultGameDetection);
			}
			if (scope === "modules") draft.settings.automaticModuleUpdates = defaultSettings.automaticModuleUpdates;
			if (scope === "diagnostics") {
				draft.settings.performanceGuard = defaultSettings.performanceGuard;
				draft.settings.detailedDiagnostics = false;
				draft.settings.diagnosticsRetentionDays = defaultSettings.diagnosticsRetentionDays;
			}
		});
		if (scope === "all" || scope === "general") await this.syncDeveloperDiagnostics();
		if (scope === "all" || scope === "diagnostics" || scope === "general" && !snapshot.settings.developerMode) {
			this.performance.invalidateDebugSample();
			debugDiagnostics.setEnabled(false);
			snapshot = this.store.update((draft) => {
				delete draft.performance.debug;
			}, { persist: false });
			this.performance.refresh();
		}
		if (scope === "all" || scope === "general") this.appUpdates.setPreferences(appUpdatePreferences(snapshot.settings));
		if (scope === "all" || scope === "capture") {
			this.capturePaths = await this.captureStorage.validate(defaultCaptureConfig.clipsDirectory);
			const storage = await this.captureStorage.getStorageStatus(this.capturePaths, snapshot.clips.reduce((sum, clip) => sum + clip.fileSize, 0), 0);
			this.registerCaptureShortcut(defaultCaptureConfig.hotkey, false);
			snapshot = this.store.update((draft) => {
				draft.capture.storage = storage;
			});
			this.reconcileClipLibrary();
		}
		this.applyLoginItemSetting(snapshot.settings.launchAtStartup);
		return snapshot;
	}
	async revealClip(id) {
		const knownClip = this.store.get().clips.find((clip) => clip.id === id);
		if (!knownClip) throw new Error("Rejected an unknown clip path.");
		if (!existsSync(knownClip.path)) throw new Error("The clip file no longer exists.");
		shell.showItemInFolder(knownClip.path);
	}
	async deleteClip(id) {
		const clip = this.store.get().clips.find((candidate) => candidate.id === id);
		if (!clip) throw new Error("The clip no longer exists in the library.");
		if (!existsSync(clip.path)) throw new Error("The clip file no longer exists.");
		await shell.trashItem(clip.path);
		await this.clipLibrary.removeThumbnail(clip);
		return this.store.update((draft) => {
			draft.clips = draft.clips.filter((candidate) => candidate.id !== id);
			draft.capture.storage.clipsBytes = draft.clips.reduce((sum, candidate) => sum + candidate.fileSize, 0);
		});
	}
	markClipsReviewed(input) {
		return this.store.update((draft) => {
			draft.clipReview.reviewedThrough = Math.max(draft.clipReview.reviewedThrough, input.reviewedThrough);
		});
	}
	async renameClip(input) {
		if (!this.store.get().clips.find((candidate) => candidate.id === input.id)) throw new Error("The clip no longer exists in the library.");
		return this.store.update((draft) => {
			const index = draft.clips.findIndex((candidate) => candidate.id === input.id);
			if (index >= 0) {
				const current = draft.clips[index];
				const name = input.name.trim();
				draft.clips[index] = {
					...current,
					name,
					titleEdited: name !== createDefaultClipTitle(clipGameLabel(current), current.createdAt)
				};
			}
		});
	}
	setClipFavorite(input) {
		if (!this.store.get().clips.find((candidate) => candidate.id === input.id)) throw new Error("The clip no longer exists in the library.");
		return this.store.update((draft) => {
			const current = draft.clips.find((candidate) => candidate.id === input.id);
			if (current) current.favorite = input.favorite;
		});
	}
	setClipTrim(input) {
		const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
		if (!clip) throw new Error("The clip no longer exists in the library.");
		if (input.endMs > clip.durationMs) throw new Error("The trim range exceeds the clip duration.");
		if (input.endMs - input.startMs < 100) throw new Error("Keep at least 0.1 seconds in the trim range.");
		for (const trim of input.audioTrackTrims ?? []) {
			if (!trim) continue;
			if (trim.endMs > clip.durationMs) throw new Error("An audio track trim exceeds the clip duration.");
			if (trim.endMs - trim.startMs < 100) throw new Error("Keep at least 0.1 seconds in each audio track trim range.");
		}
		return this.store.update((draft) => {
			const current = draft.clips.find((candidate) => candidate.id === input.id);
			if (!current) return;
			if (input.music !== void 0) current.music = input.music ? normalizeMusicTrack(input.music, editedDurationMs(input.startMs, input.endMs, input.videoEdits ?? current.videoEdits)) : void 0;
			if (input.videoEdits !== void 0) current.videoEdits = input.videoEdits;
			current.trimStartMs = input.startMs;
			current.trimEndMs = input.endMs < current.durationMs ? input.endMs : void 0;
			const audioTrackTrims = [...input.audioTrackTrims ?? []];
			while (audioTrackTrims.at(-1) === null) audioTrackTrims.pop();
			current.audioTrackTrims = audioTrackTrims.length > 0 ? audioTrackTrims : void 0;
		});
	}
	setClipCanvasSize(input) {
		if (!this.store.get().clips.find((candidate) => candidate.id === input.id)) throw new Error("The clip no longer exists in the library.");
		return this.store.update((draft) => {
			const current = draft.clips.find((candidate) => candidate.id === input.id);
			if (current) current.canvasSize = input.canvasSize;
		});
	}
	setClipAudioTrackLevel(input) {
		if (!this.store.get().clips.find((candidate) => candidate.id === input.id)) throw new Error("The clip no longer exists in the library.");
		const defaults = this.store.get().capture.config.defaultTrackLevels;
		return this.store.update((draft) => {
			const current = draft.clips.find((candidate) => candidate.id === input.id);
			if (!current) return;
			const levels = applyClipTrackLevel(current.audioTrackLevels, current.audioChannels, defaults, input.trackIndex, input.level);
			current.audioTrackLevels = levels.length > 0 ? levels : void 0;
		});
	}
	async loadClipAudioWaveform(id) {
		const clip = this.store.get().clips.find((candidate) => candidate.id === id);
		if (!clip) throw new Error("The clip no longer exists in the library.");
		if (!existsSync(clip.path)) throw new Error("The clip file no longer exists.");
		const waveform = await this.clipLibrary.loadAudioWaveform(clip);
		const audioChannels = waveform.tracks.flatMap((track) => track.channel ? [track.channel] : []);
		if (audioChannels.length > 0 && audioChannels.length === waveform.tracks.length && !sameAudioChannels(clip.audioChannels, audioChannels)) this.store.update((draft) => {
			const current = draft.clips.find((candidate) => candidate.id === id);
			if (current) current.audioChannels = audioChannels;
		});
		return waveform;
	}
	async getClipAudioPreviewPath(id, trackIndex) {
		if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex > 7) return null;
		const clip = this.store.get().clips.find((candidate) => candidate.id === id);
		if (!clip || !existsSync(clip.path)) return null;
		return this.clipLibrary.prepareAudioPreview(clip, trackIndex);
	}
	planClipExport(input) {
		const clip = this.store.get().clips.find((candidate) => candidate.id === input.id);
		if (!clip) throw new Error("The clip no longer exists in the library.");
		if (!existsSync(clip.path)) throw new Error("The clip file no longer exists.");
		if (input.endMs > clip.durationMs) throw new Error("The export range exceeds the clip duration.");
		if (input.endMs - input.startMs < 100) throw new Error("Keep at least 0.1 seconds in the export range.");
		for (const trim of input.audioTrackTrims ?? clip.audioTrackTrims ?? []) {
			if (!trim) continue;
			if (trim.endMs > clip.durationMs) throw new Error("An audio track trim exceeds the clip duration.");
			if (trim.endMs - trim.startMs < 100) throw new Error("Keep at least 0.1 seconds in each audio track trim range.");
		}
		const fullRange = input.startMs === 0 && input.endMs === clip.durationMs;
		const defaults = this.store.get().capture.config.defaultTrackLevels;
		const audioMixChanged = hasEffectiveClipMixChanged(clip.audioTrackLevels, clip.audioChannels, defaults);
		const audioTrimChanged = (input.audioTrackTrims ?? clip.audioTrackTrims)?.some(Boolean) ?? false;
		const canCopyOriginal = input.preset === "original" && fullRange && clip.canvasSize === "original" && !audioMixChanged && !audioTrimChanged && !hasVideoEdits(input.videoEdits ?? clip.videoEdits) && !(input.music === void 0 ? clip.music : input.music);
		const extension = canCopyOriginal ? extname(clip.path) || ".mp4" : ".mp4";
		const presetSuffix = input.preset === "original" ? fullRange ? audioMixChanged || audioTrimChanged ? "-mixed" : "" : "-trimmed" : `-${input.preset}`;
		const canvasSuffix = clip.canvasSize === "9:16" ? "-9x16" : "";
		return {
			clip,
			canCopyOriginal,
			extension,
			fileName: `${sanitizeClipBaseName(parse(clip.path).name.trim() || clip.name)}${canvasSuffix}${presetSuffix}${extension}`,
			expectedBytes: canCopyOriginal ? clip.fileSize : input.preset === "original" ? Math.ceil(clip.fileSize * (input.endMs - input.startMs) / Math.max(1, clip.durationMs)) : exportPresetTargetBytes(input.preset)
		};
	}
	async writeClipExport(input, plan, destination) {
		if (plan.canCopyOriginal) {
			await ensureExportDiskSpace(dirname(destination), plan.clip.fileSize + 67108864);
			await copyFile(plan.clip.path, destination);
			if (input.exportId) this.emitClipExportProgress({
				exportId: input.exportId,
				percent: 100,
				stage: "complete"
			});
			return true;
		}
		await ensureExportDiskSpace(dirname(destination), plan.expectedBytes + 67108864);
		const controller = input.exportId ? new AbortController() : null;
		if (input.exportId && controller) this.activeClipExports.set(input.exportId, controller);
		if (input.exportId) this.emitClipExportProgress({
			exportId: input.exportId,
			percent: 0,
			stage: "compressing"
		});
		try {
			const videoEdits = input.videoEdits ?? plan.clip.videoEdits;
			const music = input.music === void 0 ? plan.clip.music : input.music;
			if (hasVideoEdits(videoEdits) || music) {
				const resolvedMusic = music ? await getMontageV2Service().resolveMusic(music) : void 0;
				const outputDurationMs = editedDurationMs(input.startMs, input.endMs, videoEdits);
				const clip = plan.clip;
				const project = montageProjectV2Schema.parse({
					schemaVersion: 2,
					type: "montage",
					id: randomUUID(),
					name: clip.name.slice(0, 120),
					createdAt: Date.now(),
					updatedAt: Date.now(),
					durationMs: outputDurationMs,
					music: resolvedMusic ? normalizeMusicTrack(resolvedMusic.track, outputDurationMs) : void 0,
					canvasSize: clip.canvasSize,
					segments: [{
						id: randomUUID(),
						clipId: clip.id,
						sourceDurationMs: clip.durationMs,
						trimStartMs: input.startMs,
						trimEndMs: input.endMs,
						videoEdits,
						volume: 1,
						muted: false,
						audioTrackLevels: Array.from({ length: Math.max(clip.audioChannels?.length ?? 0, clip.audioTrackLevels?.length ?? 0) }, (_, index) => resolveClipTrackLevel(clip.audioTrackLevels, index, clip.audioChannels?.[index], this.store.get().capture.config.defaultTrackLevels)),
						audioTrackTrims: input.audioTrackTrims ?? clip.audioTrackTrims
					}]
				});
				await renderMontageV2({
					project,
					musicPath: resolvedMusic?.path,
					entries: [{
						clip,
						segment: project.segments[0]
					}],
					destination,
					preset: input.preset,
					signal: controller?.signal,
					encoder: selectShareVideoEncoder(this.store.get().capture.capabilities.encoders),
					onProgress: input.exportId ? (progress) => this.emitClipExportProgress({
						exportId: input.exportId,
						percent: Math.round(progress * 98),
						stage: "compressing"
					}) : void 0
				});
			} else await this.clipLibrary.renderExport(plan.clip, destination, input, {
				signal: controller?.signal,
				encoder: selectShareVideoEncoder(this.store.get().capture.capabilities.encoders),
				defaultTrackLevels: this.store.get().capture.config.defaultTrackLevels,
				onProgress: input.exportId ? (progress) => this.emitClipExportProgress({
					exportId: input.exportId,
					percent: Math.min(98, Math.max(1, Math.round(progress * 98))),
					stage: progress >= .98 ? "finalizing" : "compressing"
				}) : void 0
			});
			if (input.exportId) {
				this.emitClipExportProgress({
					exportId: input.exportId,
					percent: 99,
					stage: "finalizing"
				});
				this.emitClipExportProgress({
					exportId: input.exportId,
					percent: 100,
					stage: "complete"
				});
			}
		} catch (error) {
			await rm(destination, { force: true });
			if (controller?.signal.aborted) return false;
			throw error;
		} finally {
			if (input.exportId) this.activeClipExports.delete(input.exportId);
		}
		return true;
	}
	async exportClip(input) {
		const plan = this.planClipExport(input);
		const selection = await dialog.showSaveDialog({
			title: "Create share file",
			defaultPath: join(app.getPath("videos"), plan.fileName),
			filters: [{
				name: "Video",
				extensions: [plan.extension.replace(/^\./, "")]
			}]
		});
		if (selection.canceled || !selection.filePath) return false;
		const destinationIsSource = resolve(selection.filePath).toLocaleLowerCase() === resolve(plan.clip.path).toLocaleLowerCase();
		if (destinationIsSource && !plan.canCopyOriginal) throw new Error("Choose a different file name so the original clip stays intact.");
		if (plan.canCopyOriginal) {
			if (destinationIsSource) return true;
			return this.writeClipExport(input, plan, selection.filePath);
		}
		return this.writeClipExport(input, plan, selection.filePath);
	}
	async prepareClipShare(input) {
		const plan = this.planClipExport(input);
		const shares = getPreparedShareService();
		if (plan.canCopyOriginal) return shares.register(input.exportId, plan.clip.path, basename(plan.clip.path), {
			...plan.clip.thumbnailPath ? { iconPath: plan.clip.thumbnailPath } : {},
			temporary: false
		});
		const destination = await shares.allocate(input.exportId, plan.fileName);
		try {
			if (!await this.writeClipExport(input, plan, destination)) {
				await shares.discard(input.exportId);
				return null;
			}
			return await shares.register(input.exportId, destination, plan.fileName, {
				...plan.clip.thumbnailPath ? { iconPath: plan.clip.thumbnailPath } : {},
				temporary: true
			});
		} catch (error) {
			await shares.discard(input.exportId);
			throw error;
		}
	}
	async exportMontage(input) {
		const snapshot = this.store.get();
		const clipsById = new Map(snapshot.clips.map((clip) => [clip.id, clip]));
		const entries = input.project.segments.map((segment) => ({
			segment,
			clip: clipsById.get(segment.clipId)
		}));
		const missing = entries.filter((entry) => !entry.clip || !existsSync(entry.clip.path));
		if (missing.length > 0) {
			const names = missing.slice(0, 3).map((entry) => entry.clip?.name ?? entry.segment.clipId).join(", ");
			throw new Error(`Montage source unavailable: ${names}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}. Remove or restore the missing clip before exporting.`);
		}
		for (const entry of entries) {
			const clip = entry.clip;
			const segment = entry.segment;
			if (segment.sourceDurationMs !== clip.durationMs) throw new Error(`${clip.name} changed after this montage was opened. Reopen the montage to refresh its media metadata.`);
			if (segment.trimEndMs > clip.durationMs || segment.trimEndMs - segment.trimStartMs < 100) throw new Error(`The trim range for ${clip.name} is invalid.`);
			for (const trim of segment.audioTrackTrims ?? []) {
				if (!trim) continue;
				if (trim.endMs > clip.durationMs || trim.endMs - trim.startMs < 100) throw new Error(`An audio trim for ${clip.name} is invalid.`);
			}
		}
		const suffix = input.preset === "original" ? "" : `-${input.preset}`;
		const canvasSuffix = input.project.canvasSize === "9:16" ? "-9x16" : "";
		const selection = await dialog.showSaveDialog({
			title: "Create montage share file",
			defaultPath: join(app.getPath("videos"), `${sanitizeClipBaseName(input.project.name)}${canvasSuffix}${suffix}.mp4`),
			filters: [{
				name: "Video",
				extensions: ["mp4"]
			}]
		});
		if (selection.canceled || !selection.filePath) return false;
		const resolvedDestination = resolve(selection.filePath).toLocaleLowerCase();
		if (entries.some((entry) => resolve(entry.clip.path).toLocaleLowerCase() === resolvedDestination)) throw new Error("Choose a different file name so every source clip stays intact.");
		const proportionalSourceBytes = entries.reduce((total, entry) => {
			const duration = entry.segment.trimEndMs - entry.segment.trimStartMs;
			return total + entry.clip.fileSize * duration / Math.max(1, entry.clip.durationMs);
		}, 0);
		const finalBytes = input.preset === "original" ? proportionalSourceBytes : exportPresetTargetBytes(input.preset);
		await ensureExportDiskSpace(selection.filePath, Math.ceil(proportionalSourceBytes + finalBytes + 134217728));
		const controller = new AbortController();
		this.activeClipExports.set(input.exportId, controller);
		try {
			await this.clipLibrary.renderMontageExport(entries.map((entry) => ({
				clip: entry.clip,
				segment: entry.segment
			})), selection.filePath, input, controller.signal, { defaultTrackLevels: this.store.get().capture.config.defaultTrackLevels });
		} catch (error) {
			await rm(selection.filePath, { force: true });
			if (controller.signal.aborted) return false;
			throw error;
		} finally {
			this.activeClipExports.delete(input.exportId);
		}
		return true;
	}
	cancelClipExport(exportId) {
		this.activeClipExports.get(exportId)?.abort();
	}
	getClipPath(id, thumbnail) {
		const clip = this.store.get().clips.find((candidate) => candidate.id === id);
		if (!clip) return null;
		const path = thumbnail ? clip.thumbnailPath ?? null : clip.path;
		return path && existsSync(path) ? path : null;
	}
	async getCaptureSourceThumbnail(id) {
		const knownSource = this.store.get().capture.sources.find((source) => source.id === id);
		if (!knownSource || knownSource.type === "automatic-game") return null;
		await this.refreshCaptureSourceThumbnails(false);
		return this.captureSourceThumbnails.get(id) ?? null;
	}
	async dispose() {
		this.disposed = true;
		await this.scenes.dispose();
		this.unsubscribeSetup?.();
		this.unsubscribeSetup = null;
		await this.desktopControls.dispose();
		await this.statusLighting.dispose();
		await this.cancelDiagnostics();
		debugDiagnostics.dispose();
		developerDiagnostics.dispose();
		this.diagnosticsGeneration++;
		this.performance.dispose();
		await this.resourceJournal.dispose();
		for (const controller of this.activeClipExports.values()) controller.abort();
		this.activeClipExports.clear();
		this.clipExportProgressListeners.clear();
		this.appUpdates.dispose();
		await this.initialization?.catch(() => void 0);
		await this.autoCaptureCoordinator.dispose();
		if (this.audioRestartTimer) clearTimeout(this.audioRestartTimer);
		this.audioRestartTimer = null;
		if (this.captureRestartTimer) clearTimeout(this.captureRestartTimer);
		this.captureRestartTimer = null;
		this.captureAudioIntegrationUpdate = null;
		if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
		this.captureSourceThumbnails.clear();
		if (this.gameScan) await this.gameScan.catch(() => void 0);
		await this.devices.dispose();
		await this.engines.dispose();
		await this.store.flush();
	}
	async performGameScan() {
		this.store.update((draft) => {
			draft.gameDetection.scanState = "scanning";
			draft.gameDetection.warning = void 0;
			draft.gameDetection.error = void 0;
		}, { persist: false });
		try {
			const result = await this.gameDiscovery.scan();
			const previousGames = this.store.get().gameDetection.games;
			const preservedGames = result.warnings.length > 0 ? previousGames : previousGames.filter((game) => game.source === "manual");
			const previousByIdentity = new Map(previousGames.map((game) => [gameIdentityKey(game), game]));
			const byIdentity = new Map(result.games.map((game) => {
				const key = gameIdentityKey(game);
				const previous = previousByIdentity.get(key);
				return [key, {
					...game,
					iconDataUrl: game.iconDataUrl ?? previous?.iconDataUrl
				}];
			}));
			for (const game of preservedGames) if (!byIdentity.has(gameIdentityKey(game))) byIdentity.set(gameIdentityKey(game), game);
			const updated = this.store.update((draft) => {
				draft.gameDetection.games = [...byIdentity.values()].sort((left, right) => left.name.localeCompare(right.name, void 0, { sensitivity: "base" }));
				draft.gameDetection.scanState = "idle";
				draft.gameDetection.lastScanAt = (/* @__PURE__ */ new Date()).toISOString();
				draft.gameDetection.warning = result.warnings.length > 0 ? `${result.warnings.length} launcher ${result.warnings.length === 1 ? "entry" : "entries"} could not be read.` : void 0;
				draft.gameDetection.error = void 0;
			});
			await this.autoCaptureCoordinator.refreshAvailability(updated.gameDetection.games);
			return this.store.get();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.store.update((draft) => {
				draft.gameDetection.scanState = "error";
				draft.gameDetection.error = `Game scan failed: ${message}`;
			}, { persist: false });
			throw error;
		} finally {
			this.gameScan = null;
		}
	}
	async startAudioEngine() {
		await this.engines.start("audio");
		try {
			const snapshot = audioHostSnapshotSchema.parse(await this.engines.request("audio", "start", this.store.get().audio, 3e4));
			this.applyAudioHostSnapshot(snapshot);
			this.syncAudioMeterDemand();
		} catch (error) {
			await this.engines.stop("audio");
			throw error;
		}
	}
	async updateAudioConfiguration(change) {
		await this.audioConfiguration.update((audio) => {
			const draft = this.store.get();
			draft.audio = audio;
			change(draft);
		});
		return this.store.get();
	}
	async startCaptureEngine(config) {
		this.capturePaths = await this.captureStorage.validate(config.clipsDirectory);
		const storage = await this.captureStorage.getStorageStatus(this.capturePaths, this.store.get().clips.reduce((sum, clip) => sum + clip.fileSize, 0), 0);
		if (storage.criticalSpace) throw new Error(storage.warning ?? "Not enough disk space to start Instant Replay.");
		this.store.update((draft) => {
			draft.capture.storage = storage;
		}, { persist: false });
		await this.engines.start("capture");
		try {
			const hostSnapshot = captureHostSnapshotSchema.parse(await this.engines.request("capture", "start", this.toHostSettings(config), 6e4));
			this.captureAudioIntegrationSignature = this.getCaptureAudioIntegrationSignature(config);
			this.applyCaptureSnapshot(hostSnapshot);
			try {
				await this.refreshCaptureSources();
			} catch (error) {
				console.warn("Capture sources could not be validated after the recorder started.", error);
			}
		} catch (error) {
			await this.engines.stop("capture");
			throw error;
		}
	}
	async refreshCaptureSourceThumbnails(force) {
		if (this.captureSourceThumbnailRefresh) return this.captureSourceThumbnailRefresh;
		if (!force && Date.now() - this.captureSourceThumbnailsRefreshedAt < captureSourceThumbnailRefreshMinimumIntervalMs) return;
		this.captureSourceThumbnailRefresh = (async () => {
			const sources = this.store.get().capture.sources.filter((source) => source.type !== "automatic-game");
			if (sources.length === 0) {
				this.captureSourceThumbnails.clear();
				this.captureSourceThumbnailsRefreshedAt = Date.now();
				return;
			}
			const nativeSources = await this.listNativeCaptureSources(sources);
			this.replaceCaptureSourceThumbnails(sources, nativeSources);
		})().catch((error) => {
			console.warn("Capture source thumbnails could not be refreshed.", error);
		}).finally(() => {
			this.captureSourceThumbnailRefresh = null;
		});
		return this.captureSourceThumbnailRefresh;
	}
	async listNativeCaptureSources(sources) {
		return (await Promise.all(desktopCaptureRequestsForSources(sources).map((request) => desktopCapturer.getSources(request)))).flat();
	}
	replaceCaptureSourceThumbnails(sources, nativeSources) {
		const next = /* @__PURE__ */ new Map();
		for (const source of sources) {
			const nativeSource = matchDesktopCaptureSource(source, nativeSources, captureIndexedDisplays().map((display) => display.id));
			if (!nativeSource || nativeSource.thumbnail.isEmpty()) continue;
			next.set(source.id, nativeSource.thumbnail.toPNG());
		}
		this.captureSourceThumbnails.clear();
		for (const [id, thumbnail] of next) this.captureSourceThumbnails.set(id, thumbnail);
		this.captureSourceThumbnailsRefreshedAt = Date.now();
	}
	applyLoginItemSetting(enabled) {
		if (!["win32", "darwin"].includes(process.platform)) return;
		try {
			app.setLoginItemSettings({
				openAtLogin: enabled,
				path: process.execPath
			});
		} catch (error) {
			console.warn("Failed to update launch-at-startup state.", error);
		}
	}
	applyEngineStatus(status) {
		if (!isMaterialEngineStatusChange(this.appliedEngineStatuses.get(status.kind), status)) return;
		this.appliedEngineStatuses.set(status.kind, structuredClone(status));
		this.store.update((draft) => {
			const index = draft.engines.findIndex((engine) => engine.kind === status.kind);
			if (index >= 0) draft.engines[index] = status;
			else draft.engines.push(status);
			if (status.kind === "capture" && status.state === "error") {
				draft.capture.runtime.state = "error";
				draft.capture.runtime.error = status.message ?? "Capture.Host exited unexpectedly.";
			} else if (status.kind === "capture" && status.state === "stopped") {
				draft.capture.runtime = {
					...draft.capture.runtime,
					state: "stopped",
					bufferedSeconds: 0,
					segmentCount: 0,
					replayCacheBytes: 0,
					observedBitrateBps: 0,
					activeSource: null,
					saveQueueDepth: 0
				};
				draft.capture.storage.replayCacheBytes = 0;
			} else if (status.kind === "audio" && status.state !== "running") {
				draft.audio.capabilities = {
					virtualChannels: "unavailable",
					applicationRouting: "unavailable",
					channelDsp: "unavailable",
					microphoneDsp: "unavailable",
					noiseSuppression: "unavailable",
					realtimeMetering: "unavailable",
					microphoneTest: "unavailable",
					monitoring: "unavailable",
					spatialAudio: "unavailable"
				};
				draft.audio.host = null;
				draft.audio.applications = [];
				for (const bus of draft.audio.buses) bus.appCount = 0;
			}
		}, { persist: false });
		if (status.kind === "capture" && status.state === "error") {
			this.autoCaptureCoordinator.reconcile(null, false, this.store.get().gameDetection.games);
			if (!this.engines.hasLiveProcess("capture")) this.scheduleCaptureHostRecovery(status.message);
		} else if (status.kind === "capture" && status.state === "stopped" && !this.engines.hasLiveProcess("capture") && this.store.get().capture.config.enabled) {
			this.autoCaptureCoordinator.reconcile(null, false, this.store.get().gameDetection.games);
			this.scheduleCaptureHostRecovery(status.message ?? "Capture.Host stopped unexpectedly while Instant Replay stayed enabled.");
		} else if (status.kind === "audio" && status.state === "error") this.scheduleAudioHostRecovery(status.message);
		if (status.kind === "audio" && (status.state === "stopped" || status.state === "error")) this.scheduleCaptureAudioIntegrationSync();
	}
	async initializeCaptureStorage() {
		const snapshot = this.store.get();
		try {
			this.capturePaths = await this.captureStorage.validate(snapshot.capture.config.clipsDirectory);
			const storage = await this.captureStorage.getStorageStatus(this.capturePaths, snapshot.clips.reduce((sum, clip) => sum + clip.fileSize, 0), 0);
			this.store.update((draft) => {
				draft.capture.storage = storage;
			});
		} catch (storageError) {
			const paths = this.captureStorage.resolvePaths(snapshot.capture.config.clipsDirectory);
			const message = `Clips storage is unavailable: ${storageError instanceof Error ? storageError.message : String(storageError)}`;
			this.store.update((draft) => {
				draft.capture.config.enabled = false;
				draft.capture.runtime.state = "error";
				draft.capture.runtime.error = message;
				draft.capture.storage = {
					clipsDirectory: paths.clipsDirectory,
					cacheDirectory: paths.cacheDirectory,
					availableBytes: 0,
					volumeTotalBytes: 0,
					volumeAvailableBytes: 0,
					clipsBytes: draft.clips.reduce((sum, clip) => sum + clip.fileSize, 0),
					replayCacheBytes: 0,
					lowSpace: false,
					criticalSpace: false,
					warning: message
				};
			});
		}
	}
	async reconcileClipLibrary() {
		const before = this.store.get();
		try {
			const clips = await this.clipLibrary.reconcile(before.clips, this.capturePaths.clipsDirectory);
			this.store.update((draft) => {
				draft.clips = clips;
				draft.capture.storage.clipsBytes = clips.reduce((sum, clip) => sum + clip.fileSize, 0);
			});
			for (const clip of clips.filter((candidate) => this.clipLibrary.needsEnrichment(candidate))) this.clipLibrary.enqueueThumbnail(clip, (enrichment) => {
				this.store.update((draft) => {
					const current = draft.clips.find((candidate) => candidate.id === clip.id);
					if (current) Object.assign(current, enrichment);
				});
			});
		} catch (reconcileError) {
			this.store.update((draft) => {
				draft.capture.storage.warning = `Clip library reconciliation failed: ${reconcileError instanceof Error ? reconcileError.message : String(reconcileError)}`;
			}, { persist: false });
		}
	}
	toHostSettings(config, paths = this.capturePaths) {
		const current = this.store.get();
		const audio = current.audio;
		const reaction = current.capture.autoCapture.settings.reactionClipping;
		const switchboardAudioReady = audio.enabled && audio.host?.running === true && audio.capabilities.virtualChannels === "available";
		const processedMicrophone = audio.host?.driver.endpoints.find((endpoint) => endpoint.flow === "capture" && endpoint.name === "Switchboard Audio - Microphone");
		const processedMicrophoneRequested = config.includeMic || reaction.enabled;
		const routingState = {
			...audio,
			capture: config
		};
		const microphoneDeviceId = processedMicrophoneRequested ? resolveCaptureMicrophoneDeviceId(routingState) : null;
		const systemAudioDeviceId = config.includeSystemAudio ? resolveCaptureSystemAudioDeviceId(routingState) : null;
		const chatAudioDeviceId = config.includeChatAudio ? resolveCaptureChatAudioDeviceId(routingState) : null;
		const requestedSwitchboardAudioReady = switchboardAudioReady && (!processedMicrophoneRequested || processedMicrophone !== void 0);
		const usesExplicitSystemDevice = config.includeSystemAudio && systemAudioDeviceId !== null;
		const { defaultTrackLevels: _defaultTrackLevels, ...hostConfig } = config;
		return {
			...hostConfig,
			...getEncodingPreset(config),
			cacheDirectory: paths.cacheDirectory,
			clipsDirectory: paths.clipsDirectory,
			thumbnailDirectory: paths.thumbnailDirectory,
			clipMixPipeName: config.systemAudioMode !== "game" && switchboardAudioReady && config.includeSystemAudio && !usesExplicitSystemDevice ? "switchboard-audio-clip-v1" : null,
			processedMicrophoneDeviceId: switchboardAudioReady && processedMicrophoneRequested ? processedMicrophone?.id ?? null : null,
			microphoneDeviceId,
			systemAudioDeviceId,
			chatAudioDeviceId,
			reactionClippingEnabled: reaction.enabled,
			reactionSensitivity: reaction.sensitivity,
			reactionCooldownSeconds: reaction.cooldownSeconds,
			audioFallbackReason: config.systemAudioMode === "game" || requestedSwitchboardAudioReady || !config.includeSystemAudio && !config.includeChatAudio && !processedMicrophoneRequested ? null : "Switchboard audio routing is unavailable for one or more replay inputs; Windows default devices are being used where needed."
		};
	}
	getCaptureAudioIntegrationSignature(config) {
		const settings = this.toHostSettings(config);
		return JSON.stringify([
			settings.clipMixPipeName ?? null,
			settings.processedMicrophoneDeviceId ?? null,
			settings.microphoneDeviceId ?? null,
			settings.systemAudioDeviceId ?? null,
			settings.systemAudioMode,
			settings.chatAudioDeviceId ?? null,
			settings.includeChatAudio ?? false,
			settings.audioFallbackReason ?? null,
			settings.reactionClippingEnabled,
			settings.reactionSensitivity,
			settings.reactionCooldownSeconds
		]);
	}
	scheduleCaptureAudioIntegrationSync() {
		if (this.disposed || this.captureAudioIntegrationUpdate) return;
		const snapshot = this.store.get();
		if (!snapshot.capture.config.enabled) {
			this.captureAudioIntegrationSignature = null;
			return;
		}
		if (snapshot.engines.find((engine) => engine.kind === "capture")?.state !== "running") return;
		const signature = this.getCaptureAudioIntegrationSignature(snapshot.capture.config);
		if (signature === this.captureAudioIntegrationSignature) return;
		const previousSignature = this.captureAudioIntegrationSignature;
		this.captureAudioIntegrationSignature = signature;
		this.captureAudioIntegrationUpdate = this.engines.request("capture", "configure", this.toHostSettings(snapshot.capture.config), 45e3).then((raw) => {
			this.applyCaptureSnapshot(captureHostSnapshotSchema.parse(raw));
		}).catch((integrationError) => {
			this.captureAudioIntegrationSignature = previousSignature;
			if (this.disposed) return;
			this.store.update((draft) => {
				draft.capture.runtime.warning = `Replay audio could not follow the current Switchboard route: ${integrationError instanceof Error ? integrationError.message : String(integrationError)}`;
			}, { persist: false });
		}).finally(() => {
			this.captureAudioIntegrationUpdate = null;
			if (this.getCaptureAudioIntegrationSignature(this.store.get().capture.config) !== this.captureAudioIntegrationSignature) this.scheduleCaptureAudioIntegrationSync();
		});
	}
	applyEngineEvent(kind, event, payload) {
		if (kind === "audio") {
			if (event === "audioDevicesChanged") {
				this.refreshAudioDevices(true);
				return;
			}
			if (event === "audioSnapshot") {
				const parsed = audioHostSnapshotSchema.safeParse(payload);
				if (parsed.success) this.applyAudioHostSnapshot(parsed.data);
				else console.warn("Audio.Host sent an invalid snapshot.", parsed.error);
			}
			return;
		}
		if (kind !== "capture") return;
		if (event === "diagnosticCheck") {
			this.applyDiagnosticCheck(payload);
			return;
		}
		if (event === "captureSnapshot") {
			const parsed = captureHostSnapshotSchema.safeParse(payload);
			if (parsed.success) this.applyCaptureSnapshot(parsed.data);
			else {
				developerDiagnostics.record("main", "error", "capture.snapshot-rejected", { issues: parsed.error.issues.map((issue) => `${issue.path.join(".")}:${issue.code}`).join(", ").slice(0, 4096) });
				console.warn("Capture.Host sent an invalid snapshot.", parsed.error);
			}
			return;
		}
		if (event === "reactionDetected") {
			this.handleReactionDetected(payload);
			return;
		}
		if (event === "fatalCaptureError") {
			const parsed = z.object({ message: z.string() }).safeParse(payload);
			if (parsed.success) this.store.update((draft) => {
				draft.capture.runtime.state = "error";
				draft.capture.runtime.error = parsed.data.message;
			}, { persist: false });
		}
	}
	handleReactionDetected(payload) {
		const parsed = workerReactionDetectionSchema.safeParse(payload);
		if (!parsed.success) {
			console.warn("Capture.Host sent an invalid reaction event.", parsed.error);
			return;
		}
		const snapshot = this.store.get();
		const reaction = snapshot.capture.autoCapture.settings.reactionClipping;
		const source = snapshot.capture.runtime.activeSource;
		if (!reaction.enabled || !snapshot.capture.config.enabled || !source) return;
		const gameProvider = this.autoCaptureRegistry.getForSource(source, snapshot.gameDetection.games);
		const event = {
			id: `${reactionClippingProviderId}-${parsed.data.timestamp}`,
			gameId: gameProvider?.gameId ?? reactionGameId(source),
			providerId: reactionClippingProviderId,
			type: "highlight",
			timestamp: parsed.data.timestamp,
			confidence: parsed.data.confidence,
			label: "Reaction",
			metadata: { code: "voice-reaction" },
			source: "microphone"
		};
		this.autoCaptureEngine.handleEvent(event, {
			enabled: true,
			preRollSeconds: reaction.preRollSeconds,
			postRollSeconds: reaction.postRollSeconds,
			mergeNearbyEvents: true,
			mergeThresholdSeconds: 0
		});
	}
	applyAudioHostSnapshot(snapshot) {
		if (!this.audioSnapshotUpdateGate.shouldApply(snapshot)) return;
		if (snapshot.running && this.engines.getStatus("audio").uptimeSeconds >= 30) this.audioRestartAttempts = 0;
		this.store.update((draft) => {
			draft.audio.host = snapshot;
			draft.audio.capabilities = { ...snapshot.capabilities };
			draft.audio.applications = snapshot.applications;
			const applicationCounts = new Map(snapshot.buses.map((bus) => [bus.id, bus.applicationCount]));
			for (const bus of draft.audio.buses) bus.appCount = applicationCounts.get(bus.id) ?? 0;
		}, { persist: false });
		this.scheduleCaptureAudioIntegrationSync();
	}
	syncAudioMeterDemand() {
		this.engines.send("audio", "setMetering", this.audioMeterDemandGate.enabled);
	}
	scheduleAudioHostRecovery(reason) {
		if (this.disposed || this.audioRestartTimer || !this.store.get().audio.enabled) return;
		if (this.audioRestartAttempts >= 3) {
			this.store.update((draft) => {
				draft.audio.capabilities.reason = "Audio.Host failed repeatedly. Automatic recovery stopped; disable and re-enable Audio to retry.";
			}, { persist: false });
			return;
		}
		this.audioRestartAttempts += 1;
		const attempt = this.audioRestartAttempts;
		const delayMs = attempt * 1e3;
		this.store.update((draft) => {
			draft.audio.capabilities.reason = `Audio.Host stopped unexpectedly${reason ? `: ${reason}` : ""}. Recovery attempt ${attempt} of 3.`;
		}, { persist: false });
		this.audioRestartTimer = setTimeout(() => {
			this.audioRestartTimer = null;
			if (this.disposed || !this.store.get().audio.enabled) return;
			this.audioConfiguration.run(() => this.startAudioEngine()).catch((restartError) => {
				this.store.update((draft) => {
					draft.audio.capabilities.reason = restartError instanceof Error ? restartError.message : String(restartError);
				}, { persist: false });
				this.scheduleAudioHostRecovery();
			});
		}, delayMs);
	}
	applyCaptureSnapshot(snapshot) {
		if (!this.captureSnapshotUpdateGate.shouldApply(snapshot)) return;
		developerDiagnostics.record("main", snapshot.runtime.error ? "error" : "debug", "capture.snapshot-applied", {
			state: snapshot.runtime.state,
			encoder: snapshot.runtime.encoderLabel,
			backend: snapshot.runtime.backendLabel,
			encodedFrames: snapshot.runtime.encodedFrames,
			bufferedSeconds: snapshot.runtime.bufferedSeconds,
			segmentCount: snapshot.runtime.segmentCount,
			activeSourceType: snapshot.runtime.activeSource?.type ?? null,
			error: snapshot.runtime.error?.slice(0, 4096) ?? null,
			warning: snapshot.runtime.warning?.slice(0, 4096) ?? null
		});
		if (snapshot.runtime.state === "buffering" || snapshot.runtime.state === "waiting") this.captureRestartAttempts = 0;
		this.store.update((draft) => {
			const shortcutRegistered = draft.capture.runtime.shortcutRegistered;
			draft.capture.runtime = {
				...snapshot.runtime,
				shortcutRegistered
			};
			draft.capture.storage = snapshot.storage;
			draft.capture.capabilities = snapshot.capabilities;
			draft.capture.sources = orderCaptureSourcesByDisplayPosition(preserveValidatedWindowSources(snapshot.sources, snapshot.sources.filter((source) => this.validatedCaptureWindowSourceIds.has(source.id))));
		}, { persist: false });
		const current = this.store.get();
		this.autoCaptureCoordinator.reconcile(snapshot.runtime.activeSource, current.capture.config.enabled, current.gameDetection.games).catch((error) => {
			console.warn("[autocapture] lifecycle_reconcile_failed", error);
		});
	}
	scheduleCaptureHostRecovery(reason) {
		if (this.disposed || this.captureRestartTimer || !this.store.get().capture.config.enabled) return;
		if (this.captureRestartAttempts >= 3) {
			this.store.update((draft) => {
				draft.capture.runtime.state = "error";
				draft.capture.runtime.error = "Capture.Host failed repeatedly. Instant Replay was left enabled but automatic recovery stopped.";
			}, { persist: false });
			return;
		}
		this.captureRestartAttempts += 1;
		const delayMs = this.captureRestartAttempts * 1e3;
		this.store.update((draft) => {
			draft.capture.runtime.state = "recovering";
			draft.capture.runtime.warning = `Capture.Host stopped unexpectedly${reason ? `: ${reason}` : ""}. Recovery attempt ${this.captureRestartAttempts} of 3.`;
			draft.capture.runtime.error = void 0;
		}, { persist: false });
		this.captureRestartTimer = setTimeout(() => {
			this.captureRestartTimer = null;
			if (this.disposed || !this.store.get().capture.config.enabled) return;
			this.startCaptureEngine(this.store.get().capture.config).catch((restartError) => {
				this.store.update((draft) => {
					draft.capture.runtime.state = "recovering";
					draft.capture.runtime.warning = restartError instanceof Error ? restartError.message : String(restartError);
				}, { persist: false });
				this.scheduleCaptureHostRecovery();
			});
		}, delayMs);
	}
	registerCaptureShortcut(accelerator, throwOnFailure) {
		if (this.registeredShortcut === accelerator) return;
		let registered = false;
		let registrationError;
		try {
			registered = globalShortcut.register(accelerator, () => {
				this.saveReplay().catch((shortcutError) => {
					this.store.update((draft) => {
						draft.capture.runtime.warning = shortcutError instanceof Error ? shortcutError.message : String(shortcutError);
					}, { persist: false });
				});
			});
		} catch (error) {
			registrationError = error;
		}
		if (!registered) {
			const message = `${accelerator} could not be registered.${(registrationError instanceof Error ? ` ${registrationError.message}` : "") || " Another application may already use it."}`;
			this.store.update((draft) => {
				draft.capture.runtime.shortcutRegistered = this.registeredShortcut !== null;
				draft.capture.runtime.warning = message;
			}, { persist: false });
			if (throwOnFailure) throw new Error(message);
			return;
		}
		if (this.registeredShortcut) globalShortcut.unregister(this.registeredShortcut);
		this.registeredShortcut = accelerator;
		this.store.update((draft) => {
			draft.capture.runtime.shortcutRegistered = true;
			if (draft.capture.runtime.warning?.includes("could not be registered")) draft.capture.runtime.warning = void 0;
		}, { persist: false });
	}
	emitAudioMeters(frame) {
		for (const listener of this.audioMeterListeners) listener(frame);
	}
	emitClipExportProgress(progress) {
		for (const listener of this.clipExportProgressListeners) listener(progress);
	}
};
function exportPresetTargetBytes(preset) {
	if (preset === "10mb") return 10485760;
	if (preset === "25mb") return 26214400;
	if (preset === "50mb") return 52428800;
	return 0;
}
async function ensureExportDiskSpace(destination, requiredBytes) {
	try {
		const storage = await statfs(dirname(destination), { bigint: true });
		if (storage.bavail * storage.bsize < BigInt(Math.max(0, Math.ceil(requiredBytes)))) throw new Error("There is not enough free disk space to create this export. Choose another destination or shorten the project.");
	} catch (error) {
		if (error instanceof Error && error.message.includes("not enough free disk space")) throw error;
	}
}
function appUpdatePreferences(settings) {
	return {
		automaticChecks: settings.automaticAppUpdates,
		automaticDownloads: settings.automaticAppUpdateDownloads,
		installOnNextStartup: settings.installAppUpdatesOnNextStartup,
		installWhenIdle: settings.installAppUpdatesWhenIdle
	};
}
function currentCoreVersion() {
	return app.isPackaged ? app.getVersion() : package_default.version;
}
function nativeReviewPath(variable) {
	if (process.env.SWITCHBOARD_NATIVE_REVIEW !== "1") return null;
	const value = process.env[variable]?.trim();
	return value ? resolve(value) : null;
}
function orderCaptureSourcesByDisplayPosition(sources) {
	const windowsDisplays = captureIndexedDisplays();
	const displaySources = sources.filter((source) => source.type === "display").map((source) => {
		const displayIndex = Number(source.displayId ?? source.id.replace(/^display:/, ""));
		const bounds = windowsDisplays[displayIndex]?.bounds;
		return {
			source,
			x: bounds?.x ?? displayIndex,
			y: bounds?.y ?? 0
		};
	}).sort((left, right) => left.x - right.x || left.y - right.y).map(({ source }) => source);
	return [
		...sources.filter((source) => source.type === "automatic-game"),
		...displaySources,
		...sources.filter((source) => source.type === "window")
	];
}
function reactionGameId(source) {
	return `reaction-${source.name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "captured-source"}`;
}
function isEngineNotRunningError(error) {
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("is not running") || message.includes("engine exited") || message.includes("could not accept");
}
function captureIndexedDisplays() {
	const primary = screen.getPrimaryDisplay();
	return [primary, ...screen.getAllDisplays().filter((display) => display.id !== primary.id).sort((left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y)];
}
function createResetAudioState(current) {
	const reset = structuredClone(defaultAudio);
	reset.devices = structuredClone(current.devices);
	reset.pathPresets = [...structuredClone(defaultAudio.pathPresets), ...structuredClone(current.pathPresets.filter((preset) => !preset.builtIn))];
	const availableDeviceIds = new Set(reset.devices.map((device) => device.id));
	for (const bus of reset.buses) {
		if (availableDeviceIds.has(bus.deviceId)) continue;
		const currentBus = current.buses.find((candidate) => candidate.id === bus.id);
		if (currentBus && availableDeviceIds.has(currentBus.deviceId)) bus.deviceId = currentBus.deviceId;
	}
	reconcileAudioDevices(reset, current.devices);
	for (const kind of [
		"game",
		"chat",
		"media",
		"microphone"
	]) {
		const defaultId = defaultAudio.activePresetIds[kind];
		reset.activePresetIds[kind] = defaultId && reset.pathPresets.some((preset) => preset.id === defaultId) ? defaultId : null;
	}
	return reset;
}
//#endregion
//#region src/main/quick-controls-window.ts
var QuickControlsWindow = class {
	window = null;
	requested = false;
	held = false;
	getWindow() {
		return this.window;
	}
	setOpen(open, held) {
		if (!open && held && !this.held) return;
		this.requested = open;
		if (!open) {
			this.window?.destroy();
			this.window = null;
			return;
		}
		this.held = held;
		if (this.window && !this.window.isDestroyed()) return;
		const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
		const width = Math.min(460, display.width), height = display.height;
		const window = new BrowserWindow({
			width,
			height,
			x: display.x + display.width - width,
			y: display.y,
			show: false,
			frame: false,
			resizable: false,
			maximizable: false,
			minimizable: false,
			skipTaskbar: true,
			alwaysOnTop: true,
			backgroundColor: "#0e1117",
			roundedCorners: false,
			webPreferences: {
				preload: join(__dirname, "../preload/index.cjs"),
				contextIsolation: true,
				sandbox: true,
				nodeIntegration: false
			}
		});
		this.window = window;
		window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		window.webContents.on("will-navigate", (event) => event.preventDefault());
		window.webContents.on("will-attach-webview", (event) => event.preventDefault());
		window.once("ready-to-show", () => {
			if (this.window !== window || !this.requested) return;
			if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== "1") window.show();
		});
		window.on("blur", () => {
			if (this.window === window) this.setOpen(false, false);
		});
		window.on("closed", () => {
			if (this.window === window) this.window = null;
		});
		const query = {
			quickControls: "1",
			held: held ? "1" : "0"
		};
		if (process.env.ELECTRON_RENDERER_URL) {
			const url = new URL(process.env.ELECTRON_RENDERER_URL);
			for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
			window.loadURL(url.toString());
		} else window.loadFile(join(__dirname, "../renderer/index.html"), { query });
	}
	dispose() {
		this.requested = false;
		this.window?.destroy();
		this.window = null;
	}
};
//#endregion
//#region src/main/development-flags.ts
function requestsDemoUpdate(arguments_, isPackaged, additionalData = void 0, environment = process.env) {
	if (isPackaged) return false;
	if (arguments_.includes("--demo-update")) return true;
	if (environment.SWITCHBOARD_DEMO_UPDATE === "1") return true;
	return isRecord(additionalData) && additionalData.demoUpdate === true;
}
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
//#endregion
//#region src/main/services/audio-meter-delivery.ts
var AudioMeterDeliveryGate = class {
	requestedWebContentsId = null;
	setRequested(webContentsId, requested) {
		if (requested) {
			if (this.requestedWebContentsId === webContentsId) return false;
			this.requestedWebContentsId = webContentsId;
			return true;
		}
		if (this.requestedWebContentsId !== webContentsId) return false;
		this.requestedWebContentsId = null;
		return true;
	}
	shouldDeliver(webContentsId, windowVisible) {
		return windowVisible && this.requestedWebContentsId === webContentsId;
	}
	clear(webContentsId) {
		if (this.requestedWebContentsId !== webContentsId) return false;
		this.requestedWebContentsId = null;
		return true;
	}
};
//#endregion
//#region src/main/startup-readiness.ts
async function getStartupSnapshot(controller) {
	await controller.prepareSnapshot();
	return controller.getSnapshot();
}
//#endregion
//#region src/main/ipc.ts
var getQuickWindow = () => null;
var quickChannels = /* @__PURE__ */ new Set([
	ipcChannels.getSnapshot,
	ipcChannels.applyScene,
	ipcChannels.restoreScene,
	ipcChannels.openQuickControls,
	ipcChannels.closeQuickControls,
	ipcChannels.runQuickAction,
	ipcChannels.saveReplay,
	ipcChannels.setCaptureConfig,
	ipcChannels.updateSettings,
	ipcChannels.setAudioEnabled,
	ipcChannels.setAudioMasterGain,
	ipcChannels.setAudioMasterEnabled,
	ipcChannels.setAudioBusDevice
]);
function assertTrustedSender$1(event, getMainWindow, channel = "") {
	const window = getMainWindow();
	const quick = quickChannels.has(channel) ? getQuickWindow() : null;
	if ((!window || window.isDestroyed() || event.sender.id !== window.webContents.id) && (!quick || quick.isDestroyed() || event.sender.id !== quick.webContents.id)) throw new Error("Rejected IPC from an untrusted webContents instance.");
	const sourceUrl = event.senderFrame?.url;
	if (!sourceUrl) throw new Error("IPC request has no sender URL.");
	const parsed = new URL(sourceUrl);
	const trustedProtocol = parsed.protocol === "file:";
	const trustedDevHost = ["http:", "https:"].includes(parsed.protocol) && ["localhost", "127.0.0.1"].includes(parsed.hostname);
	if (!trustedProtocol && !trustedDevHost) throw new Error(`Rejected IPC sender: ${parsed.origin}`);
}
function handle(channel, getMainWindow, parse, action) {
	ipcMain.handle(channel, async (event, input) => {
		assertTrustedSender$1(event, getMainWindow, channel);
		return developerDiagnostics.trace("main", `ipc:${channel}`, () => debugDiagnostics.measureAsync(`ipc:${channel}`, async () => action(parse(input))));
	});
}
function registerIpc(controller, getMainWindow, getQuickControlsWindow = () => null) {
	getQuickWindow = getQuickControlsWindow;
	handle(ipcChannels.runQuickAction, getMainWindow, (input) => quickActionInputSchema.parse(input), (input) => controller.runQuickAction(input));
	handle(ipcChannels.saveScene, getMainWindow, (input) => saveSceneInputSchema.parse(input), (input) => controller.saveScene(input));
	handle(ipcChannels.deleteScene, getMainWindow, (input) => z.string().min(1).max(100).parse(input), (id) => controller.deleteScene(id));
	handle(ipcChannels.applyScene, getMainWindow, (input) => z.string().min(1).max(100).parse(input), (id) => controller.applyScene(id));
	handle(ipcChannels.restoreScene, getMainWindow, (input) => z.undefined().parse(input), () => controller.restoreScene());
	handle(ipcChannels.setSetupPreferences, getMainWindow, (input) => setupPreferencesSchema.parse(input), (input) => controller.setSetupPreferences(input));
	handle(ipcChannels.openQuickControls, getMainWindow, (input) => z.undefined().parse(input), () => controller.openQuickControls());
	handle(ipcChannels.closeQuickControls, getMainWindow, (input) => z.undefined().parse(input), () => controller.closeQuickControls());
	handle(ipcChannels.exportResourceDiagnostics, getMainWindow, (input) => z.undefined().parse(input), () => controller.exportResourceDiagnostics());
	handle(ipcChannels.runDiagnostics, getMainWindow, (input) => z.undefined().parse(input), () => controller.runDiagnostics());
	handle(ipcChannels.cancelDiagnostics, getMainWindow, (input) => z.undefined().parse(input), () => controller.cancelDiagnostics());
	const audioMeterDelivery = new AudioMeterDeliveryGate();
	ipcMain.handle(ipcChannels.getSnapshot, async (event) => {
		assertTrustedSender$1(event, getMainWindow, ipcChannels.getSnapshot);
		return debugDiagnostics.measureAsync("ipc:snapshot:get", async () => {
			return getStartupSnapshot(controller);
		});
	});
	ipcMain.handle(ipcChannels.refreshDevices, async (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return debugDiagnostics.measureAsync("ipc:devices:refresh", () => controller.refreshDevices());
	});
	handle(ipcChannels.setModuleState, getMainWindow, (input) => setModuleStateInputSchema.parse(input), (input) => controller.setModuleState(input));
	handle(ipcChannels.createModuleProject, getMainWindow, (input) => createModuleProjectInputSchema.parse(input), (input) => controller.createModuleProject(input));
	handle(ipcChannels.linkModuleProject, getMainWindow, (input) => z.undefined().parse(input), () => controller.linkModuleProject());
	handle(ipcChannels.validateModuleProject, getMainWindow, (input) => moduleProjectIdInputSchema.parse(input), (input) => controller.validateModuleProject(input));
	handle(ipcChannels.revealModuleProject, getMainWindow, (input) => moduleProjectIdInputSchema.parse(input), (input) => controller.revealModuleProject(input));
	handle(ipcChannels.unlinkModuleProject, getMainWindow, (input) => moduleProjectIdInputSchema.parse(input), (input) => controller.unlinkModuleProject(input));
	handle(ipcChannels.setDeviceControl, getMainWindow, (input) => setDeviceControlInputSchema.parse(input), (input) => controller.setDeviceControl(input));
	handle(ipcChannels.setDeviceSetting, getMainWindow, (input) => setDeviceSettingInputSchema.parse(input), (input) => controller.setDeviceSetting(input));
	handle(ipcChannels.setDeviceAppearanceOverride, getMainWindow, (input) => setDeviceAppearanceOverrideInputSchema.parse(input), (input) => controller.setDeviceAppearanceOverride(input));
	handle(ipcChannels.setAudioEnabled, getMainWindow, (input) => z.boolean().parse(input), (enabled) => controller.setAudioEnabled(enabled));
	handle(ipcChannels.setAudioMasterGain, getMainWindow, (input) => setAudioMasterGainInputSchema.parse(input), (input) => controller.setAudioMasterGain(input));
	handle(ipcChannels.setAudioMasterEnabled, getMainWindow, (input) => setAudioMasterEnabledInputSchema.parse(input), (input) => controller.setAudioMasterEnabled(input));
	handle(ipcChannels.setAudioBusGain, getMainWindow, (input) => setAudioBusGainInputSchema.parse(input), (input) => controller.setAudioBusGain(input));
	handle(ipcChannels.setAudioBusEnabled, getMainWindow, (input) => setAudioBusEnabledInputSchema.parse(input), (input) => controller.setAudioBusEnabled(input));
	handle(ipcChannels.setAudioChannelEnabled, getMainWindow, (input) => setAudioChannelEnabledInputSchema.parse(input), (input) => controller.setAudioChannelEnabled(input));
	handle(ipcChannels.setAudioBusDevice, getMainWindow, (input) => setAudioBusDeviceInputSchema.parse(input), (input) => controller.setAudioBusDevice(input));
	handle(ipcChannels.setAudioApplicationRoute, getMainWindow, (input) => setAudioApplicationRouteInputSchema.parse(input), (input) => controller.setAudioApplicationRoute(input));
	handle(ipcChannels.applyAudioPreset, getMainWindow, (input) => applyAudioPresetInputSchema.parse(input), (input) => controller.applyAudioPreset(input));
	handle(ipcChannels.createAudioPreset, getMainWindow, (input) => createAudioPresetInputSchema.parse(input), (input) => controller.createAudioPreset(input));
	handle(ipcChannels.renameAudioPreset, getMainWindow, (input) => renameAudioPresetInputSchema.parse(input), (input) => controller.renameAudioPreset(input));
	handle(ipcChannels.duplicateAudioPreset, getMainWindow, (input) => audioPresetIdInputSchema.parse(input), (input) => controller.duplicateAudioPreset(input));
	handle(ipcChannels.deleteAudioPreset, getMainWindow, (input) => audioPresetIdInputSchema.parse(input), (input) => controller.deleteAudioPreset(input));
	ipcMain.handle(ipcChannels.importAudioPreset, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.importAudioPreset();
	});
	handle(ipcChannels.exportAudioPreset, getMainWindow, (input) => audioPresetIdInputSchema.parse(input), (input) => controller.exportAudioPreset(input));
	handle(ipcChannels.setAudioChannelProcessor, getMainWindow, (input) => setAudioChannelProcessorInputSchema.parse(input), (input) => controller.setAudioChannelProcessor(input));
	handle(ipcChannels.setAudioMonitoring, getMainWindow, (input) => setAudioMonitoringInputSchema.parse(input), (input) => controller.setAudioMonitoring(input));
	ipcMain.handle(ipcChannels.testMicrophone, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.testMicrophone();
	});
	handle(ipcChannels.setChatMix, getMainWindow, (input) => z.number().min(-1).max(1).parse(input), (value) => controller.setChatMix(value));
	handle(ipcChannels.setMicProcessor, getMainWindow, (input) => setMicProcessorInputSchema.parse(input), (input) => controller.setMicProcessor(input));
	handle(ipcChannels.setCaptureConfig, getMainWindow, (input) => setCaptureConfigInputSchema.parse(input), (input) => controller.setCaptureConfig(input));
	ipcMain.handle(ipcChannels.saveReplay, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.saveReplay();
	});
	ipcMain.handle(ipcChannels.chooseClipDirectory, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.chooseClipDirectory();
	});
	ipcMain.handle(ipcChannels.openClipsDirectory, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.openClipsDirectory();
	});
	ipcMain.handle(ipcChannels.refreshCaptureSources, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.refreshCaptureSources();
	});
	handle(ipcChannels.updateAutoCaptureSettings, getMainWindow, (input) => autoCaptureSettingsPatchSchema.parse(input), (input) => controller.updateAutoCaptureSettings(input));
	handle(ipcChannels.setupAutoCaptureProvider, getMainWindow, (input) => autoCaptureProviderIdSchema.parse(input), (providerId) => controller.setupAutoCaptureProvider(providerId));
	handle(ipcChannels.emitAutoCaptureTestEvent, getMainWindow, (input) => autoCaptureTestEventInputSchema.parse(input), (input) => controller.emitAutoCaptureTestEvent(input));
	ipcMain.handle(ipcChannels.scanGames, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.scanGames();
	});
	ipcMain.handle(ipcChannels.addGame, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.addGame();
	});
	ipcMain.handle(ipcChannels.checkAppUpdates, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.checkAppUpdates();
	});
	ipcMain.handle(ipcChannels.downloadAppUpdate, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.downloadAppUpdate();
	});
	ipcMain.handle(ipcChannels.installAppUpdate, (event) => {
		assertTrustedSender$1(event, getMainWindow);
		return controller.installAppUpdate();
	});
	handle(ipcChannels.updateSettings, getMainWindow, (input) => updateSettingsInputSchema.parse(input), (input) => controller.updateSettings(input));
	handle(ipcChannels.resetSettings, getMainWindow, (input) => settingsResetScopeSchema.parse(input), (scope) => controller.resetSettings(scope));
	handle(ipcChannels.submitFeedbackReport, getMainWindow, (input) => feedbackSubmissionInputSchema.parse(input), (input) => controller.submitFeedbackReport(input));
	handle(ipcChannels.revealClip, getMainWindow, (input) => z.string().min(1).max(4096).parse(input), (id) => controller.revealClip(id));
	handle(ipcChannels.deleteClip, getMainWindow, (input) => z.string().min(1).max(256).parse(input), (id) => controller.deleteClip(id));
	handle(ipcChannels.markClipsReviewed, getMainWindow, (input) => markClipsReviewedInputSchema.parse(input), (input) => controller.markClipsReviewed(input));
	handle(ipcChannels.renameClip, getMainWindow, (input) => renameClipInputSchema.parse(input), (input) => controller.renameClip(input));
	handle(ipcChannels.setClipFavorite, getMainWindow, (input) => setClipFavoriteInputSchema.parse(input), (input) => controller.setClipFavorite(input));
	handle(ipcChannels.setClipTrim, getMainWindow, (input) => clipTrimInputSchema.parse(input), (input) => controller.setClipTrim(input));
	handle(ipcChannels.setClipCanvasSize, getMainWindow, (input) => setClipCanvasSizeInputSchema.parse(input), (input) => controller.setClipCanvasSize(input));
	handle(ipcChannels.setClipAudioTrackLevel, getMainWindow, (input) => setClipAudioTrackLevelInputSchema.parse(input), (input) => controller.setClipAudioTrackLevel(input));
	handle(ipcChannels.loadClipAudioWaveform, getMainWindow, (input) => z.string().min(1).max(256).parse(input), (id) => controller.loadClipAudioWaveform(id));
	handle(ipcChannels.exportClip, getMainWindow, (input) => exportClipInputSchema.parse(input), (input) => controller.exportClip(input));
	handle(ipcChannels.prepareClipShare, getMainWindow, (input) => prepareClipShareInputSchema.parse(input), (input) => controller.prepareClipShare(input));
	ipcMain.on(ipcChannels.startPreparedShareDrag, (event, raw) => {
		try {
			assertTrustedSender$1(event, getMainWindow);
			const id = z.string().uuid().parse(raw);
			const prepared = getPreparedShareService().resolve(id);
			if (!prepared) throw new Error("The prepared share file is no longer available. Prepare it again.");
			const fallbackIconPath = app.isPackaged ? join(process.resourcesPath, "branding", "switchboard-icon.png") : join(app.getAppPath(), "resources", "branding", "switchboard-icon.png");
			const sourceIcon = nativeImage.createFromPath(prepared.iconPath ?? fallbackIconPath);
			const fallbackIcon = sourceIcon.isEmpty() ? nativeImage.createFromPath(fallbackIconPath) : sourceIcon;
			if (fallbackIcon.isEmpty()) throw new Error("Switchboard could not create the file drag icon.");
			event.sender.startDrag({
				file: prepared.path,
				icon: fallbackIcon.resize({
					width: 48,
					height: 48,
					quality: "best"
				})
			});
		} catch (error) {
			console.error("Switchboard could not start the prepared file drag.", error);
		}
	});
	ipcMain.handle(ipcChannels.revealPreparedShareFile, (event, raw) => {
		assertTrustedSender$1(event, getMainWindow);
		getPreparedShareService().reveal(z.string().uuid().parse(raw));
	});
	ipcMain.on(ipcChannels.setAudioMeterSubscription, (event, raw) => {
		try {
			assertTrustedSender$1(event, getMainWindow);
			const requested = z.boolean().parse(raw);
			const sender = event.sender;
			const senderId = sender.id;
			const changed = audioMeterDelivery.setRequested(senderId, requested);
			if (changed) controller.setAudioMeteringRequested(requested);
			if (requested && changed) {
				const clearDemand = () => {
					if (audioMeterDelivery.clear(senderId)) controller.setAudioMeteringRequested(false);
				};
				sender.once("did-start-navigation", clearDemand);
				sender.once("destroyed", clearDemand);
			}
		} catch (error) {
			console.error("Switchboard rejected an audio meter subscription request.", error);
		}
	});
	handle(ipcChannels.exportMontage, getMainWindow, (input) => exportMontageInputSchema.parse(input), (input) => controller.exportMontage(input));
	handle(ipcChannels.cancelClipExport, getMainWindow, (input) => z.string().uuid().parse(input), (exportId) => controller.cancelClipExport(exportId));
	const unsubscribe = controller.subscribe((snapshot) => {
		for (const window of [getMainWindow(), getQuickWindow()]) {
			if (!window || window.isDestroyed()) continue;
			debugDiagnostics.measure("ipc:snapshot:send", () => window.webContents.send(ipcChannels.snapshotUpdated, snapshot));
		}
	});
	const unsubscribeAudioMeters = controller.subscribeAudioMeters((frame) => {
		const window = getMainWindow();
		if (!window || window.isDestroyed() || !audioMeterDelivery.shouldDeliver(window.webContents.id, window.isVisible())) return;
		window.webContents.send(ipcChannels.audioMeterUpdated, frame);
	});
	const unsubscribeClipExportProgress = controller.subscribeClipExportProgress((progress) => {
		const window = getMainWindow();
		if (!window || window.isDestroyed()) return;
		window.webContents.send(ipcChannels.clipExportProgress, progress);
	});
	return () => {
		getQuickWindow = () => null;
		controller.setAudioMeteringRequested(false);
		unsubscribe();
		unsubscribeAudioMeters();
		unsubscribeClipExportProgress();
		ipcMain.removeAllListeners(ipcChannels.startPreparedShareDrag);
		ipcMain.removeAllListeners(ipcChannels.setAudioMeterSubscription);
		for (const channel of Object.values(ipcChannels)) if (channel !== ipcChannels.snapshotUpdated) ipcMain.removeHandler(channel);
	};
}
//#endregion
//#region src/main/media-byte-range.ts
function parseByteRange(value, size) {
	if (!value) return null;
	const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
	if (!match || !match[1] && !match[2] || size <= 0) return null;
	if (!match[1]) {
		const suffixLength = Number(match[2]);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
		return {
			start: Math.max(0, size - suffixLength),
			end: size - 1
		};
	}
	const start = Number(match[1]);
	const requestedEnd = match[2] ? Number(match[2]) : size - 1;
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return null;
	return {
		start,
		end: Math.min(size - 1, requestedEnd)
	};
}
//#endregion
//#region src/main/montage-v2-ipc.ts
function assertTrustedSender(event, getMainWindow) {
	const window = getMainWindow();
	if (!window || window.isDestroyed() || event.sender.id !== window.webContents.id) throw new Error("Rejected montage IPC from an untrusted webContents instance.");
	const sourceUrl = event.senderFrame?.url;
	if (!sourceUrl) throw new Error("Montage IPC request has no sender URL.");
	const parsed = new URL(sourceUrl);
	const trustedProtocol = parsed.protocol === "file:";
	const trustedDevHost = ["http:", "https:"].includes(parsed.protocol) && ["localhost", "127.0.0.1"].includes(parsed.hostname);
	if (!trustedProtocol && !trustedDevHost) throw new Error(`Rejected montage IPC sender: ${parsed.origin}`);
}
function registerMontageV2Ipc(controller, getMainWindow) {
	const service = getMontageV2Service();
	ipcMain.handle(montageV2IpcChannels.importAudio, (event) => {
		assertTrustedSender(event, getMainWindow);
		return service.importAudio();
	});
	ipcMain.handle(montageV2IpcChannels.loadAudioWaveform, (event, raw) => {
		assertTrustedSender(event, getMainWindow);
		return service.loadAudioWaveform(montageAudioAssetIdSchema.parse(raw));
	});
	ipcMain.handle(montageV2IpcChannels.listDrafts, (event) => {
		assertTrustedSender(event, getMainWindow);
		return service.listDrafts();
	});
	ipcMain.handle(montageV2IpcChannels.saveDraft, (event, raw) => {
		assertTrustedSender(event, getMainWindow);
		return service.saveDraft(montageProjectV2Schema.parse(raw));
	});
	ipcMain.handle(montageV2IpcChannels.deleteDraft, (event, raw) => {
		assertTrustedSender(event, getMainWindow);
		return service.deleteDraft(montageDraftIdSchema.parse(raw));
	});
	ipcMain.handle(montageV2IpcChannels.export, (event, raw) => {
		assertTrustedSender(event, getMainWindow);
		const input = exportMontageV2InputSchema.parse(raw);
		const snapshot = controller.getSnapshot();
		return service.export(input, snapshot.clips, selectShareVideoEncoder(snapshot.capture.capabilities.encoders), (fraction) => {
			if (!event.sender.isDestroyed()) event.sender.send(ipcChannels.clipExportProgress, {
				exportId: input.exportId,
				percent: Math.min(99, Math.round(fraction * 100)),
				stage: fraction >= .92 ? "finalizing" : "compressing"
			});
		});
	});
	ipcMain.handle(montageV2IpcChannels.cancelExport, (event, raw) => {
		assertTrustedSender(event, getMainWindow);
		service.cancelExport(montageDraftIdSchema.parse(raw));
	});
	return () => {
		for (const channel of Object.values(montageV2IpcChannels)) ipcMain.removeHandler(channel);
	};
}
//#endregion
//#region src/main/startup-settings.ts
function markBackgroundUpdate(filePath, requested) {
	if (requested) writeFileSync(filePath, JSON.stringify({ requestedAt: Date.now() }), "utf8");
	else rmSync(filePath, { force: true });
}
function consumeBackgroundUpdate(filePath, isUpdateLaunch, now = Date.now()) {
	try {
		const marker = z.object({ requestedAt: z.number().finite().nonnegative() }).parse(JSON.parse(readFileSync(filePath, "utf8")));
		return isUpdateLaunch && now >= marker.requestedAt && now - marker.requestedAt < 864e5;
	} catch {
		return false;
	} finally {
		try {
			rmSync(filePath, { force: true });
		} catch {}
	}
}
var startupSettingsSchema = z.object({ settings: z.object({ softwareRendering: z.boolean().optional() }).passthrough() }).passthrough();
function readSoftwareRenderingPreference(filePath) {
	for (const candidate of [filePath, `${filePath}.bak`]) try {
		const raw = readFileSync(candidate, "utf8").replace(/^\uFEFF/, "");
		const parsed = startupSettingsSchema.safeParse(JSON.parse(raw));
		if (parsed.success) return parsed.data.settings.softwareRendering === true;
	} catch {}
	return false;
}
//#endregion
//#region src/main/index.ts
process.on("uncaughtExceptionMonitor", (error, origin) => {
	developerDiagnostics.record("main", "error", "process.uncaught-exception", {
		origin,
		error: (error.stack ?? error.message).slice(0, 4096)
	});
});
app.on("child-process-gone", (_event, details) => {
	developerDiagnostics.record("main", "error", "process.child-exited", {
		type: details.type,
		reason: details.reason,
		exitCode: details.exitCode
	});
});
var mainWindow = null;
var quickControls = new QuickControlsWindow();
var tray = null;
var controller = null;
var cleanupIpc = null;
var cleanupMontageV2Ipc = null;
var quitting = false;
var shutdownStarted = false;
var applicationIdentity = resolveApplicationIdentity({
	appDataPath: app.getPath("appData"),
	isPackaged: app.isPackaged
});
if (applicationIdentity.userDataPath && shouldApplyDevelopmentIdentity({
	isNativeReview: process.env.SWITCHBOARD_NATIVE_REVIEW === "1",
	isPackaged: app.isPackaged
})) {
	app.setName(applicationIdentity.displayName);
	app.setPath("userData", applicationIdentity.userDataPath);
}
var demoUpdateRequested = requestsDemoUpdate(process.argv, app.isPackaged);
var backgroundUpdateMarker = join(app.getPath("userData"), "background-update.json");
var startInTrayAfterUpdate = app.isPackaged && consumeBackgroundUpdate(backgroundUpdateMarker, process.argv.includes("--updated"));
var packagedUpdaterVerdictPath = process.env.SWITCHBOARD_PACKAGED_UPDATER_VERDICT;
var packagedUpdaterTargetVersion = process.env.SWITCHBOARD_PACKAGED_UPDATER_TARGET_VERSION?.trim();
var verifyPackagedUpdater = app.isPackaged && process.platform === "win32" && process.env.SWITCHBOARD_VERIFY_PACKAGED_UPDATER === "1" && typeof packagedUpdaterVerdictPath === "string" && isAbsolute(packagedUpdaterVerdictPath);
if (process.env.SWITCHBOARD_DISABLE_HARDWARE_ACCELERATION === "1" || readSoftwareRenderingPreference(join(app.getPath("userData"), "switchboard-state.json"))) app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{
	scheme: "switchboard-media",
	privileges: {
		standard: true,
		secure: true,
		supportFetchAPI: true,
		stream: true
	}
}]);
var hasSingleInstanceLock = verifyPackagedUpdater || process.env.SWITCHBOARD_NATIVE_REVIEW === "1" || app.requestSingleInstanceLock({ demoUpdate: demoUpdateRequested });
if (!hasSingleInstanceLock) app.quit();
function isTrustedNavigation(url) {
	try {
		const target = new URL(url);
		const developmentUrl = process.env.ELECTRON_RENDERER_URL;
		if (developmentUrl) return target.origin === new URL(developmentUrl).origin;
		return target.protocol === "file:";
	} catch {
		return false;
	}
}
function getBrandIconPath(extension = "png") {
	return app.isPackaged ? join(process.resourcesPath, "branding", `switchboard-icon.${extension}`) : join(app.getAppPath(), "resources", "branding", `switchboard-icon.${extension}`);
}
function createWindow() {
	const window = new BrowserWindow({
		width: 1420,
		height: 900,
		minWidth: 1080,
		minHeight: 720,
		show: false,
		icon: getBrandIconPath(process.platform === "win32" ? "ico" : "png"),
		backgroundColor: "#0d1015",
		title: applicationIdentity.displayName,
		titleBarStyle: "hidden",
		titleBarOverlay: {
			color: "#00000000",
			symbolColor: "#a1aab7",
			height: 38
		},
		webPreferences: {
			preload: join(__dirname, "../preload/index.cjs"),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webSecurity: true,
			allowRunningInsecureContent: false
		}
	});
	controller?.setRendererActive(true);
	window.once("ready-to-show", () => {
		if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== "1") window.show();
	});
	window.on("focus", () => {
		controller?.initialize().then(() => controller?.refreshAudioDevices()).catch(() => void 0);
	});
	window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
	window.webContents.on("will-navigate", (event, url) => {
		if (!isTrustedNavigation(url)) event.preventDefault();
	});
	window.webContents.on("will-attach-webview", (event) => event.preventDefault());
	window.webContents.on("render-process-gone", (_event, details) => {
		developerDiagnostics.record("renderer", "error", "renderer.exited", {
			reason: details.reason,
			exitCode: details.exitCode
		});
		console.error("Switchboard renderer exited.", details.reason);
	});
	window.webContents.on("did-fail-load", (_event, code, description, url) => {
		developerDiagnostics.record("renderer", "error", "renderer.load-failed", {
			code,
			description: description.slice(0, 4096)
		});
		console.error(`Failed to load renderer (${code}): ${description}`, url);
	});
	window.on("unresponsive", () => developerDiagnostics.record("renderer", "warning", "renderer.unresponsive"));
	window.on("responsive", () => developerDiagnostics.record("renderer", "info", "renderer.responsive"));
	window.on("close", (event) => {
		if (quitting || !controller?.getSnapshot().settings.closeToTray) return;
		event.preventDefault();
		if (controller.getSnapshot().settings.destroyRendererInTray) {
			controller.setRendererActive(false);
			window.destroy();
		} else {
			controller.setRendererActive(false);
			window.hide();
		}
	});
	window.on("closed", () => {
		if (mainWindow === window) mainWindow = null;
		controller?.setRendererActive(false);
	});
	if (process.env.ELECTRON_RENDERER_URL) window.loadURL(process.env.ELECTRON_RENDERER_URL);
	else window.loadFile(join(__dirname, "../renderer/index.html"));
	return window;
}
function showWindow() {
	if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
	else {
		controller?.setRendererActive(true);
		if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== "1") mainWindow.show();
	}
	controller?.initialize().then(() => controller?.refreshAudioDevices()).catch(() => void 0);
	if (process.env.SWITCHBOARD_NATIVE_REVIEW_HIDDEN !== "1") mainWindow.focus();
}
async function getRendererRuntimeProbe() {
	const window = mainWindow;
	if (!window || window.isDestroyed() || window.webContents.isDestroyed() || window.webContents.isLoading()) return null;
	return window.webContents.executeJavaScript(`(() => {
    const heap = performance.memory;
    const videos = Array.from(document.querySelectorAll('video'));
    const route = document.querySelector('.settings-page') ? 'settings' : location.hash.replace(/^#/, '').split('/')[0] || 'devices';
    return {
      route,
      longTasks: window.switchboardDebugRuntime ?? null,
      jsHeapUsedBytes: Number.isFinite(heap?.usedJSHeapSize) ? heap.usedJSHeapSize : null,
      jsHeapTotalBytes: Number.isFinite(heap?.totalJSHeapSize) ? heap.totalJSHeapSize : null,
      jsHeapLimitBytes: Number.isFinite(heap?.jsHeapSizeLimit) ? heap.jsHeapSizeLimit : null,
      domNodes: document.getElementsByTagName('*').length,
      canvasCount: document.querySelectorAll('canvas').length,
      imageCount: document.images.length,
      videoCount: videos.length,
      playingVideoCount: videos.filter((video) => !video.paused && !video.ended).length,
      resourceEntryCount: performance.getEntriesByType('resource').length,
    };
  })()`, true);
}
function requestQuit() {
	quitting = true;
	app.quit();
}
function createTray() {
	const icon = nativeImage.createFromPath(getBrandIconPath());
	if (icon.isEmpty()) throw new Error("Switchboard brand icon could not be loaded.");
	const created = new Tray(icon.resize({
		width: 18,
		height: 18,
		quality: "best"
	}));
	created.setToolTip(applicationIdentity.displayName);
	created.setContextMenu(Menu.buildFromTemplate([
		{
			label: `Open ${applicationIdentity.displayName}`,
			click: showWindow
		},
		{ type: "separator" },
		{
			label: "Quit",
			click: requestQuit
		}
	]));
	created.on("double-click", showWindow);
	return created;
}
async function shutdown() {
	quickControls.dispose();
	if (protocol.isProtocolHandled("switchboard-media")) await protocol.unhandle("switchboard-media");
	cleanupMontageV2Ipc?.();
	cleanupMontageV2Ipc = null;
	cleanupIpc?.();
	cleanupIpc = null;
	disposeMontageV2Service();
	await controller?.dispose();
	await disposePreparedShareService();
	controller = null;
	tray?.destroy();
	tray = null;
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
	mainWindow = null;
}
if (verifyPackagedUpdater) app.whenReady().then(async () => {
	const updater = await loadDefaultAppUpdaterClient();
	if (packagedUpdaterTargetVersion) {
		await verifyInstalledUpdate(updater, packagedUpdaterTargetVersion, packagedUpdaterVerdictPath);
		return;
	}
	writeFileSync(packagedUpdaterVerdictPath, JSON.stringify({
		ok: true,
		updater: updater.constructor.name
	}));
	app.exit(0);
}).catch((error) => {
	try {
		writeFileSync(packagedUpdaterVerdictPath, JSON.stringify({
			ok: false,
			error: error instanceof Error ? error.stack : String(error)
		}));
	} catch {}
	app.exit(1);
});
else if (hasSingleInstanceLock) {
	app.on("second-instance", (_event, arguments_, _workingDirectory, additionalData) => {
		if (requestsDemoUpdate(arguments_, app.isPackaged, additionalData)) {
			demoUpdateRequested = true;
			controller?.enableDemoUpdate();
		}
		showWindow();
	});
	app.whenReady().then(async () => {
		app.setAppUserModelId(applicationIdentity.appUserModelId);
		session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
		session.defaultSession.setPermissionCheckHandler(() => false);
		controller = new AppController({
			onQuickControls: (open, held) => quickControls.setOpen(open, held),
			demoUpdate: demoUpdateRequested,
			getRendererRuntime: getRendererRuntimeProbe,
			onUpdateInstallRequested: (installing, background) => {
				markBackgroundUpdate(backgroundUpdateMarker, installing && background);
				quitting = installing;
			}
		});
		const initialization = controller.initialize();
		await protocol.handle("switchboard-media", async (request) => {
			const url = new URL(request.url);
			const id = decodeURIComponent(url.pathname.replace(/^\//, ""));
			if (url.hostname === "capture-source") {
				const thumbnail = await controller?.getCaptureSourceThumbnail(id);
				if (!thumbnail) return new Response("Not found", { status: 404 });
				return new Response(new Uint8Array(thumbnail), { headers: {
					"Cache-Control": "no-store",
					"Content-Type": "image/png"
				} });
			}
			const range = request.headers.get("range");
			if (url.hostname === "montage-audio") {
				const path = await getMontageV2Service().resolveAssetPath(id);
				if (!path) return new Response("Not found", { status: 404 });
				return streamMedia(path, range, audioContentType(path));
			}
			if (url.hostname === "clip-audio") {
				const trackIndex = Number(url.searchParams.get("track"));
				const path = await controller?.getClipAudioPreviewPath(id, trackIndex);
				if (!path) return new Response("Not found", { status: 404 });
				return streamMedia(path, range, audioContentType(path));
			}
			const path = controller?.getClipPath(id, url.hostname === "thumbnail");
			if (!path) return new Response("Not found", { status: 404 });
			if (url.hostname === "clip") return streamMedia(path, range, clipContentType(path));
			return net.fetch(pathToFileURL(path).toString(), range ? { headers: { Range: range } } : void 0);
		});
		cleanupIpc = registerIpc(controller, () => mainWindow, () => quickControls.getWindow());
		cleanupMontageV2Ipc = registerMontageV2Ipc(controller, () => mainWindow);
		tray = createTray();
		if (startInTrayAfterUpdate) controller.setRendererActive(false);
		else showWindow();
		await initialization;
		app.on("activate", showWindow);
	}).catch((error) => {
		console.error("Switchboard failed to initialize.", error);
		app.exit(1);
	});
}
async function verifyInstalledUpdate(updater, targetVersion, verdictPath) {
	if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(targetVersion)) throw new Error(`Invalid packaged updater target version: ${targetVersion}`);
	updater.autoDownload = true;
	updater.autoInstallOnAppQuit = false;
	let finished = false;
	const fail = (error) => {
		if (finished) return;
		finished = true;
		writeFileSync(verdictPath, JSON.stringify({
			ok: false,
			error: error instanceof Error ? error.stack : String(error)
		}));
		app.exit(1);
	};
	const versionFrom = (payload) => {
		if (!payload || typeof payload !== "object" || !("version" in payload)) return null;
		const version = payload.version;
		return typeof version === "string" ? version : null;
	};
	const assertTarget = (payload, phase) => {
		const version = versionFrom(payload);
		if (version === targetVersion) return true;
		fail(/* @__PURE__ */ new Error(`${phase} reported ${version ?? "no version"} instead of ${targetVersion}.`));
		return false;
	};
	updater.on("update-available", (payload) => {
		assertTarget(payload, "update-available");
	});
	updater.on("update-not-available", (payload) => {
		fail(/* @__PURE__ */ new Error(`No ${targetVersion} update was available; feed reported ${versionFrom(payload) ?? "no version"}.`));
	});
	updater.on("error", (payload) => {
		fail(payload instanceof Error ? payload : new Error(String(payload)));
	});
	updater.on("update-downloaded", (payload) => {
		if (finished || !assertTarget(payload, "update-downloaded")) return;
		finished = true;
		writeFileSync(verdictPath, JSON.stringify({
			ok: true,
			updater: updater.constructor.name,
			version: targetVersion
		}));
		updater.quitAndInstall(true, false);
	});
	setTimeout(() => fail(/* @__PURE__ */ new Error(`Timed out downloading Switchboard ${targetVersion}.`)), 3e5).unref();
	await updater.checkForUpdates();
}
app.on("window-all-closed", () => {
	if (process.platform !== "darwin" && !controller?.getSnapshot().settings.closeToTray) requestQuit();
});
app.on("before-quit", (event) => {
	quitting = true;
	if (shutdownStarted) return;
	event.preventDefault();
	shutdownStarted = true;
	shutdown().catch((error) => console.error("Switchboard shutdown failed.", error)).finally(() => {
		const reviewFailed = process.env.SWITCHBOARD_NATIVE_REVIEW === "1" && process.env.SWITCHBOARD_REVIEW_EXIT_CODE === "1";
		app.exit(reviewFailed ? 1 : 0);
	});
});
async function streamMedia(path, rangeHeader, contentType) {
	const file = await stat(path);
	const headers = new Headers({
		"Accept-Ranges": "bytes",
		"Cache-Control": "no-store",
		"Content-Type": contentType
	});
	const range = parseByteRange(rangeHeader, file.size);
	if (rangeHeader && !range) {
		headers.set("Content-Range", `bytes */${file.size}`);
		return new Response(null, {
			status: 416,
			headers
		});
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? Math.max(0, file.size - 1);
	headers.set("Content-Length", String(Math.max(0, end - start + 1)));
	if (range) headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
	const stream = Readable.toWeb(createReadStream(path, {
		start,
		end
	}));
	return new Response(stream, {
		status: range ? 206 : 200,
		headers
	});
}
function clipContentType(path) {
	switch (extname(path).toLowerCase()) {
		case ".mkv": return "video/x-matroska";
		case ".webm": return "video/webm";
		default: return "video/mp4";
	}
}
function audioContentType(path) {
	switch (extname(path).toLowerCase()) {
		case ".mp3": return "audio/mpeg";
		case ".wav": return "audio/wav";
		case ".m4a": return "audio/mp4";
		case ".aac": return "audio/aac";
		case ".flac": return "audio/flac";
		case ".ogg": return "audio/ogg";
		case ".opus": return "audio/ogg";
		default: return "application/octet-stream";
	}
}
//#endregion
export {};
