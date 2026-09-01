import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { normalisePath } from "./paths.ts";
import {
	createOverlayTargets,
	overrideKey,
	probe,
	type OverrideRegistryRef,
} from "./registry.ts";
import type { ResolvedShironesPaths } from "./types.ts";

export interface OverlayPluginOptions {
	paths: ResolvedShironesPaths;
	/** Explicit component override map from `ShironesOptions.components`. */
	components?: Record<string, string>;
	/** Compiled override registry (mutable; the integration rebuilds it in dev). */
	registryRef: OverrideRegistryRef;
}

/** Theme path aliases, mapped to sub-directories of the package `src/`. */
const ALIAS_MAP: [string, string][] = [
	["@components/", "components/"],
	["@utils/", "utils/"],
	["@layouts/", "layouts/"],
	["@i18n/", "i18n/"],
	["@constants/", "constants/"],
	["@assets/", "assets/"],
	// `@/` is the broadest pattern and must be tested last.
	["@/", ""],
];

/** Split a Vite id into its path and query (`?raw`, `?url`, `?astro&type=…`). */
function splitQuery(id: string): [string, string] {
	const index = id.indexOf("?");
	return index === -1 ? [id, ""] : [id.slice(0, index), id.slice(index)];
}

/**
 * Vite plugin implementing Shirone's component/config override system.
 *
 * It deliberately resolves candidates itself instead of delegating to
 * `this.resolve()`. An earlier version round-tripped every specifier through
 * the resolver so it could inspect the final path; that also intercepted bare
 * package specifiers such as `shirones/collections` and broke them. Now the
 * plugin only reacts to the two shapes that can possibly reference theme
 * internals — alias imports and relative imports from inside the package —
 * and returns `null` for everything else, leaving Vite's resolution untouched.
 */
