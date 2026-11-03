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
import { parse as parseYaml } from "yaml";

const CLASSIFIER = fileURLToPath(
	new URL("../scripts/ci/classify-browser-suites.sh", import.meta.url),
);
const WORKFLOW = fileURLToPath(
	new URL("../.github/workflows/ci.yml", import.meta.url),
);
const GUARD = fileURLToPath(
	new URL("../scripts/ci/classifier-change-guard.sh", import.meta.url),
);
const DETECTOR = fileURLToPath(
	new URL("../scripts/ci/detect-browser-suites.sh", import.meta.url),
);
const CAN_RUN_BASH_PATH_TESTS =
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
		Object.fromEntries(
			output
				.trim()
				.split("\n")
				.map((line) => line.split("=")),
		),
		expected,
	);
}

test("workflow delegates changed-path outputs to the tested detector", () => {
	const workflow = parseYaml(readFileSync(WORKFLOW, "utf8"));
	const classifyStep = workflow.jobs.changes.steps.find(
		(step) => step.id === "filter",
	);
	assert.ok(classifyStep, "changed-path classifier step must exist");
	assert.ok(
		classifyStep.run.includes(
			'scripts/ci/detect-browser-suites.sh "$base" "$head" "$GITHUB_OUTPUT"',
		),
		"workflow must invoke the detector that combines the guard and classifier",
	);
	assert.doesNotMatch(
		classifyStep.run,
		/scripts\/ci\/(?:classifier-change-guard|classify-browser-suites)\.sh/,
		"workflow must not append either intermediate result directly to GITHUB_OUTPUT",
	);
});

function runWorkflowDetector(cwd, detector, base, head, outputFile) {
	writeFileSync(outputFile, "");
	const result = spawnSync("bash", [detector, base, head, outputFile], {
		cwd,
		encoding: "utf8",
	});
	return { result, output: readFileSync(outputFile, "utf8") };
}

