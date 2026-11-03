import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const ROOT = new URL("../", import.meta.url);
const packageManifest = JSON.parse(
	readFileSync(new URL("package.json", ROOT), "utf8"),
);
const workspace = parse(
	readFileSync(new URL("pnpm-workspace.yaml", ROOT), "utf8"),
);
const lockfile = parse(readFileSync(new URL("pnpm-lock.yaml", ROOT), "utf8"));

test("security override pins affected postcss-selector-parser v6 without downgrading v7", () => {
	assert.equal(workspace.overrides["postcss-selector-parser@6"], "6.1.5");
	assert.equal(workspace.overrides["postcss-selector-parser"], undefined);
	assert.equal(lockfile.overrides["postcss-selector-parser@6"], "6.1.5");
	assert.equal(lockfile.overrides["postcss-selector-parser"], undefined);
});

test("KaTeX manifest and lockfile use the same patched release specifier", () => {
	const manifestSpecifier = packageManifest.dependencies.katex;
	const lockedDependency = lockfile.importers["."].dependencies.katex;
	assert.equal(manifestSpecifier, "0.18.3");
	assert.equal(lockedDependency.specifier, manifestSpecifier);
	assert.equal(lockedDependency.version, manifestSpecifier);
});
