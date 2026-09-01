import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AstroIntegration } from "astro";
import { shironesFallbackResolver } from "./fallback-resolver.ts";
import { buildFontDeclarations } from "./fonts.ts";
import {
	invalidateConfigCache,
	loadConfigModule,
	loadPackageModule,
} from "./load-config.ts";
import { shironesOverlay } from "./overlay.ts";
import { normalisePath, resolvePaths } from "./paths.ts";
import { buildOverrideRegistry, createOverlayTargets, type OverrideRegistryRef } from "./registry.ts";
import { collectRoutes, filterRoutes } from "./routes.ts";
import { shironesSsrNodeShims } from "./ssr-node-shims.ts";
import type { ResolvedShironesPaths, ShironesOptions } from "./types.ts";

export type {
	ShironesFontOptions,
	ShironesOptions,
	ShironesPaths,
} from "./types.ts";

// NOTE: `defineCollections` is deliberately *not* re-exported here. It imports
// `astro:content`, a virtual module that only exists inside Vite, so pulling it
// into this Node-side entry would break `astro.config.mjs` loading. Users import
// it from the dedicated `shirones/collections` entry point instead.

const MUSIC_VIRTUAL_ID = "virtual:shirone-music-sidebar";
const RESOLVED_MUSIC_VIRTUAL_ID = `\0${MUSIC_VIRTUAL_ID}`;

/**
 * Vite aliases mapping the theme's TypeScript path aliases onto the installed
 * package. Without these, every `@/...` import inside the injected pages would
 * resolve against the *user's* `src/`, which does not contain the theme.
 */
