import assert from "node:assert/strict";
import test from "node:test";
import { resolveUmamiOptions } from "../src/config/umamiConfig.ts";

// Fixtures are explicit literals rather than spreads of the repo's own
// `umamiConfig`: the real config can carry a `shareUrl`, and leaking it into
// these cases would make a tracking-only assertion pass for the wrong reason
// (and break the moment the repo config changes).

test("resolveUmamiOptions returns null while disabled", () => {
	assert.equal(resolveUmamiOptions({ enable: false }), null);
});

test("resolveUmamiOptions returns null with neither share URL nor credentials", () => {
	assert.equal(resolveUmamiOptions({ enable: true }), null);
});

test("resolveUmamiOptions keeps tracking-only configuration resolvable", () => {
	// `shareUrl` only drives the public share-stats UI; the visitor script
	// needs `websiteId` and `scriptUrl`. A tracking-only setup used to
	// resolve to null, silently injecting nothing despite the documented
	// role split.
	const resolved = resolveUmamiOptions({
		enable: true,
		websiteId: "website-x",
		scriptUrl: "https://umami.example.com/script.js",
	});
	assert.deepEqual(resolved, {
		shareUrl: undefined,
		websiteId: "website-x",
		scriptUrl: "https://umami.example.com/script.js",
	});
});

test("resolveUmamiOptions ignores a whitespace-only share URL", () => {
	// Whitespace is not a share URL: trimming must reduce it to nothing so a
	// tracking-only setup still resolves without one. The oddmisc share-stats
	// injection gates on the resolved `shareUrl` and would otherwise embed
	// `"   "` into every page.
	const resolved = resolveUmamiOptions({
		enable: true,
		shareUrl: "   ",
		websiteId: "website-x",
		scriptUrl: "https://umami.example.com/script.js",
	});
	assert.deepEqual(resolved, {
		shareUrl: undefined,
		websiteId: "website-x",
		scriptUrl: "https://umami.example.com/script.js",
	});
});

test("resolveUmamiOptions trims and drops incomplete credential pairs", () => {
	const halfCredentials = resolveUmamiOptions({
		enable: true,
		websiteId: " website-x ",
		scriptUrl: "   ",
	});
	assert.equal(halfCredentials, null);

	const resolved = resolveUmamiOptions({
		enable: true,
		shareUrl: " https://umami.example.com/share/abc ",
	});
	assert.deepEqual(resolved, {
		shareUrl: "https://umami.example.com/share/abc",
		websiteId: undefined,
		scriptUrl: undefined,
	});
});
