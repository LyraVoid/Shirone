import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildSeriesContexts,
	excerptFromMarkdown,
	findUnknownSeriesSlugs,
	normaliseSeriesSlug,
	orderSeriesMembers,
	resolveSeriesPostCategory,
} from "../src/utils/series-utils.ts";

const member = (slug, published, seriesOrder) => ({
	slug,
	title: `Title ${slug}`,
	published: new Date(published),
	series: "demo",
	seriesOrder,
});

describe("normaliseSeriesSlug", () => {
	it("去掉前后空白，空值归一为空串", () => {
		assert.equal(normaliseSeriesSlug(" demo "), "demo");
		assert.equal(normaliseSeriesSlug("demo"), "demo");
		assert.equal(normaliseSeriesSlug(""), "");
		assert.equal(normaliseSeriesSlug(undefined), "");
		assert.equal(normaliseSeriesSlug(null), "");
	});

	it("带空白的引用仍能命中目录（与 schema trim 后的取值一致）", () => {
		const catalog = new Map([["demo", { id: "demo", data: {} }]]);
		assert.deepEqual(
			findUnknownSeriesSlugs([{ slug: "p", series: " demo " }], catalog),
			[],
		);
	});
});

describe("orderSeriesMembers", () => {
	it("显式 seriesOrder 优先于发布日期", () => {
		const ordered = orderSeriesMembers([
			member("a", "2026-01-01", 3),
			member("b", "2026-01-02", 1),
			member("c", "2026-01-03", 2),
		]);
		assert.deepEqual(
			ordered.map((m) => m.slug),
			["b", "c", "a"],
		);
	});

	it("全部缺省顺序时按发布日期升序", () => {
		const ordered = orderSeriesMembers([
			member("late", "2026-03-01"),
			member("early", "2026-01-01"),
			member("mid", "2026-02-01"),
		]);
		assert.deepEqual(
			ordered.map((m) => m.slug),
			["early", "mid", "late"],
		);
	});

	it("部分标注时未标注的按日期排在已标注之后", () => {
		const ordered = orderSeriesMembers([
			member("x", "2026-01-01", 2),
			member("y", "2026-01-02"),
			member("z", "2026-01-03", 1),
		]);
		assert.deepEqual(
			ordered.map((m) => m.slug),
			["z", "x", "y"],
		);
	});

	it("同序同日期时按 slug 兜底，保证确定性", () => {
		const ordered = orderSeriesMembers([
			member("b", "2026-01-01"),
			member("a", "2026-01-01"),
		]);
		assert.deepEqual(
			ordered.map((m) => m.slug),
			["a", "b"],
		);
	});
});

describe("resolveSeriesPostCategory", () => {
	it("显式 category 优先", () => {
		assert.equal(
			resolveSeriesPostCategory("代码实践", { defaultCategory: "研究笔记" }),
			"代码实践",
		);
	});

	it("缺省时回退到系列默认分类", () => {
		assert.equal(
			resolveSeriesPostCategory("", { defaultCategory: "研究笔记" }),
			"研究笔记",
		);
		assert.equal(
			resolveSeriesPostCategory(undefined, { defaultCategory: " 研究笔记 " }),
			"研究笔记",
		);
	});

	it("两者皆空返回空串（未分类）", () => {
		assert.equal(resolveSeriesPostCategory("", undefined), "");
		assert.equal(resolveSeriesPostCategory(null, { defaultCategory: "" }), "");
	});
});

describe("buildSeriesContexts", () => {
	const catalog = new Map();
	catalog.set("demo", {
		id: "demo",
		data: {
			title: "Demo Series",
			status: "ongoing",
			defaultCategory: "研究笔记",
		},
	});

	it("按阅读顺序给出 index/total 与组内上一篇/下一篇", () => {
		const posts = [
			{
				slug: "p1",
				title: "P1",
				published: new Date("2026-01-03"),
				series: "demo",
				seriesOrder: 1,
			},
			{
				slug: "p2",
				title: "P2",
				published: new Date("2026-01-01"),
				series: "demo",
				seriesOrder: 2,
			},
			{
				slug: "p3",
				title: "P3",
				published: new Date("2026-01-02"),
				series: "demo",
				seriesOrder: 3,
			},
			{ slug: "solo", title: "Solo", published: new Date("2026-01-04") },
		];
		const contexts = buildSeriesContexts({ catalog, posts });

		assert.equal(contexts.size, 3);
		const first = contexts.get("p1");
		assert.equal(first.index, 1);
		assert.equal(first.total, 3);
		assert.equal(first.prev, null);
		assert.equal(first.next.slug, "p2");
		const mid = contexts.get("p2");
		assert.equal(mid.prev.slug, "p1");
		assert.equal(mid.next.slug, "p3");
		const last = contexts.get("p3");
		assert.equal(last.next, null);
	});

	it("引用目录中不存在的系列时不生成上下文（不产生死链）", () => {
		const posts = [
			{
				slug: "ghost",
				title: "Ghost",
				published: new Date("2026-01-01"),
				series: "no-such-series",
				seriesOrder: 1,
			},
		];
		const contexts = buildSeriesContexts({ catalog, posts });
		assert.equal(contexts.size, 0);
	});
});

describe("excerptFromMarkdown", () => {
	it("去掉代码块、标题与列表符号，保留正文文本", () => {
		const md = [
			"## 动机",
			"```python",
			"print('hello')",
			"```",
			"- 第一点",
			"1. 第二点",
			"> 引用一句",
		].join("\n");
		assert.equal(excerptFromMarkdown(md), "动机 第一点 第二点 引用一句");
	});

	it("链接保留锚文本，图片与 HTML 标签移除", () => {
		assert.equal(
			excerptFromMarkdown(
				"精读 [Attention Is All You Need](https://arxiv.org/abs/1706.03762) 与 ![图](x.png) <b>细节</b>",
			),
			"精读 Attention Is All You Need 与 细节",
		);
	});

	it("超长文本按词边界截断并追加省略号", () => {
		const long = "word ".repeat(40).trim();
		const out = excerptFromMarkdown(long, 50);
		assert.ok(out.length <= 51);
		assert.ok(out.endsWith("…"));
	});

	it("短文本原样返回且无省略号", () => {
		assert.equal(excerptFromMarkdown("很短的总览"), "很短的总览");
	});
});

describe("findUnknownSeriesSlugs", () => {
	const catalog = new Map([["known", {}]]);

	it("收集未知引用，每个 slug 只报首篇", () => {
		const refs = findUnknownSeriesSlugs(
			[
				{ slug: "a", series: "ghost" },
				{ slug: "b", series: "ghost" },
				{ slug: "c", series: "known" },
				{ slug: "d" },
			],
			catalog,
		);
		assert.deepEqual(refs, [{ slug: "ghost", postSlug: "a" }]);
	});

	it("全部合法时返回空", () => {
		assert.deepEqual(
			findUnknownSeriesSlugs(
				[
					{ slug: "a", series: "known" },
					{ slug: "b", series: "" },
					{ slug: "c" },
				],
				catalog,
			),
			[],
		);
	});
});
