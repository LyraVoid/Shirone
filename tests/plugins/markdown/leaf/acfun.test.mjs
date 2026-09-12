import assert from "node:assert/strict";
import { test } from "node:test";

import { siteMarkdownProcessor } from "../../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});

async function render(markdown) {
	return renderer.render(markdown);
}

test("renders an AcFun facade without a provider iframe", async () => {
	const result = await render(
		'::acfun{acid="ac48649632" title="Example video"}',
	);

	assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: ["acfun"],
	});
	assert.match(result.code, /data-acfun=""/);
	assert.match(result.code, /data-acfun-acid="ac48649632"/);
	assert.match(result.code, /aria-label="Example video"/);
	assert.match(result.code, /href="https:\/\/www\.acfun\.cn\/v\/ac48649632"/);
	assert.match(result.code, /rel="noopener noreferrer"/);
	assert.doesNotMatch(result.code, /<iframe|acfun\.cn\/player|<script/);
});

test("rejects malformed AcFun fields without producing a facade", async () => {
	for (const markdown of [
		'::acfun{acid="https://www.acfun.cn/v/ac48649632" title="URL input"}',
		'::acfun{acid="ac0" title="Invalid ID"}',
		'::acfun{acid="ac48649632" title=""}',
		'::acfun{acid="ac48649632" title="Invalid preload" preload="eager"}',
	]) {
		const result = await render(markdown);
		assert.doesNotMatch(result.code, /data-acfun/);
		assert.match(result.code, /::acfun/);
		assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes.syntaxes, []);
	}
});

test("ignores the removed poster attribute", async () => {
	const result = await render(
		'::acfun{acid="ac48649632" title="Video" poster="/images/poster.webp"}',
	);
	assert.match(result.code, /data-acfun/);
	assert.doesNotMatch(result.code, /poster|m3-acfun__poster/);
});

test("accepts viewport-aware preloading", async () => {
	const result = await render(
		'::acfun{acid="ac48649632" title="Prepared video" preload="auto"}',
	);
	assert.match(result.code, /data-video-preload="auto"/);
});
