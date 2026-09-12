import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { EMPTY_MODULE } from "../../scripts/content/config-overlay.mjs";

const STATUS_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/status.mjs", import.meta.url),
);
const SYNC_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/sync.mjs", import.meta.url),
);

function write(root, relativePath, contents = "test\n") {
	const absolute = join(root, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents);
	return absolute;
}

function git(cwd, args) {
	return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function initGit(root) {
	git(root, ["init", "--initial-branch=main"]);
	git(root, ["config", "user.name", "Status Test"]);
	git(root, ["config", "user.email", "status@example.com"]);
	git(root, ["config", "core.autocrlf", "false"]);
}

function commitAll(root, message = "test: fixture") {
	git(root, ["add", "-A"]);
	git(root, ["commit", "-m", message]);
	return git(root, ["rev-parse", "HEAD"]);
}

function createFixture({ gitSource = true } = {}) {
	const base = mkdtempSync(join(tmpdir(), "shirone-content-status-"));
	const repo = join(base, "repo");
	const content = join(base, "content");
	write(repo, "src/user/user-config.ts", EMPTY_MODULE);
	write(content, "content/posts/hello.md", "# hello\n");
	write(content, "content/posts/cover.webp", "image");
	write(content, "content/moments/note.mdx", "# moment\n");
	write(content, "data/projects.ts", "export const projectsData = [];\n");
	if (gitSource) {
		initGit(content);
		commitAll(content);
	}
	return { base, repo, content };
}

function cleanEnv(overrides = {}) {
	return {
		...process.env,
		CONTENT_DIR: "",
		CONTENT_REPO_URL: "",
		CONTENT_REPO_REF: "",
		CONTENT_SYNC_PULL: "",
		SHIRONE_CONTENT_SYNC: "",
		...overrides,
	};
}

function runScript(script, cwd, args = [], env = {}) {
	const childEnv = cleanEnv(env);
	for (const [key, value] of Object.entries(env)) {
		if (value === null) delete childEnv[key];
	}
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd,
		encoding: "utf8",
		env: childEnv,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
	};
}

function syncPath(fixture) {
	const result = runScript(SYNC_SCRIPT, fixture.repo, [], {
		CONTENT_DIR: fixture.content,
	});
	assert.equal(result.status, 0, result.output);
	return result;
}

function statusPath(fixture, args = [], env = {}) {
	return runScript(STATUS_SCRIPT, fixture.repo, args, {
		CONTENT_DIR: fixture.content,
		...env,
	});
}

function snapshotTree(root) {
	const entries = [];
	function walk(current, prefix = "") {
		for (const entry of readdirSync(current, { withFileTypes: true })) {
			const absolute = join(current, entry.name);
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(absolute, relativePath);
			} else if (entry.isFile()) {
				const stat = statSync(absolute);
				entries.push([relativePath, stat.size, stat.mtimeMs]);
			}
		}
	}
	walk(root);
	return entries;
}

