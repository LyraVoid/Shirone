import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	filterByDisabledKeys,
	resolveDevicesData,
	resolveProjectsData,
	resolveSkillsData,
	resolveTimelineData,
} from "../src/utils/feature-data.ts";

describe("Feature Data & Resolver Tests", () => {
	it("filterByDisabledKeys correctly filters items by key/id/name/title", () => {
		const items = [
			{ key: "item-1", name: "One" },
			{ key: "item-2", name: "Two" },
			{ key: "item-3", name: "Three" },
		];

		const filtered = filterByDisabledKeys(items, ["item-2"]);
		assert.equal(filtered.length, 2);
		assert.deepEqual(
			filtered.map((i) => i.key),
			["item-1", "item-3"],
		);
	});

	it("resolveProjectsData applies disabledKeys correctly", () => {
		const config = {
			enable: true,
			categories: [],
			disabledKeys: ["folkpatch"],
		};
		const resolved = resolveProjectsData(config);
		assert.ok(resolved.some((p) => p.key === "shirone"));
		assert.ok(resolved.some((p) => p.key === "kernelpatch"));
		assert.ok(!resolved.some((p) => p.key === "folkpatch"));
	});

	it("resolveSkillsData applies disabledNames correctly", () => {
		const config = {
			enable: true,
			categories: [],
			disabledNames: ["PHP"],
		};
		const resolved = resolveSkillsData(config);
		assert.ok(resolved.some((s) => s.name === "TypeScript"));
		assert.ok(!resolved.some((s) => s.name === "PHP"));
	});

	it("resolveTimelineData applies disabledTitles and order correctly", () => {
		const config = {
			enable: true,
			categories: [],
			order: "asc",
			disabledTitles: ["Senior Frontend Engineer"],
		};
		const resolved = resolveTimelineData(config);
		assert.ok(!resolved.some((t) => t.title === "Senior Frontend Engineer"));
		// timelineData 中最旧的条目是 2020.09 – 2024.06 (Computer Science & Engineering Degree)
		assert.equal(resolved[0].title, "Computer Science & Engineering Degree");
	});

	it("resolveTimelineData sorts correctly by date in desc and asc order", () => {
		const customItems = [
			{ title: "Old", date: "2021.05" },
			{ title: "Recent", date: "2024.10" },
			{ title: "Present", date: "2025.01 - Present" },
			{ title: "Middle", date: "2023.01" },
		];
		const descRes = resolveTimelineData({ order: "desc" }, customItems);
		assert.deepEqual(
			descRes.map((i) => i.title),
			["Present", "Recent", "Middle", "Old"],
		);

		const ascRes = resolveTimelineData({ order: "asc" }, customItems);
		assert.deepEqual(
			ascRes.map((i) => i.title),
			["Old", "Middle", "Recent", "Present"],
		);
	});

	it("resolveDevicesData applies disabledIds correctly", () => {
		const config = {
			enable: true,
			categories: [],
			disabledIds: ["iphone-16-pro"],
		};
		const resolved = resolveDevicesData(config);
		assert.ok(resolved.some((d) => d.id === "macbook-pro-16"));
		assert.ok(!resolved.some((d) => d.id === "iphone-16-pro"));
	});
});
