/**
 * 内容分离状态诊断。
 *
 * 默认只检查本地配置、工作副本与物化结果，不发起网络请求。传入 --remote 时才会
 * 使用 git ls-remote 验证远端 ref。所有 Git 命令都禁用 optional locks，避免刷新 index。
 *
 * 用法：
 *   node scripts/content/status.mjs [--remote]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import {
	CONFIG_DIRECTORY,
	CONFIG_DOMAINS,
	FOOTER_HTML_SOURCE,
	GENERATED_CONFIG_FILE,
} from "./config-domains.mjs";
import {
	EMPTY_MODULE,
	generateModule,
	readConfigOverrides,
} from "./config-overlay.mjs";
import {
	canonicalGitUrl,
	DEFAULT_MOUNTS,
	LOCK_FILE,
	MANIFEST_FILE,
	matchesAny,
	PROTECTED_PATHS,
	redactUrl,
	resolveContentSource,
	toPosix,
	topSegment,
	WORKING_COPY_DIR,
} from "./resolve-source.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const options = {
	help: args.includes("--help") || args.includes("-h"),
	remote: args.includes("--remote"),
};
const unknownArgs = args.filter(
	(argument) => !["--help", "-h", "--remote"].includes(argument),
);

if (options.help) {
	console.log(
		[
			"Usage: node scripts/content/status.mjs [--remote]",
			"",
			"Detailed diagnosis of content source, Git, local working copy, mounted assets, config overlay, lock file, and materialization state.",
			"Fully offline and read-only by default; --remote additionally verifies remote ref via git ls-remote.",
			"Exits with code 1 when issues blocking build or requiring re-sync are found; exits with 0 on warnings only.",
		].join("\n"),
	);
	process.exit(0);
}

if (unknownArgs.length > 0) {
	console.error(
		`[content] status does not support argument(s): ${unknownArgs.join(", ")}`,
	);
	process.exit(1);
}

const findings = [];
const scanCache = new Map();

function addFinding(severity, message) {
	findings.push({ severity, message });
}

function addError(message) {
	addFinding("error", message);
}

function addWarning(message) {
	addFinding("warning", message);
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

function normalizeText(value) {
	return value
		.replace(/^\uFEFF/, "")
		.split("\r\n")
		.join("\n");
}

function normalizePathForCompare(value) {
	const normalized = toPosix(resolve(value)).replace(/\/$/, "");
	return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function safeErrorText(error) {
	const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim();
	return redactUrl(detail || error.message || String(error));
}

function runGit(gitArgs, cwd = ROOT, { timeout = 10_000 } = {}) {
	try {
		const output = execFileSync(
			"git",
			["--no-optional-locks", "-c", "core.quotepath=false", ...gitArgs],
			{
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
				timeout,
				env: {
					...process.env,
					GIT_OPTIONAL_LOCKS: "0",
					GIT_TERMINAL_PROMPT: "0",
				},
			},
		);
		return { ok: true, output: output.trim() };
	} catch (error) {
		return {
			ok: false,
			error: safeErrorText(error),
			notFound: error.code === "ENOENT",
			status: error.status,
		};
	}
}

function inspectDirectory(directory) {
	if (!existsSync(directory)) return { exists: false, isDirectory: false };
	try {
		return { exists: true, isDirectory: statSync(directory).isDirectory() };
	} catch (error) {
		return { exists: true, isDirectory: false, error: error.message };
	}
}

function scanDirectory(directory) {
	const cached = scanCache.get(directory);
	if (cached) return cached;

	const files = [];
	const errors = [];
	function walk(current, prefix = "") {
		let entries;
		try {
			entries = readdirSync(current, { withFileTypes: true });
		} catch (error) {
			errors.push(`${current}: ${error.message}`);
			return;
		}

		for (const entry of entries) {
			if (entry.name === ".git" || entry.name === "node_modules") continue;
			const absolute = join(current, entry.name);
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				walk(absolute, relativePath);
				continue;
			}
			if (!entry.isFile()) continue;
			try {
				const stat = statSync(absolute);
				files.push({
					absolute,
					relative: relativePath,
					size: stat.size,
					mtimeMs: stat.mtimeMs,
				});
			} catch (error) {
				errors.push(`${absolute}: ${error.message}`);
			}
		}
	}

	walk(directory);
	const result = {
		count: files.length,
		totalBytes: files.reduce((sum, file) => sum + file.size, 0),
		files,
		errors,
	};
	scanCache.set(directory, result);
	return result;
}

function inspectGitRepository(directory) {
	const markerExists = existsSync(join(directory, ".git"));
	const inside = runGit(["rev-parse", "--is-inside-work-tree"], directory);
	if (!inside.ok || inside.output !== "true") {
		return {
			isGit: false,
			invalidMarker: markerExists,
			unavailable: inside.notFound,
			error: inside.error,
		};
	}

	const branch = runGit(["branch", "--show-current"], directory);
	const log = runGit(
		["log", "-1", "--format=%H%x00%h%x00%an%x00%aI%x00%s"],
		directory,
	);
	const status = runGit(["status", "--porcelain=v1", "-uall"], directory);
	const commandErrors = [branch, log, status]
		.filter((result) => !result.ok)
		.map((result) => result.error);
	let commit = null;
	let shortCommit = null;
	let author = null;
	let date = null;
	let subject = null;
	if (log.ok && log.output) {
		[commit, shortCommit, author, date, subject] = log.output.split("\0");
	}

	return {
		isGit: true,
		branch: branch.ok ? branch.output || "(detached HEAD)" : "unknown",
		commit,
		shortCommit,
		author,
		date,
		subject,
		dirty: status.ok ? status.output !== "" : null,
		changes: status.ok
			? status.output.split("\n").filter(Boolean).length
			: null,
		commandErrors,
	};
}

function printGitRepository(repository, label = "Git repository") {
	if (!repository.isGit) return;
	console.log(`  ${label}: Valid worktree`);
	console.log(`  Branch name: ${repository.branch}`);
	if (repository.commit) {
		console.log(
			`  Latest commit: ${repository.shortCommit} - ${repository.subject || "(no subject)"}`,
		);
		console.log(
			`  Author & date: ${repository.author || "unknown"}, ${repository.date || "unknown"}`,
		);
	} else {
		console.log("  Latest commit: No commit history");
	}
	if (repository.dirty === null) {
		console.log("  Worktree status: Unreadable");
	} else if (repository.dirty) {
		console.log(
			`  Worktree status: ${repository.changes} uncommitted change(s)`,
		);
	} else {
		console.log("  Worktree status: Clean");
	}
}

function compareMount(
	sourceSnapshot,
	targetDirectory,
	resolvedSource,
	shouldPrune,
) {
	const differences = [];
	const target = inspectDirectory(targetDirectory);
	if (!target.exists || !target.isDirectory) {
		return [
			`Target directory does not exist or is not a directory: ${targetDirectory}`,
		];
	}

	const sourceFiles = new Set(
		sourceSnapshot.files.map((file) => file.relative),
	);
	const ownedSegments = new Set(
		sourceSnapshot.files.map((file) => topSegment(file.relative)),
	);
	for (const sourceFile of sourceSnapshot.files) {
		const targetFile = join(targetDirectory, sourceFile.relative);
		try {
			const targetStat = statSync(targetFile);
			if (
				!targetStat.isFile() ||
				targetStat.size !== sourceFile.size ||
				Math.abs(targetStat.mtimeMs - sourceFile.mtimeMs) > 1
			) {
				differences.push(sourceFile.relative);
			}
		} catch {
			differences.push(sourceFile.relative);
		}
	}

	const targetSnapshot = scanDirectory(targetDirectory);
	for (const error of targetSnapshot.errors)
		differences.push(`扫描失败 ${error}`);
	if (!shouldPrune) return differences;
	for (const targetFile of targetSnapshot.files) {
		if (sourceFiles.has(targetFile.relative)) continue;
		if (!ownedSegments.has(topSegment(targetFile.relative))) continue;
		const repositoryRelative = toPosix(relative(ROOT, targetFile.absolute));
		if (matchesAny(repositoryRelative, PROTECTED_PATHS)) continue;
		if (matchesAny(repositoryRelative, resolvedSource.keep || [])) continue;
		differences.push(`多余文件 ${targetFile.relative}`);
	}
	return differences;
}

function arraysEqual(left, right) {
	const sortedLeft = [...left].sort();
	const sortedRight = [...right].sort();
	return (
		sortedLeft.length === sortedRight.length &&
		sortedLeft.every((value, index) => value === sortedRight[index])
	);
}

function isSemanticallyEmptyConfig(source) {
	const sourceFile = ts.createSourceFile(
		GENERATED_CONFIG_FILE,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	let emptyOverrides = false;
	let emptySources = false;
	for (const statement of sourceFile.statements) {
		if (!ts.isVariableStatement(statement)) continue;
		for (const declaration of statement.declarationList.declarations) {
			if (!ts.isIdentifier(declaration.name) || !declaration.initializer)
				continue;
			if (
				declaration.name.text === "userConfigOverrides" &&
				ts.isObjectLiteralExpression(declaration.initializer) &&
				declaration.initializer.properties.length === 0
			) {
				emptyOverrides = true;
			}
			if (
				declaration.name.text === "userConfigSources" &&
				ts.isArrayLiteralExpression(declaration.initializer) &&
				declaration.initializer.elements.length === 0
			) {
				emptySources = true;
			}
		}
	}
	return emptyOverrides && emptySources;
}

function inspectGeneratedConfig(path) {
	if (!existsSync(path)) return { state: "missing", source: null };
	try {
		const source = readFileSync(path, "utf8");
		if (isSemanticallyEmptyConfig(source)) return { state: "empty", source };
		if (
			source.includes("userConfigOverrides") &&
			source.includes("userConfigSources") &&
			source.includes("pnpm content:sync")
		) {
			return { state: "materialized", source };
		}
		return { state: "modified", source };
	} catch (error) {
		return { state: "unreadable", source: null, error: error.message };
	}
}

function readLock(path) {
	if (!existsSync(path)) return { state: "missing", lock: null };
	try {
		const lock = JSON.parse(readFileSync(path, "utf8"));
		if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
			throw new Error("顶层必须是对象");
		}
		if (!lock.source || typeof lock.source !== "object") {
			throw new Error("source 必须是对象");
		}
		if (!Number.isInteger(lock.schemaVersion) || lock.schemaVersion !== 1) {
			throw new Error(
				`不支持 schemaVersion ${JSON.stringify(lock.schemaVersion)}`,
			);
		}
		if (lock.source.type === "path") {
			if (typeof lock.source.path !== "string" || lock.source.path === "") {
				throw new Error("path 来源缺少 source.path");
			}
		} else if (lock.source.type === "git") {
			if (
				typeof lock.source.url !== "string" ||
				lock.source.url === "" ||
				typeof lock.source.ref !== "string" ||
				lock.source.ref === ""
			) {
				throw new Error("git 来源缺少 source.url 或 source.ref");
			}
		} else {
			throw new Error(`source.type 无效：${JSON.stringify(lock.source.type)}`);
		}
		if (
			lock.source.commit !== null &&
			lock.source.commit !== undefined &&
			typeof lock.source.commit !== "string"
		) {
			throw new Error("source.commit 必须是字符串或 null");
		}
		if (
			!lock.mounts ||
			typeof lock.mounts !== "object" ||
			Array.isArray(lock.mounts)
		) {
			throw new Error("mounts 必须是对象");
		}
		if (!Array.isArray(lock.config)) {
			throw new Error("config 必须是数组");
		}
		if (lock.config.some((file) => typeof file !== "string")) {
			throw new Error("config 只能包含字符串路径");
		}
		if (
			typeof lock.syncedAt !== "string" ||
			Number.isNaN(Date.parse(lock.syncedAt))
		) {
			throw new Error("syncedAt 不是有效时间");
		}
		if (lock.prune !== undefined && typeof lock.prune !== "boolean") {
			throw new Error("prune 必须是布尔值");
		}
		return { state: "valid", lock };
	} catch (error) {
		return { state: "invalid", lock: null, error: error.message };
	}
}

function typeCheckConfigSource(source, lineOwners) {
	const tsconfigPath = join(ROOT, "tsconfig.json");
	const readResult = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	if (readResult.error) {
		return [
			`无法读取 tsconfig.json：${ts.flattenDiagnosticMessageText(readResult.error.messageText, "\n")}`,
		];
	}

	const parsed = ts.parseJsonConfigFileContent(
		readResult.config,
		ts.sys,
		ROOT,
		{ noEmit: true, declaration: false, plugins: [] },
		tsconfigPath,
	);
	if (parsed.errors.length > 0) {
		return parsed.errors.map((diagnostic) =>
			ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
		);
	}

	const virtualPath = join(ROOT, GENERATED_CONFIG_FILE);
	const canonicalVirtual = normalizePathForCompare(virtualPath);
	const host = ts.createCompilerHost(parsed.options, true);
	const originalFileExists = host.fileExists.bind(host);
	const originalReadFile = host.readFile.bind(host);
	const originalGetSourceFile = host.getSourceFile.bind(host);
	host.fileExists = (fileName) =>
		normalizePathForCompare(fileName) === canonicalVirtual ||
		originalFileExists(fileName);
	host.readFile = (fileName) =>
		normalizePathForCompare(fileName) === canonicalVirtual
			? source
			: originalReadFile(fileName);
	host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
		if (normalizePathForCompare(fileName) === canonicalVirtual) {
			return ts.createSourceFile(
				fileName,
				source,
				languageVersion,
				true,
				ts.ScriptKind.TS,
			);
		}
		return originalGetSourceFile(
			fileName,
			languageVersion,
			onError,
			shouldCreate,
		);
	};

	const program = ts.createProgram([virtualPath], parsed.options, host);
	return ts
		.getPreEmitDiagnostics(program)
		.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error)
		.map((diagnostic) => {
			const message = ts.flattenDiagnosticMessageText(
				diagnostic.messageText,
				"\n",
			);
			if (
				diagnostic.file &&
				diagnostic.start !== undefined &&
				normalizePathForCompare(diagnostic.file.fileName) === canonicalVirtual
			) {
				const { line } = diagnostic.file.getLineAndCharacterOfPosition(
					diagnostic.start,
				);
				const owner = lineOwners[line];
				if (owner) {
					return `${owner.file}'s ${owner.path || "top level"}: ${message}`;
				}
			}
			const file = diagnostic.file
				? toPosix(relative(ROOT, diagnostic.file.fileName))
				: "TypeScript";
			return `${file}: ${message}`;
		});
}

function describeOrigin(source) {
	if ([".env", ".env.local"].includes(source.originLocation)) {
		return `${source.origin} in root ${source.originLocation}`;
	}
	if (source.originLocation === "environment") {
		return `Process environment variable ${source.origin}`;
	}
	return source.origin;
}

function describeRefOrigin(source) {
	if ([".env", ".env.local"].includes(source.refOrigin)) {
		return `Root ${source.refOrigin}`;
	}
	if (source.refOrigin === "environment") return "Process environment variable";
	if (source.refOrigin === "manifest") return MANIFEST_FILE;
	return "Default main";
}

console.log(
	"================================================================================",
);
console.log(
	"             Shirone Content Separation Status & Connectivity Report",
);
console.log(
	"================================================================================\n",
);

console.log("[1. Runtime Mode & Decision Provenance]");
const envFile = join(ROOT, ".env");
const envLocalFile = join(ROOT, ".env.local");
const manifestFile = join(ROOT, MANIFEST_FILE);
let resolved;
try {
	resolved = resolveContentSource(ROOT);
} catch (error) {
	resolved = { mode: "error", error: error.message };
	addError(`Content source config cannot be parsed: ${error.message}`);
}

if (resolved.mode === "error") {
	console.log("  Current mode: Configuration Error (ERROR)");
	console.log(`  Reason: ${resolved.error}`);
} else if (resolved.mode === "local") {
	console.log("  Current mode: local (using code repository default content)");
	console.log(`  Basis: ${resolved.reason}`);
	if (resolved.reasonLocation) {
		console.log(
			`  Disabled source: ${[".env", ".env.local"].includes(resolved.reasonLocation) ? `Root ${resolved.reasonLocation}` : "Process environment variable"}`,
		);
	}
} else {
	console.log(
		"  Current mode: external (external content source configured, connectivity in next section)",
	);
	console.log(`  Source determination: ${describeOrigin(resolved.source)}`);
}
console.log("  Configuration files check:");
console.log(
	`    - Root .env: ${existsSync(envFile) ? "Present" : "Not created"}`,
);
console.log(
	`    - Root .env.local: ${existsSync(envLocalFile) ? "Present" : "Not created"}`,
);
console.log(
	`    - Manifest file ${MANIFEST_FILE}: ${existsSync(manifestFile) ? "Present" : "Not created"}`,
);
console.log("");

console.log("[2. Content Source Connectivity & Git Status]");
let sourceRoot = null;
let sourceGit = null;
let currentCommit = null;

if (resolved.mode === "local") {
	console.log("  Content source: External content source not enabled");
} else if (resolved.mode === "error") {
	console.log(
		"  Content source: Configuration error, cannot continue connectivity diagnosis",
	);
} else if (resolved.source.type === "path") {
	const sourceAbsolute = resolve(ROOT, resolved.source.path);
	const directory = inspectDirectory(sourceAbsolute);
	console.log('  Access type: Local directory mount (type: "path")');
	console.log(`  Configured path: ${resolved.source.path}`);
	console.log(`  Absolute path: ${sourceAbsolute}`);
	if (!directory.exists) {
		console.log("  Directory status: Failed (directory does not exist)");
		addError(`Content directory does not exist: ${sourceAbsolute}`);
	} else if (!directory.isDirectory) {
		console.log(
			"  Directory status: Failed (path is not a directory or unreadable)",
		);
		addError(`Content path is not a readable directory: ${sourceAbsolute}`);
	} else {
		console.log("  Directory status: OK");
		sourceRoot = sourceAbsolute;
		sourceGit = inspectGitRepository(sourceAbsolute);
		if (sourceGit.isGit) {
			printGitRepository(sourceGit);
			currentCommit = sourceGit.commit;
			if (sourceGit.dirty) {
				addWarning(
					"Local content repository has uncommitted changes, locked commit cannot fully represent current content",
				);
			}
			for (const error of sourceGit.commandErrors) {
				addWarning(`Failed to read partial Git status: ${error}`);
			}
		} else if (sourceGit.unavailable) {
			console.log("  Git repository: Cannot detect (git not found on system)");
			addWarning(
				"Git not found on system, skipped local content repo version diagnosis",
			);
		} else if (sourceGit.invalidMarker) {
			console.log(`  Git repository: Invalid (${sourceGit.error})`);
			addError(
				`Content directory contains .git but is not a valid Git worktree: ${sourceGit.error}`,
			);
		} else {
			console.log("  Git repository: No (supported regular local directory)");
		}
	}
} else {
	const workingCopy = join(ROOT, WORKING_COPY_DIR);
	const directory = inspectDirectory(workingCopy);
	console.log(
		'  Access type: Remote Git repository working copy (type: "git")',
	);
	console.log(`  Repository URL: ${redactUrl(resolved.source.url)}`);
	console.log(`  Target Ref: ${resolved.source.ref}`);
	console.log(`  Ref source: ${describeRefOrigin(resolved.source)}`);
	console.log(`  Local working copy: ${toPosix(relative(ROOT, workingCopy))}`);
	if (!directory.exists || !directory.isDirectory) {
		console.log("  Working copy status: Not initialized or invalid path");
		addError(
			`Remote content working copy ${WORKING_COPY_DIR}/ is not initialized, please run content sync first`,
		);
	} else {
		sourceGit = inspectGitRepository(workingCopy);
		if (sourceGit.unavailable) {
			console.log(
				"  Working copy status: Cannot detect (git not found on system)",
			);
			addError(
				"Git not found on system, cannot verify remote content working copy",
			);
		} else if (!sourceGit.isGit) {
			console.log(
				`  Working copy status: Invalid Git worktree (${sourceGit.error})`,
			);
			addError(`${WORKING_COPY_DIR}/ is not a valid Git worktree`);
		} else {
			sourceRoot = workingCopy;
			currentCommit = sourceGit.commit;
			printGitRepository(sourceGit, "Working copy");
			if (sourceGit.dirty) {
				addWarning(
					"Remote working copy has uncommitted changes, next sync will clean them up",
				);
			}

			const origin = runGit(["remote", "get-url", "origin"], workingCopy);
			if (!origin.ok) {
				console.log(`  origin: Failed to read (${origin.error})`);
				addError("Remote working copy lacks readable origin");
				sourceRoot = null;
			} else {
				console.log(`  origin: ${redactUrl(origin.output)}`);
				if (
					canonicalGitUrl(origin.output) !==
					canonicalGitUrl(resolved.source.url)
				) {
					addError(
						"Remote working copy origin differs from configured repository URL",
					);
					sourceRoot = null;
				}
			}

			const fetchHead = runGit(
				["rev-parse", "--verify", "FETCH_HEAD"],
				workingCopy,
			);
			if (!fetchHead.ok) {
				console.log(
					"  FETCH_HEAD: Does not exist, cannot confirm whether working copy was fetched by content sync",
				);
				addWarning(
					"Remote working copy lacks FETCH_HEAD, cannot confirm target ref offline",
				);
			} else if (currentCommit !== fetchHead.output) {
				console.log(
					`  FETCH_HEAD: ${fetchHead.output.slice(0, 8)} (differs from HEAD)`,
				);
				addError("Remote working copy HEAD differs from latest FETCH_HEAD");
			} else {
				console.log(
					`  FETCH_HEAD: ${fetchHead.output.slice(0, 8)} (matches HEAD)`,
				);
			}
		}
	}

	if (options.remote) {
		console.log("  Remote live probe: running git ls-remote");
		const remote = runGit(
			["ls-remote", "--exit-code", resolved.source.url, resolved.source.ref],
			ROOT,
			{ timeout: 15_000 },
		);
		if (!remote.ok || !remote.output) {
			console.log(
				`  Remote live probe: Failed (${remote.error || "Target ref does not exist"})`,
			);
			addError(
				`Remote repository or target ref inaccessible: ${remote.error || resolved.source.ref}`,
			);
		} else {
			const remoteCommit = remote.output.split(/\s/)[0];
			console.log(`  Remote live probe: OK (${remoteCommit.slice(0, 8)})`);
			if (currentCommit && currentCommit !== remoteCommit) {
				addError(
					"Local working copy is behind current remote target ref, please run content sync again",
				);
			}
		}
	} else {
		console.log(
			"  Remote live probe: Not executed (pass --remote when needed)",
		);
	}
}
console.log("");

console.log("[3. Content Repository Assets & Mount Points Probe]");
const mountSnapshots = new Map();
if (!sourceRoot) {
	console.log(
		"  Content repository unavailable, skipping mount point asset probe.\n",
	);
} else {
	const mounts = resolved.mounts || DEFAULT_MOUNTS;
	console.log("  Mount directory mapping & asset probe:");
	for (const [sourceDir, targetDir] of Object.entries(mounts)) {
		const absoluteSource = join(sourceRoot, sourceDir);
		const sourceDirectory = inspectDirectory(absoluteSource);
		if (!sourceDirectory.exists) {
			console.log(
				`    - ${sourceDir}/ -> ${targetDir}/: Not provided, code repository target directory will remain unchanged`,
			);
			continue;
		}
		if (!sourceDirectory.isDirectory) {
			console.log(
				`    - ${sourceDir}/ -> ${targetDir}/: Failed (source mount point is not a directory)`,
			);
			addError(`Content source mount point ${sourceDir} is not a directory`);
			continue;
		}

		const snapshot = scanDirectory(absoluteSource);
		mountSnapshots.set(sourceDir, snapshot);
		for (const error of snapshot.errors)
			addError(`Cannot fully scan mount point: ${error}`);
		let detail = "";
		if (sourceDir === "content") {
			const markdown = snapshot.files.filter((file) =>
				/\.(?:md|mdx)$/i.test(file.relative),
			);
			const posts = markdown.filter((file) =>
				file.relative.startsWith("posts/"),
			);
			const moments = markdown.filter((file) =>
				file.relative.startsWith("moments/"),
			);
			detail = ` [Markdown posts: ${posts.length}, moments: ${moments.length}]`;
		} else if (sourceDir === "data") {
			const dataFiles = snapshot.files
				.filter(
					(file) =>
						!file.relative.includes("/") &&
						/\.(?:ts|json)$/i.test(file.relative),
				)
				.map((file) => file.relative)
				.sort();
			detail = ` [Contains: ${dataFiles.join(", ") || "none"}]`;
		}
		console.log(
			`    - ${sourceDir}/ -> ${targetDir}/: ${snapshot.count} files (${formatBytes(snapshot.totalBytes)})${detail}`,
		);
	}
	console.log("");
}

console.log("[4. Config Overlay Probe (config/*.yaml)]");
const configState = {
	valid: true,
	entries: [],
	files: [],
	expectedSource: EMPTY_MODULE,
	lineOwners: [],
	footerPath: null,
};
if (!sourceRoot) {
	console.log(
		"  Content repository unavailable, skipping config overlay probe.\n",
	);
} else {
	const configDirectory = join(sourceRoot, CONFIG_DIRECTORY);
	const directory = inspectDirectory(configDirectory);
	if (!directory.exists) {
		console.log(
			"  config/ directory: Not provided, all domains using theme default config",
		);
	} else if (!directory.isDirectory) {
		console.log("  config/ directory: Failed (path is not a directory)");
		configState.valid = false;
		addError("Content source config path is not a directory");
	} else {
		let rawFiles = [];
		try {
			rawFiles = readdirSync(configDirectory, { withFileTypes: true })
				.filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
				.map((entry) => entry.name)
				.sort();
			configState.entries = readConfigOverrides(configDirectory);
			configState.files = configState.entries.map((entry) => entry.file);
			const generated = generateModule(configState.entries);
			configState.expectedSource = generated.source;
			configState.lineOwners = generated.lineOwners;
		} catch (error) {
			configState.valid = false;
			console.log(`  YAML structure check: Failed (${error.message})`);
			addError(`Config overlay cannot be parsed: ${error.message}`);
		}

		const effectiveByDomain = new Map(
			configState.entries.map((entry) => [entry.domain.key, entry]),
		);
		console.log(`  Found YAML files: ${rawFiles.length}`);
		if (configState.valid) {
			for (const domain of CONFIG_DOMAINS) {
				const matching = rawFiles.filter(
					(file) =>
						file === `${domain.file}.yaml` || file === `${domain.file}.yml`,
				);
				const effective = effectiveByDomain.get(domain.key);
				if (effective) {
					const path = join(sourceRoot, effective.file);
					console.log(
						`    - ${effective.file} -> ${domain.type}: Structure check passed (${formatBytes(statSync(path).size)})`,
					);
				} else if (matching.length > 0) {
					console.log(
						`    - config/${matching[0]} -> ${domain.type}: Empty file or empty mapping, no overlay produced`,
					);
				}
			}
			const missing = CONFIG_DOMAINS.filter(
				(domain) =>
					!rawFiles.includes(`${domain.file}.yaml`) &&
					!rawFiles.includes(`${domain.file}.yml`),
			).map((domain) => `${domain.file}.yaml (${domain.key})`);
			console.log(
				`  Unprovided domains (${missing.length}, using theme defaults):`,
			);
			console.log(`    ${missing.join(", ") || "None"}`);
			if (configState.entries.length > 0) {
				const typeErrors = typeCheckConfigSource(
					configState.expectedSource,
					configState.lineOwners,
				);
				if (typeErrors.length === 0) {
					console.log(
						"  TypeScript type check: Passed (in-memory check, zero temp files)",
					);
				} else {
					console.log(
						`  TypeScript type check: Failed (${typeErrors.length} item(s))`,
					);
					for (const error of typeErrors) console.log(`    - ${error}`);
					addError(
						`Config overlay failed TypeScript type checking: ${typeErrors[0]}`,
					);
				}
			} else {
				console.log("  TypeScript type check: No valid overlays, skipped");
			}
		}

		const footer = join(configDirectory, FOOTER_HTML_SOURCE);
		if (existsSync(footer)) {
			if (statSync(footer).isFile()) {
				configState.footerPath = footer;
				configState.files.push(`${CONFIG_DIRECTORY}/${FOOTER_HTML_SOURCE}`);
				console.log(
					`  Custom footer: ${CONFIG_DIRECTORY}/${FOOTER_HTML_SOURCE} (${formatBytes(statSync(footer).size)})`,
				);
			} else {
				addError(`${CONFIG_DIRECTORY}/${FOOTER_HTML_SOURCE} is not a file`);
			}
		}
	}
	console.log("");
}

console.log("[5. Code Repository Materialized State, Lock File & Freshness]");
const lockPath = join(ROOT, LOCK_FILE);
const userConfigPath = join(ROOT, GENERATED_CONFIG_FILE);
const lockState = readLock(lockPath);
const generatedConfig = inspectGeneratedConfig(userConfigPath);

if (lockState.state === "missing") {
	console.log(`  Content provenance lock (${LOCK_FILE}): Does not exist`);
} else if (lockState.state === "invalid") {
	console.log(
		`  Content provenance lock (${LOCK_FILE}): Invalid (${lockState.error})`,
	);
	addError(
		`${LOCK_FILE} cannot be used as trusted provenance: ${lockState.error}`,
	);
} else {
	const lock = lockState.lock;
	console.log(`  Content provenance lock (${LOCK_FILE}): Valid`);
	console.log(`    - Last synced: ${lock.syncedAt}`);
	if (lock.source.type === "git") {
		console.log(
			`    - Locked source: git ${redactUrl(lock.source.url || "unknown")} @ ${lock.source.ref || "unknown"}`,
		);
	} else if (lock.source.type === "path") {
		console.log(`    - Locked source: path ${lock.source.path || "unknown"}`);
	}
	console.log(
		`    - Locked Commit: ${lock.source.commit || "Not recorded (legacy lock or non-Git directory)"}`,
	);
	console.log(`    - Locked config: ${lock.config.length} files`);
}

console.log(`  Config artifact (${GENERATED_CONFIG_FILE}):`);
if (generatedConfig.state === "missing") {
	console.log("    Missing (project config modules will fail to import)");
	addError(`${GENERATED_CONFIG_FILE} is missing`);
} else if (generatedConfig.state === "unreadable") {
	console.log(`    Unreadable (${generatedConfig.error})`);
	addError(`${GENERATED_CONFIG_FILE} is unreadable`);
} else if (generatedConfig.state === "empty") {
	console.log(
		"    Empty overlay (semantic check passed, unaffected by comments or line endings)",
	);
} else if (generatedConfig.state === "materialized") {
	console.log("    External config overlay generated");
} else {
	console.log("    Manually modified or unrecognized format");
	addWarning(`${GENERATED_CONFIG_FILE} is not a recognized artifact`);
}

if (resolved.mode === "external") {
	if (lockState.state === "missing") {
		addError(
			"external mode has no content lock, current code repo cannot prove materialization, please run content sync",
		);
	}
	if (configState.valid && generatedConfig.source !== null) {
		const expectedEmpty = isSemanticallyEmptyConfig(configState.expectedSource);
		const configMatches = expectedEmpty
			? isSemanticallyEmptyConfig(generatedConfig.source)
			: normalizeText(generatedConfig.source) ===
				normalizeText(configState.expectedSource);
		if (!configMatches) {
			addError(
				"Config artifact does not match current content repo YAML, please re-run content sync",
			);
		} else {
			console.log("  Config consistency: Matches current content repo YAML");
		}
	}

	if (lockState.state === "valid") {
		const lock = lockState.lock;
		if (lock.source.type !== resolved.source.type) {
			addError(
				"Lock file source type does not match current content source config",
			);
		} else if (resolved.source.type === "path") {
			if (
				!lock.source.path ||
				normalizePathForCompare(lock.source.path) !==
					normalizePathForCompare(sourceRoot || resolved.source.path)
			) {
				addError(
					"path content source in lock file does not match current config",
				);
			}
		} else {
			if (
				canonicalGitUrl(lock.source.url || "") !==
				canonicalGitUrl(resolved.source.url)
			) {
				addError("Git URL in lock file does not match current config");
			}
			if (lock.source.ref !== resolved.source.ref) {
				addError("Git ref in lock file does not match current config");
			}
		}

		if (currentCommit && lock.source.commit) {
			if (currentCommit !== lock.source.commit) {
				addError(
					"Current content repo commit differs from lock file, materialized result is stale",
				);
			} else {
				console.log(
					`  Commit consistency: Matches (${currentCommit.slice(0, 8)})`,
				);
			}
		} else if (currentCommit && !lock.source.commit) {
			addWarning(
				"Lock file did not record commit, cannot prove materialization freshness by commit; re-sync to upgrade lock file",
			);
		}

		if (configState.valid && !arraysEqual(lock.config, configState.files)) {
			addError("Config files in lock file differ from current content repo");
		}

		if (sourceRoot) {
			for (const [sourceDir, targetDir] of Object.entries(resolved.mounts)) {
				const snapshot = mountSnapshots.get(sourceDir);
				if (!snapshot) continue;
				const lockedStats = lock.mounts[targetDir];
				if (!lockedStats || lockedStats.files !== snapshot.count) {
					addError(
						`Current file count in ${sourceDir}/ differs from lock file`,
					);
				}
				const differences = compareMount(
					snapshot,
					join(ROOT, targetDir),
					resolved,
					lock.prune ?? resolved.prune,
				);
				if (differences.length > 0) {
					addError(
						`${sourceDir}/ and ${targetDir}/ have ${differences.length} files unmaterialized or modified ` +
							`(${differences.slice(0, 3).join(", ")}${differences.length > 3 ? " etc." : ""})`,
					);
				}
			}
		}

		if (configState.footerPath) {
			const footerTarget = join(ROOT, "src/config/FooterConfig.html");
			if (
				!existsSync(footerTarget) ||
				!readFileSync(configState.footerPath).equals(readFileSync(footerTarget))
			) {
				addError(
					"Custom footer.html differs from code repo materialized result",
				);
			}
		}
	}
} else if (resolved.mode === "local") {
	if (lockState.state !== "missing") {
		addError(
			"Content lock still remains in local mode, code repo is not in clean theme state; please run content clean --yes",
		);
	}
	if (generatedConfig.state !== "empty") {
		addError("Config artifact in local mode is not an empty overlay");
	}
}

console.log("");
console.log("[Diagnostic Conclusions]");
const errors = findings.filter((finding) => finding.severity === "error");
const warnings = findings.filter((finding) => finding.severity === "warning");
if (errors.length === 0 && warnings.length === 0) {
	console.log("  Healthy: No errors or warnings found");
} else {
	console.log(
		`  ${errors.length > 0 ? "Abnormal" : "Usable with warnings"}: ${errors.length} error(s), ${warnings.length} warning(s)`,
	);
	for (const finding of findings) {
		console.log(
			`    - [${finding.severity === "error" ? "ERROR" : "WARN"}] ${finding.message}`,
		);
	}
}

console.log("\nCommon commands:");
console.log("  - Refresh materialization: pnpm content sync");
console.log("  - Full config type validation: pnpm content validate");
console.log("  - With remote live probe: pnpm content status --remote");
console.log("  - Restore clean theme state: pnpm content clean --yes");
console.log(
	"================================================================================",
);

if (errors.length > 0) process.exitCode = 1;
