import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	createGregorianDateFormatter,
	resolveWeekStart,
} from "../src/utils/locale-utils.ts";

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

describe("Gregorian date-picker formatting", () => {
	it("keeps dates and month titles aligned with the Latin-numbered grid", () => {
		const date = new Date(2026, 0, 1);

		for (const locale of ["fa-IR", "ar-EG"]) {
			const dateFormatter = createGregorianDateFormatter(locale, {
				dateStyle: "full",
			});
			const monthFormatter = createGregorianDateFormatter(locale, {
				year: "numeric",
				month: "long",
			});
			const dateLabel = dateFormatter.format(date);
			const monthTitle = monthFormatter.format(date);
			const localizedFormatter = new Intl.DateTimeFormat(locale, {
				dateStyle: "full",
			});

			assert.equal(dateFormatter.resolvedOptions().calendar, "gregory");
			assert.equal(dateFormatter.resolvedOptions().numberingSystem, "latn");
			assert.ok(dateLabel.includes(String(date.getDate())), `${locale} day`);
			assert.ok(
				monthTitle.includes(String(date.getFullYear())),
				`${locale} year`,
			);
			assert.doesNotMatch(dateLabel, /[\u0660-\u0669\u06f0-\u06f9]/);
			assert.notEqual(dateLabel, localizedFormatter.format(date));
		}
	});
});
