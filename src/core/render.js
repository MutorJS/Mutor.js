import { AttributesNameMap } from "../shared/constants.js";
import { isFunction, isPlainObject } from "../shared/helpers.js";
import { parse } from "./parse.js";
import { initialize } from "./state.js";

const scheduledComponentUpdate = new WeakMap();

export const mount = (component, target = null) => {
	let parsed;
	if (isFunction(component) || isPlainObject(component)) {
		parsed = initialize(component);
	} else {
		parsed = parse(component);
	}

	parsed = parse(parsed);
	createNode(parsed);

	if (target && parsed.node) {
		target?.appendChild?.(parsed.node);
	}

	return parsed;
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

		if (component._resolvedChildren) {
			const newResolvedChildren = component.children();
			if (newResolvedChildren.length > component._resolvedChildren.length) {
				const addedChildren = newResolvedChildren.slice(
					component._resolvedChildren.length,
				);
				for (const child of addedChildren) {
					component._resolvedChildren.push(mount(child, component.node));
				}
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
