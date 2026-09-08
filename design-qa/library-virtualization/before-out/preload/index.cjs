let electron = require("electron");
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
function clone(inst, def, params) {
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
	return clone(schema, mergeDefs(schema._zod.def, {
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
	return clone(schema, mergeDefs(schema._zod.def, {
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
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
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
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
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
	return clone(a, mergeDefs(a._zod.def, {
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
	return clone(schema, mergeDefs(schema._zod.def, {
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
	return clone(schema, mergeDefs(schema._zod.def, { get shape() {
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
function time$1(args) {
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
	def.pattern ?? (def.pattern = time$1(def));
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
function process(schema, ctx, _params = {
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
			process(parent, ctx, params);
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
	process(schema, ctx);
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
	process(schema, ctx);
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
	json.items = process(def.element, ctx, {
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
	for (const key in shape) json.properties[key] = process(shape[key], ctx, {
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
	} else if (def.catchall) json.additionalProperties = process(def.catchall, ctx, {
		...params,
		path: [...params.path, "additionalProperties"]
	});
};
var unionProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	const isExclusive = def.inclusive === false;
	const options = def.options.map((x, i) => process(x, ctx, {
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
	const a = process(def.left, ctx, {
		...params,
		path: [
			...params.path,
			"allOf",
			0
		]
	});
	const b = process(def.right, ctx, {
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
		const valueSchema = process(def.valueType, ctx, {
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
		if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") json.propertyNames = process(def.keyType, ctx, {
			...params,
			path: [...params.path, "propertyNames"]
		});
		json.additionalProperties = process(def.valueType, ctx, {
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
	const inner = process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	if (ctx.target === "openapi-3.0") {
		seen.ref = def.innerType;
		json.nullable = true;
	} else json.anyOf = [inner, { type: "null" }];
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
};
var defaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.default = JSON.parse(JSON.stringify(def.defaultValue));
};
var prefaultProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	if (ctx.io === "input") json._prefault = JSON.parse(JSON.stringify(def.defaultValue));
};
var catchProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
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
	process(innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
	const seen = ctx.seen.get(schema);
	seen.ref = def.innerType;
	json.readOnly = true;
};
var optionalProcessor = (schema, ctx, _json, params) => {
	const def = schema._zod.def;
	process(def.innerType, ctx, params);
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
function time(params) {
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
			return clone(this, def, params);
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
	inst.time = (params) => inst.check(time(params));
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
	const k = clone(keyType);
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
_enum([
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
object({
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
var audioMeterFrameSchema = object({
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
	codec: captureCodecSchema,
	encoder: captureEncoderPreferenceSchema,
	quality: number().int().min(1).max(5),
	replaySeconds: number().int().min(15).max(300),
	includeMic: boolean(),
	includeSystemAudio: boolean(),
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
captureConfigSchema.omit({ clipsDirectory: true }).partial().extend({ defaultTrackLevels: defaultClipTrackLevelsSchema.partial().optional() });
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
	developmentOnly: boolean().default(false)
});
var autoCaptureGameSettingsSchema = object({
	enabled: boolean().default(true),
	useGlobalTiming: boolean().default(true),
	preRollSeconds: number().int().min(5).max(120).optional(),
	postRollSeconds: number().int().min(0).max(60).optional(),
	playerName: string().trim().min(1).max(64).optional(),
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
var clipCanvasSizeSchema = _enum(["original", "9:16"]);
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
	trimStartMs: number().int().nonnegative().optional(),
	trimEndMs: number().int().positive().optional(),
	canvasSize: clipCanvasSizeSchema.default("original"),
	audioChannels: array(clipAudioChannelSchema).max(4).optional(),
	audioTrackLevels: array(number().int().min(0).max(100)).max(8).optional(),
	audioTrackTrims: clipAudioTrackTrimsSchema.optional(),
	autoCapture: clipAutoCaptureMetadataSchema.optional()
});
var clipReviewStateSchema = object({ reviewedThrough: number().int().nonnegative() });
var performanceSnapshotSchema = object({
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
	automaticModuleUpdates: boolean(),
	performanceGuard: boolean(),
	diagnosticsRetentionDays: number().int().min(1).max(30),
	telemetry: literal(false),
	scanGamesAutomatically: boolean(),
	clipEditorInspectorOpen: boolean(),
	deviceAppearanceOverrides: record(string(), deviceAppearanceOverrideSchema).default({}),
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
object({
	version: string(),
	prototypeMode: boolean(),
	appUpdate: appUpdateStateSchema,
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
	softwareRendering: appSettingsSchema.shape.softwareRendering.removeDefault().optional(),
	deviceAppearanceOverrides: appSettingsSchema.shape.deviceAppearanceOverrides.removeDefault().optional(),
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
	kind: _enum(["bug", "feature"]),
	title: string().trim().min(5).max(120),
	description: string().trim().min(10).max(2e3),
	supportingDetails: string().trim().max(1200).optional(),
	includeDiagnostics: boolean()
});
var feedbackHandoffResultSchema = object({
	copied: boolean(),
	opened: boolean()
});
var ipcChannels = {
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
	resetSettings: "settings:reset",
	handoffFeedbackReport: "feedback:handoff-report",
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
var preparedShareFileSchema = object({
	id: string().uuid(),
	name: string().trim().min(1).max(260),
	fileSize: number().int().nonnegative()
});
var clipExportProgressSchema = object({
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
//#region src/preload/index.ts
var audioMeterListeners = /* @__PURE__ */ new Set();
var handleAudioMeter = (_event, raw) => {
	const parsed = audioMeterFrameSchema.safeParse(raw);
	if (!parsed.success) return;
	for (const listener of audioMeterListeners) listener(parsed.data);
};
function subscribeAudioMeters(listener) {
	if (audioMeterListeners.size === 0) {
		electron.ipcRenderer.on(ipcChannels.audioMeterUpdated, handleAudioMeter);
		electron.ipcRenderer.postMessage(ipcChannels.setAudioMeterSubscription, true);
	}
	audioMeterListeners.add(listener);
	return () => {
		audioMeterListeners.delete(listener);
		if (audioMeterListeners.size !== 0) return;
		electron.ipcRenderer.postMessage(ipcChannels.setAudioMeterSubscription, false);
		electron.ipcRenderer.removeListener(ipcChannels.audioMeterUpdated, handleAudioMeter);
	};
}
var api = {
	setUiScale: (percent) => {
		if (![
			90,
			100,
			110,
			125,
			150
		].includes(percent)) throw new Error("Unsupported UI scale.");
		electron.webFrame.setZoomFactor(percent / 100);
	},
	getSnapshot: () => electron.ipcRenderer.invoke(ipcChannels.getSnapshot),
	refreshDevices: () => electron.ipcRenderer.invoke(ipcChannels.refreshDevices),
	setModuleState: (input) => electron.ipcRenderer.invoke(ipcChannels.setModuleState, input),
	createModuleProject: (input) => electron.ipcRenderer.invoke(ipcChannels.createModuleProject, input),
	linkModuleProject: () => electron.ipcRenderer.invoke(ipcChannels.linkModuleProject),
	validateModuleProject: (input) => electron.ipcRenderer.invoke(ipcChannels.validateModuleProject, input),
	revealModuleProject: (input) => electron.ipcRenderer.invoke(ipcChannels.revealModuleProject, input),
	unlinkModuleProject: (input) => electron.ipcRenderer.invoke(ipcChannels.unlinkModuleProject, input),
	setDeviceControl: (input) => electron.ipcRenderer.invoke(ipcChannels.setDeviceControl, input),
	setDeviceSetting: (input) => electron.ipcRenderer.invoke(ipcChannels.setDeviceSetting, input),
	setDeviceAppearanceOverride: (input) => electron.ipcRenderer.invoke(ipcChannels.setDeviceAppearanceOverride, input),
	setAudioEnabled: (enabled) => electron.ipcRenderer.invoke(ipcChannels.setAudioEnabled, enabled),
	setAudioMasterGain: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioMasterGain, input),
	setAudioMasterEnabled: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioMasterEnabled, input),
	setAudioBusGain: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioBusGain, input),
	setAudioBusEnabled: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioBusEnabled, input),
	setAudioChannelEnabled: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioChannelEnabled, input),
	setAudioBusDevice: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioBusDevice, input),
	setAudioApplicationRoute: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioApplicationRoute, input),
	applyAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.applyAudioPreset, input),
	createAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.createAudioPreset, input),
	renameAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.renameAudioPreset, input),
	duplicateAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.duplicateAudioPreset, input),
	deleteAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.deleteAudioPreset, input),
	importAudioPreset: () => electron.ipcRenderer.invoke(ipcChannels.importAudioPreset),
	exportAudioPreset: (input) => electron.ipcRenderer.invoke(ipcChannels.exportAudioPreset, input),
	setAudioChannelProcessor: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioChannelProcessor, input),
	setAudioMonitoring: (input) => electron.ipcRenderer.invoke(ipcChannels.setAudioMonitoring, input),
	testMicrophone: () => electron.ipcRenderer.invoke(ipcChannels.testMicrophone),
	setChatMix: (value) => electron.ipcRenderer.invoke(ipcChannels.setChatMix, value),
	setMicProcessor: (input) => electron.ipcRenderer.invoke(ipcChannels.setMicProcessor, input),
	subscribeAudioMeters,
	setCaptureConfig: (input) => electron.ipcRenderer.invoke(ipcChannels.setCaptureConfig, input),
	saveReplay: () => electron.ipcRenderer.invoke(ipcChannels.saveReplay),
	chooseClipDirectory: () => electron.ipcRenderer.invoke(ipcChannels.chooseClipDirectory),
	openClipsDirectory: () => electron.ipcRenderer.invoke(ipcChannels.openClipsDirectory),
	refreshCaptureSources: () => electron.ipcRenderer.invoke(ipcChannels.refreshCaptureSources),
	updateAutoCaptureSettings: (input) => electron.ipcRenderer.invoke(ipcChannels.updateAutoCaptureSettings, input),
	setupAutoCaptureProvider: (providerId) => electron.ipcRenderer.invoke(ipcChannels.setupAutoCaptureProvider, providerId),
	emitAutoCaptureTestEvent: (input) => electron.ipcRenderer.invoke(ipcChannels.emitAutoCaptureTestEvent, input),
	scanGames: () => electron.ipcRenderer.invoke(ipcChannels.scanGames),
	addGame: () => electron.ipcRenderer.invoke(ipcChannels.addGame),
	checkAppUpdates: () => electron.ipcRenderer.invoke(ipcChannels.checkAppUpdates),
	downloadAppUpdate: () => electron.ipcRenderer.invoke(ipcChannels.downloadAppUpdate),
	installAppUpdate: () => electron.ipcRenderer.invoke(ipcChannels.installAppUpdate),
	updateSettings: (input) => electron.ipcRenderer.invoke(ipcChannels.updateSettings, input),
	resetSettings: (scope) => electron.ipcRenderer.invoke(ipcChannels.resetSettings, scope),
	handoffFeedbackReport: async (input) => feedbackHandoffResultSchema.parse(await electron.ipcRenderer.invoke(ipcChannels.handoffFeedbackReport, input)),
	revealClip: (id) => electron.ipcRenderer.invoke(ipcChannels.revealClip, id),
	deleteClip: (id) => electron.ipcRenderer.invoke(ipcChannels.deleteClip, id),
	markClipsReviewed: (input) => electron.ipcRenderer.invoke(ipcChannels.markClipsReviewed, input),
	renameClip: (input) => electron.ipcRenderer.invoke(ipcChannels.renameClip, input),
	setClipFavorite: (input) => electron.ipcRenderer.invoke(ipcChannels.setClipFavorite, input),
	setClipTrim: (input) => electron.ipcRenderer.invoke(ipcChannels.setClipTrim, input),
	setClipCanvasSize: (input) => electron.ipcRenderer.invoke(ipcChannels.setClipCanvasSize, input),
	setClipAudioTrackLevel: (input) => electron.ipcRenderer.invoke(ipcChannels.setClipAudioTrackLevel, input),
	loadClipAudioWaveform: (id) => electron.ipcRenderer.invoke(ipcChannels.loadClipAudioWaveform, id),
	exportClip: (input) => electron.ipcRenderer.invoke(ipcChannels.exportClip, input),
	prepareClipShare: async (input) => {
		const result = await electron.ipcRenderer.invoke(ipcChannels.prepareClipShare, input);
		return result === null ? null : preparedShareFileSchema.parse(result);
	},
	startPreparedShareDrag: (id) => electron.ipcRenderer.postMessage(ipcChannels.startPreparedShareDrag, id),
	revealPreparedShareFile: (id) => electron.ipcRenderer.invoke(ipcChannels.revealPreparedShareFile, id),
	exportMontage: (input) => electron.ipcRenderer.invoke(ipcChannels.exportMontage, input),
	cancelClipExport: (exportId) => electron.ipcRenderer.invoke(ipcChannels.cancelClipExport, exportId),
	subscribeClipExportProgress: (listener) => {
		const handler = (_event, raw) => {
			const parsed = clipExportProgressSchema.safeParse(raw);
			if (parsed.success) listener(parsed.data);
		};
		electron.ipcRenderer.on(ipcChannels.clipExportProgress, handler);
		return () => electron.ipcRenderer.removeListener(ipcChannels.clipExportProgress, handler);
	},
	importMontageAudio: () => electron.ipcRenderer.invoke(montageV2IpcChannels.importAudio),
	loadMontageAudioWaveform: (assetId) => electron.ipcRenderer.invoke(montageV2IpcChannels.loadAudioWaveform, assetId),
	listMontageDrafts: () => electron.ipcRenderer.invoke(montageV2IpcChannels.listDrafts),
	saveMontageDraft: (project) => electron.ipcRenderer.invoke(montageV2IpcChannels.saveDraft, project),
	deleteMontageDraft: (projectId) => electron.ipcRenderer.invoke(montageV2IpcChannels.deleteDraft, projectId),
	exportMontageV2: (input) => electron.ipcRenderer.invoke(montageV2IpcChannels.export, input),
	cancelMontageV2Export: (exportId) => electron.ipcRenderer.invoke(montageV2IpcChannels.cancelExport, exportId),
	subscribe: (listener) => {
		const handler = (_event, snapshot) => listener(snapshot);
		electron.ipcRenderer.on(ipcChannels.snapshotUpdated, handler);
		return () => electron.ipcRenderer.removeListener(ipcChannels.snapshotUpdated, handler);
	}
};
electron.contextBridge.exposeInMainWorld("switchboard", api);
//#endregion
