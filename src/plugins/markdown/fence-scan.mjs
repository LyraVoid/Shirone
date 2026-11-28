/**
 * Markdown 源码扫描辅助：容器前缀剥离与代码围栏识别。
 * 供 remark-fields、remark-escape-numeric-colons 与 remark-includes 共用。
 */

/** 计算前导空白占用的列数（tab 展开到下一个 4 列制表位，遵循 CommonMark） */
export function indentColumns(text) {
	let columns = 0;
	for (const ch of text) {
		if (ch === "\t") columns += 4 - (columns % 4);
		else if (ch === " ") columns += 1;
		else break;
	}
	return columns;
}

/**
 * 剥离行首的 Markdown 容器前缀（blockquote `>` 与列表标记），保留原样返回。
 * 列表标记后仅消耗 1 个空白字符：多余缩进属于容器内容（如列表内缩进代码），
 * 不能被当作容器前缀吞掉。返回 { prefix, rest, container }；
 * container 表示行首确实存在 blockquote / 列表标记。
 */
export function splitContainerPrefix(line) {
	let index = 0;
	let container = false;
	let list = false;
	for (;;) {
		const indent = /^[\t ]*/.exec(line.slice(index))[0];
		const columns = indentColumns(indent);
		if (columns > 3) break;
		index += indent.length;
		const rest = line.slice(index);
		if (rest.startsWith(">")) {
			// blockquote 标记，后随至多一个空格 / tab
			index += 1;
			container = true;
			if (line[index] === " " || line[index] === "\t") index += 1;
			continue;
		}
		const listMarker = rest.match(/^([-*+]|\d{1,9}[.)])[\t ]/);
		if (listMarker) {
			// 仅消耗标记 + 1 个必需空白；其余缩进是容器内容
			index += listMarker[0].length;
			container = true;
			list = true;
			continue;
		}
		break;
	}
	return {
		prefix: line.slice(0, index),
		rest: line.slice(index),
		container,
		list,
	};
}

const FENCE_MARKER = /^([\t ]*)(`{3,}|~{3,})(.*)$/;

/**
 * 判断容器内容是否打开代码围栏。
 * 缩进须 ≤3 列；反引号围栏的 info string 不允许包含反引号（否则是行内代码）。
 * 返回 { character, length } 或 null。
 */
export function matchFenceOpener(rest) {
	const match = rest.match(FENCE_MARKER);
	if (!match || indentColumns(match[1]) > 3) return null;
	const marker = match[2];
	const info = match[3];
	if (marker[0] === "`" && info.includes("`")) return null;
	return { character: marker[0], length: marker.length };
}

/** 判断容器内容是否闭合当前围栏（同字符、长度不小于开栏、缩进 ≤3 列） */
export function matchFenceCloser(rest, fence) {
	const match = rest.match(/^([\t ]*)(`{3,}|~{3,})[\t ]*$/);
	if (!match || indentColumns(match[1]) > 3) return false;
	const marker = match[2];
	return marker[0] === fence.character && marker.length >= fence.length;
}

/**
 * 计算任意文本占用的列数（非空白字符各占 1 列，tab 展开遵循 CommonMark），
 * 用于得出容器前缀之后的内容列位置。
 */
export function columnsOf(text) {
	let columns = 0;
	for (const ch of text) {
		columns += ch === "\t" ? 4 - (columns % 4) : 1;
	}
	return columns;
}

/** 从行首剥离指定列数的空白，返回剥离的字符数。 */
function stripWhitespaceColumns(line, columns) {
	let used = 0;
	let index = 0;
	while (index < line.length && used < columns) {
		const ch = line[index];
		if (ch === "\t") used += 4 - (used % 4);
		else if (ch === " ") used += 1;
		else break;
		index += 1;
	}
	return index;
}

/**
 * 对整行判断是否闭合围栏。
 * 围栏内容是字面文本：只有属于开栏容器的前缀才会被剥离；
 * 无容器归属的围栏不接受 `>` / 列表标记开头的行作为闭栏。
 */
export function matchFenceCloserLine(line, fence) {
	if (!fence.owner) return matchFenceCloser(line, fence);
	if (line.startsWith(fence.owner))
		return matchFenceCloser(line.slice(fence.owner.length), fence);
	// 容器内容的缩进续行：只剥离容器内容列宽的空白，
	// 剩余缩进交由 matchFenceCloser 判定（>3 列即仍是围栏内容）
	const contentColumns = columnsOf(fence.owner);
	const lead = /^[\t ]*/.exec(line)[0];
	if (indentColumns(lead) < contentColumns) return false;
	return matchFenceCloser(
		line.slice(stripWhitespaceColumns(line, contentColumns)),
		fence,
	);
}
