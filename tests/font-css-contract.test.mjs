import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function readSource(relativePath) {
	return readFile(join(ROOT, relativePath), "utf8");
}

describe("font CSS variable contract", () => {
	it("keeps the mono variable graph one-way and acyclic", async () => {
		const fontFaces = await readSource("src/styles/font-faces.css");
		const main = await readSource("src/styles/main.css");

		assert.match(
			fontFaces,
			/--m3e-font-mono-family:\s*var\(--font-mono,\s*var\(--m3e-font-mono-fallback\)\);/,
		);
		assert.doesNotMatch(
			fontFaces,
			/--font-mono:\s*var\(--m3e-font-mono-family\)\s*;/,
		);
		assert.match(
			main,
			/--font-mono:\s*var\(--m3e-font-mono-fallback\)\s*;/,
		);
		assert.match(
			fontFaces,
			/font-family:\s*var\(--m3e-font-mono-family\)\s*!important;/,
		);
	});
});
