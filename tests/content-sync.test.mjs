import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	applyMappedContent,
	mapContentTree,
	rewritePaths,
} from "../scripts/content-sync-lib.mjs";

test("path rewriting leaves external URLs intact", () => {
	const externalUrl = "https://example.test/images/albums/photo.webp";
	assert.equal(rewritePaths(externalUrl, "source-to-content"), externalUrl);
	const queryUrl = "https://example.test/?src=/images/albums/photo.webp";
	assert.equal(rewritePaths(queryUrl, "source-to-content"), queryUrl);
});

test("staged content replaces managed files and preserves album instructions", async () => {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "shirone-content-stage-"));
	const project = path.join(root, "project");
	const stage = path.join(root, "stage");

	const write = async (base, relativePath, value) => {
		const filePath = path.join(base, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, value);
	};

	try {
		await fs.mkdir(path.join(project, ".temp"), { recursive: true });
		await write(project, "src/content/posts/old.md", "old");
		await write(project, "public/images/albums/old.webp", Buffer.from([1]));
		await write(project, "public/images/albums/AGENTS.md", "keep");
		await write(stage, "src/content/posts/new.md", "new");
		await write(stage, "public/images/albums/new.webp", Buffer.from([2]));
		await write(stage, "src/data/anime-snapshots/.gitkeep", "");

		assert.equal(await applyMappedContent(stage, project), 3);
		await assert.rejects(fs.stat(path.join(project, "src/content/posts/old.md")));
		await assert.rejects(
			fs.stat(path.join(project, "public/images/albums/old.webp")),
		);
		assert.equal(
			await fs.readFile(path.join(project, "public/images/albums/AGENTS.md"), "utf8"),
			"keep",
		);
		assert.equal(
			await fs.readFile(path.join(project, "src/content/posts/new.md"), "utf8"),
			"new",
		);
		assert.equal(
			await fs.readFile(
				path.join(project, "src/data/anime-snapshots/.gitkeep"),
				"utf8",
			),
			"",
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
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
