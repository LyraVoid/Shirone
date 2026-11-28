import assert from "node:assert/strict";
import { test } from "node:test";

import { rewriteOptionGroups } from "../../../../src/plugins/markdown/remark-option-groups.mjs";
import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});

async function render(markdown) {
	const { code } = await renderer.render(markdown);
	return code;
}

test("renders rich option titles, explicit values, and an active item", async () => {
	const html = await render(`::: tabs#runtime

@tab Node.js#node

Use the supported runtime.

@tab:active **Bun**#bun

- Install Bun.
- Run the project.

:::`);

	assert.match(html, /class="m3-option-group not-prose"/);
	assert.match(html, /data-sync-key="runtime"/);
	assert.equal(html.match(/role="tab"/g)?.length, 2);
	assert.equal(html.match(/role="tabpanel"/g)?.length, 2);
	assert.match(html, /aria-selected="true"[^>]*data-option-value="bun"/);
	assert.match(html, /<strong>Bun<\/strong>/);
	assert.match(html, /<ul>/);
	assert.doesNotMatch(html, /@tab/);
});

test("keeps every SSR panel readable before enhancement", async () => {
	const html = await render(`:::tabs

@tab First

First body.

@tab Second

Second body.

:::`);

	assert.doesNotMatch(html, / hidden(?:=|>)/);
	assert.match(html, /m3-option-group__panel-title">First<\/div>/);
	assert.match(html, /m3-option-group__panel-title">Second<\/div>/);
	assert.match(html, /First body/);
	assert.match(html, /Second body/);
});

test("assigns unique ids and complete ARIA relationships", async () => {
	const html = await render(`:::tabs

@tab One

First.

@tab Two

Second.

:::

:::tabs

@tab Alpha

Alpha body.

@tab Beta

Beta body.

:::`);

	assert.match(
		html,
		/id="shirone-options-1-tab-1"[^>]*aria-controls="shirone-options-1-panel-1"/,
	);
	assert.match(
		html,
		/id="shirone-options-2-panel-2"[^>]*aria-labelledby="shirone-options-2-tab-2"/,
	);
});

test("preserves invalid structures as ordinary Markdown", async () => {
	const html = await render(`:::tabs

Introductory paragraph.

@tab Only option

Only body.

:::`);

	assert.doesNotMatch(html, /m3-option-group/);
	assert.match(html, /Introductory paragraph/);
	assert.match(html, /@tab Only option/);
});

test("rejects duplicate option values so synchronization stays deterministic", async () => {
	const html = await render(`:::tabs

@tab First#shared

First body.

@tab Second#shared

Second body.

:::`);

	assert.doesNotMatch(html, /m3-option-group/);
	assert.match(html, /@tab First#shared/);
});

test("does not rewrite fenced examples and escapes active markers only in groups", () => {
	const source = `\`\`\`markdown
::: tabs#docs
@tab:active Example
:::
\`\`\`

@tab:active Outside

::: tabs#actual
@tab:active Inside
:::`;
	const output = rewriteOptionGroups(source);

	assert.match(output, /::: tabs#docs\n@tab:active Example/);
	assert.match(output, /@tab:active Outside/);
	assert.match(output, /:::tabs\{sync="actual"\}/);
	assert.match(output, /@tab\\:active Inside/);
});

test("keeps tabs whose title ends with a lone hash (F-113)", async () => {
	const html = await render(`:::tabs

@tab C#

C language notes.

@tab Normal

Normal tab.

:::`);

	assert.match(html, /class="m3-option-group not-prose"/);
	assert.match(html, /panel-title">C#/);
});

test("keeps a hash value suffix preceded by whitespace in the title (F-113)", async () => {
	const html = await render(`:::tabs

@tab Issue #5

Issue notes.

@tab Normal

Normal tab.

:::`);

	assert.match(html, /panel-title">Issue #5/);
});

test("still splits unspaced hash value suffixes for sync (F-113)", async () => {
	const html = await render(`:::tabs#runtime

@tab Bun#bun

Install Bun.

@tab Node.js#node

Use Node.

:::`);

	assert.match(html, /data-option-value="bun"/);
	assert.match(html, /data-option-value="node"/);
	assert.doesNotMatch(html, /panel-title">Bun#bun/);
});
