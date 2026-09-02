import assert from "node:assert/strict";
import test from "node:test";
import { renderDynamicMarkdown } from "../src/utils/dynamic-markdown.mjs";
import {
	postViewModelFromBackend,
	postViewModelFromStatic,
} from "../src/utils/post-view-model.ts";

test("maps a static collection entry without changing presentation data", () => {
	const published = new Date("2026-01-02T00:00:00.000Z");
	const entry = {
		id: "folder/hello.md",
		body: "Hello",
		data: {
			title: "Static post",
			published,
			pinned: false,
			draft: false,
			comment: true,
			description: "Summary",
			image: "/cover.webp",
			tags: ["Astro"],
			category: "Engineering",
			lang: "en",
			passwordHint: "",
			hideHomeContent: true,
			prevTitle: "",
			prevSlug: "",
			nextTitle: "",
			nextSlug: "",
		},
	};

	const post = postViewModelFromStatic(entry);
	assert.equal(post.source, "static");
	assert.equal(post.slug, "folder/hello");
	assert.equal(post.title, "Static post");
	assert.deepEqual(post.tags, ["Astro"]);
	assert.notEqual(post.tags, entry.data.tags);
	assert.equal(post.published.toISOString(), published.toISOString());
});

test("maps backend metadata and applies presentation defaults", () => {
	const post = postViewModelFromBackend({
		id: 7,
		kind: "post",
		slug: "dynamic-post",
		title: "Dynamic post",
		body: "# Hello",
		excerpt: "API summary",
		metadata: {
			image: "/media/cover.webp",
			tags: ["Go", 42, "Astro"],
			category: "Platform",
			comment: false,
		},
		status: "published",
		publishedAt: "2026-02-03T04:05:06.000Z",
		createdAt: "2026-02-01T00:00:00.000Z",
		updatedAt: "2026-02-04T00:00:00.000Z",
	});

	assert.equal(post.source, "backend");
	assert.equal(post.id, "7");
	assert.equal(post.description, "API summary");
	assert.deepEqual(post.tags, ["Go", "Astro"]);
	assert.equal(post.comment, false);
	assert.equal(post.hideHomeContent, true);
	assert.equal(post.published.toISOString(), "2026-02-03T04:05:06.000Z");
});

test("rejects backend documents with an invalid content contract", () => {
	assert.throws(
		() =>
			postViewModelFromBackend({
				id: 1,
				kind: "post",
				slug: "",
				title: "Missing slug",
				body: "Body",
				status: "published",
				createdAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		/slug, title, and body/,
	);
});

test("renders backend Markdown with the site plugin pipeline", async () => {
	const rendered = await renderDynamicMarkdown(
		"# Runtime title\n\nBody with **formatting**.",
		{ title: "Runtime title" },
	);

	assert.match(rendered.html, /<h1 id="runtime-title">/);
	assert.match(rendered.html, /<strong>formatting<\/strong>/);
	assert.deepEqual(rendered.headings, [
		{ depth: 1, slug: "runtime-title", text: "Runtime title#" },
	]);
	assert.equal(rendered.frontmatter.title, "Runtime title");
	assert.equal(rendered.frontmatter.words, 4);
	assert.equal(rendered.frontmatter.minutes, 1);
	assert.deepEqual(rendered.frontmatter.markdownSyntaxes, {
		schema: 1,
		syntaxes: [],
	});
});
