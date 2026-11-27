import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Biome 2.6 started formatting Markdown, but it does not understand YAML
// frontmatter: it reflows the block as prose, which turns a nested list such as
// a moment's `images:` into invalid YAML and makes Astro's content loader throw.
// It also rewrites the code inside fenced blocks, i.e. the samples the demo
// posts exist to show.
//
// `pnpm format` is mandatory before every commit and runs with `--write`, so the
// repository's own `biome.json` has to keep Biome away from Markdown. These
// tests run the installed Biome against that config rather than asserting on the
// config text, so they keep holding however the exclusion is expressed.

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const BIOME = join(ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");

const MOMENT = [
	"---",
	"published: 2026-07-30T14:20:00+08:00",
	"tags:",
	"  - life",
	"images:",
	"  - src: /images/moments/scene-1.webp",
	"    alt: Scene one",
	"---",
	"",
	"A moment.",
	"",
	"```ts",
	"const sample = {",
	"    indented: 'with four spaces',",
	"};",
	"```",
	"",
].join("\n");

// Deliberately not Biome's style, so a rewrite proves Biome really ran.
const SCRIPT = "export const value = 'single';\n";

function createProject() {
	const dir = mkdtempSync(join(tmpdir(), "shirone-biome-markdown-"));
	copyFileSync(join(ROOT, "biome.json"), join(dir, "biome.json"));
	writeFileSync(join(dir, "moment.md"), MOMENT);
	writeFileSync(join(dir, "script.ts"), SCRIPT);
	return dir;
}

function biome(cwd, args) {
	return spawnSync(process.execPath, [BIOME, ...args, "--colors=off"], {
		cwd,
		encoding: "utf8",
	});
}

for (const command of ["format", "check"]) {
	test(`biome ${command} --write leaves Markdown untouched`, (t) => {
		const dir = createProject();
		t.after(() => rmSync(dir, { recursive: true, force: true }));

		const result = biome(dir, [command, "--write", "."]);
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.equal(
			readFileSync(join(dir, "script.ts"), "utf8"),
			'export const value = "single";\n',
			"Biome should still format source files with this config",
		);
		assert.equal(readFileSync(join(dir, "moment.md"), "utf8"), MOMENT);
	});
}
