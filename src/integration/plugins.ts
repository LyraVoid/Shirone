/**
 * Plugin scripts: every file directly inside `shirones/scripts/` is loaded
 * when Astro starts and may extend the theme through a small API
 * (`src/types/plugin.ts`).
 *
 * The API covers what a project could not change before without forking:
 * the Markdown chain, the theme's injected routes, the icon scan, the font
 * subset and a step after the build. Everything else already has a door:
 * config modules and components are overridden by file, and Astro
 * integrations and Vite plugins go in `astro.config.mjs`.
 *
 * Scripts run in the Astro process only, never in the site's own code, so
 * they may import Node modules freely and nothing they import can reach a
 * browser bundle.
 *
 * See `docs/plugin-scripts.md`.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type {
	ShironesBuildDoneContext,
	ShironesPluginApi,
	ShironesPluginLogger,
	ShironesPluginModule,
	ShironesPluginRoute,
} from "../types/plugin.ts";
import {
	type MarkdownExtensions,
	NO_MARKDOWN_EXTENSIONS,
} from "../utils/markdown-extensions.mjs";
import { loadModuleFileFresh } from "./resolve/load-config.ts";
import type { OverrideRegistryRef } from "./resolve/registry.ts";
import type { ShironeRoute } from "./routes.ts";
import type { ResolvedShironesPaths } from "./types.ts";

const SCRIPT_EXTENSIONS: ReadonlySet<string> = new Set([
	".ts",
	".mts",
	".js",
	".mjs",
]);

const REMARK_ANCHORS: readonly string[] = [
	"before-directive",
	"after-directive",
];
const REHYPE_ANCHORS: readonly string[] = ["before-components", "end"];

/** A directive becomes an element of the same name, so it must be one. */
const DIRECTIVE_NAME = /^[a-z][a-z0-9-]*$/;

type BuildDoneHandler = (
	context: ShironesBuildDoneContext,
) => void | Promise<void>;

/** A plugin as loaded from disk, before its `setup` has run. */
export interface LoadedPlugin {
	/** `plugin.name`, or the file name without its extension. */
	name: string;
	/** Absolute path of the script. */
	file: string;
	/** Digest of the script and everything it imports. */
	digest: string;
	setup: (api: ShironesPluginApi) => void | Promise<void>;
}

/** Everything the plugins registered, for the integration to apply. */
export interface PluginContributions {
	/** Plugin names, in load order. */
	names: string[];
	markdown: MarkdownExtensions;
	routes: {
		/** Routes to add, entrypoints absolute. */
		added: (ShironesPluginRoute & { plugin: string })[];
		/** Pattern to the plugin that removes it. */
		removed: Map<string, string>;
		/** Pattern to its new entrypoint (absolute). */
		replaced: Map<string, { entrypoint: string; plugin: string }>;
	};
	/** Extra files or directories for the icon scan, absolute. */
	iconSources: string[];
	/** Characters to keep in the subset fonts. */
	fontCharacters: string;
	buildDone: { plugin: string; handler: BuildDoneHandler }[];
}

export function emptyContributions(): PluginContributions {
	return {
		names: [],
		markdown: NO_MARKDOWN_EXTENSIONS,
		routes: { added: [], removed: new Map(), replaced: new Map() },
		iconSources: [],
		fontCharacters: "",
		buildDone: [],
	};
}

/**
 * The scripts in `scriptsDir`, sorted by name: that order is the load order.
 *
 * Only files directly inside the directory count. Sub-directories, and files
 * whose name starts with `_` or `.`, are left alone, so a script can keep its
 * helpers next to it without each helper being loaded as a plugin.
 */
export function findPluginScripts(scriptsDir: string): string[] {
	if (!existsSync(scriptsDir)) return [];
	return readdirSync(scriptsDir, { withFileTypes: true })
		.filter(
			(entry) =>
				entry.isFile() &&
				!entry.name.startsWith("_") &&
				!entry.name.startsWith(".") &&
				!/\.d\.m?ts$/.test(entry.name) &&
				SCRIPT_EXTENSIONS.has(extname(entry.name)),
		)
		.map((entry) => entry.name)
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
		.map((name) => join(scriptsDir, name));
}

