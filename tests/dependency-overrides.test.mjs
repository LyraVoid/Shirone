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

test("KaTeX keeps one non-deprecated patched version across manifest, override and lockfile", () => {
	// 0.18.2 fixes GHSA-238p-pmpm-9mq7. 0.18.11 was published with accidental
	// breaking changes and is deprecated, so the pin stays exact instead of a
	// caret range that would resolve it.
	const manifestSpecifier = packageManifest.dependencies.katex;
	const overrideSpecifier = workspace.overrides.katex;
	const lockedDependency = lockfile.importers["."].dependencies.katex;
	const version = lockedDependency.version;

	assert.match(version, /^0\.18\.\d+$/, `unexpected KaTeX version: ${version}`);
	assert.ok(
		Number(version.split(".")[2]) >= 2,
		"KaTeX must stay above the GHSA-238p-pmpm-9mq7 floor",
	);
	assert.notEqual(version, "0.18.11", "0.18.11 is deprecated for breaking changes");
	assert.equal(
		overrideSpecifier,
		manifestSpecifier,
		"the override and the dependency must resolve the same version",
	);
	assert.equal(lockfile.overrides.katex, overrideSpecifier);
	assert.equal(lockedDependency.specifier, manifestSpecifier);
	assert.equal(version, manifestSpecifier);
});
