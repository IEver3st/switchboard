import { F as require_react, L as __toESM, N as require_jsx_runtime, O as cn } from "./demo-api-BNokT5Mf.js";
import { ht as Play, i as formatDuration, st as Video } from "./index-Br7Ix8br.js";
import { t as Skeleton } from "./skeleton-qZkP6Iml.js";
//#region src/shared/clip-library.ts
var generatedCaptureName = /^(.*?)[_ -]\d{4}-\d{2}-\d{2}(?:[_ -]\d{2}[-_:]\d{2}[-_:]\d{2})?(?:_\d+)?$/i;
var desktopSourceName = /^(?:display|desktop|screen)\s*\d*$/i;
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
function filterAndSortClips(clips, query) {
	const normalizedQuery = query.query.trim().toLocaleLowerCase();
	const now = query.now ?? Date.now();
	return clips.filter((clip) => {
		const game = clipGameLabel(clip);
		if (query.favoritesOnly && !clip.favorite) return false;
		if (query.source === "manual" && clip.autoCapture) return false;
		if (query.source === "auto-capture" && !clip.autoCapture) return false;
		if (query.event && query.event !== "all" && !clip.autoCapture?.events.some((event) => event.type === query.event)) return false;
		if (query.game !== "all" && game !== query.game) return false;
		if (!matchesClipDate(clip.createdAt, query.date, now)) return false;
		if (!normalizedQuery) return true;
		const date = new Date(clip.createdAt);
		return [
			clip.name,
			game,
			date.toLocaleDateString(),
			date.toLocaleTimeString(),
			date.toDateString(),
			...clip.autoCapture?.events.map((event) => event.label ?? event.type) ?? []
		].join(" ").toLocaleLowerCase().includes(normalizedQuery);
	}).sort((left, right) => {
		if (query.sort === "oldest") return left.createdAt - right.createdAt;
		if (query.sort === "largest") return right.fileSize - left.fileSize;
		if (query.sort === "smallest") return left.fileSize - right.fileSize;
		if (query.sort === "longest") return right.durationMs - left.durationMs;
		if (query.sort === "shortest") return left.durationMs - right.durationMs;
		return right.createdAt - left.createdAt;
	});
}
function matchesClipDate(createdAt, filter, now) {
	if (filter === "any") return true;
	const currentStart = startOfDay(now);
	const clipStart = startOfDay(createdAt);
	const daysAgo = Math.round((currentStart - clipStart) / 864e5);
	if (filter === "today") return daysAgo === 0;
	if (filter === "yesterday") return daysAgo === 1;
	if (filter === "last-7-days") return daysAgo >= 0 && daysAgo < 7;
	return daysAgo >= 0 && daysAgo < 30;
}
function startOfDay(timestamp) {
	const date = new Date(timestamp);
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
//#endregion
//#region src/renderer/src/components/ui/aspect-ratio.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function AspectRatio({ ratio = 1, className, style, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "aspect-ratio",
		className: cn("relative w-full", className),
		style: {
			aspectRatio: String(ratio),
			...style
		},
		...props
	});
}
//#endregion
//#region src/renderer/src/components/capture/ClipThumbnail.tsx
function ClipThumbnail({ clip, onOpen, className, compact = false, selectionMode = false, selected = false }) {
	const [failed, setFailed] = (0, import_react.useState)(false);
	const hasThumbnail = Boolean(clip.thumbnailPath) && !failed;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AspectRatio, {
		ratio: 16 / 9,
		className,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			"data-clip-id": clip.id,
			onClick: onOpen,
			"aria-label": selectionMode ? `${selected ? "Remove" : "Add"} ${clip.name} ${selected ? "from" : "to"} montage` : `Open ${clip.name}`,
			"aria-pressed": selectionMode ? selected : void 0,
			className: cn("absolute inset-0 grid size-full place-items-center overflow-hidden bg-background text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/65"),
			children: [
				hasThumbnail ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("img", {
					src: `switchboard-media://thumbnail/${encodeURIComponent(clip.id)}`,
					alt: "",
					loading: "lazy",
					decoding: "async",
					onError: () => setFailed(true),
					className: "size-full object-cover transition-transform duration-150 ease-out group-hover:scale-[1.015] motion-reduce:transition-none"
				}) : failed ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "grid justify-items-center gap-2 text-[11px] text-muted-foreground",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Video, {
						className: compact ? "size-4" : "size-6",
						strokeWidth: 1.5
					}), compact ? null : "Thumbnail unavailable"]
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "absolute inset-0 grid content-end gap-2 p-3",
					role: "status",
					"aria-label": "Preparing thumbnail",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "absolute inset-0 size-full rounded-none bg-surface-2" }), !compact ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "relative h-2.5 w-2/5 bg-surface-hover" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Skeleton, { className: "relative h-2 w-1/4 bg-surface-interactive" })] }) : null]
				}),
				!compact && !selectionMode ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "pointer-events-none absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-[background-color,opacity] duration-100 group-hover:bg-black/15 group-hover:opacity-100 motion-reduce:transition-none",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "grid size-11 place-items-center rounded-md border border-white/15 bg-black/75 text-white shadow-sm",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, { className: "ml-0.5 size-5 fill-current" })
					})
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: cn("capture-clip-duration absolute bottom-2.5 right-2.5 rounded-sm px-2 py-0.5 text-[12px] font-semibold tabular-nums text-white", compact && "bottom-1 right-1 px-1 text-[10px]"),
					children: formatDuration(clip.durationMs / 1e3)
				})
			]
		})
	});
}
//#endregion
export { clipGameLabel as n, filterAndSortClips as r, ClipThumbnail as t };
