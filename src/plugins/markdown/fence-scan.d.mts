/** 计算前导空白占用的列数（tab 展开到下一个 4 列制表位，遵循 CommonMark） */
export declare function indentColumns(text: string): number;

/** columnsOf(text)：text 前导空白占用的列数（indentColumns 的别名） */
export declare const columnsOf: (text: string) => number;

/**
 * 剥离行首的 Markdown 容器前缀（blockquote `>` 与列表标记），保留原样返回。
 * 返回 { prefix, rest, container, list }。
 */
export declare function splitContainerPrefix(line: string): {
	prefix: string;
	rest: string;
	container: boolean;
	list: boolean;
};

/** 判断容器内容是否打开代码围栏；返回 { character, length } 或 null */
export declare function matchFenceOpener(
	rest: string,
): { character: string; length: number } | null;

/** 判断围栏内容行是否闭合指定围栏；返回 { character, length } 或 null */
export declare function matchFenceCloser(
	rest: string,
	fence: { character: string; length: number },
): { character: string; length: number } | null;

/** 整行级闭合判断（含容器前缀剥离），供逐行扫描使用 */
export declare function matchFenceCloserLine(
	line: string,
	fence: { character: string; length: number },
): boolean;
