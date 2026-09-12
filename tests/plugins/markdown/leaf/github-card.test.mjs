import assert from "node:assert/strict";
import { test } from "node:test";

import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});

async function render(markdown) {
	const { code } = await renderer.render(markdown);
	return code;
}

test("renders a validated GitHub repository card with an SSR link", async () => {
	const html = await render('::github{repo="LyraVoid/Shirone"}');

	assert.match(
		html,
		/<a[^>]+class="card-github fetch-waiting m3-state-layer not-prose"/,
	);
	assert.match(html, /data-github-card=""/);
	assert.match(html, /data-github-repo="LyraVoid\/Shirone"/);
	assert.match(html, /href="https:\/\/github.com\/LyraVoid\/Shirone"/);
	assert.match(html, /rel="noopener noreferrer"/);
});

test("rejects invalid repositories without producing a card", async () => {
	const html = await render('::github{repo="not-a-repository"}');

	assert.doesNotMatch(html, /data-github-card/);
});
