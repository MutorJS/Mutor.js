import { AttributesNameMap } from "../shared/constants.js";
import { isFunction, isPlainObject } from "../shared/helpers.js";
import { parse } from "./parse.js";
import { destroyComponentInstance, initialize } from "./state.js";

const scheduledComponentUpdate = new WeakMap();

const prepareForMount = (component) => {
	let parsed;

	if (isFunction(component) || isPlainObject(component)) {
		parsed = initialize(component);
	} else {
		parsed = parse(component);
	}

	parsed = parse(parsed);
	createNode(parsed);
	return parsed;
};

export const mount = (component, target) => {
	const preparedComponent = prepareForMount(component);
	target.appendChild(preparedComponent.node);
	return preparedComponent;
};

const createNode = (component) => {
	let node;
	if (component.tagname === null) {
		component.node = null;
		return null;
	} else if (component.tagname === "text") {
		node = document.createTextNode(component.attributes.text);
		component.node = node;
		return node;
	} else if (component.tagname === "fragment") {
		node = document.createDocumentFragment();
	} else {
		node = document.createElement(component.tagname);
	}

	if (isPlainObject(component.attributes) && component.tagname !== "fragment") {
		for (const attribute in component.attributes) {
			const value = isFunction(component.attributes[attribute])
				? component.attributes[attribute]()
				: component.attributes[attribute];
			const attrName = AttributesNameMap[attribute] ?? attribute;
			if (attrName in node) node[attrName] = value;
			else node.setAttribute(attrName, value);
		}
	}

	if (isPlainObject(component.events)) {
		for (const event in component.events) {
			if (isFunction(component.events[event])) {
				node.addEventListener(event, component.events[event]);
			}
		}
	}

	if (Array.isArray(component.children)) {
		for (const child of component.children) {
			mount(child, node);
		}
	} else if (component._resolvedChildren) {
		for (const child of component._resolvedChildren) {
			mount(child, node);
		}
	}

	component.node = node;
	return node;
};

export const update = (component) => {
	if (scheduledComponentUpdate.has(component)) return;

	try {
		scheduledComponentUpdate.set(component, true);

		// Update dynamic attributes
		if (isPlainObject(component.attributes)) {
			for (const attribute in component.attributes) {
				if (isFunction(component.attributes[attribute])) {
					const value = component.attributes[attribute]();
					const attrName = AttributesNameMap[attribute] ?? attribute;
					if (attrName in component.node && value !== component.node[attrName])
						component.node[attrName] = value;
					else if (
						component.node.getAttribute(attrName) !== component.node[attrName]
					) {
						component.node.setAttribute(attrName, value);
					}
				}
			}
		}

		// TODO: Implement diffing
		if (component._resolvedChildren) {
			const newChildren = component.children();
			const oldChildren = component._resolvedChildren;
			const maxLength = Math.max(newChildren.length, oldChildren.length);

			for (let i = 0; i < maxLength; i++) {
				const newChild = newChildren[i];
				const oldChild = oldChildren[i];

				console.log(newChild, oldChild);

				if (!newChild) {
					console.log("No new child");
					destroyComponentInstance(oldChild);
					continue;
				}

				if (!oldChild) {
					console.log("No old child");
					// TODO: Complete this
					continue;
				}

				if (!oldChild.key || !newChild.key) {
					console.warn("Mutor.js: Must provide keys for dynamic children");
					const parsedChild = prepareForMount(newChild);

					if (
						component.tagname !== "fragment" &&
						component.tagname !== "text"
					) {
						component.node.replaceChild(parsedChild.node, oldChild.node);
					} else if (component.tagname === "fragment") {
						console.log("Fragment");
						const nextChild = oldChildren[i + 1];
						const prevChild = oldChildren[i - 1];

						if (!nextChild) {
							component.node.append(newChild.node);
						} else if (!prevChild) {
							if (nextChild.node)
								document.insertBefore(newChild.node, nextChild.node);
							else console.log("Omo");
						}
					} else {
						console.log("Omo again!");
					}

					oldChildren[i] = parsedChild;
					destroyComponentInstance(oldChild);
					continue;
				}

				// Both have keys
				// TODO: Check if the keys are the same, or rearranged
			}
		}
	} finally {
		scheduledComponentUpdate.delete(component);
	}
};

export const show = (when, component) => {
	if (when) return component;
	return null;
};

// TODO: Implement this
const diffChildren = (oldChild, newChild) => {};
