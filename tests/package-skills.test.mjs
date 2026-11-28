import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts/package-skills.mjs");
const packageJson = JSON.parse(
	readFileSync(join(ROOT, "package.json"), "utf8"),
);

// The script derives its protected paths from its own location, so every test
// runs a copy inside a disposable project root.
function createFixture() {
	const base = mkdtempSync(join(tmpdir(), "shirones-package-skills-"));
	const root = join(base, "repo");
	mkdirSync(join(root, "scripts"), { recursive: true });
	mkdirSync(join(root, ".agents/skills/demo"), { recursive: true });
	copyFileSync(SCRIPT, join(root, "scripts/package-skills.mjs"));
	copyFileSync(join(ROOT, "package.json"), join(root, "package.json"));
	writeFileSync(
		join(root, ".agents/skills/demo/SKILL.md"),
		"---\nname: demo\ndescription: demo\n---\n",
	);
	return {
		base,
		root,
		marker: ".shirone-skills-package",
		run(...args) {
			return spawnSync(
				process.execPath,
				[join(root, "scripts/package-skills.mjs"), ...args],
				{ cwd: root, encoding: "utf8", timeout: 30_000 },
			);
		},
		cleanup() {
			rmSync(base, { recursive: true, force: true });
		},
	};
}

test("refuses the project root and its ancestors", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());

	for (const output of [fixture.root, fixture.base]) {
		const result = fixture.run("--output", output);
		assert.equal(result.status, 1, result.stdout);
		assert.match(result.stderr, /上级目录/);
	}
	assert.ok(existsSync(join(fixture.root, "package.json")));
	assert.ok(existsSync(join(fixture.root, ".agents/skills/demo/SKILL.md")));
});

test("refuses a symlinked ancestor and a symlink into the skills source", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const toBase = join(fixture.root, "to-base");
	const toSkills = join(fixture.root, "to-skills");
	symlinkSync(fixture.base, toBase, "dir");
	symlinkSync(join(fixture.root, ".agents/skills"), toSkills, "dir");

	assert.equal(fixture.run("--output", toBase).status, 1);
	assert.equal(fixture.run("--output", join(toSkills, "demo")).status, 1);
	assert.ok(existsSync(join(fixture.root, ".agents/skills/demo/SKILL.md")));
});

test("refuses a destination whose name starts with dots but stays inside", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const inside = join(fixture.root, ".agents/skills/..draft/package.zip");

	const result = fixture.run("--output", inside);
	assert.equal(result.status, 1, result.stdout);
	assert.match(result.stderr, /覆盖技能源目录/);
	assert.ok(existsSync(join(fixture.root, ".agents/skills/demo/SKILL.md")));
});

test("refuses a foreign directory even with --force", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const foreign = join(fixture.base, "foreign");
	mkdirSync(foreign);
	writeFileSync(join(foreign, "keep.txt"), "user data\n");

	const result = fixture.run("--output", foreign, "--force");
	assert.equal(result.status, 1, result.stdout);
	assert.match(result.stderr, /不是本工具生成的目录/);
	assert.equal(readFileSync(join(foreign, "keep.txt"), "utf8"), "user data\n");
	assert.equal(existsSync(join(foreign, fixture.marker)), false);
});

test("refuses a marker written by another tool", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const foreign = join(fixture.base, "other-plugin");
	mkdirSync(foreign);
	writeFileSync(join(foreign, fixture.marker), "other-plugin 1.0.0\n");
	writeFileSync(join(foreign, "keep.txt"), "user data\n");

	assert.equal(fixture.run("--output", foreign).status, 1);
	assert.ok(existsSync(join(foreign, "keep.txt")));
});

test("refuses an output path that is an existing file", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const file = join(fixture.base, "notes.txt");
	writeFileSync(file, "keep me\n");

	assert.equal(fixture.run("--output", file).status, 1);
	assert.equal(readFileSync(file, "utf8"), "keep me\n");
});

test("refreshes a directory this tool generated", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const output = join(fixture.base, "package");
	mkdirSync(output);
	writeFileSync(join(output, fixture.marker), "shirone-ai 0.0.1\n");
	writeFileSync(join(output, "stale.txt"), "old build\n");

	const result = fixture.run("--output", output);
	assert.equal(result.status, 0, result.stderr);
	assert.equal(existsSync(join(output, "stale.txt")), false);
	assert.ok(existsSync(join(output, "skills/demo/SKILL.md")));
	const manifest = JSON.parse(
		readFileSync(join(output, ".codex-plugin/plugin.json"), "utf8"),
	);
	assert.equal(manifest.version, packageJson.version);
});

test("zip packaging still builds through its own staging directory", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	if (spawnSync("zip", ["-v"]).error) {
		t.skip("zip is not installed");
		return;
	}
	const output = join(fixture.base, "bundle.zip");

	const result = fixture.run("--zip", "--output", output);
	assert.equal(result.status, 0, result.stderr);
	assert.ok(existsSync(output));
	assert.equal(
		readFileSync(join(fixture.root, "package.json"), "utf8").length > 0,
		true,
	);
});

test("refuses a symlink ZIP destination instead of deleting its target", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const notes = join(fixture.base, "notes.txt");
	const link = join(fixture.base, "bundle.zip");
	writeFileSync(notes, "keep me\n");
	symlinkSync(notes, link, "file");

	const result = fixture.run("--zip", "--output", link);
	assert.equal(result.status, 1, result.stdout);
	assert.equal(readFileSync(notes, "utf8"), "keep me\n");
});

test("refuses a marker whose plugin name only shares the prefix", (t) => {
	const fixture = createFixture();
	t.after(() => fixture.cleanup());
	const foreign = join(fixture.base, "other-plugin");
	mkdirSync(foreign);
	writeFileSync(join(foreign, fixture.marker), "shirone-ai-other 1.0.0\n");
	writeFileSync(join(foreign, "keep.txt"), "user data\n");

	assert.equal(fixture.run("--output", foreign).status, 1);
	assert.ok(existsSync(join(foreign, "keep.txt")));
});
