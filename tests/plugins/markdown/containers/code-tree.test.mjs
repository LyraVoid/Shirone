import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CodeTreeComponent } from "../../../../src/plugins/markdown/containers/rehype-code-tree.mjs";
import { scanLocalDirectory } from "../../../../src/plugins/markdown/code/remark-code-tree.mjs";
import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";
import { h } from "hastscript";

const renderer = await siteMarkdownProcessor.createRenderer({});

async function render(markdown) {
	const { code } = await renderer.render(markdown);
	return code;
}

test("renders code tree container directive with foldable directory disclosures and code panels", async () => {
	const html =
		await render(`:::code-tree{title="Shirone Component Demo" height="420px" entry="src/Button.svelte"}
\`\`\`svelte title="src/Button.svelte"
<script lang="ts">
  let { label = "Click" } = $props();
</script>
<button class="m3-btn">{label}</button>
\`\`\`

\`\`\`stylus title="src/styles/button.styl"
.m3-btn
  background: var(--primary)
\`\`\`

\`\`\`json title="package.json"
{
  "name": "button-demo"
}
\`\`\`
:::`);

	assert.match(html, /class="m3-code-tree not-prose"/);
	assert.match(html, /style="--code-tree-height: 420px;"/);
	assert.match(html, /aria-label="Shirone Component Demo"/);
	assert.match(html, /class="m3-code-tree__header"/);
	assert.match(html, /class="m3-code-tree__header-icon"/);
	assert.match(html, />Shirone Component Demo<\/span>/);
	assert.match(html, /class="m3-code-tree__nav"/);
	assert.match(html, /class="m3-code-tree__tree-root" role="tree"/);

	// Directory disclosures
	assert.match(
		html,
		/<details class="m3-disclosure m3-code-tree__disclosure" open/,
	);
	assert.match(
		html,
		/<summary class="m3-disclosure__summary m3-code-tree__dir-label">/,
	);
	assert.match(html, /class="m3-disclosure__indicator"/);
	assert.match(html, /m3-file-tree__disclosure-icon/);
	assert.match(html, /class="m3-code-tree__sub-tree" role="group"/);

	// File buttons and spacer
	assert.match(html, /role="treeitem"/);
	assert.match(
		html,
		/class="m3-disclosure__indicator m3-disclosure__indicator--spacer"/,
	);
	assert.match(html, /data-file-target="src\/Button.svelte"/);
	assert.match(
		html,
		/class="m3-code-tree__file-btn m3-code-tree__file-btn--active"/,
	);
	assert.match(html, /aria-selected="true"/);
	assert.match(html, /data-file-target="src\/styles\/button.styl"/);
	assert.match(html, /aria-selected="false"/);

	// Panels
	assert.match(html, /class="m3-code-tree__content"/);
	assert.match(
		html,
		/class="m3-code-tree__panel" data-file-path="src\/Button.svelte"/,
	);
	assert.match(
		html,
		/class="m3-code-tree__panel hidden" data-file-path="src\/styles\/button.styl" hidden/,
	);
	assert.match(html, /<svg[^>]+aria-hidden="true"[^>]*>/);
	assert.doesNotMatch(html, /https?:\/\//);
	assert.doesNotMatch(html, /<script|<iframe/);
});

test("supports explicit active marker on code block", async () => {
	const html = await render(`:::code-tree{title="Active test"}
\`\`\`ts title="src/index.ts"
console.log("index");
\`\`\`

\`\`\`ts title="src/active.ts" :active
console.log("active");
\`\`\`
:::`);

	assert.match(
		html,
		/aria-selected="true"[^>]*><button[^>]+data-file-target="src\/active.ts"/,
	);
	assert.match(
		html,
		/aria-selected="false"[^>]*><button[^>]+data-file-target="src\/index.ts"/,
	);
});

test("supports simple monochrome icon mode", async () => {
	const html =
		await render(`:::code-tree{title="Simple Icon Demo" icon="simple"}
\`\`\`ts title="src/main.ts"
export const value = 42;
\`\`\`
:::`);

	assert.match(html, /data-icon-mode="simple"/);
	assert.match(html, />main.ts<\/span>/);
});

test("auto-imports local directory with @[code-tree] syntax", async () => {
	const html = await render(
		`@[code-tree title="Config files" entry="siteConfig.ts"](/src/config)`,
	);

	assert.match(html, /class="m3-code-tree not-prose"/);
	assert.match(html, />Config files<\/span>/);
	assert.match(html, /data-file-target="siteConfig.ts"/);
	assert.match(html, /data-file-path="siteConfig.ts"/);
});

test("reads local directory source as UTF-8 without corrupting non-ASCII text", () => {
	const rootDir = mkdtempSync(path.join(tmpdir(), "shirone-code-tree-"));

	try {
		writeFileSync(
			path.join(rootDir, "source.ts"),
			"// 站点统一 Markdown 插件链\nexport const label = '中文演示';\n",
			"utf8",
		);

		const files = scanLocalDirectory(".", rootDir);
		assert.equal(files.length, 1);
		assert.match(files[0].value, /站点统一 Markdown 插件链/);
		assert.match(files[0].value, /中文演示/);
		assert.doesNotMatch(files[0].value, /\?{3,}/);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

test("removes empty code tree container without generating broken DOM", async () => {
	const html = await render(":::code-tree\n:::");
	assert.equal(html.trim(), "");
});

const textOf = (node) =>
	node.type === "text"
		? node.value
		: node.type === "element"
			? node.children.map(textOf).join("")
			: "";

function collectNodes(node, out = []) {
	if (!node || typeof node !== "object") return out;
	out.push(node);
	if (Array.isArray(node.children)) {
		for (const child of node.children) collectNodes(child, out);
	}
	return out;
}

const LABELS = {
	"label-nav": "NAV",
	"label-content": "CONTENT",
	"label-expand": "EXP",
	"label-collapse": "COL",
	"label-default-title": "PROJ",
};

test("F-5: pairs panels with code children by data-file-index, not position", () => {
	const child = (index, filePath, text) =>
		h(
			"pre",
			{ "data-file-index": String(index), "data-file-path": filePath },
			[h("code", {}, text)],
		);
	const files = JSON.stringify([
		{ path: "src/a.ts", index: 0 },
		{ path: "src/b.ts", index: 1 },
	]);
	// children deliberately reversed relative to the declared files order
	const tree = CodeTreeComponent(
		{ files, ...LABELS },
		[child(1, "src/b.ts", "BBB"), child(0, "src/a.ts", "AAA")],
	);
	const panels = collectNodes(tree).filter((node) =>
		node.properties?.className?.includes("m3-code-tree__panel"),
	);
	assert.equal(panels.length, 2);
	const textFor = (path) =>
		textOf(panels.find((p) => p.properties.dataFilePath === path));
	assert.equal(textFor("src/a.ts"), "AAA");
	assert.equal(textFor("src/b.ts"), "BBB");
});

test("F-5: falls back to data-file-path pairing when a code child has no index", () => {
	const files = JSON.stringify([{ path: "src/only.ts", index: 0 }]);
	const tree = CodeTreeComponent(
		{ files, ...LABELS },
		[h("pre", { "data-file-path": "src/only.ts" }, [h("code", {}, "ONLY")])],
	);
	const panel = collectNodes(tree).find((node) =>
		node.properties?.className?.includes("m3-code-tree__panel"),
	);
	assert.equal(textOf(panel), "ONLY");
});

test("F-112: code tree aria labels come from i18n, no hardcoded Chinese", async () => {
	const html = await render(
		`:::code-tree\n\`\`\`ts title="src/a.ts"\nconst a = 1;\n\`\`\`\n:::`,
	);
	for (const label of ["文件导航", "代码内容", "放大代码树", "退出放大"]) {
		assert.ok(!html.includes(label), `hardcoded label leaked: ${label}`);
	}
	// default siteConfig.lang is "en"
	assert.match(html, /data-expand-label="Expand code tree"/);
	assert.match(html, /data-collapse-label="Collapse code tree"/);
	assert.match(html, /aria-label="File navigation"/);
	assert.match(html, /<span class="m3-code-tree__title">Project<\/span>/);
});
test("F-5: without attributes (real Astro pipeline), pre children pair positionally and prose is skipped", () => {
	const files = JSON.stringify([
		{ path: "src/a.ts", index: 0 },
		{ path: "src/b.ts", index: 1 },
	]);
	// Astro 的处理器把代码块渲染成无属性的 pre，容器里可能夹带散文段落
	const tree = CodeTreeComponent(
		{ files, ...LABELS },
		[
			h("p", {}, [h("text", {}, "intro prose")]),
			h("pre", {}, [h("code", {}, "AAA")]),
			h("pre", {}, [h("code", {}, "BBB")]),
		],
	);
	const panels = collectNodes(tree).filter((node) =>
		node.properties?.className?.includes("m3-code-tree__panel"),
	);
	assert.equal(panels.length, 2);
	const textFor = (path) =>
		textOf(panels.find((p) => p.properties.dataFilePath === path));
	assert.equal(textFor("src/a.ts"), "AAA");
	assert.equal(textFor("src/b.ts"), "BBB");
});
test("F-112: every locale defines the code tree label keys", () => {
	const dir = fileURLToPath(
		new URL("../../../../src/i18n/languages/", import.meta.url),
	);
	const keys = [
		"codeTreeFileNav",
		"codeTreeContent",
		"codeTreeExpand",
		"codeTreeCollapse",
		"codeTreeDefaultTitle",
	];
	for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
		const source = readFileSync(path.join(dir, file), "utf8");
		for (const key of keys) {
			assert.match(
				source,
				new RegExp(`\\[Key\\.${key}\\]:`),
				`${file} is missing ${key}`,
			);
		}
	}
});
