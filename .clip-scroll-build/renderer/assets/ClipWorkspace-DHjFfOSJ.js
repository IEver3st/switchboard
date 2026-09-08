import { L as require_jsx_runtime, V as __toESM, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { st as Button } from "./index-Cqk9uQ3G.js";
import { MontageComposer } from "./MontageComposer-BA-ynY3M.js";
import { _ as montageV2Api, r as createSingleClipDraft, u as reconcileMontageProject } from "./capture-CJ3BXYbE.js";
//#region src/renderer/src/components/capture/ClipWorkspace.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
/** Single clips and montages share editing, history, rendering, and main-owned drafts. */
function ClipWorkspace({ clip, clips, defaultTrackLevels, ...props }) {
	const [project, setProject] = (0, import_react.useState)(null);
	const [error, setError] = (0, import_react.useState)(null);
	const [retry, setRetry] = (0, import_react.useState)(0);
	(0, import_react.useEffect)(() => {
		let active = true;
		setProject(null);
		setError(null);
		montageV2Api.listMontageDrafts().then((drafts) => {
			if (!active) return;
			const saved = drafts.find((draft) => draft.sourceClipId === clip.id);
			setProject(saved ? reconcileMontageProject(saved, clips) : createSingleClipDraft(clip, defaultTrackLevels));
		}).catch((cause) => {
			if (active) setError(cause instanceof Error ? cause.message : String(cause));
		});
		return () => {
			active = false;
		};
	}, [clip.id, retry]);
	if (!project) return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "montage-v2-shell grid place-content-center gap-3",
		role: "dialog",
		"aria-label": "Clip editor",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: error ? "alert" : "status",
				children: error ? `Could not recover this clip's edits: ${error}` : "Opening clip editor…"
			}),
			error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: () => setRetry((value) => value + 1),
				children: "Retry"
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				variant: "ghost",
				onClick: props.onClose,
				children: "Back to clips"
			})
		]
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MontageComposer, {
		initialProject: project,
		clips,
		...props,
		sourceClipActions: {
			clip,
			onRename: props.onRename,
			onFavorite: props.onFavorite,
			onDelete: props.onDelete
		}
	}, project.id);
}
//#endregion
export { ClipWorkspace };
