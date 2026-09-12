import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLI_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/cli.mjs", import.meta.url),
);

function runCli(args = [], { cwd } = {}) {
	const result = spawnSync(process.execPath, [CLI_SCRIPT, ...args], {
		cwd,
		encoding: "utf8",
		env: { ...process.env, SHIRONE_CONTENT_SYNC: "0" },
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

describe("content CLI 总入口与帮助指令", () => {
	it("无参数、--help、-h 或 help 时打印全景帮助文档", () => {
		for (const flag of [[], ["--help"], ["-h"], ["help"]]) {
			const res = runCli(flag);
			assert.equal(res.status, 0);
			assert.match(res.stdout, /Shirone Content Separation CLI/i);
			assert.match(res.stdout, /sync/);
			assert.match(res.stdout, /clean/);
			assert.match(res.stdout, /export/);
			assert.match(res.stdout, /eject/);
			assert.match(res.stdout, /watch/);
			assert.match(res.stdout, /validate/);
			assert.match(res.stdout, /Core Workflow Lifecycle/i);
		}
	});

	it("未知指令报错并退出码 1，同时打印可用指令指引", () => {
		const res = runCli(["unknown-cmd"]);
		assert.equal(res.status, 1);
		assert.match(res.stderr, /Unknown command: "unknown-cmd"/);
		assert.match(res.stdout, /Available commands:/);
	});

	it("子命令分发：clean 预演透传", () => {
		const res = runCli(["clean", "--dry-run"]);
		assert.equal(res.status, 0);
		assert.match(res.stdout, /Dry-run mode/i);
	});

	it("子命令分发：export 预演透传", () => {
		const res = runCli(["export", "--dry-run"]);
		// local 模式下 export 预演会提示 local 模式
		assert.match(res.output, /Dry-run mode|local/i);
	});

	it("子命令分发：validate 透传", () => {
		const res = runCli(["validate"]);
		assert.equal(res.status, 0);
	});

	it("子命令分发：status 诊断输出", () => {
		const root = mkdtempSync(join(tmpdir(), "shirone-content-cli-"));
		try {
			const userDirectory = join(root, "src/user");
			mkdirSync(userDirectory, { recursive: true });
			writeFileSync(
				join(userDirectory, "user-config.ts"),
				"export const userConfigOverrides = {};\nexport const userConfigSources = [];\n",
			);
			const res = runCli(["status"], { cwd: root });
			assert.equal(res.status, 0);
			assert.match(
				res.stdout,
				/Shirone Content Separation Status & Connectivity Report/,
			);
			assert.match(res.stdout, /Runtime Mode & Decision Provenance/);
			assert.match(res.stdout, /Content Source Connectivity & Git Status/);
			assert.match(
				res.stdout,
				/Code Repository Materialized State, Lock File & Freshness/,
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("各具体子脚本均支持 --help", () => {
		for (const sub of ["status", "sync", "clean", "export", "eject"]) {
			const res = runCli([sub, "--help"]);
			assert.equal(res.status, 0, `subcommand ${sub} should exit 0 on --help`);
			assert.match(res.output, /Usage:/);
		}
	});

	it("所有公开子命令都拒绝未知参数", () => {
		for (const sub of [
			"status",
			"sync",
			"clean",
			"export",
			"eject",
			"watch",
			"validate",
		]) {
			const res = runCli([sub, "--definitely-unknown"]);
			assert.equal(
				res.status,
				1,
				`subcommand ${sub} should reject unknown args`,
			);
			assert.match(
				res.output,
				/Unsupported argument|does not support argument/i,
			);
		}
	});
});
