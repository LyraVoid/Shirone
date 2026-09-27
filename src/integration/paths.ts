import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedShironesPaths, ShironesOptions } from "./types.ts";

/**
 * Directory name used for user content/config. Intentionally identical to the
 * published package name so that documentation and the on-disk layout match.
 */
export const DEFAULT_CONTENT_ROOT = "shirones";

/** Cache/scratch directory created inside the user's project. */
export const CACHE_DIR_NAME = ".shirones";

/**
 * Locate the package root by walking up from this module until a `package.json`
 * is found. Works both when bundled into `dist/index.js` (package root is one
 * level up from the bundle) and when running from source inside the repo.
 */
export function findPackageRoot(fromUrl: string): string {
	let dir = resolve(fileURLToPath(fromUrl), "..");
	for (let depth = 0; depth < 10; depth += 1) {
		if (existsSync(join(dir, "package.json"))) return dir;
		const parent = resolve(dir, "..");
		if (parent === dir) break;
		dir = parent;
	}
	// Fall back to the directory containing the entry module.
	return resolve(fileURLToPath(fromUrl), "..");
}

/**
 * `true` when the integration runs from the theme's *own repository checkout*
 * (the `git clone` workflow) rather than being consumed as a dependency. When
 * it is, the "user" directories default to the repository's own `src/config`,
 * `src/config/data` and `src/content` — the layout `astro.config.mjs` and the
 * repo scripts have always assumed.
 *
 * This replaces a pair of independent flags — `isPluginMode` (does
 * `import.meta.url` contain `node_modules`?) and `isInRepo` (this comparison).
 * The pair had a hole: a *linked* install (`pnpm link`, a pnpm workspace,
 * `npm link`) reaches the theme through a symlink, and Node and Vite both
 * report the realpath, so the URL carries no `node_modules` segment and
 * neither flag came out true. That third state mixed package-mode directory
 * defaults with source-mode behaviour — no route injection, so a silently
 * empty site; no "run `npx shirones init`" hint to explain it; and a full
 * `optimizeDeps.include` list that Vite cannot resolve from the project root.
 *
 * Every branch in the integration only ever needs one question: is the theme
 * building itself? If not, it is a dependency — however it reached the disk.
 */
export function detectThemeRepo(
	projectRoot: string,
	packageRoot: string,
): boolean {
	// `config.root` arrives as a `file:` URL *with* a trailing slash, so
	// `fileURLToPath` yields `/path/to/repo/` while `findPackageRoot()` returns
	// `/path/to/repo`. Strip the trailing separator before comparing, or every
	// repository checkout is misdetected as a dependency.
	return (
		normalisePath(projectRoot).toLowerCase() ===
		normalisePath(packageRoot).toLowerCase()
	);
}

function toAbsolute(projectRoot: string, candidate: string): string {
	return isAbsolute(candidate) ? candidate : resolve(projectRoot, candidate);
}

/**
 * Resolve every directory the integration needs, applying user overrides.
 */
export function resolvePaths(
	options: ShironesOptions,
	projectRootUrl: URL,
	moduleUrl: string,
): ResolvedShironesPaths {
	const projectRoot = fileURLToPath(projectRootUrl);
	const packageRoot = findPackageRoot(moduleUrl);
	const isThemeRepo = detectThemeRepo(projectRoot, packageRoot);

	// In plugin mode the published tarball keeps sources under `src/`.
	const packageSrc = existsSync(join(packageRoot, "src"))
		? join(packageRoot, "src")
		: packageRoot;

	const contentRootName = options.paths?.root ?? DEFAULT_CONTENT_ROOT;
	const contentRoot = toAbsolute(projectRoot, contentRootName);

	// Source mode points the "user" directories at the repository's own
	// layout; an explicit `options.paths` entry always wins. Package mode
	// keeps the `shirones/` content root.
	const configDir = options.paths?.config
		? toAbsolute(projectRoot, options.paths.config)
		: isThemeRepo
			? join(packageSrc, "config")
			: join(contentRoot, "config");

	// The two layouts are deliberately asymmetric: a scaffolded project nests
	// its data modules under `shirones/config/data/`, while the repository keeps
	// them as a sibling of `src/config/`, in `src/data/`. Reading the
	// package-mode shape here (`src/config/data`, which does not exist) made the
	// font pipeline silently skip every `src/data/*.ts` module when subsetting,
	// dropping glyphs that appear only in friends/projects/anime entries.
	const dataDir = options.paths?.data
		? toAbsolute(projectRoot, options.paths.data)
		: isThemeRepo
			? join(packageSrc, "data")
			: join(configDir, "data");

	const contentDir = options.paths?.content
		? toAbsolute(projectRoot, options.paths.content)
		: isThemeRepo
			? join(packageSrc, "content")
			: join(contentRoot, "content");

	return {
		projectRoot,
		packageRoot,
		packageSrc,
		configDir,
		dataDir,
		contentDir,
		cacheDir: join(projectRoot, CACHE_DIR_NAME),
		isThemeRepo,
	};
}

/** Normalise a filesystem path for comparison across platforms. */
export function normalisePath(value: string): string {
	return value.replace(/\\/g, "/").replace(/\/+$/, "");
}
