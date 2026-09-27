import assert from "node:assert/strict";
import test from "node:test";
import { resolveFontAssetPath } from "../scripts/fonts/asset-path.mjs";

test("font checker strips the Astro base path before resolving dist assets", () => {
	assert.equal(
		resolveFontAssetPath("/Shirone/_astro/fonts/font.woff2", "/Shirone/"),
		"_astro/fonts/font.woff2",
	);
	assert.equal(
		resolveFontAssetPath("/Shirone/_astro/fonts/font.woff2", "/Shirone"),
		"_astro/fonts/font.woff2",
	);
});

test("font checker preserves root-base and already-relative assets", () => {
	assert.equal(
		resolveFontAssetPath("/_astro/fonts/font.woff2", "/"),
		"_astro/fonts/font.woff2",
	);
	assert.equal(
		resolveFontAssetPath("_astro/fonts/font.woff2", "/Shirone/"),
		"_astro/fonts/font.woff2",
	);
});

test("font checker removes query strings before resolving assets", () => {
	assert.equal(
		resolveFontAssetPath("/Shirone/_astro/fonts/font.woff2?v=1", "/Shirone/"),
		"_astro/fonts/font.woff2",
	);
});
