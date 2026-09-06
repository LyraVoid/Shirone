#!/usr/bin/env node
/**
 * Shirone CLI.
 *
 *   npx shirones init            scaffold config, content and static assets
 *   npx shirones init --update   restore missing files on an existing project
 *   npx shirones init --force    replace template files after backing them up
 *   npx shirones info            detailed status and drift report
 *
 * The command is intentionally dependency-free so it can run via `npx` in a
 * bare project before anything else is installed.
 */

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const PACKAGE_ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TEMPLATE_DIR = join(PACKAGE_ROOT, "template");
const CWD = process.cwd();

/** Directory holding user content. Fixed by convention, matches the package name. */
const CONTENT_ROOT = "shirones";

const colours = {
	reset: "\u001b[0m",
	bold: "\u001b[1m",
	dim: "\u001b[2m",
	green: "\u001b[32m",
	yellow: "\u001b[33m",
	red: "\u001b[31m",
	cyan: "\u001b[36m",
};

const log = {
	step: (msg) => console.log(`${colours.cyan}›${colours.reset} ${msg}`),
	ok: (msg) => console.log(`${colours.green}✓${colours.reset} ${msg}`),
	skip: (msg) => console.log(`${colours.dim}·${colours.reset} ${colours.dim}${msg}${colours.reset}`),
	warn: (msg) => console.log(`${colours.yellow}!${colours.reset} ${msg}`),
	err: (msg) => console.error(`${colours.red}✗${colours.reset} ${msg}`),
};

async function readPackageName() {
	try {
		const raw = await readFile(join(PACKAGE_ROOT, "package.json"), "utf8");
		return JSON.parse(raw).name ?? "shirones";
	} catch {
		return "shirones";
	}
}

async function readPackageVersion() {
	try {
		const raw = await readFile(join(PACKAGE_ROOT, "package.json"), "utf8");
		return JSON.parse(raw).version ?? null;
	} catch {
		return null;
	}
}

async function readPackageManager() {
	try {
		const raw = await readFile(join(PACKAGE_ROOT, "package.json"), "utf8");
		return JSON.parse(raw).packageManager ?? null;
	} catch {
		return null;
	}
}

/** Print the package contract before every CLI command. */
async function printCliNotice() {
	const pmPin = (await readPackageManager()) ?? "pnpm";
	console.log(`
${colours.bold}Shirone${colours.reset} · package manager
${colours.dim}  shirones uses ${pmPin} — the version shipped with this release.
  \`init\` sets up pnpm projects only; if npm or yarn is your jam, please migrate manually. Your lockfile, your adventure.
  If you like the project, give https://github.com/yCENzh/shirones a star. It helps keep the maintainer's terminal pleasantly quiet.${colours.reset}
`);
}

async function copyEntry(from, to, { force, quiet = false }) {
	if (!existsSync(from)) return { copied: false, reason: "missing" };
	if (existsSync(to) && !force) {
		if (!quiet) log.skip(`${relative(CWD, to) || "."} already exists (use --force to overwrite)`);
		return { copied: false, reason: "exists" };
	}
	let saved;
	if (existsSync(to) && force) {
		saved = await backup(relative(CWD, to));
	}
	await mkdir(dirname(to), { recursive: true });
	await cp(from, to, { recursive: true, force: true });
	if (!quiet) {
		const label = relative(CWD, to) || ".";
		log.ok(saved ? `${label} replaced (--force), kept a copy at ${saved}` : label);
	}
	return { copied: true, saved };
}

/**
 * Copy a directory into the project without clobbering what is already there.
 *
 * `copyEntry` is all-or-nothing, which is right for `shirones/` but wrong for
 * `public/`: `pnpm create astro` always leaves a `public/favicon.svg` behind, so
 * a directory-level "already exists" check silently dropped every one of the
 * theme's static assets — favicons, banners, album demos — and the first hint
 * was a deployed site missing images.
 *
 * Existing files are kept unless --force. Forced replacements are moved to
 * `.shirones-backup/` first, so even an explicit refresh never destroys the
 * previous copy.
 */
async function mergeDirectory(from, to, { force }) {
	if (!existsSync(from)) return { added: 0, kept: 0 };

	let added = 0;
	let kept = 0;

	async function walk(source, target) {
		await mkdir(target, { recursive: true });
		for (const entry of await readdir(source, { withFileTypes: true })) {
			const nextSource = join(source, entry.name);
			const nextTarget = join(target, entry.name);
			if (entry.isDirectory()) {
				await walk(nextSource, nextTarget);
				continue;
			}
			let saved;
			if (existsSync(nextTarget) && !force) {
				kept += 1;
				continue;
			}
			if (existsSync(nextTarget) && force) {
				saved = await backup(relative(CWD, nextTarget));
			}
			await cp(nextSource, nextTarget, { force: true });
			added += 1;
		}
	}

	await walk(from, to);

	const label = relative(CWD, to) || ".";
	if (added === 0 && kept > 0) {
		log.skip(`${label} already populated (${kept} files kept)`);
	} else {
		log.ok(`${label} (${added} files${kept ? `, ${kept} kept` : ""})`);
	}
	return { added, kept };
}

async function countFiles(dir) {
	if (!existsSync(dir)) return 0;
	let total = 0;
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		total += entry.isDirectory() ? await countFiles(join(dir, entry.name)) : 1;
	}
	return total;
}