/** Read a script's default export as a plugin. */
export function toLoadedPlugin(
	file: string,
	exported: unknown,
	digest: string,
): LoadedPlugin {
	const module = exported as ShironesPluginModule | undefined;
	const fallbackName = basename(file, extname(file));
	if (typeof module === "function") {
		return { name: fallbackName, file, digest, setup: module };
	}
	if (
		module &&
		typeof module === "object" &&
		typeof module.setup === "function"
	) {
		const name =
			typeof module.name === "string" && module.name.trim() !== ""
				? module.name.trim()
				: fallbackName;
		return { name, file, digest, setup: (api) => module.setup(api) };
	}
	throw new Error(
		`[shirones] ${file} is not a plugin: its default export must be ` +
			"`{ name, setup(api) }` or a `setup(api)` function. " +
			"A helper module belongs in a sub-directory, or in a file whose name starts with `_`.",
	);
}

/** Bundle and import every script in `paths.scriptsDir`. */
export async function loadPluginScripts(
	paths: ResolvedShironesPaths,
	registryRef?: OverrideRegistryRef,
): Promise<LoadedPlugin[]> {
	const plugins: LoadedPlugin[] = [];
	for (const file of findPluginScripts(paths.scriptsDir)) {
		const { module, digest } = await loadModuleFileFresh(
			paths,
			file,
			`plugin:${basename(file)}`,
			registryRef,
		);
		plugins.push(toLoadedPlugin(file, module.default, digest));
	}
	return plugins;
}

/** `reading` and `/reading/` both mean `/reading`. */
export function normaliseRoutePattern(pattern: string): string {
	const withSlash = pattern.startsWith("/") ? pattern : `/${pattern}`;
	return withSlash === "/" ? "/" : withSlash.replace(/\/+$/, "");
}

export interface RunPluginsContext {
	paths: ResolvedShironesPaths;
	command: ShironesPluginApi["command"];
	logger: ShironesPluginLogger;
}

/**
 * Run each plugin's `setup` and collect what it registered.
 *
 * A plugin that throws, or passes something unusable, fails the start: it is
 * code the project owner wrote on purpose, so running on without it would
 * build a site that silently lacks what they asked for.
 */
