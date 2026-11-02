import assert from "node:assert/strict";
import { test } from "node:test";

import {
	matchesNoReferrerDomain,
	parseMarkdownImageAlt,
} from "../../src/plugins/rehype-markdown-images.mjs";
import { siteMarkdownProcessor } from "../../src/utils/markdown-processor.mjs";

// unified() 返回配置型处理器，需经 createRenderer 取得真正的渲染器（与 Astro 构建期同一条插件链）
const renderer = await siteMarkdownProcessor.createRenderer({});

/**
 * 将 Markdown 处理为 HTML 字符串。
 *
 * @param {string} markdown Markdown 源码。
 * @returns {Promise<string>}
 */
async function render(markdown) {
	const { code } = await renderer.render(markdown);
	return code;
}

const IMAGE = "/images/albums/AcgExample/01.webp";

test("parses the w-N% width token out of alt text", () => {
	assert.deepEqual(parseMarkdownImageAlt("A demo image w-50%"), {
		alt: "A demo image",
		width: 50,
	});
	assert.deepEqual(parseMarkdownImageAlt("w-100% full width"), {
		alt: "full width",
		width: 100,
	});
	// 越界与非法令牌保留在 alt 中
	assert.deepEqual(parseMarkdownImageAlt("too wide w-150%"), {
		alt: "too wide w-150%",
		width: undefined,
	});
	assert.deepEqual(parseMarkdownImageAlt("not a token w-half%"), {
		alt: "not a token w-half%",
		width: undefined,
	});
	// 仅消费第一个合法令牌
	assert.deepEqual(parseMarkdownImageAlt("w-30% and w-40%"), {
		alt: "and w-40%",
		width: 30,
	});
});

test("wraps a standalone image with width token and title into a centered figure", async () => {
	const html = await render(`![A demo image w-50%](${IMAGE} "Demo caption")`);

	assert.match(html, /<figure class="markdown-image-figure">/);
	assert.match(html, /width: 50%; display: block; margin-inline: auto;/);
	assert.match(html, /alt="A demo image"/);
	assert.match(html, /loading="lazy"/);
	assert.match(html, /decoding="async"/);
	assert.match(html, /width="\d+"/);
	assert.match(html, /height="\d+"/);
	assert.match(
		html,
		/<figcaption class="markdown-image-caption">Demo caption<\/figcaption>/,
	);
	// 宽度令牌不应残留在 alt 中
	assert.doesNotMatch(html, /alt="[^"]*w-50%/);
});

test("title alone produces a caption without inline width", async () => {
	const html = await render(`![Alt text](${IMAGE} "Only caption")`);

	assert.match(html, /<figure class="markdown-image-figure">/);
	assert.match(
		html,
		/<figcaption class="markdown-image-caption">Only caption<\/figcaption>/,
	);
	assert.doesNotMatch(html, /width: \d+%;/);
});

test("width token alone produces a figure without caption", async () => {
	const html = await render(`![Narrow image w-30%](${IMAGE})`);

	assert.match(html, /<figure class="markdown-image-figure">/);
	assert.match(html, /width: 30%;/);
	assert.doesNotMatch(html, /markdown-image-caption/);
});

test("plain standalone images keep their layout and only gain lazy loading", async () => {
	const html = await render(`![Plain image](${IMAGE})`);

	assert.doesNotMatch(html, /markdown-image-figure/);
	assert.match(html, /loading="lazy"/);
	assert.match(html, /decoding="async"/);
});

test("invalid width tokens stay in alt text", async () => {
	const html = await render(`![Too wide w-150%](${IMAGE})`);

	assert.match(html, /alt="Too wide w-150%"/);
	assert.doesNotMatch(html, /markdown-image-figure/);
	assert.doesNotMatch(html, /width: 150%;/);
});

