import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { scanLocalDirectory } from "../../../../src/plugins/markdown/code/remark-code-tree.mjs";
import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";

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
