import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	countTaggedPosts,
	normalizeTags,
} from "../../src/utils/taxonomy-utils.ts";

describe("normalizeTags", () => {
	it("trims, dedupes and drops empty tags while preserving order", () => {
		assert.deepEqual(normalizeTags([" JS ", "JS", "", " Foo ", "JS"]), [
			"JS",
			"Foo",
		]);
	});

	it("returns an empty list for missing or empty input", () => {
		assert.deepEqual(normalizeTags(undefined), []);
		assert.deepEqual(normalizeTags(null), []);
		assert.deepEqual(normalizeTags([]), []);
		assert.deepEqual(normalizeTags(["   "]), []);
	});
});

describe("countTaggedPosts", () => {
	it("counts each multi-tag post once and skips untagged posts", () => {
		const posts = [
			{ data: { tags: ["A", "B", "C"] } },
			{ data: { tags: ["A"] } },
			{ data: { tags: [] } },
			{ data: { tags: ["   "] } },
			{ data: { tags: [" JS ", "JS"] } },
			{ data: {} },
		];
		assert.equal(countTaggedPosts(posts), 3);
	});
});
