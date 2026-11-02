import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
	EXCLUDED_STYLE_SPECS,
	listStyleRegressionSpecs,
} from "../scripts/ci/list-style-regression-specs.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SITE_TESTS = join(ROOT, "tests", "site");
const WORKFLOW_PATH = join(ROOT, ".github", "workflows", "ci.yml");

test("style runner includes every applicable site spec and excludes local-only suites", () => {
	const discovered = readdirSync(SITE_TESTS)
		.filter((name) => name.endsWith(".spec.ts"))
		.sort();
	const expected = discovered.filter((name) => !EXCLUDED_STYLE_SPECS.has(name));

	assert.deepEqual(listStyleRegressionSpecs(), expected);
	assert.equal(expected.length, discovered.length - EXCLUDED_STYLE_SPECS.size);
	assert.ok(expected.includes("series.spec.ts"));
	assert.ok(expected.includes("taxonomy.spec.ts"));
	assert.ok(!expected.includes("visual.spec.ts"));
	assert.ok(!expected.includes("comments.spec.ts"));
	assert.ok(!expected.includes("waline.spec.ts"));
});

test("workflow runs four style shards and retains a stable aggregate check", () => {
	const workflow = parse(readFileSync(WORKFLOW_PATH, "utf8"));
	const matrix = workflow.jobs["style-tests"]?.strategy?.matrix?.shard;
	assert.deepEqual(matrix, ["1/4", "2/4", "3/4", "4/4"]);
	assert.equal(workflow.jobs.styles.name, "Style regressions");
	assert.ok(workflow.jobs.styles.needs.includes("style-tests"));
	assert.match(
		workflow.jobs["style-tests"].steps.at(-1).run,
		/scripts\/ci\/run-style-regressions\.sh/,
	);
	// Preserve the core fixtures while allowing focused modes (for example,
	// `no-toc`) to be added without making this test brittle.
	const commentModes = workflow.jobs["comment-tests"].strategy.matrix.mode;
	assert.ok(Array.isArray(commentModes));
	for (const requiredMode of ["disabled", "waline", "twikoo"]) {
		assert.ok(
			commentModes.includes(requiredMode),
			`comment regression matrix must retain the ${requiredMode} fixture`,
		);
	}
	assert.equal(
		new Set(commentModes).size,
		commentModes.length,
		"comment regression matrix must not repeat a fixture",
	);
});
