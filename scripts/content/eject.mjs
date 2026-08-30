/**
 * 一次性迁移到 external 模式：把仓内内容导出成内容仓初始目录，并让代码仓不再跟踪这些路径。
 *
 * 只应在「自己的博客 fork」里执行一次。上游主题仓保持 local 模式与 demo 内容跟踪不变，
 * 主题使用者 clone 后的行为不受影响。
 *
 * 用法：
 *   node scripts/content/eject.mjs [--dry-run]        # 预演，只打印将要发生的改动
 *   node scripts/content/eject.mjs --yes               # 实际执行
 *   node scripts/content/eject.mjs --yes --out ../my-content
 */

import { execFileSync } from "node:child_process";
import {
	appendFileSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { profileConfig } from "../../src/config/profileConfig.ts";
import { siteConfig } from "../../src/config/siteConfig.ts";
import {
	CONFIG_DIRECTORY,
	CONFIG_DOMAINS,
	FOOTER_HTML_SOURCE,
	FOOTER_HTML_TARGET,
	GENERATED_CONFIG_FILE,
} from "./config-domains.mjs";
import {
	MANIFEST_FILE,
	matchesAny,
	pathsOverlap,
	toPosix,
} from "./resolve-source.mjs";

const ROOT = process.cwd();

/**
 * 导出规则：`代码仓路径` -> `内容仓路径`。
 *
 * 只导出用户内容。主题自有资产（`src/assets/fonts/`、`public/favicon/`）
 * 与构建期生成物（缩略图、番剧封面、番剧快照）留在代码仓。
 */
const EXPORT_RULES = [
	{ repo: "src/content", content: "content" },
	{
		repo: "src/data",
		content: "data",
		exclude: ["src/data/anime-snapshots/**"],
	},
	{ repo: "src/assets/images", content: "assets/images" },
	{ repo: "public/images", content: "public/images" },
	{ repo: "public/assets/banner", content: "public/assets/banner" },
	{ repo: "public/assets/music", content: "public/assets/music" },
	{ repo: "public/assets/projects", content: "public/assets/projects" },
	{
		repo: "public/assets/anime",
		content: "public/assets/anime",
		exclude: ["public/assets/anime/covers/**"],
	},
];

/** eject 之后由内容仓接管、代码仓不再跟踪的路径。 */
const GITIGNORE_ENTRIES = [
	"/src/content/",
	"/src/data/*.ts",
	`/${GENERATED_CONFIG_FILE}`,
	`/${FOOTER_HTML_TARGET}`,
	"/src/assets/images/",
	"/public/images/",
	"/public/assets/banner/",
	"/public/assets/music/",
	"/public/assets/projects/",
	"/public/assets/anime/*.webp",
];

const GITIGNORE_HEADER =
	"# content repository (materialized by `pnpm content:sync`)";

const args = process.argv.slice(2);
const options = {
	apply: args.includes("--yes") && !args.includes("--dry-run"),
	force: args.includes("--force"),
	help: args.includes("--help") || args.includes("-h"),
	out: "../shirone-content",
};

if (options.help) {
	console.log(
		[
			"Usage: node scripts/content/eject.mjs [--yes|--dry-run] [--force] [--out <dir>]",
			"",
			"  (no args)/--dry-run  Dry-run mode: print plan without modifying any files",
			"  --yes                Execute migration (--dry-run takes precedence)",
			"  --out <dir>          Specify export destination directory (default: ../shirone-content)",
			"  --force              Force export (allow non-empty directory or dirty working tree)",
		].join("\n"),
	);
	process.exit(0);
}

const knownFlags = new Set(["--yes", "--dry-run", "--force"]);
let sawOut = false;
for (let index = 0; index < args.length; index += 1) {
	const argument = args[index];
	if (argument === "--out") {
		if (sawOut) {
			console.error("[content] --out can only be specified once.");
			process.exit(1);
		}
		const value = args[index + 1];
		if (!value || value.startsWith("-")) {
			console.error("[content] --out requires a directory argument.");
			process.exit(1);
		}
		options.out = value;
		sawOut = true;
		index += 1;
		continue;
	}
	if (!knownFlags.has(argument)) {
		console.error(
			`[content] eject does not support argument: ${argument}. Run --help to view available options.`,
		);
		process.exit(1);
	}
}

function log(message) {
	console.log(`[content] ${message}`);
}

function git(gitArgs) {
	return execFileSync("git", gitArgs, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}

function collectFiles(directory, prefix = "", accumulator = []) {
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === ".git") continue;
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			collectFiles(join(directory, entry.name), relativePath, accumulator);
		} else if (entry.isFile()) {
			accumulator.push(relativePath);
		}
	}
	return accumulator;
}

