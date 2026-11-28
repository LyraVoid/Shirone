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
	assert.match(cleaned, /```markdown\n<llm-only>This inside code fence must NOT be removed<\/llm-only>\n```/);

	// llm-exclude 移除
	assert.doesNotMatch(cleaned, /human eyes only/);
	assert.doesNotMatch(cleaned, /<llm-exclude>/);

	// 代码块内部标签完整保留
	assert.match(cleaned, /<llm-only>This inside code fence must NOT be removed<\/llm-only>/);

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
	assert.equal(toAbsoluteUrl("posts/guide/", base), "https://example.com/posts/guide/");
	assert.equal(toAbsoluteUrl("https://other.org/docs", base), "https://other.org/docs");
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
		corePages: [
			{ title: "Home", url: "/", description: "Homepage" },
		],
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
	assert.match(txt, /- \[Theme Guide\]\(https:\/\/shirone\.test\/posts\/guide\/\): A comprehensive guide to Shirone\./);
	assert.match(txt, /## Full Text Dump/);
	assert.match(txt, /- \[Full Text Archive\]\(https:\/\/shirone\.test\/llms-full\.txt\)/);
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
	assert.match(fullTxt, /- \*\*URL\*\*: https:\/\/shirone\.test\/posts\/post-1\//);
	assert.match(fullTxt, /- \*\*Category\*\*: Tech/);
	assert.match(fullTxt, /- \*\*Tags\*\*: Astro, Svelte/);
	assert.match(fullTxt, /Content of article 1\./);
	assert.doesNotMatch(fullTxt, /Exclude this/);
});

test("cleanMarkdownForLLM protects code fences with attribute info strings (F-107)", () => {
	const raw = [
		'```js title="demo"',
		"<llm-exclude>skip me</llm-exclude>",
		'console.log("kept");',
		"```",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(raw);
	assert.match(cleaned, /```js title="demo"/);
	// 围栏内的 <llm-exclude> 是代码示例，不是页面标签，必须原样保留
	assert.match(cleaned, /<llm-exclude>skip me<\/llm-exclude>/);
	assert.match(cleaned, /console\.log\("kept"\);/);
});

test("cleanMarkdownForLLM restores code blocks without dollar-pattern expansion (F-120)", () => {
	const raw = '```sh\nsed -e "s/a/$&/" -e "s/b/\\$1/"\n```';
	const cleaned = cleanMarkdownForLLM(raw);
	assert.match(cleaned, /s\/a\/\$&\/"/);
	assert.doesNotMatch(cleaned, /s\/a\/sed/);
});

test("rejects backticks in backtick-fence info strings (review round 2)", () => {
	const input = [
		"```literal```",
		"<llm-exclude>omit me</llm-exclude>",
		"```js",
		"<llm-exclude>keep this code example</llm-exclude>",
		"kept()",
		"```",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.doesNotMatch(cleaned, /omit me/);
	// 合法围栏在匹配阶段即被保护，内部的 llm-exclude 不受后续剔除影响
	assert.match(cleaned, /keep this code example/);
	assert.match(cleaned, /```js/);
	assert.match(cleaned, /kept\(\)/);
});

test("protects the valid fence after an invalid backtick-info opener (review round 3)", () => {
	const input = [
		"```literal```",
		"```js",
		"kept()",
		"```",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.match(cleaned, /```js/);
	assert.match(cleaned, /kept\(\)/);
});

test("protects adjacent tilde and backtick fenced blocks (review round 4)", () => {
	const input = [
		'~~~js title="demo"',
		"first()",
		"~~~",
		"```html",
		"<llm-exclude>keep example</llm-exclude>",
		"```",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.match(cleaned, /~~~js/);
	assert.match(cleaned, /first\(\)/);
	assert.match(cleaned, /keep example/);
});

test("accepts longer closing fences and protects only the fenced block (review round 4)", () => {
	const input = [
		'```js title="demo"',
		"example()",
		"````",
		"",
		"<llm-exclude>omit me</llm-exclude>",
		"",
		"```text",
		"second()",
		"```",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.doesNotMatch(cleaned, /omit me/);
	assert.match(cleaned, /example\(\)/);
	assert.match(cleaned, /second\(\)/);
});

test("protects fenced blocks in CRLF input (review round 5)", () => {
	const input = [
		"~~~html",
		"<llm-exclude>keep</llm-exclude>",
		"~~~",
	].join("\r\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.match(cleaned, /keep/);
});

test("protects list-contained fences with item-relative indentation (review round 5)", () => {
	const input = [
		"1.  Example",
		"",
		"    ~~~html",
		"    <llm-exclude>keep example</llm-exclude>",
		"    ~~~",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.match(cleaned, /keep example/);
	assert.match(cleaned, /Example/);
});

test("does not close a fence with a tab-indented marker (review round 5)", () => {
	const input = [
		"~~~html",
		"\t~~~",
		"<llm-exclude>keep</llm-exclude>",
		"~~~",
	].join("\n");
	const cleaned = cleanMarkdownForLLM(input);
	assert.match(cleaned, /keep/);
});
