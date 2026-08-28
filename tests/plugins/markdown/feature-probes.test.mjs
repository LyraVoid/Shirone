import assert from "node:assert/strict";
import { test } from "node:test";

import { siteMarkdownProcessor } from "../../../src/utils/markdown-processor.mjs";

const renderer = await siteMarkdownProcessor.createRenderer({});

test("records math and Mermaid capabilities in render frontmatter", async () => {
	const math = await renderer.render("Euler: $e^{i\\pi}+1=0$");
	assert.deepEqual(math.metadata.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: ["math"],
	});

	const mermaid = await renderer.render(
		"```mermaid\nflowchart LR\n  A --> B\n```",
	);
	assert.deepEqual(mermaid.metadata.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: ["mermaid"],
	});
});

test("records file-tree and code-tree capabilities after syntax transforms", async () => {
	const fileTree = await renderer.render(
		[':::file-tree{title="Source"}', "- src/", "  - index.ts", ":::"].join(
			"\n",
		),
	);
	assert.deepEqual(fileTree.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"file-tree",
	]);

	const codeTree = await renderer.render(
		[
			':::code-tree{title="Source"}',
			'```ts title="src/index.ts"',
			"export {};",
			"```",
			":::",
		].join("\n"),
	);
	assert.deepEqual(codeTree.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"code-tree",
	]);
});

test("records collapse panels after syntax normalization", async () => {
	const collapsePanels = await renderer.render(
		[
			"::: collapse accordion",
			"- First panel",
			"",
			"  Panel content.",
			":::",
		].join("\n"),
	);
	assert.deepEqual(
		collapsePanels.metadata.frontmatter.markdownSyntaxes.syntaxes,
		["collapse-panels"],
	);
});

test("records marker highlights after syntax normalization", async () => {
	const marker = await renderer.render("Use ==semantic emphasis==.");
	assert.deepEqual(marker.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"marker",
	]);
});

test("records steps containers before directive normalization", async () => {
	const steps = await renderer.render(
		[
			':::steps{title="Deploy"}',
			"1. Build the site.",
			"2. Publish the result.",
			":::",
		].join("\n"),
	);
	assert.deepEqual(steps.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"steps",
	]);
});

test("records normalized admonitions including GitHub Alerts", async () => {
	const admonitions = await renderer.render(
		"> [!TIP]\n> Rendered through the shared admonition component.",
	);
	assert.deepEqual(admonitions.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"admonition",
	]);
});

test("records visible abbreviations after reference replacement", async () => {
	const abbreviations = await renderer.render(
		"*[SSR]: Server-Side Rendering\n\nSSR stays readable without JavaScript.",
	);
	assert.deepEqual(
		abbreviations.metadata.frontmatter.markdownSyntaxes.syntaxes,
		["abbreviation"],
	);
});

test("records option group containers after syntax normalization", async () => {
	const optionGroups = await renderer.render(
		[
			"::: tabs",
			"",
			"@tab First",
			"",
			"First body.",
			"",
			"@tab Second",
			"",
			"Second body.",
			"",
			":::",
		].join("\n"),
	);
	assert.deepEqual(
		optionGroups.metadata.frontmatter.markdownSyntaxes.syntaxes,
		["option-groups"],
	);
});

test("records image grid containers before directive normalization", async () => {
	const imageGrid = await renderer.render(
		":::grid\n\n![Example](/images/example.webp)\n\n:::",
	);
	assert.deepEqual(imageGrid.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"image-grid",
	]);
});

test("records standalone image presentations without matching inline images", async () => {
	const presentation = await renderer.render(
		'![Example w-50%](/images/example.webp "Caption")',
	);
	assert.deepEqual(
		presentation.metadata.frontmatter.markdownSyntaxes.syntaxes,
		["image-presentation"],
	);

	const inlineImage = await renderer.render(
		'Inline ![Example w-50%](/images/example.webp "Caption") text.',
	);
	assert.deepEqual(
		inlineImage.metadata.frontmatter.markdownSyntaxes.syntaxes,
		[],
	);
});

test("records fenced code blocks for Expressive Code styling", async () => {
	const code = await renderer.render("```ts\nexport {};\n```");
	assert.deepEqual(code.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"expressive-code",
	]);
});

test("records defined content annotations after reference resolution", async () => {
	const annotations = await renderer.render(
		"A note [+example].\n\n[+example]: Annotation content.",
	);
	assert.deepEqual(annotations.metadata.frontmatter.markdownSyntaxes.syntaxes, [
		"content-annotation",
	]);
});

test("renders legacy GitHub cards with an SSR fallback for API enhancement", async () => {
	const result = await renderer.render('::github{repo="LyraVoid/Shirone"}');

	assert.match(result.code, /href="https:\/\/github\.com\/LyraVoid\/Shirone"/);
	assert.match(result.code, /rel="noopener noreferrer"/);
	assert.match(result.code, /data-github-card/);
	assert.match(result.code, /data-github-description/);
	assert.match(result.code, /data-github-stars/);
	assert.match(result.code, /data-github-avatar/);
	assert.doesNotMatch(result.code, /api\.github\.com|<script/);
});

test("does not mark ordinary prose with optional capabilities", async () => {
	const result = await renderer.render("A plain article with no extensions.");
	assert.deepEqual(result.metadata.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: [],
	});
	assert.equal("markdownFeatures" in result.metadata.frontmatter, false);
	assert.equal("hasMath" in result.metadata.frontmatter, false);
	assert.equal("hasMermaid" in result.metadata.frontmatter, false);
	assert.equal("hasCodeInteractions" in result.metadata.frontmatter, false);
});
