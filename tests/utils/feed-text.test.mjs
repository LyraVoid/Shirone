import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	escapeXml,
	renderFeedHtml,
	sanitizeMdxForFeed,
} from "../../src/utils/feed-text.mjs";

test("sanitizeMdxForFeed strips top-level MDX imports and components", () => {
	const mdx = [
		"import { MdxShowcase } from \"@components/mdx/MdxShowcase.astro\";",
		"",
		"text before",
		"",
		"<Card>label</Card>",
		"",
		"end",
	].join("\n");
	assert.equal(
		sanitizeMdxForFeed(mdx),
		["", "text before", "", "label", "", "end"].join("\n").trim(),
	);
});

test("sanitizeMdxForFeed keeps import statements inside fenced code", () => {
	const mdx = [
		"import { x } from \"y\";",
		"",
		"```ts",
		"import { z } from \"pkg\";",
		"export const demo = 1;",
		"```",
		"",
		"<Card>label</Card>",
	].join("\n");
	const cleaned = sanitizeMdxForFeed(mdx);
	assert.doesNotMatch(cleaned, /import \{ x \}/);
	assert.match(cleaned, /import \{ z \} from "pkg";/);
	assert.match(cleaned, /export const demo = 1;/);
});

test("renderFeedHtml renders through the site remark/rehype pipeline", async () => {
	const html = await renderFeedHtml(":::note\nImportant detail\n:::\n\nA 3:4 shot.");
	assert.doesNotMatch(html, /:::note/);
	assert.match(html, /<aside>/);
	assert.match(html, /Important detail/);
	assert.match(html, /3:4/);
});

test("rss.xml escapes the language attribute (F-49)", () => {
	const source = readFileSync(new URL("../../src/pages/rss.xml.ts", import.meta.url), "utf8");
	assert.match(
		source,
		/customData: `<language>\$\{escapeXml\(siteConfig\.lang\)\}<\/language>`/,
	);
});

test("sanitizeMdxForFeed recognizes CRLF closing fences (review round 2)", () => {
	const source = [
		'import A from "a";',
		"```js",
		'import B from "b";',
		"```",
		'import C from "c";',
	].join("\r\n");
	const result = sanitizeMdxForFeed(source);
	assert.match(result, /import B from "b";/);
	assert.doesNotMatch(result, /import [AC]/);
});

test("renderFeedHtml keeps fence-like lines from closing includes fences (review round 2)", async () => {
	const source = [
		"```html",
		"<!-- @include: package.json -->",
		"```not-a-close",
		"```",
	].join("\n");
	const html = await renderFeedHtml(source);
	assert.match(html, /@include: package\.json/);
	assert.doesNotMatch(html, /shirone/);
});

test("renderFeedHtml still expands ordinary includes outside fences (review round 2)", async () => {
	const html = await renderFeedHtml(
		"before\n\n<!-- @include: package.json -->\n\nafter",
	);
	assert.match(html, /shirone/);
	assert.doesNotMatch(html, /@include: package\.json/);
});
