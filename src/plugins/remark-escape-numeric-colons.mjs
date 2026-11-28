import {
	columnsOf,
	indentColumns,
	matchFenceCloserLine,
	matchFenceOpener,
	splitContainerPrefix,
} from "./markdown/fence-scan.mjs";

const INDENTED_CODE_LINE = /^(?: {4,}|\t)/;

/**
 * 行内代码 span（反引号开闭长度须一致，内部允许更短的反引号串与换行）或
 * `<scheme:…>` autolink；匹配从普通文本起，片段本身保持原样。
 */
const INLINE_SPAN = /(`+)(?:[^`]|`(?!\1))+?\1|<[a-z][a-z0-9+.-]*:[^\s<>]*>/i;

/** 仅匹配两侧均为数字的冒号（比例写法） */
const NUMERIC_COLON_PATTERN = /(?<=\d):(?=\d)/g;

function escapeOutsideInlineSpans(text) {
	const spans = new RegExp(INLINE_SPAN.source, "gi");
	let result = "";
	let last = 0;
	for (const match of text.matchAll(spans)) {
		// 片段（行内代码 / autolink）保持原样，片段之间的普通文本执行转义
		result += text
			.slice(last, match.index)
			.replace(NUMERIC_COLON_PATTERN, "\\:");
		result += match[0];
		last = match.index + match[0].length;
	}
	result += text.slice(last).replace(NUMERIC_COLON_PATTERN, "\\:");
	return result;
}

/**
 * 对 Markdown 源码执行比例冒号转义。
 *
 * 这里在 Markdown 解析前把「数字:数字」中的冒号替换为 `\:` 转义写法；
 * Markdown 渲染 `\:` 时正常输出 `:`，作者可见文本保持不变。
 *
 * 围栏代码块（``` / ~~~，含 blockquote / 列表容器内）、行内代码、
 * 缩进代码块与 `<…>` autolink 不参与替换，原样保护。
 *
 * @param {string} source 原始 Markdown 源码。
 * @returns {string} 转义后的源码。
 */
export function escapeNumericColons(source) {
	let fence = null;
	let inIndentedCode = false;
	let indentedInContainer = false;
	let indentedOwner = "";
	let activeListColumns = 0;
	let prevBlank = true;
	let buffer = [];
	let bufferMode = null; // "container" | "text"
	const chunks = [];

	// 连续的普通文本行先缓冲，行内代码 span 允许在同一块内跨行
	function flush() {
		if (buffer.length > 0) {
			chunks.push(escapeOutsideInlineSpans(buffer.join("")));
			buffer = [];
		}
		bufferMode = null;
	}

	for (const part of source.split(/(\r?\n)/)) {
		if (part === "\n" || part === "\r\n") {
			if (fence || buffer.length === 0) chunks.push(part);
			else buffer.push(part);
			continue;
		}

		if (fence) {
			flush();
			if (matchFenceCloserLine(part, fence)) {
				fence = null;
				// 围栏闭合即块结束：其后允许出现缩进代码块
				prevBlank = true;
				inIndentedCode = false;
			}
			chunks.push(part);
			continue;
		}

		const { prefix, rest, container, list } = splitContainerPrefix(part);

		// 跟踪仍然活跃的列表内容列宽：顶层缩进行若 ≥ 该列宽即列表续行段落
		if (container && list) {
			activeListColumns = columnsOf(prefix);
		} else if (
			!/^[\t ]*$/.test(part) &&
			indentColumns(part) < activeListColumns
		) {
			// 缩进低于列表内容列宽的行（含回到顶层的容器行）结束列表
			activeListColumns = 0;
		}

		const opener = matchFenceOpener(rest);
		if (opener) {
			flush();
			fence = { ...opener, owner: container ? prefix : "" };
			prevBlank = false;
			inIndentedCode = false;
			chunks.push(part);
			continue;
		}

		if (/^[\t ]*$/.test(rest)) {
			flush();
			chunks.push(part);
			prevBlank = true;
			inIndentedCode = false;
			continue;
		}

		// 缩进代码块与 autolink 不解析反斜杠转义，注入 \: 会破坏输出。
		// 容器内相对缩进 ≥4 列同样是缩进代码（如 blockquote 里的 ">     代码"）。
		// 缩进代码块可在容器结束时重新开始（blockquote 的代码行不允许惰性续行，
		// CommonMark Example 236）；但列表续行段落（顶层缩进 ≥ 列表内容列宽）
		// 不是缩进代码块。
		const topIndent = indentColumns(part);
		const isListContinuation =
			!container &&
			activeListColumns > 0 &&
			topIndent >= activeListColumns &&
			// 相对列表内容列宽 ≥4 列是列表内缩进代码，中间区间才是续行段落
			topIndent < activeListColumns + 4;
		const startsOrContinuesIndentedCode =
			prevBlank ||
			(inIndentedCode && container === indentedInContainer) ||
			// blockquote 结束后允许新的顶层缩进代码块
			(inIndentedCode &&
				indentedInContainer &&
				!container &&
				indentedOwner[0] === ">");
		if (
			INDENTED_CODE_LINE.test(rest) &&
			!isListContinuation &&
			startsOrContinuesIndentedCode
		) {
			flush();
			inIndentedCode = true;
			indentedInContainer = container;
			indentedOwner = container ? prefix : "";
			prevBlank = false;
			chunks.push(part);
			continue;
		}

		prevBlank = false;
		inIndentedCode = false;

		// 标题 / 主题分隔线自成一个块，行内片段不跨越块边界；
		// 块边界之后无需空行即可开始缩进代码块
		const isOwnBlock =
			/^#{1,6}(?:[\t ]|$)/.test(rest) ||
			/^(?:-{3,}|\*{3,}|_{3,})[\t ]*$/.test(rest);
		if (isOwnBlock) {
			flush();
			chunks.push(escapeOutsideInlineSpans(part));
			prevBlank = true;
			inIndentedCode = false;
			continue;
		}

		// blockquote / 列表行属于不同块，切换块时先冲刷缓冲
		const mode = container ? "container" : "text";
		if (bufferMode && bufferMode !== mode) flush();
		bufferMode = mode;
		buffer.push(part);
	}
	flush();
	return chunks.join("");
}

/**
 * remark 插件：包装解析器，在解析前转义数字比例冒号。
 * 必须注册在 remark-parse 可用之后（remarkPlugins 列表内即可）。
 *
 * @this {import('unified').Processor}
 */
export function remarkEscapeNumericColons() {
	const parser = this.parser;

	if (typeof parser !== "function") {
		throw new TypeError(
			"remarkEscapeNumericColons 需要在 Markdown 解析器配置完成之后注册。",
		);
	}

	this.parser = function parseWithEscapedNumericColons(source) {
		return parser(escapeNumericColons(String(source)));
	};
}
