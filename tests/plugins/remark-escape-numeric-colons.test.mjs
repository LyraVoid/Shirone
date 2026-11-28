import assert from "node:assert/strict";
import { test } from "node:test";

import {
	escapeNumericColons,
	remarkEscapeNumericColons,
} from "../../src/plugins/remark-escape-numeric-colons.mjs";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

// unified() 返回配置型处理器，需经 createRenderer 取得真正的渲染器（与 Astro 构建期同一条插件链）
const renderer = await siteMarkdownProcessor.createRenderer({});

test("escapes numeric ratio colons in plain text", () => {
	assert.equal(
		escapeNumericColons("photos in 3:4 and 16:9 formats"),
		"photos in 3\\:4 and 16\\:9 formats",
	);
});

test("leaves non-numeric colons untouched", () => {
	const source = "time 10:o5 and a:b and http://example.com";
	assert.equal(escapeNumericColons(source), source);
	assert.equal(escapeNumericColons("note: 5"), "note: 5");
});

test("protects inline code spans", () => {
	assert.equal(
		escapeNumericColons("use `3:4` but 16:9 outside"),
		"use `3:4` but 16\\:9 outside",
	);
});

test("protects fenced code blocks", () => {
	const source = ["```md", "keep 3:4 as is", "```", "", "text 3:4 here"].join(
		"\n",
	);
	assert.equal(
		escapeNumericColons(source),
		["```md", "keep 3:4 as is", "```", "", "text 3\\:4 here"].join("\n"),
	);

	const tildeSource = ["~~~", "4:5", "~~~", "6:7"].join("\n");
	assert.equal(
		escapeNumericColons(tildeSource),
		["~~~", "4:5", "~~~", "6\\:7"].join("\n"),
	);
});

test("ratio text survives the full Markdown pipeline", async () => {
	const { code } = await renderer.render(
		"Aspect ratios like 3:4 and 16:9 stay readable.",
	);
	assert.match(code, /3:4/);
	assert.match(code, /16:9/);
	assert.doesNotMatch(code, /\\:/);
});

test("throws a helpful error when no parser is configured", () => {
	assert.throws(
		() => remarkEscapeNumericColons.call({}),
		/Markdown 解析器配置完成/,
	);
});

test("longer fence is not closed by a shorter marker (F-18)", () => {
	const source = [
		"````md",
		"4:5 stays",
		"```",
		"6:7 stays too",
		"````",
		"",
		"7:8 escapes",
	].join("\n");
	assert.equal(
		escapeNumericColons(source),
		[
			"````md",
			"4:5 stays",
			"```",
			"6:7 stays too",
			"````",
			"",
			"7\\:8 escapes",
		].join("\n"),
	);
});

test("keeps indented code blocks verbatim (F-111)", () => {
	const source = ["paragraph", "", "    code 12:30 here", "", "text 16:9"].join(
		"\n",
	);
	assert.equal(
		escapeNumericColons(source),
		["paragraph", "", "    code 12:30 here", "", "text 16\\:9"].join("\n"),
	);
});

test("keeps autolink urls verbatim (F-111)", () => {
	const source = "dev server at <http://127.0.0.1:8080> and text 16:9";
	assert.equal(
		escapeNumericColons(source),
		"dev server at <http://127.0.0.1:8080> and text 16\\:9",
	);
});

test("escapes continuation lines of a paragraph normally (F-111)", () => {
	const source = ["- item one", "      continued 3:4 ratio"].join("\n");
	assert.equal(
		escapeNumericColons(source),
		["- item one", "      continued 3\\:4 ratio"].join("\n"),
	);
});

test("matches inline-code delimiters by equal length (review: remark-escape-numeric-colons.mjs:15)", () => {
	assert.equal(
		escapeNumericColons("x 16:9 use ``a`3:4`b`` y 2:1"),
		"x 16\\:9 use ``a`3:4`b`` y 2\\:1",
	);
});

test("protects inline-code spans across line endings (review: remark-escape-numeric-colons.mjs:41)", () => {
	assert.equal(
		escapeNumericColons("use `first\n3:4` outside 5:6"),
		"use `first\n3:4` outside 5\\:6",
	);
});

