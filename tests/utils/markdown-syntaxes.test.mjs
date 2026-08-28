import assert from "node:assert/strict";
import { test } from "node:test";

import {
	createMarkdownSyntaxSnapshot,
	hasMarkdownSyntax,
	mergeMarkdownSyntaxSnapshots,
} from "../../src/utils/markdown-syntaxes.mjs";

test("creates deterministic snapshots from manifest-declared syntax IDs", () => {
	const snapshot = createMarkdownSyntaxSnapshot([
		"steps",
		"abbreviation",
		"steps",
	]);

	assert.deepEqual(snapshot, {
		schema: 1,
		syntaxes: ["abbreviation", "steps"],
	});
	assert.equal(hasMarkdownSyntax(snapshot, "steps"), true);
	assert.equal(hasMarkdownSyntax(snapshot, "math"), false);
});

test("rejects unknown IDs and ignores incompatible snapshots when merging", () => {
	assert.throws(
		() => createMarkdownSyntaxSnapshot(["unregistered-syntax"]),
		/Unknown Markdown syntax ID: unregistered-syntax/,
	);
	assert.deepEqual(
		mergeMarkdownSyntaxSnapshots(
			{ schema: 1, syntaxes: ["math"] },
			{ schema: 2, syntaxes: ["mermaid"] },
		),
		{ schema: 1, syntaxes: ["math"] },
	);
});