function assertCleanWorktree() {
	if (options.force) return;
	let status;
	try {
		status = git(["status", "--porcelain"]);
	} catch {
		throw new Error("Current directory is not a git repository, cannot perform eject.");
	}
	if (status !== "") {
		throw new Error(
			"Working tree has uncommitted changes. eject will modify .gitignore and git index, " +
				"please commit or stash first, or use --force to bypass this check.",
		);
	}
}

function buildPlan() {
	const plan = [];
	for (const rule of EXPORT_RULES) {
		const absolute = join(ROOT, rule.repo);
		if (!existsSync(absolute) || !statSync(absolute).isDirectory()) continue;
		for (const relativePath of collectFiles(absolute)) {
			const repoRelative = `${rule.repo}/${relativePath}`;
			if (rule.exclude && matchesAny(repoRelative, rule.exclude)) continue;
			plan.push({
				from: repoRelative,
				to: `${rule.content}/${relativePath}`,
			});
		}
	}
	return plan;
}

/**
 * 生成 `config/` 起步文件。
 *
 * 只导出「站点身份」——站点地址、标题、语言、博主资料。这些本来就该由内容仓拥有，
 * 而且是使用者第一件要改的事。其余领域**刻意留空**：把当前默认值全量倒进内容仓，
 * 等于把配置冻结在此刻的主题版本上，日后主题新增的默认值再也进不来。
 */
function writeConfigStarters(outAbsolute) {
	const configDirectory = join(outAbsolute, CONFIG_DIRECTORY);
	mkdirSync(configDirectory, { recursive: true });

	const header = (file) =>
		[
			`# ${file} —— 覆盖主题的 src/config/${file.replace(/-([a-z])/g, (_, c) => c.toUpperCase()).replace(/\.yaml$/, "")}Config.ts`,
			"# 只写想改的键，其余保持主题默认值（主题升级后新默认值会自动生效）。",
			"",
		].join("\n");

	writeFileSync(
		join(configDirectory, "site.yaml"),
		header("site.yaml") +
			stringifyYaml({
				site: siteConfig.site,
				base: siteConfig.base,
				title: siteConfig.title,
				subtitle: siteConfig.subtitle,
				lang: siteConfig.lang,
			}),
	);

	writeFileSync(
		join(configDirectory, "profile.yaml"),
		header("profile.yaml") +
			stringifyYaml({
				avatar: profileConfig.avatar,
				name: profileConfig.name,
				bio: profileConfig.bio,
				links: profileConfig.links,
			}),
	);

	const footerSource = join(ROOT, FOOTER_HTML_TARGET);
	if (existsSync(footerSource)) {
		copyFileSync(footerSource, join(configDirectory, FOOTER_HTML_SOURCE));
	}

	writeFileSync(
		join(configDirectory, "README.md"),
		[
			"# 站点配置",
			"",
			"本目录的每个 YAML 文件覆盖主题里的一个配置领域，构建前由代码仓的",
			"`pnpm content:sync` 编译成 `src/user/user-config.ts`，再与主题默认值深合并。",
			"",
			"- **只写想改的键。** 没写的键沿用主题默认值，主题升级时自动跟进。",
			"- **对象递归合并，数组整体替换。** 想改清单里的一项，要把整个清单写全。",
			"- **拼错的键会让构建失败**，并给出 `Did you mean ...?` 提示，不会被静默忽略。",
			"",
			"可用文件（默认值与逐项注释见代码仓 `src/config/`）：",
			"",
			"| 文件 | 覆盖的配置 |",
			"| --- | --- |",
			...CONFIG_DOMAINS.map(
				(domain) => `| \`${domain.file}.yaml\` | \`${domain.key}Config\` |`,
			),
			`| \`${FOOTER_HTML_SOURCE}\` | 页脚注入的自定义 HTML（需同时在 \`footer.yaml\` 里 \`enable: true\`） |`,
			"",
			"`nav-bar.yaml` 是唯一的例外：导航项要引用主题内置预设并走 i18n，",
			"因此写的是 `- preset: Home` / `- name: 留言板` 这种声明式条目，",
			"完整写法见代码仓 `docs/content-separation/config-overlay.md`。",
			"",
		].join("\n"),
	);
}

