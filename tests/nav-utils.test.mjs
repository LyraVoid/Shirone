import assert from "node:assert/strict";
import test from "node:test";
import {
	pruneUnavailableNavLinks,
	resolvePageKey,
} from "../src/utils/nav-utils.ts";

/** 用最小字段构造导航链接列表，便于断言裁剪结果。 */
const resolve = (links, unavailable) =>
	pruneUnavailableNavLinks(links, new Set(unavailable));

test("resolvePageKey handles root deployment", () => {
	assert.equal(resolvePageKey(new URL("https://example.com/")), "home");
	assert.equal(
		resolvePageKey(new URL("https://example.com/friends/")),
		"friends",
	);
	assert.equal(resolvePageKey(new URL("https://example.com/games/")), "games");
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
		resolvePageKey(new URL("https://example.com/Shirone/games/"), base),
		"games",
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

test("pruneUnavailableNavLinks drops entries pointing at disabled features", () => {
	const links = resolve(
		[
			{ name: "Home", url: "/" },
			{ name: "说说", url: "/moments/" },
			{ name: "说说（无尾斜杠）", url: "/moments" },
			{ name: "带查询", url: "/moments/?sort=recent" },
			{ name: "关于", url: "/about/#intro" },
			{ name: "站外", url: "https://example.com/moments/" },
			{ name: "锚点", url: "#top" },
		],
		["/moments"],
	);

	assert.deepEqual(
		links.map((link) => link.url),
		["/", "/about/#intro", "https://example.com/moments/", "#top"],
	);
});

test("pruneUnavailableNavLinks drops container groups left empty", () => {
	const [mixed] = resolve(
		[
			{
				name: "更多",
				children: [
					{ name: "说说", url: "/moments/" },
					{ name: "动态", url: "/moments" },
				],
			},
			{
				name: "混合",
				children: [
					{ name: "说说", url: "/moments/" },
					{ name: "友链", url: "/friends/" },
				],
			},
		],
		["/moments"],
	);

	assert.equal(mixed.name, "混合");
	assert.deepEqual(
		mixed.children?.map((link) => link.url),
		["/friends/"],
	);
});

test("pruneUnavailableNavLinks keeps every link when nothing is disabled", () => {
	const links = resolve(
		[
			{ name: "Home", url: "/" },
			{ name: "说说", url: "/moments/" },
		],
		[],
	);

	assert.deepEqual(
		links.map((link) => link.url),
		["/", "/moments/"],
	);
});
