/**
 * Shirone 内容体系统一 CLI 分发器与帮助入口。
 *
 * 用法：
 *   pnpm content --help                     # 查看全套指令说明与核心工作流关系
 *   pnpm content status [--remote]           # 检查内容连接与物化新旧状态
 *   pnpm content sync [args...]             # 等同于 pnpm content:sync
 *   pnpm content clean [args...]            # 等同于 pnpm content:clean
 *   pnpm content export [args...]           # 等同于 pnpm content:export
 *   pnpm content eject [args...]            # 等同于 pnpm content:eject
 *   pnpm content watch [args...]            # 等同于 pnpm content:watch
 *   pnpm content validate [args...]         # 等同于 pnpm content:validate
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const command = args[0];

const COMMAND_MAP = {
	status: {
		script: join(DIR, "status.mjs"),
		extraArgs: [],
		description:
			"Status diagnostics: inspect content source, Git, config types, lock file, and materialization freshness",
	},
	sync: {
		script: join(DIR, "sync.mjs"),
		extraArgs: [],
		description:
			"Materialize content: incrementally sync external content directories into code repository and compile config overlays",
	},
	clean: {
		script: join(DIR, "clean.mjs"),
		extraArgs: [],
		description:
			"Safe clean: restore materialized content and reset config overlays (dry-run by default, use --yes to apply)",
	},
	export: {
		script: join(DIR, "export.mjs"),
		extraArgs: [],
		description:
			"Reverse export: write code repository changes and config diffs back to content repository (dry-run by default, use --yes to apply)",
	},
	eject: {
		script: join(DIR, "eject.mjs"),
		extraArgs: [],
		description:
			"One-click eject: migrate single-repository setup to standalone content repository architecture (dry-run by default, use --yes to apply)",
	},
	watch: {
		script: join(DIR, "sync.mjs"),
		extraArgs: ["--watch"],
		description:
			"Watch mode: watch local content directory and automatically sync on change",
	},
	validate: {
		script: join(DIR, "sync.mjs"),
		extraArgs: ["--dry-run"],
		description:
			"Structure validation: pre-check content source structure, conflicts, and YAML types (without disk writes)",
	},
};

function printHelp() {
	console.log(
		[
			"Shirone Content Separation CLI Toolchain",
			"",
			"Usage:",
			"  pnpm content <command> [options]",
			"  pnpm content:<command> [options]",
			"",
			"Available commands:",
			`  status    ${COMMAND_MAP.status.description}`,
			`  sync      ${COMMAND_MAP.sync.description}`,
			`  clean     ${COMMAND_MAP.clean.description}`,
			`  export    ${COMMAND_MAP.export.description}`,
			`  eject     ${COMMAND_MAP.eject.description}`,
			`  watch     ${COMMAND_MAP.watch.description}`,
			`  validate  ${COMMAND_MAP.validate.description}`,
			"",
			"Core Workflow Lifecycle:",
			"  Content Repo ──content:sync──▶ Code Repo          Materialize",
			"  Content Repo ◀──content:export── Code Repo        Reverse Export",
			"  Code Repo ──content:clean──▶ Theme Defaults       Clean",
			"  Content Repo ◀──content:eject── Code Repo          One-time Eject",
			"",
			"Help:",
			"  View subcommand help: pnpm content <command> --help",
			"  Full documentation: docs/content-separation/README.md",
		].join("\n"),
	);
}

if (
	!command ||
	command === "--help" ||
	command === "-h" ||
	command === "help"
) {
	printHelp();
	process.exit(0);
}

const target = COMMAND_MAP[command];
if (!target) {
	console.error(`[content] Unknown command: "${command}"\n`);
	printHelp();
	process.exit(1);
}

const restArgs = args.slice(1);
const forwardedArgs = [...target.extraArgs, ...restArgs];

const result = spawnSync(process.execPath, [target.script, ...forwardedArgs], {
	stdio: "inherit",
	env: process.env,
});

if (result.error) {
	console.error(
		`[content] Failed to start child process: ${result.error.message}`,
	);
	process.exit(1);
}

if (result.signal) {
	console.error(
		`[content] Subcommand was terminated by signal ${result.signal}.`,
	);
}
process.exit(result.status ?? 1);