function writeStarterFiles(outAbsolute, plan) {
	const postCount = plan.filter(
		(item) => item.to.startsWith("content/posts/") && item.to.endsWith(".md"),
	).length;

	writeConfigStarters(outAbsolute);

	writeFileSync(
		join(outAbsolute, "README.md"),
		[
			"# Shirone Content",
			"",
			"这是 Shirone 站点的内容仓库，只保存文章、说说、页面数据实体、站点配置和用户图片。",
			"主题实现、依赖、构建与部署由代码仓库负责。",
			"",
			"## 目录边界",
			"",
			"| 内容仓库 | 代码仓库物化路径 |",
			"| --- | --- |",
			"| `content/` | `src/content/` |",
			"| `config/` | 编译进 `src/user/user-config.ts`（见本目录 README） |",
			"| `data/` | `src/data/` |",
			"| `assets/` | `src/assets/` |",
			"| `public/` | `public/` |",
			"",
			"`README.md`、`docs/` 和本仓库的 `.github/` 不会被物化，也不会触发站点重建。",
			"",
			"## 发布流程",
			"",
			"1. 在本仓库修改 `content/`、`data/`、`assets/` 或 `public/`；",
			"2. 提交并推送 `main` 分支；",
			"3. `.github/workflows/trigger-build.yml` 向代码仓发送 `content-updated` 事件；",
			"4. 代码仓 Actions 物化内容、构建并部署。",
			"",
			"## 本地预览",
			"",
			"在代码仓执行（PowerShell）：",
			"",
			"```powershell",
			'$env:CONTENT_DIR = "<本仓库的本地路径>"',
			"pnpm content:sync",
			"pnpm dev",
			"```",
			"",
			"边写边看时可以另开一个终端运行 `pnpm content:watch`。",
			"",
			`当前共 ${postCount} 篇文章。`,
			"",
		].join("\n"),
	);

	const workflowPath = join(
		outAbsolute,
		".github",
		"workflows",
		"trigger-build.yml",
	);
	mkdirSync(dirname(workflowPath), { recursive: true });
	writeFileSync(
		workflowPath,
		[
			"name: Trigger site build",
			"",
			"# 内容推送后自动通知代码仓重新构建并发布。",
			"# 需要在本仓库配置 secrets.DISPATCH_TOKEN：",
			"# 一个只对代码仓授予 Contents: Read and write 权限的个人访问令牌（PAT）。",
			"#",
			"# 并发控制：连续快速推送时自动取消旧派发作业，仅保留最新一次触发，避免重复派发。",
			"# 想在合并前预检内容，可增加调用代码仓 .github/workflows/content-validate.yml 的作业。",
			"",
			"on:",
			"  push:",
			"    branches: [main]",
			"    paths:",
			'      - "content/**"',
			'      - "config/**"',
			'      - "data/**"',
			'      - "assets/**"',
			'      - "public/**"',
			'      - "shirone.content.json"',
			"  workflow_dispatch: {}",
			"",
			"concurrency:",
			"  group: trigger-build",
			"  cancel-in-progress: true",
			"",
			"jobs:",
			"  dispatch:",
			"    runs-on: ubuntu-latest",
			"    timeout-minutes: 5",
			"    steps:",
			"      - name: Notify code repository",
			"        uses: peter-evans/repository-dispatch@28959ce8df70de7be546dd1250a005dd32156697 # v4.0.1",
			"        with:",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 表达式，不是 JS 模板占位符
			"          token: ${{ secrets.DISPATCH_TOKEN }}",
			"          repository: OWNER/REPO # TODO: 替换为代码仓",
			"          event-type: content-updated",
			"          # 传 SHA 让代码仓构建「触发它的那次提交」，而不是构建时刻的 main。",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions 表达式，不是 JS 模板占位符
			'          client-payload: \'{"sha": "${{ github.sha }}"}\'',
			"",
		].join("\n"),
	);

	writeFileSync(
		join(outAbsolute, ".gitignore"),
		["node_modules/", ".DS_Store", "Thumbs.db", ""].join("\n"),
	);
}

