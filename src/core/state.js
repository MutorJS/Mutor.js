import { isFunction, isPlainObject } from "../shared/helpers.js";
import { update } from "./render.js";

let _isInitializing = false;
let _initializedComponent = null;
let _currentEffect = null;

let _currentStates = null;
let _currentEffects = null;

const stateCache = new WeakMap();
const stateComponentCache = new WeakMap();
const stateEffectCache = new WeakMap();
const proxyCache = new WeakMap();

export const initialize = (component) => {
	try {
		if (!component) return component;

		_isInitializing = true;

		if (isFunction(component)) {
			_initializedComponent = component();
		} else {
			_initializedComponent = component;
		}

		if (isPlainObject(_initializedComponent.attributes)) {
			for (const attribute in _initializedComponent.attributes) {
				if (isFunction(_initializedComponent.attributes[attribute])) {
					_initializedComponent.attributes[attribute]();
				}
			}
		}

		if (isFunction(_initializedComponent.children)) {
			const _resolvedChildren = _initializedComponent.children();
			if (!Array.isArray(_resolvedChildren)) {
				throw new Error(
					"Mutor.js: When a component's children is a function, it must return an array.",
					{ cause: component },
				);
			}
			_initializedComponent._resolvedChildren = _resolvedChildren;
		}

		return _initializedComponent;
	} finally {
		_initializedComponent._states = _currentStates;
		_initializedComponent._effects = _currentEffects;

		_initializedComponent = null;
		_isInitializing = false;
		_currentStates = null;
		_currentEffects = null;
	}
};

export const reactive = (state) => {
	if (!isPlainObject(state)) {
		console.warn(
			"Mutor.js: Passing a non-object, or non-array parameter to the `reactive` function will not result in a reactive state.",
		);
		console.warn(
			`Mutor.js: Received ${state} as parameter for \`reactive\`. This will not create a reactive state. Consider wrapping the value in an object or array to ensure reactivity.`,
		);
		return state;
	}

	const proxy = new Proxy(state, {
		get(target, key) {
			let value;

			if (stateCache.has(target[key])) {
				value = stateCache.get(target[key]);
			} else if (isPlainObject(target[key])) {
				value = reactive(target[key]);
				stateCache.set(target[key], value);
			} else {
				value = target[key];
			}

			if (_initializedComponent) {
				registerStateComponent(target, key, _initializedComponent);
			}

			if (_currentEffect) {
				registerStateEffect(target, key, _currentEffect);
				_currentEffect = null;
			}

			return value;
		},

		set(target, prop, value) {
			const isSet = Reflect.set(target, prop, value);
			if (isSet && stateComponentCache.has(target)) {
				queueMicrotask(() => {
					const dependentComponents = stateComponentCache.get(target);
					const dependentEffects = stateEffectCache.get(target);

					if (dependentComponents?.[prop]) {
						for (const component of dependentComponents[prop].values()) {
							update(component);
						}
					}

					if (dependentEffects?.[prop]) {
						for (const effect of dependentEffects[prop].values()) {
							effect();
						}
					}
				});
			}
			return isSet;
		},
	});

	if (!_currentStates) _currentStates = new Set();
	_currentStates.add(proxy);
	proxyCache.set(proxy, state);
	return proxy;
};

const registerStateComponent = (state, path, component) => {
	if (stateComponentCache.has(state)) {
		const entry = stateComponentCache.get(state);

		if (!entry[path]) {
			entry[path] = new Set();
			entry[path].add(component);
		} else {
			entry[path].add(component);
		}
	} else {
		const dependencies = new Set();
		dependencies.add(component);
		stateComponentCache.set(state, { [path]: dependencies });
	}
};

const registerStateEffect = (state, path, component) => {
	if (stateEffectCache.has(state)) {
		const entry = stateEffectCache.get(state);

		if (!entry[path]) {
			entry[path] = new Set();
			entry[path].add(component);
		} else {
			entry[path].add(component);
		}
	} else {
		const dependencies = new Set();
		dependencies.add(component);
		stateEffectCache.set(state, { [path]: dependencies });
	}
};

export const effect = (cb) => {
	if (!isFunction(cb)) {
		throw new TypeError(
			`Mutor.js: Expected the callback parameter of \`effect\` to be a function, received ${cb} instead`,
			{ cause: cb },
		);
	}

	if (!_currentEffects) _currentEffects = new Set();
	_currentEffects.add(cb);
	_currentEffect = cb;
	try {
		cb();
	} catch {}
};

export const destroyState = (proxy) => {
	if (!proxyCache.has(proxy)) return;

	const state = proxyCache.get(proxy);
	if (stateComponentCache.has(state)) {
		const compMap = stateComponentCache.get(state);
		for (const path in compMap) {
			compMap[path].clear();
		}
		stateComponentCache.delete(state);
	}

	if (stateEffectCache.has(state)) {
		const effectMap = stateEffectCache.get(state);
		for (const path in effectMap) {
			effectMap[path].clear();
		}
		stateEffectCache.delete(state);
	}

	if (stateCache.has(state)) {
		stateCache.delete(state);
	}

	proxyCache.delete(proxy);
	if (isPlainObject(state)) {
		for (const key in state) {
			destroyState(state[key]);
		}
	}
};

export const destroyComponentInstance = (instance) => {
	if (instance._states) {
		for (const state of instance._states.values()) {
			destroyState(state);
		}
		instance._states.clear();
		instance._states = null;
	}

	// TODO: Finish this
	if (instance._effects) {
		// for (const state of instance._effects.values()) {
		// 	destroyState(state);
		// }
		instance._effects.clear();
		instance._effects = null;
	}

	if (instance.children) {
		for (const child of instance.children) {
			destroyComponentInstance(child);
		}
		instance.children = null;
	}

	if (instance._resolvedChildren) {
		for (const child of instance._resolvedChildren) {
			destroyComponentInstance(child);
		}
		instance._resolvedChildren = null;
	}

	if (instance.node) {
		if (isPlainObject(instance.events)) {
			for (const event in instance.events) {
				instance.node?.removeEventListener(event, instance.events[event]);
			}
		}
		instance.node?.remove();
		instance.node = null;
	}
};