export async function runPlugins(
	plugins: LoadedPlugin[],
	context: RunPluginsContext,
): Promise<PluginContributions> {
	const { paths, command, logger } = context;
	const contributions = emptyContributions();
	const remark: MarkdownExtensions["remark"] = [];
	const rehype: MarkdownExtensions["rehype"] = [];
	const directives: MarkdownExtensions["directives"] = {};
	const directiveOwner = new Map<string, string>();

	const seen = new Map<string, string>();
	for (const plugin of plugins) {
		const earlier = seen.get(plugin.name);
		if (earlier) {
			throw new Error(
				`[shirones] two plugins are named "${plugin.name}": ${earlier} and ${plugin.file}`,
			);
		}
		seen.set(plugin.name, plugin.file);
	}

	for (const plugin of plugins) {
		const fail = (message: string): never => {
			throw new Error(
				`[shirones] plugin "${plugin.name}" (${plugin.file}): ${message}`,
			);
		};
		// Registrations are read when `setup` returns. One made later, from a
		// timer or an unawaited promise, would be dropped without a trace.
		let open = true;
		const register = (method: string): void => {
			if (!open) {
				fail(
					`${method} was called after setup() had returned; await the work inside setup()`,
				);
			}
		};
		const fromRoot = (path: unknown, method: string): string => {
			if (typeof path !== "string" || path === "") {
				return fail(`${method} needs a path, got ${kindOf(path)}`);
			}
			return resolve(paths.projectRoot, path);
		};
		const existing = (path: unknown, method: string): string => {
			const absolute = fromRoot(path, method);
			if (!existsSync(absolute)) {
				fail(`${method} points at ${absolute}, which does not exist`);
			}
			return absolute;
		};
		const patternOf = (pattern: unknown, method: string): string => {
			if (typeof pattern !== "string" || pattern.trim() === "") {
				return fail(`${method} needs a route pattern, got ${kindOf(pattern)}`);
			}
			return normaliseRoutePattern(pattern.trim());
		};
		const unifiedPlugin = (candidate: unknown, method: string): unknown => {
			const first = Array.isArray(candidate) ? candidate[0] : candidate;
			if (typeof first !== "function") {
				fail(
					`${method} needs a unified plugin or a [plugin, options] tuple, got ${kindOf(candidate)}`,
				);
			}
			return candidate;
		};
		const anchorOf = <T extends string>(
			options: { at?: string } | undefined,
			anchors: readonly string[],
			fallback: T,
			method: string,
		): T => {
			const at = options?.at ?? fallback;
			if (!anchors.includes(at)) {
				fail(
					`${method} does not know the position "${at}"; use ${anchors.map((a) => `"${a}"`).join(" or ")}`,
				);
			}
			return at as T;
		};

		const api: ShironesPluginApi = {
			command,
			packageMode: !paths.isThemeRepo,
			paths: {
				projectRoot: paths.projectRoot,
				configDir: paths.configDir,
				dataDir: paths.dataDir,
				contentDir: paths.contentDir,
				scriptsDir: paths.scriptsDir,
			},
			logger: {
				info: (message) => logger.info(`[${plugin.name}] ${message}`),
				warn: (message) => logger.warn(`[${plugin.name}] ${message}`),
			},
			markdown: {
				remark(candidate, options) {
					register("markdown.remark()");
					remark.push({
						plugin: unifiedPlugin(candidate, "markdown.remark()"),
						at: anchorOf<"before-directive" | "after-directive">(
							options,
							REMARK_ANCHORS,
							"after-directive",
							"markdown.remark()",
						),
					});
				},
				rehype(candidate, options) {
					register("markdown.rehype()");
					rehype.push({
						plugin: unifiedPlugin(candidate, "markdown.rehype()"),
						at: anchorOf<"before-components" | "end">(
							options,
							REHYPE_ANCHORS,
							"end",
							"markdown.rehype()",
						),
					});
				},
				directive(name, component) {
					register("markdown.directive()");
					if (typeof name !== "string" || !DIRECTIVE_NAME.test(name)) {
						fail(
							`markdown.directive() needs a name of lowercase letters, digits and hyphens, got ${kindOf(name)}`,
						);
					}
					if (typeof component !== "function") {
						fail(
							`markdown.directive("${name}") needs a function (properties, children) => node, got ${kindOf(component)}`,
						);
					}
					const owner = directiveOwner.get(name);
					if (owner && owner !== plugin.name) {
						logger.warn(
							`[plugins] "${plugin.name}" replaces the "${name}" directive registered by "${owner}"`,
						);
					}
					directiveOwner.set(name, plugin.name);
					directives[name] = component;
				},
			},
			routes: {
				add(route) {
					register("routes.add()");
					const pattern = patternOf(route?.pattern, "routes.add()");
					const entrypoint = existing(route?.entrypoint, "routes.add()");
					const earlier = contributions.routes.added.find(
						(added) => added.pattern === pattern,
					);
					if (earlier) {
						fail(
							`routes.add("${pattern}") repeats a route added by "${earlier.plugin}"`,
						);
					}
					contributions.routes.added.push({
						pattern,
						entrypoint,
						plugin: plugin.name,
					});
				},
				remove(pattern) {
					register("routes.remove()");
					contributions.routes.removed.set(
						patternOf(pattern, "routes.remove()"),
						plugin.name,
					);
				},
				replace(pattern, entrypoint) {
					register("routes.replace()");
					contributions.routes.replaced.set(
						patternOf(pattern, "routes.replace()"),
						{
							entrypoint: existing(entrypoint, "routes.replace()"),
							plugin: plugin.name,
						},
					);
				},
			},
			icons: {
				scan(...sources) {
					register("icons.scan()");
					for (const source of sources) {
						contributions.iconSources.push(existing(source, "icons.scan()"));
					}
				},
			},
			fonts: {
				keep(characters) {
					register("fonts.keep()");
					if (typeof characters !== "string") {
						fail(`fonts.keep() needs a string, got ${kindOf(characters)}`);
					}
					contributions.fontCharacters += characters;
				},
			},
			onBuildDone(handler) {
				register("onBuildDone()");
				if (typeof handler !== "function") {
					fail(`onBuildDone() needs a function, got ${kindOf(handler)}`);
				}
				contributions.buildDone.push({ plugin: plugin.name, handler });
			},
		};

		try {
			await plugin.setup(api);
		} catch (error) {
			if (error instanceof Error && error.message.startsWith("[shirones]")) {
				throw error;
			}
			throw new Error(
				`[shirones] plugin "${plugin.name}" (${plugin.file}) threw in setup(): ${
					error instanceof Error ? error.message : String(error)
				}`,
				{ cause: error },
			);
		} finally {
			open = false;
		}
		contributions.names.push(plugin.name);
	}

	if (
		remark.length > 0 ||
		rehype.length > 0 ||
		Object.keys(directives).length > 0
	) {
		contributions.markdown = {
			// Every script, not only the ones that registered: a helper two
			// scripts share may be what changed.
			digest: createHash("sha1")
				.update(
					plugins.map((plugin) => `${plugin.name}:${plugin.digest}`).join("\n"),
				)
				.digest("hex")
				.slice(0, 12),
			remark,
			rehype,
			directives,
		};
	}
	return contributions;
}