/**
 * The user's project must depend on `astro` and on the theme's peer
 * dependencies directly. Some tooling resolves from the project root rather
 * than from the importing file, and pnpm's strict layout hides the theme's own
 * dependencies there: `@astrojs/svelte` registers `svelte/*` subpaths in
 * `optimizeDeps.include`, and astro-icon loads `@iconify-json/*` sets through
 * `require.resolve` in Node. Installing them at the root is the only thing that
 * satisfies both, so `init` writes them all into package.json and installs.
 */

/** Dependencies whose install scripts must be allowed to run. */
const BUILT_DEPENDENCIES = ["esbuild", "sharp"];

/**
 * Build-script approval.
 *
 * pnpm refuses to silently skip a dependency's install script, and `sharp`
 * (Astro's image optimisation) needs its. The setting moved between majors —
 * `allowBuilds` in pnpm 11, `onlyBuiltDependencies` in pnpm 10 — so both are
 * written. npm and yarn ignore this file entirely.
 */
/**
 * Approve the install scripts the theme needs (`sharp` for image optimisation,
 * `esbuild` for loading the TypeScript config).
 *
 * pnpm 11 renamed the setting to an `allowBuilds` map in `pnpm-workspace.yaml`
 * and no longer reads the `pnpm` field of `package.json`; pnpm 10 still wants
 * the `onlyBuiltDependencies` list. We write both. When a failed install has
 * already left pnpm's own placeholder behind
 * (`esbuild: set this to true or false`), we flip it to `true` instead of
 * treating the file as configured.
 */
async function ensurePnpmWorkspace() {
	const file = join(CWD, "pnpm-workspace.yaml");
	const allowBlock = [
		"allowBuilds:",
		...BUILT_DEPENDENCIES.map((dep) => `  ${dep}: true`),
	].join("\n");
	const onlyBlock = [
		"onlyBuiltDependencies:",
		...BUILT_DEPENDENCIES.map((dep) => `  - ${dep}`),
	].join("\n");

	if (!existsSync(file)) {
		await writeFile(
			file,
			"# Lets these dependencies run their install scripts.\n" +
				"# sharp powers Astro's image optimisation and will not work without it.\n" +
				`${allowBlock}\n${onlyBlock}\n`,
			"utf8",
		);
		log.ok("pnpm-workspace.yaml");
		return;
	}

	const original = await readFile(file, "utf8");
	let lines = original.split("\n");

	const allowIndex = lines.findIndex((line) => /^allowBuilds:\s*$/.test(line));
	if (allowIndex === -1) {
		lines = [...lines.join("\n").trimEnd().split("\n"), "", ...allowBlock.split("\n")];
	} else {
		// Rewrite the whole indented block so placeholders become `true`.
		let end = allowIndex + 1;
		while (end < lines.length && /^\s+\S/.test(lines[end])) end += 1;
		const existing = lines.slice(allowIndex + 1, end);
		const kept = existing.filter((line) => {
			const name = line.trim().split(":")[0];
			return !BUILT_DEPENDENCIES.includes(name);
		});
		lines = [
			...lines.slice(0, allowIndex + 1),
			...BUILT_DEPENDENCIES.map((dep) => `  ${dep}: true`),
			...kept,
			...lines.slice(end),
		];
	}

	if (!lines.some((line) => /^onlyBuiltDependencies:\s*$/.test(line))) {
		lines = [...lines.join("\n").trimEnd().split("\n"), ...onlyBlock.split("\n")];
	}

	const next = `${lines.join("\n").trimEnd()}\n`;
	if (next === original) {
		log.skip("pnpm-workspace.yaml already configured");
		return;
	}
	await writeFile(file, next, "utf8");
	log.ok("pnpm-workspace.yaml");
}

async function ensurePackageJson(packageName) {
	const pkgPath = join(CWD, "package.json");
	const peers = await themePeers();
	const packageManager = await readPackageManager();

	// A completely empty directory has no package.json at all. Write a minimal
	// one so a single `pnpm install` pulls in astro, the theme and its peer
	// dependencies — no `pnpm create astro` starter needed beforehand.
	if (!existsSync(pkgPath)) {
		const version = await readPackageVersion();
		const dependencies = {
			astro: peers.astro ?? "^7.0.0",
			...Object.fromEntries(Object.entries(peers).filter(([name]) => name !== "astro")),
			[packageName]: version ? `^${version}` : "latest",
		};
		const pkg = {
			name: basename(CWD) || "shirone-site",
			version: "0.0.1",
			private: true,
			type: "module",
			// Pin the same package manager the theme is developed with (e.g.
			// pnpm@9.x) so `.npmrc`'s `manage-package-manager-versions` and
			// CI hosts (Vercel, corepack) resolve the intended pnpm.
			...(packageManager ? { packageManager } : {}),
			scripts: {
				dev: "astro dev",
				build: "astro build",
				preview: "astro preview",
				astro: "astro",
			},
			dependencies,
		};
		await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
		log.ok("package.json (created)");
		return [packageName, ...Object.keys(dependencies)];
	}

	const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
	pkg.scripts ??= {};
	pkg.dependencies ??= {};
	pkg.devDependencies ??= {};
	let changed = false;

	// Everything the project must depend on directly: astro, the theme's peers
	// (svelte, sharp, the iconify sets) and the theme itself. This also covers
	// a hand-written package.json that never declared the theme.
	const version = await readPackageVersion();
	const wantedDeps = {
		astro: peers.astro ?? "^7.0.0",
		...Object.fromEntries(Object.entries(peers).filter(([name]) => name !== "astro")),
		[packageName]: version ? `^${version}` : "latest",
	};

	const addedDeps = [];
	const upgradedDeps = [];
	for (const [dep, range] of Object.entries(wantedDeps)) {
		const declared = pkg.dependencies[dep] ?? pkg.devDependencies[dep];
		if (declared) {
			// A declared dependency that can no longer satisfy the theme's
			// requirement would break the build (e.g. a starter pinned astro@5
			// while the theme needs astro@^7). Bump it and say so.
			if (rangeLower(rangeFloor(declared), rangeFloor(range))) {
				pkg.dependencies[dep] = range;
				delete pkg.devDependencies[dep];
				upgradedDeps.push({ dep, from: declared, to: range });
				changed = true;
			}
			continue;
		}
		pkg.dependencies[dep] = range;
		addedDeps.push(dep);
		changed = true;
	}

	const wanted = {
		dev: "astro dev",
		build: "astro build",
		preview: "astro preview",
		astro: "astro",
	};
	for (const [key, value] of Object.entries(wanted)) {
		if (!pkg.scripts[key]) {
			pkg.scripts[key] = value;
			changed = true;
		}
	}
	if (pkg.type !== "module") {
		pkg.type = "module";
		changed = true;
	}

	// Same package-manager pin as the freshly-created case, but never clobber
	// a version the user already chose themselves.
	if (packageManager && !pkg.packageManager) {
		pkg.packageManager = packageManager;
		changed = true;
	}

	// Build-script approval lives in `pnpm-workspace.yaml` (see
	// `ensurePnpmWorkspace`): pnpm 11 ignores the `pnpm` field of package.json
	// and warns about it, so we deliberately do not write it here.
	if (pkg.pnpm && Object.keys(pkg.pnpm).length === 0) {
		delete pkg.pnpm;
		changed = true;
	}

	if (changed) {
		await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
		log.ok("package.json");
	}
	for (const { dep, from, to } of upgradedDeps) {
		log.warn(`bumped ${dep} ${from} -> ${to} — the declared version no longer satisfies the theme`);
	}
	return [...addedDeps, ...upgradedDeps.map((d) => d.dep)];
}

