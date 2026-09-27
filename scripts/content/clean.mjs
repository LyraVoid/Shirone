/**
 * 内容清理：把代码仓从 `external` 模式的物化状态还原成「主题自带内容」的纯净状态。
 *
 * 清理范围严格限定在**挂载目标 + 配置生成物**（`src/content/`、`src/data/`、`src/assets/`、
 * `public/`、`src/user/user-config.ts`、`src/config/FooterConfig.html`）之内。
 * 主题源码（`src/components/`、`src/config/*.ts`、`src/utils/` 等）里的未提交改动**不属于清理范围**，
 * 绝不会被回滚——这是本脚本与「`git checkout -- src/`」的根本区别。
 *
 * 三类文件的处理方式各不相同，必须区分，否则 eject 之后的仓库会被漏清理或误删：
 *
 * | 文件状态 | 例子 | 处理 |
 * | --- | --- | --- |
 * | 被跟踪且有改动/被删除 | 物化覆盖或裁剪掉的 demo 内容 | `git restore` 回 HEAD |
 * | 未跟踪 | 未 eject 的仓库里新物化进来的文章 | 备份后删除 |
 * | 被 .gitignore 忽略 | **eject 之后**的全部物化内容 | 备份后删除（`git clean -x`） |
 *
 * 第三类是最容易漏掉的一环：`pnpm content:eject` 会把 `/src/content/` 等路径写进 `.gitignore`，
 * 此后 `git status` 对它们完全沉默，只看 status 的清理脚本会「什么都没清掉却报告成功」。
 *
 * 构建期生成物（说说缩略图、番剧封面与快照、子集字体）虽然同样被忽略，但重建代价高昂
 * （番剧封面要走外部 API），因此显式豁免，与 `sync.mjs` 的 `PROTECTED_PATHS` 保持同一套语义。
 *
 * 安全机制：
 * 1. **默认只预演**：不带 `--yes` 时只打印计划，与 `content:eject` 的约定一致；
 * 2. **快照备份**：删除或还原前把受影响文件复制到 `.content-backup/clean-<timestamp>/`（已 gitignore）；
 * 3. **失败即熔断**：任何步骤出错立即中止，并明确告知「是否已经产生破坏性改动」；
 * 4. **收尾体检**：清理后检查内容源是否仍然生效、demo 内容是否已不再被跟踪，并给出后续指引。
 *
 * 用法：
 *   node scripts/content/clean.mjs              # 预演（默认，等同 --dry-run）
 *   node scripts/content/clean.mjs --yes        # 实际执行
 *   node scripts/content/clean.mjs --yes --no-backup
 *   node scripts/content/clean.mjs --yes --keep-working-copy
 */

import { execFileSync } from "node:child_process";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
	FOOTER_HTML_TARGET,
	GENERATED_CONFIG_FILE,
} from "./config-domains.mjs";
import { EMPTY_MODULE } from "./config-overlay.mjs";
import {
	DEFAULT_MOUNTS,
	LOCK_FILE,
	MANIFEST_FILE,
	matchesAny,
	PROTECTED_PATHS,
	resolveContentSource,
	toPosix,
	WORKING_COPY_DIR,
} from "./resolve-source.mjs";

const ROOT = process.cwd();

/**
 * 既不备份也不删除的路径。
 *
 * `PROTECTED_PATHS` 是与 `sync.mjs` 共享的构建期生成物豁免表；
 * 番剧快照与各目录的 `.gitkeep` 一并豁免：前者是基线数据（provider 快照重建要打外部接口，
 * 自定义 `source.file` 则是使用者数据），后者是代码仓用来占位空目录的自有文件。
 */
const CLEAN_PROTECTED_PATHS = Object.freeze([
	...PROTECTED_PATHS,
	"src/data/anime-snapshots/**",
	"**/.gitkeep",
]);