function kindOf(value: unknown): string {
	if (typeof value === "string") return JSON.stringify(value);
	if (value === null) return "null";
	return Array.isArray(value) ? "an array" : typeof value;
}

/**
 * The routes to inject: the theme's, minus `routes.remove`, with
 * `routes.replace` applied, plus `routes.add`.
 *
 * Asking to remove or replace a route the theme does not inject is a warning,
 * not an error: a theme upgrade can rename or drop a page, and that must not
 * break a build whose plugin only wanted the page gone anyway.
 *
 * @param themeRoutes the routes the theme would inject, or `null` when it
 *   injects none: in its own repository, where the pages are files under
 *   `src/pages/`, or with `injectRoutes: false`.
 * @param why what to tell the user when `themeRoutes` is `null`.
 */
export function resolveInjectedRoutes(
	themeRoutes: ShironeRoute[] | null,
	routes: PluginContributions["routes"],
	logger: ShironesPluginLogger,
	why = "the theme's pages are files under src/pages/ here; edit them directly",
): ShironesPluginRoute[] {
	const added = routes.added.map(({ pattern, entrypoint }) => ({
		pattern,
		entrypoint,
	}));

	if (themeRoutes === null) {
		for (const [pattern, plugin] of routes.removed) {
			logger.warn(
				`[plugins] "${plugin}": routes.remove("${pattern}") is ignored: ${why}`,
			);
		}
		for (const [pattern, { plugin }] of routes.replaced) {
			logger.warn(
				`[plugins] "${plugin}": routes.replace("${pattern}") is ignored: ${why}`,
			);
		}
		return added;
	}

	const known = new Set(themeRoutes.map((route) => route.pattern));
	for (const [pattern, plugin] of routes.removed) {
		if (!known.has(pattern)) {
			logger.warn(
				`[plugins] "${plugin}": routes.remove("${pattern}") matches no route the theme injects`,
			);
		}
	}
	for (const [pattern, { plugin }] of routes.replaced) {
		if (!known.has(pattern)) {
			logger.warn(
				`[plugins] "${plugin}": routes.replace("${pattern}") matches no route the theme injects; use routes.add() for a new page`,
			);
		}
	}

	const kept = themeRoutes
		.filter((route) => !routes.removed.has(route.pattern))
		.map((route) => ({
			pattern: route.pattern,
			entrypoint:
				routes.replaced.get(route.pattern)?.entrypoint ?? route.entrypoint,
		}));

	const keptPatterns = new Set(kept.map((route) => route.pattern));
	for (const route of routes.added) {
		if (keptPatterns.has(route.pattern)) {
			throw new Error(
				`[shirones] plugin "${route.plugin}": routes.add("${route.pattern}") collides with a route the theme injects; use routes.replace("${route.pattern}", …) instead`,
			);
		}
	}
	return [...kept, ...added];
}
