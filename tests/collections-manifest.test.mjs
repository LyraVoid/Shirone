import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
	readFileSync(join(root, "src/integration/collections.manifest.json"), "utf8"),
);
const collectionsTs = readFileSync(
	join(root, "src/integration/collections.ts"),
	"utf8",
);
const contentConfig = readFileSync(
	join(root, "src/content.config.ts"),
	"utf8",
);

/**
 * `collections.manifest.json` is the single list of content collections, read
 * by the shirones pipeline to generate a package-mode user's
 * `src/content.config.ts`. Nothing in the theme imports it at runtime, so
 * these tests are what keep it from drifting away from the two files that
 * actually matter.
 */
describe("collections manifest", () => {
	it("is a non-empty list of well-formed entries", () => {
		assert.ok(Array.isArray(manifest) && manifest.length > 0);
		for (const entry of manifest) {
			assert.match(entry.key, /^[a-z][a-zA-Z0-9]*$/, `bad key ${entry.key}`);
			assert.ok(entry.pattern, `${entry.key} has no pattern`);
			assert.match(
				entry.schema,
				/^[a-z][a-zA-Z0-9]*Schema$/,
				`${entry.key} has a non-conventional schema name`,
			);
		}
		const keys = manifest.map((e) => e.key);
		assert.equal(new Set(keys).size, keys.length, "duplicate collection keys");
	});

	it("names a schema that collections.ts actually exports", () => {
		for (const { key, schema } of manifest) {
			assert.ok(
				new RegExp(`export const ${schema}\\b`).test(collectionsTs),
				`${key}: collections.ts does not export ${schema}`,
			);
		}
	});

	it("matches every collection declared in src/content.config.ts", () => {
		// The repo's own config is the source-mode truth; the manifest must
		// describe exactly the same set, with the same glob pattern.
		const declared = [
			...contentConfig.matchAll(
				/glob\(\{\s*base:\s*["']\.\/src\/content\/([a-zA-Z0-9]+)["'],\s*pattern:\s*["']([^"']+)["']/g,
			),
		].map((m) => ({ key: m[1], pattern: m[2] }));

		assert.ok(declared.length > 0, "found no collections in content.config.ts");

		for (const { key, pattern } of declared) {
			const entry = manifest.find((e) => e.key === key);
			assert.ok(entry, `${key} is in content.config.ts but not the manifest`);
			assert.equal(
				entry.pattern,
				pattern,
				`${key}: manifest pattern differs from content.config.ts`,
			);
		}
		for (const { key } of manifest) {
			assert.ok(
				declared.some((d) => d.key === key),
				`${key} is in the manifest but not content.config.ts`,
			);
		}
	});

	it("points at a directory that exists in this repository", () => {
		for (const { key } of manifest) {
			assert.ok(
				existsSync(join(root, "src/content", key)),
				`${key}: src/content/${key}/ does not exist — the glob loader would warn`,
			);
		}
	});
});