/** Read the theme's declared peer dependencies. */
async function themePeers() {
	try {
		const raw = await readFile(join(PACKAGE_ROOT, "package.json"), "utf8");
		return JSON.parse(raw).peerDependencies ?? {};
	} catch {
		return {};
	}
}

/**
 * Lowest version a range admits, as [major, minor, patch]. Handles the common
 * caret/tilde/plain forms ("^7.0.0", "~0.34.5", "7", ">=6"); anything
 * unparseable ("latest", "*", …) is `null` and treated as unknown.
 */
function rangeFloor(range) {
	if (typeof range !== "string") return null;
	const m = range.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
	if (!m) return null;
	return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
}

/** Whether floor `a` is strictly below floor `b` (null floors are "unknown"). */
function rangeLower(a, b) {
	if (!a || !b) return false;
	for (let i = 0; i < 3; i++) {
		if (a[i] !== b[i]) return a[i] < b[i];
	}
	return false;
}

/**
 * Root files the template ships for the user's project. Every one of these
 * follows the same rule: never overwrite what the user already has. They are
 * installed with `copyEntry`, which skips existing files unless `--force`.
 *
 * `.gitignore` and `.npmrc` ship under `_`-prefixed names because npm and pnpm
 * strip those exact dotfiles from published tarballs; `init` renames them back.
 * A `[source, destination]` entry maps the template name to the project name.
 */
const ROOT_FILES = [
	".env.example",
	["_gitignore", ".gitignore"],
	["_npmrc", ".npmrc"],
	"AGENTS.md",
	"README.md",
	"pagefind.yml",
	"frontmatter.json",
	".vscode/extensions.json",
];

async function installRootFiles({ force }) {
	let added = 0;
	let skipped = 0;
	let backedUp = 0;
	for (const entry of ROOT_FILES) {
		const [srcName, dstName] = Array.isArray(entry) ? entry : [entry, entry];
		const result = await copyEntry(
			join(TEMPLATE_DIR, srcName),
			join(CWD, dstName),
			{ force, quiet: true },
		);
		if (result.copied) {
			added += 1;
			if (result.saved) backedUp += 1;
		} else if (result.reason === "exists") skipped += 1;
	}
	if (added === 0 && skipped > 0) {
		log.skip(`root files already present (${skipped} kept)`);
	} else if (added > 0) {
		const backupNote = backedUp ? `, ${backedUp} previous copies backed up` : "";
		log.ok(`root files (${added} added${skipped ? `, ${skipped} kept` : ""}${backupNote})`);
	}
}

/** Root files the template ships but the project is currently missing. */
function missingRootFiles() {
	const out = [];
	for (const entry of ROOT_FILES) {
		const [srcName, dstName] = Array.isArray(entry) ? entry : [entry, entry];
		if (
			existsSync(join(TEMPLATE_DIR, srcName)) &&
			!existsSync(join(CWD, dstName))
		) {
			out.push(dstName);
		}
	}
	return out;
}

/** Pick the package manager from whatever lockfile already exists. */
function detectPackageManager() {
	if (existsSync(join(CWD, "pnpm-lock.yaml"))) return "pnpm";
	if (existsSync(join(CWD, "yarn.lock"))) return "yarn";
	if (existsSync(join(CWD, "package-lock.json"))) return "npm";
	return "pnpm";
}

/**
 * Install the project's dependencies so `init` works from a completely empty
 * directory: writing the missing peer dependencies into package.json is only
 * half the job — they still have to actually be installed (astro included).
 * Reuses whatever is already in the store, so this is a fast no-op when the
 * user already ran `pnpm add shirones` beforehand.
 */
