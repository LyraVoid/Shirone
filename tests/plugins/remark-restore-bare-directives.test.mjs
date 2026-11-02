import assert from "node:assert/strict";
import { test } from "node:test";

import { restoreBareDirectives } from "../../src/plugins/markdown/remark-restore-bare-directives.mjs";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

// unified() 返回配置型处理器，需经 createRenderer 取得真正的渲染器（与 Astro 构建期同一条插件链）
const renderer = await siteMarkdownProcessor.createRenderer({});

test("restores a bare inline directive to its original text", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "paragraph",
				children: [
					{ type: "text", value: "计划" },
					{ type: "textDirective", name: "无法歌唱", attributes: {}, children: [] },
				],
			},
		],
	};

	restoreBareDirectives(tree);

	assert.deepEqual(
		tree.children[0].children.map((child) => [child.type, child.value]),
		[
			["text", "计划"],
			["text", ":无法歌唱"],
		],
	);
});

test("keeps directives that carry content", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "paragraph",
				children: [
					{
						type: "textDirective",
						name: "spoiler",
						attributes: {},
						children: [{ type: "text", value: "42" }],
					},
				],
			},
		],
	};

	restoreBareDirectives(tree);

	assert.equal(tree.children[0].children[0].type, "textDirective");
});

test("renders a Chinese colon phrase as text through the full pipeline", async () => {
	const { code } = await renderer.render("今天看了《世界计划:无法歌唱的未来》。");

	assert.match(code, /《世界计划:无法歌唱的未来》/);
	assert.doesNotMatch(code, /<无法歌唱的未来>/);
});

test("renders an ascii colon phrase as text through the full pipeline", async () => {
	const { code } = await renderer.render("keys are a:b pairs");

	assert.match(code, /a:b/);
	assert.doesNotMatch(code, /<b><\/b>/);
});

test("inline directives with content still render", async () => {
	const { code } = await renderer.render("The answer is :spoiler[**42**].");

	assert.match(code, /spoiler/);
	assert.match(code, /<strong>42<\/strong>/);
});
