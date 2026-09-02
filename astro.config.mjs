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
import { musicConfig, resolveMusicOptions } from "./src/config/musicConfig.ts";
import { sidebarConfig } from "./src/config/sidebarConfig.ts";
import { siteConfig } from "./src/config/siteConfig.ts";
import { resolveUmamiOptions, umamiConfig } from "./src/config/umamiConfig.ts";
import { pluginCustomCopyButton } from "./src/plugins/expressive-code/custom-copy-button.js";
import { pluginLanguageBadge } from "./src/plugins/expressive-code/language-badge.ts";
import { resolveRuntimeMode } from "./src/utils/backend-client.mjs";
import { getLocalFontVariants } from "./src/utils/font-options.ts";
import { siteMarkdownProcessor } from "./src/utils/markdown-processor.mjs";

const runtime = resolveRuntimeMode(process.env);
const serverAdapter =
	runtime.mode === "dynamic"
		? (await import("@astrojs/node")).default({ mode: "standalone" })
		: undefined;

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
const musicSidebarModuleId = "virtual:shirone-music-sidebar";
const resolvedMusicSidebarModuleId = `\0${musicSidebarModuleId}`;

const optionalMusicSidebarPlugin = {
	name: "shirone-optional-music-sidebar",
	enforce: "pre",
	resolveId(source) {
		return source === musicSidebarModuleId
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
				if (
					fileName.includes("MusicSidebarClient") ||
					fileName.startsWith("_astro/music.") ||
					fileName.includes("/music.")
				) {
					delete bundle[fileName];
				}
			}
		}
	},
};

const isBuildCommand = process.argv.includes("build");
const isDevCommand = process.argv.includes("dev");
const iconifyOfflineIconPath = fileURLToPath(
	new URL(
		"./node_modules/@iconify/svelte/dist/OfflineIcon.svelte",
		import.meta.url,
	),
);
const iconifyOfflineFunctionsPath = fileURLToPath(
	new URL(
		"./node_modules/@iconify/svelte/dist/offline-functions.js",
		import.meta.url,
	),
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
	output: runtime.mode === "dynamic" ? "server" : "static",
	...(serverAdapter ? { adapter: serverAdapter } : {}),
	site: siteConfig.site,
	base: siteConfig.base ?? "/",
	trailingSlash: "always",
	fonts: configuredFonts,
	integrations: [
		...(umamiIntegration ? [umamiIntegration] : []),
		swup({
			theme: false,
			ignore: 'a[href="#"]',
			animationClass: "transition-swup-",
			containers: ["main", "#toc"],
			smoothScrolling: true,
			cache: true,
			preload: true,
			accessibility: true,
			updateHead: {
				awaitAssets: false,
				// Keep base styles across Swup visits, but let syntax-scoped styles
				// disappear when the destination page no longer declares them.
				persistTags:
					"link[rel=stylesheet]:not([data-swup-optional]), style:not([data-swup-optional])",
			},
			updateBodyClass: false,
			globalInstance: true,
			animateHistoryBrowsing: false,
			skipPopStateHandling: (event) => Boolean(event.state?.url?.includes("#")),
		}),
		icon({
			include: {
				"preprocess: vitePreprocess(),": ["*"],
				"fa6-brands": ["*"],
				"fa6-regular": ["*"],
				"fa6-solid": ["*"],
			},
		}),
		expressiveCode({
			themes: [
				expressiveCodeConfig.lightTheme ?? expressiveCodeConfig.theme,
				expressiveCodeConfig.darkTheme ?? expressiveCodeConfig.theme,
			],
			plugins: [
				pluginCollapsibleSections(),
				pluginLineNumbers(),
				pluginLanguageBadge(),
				pluginCustomCopyButton(),
			],
			defaultProps: {
				wrap: true,
				overridesByLang: {
					shellsession: {
						showLineNumbers: false,
					},
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
				textMarkers: {
					delHue: 0,
					insHue: 180,
					markHue: 250,
				},
			},
			frames: {
				showCopyToClipboardButton: false,
			},
		}),
		svelte({
			compilerOptions: {
				// CSS-source hashing keeps SSR and client scope hashes stable after moves.
				cssHash: ({ css, hash }) => `svelte-${hash(css)}`,
				// Keep repeated Svelte compiler diagnostics out of the dev terminal;
				// check/build still surface the full warning set in CI.
				warningFilter: () => !isDevCommand,
			},
		}),
		sitemap(),
		mdx({
			syntaxHighlight: false,
			optimize: true,
		}),
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
		plugins: [optionalMusicSidebarPlugin, tailwindcss()],
		optimizeDeps: {
			include: [
				"mermaid",
				"@panzoom/panzoom",
				"overlayscrollbars",
				"@fancyapps/ui",
			],
		},
		build: {
			minify: "esbuild",
			cssCodeSplit: true,
			cssMinify: "esbuild",
			chunkSizeWarningLimit: 1000,
			esbuild: isBuildCommand
				? {
						drop: ["debugger"],
						pure: ["console.log", "console.debug"],
					}
				: undefined,
			rollupOptions: {
				onwarn(warning, warn) {
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
