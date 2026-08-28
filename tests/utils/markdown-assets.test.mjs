import assert from "node:assert/strict";
import { test } from "node:test";

import { getMarkdownStylesheetAssets } from "../../src/utils/markdown-assets.ts";
import { createMarkdownSyntaxSnapshot } from "../../src/utils/markdown-syntaxes.mjs";

test("resolves only manifest-declared Markdown stylesheet packs", async () => {
	assert.deepEqual(
		await getMarkdownStylesheetAssets(createMarkdownSyntaxSnapshot()),
		[],
	);

	const assets = await getMarkdownStylesheetAssets(
		createMarkdownSyntaxSnapshot(["file-tree", "image-grid"]),
	);

	assert.deepEqual(
		assets.map(({ pack }) => pack),
		["image-grids", "trees"],
	);
	assert.match(assets[0].css, /\.image-grid/);
	assert.match(assets[1].css, /\.m3-file-tree/);
});
