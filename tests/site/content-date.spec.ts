import { expect, test } from "@playwright/test";
import {
	comparePublicationEntries,
	formatCalendarDate,
	formatInstantDateInTimeZone,
	formatInstantDateTimeInTimeZone,
	validatePublicationMetadata,
} from "../../src/utils/content-date";

test.describe("content date semantics", () => {
	test("keeps calendar dates independent of the executing machine time zone", () => {
		expect(formatCalendarDate(new Date("2026-06-15T00:00:00Z"))).toBe(
			"2026-06-15",
		);
	});

	test("formats instants in the configured site time zone", () => {
		const instant = new Date("2026-06-14T19:14:03Z");
		expect(formatInstantDateInTimeZone(instant, "Asia/Shanghai")).toBe(
			"2026-06-15",
		);
		expect(formatInstantDateTimeInTimeZone(instant, "Asia/Shanghai")).toBe(
			"2026-06-15 03:14",
		);
		expect(formatInstantDateInTimeZone(instant, "America/Los_Angeles")).toBe(
			"2026-06-14",
		);
	});

	test("sorts same-day posts by their precise publication time, then ID", () => {
		const earlier = {
			id: "alpha",
			data: {
				published: new Date("2026-06-15T00:00:00Z"),
				publishedAt: new Date("2026-06-15T01:00:00Z"),
			},
		};
		const later = {
			id: "beta",
			data: {
				published: new Date("2026-06-15T00:00:00Z"),
				publishedAt: new Date("2026-06-15T08:00:00Z"),
			},
		};
		const sameTimeLaterId = {
			id: "gamma",
			data: { published: new Date("2026-06-15T00:00:00Z") },
		};
		const sameTimeEarlierId = {
			id: "delta",
			data: { published: new Date("2026-06-15T00:00:00Z") },
		};

		expect(
			[earlier, later].sort(comparePublicationEntries).map(({ id }) => id),
		).toEqual(["beta", "alpha"]);
		expect(
			[sameTimeLaterId, sameTimeEarlierId]
				.sort(comparePublicationEntries)
				.map(({ id }) => id),
		).toEqual(["delta", "gamma"]);
	});

	test("rejects timestamps whose site-calendar date conflicts with published", () => {
		expect(() =>
			validatePublicationMetadata(
				{
					id: "crosses-midnight",
					data: {
						published: new Date("2026-06-15T00:00:00Z"),
						publishedAt: new Date("2026-06-14T14:00:00Z"),
					},
				},
				"Asia/Shanghai",
			),
		).toThrow(/outside its published calendar date/);
	});
});
