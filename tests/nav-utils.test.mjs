import assert from "node:assert/strict";
import test from "node:test";
import { resolvePageKey } from "../src/utils/nav-utils.ts";

test("resolvePageKey handles root deployment", () => {
	assert.equal(resolvePageKey(new URL("https://example.com/")), "home");
	assert.equal(
		resolvePageKey(new URL("https://example.com/friends/")),
		"friends",
	);
	assert.equal(
		resolvePageKey(new URL("https://example.com/albums/AcgExample/")),
		"albums",
	);
	assert.equal(
		resolvePageKey(new URL("https://example.com/archive/?category=Guides")),
		"categories",
	);
	assert.equal(
		resolvePageKey(new URL("https://example.com/archive/?tag=Accessibility")),
		"tags",
	);
});

test("resolvePageKey handles subpath deployment with base override", () => {
	const base = "/Shirone/";
	assert.equal(
		resolvePageKey(new URL("https://example.com/Shirone/"), base),
		"home",
	);
	assert.equal(
		resolvePageKey(new URL("https://example.com/Shirone/friends/"), base),
		"friends",
	);
	assert.equal(
		resolvePageKey(
			new URL("https://example.com/Shirone/albums/AcgExample/"),
			base,
		),
		"albums",
	);
	assert.equal(
		resolvePageKey(
			new URL("https://example.com/Shirone/archive/?category=Guides"),
			base,
		),
		"categories",
	);
	assert.equal(
		resolvePageKey(
			new URL("https://example.com/Shirone/archive/?tag=Accessibility"),
			base,
		),
		"tags",
	);
});
