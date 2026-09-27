import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

const pagesDir = fileURLToPath(new URL("../src/pages/", import.meta.url));
const footerFile = fileURLToPath(
	new URL("../src/components/organisms/Footer.astro", import.meta.url),
);

test("page-scope agent instructions are not an Astro route", () => {
	assert.equal(existsSync(join(pagesDir, "AGENTS.md")), false);
	assert.equal(existsSync(join(pagesDir, "_AGENTS.md")), true);
});

test("package footer has the Shirones package-mode branding contract", async () => {
	const footer = await readFile(footerFile, "utf8");
	assert.match(footer, /packageMetadata\.name === "shirones"/);
	assert.match(footer, /https:\/\/github\.com\/yCENzh\/shirones/);
	assert.match(footer, /https:\/\/www\.npmjs\.com\/package\/shirones/);
});
