import { L as require_jsx_runtime, V as __toESM, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { Ct as Trash2, R as useSystemStore, _t as reviewableAutoCapturedClips, a as formatRelativeTime, c as Dialog, d as DialogHeader, f as DialogTitle, gt as latestClipCreatedAt, l as DialogContent, st as Button, u as DialogDescription } from "./index-Cqk9uQ3G.js";
import { n as clipGameLabel, t as ClipThumbnail } from "./ClipThumbnail-VVZ5guZH.js";
//#region src/renderer/src/components/capture/NewClipsReview.tsx
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var import_jsx_runtime = require_jsx_runtime();
function NewClipsReview({ snapshot, onOpenClip }) {
	const deleteClip = useSystemStore((state) => state.deleteClip);
	const markClipsReviewed = useSystemStore((state) => state.markClipsReviewed);
	const setPage = useSystemStore((state) => state.setPage);
	const snapshotRef = (0, import_react.useRef)(snapshot);
	const batchRef = (0, import_react.useRef)(null);
	const locallyReviewedThrough = (0, import_react.useRef)(snapshot.clipReview.reviewedThrough);
	const focusReviewArmed = (0, import_react.useRef)(true);
	const [batch, setBatchState] = (0, import_react.useState)(null);
	const [confirmDelete, setConfirmDelete] = (0, import_react.useState)(false);
	const [deleting, setDeleting] = (0, import_react.useState)(false);
	const [deletionError, setDeletionError] = (0, import_react.useState)(null);
	snapshotRef.current = snapshot;
	locallyReviewedThrough.current = Math.max(locallyReviewedThrough.current, snapshot.clipReview.reviewedThrough);
	const setBatch = (0, import_react.useCallback)((next) => {
		batchRef.current = next;
		setBatchState(next);
	}, []);
	const offerReview = (0, import_react.useCallback)(() => {
		if (!focusReviewArmed.current || batchRef.current) return;
		const current = snapshotRef.current;
		const clips = reviewableAutoCapturedClips(current.clips, locallyReviewedThrough.current, current.capture.autoCapture.runtime.activeGameId);
		if (clips.length === 0) return;
		const next = {
			ids: clips.map((clip) => clip.id),
			reviewedThrough: latestClipCreatedAt(clips)
		};
		focusReviewArmed.current = false;
		setBatch(next);
		setConfirmDelete(false);
		setDeletionError(null);
		setPage("capture");
	}, [setBatch, setPage]);
	(0, import_react.useEffect)(() => {
		const arm = () => {
			focusReviewArmed.current = true;
		};
		const reviewOnFocus = () => offerReview();
		const reviewOnVisibility = () => {
			if (document.visibilityState === "hidden") arm();
			else offerReview();
		};
		window.addEventListener("blur", arm);
		window.addEventListener("focus", reviewOnFocus);
		document.addEventListener("visibilitychange", reviewOnVisibility);
		if (document.hasFocus() && document.visibilityState !== "hidden") offerReview();
		return () => {
			window.removeEventListener("blur", arm);
			window.removeEventListener("focus", reviewOnFocus);
			document.removeEventListener("visibilitychange", reviewOnVisibility);
		};
	}, [offerReview]);
	(0, import_react.useEffect)(() => {
		if (document.hasFocus() && document.visibilityState !== "hidden") offerReview();
	}, [
		offerReview,
		snapshot.clips,
		snapshot.clipReview.reviewedThrough,
		snapshot.capture.autoCapture.runtime.activeGameId
	]);
	const clips = (0, import_react.useMemo)(() => {
		if (!batch) return [];
		const clipsById = new Map(snapshot.clips.map((clip) => [clip.id, clip]));
		return batch.ids.map((id) => clipsById.get(id)).filter((clip) => Boolean(clip));
	}, [batch, snapshot.clips]);
	const gameLabels = [...new Set(clips.map(clipGameLabel))];
	const reviewStyle = { "--new-clips-review-columns": Math.max(1, Math.min(3, clips.length)) };
	const finishReview = (0, import_react.useCallback)((openClipId) => {
		const current = batchRef.current;
		if (!current) return;
		locallyReviewedThrough.current = Math.max(locallyReviewedThrough.current, current.reviewedThrough);
		setBatch(null);
		setConfirmDelete(false);
		setDeletionError(null);
		markClipsReviewed({ reviewedThrough: current.reviewedThrough });
		if (openClipId) onOpenClip(openClipId);
		else setPage("capture");
	}, [
		markClipsReviewed,
		onOpenClip,
		setBatch,
		setPage
	]);
	const deleteBatch = async () => {
		const current = batchRef.current;
		if (!current || deleting) return;
		setDeleting(true);
		setDeletionError(null);
		try {
			for (const id of current.ids) if (snapshotRef.current.clips.some((clip) => clip.id === id)) await deleteClip(id);
			finishReview();
		} catch (error) {
			setDeletionError(error instanceof Error ? error.message : String(error));
		} finally {
			setDeleting(false);
		}
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Dialog, {
		open: Boolean(batch),
		onOpenChange: (open) => {
			if (!open && !deleting) finishReview();
		},
		children: batch ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogContent, {
			className: "new-clips-review no-drag",
			"data-testid": "new-clips-review",
			style: reviewStyle,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogHeader, {
					className: "new-clips-review__header",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(DialogTitle, {
						className: "new-clips-review__title",
						children: [
							clips.length,
							" new ",
							clips.length === 1 ? "clip" : "clips"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DialogDescription, { children: gameLabels.length > 1 ? `Captured automatically across ${gameLabels.length} games` : `Captured automatically during your last game${gameLabels[0] ? ` · ${gameLabels[0]}` : ""}` })]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "new-clips-review__viewport",
					"data-new-clips-scroll": true,
					children: clips.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "new-clips-review__grid",
						"aria-label": "New clips",
						children: clips.map((clip) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
							className: "new-clips-review__card group",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ClipThumbnail, {
								clip,
								onOpen: () => finishReview(clip.id),
								className: "new-clips-review__thumbnail"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "new-clips-review__copy",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: clip.name }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: clipGameLabel(clip) }),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "new-clips-review__metadata",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: formatRelativeTime(clip.createdAt) })
									})
								]
							})]
						}) }, clip.id))
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "new-clips-review__empty",
						role: "status",
						children: "These clips are no longer in the library."
					})
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("footer", {
					className: "new-clips-review__footer",
					children: confirmDelete ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						role: deletionError ? "alert" : "status",
						className: deletionError ? "new-clips-review__delete-error" : void 0,
						children: deletionError ?? `Move ${clips.length} ${clips.length === 1 ? "clip" : "clips"} to the Recycle Bin?`
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "new-clips-review__footer-actions",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							variant: "secondary",
							disabled: deleting,
							onClick: () => {
								setConfirmDelete(false);
								setDeletionError(null);
							},
							children: "Cancel"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
							type: "button",
							variant: "danger",
							disabled: deleting || clips.length === 0,
							onClick: () => void deleteBatch(),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
								className: "size-4",
								"aria-hidden": "true"
							}), deleting ? "Deleting…" : `Delete ${clips.length} ${clips.length === 1 ? "clip" : "clips"}`]
						})]
					})] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
						type: "button",
						variant: "danger",
						disabled: clips.length === 0,
						onClick: () => setConfirmDelete(true),
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
								className: "size-4",
								"aria-hidden": "true"
							}),
							" Delete ",
							clips.length,
							" ",
							clips.length === 1 ? "clip" : "clips"
						]
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						variant: "primary",
						onClick: () => finishReview(),
						children: "View all clips"
					})] })
				})
			]
		}) : null
	});
}
//#endregion
export { NewClipsReview };