test("allows indented code right after a closed fence (review: remark-escape-numeric-colons.mjs:52)", () => {
	assert.equal(
		escapeNumericColons("~~~\ncode\n~~~\n    12:30"),
		"~~~\ncode\n~~~\n    12:30",
	);
});

test("protects fenced code inside blockquote containers (review: remark-escape-numeric-colons.mjs:57)", () => {
	assert.equal(
		escapeNumericColons("> ```\n> 3:4\n> ```\n\nafter 5:6"),
		"> ```\n> 3:4\n> ```\n\nafter 5\\:6",
	);
});

test("protects fenced code inside list containers", () => {
	assert.equal(
		escapeNumericColons("- ~~~\n  3:4\n  ~~~\n\nafter 5:6"),
		"- ~~~\n  3:4\n  ~~~\n\nafter 5\\:6",
	);
});

test("keeps blockquote markers literal inside a top-level fence (review round 2)", () => {
	assert.equal(
		escapeNumericColons("~~~\n> ~~~\n field example\n3:4\n~~~\n\nafter 5:6"),
		"~~~\n> ~~~\n field example\n3:4\n~~~\n\nafter 5\\:6",
	);
});

test("escapes colons after a list line with significant content indentation (review round 2)", () => {
	assert.equal(
		escapeNumericColons("-     ~~~\n     3:4\n\nafter 5:6"),
		"-     ~~~\n     3\\:4\n\nafter 5\\:6",
	);
});

test("does not match inline spans across Markdown blocks (review round 2)", () => {
	assert.equal(
		escapeNumericColons("prefix `open\n# ratio 3:4\nclose` and 5:6"),
		"prefix `open\n# ratio 3\\:4\nclose` and 5\\:6",
	);
});

test("closes an indented top-level fence with an unindented closer (review round 3)", () => {
	assert.equal(
		escapeNumericColons("  ~~~\ncode\n~~~\n\nafter 5:6"),
		"  ~~~\ncode\n~~~\n\nafter 5\\:6",
	);
});

test("keeps an over-indented line inside a list fence as fence content (review round 3)", () => {
	assert.equal(
		escapeNumericColons("- ~~~\n      ~~~\n  3:4\n  ~~~\n\nafter 5:6"),
		"- ~~~\n      ~~~\n  3:4\n  ~~~\n\nafter 5\\:6",
	);
});

test("preserves indented code inside a blockquote (review round 3)", () => {
	assert.equal(
		escapeNumericColons(">     12:30\n\nafter 3:4"),
		">     12:30\n\nafter 3\\:4",
	);
});

test("allows indented code directly after a heading (review round 3)", () => {
	assert.equal(
		escapeNumericColons("# 3:4\n    12:30\n\nafter 5:6"),
		"# 3\\:4\n    12:30\n\nafter 5\\:6",
	);
});

test("allows a new top-level indented code block when the blockquote ends (review round 4)", () => {
	assert.equal(
		escapeNumericColons(">     12:30\n    3:4"),
		">     12:30\n    3:4",
	);
});

test("escapes list continuation paragraphs after a heading inside a list (review round 4)", () => {
	assert.equal(
		escapeNumericColons("- # heading\n    ratio 3:4"),
		"- # heading\n    ratio 3\\:4",
	);
});

test("still protects top-level indented code after a heading when no list is active (review round 4)", () => {
	assert.equal(
		escapeNumericColons("- item\n\n# heading\n    12:30\n\nafter 5:6"),
		"- item\n\n# heading\n    12:30\n\nafter 5\\:6",
	);
});

test("clears list state when a dedented container ends the list (review round 5)", () => {
	assert.equal(
		escapeNumericColons("- item\n\n> quote\n\n    3:4"),
		"- item\n\n> quote\n\n    3:4",
	);
});

test("preserves indented code inside an active list (review round 5)", () => {
	assert.equal(
		escapeNumericColons("- item\n\n      12:30"),
		"- item\n\n      12:30",
	);
});

test("still escapes list continuation paragraphs within the content column range (review round 5)", () => {
	assert.equal(
		escapeNumericColons("- item\n      continued 3:4"),
		"- item\n      continued 3\\:4",
	);
});
