import { F as createSlot, L as require_jsx_runtime, M as cn, R as require_react_dom, V as __toESM, c as defaultMouseBatteryLightingPolicy, z as require_react } from "./demo-api-Ce3WgRJZ.js";
import { n as TooltipContent, r as TooltipTrigger, t as Tooltip } from "./tooltip-Dzg1fQmA.js";
import { v as Pencil } from "./dist-QFVzjJjP.js";
import { Ct as Trash2, Ft as Info, Ht as ChevronRight, I as Input, Ot as Plus, R as useSystemStore, Tt as Search, Ut as ChevronDown, Wt as Check, _ as Overlay, dt as SelectItem, ft as SelectTrigger, h as Content, j as Slider, lt as Select, pt as SelectValue, st as Button, ut as SelectContent, v as Portal, y as Root, z as Switch } from "./index-Cqk9uQ3G.js";
import { n as PopoverContent, r as PopoverTrigger, t as Popover } from "./popover-lRMNz-1W.js";
import { a as ContextMenuTrigger, i as ContextMenuSeparator, n as ContextMenuContent, r as ContextMenuItem, t as ContextMenu } from "./context-menu-B-i_KTVb.js";
import { n as ToggleGroupItem, t as ToggleGroup } from "./toggle-group-Bj4P2x-X.js";
import { t as ColorPicker } from "./ColorPicker-Bay1fMqD.js";
import { t as DeviceRender } from "./devices-CGuj63T5.js";
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/dist/chunk-NZJY6EH4.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var U = 1;
var Y$1 = .9;
var H = .8;
var J = .17;
var p = .1;
var u = .999;
var $ = .9999;
var k$1 = .99;
var m = /[\\\/_+.#"@\[\(\{&]/;
var B$1 = /[\\\/_+.#"@\[\(\{&]/g;
var K$1 = /[\s-]/;
var X = /[\s-]/g;
function G(_, C, h, P, A, f, O) {
	if (f === C.length) return A === _.length ? U : k$1;
	var T = `${A},${f}`;
	if (O[T] !== void 0) return O[T];
	for (var L = P.charAt(f), c = h.indexOf(L, A), S = 0, E, N, R, M; c >= 0;) E = G(_, C, h, P, c + 1, f + 1, O), E > S && (c === A ? E *= U : m.test(_.charAt(c - 1)) ? (E *= H, R = _.slice(A, c - 1).match(B$1), R && A > 0 && (E *= Math.pow(u, R.length))) : K$1.test(_.charAt(c - 1)) ? (E *= Y$1, M = _.slice(A, c - 1).match(X), M && A > 0 && (E *= Math.pow(u, M.length))) : (E *= J, A > 0 && (E *= Math.pow(u, c - A))), _.charAt(c) !== C.charAt(f) && (E *= $)), (E < p && h.charAt(c - 1) === P.charAt(f + 1) || P.charAt(f + 1) === P.charAt(f) && h.charAt(c - 1) !== P.charAt(f)) && (N = G(_, C, h, P, c + 1, f + 2, O), N * p > E && (E = N * p)), E > S && (S = E), c = h.indexOf(L, c + 1);
	return O[T] = S, S;
}
function D(_) {
	return _.toLowerCase().replace(X, " ");
}
function W(_, C, h) {
	return _ = h && h.length > 0 ? `${_ + " " + h.join(" ")}` : _, G(_, C, D(_), D(C), 0, 0, {});
}
//#endregion
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/node_modules/@radix-ui/react-primitive/dist/index.mjs
var import_react_dom = /* @__PURE__ */ __toESM(require_react_dom(), 1);
var import_jsx_runtime = require_jsx_runtime();
var __defProp$2 = Object.defineProperty;
var __name$2 = (target, value) => __defProp$2(target, "name", {
	value,
	configurable: true
});
var Primitive = [
	"a",
	"button",
	"div",
	"form",
	"h2",
	"h3",
	"img",
	"input",
	"label",
	"li",
	"nav",
	"ol",
	"p",
	"select",
	"span",
	"svg",
	"ul"
].reduce((primitive, node) => {
	const Slot = createSlot(`Primitive.${node}`);
	const Node = import_react.forwardRef((props, forwardedRef) => {
		const { asChild, ...primitiveProps } = props;
		const Comp = asChild ? Slot : node;
		if (typeof window !== "undefined") window[Symbol.for("radix-ui")] = true;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Comp, {
			...primitiveProps,
			ref: forwardedRef
		});
	});
	Node.displayName = `Primitive.${node}`;
	return {
		...primitive,
		[node]: Node
	};
}, {});
function dispatchDiscreteCustomEvent(target, event) {
	if (target) import_react_dom.flushSync(() => target.dispatchEvent(event));
}
__name$2(dispatchDiscreteCustomEvent, "dispatchDiscreteCustomEvent");
//#endregion
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/node_modules/@radix-ui/react-id/node_modules/@radix-ui/react-use-layout-effect/dist/index.mjs
var useLayoutEffect2 = globalThis?.document ? import_react.useLayoutEffect : () => {};
//#endregion
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/node_modules/@radix-ui/react-id/dist/index.mjs
var __defProp$1 = Object.defineProperty;
var __name$1 = (target, value) => __defProp$1(target, "name", {
	value,
	configurable: true
});
var useReactId = import_react[" useId ".trim().toString()] || (() => void 0);
var count = 0;
function useId(deterministicId) {
	const [id, setId] = import_react.useState(useReactId());
	useLayoutEffect2(() => {
		if (!deterministicId) setId((reactId) => reactId ?? String(count++));
	}, [deterministicId]);
	return deterministicId || (id ? `radix-${id}` : "");
}
__name$1(useId, "useId");
//#endregion
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", {
	value,
	configurable: true
});
function setRef(ref, value) {
	if (typeof ref === "function") return ref(value);
	else if (ref !== null && ref !== void 0) ref.current = value;
}
__name(setRef, "setRef");
function composeRefs(...refs) {
	return (node) => {
		let hasCleanup = false;
		const cleanups = refs.map((ref) => {
			const cleanup = setRef(ref, node);
			if (!hasCleanup && typeof cleanup == "function") hasCleanup = true;
			return cleanup;
		});
		if (hasCleanup) return () => {
			for (let i = 0; i < cleanups.length; i++) {
				const cleanup = cleanups[i];
				if (typeof cleanup == "function") cleanup();
				else setRef(refs[i], null);
			}
		};
	};
}
__name(composeRefs, "composeRefs");
function useComposedRefs(...refs) {
	return import_react.useCallback(composeRefs(...refs), refs);
}
__name(useComposedRefs, "useComposedRefs");
//#endregion
//#region node_modules/.bun/cmdk@1.1.1+f24ef18e65357769/node_modules/cmdk/dist/index.mjs
var N = "[cmdk-group=\"\"]";
var Y = "[cmdk-group-items=\"\"]";
var be = "[cmdk-group-heading=\"\"]";
var le = "[cmdk-item=\"\"]";
var ce = `${le}:not([aria-disabled="true"])`;
var Z = "cmdk-item-select";
var T = "data-value";
var Re = (r, o, n) => W(r, o, n);
var ue = import_react.createContext(void 0);
var K = () => import_react.useContext(ue);
var de = import_react.createContext(void 0);
var ee = () => import_react.useContext(de);
var fe = import_react.createContext(void 0);
var me = import_react.forwardRef((r, o) => {
	let n = L(() => {
		var e, a;
		return {
			search: "",
			value: (a = (e = r.value) != null ? e : r.defaultValue) != null ? a : "",
			selectedItemId: void 0,
			filtered: {
				count: 0,
				items: /* @__PURE__ */ new Map(),
				groups: /* @__PURE__ */ new Set()
			}
		};
	}), u = L(() => /* @__PURE__ */ new Set()), c = L(() => /* @__PURE__ */ new Map()), d = L(() => /* @__PURE__ */ new Map()), f = L(() => /* @__PURE__ */ new Set()), p = pe(r), { label: b, children: m, value: R, onValueChange: x, filter: C, shouldFilter: S, loop: A, disablePointerSelection: ge = !1, vimBindings: j = !0, ...O } = r, $ = useId(), q = useId(), _ = useId(), I = import_react.useRef(null), v = ke();
	k(() => {
		if (R !== void 0) {
			let e = R.trim();
			n.current.value = e, E.emit();
		}
	}, [R]), k(() => {
		v(6, ne);
	}, []);
	let E = import_react.useMemo(() => ({
		subscribe: (e) => (f.current.add(e), () => f.current.delete(e)),
		snapshot: () => n.current,
		setState: (e, a, s) => {
			var i, l, g, y;
			if (!Object.is(n.current[e], a)) {
				if (n.current[e] = a, e === "search") J(), z(), v(1, W);
				else if (e === "value") {
					if (document.activeElement.hasAttribute("cmdk-input") || document.activeElement.hasAttribute("cmdk-root")) {
						let h = document.getElementById(_);
						h ? h.focus() : (i = document.getElementById($)) == null || i.focus();
					}
					if (v(7, () => {
						var h;
						n.current.selectedItemId = (h = M()) == null ? void 0 : h.id, E.emit();
					}), s || v(5, ne), ((l = p.current) == null ? void 0 : l.value) !== void 0) {
						let h = a != null ? a : "";
						(y = (g = p.current).onValueChange) == null || y.call(g, h);
						return;
					}
				}
				E.emit();
			}
		},
		emit: () => {
			f.current.forEach((e) => e());
		}
	}), []), U = import_react.useMemo(() => ({
		value: (e, a, s) => {
			var i;
			a !== ((i = d.current.get(e)) == null ? void 0 : i.value) && (d.current.set(e, {
				value: a,
				keywords: s
			}), n.current.filtered.items.set(e, te(a, s)), v(2, () => {
				z(), E.emit();
			}));
		},
		item: (e, a) => (u.current.add(e), a && (c.current.has(a) ? c.current.get(a).add(e) : c.current.set(a, /* @__PURE__ */ new Set([e]))), v(3, () => {
			J(), z(), n.current.value || W(), E.emit();
		}), () => {
			d.current.delete(e), u.current.delete(e), n.current.filtered.items.delete(e);
			let s = M();
			v(4, () => {
				J(), (s == null ? void 0 : s.getAttribute("id")) === e && W(), E.emit();
			});
		}),
		group: (e) => (c.current.has(e) || c.current.set(e, /* @__PURE__ */ new Set()), () => {
			d.current.delete(e), c.current.delete(e);
		}),
		filter: () => p.current.shouldFilter,
		label: b || r["aria-label"],
		getDisablePointerSelection: () => p.current.disablePointerSelection,
		listId: $,
		inputId: _,
		labelId: q,
		listInnerRef: I
	}), []);
	function te(e, a) {
		var i, l;
		let s = (l = (i = p.current) == null ? void 0 : i.filter) != null ? l : Re;
		return e ? s(e, n.current.search, a) : 0;
	}
	function z() {
		if (!n.current.search || p.current.shouldFilter === !1) return;
		let e = n.current.filtered.items, a = [];
		n.current.filtered.groups.forEach((i) => {
			let l = c.current.get(i), g = 0;
			l.forEach((y) => {
				let h = e.get(y);
				g = Math.max(h, g);
			}), a.push([i, g]);
		});
		let s = I.current;
		V().sort((i, l) => {
			var h, F;
			let g = i.getAttribute("id"), y = l.getAttribute("id");
			return ((h = e.get(y)) != null ? h : 0) - ((F = e.get(g)) != null ? F : 0);
		}).forEach((i) => {
			let l = i.closest(Y);
			l ? l.appendChild(i.parentElement === l ? i : i.closest(`${Y} > *`)) : s.appendChild(i.parentElement === s ? i : i.closest(`${Y} > *`));
		}), a.sort((i, l) => l[1] - i[1]).forEach((i) => {
			var g;
			let l = (g = I.current) == null ? void 0 : g.querySelector(`${N}[${T}="${encodeURIComponent(i[0])}"]`);
			l?.parentElement.appendChild(l);
		});
	}
	function W() {
		let e = V().find((s) => s.getAttribute("aria-disabled") !== "true"), a = e == null ? void 0 : e.getAttribute(T);
		E.setState("value", a || void 0);
	}
	function J() {
		var a, s, i, l;
		if (!n.current.search || p.current.shouldFilter === !1) {
			n.current.filtered.count = u.current.size;
			return;
		}
		n.current.filtered.groups = /* @__PURE__ */ new Set();
		let e = 0;
		for (let g of u.current) {
			let F = te((s = (a = d.current.get(g)) == null ? void 0 : a.value) != null ? s : "", (l = (i = d.current.get(g)) == null ? void 0 : i.keywords) != null ? l : []);
			n.current.filtered.items.set(g, F), F > 0 && e++;
		}
		for (let [g, y] of c.current) for (let h of y) if (n.current.filtered.items.get(h) > 0) {
			n.current.filtered.groups.add(g);
			break;
		}
		n.current.filtered.count = e;
	}
	function ne() {
		var a, s, i;
		let e = M();
		e && (((a = e.parentElement) == null ? void 0 : a.firstChild) === e && ((i = (s = e.closest(N)) == null ? void 0 : s.querySelector(be)) == null || i.scrollIntoView({ block: "nearest" })), e.scrollIntoView({ block: "nearest" }));
	}
	function M() {
		var e;
		return (e = I.current) == null ? void 0 : e.querySelector(`${le}[aria-selected="true"]`);
	}
	function V() {
		var e;
		return Array.from(((e = I.current) == null ? void 0 : e.querySelectorAll(ce)) || []);
	}
	function X(e) {
		let s = V()[e];
		s && E.setState("value", s.getAttribute(T));
	}
	function Q(e) {
		var g;
		let a = M(), s = V(), i = s.findIndex((y) => y === a), l = s[i + e];
		(g = p.current) != null && g.loop && (l = i + e < 0 ? s[s.length - 1] : i + e === s.length ? s[0] : s[i + e]), l && E.setState("value", l.getAttribute(T));
	}
	function re(e) {
		let a = M(), s = a == null ? void 0 : a.closest(N), i;
		for (; s && !i;) s = e > 0 ? we(s, N) : De(s, N), i = s == null ? void 0 : s.querySelector(ce);
		i ? E.setState("value", i.getAttribute(T)) : Q(e);
	}
	let oe = () => X(V().length - 1), ie = (e) => {
		e.preventDefault(), e.metaKey ? oe() : e.altKey ? re(1) : Q(1);
	}, se = (e) => {
		e.preventDefault(), e.metaKey ? X(0) : e.altKey ? re(-1) : Q(-1);
	};
	return import_react.createElement(Primitive.div, {
		ref: o,
		tabIndex: -1,
		...O,
		"cmdk-root": "",
		onKeyDown: (e) => {
			var s;
			(s = O.onKeyDown) == null || s.call(O, e);
			let a = e.nativeEvent.isComposing || e.keyCode === 229;
			if (!(e.defaultPrevented || a)) switch (e.key) {
				case "n":
				case "j":
					j && e.ctrlKey && ie(e);
					break;
				case "ArrowDown":
					ie(e);
					break;
				case "p":
				case "k":
					j && e.ctrlKey && se(e);
					break;
				case "ArrowUp":
					se(e);
					break;
				case "Home":
					e.preventDefault(), X(0);
					break;
				case "End":
					e.preventDefault(), oe();
					break;
				case "Enter": {
					e.preventDefault();
					let i = M();
					if (i) {
						let l = new Event(Z);
						i.dispatchEvent(l);
					}
				}
			}
		}
	}, import_react.createElement("label", {
		"cmdk-label": "",
		htmlFor: U.inputId,
		id: U.labelId,
		style: Te
	}, b), B(r, (e) => import_react.createElement(de.Provider, { value: E }, import_react.createElement(ue.Provider, { value: U }, e))));
});
var he = import_react.forwardRef((r, o) => {
	var _, I;
	let n = useId(), u = import_react.useRef(null), c = import_react.useContext(fe), d = K(), f = pe(r), p = (I = (_ = f.current) == null ? void 0 : _.forceMount) != null ? I : c == null ? void 0 : c.forceMount;
	k(() => {
		if (!p) return d.item(n, c == null ? void 0 : c.id);
	}, [p]);
	let b = ve(n, u, [
		r.value,
		r.children,
		u
	], r.keywords), m = ee(), R = P((v) => v.value && v.value === b.current), x = P((v) => p || d.filter() === !1 ? !0 : v.search ? v.filtered.items.get(n) > 0 : !0);
	import_react.useEffect(() => {
		let v = u.current;
		if (!(!v || r.disabled)) return v.addEventListener(Z, C), () => v.removeEventListener(Z, C);
	}, [
		x,
		r.onSelect,
		r.disabled
	]);
	function C() {
		var v, E;
		S(), (E = (v = f.current).onSelect) == null || E.call(v, b.current);
	}
	function S() {
		m.setState("value", b.current, !0);
	}
	if (!x) return null;
	let { disabled: A, value: ge, onSelect: j, forceMount: O, keywords: $, ...q } = r;
	return import_react.createElement(Primitive.div, {
		ref: composeRefs(u, o),
		...q,
		id: n,
		"cmdk-item": "",
		role: "option",
		"aria-disabled": !!A,
		"aria-selected": !!R,
		"data-disabled": !!A,
		"data-selected": !!R,
		onPointerMove: A || d.getDisablePointerSelection() ? void 0 : S,
		onClick: A ? void 0 : C
	}, r.children);
});
var Ee = import_react.forwardRef((r, o) => {
	let { heading: n, children: u, forceMount: c, ...d } = r, f = useId(), p = import_react.useRef(null), b = import_react.useRef(null), m = useId(), R = K(), x = P((S) => c || R.filter() === !1 ? !0 : S.search ? S.filtered.groups.has(f) : !0);
	k(() => R.group(f), []), ve(f, p, [
		r.value,
		r.heading,
		b
	]);
	let C = import_react.useMemo(() => ({
		id: f,
		forceMount: c
	}), [c]);
	return import_react.createElement(Primitive.div, {
		ref: composeRefs(p, o),
		...d,
		"cmdk-group": "",
		role: "presentation",
		hidden: x ? void 0 : !0
	}, n && import_react.createElement("div", {
		ref: b,
		"cmdk-group-heading": "",
		"aria-hidden": !0,
		id: m
	}, n), B(r, (S) => import_react.createElement("div", {
		"cmdk-group-items": "",
		role: "group",
		"aria-labelledby": n ? m : void 0
	}, import_react.createElement(fe.Provider, { value: C }, S))));
});
var ye = import_react.forwardRef((r, o) => {
	let { alwaysRender: n, ...u } = r, c = import_react.useRef(null), d = P((f) => !f.search);
	return !n && !d ? null : import_react.createElement(Primitive.div, {
		ref: composeRefs(c, o),
		...u,
		"cmdk-separator": "",
		role: "separator"
	});
});
var Se = import_react.forwardRef((r, o) => {
	let { onValueChange: n, ...u } = r, c = r.value != null, d = ee(), f = P((m) => m.search), p = P((m) => m.selectedItemId), b = K();
	return import_react.useEffect(() => {
		r.value != null && d.setState("search", r.value);
	}, [r.value]), import_react.createElement(Primitive.input, {
		ref: o,
		...u,
		"cmdk-input": "",
		autoComplete: "off",
		autoCorrect: "off",
		spellCheck: !1,
		"aria-autocomplete": "list",
		role: "combobox",
		"aria-expanded": !0,
		"aria-controls": b.listId,
		"aria-labelledby": b.labelId,
		"aria-activedescendant": p,
		id: b.inputId,
		type: "text",
		value: c ? r.value : f,
		onChange: (m) => {
			c || d.setState("search", m.target.value), n?.(m.target.value);
		}
	});
});
var Ce = import_react.forwardRef((r, o) => {
	let { children: n, label: u = "Suggestions", ...c } = r, d = import_react.useRef(null), f = import_react.useRef(null), p = P((m) => m.selectedItemId), b = K();
	return import_react.useEffect(() => {
		if (f.current && d.current) {
			let m = f.current, R = d.current, x, C = new ResizeObserver(() => {
				x = requestAnimationFrame(() => {
					let S = m.offsetHeight;
					R.style.setProperty("--cmdk-list-height", S.toFixed(1) + "px");
				});
			});
			return C.observe(m), () => {
				cancelAnimationFrame(x), C.unobserve(m);
			};
		}
	}, []), import_react.createElement(Primitive.div, {
		ref: composeRefs(d, o),
		...c,
		"cmdk-list": "",
		role: "listbox",
		tabIndex: -1,
		"aria-activedescendant": p,
		"aria-label": u,
		id: b.listId
	}, B(r, (m) => import_react.createElement("div", {
		ref: composeRefs(f, b.listInnerRef),
		"cmdk-list-sizer": ""
	}, m)));
});
var xe = import_react.forwardRef((r, o) => {
	let { open: n, onOpenChange: u, overlayClassName: c, contentClassName: d, container: f, ...p } = r;
	return import_react.createElement(Root, {
		open: n,
		onOpenChange: u
	}, import_react.createElement(Portal, { container: f }, import_react.createElement(Overlay, {
		"cmdk-overlay": "",
		className: c
	}), import_react.createElement(Content, {
		"aria-label": r.label,
		"cmdk-dialog": "",
		className: d
	}, import_react.createElement(me, {
		ref: o,
		...p
	}))));
});
var Ie = import_react.forwardRef((r, o) => P((u) => u.filtered.count === 0) ? import_react.createElement(Primitive.div, {
	ref: o,
	...r,
	"cmdk-empty": "",
	role: "presentation"
}) : null);
var Pe = import_react.forwardRef((r, o) => {
	let { progress: n, children: u, label: c = "Loading...", ...d } = r;
	return import_react.createElement(Primitive.div, {
		ref: o,
		...d,
		"cmdk-loading": "",
		role: "progressbar",
		"aria-valuenow": n,
		"aria-valuemin": 0,
		"aria-valuemax": 100,
		"aria-label": c
	}, B(r, (f) => import_react.createElement("div", { "aria-hidden": !0 }, f)));
});
var _e = Object.assign(me, {
	List: Ce,
	Item: he,
	Input: Se,
	Group: Ee,
	Separator: ye,
	Dialog: xe,
	Empty: Ie,
	Loading: Pe
});
function we(r, o) {
	let n = r.nextElementSibling;
	for (; n;) {
		if (n.matches(o)) return n;
		n = n.nextElementSibling;
	}
}
function De(r, o) {
	let n = r.previousElementSibling;
	for (; n;) {
		if (n.matches(o)) return n;
		n = n.previousElementSibling;
	}
}
function pe(r) {
	let o = import_react.useRef(r);
	return k(() => {
		o.current = r;
	}), o;
}
var k = typeof window == "undefined" ? import_react.useEffect : import_react.useLayoutEffect;
function L(r) {
	let o = import_react.useRef();
	return o.current === void 0 && (o.current = r()), o;
}
function P(r) {
	let o = ee(), n = () => r(o.snapshot());
	return import_react.useSyncExternalStore(o.subscribe, n, n);
}
function ve(r, o, n, u = []) {
	let c = import_react.useRef(), d = K();
	return k(() => {
		var b;
		let f = (() => {
			var m;
			for (let R of n) {
				if (typeof R == "string") return R.trim();
				if (typeof R == "object" && "current" in R) return R.current ? (m = R.current.textContent) == null ? void 0 : m.trim() : c.current;
			}
		})(), p = u.map((m) => m.trim());
		d.value(r, f, p), (b = o.current) == null || b.setAttribute(T, f), c.current = f;
	}), c;
}
var ke = () => {
	let [r, o] = import_react.useState(), n = L(() => /* @__PURE__ */ new Map());
	return k(() => {
		n.current.forEach((u) => u()), n.current = /* @__PURE__ */ new Map();
	}, [r]), (u, c) => {
		n.current.set(u, c), o({});
	};
};
function Me(r) {
	let o = r.type;
	return typeof o == "function" ? o(r.props) : "render" in o ? o.render(r.props) : r;
}
function B({ asChild: r, children: o }, n) {
	return r && import_react.isValidElement(o) ? import_react.cloneElement(Me(o), { ref: o.ref }, n(o.props.children)) : n(o);
}
var Te = {
	position: "absolute",
	width: "1px",
	height: "1px",
	padding: "0",
	margin: "-1px",
	overflow: "hidden",
	clip: "rect(0, 0, 0, 0)",
	whiteSpace: "nowrap",
	borderWidth: "0"
};
//#endregion
//#region src/renderer/src/components/ui/command.tsx
function Command({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e, {
		className: cn("ui-command flex w-full flex-col overflow-hidden", className),
		...props
	});
}
function CommandInput({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "ui-command__input-wrap",
		"cmdk-input-wrapper": "",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Search, {
			"aria-hidden": true,
			className: "size-3.5 shrink-0"
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Input, {
			className: cn("ui-command__input h-9 w-full bg-transparent outline-none", className),
			...props
		})]
	});
}
function CommandList({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.List, {
		className: cn("ui-command__list max-h-72 overflow-y-auto overflow-x-hidden", className),
		...props
	});
}
function CommandEmpty({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Empty, {
		className: cn("ui-command__empty py-6 text-center text-xs", className),
		...props
	});
}
function CommandGroup({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Group, {
		className: cn("ui-command__group", className),
		...props
	});
}
function CommandItem({ className, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(_e.Item, {
		className: cn("ui-command__item relative flex min-h-8 cursor-default select-none items-center rounded-sm px-2 text-xs outline-none", "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45", className),
		...props
	});
}
//#endregion
//#region src/renderer/src/components/device-controls/ButtonAssignmentPicker.tsx
function ButtonAssignmentPicker({ label, currentAction, availableActions, onChange, onOpenChange, trigger, disabled, unavailableReason, unavailableAction }) {
	const [open, setOpen] = (0, import_react.useState)(false);
	const groups = (0, import_react.useMemo)(() => groupActions(availableActions), [availableActions]);
	const searchable = availableActions.length >= 7;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
		open,
		onOpenChange: (next) => {
			setOpen(next);
			onOpenChange?.(next);
		},
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: trigger
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
			className: "assignment-picker",
			align: "center",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "assignment-picker__heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: currentAction.label })]
				}),
				disabled ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "assignment-picker__reason",
					role: "status",
					children: unavailableReason ?? "Button assignments are unavailable for this connection."
				}), unavailableAction ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "px-3 pb-3",
					children: unavailableAction
				}) : null] }) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Command, { children: [searchable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandInput, {
					placeholder: "Search supported actions…",
					"aria-label": `Search assignments for ${label}`
				}) : null, /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CommandList, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandEmpty, { children: "No matching supported actions." }), groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CommandGroup, {
					heading: group.label,
					children: group.actions.map((action) => {
						const selected = action.id === currentAction.id;
						const selectable = !disabled && action.selectable !== false;
						return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(CommandItem, {
							value: `${action.label} ${action.searchTerms.join(" ")}`,
							keywords: action.searchTerms,
							disabled: !selectable,
							className: cn(selected && "is-selected"),
							onSelect: () => {
								if (!selectable) return;
								onChange(action);
								setOpen(false);
								onOpenChange?.(false);
							},
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: action.label }), selected ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Check, {
								"aria-hidden": true,
								className: "ml-auto size-3.5"
							}) : null]
						}, action.id);
					})
				}, group.id))] })] })
			]
		})]
	});
}
function groupActions(actions) {
	return [
		{
			id: "mouse",
			label: "Mouse",
			match: (action) => action.category === "mouse" && !action.id.startsWith("mouse.dpi-")
		},
		{
			id: "device",
			label: "Device",
			match: (action) => action.id.startsWith("mouse.dpi-")
		},
		{
			id: "system",
			label: "Existing assignment",
			match: (action) => action.category === "system"
		}
	].map((definition) => ({
		...definition,
		actions: actions.filter(definition.match)
	})).filter((definition) => definition.actions.length > 0);
}
//#endregion
//#region src/renderer/src/components/device-controls/DeviceCallout.tsx
function DeviceCallout({ binding, currentAction, availableActions, disabled, unavailableReason, unavailableAction, active, onActiveChange, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ButtonAssignmentPicker, {
		buttonId: binding.buttonId,
		label: binding.hotspot.label,
		currentAction,
		availableActions,
		disabled,
		unavailableReason,
		unavailableAction,
		onChange,
		onOpenChange: onActiveChange,
		trigger: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "mouse-callout",
			"data-callout-id": binding.hotspot.id,
			"data-linked-active": active || void 0,
			style: { "--callout-y": `${binding.hotspot.position.y}%` },
			"aria-label": `${binding.hotspot.label}, assigned to ${currentAction.label}${disabled ? ", editing unavailable" : ""}`,
			title: disabled ? unavailableReason : void 0,
			onPointerEnter: () => onActiveChange?.(true),
			onPointerLeave: () => onActiveChange?.(false),
			onFocus: () => onActiveChange?.(true),
			onBlur: () => onActiveChange?.(false),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
				className: "mouse-callout__copy",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: "mouse-callout__label",
					children: binding.hotspot.label
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "mouse-callout__assignment",
					children: [currentAction.label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronDown, { "aria-hidden": true })]
				})]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "mouse-callout__line",
				"aria-hidden": true
			})]
		})
	});
}
//#endregion
//#region src/renderer/src/components/device-controls/DeviceHotspot.tsx
function DeviceHotspot({ hotspot, active, onActiveChange, onActivate }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		className: "device-hotspot",
		"data-hotspot-id": hotspot.id,
		"data-callout-side": hotspot.calloutSide,
		"data-linked-active": active || void 0,
		style: {
			"--hotspot-x": `${hotspot.position.x}%`,
			"--hotspot-y": `${hotspot.position.y}%`
		},
		"aria-label": `Configure ${hotspot.label}`,
		tabIndex: -1,
		onPointerEnter: () => onActiveChange?.(true),
		onPointerLeave: () => onActiveChange?.(false),
		onFocus: () => onActiveChange?.(true),
		onBlur: () => onActiveChange?.(false),
		onClick: onActivate,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "device-hotspot__leader" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "device-hotspot__dot" })]
	});
}
//#endregion
//#region src/renderer/src/components/device-controls/DpiControl.tsx
function DpiControl({ capability, reportRateControl, onChange, onStagesChange, onShiftChange }) {
	const [draft, setDraft] = (0, import_react.useState)(capability.activeDpi);
	const [draftText, setDraftText] = (0, import_react.useState)(formatDpi(capability.activeDpi));
	const draftIsValid = validDpi(capability, draft) && parseDpi(draftText) === draft;
	(0, import_react.useEffect)(() => {
		setDraft(capability.activeDpi);
		setDraftText(formatDpi(capability.activeDpi));
	}, [capability.activeDpi]);
	const setDraftValue = (value) => {
		setDraft(value);
		setDraftText(formatDpi(value));
	};
	const commitDraft = (value = draftText) => {
		const next = parseDpi(value);
		if (!validDpi(capability, next)) {
			setDraftValue(capability.activeDpi);
			return;
		}
		setDraftValue(next);
		if (next !== capability.activeDpi) onChange(next);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "dpi-control",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "control-heading dpi-control__heading",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					htmlFor: "active-mouse-dpi",
					children: "DPI"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "dpi-control__readout",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
							id: "active-mouse-dpi",
							className: "dpi-control__input",
							value: draftText,
							inputMode: "numeric",
							disabled: !capability.writable,
							"aria-invalid": !draftIsValid,
							"aria-describedby": "active-mouse-dpi-requirements",
							onFocus: (event) => event.currentTarget.select(),
							onChange: (event) => {
								const nextText = event.target.value.replace(/[^\d,]/g, "");
								const next = parseDpi(nextText);
								setDraftText(nextText);
								if (Number.isFinite(next)) setDraft(next);
							},
							onBlur: (event) => commitDraft(event.currentTarget.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") event.currentTarget.blur();
								if (event.key === "Escape") {
									setDraftValue(capability.activeDpi);
									event.currentTarget.blur();
								}
							}
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "DPI" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
							id: "active-mouse-dpi-requirements",
							className: "sr-only",
							children: [
								"Enter a value from ",
								capability.min,
								" to ",
								capability.max,
								" in steps of ",
								capability.step,
								"."
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "dpi-control__slider",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
						min: capability.min,
						max: capability.max,
						step: capability.step,
						value: [draft],
						disabled: !capability.writable,
						"aria-label": "Active DPI",
						"aria-valuetext": `${draft} DPI`,
						onValueChange: ([value]) => typeof value === "number" && setDraftValue(value),
						onValueCommit: ([value]) => typeof value === "number" && value !== capability.activeDpi && void onChange(value)
					})
				})
			}), !capability.writable && capability.unavailableReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: capability.unavailableReason }) : null] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "dpi-control__range",
				"aria-hidden": true,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: capability.min.toLocaleString() }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: capability.max.toLocaleString() })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "dpi-control__toolbar",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DpiPresetGroup, {
					capability,
					onSelect: (value) => {
						setDraftValue(value);
						onChange(value);
					},
					onChange,
					onStagesChange
				}), reportRateControl]
			}),
			capability.shiftDpi !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DpiShiftControl, {
				capability,
				onChange: onShiftChange
			}) : null
		]
	});
}
function DpiPresetGroup({ capability, onSelect, onChange, onStagesChange }) {
	const [editorOpen, setEditorOpen] = (0, import_react.useState)(false);
	const [editingStage, setEditingStage] = (0, import_react.useState)(null);
	const [editorValue, setEditorValue] = (0, import_react.useState)(nextStage(capability));
	const maxStages = capability.maxStages ?? 5;
	const openEditor = (stage) => {
		setEditingStage(stage);
		setEditorValue(stage ?? nextStage(capability));
		setEditorOpen(true);
	};
	const deleteStage = (stage) => {
		if (stage === capability.activeDpi || capability.stages.length <= 1) return;
		onStagesChange(capability.stages.filter((value) => value !== stage));
	};
	const saveStage = async () => {
		if (!validDpi(capability, editorValue)) return;
		if (editorValue !== editingStage && capability.stages.includes(editorValue)) return;
		const nextStages = editingStage === null ? [...capability.stages, editorValue] : capability.stages.map((stage) => stage === editingStage ? editorValue : stage);
		nextStages.sort((left, right) => left - right);
		await onStagesChange(nextStages);
		if (editingStage === capability.activeDpi && editorValue !== editingStage) await onChange(editorValue);
		setEditorOpen(false);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "dpi-presets",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "dpi-presets__label",
				children: "Presets"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
				type: "single",
				value: String(capability.activeDpi),
				disabled: !capability.writable,
				"aria-label": "DPI presets",
				onValueChange: (value) => value && void onSelect(Number(value)),
				children: capability.stages.map((stage) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenu, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroupItem, {
						value: String(stage),
						"aria-label": `${stage} DPI`,
						children: stage.toLocaleString()
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuContent, {
					"aria-label": `${stage} DPI preset actions`,
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuItem, {
							onSelect: () => openEditor(stage),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pencil, {
								"aria-hidden": true,
								className: "size-3.5"
							}), " Edit value"]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ContextMenuSeparator, {}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ContextMenuItem, {
							className: "text-destructive focus:text-destructive",
							disabled: stage === capability.activeDpi || capability.stages.length <= 1,
							onSelect: () => deleteStage(stage),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Trash2, {
								"aria-hidden": true,
								className: "size-3.5"
							}), " Delete preset"]
						})
					]
				})] }, stage))
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, {
				open: editorOpen,
				onOpenChange: setEditorOpen,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
						asChild: true,
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							type: "button",
							size: "icon",
							variant: "secondary",
							disabled: !capability.writable || capability.stages.length >= maxStages,
							className: "dpi-presets__add",
							"aria-label": "Create DPI preset",
							onClick: () => openEditor(null),
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Plus, {
								"aria-hidden": true,
								className: "size-3.5"
							})
						})
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: capability.stages.length >= maxStages ? `This mouse supports ${maxStages} DPI presets.` : "Create DPI preset" })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
					align: "start",
					className: "dpi-stage-editor",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "popover-heading",
							children: editingStage === null ? "Create DPI preset" : "Edit DPI preset"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "popover-description",
							children: [
								"Use ",
								capability.min.toLocaleString(),
								"–",
								capability.max.toLocaleString(),
								" DPI in ",
								capability.step,
								" DPI steps."
							]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "dpi-stage-editor__add-row",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
								type: "number",
								min: capability.min,
								max: capability.max,
								step: capability.step,
								value: editorValue,
								onChange: (event) => setEditorValue(Number(event.target.value)),
								onKeyDown: (event) => event.key === "Enter" && void saveStage(),
								"aria-label": editingStage === null ? "New DPI preset value" : "Edited DPI preset value"
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								type: "button",
								size: "sm",
								variant: "primary",
								disabled: !validDpi(capability, editorValue) || editorValue !== editingStage && capability.stages.includes(editorValue),
								onClick: () => void saveStage(),
								children: editingStage === null ? "Add" : "Save"
							})]
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "dpi-stage-editor__hint",
							children: "Right-click any preset to edit or delete it."
						})
					]
				})]
			})
		]
	});
}
function DpiShiftControl({ capability, onChange }) {
	const [value, setValue] = (0, import_react.useState)(capability.shiftDpi ?? capability.min);
	(0, import_react.useEffect)(() => setValue(capability.shiftDpi ?? capability.min), [capability.shiftDpi, capability.min]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "dpi-shift-control",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "DPI Shift" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Temporarily lowers sensitivity while held." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
				type: "button",
				size: "sm",
				variant: "ghost",
				disabled: !capability.writable,
				className: "dpi-shift-control__value",
				children: [(capability.shiftDpi ?? capability.min).toLocaleString(), " DPI"]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
			align: "end",
			className: "w-64",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "popover-heading",
					children: "DPI Shift"
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "popover-description",
					children: "Sensitivity used while the assigned DPI Shift button is held."
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "dpi-shift-control__editor",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
						type: "number",
						min: capability.min,
						max: capability.max,
						step: capability.step,
						value,
						onChange: (event) => setValue(Number(event.target.value)),
						"aria-label": "DPI Shift value"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						type: "button",
						size: "sm",
						variant: "primary",
						disabled: !validDpi(capability, value),
						onClick: () => void onChange(value),
						children: "Set"
					})]
				})
			]
		})] })]
	});
}
function nextStage(capability) {
	const candidate = Math.min(capability.max, capability.activeDpi + Math.max(400, capability.step));
	return capability.min + Math.round((candidate - capability.min) / capability.step) * capability.step;
}
function validDpi(capability, value) {
	return Number.isInteger(value) && value >= capability.min && value <= capability.max && (value - capability.min) % capability.step === 0;
}
function parseDpi(value) {
	return Number(value.replaceAll(",", ""));
}
function formatDpi(value) {
	return Number.isFinite(value) ? value.toLocaleString() : "";
}
//#endregion
//#region src/renderer/src/components/device-controls/LightingControl.tsx
function LightingControl({ capability, onEnabledChange, onColorPreview, onColorChange, onBrightnessChange, onEffectChange, onSpeedChange, onDirectionChange, onZoneColorChange }) {
	const [color, setColor] = (0, import_react.useState)(capability.color ?? "#ff1744");
	const [brightness, setBrightness] = (0, import_react.useState)(capability.brightness ?? 100);
	const [speed, setSpeed] = (0, import_react.useState)(capability.speed ?? 50);
	const activeEffect = capability.availableEffects.find((effect) => effect.id === capability.activeEffectId);
	const controls = new Set(activeEffect?.controls);
	const hasExplicitControls = activeEffect?.controls !== void 0;
	const colorVisible = capability.color !== void 0 && (!hasExplicitControls || controls.has("color"));
	const brightnessVisible = capability.brightness !== void 0 && (!hasExplicitControls || controls.has("brightness"));
	const speedVisible = capability.speed !== void 0 && (!hasExplicitControls || controls.has("speed"));
	const directionVisible = capability.direction !== void 0 && (capability.availableDirections?.length ?? 0) > 0 && (!hasExplicitControls || controls.has("direction"));
	const zonesVisible = (capability.zones?.length ?? 0) > 0 && (!hasExplicitControls || controls.has("zones"));
	const stateUnknown = capability.state === "unknown";
	const controlsDisabled = stateUnknown || !capability.enabled || !capability.writable;
	const selectedEffectId = stateUnknown ? "" : capability.enabled ? capability.activeEffectId : "off";
	(0, import_react.useEffect)(() => {
		setColor(capability.color ?? "#ff1744");
		onColorPreview?.(null);
	}, [capability.color]);
	(0, import_react.useEffect)(() => setBrightness(capability.brightness ?? 100), [capability.brightness]);
	(0, import_react.useEffect)(() => setSpeed(capability.speed ?? 50), [capability.speed]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "lighting-editor",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "lighting-editor__heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Lighting" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: lightingModeCopy(capability) })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "lighting-editor__heading-actions",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
					className: "lighting-editor__status",
					"data-state": stateUnknown ? "unknown" : capability.enabled ? capability.state ?? "unknown" : "off",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("i", { "aria-hidden": true }),
						" ",
						lightingStateLabel(capability)
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: stateUnknown ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						variant: "secondary",
						size: "sm",
						disabled: !capability.writable,
						onClick: () => onEnabledChange(false),
						"aria-label": "Turn mouse lighting off",
						children: "Turn off"
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
						checked: capability.enabled,
						disabled: !capability.writable,
						onCheckedChange: onEnabledChange,
						"aria-label": "Mouse lighting"
					}) })
				}), !capability.writable && capability.unavailableReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: capability.unavailableReason }) : null] })]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "lighting-editor__body",
			"data-disabled": !capability.writable || void 0,
			"data-lighting-off": !stateUnknown && !capability.enabled || void 0,
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "lighting-editor__primary",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlField, {
						label: "Effect",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
							value: selectedEffectId,
							disabled: !capability.writable,
							onValueChange: (effectId) => effectId === "off" ? onEnabledChange(false) : onEffectChange(effectId),
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
								"aria-label": "Lighting effect",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, { placeholder: "Choose an effect" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(SelectContent, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: "off",
								children: "Off"
							}), capability.availableEffects.filter((effect) => effect.id !== "off").map((effect) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
								value: effect.id,
								children: effect.label
							}, effect.id))] })]
						})
					}), colorVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlField, {
						label: "Color",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
							asChild: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "lighting-color-trigger",
								disabled: controlsDisabled || !capability.colorWritable,
								"aria-label": `Lighting color ${color}`,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									style: { backgroundColor: color },
									"aria-hidden": true
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: color.toUpperCase() })]
							})
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
							align: "start",
							className: "lighting-color-popover",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
									className: "popover-heading",
									children: "Lighting color"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "popover-description",
									children: "Preview on the mouse, then apply the lighting color."
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorPicker, {
									value: color,
									onChange: (next) => {
										setColor(next);
										onColorPreview?.(next);
									},
									onCommit: onColorChange
								})
							]
						})] })
					}) : null]
				}),
				brightnessVisible || speedVisible || directionVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "lighting-editor__parameters",
					children: [
						brightnessVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlField, {
							label: "Brightness",
							value: `${brightness}%`,
							wide: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
								min: 0,
								max: 100,
								step: 1,
								value: [brightness],
								disabled: controlsDisabled || !capability.brightnessWritable,
								"aria-label": "Lighting brightness",
								"aria-valuetext": `${brightness}%`,
								onValueChange: ([value]) => typeof value === "number" && setBrightness(value),
								onValueCommit: ([value]) => typeof value === "number" && onBrightnessChange(value)
							})
						}) : null,
						speedVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlField, {
							label: "Speed",
							value: `${speed}%`,
							wide: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Slider, {
								min: 1,
								max: 100,
								step: 1,
								value: [speed],
								disabled: controlsDisabled || !capability.speedWritable,
								"aria-label": "Lighting effect speed",
								"aria-valuetext": `${speed}%`,
								onValueChange: ([value]) => typeof value === "number" && setSpeed(value),
								onValueCommit: ([value]) => typeof value === "number" && onSpeedChange(value)
							})
						}) : null,
						directionVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ControlField, {
							label: "Direction",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Select, {
								value: capability.direction,
								disabled: controlsDisabled || !capability.directionWritable,
								onValueChange: (value) => onDirectionChange(value),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectTrigger, {
									"aria-label": "Lighting effect direction",
									children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectValue, {})
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectContent, { children: capability.availableDirections?.map((direction) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SelectItem, {
									value: direction,
									children: directionLabel(direction)
								}, direction)) })]
							})
						}) : null
					]
				}) : null,
				zonesVisible ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
					asChild: true,
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "lighting-zones-trigger",
						disabled: controlsDisabled,
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: ["Device zones ", /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("small", { children: [capability.zones?.length, " zones"] })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
							"aria-hidden": true,
							className: "size-3.5"
						})]
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
					align: "end",
					className: "lighting-zones-popover",
					"aria-label": "Device zones",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "popover-heading",
							children: "Device zones"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "popover-description",
							children: "Static color can be set per addressable zone."
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "lighting-zones__list",
							children: capability.zones?.map((zone) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
								asChild: true,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "lighting-zone",
									disabled: controlsDisabled || !zone.colorWritable,
									"aria-label": `${zone.label} color ${zone.color}`,
									children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
										style: { backgroundColor: zone.color },
										"aria-hidden": true
									}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: zone.label.replace(/^Zone\s+/i, "") })]
								})
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
								align: "center",
								className: "lighting-color-popover",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
										className: "popover-heading",
										children: zone.label
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
										className: "popover-description",
										children: "Applies Static to this reported lighting zone."
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ColorPicker, {
										value: zone.color,
										onCommit: (next) => onZoneColorChange(zone.id, next)
									})
								]
							})] }, zone.id))
						})
					]
				})] }) : null,
				capability.stateReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "lighting-editor__state-reason",
					role: "status",
					children: capability.stateReason
				}) : null
			]
		})]
	});
}
function ControlField({ label, value, wide, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "lighting-field",
		"data-wide": wide || void 0,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "lighting-field__label",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), value ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", {
				className: "tabular-nums",
				children: value
			}) : null]
		}), children]
	});
}
function lightingModeCopy(capability) {
	if (capability.source === "software") return "Live LIGHTSYNC control, independent of onboard memory.";
	if (capability.profileMode === "onboard") return "Stored in the active onboard profile.";
	if ((capability.zones?.length ?? 0) > 0) return `${capability.zones?.length} addressable zones under live LIGHTSYNC control.`;
	return "Live lighting for the current software profile.";
}
function lightingStateLabel(capability) {
	if (capability.state === "unknown") return "Unknown";
	if (!capability.enabled) return "Off";
	if (capability.state === "maintained") return "Read back";
	if (capability.state === "acknowledged") return "Acknowledged";
	return capability.source === "firmware" ? "Stored effect" : "Ready";
}
function directionLabel(direction) {
	return direction.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
//#endregion
//#region src/renderer/src/components/device-controls/MouseBatteryLightingControl.tsx
function MouseBatteryLightingControl({ device }) {
	const policies = useSystemStore((state) => state.snapshot?.settings.mouseBatteryLighting);
	const updateSettings = useSystemStore((state) => state.updateSettings);
	const [pending, setPending] = (0, import_react.useState)(false);
	const policy = policies?.[device.id] ?? defaultMouseBatteryLightingPolicy;
	const lighting = device.capabilities.lighting;
	if (!lighting?.batteryStatus) return null;
	const disabled = pending || !device.connected;
	const save = async (patch) => {
		setPending(true);
		try {
			const current = useSystemStore.getState().snapshot?.settings.mouseBatteryLighting ?? {};
			await updateSettings({ mouseBatteryLighting: {
				...current,
				[device.id]: {
					...policy,
					...patch
				}
			} });
		} finally {
			setPending(false);
		}
	};
	const summary = lighting.batteryStatus === "cutoff" ? "Lighting off to save battery" : lighting.batteryStatus === "charging" ? "Paused while charging" : lighting.batteryStatus === "error" ? "Could not apply" : !device.connected || lighting.batteryStatus === "unavailable" ? "Waiting for mouse" : [policy.flashEnabled ? `Warn at ${policy.warningPercentage}%` : "", policy.cutoffEnabled ? `Off at ${policy.cutoffPercentage}%` : ""].filter(Boolean).join(" · ") || "Disabled";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Popover, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PopoverTrigger, {
		asChild: true,
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
			type: "button",
			className: "mouse-battery-lighting__trigger",
			"aria-label": "Battery lighting settings",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Battery lighting" }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: summary }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChevronRight, {
					size: 13,
					"aria-hidden": true
				})
			]
		})
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(PopoverContent, {
		align: "end",
		className: "mouse-battery-lighting__popover",
		"aria-label": "Battery lighting",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Battery lighting" }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Three red flashes over seven seconds. Normal lighting returns between reminders." }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mouse-battery-lighting__row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					htmlFor: "mouse-battery-flash",
					children: "Low battery flash"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					id: "mouse-battery-flash",
					checked: policy.flashEnabled,
					disabled,
					onCheckedChange: (flashEnabled) => void save({ flashEnabled })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mouse-battery-lighting__fields",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberSetting, {
					label: "Warn at or below (%)",
					value: policy.warningPercentage,
					max: 100,
					disabled: disabled || !policy.flashEnabled,
					onCommit: (warningPercentage) => void save({ warningPercentage })
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberSetting, {
					label: "Repeat every (minutes)",
					value: policy.flashIntervalMinutes,
					max: 60,
					disabled: disabled || !policy.flashEnabled,
					onCommit: (flashIntervalMinutes) => void save({ flashIntervalMinutes })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mouse-battery-lighting__row",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", {
					htmlFor: "mouse-battery-cutoff",
					children: "Turn lighting off"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					id: "mouse-battery-cutoff",
					checked: policy.cutoffEnabled,
					disabled,
					onCheckedChange: (cutoffEnabled) => void save({ cutoffEnabled })
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NumberSetting, {
				label: "Turn off at or below (%)",
				value: policy.cutoffPercentage,
				max: 100,
				disabled: disabled || !policy.cutoffEnabled,
				onCommit: (cutoffPercentage) => void save({ cutoffPercentage })
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "The cutoff also stops red flashes. Charging or a higher battery level restores normal lighting. Switchboard must be running." }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				role: "status",
				children: pending ? "Saving…" : !device.connected ? "Mouse disconnected." : lighting.batteryStatusReason ?? summary
			}),
			lighting.batteryStatus === "error" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Switchboard will retry automatically." }) : null
		]
	})] });
}
function NumberSetting({ label, value, max, disabled, onCommit }) {
	const [draft, setDraft] = (0, import_react.useState)(String(value));
	(0, import_react.useEffect)(() => setDraft(String(value)), [value, disabled]);
	const commit = () => {
		const next = Number(draft);
		if (draft.trim() && Number.isInteger(next) && next >= 1 && next <= max) {
			if (next !== value) onCommit(next);
		} else setDraft(String(value));
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "mouse-battery-lighting__number",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Input, {
			type: "number",
			min: 1,
			max,
			step: 1,
			"aria-label": label,
			value: draft,
			disabled,
			onChange: (event) => setDraft(event.target.value),
			onBlur: commit,
			onKeyDown: (event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}
		})]
	});
}
//#endregion
//#region src/renderer/src/components/device-controls/OnboardMemoryControl.tsx
function OnboardMemoryControl({ capability, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "onboard-memory-control",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "onboard-memory-control__heading",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Onboard memory" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Use settings stored directly on the mouse." })] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Switch, {
					checked: capability.enabled,
					disabled: !capability.writable,
					onCheckedChange: onChange,
					"aria-label": "Onboard memory"
				}) })
			}), !capability.writable ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "Onboard memory mode is unavailable for this connection." }) : null] })]
		}), capability.enabled && capability.activeProfile ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "onboard-memory-control__profile",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Profile" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: formatProfile(capability.activeProfile) })]
		}) : null]
	});
}
function formatProfile(value) {
	if (!value) return "Active profile";
	return value.replace(/^profile[_\s-]*/i, "Profile ").replaceAll("_", " ");
}
//#endregion
//#region src/renderer/src/components/device-controls/ReportRateControl.tsx
function ReportRateControl({ capability, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "report-rate-control",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "control-heading control-heading--compact",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Polling rate" }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
				asChild: true,
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
					type: "button",
					className: "control-info",
					"aria-label": "About polling rate",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Info, {
						"aria-hidden": true,
						className: "size-3.5"
					})
				})
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: "Higher polling can use more CPU and battery." })] })]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Tooltip, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipTrigger, {
			asChild: true,
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleGroup, {
				type: "single",
				value: String(capability.value),
				disabled: !capability.writable,
				"aria-label": "Polling rate",
				onValueChange: (value) => value && onChange(Number(value)),
				children: capability.supportedRates.map((rate) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(ToggleGroupItem, {
					value: String(rate),
					"aria-label": `${rate} hertz`,
					children: [rate.toLocaleString(), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
						className: "report-rate-control__unit",
						children: "Hz"
					})]
				}, rate))
			}) })
		}), !capability.writable && capability.unavailableReason ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TooltipContent, { children: capability.unavailableReason }) : null] })]
	});
}
//#endregion
//#region src/renderer/src/components/device-controls/MouseDeviceEditor.tsx
function MouseDeviceEditor({ device }) {
	const [lightingPreview, setLightingPreview] = (0, import_react.useState)(null);
	const handleLightingPreview = (0, import_react.useCallback)((color) => setLightingPreview(color), []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "mouse-workspace",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MouseStage, {
			device,
			lightingPreview
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MouseControls, {
			device,
			onLightingPreview: handleLightingPreview
		})]
	});
}
function MouseStage({ device, lightingPreview }) {
	const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
	const pending = useSystemStore((state) => state.pendingDeviceIds.includes(device.id));
	const [activeControlId, setActiveControlId] = (0, import_react.useState)(null);
	const capability = device.capabilities.buttonAssignments;
	const actions = capability?.availableActions ?? [];
	const leftBindings = capability?.bindings.filter((binding) => binding.hotspot.calloutSide === "left").sort(compareBindingOrder) ?? [];
	const rightBindings = capability?.bindings.filter((binding) => binding.hotspot.calloutSide === "right").sort(compareBindingOrder) ?? [];
	const renderCallout = (binding) => {
		const assignedAction = actions.find((action) => action.id === binding.currentActionId) ?? customAction;
		const currentAction = binding.buttonId === "dpi-shift" && assignedAction.id === "mouse.dpi-shift" && device.capabilities.dpi?.shiftDpi !== void 0 ? {
			...assignedAction,
			label: `${device.capabilities.dpi.shiftDpi.toLocaleString()} DPI`
		} : assignedAction;
		return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceCallout, {
			binding,
			currentAction,
			availableActions: actions,
			disabled: !capability?.writable || pending,
			unavailableReason: pending ? "Waiting for the mouse to confirm the change…" : capability?.unavailableReason,
			unavailableAction: device.capabilities.onboardMemory ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				size: "sm",
				"data-assignment-mode": true,
				disabled: pending || !device.connected || !device.capabilities.onboardMemory.writable,
				onClick: () => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "onboard-memory",
						enabled: !device.capabilities.onboardMemory.enabled
					}
				}),
				children: device.capabilities.onboardMemory.enabled ? "Turn off onboard memory" : "Enable onboard memory"
			}) : void 0,
			active: activeControlId === binding.hotspot.id,
			onActiveChange: (active) => setActiveControlId((current) => active ? binding.hotspot.id : current === binding.hotspot.id ? null : current),
			onChange: (action) => void setDeviceControl({
				deviceId: device.id,
				change: {
					type: "button-assignment",
					buttonId: binding.buttonId,
					actionId: action.id
				}
			})
		}, binding.buttonId);
	};
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "mouse-stage",
		"data-callouts-disabled": !capability?.writable || void 0,
		"aria-label": `${device.displayName} button assignments`,
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mouse-stage__callouts mouse-stage__callouts--left",
				children: leftBindings.map(renderCallout)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mouse-stage__device",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceRender, {
					device,
					density: "hero",
					className: "mouse-stage__render",
					lightingPreview: lightingPreview ? {
						color: lightingPreview,
						enabled: true
					} : void 0
				}), capability?.bindings.map((binding) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeviceHotspot, {
					hotspot: binding.hotspot,
					active: activeControlId === binding.hotspot.id,
					onActiveChange: (active) => setActiveControlId((current) => active ? binding.hotspot.id : current === binding.hotspot.id ? null : current),
					onActivate: () => document.querySelector(`[data-callout-id="${binding.hotspot.id}"]`)?.click()
				}, binding.buttonId))]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
				className: "mouse-stage__callouts mouse-stage__callouts--right",
				children: rightBindings.map(renderCallout)
			})
		]
	});
}
function MouseControls({ device, onLightingPreview }) {
	const setDeviceControl = useSystemStore((state) => state.setDeviceControl);
	const { dpi, reportRate, lighting, onboardMemory } = device.capabilities;
	if (!dpi && !reportRate && !lighting && !onboardMemory) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("section", {
		className: "device-controls mouse-config mouse-config--unavailable",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Configuration is unavailable while the Logitech device service is not responding." })
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "device-controls mouse-config",
		"aria-label": "Mouse configuration",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mouse-config__sensitivity",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mouse-config__section-heading",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { children: "Sensitivity" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: dpi?.profileMode === "onboard" ? "Using settings stored on the mouse." : "Changes apply to the current profile." })]
				}),
				dpi ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DpiControl, {
					capability: dpi,
					reportRateControl: reportRate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReportRateControl, {
						capability: reportRate,
						onChange: (value) => void setDeviceControl({
							deviceId: device.id,
							change: {
								type: "report-rate",
								value
							}
						})
					}) : null,
					onChange: (value) => setDeviceControl({
						deviceId: device.id,
						change: {
							type: "dpi",
							value
						}
					}),
					onStagesChange: (stages) => setDeviceControl({
						deviceId: device.id,
						change: {
							type: "dpi-stages",
							stages
						}
					}),
					onShiftChange: (value) => setDeviceControl({
						deviceId: device.id,
						change: {
							type: "dpi-shift",
							value
						}
					})
				}) : reportRate ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ReportRateControl, {
					capability: reportRate,
					onChange: (value) => void setDeviceControl({
						deviceId: device.id,
						change: {
							type: "report-rate",
							value
						}
					})
				}) : null,
				onboardMemory ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "mouse-config__device-group",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OnboardMemoryControl, {
						capability: onboardMemory,
						onChange: (enabled) => void setDeviceControl({
							deviceId: device.id,
							change: {
								type: "onboard-memory",
								enabled
							}
						})
					})
				}) : null
			]
		}), lighting ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mouse-config__lighting-group",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(MouseBatteryLightingControl, { device }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LightingControl, {
				capability: lighting,
				onColorPreview: onLightingPreview,
				onEnabledChange: (enabled) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-enabled",
						enabled
					}
				}),
				onColorChange: (color) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-color",
						color
					}
				}),
				onBrightnessChange: (brightness) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-brightness",
						brightness
					}
				}),
				onEffectChange: (effectId) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-effect",
						effectId
					}
				}),
				onSpeedChange: (speed) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-speed",
						speed
					}
				}),
				onDirectionChange: (direction) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-direction",
						direction
					}
				}),
				onZoneColorChange: (zoneId, color) => void setDeviceControl({
					deviceId: device.id,
					change: {
						type: "lighting-zone-color",
						zoneId,
						color
					}
				})
			})]
		}) : null]
	});
}
function compareBindingOrder(left, right) {
	return left.hotspot.order - right.hotspot.order;
}
var customAction = {
	id: "system.custom",
	label: "Custom G HUB assignment",
	category: "system",
	searchTerms: [],
	selectable: false
};
//#endregion
export { MouseDeviceEditor };