function updateGitignore() {
	const gitignorePath = join(ROOT, ".gitignore");
	const current = existsSync(gitignorePath)
		? readFileSync(gitignorePath, "utf8")
		: "";
	const existing = new Set(current.split(/\r?\n/).map((line) => line.trim()));
	const missing = GITIGNORE_ENTRIES.filter((entry) => !existing.has(entry));
	if (missing.length === 0) return [];

	const block = `\n${GITIGNORE_HEADER}\n${missing.join("\n")}\n`;
	if (options.apply) appendFileSync(gitignorePath, block);
	return missing;
}

function untrackPaths() {
	const pathspecs = [
		"src/content",
		"src/data/*.ts",
		GENERATED_CONFIG_FILE,
		FOOTER_HTML_TARGET,
		"src/assets/images",
		"public/images",
		"public/assets/banner",
		"public/assets/music",
		"public/assets/projects",
		"public/assets/anime/*.webp",
	];
	if (!options.apply) return pathspecs;
	for (const pathspec of pathspecs) {
		git(["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", pathspec]);
	}
	return pathspecs;
}

function writeManifest(outAbsolute) {
	const manifestPath = join(ROOT, MANIFEST_FILE);
	if (existsSync(manifestPath) && !options.force) {
		log(`${MANIFEST_FILE} already exists, keeping unchanged (use --force to overwrite).`);
		return;
	}
	const relativeOut = toPosix(relative(ROOT, outAbsolute)) || ".";
	const manifest = {
		schemaVersion: 1,
		source: { type: "path", path: relativeOut },
	};
	if (options.apply) {
		writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
	log(
		`Wrote ${MANIFEST_FILE}, content source points to ${relativeOut}. ` +
			'After pushing content repository to remote, change source to { "type": "git", "url": ..., "ref": "main" }.',
	);
}

function main() {
	const outAbsolute = resolve(ROOT, options.out);
	if (pathsOverlap(ROOT, outAbsolute)) {
		throw new Error(
			`Output directory ${outAbsolute} and code repository ${ROOT} overlap. ` +
				"Please use an independent directory outside the code repository to avoid self-copying or overwriting source code.",
		);
	}
	assertCleanWorktree();
	if (
		existsSync(outAbsolute) &&
		readdirSync(outAbsolute).length > 0 &&
		!options.force
	) {
		throw new Error(
			`Output directory ${outAbsolute} is not empty. Please specify another --out directory, or use --force.`,
		);
	}

	const plan = buildPlan();
	if (plan.length === 0) {
		throw new Error("No exportable content found, repository may have already been ejected.");
	}

	log(
		`${options.apply ? "" : "[dry-run] "}Exporting ${plan.length} files to ${outAbsolute}`,
	);
	if (options.apply) {
		for (const item of plan) {
			const target = join(outAbsolute, item.to);
			mkdirSync(dirname(target), { recursive: true });
			copyFileSync(join(ROOT, item.from), target);
		}
		writeStarterFiles(outAbsolute, plan);
	}

	const ignored = updateGitignore();
	if (ignored.length > 0) {
		log(
			`${options.apply ? "Appended" : "[dry-run] Will append"} ${ignored.length} .gitignore rules`,
		);
	}

	const untracked = untrackPaths();
	log(
		`${options.apply ? "Removed from git index" : "[dry-run] Will remove from git index"}: ${untracked.join(", ")}`,
	);

	writeManifest(outAbsolute);

	if (!options.apply) {
		log("The above is a dry run. Confirm everything is correct, then re-run with --yes.");
		return;
	}

	log("Complete. Next steps:");
	log(
		`  1. cd ${outAbsolute} && git init && git add . && git commit -m "chore: initial content"`,
	);
	log("  2. Push content repository to remote and configure secrets.DISPATCH_TOKEN");
	log(
		"  3. In code repository, copy .github/workflows/deploy.yml.example to deploy.yml and fill in deployment steps",
	);
	log("  4. In code repository, commit .gitignore, shirone.content.json, and index changes");
}

try {
	main();
} catch (error) {
	console.error(`[content] ${error.message}`);
	process.exitCode = 1;
}
