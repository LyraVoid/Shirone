import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * F-19: the spawned preview server needs an `error` listener — an ENOENT on
 * the preview command otherwise escapes as an uncaught exception with no
 * readable message.
 */
test("perf measure attaches an error handler to the preview server spawn", async () => {
	const source = await readFile(
		fileURLToPath(new URL("../scripts/perf/measure.mjs", import.meta.url)),
		"utf8",
	);
	assert.match(source, /serverProcess\.on\(\s*["']error["']/);
});
