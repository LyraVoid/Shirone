import assert from "node:assert/strict";
import test from "node:test";
import { aboutConfig } from "../src/config/aboutConfig.ts";
import { albumsConfig } from "../src/config/albumsConfig.ts";
import { siteConfig } from "../src/config/siteConfig.ts";
import {
	getDisabledPages,
	getPageRootSegment,
	isSitemapPageAllowed,
} from "../src/config/sitemapFilter.ts";
import { skillsConfig } from "../src/config/skillsConfig.ts";

function withBase(base, fn) {
	const original = siteConfig.base;
	siteConfig.base = base;
	try {
		fn();
	} finally {
		siteConfig.base = original;
	}
}

test("getDisabledPages reflects enable: false flags", () => {
	const original = aboutConfig.enable;
	aboutConfig.enable = false;
	try {
		assert.ok(getDisabledPages().includes("about"));
	} finally {
		aboutConfig.enable = original;
	}
});

test("getPageRootSegment resolves the top-level page identifier", () => {
	assert.equal(getPageRootSegment("https://example.com/about/"), "about");
	assert.equal(getPageRootSegment("https://example.com/posts/about/"), "posts");
	assert.equal(getPageRootSegment("/skills/index.html"), "skills");
	assert.equal(getPageRootSegment("https://example.com/"), null);
	// F-10：子串匹配的过度过滤——/posts/about/ 的页面标识必须是 posts
	assert.notEqual(
		getPageRootSegment("https://example.com/posts/about/"),
		"about",
	);
});

test("isSitemapPageAllowed only filters exact top-level disabled pages (F-10)", () => {
	const originalSkills = skillsConfig.enable;
	const originalAbout = aboutConfig.enable;
	skillsConfig.enable = false;
	aboutConfig.enable = false;
	try {
		// 精确匹配：顶层页面本身被排除
		assert.equal(isSitemapPageAllowed("https://example.com/skills/"), false);
		assert.equal(isSitemapPageAllowed("https://example.com/skills"), false);
		assert.equal(
			isSitemapPageAllowed("https://example.com/skills/index.html"),
			false,
		);
		// 回归：文章 slug 恰好叫 about 时不再被误杀
		assert.equal(
			isSitemapPageAllowed("https://example.com/posts/about/"),
			true,
		);
		assert.equal(
			isSitemapPageAllowed("https://example.com/posts/about/2/"),
			true,
		);
		// 其他页面不受影响
		assert.equal(
			isSitemapPageAllowed("https://example.com/posts/hello-world/"),
			true,
		);
	} finally {
		skillsConfig.enable = originalSkills;
		aboutConfig.enable = originalAbout;
	}
});

test("isSitemapPageAllowed strips the configured base before matching", () => {
	const originalSkills = skillsConfig.enable;
	skillsConfig.enable = false;
	try {
		withBase("/blog", () => {
			assert.equal(
				isSitemapPageAllowed("https://example.com/blog/skills/"),
				false,
			);
			assert.equal(
				isSitemapPageAllowed("https://example.com/blog/posts/skills/"),
				true,
			);
		});
	} finally {
		skillsConfig.enable = originalSkills;
	}
});

test("isSitemapPageAllowed excludes hidden album detail pages (F-121)", () => {
	const originalAlbums = albumsConfig.enable;
	albumsConfig.enable = true;
	try {
		// HiddenExample/info.json 声明 hidden: true
		assert.equal(
			isSitemapPageAllowed("https://example.com/albums/HiddenExample/"),
			false,
		);
		assert.equal(
			isSitemapPageAllowed(
				"https://example.com/albums/HiddenExample/index.html",
			),
			false,
		);
		assert.equal(
			isSitemapPageAllowed("https://example.com/albums/AcgExample/"),
			true,
		);
		assert.equal(isSitemapPageAllowed("https://example.com/albums/"), true);
	} finally {
		albumsConfig.enable = originalAlbums;
	}
});

test("isSitemapPageAllowed filters all album pages when the albums feature is disabled", () => {
	const originalAlbums = albumsConfig.enable;
	albumsConfig.enable = false;
	try {
		assert.equal(isSitemapPageAllowed("https://example.com/albums/"), false);
		assert.equal(
			isSitemapPageAllowed("https://example.com/albums/AcgExample/"),
			false,
		);
	} finally {
		albumsConfig.enable = originalAlbums;
	}
});
