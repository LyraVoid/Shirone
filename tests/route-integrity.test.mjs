import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { permalinkConfig } from "../src/config/permalinkConfig.ts";
import { dropDisabledCorePages } from "../src/utils/llms-utils.ts";
import { clearPostIdMap, initPostIdMap } from "../src/utils/permalink-utils.ts";
import { buildPermalinkUrl, getPostUrl } from "../src/utils/url-utils.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), "utf8");

test("dropDisabledCorePages removes disabled top-level pages but keeps others", () => {
	const disabled = ["about", "skills", "timeline"];
	const corePages = [
		{ title: "About", url: "/about/", description: "" },
		{ title: "Skills", url: "/skills" },
		{ title: "Skills relative", url: "skills/" },
		{ title: "About anchored", url: "/about#bio" },
		{ title: "About dot", url: "./about/" },
		{ title: "About dotdot", url: "../about/" },
		{ title: "About double slash", url: "/posts//../about/" },
		{ title: "About encoded dot", url: "/%2e//../about/" },
		{ title: "About encoded dotdot", url: "/%2e%2e/about/" },
		{ title: "About via parent", url: "/posts/../about/" },
		{ title: "Archive", url: "/posts/", description: "" },
		{ title: "Root", url: "/" },
		{ title: "External", url: "https://example.com/about/" },
	];
	const kept = dropDisabledCorePages(corePages, disabled);
	assert.deepEqual(
		kept.map((page) => page.title),
		["About double slash", "Archive", "Root", "External"],
	);
});

test("dropDisabledCorePages tolerates undefined corePages", () => {
	assert.deepEqual(dropDisabledCorePages(undefined, ["about"]), []);
});

test("F-123 route conflicts fail the build instead of being silently dropped", () => {
	const integration = read("src/integration/index.ts");
	assert.match(integration, /prerenderConflictBehavior: "error"/);
});

test("F-125 disabled core pages are dropped from the llms.txt directory", () => {
	const llms = read("src/pages/llms.txt.ts");
	assert.match(
		llms,
		/corePages: dropDisabledCorePages\(\s*llmsConfig\.corePages,\s*getDisabledPages\(\),?\s*\)/,
	);
});

test("F-121 hidden albums emit a robots noindex meta", () => {
	const albumPage = read("src/pages/albums/[id]/index.astro");
	assert.match(
		albumPage,
		/\{resolvedAlbum\.hidden && <meta slot="head" name="robots" content="noindex" \/>\}/,
	);
});

test("F-124 both post pages declare their canonical address", () => {
	const layout = read("src/layouts/Layout.astro");
	assert.match(layout, /canonical\?: string/);
	assert.match(layout, /<link rel="canonical" href=\{canonicalUrl\} \/>/);
	const grid = read("src/layouts/MainGridLayout.astro");
	assert.match(grid, /canonical\?: string/);
	assert.match(grid, /canonical=\{canonical\}/);
	for (const page of [
		"src/pages/posts/[...slug].astro",
		"src/pages/[...permalink].astro",
	]) {
		const source = read(page);
		assert.match(source, /canonical=\{canonicalPostUrl\}/);
		// JSON-LD 指向 permalink 规范页，避免双路由分裂收录
		assert.match(source, /url: canonicalPostHref,/);
		assert.match(source, /mainEntityOfPage: canonicalPostHref,/);
	}
});

test("F-9 series post entries expose their canonical URL", () => {
	for (const page of [
		"src/pages/posts/[...slug].astro",
		"src/pages/[...permalink].astro",
	]) {
		const source = read(page);
		assert.match(source, /url: getPostUrl\(entry\),/);
	}
});

test("F-8 reservations reset at the start of each getStaticPaths run", () => {
	const source = read("src/pages/[...permalink].astro");
	const resetIndex = source.indexOf("clearPermalinkReservations();");
	const initIndex = source.indexOf("initPostIdMap(blogEntries);");
	assert.ok(resetIndex > -1, "getStaticPaths must clear reservation state");
	assert.ok(initIndex > resetIndex, "reservations reset before the loop");
});

test("permalink URLs percent-encode category and postname segments", () => {
	const post = {
		id: "tech post.md",
		data: {
			published: new Date("2024-01-01T00:00:00Z"),
			category: "技术 分享",
		},
	};
	initPostIdMap([post]);
	const originalEnable = permalinkConfig.enable;
	const originalFormat = permalinkConfig.format;
	try {
		permalinkConfig.enable = true;
		permalinkConfig.format = "%category%/%postname%";
		assert.equal(
			getPostUrl(post),
			`/${encodeURIComponent("技术 分享")}/tech%20post/`,
		);
	} finally {
		permalinkConfig.enable = originalEnable;
		permalinkConfig.format = originalFormat;
		clearPostIdMap();
	}
});

test("buildPermalinkUrl keeps the base even when the slug starts with the base segment", () => {
	assert.equal(
		buildPermalinkUrl("my%20blog/entry", "/my%20blog/"),
		"/my%20blog/my%20blog/entry/",
	);
	assert.equal(buildPermalinkUrl("entry/post", "/"), "/entry/post/");
	// getPostUrl 的 permalink 分支必须经由显式 base 拼接，不走 url() 前缀检查
	const source = read("src/utils/url-utils.ts");
	assert.match(
		source,
		/buildPermalinkUrl\(encodePermalinkSegments\(slug\), url\("\/"\)\)/,
	);
});
