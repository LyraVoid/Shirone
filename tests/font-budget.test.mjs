import assert from "node:assert/strict";
import test from "node:test";
import { parseByteBudget } from "../scripts/fonts/budget.mjs";

test("parseByteBudget accepts plain byte counts and falls back when unset", () => {
	assert.equal(parseByteBudget(undefined, 4096, "X"), 4096);
	assert.equal(parseByteBudget("8000", 4096, "X"), 8000);
});

test("parseByteBudget rejects values Number() would silently zero out", () => {
	// `Number("8MB")` is NaN and every comparison against NaN is false, so a
	// unit-suffixed value used to disable both budget gates instead of failing.
	for (const bad of ["8MB", "", "0", "-100", "1e999", "NaN"]) {
		assert.throws(
			() => parseByteBudget(bad, 4096, "FONT_MAX_TOTAL_BYTES"),
			/FONT_MAX_TOTAL_BYTES/,
			bad,
		);
	}
});