describe("content status", () => {
	it("local 纯净态使用语义判断并退出 0", () => {
		const fixture = createFixture();
		try {
			write(
				fixture.repo,
				"src/user/user-config.ts",
				"// custom comments\nexport const userConfigOverrides = {};\nexport const userConfigSources = [ ];\n",
			);
			const result = runScript(STATUS_SCRIPT, fixture.repo, [], {
				SHIRONE_CONTENT_SYNC: "0",
			});
			assert.equal(result.status, 0, result.output);
			assert.match(result.stdout, /Healthy: No errors or warnings found/i);
			assert.match(result.stdout, /Empty overlay \(semantic check passed/i);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("进程环境变量优先于 .env.local，.env.local 优先于 .env", () => {
		const fixture = createFixture();
		const other = join(fixture.base, "other-content");
		try {
			mkdirSync(other, { recursive: true });
			write(fixture.repo, ".env", `CONTENT_DIR=${other}\n`);
			write(fixture.repo, ".env.local", `CONTENT_DIR=${fixture.content}\n`);
			let result = runScript(STATUS_SCRIPT, fixture.repo, [], {
				CONTENT_DIR: null,
				CONTENT_REPO_URL: null,
				SHIRONE_CONTENT_SYNC: null,
			});
			assert.match(
				result.stdout,
				/Source determination: CONTENT_DIR in root \.env\.local/i,
			);
			assert.match(
				result.stdout,
				new RegExp(fixture.content.replace(/[\\]/g, "\\\\")),
			);

			result = runScript(STATUS_SCRIPT, fixture.repo, [], {
				CONTENT_DIR: other,
			});
			assert.match(
				result.stdout,
				/Source determination: Process environment variable CONTENT_DIR/i,
			);
			assert.match(result.stdout, new RegExp(other.replace(/[\\]/g, "\\\\")));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("path Git 源同步后报告 commit、作者、Markdown 数量并保持零写盘", () => {
		const fixture = createFixture();
		try {
			syncPath(fixture);
			const lock = JSON.parse(
				readFileSync(join(fixture.repo, "content.lock.json"), "utf8"),
			);
			assert.equal(
				lock.source.commit,
				git(fixture.content, ["rev-parse", "HEAD"]),
			);

			const beforeRepo = snapshotTree(fixture.repo);
			const beforeContent = snapshotTree(fixture.content);
			const indexMtime = statSync(join(fixture.content, ".git/index")).mtimeMs;
			const result = statusPath(fixture);
			assert.equal(result.status, 0, result.output);
			assert.match(result.stdout, /Author & date: Status Test/i);
			assert.match(result.stdout, /Markdown posts: 1, moments: 1/i);
			assert.match(result.stdout, /Commit consistency: Matches/i);
			assert.deepEqual(snapshotTree(fixture.repo), beforeRepo);
			assert.deepEqual(snapshotTree(fixture.content), beforeContent);
			assert.equal(
				statSync(join(fixture.content, ".git/index")).mtimeMs,
				indexMtime,
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("物化目标的多余文件受实际 prune 策略约束", () => {
		const fixture = createFixture();
		try {
			write(fixture.repo, "src/content/posts/retained.md", "# retained\n");
			let sync = runScript(SYNC_SCRIPT, fixture.repo, ["--no-prune"], {
				CONTENT_DIR: fixture.content,
			});
			assert.equal(sync.status, 0, sync.output);
			assert.equal(
				JSON.parse(
					readFileSync(join(fixture.repo, "content.lock.json"), "utf8"),
				).prune,
				false,
			);
			let result = statusPath(fixture);
			assert.equal(result.status, 0, result.output);

			sync = runScript(SYNC_SCRIPT, fixture.repo, [], {
				CONTENT_DIR: fixture.content,
			});
			assert.equal(sync.status, 0, sync.output);
			write(fixture.repo, "src/content/posts/extra.md", "# extra\n");
			result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(result.stdout, /posts\/extra\.md/);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("缺失目录与伪造 .git 都作为硬错误退出 1", () => {
		const fixture = createFixture({ gitSource: false });
		try {
			const missing = statusPath(fixture, [], {
				CONTENT_DIR: join(fixture.base, "missing"),
			});
			assert.equal(missing.status, 1);
			assert.match(
				missing.stdout,
				/Directory status: Failed \(directory does not exist\)/i,
			);
			assert.doesNotMatch(missing.stdout, /Valid worktree/);

			mkdirSync(join(fixture.content, ".git"), { recursive: true });
			const invalid = statusPath(fixture);
			assert.equal(invalid.status, 1);
			assert.match(invalid.stdout, /not a valid Git worktree/i);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("Git 不可用时报告 unavailable 而不是脏工作区", () => {
		const fixture = createFixture();
		try {
			syncPath(fixture);
			const result = statusPath(fixture, [], { PATH: "" });
			assert.equal(result.status, 0, result.output);
			assert.match(result.stdout, /git not found on system/i);
			assert.doesNotMatch(result.stdout, /uncommitted change/i);
			assert.match(result.stdout, /Usable with warnings/i);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("坏 YAML、重复后缀和内存 TypeScript 类型错误均会失败", () => {
		const fixture = createFixture();
		try {
			write(fixture.content, "config/site.yaml", "title: [broken\n");
			let result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(result.stdout, /YAML structure check: Failed/i);

			write(fixture.content, "config/site.yaml", "title: A\n");
			write(fixture.content, "config/site.yml", "title: B\n");
			result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(result.stdout, /both override site/i);

			rmSync(join(fixture.content, "config/site.yml"));
			write(fixture.content, "config/site.yaml", "title: 42\n");
			write(
				fixture.repo,
				"tsconfig.json",
				JSON.stringify({
					compilerOptions: {
						strict: true,
						module: "ESNext",
						moduleResolution: "Bundler",
						baseUrl: ".",
						paths: { "@/*": ["src/*"] },
					},
				}),
			);
			write(
				fixture.repo,
				"src/types/config.ts",
				"export interface SiteConfig { title: string }\n",
			);
			result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(result.stdout, /TypeScript type check: Failed/i);
			assert.match(result.stdout, /config\/site\.yaml's title/);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("坏锁、缺失生成物和 stale commit 均返回退出码 1", () => {
		const fixture = createFixture();
		try {
			syncPath(fixture);
			write(fixture.repo, "content.lock.json", "{ broken\n");
			let result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(result.stdout, /Content provenance lock .*Invalid/i);

			syncPath(fixture);
			rmSync(join(fixture.repo, "src/user/user-config.ts"));
			result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(
				result.stdout,
				/Missing \(project config modules will fail to import\)/i,
			);

			syncPath(fixture);
			write(fixture.content, "content/posts/new.md", "# new\n");
			commitAll(fixture.content, "test: newer content");
			result = statusPath(fixture);
			assert.equal(result.status, 1);
			assert.match(
				result.stdout,
				/Current content repo commit differs from lock file/i,
			);
			assert.match(result.stdout, /unmaterialized or modified/i);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("远端副本核对 origin、FETCH_HEAD、ref，并支持显式远端探测", () => {
		const fixture = createFixture();
		try {
			const env = {
				CONTENT_REPO_URL: fixture.content,
				CONTENT_REPO_REF: "main",
			};
			const sync = runScript(SYNC_SCRIPT, fixture.repo, [], env);
			assert.equal(sync.status, 0, sync.output);

			let result = runScript(STATUS_SCRIPT, fixture.repo, ["--remote"], env);
			assert.equal(result.status, 0, result.output);
			assert.match(result.stdout, /FETCH_HEAD: .*matches HEAD/i);
			assert.match(result.stdout, /Remote live probe: OK/i);

			git(join(fixture.repo, ".content-src"), [
				"remote",
				"set-url",
				"origin",
				join(fixture.base, "other.git"),
			]);
			result = runScript(STATUS_SCRIPT, fixture.repo, [], env);
			assert.equal(result.status, 1);
			assert.match(
				result.stdout,
				/Remote working copy origin differs from configured repository URL/i,
			);
			assert.match(
				result.stdout,
				/Content repository unavailable, skipping mount point asset probe/i,
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("仓库 URL 与历史锁中的凭据和 query token 都会脱敏", () => {
		const fixture = createFixture();
		try {
			write(
				fixture.repo,
				"content.lock.json",
				JSON.stringify({
					schemaVersion: 1,
					syncedAt: new Date().toISOString(),
					source: {
						type: "git",
						url: "https://bob:locksecret@example.invalid/repo.git?token=lockquery",
						ref: "main",
						commit: null,
					},
					mounts: {},
					config: [],
				}),
			);
			const result = runScript(STATUS_SCRIPT, fixture.repo, [], {
				CONTENT_REPO_URL:
					"https://alice:envsecret@example.invalid/repo.git?access_token=envquery",
				CONTENT_REPO_REF: "main",
			});
			assert.equal(result.status, 1);
			for (const secret of [
				"locksecret",
				"lockquery",
				"envsecret",
				"envquery",
			]) {
				assert.ok(!result.output.includes(secret), `不应泄漏 ${secret}`);
			}
			assert.match(result.stdout, /https:\/\/\*\*\*@example\.invalid/);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});
});
