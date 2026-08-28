import assert from "node:assert/strict";
import { test } from "node:test";

import { getSourceMarkdownSyntaxSnapshot } from "../../src/utils/markdown-source-syntaxes.mjs";

test("detects Expressive Code from normalized fenced-code syntax", () => {
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot("A plain article with `inline code`."),
		{ schema: 1, syntaxes: [] },
	);
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot("```ts\nexport {};\n```").syntaxes,
		["expressive-code"],
	);
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot("~~~sh\necho hello\n~~~").syntaxes,
		["expressive-code"],
	);
});

test("does not classify code handled by other Markdown syntaxes as Expressive Code", () => {
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot("```mermaid\nflowchart LR\n  A --> B\n```")
			.syntaxes,
		[],
	);
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot("```file-tree\nsrc/\n```").syntaxes,
		[],
	);
	assert.deepEqual(
		getSourceMarkdownSyntaxSnapshot(
			[
				':::code-tree{title="Source"}',
				"```ts",
				"export {};",
				"```",
				":::",
			].join("\n"),
		).syntaxes,
		[],
	);
});
