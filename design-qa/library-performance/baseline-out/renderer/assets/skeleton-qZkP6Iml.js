import { N as require_jsx_runtime, O as cn } from "./demo-api-BNokT5Mf.js";
//#region src/renderer/src/components/ui/skeleton.tsx
var import_jsx_runtime = require_jsx_runtime();
function Skeleton({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		"data-slot": "skeleton",
		"aria-hidden": true,
		className: cn("animate-pulse rounded-sm bg-muted motion-reduce:animate-none", className),
		...props
	});
}
//#endregion
export { Skeleton as t };