async function installDependencies() {
	const pm = detectPackageManager();
	// pnpm treats a CI environment as `--frozen-lockfile`, and this install
	// exists precisely because package.json just changed — so opt out.
	const args = pm === "pnpm" ? ["install", "--no-frozen-lockfile"] : ["install"];
	log.step(`installing dependencies with ${pm} ${args.slice(1).join(" ")}`);
	const result = spawnSync(pm, args, {
		cwd: CWD,
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		log.err(`${pm} install failed — run it manually and check the output above`);
		process.exitCode = 1;
		return false;
	}
	return true;
}

/**
 * Write a tsconfig that teaches the editor about the theme's path aliases, so
 * `@/types/config` resolves while editing files under `shirones/config/`.
 */
async function ensureTsConfig(packageName, { force }) {
	const tsconfigPath = join(CWD, "tsconfig.json");
	const themeSrc = `./node_modules/${packageName}/src`;

	const desiredPaths = {
		"@/*": [`${themeSrc}/*`],
		"@components/*": [`${themeSrc}/components/*`],
		"@utils/*": [`${themeSrc}/utils/*`],
		"@layouts/*": [`${themeSrc}/layouts/*`],
		"@i18n/*": [`${themeSrc}/i18n/*`],
		"@constants/*": [`${themeSrc}/constants/*`],
		"@assets/*": [`${themeSrc}/assets/*`],
	};

	if (!existsSync(tsconfigPath)) {
		const tsconfig = {
			extends: "astro/tsconfigs/strict",
			include: [".astro/types.d.ts", "**/*"],
			exclude: ["dist", "node_modules"],
			compilerOptions: {
				strictNullChecks: true,
				baseUrl: ".",
				paths: desiredPaths,
			},
		};
		await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
		log.ok("tsconfig.json");
		return;
	}

	const tsconfig = JSON.parse(await readFile(tsconfigPath, "utf8"));
	tsconfig.compilerOptions ??= {};
	tsconfig.compilerOptions.baseUrl ??= ".";
	tsconfig.compilerOptions.paths ??= {};

	let changed = false;
	for (const [key, value] of Object.entries(desiredPaths)) {
		if (!tsconfig.compilerOptions.paths[key] || force) {
			tsconfig.compilerOptions.paths[key] = value;
			changed = true;
		}
	}
	if (changed) {
		if (force) await backup("tsconfig.json");
		await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");
		log.ok(force ? "tsconfig.json (theme path aliases; previous copy backed up)" : "tsconfig.json (theme path aliases)");
	} else {
		log.skip("tsconfig.json already configured");
	}
}

/** Every filename Astro will load a config from, in its own resolution order. */
const ASTRO_CONFIG_FILENAMES = [
	"astro.config.mjs",
	"astro.config.js",
	"astro.config.ts",
	"astro.config.mts",
	"astro.config.cjs",
];

const BACKUP_DIR = ".shirones-backup";

/** Move a file out of the way instead of deleting the user's work. */
async function backup(relativePath) {
	const from = join(CWD, relativePath);
	let to = join(CWD, BACKUP_DIR, relativePath);
	let suffix = 1;
	while (existsSync(to)) {
		to = join(CWD, BACKUP_DIR, `${relativePath}.${suffix}`);
		suffix += 1;
	}
	await mkdir(dirname(to), { recursive: true });
	await rename(from, to);
	return relative(CWD, to);
}

/** Replace a directory for --force, preserving the complete previous tree. */
async function replaceDirectory(from, to) {
	if (!existsSync(from)) return { copied: false, reason: "missing" };
	let saved;
	if (existsSync(to)) saved = await backup(relative(CWD, to));
	await mkdir(dirname(to), { recursive: true });
	await cp(from, to, { recursive: true, force: true });
	const label = relative(CWD, to) || ".";
	log.ok(saved ? `${label} replaced (--force), kept a copy at ${saved}` : label);
	return { copied: true, saved };
}

/**
 * Install the theme's `astro.config.mjs`.
 *
 * `pnpm create astro` always leaves a config behind, so "skip if it exists"
 * silently produced a project where the integration was never registered —
 * Astro then served its own starter page and the theme appeared to do nothing.
 * A config that does not mention the package is therefore replaced (the old one
 * is kept as a backup); a config that already wires the theme in is left alone.
 */
async function ensureAstroConfig(packageName, { force }) {
	const present = ASTRO_CONFIG_FILENAMES.filter((name) => existsSync(join(CWD, name)));
	const target = join(CWD, "astro.config.mjs");

	for (const name of present) {
		const current = await readFile(join(CWD, name), "utf8");
		const wired = current.includes(packageName) || current.includes("shirones");

		if (wired && !force) {
			log.skip(`${name} already wires the theme in`);
			return;
		}

		const saved = await backup(name);
		if (wired) {
			log.ok(`${name} already wires the theme in — replaced with the template (--force), kept a copy at ${saved}`);
		} else {
			log.warn(`${name} did not register the theme — kept a copy at ${saved}`);
		}
	}

	await cp(join(TEMPLATE_DIR, "astro.config.mjs"), target, { force: true });
	log.ok("astro.config.mjs");
}

/**
 * Get the starter files out of the way.
 *
 * Anything in `src/pages/` beats an injected route, so the starter
 * `index.astro` would keep serving Astro's welcome screen forever. Worse,
 * `src/layouts/Layout.astro` and `src/components/*` are exactly where the theme
 * looks for user overrides, so the starter versions would silently replace the
 * theme's own layout. None of it is content the user wrote, but we move rather
 * than delete.
 */
async function clearStarterFiles() {
	const suspects = [
		"src/pages/index.astro",
		"src/components/Welcome.astro",
		"src/layouts/Layout.astro",
		"src/assets/astro.svg",
		"src/assets/background.svg",
	];

	const moved = [];
	for (const relativePath of suspects) {
		const file = join(CWD, relativePath);
		if (!existsSync(file)) continue;

		if (relativePath.endsWith(".astro")) {
			const contents = await readFile(file, "utf8");
			const isStarter =
				contents.includes("Welcome") ||
				contents.includes("astro.build") ||
				contents.includes("<slot />");
			if (!isStarter) {
				log.warn(`${relativePath} is yours — left in place, but it overrides the theme`);
				continue;
			}
		}

		moved.push(await backup(relativePath));
	}

	if (moved.length > 0) {
		log.ok(`moved ${moved.length} starter files to ${BACKUP_DIR}/`);
	}

	// A `src/pages/` that still holds routes shadows the theme's own pages.
	const pagesDir = join(CWD, "src/pages");
	if (existsSync(pagesDir)) {
		const leftovers = (await readdir(pagesDir)).filter((name) => !name.startsWith("."));
		if (leftovers.length > 0) {
			log.warn(
				`src/pages/ still contains ${leftovers.join(", ")} — ` +
					"file routes win over the theme's injected routes",
			);
		}
	}
}

// ══ State check: `init` on an already-initialised project ══════════════════

/** Recursively list relative file paths (POSIX separators) under `dir`. */
async function listRelative(dir) {
	const out = [];
	if (!existsSync(dir)) return out;
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			for (const sub of await listRelative(full)) out.push(join(entry.name, sub));
		} else {
			out.push(entry.name);
		}
	}
	return out;
}

