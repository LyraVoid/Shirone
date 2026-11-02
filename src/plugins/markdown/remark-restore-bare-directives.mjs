/**
 * remark 插件：把「没有内容也没有属性」的行内指令还原成普通文本。
 *
 * `remark-directive` 会把任意 `:词` 序列解析成 textDirective，于是中文正文里的
 * 「计划:无法歌唱」被当作指令名渲染成 `<无法歌唱></无法歌唱>`，英文 `a:b` 同样受影响。
 * 可用的行内指令必须有方括号内容（`:spoiler[…]`）或属性（`{…}`），两者都缺失时
 * 没有可渲染对象，按原文还原为 `:名称`。
 */

/**
 * 递归还原没有内容也没有属性的行内指令。
 *
 * @param {import("mdast").Root} tree
 */
export function restoreBareDirectives(tree) {
	visit(tree);
}

function visit(node) {
	if (!node || !Array.isArray(node.children)) return;

	node.children = node.children.map((child) => {
		if (isBareTextDirective(child)) {
			return {
				type: "text",
				value: `:${child.name ?? ""}`,
				position: child.position,
			};
		}
		visit(child);
		return child;
	});
}

function isBareTextDirective(node) {
	if (!node || node.type !== "textDirective") return false;
	if ((node.children?.length ?? 0) > 0) return false;
	return Object.keys(node.attributes ?? {}).length === 0;
}

export function remarkRestoreBareDirectives() {
	return restoreBareDirectives;
}
