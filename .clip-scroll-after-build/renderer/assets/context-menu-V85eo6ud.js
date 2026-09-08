import { L as require_jsx_runtime, M as cn, V as __toESM, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { _ as createMenuScope, a as Group, c as Label, d as RadioItem, f as Root3, g as SubTrigger, h as SubContent, i as Content2$1, l as Portal, m as Sub, n as Arrow2, o as Item2$1, p as Separator, r as CheckboxItem, s as ItemIndicator, t as Anchor2, u as RadioGroup } from "./dist-wYTmzoNe.js";
import { $ as createContextScope, J as useLayoutEffect2, K as useCallbackRef, X as Primitive, nt as composeEventHandlers } from "./index-DsMpX2W2.js";
//#region node_modules/.bun/@radix-ui+react-context-menu@2.2.16+f24ef18e65357769/node_modules/@radix-ui/react-context-menu/node_modules/@radix-ui/react-use-controllable-state/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
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
//#region node_modules/.bun/@radix-ui+react-context-menu@2.2.16+f24ef18e65357769/node_modules/@radix-ui/react-context-menu/dist/index.mjs
var import_jsx_runtime = require_jsx_runtime();
var CONTEXT_MENU_NAME = "ContextMenu";
var [createContextMenuContext, createContextMenuScope] = createContextScope(CONTEXT_MENU_NAME, [createMenuScope]);
var useMenuScope = createMenuScope();
var [ContextMenuProvider, useContextMenuContext] = createContextMenuContext(CONTEXT_MENU_NAME);
var ContextMenu$1 = (props) => {
	const { __scopeContextMenu, children, onOpenChange, dir, modal = true } = props;
	const [open, setOpen] = import_react.useState(false);
	const menuScope = useMenuScope(__scopeContextMenu);
	const handleOpenChangeProp = useCallbackRef(onOpenChange);
	const handleOpenChange = import_react.useCallback((open2) => {
		setOpen(open2);
		handleOpenChangeProp(open2);
	}, [handleOpenChangeProp]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuProvider, {
		scope: __scopeContextMenu,
		open,
		onOpenChange: handleOpenChange,
		modal,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Root3, {
			...menuScope,
			dir,
			open,
			onOpenChange: handleOpenChange,
			modal,
			children
		})
	});
};
ContextMenu$1.displayName = CONTEXT_MENU_NAME;
var TRIGGER_NAME = "ContextMenuTrigger";
var ContextMenuTrigger$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, disabled = false, ...triggerProps } = props;
	const context = useContextMenuContext(TRIGGER_NAME, __scopeContextMenu);
	const menuScope = useMenuScope(__scopeContextMenu);
	const pointRef = import_react.useRef({
		x: 0,
		y: 0
	});
	const virtualRef = import_react.useRef({ getBoundingClientRect: () => DOMRect.fromRect({
		width: 0,
		height: 0,
		...pointRef.current
	}) });
	const longPressTimerRef = import_react.useRef(0);
	const clearLongPress = import_react.useCallback(() => window.clearTimeout(longPressTimerRef.current), []);
	const handleOpen = (event) => {
		pointRef.current = {
			x: event.clientX,
			y: event.clientY
		};
		context.onOpenChange(true);
	};
	import_react.useEffect(() => clearLongPress, [clearLongPress]);
	import_react.useEffect(() => void (disabled && clearLongPress()), [disabled, clearLongPress]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Anchor2, {
		...menuScope,
		virtualRef
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Primitive.span, {
		"data-state": context.open ? "open" : "closed",
		"data-disabled": disabled ? "" : void 0,
		...triggerProps,
		ref: forwardedRef,
		style: {
			WebkitTouchCallout: "none",
			...props.style
		},
		onContextMenu: disabled ? props.onContextMenu : composeEventHandlers(props.onContextMenu, (event) => {
			clearLongPress();
			handleOpen(event);
			event.preventDefault();
		}),
		onPointerDown: disabled ? props.onPointerDown : composeEventHandlers(props.onPointerDown, whenTouchOrPen((event) => {
			clearLongPress();
			longPressTimerRef.current = window.setTimeout(() => handleOpen(event), 700);
		})),
		onPointerMove: disabled ? props.onPointerMove : composeEventHandlers(props.onPointerMove, whenTouchOrPen(clearLongPress)),
		onPointerCancel: disabled ? props.onPointerCancel : composeEventHandlers(props.onPointerCancel, whenTouchOrPen(clearLongPress)),
		onPointerUp: disabled ? props.onPointerUp : composeEventHandlers(props.onPointerUp, whenTouchOrPen(clearLongPress))
	})] });
});
ContextMenuTrigger$1.displayName = TRIGGER_NAME;
var PORTAL_NAME = "ContextMenuPortal";
var ContextMenuPortal = (props) => {
	const { __scopeContextMenu, ...portalProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal, {
		...menuScope,
		...portalProps
	});
};
ContextMenuPortal.displayName = PORTAL_NAME;
var CONTENT_NAME = "ContextMenuContent";
var ContextMenuContent$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...contentProps } = props;
	const context = useContextMenuContext(CONTENT_NAME, __scopeContextMenu);
	const menuScope = useMenuScope(__scopeContextMenu);
	const hasInteractedOutsideRef = import_react.useRef(false);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2$1, {
		...menuScope,
		...contentProps,
		ref: forwardedRef,
		side: "right",
		sideOffset: 2,
		align: "start",
		onCloseAutoFocus: (event) => {
			props.onCloseAutoFocus?.(event);
			if (!event.defaultPrevented && hasInteractedOutsideRef.current) event.preventDefault();
			hasInteractedOutsideRef.current = false;
		},
		onInteractOutside: (event) => {
			props.onInteractOutside?.(event);
			if (!event.defaultPrevented && !context.modal) hasInteractedOutsideRef.current = true;
		},
		style: {
			...props.style,
			"--radix-context-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
			"--radix-context-menu-content-available-width": "var(--radix-popper-available-width)",
			"--radix-context-menu-content-available-height": "var(--radix-popper-available-height)",
			"--radix-context-menu-trigger-width": "var(--radix-popper-anchor-width)",
			"--radix-context-menu-trigger-height": "var(--radix-popper-anchor-height)"
		}
	});
});
ContextMenuContent$1.displayName = CONTENT_NAME;
var GROUP_NAME = "ContextMenuGroup";
var ContextMenuGroup = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...groupProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Group, {
		...menuScope,
		...groupProps,
		ref: forwardedRef
	});
});
ContextMenuGroup.displayName = GROUP_NAME;
var LABEL_NAME = "ContextMenuLabel";
var ContextMenuLabel = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...labelProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Label, {
		...menuScope,
		...labelProps,
		ref: forwardedRef
	});
});
ContextMenuLabel.displayName = LABEL_NAME;
var ITEM_NAME = "ContextMenuItem";
var ContextMenuItem$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...itemProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Item2$1, {
		...menuScope,
		...itemProps,
		ref: forwardedRef
	});
});
ContextMenuItem$1.displayName = ITEM_NAME;
var CHECKBOX_ITEM_NAME = "ContextMenuCheckboxItem";
var ContextMenuCheckboxItem = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...checkboxItemProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CheckboxItem, {
		...menuScope,
		...checkboxItemProps,
		ref: forwardedRef
	});
});
ContextMenuCheckboxItem.displayName = CHECKBOX_ITEM_NAME;
var RADIO_GROUP_NAME = "ContextMenuRadioGroup";
var ContextMenuRadioGroup = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...radioGroupProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioGroup, {
		...menuScope,
		...radioGroupProps,
		ref: forwardedRef
	});
});
ContextMenuRadioGroup.displayName = RADIO_GROUP_NAME;
var RADIO_ITEM_NAME = "ContextMenuRadioItem";
var ContextMenuRadioItem = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...radioItemProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(RadioItem, {
		...menuScope,
		...radioItemProps,
		ref: forwardedRef
	});
});
ContextMenuRadioItem.displayName = RADIO_ITEM_NAME;
var INDICATOR_NAME = "ContextMenuItemIndicator";
var ContextMenuItemIndicator = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...itemIndicatorProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ItemIndicator, {
		...menuScope,
		...itemIndicatorProps,
		ref: forwardedRef
	});
});
ContextMenuItemIndicator.displayName = INDICATOR_NAME;
var SEPARATOR_NAME = "ContextMenuSeparator";
var ContextMenuSeparator$1 = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...separatorProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator, {
		...menuScope,
		...separatorProps,
		ref: forwardedRef
	});
});
ContextMenuSeparator$1.displayName = SEPARATOR_NAME;
var ARROW_NAME = "ContextMenuArrow";
var ContextMenuArrow = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...arrowProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Arrow2, {
		...menuScope,
		...arrowProps,
		ref: forwardedRef
	});
});
ContextMenuArrow.displayName = ARROW_NAME;
var SUB_NAME = "ContextMenuSub";
var ContextMenuSub = (props) => {
	const { __scopeContextMenu, children, onOpenChange, open: openProp, defaultOpen } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	const [open, setOpen] = useControllableState({
		prop: openProp,
		defaultProp: defaultOpen ?? false,
		onChange: onOpenChange,
		caller: SUB_NAME
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sub, {
		...menuScope,
		open,
		onOpenChange: setOpen,
		children
	});
};
ContextMenuSub.displayName = SUB_NAME;
var SUB_TRIGGER_NAME = "ContextMenuSubTrigger";
var ContextMenuSubTrigger = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...triggerItemProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubTrigger, {
		...menuScope,
		...triggerItemProps,
		ref: forwardedRef
	});
});
ContextMenuSubTrigger.displayName = SUB_TRIGGER_NAME;
var SUB_CONTENT_NAME = "ContextMenuSubContent";
var ContextMenuSubContent = import_react.forwardRef((props, forwardedRef) => {
	const { __scopeContextMenu, ...subContentProps } = props;
	const menuScope = useMenuScope(__scopeContextMenu);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SubContent, {
		...menuScope,
		...subContentProps,
		ref: forwardedRef,
		style: {
			...props.style,
			"--radix-context-menu-content-transform-origin": "var(--radix-popper-transform-origin)",
			"--radix-context-menu-content-available-width": "var(--radix-popper-available-width)",
			"--radix-context-menu-content-available-height": "var(--radix-popper-available-height)",
			"--radix-context-menu-trigger-width": "var(--radix-popper-anchor-width)",
			"--radix-context-menu-trigger-height": "var(--radix-popper-anchor-height)"
		}
	});
});
ContextMenuSubContent.displayName = SUB_CONTENT_NAME;
function whenTouchOrPen(handler) {
	return (event) => event.pointerType !== "mouse" ? handler(event) : void 0;
}
var Root2 = ContextMenu$1;
var Trigger = ContextMenuTrigger$1;
var Portal2 = ContextMenuPortal;
var Content2 = ContextMenuContent$1;
var Item2 = ContextMenuItem$1;
var Separator2 = ContextMenuSeparator$1;
//#endregion
//#region src/renderer/src/components/ui/context-menu.tsx
var ContextMenu = Root2;
var ContextMenuTrigger = Trigger;
function ContextMenuContent({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Portal2, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Content2, {
		className: cn("ui-context-menu z-50 min-w-36 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl", className),
		...props
	}) });
}
function ContextMenuItem({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Item2, {
		className: cn("ui-context-menu__item flex min-h-8 cursor-default select-none items-center gap-2 rounded-sm px-2 text-xs outline-none", "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45", className),
		...props
	});
}
function ContextMenuSeparator({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Separator2, {
		className: cn("my-1 h-px bg-border", className),
		...props
	});
}
//#endregion
export { ContextMenuTrigger as a, ContextMenuSeparator as i, ContextMenuContent as n, ContextMenuItem as r, ContextMenu as t };
