import { L as require_jsx_runtime, M as cn, j as cva } from "./demo-api-Ce3WgRJZ.js";
//#region src/renderer/src/components/ui/badge.tsx
var import_jsx_runtime = require_jsx_runtime();
var badgeVariants = cva("inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] whitespace-nowrap", {
	variants: { variant: {
		default: "border-border bg-muted text-muted-foreground",
		accent: "border-primary/35 bg-primary/10 text-primary",
		success: "border-success/30 bg-success/10 text-success",
		warning: "border-warning/30 bg-warning/10 text-warning",
		destructive: "border-destructive/35 bg-destructive/10 text-destructive"
	} },
	defaultVariants: { variant: "default" }
});
function Badge({ className, variant, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badgeVariants({ variant }), className),
		...props
	});
}
//#endregion
export { Badge as t };
