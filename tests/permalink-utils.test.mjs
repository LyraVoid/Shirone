import assert from "node:assert/strict";
import test from "node:test";
import { permalinkConfig } from "../src/config/permalinkConfig.ts";
import {
	clearPostIdMap,
	comparePublishedDatesAscending,
	generatePermalinkSlug,
	getPermalinkPath,
	getPostDateParts,
	getPostNumericId,
	hasCustomPermalink,
	initPostIdMap,
} from "../src/utils/permalink-utils.ts";
import {
	getPostUrl,
	getPostUrlByAlias,
	getPostUrlBySlug,
	removeFileExtension,
} from "../src/utils/url-utils.ts";

test("removeFileExtension removes markdown extensions properly", () => {
	assert.equal(removeFileExtension("my-post.md"), "my-post");
	assert.equal(removeFileExtension("guide/index.mdx"), "guide/index");
	assert.equal(removeFileExtension("article.markdown"), "article");
	assert.equal(removeFileExtension("post.MD"), "post");
	assert.equal(removeFileExtension("plain-slug"), "plain-slug");
});

test("comparePublishedDatesAscending sorts by published instant and id", () => {
	const older = {
		id: "b-older",
		data: { published: new Date("2024-01-01T00:00:00Z") },
	};
	const newer = {
		id: "a-newer",
		data: { published: new Date("2024-06-01T00:00:00Z") },
	};
	const tieA = {
		id: "a-post",
		data: { published: new Date("2024-01-01T00:00:00Z") },
	};

	assert.ok(comparePublishedDatesAscending(older, newer) < 0);
	assert.ok(comparePublishedDatesAscending(newer, older) > 0);
	assert.ok(comparePublishedDatesAscending(tieA, older) < 0);
});

test("initPostIdMap assigns 1-based sequential IDs ascending by date, excluding drafts", () => {
	clearPostIdMap();

	const posts = [
		{
			id: "post-3",
			data: { published: new Date("2024-03-01T00:00:00Z"), draft: false },
		},
		{
			id: "draft-post",
			data: { published: new Date("2024-01-15T00:00:00Z"), draft: true },
		},
		{
			id: "post-1",
			data: { published: new Date("2024-01-01T00:00:00Z"), draft: false },
		},
		{
			id: "post-2",
			data: { published: new Date("2024-02-01T00:00:00Z"), draft: false },
		},
	];

	initPostIdMap(posts);

	assert.equal(getPostNumericId("post-1"), 1);
	assert.equal(getPostNumericId("post-2"), 2);
	assert.equal(getPostNumericId("post-3"), 3);
	assert.equal(getPostNumericId("draft-post"), 0);
	assert.equal(getPostNumericId("unknown-post"), 0);

	clearPostIdMap();
	assert.equal(getPostNumericId("post-1"), 0);
});

test("getPostDateParts extracts date components in UTC date-only and timezone aware modes", () => {
	// Date-only UTC midnight
	const dateOnly = new Date("2024-05-18T00:00:00.000Z");
	const partsDateOnly = getPostDateParts(dateOnly);
	assert.equal(partsDateOnly.year, "2024");
	assert.equal(partsDateOnly.month, "05");
	assert.equal(partsDateOnly.day, "18");
	assert.equal(partsDateOnly.hour, "00");
	assert.equal(partsDateOnly.minute, "00");
	assert.equal(partsDateOnly.second, "00");

	// Instant with publishedAt in Asia/Shanghai (UTC+8)
	const instant = new Date("2024-05-18T15:30:45.000Z");
	const partsInTz = getPostDateParts(dateOnly, instant, "Asia/Shanghai");
	assert.equal(partsInTz.year, "2024");
	assert.equal(partsInTz.month, "05");
	assert.equal(partsInTz.day, "18");
	assert.equal(partsInTz.hour, "23");
	assert.equal(partsInTz.minute, "30");
	assert.equal(partsInTz.second, "45");
});

test("hasCustomPermalink recognizes custom permalink in frontmatter", () => {
	assert.equal(
		hasCustomPermalink({ data: { permalink: "my-custom-url" } }),
		true,
	);
	assert.equal(
		hasCustomPermalink({ data: { permalink: "/nested/url/" } }),
		true,
	);
	assert.equal(hasCustomPermalink({ data: { permalink: "" } }), false);
	assert.equal(hasCustomPermalink({ data: {} }), false);
	assert.equal(hasCustomPermalink({}), false);
});

