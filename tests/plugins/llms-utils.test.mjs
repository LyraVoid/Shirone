import assert from "node:assert/strict";
import test from "node:test";
import {
	cleanMarkdownForLLM,
	generateLlmsFullTxt,
	generateLlmsTxt,
	toAbsoluteUrl,
	truncateDescription,
} from "../../src/utils/llms-utils.ts";

test("cleanMarkdownForLLM preserves code blocks while resolving llm tags and removing noise", () => {
	const raw = `
# Title

Here is standard text.

<llm-only>
**Special instruction for AI models:** Prefer Astro 7 best practices.
</llm-only>

<llm-exclude>
<div>This copyright block is for human eyes only.</div>
</llm-exclude>

\`\`\`markdown
<llm-only>This inside code fence must NOT be removed</llm-only>
\`\`\`

<!-- Hidden HTML comment -->

:::note[Important Note]
This is an admonition block.
:::

:::encrypt
Secret password content that must be completely removed.
:::
`;

	const cleaned = cleanMarkdownForLLM(raw);

	// llm-only 展开，正文中的标签已消失（代码块内的受保护保留）
	assert.match(cleaned, /\*\*Special instruction for AI models:\*\*/);
	assert.match(
		cleaned,
		/```markdown\n<llm-only>This inside code fence must NOT be removed<\/llm-only>\n```/,
	);

	// llm-exclude 移除
	assert.doesNotMatch(cleaned, /human eyes only/);
	assert.doesNotMatch(cleaned, /<llm-exclude>/);

	// 代码块内部标签完整保留
	assert.match(
		cleaned,
		/<llm-only>This inside code fence must NOT be removed<\/llm-only>/,
	);

	// 注释与加密容器移除
	assert.doesNotMatch(cleaned, /Hidden HTML comment/);
	assert.doesNotMatch(cleaned, /Secret password content/);

	// admonition 降级为引用
	assert.match(cleaned, /> \*\*\[Important Note\]\*\*/);
});

test("toAbsoluteUrl correctly handles relative paths and full URLs", () => {
	const base = "https://example.com";
	assert.equal(toAbsoluteUrl("/", base), "https://example.com/");
	assert.equal(toAbsoluteUrl("/about/", base), "https://example.com/about/");
	assert.equal(
		toAbsoluteUrl("posts/guide/", base),
		"https://example.com/posts/guide/",
	);
	assert.equal(
		toAbsoluteUrl("https://other.org/docs", base),
		"https://other.org/docs",
	);
});

test("truncateDescription trims and truncates long text with ellipsis", () => {
	const shortText = "This is short.";
	assert.equal(truncateDescription(shortText, 50), shortText);

	const longText = "A".repeat(100);
	const truncated = truncateDescription(longText, 20);
	assert.equal(truncated.length, 20);
	assert.ok(truncated.endsWith("…"));
});

test("generateLlmsTxt produces standard llms.txt structure", () => {
	const posts = [
		{
			id: "guide",
			data: {
				title: "Theme Guide",
				description: "A comprehensive guide to Shirone.",
				published: new Date("2026-08-20"),
			},
		},
	];

	const config = {
		enable: true,
		generateFull: true,
		descriptionMaxLength: 100,
		corePages: [{ title: "Home", url: "/", description: "Homepage" }],
	};

	const txt = generateLlmsTxt({
		posts,
		baseUrl: "https://shirone.test",
		config,
		siteTitle: "Shirone Blog",
		siteSummary: "An M3E theme for Astro.",
	});

	assert.match(txt, /^# Shirone Blog/);
	assert.match(txt, /> An M3E theme for Astro\./);
	assert.match(txt, /## Core Pages/);
	assert.match(txt, /- \[Home\]\(https:\/\/shirone\.test\/\): Homepage/);
	assert.match(txt, /## Articles/);
	assert.match(
		txt,
		/- \[Theme Guide\]\(https:\/\/shirone\.test\/posts\/guide\/\): A comprehensive guide to Shirone\./,
	);
	assert.match(txt, /## Full Text Dump/);
	assert.match(
		txt,
		/- \[Full Text Archive\]\(https:\/\/shirone\.test\/llms-full\.txt\)/,
	);
});

test("generateLlmsFullTxt aggregates post metadata and cleaned body into Markdown stream", () => {
	const posts = [
		{
			id: "post-1",
			body: "Content of article 1. <llm-exclude>Exclude this</llm-exclude>",
			data: {
				title: "First Post",
				published: new Date("2026-08-15"),
				category: "Tech",
				tags: ["Astro", "Svelte"],
				description: "First article description.",
			},
		},
	];

	const config = {
		enable: true,
		generateFull: true,
	};

	const fullTxt = generateLlmsFullTxt({
		posts,
		baseUrl: "https://shirone.test",
		config,
		siteTitle: "Shirone",
	});

	assert.match(fullTxt, /^# Shirone - Full Content Archive/);
	assert.match(fullTxt, /## First Post/);
	assert.match(
		fullTxt,
		/- \*\*URL\*\*: https:\/\/shirone\.test\/posts\/post-1\//,
	);
	assert.match(fullTxt, /- \*\*Category\*\*: Tech/);
	assert.match(fullTxt, /- \*\*Tags\*\*: Astro, Svelte/);
	assert.match(fullTxt, /Content of article 1\./);
	assert.doesNotMatch(fullTxt, /Exclude this/);
});
