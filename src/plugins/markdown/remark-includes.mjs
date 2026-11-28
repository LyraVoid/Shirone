import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { matchFenceCloser, matchFenceOpener } from "./fence-scan.mjs";

const INCLUDE_LINE =
	/^([\t ]{0,3})<!--[\t ]*@include:[\t ]*([^\s]+?)(?:\{(\d*)-(\d*)\}|#([A-Za-z0-9._-]+))?[\t ]*-->[\t ]*$/u;
const REGION_START =
	/(?:#|\/\/|<!--)\s*region\s+([A-Za-z0-9._-]+)\s*(?:-->)?\s*$/u;
const REGION_END =
	/(?:#|\/\/|<!--)\s*endregion(?:\s+[A-Za-z0-9._-]+)?\s*(?:-->)?\s*$/u;

function insideWorkspace(filePath) {
	const root = resolve(process.cwd());
	const relativePath = relative(root, filePath);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
}

function sliceLines(content, start, end) {
	if (start === undefined && end === undefined) return content;
	const lines = content.split(/\r?\n/u);
	const first = start ? Number.parseInt(start, 10) : 1;
	const last = end ? Number.parseInt(end, 10) : lines.length;
	if (
		!Number.isInteger(first) ||
		!Number.isInteger(last) ||
		first < 1 ||
		last < first
	) {
		return null;
	}
	return lines.slice(first - 1, last).join("\n");
}

function sliceRegion(content, region) {
	const lines = content.split(/\r?\n/u);
	let start = -1;
	for (let index = 0; index < lines.length; index += 1) {
		const startMatch = lines[index].match(REGION_START);
		if (startMatch?.[1] === region) {
			start = index + 1;
			break;
		}
	}
	if (start < 0) return null;
	for (let index = start; index < lines.length; index += 1) {
		if (REGION_END.test(lines[index]))
			return lines.slice(start, index).join("\n");
	}
	return null;
}

function readInclude(includePath, start, end, region, baseDir, stack) {
	const target = resolve(baseDir, includePath);
	if (!insideWorkspace(target) || stack.includes(target) || !existsSync(target))
		return null;
	let content;
	try {
		content = readFileSync(target, "utf8");
	} catch {
		return null;
	}
	if (region) return sliceRegion(content, region);
	return sliceLines(content, start, end);
}

/**
 * Expands Plume-compatible include comments outside fenced code blocks.
 * Missing files, malformed ranges and recursive includes remain literal.
 */
export function expandMarkdownIncludes(source, options = {}) {
	const baseDir = options.baseDir ?? process.cwd();
	const stack = options.stack ?? [];
	const lines = String(source).split(/\r?\n/u);
	const output = [];
	let fence = null;
	let included = false;

	for (const line of lines) {
		if (fence) {
			// 围栏内容保持原样；闭栏必须是仅含围栏标记（与后随空白）的行
			if (matchFenceCloser(line, fence)) fence = null;
			output.push(line);
			continue;
		}

		const opener = matchFenceOpener(line);
		if (opener) {
			fence = opener;
			output.push(line);
			continue;
		}
		const match = line.match(INCLUDE_LINE);
		if (!match) {
			output.push(line);
			continue;
		}
		const [, indent, includePath, start, end, region] = match;
		const content = readInclude(
			includePath,
			start,
			end,
			region,
			baseDir,
			stack,
		);
		if (content === null) {
			output.push(line);
			continue;
		}
		included = true;
		const expanded = expandMarkdownIncludes(content, {
			baseDir: dirname(resolve(baseDir, includePath)),
			stack: [...stack, resolve(baseDir, includePath)],
		});
		output.push(
			...expanded.source
				.split("\n")
				.map((childLine) => `${indent}${childLine}`),
		);
	}

	return { source: output.join("\n"), included };
}

export function remarkIncludes() {
	const parser = this.parser;
	if (typeof parser !== "function") {
		throw new TypeError(
			"remarkIncludes requires an initialized Markdown parser.",
		);
	}

	this.parser = function parseIncludes(document) {
		const source = typeof document === "string" ? document : String(document);
		const baseDir = document?.path
			? dirname(resolve(document.path))
			: process.cwd();
		const expanded = expandMarkdownIncludes(source, { baseDir });
		const tree = parser(expanded.source);
		tree.data = { ...(tree.data ?? {}), shironeIncludes: expanded.included };
		return tree;
	};
}
