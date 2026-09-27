import { existsSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { normalisePath } from "./paths.ts";
import type { ResolvedShironesPaths } from "./types.ts";

/**
 * Extensions probed when a user override is looked up without one.
 * Order matters: the first hit wins.
 */
export const CONFIG_EXTENSIONS = [".ts", ".mts", ".js", ".mjs"];
/**
 * Barrel files, which stay owned by the package at any depth. The pattern used
 * to be anchored (`/^index\./`), so a nested `atoms/index.ts` would have been
 * overridable despite the comment claiming otherwise.
 */
const BARREL_RE = /(?:^|\/)index\.(ts|js|mts|mjs)$/;
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
export function createOverlayTargets(
	paths: ResolvedShironesPaths,
): OverlayTarget[] {
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
		if (BARREL_RE.test(rel)) continue;

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
export function buildOverrideRegistry(
	paths: ResolvedShironesPaths,
): OverrideRegistry {
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
			// `index.ts` barrels stay owned by the package: overriding one would
			// break the named-export contract the theme relies on. Matched at any
			// depth, not just the directory root.
			if (BARREL_RE.test(rel)) continue;

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

/**
 * Files a user left in the theme-owned config/data directories that correspond
 * to no module the package ships — and therefore to nothing that will ever be
 * loaded.
 *
 * This is the silent half of an upgrade: when the theme renames a config module
 * (`siteConfig` → `site`), the integration asks for the new name, finds the
 * user's old file nowhere it looks, and quietly falls back to the packaged
 * default. The user's edits stop applying with no error and no warning.
 *
 * Only `configDir` and `dataDir` are scanned. Those directories belong entirely
 * to the theme, so a file the package does not know about is inert by
 * definition. `src/components` and `src/layouts` are deliberately *not*
 * scanned: they are shared with the user's own components, so every legitimate
 * file of theirs would be reported as an orphan.
 */
export function findOrphanUserFiles(paths: ResolvedShironesPaths): string[] {
	const targets = createOverlayTargets(paths).filter(
		(t) => t.label === "config" || t.label === "data",
	);
	const orphans: string[] = [];

	for (const target of targets) {
		if (!existsSync(target.userDir)) continue;
		const userDir = normalisePath(target.userDir);

		for (const file of walkFiles(target.userDir)) {
			const rel = relative(target.userDir, file);

			// `dataDir` lives *inside* `configDir` but maps to a different package
			// directory (`src/data`, not `src/config/data`), so scanning it under
			// the config target would report every data module as an orphan. The
			// data target covers it against the right place.
			if (target.label === "config") {
				const dataDir = normalisePath(paths.dataDir);
				if (dataDir !== userDir && dataDir.startsWith(`${userDir}/`)) {
					const withinData = `${normalisePath(file)}/`.startsWith(
						`${dataDir}/`,
					);
					if (withinData) continue;
				}
			}

			// A package module with any of the probed extensions counts as known.
			if (probe(join(target.packageDir, rel), target.extensions)) continue;
			orphans.push(file);
		}
	}

	return orphans.sort();
}