export function shironesOverlay(options: OverlayPluginOptions): Plugin {
	const { paths, components = {}, registryRef } = options;
	const targets = createOverlayTargets(paths);
	const packageSrc = normalisePath(paths.packageSrc);

	// Pre-resolve the explicit override map to absolute paths.
	const explicit = new Map<string, string>();
	for (const [key, value] of Object.entries(components)) {
		const target = resolve(paths.projectRoot, value);
		if (!existsSync(target)) {
			throw new Error(
				`[shirones] Component override "${key}" points at "${value}", which does not exist ` +
					`(resolved to ${target}).`,
			);
		}
		explicit.set(normalisePath(key).replace(/\.(astro|svelte|ts|js)$/, ""), target);
	}

	/** Explicit-map lookup for an absolute path inside the package. */
	function explicitOverrideFor(absolutePath: string): string | null {
		if (explicit.size === 0) return null;
		const normalised = normalisePath(absolutePath);

		for (const [dir, prefix] of [
			[normalisePath(join(paths.packageSrc, "components")), ""],
			[normalisePath(join(paths.packageSrc, "layouts")), "layouts/"],
		] as const) {
			if (!normalised.startsWith(`${dir}/`)) continue;
			const key = `${prefix}${normalised.slice(dir.length + 1)}`.replace(
				/\.(astro|svelte|ts|js)$/,
				"",
			);
			const hit = explicit.get(key);
			if (hit) return hit;
		}
		return null;
	}

	/** Map an alias specifier onto an absolute path inside the package. */
	function resolveAlias(source: string): string | null {
		for (const [prefix, sub] of ALIAS_MAP) {
			if (!source.startsWith(prefix)) continue;
			return join(paths.packageSrc, sub, source.slice(prefix.length));
		}
		return null;
	}

	function overrideFor(absolutePath: string): string | null {
		// Explicit config map wins, then the pre-built registry (a single scan
		// at startup instead of a filesystem probe per import).
		return (
			explicitOverrideFor(absolutePath) ??
			registryRef.overrides.get(overrideKey(absolutePath)) ??
			null
		);
	}

	return {
		name: "shirones:overlay",
		enforce: "pre",

		resolveId(source, importer) {
			const [sourcePath, query] = splitQuery(source);

			// ── Case 0: absolute path already resolved into the package ─────
			// Astro expands tsconfig-path aliases (`@components/…`, `@layouts/…`,
			// `@/…`) into absolute package paths *before* this hook runs, so the
			// alias string never reaches Case 1. Check the resolved path itself
			// for a user override.
			if (isAbsolute(sourcePath)) {
				const override = overrideFor(sourcePath);
				if (override) {
					return `${override}${query}`;
				}
			}

			// ── Case 1: theme alias (`@/config/siteConfig`, `@components/…`) ──
			const aliased = resolveAlias(sourcePath);
			if (aliased) {
				const override = overrideFor(aliased);
				if (override) {
					return `${override}${query}`;
				}
				// Not overridden: let `resolve.alias` handle it as usual.
				return null;
			}

		// ── Case 2: relative import from a file inside the package ────────
		if (!importer || !sourcePath.startsWith(".")) return null;

		const [importerPath] = splitQuery(importer);
		const normalisedImporter = normalisePath(importerPath);
		if (normalisedImporter.startsWith(`${packageSrc}/`)) {
			const candidate = resolve(dirname(importerPath), sourcePath);
			const override = overrideFor(candidate);
			if (!override) return null;

			return `${override}${query}`;
		}

		// ── Case 3: relative import from a user override file ─────────────
		// A mirrored component keeps the theme's own relative imports
		// (`./PostMeta.astro`, `../../utils/…`). Resolve siblings in the
		// user's project first; when the user hasn't mirrored them, fall back
		// to the equivalent file inside the package.
		const userTarget = targets.find((t) =>
			normalisedImporter.startsWith(`${normalisePath(t.userDir)}/`),
		);
		if (!userTarget) return null;

		const userCandidate = resolve(dirname(importerPath), sourcePath);
		// A sibling that exists in the user's project is Vite's business.
		if (probe(userCandidate, userTarget.extensions) || existsSync(userCandidate))
			return null;

		// Otherwise resolve the equivalent file inside the package — this also
		// covers non-component files (`.css`, assets) a mirrored file reaches.
		const rel = relative(userTarget.userDir, userCandidate);
		const pkgCandidate = join(userTarget.packageDir, rel);
		const pkgTarget =
			probe(pkgCandidate, userTarget.extensions) ??
			(existsSync(pkgCandidate) ? pkgCandidate : null);
		if (pkgTarget) return `${normalisePath(pkgTarget)}${query}`;
		return null;
	},

	load(id) {
		// User-overridden .astro/.svelte files keep the theme's relative
		// Stylus imports (`@import "../styles/…"`), which only exist inside
		// the package. Rewrite them here — in `load` rather than `transform` —
		// because vite-plugin-astro compiles `<style lang="stylus">` in its own
		// pre-transform, which runs before this plugin's transform hook.
		const [path, query] = splitQuery(id);
		if (query) return null;
		const normalised = normalisePath(path);
		if (!/\.(astro|svelte)$/.test(normalised)) return null;
		const target = targets.find((t) =>
			normalised.startsWith(`${normalisePath(t.userDir)}/`),
		);
		if (!target) return null;

		let code: string;
		try {
			code = readFileSync(path, "utf8");
		} catch {
			return null;
		}
		if (!/@(import|reference|require)\s+["']\.\.?\//.test(code)) return null;

		let changed = false;
		const out = code.replace(
			/@(import|reference|require)\s+(["'])(\.\.?\/[^"']+)\2/g,
			(match, directive, quote, rel) => {
				// Resolve against the user's project first, so a user can also
				// override the referenced file; otherwise point at the package's
				// copy (`.styl` variables, `.css` imports, `@reference` targets).
				const candidate = resolve(dirname(path), rel);
				if (existsSync(candidate)) return match;
				const pkgTarget = join(
					target.packageDir,
					relative(target.userDir, candidate),
				);
				if (!existsSync(pkgTarget)) return match;
				changed = true;
				return `@${directive} ${quote}${normalisePath(pkgTarget)}${quote}`;
			},
		);
		return changed ? { code: out, map: null } : null;
	},
};
}