/** `git clean` 的排除模式（gitignore 语法，`/` 前缀锚定仓库根）。 */
const CLEAN_EXCLUDES = Object.freeze([
	"/public/assets/anime/covers/**",
	"/public/assets/moments/thumbnails/**",
	"/src/assets/fonts/.subset/**",
	"/src/data/anime-snapshots/**",
	"**/.gitkeep",
	// 配置生成物由脚本自己按语义处理（user-config.ts 必须存在，否则构建直接失败）。
	`/${GENERATED_CONFIG_FILE}`,
	`/${FOOTER_HTML_TARGET}`,
]);

/** 需要一并清掉的溯源文件与构建缓存。 */
function cacheTargets() {
	return [
		{ path: LOCK_FILE, label: "Content provenance lock file" },
		{ path: "node_modules/.astro/data-store.json", label: "Astro content layer cache" },
		// Astro 7 之前的落点，老仓库里可能还留着。
		{ path: ".astro/data-store.json", label: "Astro content layer cache (legacy path)" },
		{ path: ".astro/collections", label: "Astro collection schema cache" },
		{ path: "node_modules/.cache/shirone", label: "Config validation cache and digest" },
	];
}

const args = process.argv.slice(2);
const options = {
	// 与 content:eject 一致：默认只预演。`--dry-run` 保留为显式写法，且优先于 `--yes`。
	apply: args.includes("--yes") && !args.includes("--dry-run"),
	backup: !args.includes("--no-backup"),
	keepWorkingCopy: args.includes("--keep-working-copy"),
	help: args.includes("--help") || args.includes("-h"),
};
const unknownArgs = args.filter(
	(argument) =>
		![
			"--yes",
			"--dry-run",
			"--no-backup",
			"--keep-working-copy",
			"--help",
			"-h",
		].includes(argument),
);

/** 破坏性阶段是否已经开始——决定失败时该告诉用户「工作区原样」还是「已部分改动」。 */
let mutated = false;

function log(message) {
	console.log(`[content:clean] ${message}`);
}

function warn(message) {
	console.warn(`[content:clean] Warning: ${message}`);
}

function fail(step, error, details = "") {
	console.error(`\n[content:clean] Step failed and aborted: ${step}`);
	if (details) console.error(`[content:clean] Context: ${details}`);
	if (error instanceof Error) {
		console.error(`[content:clean] Error message: ${error.message}`);
		if (error.stack) console.error(`[content:clean] Call stack:\n${error.stack}`);
	} else if (error !== undefined && error !== null) {
		console.error(`[content:clean] Error details: ${String(error)}`);
	}
	console.error(
		mutated
			? "[content:clean] Partial modifications have occurred. If a snapshot backup was created, you can recover pre-clean files from .content-backup/.\n"
			: "[content:clean] No destructive operations were performed. Working tree remains untouched.\n",
	);
	process.exit(1);
}

