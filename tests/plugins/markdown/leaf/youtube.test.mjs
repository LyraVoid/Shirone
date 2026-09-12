import assert from "node:assert/strict";
import { test } from "node:test";

import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});

async function render(markdown) {
	return renderer.render(markdown);
}

test("renders a YouTube facade without a provider iframe", async () => {
	const result = await render(
		'::youtube{id="5gIf0_xpFPI" title="Example video"}',
	);

	assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: ["youtube"],
	});
	assert.match(result.code, /data-youtube=""/);
	assert.match(result.code, /data-youtube-id="5gIf0_xpFPI"/);
	assert.match(result.code, /aria-label="Example video"/);
	assert.match(
		result.code,
		/href="https:\/\/www\.youtube\.com\/watch\?v=5gIf0_xpFPI"/,
	);
	assert.match(result.code, /rel="noopener noreferrer"/);
	assert.doesNotMatch(result.code, /<iframe|youtube-nocookie\.com|<script/);
});

test("rejects malformed YouTube fields without producing a facade", async () => {
	for (const markdown of [
		'::youtube{id="https://youtu.be/5gIf0_xpFPI" title="URL input"}',
		'::youtube{id="too-short" title="Invalid ID"}',
		'::youtube{id="5gIf0_xpFPI" title=""}',
		'::youtube{id="5gIf0_xpFPI" title="Invalid preload" preload="eager"}',
	]) {
		const result = await render(markdown);
		assert.doesNotMatch(result.code, /data-youtube/);
		assert.match(result.code, /::youtube/);
		assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes.syntaxes, []);
	}
});

test("ignores the removed poster attribute", async () => {
	const result = await render(
		'::youtube{id="5gIf0_xpFPI" title="Video" poster="/images/poster.webp"}',
	);
	assert.match(result.code, /data-youtube/);
	assert.doesNotMatch(result.code, /poster|m3-youtube__poster/);
});

test("accepts viewport-aware preloading", async () => {
	const result = await render(
		'::youtube{id="5gIf0_xpFPI" title="Prepared video" preload="auto"}',
	);
	assert.match(result.code, /data-video-preload="auto"/);
});
