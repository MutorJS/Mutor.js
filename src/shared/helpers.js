export const isPlainObject = (obj) => {
	if (!isObject(obj)) return false;

	const proto = Object.getPrototypeOf(obj);
	if (proto === null) return true;

	return proto === Object.prototype;
};

export const isObject = (value) => {
	return value !== null && typeof value === "object";
};

export const isFunction = (value) => {
	return Object.prototype.toString.call(value) === "[object Function]";
};
