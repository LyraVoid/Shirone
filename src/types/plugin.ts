/**
 * Types for plugin scripts: the files a project drops into `shirones/scripts/`.
 *
 * ```ts
 * // shirones/scripts/reading-list.ts
 * import type { ShironesPlugin } from "@/types/plugin";
 *
 * export default {
 * 	name: "reading-list",
 * 	setup(api) {
 * 		api.routes.add({ pattern: "/reading", entrypoint: "src/reading.astro" });
 * 	},
 * } satisfies ShironesPlugin;
 * ```
 *
 * Self-contained on purpose: this file ships in the package as
 * `shirones/types/plugin`, where `src/integration/` does not exist.
 *
 * See `docs/plugin-scripts.md`.
 */

/**
 * A unified plugin (`remarkSomething`), or the `[plugin, ...options]` tuple
 * unified accepts in its place. Typed loosely so this file does not pull
 * `unified` into a project that never installed it.
 */
export type ShironesUnifiedPlugin =
	| ((...args: never[]) => unknown)
	| [(...args: never[]) => unknown, ...unknown[]];

/**
 * Where a remark plugin joins the theme's chain.
 *
 * Directive syntax is recognised while the document is parsed, so at both
 * positions `:::name`, `::name` and `:name[…]` are already nodes
 * (`containerDirective`, `leafDirective`, `textDirective`). The difference is
 * how much of the theme's own directive handling has run:
 *
 * - `"before-directive"`: none of it. Every directive is still a node,
 *   including the theme's embeds and a stray `:word` in running text.
 * - `"after-directive"` (default): the theme has turned stray `:word`s back
 *   into text and handled its embeds. What is left are the directives that
 *   will be rendered as components. Runs before the theme records which
 *   syntaxes a page uses.
 *
 * Both run after reading time and the excerpt are computed.
 */
export type ShironesRemarkAnchor = "before-directive" | "after-directive";

/**
 * Where a rehype plugin joins the theme's chain.
 *
 * - `"before-components"`: a directive is still an element named after itself
 *   (`::github` is `<github>`), not yet rendered.
 * - `"end"` (default): after every theme plugin, on the final HTML tree.
 */
export type ShironesRehypeAnchor = "before-components" | "end";

/**
 * Renders one directive. Receives the directive's attributes and its children
 * as hast nodes, and returns the hast node to put in its place: the contract of
 * `rehype-components`.
 */
export type ShironesDirectiveComponent = (
	properties: Record<string, unknown>,
	children: unknown[],
) => unknown;

/** A page route, in the shape Astro's `injectRoute` takes. */
export interface ShironesPluginRoute {
	/** Route pattern, e.g. `"/reading"` or `"/notes/[slug]"`. */
	pattern: string;
	/** The page file, absolute or relative to the project root. */
	entrypoint: string;
}

export interface ShironesPluginLogger {
	info(message: string): void;
	warn(message: string): void;
}

/** Absolute paths of the project the plugin runs in. */
export interface ShironesPluginPaths {
	/** The project root (where `astro.config.mjs` lives). */
	projectRoot: string;
	/** The configuration directory. */
	configDir: string;
	/** The data-module directory. */
	dataDir: string;
	/** The content directory (`posts/`, `moments/`, …). */
	contentDir: string;
	/** The directory this plugin was loaded from. */
	scriptsDir: string;
}

export interface ShironesBuildDoneContext {
	/** Absolute path of the build output directory. */
	dir: string;
	logger: ShironesPluginLogger;
}

export interface ShironesPluginApi {
	/** What Astro is doing: the plugin runs for every command. */
	readonly command: "dev" | "build" | "preview" | "sync";
	/**
	 * `true` when the theme is installed as a package, `false` inside the
	 * theme's own repository. Only `routes.remove` and `routes.replace` behave
	 * differently between the two.
	 */
	readonly packageMode: boolean;
	readonly paths: ShironesPluginPaths;
	readonly logger: ShironesPluginLogger;

	readonly markdown: {
		/** Add a remark plugin. */
		remark(
			plugin: ShironesUnifiedPlugin,
			options?: { at?: ShironesRemarkAnchor },
		): void;
		/** Add a rehype plugin. */
		rehype(
			plugin: ShironesUnifiedPlugin,
			options?: { at?: ShironesRehypeAnchor },
		): void;
		/**
		 * Render the directive `name` (`:::name`, `::name`, `:name[…]`) with
		 * `component`. Naming one of the theme's own directives replaces its
		 * renderer.
		 */
		directive(name: string, component: ShironesDirectiveComponent): void;
	};

	readonly routes: {
		/** Add a page. */
		add(route: ShironesPluginRoute): void;
		/**
		 * Drop one of the theme's pages. Package mode only: in the theme's own
		 * repository the pages are files under `src/pages/`, and this only
		 * warns.
		 */
		remove(pattern: string): void;
		/**
		 * Serve one of the theme's routes from another file. Package mode only,
		 * as for `remove`.
		 */
		replace(pattern: string, entrypoint: string): void;
	};

	readonly icons: {
		/**
		 * Also scan these files or directories for `prefix:name` icon
		 * references. Paths are absolute or relative to the project root.
		 */
		scan(...paths: string[]): void;
	};

	readonly fonts: {
		/** Keep these characters in the subset fonts. */
		keep(characters: string): void;
	};

	/**
	 * Run after `astro build` has written the site, before the search index is
	 * built. Handlers run in registration order, one at a time.
	 */
	onBuildDone(
		handler: (context: ShironesBuildDoneContext) => void | Promise<void>,
	): void;
}

/** What a plugin script exports by default. */
export interface ShironesPlugin {
	/** Shown in logs and errors. Defaults to the file name. */
	name?: string;
	/**
	 * Called once per Astro start, in the Astro process. Register everything
	 * here; do the work in the hooks.
	 */
	setup(api: ShironesPluginApi): void | Promise<void>;
}

/** A bare `setup` function is accepted in place of the object. */
export type ShironesPluginModule =
	| ShironesPlugin
	| ((api: ShironesPluginApi) => void | Promise<void>);
