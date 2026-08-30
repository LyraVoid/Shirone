import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ResolvedShironesPaths } from "./types.ts";
import {
	createOverlayTargets,
	overrideKey,
	resolveOverride,
	type OverrideRegistryRef,
} from "./registry.ts";

/**
 * The integration needs values from user-authored TypeScript *before* Vite
 * exists: `site`, `base`, font declarations, expressive-code themes, the
 * markdown processor, ...
 *
 * We therefore bundle those modules on the fly with esbuild, applying the same
 * override rules the Vite plugin uses, and import the result.
 *
 * The bundle is self-contained (npm dependencies are inlined) and written to
 * `<projectRoot>/.shirones/loaded/`, keyed by a hash of its own contents so
 * repeated builds reuse it.
 */

export interface LoadedModule {
	[exportName: string]: unknown;
}

const cache = new Map<string, LoadedModule>();

const PROBE_EXTENSIONS = [".ts", ".mts", ".js", ".mjs", ".cjs"];

/** Resolve a path that may be missing its extension, or carry a stale one. */
export function probeFile(base: string): string | null {
	if (existsSync(base)) {
		try {
			if (statSync(base).isFile()) return base;
		} catch {
			/* fall through */
		}
	}
	for (const ext of PROBE_EXTENSIONS) {
		const candidate = `${base}${ext}`;
		if (existsSync(candidate)) return candidate;
	}
	// `./foo.js` written for a `foo.ts` source, or vice versa.
	const stripped = base.replace(/\.(ts|mts|js|mjs|cjs)$/, "");
	for (const ext of PROBE_EXTENSIONS) {
		const candidate = `${stripped}${ext}`;
		if (existsSync(candidate)) return candidate;
	}
	for (const ext of PROBE_EXTENSIONS) {
		const candidate = join(base, `index${ext}`);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

const ALIAS_MAP: Record<string, string> = {
	"@/": "",
	"@components/": "components/",
	"@utils/": "utils/",
	"@layouts/": "layouts/",
	"@i18n/": "i18n/",
	"@constants/": "constants/",
	"@assets/": "assets/",
};

/**
 * esbuild plugin mirroring the Vite overlay so Node-side and browser-side
 * resolve to the same files.
 */
function overlayEsbuildPlugin(
	paths: ResolvedShironesPaths,
	registryRef?: OverrideRegistryRef,
) {
	const targets = createOverlayTargets(paths);

	// Prefer the pre-built registry (a single scan); fall back to a probe when
	// no registry was supplied.
	const redirect = (absolute: string): string =>
		registryRef
			? (registryRef.overrides.get(overrideKey(absolute)) ?? absolute)
			: (resolveOverride(targets, absolute) ?? absolute);

	return {
		name: "shirones-overlay",
		// biome-ignore lint/suspicious/noExplicitAny: esbuild's PluginBuild type is not imported to keep this file dependency-light.
		setup(build: any) {
			// Theme path aliases (`@/config/...`, `@utils/...`, ...).
			build.onResolve(
				{ filter: /^@(\/|components\/|utils\/|layouts\/|i18n\/|constants\/|assets\/)/ },
				// biome-ignore lint/suspicious/noExplicitAny: see above.
				(args: any) => {
					for (const [prefix, sub] of Object.entries(ALIAS_MAP)) {
						if (!args.path.startsWith(prefix)) continue;
						const target = join(paths.packageSrc, sub, args.path.slice(prefix.length));
						const file = probeFile(target);
						if (file) return { path: redirect(file) };
					}
					return undefined;
				},
			);

			// Relative imports: resolve, then apply user overrides.
			// biome-ignore lint/suspicious/noExplicitAny: see above.
			build.onResolve({ filter: /^\.{1,2}\// }, (args: any) => {
				const file = probeFile(join(args.resolveDir, args.path));
				return file ? { path: redirect(file) } : undefined;
			});

			// `astro` and its virtual modules must never be bundled: they are
			// supplied by the host Astro process.
			//
			// Everything else (remark/rehype/unified/…) *is* bundled. That is
			// deliberate: the output is written to a cache directory whose
			// location has no relationship to the package's `node_modules`, and
			// under pnpm's strict layout a bare specifier there would not
			// resolve. Inlining removes the resolution problem entirely.
			// biome-ignore lint/suspicious/noExplicitAny: see above.
			build.onResolve({ filter: /^astro(:|\/|$)/ }, (args: any) => ({
				path: args.path,
				external: true,
			}));
		},
	};
}

function outputDir(paths: ResolvedShironesPaths): string {
	const dir = join(paths.cacheDir, "loaded");
	mkdirSync(dir, { recursive: true });
	return dir;
}

/**
 * Bundle `entry` (applying user overrides) and import the result.
 */
export async function loadModuleFile(
	paths: ResolvedShironesPaths,
	entry: string,
	cacheKey = entry,
	registryRef?: OverrideRegistryRef,
): Promise<LoadedModule> {
	const cached = cache.get(cacheKey);
	if (cached) return cached;

	const { build } = await import("esbuild");
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		format: "esm",
		platform: "node",
		target: "node20",
		absWorkingDir: paths.projectRoot,
		logLevel: "silent",
		// Keep JSON/asset imports inert: config modules only need plain values.
		loader: { ".json": "json" },
		// Some transitive dependencies are CommonJS and call `require()` for
		// Node builtins. esbuild's ESM output shims that with a `__require`
		// helper which prefers a real `require` when one is in scope, so we
		// provide one.
		banner: {
			js:
				"import { createRequire as __shironesCreateRequire } from 'node:module';\n" +
				"const require = __shironesCreateRequire(import.meta.url);",
		},
		plugins: [overlayEsbuildPlugin(paths, registryRef)],
	});

	const code = result.outputFiles?.[0]?.text ?? "";
	const hash = createHash("sha1").update(code).digest("hex").slice(0, 12);
	const file = join(outputDir(paths), `${sanitise(cacheKey)}.${hash}.mjs`);
	if (!existsSync(file)) writeFileSync(file, code, "utf8");

	const module = (await import(pathToFileURL(file).href)) as LoadedModule;
	cache.set(cacheKey, module);
	return module;
}

