import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveWeekStart } from "../src/utils/locale-utils.ts";

describe("locale week start", () => {
	it("prefers getWeekInfo over the legacy accessor", () => {
		assert.equal(
			resolveWeekStart({
				getWeekInfo: () => ({ firstDay: 7 }),
				weekInfo: { firstDay: 1 },
			}),
			7,
		);
	});

	it("falls back to the legacy weekInfo accessor", () => {
		assert.equal(resolveWeekStart({ weekInfo: { firstDay: 7 } }), 7);
	});

	it("falls back to Monday when neither member exists", () => {
		assert.equal(resolveWeekStart({}), 1);
	});
});
