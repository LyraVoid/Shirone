/**
 * Run yCENzh/shirones' complete pre-publish pipeline against this exact
 * Shirone checkout. `pnpm all` covers the pipeline tests, template generation,
 * package build, packed-tarball/CLI validation, and override tests; it never
 * publishes. CI sets up Node and pnpm, while this script owns the temporary
 * cross-repository refs and removes them afterward.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THEME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PIPELINE_REPO = "https://github.com/yCENzh/shirones.git";
const PIPELINE_COMMIT = "38346f1dea9ea9e2c30e87551807a9ba58707bbf";
const TEMP_BASE = process.env.RUNNER_TEMP || tmpdir();
const TEMP_DIR = await mkdtemp(join(TEMP_BASE, "shirones-pipeline-tests-"));
const PIPELINE_DIR = join(TEMP_DIR, "shirones");
const THEME_REF = `ci/shirones-${randomUUID()}`;
let themeRefCreated = false;

function run(command, args, { cwd, env } = {}) {
	let executable = command;
	let commandArgs = args;

	// pnpm's Windows shim is a .cmd file; invoke it through cmd.exe for local
	// runs on the repository's supported Windows development environment.
	if (command === "pnpm" && process.platform === "win32") {
		executable = process.env.ComSpec || "cmd.exe";
		commandArgs = ["/d", "/s", "/c", `pnpm.cmd ${args.join(" ")}`];
	}

	execFileSync(executable, commandArgs, {
		cwd,
		env: { ...process.env, ...env },
		stdio: "inherit",
	});
}

try {
	console.log(
		`[shirones-validation] creating temporary theme ref ${THEME_REF}`,
	);
	run("git", ["branch", "--force", THEME_REF, "HEAD"], { cwd: THEME_DIR });
	themeRefCreated = true;

	console.log(
		`[shirones-validation] fetching ${PIPELINE_REPO}@${PIPELINE_COMMIT}`,
	);
	run("git", ["init", "--quiet", PIPELINE_DIR], { cwd: TEMP_DIR });
	run("git", ["-C", PIPELINE_DIR, "remote", "add", "origin", PIPELINE_REPO], {
		cwd: TEMP_DIR,
	});
	run(
		"git",
		["-C", PIPELINE_DIR, "fetch", "--depth=1", "origin", PIPELINE_COMMIT],
		{ cwd: TEMP_DIR },
	);
	run("git", ["-C", PIPELINE_DIR, "checkout", "--detach", "FETCH_HEAD"], {
		cwd: TEMP_DIR,
	});
	const fetchedCommit = execFileSync(
		"git",
		["-C", PIPELINE_DIR, "rev-parse", "HEAD"],
		{ encoding: "utf8" },
	).trim();
	if (fetchedCommit !== PIPELINE_COMMIT) {
		throw new Error(
			`Expected Shirones ${PIPELINE_COMMIT}, fetched ${fetchedCommit}`,
		);
	}

	console.log("[shirones-validation] installing pipeline dependencies");
	run("pnpm", ["install", "--frozen-lockfile"], { cwd: PIPELINE_DIR });

	console.log(
		"[shirones-validation] running full package validation with `pnpm all`",
	);
	run("pnpm", ["all"], {
		cwd: PIPELINE_DIR,
		env: {
			SHIRONES_UPSTREAM_REPO: pathToFileURL(THEME_DIR).href,
			SHIRONES_UPSTREAM_REF: THEME_REF,
		},
	});
} finally {
	if (themeRefCreated) {
		try {
			run("git", ["branch", "--delete", THEME_REF], { cwd: THEME_DIR });
		} catch (error) {
			console.warn(
				`[shirones-validation] could not delete temporary ref: ${error.message}`,
			);
		}
	}
	await rm(TEMP_DIR, { recursive: true, force: true });
}