test("images inside :::grid galleries are not double enhanced", async () => {
	const html = await render(
		[":::grid", `![Grid image w-80%](${IMAGE} "Grid caption")`, ":::"].join(
			"\n",
		),
	);

	assert.match(html, /class="image-grid"/);
	assert.doesNotMatch(html, /markdown-image-figure/);
	assert.doesNotMatch(html, /width: 80%;/);
	// 网格内的图注仍由画廊自身的 figcaption 负责
	assert.match(html, /image-grid__caption/);
});

test("images mixed with inline text are never wrapped in figure", async () => {
	const html = await render(`Before ![Inline w-40%](${IMAGE}) after`);

	assert.doesNotMatch(html, /markdown-image-figure/);
	assert.match(html, /width: 40%;/);
});

test("renders each image on its own line between paragraphs and in tight lists", async () => {
	const result = await renderer.render(
		[
			`2. First step\n   ![First w-100%](${IMAGE} "First caption")\n3. Next step`,
			"",
			`Before\n![Second w-100%](${IMAGE} "Second caption")\n![Third](${IMAGE} "Third caption")\nAfter`,
		].join("\n"),
	);
	assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"image-presentation",
	]);
	assert.equal(
		(result.code.match(/class="markdown-image-caption"/g) ?? []).length,
		3,
	);
	assert.match(
		result.code,
		/<li>First step\s*<figure class="markdown-image-figure">/,
	);
	assert.match(result.code, /<p>Before\s*<\/p>\s*<figure/);
	assert.match(
		result.code,
		/Third caption<\/figcaption><\/figure>\s*<p>\s*After<\/p>/,
	);
	assert.doesNotMatch(result.code, /<p>\s*<figure/);
});

test("inline images do not acquire captions or presentation styles", async () => {
	const result = await renderer.render(
		`Before ![Inline](${IMAGE} "Not a caption") after`,
	);
	assert.doesNotMatch(result.code, /markdown-image-figure/);
	assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes.syntaxes, []);

	const adjacent = await renderer.render(
		`![First](${IMAGE} "First") ![Second](${IMAGE} "Second")`,
	);
	assert.doesNotMatch(adjacent.code, /markdown-image-figure/);
	assert.deepEqual(adjacent.metadata.frontmatter.markdownSyntaxes.syntaxes, []);
});

test("enhances raw HTML images with the shared rules", async () => {
	const html = await render(
		'<img src="https://i0.hdslb.com/demo.webp" alt="Raw image w-60%" title="Raw caption" class="existing-image" data-credit="Author">',
	);

	assert.match(html, /<figure class="markdown-image-figure">/);
	assert.match(html, /class="existing-image"/);
	assert.match(html, /data-credit="Author"/);
	assert.match(html, /alt="Raw image"/);
	assert.match(html, /width: 60%;/);
	assert.match(html, /loading="lazy"/);
	assert.match(html, /decoding="async"/);
	assert.match(html, /referrerpolicy="no-referrer"/);
	assert.match(
		html,
		/<figcaption class="markdown-image-caption">Raw caption<\/figcaption>/,
	);
});

test("raw gallery images keep their structure while receiving transport attributes", async () => {
	const html = await render(
		'<div class="image-grid"><img src="https://i0.hdslb.com/grid.webp" alt="Grid w-50%" title="Owned by gallery"></div>',
	);

	assert.match(html, /class="image-grid"/);
	assert.match(html, /alt="Grid w-50%"/);
	assert.match(html, /loading="lazy"/);
	assert.match(html, /decoding="async"/);
	assert.match(html, /referrerpolicy="no-referrer"/);
	assert.doesNotMatch(html, /markdown-image-figure/);
	assert.doesNotMatch(html, /width: 50%;/);
});

test("matches only configured HTTP image host patterns", () => {
	assert.equal(
		matchesNoReferrerDomain("https://i0.hdslb.com/a.webp", ["*.hdslb.com"]),
		true,
	);
	assert.equal(
		matchesNoReferrerDomain("https://hdslb.com/a.webp", ["*.hdslb.com"]),
		false,
	);
	assert.equal(matchesNoReferrerDomain("/local.webp", ["*"]), false);
	assert.equal(matchesNoReferrerDomain("not a url", ["*"]), false);
});
