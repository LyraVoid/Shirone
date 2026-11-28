import assert from "node:assert/strict";
import test from "node:test";
import { fetchBangumiData } from "../scripts/anime/providers/bangumi.mjs";

/**
 * F-2: a non-404 failure for one collection type used to be swallowed with a
 * `console.warn` + `break`, so the sync committed a partial snapshot and
 * exited 0 — indistinguishable from a genuinely empty category.
 */

function jsonResponse(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

test("a failed Bangumi collection request rejects instead of returning partial data", async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	let calls = 0;
	globalThis.fetch = async () => {
		calls++;
		return calls === 1
			? // The first (watching) category page returns data; the next
				// collection-type request fails with a server error.
				jsonResponse({ data: [{ subject_id: 1, rate: 8 }], total: 1 })
			: jsonResponse({ error: { message: "boom" } }, 500);
	};

	await assert.rejects(
		() => fetchBangumiData({ userId: "test-user" }),
		/HTTP 500/,
	);
	assert.ok(calls >= 2, "the failure happens after a first successful page");
});

test("a 404 collection type still counts as an empty category", async (t) => {
	const originalFetch = globalThis.fetch;
	t.after(() => {
		globalThis.fetch = originalFetch;
	});
	globalThis.fetch = async () => jsonResponse({}, 404);

	const result = await fetchBangumiData({ userId: "test-user" });
	assert.deepEqual(result.rawItems, []);
});
