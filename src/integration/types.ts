/**
 * Public option types for the Shirone Astro integration (npm package mode).
 *
 * These types are re-exported from the package root so users get full
 * IntelliSense inside `astro.config.mjs`:
 *
 * ```ts
 * import shirones from "shirones";
 * export default defineConfig({ integrations: [shirones({ ... })] });
 * ```
 */

/** Where user-authored content and configuration live, relative to the project root. */
export interface ShironesPaths {
	/**
	 * Root directory holding user config + content.
	 * @default "shirones"
	 */
	root?: string;
	/**
	 * Config directory, relative to the project root.
	 * @default "<root>/config"
	 */
	config?: string;
	/**
	 * Data modules directory (friends / projects / skills / ...), relative to project root.
	 * @default "<root>/config/data"
	 */
	data?: string;
	/**
	 * Content directory holding `posts/`, `moments/`, `spec/`.
	 * @default "<root>/content"
	 */
	content?: string;
}

export interface ShironesFontOptions {
	/**
	 * Run the build-time font subsetting pipeline. When enabled, subset
	 * `.woff2` files are emitted into `<root>/.shirones/fonts/`.
	 *
	 * Defaults to `command === "build"`, so `astro dev` serves the full font
	 * files and only `astro build` pays for the charset scan and the
	 * `subset-font` run. This is *combined* with
	 * `fontConfig.subsetting.enable`, not a fallback for it: both must hold, so
	 * setting `enable: true` on its own still leaves dev unsubsetted.
	 */
	subset?: boolean;
	/**
	 * Extra characters to always keep in the subset (e.g. glyphs only produced
	 * at runtime by client-side scripts).
	 */
	extraCharacters?: string;
}

export interface ShironesOptions {
	/** Directory layout overrides. */
	paths?: ShironesPaths;

	/**
	 * Component override map. Keys are package-relative component paths without
	 * extension (e.g. `"atoms/blog/PostCard"`), values are project-relative paths.
	 *
	 * Anything placed in `src/components/**` or `src/layouts/**` of the user's
	 * project that mirrors the package structure is picked up automatically,
	 * so this map is only needed for non-mirrored locations.
	 */
	components?: Record<string, string>;

	/** Font pipeline tuning. */
	fonts?: ShironesFontOptions;

	/**
	 * Generate the Pagefind search index after `astro build`.
	 * @default true
	 */
	pagefind?: boolean;

	/**
	 * Register the bundled Astro integrations (svelte, mdx, sitemap, swup,
	 * astro-icon, expressive-code). Disable only if you register them yourself.
	 * @default true
	 */
	bundledIntegrations?: boolean;

	/**
	 * Inject the theme's page routes. Disable to supply your own `src/pages/`.
	 * @default true
	 */
	injectRoutes?: boolean;

	/**
	 * Route patterns to skip when injecting, e.g. `["/anime", "/devices"]`.
	 * Useful to drop pages whose data you do not maintain.
	 */
	excludeRoutes?: string[];
}

export interface ResolvedShironesPaths {
	/** Absolute path to the user's project root. */
	projectRoot: string;
	/** Absolute path to the installed package root (or repo root in source mode). */
	packageRoot: string;
	/** Absolute path to the package `src/` directory. */
	packageSrc: string;
	/** Absolute path to the user's config directory. */
	configDir: string;
	/** Absolute path to the user's data directory. */
	dataDir: string;
	/** Absolute path to the user's content directory. */
	contentDir: string;
	/** Absolute path to the package-managed cache dir (`<root>/.shirones`). */
	cacheDir: string;
	/**
	 * True when the integration runs from the theme's own repository checkout
	 * (the `git clone` workflow). The repo build then relies on the integration
	 * for everything `astro.config.mjs` used to spell out.
	 *
	 * False means the theme is being consumed as a dependency — whether it was
	 * installed from npm or linked from a neighbouring checkout — and therefore
	 * owns route injection, expects a scaffolded `shirones/config`, and cannot
	 * assume its own `node_modules` is visible from the project root.
	 */
	isThemeRepo: boolean;
}
