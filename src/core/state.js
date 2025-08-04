import { isFunction, isPlainObject } from "../shared/helpers.js";
import { update } from "./render.js";

let _isInitializing = false;
let _activeComponent = null;
let _currentEffect = null;

let _currentStates = null;
let _currentEffects = null;

const objectToProxyMap = new WeakMap();
const proxyToObjectMap = new WeakMap();

const stateComponentCache = new WeakMap();
const stateEffectCache = new WeakMap();
const effectCleanupCache = new WeakMap();

export const initialize = (component) => {
	try {
		if (!component) return component;

		_isInitializing = true;

		if (isFunction(component)) {
			_activeComponent = component();
		} else {
			_activeComponent = component;
		}

		// If attributes are functions, execute them to retrieve state dependencies.
		if (isPlainObject(_activeComponent.attributes)) {
			for (const attribute in _activeComponent.attributes) {
				if (isFunction(_activeComponent.attributes[attribute])) {
					_activeComponent.attributes[attribute]();
				}
			}
		}

		// Evaluate dynamic children to retrieve state dependencies
		if (isFunction(_activeComponent.children)) {
			const _resolvedChildren = _activeComponent.children();
			if (!Array.isArray(_resolvedChildren)) {
				throw new Error(
					"Mutor.js: When a component's children is a function, it must return an array.",
					{ cause: component },
				);
			}
			_activeComponent._resolvedChildren = _resolvedChildren;
		}

		return _activeComponent;
	} finally {
		_activeComponent._states = _currentStates;
		_activeComponent._effects = _currentEffects;

		_activeComponent = null;
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
			`Mutor.js: Received ${typeof state} as parameter for \`reactive\`. This will not create a reactive state. Consider wrapping the value in an object or array to ensure reactivity.`,
		);
		return state;
	}

	// Early catch
	// Return existing proxy if already created for this object
	if (objectToProxyMap.has(state)) {
		return objectToProxyMap.get(state);
	}

	const proxy = new Proxy(state, {
		get(target, key) {
			if (typeof key === "symbol") return Reflect.get(target, key);

			let value = Reflect.get(target, key);

			if (isPlainObject(value) && !objectToProxyMap.has(value)) {
				value = reactive(value);
			}

			if (_activeComponent) {
				// Register state component dependencies
				registerStateDependency(
					stateComponentCache,
					target,
					key,
					_activeComponent,
				);
			}

			if (_currentEffect) {
				// Register state effect dependencies
				registerStateDependency(stateEffectCache, target, key, _currentEffect);
			}

			return value;
		},

		set(target, prop, value) {
			if (typeof prop === "symbol") return Reflect.set(target, prop, value);

			const oldValue = Reflect.get(target, prop);
			if (oldValue === value) return true;

			if (isPlainObject(value) && !objectToProxyMap.has(value)) {
				value = reactive(value);
			}

			const isSet = Reflect.set(target, prop, value);
			if (isSet) {
				// Remove replaced state property if it's an object
				if (isPlainObject(oldValue) && objectToProxyMap.has(oldValue)) {
					const proxiedValue = objectToProxyMap.get(oldValue);
					destroyState(proxiedValue);
				}

				// Schedule a re-render as soon as possible
				queueMicrotask(() => {
					const dependentComponents = stateComponentCache.get(target);
					const dependentEffects = stateEffectCache.get(target);

					// Request components update
					if (dependentComponents?.[prop]) {
						for (const component of dependentComponents[prop].values()) {
							update(component);
						}
					}

					// Run effects that depend on the state
					if (dependentEffects?.[prop]) {
						for (const effect of dependentEffects[prop].values()) {
							if (effectCleanupCache.has(effect)) {
								const cleanup = effectCleanupCache.get(effect);
								cleanup();
							}

							effect();
						}
					}
				});
			}

			return isSet;
		},
	});

	// Track states for the component to be initialized next.
	// This prevents dangling of states, like globally declared states. The next initialized, or the currently
	// initializing component will claim the state.
	if (!_currentStates) _currentStates = new Set();

	_currentStates.add(proxy);
	objectToProxyMap.set(state, proxy);
	proxyToObjectMap.set(proxy, state);

	return proxy;
};

