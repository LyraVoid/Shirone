import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const CLASSIFIER = fileURLToPath(
	new URL("../scripts/ci/classify-browser-suites.sh", import.meta.url),
);
const HAS_BASH =
	process.platform !== "win32" &&
	spawnSync("bash", ["--version"], { stdio: "ignore" }).status === 0;

function git(cwd, ...args) {
	return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function classifyChange({ paths = [], rename, invalidBase = false }) {
	const temp = mkdtempSync(join(tmpdir(), "shirone-ci-path-filter-"));
	const repo = join(temp, "repo");
	const output = join(temp, "github-output.txt");
	mkdirSync(repo);
	try {
		git(repo, "init", "--quiet");
		git(repo, "config", "user.name", "CI path filter test");
		git(repo, "config", "user.email", "ci-path-filter@example.invalid");
		git(repo, "config", "core.quotePath", "true");
		writeFileSync(join(repo, "baseline.md"), "unchanged\n");
		mkdirSync(join(repo, "src"), { recursive: true });
		writeFileSync(join(repo, "src", "move-me.svelte"), "same content\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "base");
		const base = git(repo, "rev-parse", "HEAD");

		if (rename) {
			const source = join(repo, rename.from);
			const destination = join(repo, rename.to);
			mkdirSync(dirname(destination), { recursive: true });
			renameSync(source, destination);
		} else {
			for (const path of paths) {
				const file = join(repo, path);
				mkdirSync(dirname(file), { recursive: true });
				writeFileSync(file, `changed: ${path}\n`);
			}
		}

		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "change");
		const head = git(repo, "rev-parse", "HEAD");
		writeFileSync(output, "");
		const result = spawnSync(
			"bash",
			[CLASSIFIER, invalidBase ? "missing-base-sha" : base, head, output],
			{ cwd: repo, encoding: "utf8" },
		);
		return { result, output: readFileSync(output, "utf8") };
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}

function assertClassification(options, expected) {
	const { result, output } = classifyChange(options);
	assert.equal(result.status, 0, result.stderr || result.error?.message);
	assert.deepEqual(
		Object.fromEntries(output.trim().split("\n").map((line) => line.split("="))),
		expected,
	);
}

test("changed-path browser classifier handles Git paths and fails closed", { skip: !HAS_BASH }, async (t) => {
	const both = { comments: "true", styles: "true" };
	const cases = [
		["Unicode content paths", ["src/content/posts/中文文章.md"], both],
		["Unicode component paths", ["src/components/示例.svelte"], both],
		["TypeScript config", ["tsconfig.json"], both],
		["additional TypeScript config", ["tsconfig.build.json"], both],
		["npm install config", [".npmrc"], both],
		["Biome config", ["biome.json"], both],
		["Pagefind config", ["pagefind.yml"], both],
		["frontmatter config", ["frontmatter.json"], both],
		["Vercel config", ["vercel.json"], both],
		["Lighthouse config", ["lighthouserc.cjs"], both],
		["Astro config", ["astro.config.mjs"], both],
		["package manifest", ["package.json"], both],
		["pnpm lockfile", ["pnpm-lock.yaml"], both],
		["pnpm workspace config", ["pnpm-workspace.yaml"], both],
		["site browser tests", ["tests/site/comments.spec.ts"], both],
		["nested CI scripts", ["scripts/ci/another-classifier.sh"], both],
		["fixture-only change", ["tests/fixtures/waline-options.ts"], { comments: "true", styles: "false" }],
		["fixture config remains comment-only", ["tests/fixtures/content/waline/config/site.config.ts"], { comments: "true", styles: "false" }],
		["fixture plus docs still selects comments only", ["tests/fixtures/waline-options.ts", "docs/guide.md"], { comments: "true", styles: "false" }],
		["documentation-only change", ["docs/guide.md"], { comments: "false", styles: "false" }],
		["documentation config-like path is still skipped", ["docs/site.config.ts"], { comments: "false", styles: "false" }],
		["unknown future config fails closed", ["config/new-runtime.json"], both],
		["unknown path overrides a docs-only fast path", ["docs/guide.md", "config/new-runtime.json"], both],
		["unrelated unit test", ["tests/version-range.test.mjs"], { comments: "false", styles: "false" }],
	];

	for (const [label, paths, expected] of cases) {
		await t.test(label, () => assertClassification({ paths }, expected));
	}

	await t.test("moving a source file out of src still selects both suites", () => {
		assertClassification(
			{ rename: { from: "src/move-me.svelte", to: "docs/move-me.svelte" } },
			both,
		);
	});

	await t.test("a failed git diff writes no skip outputs", () => {
		const { result, output } = classifyChange({ paths: ["docs/change.md"], invalidBase: true });
		assert.notEqual(result.status, 0);
		assert.equal(output, "");
		assert.match(`${result.stdout}\n${result.stderr}`, /Failed to compute changed paths/);
	});
});
