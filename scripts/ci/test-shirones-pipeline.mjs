/**
 * Run yCENzh/shirones' JavaScript contract tests against this exact Shirone
 * checkout. The CI job sets up Node and pnpm; this script owns the rest of the
 * cross-repository test flow and removes all temporary files/refs afterward.
 */

import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const THEME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PIPELINE_REPO = "https://github.com/yCENzh/shirones.git";
const PIPELINE_REF = "work";
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
	console.log(`[shirones-contracts] creating temporary theme ref ${THEME_REF}`);
	run("git", ["branch", "--force", THEME_REF, "HEAD"], { cwd: THEME_DIR });
	themeRefCreated = true;

	console.log(`[shirones-contracts] cloning ${PIPELINE_REPO}@${PIPELINE_REF}`);
	run(
		"git",
		[
			"clone",
			"--depth",
			"1",
			"--single-branch",
			"--branch",
			PIPELINE_REF,
			PIPELINE_REPO,
			PIPELINE_DIR,
		],
		{ cwd: TEMP_DIR },
	);

	console.log("[shirones-contracts] installing pipeline dependencies");
	run("pnpm", ["install", "--frozen-lockfile"], { cwd: PIPELINE_DIR });

	console.log("[shirones-contracts] syncing the tested theme revision");
	run("pnpm", ["templates"], {
		cwd: PIPELINE_DIR,
		env: {
			SHIRONES_UPSTREAM_REPO: pathToFileURL(THEME_DIR).href,
			SHIRONES_UPSTREAM_REF: THEME_REF,
		},
	});

	const scriptsDir = join(PIPELINE_DIR, "scripts");
	const testFiles = (await readdir(scriptsDir))
		.filter((file) => file.endsWith(".test.mjs"))
		.sort()
		.map((file) => join("scripts", file));
	if (testFiles.length === 0) {
		throw new Error(`No pipeline JavaScript tests found in ${scriptsDir}`);
	}

	console.log(`[shirones-contracts] running ${testFiles.length} JavaScript test files`);
	run(process.execPath, ["--test", ...testFiles], { cwd: PIPELINE_DIR });
} finally {
	if (themeRefCreated) {
		try {
			run("git", ["branch", "--delete", THEME_REF], { cwd: THEME_DIR });
		} catch (error) {
			console.warn(`[shirones-contracts] could not delete temporary ref: ${error.message}`);
		}
	}
	await rm(TEMP_DIR, { recursive: true, force: true });
}
