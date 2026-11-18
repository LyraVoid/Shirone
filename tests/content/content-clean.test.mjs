import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLEAN_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/clean.mjs", import.meta.url),
);

const fixtures = [];
const normalize = (text) => text.split("\r\n").join("\n");

after(() => {
	for (const directory of fixtures) {
		rmSync(directory, { recursive: true, force: true });
	}
});

function write(root, relativePath, contents = "test\n") {
	const absolute = join(root, relativePath);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, contents, "utf8");
	return absolute;
}

function git(cwd, gitArgs) {
	return execFileSync("git", ["-c", "core.quotepath=false", ...gitArgs], {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

/**
 * 运行清理脚本，返回 stdout + stderr 的合并输出（告警走 stderr）。
 *
 * 显式清空内容源环境变量：否则开发机上真实存在的 `CONTENT_DIR` 会渗进夹具，
 * 让「内容源仍然生效」这类断言随环境漂移。
 */
function clean(cwd, args = []) {
	const result = spawnSync(process.execPath, [CLEAN_SCRIPT, ...args], {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		env: {
			...process.env,
			CONTENT_DIR: "",
			CONTENT_REPO_URL: "",
			CONTENT_REPO_REF: "",
		},
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if (result.status !== 0) {
		const error = new Error(`clean exited with ${result.status}`);
		error.output = output;
		throw error;
	}
	return output;
}

/**
 * 造一个贴近真实代码仓的夹具：已提交的 demo 内容、主题自有资产、构建期生成物豁免路径。
 */
function createFixture({ ejected = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), "shirone-clean-"));
	fixtures.push(root);

	git(root, ["init", "--initial-branch=main"]);
	git(root, ["config", "user.name", "Test"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "core.autocrlf", "false"]);

	write(
		root,
		".gitignore",
		[
			".content-backup/",
			".content-src/",
			"content.lock.json",
			"node_modules/",
			"public/assets/moments/thumbnails/*",
			"!public/assets/moments/thumbnails/.gitkeep",
			"public/assets/anime/covers/*",
			"!public/assets/anime/covers/.gitkeep",
			"src/assets/fonts/.subset/",
			"src/data/anime-snapshots/*.json",
			"",
		].join("\n"),
	);

	// demo 内容（被跟踪）
	write(root, "src/content/posts/demo.md", "# Demo\n");
	write(root, "src/content/spec/about.md", "# About\n");
	write(root, "src/data/projects.ts", "export const projects = [];\n");
	write(root, "src/config/FooterConfig.html", "<!-- theme footer -->\n");
	write(
		root,
		"src/user/user-config.ts",
		"export const userConfigOverrides = {};\n",
	);
	write(root, "public/images/albums/README.md", "# Albums\n");
	// 主题自有资产与占位文件
	write(root, "public/favicon/favicon.ico", "icon\n");
	write(root, "public/assets/moments/thumbnails/.gitkeep", "");
	write(root, "public/assets/anime/covers/.gitkeep", "");
	write(root, "src/data/anime-snapshots/.gitkeep", "");
	// 主题源码（清理范围之外）
	write(root, "src/components/Card.astro", "<div>card</div>\n");

	git(root, ["add", "."]);
	git(root, ["commit", "-m", "chore: initial"]);

	if (ejected) {
		// 复刻 content:eject 的结果：物化路径进 .gitignore，且不再被跟踪。
		writeFileSync(
			join(root, ".gitignore"),
			`${readFileSync(join(root, ".gitignore"), "utf8")}${[
				"# content repository",
				"/src/content/",
				"/src/data/*.ts",
				"/src/user/user-config.ts",
				"/src/config/FooterConfig.html",
				"/public/images/",
				"",
			].join("\n")}`,
			"utf8",
		);
		git(root, [
			"rm",
			"-r",
			"--cached",
			"--quiet",
			"src/content",
			"src/data/projects.ts",
			"src/user/user-config.ts",
			"src/config/FooterConfig.html",
			"public/images",
		]);
		git(root, ["add", ".gitignore"]);
		git(root, ["commit", "-m", "chore: eject"]);
	}

	return root;
}

/** 模拟一次 external 模式物化。 */
function materialize(root) {
	write(root, "src/content/posts/external.md", "# External\n");
	write(root, "src/content/posts/概率论/index.md", "# 概率论\n");
	write(root, "src/data/skills.ts", "export const skills = [];\n");
	write(root, "public/images/device/phone.png", "png\n");
	write(
		root,
		"src/user/user-config.ts",
		"export const userConfigOverrides = { site: {} };\n",
	);
	write(root, "src/config/FooterConfig.html", "<p>user footer</p>\n");
	write(root, "content.lock.json", "{}\n");
	// 构建期生成物：必须在清理后原样保留
	write(root, "public/assets/moments/thumbnails/a-192.webp", "thumb\n");
	write(root, "public/assets/anime/covers/x.webp", "cover\n");
	write(root, "src/assets/fonts/.subset/x.woff2", "font\n");
	write(root, "src/data/anime-snapshots/bangumi.json", "{}\n");
}

function latestBackup(root) {
	const parent = join(root, ".content-backup");
	if (!existsSync(parent)) return null;
	const entries = readdirSync(parent).sort();
	return entries.length === 0 ? null : join(parent, entries.at(-1));
}

describe("content:clean 清理范围与分类", () => {
	it("默认只预演，不修改任何文件", () => {
		const root = createFixture();
		materialize(root);
		const before = git(root, ["status", "--porcelain", "-uall"]);

		const output = clean(root);

		assert.match(output, /Dry-run mode/i);
		assert.match(output, /src\/content\/posts\/external\.md/);
		assert.match(output, /Run with --yes to execute/i);
		assert.equal(existsSync(join(root, "src/content/posts/external.md")), true);
		assert.equal(existsSync(join(root, "content.lock.json")), true);
		assert.equal(git(root, ["status", "--porcelain", "-uall"]), before);
		assert.equal(existsSync(join(root, ".content-backup")), false);
	});

	it("--dry-run 优先于 --yes，避免脚本化调用时误删", () => {
		const root = createFixture();
		materialize(root);

		const output = clean(root, ["--yes", "--dry-run"]);

		assert.match(output, /Dry-run mode/i);
		assert.equal(existsSync(join(root, "src/content/posts/external.md")), true);
	});

	it("--yes 还原被覆盖的 demo 内容并删除物化文件", () => {
		const root = createFixture();
		materialize(root);
		write(root, "src/content/posts/demo.md", "# Overwritten\n");
		write(root, "src/content/spec/about.md", "# Overwritten About\n");
		rmSync(join(root, "public/images/albums/README.md"));

		clean(root, ["--yes"]);

		assert.equal(
			normalize(readFileSync(join(root, "src/content/posts/demo.md"), "utf8")),
			"# Demo\n",
		);
		// 被 sync 裁剪掉的 demo 文件也要回来
		assert.equal(
			existsSync(join(root, "public/images/albums/README.md")),
			true,
			"被裁剪的 demo 文件应被还原",
		);
		assert.equal(
			existsSync(join(root, "src/content/posts/external.md")),
			false,
		);
		assert.equal(existsSync(join(root, "src/data/skills.ts")), false);
		assert.equal(existsSync(join(root, "content.lock.json")), false);
		assert.equal(git(root, ["status", "--porcelain"]), "");
	});

	it("中文路径同样被备份与删除，不会因八进制转义而漏处理", () => {
		const root = createFixture();
		materialize(root);
		const chinese = "src/content/posts/概率论/index.md";

		clean(root, ["--yes"]);

		assert.equal(existsSync(join(root, chinese)), false, "中文路径应被删除");
		const backup = latestBackup(root);
		assert.equal(existsSync(join(backup, chinese)), true, "中文路径应进入备份");
		const manifest = JSON.parse(
			readFileSync(join(backup, "manifest.json"), "utf8"),
		);
		assert.ok(
			manifest.deleted.includes(chinese),
			"manifest 应记录未转义的中文路径",
		);
	});

	it("构建期生成物与 .gitkeep 占位文件被豁免", () => {
		const root = createFixture();
		materialize(root);

		clean(root, ["--yes"]);

		for (const path of [
			"public/assets/moments/thumbnails/a-192.webp",
			"public/assets/anime/covers/x.webp",
			"src/assets/fonts/.subset/x.woff2",
			"src/data/anime-snapshots/bangumi.json",
			"public/assets/moments/thumbnails/.gitkeep",
			"src/data/anime-snapshots/.gitkeep",
		]) {
			assert.equal(existsSync(join(root, path)), true, `${path} 不应被删除`);
		}
	});

	it("不回滚清理范围之外的主题源码改动", () => {
		const root = createFixture();
		materialize(root);
		write(root, "src/components/Card.astro", "<div>my edit</div>\n");
		write(root, "src/config/siteConfig.ts", "export const siteConfig = {};\n");

		clean(root, ["--yes"]);

		assert.equal(
			normalize(readFileSync(join(root, "src/components/Card.astro"), "utf8")),
			"<div>my edit</div>\n",
			"主题源码的未提交改动不属于清理范围",
		);
		assert.equal(existsSync(join(root, "src/config/siteConfig.ts")), true);
	});

	it("被 git add 过的物化文件会同时从索引与工作区移除", () => {
		const root = createFixture();
		materialize(root);
		git(root, ["add", "src/content/posts/external.md"]);

		clean(root, ["--yes"]);

		assert.equal(
			existsSync(join(root, "src/content/posts/external.md")),
			false,
		);
		assert.equal(git(root, ["status", "--porcelain"]), "");
	});
});

describe("content:clean 在 eject 之后（物化内容被 .gitignore 忽略）", () => {
	it("清理被忽略的物化内容，而不是报告「无需清理」", () => {
		const root = createFixture({ ejected: true });
		materialize(root);
		// eject 之后 git status 对这些文件完全沉默
		assert.equal(git(root, ["status", "--porcelain", "-uall"]), "");

		const output = clean(root, ["--yes"]);

		assert.match(output, /\d+ ignored by \.gitignore/i);
		assert.equal(
			existsSync(join(root, "src/content/posts/external.md")),
			false,
		);
		assert.equal(
			existsSync(join(root, "src/content/posts/概率论/index.md")),
			false,
		);
		assert.equal(existsSync(join(root, "src/data/skills.ts")), false);
		assert.equal(
			existsSync(join(root, "public/images/device/phone.png")),
			false,
		);
		// 豁免路径不受影响
		assert.equal(
			existsSync(join(root, "public/assets/moments/thumbnails/a-192.webp")),
			true,
		);
	});

	it("提示挂载点已不被跟踪，demo 内容无法靠清理还原", () => {
		const root = createFixture({ ejected: true });
		materialize(root);

		const output = clean(root, ["--yes"]);

		assert.match(output, /not tracked in the code repository/i);
		assert.match(output, /content:eject/);
	});

	it("user-config.ts 被重置为空覆盖层而不是删除（各配置都 import 它）", () => {
		const root = createFixture({ ejected: true });
		materialize(root);

		clean(root, ["--yes"]);

		const generated = join(root, "src/user/user-config.ts");
		assert.equal(
			existsSync(generated),
			true,
			"生成物必须存在，否则构建直接失败",
		);
		const source = normalize(readFileSync(generated, "utf8"));
		assert.match(
			source,
			/userConfigOverrides: Readonly<Record<string, unknown>> = \{\};/,
		);
		assert.doesNotMatch(source, /site: \{\}/);
	});

	it("内容仓带来的 FooterConfig.html 被移除；被跟踪时则还原", () => {
		const ejected = createFixture({ ejected: true });
		materialize(ejected);
		clean(ejected, ["--yes"]);
		assert.equal(
			existsSync(join(ejected, "src/config/FooterConfig.html")),
			false,
			"未跟踪的自定义页脚应被移除",
		);

		const tracked = createFixture();
		materialize(tracked);
		clean(tracked, ["--yes"]);
		assert.equal(
			normalize(
				readFileSync(join(tracked, "src/config/FooterConfig.html"), "utf8"),
			),
			"<!-- theme footer -->\n",
			"被跟踪的主题页脚应还原到 HEAD",
		);
	});
});

describe("content:clean 备份与熔断", () => {
	it("备份可完整逆向还原，manifest 记录范围与统计", () => {
		const root = createFixture();
		const unique = `# Author content ${Math.random()}\n`;
		write(root, "src/content/posts/mine.md", unique);
		materialize(root);

		clean(root, ["--yes"]);
		const backup = latestBackup(root);
		assert.ok(backup, "应创建备份目录");

		const manifest = JSON.parse(
			readFileSync(join(backup, "manifest.json"), "utf8"),
		);
		assert.ok(manifest.counts.backedUp > 0);
		assert.ok(manifest.bytes > 0);
		assert.ok(manifest.head, "应记录清理时的 HEAD，便于确认还原基线");
		assert.deepEqual(manifest.scope.slice(0, 4), [
			"src/content",
			"src/data",
			"src/assets",
			"public",
		]);
		assert.equal(
			normalize(
				readFileSync(join(backup, "src/content/posts/mine.md"), "utf8"),
			),
			normalize(unique),
		);
	});

	it("--no-backup 跳过备份并明确告警", () => {
		const root = createFixture();
		materialize(root);

		const output = clean(root, ["--yes", "--no-backup"]);

		assert.match(output, /--no-backup/);
		assert.equal(existsSync(join(root, ".content-backup")), false);
		assert.equal(
			existsSync(join(root, "src/content/posts/external.md")),
			false,
		);
	});

	it("非 Git 工作区立即熔断，并声明未产生破坏性改动", () => {
		const root = mkdtempSync(join(tmpdir(), "shirone-clean-nogit-"));
		fixtures.push(root);
		write(root, "src/content/posts/keep.md", "# Keep\n");

		let failed = false;
		try {
			clean(root, ["--yes"]);
		} catch (error) {
			failed = true;
			assert.match(error.output, /not a Git worktree/i);
			assert.match(error.output, /No destructive operations were performed/i);
		}
		assert.equal(failed, true);
		assert.equal(existsSync(join(root, "src/content/posts/keep.md")), true);
	});

	it("挂载点过于宽泛时拒绝执行，避免 git clean -x 波及源码", () => {
		const root = createFixture();
		write(
			root,
			"shirone.content.json",
			`${JSON.stringify(
				{
					source: { type: "path", path: "../content" },
					mounts: { content: "src" },
				},
				null,
				2,
			)}\n`,
		);

		let failed = false;
		try {
			clean(root, ["--yes"]);
		} catch (error) {
			failed = true;
			assert.match(error.output, /too broad/i);
			assert.match(error.output, /No destructive operations were performed/i);
		}
		assert.equal(failed, true);
		assert.equal(existsSync(join(root, "src/components/Card.astro")), true);
	});

	it("干净仓库上重复执行是幂等的空操作", () => {
		const root = createFixture();

		const first = clean(root, ["--yes"]);
		assert.match(first, /already in clean theme state/i);
		assert.equal(git(root, ["status", "--porcelain"]), "");

		const second = clean(root, ["--yes"]);
		assert.match(second, /already in clean theme state/i);
		assert.equal(git(root, ["status", "--porcelain"]), "");
	});
});
