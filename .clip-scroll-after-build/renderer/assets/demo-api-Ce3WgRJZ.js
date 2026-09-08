//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp$2 = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJSMin = (cb, mod) => () => (mod || (cb((mod = { exports: {} }).exports, mod), cb = null), mod.exports);
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp$2(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp$2(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
//#region node_modules/.bun/react@19.2.0/node_modules/react/cjs/react.production.js
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	var REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
	var REACT_PROFILER_TYPE = Symbol.for("react.profiler");
	var REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
	var REACT_CONTEXT_TYPE = Symbol.for("react.context");
	var REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
	var REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
	var REACT_MEMO_TYPE = Symbol.for("react.memo");
	var REACT_LAZY_TYPE = Symbol.for("react.lazy");
	var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
	var MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
	function getIteratorFn(maybeIterable) {
		if (null === maybeIterable || "object" !== typeof maybeIterable) return null;
		maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
		return "function" === typeof maybeIterable ? maybeIterable : null;
	}
	var ReactNoopUpdateQueue = {
		isMounted: function() {
			return !1;
		},
		enqueueForceUpdate: function() {},
		enqueueReplaceState: function() {},
		enqueueSetState: function() {}
	};
	var assign = Object.assign;
	var emptyObject = {};
	function Component(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	Component.prototype.isReactComponent = {};
	Component.prototype.setState = function(partialState, callback) {
		if ("object" !== typeof partialState && "function" !== typeof partialState && null != partialState) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
		this.updater.enqueueSetState(this, partialState, callback, "setState");
	};
	Component.prototype.forceUpdate = function(callback) {
		this.updater.enqueueForceUpdate(this, callback, "forceUpdate");
	};
	function ComponentDummy() {}
	ComponentDummy.prototype = Component.prototype;
	function PureComponent(props, context, updater) {
		this.props = props;
		this.context = context;
		this.refs = emptyObject;
		this.updater = updater || ReactNoopUpdateQueue;
	}
	var pureComponentPrototype = PureComponent.prototype = new ComponentDummy();
	pureComponentPrototype.constructor = PureComponent;
	assign(pureComponentPrototype, Component.prototype);
	pureComponentPrototype.isPureReactComponent = !0;
	var isArrayImpl = Array.isArray;
	function noop() {}
	var ReactSharedInternals = {
		H: null,
		A: null,
		T: null,
		S: null
	};
	var hasOwnProperty = Object.prototype.hasOwnProperty;
	function ReactElement(type, key, props) {
		var refProp = props.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== refProp ? refProp : null,
			props
		};
	}
	function cloneAndReplaceKey(oldElement, newKey) {
		return ReactElement(oldElement.type, newKey, oldElement.props);
	}
	function isValidElement(object) {
		return "object" === typeof object && null !== object && object.$$typeof === REACT_ELEMENT_TYPE;
	}
	function escape(key) {
		var escaperLookup = {
			"=": "=0",
			":": "=2"
		};
		return "$" + key.replace(/[=:]/g, function(match) {
			return escaperLookup[match];
		});
	}
	var userProvidedKeyEscapeRegex = /\/+/g;
	function getElementKey(element, index) {
		return "object" === typeof element && null !== element && null != element.key ? escape("" + element.key) : index.toString(36);
	}
	function resolveThenable(thenable) {
		switch (thenable.status) {
			case "fulfilled": return thenable.value;
			case "rejected": throw thenable.reason;
			default: switch ("string" === typeof thenable.status ? thenable.then(noop, noop) : (thenable.status = "pending", thenable.then(function(fulfilledValue) {
				"pending" === thenable.status && (thenable.status = "fulfilled", thenable.value = fulfilledValue);
			}, function(error) {
				"pending" === thenable.status && (thenable.status = "rejected", thenable.reason = error);
			})), thenable.status) {
				case "fulfilled": return thenable.value;
				case "rejected": throw thenable.reason;
			}
		}
		throw thenable;
	}
	function mapIntoArray(children, array, escapedPrefix, nameSoFar, callback) {
		var type = typeof children;
		if ("undefined" === type || "boolean" === type) children = null;
		var invokeCallback = !1;
		if (null === children) invokeCallback = !0;
		else switch (type) {
			case "bigint":
			case "string":
			case "number":
				invokeCallback = !0;
				break;
			case "object": switch (children.$$typeof) {
				case REACT_ELEMENT_TYPE:
				case REACT_PORTAL_TYPE:
					invokeCallback = !0;
					break;
				case REACT_LAZY_TYPE: return invokeCallback = children._init, mapIntoArray(invokeCallback(children._payload), array, escapedPrefix, nameSoFar, callback);
			}
		}
		if (invokeCallback) return callback = callback(children), invokeCallback = "" === nameSoFar ? "." + getElementKey(children, 0) : nameSoFar, isArrayImpl(callback) ? (escapedPrefix = "", null != invokeCallback && (escapedPrefix = invokeCallback.replace(userProvidedKeyEscapeRegex, "$&/") + "/"), mapIntoArray(callback, array, escapedPrefix, "", function(c) {
			return c;
		})) : null != callback && (isValidElement(callback) && (callback = cloneAndReplaceKey(callback, escapedPrefix + (null == callback.key || children && children.key === callback.key ? "" : ("" + callback.key).replace(userProvidedKeyEscapeRegex, "$&/") + "/") + invokeCallback)), array.push(callback)), 1;
		invokeCallback = 0;
		var nextNamePrefix = "" === nameSoFar ? "." : nameSoFar + ":";
		if (isArrayImpl(children)) for (var i = 0; i < children.length; i++) nameSoFar = children[i], type = nextNamePrefix + getElementKey(nameSoFar, i), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if (i = getIteratorFn(children), "function" === typeof i) for (children = i.call(children), i = 0; !(nameSoFar = children.next()).done;) nameSoFar = nameSoFar.value, type = nextNamePrefix + getElementKey(nameSoFar, i++), invokeCallback += mapIntoArray(nameSoFar, array, escapedPrefix, type, callback);
		else if ("object" === type) {
			if ("function" === typeof children.then) return mapIntoArray(resolveThenable(children), array, escapedPrefix, nameSoFar, callback);
			array = String(children);
			throw Error("Objects are not valid as a React child (found: " + ("[object Object]" === array ? "object with keys {" + Object.keys(children).join(", ") + "}" : array) + "). If you meant to render a collection of children, use an array instead.");
		}
		return invokeCallback;
	}
	function mapChildren(children, func, context) {
		if (null == children) return children;
		var result = [], count = 0;
		mapIntoArray(children, result, "", "", function(child) {
			return func.call(context, child, count++);
		});
		return result;
	}
	function lazyInitializer(payload) {
		if (-1 === payload._status) {
			var ctor = payload._result;
			ctor = ctor();
			ctor.then(function(moduleObject) {
				if (0 === payload._status || -1 === payload._status) payload._status = 1, payload._result = moduleObject;
			}, function(error) {
				if (0 === payload._status || -1 === payload._status) payload._status = 2, payload._result = error;
			});
			-1 === payload._status && (payload._status = 0, payload._result = ctor);
		}
		if (1 === payload._status) return payload._result.default;
		throw payload._result;
	}
	var reportGlobalError = "function" === typeof reportError ? reportError : function(error) {
		if ("object" === typeof window && "function" === typeof window.ErrorEvent) {
			var event = new window.ErrorEvent("error", {
				bubbles: !0,
				cancelable: !0,
				message: "object" === typeof error && null !== error && "string" === typeof error.message ? String(error.message) : String(error),
				error
			});
			if (!window.dispatchEvent(event)) return;
		} else if ("object" === typeof process && "function" === typeof process.emit) {
			process.emit("uncaughtException", error);
			return;
		}
		console.error(error);
	};
	var Children = {
		map: mapChildren,
		forEach: function(children, forEachFunc, forEachContext) {
			mapChildren(children, function() {
				forEachFunc.apply(this, arguments);
			}, forEachContext);
		},
		count: function(children) {
			var n = 0;
			mapChildren(children, function() {
				n++;
			});
			return n;
		},
		toArray: function(children) {
			return mapChildren(children, function(child) {
				return child;
			}) || [];
		},
		only: function(children) {
			if (!isValidElement(children)) throw Error("React.Children.only expected to receive a single React element child.");
			return children;
		}
	};
	exports.Activity = REACT_ACTIVITY_TYPE;
	exports.Children = Children;
	exports.Component = Component;
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.Profiler = REACT_PROFILER_TYPE;
	exports.PureComponent = PureComponent;
	exports.StrictMode = REACT_STRICT_MODE_TYPE;
	exports.Suspense = REACT_SUSPENSE_TYPE;
	exports.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = ReactSharedInternals;
	exports.__COMPILER_RUNTIME = {
		__proto__: null,
		c: function(size) {
			return ReactSharedInternals.H.useMemoCache(size);
		}
	};
	exports.cache = function(fn) {
		return function() {
			return fn.apply(null, arguments);
		};
	};
	exports.cacheSignal = function() {
		return null;
	};
	exports.cloneElement = function(element, config, children) {
		if (null === element || void 0 === element) throw Error("The argument must be a React element, but you passed " + element + ".");
		var props = assign({}, element.props), key = element.key;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) !hasOwnProperty.call(config, propName) || "key" === propName || "__self" === propName || "__source" === propName || "ref" === propName && void 0 === config.ref || (props[propName] = config[propName]);
		var propName = arguments.length - 2;
		if (1 === propName) props.children = children;
		else if (1 < propName) {
			for (var childArray = Array(propName), i = 0; i < propName; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		return ReactElement(element.type, key, props);
	};
	exports.createContext = function(defaultValue) {
		defaultValue = {
			$$typeof: REACT_CONTEXT_TYPE,
			_currentValue: defaultValue,
			_currentValue2: defaultValue,
			_threadCount: 0,
			Provider: null,
			Consumer: null
		};
		defaultValue.Provider = defaultValue;
		defaultValue.Consumer = {
			$$typeof: REACT_CONSUMER_TYPE,
			_context: defaultValue
		};
		return defaultValue;
	};
	exports.createElement = function(type, config, children) {
		var propName, props = {}, key = null;
		if (null != config) for (propName in void 0 !== config.key && (key = "" + config.key), config) hasOwnProperty.call(config, propName) && "key" !== propName && "__self" !== propName && "__source" !== propName && (props[propName] = config[propName]);
		var childrenLength = arguments.length - 2;
		if (1 === childrenLength) props.children = children;
		else if (1 < childrenLength) {
			for (var childArray = Array(childrenLength), i = 0; i < childrenLength; i++) childArray[i] = arguments[i + 2];
			props.children = childArray;
		}
		if (type && type.defaultProps) for (propName in childrenLength = type.defaultProps, childrenLength) void 0 === props[propName] && (props[propName] = childrenLength[propName]);
		return ReactElement(type, key, props);
	};
	exports.createRef = function() {
		return { current: null };
	};
	exports.forwardRef = function(render) {
		return {
			$$typeof: REACT_FORWARD_REF_TYPE,
			render
		};
	};
	exports.isValidElement = isValidElement;
	exports.lazy = function(ctor) {
		return {
			$$typeof: REACT_LAZY_TYPE,
			_payload: {
				_status: -1,
				_result: ctor
			},
			_init: lazyInitializer
		};
	};
	exports.memo = function(type, compare) {
		return {
			$$typeof: REACT_MEMO_TYPE,
			type,
			compare: void 0 === compare ? null : compare
		};
	};
	exports.startTransition = function(scope) {
		var prevTransition = ReactSharedInternals.T, currentTransition = {};
		ReactSharedInternals.T = currentTransition;
		try {
			var returnValue = scope(), onStartTransitionFinish = ReactSharedInternals.S;
			null !== onStartTransitionFinish && onStartTransitionFinish(currentTransition, returnValue);
			"object" === typeof returnValue && null !== returnValue && "function" === typeof returnValue.then && returnValue.then(noop, reportGlobalError);
		} catch (error) {
			reportGlobalError(error);
		} finally {
			null !== prevTransition && null !== currentTransition.types && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
		}
	};
	exports.unstable_useCacheRefresh = function() {
		return ReactSharedInternals.H.useCacheRefresh();
	};
	exports.use = function(usable) {
		return ReactSharedInternals.H.use(usable);
	};
	exports.useActionState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useActionState(action, initialState, permalink);
	};
	exports.useCallback = function(callback, deps) {
		return ReactSharedInternals.H.useCallback(callback, deps);
	};
	exports.useContext = function(Context) {
		return ReactSharedInternals.H.useContext(Context);
	};
	exports.useDebugValue = function() {};
	exports.useDeferredValue = function(value, initialValue) {
		return ReactSharedInternals.H.useDeferredValue(value, initialValue);
	};
	exports.useEffect = function(create, deps) {
		return ReactSharedInternals.H.useEffect(create, deps);
	};
	exports.useEffectEvent = function(callback) {
		return ReactSharedInternals.H.useEffectEvent(callback);
	};
	exports.useId = function() {
		return ReactSharedInternals.H.useId();
	};
	exports.useImperativeHandle = function(ref, create, deps) {
		return ReactSharedInternals.H.useImperativeHandle(ref, create, deps);
	};
	exports.useInsertionEffect = function(create, deps) {
		return ReactSharedInternals.H.useInsertionEffect(create, deps);
	};
	exports.useLayoutEffect = function(create, deps) {
		return ReactSharedInternals.H.useLayoutEffect(create, deps);
	};
	exports.useMemo = function(create, deps) {
		return ReactSharedInternals.H.useMemo(create, deps);
	};
	exports.useOptimistic = function(passthrough, reducer) {
		return ReactSharedInternals.H.useOptimistic(passthrough, reducer);
	};
	exports.useReducer = function(reducer, initialArg, init) {
		return ReactSharedInternals.H.useReducer(reducer, initialArg, init);
	};
	exports.useRef = function(initialValue) {
		return ReactSharedInternals.H.useRef(initialValue);
	};
	exports.useState = function(initialState) {
		return ReactSharedInternals.H.useState(initialState);
	};
	exports.useSyncExternalStore = function(subscribe, getSnapshot, getServerSnapshot) {
		return ReactSharedInternals.H.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	};
	exports.useTransition = function() {
		return ReactSharedInternals.H.useTransition();
	};
	exports.version = "19.2.0";
}));
//#endregion
//#region node_modules/.bun/react@19.2.0/node_modules/react/index.js
var require_react = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_react_production();
}));
//#endregion
//#region node_modules/.bun/react-dom@19.2.0+2f44e903108183df/node_modules/react-dom/cjs/react-dom.production.js
/**
* @license React
* react-dom.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_dom_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var React = require_react();
	function formatProdErrorMessage(code) {
		var url = "https://react.dev/errors/" + code;
		if (1 < arguments.length) {
			url += "?args[]=" + encodeURIComponent(arguments[1]);
			for (var i = 2; i < arguments.length; i++) url += "&args[]=" + encodeURIComponent(arguments[i]);
		}
		return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
	}
	function noop() {}
	var Internals = {
		d: {
			f: noop,
			r: function() {
				throw Error(formatProdErrorMessage(522));
			},
			D: noop,
			C: noop,
			L: noop,
			m: noop,
			X: noop,
			S: noop,
			M: noop
		},
		p: 0,
		findDOMNode: null
	};
	var REACT_PORTAL_TYPE = Symbol.for("react.portal");
	function createPortal$1(children, containerInfo, implementation) {
		var key = 3 < arguments.length && void 0 !== arguments[3] ? arguments[3] : null;
		return {
			$$typeof: REACT_PORTAL_TYPE,
			key: null == key ? null : "" + key,
			children,
			containerInfo,
			implementation
		};
	}
	var ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function getCrossOriginStringAs(as, input) {
		if ("font" === as) return "";
		if ("string" === typeof input) return "use-credentials" === input ? input : "";
	}
	exports.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = Internals;
	exports.createPortal = function(children, container) {
		var key = 2 < arguments.length && void 0 !== arguments[2] ? arguments[2] : null;
		if (!container || 1 !== container.nodeType && 9 !== container.nodeType && 11 !== container.nodeType) throw Error(formatProdErrorMessage(299));
		return createPortal$1(children, container, null, key);
	};
	exports.flushSync = function(fn) {
		var previousTransition = ReactSharedInternals.T, previousUpdatePriority = Internals.p;
		try {
			if (ReactSharedInternals.T = null, Internals.p = 2, fn) return fn();
		} finally {
			ReactSharedInternals.T = previousTransition, Internals.p = previousUpdatePriority, Internals.d.f();
		}
	};
	exports.preconnect = function(href, options) {
		"string" === typeof href && (options ? (options = options.crossOrigin, options = "string" === typeof options ? "use-credentials" === options ? options : "" : void 0) : options = null, Internals.d.C(href, options));
	};
	exports.prefetchDNS = function(href) {
		"string" === typeof href && Internals.d.D(href);
	};
	exports.preinit = function(href, options) {
		if ("string" === typeof href && options && "string" === typeof options.as) {
			var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin), integrity = "string" === typeof options.integrity ? options.integrity : void 0, fetchPriority = "string" === typeof options.fetchPriority ? options.fetchPriority : void 0;
			"style" === as ? Internals.d.S(href, "string" === typeof options.precedence ? options.precedence : void 0, {
				crossOrigin,
				integrity,
				fetchPriority
			}) : "script" === as && Internals.d.X(href, {
				crossOrigin,
				integrity,
				fetchPriority,
				nonce: "string" === typeof options.nonce ? options.nonce : void 0
			});
		}
	};
	exports.preinitModule = function(href, options) {
		if ("string" === typeof href) if ("object" === typeof options && null !== options) {
			if (null == options.as || "script" === options.as) {
				var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
				Internals.d.M(href, {
					crossOrigin,
					integrity: "string" === typeof options.integrity ? options.integrity : void 0,
					nonce: "string" === typeof options.nonce ? options.nonce : void 0
				});
			}
		} else options ?? Internals.d.M(href);
	};
	exports.preload = function(href, options) {
		if ("string" === typeof href && "object" === typeof options && null !== options && "string" === typeof options.as) {
			var as = options.as, crossOrigin = getCrossOriginStringAs(as, options.crossOrigin);
			Internals.d.L(href, as, {
				crossOrigin,
				integrity: "string" === typeof options.integrity ? options.integrity : void 0,
				nonce: "string" === typeof options.nonce ? options.nonce : void 0,
				type: "string" === typeof options.type ? options.type : void 0,
				fetchPriority: "string" === typeof options.fetchPriority ? options.fetchPriority : void 0,
				referrerPolicy: "string" === typeof options.referrerPolicy ? options.referrerPolicy : void 0,
				imageSrcSet: "string" === typeof options.imageSrcSet ? options.imageSrcSet : void 0,
				imageSizes: "string" === typeof options.imageSizes ? options.imageSizes : void 0,
				media: "string" === typeof options.media ? options.media : void 0
			});
		}
	};
	exports.preloadModule = function(href, options) {
		if ("string" === typeof href) if (options) {
			var crossOrigin = getCrossOriginStringAs(options.as, options.crossOrigin);
			Internals.d.m(href, {
				as: "string" === typeof options.as && "script" !== options.as ? options.as : void 0,
				crossOrigin,
				integrity: "string" === typeof options.integrity ? options.integrity : void 0
			});
		} else Internals.d.m(href);
	};
	exports.requestFormReset = function(form) {
		Internals.d.r(form);
	};
	exports.unstable_batchedUpdates = function(fn, a) {
		return fn(a);
	};
	exports.useFormState = function(action, initialState, permalink) {
		return ReactSharedInternals.H.useFormState(action, initialState, permalink);
	};
	exports.useFormStatus = function() {
		return ReactSharedInternals.H.useHostTransitionStatus();
	};
	exports.version = "19.2.0";
}));
//#endregion
//#region node_modules/.bun/react-dom@19.2.0+2f44e903108183df/node_modules/react-dom/index.js
var require_react_dom = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	function checkDCE() {
		if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") return;
		try {
			__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
		} catch (err) {
			console.error(err);
		}
	}
	checkDCE();
	module.exports = require_react_dom_production();
}));
//#endregion
//#region node_modules/.bun/react@19.2.0/node_modules/react/cjs/react-jsx-runtime.production.js
/**
* @license React
* react-jsx-runtime.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var require_react_jsx_runtime_production = /* @__PURE__ */ __commonJSMin(((exports) => {
	var REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
	var REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
	function jsxProd(type, config, maybeKey) {
		var key = null;
		void 0 !== maybeKey && (key = "" + maybeKey);
		void 0 !== config.key && (key = "" + config.key);
		if ("key" in config) {
			maybeKey = {};
			for (var propName in config) "key" !== propName && (maybeKey[propName] = config[propName]);
		} else maybeKey = config;
		config = maybeKey.ref;
		return {
			$$typeof: REACT_ELEMENT_TYPE,
			type,
			key,
			ref: void 0 !== config ? config : null,
			props: maybeKey
		};
	}
	exports.Fragment = REACT_FRAGMENT_TYPE;
	exports.jsx = jsxProd;
	exports.jsxs = jsxProd;
}));
//#endregion
//#region node_modules/.bun/react@19.2.0/node_modules/react/jsx-runtime.js
var require_jsx_runtime = /* @__PURE__ */ __commonJSMin(((exports, module) => {
	module.exports = require_react_jsx_runtime_production();
}));
//#endregion
//#region node_modules/.bun/@radix-ui+react-slot@1.3.3+0826b398854474ff/node_modules/@radix-ui/react-slot/node_modules/@radix-ui/react-compose-refs/dist/index.mjs
var import_react = /* @__PURE__ */ __toESM(require_react(), 1);
var __defProp$1 = Object.defineProperty;
var __name$1 = (target, value) => __defProp$1(target, "name", {
	value,
	configurable: true
});
function setRef(ref, value) {
	if (typeof ref === "function") return ref(value);
	else if (ref !== null && ref !== void 0) ref.current = value;
}
__name$1(setRef, "setRef");
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
__name$1(composeRefs, "composeRefs");
function useComposedRefs(...refs) {
	return import_react.useCallback(composeRefs(...refs), refs);
}
__name$1(useComposedRefs, "useComposedRefs");
//#endregion
//#region node_modules/.bun/@radix-ui+react-slot@1.3.3+0826b398854474ff/node_modules/@radix-ui/react-slot/dist/index.mjs
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", {
	value,
	configurable: true
});
// @__NO_SIDE_EFFECTS__
function createSlot(ownerName) {
	const Slot2 = import_react.forwardRef((props, forwardedRef) => {
		let { children, ...slotProps } = props;
		let slottableElement = null;
		let hasSlottable = false;
		const newChildren = [];
		if (isLazyComponent(children) && typeof use === "function") children = use(children._payload);
		import_react.Children.forEach(children, (maybeSlottable) => {
			if (isSlottable(maybeSlottable)) {
				hasSlottable = true;
				const slottable = maybeSlottable;
				let child = "child" in slottable.props ? slottable.props.child : slottable.props.children;
				if (isLazyComponent(child) && typeof use === "function") child = use(child._payload);
				slottableElement = getSlottableElementFromSlottable(slottable, child);
				newChildren.push(slottableElement?.props?.children);
			} else newChildren.push(maybeSlottable);
		});
		if (slottableElement) slottableElement = import_react.cloneElement(slottableElement, void 0, newChildren);
		else if (!hasSlottable && import_react.Children.count(children) === 1 && import_react.isValidElement(children)) slottableElement = children;
		const slottableElementRef = slottableElement ? getElementRef(slottableElement) : void 0;
		const composedRef = useComposedRefs(forwardedRef, slottableElementRef);
		if (!slottableElement) {
			if (children || children === 0) throw new Error(hasSlottable ? createSlottableError(ownerName) : createSlotError(ownerName));
			return children;
		}
		const mergedProps = mergeProps(slotProps, slottableElement.props ?? {});
		if (slottableElement.type !== import_react.Fragment) mergedProps.ref = forwardedRef ? composedRef : slottableElementRef;
		return import_react.cloneElement(slottableElement, mergedProps);
	});
	Slot2.displayName = `${ownerName}.Slot`;
	return Slot2;
}
__name(createSlot, "createSlot");
var Slot = /* @__PURE__ */ createSlot("Slot");
var SLOTTABLE_IDENTIFIER = Symbol.for("radix.slottable");
// @__NO_SIDE_EFFECTS__
function createSlottable(ownerName) {
	const Slottable2 = /* @__PURE__ */ __name((props) => "child" in props ? props.children(props.child) : props.children, "Slottable");
	Slottable2.displayName = `${ownerName}.Slottable`;
	Slottable2.__radixId = SLOTTABLE_IDENTIFIER;
	return Slottable2;
}
__name(createSlottable, "createSlottable");
var getSlottableElementFromSlottable = /* @__PURE__ */ __name((slottable, child) => {
	if ("child" in slottable.props) {
		const child2 = slottable.props.child;
		if (!import_react.isValidElement(child2)) return null;
		return import_react.cloneElement(child2, void 0, slottable.props.children(child2.props.children));
	}
	return import_react.isValidElement(child) ? child : null;
}, "getSlottableElementFromSlottable");
function mergeProps(slotProps, childProps) {
	const overrideProps = { ...childProps };
	for (const propName in childProps) {
		const slotPropValue = slotProps[propName];
		const childPropValue = childProps[propName];
		if (/^on[A-Z]/.test(propName)) {
			if (slotPropValue && childPropValue) overrideProps[propName] = (...args) => {
				const result = childPropValue(...args);
				slotPropValue(...args);
				return result;
			};
			else if (slotPropValue) overrideProps[propName] = slotPropValue;
		} else if (propName === "style") overrideProps[propName] = {
			...slotPropValue,
			...childPropValue
		};
		else if (propName === "className") overrideProps[propName] = [slotPropValue, childPropValue].filter(Boolean).join(" ");
	}
	return {
		...slotProps,
		...overrideProps
	};
}
__name(mergeProps, "mergeProps");
function getElementRef(element) {
	let getter = Object.getOwnPropertyDescriptor(element.props, "ref")?.get;
	let mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
	if (mayWarn) return element.ref;
	getter = Object.getOwnPropertyDescriptor(element, "ref")?.get;
	mayWarn = getter && "isReactWarning" in getter && getter.isReactWarning;
	if (mayWarn) return element.props.ref;
	return element.props.ref || element.ref;
}
__name(getElementRef, "getElementRef");
function isSlottable(child) {
	return import_react.isValidElement(child) && typeof child.type === "function" && "__radixId" in child.type && child.type.__radixId === SLOTTABLE_IDENTIFIER;
}
__name(isSlottable, "isSlottable");
var REACT_LAZY_TYPE = Symbol.for("react.lazy");
function isLazyComponent(element) {
	return element != null && typeof element === "object" && "$$typeof" in element && element.$$typeof === REACT_LAZY_TYPE && "_payload" in element && isPromiseLike(element._payload);
}
__name(isLazyComponent, "isLazyComponent");
function isPromiseLike(value) {
	return typeof value === "object" && value !== null && "then" in value;
}
__name(isPromiseLike, "isPromiseLike");
var createSlotError = /* @__PURE__ */ __name((ownerName) => {
	return `${ownerName} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`;
}, "createSlotError");
var createSlottableError = /* @__PURE__ */ __name((ownerName) => {
	return `${ownerName} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`;
}, "createSlottableError");
var use = import_react[" use ".trim().toString()];
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/shared/src/utils/mergeClasses.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
	return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/shared/src/utils/toKebabCase.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/shared/src/utils/toCamelCase.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toCamelCase = (string) => string.replace(/^([A-Z])|[\s-_]+(\w)/g, (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase());
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/shared/src/utils/toPascalCase.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var toPascalCase = (string) => {
	const camelCase = toCamelCase(string);
	return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/defaultAttributes.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var defaultAttributes = {
	xmlns: "http://www.w3.org/2000/svg",
	width: 24,
	height: 24,
	viewBox: "0 0 24 24",
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 2,
	strokeLinecap: "round",
	strokeLinejoin: "round"
};
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/shared/src/utils/hasA11yProp.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var hasA11yProp = (props) => {
	for (const prop in props) if (prop.startsWith("aria-") || prop === "role" || prop === "title") return true;
	return false;
};
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/context.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var LucideContext = (0, import_react.createContext)({});
var useLucideContext = () => (0, import_react.useContext)(LucideContext);
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/Icon.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var Icon = (0, import_react.forwardRef)(({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
	const { size: contextSize = 24, strokeWidth: contextStrokeWidth = 2, absoluteStrokeWidth: contextAbsoluteStrokeWidth = false, color: contextColor = "currentColor", className: contextClass = "" } = useLucideContext() ?? {};
	const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
	return (0, import_react.createElement)("svg", {
		ref,
		...defaultAttributes,
		width: size ?? contextSize ?? defaultAttributes.width,
		height: size ?? contextSize ?? defaultAttributes.height,
		stroke: color ?? contextColor,
		strokeWidth: calculatedStrokeWidth,
		className: mergeClasses("lucide", contextClass, className),
		...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
		...rest
	}, [...iconNode.map(([tag, attrs]) => (0, import_react.createElement)(tag, attrs)), ...Array.isArray(children) ? children : [children]]);
});
//#endregion
//#region node_modules/.bun/lucide-react@1.34.0+2f44e903108183df/node_modules/lucide-react/dist/esm/createLucideIcon.mjs
/**
* @license lucide-react v1.34.0 - ISC
*
* This source code is licensed under the ISC license.
* See the LICENSE file in the root directory of this source tree.
*/
var createLucideIcon = (iconName, iconNode) => {
	const Component = (0, import_react.forwardRef)(({ className, ...props }, ref) => (0, import_react.createElement)(Icon, {
		ref,
		iconNode,
		className: mergeClasses(`lucide-${toKebabCase(toPascalCase(iconName))}`, `lucide-${iconName}`, className),
		...props
	}));
	Component.displayName = toPascalCase(iconName);
	return Component;
};
//#endregion
//#region node_modules/.bun/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
function r(e) {
	var t, f, n = "";
	if ("string" == typeof e || "number" == typeof e) n += e;
	else if ("object" == typeof e) if (Array.isArray(e)) {
		var o = e.length;
		for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
	} else for (f in e) e[f] && (n && (n += " "), n += f);
	return n;
}
function clsx() {
	for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
	return n;
}
//#endregion
//#region node_modules/.bun/tailwind-merge@3.6.0/node_modules/tailwind-merge/dist/bundle-mjs.mjs
/**
* Concatenates two arrays faster than the array spread operator.
*/
var concatArrays = (array1, array2) => {
	const combinedArray = new Array(array1.length + array2.length);
	for (let i = 0; i < array1.length; i++) combinedArray[i] = array1[i];
	for (let i = 0; i < array2.length; i++) combinedArray[array1.length + i] = array2[i];
	return combinedArray;
};
var createClassValidatorObject = (classGroupId, validator) => ({
	classGroupId,
	validator
});
var createClassPartObject = (nextPart = /* @__PURE__ */ new Map(), validators = null, classGroupId) => ({
	nextPart,
	validators,
	classGroupId
});
var CLASS_PART_SEPARATOR = "-";
var EMPTY_CONFLICTS = [];
var ARBITRARY_PROPERTY_PREFIX = "arbitrary..";
var createClassGroupUtils = (config) => {
	const classMap = createClassMap(config);
	const { conflictingClassGroups, conflictingClassGroupModifiers } = config;
	const getClassGroupId = (className) => {
		if (className.startsWith("[") && className.endsWith("]")) return getGroupIdForArbitraryProperty(className);
		const classParts = className.split(CLASS_PART_SEPARATOR);
		return getGroupRecursive(classParts, classParts[0] === "" && classParts.length > 1 ? 1 : 0, classMap);
	};
	const getConflictingClassGroupIds = (classGroupId, hasPostfixModifier) => {
		if (hasPostfixModifier) {
			const modifierConflicts = conflictingClassGroupModifiers[classGroupId];
			const baseConflicts = conflictingClassGroups[classGroupId];
			if (modifierConflicts) {
				if (baseConflicts) return concatArrays(baseConflicts, modifierConflicts);
				return modifierConflicts;
			}
			return baseConflicts || EMPTY_CONFLICTS;
		}
		return conflictingClassGroups[classGroupId] || EMPTY_CONFLICTS;
	};
	return {
		getClassGroupId,
		getConflictingClassGroupIds
	};
};
var getGroupRecursive = (classParts, startIndex, classPartObject) => {
	if (classParts.length - startIndex === 0) return classPartObject.classGroupId;
	const currentClassPart = classParts[startIndex];
	const nextClassPartObject = classPartObject.nextPart.get(currentClassPart);
	if (nextClassPartObject) {
		const result = getGroupRecursive(classParts, startIndex + 1, nextClassPartObject);
		if (result) return result;
	}
	const validators = classPartObject.validators;
	if (validators === null) return;
	const classRest = startIndex === 0 ? classParts.join(CLASS_PART_SEPARATOR) : classParts.slice(startIndex).join(CLASS_PART_SEPARATOR);
	const validatorsLength = validators.length;
	for (let i = 0; i < validatorsLength; i++) {
		const validatorObj = validators[i];
		if (validatorObj.validator(classRest)) return validatorObj.classGroupId;
	}
};
/**
* Get the class group ID for an arbitrary property.
*
* @param className - The class name to get the group ID for. Is expected to be string starting with `[` and ending with `]`.
*/
var getGroupIdForArbitraryProperty = (className) => className.slice(1, -1).indexOf(":") === -1 ? void 0 : (() => {
	const content = className.slice(1, -1);
	const colonIndex = content.indexOf(":");
	const property = content.slice(0, colonIndex);
	return property ? ARBITRARY_PROPERTY_PREFIX + property : void 0;
})();
/**
* Exported for testing only
*/
var createClassMap = (config) => {
	const { theme, classGroups } = config;
	return processClassGroups(classGroups, theme);
};
var processClassGroups = (classGroups, theme) => {
	const classMap = createClassPartObject();
	for (const classGroupId in classGroups) {
		const group = classGroups[classGroupId];
		processClassesRecursively(group, classMap, classGroupId, theme);
	}
	return classMap;
};
var processClassesRecursively = (classGroup, classPartObject, classGroupId, theme) => {
	const len = classGroup.length;
	for (let i = 0; i < len; i++) {
		const classDefinition = classGroup[i];
		processClassDefinition(classDefinition, classPartObject, classGroupId, theme);
	}
};
var processClassDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
	if (typeof classDefinition === "string") {
		processStringDefinition(classDefinition, classPartObject, classGroupId);
		return;
	}
	if (typeof classDefinition === "function") {
		processFunctionDefinition(classDefinition, classPartObject, classGroupId, theme);
		return;
	}
	processObjectDefinition(classDefinition, classPartObject, classGroupId, theme);
};
var processStringDefinition = (classDefinition, classPartObject, classGroupId) => {
	const classPartObjectToEdit = classDefinition === "" ? classPartObject : getPart(classPartObject, classDefinition);
	classPartObjectToEdit.classGroupId = classGroupId;
};
var processFunctionDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
	if (isThemeGetter(classDefinition)) {
		processClassesRecursively(classDefinition(theme), classPartObject, classGroupId, theme);
		return;
	}
	if (classPartObject.validators === null) classPartObject.validators = [];
	classPartObject.validators.push(createClassValidatorObject(classGroupId, classDefinition));
};
var processObjectDefinition = (classDefinition, classPartObject, classGroupId, theme) => {
	const entries = Object.entries(classDefinition);
	const len = entries.length;
	for (let i = 0; i < len; i++) {
		const [key, value] = entries[i];
		processClassesRecursively(value, getPart(classPartObject, key), classGroupId, theme);
	}
};
var getPart = (classPartObject, path) => {
	let current = classPartObject;
	const parts = path.split(CLASS_PART_SEPARATOR);
	const len = parts.length;
	for (let i = 0; i < len; i++) {
		const part = parts[i];
		let next = current.nextPart.get(part);
		if (!next) {
			next = createClassPartObject();
			current.nextPart.set(part, next);
		}
		current = next;
	}
	return current;
};
var isThemeGetter = (func) => "isThemeGetter" in func && func.isThemeGetter === true;
var createLruCache = (maxCacheSize) => {
	if (maxCacheSize < 1) return {
		get: () => void 0,
		set: () => {}
	};
	let cacheSize = 0;
	let cache = Object.create(null);
	let previousCache = Object.create(null);
	const update = (key, value) => {
		cache[key] = value;
		cacheSize++;
		if (cacheSize > maxCacheSize) {
			cacheSize = 0;
			previousCache = cache;
			cache = Object.create(null);
		}
	};
	return {
		get(key) {
			let value = cache[key];
			if (value !== void 0) return value;
			if ((value = previousCache[key]) !== void 0) {
				update(key, value);
				return value;
			}
		},
		set(key, value) {
			if (key in cache) cache[key] = value;
			else update(key, value);
		}
	};
};
var IMPORTANT_MODIFIER = "!";
var MODIFIER_SEPARATOR = ":";
var EMPTY_MODIFIERS = [];
var createResultObject = (modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition, isExternal) => ({
	modifiers,
	hasImportantModifier,
	baseClassName,
	maybePostfixModifierPosition,
	isExternal
});
var createParseClassName = (config) => {
	const { prefix, experimentalParseClassName } = config;
	/**
	* Parse class name into parts.
	*
	* Inspired by `splitAtTopLevelOnly` used in Tailwind CSS
	* @see https://github.com/tailwindlabs/tailwindcss/blob/v3.2.2/src/util/splitAtTopLevelOnly.js
	*/
	let parseClassName = (className) => {
		const modifiers = [];
		let bracketDepth = 0;
		let parenDepth = 0;
		let modifierStart = 0;
		let postfixModifierPosition;
		const len = className.length;
		for (let index = 0; index < len; index++) {
			const currentCharacter = className[index];
			if (bracketDepth === 0 && parenDepth === 0) {
				if (currentCharacter === MODIFIER_SEPARATOR) {
					modifiers.push(className.slice(modifierStart, index));
					modifierStart = index + 1;
					continue;
				}
				if (currentCharacter === "/") {
					postfixModifierPosition = index;
					continue;
				}
			}
			if (currentCharacter === "[") bracketDepth++;
			else if (currentCharacter === "]") bracketDepth--;
			else if (currentCharacter === "(") parenDepth++;
			else if (currentCharacter === ")") parenDepth--;
		}
		const baseClassNameWithImportantModifier = modifiers.length === 0 ? className : className.slice(modifierStart);
		let baseClassName = baseClassNameWithImportantModifier;
		let hasImportantModifier = false;
		if (baseClassNameWithImportantModifier.endsWith(IMPORTANT_MODIFIER)) {
			baseClassName = baseClassNameWithImportantModifier.slice(0, -1);
			hasImportantModifier = true;
		} else if (baseClassNameWithImportantModifier.startsWith(IMPORTANT_MODIFIER)) {
			baseClassName = baseClassNameWithImportantModifier.slice(1);
			hasImportantModifier = true;
		}
		const maybePostfixModifierPosition = postfixModifierPosition && postfixModifierPosition > modifierStart ? postfixModifierPosition - modifierStart : void 0;
		return createResultObject(modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition);
	};
	if (prefix) {
		const fullPrefix = prefix + MODIFIER_SEPARATOR;
		const parseClassNameOriginal = parseClassName;
		parseClassName = (className) => className.startsWith(fullPrefix) ? parseClassNameOriginal(className.slice(fullPrefix.length)) : createResultObject(EMPTY_MODIFIERS, false, className, void 0, true);
	}
	if (experimentalParseClassName) {
		const parseClassNameOriginal = parseClassName;
		parseClassName = (className) => experimentalParseClassName({
			className,
			parseClassName: parseClassNameOriginal
		});
	}
	return parseClassName;
};
/**
* Sorts modifiers according to following schema:
* - Predefined modifiers are sorted alphabetically
* - When an arbitrary variant appears, it must be preserved which modifiers are before and after it
*/
var createSortModifiers = (config) => {
	const modifierWeights = /* @__PURE__ */ new Map();
	config.orderSensitiveModifiers.forEach((mod, index) => {
		modifierWeights.set(mod, 1e6 + index);
	});
	return (modifiers) => {
		const result = [];
		let currentSegment = [];
		for (let i = 0; i < modifiers.length; i++) {
			const modifier = modifiers[i];
			const isArbitrary = modifier[0] === "[";
			const isOrderSensitive = modifierWeights.has(modifier);
			if (isArbitrary || isOrderSensitive) {
				if (currentSegment.length > 0) {
					currentSegment.sort();
					result.push(...currentSegment);
					currentSegment = [];
				}
				result.push(modifier);
			} else currentSegment.push(modifier);
		}
		if (currentSegment.length > 0) {
			currentSegment.sort();
			result.push(...currentSegment);
		}
		return result;
	};
};
var createConfigUtils = (config) => ({
	cache: createLruCache(config.cacheSize),
	parseClassName: createParseClassName(config),
	sortModifiers: createSortModifiers(config),
	postfixLookupClassGroupIds: createPostfixLookupClassGroupIds(config),
	...createClassGroupUtils(config)
});
var createPostfixLookupClassGroupIds = (config) => {
	const lookup = Object.create(null);
	const classGroupIds = config.postfixLookupClassGroups;
	if (classGroupIds) for (let i = 0; i < classGroupIds.length; i++) lookup[classGroupIds[i]] = true;
	return lookup;
};
var SPLIT_CLASSES_REGEX = /\s+/;
var mergeClassList = (classList, configUtils) => {
	const { parseClassName, getClassGroupId, getConflictingClassGroupIds, sortModifiers, postfixLookupClassGroupIds } = configUtils;
	/**
	* Set of classGroupIds in following format:
	* `{importantModifier}{variantModifiers}{classGroupId}`
	* @example 'float'
	* @example 'hover:focus:bg-color'
	* @example 'md:!pr'
	*/
	const classGroupsInConflict = [];
	const classNames = classList.trim().split(SPLIT_CLASSES_REGEX);
	let result = "";
	for (let index = classNames.length - 1; index >= 0; index -= 1) {
		const originalClassName = classNames[index];
		const { isExternal, modifiers, hasImportantModifier, baseClassName, maybePostfixModifierPosition } = parseClassName(originalClassName);
		if (isExternal) {
			result = originalClassName + (result.length > 0 ? " " + result : result);
			continue;
		}
		let hasPostfixModifier = !!maybePostfixModifierPosition;
		let classGroupId;
		if (hasPostfixModifier) {
			classGroupId = getClassGroupId(baseClassName.substring(0, maybePostfixModifierPosition));
			const classGroupIdWithPostfix = classGroupId && postfixLookupClassGroupIds[classGroupId] ? getClassGroupId(baseClassName) : void 0;
			if (classGroupIdWithPostfix && classGroupIdWithPostfix !== classGroupId) {
				classGroupId = classGroupIdWithPostfix;
				hasPostfixModifier = false;
			}
		} else classGroupId = getClassGroupId(baseClassName);
		if (!classGroupId) {
			if (!hasPostfixModifier) {
				result = originalClassName + (result.length > 0 ? " " + result : result);
				continue;
			}
			classGroupId = getClassGroupId(baseClassName);
			if (!classGroupId) {
				result = originalClassName + (result.length > 0 ? " " + result : result);
				continue;
			}
			hasPostfixModifier = false;
		}
		const variantModifier = modifiers.length === 0 ? "" : modifiers.length === 1 ? modifiers[0] : sortModifiers(modifiers).join(":");
		const modifierId = hasImportantModifier ? variantModifier + IMPORTANT_MODIFIER : variantModifier;
		const classId = modifierId + classGroupId;
		if (classGroupsInConflict.indexOf(classId) > -1) continue;
		classGroupsInConflict.push(classId);
		const conflictGroups = getConflictingClassGroupIds(classGroupId, hasPostfixModifier);
		for (let i = 0; i < conflictGroups.length; ++i) {
			const group = conflictGroups[i];
			classGroupsInConflict.push(modifierId + group);
		}
		result = originalClassName + (result.length > 0 ? " " + result : result);
	}
	return result;
};
/**
* The code in this file is copied from https://github.com/lukeed/clsx and modified to suit the needs of tailwind-merge better.
*
* Specifically:
* - Runtime code from https://github.com/lukeed/clsx/blob/v1.2.1/src/index.js
* - TypeScript types from https://github.com/lukeed/clsx/blob/v1.2.1/clsx.d.ts
*
* Original code has MIT license: Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com)
*/
var twJoin = (...classLists) => {
	let index = 0;
	let argument;
	let resolvedValue;
	let string = "";
	while (index < classLists.length) if (argument = classLists[index++]) {
		if (resolvedValue = toValue(argument)) {
			string && (string += " ");
			string += resolvedValue;
		}
	}
	return string;
};
var toValue = (mix) => {
	if (typeof mix === "string") return mix;
	let resolvedValue;
	let string = "";
	for (let k = 0; k < mix.length; k++) if (mix[k]) {
		if (resolvedValue = toValue(mix[k])) {
			string && (string += " ");
			string += resolvedValue;
		}
	}
	return string;
};
var createTailwindMerge = (createConfigFirst, ...createConfigRest) => {
	let configUtils;
	let cacheGet;
	let cacheSet;
	let functionToCall;
	const initTailwindMerge = (classList) => {
		configUtils = createConfigUtils(createConfigRest.reduce((previousConfig, createConfigCurrent) => createConfigCurrent(previousConfig), createConfigFirst()));
		cacheGet = configUtils.cache.get;
		cacheSet = configUtils.cache.set;
		functionToCall = tailwindMerge;
		return tailwindMerge(classList);
	};
	const tailwindMerge = (classList) => {
		const cachedResult = cacheGet(classList);
		if (cachedResult) return cachedResult;
		const result = mergeClassList(classList, configUtils);
		cacheSet(classList, result);
		return result;
	};
	functionToCall = initTailwindMerge;
	return (...args) => functionToCall(twJoin(...args));
};
var fallbackThemeArr = [];
var fromTheme = (key) => {
	const themeGetter = (theme) => theme[key] || fallbackThemeArr;
	themeGetter.isThemeGetter = true;
	return themeGetter;
};
var arbitraryValueRegex = /^\[(?:(\w[\w-]*):)?(.+)\]$/i;
var arbitraryVariableRegex = /^\((?:(\w[\w-]*):)?(.+)\)$/i;
var fractionRegex = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/;
var tshirtUnitRegex = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/;
var lengthUnitRegex = /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/;
var colorFunctionRegex = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/;
var shadowRegex = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/;
var imageRegex = /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/;
var isFraction = (value) => fractionRegex.test(value);
var isNumber = (value) => !!value && !Number.isNaN(Number(value));
var isInteger = (value) => !!value && Number.isInteger(Number(value));
var isPercent = (value) => value.endsWith("%") && isNumber(value.slice(0, -1));
var isTshirtSize = (value) => tshirtUnitRegex.test(value);
var isAny = () => true;
var isLengthOnly = (value) => lengthUnitRegex.test(value) && !colorFunctionRegex.test(value);
var isNever = () => false;
var isShadow = (value) => shadowRegex.test(value);
var isImage = (value) => imageRegex.test(value);
var isAnyNonArbitrary = (value) => !isArbitraryValue(value) && !isArbitraryVariable(value);
var isNamedContainerQuery = (value) => value.startsWith("@container") && (value[10] === "/" && value[11] !== void 0 || value[11] === "s" && value[16] !== void 0 && value.startsWith("-size/", 10) || value[11] === "n" && value[18] !== void 0 && value.startsWith("-normal/", 10));
var isArbitrarySize = (value) => getIsArbitraryValue(value, isLabelSize, isNever);
var isArbitraryValue = (value) => arbitraryValueRegex.test(value);
var isArbitraryLength = (value) => getIsArbitraryValue(value, isLabelLength, isLengthOnly);
var isArbitraryNumber = (value) => getIsArbitraryValue(value, isLabelNumber, isNumber);
var isArbitraryWeight = (value) => getIsArbitraryValue(value, isLabelWeight, isAny);
var isArbitraryFamilyName = (value) => getIsArbitraryValue(value, isLabelFamilyName, isNever);
var isArbitraryPosition = (value) => getIsArbitraryValue(value, isLabelPosition, isNever);
var isArbitraryImage = (value) => getIsArbitraryValue(value, isLabelImage, isImage);
var isArbitraryShadow = (value) => getIsArbitraryValue(value, isLabelShadow, isShadow);
var isArbitraryVariable = (value) => arbitraryVariableRegex.test(value);
var isArbitraryVariableLength = (value) => getIsArbitraryVariable(value, isLabelLength);
var isArbitraryVariableFamilyName = (value) => getIsArbitraryVariable(value, isLabelFamilyName);
var isArbitraryVariablePosition = (value) => getIsArbitraryVariable(value, isLabelPosition);
var isArbitraryVariableSize = (value) => getIsArbitraryVariable(value, isLabelSize);
var isArbitraryVariableImage = (value) => getIsArbitraryVariable(value, isLabelImage);
var isArbitraryVariableShadow = (value) => getIsArbitraryVariable(value, isLabelShadow, true);
var isArbitraryVariableWeight = (value) => getIsArbitraryVariable(value, isLabelWeight, true);
var getIsArbitraryValue = (value, testLabel, testValue) => {
	const result = arbitraryValueRegex.exec(value);
	if (result) {
		if (result[1]) return testLabel(result[1]);
		return testValue(result[2]);
	}
	return false;
};
var getIsArbitraryVariable = (value, testLabel, shouldMatchNoLabel = false) => {
	const result = arbitraryVariableRegex.exec(value);
	if (result) {
		if (result[1]) return testLabel(result[1]);
		return shouldMatchNoLabel;
	}
	return false;
};
var isLabelPosition = (label) => label === "position" || label === "percentage";
var isLabelImage = (label) => label === "image" || label === "url";
var isLabelSize = (label) => label === "length" || label === "size" || label === "bg-size";
var isLabelLength = (label) => label === "length";
var isLabelNumber = (label) => label === "number";
var isLabelFamilyName = (label) => label === "family-name";
var isLabelWeight = (label) => label === "number" || label === "weight";
var isLabelShadow = (label) => label === "shadow";
var getDefaultConfig = () => {
	/**
	* Theme getters for theme variable namespaces
	* @see https://tailwindcss.com/docs/theme#theme-variable-namespaces
	*/
	const themeColor = fromTheme("color");
	const themeFont = fromTheme("font");
	const themeText = fromTheme("text");
	const themeFontWeight = fromTheme("font-weight");
	const themeTracking = fromTheme("tracking");
	const themeLeading = fromTheme("leading");
	const themeBreakpoint = fromTheme("breakpoint");
	const themeContainer = fromTheme("container");
	const themeSpacing = fromTheme("spacing");
	const themeRadius = fromTheme("radius");
	const themeShadow = fromTheme("shadow");
	const themeInsetShadow = fromTheme("inset-shadow");
	const themeTextShadow = fromTheme("text-shadow");
	const themeDropShadow = fromTheme("drop-shadow");
	const themeBlur = fromTheme("blur");
	const themePerspective = fromTheme("perspective");
	const themeAspect = fromTheme("aspect");
	const themeEase = fromTheme("ease");
	const themeAnimate = fromTheme("animate");
	/**
	* Helpers to avoid repeating the same scales
	*
	* We use functions that create a new array every time they're called instead of static arrays.
	* This ensures that users who modify any scale by mutating the array (e.g. with `array.push(element)`) don't accidentally mutate arrays in other parts of the config.
	*/
	const scaleBreak = () => [
		"auto",
		"avoid",
		"all",
		"avoid-page",
		"page",
		"left",
		"right",
		"column"
	];
	const scalePosition = () => [
		"center",
		"top",
		"bottom",
		"left",
		"right",
		"top-left",
		"left-top",
		"top-right",
		"right-top",
		"bottom-right",
		"right-bottom",
		"bottom-left",
		"left-bottom"
	];
	const scalePositionWithArbitrary = () => [
		...scalePosition(),
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleOverflow = () => [
		"auto",
		"hidden",
		"clip",
		"visible",
		"scroll"
	];
	const scaleOverscroll = () => [
		"auto",
		"contain",
		"none"
	];
	const scaleUnambiguousSpacing = () => [
		isArbitraryVariable,
		isArbitraryValue,
		themeSpacing
	];
	const scaleInset = () => [
		isFraction,
		"full",
		"auto",
		...scaleUnambiguousSpacing()
	];
	const scaleGridTemplateColsRows = () => [
		isInteger,
		"none",
		"subgrid",
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleGridColRowStartAndEnd = () => [
		"auto",
		{ span: [
			"full",
			isInteger,
			isArbitraryVariable,
			isArbitraryValue
		] },
		isInteger,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleGridColRowStartOrEnd = () => [
		isInteger,
		"auto",
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleGridAutoColsRows = () => [
		"auto",
		"min",
		"max",
		"fr",
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleAlignPrimaryAxis = () => [
		"start",
		"end",
		"center",
		"between",
		"around",
		"evenly",
		"stretch",
		"baseline",
		"center-safe",
		"end-safe"
	];
	const scaleAlignSecondaryAxis = () => [
		"start",
		"end",
		"center",
		"stretch",
		"center-safe",
		"end-safe"
	];
	const scaleMargin = () => ["auto", ...scaleUnambiguousSpacing()];
	const scaleSizing = () => [
		isFraction,
		"auto",
		"full",
		"dvw",
		"dvh",
		"lvw",
		"lvh",
		"svw",
		"svh",
		"min",
		"max",
		"fit",
		...scaleUnambiguousSpacing()
	];
	const scaleSizingInline = () => [
		isFraction,
		"screen",
		"full",
		"dvw",
		"lvw",
		"svw",
		"min",
		"max",
		"fit",
		...scaleUnambiguousSpacing()
	];
	const scaleSizingBlock = () => [
		isFraction,
		"screen",
		"full",
		"lh",
		"dvh",
		"lvh",
		"svh",
		"min",
		"max",
		"fit",
		...scaleUnambiguousSpacing()
	];
	const scaleColor = () => [
		themeColor,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleBgPosition = () => [
		...scalePosition(),
		isArbitraryVariablePosition,
		isArbitraryPosition,
		{ position: [isArbitraryVariable, isArbitraryValue] }
	];
	const scaleBgRepeat = () => ["no-repeat", { repeat: [
		"",
		"x",
		"y",
		"space",
		"round"
	] }];
	const scaleBgSize = () => [
		"auto",
		"cover",
		"contain",
		isArbitraryVariableSize,
		isArbitrarySize,
		{ size: [isArbitraryVariable, isArbitraryValue] }
	];
	const scaleGradientStopPosition = () => [
		isPercent,
		isArbitraryVariableLength,
		isArbitraryLength
	];
	const scaleRadius = () => [
		"",
		"none",
		"full",
		themeRadius,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleBorderWidth = () => [
		"",
		isNumber,
		isArbitraryVariableLength,
		isArbitraryLength
	];
	const scaleLineStyle = () => [
		"solid",
		"dashed",
		"dotted",
		"double"
	];
	const scaleBlendMode = () => [
		"normal",
		"multiply",
		"screen",
		"overlay",
		"darken",
		"lighten",
		"color-dodge",
		"color-burn",
		"hard-light",
		"soft-light",
		"difference",
		"exclusion",
		"hue",
		"saturation",
		"color",
		"luminosity"
	];
	const scaleMaskImagePosition = () => [
		isNumber,
		isPercent,
		isArbitraryVariablePosition,
		isArbitraryPosition
	];
	const scaleBlur = () => [
		"",
		"none",
		themeBlur,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleRotate = () => [
		"none",
		isNumber,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleScale = () => [
		"none",
		isNumber,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleSkew = () => [
		isNumber,
		isArbitraryVariable,
		isArbitraryValue
	];
	const scaleTranslate = () => [
		isFraction,
		"full",
		...scaleUnambiguousSpacing()
	];
	return {
		cacheSize: 500,
		theme: {
			animate: [
				"spin",
				"ping",
				"pulse",
				"bounce"
			],
			aspect: ["video"],
			blur: [isTshirtSize],
			breakpoint: [isTshirtSize],
			color: [isAny],
			container: [isTshirtSize],
			"drop-shadow": [isTshirtSize],
			ease: [
				"in",
				"out",
				"in-out"
			],
			font: [isAnyNonArbitrary],
			"font-weight": [
				"thin",
				"extralight",
				"light",
				"normal",
				"medium",
				"semibold",
				"bold",
				"extrabold",
				"black"
			],
			"inset-shadow": [isTshirtSize],
			leading: [
				"none",
				"tight",
				"snug",
				"normal",
				"relaxed",
				"loose"
			],
			perspective: [
				"dramatic",
				"near",
				"normal",
				"midrange",
				"distant",
				"none"
			],
			radius: [isTshirtSize],
			shadow: [isTshirtSize],
			spacing: ["px", isNumber],
			text: [isTshirtSize],
			"text-shadow": [isTshirtSize],
			tracking: [
				"tighter",
				"tight",
				"normal",
				"wide",
				"wider",
				"widest"
			]
		},
		classGroups: {
			/**
			* Aspect Ratio
			* @see https://tailwindcss.com/docs/aspect-ratio
			*/
			aspect: [{ aspect: [
				"auto",
				"square",
				isFraction,
				isArbitraryValue,
				isArbitraryVariable,
				themeAspect
			] }],
			/**
			* Container
			* @see https://tailwindcss.com/docs/container
			* @deprecated since Tailwind CSS v4.0.0
			*/
			container: ["container"],
			/**
			* Container Type
			* @see https://tailwindcss.com/docs/responsive-design#container-queries
			*/
			"container-type": [{ "@container": [
				"",
				"normal",
				"size",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Container Name
			* @see https://tailwindcss.com/docs/responsive-design#named-containers
			*/
			"container-named": [isNamedContainerQuery],
			/**
			* Columns
			* @see https://tailwindcss.com/docs/columns
			*/
			columns: [{ columns: [
				isNumber,
				isArbitraryValue,
				isArbitraryVariable,
				themeContainer
			] }],
			/**
			* Break After
			* @see https://tailwindcss.com/docs/break-after
			*/
			"break-after": [{ "break-after": scaleBreak() }],
			/**
			* Break Before
			* @see https://tailwindcss.com/docs/break-before
			*/
			"break-before": [{ "break-before": scaleBreak() }],
			/**
			* Break Inside
			* @see https://tailwindcss.com/docs/break-inside
			*/
			"break-inside": [{ "break-inside": [
				"auto",
				"avoid",
				"avoid-page",
				"avoid-column"
			] }],
			/**
			* Box Decoration Break
			* @see https://tailwindcss.com/docs/box-decoration-break
			*/
			"box-decoration": [{ "box-decoration": ["slice", "clone"] }],
			/**
			* Box Sizing
			* @see https://tailwindcss.com/docs/box-sizing
			*/
			box: [{ box: ["border", "content"] }],
			/**
			* Display
			* @see https://tailwindcss.com/docs/display
			*/
			display: [
				"block",
				"inline-block",
				"inline",
				"flex",
				"inline-flex",
				"table",
				"inline-table",
				"table-caption",
				"table-cell",
				"table-column",
				"table-column-group",
				"table-footer-group",
				"table-header-group",
				"table-row-group",
				"table-row",
				"flow-root",
				"grid",
				"inline-grid",
				"contents",
				"list-item",
				"hidden"
			],
			/**
			* Screen Reader Only
			* @see https://tailwindcss.com/docs/display#screen-reader-only
			*/
			sr: ["sr-only", "not-sr-only"],
			/**
			* Floats
			* @see https://tailwindcss.com/docs/float
			*/
			float: [{ float: [
				"right",
				"left",
				"none",
				"start",
				"end"
			] }],
			/**
			* Clear
			* @see https://tailwindcss.com/docs/clear
			*/
			clear: [{ clear: [
				"left",
				"right",
				"both",
				"none",
				"start",
				"end"
			] }],
			/**
			* Isolation
			* @see https://tailwindcss.com/docs/isolation
			*/
			isolation: ["isolate", "isolation-auto"],
			/**
			* Object Fit
			* @see https://tailwindcss.com/docs/object-fit
			*/
			"object-fit": [{ object: [
				"contain",
				"cover",
				"fill",
				"none",
				"scale-down"
			] }],
			/**
			* Object Position
			* @see https://tailwindcss.com/docs/object-position
			*/
			"object-position": [{ object: scalePositionWithArbitrary() }],
			/**
			* Overflow
			* @see https://tailwindcss.com/docs/overflow
			*/
			overflow: [{ overflow: scaleOverflow() }],
			/**
			* Overflow X
			* @see https://tailwindcss.com/docs/overflow
			*/
			"overflow-x": [{ "overflow-x": scaleOverflow() }],
			/**
			* Overflow Y
			* @see https://tailwindcss.com/docs/overflow
			*/
			"overflow-y": [{ "overflow-y": scaleOverflow() }],
			/**
			* Overscroll Behavior
			* @see https://tailwindcss.com/docs/overscroll-behavior
			*/
			overscroll: [{ overscroll: scaleOverscroll() }],
			/**
			* Overscroll Behavior X
			* @see https://tailwindcss.com/docs/overscroll-behavior
			*/
			"overscroll-x": [{ "overscroll-x": scaleOverscroll() }],
			/**
			* Overscroll Behavior Y
			* @see https://tailwindcss.com/docs/overscroll-behavior
			*/
			"overscroll-y": [{ "overscroll-y": scaleOverscroll() }],
			/**
			* Position
			* @see https://tailwindcss.com/docs/position
			*/
			position: [
				"static",
				"fixed",
				"absolute",
				"relative",
				"sticky"
			],
			/**
			* Inset
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			inset: [{ inset: scaleInset() }],
			/**
			* Inset Inline
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			"inset-x": [{ "inset-x": scaleInset() }],
			/**
			* Inset Block
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			"inset-y": [{ "inset-y": scaleInset() }],
			/**
			* Inset Inline Start
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			* @todo class group will be renamed to `inset-s` in next major release
			*/
			start: [{
				"inset-s": scaleInset(),
				/**
				* @deprecated since Tailwind CSS v4.2.0 in favor of `inset-s-*` utilities.
				* @see https://github.com/tailwindlabs/tailwindcss/pull/19613
				*/
				start: scaleInset()
			}],
			/**
			* Inset Inline End
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			* @todo class group will be renamed to `inset-e` in next major release
			*/
			end: [{
				"inset-e": scaleInset(),
				/**
				* @deprecated since Tailwind CSS v4.2.0 in favor of `inset-e-*` utilities.
				* @see https://github.com/tailwindlabs/tailwindcss/pull/19613
				*/
				end: scaleInset()
			}],
			/**
			* Inset Block Start
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			"inset-bs": [{ "inset-bs": scaleInset() }],
			/**
			* Inset Block End
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			"inset-be": [{ "inset-be": scaleInset() }],
			/**
			* Top
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			top: [{ top: scaleInset() }],
			/**
			* Right
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			right: [{ right: scaleInset() }],
			/**
			* Bottom
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			bottom: [{ bottom: scaleInset() }],
			/**
			* Left
			* @see https://tailwindcss.com/docs/top-right-bottom-left
			*/
			left: [{ left: scaleInset() }],
			/**
			* Visibility
			* @see https://tailwindcss.com/docs/visibility
			*/
			visibility: [
				"visible",
				"invisible",
				"collapse"
			],
			/**
			* Z-Index
			* @see https://tailwindcss.com/docs/z-index
			*/
			z: [{ z: [
				isInteger,
				"auto",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Flex Basis
			* @see https://tailwindcss.com/docs/flex-basis
			*/
			basis: [{ basis: [
				isFraction,
				"full",
				"auto",
				themeContainer,
				...scaleUnambiguousSpacing()
			] }],
			/**
			* Flex Direction
			* @see https://tailwindcss.com/docs/flex-direction
			*/
			"flex-direction": [{ flex: [
				"row",
				"row-reverse",
				"col",
				"col-reverse"
			] }],
			/**
			* Flex Wrap
			* @see https://tailwindcss.com/docs/flex-wrap
			*/
			"flex-wrap": [{ flex: [
				"nowrap",
				"wrap",
				"wrap-reverse"
			] }],
			/**
			* Flex
			* @see https://tailwindcss.com/docs/flex
			*/
			flex: [{ flex: [
				isNumber,
				isFraction,
				"auto",
				"initial",
				"none",
				isArbitraryValue
			] }],
			/**
			* Flex Grow
			* @see https://tailwindcss.com/docs/flex-grow
			*/
			grow: [{ grow: [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Flex Shrink
			* @see https://tailwindcss.com/docs/flex-shrink
			*/
			shrink: [{ shrink: [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Order
			* @see https://tailwindcss.com/docs/order
			*/
			order: [{ order: [
				isInteger,
				"first",
				"last",
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Grid Template Columns
			* @see https://tailwindcss.com/docs/grid-template-columns
			*/
			"grid-cols": [{ "grid-cols": scaleGridTemplateColsRows() }],
			/**
			* Grid Column Start / End
			* @see https://tailwindcss.com/docs/grid-column
			*/
			"col-start-end": [{ col: scaleGridColRowStartAndEnd() }],
			/**
			* Grid Column Start
			* @see https://tailwindcss.com/docs/grid-column
			*/
			"col-start": [{ "col-start": scaleGridColRowStartOrEnd() }],
			/**
			* Grid Column End
			* @see https://tailwindcss.com/docs/grid-column
			*/
			"col-end": [{ "col-end": scaleGridColRowStartOrEnd() }],
			/**
			* Grid Template Rows
			* @see https://tailwindcss.com/docs/grid-template-rows
			*/
			"grid-rows": [{ "grid-rows": scaleGridTemplateColsRows() }],
			/**
			* Grid Row Start / End
			* @see https://tailwindcss.com/docs/grid-row
			*/
			"row-start-end": [{ row: scaleGridColRowStartAndEnd() }],
			/**
			* Grid Row Start
			* @see https://tailwindcss.com/docs/grid-row
			*/
			"row-start": [{ "row-start": scaleGridColRowStartOrEnd() }],
			/**
			* Grid Row End
			* @see https://tailwindcss.com/docs/grid-row
			*/
			"row-end": [{ "row-end": scaleGridColRowStartOrEnd() }],
			/**
			* Grid Auto Flow
			* @see https://tailwindcss.com/docs/grid-auto-flow
			*/
			"grid-flow": [{ "grid-flow": [
				"row",
				"col",
				"dense",
				"row-dense",
				"col-dense"
			] }],
			/**
			* Grid Auto Columns
			* @see https://tailwindcss.com/docs/grid-auto-columns
			*/
			"auto-cols": [{ "auto-cols": scaleGridAutoColsRows() }],
			/**
			* Grid Auto Rows
			* @see https://tailwindcss.com/docs/grid-auto-rows
			*/
			"auto-rows": [{ "auto-rows": scaleGridAutoColsRows() }],
			/**
			* Gap
			* @see https://tailwindcss.com/docs/gap
			*/
			gap: [{ gap: scaleUnambiguousSpacing() }],
			/**
			* Gap X
			* @see https://tailwindcss.com/docs/gap
			*/
			"gap-x": [{ "gap-x": scaleUnambiguousSpacing() }],
			/**
			* Gap Y
			* @see https://tailwindcss.com/docs/gap
			*/
			"gap-y": [{ "gap-y": scaleUnambiguousSpacing() }],
			/**
			* Justify Content
			* @see https://tailwindcss.com/docs/justify-content
			*/
			"justify-content": [{ justify: [...scaleAlignPrimaryAxis(), "normal"] }],
			/**
			* Justify Items
			* @see https://tailwindcss.com/docs/justify-items
			*/
			"justify-items": [{ "justify-items": [...scaleAlignSecondaryAxis(), "normal"] }],
			/**
			* Justify Self
			* @see https://tailwindcss.com/docs/justify-self
			*/
			"justify-self": [{ "justify-self": ["auto", ...scaleAlignSecondaryAxis()] }],
			/**
			* Align Content
			* @see https://tailwindcss.com/docs/align-content
			*/
			"align-content": [{ content: ["normal", ...scaleAlignPrimaryAxis()] }],
			/**
			* Align Items
			* @see https://tailwindcss.com/docs/align-items
			*/
			"align-items": [{ items: [...scaleAlignSecondaryAxis(), { baseline: ["", "last"] }] }],
			/**
			* Align Self
			* @see https://tailwindcss.com/docs/align-self
			*/
			"align-self": [{ self: [
				"auto",
				...scaleAlignSecondaryAxis(),
				{ baseline: ["", "last"] }
			] }],
			/**
			* Place Content
			* @see https://tailwindcss.com/docs/place-content
			*/
			"place-content": [{ "place-content": scaleAlignPrimaryAxis() }],
			/**
			* Place Items
			* @see https://tailwindcss.com/docs/place-items
			*/
			"place-items": [{ "place-items": [...scaleAlignSecondaryAxis(), "baseline"] }],
			/**
			* Place Self
			* @see https://tailwindcss.com/docs/place-self
			*/
			"place-self": [{ "place-self": ["auto", ...scaleAlignSecondaryAxis()] }],
			/**
			* Padding
			* @see https://tailwindcss.com/docs/padding
			*/
			p: [{ p: scaleUnambiguousSpacing() }],
			/**
			* Padding Inline
			* @see https://tailwindcss.com/docs/padding
			*/
			px: [{ px: scaleUnambiguousSpacing() }],
			/**
			* Padding Block
			* @see https://tailwindcss.com/docs/padding
			*/
			py: [{ py: scaleUnambiguousSpacing() }],
			/**
			* Padding Inline Start
			* @see https://tailwindcss.com/docs/padding
			*/
			ps: [{ ps: scaleUnambiguousSpacing() }],
			/**
			* Padding Inline End
			* @see https://tailwindcss.com/docs/padding
			*/
			pe: [{ pe: scaleUnambiguousSpacing() }],
			/**
			* Padding Block Start
			* @see https://tailwindcss.com/docs/padding
			*/
			pbs: [{ pbs: scaleUnambiguousSpacing() }],
			/**
			* Padding Block End
			* @see https://tailwindcss.com/docs/padding
			*/
			pbe: [{ pbe: scaleUnambiguousSpacing() }],
			/**
			* Padding Top
			* @see https://tailwindcss.com/docs/padding
			*/
			pt: [{ pt: scaleUnambiguousSpacing() }],
			/**
			* Padding Right
			* @see https://tailwindcss.com/docs/padding
			*/
			pr: [{ pr: scaleUnambiguousSpacing() }],
			/**
			* Padding Bottom
			* @see https://tailwindcss.com/docs/padding
			*/
			pb: [{ pb: scaleUnambiguousSpacing() }],
			/**
			* Padding Left
			* @see https://tailwindcss.com/docs/padding
			*/
			pl: [{ pl: scaleUnambiguousSpacing() }],
			/**
			* Margin
			* @see https://tailwindcss.com/docs/margin
			*/
			m: [{ m: scaleMargin() }],
			/**
			* Margin Inline
			* @see https://tailwindcss.com/docs/margin
			*/
			mx: [{ mx: scaleMargin() }],
			/**
			* Margin Block
			* @see https://tailwindcss.com/docs/margin
			*/
			my: [{ my: scaleMargin() }],
			/**
			* Margin Inline Start
			* @see https://tailwindcss.com/docs/margin
			*/
			ms: [{ ms: scaleMargin() }],
			/**
			* Margin Inline End
			* @see https://tailwindcss.com/docs/margin
			*/
			me: [{ me: scaleMargin() }],
			/**
			* Margin Block Start
			* @see https://tailwindcss.com/docs/margin
			*/
			mbs: [{ mbs: scaleMargin() }],
			/**
			* Margin Block End
			* @see https://tailwindcss.com/docs/margin
			*/
			mbe: [{ mbe: scaleMargin() }],
			/**
			* Margin Top
			* @see https://tailwindcss.com/docs/margin
			*/
			mt: [{ mt: scaleMargin() }],
			/**
			* Margin Right
			* @see https://tailwindcss.com/docs/margin
			*/
			mr: [{ mr: scaleMargin() }],
			/**
			* Margin Bottom
			* @see https://tailwindcss.com/docs/margin
			*/
			mb: [{ mb: scaleMargin() }],
			/**
			* Margin Left
			* @see https://tailwindcss.com/docs/margin
			*/
			ml: [{ ml: scaleMargin() }],
			/**
			* Space Between X
			* @see https://tailwindcss.com/docs/margin#adding-space-between-children
			*/
			"space-x": [{ "space-x": scaleUnambiguousSpacing() }],
			/**
			* Space Between X Reverse
			* @see https://tailwindcss.com/docs/margin#adding-space-between-children
			*/
			"space-x-reverse": ["space-x-reverse"],
			/**
			* Space Between Y
			* @see https://tailwindcss.com/docs/margin#adding-space-between-children
			*/
			"space-y": [{ "space-y": scaleUnambiguousSpacing() }],
			/**
			* Space Between Y Reverse
			* @see https://tailwindcss.com/docs/margin#adding-space-between-children
			*/
			"space-y-reverse": ["space-y-reverse"],
			/**
			* Size
			* @see https://tailwindcss.com/docs/width#setting-both-width-and-height
			*/
			size: [{ size: scaleSizing() }],
			/**
			* Inline Size
			* @see https://tailwindcss.com/docs/width
			*/
			"inline-size": [{ inline: ["auto", ...scaleSizingInline()] }],
			/**
			* Min-Inline Size
			* @see https://tailwindcss.com/docs/min-width
			*/
			"min-inline-size": [{ "min-inline": ["auto", ...scaleSizingInline()] }],
			/**
			* Max-Inline Size
			* @see https://tailwindcss.com/docs/max-width
			*/
			"max-inline-size": [{ "max-inline": ["none", ...scaleSizingInline()] }],
			/**
			* Block Size
			* @see https://tailwindcss.com/docs/height
			*/
			"block-size": [{ block: ["auto", ...scaleSizingBlock()] }],
			/**
			* Min-Block Size
			* @see https://tailwindcss.com/docs/min-height
			*/
			"min-block-size": [{ "min-block": ["auto", ...scaleSizingBlock()] }],
			/**
			* Max-Block Size
			* @see https://tailwindcss.com/docs/max-height
			*/
			"max-block-size": [{ "max-block": ["none", ...scaleSizingBlock()] }],
			/**
			* Width
			* @see https://tailwindcss.com/docs/width
			*/
			w: [{ w: [
				themeContainer,
				"screen",
				...scaleSizing()
			] }],
			/**
			* Min-Width
			* @see https://tailwindcss.com/docs/min-width
			*/
			"min-w": [{ "min-w": [
				themeContainer,
				"screen",
				"none",
				...scaleSizing()
			] }],
			/**
			* Max-Width
			* @see https://tailwindcss.com/docs/max-width
			*/
			"max-w": [{ "max-w": [
				themeContainer,
				"screen",
				"none",
				"prose",
				{ screen: [themeBreakpoint] },
				...scaleSizing()
			] }],
			/**
			* Height
			* @see https://tailwindcss.com/docs/height
			*/
			h: [{ h: [
				"screen",
				"lh",
				...scaleSizing()
			] }],
			/**
			* Min-Height
			* @see https://tailwindcss.com/docs/min-height
			*/
			"min-h": [{ "min-h": [
				"screen",
				"lh",
				"none",
				...scaleSizing()
			] }],
			/**
			* Max-Height
			* @see https://tailwindcss.com/docs/max-height
			*/
			"max-h": [{ "max-h": [
				"screen",
				"lh",
				...scaleSizing()
			] }],
			/**
			* Font Size
			* @see https://tailwindcss.com/docs/font-size
			*/
			"font-size": [{ text: [
				"base",
				themeText,
				isArbitraryVariableLength,
				isArbitraryLength
			] }],
			/**
			* Font Smoothing
			* @see https://tailwindcss.com/docs/font-smoothing
			*/
			"font-smoothing": ["antialiased", "subpixel-antialiased"],
			/**
			* Font Style
			* @see https://tailwindcss.com/docs/font-style
			*/
			"font-style": ["italic", "not-italic"],
			/**
			* Font Weight
			* @see https://tailwindcss.com/docs/font-weight
			*/
			"font-weight": [{ font: [
				themeFontWeight,
				isArbitraryVariableWeight,
				isArbitraryWeight
			] }],
			/**
			* Font Stretch
			* @see https://tailwindcss.com/docs/font-stretch
			*/
			"font-stretch": [{ "font-stretch": [
				"ultra-condensed",
				"extra-condensed",
				"condensed",
				"semi-condensed",
				"normal",
				"semi-expanded",
				"expanded",
				"extra-expanded",
				"ultra-expanded",
				isPercent,
				isArbitraryValue
			] }],
			/**
			* Font Family
			* @see https://tailwindcss.com/docs/font-family
			*/
			"font-family": [{ font: [
				isArbitraryVariableFamilyName,
				isArbitraryFamilyName,
				themeFont
			] }],
			/**
			* Font Feature Settings
			* @see https://tailwindcss.com/docs/font-feature-settings
			*/
			"font-features": [{ "font-features": [isArbitraryValue] }],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-normal": ["normal-nums"],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-ordinal": ["ordinal"],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-slashed-zero": ["slashed-zero"],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-figure": ["lining-nums", "oldstyle-nums"],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-spacing": ["proportional-nums", "tabular-nums"],
			/**
			* Font Variant Numeric
			* @see https://tailwindcss.com/docs/font-variant-numeric
			*/
			"fvn-fraction": ["diagonal-fractions", "stacked-fractions"],
			/**
			* Letter Spacing
			* @see https://tailwindcss.com/docs/letter-spacing
			*/
			tracking: [{ tracking: [
				themeTracking,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Line Clamp
			* @see https://tailwindcss.com/docs/line-clamp
			*/
			"line-clamp": [{ "line-clamp": [
				isNumber,
				"none",
				isArbitraryVariable,
				isArbitraryNumber
			] }],
			/**
			* Line Height
			* @see https://tailwindcss.com/docs/line-height
			*/
			leading: [{ leading: [themeLeading, ...scaleUnambiguousSpacing()] }],
			/**
			* List Style Image
			* @see https://tailwindcss.com/docs/list-style-image
			*/
			"list-image": [{ "list-image": [
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* List Style Position
			* @see https://tailwindcss.com/docs/list-style-position
			*/
			"list-style-position": [{ list: ["inside", "outside"] }],
			/**
			* List Style Type
			* @see https://tailwindcss.com/docs/list-style-type
			*/
			"list-style-type": [{ list: [
				"disc",
				"decimal",
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Text Alignment
			* @see https://tailwindcss.com/docs/text-align
			*/
			"text-alignment": [{ text: [
				"left",
				"center",
				"right",
				"justify",
				"start",
				"end"
			] }],
			/**
			* Placeholder Color
			* @deprecated since Tailwind CSS v3.0.0
			* @see https://v3.tailwindcss.com/docs/placeholder-color
			*/
			"placeholder-color": [{ placeholder: scaleColor() }],
			/**
			* Text Color
			* @see https://tailwindcss.com/docs/text-color
			*/
			"text-color": [{ text: scaleColor() }],
			/**
			* Text Decoration
			* @see https://tailwindcss.com/docs/text-decoration
			*/
			"text-decoration": [
				"underline",
				"overline",
				"line-through",
				"no-underline"
			],
			/**
			* Text Decoration Style
			* @see https://tailwindcss.com/docs/text-decoration-style
			*/
			"text-decoration-style": [{ decoration: [...scaleLineStyle(), "wavy"] }],
			/**
			* Text Decoration Thickness
			* @see https://tailwindcss.com/docs/text-decoration-thickness
			*/
			"text-decoration-thickness": [{ decoration: [
				isNumber,
				"from-font",
				"auto",
				isArbitraryVariable,
				isArbitraryLength
			] }],
			/**
			* Text Decoration Color
			* @see https://tailwindcss.com/docs/text-decoration-color
			*/
			"text-decoration-color": [{ decoration: scaleColor() }],
			/**
			* Text Underline Offset
			* @see https://tailwindcss.com/docs/text-underline-offset
			*/
			"underline-offset": [{ "underline-offset": [
				isNumber,
				"auto",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Text Transform
			* @see https://tailwindcss.com/docs/text-transform
			*/
			"text-transform": [
				"uppercase",
				"lowercase",
				"capitalize",
				"normal-case"
			],
			/**
			* Text Overflow
			* @see https://tailwindcss.com/docs/text-overflow
			*/
			"text-overflow": [
				"truncate",
				"text-ellipsis",
				"text-clip"
			],
			/**
			* Text Wrap
			* @see https://tailwindcss.com/docs/text-wrap
			*/
			"text-wrap": [{ text: [
				"wrap",
				"nowrap",
				"balance",
				"pretty"
			] }],
			/**
			* Text Indent
			* @see https://tailwindcss.com/docs/text-indent
			*/
			indent: [{ indent: scaleUnambiguousSpacing() }],
			/**
			* Tab Size
			* @see https://tailwindcss.com/docs/tab-size
			*/
			"tab-size": [{ tab: [
				isInteger,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Vertical Alignment
			* @see https://tailwindcss.com/docs/vertical-align
			*/
			"vertical-align": [{ align: [
				"baseline",
				"top",
				"middle",
				"bottom",
				"text-top",
				"text-bottom",
				"sub",
				"super",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Whitespace
			* @see https://tailwindcss.com/docs/whitespace
			*/
			whitespace: [{ whitespace: [
				"normal",
				"nowrap",
				"pre",
				"pre-line",
				"pre-wrap",
				"break-spaces"
			] }],
			/**
			* Word Break
			* @see https://tailwindcss.com/docs/word-break
			*/
			break: [{ break: [
				"normal",
				"words",
				"all",
				"keep"
			] }],
			/**
			* Overflow Wrap
			* @see https://tailwindcss.com/docs/overflow-wrap
			*/
			wrap: [{ wrap: [
				"break-word",
				"anywhere",
				"normal"
			] }],
			/**
			* Hyphens
			* @see https://tailwindcss.com/docs/hyphens
			*/
			hyphens: [{ hyphens: [
				"none",
				"manual",
				"auto"
			] }],
			/**
			* Content
			* @see https://tailwindcss.com/docs/content
			*/
			content: [{ content: [
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Background Attachment
			* @see https://tailwindcss.com/docs/background-attachment
			*/
			"bg-attachment": [{ bg: [
				"fixed",
				"local",
				"scroll"
			] }],
			/**
			* Background Clip
			* @see https://tailwindcss.com/docs/background-clip
			*/
			"bg-clip": [{ "bg-clip": [
				"border",
				"padding",
				"content",
				"text"
			] }],
			/**
			* Background Origin
			* @see https://tailwindcss.com/docs/background-origin
			*/
			"bg-origin": [{ "bg-origin": [
				"border",
				"padding",
				"content"
			] }],
			/**
			* Background Position
			* @see https://tailwindcss.com/docs/background-position
			*/
			"bg-position": [{ bg: scaleBgPosition() }],
			/**
			* Background Repeat
			* @see https://tailwindcss.com/docs/background-repeat
			*/
			"bg-repeat": [{ bg: scaleBgRepeat() }],
			/**
			* Background Size
			* @see https://tailwindcss.com/docs/background-size
			*/
			"bg-size": [{ bg: scaleBgSize() }],
			/**
			* Background Image
			* @see https://tailwindcss.com/docs/background-image
			*/
			"bg-image": [{ bg: [
				"none",
				{
					linear: [
						{ to: [
							"t",
							"tr",
							"r",
							"br",
							"b",
							"bl",
							"l",
							"tl"
						] },
						isInteger,
						isArbitraryVariable,
						isArbitraryValue
					],
					radial: [
						"",
						isArbitraryVariable,
						isArbitraryValue
					],
					conic: [
						isInteger,
						isArbitraryVariable,
						isArbitraryValue
					]
				},
				isArbitraryVariableImage,
				isArbitraryImage
			] }],
			/**
			* Background Color
			* @see https://tailwindcss.com/docs/background-color
			*/
			"bg-color": [{ bg: scaleColor() }],
			/**
			* Gradient Color Stops From Position
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-from-pos": [{ from: scaleGradientStopPosition() }],
			/**
			* Gradient Color Stops Via Position
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-via-pos": [{ via: scaleGradientStopPosition() }],
			/**
			* Gradient Color Stops To Position
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-to-pos": [{ to: scaleGradientStopPosition() }],
			/**
			* Gradient Color Stops From
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-from": [{ from: scaleColor() }],
			/**
			* Gradient Color Stops Via
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-via": [{ via: scaleColor() }],
			/**
			* Gradient Color Stops To
			* @see https://tailwindcss.com/docs/gradient-color-stops
			*/
			"gradient-to": [{ to: scaleColor() }],
			/**
			* Border Radius
			* @see https://tailwindcss.com/docs/border-radius
			*/
			rounded: [{ rounded: scaleRadius() }],
			/**
			* Border Radius Start
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-s": [{ "rounded-s": scaleRadius() }],
			/**
			* Border Radius End
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-e": [{ "rounded-e": scaleRadius() }],
			/**
			* Border Radius Top
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-t": [{ "rounded-t": scaleRadius() }],
			/**
			* Border Radius Right
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-r": [{ "rounded-r": scaleRadius() }],
			/**
			* Border Radius Bottom
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-b": [{ "rounded-b": scaleRadius() }],
			/**
			* Border Radius Left
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-l": [{ "rounded-l": scaleRadius() }],
			/**
			* Border Radius Start Start
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-ss": [{ "rounded-ss": scaleRadius() }],
			/**
			* Border Radius Start End
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-se": [{ "rounded-se": scaleRadius() }],
			/**
			* Border Radius End End
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-ee": [{ "rounded-ee": scaleRadius() }],
			/**
			* Border Radius End Start
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-es": [{ "rounded-es": scaleRadius() }],
			/**
			* Border Radius Top Left
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-tl": [{ "rounded-tl": scaleRadius() }],
			/**
			* Border Radius Top Right
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-tr": [{ "rounded-tr": scaleRadius() }],
			/**
			* Border Radius Bottom Right
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-br": [{ "rounded-br": scaleRadius() }],
			/**
			* Border Radius Bottom Left
			* @see https://tailwindcss.com/docs/border-radius
			*/
			"rounded-bl": [{ "rounded-bl": scaleRadius() }],
			/**
			* Border Width
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w": [{ border: scaleBorderWidth() }],
			/**
			* Border Width Inline
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-x": [{ "border-x": scaleBorderWidth() }],
			/**
			* Border Width Block
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-y": [{ "border-y": scaleBorderWidth() }],
			/**
			* Border Width Inline Start
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-s": [{ "border-s": scaleBorderWidth() }],
			/**
			* Border Width Inline End
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-e": [{ "border-e": scaleBorderWidth() }],
			/**
			* Border Width Block Start
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-bs": [{ "border-bs": scaleBorderWidth() }],
			/**
			* Border Width Block End
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-be": [{ "border-be": scaleBorderWidth() }],
			/**
			* Border Width Top
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-t": [{ "border-t": scaleBorderWidth() }],
			/**
			* Border Width Right
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-r": [{ "border-r": scaleBorderWidth() }],
			/**
			* Border Width Bottom
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-b": [{ "border-b": scaleBorderWidth() }],
			/**
			* Border Width Left
			* @see https://tailwindcss.com/docs/border-width
			*/
			"border-w-l": [{ "border-l": scaleBorderWidth() }],
			/**
			* Divide Width X
			* @see https://tailwindcss.com/docs/border-width#between-children
			*/
			"divide-x": [{ "divide-x": scaleBorderWidth() }],
			/**
			* Divide Width X Reverse
			* @see https://tailwindcss.com/docs/border-width#between-children
			*/
			"divide-x-reverse": ["divide-x-reverse"],
			/**
			* Divide Width Y
			* @see https://tailwindcss.com/docs/border-width#between-children
			*/
			"divide-y": [{ "divide-y": scaleBorderWidth() }],
			/**
			* Divide Width Y Reverse
			* @see https://tailwindcss.com/docs/border-width#between-children
			*/
			"divide-y-reverse": ["divide-y-reverse"],
			/**
			* Border Style
			* @see https://tailwindcss.com/docs/border-style
			*/
			"border-style": [{ border: [
				...scaleLineStyle(),
				"hidden",
				"none"
			] }],
			/**
			* Divide Style
			* @see https://tailwindcss.com/docs/border-style#setting-the-divider-style
			*/
			"divide-style": [{ divide: [
				...scaleLineStyle(),
				"hidden",
				"none"
			] }],
			/**
			* Border Color
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color": [{ border: scaleColor() }],
			/**
			* Border Color Inline
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-x": [{ "border-x": scaleColor() }],
			/**
			* Border Color Block
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-y": [{ "border-y": scaleColor() }],
			/**
			* Border Color Inline Start
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-s": [{ "border-s": scaleColor() }],
			/**
			* Border Color Inline End
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-e": [{ "border-e": scaleColor() }],
			/**
			* Border Color Block Start
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-bs": [{ "border-bs": scaleColor() }],
			/**
			* Border Color Block End
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-be": [{ "border-be": scaleColor() }],
			/**
			* Border Color Top
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-t": [{ "border-t": scaleColor() }],
			/**
			* Border Color Right
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-r": [{ "border-r": scaleColor() }],
			/**
			* Border Color Bottom
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-b": [{ "border-b": scaleColor() }],
			/**
			* Border Color Left
			* @see https://tailwindcss.com/docs/border-color
			*/
			"border-color-l": [{ "border-l": scaleColor() }],
			/**
			* Divide Color
			* @see https://tailwindcss.com/docs/divide-color
			*/
			"divide-color": [{ divide: scaleColor() }],
			/**
			* Outline Style
			* @see https://tailwindcss.com/docs/outline-style
			*/
			"outline-style": [{ outline: [
				...scaleLineStyle(),
				"none",
				"hidden"
			] }],
			/**
			* Outline Offset
			* @see https://tailwindcss.com/docs/outline-offset
			*/
			"outline-offset": [{ "outline-offset": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Outline Width
			* @see https://tailwindcss.com/docs/outline-width
			*/
			"outline-w": [{ outline: [
				"",
				isNumber,
				isArbitraryVariableLength,
				isArbitraryLength
			] }],
			/**
			* Outline Color
			* @see https://tailwindcss.com/docs/outline-color
			*/
			"outline-color": [{ outline: scaleColor() }],
			/**
			* Box Shadow
			* @see https://tailwindcss.com/docs/box-shadow
			*/
			shadow: [{ shadow: [
				"",
				"none",
				themeShadow,
				isArbitraryVariableShadow,
				isArbitraryShadow
			] }],
			/**
			* Box Shadow Color
			* @see https://tailwindcss.com/docs/box-shadow#setting-the-shadow-color
			*/
			"shadow-color": [{ shadow: scaleColor() }],
			/**
			* Inset Box Shadow
			* @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-shadow
			*/
			"inset-shadow": [{ "inset-shadow": [
				"none",
				themeInsetShadow,
				isArbitraryVariableShadow,
				isArbitraryShadow
			] }],
			/**
			* Inset Box Shadow Color
			* @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-shadow-color
			*/
			"inset-shadow-color": [{ "inset-shadow": scaleColor() }],
			/**
			* Ring Width
			* @see https://tailwindcss.com/docs/box-shadow#adding-a-ring
			*/
			"ring-w": [{ ring: scaleBorderWidth() }],
			/**
			* Ring Width Inset
			* @see https://v3.tailwindcss.com/docs/ring-width#inset-rings
			* @deprecated since Tailwind CSS v4.0.0
			* @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
			*/
			"ring-w-inset": ["ring-inset"],
			/**
			* Ring Color
			* @see https://tailwindcss.com/docs/box-shadow#setting-the-ring-color
			*/
			"ring-color": [{ ring: scaleColor() }],
			/**
			* Ring Offset Width
			* @see https://v3.tailwindcss.com/docs/ring-offset-width
			* @deprecated since Tailwind CSS v4.0.0
			* @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
			*/
			"ring-offset-w": [{ "ring-offset": [isNumber, isArbitraryLength] }],
			/**
			* Ring Offset Color
			* @see https://v3.tailwindcss.com/docs/ring-offset-color
			* @deprecated since Tailwind CSS v4.0.0
			* @see https://github.com/tailwindlabs/tailwindcss/blob/v4.0.0/packages/tailwindcss/src/utilities.ts#L4158
			*/
			"ring-offset-color": [{ "ring-offset": scaleColor() }],
			/**
			* Inset Ring Width
			* @see https://tailwindcss.com/docs/box-shadow#adding-an-inset-ring
			*/
			"inset-ring-w": [{ "inset-ring": scaleBorderWidth() }],
			/**
			* Inset Ring Color
			* @see https://tailwindcss.com/docs/box-shadow#setting-the-inset-ring-color
			*/
			"inset-ring-color": [{ "inset-ring": scaleColor() }],
			/**
			* Text Shadow
			* @see https://tailwindcss.com/docs/text-shadow
			*/
			"text-shadow": [{ "text-shadow": [
				"none",
				themeTextShadow,
				isArbitraryVariableShadow,
				isArbitraryShadow
			] }],
			/**
			* Text Shadow Color
			* @see https://tailwindcss.com/docs/text-shadow#setting-the-shadow-color
			*/
			"text-shadow-color": [{ "text-shadow": scaleColor() }],
			/**
			* Opacity
			* @see https://tailwindcss.com/docs/opacity
			*/
			opacity: [{ opacity: [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Mix Blend Mode
			* @see https://tailwindcss.com/docs/mix-blend-mode
			*/
			"mix-blend": [{ "mix-blend": [
				...scaleBlendMode(),
				"plus-darker",
				"plus-lighter"
			] }],
			/**
			* Background Blend Mode
			* @see https://tailwindcss.com/docs/background-blend-mode
			*/
			"bg-blend": [{ "bg-blend": scaleBlendMode() }],
			/**
			* Mask Clip
			* @see https://tailwindcss.com/docs/mask-clip
			*/
			"mask-clip": [{ "mask-clip": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }, "mask-no-clip"],
			/**
			* Mask Composite
			* @see https://tailwindcss.com/docs/mask-composite
			*/
			"mask-composite": [{ mask: [
				"add",
				"subtract",
				"intersect",
				"exclude"
			] }],
			/**
			* Mask Image
			* @see https://tailwindcss.com/docs/mask-image
			*/
			"mask-image-linear-pos": [{ "mask-linear": [isNumber] }],
			"mask-image-linear-from-pos": [{ "mask-linear-from": scaleMaskImagePosition() }],
			"mask-image-linear-to-pos": [{ "mask-linear-to": scaleMaskImagePosition() }],
			"mask-image-linear-from-color": [{ "mask-linear-from": scaleColor() }],
			"mask-image-linear-to-color": [{ "mask-linear-to": scaleColor() }],
			"mask-image-t-from-pos": [{ "mask-t-from": scaleMaskImagePosition() }],
			"mask-image-t-to-pos": [{ "mask-t-to": scaleMaskImagePosition() }],
			"mask-image-t-from-color": [{ "mask-t-from": scaleColor() }],
			"mask-image-t-to-color": [{ "mask-t-to": scaleColor() }],
			"mask-image-r-from-pos": [{ "mask-r-from": scaleMaskImagePosition() }],
			"mask-image-r-to-pos": [{ "mask-r-to": scaleMaskImagePosition() }],
			"mask-image-r-from-color": [{ "mask-r-from": scaleColor() }],
			"mask-image-r-to-color": [{ "mask-r-to": scaleColor() }],
			"mask-image-b-from-pos": [{ "mask-b-from": scaleMaskImagePosition() }],
			"mask-image-b-to-pos": [{ "mask-b-to": scaleMaskImagePosition() }],
			"mask-image-b-from-color": [{ "mask-b-from": scaleColor() }],
			"mask-image-b-to-color": [{ "mask-b-to": scaleColor() }],
			"mask-image-l-from-pos": [{ "mask-l-from": scaleMaskImagePosition() }],
			"mask-image-l-to-pos": [{ "mask-l-to": scaleMaskImagePosition() }],
			"mask-image-l-from-color": [{ "mask-l-from": scaleColor() }],
			"mask-image-l-to-color": [{ "mask-l-to": scaleColor() }],
			"mask-image-x-from-pos": [{ "mask-x-from": scaleMaskImagePosition() }],
			"mask-image-x-to-pos": [{ "mask-x-to": scaleMaskImagePosition() }],
			"mask-image-x-from-color": [{ "mask-x-from": scaleColor() }],
			"mask-image-x-to-color": [{ "mask-x-to": scaleColor() }],
			"mask-image-y-from-pos": [{ "mask-y-from": scaleMaskImagePosition() }],
			"mask-image-y-to-pos": [{ "mask-y-to": scaleMaskImagePosition() }],
			"mask-image-y-from-color": [{ "mask-y-from": scaleColor() }],
			"mask-image-y-to-color": [{ "mask-y-to": scaleColor() }],
			"mask-image-radial": [{ "mask-radial": [isArbitraryVariable, isArbitraryValue] }],
			"mask-image-radial-from-pos": [{ "mask-radial-from": scaleMaskImagePosition() }],
			"mask-image-radial-to-pos": [{ "mask-radial-to": scaleMaskImagePosition() }],
			"mask-image-radial-from-color": [{ "mask-radial-from": scaleColor() }],
			"mask-image-radial-to-color": [{ "mask-radial-to": scaleColor() }],
			"mask-image-radial-shape": [{ "mask-radial": ["circle", "ellipse"] }],
			"mask-image-radial-size": [{ "mask-radial": [{
				closest: ["side", "corner"],
				farthest: ["side", "corner"]
			}] }],
			"mask-image-radial-pos": [{ "mask-radial-at": scalePosition() }],
			"mask-image-conic-pos": [{ "mask-conic": [isNumber] }],
			"mask-image-conic-from-pos": [{ "mask-conic-from": scaleMaskImagePosition() }],
			"mask-image-conic-to-pos": [{ "mask-conic-to": scaleMaskImagePosition() }],
			"mask-image-conic-from-color": [{ "mask-conic-from": scaleColor() }],
			"mask-image-conic-to-color": [{ "mask-conic-to": scaleColor() }],
			/**
			* Mask Mode
			* @see https://tailwindcss.com/docs/mask-mode
			*/
			"mask-mode": [{ mask: [
				"alpha",
				"luminance",
				"match"
			] }],
			/**
			* Mask Origin
			* @see https://tailwindcss.com/docs/mask-origin
			*/
			"mask-origin": [{ "mask-origin": [
				"border",
				"padding",
				"content",
				"fill",
				"stroke",
				"view"
			] }],
			/**
			* Mask Position
			* @see https://tailwindcss.com/docs/mask-position
			*/
			"mask-position": [{ mask: scaleBgPosition() }],
			/**
			* Mask Repeat
			* @see https://tailwindcss.com/docs/mask-repeat
			*/
			"mask-repeat": [{ mask: scaleBgRepeat() }],
			/**
			* Mask Size
			* @see https://tailwindcss.com/docs/mask-size
			*/
			"mask-size": [{ mask: scaleBgSize() }],
			/**
			* Mask Type
			* @see https://tailwindcss.com/docs/mask-type
			*/
			"mask-type": [{ "mask-type": ["alpha", "luminance"] }],
			/**
			* Mask Image
			* @see https://tailwindcss.com/docs/mask-image
			*/
			"mask-image": [{ mask: [
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Filter
			* @see https://tailwindcss.com/docs/filter
			*/
			filter: [{ filter: [
				"",
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Blur
			* @see https://tailwindcss.com/docs/blur
			*/
			blur: [{ blur: scaleBlur() }],
			/**
			* Brightness
			* @see https://tailwindcss.com/docs/brightness
			*/
			brightness: [{ brightness: [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Contrast
			* @see https://tailwindcss.com/docs/contrast
			*/
			contrast: [{ contrast: [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Drop Shadow
			* @see https://tailwindcss.com/docs/drop-shadow
			*/
			"drop-shadow": [{ "drop-shadow": [
				"",
				"none",
				themeDropShadow,
				isArbitraryVariableShadow,
				isArbitraryShadow
			] }],
			/**
			* Drop Shadow Color
			* @see https://tailwindcss.com/docs/filter-drop-shadow#setting-the-shadow-color
			*/
			"drop-shadow-color": [{ "drop-shadow": scaleColor() }],
			/**
			* Grayscale
			* @see https://tailwindcss.com/docs/grayscale
			*/
			grayscale: [{ grayscale: [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Hue Rotate
			* @see https://tailwindcss.com/docs/hue-rotate
			*/
			"hue-rotate": [{ "hue-rotate": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Invert
			* @see https://tailwindcss.com/docs/invert
			*/
			invert: [{ invert: [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Saturate
			* @see https://tailwindcss.com/docs/saturate
			*/
			saturate: [{ saturate: [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Sepia
			* @see https://tailwindcss.com/docs/sepia
			*/
			sepia: [{ sepia: [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Filter
			* @see https://tailwindcss.com/docs/backdrop-filter
			*/
			"backdrop-filter": [{ "backdrop-filter": [
				"",
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Blur
			* @see https://tailwindcss.com/docs/backdrop-blur
			*/
			"backdrop-blur": [{ "backdrop-blur": scaleBlur() }],
			/**
			* Backdrop Brightness
			* @see https://tailwindcss.com/docs/backdrop-brightness
			*/
			"backdrop-brightness": [{ "backdrop-brightness": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Contrast
			* @see https://tailwindcss.com/docs/backdrop-contrast
			*/
			"backdrop-contrast": [{ "backdrop-contrast": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Grayscale
			* @see https://tailwindcss.com/docs/backdrop-grayscale
			*/
			"backdrop-grayscale": [{ "backdrop-grayscale": [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Hue Rotate
			* @see https://tailwindcss.com/docs/backdrop-hue-rotate
			*/
			"backdrop-hue-rotate": [{ "backdrop-hue-rotate": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Invert
			* @see https://tailwindcss.com/docs/backdrop-invert
			*/
			"backdrop-invert": [{ "backdrop-invert": [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Opacity
			* @see https://tailwindcss.com/docs/backdrop-opacity
			*/
			"backdrop-opacity": [{ "backdrop-opacity": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Saturate
			* @see https://tailwindcss.com/docs/backdrop-saturate
			*/
			"backdrop-saturate": [{ "backdrop-saturate": [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backdrop Sepia
			* @see https://tailwindcss.com/docs/backdrop-sepia
			*/
			"backdrop-sepia": [{ "backdrop-sepia": [
				"",
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Border Collapse
			* @see https://tailwindcss.com/docs/border-collapse
			*/
			"border-collapse": [{ border: ["collapse", "separate"] }],
			/**
			* Border Spacing
			* @see https://tailwindcss.com/docs/border-spacing
			*/
			"border-spacing": [{ "border-spacing": scaleUnambiguousSpacing() }],
			/**
			* Border Spacing X
			* @see https://tailwindcss.com/docs/border-spacing
			*/
			"border-spacing-x": [{ "border-spacing-x": scaleUnambiguousSpacing() }],
			/**
			* Border Spacing Y
			* @see https://tailwindcss.com/docs/border-spacing
			*/
			"border-spacing-y": [{ "border-spacing-y": scaleUnambiguousSpacing() }],
			/**
			* Table Layout
			* @see https://tailwindcss.com/docs/table-layout
			*/
			"table-layout": [{ table: ["auto", "fixed"] }],
			/**
			* Caption Side
			* @see https://tailwindcss.com/docs/caption-side
			*/
			caption: [{ caption: ["top", "bottom"] }],
			/**
			* Transition Property
			* @see https://tailwindcss.com/docs/transition-property
			*/
			transition: [{ transition: [
				"",
				"all",
				"colors",
				"opacity",
				"shadow",
				"transform",
				"none",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Transition Behavior
			* @see https://tailwindcss.com/docs/transition-behavior
			*/
			"transition-behavior": [{ transition: ["normal", "discrete"] }],
			/**
			* Transition Duration
			* @see https://tailwindcss.com/docs/transition-duration
			*/
			duration: [{ duration: [
				isNumber,
				"initial",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Transition Timing Function
			* @see https://tailwindcss.com/docs/transition-timing-function
			*/
			ease: [{ ease: [
				"linear",
				"initial",
				themeEase,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Transition Delay
			* @see https://tailwindcss.com/docs/transition-delay
			*/
			delay: [{ delay: [
				isNumber,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Animation
			* @see https://tailwindcss.com/docs/animation
			*/
			animate: [{ animate: [
				"none",
				themeAnimate,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Backface Visibility
			* @see https://tailwindcss.com/docs/backface-visibility
			*/
			backface: [{ backface: ["hidden", "visible"] }],
			/**
			* Perspective
			* @see https://tailwindcss.com/docs/perspective
			*/
			perspective: [{ perspective: [
				themePerspective,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Perspective Origin
			* @see https://tailwindcss.com/docs/perspective-origin
			*/
			"perspective-origin": [{ "perspective-origin": scalePositionWithArbitrary() }],
			/**
			* Rotate
			* @see https://tailwindcss.com/docs/rotate
			*/
			rotate: [{ rotate: scaleRotate() }],
			/**
			* Rotate X
			* @see https://tailwindcss.com/docs/rotate
			*/
			"rotate-x": [{ "rotate-x": scaleRotate() }],
			/**
			* Rotate Y
			* @see https://tailwindcss.com/docs/rotate
			*/
			"rotate-y": [{ "rotate-y": scaleRotate() }],
			/**
			* Rotate Z
			* @see https://tailwindcss.com/docs/rotate
			*/
			"rotate-z": [{ "rotate-z": scaleRotate() }],
			/**
			* Scale
			* @see https://tailwindcss.com/docs/scale
			*/
			scale: [{ scale: scaleScale() }],
			/**
			* Scale X
			* @see https://tailwindcss.com/docs/scale
			*/
			"scale-x": [{ "scale-x": scaleScale() }],
			/**
			* Scale Y
			* @see https://tailwindcss.com/docs/scale
			*/
			"scale-y": [{ "scale-y": scaleScale() }],
			/**
			* Scale Z
			* @see https://tailwindcss.com/docs/scale
			*/
			"scale-z": [{ "scale-z": scaleScale() }],
			/**
			* Scale 3D
			* @see https://tailwindcss.com/docs/scale
			*/
			"scale-3d": ["scale-3d"],
			/**
			* Skew
			* @see https://tailwindcss.com/docs/skew
			*/
			skew: [{ skew: scaleSkew() }],
			/**
			* Skew X
			* @see https://tailwindcss.com/docs/skew
			*/
			"skew-x": [{ "skew-x": scaleSkew() }],
			/**
			* Skew Y
			* @see https://tailwindcss.com/docs/skew
			*/
			"skew-y": [{ "skew-y": scaleSkew() }],
			/**
			* Transform
			* @see https://tailwindcss.com/docs/transform
			*/
			transform: [{ transform: [
				isArbitraryVariable,
				isArbitraryValue,
				"",
				"none",
				"gpu",
				"cpu"
			] }],
			/**
			* Transform Origin
			* @see https://tailwindcss.com/docs/transform-origin
			*/
			"transform-origin": [{ origin: scalePositionWithArbitrary() }],
			/**
			* Transform Style
			* @see https://tailwindcss.com/docs/transform-style
			*/
			"transform-style": [{ transform: ["3d", "flat"] }],
			/**
			* Translate
			* @see https://tailwindcss.com/docs/translate
			*/
			translate: [{ translate: scaleTranslate() }],
			/**
			* Translate X
			* @see https://tailwindcss.com/docs/translate
			*/
			"translate-x": [{ "translate-x": scaleTranslate() }],
			/**
			* Translate Y
			* @see https://tailwindcss.com/docs/translate
			*/
			"translate-y": [{ "translate-y": scaleTranslate() }],
			/**
			* Translate Z
			* @see https://tailwindcss.com/docs/translate
			*/
			"translate-z": [{ "translate-z": scaleTranslate() }],
			/**
			* Translate None
			* @see https://tailwindcss.com/docs/translate
			*/
			"translate-none": ["translate-none"],
			/**
			* Zoom
			* @see https://tailwindcss.com/docs/zoom
			*/
			zoom: [{ zoom: [
				isInteger,
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Accent Color
			* @see https://tailwindcss.com/docs/accent-color
			*/
			accent: [{ accent: scaleColor() }],
			/**
			* Appearance
			* @see https://tailwindcss.com/docs/appearance
			*/
			appearance: [{ appearance: ["none", "auto"] }],
			/**
			* Caret Color
			* @see https://tailwindcss.com/docs/just-in-time-mode#caret-color-utilities
			*/
			"caret-color": [{ caret: scaleColor() }],
			/**
			* Color Scheme
			* @see https://tailwindcss.com/docs/color-scheme
			*/
			"color-scheme": [{ scheme: [
				"normal",
				"dark",
				"light",
				"light-dark",
				"only-dark",
				"only-light"
			] }],
			/**
			* Cursor
			* @see https://tailwindcss.com/docs/cursor
			*/
			cursor: [{ cursor: [
				"auto",
				"default",
				"pointer",
				"wait",
				"text",
				"move",
				"help",
				"not-allowed",
				"none",
				"context-menu",
				"progress",
				"cell",
				"crosshair",
				"vertical-text",
				"alias",
				"copy",
				"no-drop",
				"grab",
				"grabbing",
				"all-scroll",
				"col-resize",
				"row-resize",
				"n-resize",
				"e-resize",
				"s-resize",
				"w-resize",
				"ne-resize",
				"nw-resize",
				"se-resize",
				"sw-resize",
				"ew-resize",
				"ns-resize",
				"nesw-resize",
				"nwse-resize",
				"zoom-in",
				"zoom-out",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Field Sizing
			* @see https://tailwindcss.com/docs/field-sizing
			*/
			"field-sizing": [{ "field-sizing": ["fixed", "content"] }],
			/**
			* Pointer Events
			* @see https://tailwindcss.com/docs/pointer-events
			*/
			"pointer-events": [{ "pointer-events": ["auto", "none"] }],
			/**
			* Resize
			* @see https://tailwindcss.com/docs/resize
			*/
			resize: [{ resize: [
				"none",
				"",
				"y",
				"x"
			] }],
			/**
			* Scroll Behavior
			* @see https://tailwindcss.com/docs/scroll-behavior
			*/
			"scroll-behavior": [{ scroll: ["auto", "smooth"] }],
			/**
			* Scrollbar Thumb Color
			* @see https://tailwindcss.com/docs/scrollbar-color
			*/
			"scrollbar-thumb-color": [{ "scrollbar-thumb": scaleColor() }],
			/**
			* Scrollbar Track Color
			* @see https://tailwindcss.com/docs/scrollbar-color
			*/
			"scrollbar-track-color": [{ "scrollbar-track": scaleColor() }],
			/**
			* Scrollbar Gutter
			* @see https://tailwindcss.com/docs/scrollbar-gutter
			*/
			"scrollbar-gutter": [{ "scrollbar-gutter": [
				"auto",
				"stable",
				"both"
			] }],
			/**
			* Scrollbar Width
			* @see https://tailwindcss.com/docs/scrollbar-width
			*/
			"scrollbar-w": [{ scrollbar: [
				"auto",
				"thin",
				"none"
			] }],
			/**
			* Scroll Margin
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-m": [{ "scroll-m": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Inline
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mx": [{ "scroll-mx": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Block
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-my": [{ "scroll-my": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Inline Start
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-ms": [{ "scroll-ms": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Inline End
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-me": [{ "scroll-me": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Block Start
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mbs": [{ "scroll-mbs": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Block End
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mbe": [{ "scroll-mbe": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Top
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mt": [{ "scroll-mt": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Right
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mr": [{ "scroll-mr": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Bottom
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-mb": [{ "scroll-mb": scaleUnambiguousSpacing() }],
			/**
			* Scroll Margin Left
			* @see https://tailwindcss.com/docs/scroll-margin
			*/
			"scroll-ml": [{ "scroll-ml": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-p": [{ "scroll-p": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Inline
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-px": [{ "scroll-px": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Block
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-py": [{ "scroll-py": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Inline Start
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-ps": [{ "scroll-ps": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Inline End
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pe": [{ "scroll-pe": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Block Start
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pbs": [{ "scroll-pbs": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Block End
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pbe": [{ "scroll-pbe": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Top
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pt": [{ "scroll-pt": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Right
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pr": [{ "scroll-pr": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Bottom
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pb": [{ "scroll-pb": scaleUnambiguousSpacing() }],
			/**
			* Scroll Padding Left
			* @see https://tailwindcss.com/docs/scroll-padding
			*/
			"scroll-pl": [{ "scroll-pl": scaleUnambiguousSpacing() }],
			/**
			* Scroll Snap Align
			* @see https://tailwindcss.com/docs/scroll-snap-align
			*/
			"snap-align": [{ snap: [
				"start",
				"end",
				"center",
				"align-none"
			] }],
			/**
			* Scroll Snap Stop
			* @see https://tailwindcss.com/docs/scroll-snap-stop
			*/
			"snap-stop": [{ snap: ["normal", "always"] }],
			/**
			* Scroll Snap Type
			* @see https://tailwindcss.com/docs/scroll-snap-type
			*/
			"snap-type": [{ snap: [
				"none",
				"x",
				"y",
				"both"
			] }],
			/**
			* Scroll Snap Type Strictness
			* @see https://tailwindcss.com/docs/scroll-snap-type
			*/
			"snap-strictness": [{ snap: ["mandatory", "proximity"] }],
			/**
			* Touch Action
			* @see https://tailwindcss.com/docs/touch-action
			*/
			touch: [{ touch: [
				"auto",
				"none",
				"manipulation"
			] }],
			/**
			* Touch Action X
			* @see https://tailwindcss.com/docs/touch-action
			*/
			"touch-x": [{ "touch-pan": [
				"x",
				"left",
				"right"
			] }],
			/**
			* Touch Action Y
			* @see https://tailwindcss.com/docs/touch-action
			*/
			"touch-y": [{ "touch-pan": [
				"y",
				"up",
				"down"
			] }],
			/**
			* Touch Action Pinch Zoom
			* @see https://tailwindcss.com/docs/touch-action
			*/
			"touch-pz": ["touch-pinch-zoom"],
			/**
			* User Select
			* @see https://tailwindcss.com/docs/user-select
			*/
			select: [{ select: [
				"none",
				"text",
				"all",
				"auto"
			] }],
			/**
			* Will Change
			* @see https://tailwindcss.com/docs/will-change
			*/
			"will-change": [{ "will-change": [
				"auto",
				"scroll",
				"contents",
				"transform",
				isArbitraryVariable,
				isArbitraryValue
			] }],
			/**
			* Fill
			* @see https://tailwindcss.com/docs/fill
			*/
			fill: [{ fill: ["none", ...scaleColor()] }],
			/**
			* Stroke Width
			* @see https://tailwindcss.com/docs/stroke-width
			*/
			"stroke-w": [{ stroke: [
				isNumber,
				isArbitraryVariableLength,
				isArbitraryLength,
				isArbitraryNumber
			] }],
			/**
			* Stroke
			* @see https://tailwindcss.com/docs/stroke
			*/
			stroke: [{ stroke: ["none", ...scaleColor()] }],
			/**
			* Forced Color Adjust
			* @see https://tailwindcss.com/docs/forced-color-adjust
			*/
			"forced-color-adjust": [{ "forced-color-adjust": ["auto", "none"] }]
		},
		conflictingClassGroups: {
			"container-named": ["container-type"],
			overflow: ["overflow-x", "overflow-y"],
			overscroll: ["overscroll-x", "overscroll-y"],
			inset: [
				"inset-x",
				"inset-y",
				"inset-bs",
				"inset-be",
				"start",
				"end",
				"top",
				"right",
				"bottom",
				"left"
			],
			"inset-x": ["right", "left"],
			"inset-y": ["top", "bottom"],
			flex: [
				"basis",
				"grow",
				"shrink"
			],
			gap: ["gap-x", "gap-y"],
			p: [
				"px",
				"py",
				"ps",
				"pe",
				"pbs",
				"pbe",
				"pt",
				"pr",
				"pb",
				"pl"
			],
			px: ["pr", "pl"],
			py: ["pt", "pb"],
			m: [
				"mx",
				"my",
				"ms",
				"me",
				"mbs",
				"mbe",
				"mt",
				"mr",
				"mb",
				"ml"
			],
			mx: ["mr", "ml"],
			my: ["mt", "mb"],
			size: ["w", "h"],
			"font-size": ["leading"],
			"fvn-normal": [
				"fvn-ordinal",
				"fvn-slashed-zero",
				"fvn-figure",
				"fvn-spacing",
				"fvn-fraction"
			],
			"fvn-ordinal": ["fvn-normal"],
			"fvn-slashed-zero": ["fvn-normal"],
			"fvn-figure": ["fvn-normal"],
			"fvn-spacing": ["fvn-normal"],
			"fvn-fraction": ["fvn-normal"],
			"line-clamp": ["display", "overflow"],
			rounded: [
				"rounded-s",
				"rounded-e",
				"rounded-t",
				"rounded-r",
				"rounded-b",
				"rounded-l",
				"rounded-ss",
				"rounded-se",
				"rounded-ee",
				"rounded-es",
				"rounded-tl",
				"rounded-tr",
				"rounded-br",
				"rounded-bl"
			],
			"rounded-s": ["rounded-ss", "rounded-es"],
			"rounded-e": ["rounded-se", "rounded-ee"],
			"rounded-t": ["rounded-tl", "rounded-tr"],
			"rounded-r": ["rounded-tr", "rounded-br"],
			"rounded-b": ["rounded-br", "rounded-bl"],
			"rounded-l": ["rounded-tl", "rounded-bl"],
			"border-spacing": ["border-spacing-x", "border-spacing-y"],
			"border-w": [
				"border-w-x",
				"border-w-y",
				"border-w-s",
				"border-w-e",
				"border-w-bs",
				"border-w-be",
				"border-w-t",
				"border-w-r",
				"border-w-b",
				"border-w-l"
			],
			"border-w-x": ["border-w-r", "border-w-l"],
			"border-w-y": ["border-w-t", "border-w-b"],
			"border-color": [
				"border-color-x",
				"border-color-y",
				"border-color-s",
				"border-color-e",
				"border-color-bs",
				"border-color-be",
				"border-color-t",
				"border-color-r",
				"border-color-b",
				"border-color-l"
			],
			"border-color-x": ["border-color-r", "border-color-l"],
			"border-color-y": ["border-color-t", "border-color-b"],
			translate: [
				"translate-x",
				"translate-y",
				"translate-none"
			],
			"translate-none": [
				"translate",
				"translate-x",
				"translate-y",
				"translate-z"
			],
			"scroll-m": [
				"scroll-mx",
				"scroll-my",
				"scroll-ms",
				"scroll-me",
				"scroll-mbs",
				"scroll-mbe",
				"scroll-mt",
				"scroll-mr",
				"scroll-mb",
				"scroll-ml"
			],
			"scroll-mx": ["scroll-mr", "scroll-ml"],
			"scroll-my": ["scroll-mt", "scroll-mb"],
			"scroll-p": [
				"scroll-px",
				"scroll-py",
				"scroll-ps",
				"scroll-pe",
				"scroll-pbs",
				"scroll-pbe",
				"scroll-pt",
				"scroll-pr",
				"scroll-pb",
				"scroll-pl"
			],
			"scroll-px": ["scroll-pr", "scroll-pl"],
			"scroll-py": ["scroll-pt", "scroll-pb"],
			touch: [
				"touch-x",
				"touch-y",
				"touch-pz"
			],
			"touch-x": ["touch"],
			"touch-y": ["touch"],
			"touch-pz": ["touch"]
		},
		conflictingClassGroupModifiers: { "font-size": ["leading"] },
		postfixLookupClassGroups: ["container-type"],
		orderSensitiveModifiers: [
			"*",
			"**",
			"after",
			"backdrop",
			"before",
			"details-content",
			"file",
			"first-letter",
			"first-line",
			"marker",
			"placeholder",
			"selection"
		]
	};
};
var twMerge = /*#__PURE__*/ createTailwindMerge(getDefaultConfig);
//#endregion
//#region src/renderer/src/lib/cn.ts
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
//#endregion
//#region node_modules/.bun/class-variance-authority@0.7.1/node_modules/class-variance-authority/dist/index.mjs
/**
* Copyright 2022 Joe Bell. All rights reserved.
*
* This file is licensed to you under the Apache License, Version 2.0
* (the "License"); you may not use this file except in compliance with the
* License. You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
* WARRANTIES OR REPRESENTATIONS OF ANY KIND, either express or implied. See the
* License for the specific language governing permissions and limitations under
* the License.
*/ var falsyToString = (value) => typeof value === "boolean" ? `${value}` : value === 0 ? "0" : value;
var cx = clsx;
var cva = (base, config) => (props) => {
	var _config_compoundVariants;
	if ((config === null || config === void 0 ? void 0 : config.variants) == null) return cx(base, props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
	const { variants, defaultVariants } = config;
	const getVariantClassNames = Object.keys(variants).map((variant) => {
		const variantProp = props === null || props === void 0 ? void 0 : props[variant];
		const defaultVariantProp = defaultVariants === null || defaultVariants === void 0 ? void 0 : defaultVariants[variant];
		if (variantProp === null) return null;
		const variantKey = falsyToString(variantProp) || falsyToString(defaultVariantProp);
		return variants[variant][variantKey];
	});
	const propsWithoutUndefined = props && Object.entries(props).reduce((acc, param) => {
		let [key, value] = param;
		if (value === void 0) return acc;
		acc[key] = value;
		return acc;
	}, {});
	return cx(base, getVariantClassNames, config === null || config === void 0 ? void 0 : (_config_compoundVariants = config.compoundVariants) === null || _config_compoundVariants === void 0 ? void 0 : _config_compoundVariants.reduce((acc, param) => {
		let { class: cvClass, className: cvClassName, ...compoundVariantOptions } = param;
		return Object.entries(compoundVariantOptions).every((param) => {
			let [key, value] = param;
			return Array.isArray(value) ? value.includes({
				...defaultVariants,
				...propsWithoutUndefined
			}[key]) : {
				...defaultVariants,
				...propsWithoutUndefined
			}[key] === value;
		}) ? [
			...acc,
			cvClass,
			cvClassName
		] : acc;
	}, []), props === null || props === void 0 ? void 0 : props.class, props === null || props === void 0 ? void 0 : props.className);
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/core.js
var _a$1;
function $constructor(name, initializer, params) {
	function init(inst, def) {
		if (!inst._zod) Object.defineProperty(inst, "_zod", {
			value: {
				def,
				constr: _,
				traits: /* @__PURE__ */ new Set()
			},
			enumerable: false
		});
		if (inst._zod.traits.has(name)) return;
		inst._zod.traits.add(name);
		initializer(inst, def);
		const proto = _.prototype;
		const keys = Object.keys(proto);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			if (!(k in inst)) inst[k] = proto[k].bind(inst);
		}
	}
	const Parent = params?.Parent ?? Object;
	class Definition extends Parent {}
	Object.defineProperty(Definition, "name", { value: name });
	function _(def) {
		var _a;
		const inst = params?.Parent ? new Definition() : this;
		init(inst, def);
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		for (const fn of inst._zod.deferred) fn();
		return inst;
	}
	Object.defineProperty(_, "init", { value: init });
	Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
		if (params?.Parent && inst instanceof params.Parent) return true;
		return inst?._zod?.traits?.has(name);
	} });
	Object.defineProperty(_, "name", { value: name });
	return _;
}
var $ZodAsyncError = class extends Error {
	constructor() {
		super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
	}
};
var $ZodEncodeError = class extends Error {
	constructor(name) {
		super(`Encountered unidirectional transform during encode: ${name}`);
		this.name = "ZodEncodeError";
	}
};
(_a$1 = globalThis).__zod_globalConfig ?? (_a$1.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
	if (newConfig) Object.assign(globalConfig, newConfig);
	return globalConfig;
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
	const numericValues = Object.values(entries).filter((v) => typeof v === "number");
	return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
}
function jsonStringifyReplacer(_, value) {
	if (typeof value === "bigint") return value.toString();
	return value;
}
function cached(getter) {
	return { get value() {
		{
			const value = getter();
			Object.defineProperty(this, "value", { value });
			return value;
		}
	} };
}
function nullish(input) {
	return input === null || input === void 0;
}
function cleanRegex(source) {
	const start = source.startsWith("^") ? 1 : 0;
	const end = source.endsWith("$") ? source.length - 1 : source.length;
	return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
	const ratio = val / step;
	const roundedRatio = Math.round(ratio);
	const tolerance = Number.EPSILON * Math.max(Math.abs(ratio), 1);
	if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
	return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__*/ Symbol("evaluating");
function defineLazy(object, key, getter) {
	let value = void 0;
	Object.defineProperty(object, key, {
		get() {
			if (value === EVALUATING) return;
			if (value === void 0) {
				value = EVALUATING;
				value = getter();
			}
			return value;
		},
		set(v) {
			Object.defineProperty(object, key, { value: v });
		},
		configurable: true
	});
}
function assignProp(target, prop, value) {
	Object.defineProperty(target, prop, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
}
function mergeDefs(...defs) {
	const mergedDescriptors = {};
	for (const def of defs) {
		const descriptors = Object.getOwnPropertyDescriptors(def);
		Object.assign(mergedDescriptors, descriptors);
	}
	return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
	return JSON.stringify(str);
}
function slugify(input) {
	return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
	return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__*/ cached(() => {
	if (globalConfig.jitless) return false;
	if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) return false;
	try {
		new Function("");
		return true;
	} catch (_) {
		return false;
	}
});
function isPlainObject(o) {
	if (isObject(o) === false) return false;
	const ctor = o.constructor;
	if (ctor === void 0) return true;
	if (typeof ctor !== "function") return true;
	const prot = ctor.prototype;
	if (isObject(prot) === false) return false;
	if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
	return true;
}
function shallowClone(o) {
	if (isPlainObject(o)) return { ...o };
	if (Array.isArray(o)) return [...o];
	if (o instanceof Map) return new Map(o);
	if (o instanceof Set) return new Set(o);
	return o;
}
var propertyKeyTypes = /* @__PURE__*/ new Set([
	"string",
	"number",
	"symbol"
]);
function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone$1(inst, def, params) {
	const cl = new inst._zod.constr(def ?? inst._zod.def);
	if (!def || params?.parent) cl._zod.parent = inst;
	return cl;
}
function normalizeParams(_params) {
	const params = _params;
	if (!params) return {};
	if (typeof params === "string") return { error: () => params };
	if (params?.message !== void 0) {
		if (params?.error !== void 0) throw new Error("Cannot specify both `message` and `error` params");
		params.error = params.message;
	}
	delete params.message;
	if (typeof params.error === "string") return {
		...params,
		error: () => params.error
	};
	return params;
}
function optionalKeys(shape) {
	return Object.keys(shape).filter((k) => {
		return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
	});
}
var NUMBER_FORMAT_RANGES = {
	safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
	int32: [-2147483648, 2147483647],
	uint32: [0, 4294967295],
	float32: [-34028234663852886e22, 34028234663852886e22],
	float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
};
function pick(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = {};
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				newShape[key] = currDef.shape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function omit(schema, mask) {
	const currDef = schema._zod.def;
	const checks = currDef.checks;
	if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const newShape = { ...schema._zod.def.shape };
			for (const key in mask) {
				if (!(key in currDef.shape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				delete newShape[key];
			}
			assignProp(this, "shape", newShape);
			return newShape;
		},
		checks: []
	}));
}
function extend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) {
		const existingShape = schema._zod.def.shape;
		for (const key in shape) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
	}
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function safeExtend(schema, shape) {
	if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const _shape = {
			...schema._zod.def.shape,
			...shape
		};
		assignProp(this, "shape", _shape);
		return _shape;
	} }));
}
function merge(a, b) {
	if (a._zod.def.checks?.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
	return clone$1(a, mergeDefs(a._zod.def, {
		get shape() {
			const _shape = {
				...a._zod.def.shape,
				...b._zod.def.shape
			};
			assignProp(this, "shape", _shape);
			return _shape;
		},
		get catchall() {
			return b._zod.def.catchall;
		},
		checks: b._zod.def.checks ?? []
	}));
}
function partial(Class, schema, mask) {
	const checks = schema._zod.def.checks;
	if (checks && checks.length > 0) throw new Error(".partial() cannot be used on object schemas containing refinements");
	return clone$1(schema, mergeDefs(schema._zod.def, {
		get shape() {
			const oldShape = schema._zod.def.shape;
			const shape = { ...oldShape };
			if (mask) for (const key in mask) {
				if (!(key in oldShape)) throw new Error(`Unrecognized key: "${key}"`);
				if (!mask[key]) continue;
				shape[key] = Class ? new Class({
					type: "optional",
					innerType: oldShape[key]
				}) : oldShape[key];
			}
			else for (const key in oldShape) shape[key] = Class ? new Class({
				type: "optional",
				innerType: oldShape[key]
			}) : oldShape[key];
			assignProp(this, "shape", shape);
			return shape;
		},
		checks: []
	}));
}
function required(Class, schema, mask) {
	return clone$1(schema, mergeDefs(schema._zod.def, { get shape() {
		const oldShape = schema._zod.def.shape;
		const shape = { ...oldShape };
		if (mask) for (const key in mask) {
			if (!(key in shape)) throw new Error(`Unrecognized key: "${key}"`);
			if (!mask[key]) continue;
			shape[key] = new Class({
				type: "nonoptional",
				innerType: oldShape[key]
			});
		}
		else for (const key in oldShape) shape[key] = new Class({
			type: "nonoptional",
			innerType: oldShape[key]
		});
		assignProp(this, "shape", shape);
		return shape;
	} }));
}
function aborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue !== true) return true;
	return false;
}
function explicitlyAborted(x, startIndex = 0) {
	if (x.aborted === true) return true;
	for (let i = startIndex; i < x.issues.length; i++) if (x.issues[i]?.continue === false) return true;
	return false;
}
function prefixIssues(path, issues) {
	return issues.map((iss) => {
		var _a;
		(_a = iss).path ?? (_a.path = []);
		iss.path.unshift(path);
		return iss;
	});
}
function unwrapMessage(message) {
	return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
	const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
	const { inst: _inst, continue: _continue, input: _input, ...rest } = iss;
	rest.path ?? (rest.path = []);
	rest.message = message;
	if (ctx?.reportInput) rest.input = _input;
	return rest;
}
function getLengthableOrigin(input) {
	if (Array.isArray(input)) return "array";
	if (typeof input === "string") return "string";
	return "unknown";
}
function issue(...args) {
	const [iss, input, inst] = args;
	if (typeof iss === "string") return {
		message: iss,
		code: "custom",
		input,
		inst
	};
	return { ...iss };
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/errors.js
var initializer$1 = (inst, def) => {
	inst.name = "$ZodError";
	Object.defineProperty(inst, "_zod", {
		value: inst._zod,
		enumerable: false
	});
	Object.defineProperty(inst, "issues", {
		value: def,
		enumerable: false
	});
	inst.message = JSON.stringify(def, jsonStringifyReplacer, 2);
	Object.defineProperty(inst, "toString", {
		value: () => inst.message,
		enumerable: false
	});
};
var $ZodError = $constructor("$ZodError", initializer$1);
var $ZodRealError = $constructor("$ZodError", initializer$1, { Parent: Error });
function flattenError(error, mapper = (issue) => issue.message) {
	const fieldErrors = {};
	const formErrors = [];
	for (const sub of error.issues) if (sub.path.length > 0) {
		fieldErrors[sub.path[0]] = fieldErrors[sub.path[0]] || [];
		fieldErrors[sub.path[0]].push(mapper(sub));
	} else formErrors.push(mapper(sub));
	return {
		formErrors,
		fieldErrors
	};
}
function formatError(error, mapper = (issue) => issue.message) {
	const fieldErrors = { _errors: [] };
	const processError = (error, path = []) => {
		for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
		else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
		else {
			const fullpath = [...path, ...issue.path];
			if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < fullpath.length) {
					const el = fullpath[i];
					if (!(i === fullpath.length - 1)) curr[el] = curr[el] || { _errors: [] };
					else {
						curr[el] = curr[el] || { _errors: [] };
						curr[el]._errors.push(mapper(issue));
					}
					curr = curr[el];
					i++;
				}
			}
		}
	};
	processError(error);
	return fieldErrors;
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/parse.js
var _parse = (_Err) => (schema, value, _ctx, _params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	if (result.issues.length) {
		const e = new ((_params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, _params?.callee);
		throw e;
	}
	return result.value;
};
var _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	if (result.issues.length) {
		const e = new ((params?.Err) ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
		captureStackTrace(e, params?.callee);
		throw e;
	}
	return result.value;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: false
	} : { async: false };
	const result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) throw new $ZodAsyncError();
	return result.issues.length ? {
		success: false,
		error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParse$1 = /* @__PURE__*/ _safeParse($ZodRealError);
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		async: true
	} : { async: true };
	let result = schema._zod.run({
		value,
		issues: []
	}, ctx);
	if (result instanceof Promise) result = await result;
	return result.issues.length ? {
		success: false,
		error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	} : {
		success: true,
		data: result.value
	};
};
var safeParseAsync$1 = /* @__PURE__*/ _safeParseAsync($ZodRealError);
var _encode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parse(_Err)(schema, value, ctx);
};
var _decode = (_Err) => (schema, value, _ctx) => {
	return _parse(_Err)(schema, value, _ctx);
};
var _encodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _parseAsync(_Err)(schema, value, ctx);
};
var _decodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _parseAsync(_Err)(schema, value, _ctx);
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
	return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
	const ctx = _ctx ? {
		..._ctx,
		direction: "backward"
	} : { direction: "backward" };
	return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
	return _safeParseAsync(_Err)(schema, value, _ctx);
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/regexes.js
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
var duration$1 = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
/** Returns a regex for validating an RFC 9562/4122 UUID.
*
* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
var uuid = (version) => {
	if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
	return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
/** Practical email validation */
var email = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji$1 = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
function emoji() {
	return new RegExp(_emoji$1, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::|([0-9a-fA-F]{1,4})?::([0-9a-fA-F]{1,4}:?){0,6})\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^[A-Za-z0-9_-]*$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
var date$1 = /*@__PURE__*/ new RegExp(`^${dateSource}$`);
function timeSource(args) {
	const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
	return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
}
function time$2(args) {
	return new RegExp(`^${timeSource(args)}$`);
}
function datetime$1(args) {
	const time = timeSource({ precision: args.precision });
	const opts = ["Z"];
	if (args.local) opts.push("");
	if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
	const timeRegex = `${time}(?:${opts.join("|")})`;
	return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var string$1 = (params) => {
	const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
	return new RegExp(`^${regex}$`);
};
var integer = /^-?\d+$/;
var number$1 = /^-?\d+(?:\.\d+)?$/;
var boolean$1 = /^(?:true|false)$/i;
var _null$2 = /^null$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/checks.js
var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
	var _a;
	inst._zod ?? (inst._zod = {});
	inst._zod.def = def;
	(_a = inst._zod).onattach ?? (_a.onattach = []);
});
var numericOriginMap = {
	number: "number",
	bigint: "bigint",
	object: "date"
};
var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.maximum : bag.exclusiveMaximum) ?? Number.POSITIVE_INFINITY;
		if (def.value < curr) {
			if (def.inclusive) bag.maximum = def.value;
			else bag.exclusiveMaximum = def.value;
		}
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
	$ZodCheck.init(inst, def);
	const origin = numericOriginMap[typeof def.value];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		const curr = (def.inclusive ? bag.minimum : bag.exclusiveMinimum) ?? Number.NEGATIVE_INFINITY;
		if (def.value > curr) {
			if (def.inclusive) bag.minimum = def.value;
			else bag.exclusiveMinimum = def.value;
		}
	});
	inst._zod.check = (payload) => {
		if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
			input: payload.value,
			inclusive: def.inclusive,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		var _a;
		(_a = inst._zod.bag).multipleOf ?? (_a.multipleOf = def.value);
	});
	inst._zod.check = (payload) => {
		if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
		if (typeof payload.value === "bigint" ? payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
		payload.issues.push({
			origin: typeof payload.value,
			code: "not_multiple_of",
			divisor: def.value,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
	$ZodCheck.init(inst, def);
	def.format = def.format || "float64";
	const isInt = def.format?.includes("int");
	const origin = isInt ? "int" : "number";
	const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		bag.minimum = minimum;
		bag.maximum = maximum;
		if (isInt) bag.pattern = integer;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (isInt) {
			if (!Number.isInteger(input)) {
				payload.issues.push({
					expected: origin,
					format: def.format,
					code: "invalid_type",
					continue: false,
					input,
					inst
				});
				return;
			}
			if (!Number.isSafeInteger(input)) {
				if (input > 0) payload.issues.push({
					input,
					code: "too_big",
					maximum: Number.MAX_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				else payload.issues.push({
					input,
					code: "too_small",
					minimum: Number.MIN_SAFE_INTEGER,
					note: "Integers must be within the safe integer range.",
					inst,
					origin,
					inclusive: true,
					continue: !def.abort
				});
				return;
			}
		}
		if (input < minimum) payload.issues.push({
			origin: "number",
			input,
			code: "too_small",
			minimum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
		if (input > maximum) payload.issues.push({
			origin: "number",
			input,
			code: "too_big",
			maximum,
			inclusive: true,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.maximum ?? Number.POSITIVE_INFINITY;
		if (def.maximum < curr) inst._zod.bag.maximum = def.maximum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length <= def.maximum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_big",
			maximum: def.maximum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const curr = inst._zod.bag.minimum ?? Number.NEGATIVE_INFINITY;
		if (def.minimum > curr) inst._zod.bag.minimum = def.minimum;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		if (input.length >= def.minimum) return;
		const origin = getLengthableOrigin(input);
		payload.issues.push({
			origin,
			code: "too_small",
			minimum: def.minimum,
			inclusive: true,
			input,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
	var _a;
	$ZodCheck.init(inst, def);
	(_a = inst._zod.def).when ?? (_a.when = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	});
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.minimum = def.length;
		bag.maximum = def.length;
		bag.length = def.length;
	});
	inst._zod.check = (payload) => {
		const input = payload.value;
		const length = input.length;
		if (length === def.length) return;
		const origin = getLengthableOrigin(input);
		const tooBig = length > def.length;
		payload.issues.push({
			origin,
			...tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			},
			inclusive: true,
			exact: true,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
	var _a, _b;
	$ZodCheck.init(inst, def);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.format = def.format;
		if (def.pattern) {
			bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
			bag.patterns.add(def.pattern);
		}
	});
	if (def.pattern) (_a = inst._zod).check ?? (_a.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: def.format,
			input: payload.value,
			...def.pattern ? { pattern: def.pattern.toString() } : {},
			inst,
			continue: !def.abort
		});
	});
	else (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		def.pattern.lastIndex = 0;
		if (def.pattern.test(payload.value)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "regex",
			input: payload.value,
			pattern: def.pattern.toString(),
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
	def.pattern ?? (def.pattern = lowercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
	def.pattern ?? (def.pattern = uppercase);
	$ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
	$ZodCheck.init(inst, def);
	const escapedRegex = escapeRegex(def.includes);
	const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position}}${escapedRegex}` : escapedRegex);
	def.pattern = pattern;
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.includes(def.includes, def.position)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "includes",
			includes: def.includes,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.startsWith(def.prefix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "starts_with",
			prefix: def.prefix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
	$ZodCheck.init(inst, def);
	const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
	def.pattern ?? (def.pattern = pattern);
	inst._zod.onattach.push((inst) => {
		const bag = inst._zod.bag;
		bag.patterns ?? (bag.patterns = /* @__PURE__ */ new Set());
		bag.patterns.add(pattern);
	});
	inst._zod.check = (payload) => {
		if (payload.value.endsWith(def.suffix)) return;
		payload.issues.push({
			origin: "string",
			code: "invalid_format",
			format: "ends_with",
			suffix: def.suffix,
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
	$ZodCheck.init(inst, def);
	inst._zod.check = (payload) => {
		payload.value = def.tx(payload.value);
	};
});
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/doc.js
var Doc = class {
	constructor(args = []) {
		this.content = [];
		this.indent = 0;
		if (this) this.args = args;
	}
	indented(fn) {
		this.indent += 1;
		fn(this);
		this.indent -= 1;
	}
	write(arg) {
		if (typeof arg === "function") {
			arg(this, { execution: "sync" });
			arg(this, { execution: "async" });
			return;
		}
		const lines = arg.split("\n").filter((x) => x);
		const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
		const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
		for (const line of dedented) this.content.push(line);
	}
	compile() {
		const F = Function;
		const args = this?.args;
		const lines = [...(this?.content ?? [``]).map((x) => `  ${x}`)];
		return new F(...args, lines.join("\n"));
	}
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/versions.js
var version = {
	major: 4,
	minor: 4,
	patch: 3
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/schemas.js
var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
	var _a;
	inst ?? (inst = {});
	inst._zod.def = def;
	inst._zod.bag = inst._zod.bag || {};
	inst._zod.version = version;
	const checks = [...inst._zod.def.checks ?? []];
	if (inst._zod.traits.has("$ZodCheck")) checks.unshift(inst);
	for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
	if (checks.length === 0) {
		(_a = inst._zod).deferred ?? (_a.deferred = []);
		inst._zod.deferred?.push(() => {
			inst._zod.run = inst._zod.parse;
		});
	} else {
		const runChecks = (payload, checks, ctx) => {
			let isAborted = aborted(payload);
			let asyncResult;
			for (const ch of checks) {
				if (ch._zod.def.when) {
					if (explicitlyAborted(payload)) continue;
					if (!ch._zod.def.when(payload)) continue;
				} else if (isAborted) continue;
				const currLen = payload.issues.length;
				const _ = ch._zod.check(payload);
				if (_ instanceof Promise && ctx?.async === false) throw new $ZodAsyncError();
				if (asyncResult || _ instanceof Promise) asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
					await _;
					if (payload.issues.length === currLen) return;
					if (!isAborted) isAborted = aborted(payload, currLen);
				});
				else {
					if (payload.issues.length === currLen) continue;
					if (!isAborted) isAborted = aborted(payload, currLen);
				}
			}
			if (asyncResult) return asyncResult.then(() => {
				return payload;
			});
			return payload;
		};
		const handleCanaryResult = (canary, payload, ctx) => {
			if (aborted(canary)) {
				canary.aborted = true;
				return canary;
			}
			const checkResult = runChecks(payload, checks, ctx);
			if (checkResult instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
			}
			return inst._zod.parse(checkResult, ctx);
		};
		inst._zod.run = (payload, ctx) => {
			if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
			if (ctx.direction === "backward") {
				const canary = inst._zod.parse({
					value: payload.value,
					issues: []
				}, {
					...ctx,
					skipChecks: true
				});
				if (canary instanceof Promise) return canary.then((canary) => {
					return handleCanaryResult(canary, payload, ctx);
				});
				return handleCanaryResult(canary, payload, ctx);
			}
			const result = inst._zod.parse(payload, ctx);
			if (result instanceof Promise) {
				if (ctx.async === false) throw new $ZodAsyncError();
				return result.then((result) => runChecks(result, checks, ctx));
			}
			return runChecks(result, checks, ctx);
		};
	}
	defineLazy(inst, "~standard", () => ({
		validate: (value) => {
			try {
				const r = safeParse$1(inst, value);
				return r.success ? { value: r.data } : { issues: r.error?.issues };
			} catch (_) {
				return safeParseAsync$1(inst, value).then((r) => r.success ? { value: r.data } : { issues: r.error?.issues });
			}
		},
		vendor: "zod",
		version: 1
	}));
});
var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = [...inst?._zod.bag?.patterns ?? []].pop() ?? string$1(inst._zod.bag);
	inst._zod.parse = (payload, _) => {
		if (def.coerce) try {
			payload.value = String(payload.value);
		} catch (_) {}
		if (typeof payload.value === "string") return payload;
		payload.issues.push({
			expected: "string",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
	$ZodCheckStringFormat.init(inst, def);
	$ZodString.init(inst, def);
});
var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
	def.pattern ?? (def.pattern = guid);
	$ZodStringFormat.init(inst, def);
});
var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
	if (def.version) {
		const v = {
			v1: 1,
			v2: 2,
			v3: 3,
			v4: 4,
			v5: 5,
			v6: 6,
			v7: 7,
			v8: 8
		}[def.version];
		if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
		def.pattern ?? (def.pattern = uuid(v));
	} else def.pattern ?? (def.pattern = uuid());
	$ZodStringFormat.init(inst, def);
});
var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
	def.pattern ?? (def.pattern = email);
	$ZodStringFormat.init(inst, def);
});
var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		try {
			const trimmed = payload.value.trim();
			if (!def.normalize && def.protocol?.source === httpProtocol.source) {
				if (!/^https?:\/\//i.test(trimmed)) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid URL format",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
			}
			const url = new URL(trimmed);
			if (def.hostname) {
				def.hostname.lastIndex = 0;
				if (!def.hostname.test(url.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: def.hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.protocol) {
				def.protocol.lastIndex = 0;
				if (!def.protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
			if (def.normalize) payload.value = url.href;
			else payload.value = trimmed;
			return;
		} catch (_) {
			payload.issues.push({
				code: "invalid_format",
				format: "url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
	def.pattern ?? (def.pattern = emoji());
	$ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
	def.pattern ?? (def.pattern = nanoid);
	$ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
	def.pattern ?? (def.pattern = cuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
	def.pattern ?? (def.pattern = cuid2);
	$ZodStringFormat.init(inst, def);
});
var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
	def.pattern ?? (def.pattern = ulid);
	$ZodStringFormat.init(inst, def);
});
var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
	def.pattern ?? (def.pattern = xid);
	$ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
	def.pattern ?? (def.pattern = ksuid);
	$ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
	def.pattern ?? (def.pattern = datetime$1(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
	def.pattern ?? (def.pattern = date$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
	def.pattern ?? (def.pattern = time$2(def));
	$ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
	def.pattern ?? (def.pattern = duration$1);
	$ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
	def.pattern ?? (def.pattern = ipv4);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv4`;
});
var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
	def.pattern ?? (def.pattern = ipv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.format = `ipv6`;
	inst._zod.check = (payload) => {
		try {
			new URL(`http://[${payload.value}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv4);
	$ZodStringFormat.init(inst, def);
});
var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
	def.pattern ?? (def.pattern = cidrv6);
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		const parts = payload.value.split("/");
		try {
			if (parts.length !== 2) throw new Error();
			const [address, prefix] = parts;
			if (!prefix) throw new Error();
			const prefixNum = Number(prefix);
			if (`${prefixNum}` !== prefix) throw new Error();
			if (prefixNum < 0 || prefixNum > 128) throw new Error();
			new URL(`http://[${address}]`);
		} catch {
			payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		}
	};
});
function isValidBase64(data) {
	if (data === "") return true;
	if (/\s/.test(data)) return false;
	if (data.length % 4 !== 0) return false;
	try {
		atob(data);
		return true;
	} catch {
		return false;
	}
}
var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
	def.pattern ?? (def.pattern = base64);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64";
	inst._zod.check = (payload) => {
		if (isValidBase64(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
function isValidBase64URL(data) {
	if (!base64url.test(data)) return false;
	const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
	return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
}
var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
	def.pattern ?? (def.pattern = base64url);
	$ZodStringFormat.init(inst, def);
	inst._zod.bag.contentEncoding = "base64url";
	inst._zod.check = (payload) => {
		if (isValidBase64URL(payload.value)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "base64url",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
	def.pattern ?? (def.pattern = e164);
	$ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
	try {
		const tokensParts = token.split(".");
		if (tokensParts.length !== 3) return false;
		const [header] = tokensParts;
		if (!header) return false;
		const parsedHeader = JSON.parse(atob(header));
		if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT") return false;
		if (!parsedHeader.alg) return false;
		if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
		return true;
	} catch {
		return false;
	}
}
var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	inst._zod.check = (payload) => {
		if (isValidJWT(payload.value, def.alg)) return;
		payload.issues.push({
			code: "invalid_format",
			format: "jwt",
			input: payload.value,
			inst,
			continue: !def.abort
		});
	};
});
var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Number(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
		const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? "Infinity" : void 0 : void 0;
		payload.issues.push({
			expected: "number",
			code: "invalid_type",
			input,
			inst,
			...received ? { received } : {}
		});
		return payload;
	};
});
var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
	$ZodCheckNumberFormat.init(inst, def);
	$ZodNumber.init(inst, def);
});
var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = boolean$1;
	inst._zod.parse = (payload, _ctx) => {
		if (def.coerce) try {
			payload.value = Boolean(payload.value);
		} catch (_) {}
		const input = payload.value;
		if (typeof input === "boolean") return payload;
		payload.issues.push({
			expected: "boolean",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodNull = /*@__PURE__*/ $constructor("$ZodNull", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.pattern = _null$2;
	inst._zod.values = /* @__PURE__ */ new Set([null]);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (input === null) return payload;
		payload.issues.push({
			expected: "null",
			code: "invalid_type",
			input,
			inst
		});
		return payload;
	};
});
var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload) => payload;
});
var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _ctx) => {
		payload.issues.push({
			expected: "never",
			code: "invalid_type",
			input: payload.value,
			inst
		});
		return payload;
	};
});
function handleArrayResult(result, final, index) {
	if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
	final.value[index] = result.value;
}
var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!Array.isArray(input)) {
			payload.issues.push({
				expected: "array",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = Array(input.length);
		const proms = [];
		for (let i = 0; i < input.length; i++) {
			const item = input[i];
			const result = def.element._zod.run({
				value: item,
				issues: []
			}, ctx);
			if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
			else handleArrayResult(result, payload, i);
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
function handlePropertyResult(result, final, key, input, isOptionalIn, isOptionalOut) {
	const isPresent = key in input;
	if (result.issues.length) {
		if (isOptionalIn && isOptionalOut && !isPresent) return;
		final.issues.push(...prefixIssues(key, result.issues));
	}
	if (!isPresent && !isOptionalIn) {
		if (!result.issues.length) final.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: void 0,
			path: [key]
		});
		return;
	}
	if (result.value === void 0) {
		if (isPresent) final.value[key] = void 0;
	} else final.value[key] = result.value;
}
function normalizeDef(def) {
	const keys = Object.keys(def.shape);
	for (const k of keys) if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
	const okeys = optionalKeys(def.shape);
	return {
		...def,
		keys,
		keySet: new Set(keys),
		numKeys: keys.length,
		optionalKeys: new Set(okeys)
	};
}
function handleCatchall(proms, input, payload, ctx, def, inst) {
	const unrecognized = [];
	const keySet = def.keySet;
	const _catchall = def.catchall._zod;
	const t = _catchall.def.type;
	const isOptionalIn = _catchall.optin === "optional";
	const isOptionalOut = _catchall.optout === "optional";
	for (const key in input) {
		if (key === "__proto__") continue;
		if (keySet.has(key)) continue;
		if (t === "never") {
			unrecognized.push(key);
			continue;
		}
		const r = _catchall.run({
			value: input[key],
			issues: []
		}, ctx);
		if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
		else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
	}
	if (unrecognized.length) payload.issues.push({
		code: "unrecognized_keys",
		keys: unrecognized,
		input,
		inst
	});
	if (!proms.length) return payload;
	return Promise.all(proms).then(() => {
		return payload;
	});
}
var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
	$ZodType.init(inst, def);
	if (!Object.getOwnPropertyDescriptor(def, "shape")?.get) {
		const sh = def.shape;
		Object.defineProperty(def, "shape", { get: () => {
			const newSh = { ...sh };
			Object.defineProperty(def, "shape", { value: newSh });
			return newSh;
		} });
	}
	const _normalized = cached(() => normalizeDef(def));
	defineLazy(inst._zod, "propValues", () => {
		const shape = def.shape;
		const propValues = {};
		for (const key in shape) {
			const field = shape[key]._zod;
			if (field.values) {
				propValues[key] ?? (propValues[key] = /* @__PURE__ */ new Set());
				for (const v of field.values) propValues[key].add(v);
			}
		}
		return propValues;
	});
	const isObject$1 = isObject;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$1(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		payload.value = {};
		const proms = [];
		const shape = value.shape;
		for (const key of value.keys) {
			const el = shape[key];
			const isOptionalIn = el._zod.optin === "optional";
			const isOptionalOut = el._zod.optout === "optional";
			const r = el._zod.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut)));
			else handlePropertyResult(r, payload, key, input, isOptionalIn, isOptionalOut);
		}
		if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
		return handleCatchall(proms, input, payload, ctx, _normalized.value, inst);
	};
});
var $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
	$ZodObject.init(inst, def);
	const superParse = inst._zod.parse;
	const _normalized = cached(() => normalizeDef(def));
	const generateFastpass = (shape) => {
		const doc = new Doc([
			"shape",
			"payload",
			"ctx"
		]);
		const normalized = _normalized.value;
		const parseStr = (key) => {
			const k = esc(key);
			return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
		};
		doc.write(`const input = payload.value;`);
		const ids = Object.create(null);
		let counter = 0;
		for (const key of normalized.keys) ids[key] = `key_${counter++}`;
		doc.write(`const newResult = {};`);
		for (const key of normalized.keys) {
			const id = ids[key];
			const k = esc(key);
			const schema = shape[key];
			const isOptionalIn = schema?._zod?.optin === "optional";
			const isOptionalOut = schema?._zod?.optout === "optional";
			doc.write(`const ${id} = ${parseStr(key)};`);
			if (isOptionalIn && isOptionalOut) doc.write(`
        if (${id}.issues.length) {
          if (${k} in input) {
            payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
              ...iss,
              path: iss.path ? [${k}, ...iss.path] : [${k}]
            })));
          }
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
			else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${k} in input;
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
        }

        if (${id}_present) {
          if (${id}.value === undefined) {
            newResult[${k}] = undefined;
          } else {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
			else doc.write(`
        if (${id}.issues.length) {
          payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${k}, ...iss.path] : [${k}]
          })));
        }
        
        if (${id}.value === undefined) {
          if (${k} in input) {
            newResult[${k}] = undefined;
          }
        } else {
          newResult[${k}] = ${id}.value;
        }
        
      `);
		}
		doc.write(`payload.value = newResult;`);
		doc.write(`return payload;`);
		const fn = doc.compile();
		return (payload, ctx) => fn(shape, payload, ctx);
	};
	let fastpass;
	const isObject$2 = isObject;
	const jit = !globalConfig.jitless;
	const fastEnabled = jit && allowsEval.value;
	const catchall = def.catchall;
	let value;
	inst._zod.parse = (payload, ctx) => {
		value ?? (value = _normalized.value);
		const input = payload.value;
		if (!isObject$2(input)) {
			payload.issues.push({
				expected: "object",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
			if (!fastpass) fastpass = generateFastpass(def.shape);
			payload = fastpass(payload, ctx);
			if (!catchall) return payload;
			return handleCatchall([], input, payload, ctx, value, inst);
		}
		return superParse(payload, ctx);
	};
});
function handleUnionResults(results, final, inst, ctx) {
	for (const result of results) if (result.issues.length === 0) {
		final.value = result.value;
		return final;
	}
	const nonaborted = results.filter((r) => !aborted(r));
	if (nonaborted.length === 1) {
		final.value = nonaborted[0].value;
		return nonaborted[0];
	}
	final.issues.push({
		code: "invalid_union",
		input: final.value,
		inst,
		errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
	});
	return final;
}
var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
	defineLazy(inst._zod, "values", () => {
		if (def.options.every((o) => o._zod.values)) return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
	});
	defineLazy(inst._zod, "pattern", () => {
		if (def.options.every((o) => o._zod.pattern)) {
			const patterns = def.options.map((o) => o._zod.pattern);
			return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
		}
	});
	const first = def.options.length === 1 ? def.options[0]._zod.run : null;
	inst._zod.parse = (payload, ctx) => {
		if (first) return first(payload, ctx);
		let async = false;
		const results = [];
		for (const option of def.options) {
			const result = option._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) {
				results.push(result);
				async = true;
			} else {
				if (result.issues.length === 0) return result;
				results.push(result);
			}
		}
		if (!async) return handleUnionResults(results, payload, inst, ctx);
		return Promise.all(results).then((results) => {
			return handleUnionResults(results, payload, inst, ctx);
		});
	};
});
var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
	def.inclusive = false;
	$ZodUnion.init(inst, def);
	const _super = inst._zod.parse;
	defineLazy(inst._zod, "propValues", () => {
		const propValues = {};
		for (const option of def.options) {
			const pv = option._zod.propValues;
			if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
			for (const [k, v] of Object.entries(pv)) {
				if (!propValues[k]) propValues[k] = /* @__PURE__ */ new Set();
				for (const val of v) propValues[k].add(val);
			}
		}
		return propValues;
	});
	const disc = cached(() => {
		const opts = def.options;
		const map = /* @__PURE__ */ new Map();
		for (const o of opts) {
			const values = o._zod.propValues?.[def.discriminator];
			if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(o)}"`);
			for (const v of values) {
				if (map.has(v)) throw new Error(`Duplicate discriminator value "${String(v)}"`);
				map.set(v, o);
			}
		}
		return map;
	});
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isObject(input)) {
			payload.issues.push({
				code: "invalid_type",
				expected: "object",
				input,
				inst
			});
			return payload;
		}
		const opt = disc.value.get(input?.[def.discriminator]);
		if (opt) return opt._zod.run(payload, ctx);
		if (def.unionFallback || ctx.direction === "backward") return _super(payload, ctx);
		payload.issues.push({
			code: "invalid_union",
			errors: [],
			note: "No matching discriminator",
			discriminator: def.discriminator,
			options: Array.from(disc.value.keys()),
			input,
			path: [def.discriminator],
			inst
		});
		return payload;
	};
});
var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		const left = def.left._zod.run({
			value: input,
			issues: []
		}, ctx);
		const right = def.right._zod.run({
			value: input,
			issues: []
		}, ctx);
		if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
			return handleIntersectionResults(payload, left, right);
		});
		return handleIntersectionResults(payload, left, right);
	};
});
function mergeValues(a, b) {
	if (a === b) return {
		valid: true,
		data: a
	};
	if (a instanceof Date && b instanceof Date && +a === +b) return {
		valid: true,
		data: a
	};
	if (isPlainObject(a) && isPlainObject(b)) {
		const bKeys = Object.keys(b);
		const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
			};
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return {
			valid: false,
			mergeErrorPath: []
		};
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return {
				valid: false,
				mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
			};
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	}
	return {
		valid: false,
		mergeErrorPath: []
	};
}
function handleIntersectionResults(result, left, right) {
	const unrecKeys = /* @__PURE__ */ new Map();
	let unrecIssue;
	for (const iss of left.issues) if (iss.code === "unrecognized_keys") {
		unrecIssue ?? (unrecIssue = iss);
		for (const k of iss.keys) {
			if (!unrecKeys.has(k)) unrecKeys.set(k, {});
			unrecKeys.get(k).l = true;
		}
	} else result.issues.push(iss);
	for (const iss of right.issues) if (iss.code === "unrecognized_keys") for (const k of iss.keys) {
		if (!unrecKeys.has(k)) unrecKeys.set(k, {});
		unrecKeys.get(k).r = true;
	}
	else result.issues.push(iss);
	const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
	if (bothKeys.length && unrecIssue) result.issues.push({
		...unrecIssue,
		keys: bothKeys
	});
	if (aborted(result)) return result;
	const merged = mergeValues(left.value, right.value);
	if (!merged.valid) throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
	result.value = merged.data;
	return result;
}
var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, ctx) => {
		const input = payload.value;
		if (!isPlainObject(input)) {
			payload.issues.push({
				expected: "record",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		}
		const proms = [];
		const values = def.keyType._zod.values;
		if (values) {
			payload.value = {};
			const recordKeys = /* @__PURE__ */ new Set();
			for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
				recordKeys.add(typeof key === "number" ? key.toString() : key);
				const keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (keyResult.issues.length) {
					payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const outKey = keyResult.value;
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[outKey] = result.value;
				}
			}
			let unrecognized;
			for (const key in input) if (!recordKeys.has(key)) {
				unrecognized = unrecognized ?? [];
				unrecognized.push(key);
			}
			if (unrecognized && unrecognized.length > 0) payload.issues.push({
				code: "unrecognized_keys",
				input,
				inst,
				keys: unrecognized
			});
		} else {
			payload.value = {};
			for (const key of Reflect.ownKeys(input)) {
				if (key === "__proto__") continue;
				if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
				let keyResult = def.keyType._zod.run({
					value: key,
					issues: []
				}, ctx);
				if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
				if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
					const retryResult = def.keyType._zod.run({
						value: Number(key),
						issues: []
					}, ctx);
					if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (retryResult.issues.length === 0) keyResult = retryResult;
				}
				if (keyResult.issues.length) {
					if (def.mode === "loose") payload.value[key] = input[key];
					else payload.issues.push({
						code: "invalid_key",
						origin: "record",
						issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
						input: key,
						path: [key],
						inst
					});
					continue;
				}
				const result = def.valueType._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}));
				else {
					if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
					payload.value[keyResult.value] = result.value;
				}
			}
		}
		if (proms.length) return Promise.all(proms).then(() => payload);
		return payload;
	};
});
var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
	$ZodType.init(inst, def);
	const values = getEnumValues(def.entries);
	const valuesSet = new Set(values);
	inst._zod.values = valuesSet;
	inst._zod.pattern = new RegExp(`^(${values.filter((k) => propertyKeyTypes.has(typeof k)).map((o) => typeof o === "string" ? escapeRegex(o) : o.toString()).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (valuesSet.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
	$ZodType.init(inst, def);
	if (def.values.length === 0) throw new Error("Cannot create literal schema with no valid values");
	const values = new Set(def.values);
	inst._zod.values = values;
	inst._zod.pattern = new RegExp(`^(${def.values.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$`);
	inst._zod.parse = (payload, _ctx) => {
		const input = payload.value;
		if (values.has(input)) return payload;
		payload.issues.push({
			code: "invalid_value",
			values: def.values,
			input,
			inst
		});
		return payload;
	};
});
var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		const _out = def.transform(payload.value, payload);
		if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		if (_out instanceof Promise) throw new $ZodAsyncError();
		payload.value = _out;
		payload.fallback = true;
		return payload;
	};
});
function handleOptionalResult(result, input) {
	if (input === void 0 && (result.issues.length || result.fallback)) return {
		issues: [],
		value: void 0
	};
	return result;
}
var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	inst._zod.optout = "optional";
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, void 0]) : void 0;
	});
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (def.innerType._zod.optin === "optional") {
			const input = payload.value;
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((r) => handleOptionalResult(r, input));
			return handleOptionalResult(result, input);
		}
		if (payload.value === void 0) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "pattern", () => def.innerType._zod.pattern);
	inst._zod.parse = (payload, ctx) => {
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "optin", () => def.innerType._zod.optin);
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "pattern", () => {
		const pattern = def.innerType._zod.pattern;
		return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
	});
	defineLazy(inst._zod, "values", () => {
		return def.innerType._zod.values ? /* @__PURE__ */ new Set([...def.innerType._zod.values, null]) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		if (payload.value === null) return payload;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) {
			payload.value = def.defaultValue;
			/**
			* $ZodDefault returns the default value immediately in forward direction.
			* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
			return payload;
		}
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
		return handleDefaultResult(result, def);
	};
});
function handleDefaultResult(payload, def) {
	if (payload.value === void 0) payload.value = def.defaultValue;
	return payload;
}
var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		if (payload.value === void 0) payload.value = def.defaultValue;
		return def.innerType._zod.run(payload, ctx);
	};
});
var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => {
		const v = def.innerType._zod.values;
		return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
	});
	inst._zod.parse = (payload, ctx) => {
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
		return handleNonOptionalResult(result, inst);
	};
});
function handleNonOptionalResult(payload, inst) {
	if (!payload.issues.length && payload.value === void 0) payload.issues.push({
		code: "invalid_type",
		expected: "nonoptional",
		input: payload.value,
		inst
	});
	return payload;
}
var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
	$ZodType.init(inst, def);
	inst._zod.optin = "optional";
	defineLazy(inst._zod, "optout", () => def.innerType._zod.optout);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then((result) => {
			payload.value = result.value;
			if (result.issues.length) {
				payload.value = def.catchValue({
					...payload,
					error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
					input: payload.value
				});
				payload.issues = [];
				payload.fallback = true;
			}
			return payload;
		});
		payload.value = result.value;
		if (result.issues.length) {
			payload.value = def.catchValue({
				...payload,
				error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
				input: payload.value
			});
			payload.issues = [];
			payload.fallback = true;
		}
		return payload;
	};
});
var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "values", () => def.in._zod.values);
	defineLazy(inst._zod, "optin", () => def.in._zod.optin);
	defineLazy(inst._zod, "optout", () => def.out._zod.optout);
	defineLazy(inst._zod, "propValues", () => def.in._zod.propValues);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") {
			const right = def.out._zod.run(payload, ctx);
			if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
			return handlePipeResult(right, def.in, ctx);
		}
		const left = def.in._zod.run(payload, ctx);
		if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
		return handlePipeResult(left, def.out, ctx);
	};
});
function handlePipeResult(left, next, ctx) {
	if (left.issues.length) {
		left.aborted = true;
		return left;
	}
	return next._zod.run({
		value: left.value,
		issues: left.issues,
		fallback: left.fallback
	}, ctx);
}
var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
	$ZodType.init(inst, def);
	defineLazy(inst._zod, "propValues", () => def.innerType._zod.propValues);
	defineLazy(inst._zod, "values", () => def.innerType._zod.values);
	defineLazy(inst._zod, "optin", () => def.innerType?._zod?.optin);
	defineLazy(inst._zod, "optout", () => def.innerType?._zod?.optout);
	inst._zod.parse = (payload, ctx) => {
		if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
		const result = def.innerType._zod.run(payload, ctx);
		if (result instanceof Promise) return result.then(handleReadonlyResult);
		return handleReadonlyResult(result);
	};
});
function handleReadonlyResult(payload) {
	payload.value = Object.freeze(payload.value);
	return payload;
}
var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
	$ZodCheck.init(inst, def);
	$ZodType.init(inst, def);
	inst._zod.parse = (payload, _) => {
		return payload;
	};
	inst._zod.check = (payload) => {
		const input = payload.value;
		const r = def.fn(input);
		if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
		handleRefineResult(r, payload, input, inst);
	};
});
function handleRefineResult(result, payload, input, inst) {
	if (!result) {
		const _iss = {
			code: "custom",
			input,
			inst,
			path: [...inst._zod.def.path ?? []],
			continue: !inst._zod.def.abort
		};
		if (inst._zod.def.params) _iss.params = inst._zod.def.params;
		payload.issues.push(issue(_iss));
	}
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/registries.js
var _a;
var $ZodRegistry = class {
	constructor() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
	}
	add(schema, ..._meta) {
		const meta = _meta[0];
		this._map.set(schema, meta);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
		return this;
	}
	clear() {
		this._map = /* @__PURE__ */ new WeakMap();
		this._idmap = /* @__PURE__ */ new Map();
		return this;
	}
	remove(schema) {
		const meta = this._map.get(schema);
		if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
		this._map.delete(schema);
		return this;
	}
	get(schema) {
		const p = schema._zod.parent;
		if (p) {
			const pm = { ...this.get(p) ?? {} };
			delete pm.id;
			const f = {
				...pm,
				...this._map.get(schema)
			};
			return Object.keys(f).length ? f : void 0;
		}
		return this._map.get(schema);
	}
	has(schema) {
		return this._map.has(schema);
	}
};
function registry() {
	return new $ZodRegistry();
}
(_a = globalThis).__zod_globalRegistry ?? (_a.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/api.js
// @__NO_SIDE_EFFECTS__
function _string(Class, params) {
	return new Class({
		type: "string",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _email(Class, params) {
	return new Class({
		type: "string",
		format: "email",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _guid(Class, params) {
	return new Class({
		type: "string",
		format: "guid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v4",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v6",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class, params) {
	return new Class({
		type: "string",
		format: "uuid",
		check: "string_format",
		abort: false,
		version: "v7",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _url(Class, params) {
	return new Class({
		type: "string",
		format: "url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _emoji(Class, params) {
	return new Class({
		type: "string",
		format: "emoji",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class, params) {
	return new Class({
		type: "string",
		format: "nanoid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link _cuid2} instead.
* See https://github.com/paralleldrive/cuid.
*/
// @__NO_SIDE_EFFECTS__
function _cuid(Class, params) {
	return new Class({
		type: "string",
		format: "cuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class, params) {
	return new Class({
		type: "string",
		format: "cuid2",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class, params) {
	return new Class({
		type: "string",
		format: "ulid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _xid(Class, params) {
	return new Class({
		type: "string",
		format: "xid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class, params) {
	return new Class({
		type: "string",
		format: "ksuid",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class, params) {
	return new Class({
		type: "string",
		format: "ipv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class, params) {
	return new Class({
		type: "string",
		format: "ipv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv4",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class, params) {
	return new Class({
		type: "string",
		format: "cidrv6",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64(Class, params) {
	return new Class({
		type: "string",
		format: "base64",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class, params) {
	return new Class({
		type: "string",
		format: "base64url",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _e164(Class, params) {
	return new Class({
		type: "string",
		format: "e164",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class, params) {
	return new Class({
		type: "string",
		format: "jwt",
		check: "string_format",
		abort: false,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class, params) {
	return new Class({
		type: "string",
		format: "datetime",
		check: "string_format",
		offset: false,
		local: false,
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class, params) {
	return new Class({
		type: "string",
		format: "date",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class, params) {
	return new Class({
		type: "string",
		format: "time",
		check: "string_format",
		precision: null,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class, params) {
	return new Class({
		type: "string",
		format: "duration",
		check: "string_format",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _number(Class, params) {
	return new Class({
		type: "number",
		checks: [],
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _int(Class, params) {
	return new Class({
		type: "number",
		check: "number_format",
		abort: false,
		format: "safeint",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class, params) {
	return new Class({
		type: "boolean",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _null$1(Class, params) {
	return new Class({
		type: "null",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class) {
	return new Class({ type: "unknown" });
}
// @__NO_SIDE_EFFECTS__
function _never(Class, params) {
	return new Class({
		type: "never",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
	return new $ZodCheckLessThan({
		check: "less_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: false
	});
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
	return new $ZodCheckGreaterThan({
		check: "greater_than",
		...normalizeParams(params),
		value,
		inclusive: true
	});
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
	return new $ZodCheckMultipleOf({
		check: "multiple_of",
		...normalizeParams(params),
		value
	});
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
	return new $ZodCheckMaxLength({
		check: "max_length",
		...normalizeParams(params),
		maximum
	});
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
	return new $ZodCheckMinLength({
		check: "min_length",
		...normalizeParams(params),
		minimum
	});
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
	return new $ZodCheckLengthEquals({
		check: "length_equals",
		...normalizeParams(params),
		length
	});
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
	return new $ZodCheckRegex({
		check: "string_format",
		format: "regex",
		...normalizeParams(params),
		pattern
	});
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
	return new $ZodCheckLowerCase({
		check: "string_format",
		format: "lowercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
	return new $ZodCheckUpperCase({
		check: "string_format",
		format: "uppercase",
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
	return new $ZodCheckIncludes({
		check: "string_format",
		format: "includes",
		...normalizeParams(params),
		includes
	});
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
	return new $ZodCheckStartsWith({
		check: "string_format",
		format: "starts_with",
		...normalizeParams(params),
		prefix
	});
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
	return new $ZodCheckEndsWith({
		check: "string_format",
		format: "ends_with",
		...normalizeParams(params),
		suffix
	});
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
	return new $ZodCheckOverwrite({
		check: "overwrite",
		tx
	});
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
	return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
	return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
	return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
	return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class, element, params) {
	return new Class({
		type: "array",
		element,
		...normalizeParams(params)
	});
}
// @__NO_SIDE_EFFECTS__
function _refine(Class, fn, _params) {
	return new Class({
		type: "custom",
		check: "custom",
		fn,
		...normalizeParams(_params)
	});
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
	const ch = /* @__PURE__ */ _check((payload) => {
		payload.addIssue = (issue$2) => {
			if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
			else {
				const _issue = issue$2;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = ch);
				_issue.continue ?? (_issue.continue = !ch._zod.def.abort);
				payload.issues.push(issue(_issue));
			}
		};
		return fn(payload.value, payload);
	}, params);
	return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
	const ch = new $ZodCheck({
		check: "custom",
		...normalizeParams(params)
	});
	ch._zod.check = fn;
	return ch;
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/to-json-schema.js
function initializeContext(params) {
	let target = params?.target ?? "draft-2020-12";
	if (target === "draft-4") target = "draft-04";
	if (target === "draft-7") target = "draft-07";
	return {
		processors: params.processors ?? {},
		metadataRegistry: params?.metadata ?? globalRegistry,
		target,
		unrepresentable: params?.unrepresentable ?? "throw",
		override: params?.override ?? (() => {}),
		io: params?.io ?? "output",
		counter: 0,
		seen: /* @__PURE__ */ new Map(),
		cycles: params?.cycles ?? "ref",
		reused: params?.reused ?? "inline",
		external: params?.external ?? void 0
	};
}
function process$1(schema, ctx, _params = {
	path: [],
	schemaPath: []
}) {
	var _a;
	const def = schema._zod.def;
	const seen = ctx.seen.get(schema);
	if (seen) {
		seen.count++;
		if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
		return seen.schema;
	}
	const result = {
		schema: {},
		count: 1,
		cycle: void 0,
		path: _params.path
	};
	ctx.seen.set(schema, result);
	const overrideSchema = schema._zod.toJSONSchema?.();
	if (overrideSchema) result.schema = overrideSchema;
	else {
		const params = {
			..._params,
			schemaPath: [..._params.schemaPath, schema],
			path: _params.path
		};
		if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
		else {
			const _json = result.schema;
			const processor = ctx.processors[def.type];
			if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
			processor(schema, ctx, _json, params);
		}
		const parent = schema._zod.parent;
		if (parent) {
			if (!result.ref) result.ref = parent;
			process$1(parent, ctx, params);
			ctx.seen.get(parent).isParent = true;
		}
	}
	const meta = ctx.metadataRegistry.get(schema);
	if (meta) Object.assign(result.schema, meta);
	if (ctx.io === "input" && isTransforming(schema)) {
		delete result.schema.examples;
		delete result.schema.default;
	}
	if (ctx.io === "input" && "_prefault" in result.schema) (_a = result.schema).default ?? (_a.default = result.schema._prefault);
	delete result.schema._prefault;
	return ctx.seen.get(schema).schema;
}
function extractDefs(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const idToSchema = /* @__PURE__ */ new Map();
	for (const entry of ctx.seen.entries()) {
		const id = ctx.metadataRegistry.get(entry[0])?.id;
		if (id) {
			const existing = idToSchema.get(id);
			if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
			idToSchema.set(id, entry[0]);
		}
	}
	const makeURI = (entry) => {
		const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
		if (ctx.external) {
			const externalId = ctx.external.registry.get(entry[0])?.id;
			const uriGenerator = ctx.external.uri ?? ((id) => id);
			if (externalId) return { ref: uriGenerator(externalId) };
			const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
			entry[1].defId = id;
			return {
				defId: id,
				ref: `${uriGenerator("__shared")}#/${defsSegment}/${id}`
			};
		}
		if (entry[1] === root) return { ref: "#" };
		const defUriPrefix = `#/${defsSegment}/`;
		const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
		return {
			defId,
			ref: defUriPrefix + defId
		};
	};
	const extractToDef = (entry) => {
		if (entry[1].schema.$ref) return;
		const seen = entry[1];
		const { ref, defId } = makeURI(entry);
		seen.def = { ...seen.schema };
		if (defId) seen.defId = defId;
		const schema = seen.schema;
		for (const key in schema) delete schema[key];
		schema.$ref = ref;
	};
	if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.cycle) throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
	}
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (schema === entry[0]) {
			extractToDef(entry);
			continue;
		}
		if (ctx.external) {
			const ext = ctx.external.registry.get(entry[0])?.id;
			if (schema !== entry[0] && ext) {
				extractToDef(entry);
				continue;
			}
		}
		if (ctx.metadataRegistry.get(entry[0])?.id) {
			extractToDef(entry);
			continue;
		}
		if (seen.cycle) {
			extractToDef(entry);
			continue;
		}
		if (seen.count > 1) {
			if (ctx.reused === "ref") {
				extractToDef(entry);
				continue;
			}
		}
	}
}
function finalize(ctx, schema) {
	const root = ctx.seen.get(schema);
	if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
	const flattenRef = (zodSchema) => {
		const seen = ctx.seen.get(zodSchema);
		if (seen.ref === null) return;
		const schema = seen.def ?? seen.schema;
		const _cached = { ...schema };
		const ref = seen.ref;
		seen.ref = null;
		if (ref) {
			flattenRef(ref);
			const refSeen = ctx.seen.get(ref);
			const refSchema = refSeen.schema;
			if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
				schema.allOf = schema.allOf ?? [];
				schema.allOf.push(refSchema);
			} else Object.assign(schema, refSchema);
			Object.assign(schema, _cached);
			if (zodSchema._zod.parent === ref) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (!(key in _cached)) delete schema[key];
			}
			if (refSchema.$ref && refSeen.def) for (const key in schema) {
				if (key === "$ref" || key === "allOf") continue;
				if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
			}
		}
		const parent = zodSchema._zod.parent;
		if (parent && parent !== ref) {
			flattenRef(parent);
			const parentSeen = ctx.seen.get(parent);
			if (parentSeen?.schema.$ref) {
				schema.$ref = parentSeen.schema.$ref;
				if (parentSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
				}
			}
		}
		ctx.override({
			zodSchema,
			jsonSchema: schema,
			path: seen.path ?? []
		});
	};
	for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
	const result = {};
	if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
	else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
	else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
	else if (ctx.target === "openapi-3.0") {}
	if (ctx.external?.uri) {
		const id = ctx.external.registry.get(schema)?.id;
		if (!id) throw new Error("Schema is missing an `id` property");
		result.$id = ctx.external.uri(id);
	}
	Object.assign(result, root.def ?? root.schema);
	const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
	if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
	const defs = ctx.external?.defs ?? {};
	for (const entry of ctx.seen.entries()) {
		const seen = entry[1];
		if (seen.def && seen.defId) {
			if (seen.def.id === seen.defId) delete seen.def.id;
			defs[seen.defId] = seen.def;
		}
	}
	if (ctx.external) {} else if (Object.keys(defs).length > 0) {
		if (ctx.target === "draft-2020-12") result.$defs = defs;
		else result.definitions = defs;
	}
	try {
		const finalized = JSON.parse(JSON.stringify(result));
		Object.defineProperty(finalized, "~standard", {
			value: {
				...schema["~standard"],
				jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				}
			},
			enumerable: false,
			writable: false
		});
		return finalized;
	} catch (_err) {
		throw new Error("Error converting schema to JSON.");
	}
}
function isTransforming(_schema, _ctx) {
	const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
	if (ctx.seen.has(_schema)) return false;
	ctx.seen.add(_schema);
	const def = _schema._zod.def;
	if (def.type === "transform") return true;
	if (def.type === "array") return isTransforming(def.element, ctx);
	if (def.type === "set") return isTransforming(def.valueType, ctx);
	if (def.type === "lazy") return isTransforming(def.getter(), ctx);
	if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault") return isTransforming(def.innerType, ctx);
	if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
	if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
	if (def.type === "pipe") {
		if (_schema._zod.traits.has("$ZodCodec")) return true;
		return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
	}
	if (def.type === "object") {
		for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
		return false;
	}
	if (def.type === "union") {
		for (const option of def.options) if (isTransforming(option, ctx)) return true;
		return false;
	}
	if (def.type === "tuple") {
		for (const item of def.items) if (isTransforming(item, ctx)) return true;
		if (def.rest && isTransforming(def.rest, ctx)) return true;
		return false;
	}
	return false;
}
/**
* Creates a toJSONSchema method for a schema instance.
* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
*/
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
	const ctx = initializeContext({
		...params,
		processors
	});
	process$1(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
	const { libraryOptions, target } = params ?? {};
	const ctx = initializeContext({
		...libraryOptions ?? {},
		target,
		io,
		processors
	});
	process$1(schema, ctx);
	extractDefs(ctx, schema);
	return finalize(ctx, schema);
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/core/json-schema-processors.js
var formatMap = {
	guid: "uuid",
	url: "uri",
	datetime: "date-time",
	json_string: "json-string",
	regex: ""
};
var stringProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	json.type = "string";
	const { minimum, maximum, format, patterns, contentEncoding } = schema._zod.bag;
	if (typeof minimum === "number") json.minLength = minimum;
	if (typeof maximum === "number") json.maxLength = maximum;
	if (format) {
		json.format = formatMap[format] ?? format;
		if (json.format === "") delete json.format;
		if (format === "time") delete json.format;
	}
	if (contentEncoding) json.contentEncoding = contentEncoding;
	if (patterns && patterns.size > 0) {
		const regexes = [...patterns];
		if (regexes.length === 1) json.pattern = regexes[0].source;
		else if (regexes.length > 1) json.allOf = [...regexes.map((regex) => ({
			...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
			pattern: regex.source
		}))];
	}
};
var numberProcessor = (schema, ctx, _json, _params) => {
	const json = _json;
	const { minimum, maximum, format, multipleOf, exclusiveMaximum, exclusiveMinimum } = schema._zod.bag;
	if (typeof format === "string" && format.includes("int")) json.type = "integer";
	else json.type = "number";
	const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
	const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
	const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
	if (exMin) {
		if (legacy) {
			json.minimum = exclusiveMinimum;
			json.exclusiveMinimum = true;
		} else json.exclusiveMinimum = exclusiveMinimum;
	} else if (typeof minimum === "number") json.minimum = minimum;
	if (exMax) {
		if (legacy) {
			json.maximum = exclusiveMaximum;
			json.exclusiveMaximum = true;
		} else json.exclusiveMaximum = exclusiveMaximum;
	} else if (typeof maximum === "number") json.maximum = maximum;
	if (typeof multipleOf === "number") json.multipleOf = multipleOf;
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
	json.type = "boolean";
};
var nullProcessor = (_schema, ctx, json, _params) => {
	if (ctx.target === "openapi-3.0") {
		json.type = "string";
		json.nullable = true;
		json.enum = [null];
	} else json.type = "null";
};
var neverProcessor = (_schema, _ctx, json, _params) => {
	json.not = {};
};
var enumProcessor = (schema, _ctx, json, _params) => {
	const def = schema._zod.def;
	const values = getEnumValues(def.entries);
	if (values.every((v) => typeof v === "number")) json.type = "number";
	if (values.every((v) => typeof v === "string")) json.type = "string";
	json.enum = values;
};
var literalProcessor = (schema, ctx, json, _params) => {
	const def = schema._zod.def;
	const vals = [];
	for (const val of def.values) if (val === void 0) {
		if (ctx.unrepresentable === "throw") throw new Error("Literal `undefined` cannot be represented in JSON Schema");
	} else if (typeof val === "bigint") {
		if (ctx.unrepresentable === "throw") throw new Error("BigInt literals cannot be represented in JSON Schema");
		else vals.push(Number(val));
	} else vals.push(val);
	if (vals.length === 0) {} else if (vals.length === 1) {
		const val = vals[0];
		json.type = val === null ? "null" : typeof val;
		if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
		else json.const = val;
	} else {
		if (vals.every((v) => typeof v === "number")) json.type = "number";
		if (vals.every((v) => typeof v === "string")) json.type = "string";
		if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
		if (vals.every((v) => v === null)) json.type = "null";
		json.enum = vals;
	}
};
var customProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Custom types cannot be represented in JSON Schema");
};
var transformProcessor = (_schema, ctx, _json, _params) => {
	if (ctx.unrepresentable === "throw") throw new Error("Transforms cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	const { minimum, maximum } = schema._zod.bag;
	if (typeof minimum === "number") json.minItems = minimum;
	if (typeof maximum === "number") json.maxItems = maximum;
	json.type = "array";
	json.items = process$1(def.element, ctx, {
		...params,
		path: [...params.path, "items"]
	});
};
var objectProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	json.properties = {};
	const shape = def.shape;
	for (const key in shape) json.properties[key] = process$1(shape[key], ctx, {
		...params,
		path: [
			...params.path,
			"properties",
			key
		]
	});
	const allKeys = new Set(Object.keys(shape));
	const requiredKeys = new Set([...allKeys].filter((key) => {
		const v = def.shape[key]._zod;
		if (ctx.io === "input") return v.optin === void 0;
		else return v.optout === void 0;
	}));
	if (requiredKeys.size > 0) json.required = Array.from(requiredKeys);
	if (def.catchall?._zod.def.type === "never") json.additionalProperties = false;
	else if (!def.catchall) {
		if (ctx.io === "output") json.additionalProperties = false;
	} else if (def.catchall) json.additionalProperties = process$1(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
var unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => process$1(x, ctx, {
		...params,
		path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		]
	}));
	if (isExclusive) json.oneOf = options;
	else json.anyOf = options;
};
var intersectionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const a = process$1(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = process$1(def.right, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			1
		]
	});
	const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
	json.allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
};
var recordProcessor = (schema, ctx, _json, params) => {
	const json = _json;
	const def = schema._zod.def;
	json.type = "object";
	const keyType = def.keyType;
	const patterns = keyType._zod.bag?.patterns;
	if (def.mode === "loose" && patterns && patterns.size > 0) {
		const valueSchema = process$1(def.valueType, ctx, {
			...params,
			path: [
				...params.path,
				"patternProperties",
				"*"
			]
		});
		json.patternProperties = {};
		for (const pattern of patterns) json.patternProperties[pattern.source] = valueSchema;
	} else {
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") json.propertyNames = process$1(def.keyType, ctx, {
			...params,
			path: [...params.path, "propertyNames"]
		});
		json.additionalProperties = process$1(def.valueType, ctx, {
			...params,
			path: [...params.path, "additionalProperties"]
		});
	}
	const keyValues = keyType._zod.values;
	if (keyValues) {
		const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
		if (validKeyValues.length > 0) json.required = validKeyValues;
	}
};
var nullableProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const inner = process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	let catchValue;
	try {
		catchValue = def.catchValue(void 0);
	} catch {
		throw new Error("Dynamic catch values are not supported in JSON Schema");
	}
	json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	const inIsTransform = def.in._zod.traits.has("$ZodTransform");
	const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
	process$1(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process$1(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/iso.js
var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
	$ZodISODateTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function datetime(params) {
	return /* @__PURE__ */ _isoDateTime(ZodISODateTime, params);
}
var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
	$ZodISODate.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function date(params) {
	return /* @__PURE__ */ _isoDate(ZodISODate, params);
}
var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
	$ZodISOTime.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function time$1(params) {
	return /* @__PURE__ */ _isoTime(ZodISOTime, params);
}
var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
	$ZodISODuration.init(inst, def);
	ZodStringFormat.init(inst, def);
});
function duration(params) {
	return /* @__PURE__ */ _isoDuration(ZodISODuration, params);
}
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/errors.js
var initializer = (inst, issues) => {
	$ZodError.init(inst, issues);
	inst.name = "ZodError";
	Object.defineProperties(inst, {
		format: { value: (mapper) => formatError(inst, mapper) },
		flatten: { value: (mapper) => flattenError(inst, mapper) },
		addIssue: { value: (issue) => {
			inst.issues.push(issue);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		addIssues: { value: (issues) => {
			inst.issues.push(...issues);
			inst.message = JSON.stringify(inst.issues, jsonStringifyReplacer, 2);
		} },
		isEmpty: { get() {
			return inst.issues.length === 0;
		} }
	});
};
var ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, { Parent: Error });
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
//#endregion
//#region node_modules/.bun/zod@4.4.3/node_modules/zod/v4/classic/schemas.js
var _installedGroups = /* @__PURE__ */ new WeakMap();
function _installLazyMethods(inst, group, methods) {
	const proto = Object.getPrototypeOf(inst);
	let installed = _installedGroups.get(proto);
	if (!installed) {
		installed = /* @__PURE__ */ new Set();
		_installedGroups.set(proto, installed);
	}
	if (installed.has(group)) return;
	installed.add(group);
	for (const key in methods) {
		const fn = methods[key];
		Object.defineProperty(proto, key, {
			configurable: true,
			enumerable: false,
			get() {
				const bound = fn.bind(this);
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: bound
				});
				return bound;
			},
			set(v) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable: true,
					value: v
				});
			}
		});
	}
}
var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
	$ZodType.init(inst, def);
	Object.assign(inst["~standard"], { jsonSchema: {
		input: createStandardJSONSchemaMethod(inst, "input"),
		output: createStandardJSONSchemaMethod(inst, "output")
	} });
	inst.toJSONSchema = createToJSONSchemaMethod(inst, {});
	inst.def = def;
	inst.type = def.type;
	Object.defineProperty(inst, "_def", { value: def });
	inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
	inst.safeParse = (data, params) => safeParse(inst, data, params);
	inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
	inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
	inst.spa = inst.safeParseAsync;
	inst.encode = (data, params) => encode(inst, data, params);
	inst.decode = (data, params) => decode(inst, data, params);
	inst.encodeAsync = async (data, params) => encodeAsync(inst, data, params);
	inst.decodeAsync = async (data, params) => decodeAsync(inst, data, params);
	inst.safeEncode = (data, params) => safeEncode(inst, data, params);
	inst.safeDecode = (data, params) => safeDecode(inst, data, params);
	inst.safeEncodeAsync = async (data, params) => safeEncodeAsync(inst, data, params);
	inst.safeDecodeAsync = async (data, params) => safeDecodeAsync(inst, data, params);
	_installLazyMethods(inst, "ZodType", {
		check(...chks) {
			const def = this.def;
			return this.clone(mergeDefs(def, { checks: [...def.checks ?? [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)] }), { parent: true });
		},
		with(...chks) {
			return this.check(...chks);
		},
		clone(def, params) {
			return clone$1(this, def, params);
		},
		brand() {
			return this;
		},
		register(reg, meta) {
			reg.add(this, meta);
			return this;
		},
		refine(check, params) {
			return this.check(refine(check, params));
		},
		superRefine(refinement, params) {
			return this.check(superRefine(refinement, params));
		},
		overwrite(fn) {
			return this.check(/* @__PURE__ */ _overwrite(fn));
		},
		optional() {
			return optional(this);
		},
		exactOptional() {
			return exactOptional(this);
		},
		nullable() {
			return nullable(this);
		},
		nullish() {
			return optional(nullable(this));
		},
		nonoptional(params) {
			return nonoptional(this, params);
		},
		array() {
			return array(this);
		},
		or(arg) {
			return union([this, arg]);
		},
		and(arg) {
			return intersection(this, arg);
		},
		transform(tx) {
			return pipe(this, transform(tx));
		},
		default(d) {
			return _default(this, d);
		},
		prefault(d) {
			return prefault(this, d);
		},
		catch(params) {
			return _catch(this, params);
		},
		pipe(target) {
			return pipe(this, target);
		},
		readonly() {
			return readonly(this);
		},
		describe(description) {
			const cl = this.clone();
			globalRegistry.add(cl, { description });
			return cl;
		},
		meta(...args) {
			if (args.length === 0) return globalRegistry.get(this);
			const cl = this.clone();
			globalRegistry.add(cl, args[0]);
			return cl;
		},
		isOptional() {
			return this.safeParse(void 0).success;
		},
		isNullable() {
			return this.safeParse(null).success;
		},
		apply(fn) {
			return fn(this);
		}
	});
	Object.defineProperty(inst, "description", {
		get() {
			return globalRegistry.get(inst)?.description;
		},
		configurable: true
	});
	return inst;
});
/** @internal */
var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	const bag = inst._zod.bag;
	inst.format = bag.format ?? null;
	inst.minLength = bag.minimum ?? null;
	inst.maxLength = bag.maximum ?? null;
	_installLazyMethods(inst, "_ZodString", {
		regex(...args) {
			return this.check(/* @__PURE__ */ _regex(...args));
		},
		includes(...args) {
			return this.check(/* @__PURE__ */ _includes(...args));
		},
		startsWith(...args) {
			return this.check(/* @__PURE__ */ _startsWith(...args));
		},
		endsWith(...args) {
			return this.check(/* @__PURE__ */ _endsWith(...args));
		},
		min(...args) {
			return this.check(/* @__PURE__ */ _minLength(...args));
		},
		max(...args) {
			return this.check(/* @__PURE__ */ _maxLength(...args));
		},
		length(...args) {
			return this.check(/* @__PURE__ */ _length(...args));
		},
		nonempty(...args) {
			return this.check(/* @__PURE__ */ _minLength(1, ...args));
		},
		lowercase(params) {
			return this.check(/* @__PURE__ */ _lowercase(params));
		},
		uppercase(params) {
			return this.check(/* @__PURE__ */ _uppercase(params));
		},
		trim() {
			return this.check(/* @__PURE__ */ _trim());
		},
		normalize(...args) {
			return this.check(/* @__PURE__ */ _normalize(...args));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ _toLowerCase());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ _toUpperCase());
		},
		slugify() {
			return this.check(/* @__PURE__ */ _slugify());
		}
	});
});
var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
	$ZodString.init(inst, def);
	_ZodString.init(inst, def);
	inst.email = (params) => inst.check(/* @__PURE__ */ _email(ZodEmail, params));
	inst.url = (params) => inst.check(/* @__PURE__ */ _url(ZodURL, params));
	inst.jwt = (params) => inst.check(/* @__PURE__ */ _jwt(ZodJWT, params));
	inst.emoji = (params) => inst.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.uuid = (params) => inst.check(/* @__PURE__ */ _uuid(ZodUUID, params));
	inst.uuidv4 = (params) => inst.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
	inst.uuidv6 = (params) => inst.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
	inst.uuidv7 = (params) => inst.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
	inst.nanoid = (params) => inst.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
	inst.guid = (params) => inst.check(/* @__PURE__ */ _guid(ZodGUID, params));
	inst.cuid = (params) => inst.check(/* @__PURE__ */ _cuid(ZodCUID, params));
	inst.cuid2 = (params) => inst.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
	inst.ulid = (params) => inst.check(/* @__PURE__ */ _ulid(ZodULID, params));
	inst.base64 = (params) => inst.check(/* @__PURE__ */ _base64(ZodBase64, params));
	inst.base64url = (params) => inst.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
	inst.xid = (params) => inst.check(/* @__PURE__ */ _xid(ZodXID, params));
	inst.ksuid = (params) => inst.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
	inst.ipv4 = (params) => inst.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
	inst.ipv6 = (params) => inst.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
	inst.cidrv4 = (params) => inst.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
	inst.cidrv6 = (params) => inst.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
	inst.e164 = (params) => inst.check(/* @__PURE__ */ _e164(ZodE164, params));
	inst.datetime = (params) => inst.check(datetime(params));
	inst.date = (params) => inst.check(date(params));
	inst.time = (params) => inst.check(time$1(params));
	inst.duration = (params) => inst.check(duration(params));
});
function string(params) {
	return /* @__PURE__ */ _string(ZodString, params);
}
var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
	$ZodStringFormat.init(inst, def);
	_ZodString.init(inst, def);
});
var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
	$ZodEmail.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
	$ZodGUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
	$ZodUUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
	$ZodURL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
	$ZodEmoji.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
	$ZodNanoID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
/**
* @deprecated CUID v1 is deprecated by its authors due to information leakage
* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
* See https://github.com/paralleldrive/cuid.
*/
var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
	$ZodCUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
	$ZodCUID2.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
	$ZodULID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
	$ZodXID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
	$ZodKSUID.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
	$ZodIPv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
	$ZodIPv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
	$ZodCIDRv4.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
	$ZodCIDRv6.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
	$ZodBase64.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
	$ZodBase64URL.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
	$ZodE164.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
	$ZodJWT.init(inst, def);
	ZodStringFormat.init(inst, def);
});
var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
	$ZodNumber.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
	_installLazyMethods(inst, "ZodNumber", {
		gt(value, params) {
			return this.check(/* @__PURE__ */ _gt(value, params));
		},
		gte(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		min(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		lt(value, params) {
			return this.check(/* @__PURE__ */ _lt(value, params));
		},
		lte(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		max(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		int(params) {
			return this.check(int(params));
		},
		safe(params) {
			return this.check(int(params));
		},
		positive(params) {
			return this.check(/* @__PURE__ */ _gt(0, params));
		},
		nonnegative(params) {
			return this.check(/* @__PURE__ */ _gte(0, params));
		},
		negative(params) {
			return this.check(/* @__PURE__ */ _lt(0, params));
		},
		nonpositive(params) {
			return this.check(/* @__PURE__ */ _lte(0, params));
		},
		multipleOf(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		step(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		finite() {
			return this;
		}
	});
	const bag = inst._zod.bag;
	inst.minValue = Math.max(bag.minimum ?? Number.NEGATIVE_INFINITY, bag.exclusiveMinimum ?? Number.NEGATIVE_INFINITY) ?? null;
	inst.maxValue = Math.min(bag.maximum ?? Number.POSITIVE_INFINITY, bag.exclusiveMaximum ?? Number.POSITIVE_INFINITY) ?? null;
	inst.isInt = (bag.format ?? "").includes("int") || Number.isSafeInteger(bag.multipleOf ?? .5);
	inst.isFinite = true;
	inst.format = bag.format ?? null;
});
function number(params) {
	return /* @__PURE__ */ _number(ZodNumber, params);
}
var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
	$ZodNumberFormat.init(inst, def);
	ZodNumber.init(inst, def);
});
function int(params) {
	return /* @__PURE__ */ _int(ZodNumberFormat, params);
}
var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
	$ZodBoolean.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean(params) {
	return /* @__PURE__ */ _boolean(ZodBoolean, params);
}
var ZodNull = /*@__PURE__*/ $constructor("ZodNull", (inst, def) => {
	$ZodNull.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function _null(params) {
	return /* @__PURE__ */ _null$1(ZodNull, params);
}
var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
	$ZodUnknown.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => void 0;
});
function unknown() {
	return /* @__PURE__ */ _unknown(ZodUnknown);
}
var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
	$ZodNever.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
	return /* @__PURE__ */ _never(ZodNever, params);
}
var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
	$ZodArray.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
	inst.element = def.element;
	_installLazyMethods(inst, "ZodArray", {
		min(n, params) {
			return this.check(/* @__PURE__ */ _minLength(n, params));
		},
		nonempty(params) {
			return this.check(/* @__PURE__ */ _minLength(1, params));
		},
		max(n, params) {
			return this.check(/* @__PURE__ */ _maxLength(n, params));
		},
		length(n, params) {
			return this.check(/* @__PURE__ */ _length(n, params));
		},
		unwrap() {
			return this.element;
		}
	});
});
function array(element, params) {
	return /* @__PURE__ */ _array(ZodArray, element, params);
}
var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
	$ZodObjectJIT.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
	defineLazy(inst, "shape", () => {
		return def.shape;
	});
	_installLazyMethods(inst, "ZodObject", {
		keyof() {
			return _enum(Object.keys(this._zod.def.shape));
		},
		catchall(catchall) {
			return this.clone({
				...this._zod.def,
				catchall
			});
		},
		passthrough() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		loose() {
			return this.clone({
				...this._zod.def,
				catchall: unknown()
			});
		},
		strict() {
			return this.clone({
				...this._zod.def,
				catchall: never()
			});
		},
		strip() {
			return this.clone({
				...this._zod.def,
				catchall: void 0
			});
		},
		extend(incoming) {
			return extend(this, incoming);
		},
		safeExtend(incoming) {
			return safeExtend(this, incoming);
		},
		merge(other) {
			return merge(this, other);
		},
		pick(mask) {
			return pick(this, mask);
		},
		omit(mask) {
			return omit(this, mask);
		},
		partial(...args) {
			return partial(ZodOptional, this, args[0]);
		},
		required(...args) {
			return required(ZodNonOptional, this, args[0]);
		}
	});
});
function object(shape, params) {
	return new ZodObject({
		type: "object",
		shape: shape ?? {},
		...normalizeParams(params)
	});
}
var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
	$ZodUnion.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
	inst.options = def.options;
});
function union(options, params) {
	return new ZodUnion({
		type: "union",
		options,
		...normalizeParams(params)
	});
}
var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
	ZodUnion.init(inst, def);
	$ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
	return new ZodDiscriminatedUnion({
		type: "union",
		options,
		discriminator,
		...normalizeParams(params)
	});
}
var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
	$ZodIntersection.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
	return new ZodIntersection({
		type: "intersection",
		left,
		right
	});
}
var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
	$ZodRecord.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
	inst.keyType = def.keyType;
	inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
	if (!valueType || !valueType._zod) return new ZodRecord({
		type: "record",
		keyType: string(),
		valueType: keyType,
		...normalizeParams(valueType)
	});
	return new ZodRecord({
		type: "record",
		keyType,
		valueType,
		...normalizeParams(params)
	});
}
function partialRecord(keyType, valueType, params) {
	const k = clone$1(keyType);
	k._zod.values = void 0;
	return new ZodRecord({
		type: "record",
		keyType: k,
		valueType,
		...normalizeParams(params)
	});
}
var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
	$ZodEnum.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
	inst.enum = def.entries;
	inst.options = Object.values(def.entries);
	const keys = new Set(Object.keys(def.entries));
	inst.extract = (values, params) => {
		const newEntries = {};
		for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
	inst.exclude = (values, params) => {
		const newEntries = { ...def.entries };
		for (const value of values) if (keys.has(value)) delete newEntries[value];
		else throw new Error(`Key ${value} not found in enum`);
		return new ZodEnum({
			...def,
			checks: [],
			...normalizeParams(params),
			entries: newEntries
		});
	};
});
function _enum(values, params) {
	return new ZodEnum({
		type: "enum",
		entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values,
		...normalizeParams(params)
	});
}
var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
	$ZodLiteral.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
	inst.values = new Set(def.values);
	Object.defineProperty(inst, "value", { get() {
		if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
		return def.values[0];
	} });
});
function literal(value, params) {
	return new ZodLiteral({
		type: "literal",
		values: Array.isArray(value) ? value : [value],
		...normalizeParams(params)
	});
}
var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
	$ZodTransform.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
	inst._zod.parse = (payload, _ctx) => {
		if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
		payload.addIssue = (issue$1) => {
			if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
			else {
				const _issue = issue$1;
				if (_issue.fatal) _issue.continue = false;
				_issue.code ?? (_issue.code = "custom");
				_issue.input ?? (_issue.input = payload.value);
				_issue.inst ?? (_issue.inst = inst);
				payload.issues.push(issue(_issue));
			}
		};
		const output = def.transform(payload.value, payload);
		if (output instanceof Promise) return output.then((output) => {
			payload.value = output;
			payload.fallback = true;
			return payload;
		});
		payload.value = output;
		payload.fallback = true;
		return payload;
	};
});
function transform(fn) {
	return new ZodTransform({
		type: "transform",
		transform: fn
	});
}
var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
	$ZodOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
	return new ZodOptional({
		type: "optional",
		innerType
	});
}
var ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
	$ZodExactOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
	return new ZodExactOptional({
		type: "optional",
		innerType
	});
}
var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
	$ZodNullable.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
	return new ZodNullable({
		type: "nullable",
		innerType
	});
}
var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
	$ZodDefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
	return new ZodDefault({
		type: "default",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
	$ZodPrefault.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
	return new ZodPrefault({
		type: "prefault",
		innerType,
		get defaultValue() {
			return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
		}
	});
}
var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
	$ZodNonOptional.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
	return new ZodNonOptional({
		type: "nonoptional",
		innerType,
		...normalizeParams(params)
	});
}
var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
	$ZodCatch.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
	inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
	return new ZodCatch({
		type: "catch",
		innerType,
		catchValue: typeof catchValue === "function" ? catchValue : () => catchValue
	});
}
var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
	$ZodPipe.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
	inst.in = def.in;
	inst.out = def.out;
});
function pipe(in_, out) {
	return new ZodPipe({
		type: "pipe",
		in: in_,
		out
	});
}
var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
	$ZodReadonly.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
	inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
	return new ZodReadonly({
		type: "readonly",
		innerType
	});
}
var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
	$ZodCustom.init(inst, def);
	ZodType.init(inst, def);
	inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
	return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
	return /* @__PURE__ */ _superRefine(fn, params);
}
//#endregion
//#region src/shared/video-edits.ts
var time = number().int().min(0).max(864e5);
var unit = number().min(0).max(1);
var interpolationSchema = _enum([
	"linear",
	"smooth",
	"hold"
]);
var framingKeyframeSchema = object({
	timeMs: time,
	x: unit,
	y: unit,
	zoom: number().min(1).max(8),
	transition: interpolationSchema
});
var gainPointSchema = object({
	timeMs: time,
	gain: unit
});
var muteRangeSchema = object({
	startMs: time,
	endMs: time
}).refine((value) => value.endMs > value.startMs, "The end must follow the start.");
var audioAutomationSchema = object({
	trackIndex: number().int().min(0).max(7),
	points: array(gainPointSchema).max(128),
	mutes: array(muteRangeSchema).max(64)
});
var videoOverlaySchema = object({
	id: string().uuid(),
	kind: _enum([
		"text",
		"blur",
		"pixelate"
	]),
	startMs: time,
	endMs: time,
	x: unit,
	y: unit,
	width: number().min(.02).max(1),
	height: number().min(.02).max(1),
	content: string().max(500).refine((value) => !/[\x00-\x08\x0b-\x1f]/.test(value), "Use printable text.").optional(),
	size: _enum([
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
var videoTextSchema = object({
	content: string().max(160).refine((text) => !/[\x00-\x08\x0b-\x1f]/.test(text), "Use printable text."),
	startMs: number().int().nonnegative(),
	endMs: number().int().positive(),
	position: _enum([
		"top",
		"center",
		"bottom"
	]),
	size: _enum([
		"small",
		"medium",
		"large"
	])
}).refine((text) => text.endMs > text.startMs, "Text must end after it starts.");
var videoEditsSchema = object({
	speed: number().min(.25).max(4).optional(),
	brightness: number().min(-.3).max(.3).optional(),
	contrast: number().min(.5).max(1.5).optional(),
	saturation: number().min(0).max(2).optional(),
	flipHorizontal: boolean().optional(),
	text: videoTextSchema.optional(),
	framing: object({
		mode: _enum(["fill", "fit"]),
		background: _enum(["black", "blur"]),
		keyframes: array(framingKeyframeSchema).max(128)
	}).optional(),
	overlays: array(videoOverlaySchema).max(32).optional(),
	speedPoints: array(object({
		timeMs: time,
		speed: number().min(.25).max(4),
		transition: _enum(["linear", "hold"])
	})).max(64).optional(),
	freezes: array(object({
		timeMs: time,
		durationMs: number().int().min(100).max(3e4)
	})).max(32).optional(),
	audioAutomation: array(audioAutomationSchema).max(8).optional()
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
function montageSizeChoices(durationMs) {
	return [
		2,
		5,
		10
	].map((mbps) => Math.max(10, Math.ceil(durationMs / 1e3 * (mbps + .192) / 8 * 1e6 / 1048576 / 5) * 5));
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
function sourceToEditedMs(startMs, sourceMs, edits) {
	return movingDurationMs(startMs, sourceMs, edits) + (edits?.freezes ?? []).filter((hold) => hold.timeMs >= startMs && hold.timeMs < sourceMs).reduce((sum, hold) => sum + hold.durationMs, 0);
}
function editedTimeAt(startMs, endMs, outputMs, edits) {
	const target = Math.max(0, outputMs);
	if (!edits?.speedPoints?.length && !edits?.freezes?.length) return {
		sourceMs: Math.min(endMs, startMs + target * (edits?.speed ?? 1)),
		frozen: false
	};
	for (const hold of edits?.freezes ?? []) {
		if (hold.timeMs < startMs || hold.timeMs >= endMs) continue;
		const begins = sourceToEditedMs(startMs, hold.timeMs, edits);
		if (target >= begins && target < begins + hold.durationMs) return {
			sourceMs: hold.timeMs,
			frozen: true
		};
	}
	let low = startMs, high = endMs;
	for (let i = 0; i < 36; i++) {
		const middle = (low + high) / 2;
		if (sourceToEditedMs(startMs, middle, edits) <= target) low = middle;
		else high = middle;
	}
	return {
		sourceMs: Math.round(Math.min(endMs, Math.max(startMs, (low + high) / 2)) * 1e6) / 1e6,
		frozen: false
	};
}
function framingAt(timeMs, edits) {
	const points = edits?.framing?.keyframes ?? [];
	if (!points.length) return {
		timeMs,
		x: .5,
		y: .5,
		zoom: 1,
		transition: "smooth"
	};
	let previous = points[0];
	if (timeMs <= previous.timeMs) return previous;
	for (const next of points.slice(1)) {
		if (next.timeMs > timeMs) {
			let t = previous.transition === "hold" ? 0 : (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs);
			if (previous.transition === "smooth") t = t * t * (3 - 2 * t);
			return {
				timeMs,
				x: previous.x + (next.x - previous.x) * t,
				y: previous.y + (next.y - previous.y) * t,
				zoom: previous.zoom + (next.zoom - previous.zoom) * t,
				transition: previous.transition
			};
		}
		previous = next;
	}
	return previous;
}
function gainAt(points, timeMs) {
	if (!points?.length) return 1;
	let previous = points[0];
	for (const next of points.slice(1)) {
		if (next.timeMs > timeMs) {
			const t = Math.max(0, (timeMs - previous.timeMs) / (next.timeMs - previous.timeMs));
			return previous.gain + (next.gain - previous.gain) * t;
		}
		previous = next;
	}
	return previous.gain;
}
function automationGainAt(automation, timeMs) {
	return automation?.mutes.some((range) => timeMs >= range.startMs && timeMs < range.endMs) ? 0 : gainAt(automation?.points, timeMs);
}
var canvasRatios = {
	"16:9": 16 / 9,
	"9:16": 9 / 16,
	"1:1": 1,
	"4:5": 4 / 5
};
function framingGeometry(sourceWidth, sourceHeight, width, height, key, mode) {
	const fit = Math.min(width / sourceWidth, height / sourceHeight);
	const imageWidth = sourceWidth * fit, imageHeight = sourceHeight * fit;
	const zoom = (mode === "fill" ? Math.max(width / imageWidth, height / imageHeight) : 1) * key.zoom;
	const padX = (width - imageWidth) / 2, padY = (height - imageHeight) / 2;
	const cropX = Math.max(0, Math.min(width - width / zoom, padX + (imageWidth - width / zoom) * key.x));
	const cropY = Math.max(0, Math.min(height - height / zoom, padY + (imageHeight - height / zoom) * key.y));
	return {
		x: (padX - cropX) * zoom,
		y: (padY - cropY) * zoom,
		width: imageWidth * zoom,
		height: imageHeight * zoom,
		zoom,
		cropX,
		cropY
	};
}
//#endregion
//#region src/shared/montage-audio.ts
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
	loop: boolean().default(true),
	automation: object({
		points: array(gainPointSchema).max(128),
		mutes: array(muteRangeSchema).max(64)
	}).optional(),
	ducking: object({
		enabled: boolean(),
		amount: number().min(0).max(1),
		attackMs: number().int().min(10).max(1e3),
		releaseMs: number().int().min(50).max(3e3)
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
//#endregion
//#region src/shared/contracts.ts
var pageIdSchema = _enum([
	"devices",
	"audio",
	"capture",
	"modules",
	"settings"
]);
var engineKindSchema = _enum(["audio", "capture"]);
var engineStateSchema = _enum([
	"stopped",
	"starting",
	"running",
	"error"
]);
var engineProcessResourceSchema = object({
	pid: number().int().positive(),
	role: string().trim().min(1).max(32).regex(/^[a-z0-9-]+$/),
	privateMemoryMb: number().min(0),
	workingSetMb: number().min(0)
});
var engineStatusSchema = object({
	kind: engineKindSchema,
	state: engineStateSchema,
	pid: number().int().positive().optional(),
	cpuPercent: number().min(0),
	memoryMb: number().min(0),
	uptimeSeconds: number().min(0),
	message: string().optional(),
	updatedAt: string(),
	processes: array(engineProcessResourceSchema).max(8).optional()
});
var moduleKindSchema = _enum([
	"device",
	"capture",
	"audio",
	"integration"
]);
var moduleSourceSchema = _enum(["bundled", "local"]);
var moduleRuntimeStatusSchema = _enum([
	"ready",
	"validating",
	"active",
	"invalid",
	"incompatible",
	"missing",
	"runtime-error"
]);
var moduleValidationIssueSchema = object({
	severity: _enum([
		"error",
		"warning",
		"info"
	]),
	code: string().min(1),
	message: string().min(1),
	file: string().min(1).optional()
});
var moduleDevelopmentStateSchema = object({
	projectPath: string().min(1),
	sdkVersion: literal(1),
	status: moduleRuntimeStatusSchema,
	lastValidatedAt: string().nullable(),
	issues: array(moduleValidationIssueSchema).max(64)
});
var moduleManifestSchema = object({
	id: string(),
	name: string(),
	description: string(),
	version: string(),
	kind: moduleKindSchema,
	sizeMb: number().nonnegative(),
	installed: boolean(),
	enabled: boolean(),
	official: boolean(),
	restartRequired: boolean().default(false),
	capabilities: array(string()),
	vendors: array(string()).default([]),
	source: moduleSourceSchema.default("bundled"),
	author: string().trim().min(1).max(120).optional(),
	development: moduleDevelopmentStateSchema.optional()
});
var moduleIdentifierSchema = string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/, "Use a namespaced lowercase ID such as device.my-company.product.");
var moduleVersionSchema = string().trim().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic version such as 0.1.0.");
var moduleHexIdentifierSchema = string().trim().regex(/^[0-9a-fA-F]{4}$/, "Use exactly four hexadecimal characters.");
var addonHidPermissionSchema = object({
	vendorId: moduleHexIdentifierSchema,
	productIds: array(moduleHexIdentifierSchema).min(1).max(32)
});
object({
	schemaVersion: literal(1),
	id: moduleIdentifierSchema,
	name: string().trim().min(2).max(80),
	description: string().trim().min(12).max(240),
	author: string().trim().min(2).max(120),
	version: moduleVersionSchema,
	minimumCoreVersion: moduleVersionSchema,
	kind: moduleKindSchema,
	entrypoint: string().trim().min(1).max(200),
	capabilities: array(string().trim().min(1).max(64)).min(1).max(32),
	permissions: object({ hid: array(addonHidPermissionSchema).min(1).max(16).default([]) })
});
object({ moduleId: moduleIdentifierSchema });
var deviceKindSchema = _enum([
	"mouse",
	"microphone",
	"keyboard",
	"headset",
	"unknown"
]);
var createModuleProjectInputSchema = object({
	id: moduleIdentifierSchema,
	name: string().trim().min(2).max(80),
	description: string().trim().min(12).max(240),
	author: string().trim().min(2).max(120),
	manufacturer: string().trim().min(1).max(80),
	model: string().trim().min(1).max(120),
	deviceKind: deviceKindSchema,
	vendorId: moduleHexIdentifierSchema,
	productId: moduleHexIdentifierSchema
});
var deviceConnectionSchema = _enum([
	"usb",
	"wireless",
	"bluetooth",
	"unknown"
]);
var deviceSettingValueSchema = union([
	string(),
	number(),
	boolean(),
	array(number()),
	array(string())
]);
var deviceIdentitySchema = object({
	manufacturer: string().min(1).optional(),
	productFamily: string().min(1).optional(),
	model: string().min(1).optional(),
	variant: string().min(1).optional(),
	colorway: string().min(1).optional(),
	connection: deviceConnectionSchema.optional(),
	connectionLabel: string().min(1).optional(),
	hardwareRevision: string().min(1).optional(),
	vendorId: number().int().min(0).max(65535).optional(),
	productId: number().int().min(0).max(65535).optional(),
	transportProductId: number().int().min(0).max(65535).optional(),
	interfaceProductIds: array(number().int().min(0).max(65535)).optional(),
	serialNumber: string().min(1).optional(),
	productString: string().min(1).optional()
});
var deviceVariantResolutionSchema = object({
	confidence: _enum([
		"hardware",
		"product-id",
		"module-metadata",
		"user-override",
		"fallback"
	]),
	source: string().min(1),
	evidence: string().min(1).optional()
});
var productAssetResolutionSchema = object({
	key: string().min(1),
	matchedBy: _enum([
		"exact-variant",
		"exact-model",
		"manufacturer-default",
		"generic"
	]),
	source: _enum(["bundled-official", "bundled-generic"])
});
var deviceAppearanceOverrideSchema = object({
	variant: string().trim().min(1),
	colorway: string().trim().min(1).optional()
});
var batteryCapabilitySchema = object({
	percentage: number().min(0).max(100),
	charging: boolean().optional(),
	fullyCharged: boolean().optional(),
	estimatedMinutesRemaining: number().int().nonnegative().optional(),
	updatedAt: number().int().nonnegative()
});
var mouseBatteryLightingPolicySchema = object({
	flashEnabled: boolean().default(true),
	warningPercentage: number().int().min(1).max(100).default(20),
	flashIntervalMinutes: number().int().min(1).max(60).default(5),
	cutoffEnabled: boolean().default(true),
	cutoffPercentage: number().int().min(1).max(100).default(10)
});
var defaultMouseBatteryLightingPolicy = mouseBatteryLightingPolicySchema.parse({});
var deviceProfileModeSchema = _enum(["software", "onboard"]);
var dpiCapabilitySchema = object({
	writable: boolean(),
	min: number().int().positive(),
	max: number().int().positive(),
	step: number().int().positive(),
	stages: array(number().int().positive()).min(1),
	activeDpi: number().int().positive(),
	defaultDpi: number().int().positive(),
	shiftDpi: number().int().positive().optional(),
	shiftMode: _enum(["device-profile", "host-button-spy"]).optional(),
	maxStages: number().int().positive().optional(),
	profileMode: deviceProfileModeSchema,
	unavailableReason: string().optional()
});
var reportRateCapabilitySchema = object({
	writable: boolean(),
	value: number().int().positive(),
	supportedRates: array(number().int().positive()).min(1),
	profileMode: deviceProfileModeSchema,
	unavailableReason: string().optional()
});
var mouseActionCategorySchema = _enum(["mouse", "system"]);
var mouseActionSchema = object({
	id: string().min(1),
	label: string().min(1),
	category: mouseActionCategorySchema,
	searchTerms: array(string()).default([]),
	selectable: boolean().optional()
});
var deviceHotspotSchema = object({
	id: string().min(1),
	label: string().min(1),
	position: object({
		x: number().min(0).max(100),
		y: number().min(0).max(100)
	}),
	calloutSide: _enum(["left", "right"]),
	order: number().int().nonnegative(),
	capability: literal("button-assignment")
});
var buttonAssignmentBindingSchema = object({
	buttonId: string().min(1),
	slotId: string().min(1),
	currentActionId: string().min(1),
	hotspot: deviceHotspotSchema
});
var buttonAssignmentsCapabilitySchema = object({
	writable: boolean(),
	profileMode: deviceProfileModeSchema,
	bindings: array(buttonAssignmentBindingSchema),
	availableActions: array(mouseActionSchema),
	unavailableReason: string().optional()
});
var lightingEffectSchema = object({
	id: string().min(1),
	label: string().min(1),
	controls: array(_enum([
		"color",
		"zones",
		"brightness",
		"speed",
		"direction"
	])).optional()
});
var lightingDirectionSchema = _enum([
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
var lightingZoneSchema = object({
	id: string().min(1),
	label: string().min(1),
	color: string().regex(/^#[0-9a-f]{6}$/i),
	colorWritable: boolean()
});
var lightingProfileSchema = object({
	id: string().min(1),
	label: string().min(1),
	effectId: string().min(1),
	brightness: number().min(0).max(100),
	speed: number().min(1).max(100)
});
var lightingCapabilitySchema = object({
	statusLightingSupported: boolean().optional(),
	batteryStatus: _enum([
		"monitoring",
		"warning",
		"cutoff",
		"charging",
		"disabled",
		"unavailable",
		"error"
	]).optional(),
	batteryStatusReason: string().optional(),
	batteryLightingEnabled: boolean().optional(),
	writable: boolean(),
	enabled: boolean(),
	activeEffectId: string().min(1),
	availableEffects: array(lightingEffectSchema).min(1),
	color: string().regex(/^#[0-9a-f]{6}$/i).optional(),
	colorWritable: boolean().default(false),
	brightness: number().min(0).max(100).optional(),
	brightnessWritable: boolean().default(false),
	speed: number().min(1).max(100).optional(),
	speedWritable: boolean().default(false),
	direction: lightingDirectionSchema.optional(),
	availableDirections: array(lightingDirectionSchema).optional(),
	directionWritable: boolean().optional(),
	zones: array(lightingZoneSchema).optional(),
	profiles: array(lightingProfileSchema).default([]),
	activeProfileId: string().min(1).optional(),
	muteLinked: boolean().default(false),
	muteLinkedWritable: boolean().default(false),
	state: _enum([
		"maintained",
		"acknowledged",
		"unknown"
	]).optional(),
	stateReason: string().optional(),
	physicalEffectVerified: boolean().default(false),
	profileMode: deviceProfileModeSchema,
	source: _enum(["software", "firmware"]),
	unavailableReason: string().optional()
});
var keyboardFeatureStatusSchema = _enum([
	"native",
	"synapse",
	"observed",
	"unsupported"
]);
var keyboardFeatureSchema = object({
	id: string().min(1),
	label: string().min(1),
	summary: string().min(1),
	status: keyboardFeatureStatusSchema,
	unavailableReason: string().optional()
});
var keyboardToggleCapabilitySchema = object({
	enabled: boolean().nullable(),
	writable: boolean(),
	unavailableReason: string().optional()
});
var keyboardOnboardProfileSchema = object({
	id: string().min(1),
	label: string().min(1)
});
var keyboardOnboardProfilesCapabilitySchema = object({
	activeProfileId: string().min(1).nullable(),
	profiles: array(keyboardOnboardProfileSchema),
	writable: boolean(),
	unavailableReason: string().optional()
});
var keyboardDiagnosticReadSchema = object({
	id: string().min(1),
	ok: boolean(),
	error: string().optional()
});
var keyboardDiagnosticsSchema = object({
	protocol: string().min(1),
	endpoint: _enum([
		"ready",
		"partial",
		"unavailable"
	]),
	lastSyncAt: string().optional(),
	lastControlError: string().optional(),
	reads: array(keyboardDiagnosticReadSchema)
});
var keyboardCapabilitySchema = object({
	firmwareVersion: string().min(1).optional(),
	pollingRateHz: number().int().positive().optional(),
	transport: _enum(["native-hid", "unavailable"]),
	features: array(keyboardFeatureSchema),
	gamingMode: keyboardToggleCapabilitySchema.optional(),
	rapidTrigger: keyboardToggleCapabilitySchema.optional(),
	snapTap: keyboardToggleCapabilitySchema.optional(),
	onboardProfiles: keyboardOnboardProfilesCapabilitySchema.optional(),
	diagnostics: keyboardDiagnosticsSchema.optional()
});
var microphoneMuteStateCapabilitySchema = object({
	muted: boolean().nullable(),
	source: literal("hardware"),
	updatedAt: string().optional(),
	unavailableReason: string().optional()
});
var onboardMemoryCapabilitySchema = object({
	writable: boolean(),
	enabled: boolean(),
	activeProfile: string().min(1).optional()
});
var deviceCapabilitiesSchema = object({
	battery: batteryCapabilitySchema.optional(),
	dpi: dpiCapabilitySchema.optional(),
	reportRate: reportRateCapabilitySchema.optional(),
	buttonAssignments: buttonAssignmentsCapabilitySchema.optional(),
	lighting: lightingCapabilitySchema.optional(),
	onboardMemory: onboardMemoryCapabilitySchema.optional(),
	gain: boolean().optional(),
	monitoring: boolean().optional(),
	mute: boolean().optional(),
	muteState: microphoneMuteStateCapabilitySchema.optional(),
	keyboard: keyboardCapabilitySchema.optional()
});
var deviceSchema = object({
	id: string(),
	moduleId: string(),
	displayName: string(),
	kind: deviceKindSchema,
	connected: boolean(),
	identity: deviceIdentitySchema,
	variantResolution: deviceVariantResolutionSchema,
	asset: productAssetResolutionSchema,
	capabilities: deviceCapabilitiesSchema,
	settings: record(string(), deviceSettingValueSchema)
});
var audioBusIdSchema = _enum([
	"game",
	"chat",
	"media",
	"mic",
	"aux"
]);
var audioDeviceDirectionSchema = _enum(["output", "input"]);
var audioEndpointFormFactorSchema = _enum([
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
var audioDeviceSchema = object({
	id: string().min(1),
	name: string().min(1),
	direction: audioDeviceDirectionSchema,
	isDefault: boolean(),
	available: boolean(),
	formFactor: audioEndpointFormFactorSchema.nullable().optional(),
	isVirtual: boolean().default(false),
	isSwitchboard: boolean().default(false)
});
var audioBusSchema = object({
	id: audioBusIdSchema,
	label: string(),
	enabled: boolean().default(true),
	appCount: number().int().min(0),
	meter: number().min(0).max(1),
	endpoint: string(),
	deviceId: string().default("")
});
var audioMasterSchema = object({
	gain: number().min(0).max(1.5),
	enabled: boolean()
});
var audioMixIdSchema = _enum([
	"personal",
	"stream",
	"clip"
]);
var audioMixBusSchema = object({
	id: audioBusIdSchema,
	gain: number().min(0).max(1.5),
	enabled: boolean()
});
var audioMixSchema = object({
	id: audioMixIdSchema,
	label: string().min(1),
	master: audioMasterSchema,
	buses: array(audioMixBusSchema)
});
var audioMeterValueSchema = object({
	busId: audioBusIdSchema,
	level: number().min(0).max(1),
	peak: number().min(0).max(1),
	clipping: boolean()
});
object({
	sequence: number().int().nonnegative(),
	timestamp: string(),
	values: array(audioMeterValueSchema)
});
var audioPathIdSchema = _enum([
	"game",
	"chat",
	"media",
	"microphone"
]);
var audioSupportLevelSchema = _enum([
	"available",
	"simulation",
	"unavailable"
]);
var audioCapabilitiesSchema = object({
	virtualChannels: audioSupportLevelSchema,
	applicationRouting: audioSupportLevelSchema,
	channelDsp: audioSupportLevelSchema,
	microphoneDsp: audioSupportLevelSchema,
	noiseSuppression: audioSupportLevelSchema.default("unavailable"),
	realtimeMetering: audioSupportLevelSchema,
	microphoneTest: audioSupportLevelSchema,
	monitoring: audioSupportLevelSchema,
	spatialAudio: audioSupportLevelSchema,
	reason: string().nullable().optional()
});
var noiseSuppressionDiagnosticsSchema = object({
	backend: string(),
	available: boolean(),
	modelIdentifier: string().nullable().default(null),
	modelHash: string().nullable().default(null),
	nativeLibraryHash: string().nullable().default(null),
	state: _enum([
		"not-loaded",
		"ready",
		"bypassed"
	]),
	modelInitializationMs: number().nonnegative(),
	inputSampleRate: number().int().nonnegative(),
	processingSampleRate: literal(48e3),
	frameLength: number().int().nonnegative(),
	algorithmicLatencyMs: number().nonnegative(),
	attenuationLimitDb: number().nonnegative(),
	localSnrDb: number().nullable().default(null),
	p50Ms: number().nonnegative(),
	p95Ms: number().nonnegative(),
	p99Ms: number().nonnegative(),
	maximumMs: number().nonnegative(),
	captureCallbackP99Ms: number().nonnegative(),
	captureOverruns: number().int().nonnegative(),
	monitorOverruns: number().int().nonnegative().default(0),
	monitorUnderruns: number().int().nonnegative(),
	droppedOrBypassedFrames: number().int().nonnegative(),
	recoveryCount: number().int().nonnegative(),
	lastError: string().nullable().default(null)
});
var virtualDriverStateSchema = object({
	state: _enum([
		"ready",
		"not-installed",
		"incomplete"
	]),
	interfaceName: string(),
	missingEndpoints: array(string()),
	endpoints: array(object({
		id: string(),
		name: string(),
		flow: _enum(["render", "capture"])
	})),
	message: string()
});
var audioApplicationSchema = object({
	id: string().min(1),
	name: string().min(1),
	executableName: string().min(1),
	processId: number().int().positive(),
	iconDataUrl: string().startsWith("data:image/").optional(),
	destination: _enum([
		"game",
		"chat",
		"media"
	]),
	currentDestination: _enum([
		"game",
		"chat",
		"media"
	]),
	preferredDestination: _enum([
		"game",
		"chat",
		"media"
	]).nullable(),
	routingState: _enum([
		"unmanaged",
		"applied",
		"pending-restart"
	]),
	active: boolean()
});
var configuredMicProcessorSchema = object({
	id: _enum([
		"gain",
		"noise-gate",
		"noise-suppression",
		"equalizer",
		"compressor",
		"limiter"
	]),
	enabled: boolean(),
	parameters: record(string(), unknown())
});
var microphoneMonitoringRuntimeSchema = object({
	requested: boolean(),
	active: boolean(),
	level: number().min(0).max(1),
	requestedDeviceId: string().nullable().default(null),
	activeDeviceId: string().nullable().default(null)
});
var microphoneRuntimeSchema = object({
	configurationVersion: number().int().nonnegative(),
	requestedInputDeviceId: string().nullable().default(null),
	activeInputDeviceId: string().nullable().default(null),
	inputFormat: string().nullable().default(null),
	processors: array(configuredMicProcessorSchema),
	monitoring: microphoneMonitoringRuntimeSchema,
	error: string().nullable().default(null)
});
var audioHostSnapshotSchema = object({
	capabilities: audioCapabilitiesSchema,
	noiseSuppression: noiseSuppressionDiagnosticsSchema,
	inputDeviceId: string().nullable().default(null),
	inputFormat: string().nullable().default(null),
	monitoringDeviceId: string().nullable().default(null),
	running: boolean(),
	error: string().nullable().default(null),
	driver: virtualDriverStateSchema,
	applications: array(audioApplicationSchema),
	buses: array(object({
		id: audioBusIdSchema,
		applicationCount: number().int().nonnegative()
	})),
	mixes: array(audioMixSchema),
	microphone: microphoneRuntimeSchema.nullable().default(null)
});
var eqFilterTypeSchema = _enum([
	"low-shelf",
	"bell",
	"high-shelf"
]);
var eqBandSchema = object({
	id: string().min(1),
	enabled: boolean(),
	type: eqFilterTypeSchema,
	frequency: number().min(20).max(2e4),
	gainDb: number().min(-12).max(12),
	q: number().min(.2).max(10)
});
var processorBaseSchema = {
	label: string(),
	enabled: boolean(),
	cost: _enum([
		"none",
		"low",
		"medium"
	])
};
var micProcessorSchema = discriminatedUnion("id", [
	object({
		...processorBaseSchema,
		id: literal("gain"),
		parameters: object({ gainDb: number().min(-20).max(30) }).default({ gainDb: 0 })
	}),
	object({
		...processorBaseSchema,
		id: literal("noise-gate"),
		parameters: object({
			thresholdDb: number().min(-80).max(-10),
			attackMs: number().min(.1).max(100),
			releaseMs: number().min(10).max(1e3)
		}).default({
			thresholdDb: -48,
			attackMs: 10,
			releaseMs: 180
		})
	}),
	object({
		...processorBaseSchema,
		id: literal("noise-suppression"),
		parameters: object({ amount: number().min(0).max(100) }).default({ amount: 55 })
	}),
	object({
		...processorBaseSchema,
		id: literal("equalizer"),
		parameters: object({ bands: array(eqBandSchema).min(1).max(8) }).default({ bands: [
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
	object({
		...processorBaseSchema,
		id: literal("compressor"),
		parameters: object({
			thresholdDb: number().min(-60).max(0),
			ratio: number().min(1).max(20),
			attackMs: number().min(.1).max(200),
			releaseMs: number().min(10).max(2e3),
			makeupDb: number().min(0).max(18)
		}).default({
			thresholdDb: -18,
			ratio: 4,
			attackMs: 12,
			releaseMs: 180,
			makeupDb: 2
		})
	}),
	object({
		...processorBaseSchema,
		id: literal("limiter"),
		parameters: object({
			thresholdDb: number().min(-18).max(0),
			releaseMs: number().min(10).max(1e3)
		}).default({
			thresholdDb: -1,
			releaseMs: 90
		})
	})
]);
var channelAudioBusIdSchema = _enum([
	"game",
	"chat",
	"media"
]);
var channelProcessingSchema = object({
	busId: channelAudioBusIdSchema,
	equalizer: object({
		enabled: boolean(),
		bands: array(eqBandSchema).min(1).max(8)
	}),
	normalization: object({
		enabled: boolean(),
		targetLufs: number().min(-30).max(-10),
		maxGainDb: number().min(0).max(18)
	}),
	compressor: object({
		enabled: boolean(),
		thresholdDb: number().min(-60).max(0),
		ratio: number().min(1).max(20),
		attackMs: number().min(.1).max(200),
		releaseMs: number().min(10).max(2e3),
		makeupDb: number().min(0).max(18)
	}),
	limiter: object({
		enabled: boolean(),
		thresholdDb: number().min(-18).max(0),
		releaseMs: number().min(10).max(1e3)
	})
});
var audioPresetBaseSchema = {
	id: string().min(1),
	name: string().trim().min(1).max(64),
	builtIn: boolean(),
	schemaVersion: literal(1)
};
function channelPresetSchema(kind) {
	return object({
		...audioPresetBaseSchema,
		kind: literal(kind),
		processors: channelProcessingSchema.omit({ busId: true })
	});
}
var audioPathPresetSchema = discriminatedUnion("kind", [
	channelPresetSchema("game"),
	channelPresetSchema("chat"),
	channelPresetSchema("media"),
	object({
		...audioPresetBaseSchema,
		kind: literal("microphone"),
		processors: array(micProcessorSchema),
		monitoring: object({
			enabled: boolean(),
			level: number().min(0).max(1),
			deviceId: string()
		})
	})
]);
object({
	schemaVersion: literal(1),
	preset: audioPathPresetSchema
});
var audioStateSchema = object({
	enabled: boolean(),
	outputDevice: string(),
	microphoneDevice: string(),
	sampleRate: literal(48e3),
	mixes: array(audioMixSchema),
	chatMix: number().min(-1).max(1),
	monitoring: number().min(0).max(1),
	monitoringEnabled: boolean().default(false),
	monitoringDeviceId: string().default(""),
	buses: array(audioBusSchema),
	micProcessors: array(micProcessorSchema),
	channelProcessing: array(channelProcessingSchema).default([]),
	devices: array(audioDeviceSchema).default([]),
	applications: array(audioApplicationSchema).default([]),
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
	pathPresets: array(audioPathPresetSchema).default([]),
	activePresetIds: object({
		game: string().nullable(),
		chat: string().nullable(),
		media: string().nullable(),
		microphone: string().nullable()
	}).default({
		game: null,
		chat: null,
		media: null,
		microphone: null
	})
});
var captureSourceTypeSchema = _enum([
	"automatic-game",
	"window",
	"display"
]);
var captureSourceSchema = object({
	id: string().min(1),
	type: captureSourceTypeSchema,
	name: string().min(1),
	processId: number().int().positive().optional(),
	windowHandle: string().optional(),
	displayId: string().optional(),
	available: boolean()
});
var captureResolutionSchema = _enum([
	"720p",
	"1080p",
	"1440p",
	"2160p",
	"native"
]);
var captureCodecSchema = _enum([
	"h264",
	"hevc",
	"av1"
]);
var captureEncoderPreferenceSchema = _enum([
	"auto",
	"nvenc",
	"amf",
	"qsv",
	"software"
]);
var clipTrackLevelSchema = number().int().min(0).max(100);
var defaultClipTrackLevelsSchema = object({
	game: clipTrackLevelSchema,
	chat: clipTrackLevelSchema,
	microphone: clipTrackLevelSchema,
	media: clipTrackLevelSchema
});
var captureConfigSchema = object({
	enabled: boolean(),
	source: captureSourceTypeSchema,
	sourceId: string().min(1).nullable(),
	displayIndex: number().int().min(0),
	fps: union([
		literal(30),
		literal(60),
		literal(120)
	]),
	resolution: captureResolutionSchema,
	codec: union([literal("auto"), captureCodecSchema]),
	encoder: captureEncoderPreferenceSchema,
	quality: number().int().min(1).max(5),
	replaySeconds: number().int().min(15).max(300),
	includeMic: boolean(),
	includeSystemAudio: boolean(),
	systemAudioMode: _enum(["system", "game"]).default("system"),
	includeChatAudio: boolean().default(false),
	includeCursor: boolean(),
	microphoneDeviceId: string().min(1).max(512).nullable().default(null),
	systemAudioDeviceId: string().min(1).max(512).nullable().default(null),
	chatAudioDeviceId: string().min(1).max(512).nullable().default(null),
	hotkey: string().min(1).max(128),
	clipsDirectory: string().max(4096).nullable(),
	defaultTrackLevels: defaultClipTrackLevelsSchema.default({
		game: 100,
		chat: 100,
		microphone: 100,
		media: 100
	})
});
captureConfigSchema.omit({ clipsDirectory: true }).partial().extend({
	systemAudioMode: captureConfigSchema.shape.systemAudioMode.unwrap().optional(),
	includeChatAudio: captureConfigSchema.shape.includeChatAudio.unwrap().optional(),
	microphoneDeviceId: captureConfigSchema.shape.microphoneDeviceId.unwrap().optional(),
	systemAudioDeviceId: captureConfigSchema.shape.systemAudioDeviceId.unwrap().optional(),
	chatAudioDeviceId: captureConfigSchema.shape.chatAudioDeviceId.unwrap().optional(),
	defaultTrackLevels: defaultClipTrackLevelsSchema.partial().optional()
});
var replayStateSchema = _enum([
	"stopped",
	"starting",
	"waiting",
	"buffering",
	"saving",
	"recovering",
	"error"
]);
var reactionDetectionRuntimeSchema = object({
	state: _enum([
		"disabled",
		"waiting",
		"calibrating",
		"listening",
		"cooldown",
		"unavailable",
		"error"
	]),
	inputLevelDb: number().min(-120).max(0),
	noiseFloorDb: number().min(-120).max(0),
	triggerThresholdDb: number().min(-120).max(0),
	reactionsDetected: number().int().nonnegative(),
	analyzedFrames: number().int().nonnegative(),
	analysisAverageMs: number().nonnegative(),
	cooldownRemainingSeconds: number().int().nonnegative(),
	lastReactionAt: number().int().nonnegative().nullable().optional().transform((value) => value ?? null),
	message: string().trim().min(1).max(240).nullable().optional().transform((value) => value ?? null)
});
var captureStorageSchema = object({
	clipsDirectory: string(),
	cacheDirectory: string(),
	availableBytes: number().nonnegative(),
	volumeTotalBytes: number().nonnegative(),
	volumeAvailableBytes: number().nonnegative(),
	clipsBytes: number().nonnegative(),
	replayCacheBytes: number().nonnegative(),
	lowSpace: boolean(),
	criticalSpace: boolean(),
	warning: string().optional()
});
var captureCapabilitiesSchema = object({
	backend: _enum([
		"windows-graphics-capture",
		"desktop-duplication",
		"unavailable"
	]),
	encoders: array(string()),
	codecs: array(captureCodecSchema),
	maximumFps: union([
		literal(30),
		literal(60),
		literal(120)
	]),
	systemAudio: boolean(),
	microphoneAudio: boolean(),
	exclusiveFullscreen: literal(false)
});
var captureRuntimeSchema = object({
	state: replayStateSchema,
	bufferedSeconds: number().min(0),
	segmentCount: number().int().min(0),
	replayCacheBytes: number().min(0),
	observedBitrateBps: number().min(0),
	encoderLabel: string(),
	backendLabel: string(),
	droppedFrames: number().int().min(0),
	encodedFrames: number().int().min(0),
	audioSyncCorrections: number().int().min(0),
	activeSource: captureSourceSchema.nullish().transform((source) => source ?? null),
	saveQueueDepth: number().int().min(0),
	shortcutRegistered: boolean(),
	reactionClipping: reactionDetectionRuntimeSchema,
	warning: string().optional(),
	error: string().optional(),
	lastSavedAt: string().optional()
});
object({
	runtime: captureRuntimeSchema,
	storage: captureStorageSchema,
	capabilities: captureCapabilitiesSchema,
	sources: array(captureSourceSchema)
});
var gameEventTypeSchema = _enum([
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
var gameEventSourceSchema = _enum([
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
var gameEventMetadataSchema = object({
	weapon: string().trim().min(1).max(64).optional(),
	headshot: boolean().optional(),
	count: number().int().min(2).max(20).optional(),
	derived: boolean().optional(),
	roundNumber: number().int().min(0).max(200).optional(),
	team: _enum([
		"CT",
		"T",
		"ally",
		"enemy"
	]).optional(),
	scoreFor: number().int().min(0).max(999).optional(),
	scoreAgainst: number().int().min(0).max(999).optional(),
	objective: _enum([
		"planted",
		"defused",
		"exploded",
		"captured",
		"completed",
		"custom"
	]).optional(),
	code: string().trim().min(1).max(64).optional(),
	sequence: number().int().nonnegative().optional()
}).strict();
object({
	id: string().min(1).max(160),
	gameId: string().min(1).max(96),
	providerId: string().min(1).max(96),
	type: gameEventTypeSchema,
	timestamp: number().int().nonnegative(),
	confidence: number().min(0).max(1).optional(),
	label: string().trim().min(1).max(80).optional(),
	metadata: gameEventMetadataSchema.optional(),
	source: gameEventSourceSchema
});
var providerSupportLevelSchema = _enum([
	"supported",
	"experimental",
	"unavailable"
]);
var providerAvailabilitySchema = object({
	state: _enum([
		"available",
		"setup-required",
		"unavailable"
	]),
	reason: string().trim().min(1).max(240).optional()
});
var providerStatusSchema = object({
	state: _enum([
		"stopped",
		"starting",
		"listening",
		"degraded",
		"error"
	]),
	message: string().trim().min(1).max(240).optional(),
	lastEventAt: number().int().nonnegative().optional()
});
var autoCaptureProviderSchema = object({
	id: string().min(1).max(96),
	gameId: string().min(1).max(96),
	displayName: string().trim().min(1).max(120),
	supportLevel: providerSupportLevelSchema,
	source: gameEventSourceSchema,
	capabilities: object({
		events: array(gameEventTypeSchema).max(gameEventTypeSchema.options.length),
		nativeMultiKill: boolean()
	}),
	availability: providerAvailabilitySchema,
	status: providerStatusSchema,
	requiresPlayerName: boolean().default(false),
	supportsAnonymousName: boolean().optional(),
	developmentOnly: boolean().default(false)
});
var autoCaptureGameSettingsSchema = object({
	enabled: boolean().default(true),
	useGlobalTiming: boolean().default(true),
	preRollSeconds: number().int().min(5).max(120).optional(),
	postRollSeconds: number().int().min(0).max(60).optional(),
	playerName: string().trim().min(1).max(64).optional(),
	playerNameMode: _enum(["nickname", "anonymous"]).optional(),
	playerSquadronTag: string().trim().min(1).max(64).optional(),
	events: partialRecord(gameEventTypeSchema, boolean()).default({})
});
var reactionClippingSettingsSchema = object({
	enabled: boolean(),
	sensitivity: _enum([
		"low",
		"balanced",
		"high"
	]),
	preRollSeconds: number().int().min(5).max(60),
	postRollSeconds: number().int().min(0).max(30),
	cooldownSeconds: number().int().min(5).max(120)
});
var autoCaptureSettingsSchema = object({
	enabled: boolean(),
	preRollSeconds: number().int().min(5).max(120),
	postRollSeconds: number().int().min(0).max(60),
	mergeNearbyEvents: boolean(),
	mergeThresholdSeconds: number().int().min(0).max(60),
	notifyWhenSaved: boolean(),
	reactionClipping: reactionClippingSettingsSchema,
	games: record(string().min(1).max(96), autoCaptureGameSettingsSchema),
	dismissedAvailability: record(string().min(1).max(96), boolean())
});
object({
	enabled: boolean().optional(),
	preRollSeconds: number().int().min(5).max(120).optional(),
	postRollSeconds: number().int().min(0).max(60).optional(),
	mergeNearbyEvents: boolean().optional(),
	mergeThresholdSeconds: number().int().min(0).max(60).optional(),
	notifyWhenSaved: boolean().optional(),
	reactionClipping: reactionClippingSettingsSchema.partial().optional(),
	games: record(string().min(1).max(96), autoCaptureGameSettingsSchema.partial()).optional(),
	dismissedAvailability: record(string().min(1).max(96), boolean()).optional()
}).strict();
string().min(1).max(96);
object({ type: _enum([
	"kill",
	"headshot",
	"multi_kill",
	"death",
	"round_win",
	"match_win"
]) }).strict();
var autoCaptureRuntimeSchema = object({
	state: _enum([
		"disabled",
		"idle",
		"listening",
		"pending",
		"saving",
		"degraded"
	]),
	activeGameId: string().max(96).nullable(),
	activeProviderId: string().max(96).nullable(),
	pendingCapture: object({
		startedAt: number().int().nonnegative(),
		endsAt: number().int().nonnegative(),
		eventCount: number().int().positive().max(128)
	}).nullable(),
	eventsReceived: number().int().nonnegative(),
	eventsDeduplicated: number().int().nonnegative(),
	eventsIgnored: number().int().nonnegative(),
	clipsCreated: number().int().nonnegative(),
	lastEvent: object({
		type: gameEventTypeSchema,
		at: number().int().nonnegative(),
		label: string().trim().min(1).max(80).optional()
	}).nullable(),
	lastError: string().trim().min(1).max(320).nullable()
});
var autoCaptureStateSchema = object({
	settings: autoCaptureSettingsSchema,
	providers: array(autoCaptureProviderSchema).max(32),
	runtime: autoCaptureRuntimeSchema
});
var clipAudioChannelSchema = _enum([
	"game",
	"chat",
	"microphone",
	"media"
]);
var clipCanvasSizeSchema = _enum([
	"original",
	"16:9",
	"9:16",
	"1:1",
	"4:5"
]);
var clipAudioWaveformTrackSchema = object({
	trackIndex: number().int().min(0).max(7),
	label: string().trim().min(1).max(80),
	channel: clipAudioChannelSchema.optional(),
	samples: array(number().min(0).max(1)).max(256)
});
object({
	clipId: string().min(1),
	tracks: array(clipAudioWaveformTrackSchema).max(8)
});
var clipAudioTrackTrimsSchema = array(object({
	startMs: number().int().nonnegative(),
	endMs: number().int().positive()
}).refine((trim) => trim.endMs > trim.startMs, {
	message: "The audio track trim end must be after its start.",
	path: ["endMs"]
}).nullable()).max(8);
var clipEventMarkerSchema = object({
	id: string().min(1).max(160),
	type: gameEventTypeSchema,
	timestampMs: number().int().nonnegative(),
	label: string().trim().min(1).max(80).optional(),
	metadata: gameEventMetadataSchema.optional()
});
var clipAutoCaptureMetadataSchema = object({
	autoCaptured: literal(true),
	providerId: string().min(1).max(96),
	gameId: string().min(1).max(96),
	events: array(clipEventMarkerSchema).min(1).max(128)
});
var clipSchema = object({
	id: string().min(1),
	path: string().min(1),
	name: string().min(1),
	game: string().optional(),
	createdAt: number().int().nonnegative(),
	durationMs: number().int().nonnegative(),
	fileSize: number().int().nonnegative(),
	width: number().int().nonnegative(),
	height: number().int().nonnegative(),
	fps: number().nonnegative(),
	codec: string().optional(),
	thumbnailPath: string().optional(),
	favorite: boolean().default(false),
	titleEdited: boolean().default(false),
	music: montageMusicTrackSchema.optional(),
	videoEdits: videoEditsSchema.optional(),
	trimStartMs: number().int().nonnegative().optional(),
	trimEndMs: number().int().positive().optional(),
	canvasSize: clipCanvasSizeSchema.default("original"),
	audioChannels: array(clipAudioChannelSchema).max(4).optional(),
	audioTrackLevels: array(number().int().min(0).max(100)).max(8).optional(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
	autoCapture: clipAutoCaptureMetadataSchema.optional()
});
var clipReviewStateSchema = object({ reviewedThrough: number().int().nonnegative() });
object({
	level: _enum([
		"debug",
		"info",
		"warning",
		"error"
	]),
	event: string().min(1).max(96).regex(/^[a-zA-Z0-9_.:-]+$/),
	data: record(string().max(64), union([
		string().max(4096),
		number().finite(),
		boolean(),
		_null()
	])).refine((data) => Object.keys(data).length <= 24, "Too many diagnostic fields")
});
object({ enabled: boolean() });
var performanceSnapshotSchema = object({
	debug: object({
		startedAt: string(),
		sampledAt: string(),
		eventLoopUtilizationPercent: number().finite().min(0).max(100).nullable(),
		eventLoopDelayP99Ms: number().finite().nonnegative().nullable(),
		eventLoopDelayMaxMs: number().finite().nonnegative().nullable(),
		operations: array(object({
			name: string().max(96),
			calls: number().int().nonnegative(),
			failures: number().int().nonnegative(),
			inFlight: number().int().nonnegative(),
			totalMs: number().finite().nonnegative(),
			maxMs: number().finite().nonnegative()
		})).max(128),
		processes: array(object({
			pid: number().int(),
			role: string(),
			privateMb: number().nonnegative(),
			workingSetMb: number().nonnegative(),
			cpuPercent: number().nonnegative().nullable()
		}))
	}).optional(),
	coreMemoryMb: number().min(0),
	rendererMemoryMb: number().min(0),
	totalMemoryMb: number().min(0),
	residentMemoryMb: number().min(0).default(0),
	totalCpuPercent: number().min(0),
	activeProcesses: number().int().min(1),
	budgetMemoryMb: number().min(1),
	budgetCpuPercent: number().min(0),
	sampledAt: string().nullable().default(null),
	guardState: _enum([
		"disabled",
		"collecting",
		"within-budget",
		"over-budget"
	]).default("collecting"),
	warning: string().nullable().default(null)
});
var detectedGameSourceSchema = _enum([
	"steam",
	"epic",
	"manual"
]);
var detectedGameSchema = object({
	id: string().min(1),
	name: string().trim().min(1).max(160),
	source: detectedGameSourceSchema,
	installDirectory: string().min(1),
	executablePath: string().min(1).nullable(),
	launchUri: string().min(1).nullable(),
	iconDataUrl: string().startsWith("data:image/").max(262144).optional(),
	addedAt: string()
});
var gameDetectionStateSchema = object({
	capability: _enum(["available", "simulation"]),
	scanState: _enum([
		"idle",
		"scanning",
		"error"
	]),
	games: array(detectedGameSchema),
	lastScanAt: string().nullable(),
	warning: string().optional(),
	error: string().optional()
});
var visibleWorkspaceSchema = _enum([
	"devices",
	"audio",
	"capture"
]);
var appSettingsSchema = object({
	uiScalePercent: union([
		literal(90),
		literal(100),
		literal(110),
		literal(125),
		literal(150)
	]),
	launchAtStartup: boolean(),
	closeToTray: boolean(),
	destroyRendererInTray: boolean(),
	softwareRendering: boolean().default(false),
	automaticAppUpdates: boolean(),
	automaticAppUpdateDownloads: boolean(),
	installAppUpdatesOnNextStartup: boolean(),
	installAppUpdatesWhenIdle: boolean(),
	automaticModuleUpdates: boolean(),
	performanceGuard: boolean(),
	detailedDiagnostics: boolean().default(false),
	diagnosticsRetentionDays: number().int().min(1).max(30),
	telemetry: literal(false),
	scanGamesAutomatically: boolean(),
	clipEditorInspectorOpen: boolean(),
	deviceAppearanceOverrides: record(string(), deviceAppearanceOverrideSchema).default({}),
	mouseBatteryLighting: record(string(), mouseBatteryLightingPolicySchema).default({}),
	developerMode: boolean().default(false),
	visibleWorkspaces: array(visibleWorkspaceSchema).default([
		"devices",
		"audio",
		"capture"
	]),
	onboardingCompleted: boolean().default(false)
});
var appUpdateStateSchema = object({
	capability: _enum(["available", "unavailable"]),
	status: _enum([
		"idle",
		"checking",
		"available",
		"downloading",
		"downloaded",
		"installing",
		"error",
		"unavailable"
	]),
	currentVersion: string().min(1),
	availableVersion: string().min(1).nullable(),
	downloadProgress: number().min(0).max(100).nullable(),
	checkedAt: string().nullable(),
	error: string().nullable(),
	unavailableReason: string().nullable()
});
var diagnosticCheckSchema = object({
	id: string().min(1).max(100),
	label: string().min(1).max(160),
	status: _enum([
		"running",
		"pass",
		"warning",
		"fail",
		"skipped"
	]),
	detail: string().max(8192),
	durationMs: number().finite().nonnegative().optional()
});
var diagnosticRunSchema = object({
	id: string().nullable(),
	status: _enum([
		"idle",
		"running",
		"completed",
		"cancelled",
		"error"
	]),
	startedAt: string().nullable(),
	completedAt: string().nullable(),
	summary: string().max(2048),
	checks: array(diagnosticCheckSchema).max(64)
});
var idleDiagnosticRun = {
	id: null,
	status: "idle",
	startedAt: null,
	completedAt: null,
	summary: "",
	checks: []
};
var sceneDeviceSettingsSchema = object({
	deviceId: string().min(1).max(256),
	name: string().max(160),
	dpi: number().int().positive().optional(),
	reportRate: number().int().positive().optional(),
	lighting: object({
		enabled: boolean(),
		effectId: string().optional(),
		color: string().regex(/^#[0-9a-f]{6}$/i).optional(),
		brightness: number().min(0).max(100).optional(),
		speed: number().min(1).max(100).optional(),
		zones: array(object({
			id: string(),
			color: string().regex(/^#[0-9a-f]{6}$/i)
		})).max(256).default([])
	}).optional()
});
var sceneValuesSchema = object({
	audio: audioStateSchema.pick({
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
	}).extend({ buses: array(audioBusSchema.pick({
		id: true,
		enabled: true,
		deviceId: true
	})) }).nullable(),
	capture: captureConfigSchema.omit({
		hotkey: true,
		clipsDirectory: true
	}).nullable(),
	devices: array(sceneDeviceSettingsSchema).max(32)
});
var setupSceneSchema = object({
	id: string().min(1).max(100),
	name: string().trim().min(1).max(64),
	executable: string().trim().max(120).regex(/^(?:[^\\/:*?"<>|]+\.exe)?$/i).default(""),
	automatic: boolean().default(false),
	restoreOnExit: boolean().default(true),
	values: sceneValuesSchema
});
setupSceneSchema.omit({
	id: true,
	values: true
}).extend({
	id: string().min(1).max(100).optional(),
	captureCurrent: boolean(),
	includeAudio: boolean(),
	includeCapture: boolean(),
	includeDevices: boolean()
});
var setupPreferencesSchema = object({
	quickControlsEnabled: boolean().default(false),
	quickShortcut: _enum([
		"Control+Alt+Space",
		"Control+Shift+Space",
		"Alt+Space"
	]).default("Control+Alt+Space"),
	quickActions: array(_enum([
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
	lighting: object({
		enabled: boolean().default(false),
		deviceIds: array(string().min(1).max(256)).max(32).default([]),
		clipSaved: boolean().default(true),
		microphoneMuted: boolean().default(true),
		captureError: boolean().default(true)
	}).default({
		enabled: false,
		deviceIds: [],
		clipSaved: true,
		microphoneMuted: true,
		captureError: true
	})
});
discriminatedUnion("type", [
	object({
		type: literal("microphone"),
		muted: boolean()
	}),
	object({
		type: literal("output"),
		deviceId: string().min(1).max(512)
	}),
	object({
		type: literal("chatmix"),
		value: number().min(-1).max(1)
	})
]);
var setupRuntimeSchema = object({
	activeSceneId: string().nullable().default(null),
	state: _enum([
		"idle",
		"applying",
		"active",
		"partial",
		"restoring"
	]).default("idle"),
	issues: array(string().max(2048)).max(64).default([]),
	desktopState: _enum([
		"disabled",
		"starting",
		"ready",
		"error"
	]).default("disabled"),
	desktopError: string().nullable().default(null),
	lightingState: _enum([
		"idle",
		"acknowledged",
		"error"
	]).default("idle"),
	lightingMessage: string().default("")
});
var setupStateSchema = object({
	scenes: array(setupSceneSchema).max(32).default([]),
	preferences: setupPreferencesSchema.default(() => setupPreferencesSchema.parse({})),
	runtime: setupRuntimeSchema.default(() => setupRuntimeSchema.parse({})),
	restore: object({
		before: sceneValuesSchema,
		applied: sceneValuesSchema,
		automatic: boolean(),
		executable: string(),
		restoreOnExit: boolean()
	}).nullable().default(null)
});
object({
	setup: setupStateSchema.default(() => setupStateSchema.parse({})),
	version: string(),
	prototypeMode: boolean(),
	appUpdate: appUpdateStateSchema,
	diagnostics: diagnosticRunSchema.default(idleDiagnosticRun),
	modules: array(moduleManifestSchema),
	devices: array(deviceSchema),
	engines: array(engineStatusSchema),
	audio: audioStateSchema,
	capture: object({
		config: captureConfigSchema,
		runtime: captureRuntimeSchema,
		storage: captureStorageSchema,
		capabilities: captureCapabilitiesSchema,
		sources: array(captureSourceSchema),
		autoCapture: autoCaptureStateSchema
	}),
	clips: array(clipSchema),
	clipReview: clipReviewStateSchema,
	gameDetection: gameDetectionStateSchema,
	performance: performanceSnapshotSchema,
	settings: appSettingsSchema
});
object({
	moduleId: string(),
	enabled: boolean()
});
object({
	deviceId: string(),
	key: string(),
	value: deviceSettingValueSchema
});
var deviceControlChangeSchema = discriminatedUnion("type", [
	object({
		type: literal("dpi"),
		value: number().int().positive()
	}),
	object({
		type: literal("dpi-stages"),
		stages: array(number().int().positive()).min(1)
	}),
	object({
		type: literal("dpi-shift"),
		value: number().int().positive()
	}),
	object({
		type: literal("report-rate"),
		value: number().int().positive()
	}),
	object({
		type: literal("button-assignment"),
		buttonId: string().min(1),
		actionId: string().min(1)
	}),
	object({
		type: literal("onboard-memory"),
		enabled: boolean()
	}),
	object({
		type: literal("lighting-enabled"),
		enabled: boolean()
	}),
	object({
		type: literal("lighting-color"),
		color: string().regex(/^#[0-9a-f]{6}$/i)
	}),
	object({
		type: literal("lighting-brightness"),
		brightness: number().min(0).max(100)
	}),
	object({
		type: literal("lighting-effect"),
		effectId: string().min(1)
	}),
	object({
		type: literal("lighting-speed"),
		speed: number().min(1).max(100)
	}),
	object({
		type: literal("lighting-direction"),
		direction: lightingDirectionSchema
	}),
	object({
		type: literal("lighting-zone-color"),
		zoneId: string().min(1),
		color: string().regex(/^#[0-9a-f]{6}$/i)
	}),
	object({
		type: literal("lighting-profile"),
		profileId: string().min(1)
	}),
	object({
		type: literal("keyboard-gaming-mode"),
		enabled: boolean()
	}),
	object({
		type: literal("keyboard-rapid-trigger"),
		enabled: boolean()
	}),
	object({
		type: literal("keyboard-snap-tap"),
		enabled: boolean()
	}),
	object({
		type: literal("keyboard-onboard-profile"),
		profileId: string().min(1)
	}),
	object({
		type: literal("microphone-mute-lighting"),
		enabled: boolean()
	})
]);
object({
	deviceId: string().min(1),
	change: deviceControlChangeSchema
});
object({
	deviceId: string().min(1),
	override: deviceAppearanceOverrideSchema.nullable()
});
object({
	mixId: audioMixIdSchema,
	busId: audioBusIdSchema,
	gain: number().min(0).max(1.5)
});
object({
	mixId: audioMixIdSchema,
	gain: number().min(0).max(1.5)
});
object({
	mixId: audioMixIdSchema,
	enabled: boolean()
});
object({
	mixId: audioMixIdSchema,
	busId: audioBusIdSchema,
	enabled: boolean()
});
object({
	busId: audioBusIdSchema,
	enabled: boolean()
});
object({
	busId: audioBusIdSchema,
	deviceId: string().min(1)
});
object({
	applicationId: string().min(1),
	destination: _enum([
		"game",
		"chat",
		"media"
	])
});
object({ presetId: string().min(1) });
object({
	kind: audioPathIdSchema,
	name: string().trim().min(1).max(64)
});
object({
	presetId: string().min(1),
	name: string().trim().min(1).max(64)
});
object({ presetId: string().min(1) });
object({
	enabled: boolean().optional(),
	level: number().min(0).max(1).optional(),
	deviceId: string().min(1).optional()
});
discriminatedUnion("processorId", [
	object({
		busId: channelAudioBusIdSchema,
		processorId: literal("equalizer"),
		enabled: boolean().optional(),
		parameters: object({ bands: array(eqBandSchema).min(1).max(8).optional() }).optional()
	}),
	object({
		busId: channelAudioBusIdSchema,
		processorId: literal("normalization"),
		enabled: boolean().optional(),
		parameters: object({
			targetLufs: number().min(-30).max(-10).optional(),
			maxGainDb: number().min(0).max(18).optional()
		}).optional()
	}),
	object({
		busId: channelAudioBusIdSchema,
		processorId: literal("compressor"),
		enabled: boolean().optional(),
		parameters: object({
			thresholdDb: number().min(-60).max(0).optional(),
			ratio: number().min(1).max(20).optional(),
			attackMs: number().min(.1).max(200).optional(),
			releaseMs: number().min(10).max(2e3).optional(),
			makeupDb: number().min(0).max(18).optional()
		}).optional()
	}),
	object({
		busId: channelAudioBusIdSchema,
		processorId: literal("limiter"),
		enabled: boolean().optional(),
		parameters: object({
			thresholdDb: number().min(-18).max(0).optional(),
			releaseMs: number().min(10).max(1e3).optional()
		}).optional()
	})
]);
discriminatedUnion("processorId", [
	object({
		processorId: literal("gain"),
		enabled: boolean().optional(),
		parameters: object({ gainDb: number().min(-20).max(30).optional() }).optional()
	}),
	object({
		processorId: literal("noise-gate"),
		enabled: boolean().optional(),
		parameters: object({
			thresholdDb: number().min(-80).max(-10).optional(),
			attackMs: number().min(.1).max(100).optional(),
			releaseMs: number().min(10).max(1e3).optional()
		}).optional()
	}),
	object({
		processorId: literal("noise-suppression"),
		enabled: boolean().optional(),
		parameters: object({ amount: number().min(0).max(100).optional() }).optional()
	}),
	object({
		processorId: literal("equalizer"),
		enabled: boolean().optional(),
		parameters: object({ bands: array(eqBandSchema).min(1).max(8).optional() }).optional()
	}),
	object({
		processorId: literal("compressor"),
		enabled: boolean().optional(),
		parameters: object({
			thresholdDb: number().min(-60).max(0).optional(),
			ratio: number().min(1).max(20).optional(),
			attackMs: number().min(.1).max(200).optional(),
			releaseMs: number().min(10).max(2e3).optional(),
			makeupDb: number().min(0).max(18).optional()
		}).optional()
	}),
	object({
		processorId: literal("limiter"),
		enabled: boolean().optional(),
		parameters: object({
			thresholdDb: number().min(-18).max(0).optional(),
			releaseMs: number().min(10).max(1e3).optional()
		}).optional()
	})
]);
appSettingsSchema.partial().extend({
	detailedDiagnostics: appSettingsSchema.shape.detailedDiagnostics.removeDefault().optional(),
	softwareRendering: appSettingsSchema.shape.softwareRendering.removeDefault().optional(),
	deviceAppearanceOverrides: appSettingsSchema.shape.deviceAppearanceOverrides.removeDefault().optional(),
	mouseBatteryLighting: appSettingsSchema.shape.mouseBatteryLighting.removeDefault().optional(),
	developerMode: appSettingsSchema.shape.developerMode.removeDefault().optional(),
	visibleWorkspaces: appSettingsSchema.shape.visibleWorkspaces.removeDefault().optional(),
	onboardingCompleted: appSettingsSchema.shape.onboardingCompleted.removeDefault().optional()
});
_enum([
	"all",
	"general",
	"devices",
	"audio",
	"capture",
	"games",
	"modules",
	"diagnostics"
]);
object({
	kind: _enum([
		"bug",
		"feature",
		"feedback"
	]),
	title: string().trim().min(5).max(120),
	description: string().trim().min(10).max(2e3),
	supportingDetails: string().trim().max(1200).optional(),
	includeDiagnostics: boolean()
}).extend({ email: string().trim().max(254).email() });
object({
	submitted: boolean(),
	message: string().max(500)
});
object({
	copied: boolean(),
	opened: boolean()
});
object({
	id: string().min(1).max(256),
	name: string().trim().min(1).max(120)
});
object({ reviewedThrough: number().int().nonnegative() });
object({
	id: string().min(1).max(256),
	favorite: boolean()
});
object({
	id: string().min(1).max(256),
	canvasSize: clipCanvasSizeSchema
});
object({
	id: string().min(1).max(256),
	trackIndex: number().int().min(0).max(7),
	level: number().int().min(0).max(100)
});
var clipTrimInputShape = {
	music: montageMusicTrackSchema.nullable().optional(),
	videoEdits: videoEditsSchema.optional(),
	id: string().min(1).max(256),
	startMs: number().int().nonnegative(),
	endMs: number().int().positive(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional()
};
object(clipTrimInputShape).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
var clipExportPresetSchema = _enum([
	"original",
	"10mb",
	"25mb",
	"50mb"
]);
object({
	...clipTrimInputShape,
	preset: clipExportPresetSchema,
	exportId: string().uuid().optional()
}).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
object({
	...clipTrimInputShape,
	preset: clipExportPresetSchema,
	exportId: string().uuid()
}).refine((input) => input.endMs > input.startMs, {
	message: "The trim end must be after the trim start.",
	path: ["endMs"]
});
object({
	id: string().uuid(),
	name: string().trim().min(1).max(260),
	fileSize: number().int().nonnegative()
});
object({
	exportId: string().uuid(),
	percent: number().int().min(0).max(100),
	stage: _enum([
		"compressing",
		"finalizing",
		"complete"
	])
});
var montageProjectSegmentSchema = object({
	id: string().min(1).max(256),
	clipId: string().min(1).max(256),
	sourceDurationMs: number().int().positive(),
	trimStartMs: number().int().nonnegative(),
	trimEndMs: number().int().positive(),
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
var montageProjectSchema = object({
	type: literal("montage"),
	id: string().min(1).max(256),
	name: string().trim().min(1).max(120),
	durationMs: number().int().positive(),
	canvasSize: clipCanvasSizeSchema,
	segments: array(montageProjectSegmentSchema).min(1).max(500)
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
object({
	exportId: string().uuid(),
	project: montageProjectSchema,
	preset: clipExportPresetSchema
});
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
	const manufacturer = normalize(identity.manufacturer);
	const model = normalize(identity.model);
	const variant = normalize(identity.variant);
	const colorway = normalize(identity.colorway);
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
function normalize(value) {
	return value?.trim().toLocaleLowerCase("en-US");
}
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
//#endregion
//#region src/renderer/src/lib/demo-api.ts
var snapshot = createDefaultSnapshot();
snapshot.gameDetection.capability = "simulation";
snapshot.audio.capabilities = {
	virtualChannels: "simulation",
	applicationRouting: "simulation",
	channelDsp: "simulation",
	microphoneDsp: "simulation",
	noiseSuppression: "unavailable",
	realtimeMetering: "simulation",
	microphoneTest: "unavailable",
	monitoring: "unavailable",
	spatialAudio: "unavailable"
};
snapshot.audio.applications = [
	{
		id: "preview-game-session",
		name: "Cyberpunk 2077",
		executableName: "Cyberpunk2077",
		processId: 18640,
		destination: "game",
		currentDestination: "game",
		preferredDestination: "game",
		routingState: "applied",
		active: true
	},
	{
		id: "preview-chat-session",
		name: "Discord",
		executableName: "Discord",
		processId: 18704,
		destination: "chat",
		currentDestination: "chat",
		preferredDestination: "chat",
		routingState: "applied",
		active: true
	},
	{
		id: "preview-game-launcher-session",
		name: "Steam",
		executableName: "steamwebhelper",
		processId: 18736,
		destination: "game",
		currentDestination: "game",
		preferredDestination: "game",
		routingState: "applied",
		active: false
	},
	{
		id: "preview-media-session",
		name: "Spotify",
		executableName: "Spotify",
		processId: 18768,
		destination: "media",
		currentDestination: "media",
		preferredDestination: "media",
		routingState: "applied",
		active: false
	}
];
for (const bus of snapshot.audio.buses) bus.appCount = snapshot.audio.applications.filter((application) => application.currentDestination === bus.id).length;
var listeners = /* @__PURE__ */ new Set();
var audioMeterListeners = /* @__PURE__ */ new Set();
var engineTimer;
var audioMeterTimer;
var meterSequence = 0;
var meterPhase = 0;
function emit() {
	const value = structuredClone(snapshot);
	for (const listener of listeners) listener(value);
	return value;
}
function recalculate() {
	const running = snapshot.engines.filter((engine) => engine.state === "running");
	const engineMemory = running.reduce((sum, engine) => sum + engine.memoryMb, 0);
	snapshot.performance = {
		...snapshot.performance,
		totalMemoryMb: 136 + engineMemory,
		totalCpuPercent: .3 + running.reduce((sum, engine) => sum + engine.cpuPercent, 0),
		activeProcesses: 2 + running.length
	};
}
function ensureTimer() {
	if (engineTimer !== void 0) return;
	engineTimer = window.setInterval(() => {
		let changed = false;
		for (const engine of snapshot.engines) {
			if (engine.state !== "running") continue;
			engine.uptimeSeconds += 1;
			engine.cpuPercent = engine.kind === "capture" ? .8 : .3;
			engine.memoryMb = engine.kind === "capture" ? 31 : 24;
			changed = true;
		}
		if (changed) {
			recalculate();
			emit();
		}
	}, 1e3);
}
function setEngine(kind, enabled) {
	const engine = snapshot.engines.find((candidate) => candidate.kind === kind);
	if (!engine) return;
	engine.state = enabled ? "running" : "stopped";
	engine.pid = enabled ? kind === "audio" ? 18432 : 18496 : void 0;
	engine.cpuPercent = enabled ? kind === "audio" ? .3 : .8 : 0;
	engine.memoryMb = enabled ? kind === "audio" ? 24 : 31 : 0;
	engine.uptimeSeconds = 0;
	engine.message = enabled ? "Browser preview simulation active" : void 0;
	if (!enabled && kind === "capture") {
		snapshot.capture.runtime.bufferedSeconds = 0;
		snapshot.capture.runtime.segmentCount = 0;
		snapshot.capture.runtime.replayCacheBytes = 0;
	}
	recalculate();
	ensureTimer();
	if (kind === "audio") syncAudioMeterTimer();
}
async function simulateGameScan() {
	snapshot.gameDetection.scanState = "scanning";
	snapshot.gameDetection.error = void 0;
	emit();
	await new Promise((resolveScan) => window.setTimeout(resolveScan, 420));
	const addedAt = (/* @__PURE__ */ new Date()).toISOString();
	const games = [
		{
			id: "game-preview-baldurs-gate-3",
			name: "Baldur's Gate 3",
			source: "steam",
			installDirectory: "C:\\Games\\Steam\\Baldurs Gate 3",
			executablePath: null,
			launchUri: "steam://rungameid/1086940",
			addedAt
		},
		{
			id: "game-preview-cyberpunk-2077",
			name: "Cyberpunk 2077",
			source: "epic",
			installDirectory: "C:\\Games\\Epic\\Cyberpunk 2077",
			executablePath: "C:\\Games\\Epic\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe",
			launchUri: null,
			addedAt
		},
		{
			id: "game-preview-hades-2",
			name: "Hades II",
			source: "steam",
			installDirectory: "C:\\Games\\Steam\\Hades II",
			executablePath: null,
			launchUri: "steam://rungameid/1145350",
			addedAt
		}
	];
	const manualGames = snapshot.gameDetection.games.filter((game) => game.source === "manual");
	snapshot.gameDetection.games = [...games, ...manualGames].sort((left, right) => left.name.localeCompare(right.name));
	snapshot.gameDetection.scanState = "idle";
	snapshot.gameDetection.lastScanAt = (/* @__PURE__ */ new Date()).toISOString();
	return emit();
}
function syncAudioMeterTimer() {
	const shouldRun = snapshot.audio.enabled && audioMeterListeners.size > 0;
	if (!shouldRun && audioMeterTimer !== void 0) {
		window.clearInterval(audioMeterTimer);
		audioMeterTimer = void 0;
		return;
	}
	if (!shouldRun || audioMeterTimer !== void 0) return;
	audioMeterTimer = window.setInterval(() => {
		meterPhase += .17;
		const personalMix = snapshot.audio.mixes.find((mix) => mix.id === "personal");
		const frame = {
			sequence: meterSequence++,
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			values: snapshot.audio.buses.map((bus, index) => {
				const movement = .52 + Math.sin(meterPhase + index * 1.31) * .22 + Math.sin(meterPhase * .43 + index) * .12;
				const control = personalMix?.buses.find((candidate) => candidate.id === bus.id);
				const level = control?.enabled ? Math.max(0, Math.min(1, bus.meter * movement * Math.min(1.25, control.gain + .18))) : 0;
				const peak = Math.min(1, level + .055);
				return {
					busId: bus.id,
					level,
					peak,
					clipping: peak >= .985
				};
			})
		};
		for (const listener of audioMeterListeners) listener(frame);
	}, 50);
}
var switchboardApi = window.switchboard ?? {
	async saveScene() {
		throw new Error("Scene changes are available in the desktop app.");
	},
	async deleteScene() {
		throw new Error("Scene changes are available in the desktop app.");
	},
	async applyScene() {
		throw new Error("Scenes require the desktop app.");
	},
	async restoreScene() {
		throw new Error("Scenes require the desktop app.");
	},
	async setSetupPreferences() {
		throw new Error("Setup preferences require the desktop app.");
	},
	async openQuickControls() {
		throw new Error("Quick controls require the desktop app.");
	},
	async closeQuickControls() {},
	async runQuickAction() {
		throw new Error("Quick controls require the desktop app.");
	},
	setUiScale() {},
	async getSnapshot() {
		ensureTimer();
		return structuredClone(snapshot);
	},
	async setModuleState(input) {
		const module = snapshot.modules.find((candidate) => candidate.id === input.moduleId);
		if (module) {
			module.installed = module.installed || input.enabled;
			module.enabled = input.enabled;
			if (module.kind === "audio") {
				snapshot.audio.enabled = input.enabled;
				setEngine("audio", input.enabled);
			}
			if (module.kind === "capture") {
				snapshot.capture.config.enabled = input.enabled;
				setEngine("capture", input.enabled);
			}
		}
		return emit();
	},
	async createModuleProject() {
		throw new Error("Creating a module project requires the Switchboard desktop application.");
	},
	async linkModuleProject() {
		throw new Error("Linking a module project requires the Switchboard desktop application.");
	},
	async validateModuleProject(input) {
		const module = snapshot.modules.find((candidate) => candidate.id === input.moduleId && candidate.source === "local");
		if (module?.development) {
			module.development.status = "ready";
			module.development.lastValidatedAt = (/* @__PURE__ */ new Date()).toISOString();
			module.development.issues = [];
		}
		return emit();
	},
	async revealModuleProject() {
		throw new Error("Opening a module project requires the Switchboard desktop application.");
	},
	async unlinkModuleProject(input) {
		snapshot.modules = snapshot.modules.filter((candidate) => candidate.id !== input.moduleId || candidate.source !== "local");
		return emit();
	},
	async setDeviceControl(input) {
		const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
		if (!device) return emit();
		const { change } = input;
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
			const mode = change.enabled ? "onboard" : "software";
			const reason = change.enabled ? "Stored onboard profiles are active. Turn off onboard memory to edit the software profile." : void 0;
			if (device.capabilities.dpi) Object.assign(device.capabilities.dpi, {
				profileMode: mode,
				writable: !change.enabled,
				unavailableReason: reason
			});
			if (device.capabilities.reportRate) Object.assign(device.capabilities.reportRate, {
				profileMode: mode,
				writable: !change.enabled,
				unavailableReason: reason
			});
			if (device.capabilities.buttonAssignments) Object.assign(device.capabilities.buttonAssignments, {
				profileMode: mode,
				writable: !change.enabled,
				unavailableReason: reason
			});
			if (device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
				profileMode: mode,
				writable: !change.enabled,
				colorWritable: !change.enabled,
				brightnessWritable: !change.enabled,
				speedWritable: !change.enabled,
				unavailableReason: reason
			});
		}
		if (change.type === "lighting-enabled" && device.capabilities.lighting) device.capabilities.lighting.enabled = change.enabled;
		if (change.type === "lighting-color" && device.capabilities.lighting) {
			device.capabilities.lighting.color = change.color;
			device.capabilities.lighting.enabled = true;
		}
		if (change.type === "lighting-brightness" && device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
			brightness: change.brightness,
			activeProfileId: "custom"
		});
		if (change.type === "lighting-effect" && device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
			activeEffectId: change.effectId,
			activeProfileId: "custom"
		});
		if (change.type === "lighting-speed" && device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
			speed: change.speed,
			activeProfileId: "custom"
		});
		if (change.type === "lighting-direction" && device.capabilities.lighting) Object.assign(device.capabilities.lighting, {
			direction: change.direction,
			activeProfileId: "custom"
		});
		if (change.type === "lighting-zone-color" && device.capabilities.lighting) {
			const zone = device.capabilities.lighting.zones?.find((candidate) => candidate.id === change.zoneId);
			if (zone) Object.assign(zone, { color: change.color });
			Object.assign(device.capabilities.lighting, {
				activeEffectId: "static",
				activeProfileId: "custom"
			});
		}
		if (change.type === "lighting-profile" && device.capabilities.lighting) {
			const profile = device.capabilities.lighting.profiles.find((candidate) => candidate.id === change.profileId);
			if (profile) Object.assign(device.capabilities.lighting, {
				activeProfileId: profile.id,
				activeEffectId: profile.effectId,
				brightness: profile.brightness,
				speed: profile.speed
			});
		}
		if (change.type === "keyboard-gaming-mode" && device.capabilities.keyboard?.gamingMode) device.capabilities.keyboard.gamingMode.enabled = change.enabled;
		if (change.type === "keyboard-onboard-profile" && device.capabilities.keyboard?.onboardProfiles) {
			const profile = device.capabilities.keyboard.onboardProfiles.profiles.find((candidate) => candidate.id === change.profileId);
			if (profile) device.capabilities.keyboard.onboardProfiles.activeProfileId = profile.id;
		}
		if (change.type === "keyboard-rapid-trigger" && device.capabilities.keyboard?.rapidTrigger?.writable) device.capabilities.keyboard.rapidTrigger.enabled = change.enabled;
		if (change.type === "keyboard-snap-tap" && device.capabilities.keyboard?.snapTap?.writable) device.capabilities.keyboard.snapTap.enabled = change.enabled;
		if (change.type === "microphone-mute-lighting" && device.capabilities.lighting) device.capabilities.lighting.muteLinked = change.enabled;
		return emit();
	},
	async refreshDevices() {
		return emit();
	},
	async setDeviceSetting(input) {
		const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
		if (device) device.settings[input.key] = input.value;
		return emit();
	},
	async setAudioEnabled(enabled) {
		if (enabled && snapshot.settings.developerMode !== true) throw new Error("Audio is available only when Developer mode is enabled in Settings, General.");
		snapshot.audio.enabled = enabled;
		const module = snapshot.modules.find((candidate) => candidate.id === "capability.audio-router");
		if (module) {
			module.installed = true;
			module.enabled = enabled;
		}
		setEngine("audio", enabled);
		return emit();
	},
	async setAudioBusGain(input) {
		const bus = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId)?.buses.find((candidate) => candidate.id === input.busId);
		if (bus) bus.gain = input.gain;
		return emit();
	},
	async setAudioMasterGain(input) {
		const mix = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId);
		if (mix) mix.master.gain = input.gain;
		return emit();
	},
	async setAudioMasterEnabled(input) {
		const mix = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId);
		if (mix) mix.master.enabled = input.enabled;
		return emit();
	},
	async setDeviceAppearanceOverride(input) {
		const device = snapshot.devices.find((candidate) => candidate.id === input.deviceId);
		if (!device) return emit();
		if (input.override) snapshot.settings.deviceAppearanceOverrides[input.deviceId] = input.override;
		else delete snapshot.settings.deviceAppearanceOverrides[input.deviceId];
		if (device.variantResolution.confidence !== "hardware") {
			const resolved = resolveDeviceVariant({
				...device.identity,
				variant: void 0,
				colorway: void 0
			}, [], input.override ?? void 0);
			device.identity = resolved.identity;
			device.variantResolution = resolved.resolution;
			device.asset = resolveProductAsset(resolved.identity, device.kind);
		}
		return emit();
	},
	async setAudioBusEnabled(input) {
		const bus = snapshot.audio.mixes.find((candidate) => candidate.id === input.mixId)?.buses.find((candidate) => candidate.id === input.busId);
		if (bus) bus.enabled = input.enabled;
		return emit();
	},
	async setAudioChannelEnabled(input) {
		const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
		if (bus) bus.enabled = input.enabled;
		return emit();
	},
	async setAudioBusDevice(input) {
		const bus = snapshot.audio.buses.find((candidate) => candidate.id === input.busId);
		const device = snapshot.audio.devices.find((candidate) => candidate.id === input.deviceId);
		if (bus && device) {
			bus.deviceId = device.id;
			if (bus.id === "mic") snapshot.audio.microphoneDevice = device.name;
			if (bus.id === "game") snapshot.audio.outputDevice = device.name;
		}
		return emit();
	},
	async setAudioApplicationRoute(input) {
		const application = snapshot.audio.applications.find((candidate) => candidate.id === input.applicationId);
		if (!application) throw new Error("That audio session is no longer available.");
		application.destination = input.destination;
		application.preferredDestination = input.destination;
		application.routingState = application.currentDestination === input.destination ? "applied" : "pending-restart";
		return emit();
	},
	async applyAudioPreset(input) {
		const preset = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
		if (!preset) return emit();
		applyAudioPathPreset(snapshot.audio, preset);
		return emit();
	},
	async createAudioPreset(input) {
		const id = `user-${input.kind}-${crypto.randomUUID()}`;
		snapshot.audio.pathPresets.push(snapshotAudioPathPreset(snapshot.audio, input.kind, id, input.name));
		snapshot.audio.activePresetIds[input.kind] = id;
		return emit();
	},
	async renameAudioPreset(input) {
		const preset = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
		if (!preset) throw new Error(`Unknown audio preset: ${input.presetId}`);
		if (preset.builtIn) throw new Error("Built-in presets cannot be renamed. Duplicate it first.");
		preset.name = input.name;
		return emit();
	},
	async duplicateAudioPreset(input) {
		const source = snapshot.audio.pathPresets.find((candidate) => candidate.id === input.presetId);
		if (!source) throw new Error(`Unknown audio preset: ${input.presetId}`);
		const id = `user-${source.kind}-${crypto.randomUUID()}`;
		snapshot.audio.pathPresets.push(snapshotAudioPathPreset(snapshot.audio, source.kind, id, `${source.name} copy`));
		snapshot.audio.activePresetIds[source.kind] = id;
		return emit();
	},
	async deleteAudioPreset(input) {
		const index = snapshot.audio.pathPresets.findIndex((candidate) => candidate.id === input.presetId);
		if (index < 0) throw new Error(`Unknown audio preset: ${input.presetId}`);
		const preset = snapshot.audio.pathPresets[index];
		if (preset.builtIn) throw new Error("Built-in presets cannot be deleted.");
		snapshot.audio.pathPresets.splice(index, 1);
		snapshot.audio.activePresetIds[preset.kind] = findMatchingAudioPresetId(snapshot.audio, preset.kind);
		return emit();
	},
	async importAudioPreset() {
		throw new Error("Preset import requires the Switchboard desktop application.");
	},
	async exportAudioPreset() {
		throw new Error("Preset export requires the Switchboard desktop application.");
	},
	async setAudioChannelProcessor(input) {
		const processing = snapshot.audio.channelProcessing.find((candidate) => candidate.busId === input.busId);
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
		snapshot.audio.channelProcessing[snapshot.audio.channelProcessing.indexOf(processing)] = channelProcessingSchema.parse(processing);
		snapshot.audio.activePresetIds[input.busId] = findMatchingAudioPresetId(snapshot.audio, input.busId);
		return emit();
	},
	async setAudioMonitoring(input) {
		if (snapshot.audio.capabilities.monitoring === "unavailable") throw new Error("Low-latency microphone monitoring is unavailable in the browser preview.");
		if (typeof input.enabled === "boolean") snapshot.audio.monitoringEnabled = input.enabled;
		if (typeof input.level === "number") snapshot.audio.monitoring = input.level;
		if (input.deviceId) snapshot.audio.monitoringDeviceId = input.deviceId;
		snapshot.audio.activePresetIds.microphone = findMatchingAudioPresetId(snapshot.audio, "microphone");
		return emit();
	},
	async testMicrophone() {
		throw new Error("Microphone testing requires the native Audio.Host.");
	},
	async setChatMix(value) {
		snapshot.audio.chatMix = value;
		return emit();
	},
	async setMicProcessor(input) {
		const processor = snapshot.audio.micProcessors.find((candidate) => candidate.id === input.processorId);
		if (processor) {
			const index = snapshot.audio.micProcessors.indexOf(processor);
			snapshot.audio.micProcessors[index] = micProcessorSchema.parse({
				...processor,
				enabled: input.enabled ?? processor.enabled,
				parameters: {
					...processor.parameters,
					...input.parameters
				}
			});
		}
		snapshot.audio.activePresetIds.microphone = findMatchingAudioPresetId(snapshot.audio, "microphone");
		return emit();
	},
	subscribeAudioMeters(listener) {
		audioMeterListeners.add(listener);
		syncAudioMeterTimer();
		return () => {
			audioMeterListeners.delete(listener);
			syncAudioMeterTimer();
		};
	},
	async setCaptureConfig(input) {
		if (input.enabled) throw new Error("Instant Replay is available only in the Switchboard desktop application.");
		const { defaultTrackLevels, ...rest } = input;
		snapshot.capture.config = {
			...snapshot.capture.config,
			...rest,
			...defaultTrackLevels ? { defaultTrackLevels: {
				...snapshot.capture.config.defaultTrackLevels,
				...defaultTrackLevels
			} } : {}
		};
		if (typeof input.enabled === "boolean") {
			const module = snapshot.modules.find((candidate) => candidate.id === "capability.replay");
			if (module) {
				module.installed = true;
				module.enabled = input.enabled;
			}
			setEngine("capture", input.enabled);
		}
		return emit();
	},
	async saveReplay() {
		throw new Error("Saving a real replay requires the Switchboard desktop capture host.");
	},
	async chooseClipDirectory() {
		throw new Error("Folder selection requires the Switchboard desktop application.");
	},
	async openClipsDirectory() {
		throw new Error("Opening the Clips folder requires the Switchboard desktop application.");
	},
	async refreshCaptureSources() {
		return emit();
	},
	async updateAutoCaptureSettings(input) {
		const current = snapshot.capture.autoCapture.settings;
		const games = { ...current.games };
		for (const [gameId, patch] of Object.entries(input.games ?? {})) games[gameId] = autoCaptureSettingsSchema.shape.games.valueType.parse({
			enabled: true,
			useGlobalTiming: true,
			...games[gameId],
			...patch,
			events: {
				...games[gameId]?.events,
				...patch.events
			}
		});
		snapshot.capture.autoCapture.settings = autoCaptureSettingsSchema.parse({
			...current,
			...input,
			reactionClipping: {
				...current.reactionClipping,
				...input.reactionClipping
			},
			games,
			dismissedAvailability: {
				...current.dismissedAvailability,
				...input.dismissedAvailability
			}
		});
		return emit();
	},
	async setupAutoCaptureProvider() {
		throw new Error("Provider setup requires the Switchboard desktop application.");
	},
	async emitAutoCaptureTestEvent() {
		throw new Error("Test events require the Switchboard desktop capture host.");
	},
	async scanGames() {
		return simulateGameScan();
	},
	async addGame() {
		throw new Error("Selecting a game executable requires the Switchboard desktop application.");
	},
	async checkAppUpdates() {
		return emit();
	},
	async downloadAppUpdate() {
		throw new Error("Application updates require the Switchboard desktop application.");
	},
	async installAppUpdate() {
		throw new Error("Application updates require an installed Switchboard build.");
	},
	async exportResourceDiagnostics() {
		throw new Error("Resource diagnostics require the native app.");
	},
	async runDiagnostics() {
		throw new Error("Run diagnostics requires the native app.");
	},
	async cancelDiagnostics() {
		return structuredClone(snapshot);
	},
	async updateSettings(input) {
		const enableAutomaticScan = input.scanGamesAutomatically === true && !snapshot.settings.scanGamesAutomatically;
		if (input.developerMode === false) {
			snapshot.audio.enabled = false;
			const module = snapshot.modules.find((candidate) => candidate.id === "capability.audio-router");
			if (module) module.enabled = false;
			setEngine("audio", false);
		}
		snapshot.settings = {
			...snapshot.settings,
			...input
		};
		return enableAutomaticScan ? simulateGameScan() : emit();
	},
	async resetSettings(scope) {
		const defaults = createDefaultSnapshot();
		if (scope === "all") {
			snapshot.settings = defaults.settings;
			snapshot.audio = createResetAudioState(snapshot.audio, defaults.audio);
			snapshot.capture.config = defaults.capture.config;
			snapshot.gameDetection = {
				...defaults.gameDetection,
				capability: "simulation"
			};
			const audioModule = snapshot.modules.find((candidate) => candidate.id === "capability.audio-router");
			if (audioModule) audioModule.enabled = false;
			const captureModule = snapshot.modules.find((candidate) => candidate.id === "capability.replay");
			if (captureModule) captureModule.enabled = false;
			setEngine("audio", false);
			setEngine("capture", false);
		}
		if (scope === "general") {
			snapshot.settings.uiScalePercent = defaults.settings.uiScalePercent;
			snapshot.settings.launchAtStartup = defaults.settings.launchAtStartup;
			snapshot.settings.closeToTray = defaults.settings.closeToTray;
			snapshot.settings.destroyRendererInTray = defaults.settings.destroyRendererInTray;
			snapshot.settings.softwareRendering = defaults.settings.softwareRendering;
			snapshot.settings.automaticAppUpdates = defaults.settings.automaticAppUpdates;
			snapshot.settings.automaticAppUpdateDownloads = defaults.settings.automaticAppUpdateDownloads;
			snapshot.settings.installAppUpdatesOnNextStartup = defaults.settings.installAppUpdatesOnNextStartup;
			snapshot.settings.installAppUpdatesWhenIdle = defaults.settings.installAppUpdatesWhenIdle;
			snapshot.settings.developerMode = defaults.settings.developerMode;
			if (defaults.settings.developerMode !== true) {
				snapshot.audio.enabled = false;
				const audioModule = snapshot.modules.find((candidate) => candidate.id === "capability.audio-router");
				if (audioModule) audioModule.enabled = false;
				setEngine("audio", false);
			}
		}
		if (scope === "devices") snapshot.settings.deviceAppearanceOverrides = {};
		if (scope === "audio") {
			snapshot.audio = createResetAudioState(snapshot.audio, defaults.audio);
			const module = snapshot.modules.find((candidate) => candidate.id === "capability.audio-router");
			if (module) module.enabled = false;
			setEngine("audio", false);
		}
		if (scope === "capture") {
			snapshot.capture.config = defaults.capture.config;
			const module = snapshot.modules.find((candidate) => candidate.id === "capability.replay");
			if (module) module.enabled = false;
			setEngine("capture", false);
		}
		if (scope === "games") {
			snapshot.settings.scanGamesAutomatically = defaults.settings.scanGamesAutomatically;
			snapshot.gameDetection = {
				...defaults.gameDetection,
				capability: "simulation"
			};
		}
		if (scope === "modules") snapshot.settings.automaticModuleUpdates = defaults.settings.automaticModuleUpdates;
		if (scope === "diagnostics") {
			snapshot.settings.performanceGuard = defaults.settings.performanceGuard;
			snapshot.settings.diagnosticsRetentionDays = defaults.settings.diagnosticsRetentionDays;
		}
		return emit();
	},
	async submitFeedbackReport() {
		return {
			submitted: false,
			message: "Feedback submission is available in the desktop app. This preview does not send messages."
		};
	},
	async revealClip() {},
	async deleteClip(id) {
		snapshot.clips = snapshot.clips.filter((clip) => clip.id !== id);
		snapshot.capture.storage.clipsBytes = snapshot.clips.reduce((total, clip) => total + clip.fileSize, 0);
		return emit();
	},
	async markClipsReviewed(input) {
		snapshot.clipReview.reviewedThrough = Math.max(snapshot.clipReview.reviewedThrough, input.reviewedThrough);
		return emit();
	},
	async renameClip(input) {
		const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
		if (clip) {
			clip.name = input.name;
			clip.titleEdited = true;
		}
		return emit();
	},
	async setClipFavorite(input) {
		const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
		if (clip) clip.favorite = input.favorite;
		return emit();
	},
	async setClipTrim(input) {
		const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
		if (clip) {
			clip.trimStartMs = input.startMs;
			clip.trimEndMs = input.endMs < clip.durationMs ? input.endMs : void 0;
			const audioTrackTrims = [...input.audioTrackTrims ?? []];
			while (audioTrackTrims.at(-1) === null) audioTrackTrims.pop();
			clip.audioTrackTrims = audioTrackTrims.length > 0 ? audioTrackTrims : void 0;
		}
		return emit();
	},
	async setClipCanvasSize(input) {
		const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
		if (clip) clip.canvasSize = input.canvasSize;
		return emit();
	},
	async setClipAudioTrackLevel(input) {
		const clip = snapshot.clips.find((candidate) => candidate.id === input.id);
		if (clip) {
			const levels = applyClipTrackLevel(clip.audioTrackLevels, clip.audioChannels, snapshot.capture.config.defaultTrackLevels, input.trackIndex, input.level);
			clip.audioTrackLevels = levels.length > 0 ? levels : void 0;
		}
		return emit();
	},
	async loadClipAudioWaveform(id) {
		return {
			clipId: id,
			tracks: []
		};
	},
	async exportClip() {
		return false;
	},
	async prepareClipShare() {
		return null;
	},
	startPreparedShareDrag() {},
	async revealPreparedShareFile() {},
	async exportMontage() {
		return false;
	},
	async cancelClipExport() {},
	subscribeClipExportProgress() {
		return () => {};
	},
	subscribe(listener) {
		listeners.add(listener);
		return () => listeners.delete(listener);
	}
};
function createResetAudioState(current, defaults) {
	const reset = structuredClone(defaults);
	reset.devices = structuredClone(current.devices);
	reset.pathPresets = [...structuredClone(defaults.pathPresets), ...structuredClone(current.pathPresets.filter((preset) => !preset.builtIn))];
	const availableDeviceIds = new Set(reset.devices.map((device) => device.id));
	for (const bus of reset.buses) {
		if (availableDeviceIds.has(bus.deviceId)) continue;
		const currentBus = current.buses.find((candidate) => candidate.id === bus.id);
		if (currentBus && availableDeviceIds.has(currentBus.deviceId)) bus.deviceId = currentBus.deviceId;
	}
	const defaultOutput = reset.devices.find((device) => device.direction === "output" && device.available && device.isDefault);
	const defaultInput = reset.devices.find((device) => device.direction === "input" && device.available && device.isDefault);
	reset.outputDevice = defaultOutput?.name ?? current.outputDevice;
	reset.microphoneDevice = defaultInput?.name ?? current.microphoneDevice;
	for (const kind of [
		"game",
		"chat",
		"media",
		"microphone"
	]) {
		const defaultId = defaults.activePresetIds[kind];
		reset.activePresetIds[kind] = defaultId && reset.pathPresets.some((preset) => preset.id === defaultId) ? defaultId : null;
	}
	return reset;
}
//#endregion
export { string as A, __commonJSMin as B, videoEditsSchema as C, literal as D, boolean as E, createSlot as F, createSlottable as I, require_jsx_runtime as L, cn as M, createLucideIcon as N, number as O, Slot as P, require_react_dom as R, titleOverlay as S, array as T, __toESM as V, framingGeometry as _, clipCanvasSizeSchema as a, sourceToEditedMs as b, defaultMouseBatteryLightingPolicy as c, normalizeMusicTrack as d, automationGainAt as f, framingAt as g, editedTimeAt as h, clipAudioTrackTrimsSchema as i, cva as j, object as k, pageIdSchema as l, editedDurationMs as m, applyClipTrackLevel as n, clipExportPresetSchema as o, canvasRatios as p, effectiveClipTrackLevels as r, createModuleProjectInputSchema as s, switchboardApi as t, montageMusicTrackSchema as u, gainAt as v, videoTextSize as w, speedAt as x, montageSizeChoices as y, require_react as z };
