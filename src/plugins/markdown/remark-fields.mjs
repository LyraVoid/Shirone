const FIELD_OPENER = /^(\s*)(:{3,})[\t ]*field(?:-group)?(?:[\t ]|$)/i;

/** Normalizes spaced field containers for the directive parser. */
export function remarkFields() {
	const parser = this.parser;
	this.parser = function parseFields(source) {
		if (typeof source !== "string" || !source.includes("field")) return parser(source);
		const normalized = source.split(/(\r?\n)/).map((part) => {
			const match = part.match(FIELD_OPENER);
			if (!match) return part;
			const prefix = part.slice(0, match[0].length - match[0].trimStart().length);
			const marker = match[2];
			const rest = part.slice(match[0].length).trim();
			const name = /field-group/i.test(match[0]) ? "field-group" : "field";
			if (name === "field-group" || !rest) return `${prefix}${marker}${name}`;
			if (rest.startsWith("{") || rest.startsWith("[")) return `${prefix}${marker}${name}${rest}`;
			return `${prefix}${marker}${name}{name="${rest.replaceAll('"', '&quot;')}"}`;
		}).join("");
		return parser(normalized);
	};
}