/** Top-level `export … NAME` declarations in a TypeScript source. */
function tsExportNames(src) {
	const names = new Set();
	const re = /^\s*export\s+(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm;
	for (const m of src.matchAll(re)) names.add(m[1]);
	return names;
}

/** Skip past a quoted string starting at `src[i]`; returns the closing index. */
function skipString(src, i) {
	const quote = src[i];
	for (let j = i + 1; j < src.length; j++) {
		if (src[j] === "\\") {
			j++;
			continue;
		}
		if (src[j] === quote) return j;
	}
	return src.length - 1;
}

/** Text between the `{` at `open` and its matching `}`, or null. */
function balancedBody(src, open) {
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		const ch = src[i];
		if (ch === "{") {
			depth++;
		} else if (ch === "}") {
			depth--;
			if (depth === 0) return src.slice(open + 1, i);
		} else if (ch === '"' || ch === "'" || ch === "`") {
			i = skipString(src, i);
		}
	}
	return null;
}

/** Top-level `key:` names of an object body (depth 1 only). */
function topKeys(body) {
	const keys = new Set();
	let depth = 0;
	let i = 0;
	while (i < body.length) {
		const ch = body[i];
		if (ch === '"' || ch === "'" || ch === "`") {
			i = skipString(body, i) + 1;
			continue;
		}
		// Skip comments so `:` inside them is not mistaken for a field.
		if (ch === "/" && body[i + 1] === "/") {
			while (i < body.length && body[i] !== "\n") i++;
			continue;
		}
		if (ch === "/" && body[i + 1] === "*") {
			const end = body.indexOf("*/", i + 2);
			i = end === -1 ? body.length : end + 2;
			continue;
		}
		if (ch === "{") {
			depth++;
			i++;
			continue;
		}
		if (ch === "}") {
			depth--;
			i++;
			continue;
		}
		if (ch === ":" && depth === 0) {
			let j = i - 1;
			while (j >= 0 && /\s/.test(body[j])) j--;
			let k = j;
			while (k >= 0 && /[A-Za-z0-9_$]/.test(body[k])) k--;
			const key = body.slice(k + 1, j + 1);
			if (key && !/^\d+$/.test(key)) keys.add(key);
		}
		i++;
	}
	return keys;
}

/**
 * Top-level keys of every `export const NAME = …{…}` object in a source.
 * The declaration may carry a type annotation and wrap the object in a call
 * (`withUserConfig("site", { … })`), so the `{` is located by scanning ahead
 * from the declaration instead of requiring `= {` on one line.
 */
function objectFieldKeys(src) {
	const fields = new Map();
	const re = /export\s+const\s+([A-Za-z0-9_$]+)/g;
	for (const m of src.matchAll(re)) {
		const name = m[1];
		let open = -1;
		for (let i = m.index + m[0].length; i < src.length; i++) {
			const ch = src[i];
			if (ch === '"' || ch === "'" || ch === "`") {
				i = skipString(src, i);
				continue;
			}
			if (ch === "{" ) {
				open = i;
				break;
			}
		}
		if (open === -1) continue;
		const body = balancedBody(src, open);
		if (body !== null) fields.set(name, topKeys(body));
	}
	return fields;
}

/** Compare one config file against its template counterpart. */
async function diffConfigFile(tplPath, usrPath) {
	const tpl = await readFile(tplPath, "utf8");
	const usr = await readFile(usrPath, "utf8");

	const tplNames = tsExportNames(tpl);
	const usrNames = tsExportNames(usr);
	const missingExports = [...tplNames].filter((n) => !usrNames.has(n));
	const extraExports = [...usrNames].filter((n) => !tplNames.has(n));

	const tplFields = objectFieldKeys(tpl);
	const usrFields = objectFieldKeys(usr);
	const missingFields = {};
	for (const [name, keys] of tplFields) {
		const usr = usrFields.get(name) ?? new Set();
		const miss = [...keys].filter((k) => !usr.has(k));
		if (miss.length) missingFields[name] = miss;
	}
	const extraFields = {};
	for (const [name, keys] of usrFields) {
		const tplSet = tplFields.get(name) ?? new Set();
		const extra = [...keys].filter((k) => !tplSet.has(k));
		if (extra.length) extraFields[name] = extra;
	}

	return { missingExports, extraExports, missingFields, extraFields };
}

