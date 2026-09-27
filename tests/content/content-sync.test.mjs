import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SYNC_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/sync.mjs", import.meta.url),
);

function write(root, relativePath, contents = "x") {
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

function initRepo(root) {
	git(root, ["init", "--quiet", "--initial-branch", "main"]);
	git(root, ["config", "user.name", "Test"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "core.autocrlf", "false"]);
}

function commitAll(root, message = "test: fixture") {
	git(root, ["add", "-A"]);
	git(root, ["commit", "--quiet", "-m", message]);
}

/** 造一对「代码仓 / 内容仓」骨架，尽量贴近真实目录布局。 */
function createFixture() {
	const base = mkdtempSync(join(tmpdir(), "shirone-content-"));
	const repo = join(base, "repo");
	const content = join(base, "content");

	// 代码仓：主题自带的 demo 内容、主题自有资产与构建期生成物。
	write(repo, "src/content/posts/legacy-demo.md", "# legacy");
	write(repo, "src/content/spec/about.md", "# about");
	write(repo, "src/data/projects.ts", "export const projectsData = [];");
	write(repo, "src/assets/fonts/Theme-Font.ttf", "font");
	write(repo, "public/favicon/icon.svg", "<svg />");
	write(repo, "public/assets/banner/desktop/legacy.webp", "old-banner");
	write(repo, "public/assets/moments/thumbnails/demo-192.webp", "generated");
	write(repo, "public/assets/anime/covers/demo.webp", "generated");

	// 内容仓：只提供 posts / data / assets/images / public 的一部分。
	write(content, "content/posts/hello.md", "# hello");
	write(content, "content/moments/2026-01-01-note.md", "# note");
	write(content, "data/projects.ts", "export const projectsData = [1];");
	write(content, "assets/images/avatar.webp", "avatar");
	write(content, "public/images/moments/photo.webp", "photo");
	write(content, "public/assets/banner/desktop/1.webp", "new-banner");

	return { base, repo, content };
}

function runSync(fixture, { args = [], env = {}, expectFailure = false } = {}) {
	const options = {
		cwd: fixture.repo,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			CONTENT_DIR: fixture.content,
			CONTENT_REPO_URL: "",
			SHIRONE_CONTENT_SYNC: "",
			...env,
		},
	};
	try {
		const stdout = execFileSync(
			process.execPath,
			[SYNC_SCRIPT, ...args],
			options,
		);
		assert.ok(!expectFailure, `预期失败但成功了：${stdout}`);
		return { stdout, stderr: "", status: 0 };
	} catch (error) {
		// sync.mjs 以 process.exitCode 结束，stderr 里是脱敏后的原因。
		const stderr = String(error.stderr ?? "");
		assert.ok(expectFailure, `预期成功但失败了：${stderr}`);
		return { stdout: String(error.stdout ?? ""), stderr, status: error.status };
	}
}

function readLock(fixture) {
	return JSON.parse(
		readFileSync(join(fixture.repo, "content.lock.json"), "utf8"),
	);
}

function exists(fixture, relativePath) {
	return existsSync(join(fixture.repo, relativePath));
}

function read(fixture, relativePath) {
	return readFileSync(join(fixture.repo, relativePath), "utf8");
}

