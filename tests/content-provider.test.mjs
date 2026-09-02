import assert from "node:assert/strict";
import test from "node:test";
import { createPostContentProvider } from "../src/utils/content-provider.ts";

const staticEntry = {
	id: "static.md",
	body: "Static body",
	data: {
		title: "Static post",
		published: new Date("2026-01-01T00:00:00.000Z"),
		pinned: false,
		draft: false,
		comment: true,
		description: "",
		image: "",
		tags: [],
		category: "",
		lang: "",
		passwordHint: "",
		hideHomeContent: true,
		prevTitle: "",
		prevSlug: "",
		nextTitle: "",
		nextSlug: "",
	},
};

const backendDocument = {
	id: 4,
	kind: "post",
	slug: "from-api",
	title: "From API",
	body: "API body",
	status: "published",
	publishedAt: "2026-02-01T00:00:00.000Z",
	createdAt: "2026-02-01T00:00:00.000Z",
	updatedAt: "2026-02-01T00:00:00.000Z",
};

test("static provider makes no backend request", async () => {
	let fetchCalls = 0;
	const provider = createPostContentProvider({
		environment: {},
		fetchImpl: async () => {
			fetchCalls += 1;
			throw new Error("unexpected request");
		},
		staticSource: {
			listPosts: async () => [staticEntry],
			getPost: async (slug) => (slug === "static" ? staticEntry : undefined),
		},
	});

	assert.equal(provider.mode, "static");
	assert.equal((await provider.listPosts())[0].title, "Static post");
	assert.equal((await provider.getPost("static")).slug, "static");
	assert.equal(fetchCalls, 0);
});

test("dynamic provider maps API documents and forwards the request limit", async () => {
	const calls = [];
	const provider = createPostContentProvider({
		environment: {
			SHIRONE_RUNTIME_MODE: "dynamic",
			SHIRONE_API_URL: "https://api.example.com",
		},
		fetchImpl: async (url, options) => {
			calls.push({ url, options });
			return {
				ok: true,
				status: 200,
				json: async () => ({
					items: [backendDocument, { ...backendDocument, id: 5, kind: "page" }],
				}),
			};
		},
	});

	const posts = await provider.listPosts({ limit: 8 });
	assert.equal(posts.length, 1);
	assert.equal(posts[0].slug, "from-api");
	assert.equal(calls[0].url, "https://api.example.com/api/v1/content/?limit=8");
});

test("dynamic provider converts content 404 responses to an empty result", async () => {
	const provider = createPostContentProvider({
		environment: {
			SHIRONE_RUNTIME_MODE: "dynamic",
			SHIRONE_API_URL: "https://api.example.com",
		},
		fetchImpl: async () => ({ ok: false, status: 404 }),
	});

	assert.equal(await provider.getPost("missing"), undefined);
});
