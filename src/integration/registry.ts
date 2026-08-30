import { existsSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { normalisePath } from "./paths.ts";
import type { ResolvedShironesPaths } from "./types.ts";

/**
 * Extensions probed when a user override is looked up without one.
 * Order matters: the first hit wins.
 */
export const CONFIG_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"];
export const COMPONENT_EXTENSIONS = [".astro", ".svelte", ".ts", ".js"];

/** Strip a known source extension from a path. */
function stripExtension(path: string): string {
	return path.replace(/\.(ts|mts|js|mjs|astro|svelte)$/, "");
}

/**
 * Normalised, extension-stripped key used to look an override up. Both the
 * package path and the user path map onto the same key, so a `Foo.astro` in the
 * package and a `Foo.svelte` in the user's project resolve to one entry.
 */
export function overrideKey(path: string): string {
	return normalisePath(stripExtension(path));
}

export interface OverlayTarget {
	/** Directory inside the package that may be overridden. */
	packageDir: string;
	/** Directory in the user's project that takes precedence. */
	userDir: string;
	/** Extensions probed when resolving. */
	extensions: string[];
	/** Human readable label used in debug logs. */
	label: string;
}

/**
 * The directory pairs that participate in the override system.
 *
 * | package             | user project                 |
 * |---------------------|------------------------------|
 * | `src/config/*`      | `shirones/config/*`          |
 * | `src/data/*`        | `shirones/config/data/*`     |
 * | `src/components/**` | `src/components/**`          |
 * | `src/layouts/**`    | `src/layouts/**`             |
 */
export function createOverlayTargets(paths: ResolvedShironesPaths): OverlayTarget[] {
	return [
		{
			label: "config",
			packageDir: join(paths.packageSrc, "config"),
			userDir: paths.configDir,
			extensions: CONFIG_EXTENSIONS,
		},
		{
			label: "data",
			packageDir: join(paths.packageSrc, "data"),
			userDir: paths.dataDir,
			extensions: CONFIG_EXTENSIONS,
		},
		{
			label: "components",
			packageDir: join(paths.packageSrc, "components"),
			userDir: join(paths.projectRoot, "src", "components"),
			extensions: COMPONENT_EXTENSIONS,
		},
		{
			label: "layouts",
			packageDir: join(paths.packageSrc, "layouts"),
			userDir: join(paths.projectRoot, "src", "layouts"),
			extensions: COMPONENT_EXTENSIONS,
		},
	];
}

/** Resolve a path that may be missing its extension against the given list. */
export function probe(basePath: string, extensions: string[]): string | null {
	// Exact path first (the importer already carried an extension).
	if (extname(basePath) && existsSync(basePath)) return basePath;

	const withoutExt = stripExtension(basePath);
	for (const ext of extensions) {
		const candidate = `${withoutExt}${ext}`;
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/** Recursively list files under `root` (absolute paths). */
function walkFiles(root: string): string[] {
	const out: string[] = [];
	if (!existsSync(root)) return out;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/**
 * Resolve a package-internal path to a user override, if one exists.
 * Returns `null` when the path is not overridable or no override is present.
 *
 * Kept for callers that do not have a registry handy (e.g. one-off probes).
 */
export function resolveOverride(
	targets: OverlayTarget[],
	absolutePath: string,
): string | null {
	const normalised = normalisePath(absolutePath);

	for (const target of targets) {
		const packageDir = normalisePath(target.packageDir);
		if (!normalised.startsWith(`${packageDir}/`)) continue;

		const rel = relative(target.packageDir, absolutePath);
		// `index.ts` barrels stay owned by the package: overriding them would
		// break the named-export contract the theme relies on.
		if (/^index\.(ts|js|mts|mjs)$/.test(rel)) continue;

		const hit = probe(join(target.userDir, rel), target.extensions);
		if (hit) return hit;
	}
	return null;
}

/**
 * A mutable holder for the compiled registry, so the integration can swap in a
 * rebuilt one when the user's override files change in dev without recreating
 * the Vite plugins (whose closures captured the original reference).
 */
export interface OverrideRegistryRef {
	overrides: Map<string, string>;
}

/** The compiled override registry: every overridable package file → user file. */
export interface OverrideRegistry {
	/** Package key (extension-stripped) → user override file (absolute path). */
	overrides: Map<string, string>;
	/** Number of overrides registered per directory, for diagnostics. */
	counts: Record<string, number>;
}

/**
 * Scan the package and the user's project once and register every override in
 * a single pass. Resolution becomes a table lookup instead of a filesystem
 * probe per import, and the registry doubles as the single source of truth for
 * "what is overridden and what is not".
 */
export function buildOverrideRegistry(paths: ResolvedShironesPaths): OverrideRegistry {
	const targets = createOverlayTargets(paths);
	const overrides = new Map<string, string>();
	const counts: Record<string, number> = {};

	for (const target of targets) {
		let registered = 0;
		if (!existsSync(target.packageDir)) {
			counts[target.label] = 0;
			continue;
		}

		for (const abs of walkFiles(target.packageDir)) {
			const rel = relative(target.packageDir, abs);
			// `index.ts` barrels stay owned by the package.
			if (/^index\.(ts|js|mts|mjs)$/.test(rel)) continue;

			const hit = probe(join(target.userDir, rel), target.extensions);
			if (hit) {
				overrides.set(overrideKey(abs), normalisePath(hit));
				registered += 1;
			}
		}
		counts[target.label] = registered;
	}

	return { overrides, counts };
}
