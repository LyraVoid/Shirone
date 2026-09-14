import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import svelte from "@astrojs/svelte";
import { pluginCollapsibleSections } from "@expressive-code/plugin-collapsible-sections";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import swup from "@swup/astro";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, fontProviders } from "astro/config";
import expressiveCode from "astro-expressive-code";
import icon from "astro-icon";
import { expressiveCodeConfig } from "./src/config/expressiveCodeConfig.ts";
import { resolvedFontOptions } from "./src/config/fontConfig.ts";
import {
	IMAGE_ENDPOINT_ROUTE,
	MUSIC_SIDEBAR_VIRTUAL_ID,
	TRAILING_SLASH,
	expressiveCodeShared,
	iconInclude,
	isMusicBundleFile,
	mdxOptions,
	prebundleSpecifiers,
	svelteCompilerOptions,
	swupForwardOptions,
	swupOptions,
	viteBuildShared,
} from "./src/config/integrationsConfig.ts";
import { musicConfig, resolveMusicOptions } from "./src/config/musicConfig.ts";
import {
	rainyDayConfig,
	resolveRainyDayOptions,
} from "./src/config/rainyDayConfig.ts";
import { sidebarConfig } from "./src/config/sidebarConfig.ts";
import { siteConfig } from "./src/config/siteConfig.ts";
import { resolveUmamiOptions, umamiConfig } from "./src/config/umamiConfig.ts";
import { pluginCustomCopyButton } from "./src/plugins/expressive-code/custom-copy-button.js";
import { pluginLanguageBadge } from "./src/plugins/expressive-code/language-badge.ts";
import { getLocalFontVariants } from "./src/utils/font-options.ts";
import { siteMarkdownProcessor } from "./src/utils/markdown-processor.mjs";
import { isSitemapPageAllowed } from "./src/config/sitemapFilter.ts";

const musicWidgetEnabled =
	sidebarConfig.enable &&
	sidebarConfig.components.some(
		(widget) => widget.type === "music" && widget.enable,
	);
const musicFeatureEnabled =
	resolveMusicOptions(musicConfig) !== null && musicWidgetEnabled;

const resolvedUmamiOptions = resolveUmamiOptions(umamiConfig);
const umamiIntegration = resolvedUmamiOptions
	? (await import("oddmisc/astro")).oddmisc({
				umami: {
					shareUrl: resolvedUmamiOptions.shareUrl,
				},
			})
	: null;
const resolvedMusicSidebarModuleId = `\0${MUSIC_SIDEBAR_VIRTUAL_ID}`;

// 全页雨幕（原 Banner 雨滴特效）：关闭时同样用虚拟模块 + 残留 chunk 清理，
// 保证组件、特效库（含 Three.js）与样式都不进产物。
const rainyDayFeatureEnabled = resolveRainyDayOptions(rainyDayConfig).enable;
const rainyWindowModuleId = "virtual:shirone-rainy-window";
const resolvedRainyWindowModuleId = `\0${rainyWindowModuleId}`;

const optionalRainyWindowPlugin = {
	name: "shirone-optional-rainy-window",
	enforce: "pre",
	resolveId(source) {
		return source === rainyWindowModuleId ? resolvedRainyWindowModuleId : null;
	},
	load(id) {
		if (id !== resolvedRainyWindowModuleId) return null;
		return rainyDayFeatureEnabled
			? 'export { default } from "/src/components/organisms/RainyWindowLayer.astro";'
			: "export default null;";
	},
	generateBundle(_options, bundle) {
		if (rainyDayFeatureEnabled) return;
		for (const fileName of Object.keys(bundle)) {
			if (
				fileName.includes("RainyWindowLayer") ||
				fileName.startsWith("_astro/rainy") ||
				fileName.includes("/rainy.")
			) {
				delete bundle[fileName];
			}
		}
	},
};

// The package-mode twin of this plugin is createMusicSidebarPlugin() in
// src/integration/index.ts. The two differ only in where the sidebar file
// lives; the virtual id and the bundle-pruning rule are shared.

const optionalMusicSidebarPlugin = {
	name: "shirone-optional-music-sidebar",
	enforce: "pre",
	resolveId(source) {
		return source === MUSIC_SIDEBAR_VIRTUAL_ID
			? resolvedMusicSidebarModuleId
			: null;
	},
	load(id) {
		if (id !== resolvedMusicSidebarModuleId) return null;
		return musicFeatureEnabled
			? 'export { default } from "/src/components/organisms/music/MusicSidebar.astro";'
			: "export default null;";
	},
	generateBundle(_options, bundle) {
		if (!musicFeatureEnabled) {
			for (const fileName of Object.keys(bundle)) {
				if (isMusicBundleFile(fileName)) {
					delete bundle[fileName];
				}
			}
		}
	},
};

const isBuildCommand = process.argv.includes("build");
const isDevCommand = process.argv.includes("dev");
const iconifyOfflineIconPath = fileURLToPath(
	new URL("./node_modules/@iconify/svelte/dist/OfflineIcon.svelte", import.meta.url),
);
const iconifyOfflineFunctionsPath = fileURLToPath(
	new URL("./node_modules/@iconify/svelte/dist/offline-functions.js", import.meta.url),
);