test("workflow detector keeps guard outputs authoritative after the classifier runs", {
	skip: !CAN_RUN_BASH_PATH_TESTS,
}, () => {
	const temp = mkdtempSync(join(tmpdir(), "shirone-workflow-detector-"));
	const repo = join(temp, "repo");
	const scriptsDir = join(repo, "scripts", "ci");
	const output = join(temp, "github-output.txt");
	mkdirSync(scriptsDir, { recursive: true });
	try {
		git(repo, "init", "--quiet");
		git(repo, "config", "user.name", "CI workflow detector test");
		git(repo, "config", "user.email", "ci-detector@example.invalid");

		for (const [source, name] of [
			[GUARD, "classifier-change-guard.sh"],
			[CLASSIFIER, "classify-browser-suites.sh"],
			[DETECTOR, "detect-browser-suites.sh"],
		]) {
			writeFileSync(join(scriptsDir, name), readFileSync(source), {
				mode: 0o755,
			});
		}
		const docs = join(repo, "docs", "guide.md");
		mkdirSync(dirname(docs), { recursive: true });
		writeFileSync(docs, "baseline\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "base");
		const base = git(repo, "rev-parse", "HEAD");

		// An ordinary docs-only diff should use the classifier's false values.
		writeFileSync(docs, "documentation change\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "docs change");
		const docsHead = git(repo, "rev-parse", "HEAD");
		const docsResult = runWorkflowDetector(
			repo,
			join(scriptsDir, "detect-browser-suites.sh"),
			base,
			docsHead,
			output,
		);
		assert.equal(docsResult.result.status, 0, docsResult.result.stderr);
		assert.equal(docsResult.output, "comments=false\nstyles=false\n");

		// Simulate a classifier edit that now reports false for its own change.
		// The guard and classifier both run, but only the guard's true values
		// should be written to the workflow output file.
		const classifier = join(scriptsDir, "classify-browser-suites.sh");
		writeFileSync(
			classifier,
			[
				"#!/usr/bin/env bash",
				"set -euo pipefail",
				"printf 'ran\\n' > classifier-ran.txt",
				"printf 'comments=false\\nstyles=false\\n' >> \"$3\"",
				"",
			].join("\n"),
		);
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "classifier change");
		const classifierHead = git(repo, "rev-parse", "HEAD");
		const changedClassifier = runWorkflowDetector(
			repo,
			join(scriptsDir, "detect-browser-suites.sh"),
			base,
			classifierHead,
			output,
		);
		assert.equal(
			changedClassifier.result.status,
			0,
			changedClassifier.result.stderr,
		);
		assert.equal(changedClassifier.output, "comments=true\nstyles=true\n");
		assert.equal(
			readFileSync(join(repo, "classifier-ran.txt"), "utf8"),
			"ran\n",
			"classifier should run into its separate output file before the guard result is chosen",
		);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

function runWorkflowGuard(cwd, base, head, outputFile) {
	writeFileSync(outputFile, "");
	const result = spawnSync("bash", [GUARD, base, head, outputFile], {
		cwd,
		encoding: "utf8",
	});
	return { result, output: readFileSync(outputFile, "utf8") };
}

test("classifier guard distinguishes a classifier diff from a git error", {
	skip: !CAN_RUN_BASH_PATH_TESTS,
}, () => {
	const temp = mkdtempSync(join(tmpdir(), "shirone-workflow-guard-"));
	const repo = join(temp, "repo");
	const output = join(temp, "github-output.txt");
	mkdirSync(repo);
	try {
		git(repo, "init", "--quiet");
		git(repo, "config", "user.name", "CI workflow guard test");
		git(repo, "config", "user.email", "ci-guard@example.invalid");
		const classifier = join(
			repo,
			"scripts",
			"ci",
			"classify-browser-suites.sh",
		);
		mkdirSync(dirname(classifier), { recursive: true });
		writeFileSync(classifier, "#!/usr/bin/env bash\n# baseline\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "base");
		const base = git(repo, "rev-parse", "HEAD");

		const unchanged = runWorkflowGuard(repo, base, base, output);
		assert.equal(unchanged.result.status, 0, unchanged.result.stderr);
		assert.equal(unchanged.output, "");

		writeFileSync(classifier, "#!/usr/bin/env bash\n# changed\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "classifier change");
		const head = git(repo, "rev-parse", "HEAD");
		const changed = runWorkflowGuard(repo, base, head, output);
		assert.equal(changed.result.status, 0, changed.result.stderr);
		assert.deepEqual(changed.output.trim().split("\n").sort(), [
			"comments=true",
			"styles=true",
		]);

		const failed = runWorkflowGuard(repo, "missing-base-sha", head, output);
		assert.notEqual(failed.result.status, 0);
		assert.equal(failed.output, "");
		assert.match(
			`${failed.result.stdout}\n${failed.result.stderr}`,
			/Failed to check whether the changed-path classifier or orchestrator changed/,
		);

		// The orchestrator decides which suites run, so it is part of the same
		// trust boundary: editing it alone must force both suites too.
		const detector = join(repo, "scripts", "ci", "detect-browser-suites.sh");
		writeFileSync(detector, "#!/usr/bin/env bash\n# baseline\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "detector baseline");
		const detectorBase = git(repo, "rev-parse", "HEAD");
		writeFileSync(detector, "#!/usr/bin/env bash\n# changed\n");
		git(repo, "add", "--all");
		git(repo, "commit", "--quiet", "-m", "detector change");
		const detectorHead = git(repo, "rev-parse", "HEAD");
		const changedDetector = runWorkflowGuard(
			repo,
			detectorBase,
			detectorHead,
			output,
		);
		assert.equal(
			changedDetector.result.status,
			0,
			changedDetector.result.stderr,
		);
		assert.deepEqual(changedDetector.output.trim().split("\n").sort(), [
			"comments=true",
			"styles=true",
		]);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
});

test("changed-path browser classifier handles Git paths and fails closed", {
	skip: !CAN_RUN_BASH_PATH_TESTS,
}, async (t) => {
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
		["example content config", ["shirone.content.example.json"], both],
		["Vercel config", ["vercel.json"], both],
		["Lighthouse config", ["lighthouserc.cjs"], both],
		["Astro config", ["astro.config.mjs"], both],
		["package manifest", ["package.json"], both],
		["pnpm lockfile", ["pnpm-lock.yaml"], both],
		["pnpm workspace config", ["pnpm-workspace.yaml"], both],
		["site browser tests", ["tests/site/comments.spec.ts"], both],
		["nested CI scripts", ["scripts/ci/another-classifier.sh"], both],
		["classifier self-change", ["scripts/ci/classify-browser-suites.sh"], both],
		[
			"fixture-only change",
			["tests/fixtures/waline-options.ts"],
			{ comments: "true", styles: "false" },
		],
		[
			"fixture config remains comment-only",
			["tests/fixtures/content/waline/config/site.config.ts"],
			{ comments: "true", styles: "false" },
		],
		[
			"fixture plus docs still selects comments only",
			["tests/fixtures/waline-options.ts", "docs/guide.md"],
			{ comments: "true", styles: "false" },
		],
		[
			"documentation-only change",
			["docs/guide.md"],
			{ comments: "false", styles: "false" },
		],
		[
			"documentation config-like path is still skipped",
			["docs/site.config.ts"],
			{ comments: "false", styles: "false" },
		],
		["unknown future config fails closed", ["config/new-runtime.json"], both],
		[
			"unknown path overrides a docs-only fast path",
			["docs/guide.md", "config/new-runtime.json"],
			both,
		],
		[
			"unrelated unit test",
			["tests/version-range.test.mjs"],
			{ comments: "false", styles: "false" },
		],
		[
			"nested Node unit test",
			["tests/plugins/markdown/katex-version.test.mjs"],
			{ comments: "false", styles: "false" },
		],
	];

	for (const [label, paths, expected] of cases) {
		await t.test(label, () => assertClassification({ paths }, expected));
	}

	await t.test(
		"moving a source file out of src still selects both suites",
		() => {
			assertClassification(
				{ rename: { from: "src/move-me.svelte", to: "docs/move-me.svelte" } },
				both,
			);
		},
	);

	await t.test("a failed git diff writes no skip outputs", () => {
		const { result, output } = classifyChange({
			paths: ["docs/change.md"],
			invalidBase: true,
		});
		assert.notEqual(result.status, 0);
		assert.equal(output, "");
		assert.match(
			`${result.stdout}\n${result.stderr}`,
			/Failed to compute changed paths/,
		);
	});
});