function createAliases(paths: ResolvedShironesPaths) {
	const src = paths.packageSrc;

	// `@iconify/svelte` ships `OfflineIcon.svelte`/`offline-functions.js` as
	// internal dist files that the source `astro.config.mjs` aliases through
	// `node_modules/@iconify/svelte/dist/*`. In package mode that directory
	// lives inside the theme's own dependency tree, so resolve it from here.
	// Resolve the `package.json` (exported via the `"./*": "./*"` catch-all)
	// rather than the dist files directly: the package's `exports` map exposes
	// `./dist/OfflineIcon.svelte` only under the `svelte`/`types` conditions,
	// which Node's `require.resolve` never matches, so resolving it would throw
	// "Package subpath is not defined by exports".
	const iconifyDist = join(
		dirname(
			createRequire(import.meta.url).resolve("@iconify/svelte/package.json"),
		),
		"dist",
	);

	return [
		{
			find: "@shirone/iconify-offline",
			replacement: join(iconifyDist, "OfflineIcon.svelte"),
		},
		{
			find: "@shirone/iconify-offline-functions",
			replacement: join(iconifyDist, "offline-functions.js"),
		},
		// `@iconify/svelte` is swapped for the theme's tree-shaken Icon component.
		{
			find: /^@iconify\/svelte$/,
			replacement: join(src, "components/atoms/display/Icon.svelte"),
		},
		{ find: /^@components\//, replacement: `${join(src, "components")}/` },
		{ find: /^@utils\//, replacement: `${join(src, "utils")}/` },
		{ find: /^@layouts\//, replacement: `${join(src, "layouts")}/` },
		{ find: /^@i18n\//, replacement: `${join(src, "i18n")}/` },
		{ find: /^@constants\//, replacement: `${join(src, "constants")}/` },
		{ find: /^@assets\//, replacement: `${join(src, "assets")}/` },
		// Keep `@/` last: it is the broadest pattern.
		{ find: /^@\//, replacement: `${src}/` },
	];
}

/**
 * Recreates the conditional music-sidebar module from the source template's
 * `astro.config.mjs`: when the music widget is disabled the whole client bundle
 * is dropped instead of shipping dead code.
 */
function createMusicSidebarPlugin(
	paths: ResolvedShironesPaths,
	enabled: boolean,
) {
	const sidebarPath = join(
		paths.packageSrc,
		"components/organisms/music/MusicSidebar.astro",
	);

	return {
		name: "shirones:optional-music-sidebar",
		enforce: "pre" as const,
		resolveId(source: string) {
			return source === MUSIC_VIRTUAL_ID ? RESOLVED_MUSIC_VIRTUAL_ID : null;
		},
		load(id: string) {
			if (id !== RESOLVED_MUSIC_VIRTUAL_ID) return null;
			return enabled
				? `export { default } from ${JSON.stringify(sidebarPath)};`
				: "export default null;";
		},
		generateBundle(_options: unknown, bundle: Record<string, unknown>) {
			if (enabled) return;
			for (const fileName of Object.keys(bundle)) {
				if (
					fileName.includes("MusicSidebarClient") ||
					fileName.startsWith("_astro/music.") ||
					fileName.includes("/music.")
				) {
					delete bundle[fileName];
				}
			}
		},
	};
}

/**
 * The Shirone theme, packaged as an Astro integration.
 *
 * ```js
 * // astro.config.mjs
 * import { defineConfig } from "astro/config";
 * import shirones from "shirones";
 *
 * export default defineConfig({
 *   integrations: [shirones()],
 * });
 * ```
 */
export function shirones(options: ShironesOptions = {}): AstroIntegration {
	let paths: ResolvedShironesPaths;
	// Mutable holder shared by config:setup (which builds the registry) and
	// server:setup (which rebuilds it when an override file changes in dev).
	const registryRef: OverrideRegistryRef = { overrides: new Map() };

	return {
		name: "shirones",
		hooks: {
			"astro:config:setup": async ({
				config,
				command,
				updateConfig,
				injectRoute,
				addWatchFile,
				logger,
			}) => {
				paths = resolvePaths(options, config.root, import.meta.url);

				logger.info(
					`${paths.isPluginMode ? "plugin" : "source"} mode | content: ${paths.contentDir}`,
				);

				// Scan the package + user project once and register every
				// override. Resolution becomes a table lookup; in dev the table
				// is rebuilt when an override file changes (see server:setup).
				const registry = buildOverrideRegistry(paths);
				registryRef.overrides = registry.overrides;
				{
					const total = Object.values(registry.counts).reduce(
						(sum, n) => sum + n,
						0,
					);
					if (total > 0) {
						logger.info(
							`[overrides] ${total} registered (${Object.entries(registry.counts)
								.map(([label, n]) => `${label}:${n}`)
								.join(", ")})`,
						);
					}
				}

				if (paths.isPluginMode && !existsSync(paths.configDir)) {
					logger.warn(
						`No configuration found at ${paths.configDir}. ` +
							"Run `npx shirones init` to scaffold it.",
					);
				}

				// ── 1. Load user configuration (Node side) ──────────────────────
				const siteModule = await loadConfigModule(paths, "siteConfig", registryRef);
				const siteConfig = siteModule.siteConfig as {
					site?: string;
					base?: string;
				};

				const sidebarModule = await loadConfigModule(paths, "sidebarConfig", registryRef);
				const sidebarConfig = sidebarModule.sidebarConfig as {
					enable?: boolean;
					components?: { type: string; enable: boolean }[];
				};

				const musicModule = await loadConfigModule(paths, "musicConfig", registryRef);
				const musicConfig = musicModule.musicConfig;
				const resolveMusicOptions = musicModule.resolveMusicOptions as (
					c: unknown,
				) => unknown;

				const umamiModule = await loadConfigModule(paths, "umamiConfig", registryRef);
				const umamiConfig = umamiModule.umamiConfig as { shareUrl: string };
				const resolveUmamiOptions = umamiModule.resolveUmamiOptions as (
					c: unknown,
				) => unknown;

				const musicWidgetEnabled = Boolean(
					sidebarConfig?.enable &&
						sidebarConfig.components?.some(
							(widget) => widget.type === "music" && widget.enable,
						),
				);
				const musicEnabled =
					musicWidgetEnabled && resolveMusicOptions(musicConfig) !== null;
				const umamiEnabled = resolveUmamiOptions(umamiConfig) !== null;

				// ── 2. Watch config files so the dev server restarts on edits ───
				if (command === "dev" && existsSync(paths.configDir)) {
					addWatchFile(pathToFileURL(paths.configDir));
				}

				// ── 3. Fonts ────────────────────────────────────────────────────
				const fonts = await buildFontDeclarations(
					paths,
					{
						subset: options.fonts?.subset ?? command === "build",
						extraCharacters: options.fonts?.extraCharacters ?? "",
					},
					{
						info: (m) => logger.info(`[fonts] ${m}`),
						warn: (m) => logger.warn(`[fonts] ${m}`),
					},
					registryRef,
				);

				// ── 4. Markdown processor ───────────────────────────────────────
				const markdownModule = await loadPackageModule(
					paths,
					"utils/markdown-processor.mjs",
				);
				const processor = markdownModule.siteMarkdownProcessor;

				// ── 5. Bundled integrations ─────────────────────────────────────
				const integrations =
					options.bundledIntegrations === false
						? []
						: await createBundledIntegrations(
								paths,
								command,
								{
									umamiConfig,
									umamiEnabled,
								},
								registryRef,
							);

				// ── 6. Push everything into the Astro config ────────────────────
				updateConfig({
					...(siteConfig?.site ? { site: siteConfig.site } : {}),
					base: siteConfig?.base ?? "/",
					trailingSlash: "always",
					fonts: fonts as never,
					integrations,
					markdown: { processor: processor as never },
					vite: {
						resolve: { alias: createAliases(paths) },
						plugins: [
							shironesOverlay({
								paths,
								components: options.components,
								registryRef,
							}),
							shironesFallbackResolver(paths),
							shironesSsrNodeShims(),
							createMusicSidebarPlugin(paths, musicEnabled),
							(await import("@tailwindcss/vite")).default(),
						],
						optimizeDeps: {
							// Only pre-bundle what the *user's* project can actually
							// resolve. Under pnpm's strict layout these are nested
							// inside the package, and listing an unresolvable id makes
							// Vite log a warning for every one of them on every build.
							include: prebundleCandidates(paths, [
								"mermaid",
								"@panzoom/panzoom",
								"overlayscrollbars",
								"@fancyapps/ui",
							]),
						},
						build: {
							minify: "esbuild",
							cssCodeSplit: true,
							cssMinify: "esbuild",
							chunkSizeWarningLimit: 1000,
							rollupOptions: {
								onwarn(
									warning: { message: string },
									warn: (warning: unknown) => void,
								) {
									// Astro legitimately mixes static and dynamic imports for
									// islands; silence that specific advisory.
									if (
										warning.message.includes("is dynamically imported by") &&
										warning.message.includes("but also statically imported by")
									) {
										return;
									}
									warn(warning);
								},
							},
						},
					},
				});

				// ── 7. Inject the theme's routes ────────────────────────────────
				if (paths.isPluginMode && options.injectRoutes !== false) {
					const routes = filterRoutes(
						collectRoutes(join(paths.packageSrc, "pages")),
						options.excludeRoutes,
					);
					for (const route of routes) {
						injectRoute({
							pattern: route.pattern,
							entrypoint: route.entrypoint,
						});
					}
					logger.info(`injected ${routes.length} routes`);
				}
			},

			"astro:server:setup": ({ server }) => {
				// Rebuild the override registry when an override file changes so
				// dev picks new/moved/removed overrides up immediately.
				const overrideDirs = createOverlayTargets(paths).map((t) =>
					normalisePath(t.userDir),
				);
				server.watcher.on("all", (_event, file) => {
					if (typeof file !== "string") return;
					// Editing a config file invalidates the Node-side bundle cache.
					if (file.startsWith(paths.configDir)) {
						invalidateConfigCache();
					}
					if (overrideDirs.some((dir) => file.startsWith(`${dir}/`))) {
						registryRef.overrides = buildOverrideRegistry(paths).overrides;
					}
				});
			},

			"astro:build:done": async ({ dir, logger }) => {
				if (options.pagefind === false) return;
				const outDir = dir.pathname;
				try {
					const pagefind = await import("pagefind");
					const { index } = await pagefind.createIndex({});
					if (!index) throw new Error("Pagefind failed to create an index");
					await index.addDirectory({ path: outDir });
					await index.writeFiles({ outputPath: join(outDir, "pagefind") });
					logger.info("pagefind index generated");
				} catch (error) {
					logger.warn(
						`skipped Pagefind indexing: ${(error as Error).message}. ` +
							"Set `pagefind: false` to silence this warning.",
					);
				}
			},
		},
	};
}

/**
 * Filter a list of bare specifiers down to those Node can resolve from the
 * user's project root.
 *
 * Vite resolves `optimizeDeps.include` relative to the project root. When the
 * theme is installed with pnpm, its own dependencies live under
 * `node_modules/.pnpm/...` and are invisible from there, so every unresolvable
 * entry produces a "Failed to resolve dependency" warning.
 */
function prebundleCandidates(
	paths: ResolvedShironesPaths,
	specifiers: string[],
): string[] {
	// Pre-bundling is a dev-server nicety. In package mode these libraries live
	// inside the theme's own `node_modules`, where Vite — which resolves
	// `optimizeDeps.include` from the *project* root — cannot see them, and it
	// warns once per entry on every cold start. Node's `require.resolve` is not
	// a reliable proxy for what Vite can reach, so simply skip the hint there.
	if (paths.isPluginMode) return [];
	return specifiers;
}

/**
 * Instantiate the integrations the theme depends on. Users get them for free so
 * a fresh project only needs `integrations: [shirones()]`.
 */
async function createBundledIntegrations(
	paths: ResolvedShironesPaths,
	command: string,
	options: { umamiConfig: { shareUrl: string }; umamiEnabled: boolean },
	registryRef?: { overrides: Map<string, string> },
) {
	const [
		{ default: swup },
		{ default: icon },
		{ default: expressiveCode },
		{ default: svelte, vitePreprocess },
		{ default: sitemap },
		{ default: mdx },
		{ pluginCollapsibleSections },
		{ pluginLineNumbers },
	] = await Promise.all([
		import("@swup/astro"),
		import("astro-icon"),
		import("astro-expressive-code"),
		import("@astrojs/svelte"),
		import("@astrojs/sitemap"),
		import("@astrojs/mdx"),
		import("@expressive-code/plugin-collapsible-sections"),
		import("@expressive-code/plugin-line-numbers"),
	]);
	const oddmiscIntegration = options.umamiEnabled
		? (await import("oddmisc/astro")).oddmisc({
				umami: {
					shareUrl: options.umamiConfig.shareUrl,
				},
			})
		: null;

	const ecModule = await loadConfigModule(paths, "expressiveCodeConfig", registryRef);
	const expressiveCodeConfig = ecModule.expressiveCodeConfig as {
		theme: string;
		lightTheme?: string;
		darkTheme?: string;
	};

	const badge = await loadPackageModule(
		paths,
		"plugins/expressive-code/language-badge.ts",
	);
	const copyButton = await loadPackageModule(
		paths,
		"plugins/expressive-code/custom-copy-button.js",
	);

	// Forward-compat options the source `astro.config.mjs` declares but that
	// `@swup/astro` 1.8.0's `Options` type does not know (and silently drops at
	// runtime). Spread them so the object-literal excess-property check passes
	// without deleting them from the mirror or changing runtime behaviour.
	const swupForwardOptions = {
		animateHistoryBrowsing: false,
		skipPopStateHandling: (event: { state?: { url?: string } }) =>
			Boolean(event.state?.url?.includes("#")),
	};

	return [
		...(oddmiscIntegration ? [oddmiscIntegration] : []),
		swup({
			theme: false,
			ignore: ['a[href="#"]'],
			animationClass: "transition-swup-",
			containers: ["main", "#toc"],
			smoothScrolling: true,
			cache: true,
			preload: true,
			accessibility: true,
			updateHead: {
				awaitAssets: false,
				persistTags: "link[rel=stylesheet], style",
			},
			updateBodyClass: false,
			globalInstance: true,
			...swupForwardOptions,
		}),
		icon({
			// Every collection the theme references. The upstream source config
			// carried a stray malformed key here and omitted material-symbols and
			// simple-icons, which only worked because astro-icon fell back to
			// auto-discovery in a flat node_modules.
			include: {
				"material-symbols": ["*"],
				"simple-icons": ["*"],
				"fa6-brands": ["*"],
				"fa6-regular": ["*"],
				"fa6-solid": ["*"],
			},
		}),
		expressiveCode({
			themes: [
				expressiveCodeConfig.lightTheme ?? expressiveCodeConfig.theme,
				expressiveCodeConfig.darkTheme ?? expressiveCodeConfig.theme,
			] as never,
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				(badge.pluginLanguageBadge as () => unknown)(),
				(copyButton.pluginCustomCopyButton as () => unknown)(),
			] as never,
			defaultProps: {
				wrap: true,
				overridesByLang: {
					shellsession: { showLineNumbers: false },
				},
			},
			styleOverrides: {
				codeBackground: "var(--codeblock-bg)",
				borderRadius: "0.75rem",
				borderColor: "none",
				codeFontSize: "0.875rem",
				codeFontFamily: "var(--m3e-font-mono-family)",
				codeLineHeight: "1.5rem",
				frames: {
					editorBackground: "var(--codeblock-bg)",
					terminalBackground: "var(--codeblock-bg)",
					terminalTitlebarBackground: "var(--codeblock-topbar-bg)",
					editorTabBarBackground: "var(--codeblock-topbar-bg)",
					editorActiveTabBackground: "none",
					editorActiveTabIndicatorBottomColor: "var(--primary)",
					editorActiveTabIndicatorTopColor: "none",
					editorTabBarBorderBottomColor: "var(--codeblock-topbar-bg)",
					terminalTitlebarBorderBottomColor: "none",
				},
				// Hue values are numbers at runtime (the source config passes the
				// same), but the published types only accept unresolved CSS strings.
				textMarkers: { delHue: 0, insHue: 180, markHue: 250 } as never,
			},
			frames: { showCopyToClipboardButton: false },
		}),
		svelte({
			// The theme's Svelte components use `<style lang="stylus">`, which
			// needs `vitePreprocess`. In source mode that comes from the repo's
			// `svelte.config.js`; a user's project has no such file, so the
			// integration supplies it.
			preprocess: [vitePreprocess({ script: true })],
			compilerOptions: {
				// CSS-source hashing keeps SSR and client scope hashes stable.
				cssHash: ({
					css,
					hash,
				}: {
					css: string;
					hash: (s: string) => string;
				}) => `svelte-${hash(css)}`,
				// Keep repeated Svelte compiler diagnostics out of the dev
				// terminal; check/build still surface the full warning set.
				warningFilter: () => command !== "dev",
			},
		}),
		sitemap(),
		mdx({ syntaxHighlight: false, optimize: true }),
	];
}

export default shirones;