function sanitise(value: string): string {
	return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(-60);
}

/**
 * Load a config module by name, preferring the user's override.
 *
 * @param name module name without extension, e.g. `"siteConfig"`
 */
export async function loadConfigModule(
	paths: ResolvedShironesPaths,
	name: string,
	registryRef?: OverrideRegistryRef,
): Promise<LoadedModule> {
	const entry =
		probeFile(join(paths.configDir, name)) ??
		probeFile(join(paths.packageSrc, "config", name));

	if (!entry) {
		throw new Error(
			`[shirones] Could not find config module "${name}".\n` +
				`  Looked in: ${paths.configDir}\n` +
				`         and: ${join(paths.packageSrc, "config")}\n` +
				"  Run `npx shirones init` to scaffold the default configuration.",
		);
	}
	return loadModuleFile(paths, entry, `config:${name}`, registryRef);
}

/** Load a module that ships with the package (never user-provided). */
export async function loadPackageModule(
	paths: ResolvedShironesPaths,
	relativePath: string,
): Promise<LoadedModule> {
	const entry = probeFile(join(paths.packageSrc, relativePath));
	if (!entry) {
		throw new Error(`[shirones] Package module not found: src/${relativePath}`);
	}
	return loadModuleFile(paths, entry, `pkg:${relativePath}`);
}

/** Convenience helper returning a single named export. */
export async function loadConfigValue<T>(
	paths: ResolvedShironesPaths,
	moduleName: string,
	exportName: string,
): Promise<T> {
	const module = await loadConfigModule(paths, moduleName);
	if (!(exportName in module)) {
		throw new Error(
			`[shirones] Config module "${moduleName}" does not export "${exportName}".`,
		);
	}
	return module[exportName] as T;
}

/** Clear the in-process cache (used by the dev server when config changes). */
export function invalidateConfigCache(): void {
	cache.clear();
}