test("generatePermalinkSlug handles custom permalink, aliases, and global templates", () => {
	clearPostIdMap();
	const posts = [
		{
			id: "my-first-post.md",
			filePath: "src/content/posts/My-First-Post.md",
			data: {
				title: "My First Post",
				published: new Date("2024-05-18T10:20:30Z"),
				publishedAt: new Date("2024-05-18T10:20:30Z"),
				category: "Tech",
			},
		},
	];
	initPostIdMap(posts);

	// 1. Custom permalink
	const postWithCustom = {
		id: "test.md",
		data: { permalink: "/custom/about-me/" },
	};
	assert.equal(generatePermalinkSlug(postWithCustom), "custom/about-me");

	// 2. Global permalink disabled with alias
	permalinkConfig.enable = false;
	const postWithAlias = {
		id: "guide.md",
		data: { alias: "posts/my-alias" },
	};
	assert.equal(generatePermalinkSlug(postWithAlias), "my-alias");

	// 3. Global permalink disabled without alias
	const postPlain = {
		id: "hello-world.md",
		data: {},
	};
	assert.equal(generatePermalinkSlug(postPlain), "hello-world");

	// 4. Global permalink enabled with formatting placeholders
	permalinkConfig.enable = true;
	permalinkConfig.format = "%year%/%monthnum%/%day%/%postname%";
	assert.equal(generatePermalinkSlug(posts[0]), "2024/05/18/my-first-post");

	permalinkConfig.format = "%post_id%-%category%-%raw_postname%";
	assert.equal(generatePermalinkSlug(posts[0]), "1-Tech-My-First-Post");

	permalinkConfig.format = "%year%-%monthnum%-%post_id%-%category%";
	const uncategorizedPost = {
		id: "second-post.md",
		data: {
			published: new Date("2024-05-18T00:00:00Z"),
			category: null,
		},
	};
	assert.equal(
		generatePermalinkSlug(uncategorizedPost),
		"2024-05-0-uncategorized",
	);

	// Restore config
	permalinkConfig.enable = false;
	permalinkConfig.format = "%postname%";
	clearPostIdMap();
});

test("getPostUrlBySlug and getPostUrlByAlias produce valid urls", () => {
	assert.equal(getPostUrlBySlug("guide/index.md"), "/posts/guide/index/");
	assert.equal(getPostUrlBySlug("/posts/hello/"), "/posts/hello/");
	assert.equal(getPostUrlByAlias("custom-alias"), "/posts/custom-alias/");
	assert.equal(getPostUrlByAlias("posts/custom-alias"), "/posts/custom-alias/");
});

test("getPostUrl resolves correct URL according to precedence", () => {
	clearPostIdMap();
	const sample = {
		id: "article-1.md",
		filePath: "src/content/posts/article-1.md",
		data: {
			published: new Date("2024-01-01T00:00:00Z"),
			category: "Dev",
		},
	};
	initPostIdMap([sample]);

	// Pre-calculated URL takes precedence
	assert.equal(
		getPostUrl({ ...sample, url: "/custom-precomputed/" }),
		"/custom-precomputed/",
	);

	// Custom permalink
	assert.equal(
		getPostUrl({
			...sample,
			data: { ...sample.data, permalink: "my-direct-page" },
		}),
		"/my-direct-page/",
	);

	// Global permalink enabled
	permalinkConfig.enable = true;
	permalinkConfig.format = "%year%/%postname%";
	assert.equal(getPostUrl(sample), "/2024/article-1/");

	// Global permalink disabled, alias provided
	permalinkConfig.enable = false;
	assert.equal(
		getPostUrl({
			...sample,
			data: { ...sample.data, alias: "aliased-article" },
		}),
		"/posts/aliased-article/",
	);

	// Default fallback
	assert.equal(getPostUrl(sample), "/posts/article-1/");

	clearPostIdMap();
});

test("getPermalinkPath returns root-relative URL path", () => {
	const post = {
		id: "my-post.md",
		data: { permalink: "custom-path" },
	};
	assert.equal(getPermalinkPath(post), "/custom-path/");
});
