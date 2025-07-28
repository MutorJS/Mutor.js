import { isPlainObject } from "../shared/helpers.js";

export const parse = (component) => {
	if (component === null || component === undefined || component === false) {
		return { tagname: null };
	}
	if (typeof component === "number" || typeof component === "string") {
		return { tagname: "text", attributes: { text: component } };
	}
	if (isPlainObject(component)) {
		if (!component.tagname) component.tagname = "fragment";
		return component;
	}
	throw new Error(
		`Mutor.js: Invalid component type. Expected type string, number or object literal, got type ${typeof component}`,
		{ cause: component },
	);
};
