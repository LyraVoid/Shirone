import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mapContentTree, rewritePaths } from "../scripts/content-sync-lib.mjs";

test("path rewriting leaves external URLs intact", () => {
	const externalUrl = "https://example.test/images/albums/photo.webp";
	assert.equal(rewritePaths(externalUrl, "source-to-content"), externalUrl);
});

test("content mapping preserves binary assets and rewrites paths", async () => {
	const root = await fs.mkdtemp(
		path.join(os.tmpdir(), "shirone-content-test-"),
	);
	const source = path.join(root, "source");
	const content = path.join(root, "content");
	const target = path.join(root, "target");
	const binary = Buffer.from([0, 255, 17, 34, 0]);

	const write = async (relativePath, value) => {
		const filePath = path.join(source, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, value);
	};

	try {
		await write(
			"src/content/posts/demo/index.md",
			"![x](/images/albums/a.webp)",
		);
		await write("src/content/posts/demo/cover.webp", binary);
		await write("src/content/moments/one.md", "![x](/images/moments/a.webp)");
		await write("src/content/moments/images/leak.webp", binary);
		await write("public/images/moments/a.webp", binary);
		await write("src/assets/images/banner/desktop/1.webp", binary);
		await write("public/assets/banner/desktop/1.webp", Buffer.from([9, 8, 7]));
		await write("public/images/albums/README.md", "ignore");
		await write("public/images/albums/AGENTS.md", "ignore");
		await write("public/images/albums/a/info.json", "{}");
		await write(
			"src/data/music.ts",
			'export const x = "/assets/music/url/a.mp3";',
		);

		assert.equal(await mapContentTree(content, source, "source-to-content"), 7);
		await assert.rejects(
			fs.stat(path.join(content, "moments/images/leak.webp")),
		);
		await assert.rejects(fs.stat(path.join(content, "albums/README.md")));
		assert.deepEqual(
			await fs.readFile(path.join(content, "posts/demo/cover.webp")),
			binary,
		);
		assert.match(
			await fs.readFile(path.join(content, "posts/demo/index.md"), "utf8"),
			/\balbums\/a\.webp\b/,
		);
		assert.match(
			await fs.readFile(path.join(content, "data/music.ts"), "utf8"),
			/data\/assets\/music\/url\/a\.mp3/,
		);
		assert.deepEqual(
			await fs.readFile(
				path.join(content, "data/assets/banner/desktop/1.webp"),
			),
			binary,
		);

		await mapContentTree(content, target, "content-to-source");
		assert.deepEqual(
			await fs.readFile(path.join(target, "src/content/posts/demo/cover.webp")),
			binary,
		);
		assert.match(
			await fs.readFile(
				path.join(target, "src/content/posts/demo/index.md"),
				"utf8",
			),
			/\/images\/albums\/a\.webp/,
		);
		assert.deepEqual(
			await fs.readFile(
				path.join(target, "public/assets/banner/desktop/1.webp"),
			),
			binary,
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
});