/** Collect the differences between the template config and the user's copy. */
async function checkState() {
	const tplConfig = join(TEMPLATE_DIR, CONTENT_ROOT, "config");
	const usrConfig = join(CWD, CONTENT_ROOT, "config");

	const tplFiles = await listRelative(tplConfig);
	const usrFiles = await listRelative(usrConfig);
	const tplSet = new Set(tplFiles);
	const usrSet = new Set(usrFiles);

	const missing = tplFiles.filter((f) => !usrSet.has(f)).sort();
	const stale = usrFiles.filter((f) => !tplSet.has(f)).sort();

	const fieldDiffs = [];
	for (const rel of tplFiles.filter((f) => f.endsWith(".ts") && usrSet.has(f))) {
		const diff = await diffConfigFile(
			join(tplConfig, rel),
			join(usrConfig, rel),
		);
		if (
			diff.missingExports.length ||
			diff.extraExports.length ||
			Object.keys(diff.missingFields).length ||
			Object.keys(diff.extraFields).length
		) {
			fieldDiffs.push({ rel, ...diff });
		}
	}

	return { missing, stale, fieldDiffs, missingRoot: missingRootFiles() };
}

/**
 * `init` on an already-initialised project: report what drifted from the
 * template (missing files, removed/obsolete files, missing or extra fields).
 *
 * By default it only *reports* — nothing is changed. Pass `apply: true`
 * (the `--update` flag) to repair the safe bits: missing config files are
 * restored, deleted root files and `public/` assets are re-added, and the
 * remaining scaffold pieces are brought up to date. Either way nothing the
 * user wrote is overwritten.
 */
async function checkAndUpdate(packageName, { apply }) {
	const usrConfig = join(CWD, CONTENT_ROOT, "config");
	const { missing, stale, fieldDiffs, missingRoot } = await checkState();

	const clean =
		missing.length === 0 &&
		stale.length === 0 &&
		fieldDiffs.length === 0 &&
		missingRoot.length === 0;

	if (clean) {
		console.log(`\n${colours.green}${colours.bold}Up to date.${colours.reset}\n`);
		if (!apply) return;
	} else {
		const total =
			missing.length + stale.length + fieldDiffs.length + missingRoot.length;
		console.log(`\n${colours.bold}Found ${total} difference(s) from the template:${colours.reset}\n`);

		if (missing.length) {
			log.warn(`${missing.length} file(s) missing from ${CONTENT_ROOT}/config/`);
			for (const f of missing) console.log(`    ${colours.dim}− ${f}${colours.reset}`);
		}
		if (missingRoot.length) {
			log.warn(`${missingRoot.length} root file(s) missing: ${missingRoot.join(", ")}`);
		}
		if (stale.length) {
			log.warn(`${stale.length} file(s) no longer exist in the template (kept)`);
			for (const f of stale) console.log(`    ${colours.dim}− ${f}${colours.reset}`);
		}
		for (const d of fieldDiffs) {
			log.warn(`${join(CONTENT_ROOT, "config", d.rel)} differs from the template`);
			for (const n of d.missingExports) console.log(`    ${colours.dim}− missing export: ${n}${colours.reset}`);
			for (const n of d.extraExports) console.log(`    ${colours.dim}− extra export (yours): ${n}${colours.reset}`);
			for (const [name, keys] of Object.entries(d.missingFields))
				console.log(`    ${colours.dim}− ${name}: missing field(s): ${keys.join(", ")}${colours.reset}`);
			for (const [name, keys] of Object.entries(d.extraFields))
				console.log(`    ${colours.dim}− ${name}: field(s) not in template: ${keys.join(", ")}${colours.reset}`);
		}

		if (!apply) {
			console.log(`\n${colours.dim}Nothing was changed. Run \`npx shirones init --update\` to restore the missing files and refresh the scaffold.${colours.reset}\n`);
			return;
		}

		// Restore missing files (never touch the user's own files).
		if (missing.length) {
			log.step(`restoring ${missing.length} missing file(s)`);
			for (const rel of missing) {
				await copyEntry(
					join(TEMPLATE_DIR, CONTENT_ROOT, "config", rel),
					join(usrConfig, rel),
					{ force: false, quiet: true },
				);
			}
			log.ok(`${missing.length} file(s) restored under ${CONTENT_ROOT}/config/`);
		}
	}

	// The remaining pieces are idempotent: they only add what is missing.
	// Run on `--update` even when the config is clean, so deleted root files,
	// public assets and `src/icons/` come back too.
	await ensureAstroConfig(packageName, { force: false });
	await copyEntry(
		join(TEMPLATE_DIR, "src/content.config.ts"),
		join(CWD, "src/content.config.ts"),
		{ force: false },
	);
	await mergeDirectory(join(TEMPLATE_DIR, "public"), join(CWD, "public"), { force: false });
	await mkdir(join(CWD, "src/icons"), { recursive: true });
	await installRootFiles({ force: false });
	await ensureTsConfig(packageName, { force: false });
	const addedDeps = await ensurePackageJson(packageName);
	await ensurePnpmWorkspace();

	if (addedDeps.length > 0) {
		await installDependencies();
	} else {
		log.skip("dependencies already declared");
	}

	if (!clean) console.log(`\n${colours.green}${colours.bold}Done.${colours.reset}\n`);
}

