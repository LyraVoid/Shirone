/**
 * `content:export`（内容与配置反向导出）的契约测试。
 *
 * 夹具用真实 git 仓库（`mkdtempSync` + `git init`），两边各一个：代码仓与内容仓。
 * 代码仓里同时放好已提交的物化内容、主题自有资产、构建期生成物豁免路径与全套配置模块，
 * 因为导出的正确性恰恰取决于它能不能把这几类文件区分开。
 *
 * 环境变量 `CONTENT_DIR` / `CONTENT_REPO_URL` / `CI` 一律显式清空：
 * 开发机上真实存在的 `.env` 会渗进夹具，让「local 模式拒绝」这类断言随环境漂移。
 */

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
import {
	deepEqual,
	diffConfig,
	flattenOverride,
	isPlainObject,
	OMIT,
} from "../../scripts/content/config-diff.mjs";
import { EXPORTABLE_DOMAINS } from "../../scripts/content/config-introspect.mjs";

const EXPORT_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/export.mjs", import.meta.url),
);
const SYNC_SCRIPT = fileURLToPath(
	new URL("../../scripts/content/sync.mjs", import.meta.url),
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

function read(root, relativePath) {
	return normalize(readFileSync(join(root, relativePath), "utf8"));
}

function git(cwd, gitArgs) {
	return execFileSync("git", ["-c", "core.quotepath=false", ...gitArgs], {
		cwd,
		encoding: "utf8",
		maxBuffer: 32 * 1024 * 1024,
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function initRepo(root) {
	git(root, ["init", "--initial-branch=main"]);
	git(root, ["config", "user.name", "Test"]);
	git(root, ["config", "user.email", "test@example.com"]);
	git(root, ["config", "core.autocrlf", "false"]);
}

function commitAll(root, message) {
	git(root, ["add", "-A"]);
	git(root, ["commit", "-m", message]);
}

/** 跑一个 content 脚本，返回 stdout + stderr 合并输出（告警走 stderr）。 */
function run(script, cwd, args = [], env = {}) {
	const result = spawnSync(process.execPath, [script, ...args], {
		cwd,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
		env: {
			...process.env,
			CONTENT_DIR: "",
			CONTENT_REPO_URL: "",
			CONTENT_REPO_REF: "",
			CI: "",
			...env,
		},
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
	if (result.status !== 0) {
		const error = new Error(`${script} exited with ${result.status}`);
		error.output = output;
		throw error;
	}
	return output;
}

const exportRun = (cwd, args = [], env = {}) =>
	run(EXPORT_SCRIPT, cwd, args, env);
const syncRun = (cwd, args = [], env = {}) => run(SYNC_SCRIPT, cwd, args, env);

/** 断言脚本以非零码退出，并返回它的输出供进一步断言。 */
function expectFailure(fn) {
	try {
		fn();
	} catch (error) {
		assert.ok(error.output, "失败时应有输出可供诊断");
		return error.output;
	}
	assert.fail("期望脚本熔断退出，但它成功返回了");
}

// ─────────────────────────────────────────────────────────────────────────────
// 夹具
// ─────────────────────────────────────────────────────────────────────────────

/** 几个形状有代表性的领域默认值：嵌套对象、数组、清单、凭据字段。 */
const CONFIG_DEFAULTS = {
	site: {
		site: "https://example.com/",
		base: "/",
		title: "Shirone",
		themeColor: { hue: 315, fixed: false, style: "tonalSpot" },
		favicon: [],
	},
	profile: {
		name: "Theme Author",
		bio: "",
		links: [{ name: "GitHub", url: "https://github.com/example" }],
	},
	llms: {
		enable: true,
		excludeTags: ["secret", "private"],
		corePages: [{ title: "Home", url: "/" }],
	},
	comment: {
		enable: false,
		provider: "none",
		twikoo: { envId: "", scriptUrl: "https://cdn.example.com/twikoo.js" },
		// giscus 形状与主题真实默认值同构：嵌套 theme 明暗双值 + 空字符串占位的必填字段。
		giscus: {
			repo: "",
			repoId: "",
			category: "Announcements",
			categoryId: "",
			mapping: "pathname",
			strict: false,
			reactionsEnabled: true,
			emitMetadata: false,
			inputPosition: "bottom",
			theme: { light: "light", dark: "dark" },
			lang: "auto",
			scriptUrl: "https://giscus.app/client.js",
		},
	},
};

/**
 * 最小但语义等价的 `withUserConfig()`：对象递归合并、数组整体替换。
 *
 * 不直接拷贝仓库里的那份，是为了让夹具与主题源码解耦——
 * 这里要测的是导出脚本的行为，不是运行时合并器本身。
 */
const CONFIG_OVERLAY_MODULE = `import { userConfigOverrides } from "../user/user-config.ts";

function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(base, override) {
	if (!isPlainObject(base) || !isPlainObject(override)) return override;
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		merged[key] = key in base ? deepMerge(base[key], value) : value;
	}
	return merged;
}

export function withUserConfig(domain, defaults) {
	const override = userConfigOverrides[domain];
	if (override === undefined) return defaults;
	return deepMerge(defaults, override);
}

export function getUserConfig(domain) {
	return userConfigOverrides[domain];
}
`;

const EMPTY_USER_CONFIG = `export const userConfigOverrides = {};
export const userConfigSources = [];
`;

/**
 * 造一对代码仓 + 内容仓。
 *
 * @param {object} [options]
 * @param {boolean} [options.contentRepoGit] 内容仓是否 `git init`（用于「非 git 仓库降级告警」）
 * @param {object} [options.manifest] 覆盖写入代码仓的 `shirone.content.json`
 */
function createFixture({ contentRepoGit = true, manifest } = {}) {
	const code = mkdtempSync(join(tmpdir(), "shirone-export-code-"));
	const content = mkdtempSync(join(tmpdir(), "shirone-export-content-"));
	fixtures.push(code, content);

	// ── 内容仓 ────────────────────────────────────────────────────────────────
	write(content, "content/posts/hello.md", "# Hello\n");
	write(content, "content/posts/概率论/index.md", "# 概率论\n");
	write(content, "content/moments/first.md", "moment\n");
	write(content, "data/projects.ts", "export const projects = [];\n");
	write(content, "public/images/pic.png", "png\n");
	write(content, "public/assets/banner/1.webp", "banner\n");
	write(content, ".gitignore", "node_modules/\n");
	if (contentRepoGit) {
		initRepo(content);
		commitAll(content, "chore: initial content");
	}

	// ── 代码仓 ────────────────────────────────────────────────────────────────
	initRepo(code);
	write(
		code,
		"shirone.content.json",
		`${JSON.stringify(
			manifest ?? { schemaVersion: 1, source: { type: "path", path: content } },
			null,
			2,
		)}\n`,
	);
	write(
		code,
		".gitignore",
		["node_modules/", "content.lock.json", ""].join("\n"),
	);

	// 配置层：20 个可导出领域各一个模块，外加合并器与（空的）覆盖层生成物。
	write(code, "src/utils/config-overlay.ts", CONFIG_OVERLAY_MODULE);
	write(code, "src/user/user-config.ts", EMPTY_USER_CONFIG);
	for (const domain of EXPORTABLE_DOMAINS) {
		const defaults = CONFIG_DEFAULTS[domain.key] ?? { enable: true };
		write(
			code,
			`src/config/${domain.key}Config.ts`,
			`import { withUserConfig } from "../utils/config-overlay.ts";\n\n` +
				`export const ${domain.key}Config = withUserConfig(${JSON.stringify(
					domain.key,
				)}, ${JSON.stringify(defaults, null, "\t")});\n`,
		);
	}
	// 桩 tsc：让 typeCheckModule 走通而不引入真实 typescript 依赖。
	// 类型校验本身由 tests/content/content-config.test.mjs 覆盖，这里只验证「校验被调用且不留痕」。
	write(code, "node_modules/typescript/bin/tsc", "// stub tsc: 恒定成功\n");

	// 主题自有资产与构建期生成物：导出必须原样放过它们。
	write(code, "public/favicon/favicon.ico", "icon\n");
	write(code, "public/assets/moments/thumbnails/a-192.webp", "thumb\n");
	write(code, "public/assets/anime/covers/x.webp", "cover\n");
	write(code, "src/assets/fonts/.subset/x.woff2", "font\n");
	write(code, "src/data/anime-snapshots/bangumi.json", "{}\n");
	write(code, "src/data/anime-snapshots/.gitkeep", "");
	write(code, "src/components/Card.astro", "<div>card</div>\n");

	commitAll(code, "chore: initial code");

	// 物化一次，让代码仓进入 external 模式下的常规状态。
	syncRun(code);

	return { code, content };
}

function latestBackup(contentRoot) {
	const parent = join(contentRoot, ".export-backup");
	if (!existsSync(parent)) return null;
	const entries = readdirSync(parent).sort();
	return entries.length === 0 ? null : join(parent, entries.at(-1));
}

/** 用真实内省链路取当前生效配置，用于往返不变式比对。 */
async function effectiveConfig(codeRoot) {
	const { introspectConfig } = await import(
		"../../scripts/content/config-introspect.mjs"
	);
	const { values } = introspectConfig(codeRoot);
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [key, value.effective]),
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// diffConfig：deepMerge 的逆运算
// ─────────────────────────────────────────────────────────────────────────────

/** 与 `src/utils/config-overlay.ts` 逐行等价，用于验证「合并 ∘ 差分 ≡ 恒等」。 */
function deepMerge(base, override) {
	if (!isPlainObject(base) || !isPlainObject(override)) return override;
	const merged = { ...base };
	for (const [key, value] of Object.entries(override)) {
		merged[key] = key in base ? deepMerge(base[key], value) : value;
	}
	return merged;
}

describe("diffConfig：deepMerge 的精确逆运算", () => {
	it("两侧深相等时省略，键顺序不构成差异", () => {
		assert.equal(
			diffConfig({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }),
			OMIT,
		);
		assert.equal(diffConfig({ a: 1, b: 2 }, { b: 2, a: 1 }), OMIT);
		assert.equal(diffConfig([1, 2], [1, 2]), OMIT);
	});

	it("标量差异整体写出", () => {
		assert.equal(diffConfig("Shirone", "我的博客"), "我的博客");
		assert.equal(diffConfig(1, 0), 0);
		assert.equal(diffConfig(true, false), false);
		assert.equal(diffConfig("x", null), null);
	});

	it("对象逐键递归，只保留有差异的分支", () => {
		const defaults = {
			title: "Shirone",
			themeColor: { hue: 315, fixed: false, style: "tonalSpot" },
			toc: { enable: true, depth: 2 },
		};
		const effective = {
			title: "Shirone",
			themeColor: { hue: 262, fixed: false, style: "tonalSpot" },
			toc: { enable: true, depth: 2 },
		};

		assert.deepEqual(diffConfig(defaults, effective), {
			themeColor: { hue: 262 },
		});
	});

	it("数组整体替换，不逐项 diff", () => {
		// 只改了第二项，但覆盖语义是「这就是我要的全部条目」，必须写全。
		assert.deepEqual(diffConfig({ tags: ["a", "b"] }, { tags: ["a", "c"] }), {
			tags: ["a", "c"],
		});
		// 元素是对象时同样整体写出，不下钻。
		assert.deepEqual(
			diffConfig(
				{ links: [{ name: "GitHub", url: "https://a" }] },
				{ links: [{ name: "GitHub", url: "https://b" }] },
			),
			{ links: [{ name: "GitHub", url: "https://b" }] },
		);
		// 变短、变空都要能表达。
		assert.deepEqual(diffConfig({ tags: ["a", "b"] }, { tags: [] }), {
			tags: [],
		});
	});

	it("两侧类型不同时整体写出", () => {
		assert.deepEqual(diffConfig({ a: 1 }, [1]), [1]);
		assert.deepEqual(diffConfig(["a"], { a: 1 }), { a: 1 });
		assert.equal(diffConfig({ a: 1 }, "x"), "x");
	});

	it("生效值新增的键被完整写出", () => {
		assert.deepEqual(diffConfig({ a: 1 }, { a: 1, b: { c: 2 } }), {
			b: { c: 2 },
		});
	});

	it("递归后无剩余键时省略，不写出空对象", () => {
		// 生效值少了一个默认值独有的键：差分结果为空，不该产生 `{}`。
		assert.equal(diffConfig({ a: 1, b: 2 }, { a: 1 }), OMIT);
	});

	it("默认值有、生效值没有的键被报告为无法表达", () => {
		const unrepresentable = [];
		diffConfig(
			{ a: 1, removed: 2, nested: { gone: 3, kept: 4 } },
			{ a: 9, nested: { kept: 4 } },
			{ unrepresentable, path: "" },
		);

		// 深合并只能新增和替换，不能删除键，因此这两条只能告警。
		assert.deepEqual(unrepresentable.sort(), ["nested.gone", "removed"]);
	});

	it("deepMerge(defaults, diffConfig(defaults, effective)) ≡ effective", () => {
		const cases = [
			[{ a: 1 }, { a: 2 }],
			[{ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } }],
			[{ list: [1, 2, 3] }, { list: [3] }],
			[{ x: "s" }, { x: "s", y: { z: [{ k: 1 }] } }],
			[CONFIG_DEFAULTS.site, { ...CONFIG_DEFAULTS.site, title: "我的博客" }],
			[
				CONFIG_DEFAULTS.llms,
				{ ...CONFIG_DEFAULTS.llms, excludeTags: ["日记"], enable: false },
			],
		];

		for (const [defaults, effective] of cases) {
			const override = diffConfig(defaults, effective);
			const merged =
				override === OMIT ? defaults : deepMerge(defaults, override);
			assert.deepEqual(
				merged,
				effective,
				`往返失败：${JSON.stringify(defaults)} -> ${JSON.stringify(effective)}`,
			);
		}
	});

	it("flattenOverride：对象递归展开，数组与标量是叶子", () => {
		assert.deepEqual(
			flattenOverride({ a: { b: 1 }, list: [1, 2], flag: false }),
			[
				{ path: ["a", "b"], value: 1 },
				{ path: ["list"], value: [1, 2] },
				{ path: ["flag"], value: false },
			],
		);
	});

	it("deepEqual 区分数组与对象、长度与键数", () => {
		assert.equal(deepEqual([1, 2], [1, 2]), true);
		assert.equal(deepEqual([1, 2], [1, 2, 3]), false);
		assert.equal(deepEqual({ a: 1 }, { a: 1, b: 2 }), false);
		assert.equal(deepEqual([], {}), false);
		assert.equal(deepEqual(null, undefined), false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 安全闸门
// ─────────────────────────────────────────────────────────────────────────────

describe("content:export 安全闸门", () => {
	it("local 模式拒绝执行，并说明原因", () => {
		const root = mkdtempSync(join(tmpdir(), "shirone-export-local-"));
		fixtures.push(root);
		initRepo(root);
		write(root, "src/content/posts/mine.md", "# Mine\n");

		const output = expectFailure(() => exportRun(root, ["--yes"]));

		assert.match(output, /local mode/i);
		assert.match(output, /content:eject/);
		assert.match(output, /Nothing was written to content repository/i);
	});

	it('type: "git" 的内容源拒绝执行，除非用 --out 指向真实检出', () => {
		const { code, content } = createFixture();
		write(
			code,
			"shirone.content.json",
			`${JSON.stringify(
				{
					schemaVersion: 1,
					source: {
						type: "git",
						url: "https://example.com/c.git",
						ref: "main",
					},
				},
				null,
				2,
			)}\n`,
		);

		const output = expectFailure(() => exportRun(code, ["--yes"]));
		assert.match(output, /no writable local checkout/i);
		assert.match(output, /detached HEAD/i);
		assert.match(output, /Nothing was written to content repository/i);

		// --out 指向一份真正的本地检出时可以继续。
		const allowed = exportRun(code, ["--out", content]);
		assert.match(allowed, /Dry-run mode/i);
	});

	it("CI 环境拒绝执行：这是本地开发命令", () => {
		const { code } = createFixture();

		const output = expectFailure(() =>
			exportRun(code, ["--yes"], { CI: "true" }),
		);

		assert.match(output, /CI=true/);
		assert.match(output, /content:sync/);
	});

	it("内容仓工作区脏时拒绝，并列出将被覆盖的脏文件", () => {
		const { code, content } = createFixture();
		write(content, "content/posts/uncommitted.md", "# 未提交\n");
		write(code, "src/content/posts/new.md", "# New\n");

		const output = expectFailure(() => exportRun(code, ["--yes"]));

		assert.match(output, /uncommitted changes/i);
		assert.match(output, /content\/posts\/uncommitted\.md/);
		assert.match(output, /Nothing was written to content repository/i);
		assert.equal(
			existsSync(join(content, "content/posts/new.md")),
			false,
			"熔断时不应写入任何文件",
		);

		// --force 跳过检查，但脏文件清单仍要出现在输出里。
		const forced = exportRun(code, ["--yes", "--force"]);
		assert.match(forced, /content\/posts\/uncommitted\.md/);
		assert.equal(existsSync(join(content, "content/posts/new.md")), true);
	});

	it("内容仓不是 git 仓库时降级为告警而非拒绝", () => {
		const { code, content } = createFixture({ contentRepoGit: false });
		write(code, "src/content/posts/new.md", "# New\n");

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /is not a git repository/i);
		assert.equal(existsSync(join(content, "content/posts/new.md")), true);
	});

	it("导出目标不存在时拒绝：export 不负责创建内容仓", () => {
		const { code } = createFixture();

		const output = expectFailure(() =>
			exportRun(code, [
				"--yes",
				"--out",
				join(tmpdir(), "shirone-does-not-exist"),
			]),
		);

		assert.match(output, /does not exist or is not a directory/i);
		assert.match(output, /content:eject/);
	});

	it("拒绝与代码仓重叠的导出目标", () => {
		const { code } = createFixture();
		const nested = join(code, "nested-content");
		mkdirSync(nested, { recursive: true });

		for (const target of [code, nested]) {
			const output = expectFailure(() => exportRun(code, ["--out", target]));
			assert.match(output, /cannot be the same as code repository/i);
			assert.match(output, /Nothing was written to content repository/i);
		}
	});

	it("历史锁中的仓库凭据不会出现在告警里", () => {
		const { code } = createFixture();
		write(
			code,
			"content.lock.json",
			JSON.stringify({
				source: {
					type: "git",
					url: "https://alice:secret@example.invalid/repo.git?token=querysecret",
					ref: "main",
				},
			}),
		);

		const output = exportRun(code);
		assert.doesNotMatch(output, /alice:secret|querysecret/);
		assert.match(output, /https:\/\/\*\*\*@example\.invalid/);
	});

	it("content.lock.json 指向别处时告警，提示可能指错仓库", () => {
		const { code } = createFixture();
		const other = mkdtempSync(join(tmpdir(), "shirone-export-other-"));
		fixtures.push(other);
		mkdirSync(join(other, "content"), { recursive: true });

		const output = exportRun(code, ["--out", other]);

		assert.match(output, /differs from content source in content\.lock\.json/i);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 预演与范围
// ─────────────────────────────────────────────────────────────────────────────

describe("content:export 预演与范围", () => {
	it("默认只预演，不写盘，且两侧仓库都不变脏", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/new.md", "# New\n");
		const contentBefore = git(content, ["status", "--porcelain", "-uall"]);

		const output = exportRun(code);

		assert.match(output, /Dry-run mode/i);
		assert.match(output, /content\/posts\/new\.md/);
		assert.match(output, /Run with --yes to execute/i);
		assert.equal(existsSync(join(content, "content/posts/new.md")), false);
		assert.equal(existsSync(join(content, ".export-backup")), false);
		assert.equal(
			git(content, ["status", "--porcelain", "-uall"]),
			contentBefore,
		);
	});

	it("--dry-run 优先于 --yes，避免脚本化调用误写", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/new.md", "# New\n");

		const output = exportRun(code, ["--yes", "--dry-run"]);

		assert.match(output, /Dry-run mode/i);
		assert.equal(existsSync(join(content, "content/posts/new.md")), false);
	});

	it("--posts 只导出内容文件，--config 只导出配置", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/new.md", "# New\n");
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = { site: { title: "只改配置" } };
export const userConfigSources = [];
`,
		);

		const posts = exportRun(code, ["--yes", "--posts", "--force"]);
		assert.equal(existsSync(join(content, "content/posts/new.md")), true);
		assert.equal(
			existsSync(join(content, "config/site.yaml")),
			false,
			"--posts 不应写配置",
		);
		assert.doesNotMatch(posts, /nav-bar\.yaml excluded from export/i);

		rmSync(join(content, "content/posts/new.md"));
		write(code, "src/content/posts/another.md", "# Another\n");
		exportRun(code, ["--yes", "--config", "--force"]);
		assert.equal(existsSync(join(content, "config/site.yaml")), true);
		assert.equal(
			existsSync(join(content, "content/posts/another.md")),
			false,
			"--config 不应写内容文件",
		);
	});

	it("两侧一致时报告无需导出，且不创建备份", () => {
		const { code, content } = createFixture();

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /no export needed/i);
		assert.equal(existsSync(join(content, ".export-backup")), false);
		assert.equal(git(content, ["status", "--porcelain", "-uall"]), "");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 内容文件导出
// ─────────────────────────────────────────────────────────────────────────────

describe("content:export 内容文件导出", () => {
	it("救回在 src/content/ 里新写的文章，含中文目录名", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/rescued.md", "# 被救回的文章\n");
		write(code, "src/content/posts/高等数学/index.md", "# 高等数学\n");
		write(code, "src/data/skills.ts", "export const skills = [];\n");

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /Added 3/i);
		assert.equal(read(content, "content/posts/rescued.md"), "# 被救回的文章\n");
		assert.equal(
			read(content, "content/posts/高等数学/index.md"),
			"# 高等数学\n",
			"中文路径不应因八进制转义而漏处理",
		);
		assert.equal(
			read(content, "data/skills.ts"),
			"export const skills = [];\n",
		);
	});

	it("按内容哈希更新已存在的文件，哈希相同则跳过", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/hello.md", "# Hello, edited\n");

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /Updated 1/i);
		assert.equal(read(content, "content/posts/hello.md"), "# Hello, edited\n");
		// 其余文件哈希相同，必须跳过而不是重写。
		assert.equal(read(content, "content/posts/概率论/index.md"), "# 概率论\n");
	});

	it("只差 CRLF 的文本不算改动，避免整仓假 diff", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/hello.md", "# Hello\r\n");

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /no export needed/i);
		assert.equal(git(content, ["status", "--porcelain", "-uall"]), "");
	});

	it("PROTECTED_PATHS、anime-snapshots 与 .gitkeep 永不导出", () => {
		const { code, content } = createFixture();

		const output = exportRun(code, ["--yes"]);

		assert.match(output, /\[Exempt\]/i);
		for (const path of [
			"public/assets/moments/thumbnails/a-192.webp",
			"public/assets/anime/covers/x.webp",
			"assets/fonts/.subset/x.woff2",
		]) {
			assert.equal(
				existsSync(join(content, path)),
				false,
				`${path} 不应被导出——内容仓持有它会让 content:sync 直接报错`,
			);
		}
		// 快照与 .gitkeep 不属于「同步报错」的生成物（同步方向允许内容仓提供），
		// 导出侧只是永不回写：避免把基线/占位文件倒灌进内容仓。
		for (const path of [
			"data/anime-snapshots/bangumi.json",
			"data/anime-snapshots/.gitkeep",
		]) {
			assert.equal(
				existsSync(join(content, path)),
				false,
				`${path} 不应被导出（导出侧对基线与代码仓自有文件一律跳过）`,
			);
		}
	});

	it("keep 声明的代码仓自有文件永不导出", () => {
		const { code, content } = createFixture();
		write(
			code,
			"shirone.content.json",
			`${JSON.stringify(
				{
					schemaVersion: 1,
					source: { type: "path", path: content },
					keep: ["src/data/theme-owned.ts"],
				},
				null,
				2,
			)}\n`,
		);
		write(code, "src/data/theme-owned.ts", "export const owned = true;\n");

		exportRun(code, ["--yes"]);

		assert.equal(
			existsSync(join(content, "data/theme-owned.ts")),
			false,
			"keep 文件导出后会让 sync 直接失败（同名冲突）",
		);
	});

	it("内容仓不拥有的顶层段不参与导出，但在计划里明确报出", () => {
		const { code, content } = createFixture();

		const output = exportRun(code);

		// 内容仓的 public/ 只有 images/ 与 assets/，因此 favicon/ 是主题自有。
		assert.match(output, /Not included: content repo does not own this top segment/i);
		assert.match(output, /public\/favicon/);
		exportRun(code, ["--yes"]);
		assert.equal(
			existsSync(join(content, "public/favicon/favicon.ico")),
			false,
		);
	});

	it("默认绝不删除内容仓文件，--prune 才删且先备份", () => {
		const { code, content } = createFixture();
		// 代码仓侧删掉一篇已物化的文章。
		rmSync(join(code, "src/content/posts/hello.md"));

		const reported = exportRun(code, ["--yes"]);
		assert.match(reported, /not deleted by default, requires --prune/i);
		assert.equal(
			existsSync(join(content, "content/posts/hello.md")),
			true,
			"没有 --prune 时绝不删除",
		);

		const pruned = exportRun(code, ["--yes", "--prune"]);
		assert.match(pruned, /Deleted 1 content repository files/i);
		assert.equal(existsSync(join(content, "content/posts/hello.md")), false);

		const backup = latestBackup(content);
		assert.ok(backup, "--prune 必须先创建快照备份");
		assert.equal(
			normalize(readFileSync(join(backup, "content/posts/hello.md"), "utf8")),
			"# Hello\n",
			"被删除的文件必须能从备份还原",
		);
		const manifest = JSON.parse(
			readFileSync(join(backup, "manifest.json"), "utf8"),
		);
		assert.equal(manifest.tool, "content:export");
		assert.ok(manifest.pruned.includes("content/posts/hello.md"));
		assert.ok(manifest.contentRepo.head, "备份应记录内容仓 HEAD 作为还原基线");
		assert.ok(manifest.restoreInstruction);
	});

	it("被覆盖的文件先进备份，备份目录自动写进内容仓 .gitignore", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/hello.md", "# 覆盖后的内容\n");

		exportRun(code, ["--yes"]);

		const backup = latestBackup(content);
		assert.ok(backup);
		assert.equal(
			normalize(readFileSync(join(backup, "content/posts/hello.md"), "utf8")),
			"# Hello\n",
			"备份里应是被覆盖前的原始内容",
		);
		assert.match(read(content, ".gitignore"), /\.export-backup\//);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 配置导出
// ─────────────────────────────────────────────────────────────────────────────

describe("content:export 配置导出", () => {
	it("把生效配置与主题默认值的差异写成最小覆盖集", () => {
		const { code, content } = createFixture();
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = {
	site: { title: "我的博客", themeColor: { hue: 262 } },
	llms: { excludeTags: ["日记"] },
};
export const userConfigSources = [];
`,
		);

		exportRun(code, ["--yes", "--config", "--force"]);

		const site = read(content, "config/site.yaml");
		assert.match(site, /title: 我的博客/);
		assert.match(site, /hue: 262/);
		// 没改的键不该出现——覆盖层只写用户显式声明的键。
		assert.doesNotMatch(site, /style:/);
		assert.doesNotMatch(site, /base:/);
		// 数组整体替换。
		assert.match(read(content, "config/llms.yaml"), /- 日记/);
		assert.doesNotMatch(read(content, "config/llms.yaml"), /secret/);
	});

	it("giscus 嵌套对象的局部覆盖只导出差异键", () => {
		const { code, content } = createFixture();
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = {
	comment: {
		enable: true,
		provider: "giscus",
		giscus: {
			repo: "owner/repo",
			repoId: "R_placeholder",
			categoryId: "DIC_placeholder",
			theme: { dark: "transparent_dark" },
		},
	},
};
export const userConfigSources = [];
`,
		);

		exportRun(code, ["--yes", "--config", "--force"]);

		const comment = read(content, "config/comment.yaml");
		assert.match(comment, /enable: true/);
		assert.match(comment, /provider: giscus/);
		assert.match(comment, /repo: owner\/repo/);
		assert.match(comment, /dark: transparent_dark/);
		// theme.light 未覆盖，保持主题默认值，不该出现在最小覆盖集里。
		assert.doesNotMatch(comment, /light:/);
		// 与默认值相同的键（mapping、scriptUrl 等）不导出。
		assert.doesNotMatch(comment, /mapping:/);
		assert.doesNotMatch(comment, /scriptUrl:/);
	});

	it("新建的 YAML 带说明抬头；已有文件保留注释与格式", () => {
		const { code, content } = createFixture();
		write(
			content,
			"config/site.yaml",
			["# 我手写的抬头注释", "title: 旧标题 # 行内注释", ""].join("\n"),
		);
		commitAll(content, "chore: hand-written config");
		syncRun(code);
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = {
	site: { title: "新标题", themeColor: { hue: 262 } },
	llms: { enable: false },
};
export const userConfigSources = [];
`,
		);

		exportRun(code, ["--yes", "--config", "--force"]);

		const site = read(content, "config/site.yaml");
		assert.match(site, /# 我手写的抬头注释/, "文件头注释必须保住");
		assert.match(site, /# 行内注释/, "行内注释必须保住");
		assert.match(site, /title: 新标题/);
		assert.match(site, /hue: 262/);
		// 新建的文件带生成说明。
		assert.match(read(content, "config/llms.yaml"), /pnpm content:export/);
	});

	it("只增改不删键：已等于默认值的键被保留，--prune-config 才清理", () => {
		const { code, content } = createFixture();
		// 用户刻意钉住一个恰好等于主题默认值的键。
		write(content, "config/site.yaml", "base: /\ntitle: Shirone\n");
		commitAll(content, "chore: pinned config");
		syncRun(code);

		const kept = exportRun(code, ["--yes", "--config"]);
		assert.match(kept, /matching theme defaults/i);
		assert.match(kept, /--prune-config/);
		assert.match(read(content, "config/site.yaml"), /title: Shirone/);

		const cleaned = exportRun(code, ["--yes", "--config", "--prune-config"]);
		assert.match(cleaned, /Delete redundant keys/i);
		const after = read(content, "config/site.yaml");
		assert.doesNotMatch(after, /title:/);
		assert.doesNotMatch(after, /base:/);
	});

	it("nav-bar 被显式排除并给出原因，而不是静默跳过", () => {
		const { code } = createFixture();

		const output = exportRun(code, ["--config"]);

		assert.match(output, /config\/nav-bar\.yaml excluded from export/i);
		assert.match(output, /resolveNavBarLinks\(\) is irreversible/i);
		assert.match(output, /maintain this file manually/i);
	});

	it("footer.html 反向导出到 config/footer.html", () => {
		const { code, content } = createFixture();
		write(code, "src/config/FooterConfig.html", "<p>我的页脚</p>\n");

		exportRun(code, ["--yes", "--config"]);

		assert.equal(read(content, "config/footer.html"), "<p>我的页脚</p>\n");
	});

	it("疑似凭据只告警不阻断，环境变量名与公开标识符不误报", () => {
		const { code, content } = createFixture();
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = {
	comment: { twikoo: { envId: "https://my-twikoo.vercel.app" } },
	anime: { token: "ghp_0123456789abcdefghijklmnopqrstuvwxyz" },
	llms: { excludeTags: ["secret", "private"] },
};
export const userConfigSources = [];
`,
		);

		const output = exportRun(code, ["--yes", "--config", "--force"]);

		assert.match(output, /looks like credentials/i);
		assert.match(output, /anime\.yaml's token/);
		assert.doesNotMatch(output, /envId.*looks like credentials/i);
		// excludeTags 的值里带 "secret" 字样，但键名无关，不该误报。
		assert.doesNotMatch(output, /excludeTags/);
		// 告警不阻断：文件照写。
		assert.equal(existsSync(join(content, "config/anime.yaml")), true);
	});

	it("物化状态落后于内容仓时拒绝执行，避免把旧值写回去", () => {
		const { code, content } = createFixture();
		// 内容仓改了配置，但代码仓还没同步。
		write(content, "config/site.yaml", "title: 内容仓的新标题\n");
		commitAll(content, "chore: update config");

		const output = expectFailure(() => exportRun(code, ["--yes", "--config"]));

		assert.match(output, /out of sync with content repo/i);
		assert.match(output, /site/);
		assert.match(output, /pnpm content:sync/);
		assert.equal(
			read(content, "config/site.yaml"),
			"title: 内容仓的新标题\n",
			"熔断时不得改动内容仓的配置",
		);
	});

	it("导出后校验配置能通过类型校验，且不留下对代码仓的改动", () => {
		const { code } = createFixture();
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = { site: { title: "我的博客" } };
export const userConfigSources = [];
`,
		);
		const before = read(code, "src/user/user-config.ts");

		const output = exportRun(code, ["--yes", "--config", "--force"]);

		assert.match(output, /passed type checking/i);
		assert.equal(
			read(code, "src/user/user-config.ts"),
			before,
			"校验期间写入的生成物必须原样还原",
		);
	});

	it("绝不改动代码仓的 .gitignore、git 索引与 shirone.content.json", () => {
		const { code } = createFixture();
		write(code, "src/content/posts/new.md", "# New\n");
		const gitignore = read(code, ".gitignore");
		const manifest = read(code, "shirone.content.json");
		const index = git(code, ["diff", "--cached", "--name-only"]);

		exportRun(code, ["--yes"]);

		assert.equal(read(code, ".gitignore"), gitignore);
		assert.equal(read(code, "shirone.content.json"), manifest);
		assert.equal(git(code, ["diff", "--cached", "--name-only"]), index);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 往返不变式
// ─────────────────────────────────────────────────────────────────────────────

describe("content:export 往返不变式", () => {
	it("文件：export -> sync 后两侧内容全等，再次 export 报告无改动", () => {
		const { code, content } = createFixture();
		write(code, "src/content/posts/rescued.md", "# 被救回的文章\n");
		write(code, "src/content/posts/概率论/index.md", "# 概率论（改过）\n");
		write(code, "src/content/posts/毛概/index.md", "# 毛概\n");

		exportRun(code, ["--yes", "--posts"]);
		syncRun(code);

		for (const [repoPath, contentPath] of [
			["src/content/posts/rescued.md", "content/posts/rescued.md"],
			["src/content/posts/概率论/index.md", "content/posts/概率论/index.md"],
			["src/content/posts/毛概/index.md", "content/posts/毛概/index.md"],
		]) {
			assert.equal(
				read(code, repoPath),
				read(content, contentPath),
				`${repoPath} 与 ${contentPath} 内容应全等`,
			);
		}

		// 幂等：第二次导出没有任何可写的东西。
		const second = exportRun(code, ["--yes", "--posts"]);
		assert.match(second, /no export needed/i);
	});

	it("配置：export -> sync 后生效配置逐字段相等", async () => {
		const { code } = createFixture();
		// 模拟「覆盖层被手工改过，内容仓 YAML 还没跟上」的救援场景。
		write(
			code,
			"src/user/user-config.ts",
			`export const userConfigOverrides = {
	site: { title: "我的博客", themeColor: { hue: 262 }, favicon: [{ src: "/f.png" }] },
	profile: { name: "我", links: [{ name: "Blog", url: "https://me.example" }] },
	llms: { enable: false, excludeTags: ["日记"] },
	comment: { enable: true, twikoo: { envId: "https://tw.example" } },
};
export const userConfigSources = [];
`,
		);
		const before = await effectiveConfig(code);

		exportRun(code, ["--yes", "--config", "--force"]);
		syncRun(code);
		const after = await effectiveConfig(code);

		assert.deepEqual(after, before, "往返后生效配置必须逐字段相等");

		// 再次导出应当无改动——此时 YAML 已经是最小覆盖集。
		const second = exportRun(code, ["--yes", "--config"]);
		assert.match(second, /no export needed/i);
	});
});