function resolveVariantSrc(file) {
	if (isBuildCommand && resolvedFontOptions.subsetting?.enable) {
		const ext = extname(file);
		const baseName = basename(file, ext);
		const subsetPath = `src/assets/fonts/.subset/${baseName}.subset.woff2`;
		if (existsSync(subsetPath)) {
			return `./${subsetPath}`;
		}
		throw new Error(
			`[font-system] Missing required subset font: ${subsetPath}. ` +
				"Font subsetting is enabled for production builds, but the subset file was not found. " +
				"Ensure 'pnpm.cmd fonts:subset' ran successfully before building.",
		);
	}
	return `./${file}`;
}

const configuredFonts =
	resolvedFontOptions.mode === "custom"
		? ["body", "cjk", "mono"].flatMap((role) => {
				const resolvedRole = resolvedFontOptions.roles[role];
				if (!resolvedRole.family) return [];

				const isCompositeSans = role === "body" || role === "cjk";
				const fallbackOpts = isCompositeSans
					? { fallbacks: [], optimizedFallbacks: false }
					: {};

				const localVariants = getLocalFontVariants(resolvedFontOptions, role);
				if (localVariants.length > 0) {
					return [
						{
							provider: fontProviders.local(),
							name: resolvedRole.family,
							cssVariable: resolvedRole.cssVariable,
							options: {
								variants: localVariants.map((variant) => ({
									src: [resolveVariantSrc(variant.file)],
									weight: variant.weight,
									style: variant.style,
									display: resolvedRole.display,
									...(variant.subset ? { subset: variant.subset } : {}),
									...(variant.unicodeRange
										? { unicodeRange: variant.unicodeRange }
										: {}),
								})),
							},
							...fallbackOpts,
						},
					];
				}

				const fontsourceVariants = resolvedRole.variants.filter(
					(v) => v.source === "fontsource",
				);
				if (fontsourceVariants.length > 0) {
					return [
						{
							provider: fontProviders.fontsource(),
							name: resolvedRole.family,
							cssVariable: resolvedRole.cssVariable,
							...fallbackOpts,
						},
					];
				}

				return [];
			})
		: [];

// https://astro.build/config
export default defineConfig({
	site: siteConfig.site,
	base: siteConfig.base ?? "/",
	// Paired with IMAGE_ENDPOINT_ROUTE in the integration; see the comment on
	// TRAILING_SLASH in src/config/integrationsConfig.ts.
	trailingSlash: TRAILING_SLASH,
	// Hand-supplied rather than left to Astro's relative transform: that
	// transform runs during resolveConfig, before this file's trailingSlash is
	// visible to the package-mode integration. Setting it here too makes the
	// two modes agree. See IMAGE_ENDPOINT_ROUTE for the full story.
	image: { endpoint: { route: IMAGE_ENDPOINT_ROUTE } },
	fonts: configuredFonts,
	integrations: [
		...(umamiIntegration ? [umamiIntegration] : []),
		swup({ ...swupOptions, ...swupForwardOptions }),
		icon({ include: iconInclude }),
		expressiveCode({
			// `themes` stays here: it reads expressiveCodeConfig, which the
			// package mode loads through loadConfigModule() instead.
			themes: [
				expressiveCodeConfig.lightTheme ?? expressiveCodeConfig.theme,
				expressiveCodeConfig.darkTheme ?? expressiveCodeConfig.theme,
			],
			// `plugins` stays here: the package mode has to load them through
			// loadPackageModule() so a user's overrides apply.
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				pluginLanguageBadge(),
				pluginCustomCopyButton(),
			],
			...expressiveCodeShared,
		}),
		// `preprocess` is not shared: it comes from this repo's svelte.config.js
		// here, and the package mode has to pass it explicitly because a user's
		// project has no such file.
		svelte({ compilerOptions: svelteCompilerOptions(isDevCommand) }),
		sitemap({
			filter: (page) => isSitemapPageAllowed(page),
		}),
		mdx(mdxOptions),
	],
	markdown: {
		processor: siteMarkdownProcessor,
	},
	vite: {
		resolve: {
			alias: [
				{
					find: "@shirone/iconify-offline",
					replacement: iconifyOfflineIconPath,
				},
				{
					find: "@shirone/iconify-offline-functions",
					replacement: iconifyOfflineFunctionsPath,
				},
				{
					find: /^@iconify\/svelte$/,
					replacement: fileURLToPath(
						new URL(
							"./src/components/atoms/display/Icon.svelte",
							import.meta.url,
						),
					),
				},
			],
		},
		plugins: [
			optionalMusicSidebarPlugin,
			optionalRainyWindowPlugin,
			tailwindcss(),
		],
		optimizeDeps: {
			// Source mode lists these unconditionally: they are installed at the
			// repo root, so Vite can resolve them from here. Package mode filters
			// the same list through prebundleCandidates() instead.
			include: prebundleSpecifiers,
		},
		build: {
			...viteBuildShared,
			// Source-mode only. Dropping console.log/debugger here would also
			// strip them from a user's own code, so the package build does not
			// inherit this. See docs/plans/single-source-config.md (Q3).
			esbuild: isBuildCommand
				? {
						drop: ["debugger"],
						pure: ["console.log", "console.debug"],
					}
				: undefined,
		},
	},
});