async function init(args) {
	const force = args.includes("--force") || args.includes("-f");
	const apply = args.includes("--update") || args.includes("-u");
	const packageName = await readPackageName();

	if (!existsSync(TEMPLATE_DIR)) {
		log.err(
			`Template directory is missing from the installed package (${TEMPLATE_DIR}).\n` +
				"  This usually means the package was published incorrectly — please file an issue.",
		);
		process.exitCode = 1;
		return;
	}

	// Already initialised? Report drift from the template instead of
	// re-scaffolding; `--update` repairs the safe bits (never overwrites the
	// user's files).
	if (existsSync(join(CWD, CONTENT_ROOT)) && !force) {
		return checkAndUpdate(packageName, { apply });
	}

	console.log(`\n${colours.bold}Shirone${colours.reset} · initialising project`);

	// 1. Content + configuration.
	//
	// `--force` means exactly what it says: replace the template-owned tree.
	// Move the complete old tree first so the user can recover any content or
	// config they want from `.shirones-backup/`.
	if (force) {
		await replaceDirectory(
			join(TEMPLATE_DIR, CONTENT_ROOT),
			join(CWD, CONTENT_ROOT),
		);
	} else {
		await mergeDirectory(
			join(TEMPLATE_DIR, CONTENT_ROOT),
			join(CWD, CONTENT_ROOT),
			{ force: false },
		);
	}

	// 2. Static assets (favicons, banners, demo images). A force refresh also
	// replaces the complete template tree, after backing up the old public dir.
	if (force) {
		await replaceDirectory(join(TEMPLATE_DIR, "public"), join(CWD, "public"));
	} else {
		await mergeDirectory(join(TEMPLATE_DIR, "public"), join(CWD, "public"), { force: false });
	}

	// 2b. Project root files (.env.example, .gitignore, README, editor hints, …).
	// A forced replacement is backed up by copyEntry; ordinary init never clobbers.
	await installRootFiles({ force });

	// 3. Astro entry files.
	await copyEntry(
		join(TEMPLATE_DIR, "src/content.config.ts"),
		join(CWD, "src/content.config.ts"),
		{ force },
	);
	await ensureAstroConfig(packageName, { force });

	// 3b. Starter files from `pnpm create astro` shadow the theme.
	await clearStarterFiles();

	// 4. `astro-icon` scans this directory for local SVGs; creating it up front
	//    avoids a confusing ENOENT warning on the first build.
	await mkdir(join(CWD, "src/icons"), { recursive: true });

	// 5. Project metadata.
	await ensureTsConfig(packageName, { force });
	const addedDeps = await ensurePackageJson(packageName);
	await ensurePnpmWorkspace();

	// 6. If package.json was created or gained dependencies, install them now —
	//    that is what lets `init` work from a completely empty directory.
	if (addedDeps.length > 0) {
		await installDependencies();
	} else {
		log.skip("dependencies already declared");
	}

	const postCount = await countFiles(join(CWD, CONTENT_ROOT, "content/posts"));

	console.log(`
${colours.green}${colours.bold}Done.${colours.reset} ${postCount} example content files installed.

${colours.bold}Project layout${colours.reset}
  astro.config.mjs          the only Astro config
  src/content.config.ts     collection definitions
  src/components/           drop a file here to override a theme component
  src/layouts/              …same for layouts
  ${CONTENT_ROOT}/config/            site configuration (TypeScript, fully typed)
  ${CONTENT_ROOT}/config/data/       friends, projects, skills, timeline, …
  ${CONTENT_ROOT}/content/           posts, moments, about
  public/                   static assets

${colours.bold}Next${colours.reset}
  ${colours.dim}pnpm dev${colours.reset}
`);
}


async function readJsonFile(path) {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch {
		return null;
	}
}

