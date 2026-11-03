import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import { indexPagefindOutput } from "../src/integration/index.ts";

const siteRoot = mkdtempSync(join(tmpdir(), "shirones-pagefind-"));
const distDir = join(siteRoot, "dist");
mkdirSync(distDir);
writeFileSync(
	join(distDir, "index.html"),
	"<html><body><h1>Hello</h1><p>pagefind path probe</p></body></html>",
);

after(() => {
	rmSync(siteRoot, { recursive: true, force: true });
});

/** `config.root` and `astro:build:done` both use file URLs with a trailing slash. */
const outputUrl = () => pathToFileURL(`${distDir}${sep}`);

test("passes native filesystem paths to the Pagefind API", async () => {
	const calls = [];
	const index = {
		async addDirectory(options) {
			calls.push(["addDirectory", options.path]);
		},
		async writeFiles(options) {
			calls.push(["writeFiles", options.outputPath]);
		},
	};

	await indexPagefindOutput(outputUrl(), index);

	assert.deepEqual(calls, [
		["addDirectory", `${distDir}${sep}`],
		["writeFiles", join(distDir, "pagefind")],
	]);
	for (const [, path] of calls) {
		assert.doesNotMatch(
			path,
			/^[/\\][A-Za-z]:/,
			`URL pathname leaked into a filesystem path: ${path}`,
		);
	}
});

test("writes the index into the build output directory", async () => {
	const pagefind = await import("pagefind");
	const { index } = await pagefind.createIndex({});
	assert.ok(index, "Pagefind failed to create an index");

	await indexPagefindOutput(outputUrl(), index);

	const output = resolve(distDir, "pagefind");
	assert.ok(existsSync(output), `missing Pagefind output at ${output}`);
	assert.ok(existsSync(join(output, "pagefind.js")));
});