describe("content sync", () => {
	it("未配置内容源时是完全静默的空操作", () => {
		const fixture = createFixture();
		try {
			const { stdout } = runSync(fixture, { env: { CONTENT_DIR: "" } });
			assert.equal(stdout, "");
			assert.ok(!exists(fixture, "content.lock.json"));
			// 主题自带内容必须原封不动。
			assert.ok(exists(fixture, "src/content/posts/legacy-demo.md"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("SHIRONE_CONTENT_SYNC=0 可强制回到 local 模式", () => {
		const fixture = createFixture();
		try {
			const { stdout } = runSync(fixture, {
				env: { SHIRONE_CONTENT_SYNC: "0" },
			});
			assert.equal(stdout, "");
			assert.ok(exists(fixture, "src/content/posts/legacy-demo.md"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("把内容仓的四类目录物化到代码仓标准路径", () => {
		const fixture = createFixture();
		try {
			runSync(fixture);
			assert.equal(read(fixture, "src/content/posts/hello.md"), "# hello");
			assert.equal(
				read(fixture, "src/content/moments/2026-01-01-note.md"),
				"# note",
			);
			assert.equal(
				read(fixture, "src/data/projects.ts"),
				"export const projectsData = [1];",
			);
			assert.equal(read(fixture, "src/assets/images/avatar.webp"), "avatar");
			assert.equal(read(fixture, "public/images/moments/photo.webp"), "photo");
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("裁剪只发生在内容仓拥有的顶层段内", () => {
		const fixture = createFixture();
		try {
			runSync(fixture);

			// 内容仓提供了 posts/，因此旧的 demo 文章被清理。
			assert.ok(!exists(fixture, "src/content/posts/legacy-demo.md"));
			// 内容仓没有 spec/，该目录不属于它，必须保留。
			assert.ok(exists(fixture, "src/content/spec/about.md"));
			// 主题自有字体与 favicon 同理保留。
			assert.ok(exists(fixture, "src/assets/fonts/Theme-Font.ttf"));
			assert.ok(exists(fixture, "public/favicon/icon.svg"));
			// 内容仓提供了 public/assets/banner/，旧横幅被清理。
			assert.ok(!exists(fixture, "public/assets/banner/desktop/legacy.webp"));
			assert.equal(
				read(fixture, "public/assets/banner/desktop/1.webp"),
				"new-banner",
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("构建期生成物不因共享顶层段而被误删", () => {
		const fixture = createFixture();
		try {
			runSync(fixture);
			// public/assets 顶层段被内容仓拥有，但缩略图与番剧封面是生成物。
			assert.ok(
				exists(fixture, "public/assets/moments/thumbnails/demo-192.webp"),
			);
			assert.ok(exists(fixture, "public/assets/anime/covers/demo.webp"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("重复运行是幂等的，不产生额外拷贝", () => {
		const fixture = createFixture();
		try {
			runSync(fixture);
			const first = readLock(fixture);
			assert.ok(first.mounts["src/content"].copied > 0);

			runSync(fixture);
			const second = readLock(fixture);
			for (const stats of Object.values(second.mounts)) {
				assert.equal(stats.copied, 0);
				assert.equal(stats.removed, 0);
			}
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("--dry-run 不落盘但给出统计", () => {
		const fixture = createFixture();
		try {
			runSync(fixture, { args: ["--dry-run"] });
			assert.ok(!exists(fixture, "src/content/posts/hello.md"));
			assert.ok(exists(fixture, "src/content/posts/legacy-demo.md"));
			assert.ok(!exists(fixture, "content.lock.json"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("--no-prune 保留代码仓中已不存在于内容仓的文件", () => {
		const fixture = createFixture();
		try {
			runSync(fixture, { args: ["--no-prune"] });
			assert.ok(exists(fixture, "src/content/posts/legacy-demo.md"));
			assert.ok(exists(fixture, "src/content/posts/hello.md"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("内容仓写入构建期生成物路径时直接报错", () => {
		const fixture = createFixture();
		try {
			write(
				fixture.content,
				"public/assets/moments/thumbnails/x-192.webp",
				"bad",
			);
			const { stderr } = runSync(fixture, { expectFailure: true });
			assert.match(stderr, /build-time artifact path/i);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("内容仓提供的番剧快照被接受并物化（基线语义，不报错）", () => {
		const fixture = createFixture();
		try {
			const snapshot = JSON.stringify({
				schemaVersion: 1,
				provider: "bilibili",
				fetchedAt: "2026-01-01T00:00:00.000Z",
				accountRef: "42",
				items: [],
			});
			write(fixture.content, "data/anime-snapshots/bilibili.json", snapshot);

			const { status } = runSync(fixture);

			assert.equal(status, 0);
			// 快照路径刻意不在 PROTECTED_PATHS 内：同步方向允许内容仓提供（基线 / 纯静态数据源），
			// 导出侧永不回写； anime:sync 成功抓取后才会覆盖 <provider>.json。
			assert.equal(
				read(fixture, "src/data/anime-snapshots/bilibili.json"),
				snapshot,
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("keep 声明与内容仓文件冲突时直接报错", () => {
		const fixture = createFixture();
		try {
			write(
				fixture.repo,
				"shirone.content.json",
				JSON.stringify({ schemaVersion: 1, keep: ["src/data/projects.ts"] }),
			);
			const { stderr } = runSync(fixture, { expectFailure: true });
			assert.match(stderr, /keep/);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("清单 schemaVersion 超出支持范围时报错", () => {
		const fixture = createFixture();
		try {
			write(
				fixture.repo,
				"shirone.content.json",
				JSON.stringify({ schemaVersion: 99 }),
			);
			const { stderr } = runSync(fixture, { expectFailure: true });
			assert.match(stderr, /schemaVersion/);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("拒绝逃逸、保留目录和相互交叠的挂载映射", () => {
		const fixture = createFixture();
		try {
			for (const mounts of [
				{ "../outside": "src/content" },
				{ "content/../data": "custom/data" },
				{ extra: "scripts/content" },
				{ extra: "src/content/posts" },
				{ "content/posts": "public/duplicate" },
				{
					content: false,
					public: false,
					"content/./posts": "custom/one",
					"content/posts": "custom/two",
				},
			]) {
				write(
					fixture.repo,
					"shirone.content.json",
					JSON.stringify({ schemaVersion: 1, mounts }),
				);
				const { stderr } = runSync(fixture, { expectFailure: true });
				assert.match(
					stderr,
					/relative directory|reserved directory|overlap|duplicate/i,
				);
			}
			assert.ok(!exists(fixture, "content.lock.json"));
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("CONTENT_SYNC_PULL=false 不初始化远端副本，并只复用锁定身份一致的副本", () => {
		const fixture = createFixture();
		try {
			initRepo(fixture.content);
			commitAll(fixture.content);
			const remoteEnv = {
				CONTENT_DIR: "",
				CONTENT_REPO_URL: fixture.content,
				CONTENT_REPO_REF: "main",
			};

			let result = runSync(fixture, {
				env: { ...remoteEnv, CONTENT_SYNC_PULL: "false" },
				expectFailure: true,
			});
			assert.match(result.stderr, /not initialized.*no copy will be created/i);
			assert.ok(!exists(fixture, ".content-src"));

			runSync(fixture, { env: remoteEnv });
			result = runSync(fixture, {
				env: { ...remoteEnv, CONTENT_SYNC_PULL: "false" },
			});
			assert.match(result.stdout, /Reusing local content working copy/i);

			const workingCopy = join(fixture.repo, ".content-src");
			write(workingCopy, "content/posts/hello.md", "# locally changed");
			result = runSync(fixture, {
				env: { ...remoteEnv, CONTENT_SYNC_PULL: "false" },
				expectFailure: true,
			});
			assert.match(result.stderr, /with uncommitted changes/i);
			git(workingCopy, ["restore", "--", "content/posts/hello.md"]);

			result = runSync(fixture, {
				env: {
					...remoteEnv,
					CONTENT_REPO_REF: "another-ref",
					CONTENT_SYNC_PULL: "false",
				},
				expectFailure: true,
			});
			assert.match(
				result.stderr,
				/matches current URL, ref, and commit exactly/i,
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("远端 URL 变化时更新工作副本 origin 后再拉取", () => {
		const fixture = createFixture();
		const second = join(fixture.base, "second-content");
		try {
			initRepo(fixture.content);
			commitAll(fixture.content);
			write(second, "content/posts/from-second.md", "# second");
			initRepo(second);
			commitAll(second);

			const remoteEnv = {
				CONTENT_DIR: "",
				CONTENT_REPO_REF: "main",
			};
			runSync(fixture, {
				env: { ...remoteEnv, CONTENT_REPO_URL: fixture.content },
			});
			runSync(fixture, {
				env: { ...remoteEnv, CONTENT_REPO_URL: second },
			});

			const workingCopy = join(fixture.repo, ".content-src");
			assert.equal(git(workingCopy, ["remote", "get-url", "origin"]), second);
			assert.equal(
				read(fixture, "src/content/posts/from-second.md"),
				"# second",
			);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});

	it("内容仓删除 footer.html 后恢复主题页脚或移除非跟踪页脚", () => {
		const tracked = createFixture();
		const ejected = createFixture();
		try {
			write(
				tracked.repo,
				"src/config/FooterConfig.html",
				"<!-- theme footer -->",
			);
			initRepo(tracked.repo);
			commitAll(tracked.repo);
			write(tracked.content, "config/footer.html", "<p>external</p>");
			runSync(tracked);
			assert.equal(
				read(tracked, "src/config/FooterConfig.html"),
				"<p>external</p>",
			);
			rmSync(join(tracked.content, "config/footer.html"));
			runSync(tracked);
			assert.equal(
				read(tracked, "src/config/FooterConfig.html"),
				"<!-- theme footer -->",
			);

			write(ejected.content, "config/footer.html", "<p>external</p>");
			runSync(ejected);
			rmSync(join(ejected.content, "config/footer.html"));
			runSync(ejected);
			assert.ok(!exists(ejected, "src/config/FooterConfig.html"));
		} finally {
			rmSync(tracked.base, { recursive: true, force: true });
			rmSync(ejected.base, { recursive: true, force: true });
		}
	});

	it("lock 文件记录内容来源与各挂载点统计", () => {
		const fixture = createFixture();
		try {
			runSync(fixture);
			const lock = readLock(fixture);
			assert.equal(lock.schemaVersion, 1);
			assert.equal(lock.source.type, "path");
			assert.equal(lock.source.commit, null);
			assert.equal(lock.prune, true);
			assert.deepEqual(Object.keys(lock.mounts).sort(), [
				"public",
				"src/assets",
				"src/content",
				"src/data",
			]);
			assert.equal(lock.mounts["src/content"].files, 2);
		} finally {
			rmSync(fixture.base, { recursive: true, force: true });
		}
	});
});