const registerStateDependency = (cache, stateTarget, path, dependency) => {
	if (!cache.has(stateTarget)) {
		cache.set(stateTarget, {});
	}

	const entry = cache.get(stateTarget);
	if (!entry[path]) {
		entry[path] = new Set();
	}

	entry[path].add(dependency);
};

export const effect = (cb) => {
	if (!isFunction(cb)) {
		throw new TypeError(
			`Mutor.js: Expected the callback parameter of \`effect\` to be a function, received ${typeof cb} instead.`,
			{ cause: "Effect callback is not a function." },
		);
	}

	// Track effects for the component to be initialized next.
	// This prevents dangling of effects, like globally declared effects. The next initialized, or the currently
	// initializing component will claim the state.
	if (!_currentEffects) _currentEffects = new Set();
	_currentEffects.add(cb);

	const runEffect = () => {
		const previousEffect = _currentEffect;
		_currentEffect = cb;
		try {
			const cleanup = cb();

			if (isFunction(cleanup)) {
				const prevCleanup = effectCleanupCache.get(cb);

				if (isFunction(prevCleanup)) prevCleanup();
				effectCleanupCache.set(cb, cleanup);
			}
		} catch (e) {
			console.error("Mutor.js: An error occurred in an effect:", e);
		} finally {
			// Make sure to nullify _currentEffect
			_currentEffect = previousEffect;
		}
	};

	// Execute the effect immediately to collect it's state dependencies
	runEffect();
};

export const destroyState = (proxy) => {
	if (!proxyToObjectMap.has(proxy)) return;

	const state = proxyToObjectMap.get(proxy);
	// Clear dependencies from caches
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
			for (const cb of effectMap[path].values()) {
				if (effectCleanupCache.has(cb)) {
					const cleanup = effectCleanupCache.get(cb);

					if (isFunction(cleanup)) {
						cleanup();
						effectCleanupCache.delete(cb);
					}
				}
			}

			effectMap[path].clear();
		}

		stateEffectCache.delete(state);
	}

	// Remove from proxy caches
	objectToProxyMap.delete(state);
	proxyToObjectMap.delete(proxy);

	// Recursively destroy states of nested
	// plain objects that were made reactive
	if (isPlainObject(state)) {
		for (const key in state) {
			const nestedValue = state[key];
			if (objectToProxyMap.has(nestedValue)) {
				const nestedProxy = objectToProxyMap.get(nestedValue);
				destroyState(nestedProxy);
			}
		}
	}
};

export const destroyComponentInstance = (instance) => {
	const instancesToDestroy = [instance];

	while (instancesToDestroy.length > 0) {
		const currentInstance = instancesToDestroy.pop();

		if (!currentInstance) continue;
		if (currentInstance._states) {
			for (const stateProxy of currentInstance._states.values()) {
				destroyState(stateProxy);
			}
			currentInstance._states.clear();
			currentInstance._states = null;
		}

		// Effects registered for a component are typically covered by state destruction.
		// If an effect had external subscriptions not tied to reactive state, it should return a cleanup function.
		// For now, clearing the internal reference is sufficient if they are purely reactive side-effects.
		if (currentInstance._effects) {
			for (const cb of currentInstance._effects) {
				const cleanup = effectCleanupCache.get(cb);
				if (isFunction(cleanup)) {
					cleanup();
					effectCleanupCache.delete(cb);
				}
			}

			currentInstance._effects.clear();
			currentInstance._effects = null;
		}

		const childrenToProcess =
			currentInstance._resolvedChildren || currentInstance.children;

		if (Array.isArray(childrenToProcess)) {
			for (const child of childrenToProcess) {
				instancesToDestroy.push(child);
			}
		}

		currentInstance.children = null;
		currentInstance._resolvedChildren = null;

		if (currentInstance.node) {
			if (isPlainObject(currentInstance.events)) {
				for (const event in currentInstance.events) {
					currentInstance.node?.removeEventListener(
						event,
						currentInstance.events[event],
					);
				}
			}

			currentInstance.node?.remove();
			currentInstance.node = null;
		}
	}
};
