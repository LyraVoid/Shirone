import {
	matchFenceCloserLine,
	matchFenceOpener,
	splitContainerPrefix,
} from "./fence-scan.mjs";

const FIELD_OPENER = /^(\s*)(:{3,})[\t ]*field(?:-group)?(?:[\t ]|$)/i;

/** Normalizes spaced field containers for the directive parser. */
export function remarkFields() {
	const parser = this.parser;
	this.parser = function parseFields(source) {
		if (typeof source !== "string" || !source.includes("field"))
			return parser(source);
		let fence = null;
		const normalized = source
			.split(/(\r?\n)/)
			.map((part) => {
				if (part === "\n" || part === "\r\n") return part;
				const { prefix, rest, container } = splitContainerPrefix(part);
				if (fence) {
					// 围栏内容是字面文本；闭栏只认归属容器的前缀
					if (matchFenceCloserLine(part, fence)) fence = null;
					return part;
				}
				const opener = matchFenceOpener(rest);
				if (opener) {
					fence = { ...opener, owner: container ? prefix : "" };
					return part;
				}

				const match = part.match(FIELD_OPENER);
				if (!match) return part;
				const lead = part.slice(
					0,
					match[0].length - match[0].trimStart().length,
				);
				const marker = match[2];
				const value = part.slice(match[0].length).trim();
				const name = /field-group/i.test(match[0]) ? "field-group" : "field";
				const tag = `${lead}${marker}${name}`;
				if (name === "field-group" || !value) return tag;
				if (value.startsWith("{") || value.startsWith("["))
					return `${tag}${value}`;
				return `${tag}{name="${value.replaceAll('"', "&quot;")}"}`;
			})
			.join("");
		return parser(normalized);
	};
}