function runGit(gitArgs, step, { allowFailure = false } = {}) {
	try {
		return execFileSync(
			"git",
			// 关掉八进制转义，否则中文路径会变成 "\346\246\202..." 这种带引号的字符串，
			// 备份阶段按它去找文件必然 miss，随后 clean 又照样把文件删掉 —— 静默丢数据。
			["-c", "core.quotepath=false", ...gitArgs],
			{
				cwd: ROOT,
				encoding: "utf8",
				maxBuffer: 64 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
	} catch (error) {
		if (allowFailure) return null;
		const stderr = error.stderr ? String(error.stderr).trim() : "";
		const stdout = error.stdout ? String(error.stdout).trim() : "";
		fail(
			step,
			error,
			`git ${gitArgs.join(" ")}\nStandard output: ${stdout}\nError output: ${stderr}`,
		);
	}
}

/** 跑一条输出 NUL 分隔路径的 git 命令，返回仓库相对路径数组。 */
function gitPaths(gitArgs, step) {
	const output = runGit(gitArgs, step) ?? "";
	return output
		.split("\0")
		.map((value) => value.trim())
		.filter(Boolean)
		.map(toPosix);
}

/** 分批执行，避免路径过多时超出命令行长度上限（Windows 约 32 KB）。 */
function inChunks(items, size, handler) {
	for (let index = 0; index < items.length; index += size) {
		handler(items.slice(index, index + size));
	}
}

function isProtected(repoRelativePath) {
	return matchesAny(repoRelativePath, CLEAN_PROTECTED_PATHS);
}

function collectFiles(absolute, prefix = "", accumulator = []) {
	for (const entry of readdirSync(absolute, { withFileTypes: true })) {
		const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			collectFiles(join(absolute, entry.name), relativePath, accumulator);
		} else if (entry.isFile()) {
			accumulator.push(relativePath);
		}
	}
	return accumulator;
}

function fileSize(absolute) {
	try {
		return statSync(absolute).size;
	} catch {
		return 0;
	}
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

if (options.help) {
	console.log(
		[
			"Usage: node scripts/content/clean.mjs [--yes|--dry-run] [--no-backup] [--keep-working-copy]",
			"",
			"  (no args)/--dry-run   Dry-run: print clean plan without modifying any files",
			"  --yes                 Execute clean",
			"  --no-backup           Skip .content-backup/ snapshot backup (not recommended)",
			"  --keep-working-copy   Keep .content-src/ content repository working copy to avoid re-fetching next time",
			"",
			"Clean scope: content mount targets (src/content, src/data, src/assets, public) and config artifacts.",
			"Uncommitted changes in theme source code are out of scope and will not be rolled back.",
		].join("\n"),
	);
	process.exit(0);
}

if (unknownArgs.length > 0) {
	console.error(
		`[content:clean] Unsupported argument(s): ${unknownArgs.join(", ")}. Run --help to view available options.`,
	);
	process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. 解析清理范围：挂载目标 + 配置生成物
// ─────────────────────────────────────────────────────────────────────────────

let resolved;
try {
	resolved = resolveContentSource(ROOT);
} catch (error) {
	if (/mounts\.|挂载/.test(error.message)) {
		fail(
			"Validate clean scope",
			error,
			`Cannot safely determine materialization scope from ${MANIFEST_FILE}; please fix mounts first to avoid cleaning wrong directories.`,
		);
	}
	// 清单写错不该阻止清理——恰恰这时候最需要回到干净状态。
	warn(`Failed to read content source config, continuing with default mounts: ${error.message}`);
	resolved = { mode: "local", reason: "Content source configuration cannot be parsed" };
}

const mounts = resolved.mode === "external" ? resolved.mounts : DEFAULT_MOUNTS;
/** 参与清理的目录（挂载目标）。 */
const scopeDirectories = [...new Set(Object.values(mounts).map(toPosix))];

/**
 * 清理会对挂载目标执行 `git clean -ffdx`，因此目标必须足够具体。
 *
 * 若清单把某个挂载点指向 `src` 或仓库根，`-x` 会把开发者尚未提交的源码草稿、
 * 本地脚本与被忽略的工具产物一起删掉。宁可拒绝执行，也不冒这个风险。
 */
const UNSAFE_SCOPE = new Set([
	"",
	".",
	"/",
	"src",
	"scripts",
	"tests",
	"node_modules",
]);
for (const directory of scopeDirectories) {
	if (UNSAFE_SCOPE.has(directory) || directory.split("/").includes("..")) {
		fail(
			"Validate clean scope",
			new Error(`Mount target ${directory || "(repo root)"} is too broad, refusing to clean`),
			`Please point it to a more specific directory (e.g. src/content) in ${MANIFEST_FILE} mounts. ` +
				"Running git clean -x on this directory would delete uncommitted source code.",
		);
	}
}
/** 参与清理的单文件（配置生成物）。 */
const scopeFiles = [GENERATED_CONFIG_FILE, FOOTER_HTML_TARGET].map(toPosix);
const scopePathspecs = [...scopeDirectories, ...scopeFiles];

if (
	!runGit(["rev-parse", "--is-inside-work-tree"], "Check Git working tree", {
		allowFailure: true,
	})
) {
	mutated = false;
	fail(
		"Check Git working tree",
		new Error("Current directory is not a Git worktree"),
		"Please run this script at the root of the code repository; clean relies on git to distinguish theme default content from materialized content.",
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 分类：待还原（tracked 有差异）/ 待删除（untracked + ignored）
// ─────────────────────────────────────────────────────────────────────────────

/** 被跟踪但与 HEAD 有差异的文件（含被 sync 裁剪掉的 demo 内容）。 */
const changedTracked = gitPaths(
	["diff", "-z", "--name-only", "HEAD", "--", ...scopePathspecs],
	"Compare tracked files with HEAD",
);
/** 已进入索引但 HEAD 中不存在的新增文件（`git add` 过的物化内容）。 */
const addedToIndex = gitPaths(
	[
		"diff",
		"-z",
		"--name-only",
		"--diff-filter=A",
		"--cached",
		"HEAD",
		"--",
		...scopePathspecs,
	],
	"Compare index with HEAD",
);
const untracked = gitPaths(
	["ls-files", "-z", "--others", "--exclude-standard", "--", ...scopePathspecs],
	"List untracked files",
);
/**
 * 被 .gitignore 忽略的文件。
 *
 * eject 之后**全部**物化内容都落在这一类里，只看 `git status` 会完全看不见它们。
 */
const ignored = gitPaths(
	[
		"ls-files",
		"-z",
		"--others",
		"--ignored",
		"--exclude-standard",
		"--",
		...scopePathspecs,
	],
	"List ignored materialized files",
).filter((path) => !isProtected(path));

const toRestore = changedTracked.filter((path) => !addedToIndex.includes(path));
const toDelete = [...new Set([...untracked, ...ignored, ...addedToIndex])]
	.filter((path) => !isProtected(path))
	// 配置生成物有各自的语义（见第 5 步），不走通用删除。
	.filter((path) => !scopeFiles.includes(path));
const ignoredToDelete = toDelete.filter((path) => ignored.includes(path));

/**
 * 已经不被代码仓跟踪的挂载点（`content:eject` 的结果）。
 *
 * 必须在删除之前判定：清空之后目录可能整个消失，事后再查只会得出「不存在」而漏报。
 */
const ejectedScope = scopeDirectories.filter((directory) => {
	if (!existsSync(join(ROOT, directory))) return false;
	const tracked = runGit(
		["ls-files", "-z", "--", directory],
		"Check mount point tracking status",
		{ allowFailure: true },
	);
	return !tracked || tracked.trim() === "";
});

/** 备份对象：待删除的全部文件 + 待还原文件里当前仍存在于磁盘的那些。 */
const toBackup = [
	...new Set([...toDelete, ...toRestore, ...scopeFiles]),
].filter((path) => existsSync(join(ROOT, path)));
const backupBytes = toBackup.reduce(
	(sum, path) => sum + fileSize(join(ROOT, path)),
	0,
);

const existingCacheTargets = cacheTargets().filter((target) =>
	existsSync(join(ROOT, target.path)),
);
const workingCopyExists = existsSync(join(ROOT, WORKING_COPY_DIR));

// ─────────────────────────────────────────────────────────────────────────────
// 3. 预演输出（默认行为）
// ─────────────────────────────────────────────────────────────────────────────

function preview(paths, limit = 12) {
	for (const path of paths.slice(0, limit)) console.log(`    ${path}`);
	if (paths.length > limit) {
		console.log(`    ... and ${paths.length - limit} more files`);
	}
}

function reportPlan() {
	log(`Clean scope: ${scopePathspecs.join(", ")}`);
	log(
		`Restoring ${toRestore.length} tracked files, deleting ${toDelete.length} materialized files` +
			` (${ignoredToDelete.length} ignored by .gitignore).`,
	);
	if (toRestore.length > 0) {
		console.log("  [Restore to HEAD]");
		preview(toRestore);
	}
	if (toDelete.length > 0) {
		console.log("  [Delete]");
		preview(toDelete);
	}
	console.log("  [Reset]");
	console.log(`    ${GENERATED_CONFIG_FILE} (reset to empty overlay)`);
	if (existsSync(join(ROOT, FOOTER_HTML_TARGET))) {
		console.log(`    ${FOOTER_HTML_TARGET} (restore or remove custom footer)`);
	}
	if (existingCacheTargets.length > 0) {
		console.log("  [Clear cache and lock files]");
		for (const target of existingCacheTargets) {
			console.log(`    ${target.path} -- ${target.label}`);
		}
	}
	if (workingCopyExists) {
		console.log(
			`  [Content repo working copy] ${WORKING_COPY_DIR}${options.keepWorkingCopy ? " (--keep-working-copy, kept)" : " (removed)"}`,
		);
	}
	console.log("  [Regenerate] Offline icon collections, moments thumbnails");
	if (options.backup && toBackup.length > 0) {
		log(
			`A snapshot backup will be created first: ${toBackup.length} files, approx ${formatBytes(backupBytes)}, located in .content-backup/`,
		);
	} else if (!options.backup) {
		warn("Specified --no-backup, no snapshot backup will be created before cleaning.");
	}
	if (isProtected("public/assets/moments/thumbnails/x.webp")) {
		log(
			"Build-time artifacts (moments thumbnails, anime covers & snapshots, subset fonts) and .gitkeep files are exempted and will not be deleted.",
		);
	}
}

log(
	options.apply
		? "Cleaning materialized content and config overlays..."
		: "Dry-run mode (no --yes specified, no files will be modified)",
);
reportPlan();

if (!options.apply) {
	log("Dry-run complete. Run with --yes to execute: pnpm content:clean --yes");
	process.exit(0);
}

const nothingToDo =
	toRestore.length === 0 &&
	toDelete.length === 0 &&
	existingCacheTargets.length === 0 &&
	!workingCopyExists;

// ─────────────────────────────────────────────────────────────────────────────
// 4. 快照备份
// ─────────────────────────────────────────────────────────────────────────────

let backupDirectory = null;
if (options.backup && toBackup.length > 0) {
	const now = new Date();
	const pad = (value) => String(value).padStart(2, "0");
	const stamp =
		`${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
		`-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
	backupDirectory = join(ROOT, ".content-backup", `clean-${stamp}`);

	try {
		mkdirSync(backupDirectory, { recursive: true });
		for (const path of toBackup) {
			const destination = join(backupDirectory, path);
			mkdirSync(dirname(destination), { recursive: true });
			copyFileSync(join(ROOT, path), destination);
		}
		const head = (
			runGit(["rev-parse", "HEAD"], "Record HEAD", { allowFailure: true }) ?? ""
		).trim();
		writeFileSync(
			join(backupDirectory, "manifest.json"),
			`${JSON.stringify(
				{
					timestamp: now.toISOString(),
					head: head || null,
					contentMode: resolved.mode,
					scope: scopePathspecs,
					counts: {
						backedUp: toBackup.length,
						restored: toRestore.length,
						deleted: toDelete.length,
						ignoredDeleted: ignoredToDelete.length,
					},
					bytes: backupBytes,
					restored: toRestore,
					deleted: toDelete,
					restoreInstruction:
						"To restore, copy files in this directory (except manifest.json) back to the code repository matching their relative paths: " +
						"PowerShell `Copy-Item -Recurse -Force .\\<this_dir>\\* .` ; Bash `cp -a <this_dir>/. .`",
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		log(
			`Created snapshot backup: ${toPosix(relative(ROOT, backupDirectory))}` +
				` (${toBackup.length} files, ${formatBytes(backupBytes)})`,
		);
	} catch (error) {
		fail(
			"Create snapshot backup",
			error,
			`Backup directory: ${backupDirectory}. To prevent data loss, clean was aborted before deleting any files.`,
		);
	}
}

// 备份完成，之后的步骤开始产生实际改动。
mutated = true;

// ─────────────────────────────────────────────────────────────────────────────
// 5. 还原被跟踪文件、删除物化文件、重置配置生成物
// ─────────────────────────────────────────────────────────────────────────────

if (toRestore.length > 0 || addedToIndex.length > 0) {
	// `--staged --worktree` 同时复位索引与工作区：物化内容若被 git add 过，
	// 只复位工作区会让它继续以「已跟踪」的身份留在索引里。
	inChunks([...new Set([...toRestore, ...addedToIndex])], 200, (chunk) => {
		runGit(
			["restore", "--source=HEAD", "--staged", "--worktree", "--", ...chunk],
			"Restore tracked theme default content",
		);
	});
	log(`Restored ${toRestore.length} tracked files to HEAD.`);
}

if (toDelete.length > 0) {
	const existingScope = scopeDirectories.filter((directory) =>
		existsSync(join(ROOT, directory)),
	);
	if (existingScope.length > 0) {
		// -x 是关键：eject 之后物化内容全部处于 .gitignore 之下，不带 -x 一个都删不掉。
		runGit(
			[
				"clean",
				"-ffdx",
				...CLEAN_EXCLUDES.flatMap((pattern) => ["-e", pattern]),
				"--",
				...existingScope,
			],
			"Delete materialized content files",
		);
	}
	// 兜底：挂载点之外的零散残留（例如被显式移出挂载目录的文件）逐个删。
	for (const path of toDelete) {
		const absolute = join(ROOT, path);
		if (!existsSync(absolute)) continue;
		try {
			rmSync(absolute, { force: true });
		} catch (error) {
			fail("Delete materialized file", error, `Path: ${path}`);
		}
	}
	log(`Deleted ${toDelete.length} materialized files.`);
}

// 配置生成物：user-config.ts 必须存在（各 config 都 import 它），因此写回空覆盖层而不是删除。
// 被跟踪时上一步的 restore 已经把它复位到 HEAD——那才是该仓库的基线，不该再用 EMPTY_MODULE 覆盖。
try {
	const generatedAbsolute = join(ROOT, GENERATED_CONFIG_FILE);
	const generatedTracked =
		runGit(
			["ls-files", "--error-unmatch", GENERATED_CONFIG_FILE],
			"Check config artifact tracking",
			{ allowFailure: true },
		) !== null;
	const current = existsSync(generatedAbsolute)
		? readFileSync(generatedAbsolute, "utf8")
		: null;
	const needsReset =
		!generatedTracked &&
		(current === null || current.split("\r\n").join("\n") !== EMPTY_MODULE);
	if (needsReset) {
		mkdirSync(dirname(generatedAbsolute), { recursive: true });
		writeFileSync(generatedAbsolute, EMPTY_MODULE, "utf8");
		log(`Reset ${GENERATED_CONFIG_FILE} to empty overlay.`);
	}
} catch (error) {
	fail("Reset user config overlay", error, `Target file: ${GENERATED_CONFIG_FILE}`);
}

// FooterConfig.html：被跟踪时 restore 已经处理；否则它是内容仓带来的自定义页脚，删掉才算纯净。
const footerAbsolute = join(ROOT, FOOTER_HTML_TARGET);
if (existsSync(footerAbsolute)) {
	const footerTracked =
		runGit(
			["ls-files", "--error-unmatch", FOOTER_HTML_TARGET],
			"Check footer tracking",
			{
				allowFailure: true,
			},
		) !== null;
	if (!footerTracked) {
		try {
			rmSync(footerAbsolute, { force: true });
			log(`Removed ${FOOTER_HTML_TARGET} provided by content repo.`);
		} catch (error) {
			fail("Remove custom footer", error, `Path: ${FOOTER_HTML_TARGET}`);
		}
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. 清除溯源文件、工作副本与构建缓存
// ─────────────────────────────────────────────────────────────────────────────

for (const target of existingCacheTargets) {
	try {
		rmSync(join(ROOT, target.path), { recursive: true, force: true });
	} catch (error) {
		fail(
			"Clear cache and lock files",
			error,
			`Path: ${target.path} (${target.label})`,
		);
	}
}
if (existingCacheTargets.length > 0) {
	log(`Cleared ${existingCacheTargets.length} cache and lock items.`);
}

if (workingCopyExists && !options.keepWorkingCopy) {
	try {
		rmSync(join(ROOT, WORKING_COPY_DIR), { recursive: true, force: true });
		log(`Removed content repo working copy ${WORKING_COPY_DIR}.`);
	} catch (error) {
		fail(
			"Remove content repo working copy",
			error,
			`Path: ${WORKING_COPY_DIR}. If locked by editor or terminal, please close and retry, or use --keep-working-copy to keep it.`,
		);
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. 重新生成派生产物（图标集合与说说缩略图）
// ─────────────────────────────────────────────────────────────────────────────

function regenerate(script, label) {
	try {
		execFileSync("node", [script], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
		return true;
	} catch (error) {
		const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim();
		warn(
			`Failed to regenerate ${label}, please run 'node ${script}' manually after cleaning. Reason: ${detail || error.message}`,
		);
		return false;
	}
}

// 图标集合与缩略图都是「内容的派生产物」：内容变了必须重算，
// 否则前台会出现图标空白或指向已删除图片的缩略图。
if (regenerate("scripts/icons/generate-local-icons.mjs", "Offline icon collections")) {
	// 图标集合是被跟踪的生成物，且生成器一律写 LF。在 core.autocrlf=true 的
	// Windows 检出上，内容完全一致的重写也会让 git status 显示 M。
	// 内容没变就还原成检出时的形态，保证「清理后 git status 干净」这条承诺成立。
	const iconFile = "src/generated/local-icon-collections.ts";
	const unchanged =
		runGit(["diff", "--quiet", "--", iconFile], "Compare icon collections artifact", {
			allowFailure: true,
		}) !== null;
	if (unchanged) {
		runGit(["restore", "--", iconFile], "Normalize icon collections line endings", {
			allowFailure: true,
		});
	}
}
regenerate("scripts/images/generate-moment-thumbnails.mjs", "Moments thumbnails");

// ─────────────────────────────────────────────────────────────────────────────
// 8. 收尾体检
// ─────────────────────────────────────────────────────────────────────────────

log(
	nothingToDo
		? "Nothing to clean. Code repository is already in clean theme state."
		: "Clean complete. Code repository has been restored to clean theme state.",
);

if (resolved.mode === "external") {
	const origin =
		resolved.source?.origin === "CONTENT_DIR" ||
		resolved.source?.origin === "CONTENT_REPO_URL"
			? `environment variable or root .env (${resolved.source.origin})`
			: MANIFEST_FILE;
	warn(
		`Content source is still active (source: ${origin}). Next 'pnpm dev' or 'pnpm build' will immediately re-materialize content. ` +
			"To stay in local mode permanently, remove this source or set SHIRONE_CONTENT_SYNC=0.",
	);
}

// eject 之后代码仓不再跟踪 demo 内容，清理只能清空这些目录，无法「还原」出内容。
if (ejectedScope.length > 0) {
	warn(
		`The following mount points are not tracked in the code repository (likely from content:eject): ${ejectedScope.join(", ")}. ` +
			"Clean can only empty these directories; theme demo content must be restored from upstream repository.",
	);
}

const leftovers = gitPaths(
	[
		"ls-files",
		"-z",
		"--others",
		"--ignored",
		"--exclude-standard",
		"--",
		...scopePathspecs,
	],
	"Check leftovers",
).filter((path) => !isProtected(path) && !scopeFiles.includes(path));
if (leftovers.length > 0) {
	warn(
		`There are still ${leftovers.length} ignored files left in mount points (possibly locked by other processes): ` +
			`${leftovers.slice(0, 5).join(", ")}${leftovers.length > 5 ? " etc." : ""}.`,
	);
}

if (backupDirectory) {
	const backupFiles = collectFiles(backupDirectory).length;
	log(
		`Snapshot backup retained at ${toPosix(relative(ROOT, backupDirectory))} (${backupFiles} files). You may delete it after confirming no rollback is needed.`,
	);
}