async function info() {
	const packageJsonPath = join(PACKAGE_ROOT, "package.json");
	const packageName = await readPackageName();
	const packageMeta = await readJsonFile(packageJsonPath);
	const templatePresent = existsSync(TEMPLATE_DIR);
	const initialized = existsSync(join(CWD, CONTENT_ROOT));
	const projectMeta = await readJsonFile(join(CWD, "package.json"));
	const manifest = await readJsonFile(join(PACKAGE_ROOT, "manifest.json"));
	const buildInfo = await readJsonFile(join(PACKAGE_ROOT, "build-info.json"));
	const pagesDir = join(PACKAGE_ROOT, "src/pages");
	const tplConfigDir = join(TEMPLATE_DIR, CONTENT_ROOT, "config");
	const tplDataDir = join(tplConfigDir, "data");

	const countImmediateTs = async (dir) => {
		if (!existsSync(dir)) return 0;
		const entries = await readdir(dir, { withFileTypes: true });
		return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".ts")).length;
	};
	const configModules = await countImmediateTs(tplConfigDir);
	const dataModules = await countImmediateTs(tplDataDir);
	const countFromManifest = (key, fallback = 0) =>
		Number.isFinite(manifest?.counts?.[key]) ? manifest.counts[key] : fallback;
	const routes = countFromManifest("routes", await countFiles(pagesDir));
	const components = countFromManifest("components");
	const layouts = countFromManifest("layouts");
	const manifestConfig = countFromManifest("config", configModules);
	const manifestData = countFromManifest("data", dataModules);

	const contentDir = join(CWD, CONTENT_ROOT, "content");
	const posts = await countFiles(join(contentDir, "posts"));
	const moments = await countFiles(join(contentDir, "moments"));
	const contentFiles = await countFiles(contentDir);
	const publicFiles = await countFiles(join(CWD, "public"));
	const backupDir = join(CWD, BACKUP_DIR);
	const backupFiles = await countFiles(backupDir);
	const packageDependency =
		projectMeta?.dependencies?.[packageName] ??
		projectMeta?.devDependencies?.[packageName] ??
		"not declared";
	const declaredManager = projectMeta?.packageManager ?? "not pinned";
	const detectedManager = detectPackageManager();
	const engine = packageMeta?.engines?.node ?? "not declared";
	const nodeMatch = engine.match(/>=\s*(\d+)\.(\d+)(?:\.(\d+))?/);
	const currentNode = process.versions.node.split(".").map(Number);
	const nodeOkay = nodeMatch
		? currentNode[0] > Number(nodeMatch[1]) ||
		  (currentNode[0] === Number(nodeMatch[1]) &&
			(currentNode[1] > Number(nodeMatch[2]) ||
				(currentNode[1] === Number(nodeMatch[2]) && currentNode[2] >= Number(nodeMatch[3] ?? 0))))
		: null;
	const nodeStatus = nodeOkay === null ? "" : nodeOkay ? ` ${colours.green}✓${colours.reset}` : ` ${colours.red}✗${colours.reset}`;
	const row = (label, value) => console.log(`  ${label.padEnd(20)}${value}`);
	const section = (title) => console.log(`\n${colours.bold}${title}${colours.reset}`);
	const listPreview = (label, values) => {
		if (values.length === 0) return;
		const preview = values.slice(0, 4).join(", ");
		const more = values.length > 4 ? ` (+${values.length - 4} more)` : "";
		console.log(`    ${colours.dim}${label}: ${preview}${more}${colours.reset}`);
	};

	console.log(`\n${colours.bold}Shirone project info${colours.reset}`);
	section("Package");
	row("package", `${packageName}${packageMeta?.version ? ` v${packageMeta.version}` : ""}`);
	row("package root", PACKAGE_ROOT);
	row("template", templatePresent ? `${colours.green}present${colours.reset}` : `${colours.red}MISSING${colours.reset}`);
	row("manifest", manifest ? `${colours.green}present${colours.reset}` : `${colours.yellow}not available${colours.reset}`);
	row("upstream", buildInfo?.upstreamSha ? `${buildInfo.upstreamRef ?? "ref"}@${buildInfo.upstreamSha.slice(0, 12)}` : "not recorded");
	row("built", buildInfo?.builtAt ? `${buildInfo.builtAt} (${buildInfo.node ?? "Node unknown"})` : "not recorded");
	row("Node", `${process.version} / requires ${engine}${nodeStatus}`);

	section("Project");
	row("project root", CWD);
	row("status", initialized ? `${colours.green}initialised${colours.reset}` : `${colours.yellow}not initialised${colours.reset}`);
	row("package dependency", packageDependency);
	row("package manager", `${detectedManager} (project: ${declaredManager})`);
	row("content", `${join(CWD, CONTENT_ROOT)} (${contentFiles} files; ${posts} posts, ${moments} moments)`);
	row("public", `${publicFiles} files`);
	row("backup", backupFiles ? `${backupFiles} files in ${backupDir}` : "none");

	section("Theme inventory");
	row("routes", `${routes} page modules`);
	row("components", `${components} overridable components`);
	row("layouts", `${layouts} overridable layouts`);
	row("config", `${manifestConfig} default modules`);
	row("data", `${manifestData} data modules`);

	if (!initialized) {
		console.log(`\n${colours.dim}Run \`npx shirones init\` to scaffold this project.${colours.reset}\n`);
		return;
	}

	const drift = await checkState();
	const total = drift.missing.length + drift.stale.length + drift.fieldDiffs.length + drift.missingRoot.length;
	section("Drift");
	if (total === 0) {
		row("status", `${colours.green}up to date${colours.reset}`);
	} else {
		row("status", `${colours.yellow}${total} difference(s)${colours.reset}`);
		listPreview("missing config", drift.missing);
		listPreview("stale files kept", drift.stale);
		listPreview("changed config", drift.fieldDiffs.map((item) => item.rel));
		listPreview("missing root", drift.missingRoot);
		console.log(`    ${colours.dim}Run \`npx shirones init --update\` to restore safe missing files.${colours.reset}`);
	}
	console.log();
}

function help() {
	console.log(`
${colours.bold}Shirone CLI${colours.reset}

  ${colours.cyan}init${colours.reset}                 Scaffold the project — or report drift on an existing one
  ${colours.cyan}init${colours.reset} ${colours.dim}--update${colours.reset}        Restore missing files and refresh the scaffold (never overwrites your files)
  ${colours.cyan}init${colours.reset} ${colours.dim}--force${colours.reset}         Replace template files after backing up the previous copy
  ${colours.cyan}info${colours.reset}                 Detailed status and drift report
  ${colours.cyan}help${colours.reset}                 Show this message
`);
}

const [command = "help", ...args] = process.argv.slice(2);

await printCliNotice();

switch (command) {
	case "init":
		await init(args);
		break;
	case "info":
		await info();
		break;
	case "help":
	case "--help":
	case "-h":
		help();
		break;
	default:
		log.err(`Unknown command: ${command}`);
		help();
		process.exitCode = 1;
}
