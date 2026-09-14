/**
 * 下列 import 全部是 `import type`,在编译期被完全擦除,不产生任何运行时依赖。
 * 用 `Parameters<typeof fn>[0]` 而不是写死类型名,是为了让这里的标注跟着各集成
 * 自己的声明走——它们升级改了选项形状时,这里会跟着报错,而不是悄悄失配。
 */

import type mdx from "@astrojs/mdx";
import type swup from "@swup/astro";
import type expressiveCode from "astro-expressive-code";
import type icon from "astro-icon";
import type { AstroUserConfig } from "astro";

/**
 * 两个 Astro 配置入口共享的集成选项。
 *
 * 主题有两份 Astro 配置，且互不引用：
 *
 * - **源码模式** —— 本仓的 `astro.config.mjs`，`defineConfig()` 直接读它；
 * - **包模式** —— `src/integration/index.ts` 的 `updateConfig()`，在
 *   `astro:config:setup` 阶段跑。用户项目的 `astro.config.mjs` 里只有
 *   `integrations: [shirones()]`，本仓的 `astro.config.mjs` 根本不参与。
 *
 * 所以包模式读不到本仓的 `astro.config.mjs`，源码模式也不会跑 integration。
 * 任何一边改了、另一边没跟上，都不会有任何检查报错——用户侧静默失效。本文件
 * 把两份声明里**本就该一致**的部分收敛成单一来源。
 *
 * **只放「选项值」和纯函数，不放接线（wiring）。** 下面这些东西天生分模式，
 * 不要往这里搬：
 *
 * - `vite.resolve.alias` —— 两侧根目录和依赖树不同，包模式还要把 `@/`、
 *   `@components/` 等映射到 `paths.packageSrc`；
 * - `svelte().preprocess` —— 源码模式靠本仓的 `svelte.config.js`，用户项目
 *   没有这个文件（pipeline 也不生成），必须由 integration 显式传；
 * - `vite.optimizeDeps.include` —— 包模式要先过 `prebundleCandidates()`，
 *   因为 Vite 从**项目**根解析这个列表，看不见主题自己的嵌套 node_modules；
 * - `vite.plugins` —— 包模式要 overlay / fallback-resolver / SSR shims；
 * - `expressiveCode()` 的 `themes` 和 `plugins` —— 包模式必须走
 *   `loadConfigModule()` / `loadPackageModule()`，用户的覆盖才生效；
 * - `fonts`、`markdown.processor`、`site`、`base` —— 取值方式两侧不同。
 *
 * 本文件不 import `../types/`、`../utils/` 等目录：模板拷贝时
 * `CONFIG_REWRITES` 不覆盖这些路径，一旦引用会让 `prepare-templates.mjs` 的
 * `assertNoEscapedImports` 直接失败。同理**不要走 `src/config/index.ts`
 * barrel**——barrel 不会拷进用户项目（`prepare-templates.mjs` 跳过
 * `index.ts`），两侧都必须按文件路径 import 本模块。
 */

/**
 * 全站尾斜杠策略。主题的页面和路由 pattern 全程假设 `"always"`，所以不提供
 * 配置项——暴露这个选择等于邀请用户配一个主题并不真正支持的组合。
 */
export const TRAILING_SLASH = "always";

/**
 * 图片端点路由。必须带尾斜杠，与 `TRAILING_SLASH` 配对。
 *
 * Astro 的 `image.endpoint.route` 只在 `core/config/schemas/relative.js` 的
 * zod transform 里被规范化一次，而那一步由 `validateConfig` 在 `resolveConfig`
 * 阶段调用。此时 `trailingSlash` 还是默认的 `"ignore"`，于是 route 定格为
 * `/_image`（无尾斜杠）。包模式随后才在 `astro:config:setup` 里把
 * `trailingSlash` 改成 `"always"`，而 `hooks.js` 之后只跑
 * `validateConfigRefined`——它**不含**这个 transform——route 再也不会被规范化。
 * 结果 URL 生成端吐 `/_image?…`，路由 pattern 却要求 `/_image/`，`astro dev`
 * 下每个图片请求都 404（build 和 preview 不受影响）。
 *
 * 这里直接把斜杠补上，等价于 transform 本该产出的结果。
 *
 * 源码模式不受影响：它的 `astro.config.mjs` 在 `defineConfig()` 里就设了
 * `trailingSlash: "always"`，transform 看到的就是最终值，会自己补斜杠；而且
 * 源码模式压根不跑 integration。
 *
 * ⚠️ 若 `TRAILING_SLASH` 改了，这里要跟着改：
 *    `"always"` → `"/_image/"`  |  `"never"` / `"ignore"` → `"/_image"`
 * 若 Astro 修复了顺序（在 config:setup 之后重跑 relative transform），这一行
 * 会变成冗余但无害，可以删除。跟踪：withastro/astro#11568、#10149。
 */
export const IMAGE_ENDPOINT_ROUTE = "/_image/";

/**
 * `@swup/astro` 的选项。
 *
 * `ignore` 用数组形式：`@swup/astro` 1.8.0 的类型声明是
 * `(string | RegExp)[] | ((url, …) => …)`（见其 `dist/index.d.ts`），裸字符串
 * 并不符合——运行时 `script.js` 恰好能处理，但本仓 `astro.config.mjs` 是无类型
 * JS 才没报错。统一成数组后两侧都是合法的。
 *
 * `persistTags` 必须带 `:not([data-swup-optional])`：`data-swup-optional` 是
 * 主题自己的页面发出的（`[...permalink].astro`、`about.astro`、
 * `posts/[...slug].astro`），语义是「这份样式只对当前页有意义」。不带这个
 * 选择器，语法高亮等按页注入的样式会在 Swup 切换后残留。包模式同样注入这些
 * 页面，所以两侧行为必须一致。
 */
export const swupOptions: NonNullable<Parameters<typeof swup>[0]> = {
	theme: false as const,
	ignore: ['a[href="#"]'],
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
};

/**
 * `@swup/astro` 1.8.0 的 `Options` 类型不认识、但主题确实要传的选项。该版本在
 * 运行时会静默丢弃它们。
 *
 * 必须和 `swupOptions` 分开：`swupOptions` 标注为 `Partial<Options>`，把这两个
 * 键写进去会直接报 ts(2353)。这个标注本身是有意义的——它是本文件里唯一能让
 * swup 选项拼写错误在编译期暴露出来的东西，不要为了让这里能合并而把它去掉。
 *
 * 等 `@swup/astro` 的类型补上这两个键之后，才可以把它们并回 `swupOptions`。
 */
export const swupForwardOptions = {
	animateHistoryBrowsing: false,
	skipPopStateHandling: (event: { state?: { url?: string } }) =>
		Boolean(event.state?.url?.includes("#")),
};

/**
 * `astro-icon` 要打包的图标集。
 *
 * 五个集合一个都不能少：`src/` 里共 340 处图标引用，其中 `material-symbols`
 * 占 308 处、`simple-icons` 占 21 处。源码模式此前漏了这两个，只靠 astro-icon
 * 在扁平 `node_modules` 下的自动发现兜住；包模式在 pnpm 严格布局下没有这个
 * 退路，必须显式声明。
 */
export const iconInclude: NonNullable<
	NonNullable<Parameters<typeof icon>[0]>["include"]
> = {
	"material-symbols": ["*"],
	"simple-icons": ["*"],
	"fa6-brands": ["*"],
	"fa6-regular": ["*"],
	"fa6-solid": ["*"],
};

/**
 * `astro-expressive-code` 中与「取值方式」无关的那部分选项。
 *
 * `themes` 不在这里：两侧拿 `expressiveCodeConfig` 的途径不同（源码模式直接
 * import，包模式走 `loadConfigModule()` 让用户的覆盖生效）。`plugins` 也不在：
 * 包模式必须走 `loadPackageModule()`。
 */
export const expressiveCodeShared: Omit<
	NonNullable<Parameters<typeof expressiveCode>[0]>,
	"themes" | "plugins"
> = {
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
		// Hue values are numbers at runtime — the source config has always
		// passed numbers — but the published types only accept unresolved CSS
		// strings. Cast here rather than at the use sites so both modes stay
		// type-checked everywhere else.
		textMarkers: { delHue: 0, insHue: 180, markHue: 250 } as never,
	},
	frames: {
		showCopyToClipboardButton: false,
	},
};

/**
 * `@astrojs/svelte` 的 `compilerOptions`。
 *
 * `preprocess` 不在这里，见文件头对 wiring 的说明。
 *
 * @param isDev 是否 dev 命令。源码模式从 `process.argv` 判断，包模式从
 *   `astro:config:setup` 的 `command` 参数判断，两侧取值方式不同，所以由调用方
 *   传进来。
 */
export function svelteCompilerOptions(isDev: boolean) {
	return {
		// CSS-source hashing keeps SSR and client scope hashes stable after moves.
		cssHash: ({ css, hash }: { css: string; hash: (s: string) => string }) =>
			`svelte-${hash(css)}`,
		// Keep repeated Svelte compiler diagnostics out of the dev terminal;
		// check/build still surface the full warning set in CI.
		warningFilter: () => !isDev,
	};
}

/** `@astrojs/mdx` 的选项。 */
export const mdxOptions: NonNullable<Parameters<typeof mdx>[0]> = {
	syntaxHighlight: false as const,
	optimize: true,
};

/**
 * 两侧共用的 `vite.build` 选项。
 *
 * 不含 `esbuild`（`drop` / `pure`）：那是源码模式独有的构建期优化，会连带剥掉
 * 用户自己代码里的 `console.log`，属于需要单独决策的行为差异，见
 * `shirones` 仓的 `docs/plans/single-source-config.md`。
 */
export const viteBuildShared: NonNullable<
	NonNullable<AstroUserConfig["vite"]>["build"]
> = {
	minify: "esbuild" as const,
	cssCodeSplit: true,
	cssMinify: "esbuild" as const,
	chunkSizeWarningLimit: 1000,
	rollupOptions: {
		// Parameter types are inferred from the build-options type. Hand-writing them
		// narrower than rolldown's OnwarnFunction made the whole object fail to
		// type-check.
		onwarn(warning, defaultHandler) {
			// Astro legitimately mixes static and dynamic imports for islands;
			// silence that specific advisory.
			if (
				warning.message.includes("is dynamically imported by") &&
				warning.message.includes("but also statically imported by")
			) {
				return;
			}
			defaultHandler(warning);
		},
	},
};

/**
 * `vite.optimizeDeps.include` 的候选清单。
 *
 * 只是**候选**：包模式必须先过 `prebundleCandidates()` 过滤，因为 Vite 从项目
 * 根解析这些 id，看不见主题自己的嵌套依赖，列一个解析不了的 id 会让每次冷启动
 * 都刷一条警告。
 */
export const prebundleSpecifiers = [
	"mermaid",
	"@panzoom/panzoom",
	"overlayscrollbars",
	"@fancyapps/ui",
];

/**
 * 可选音乐侧栏的虚拟模块 id。
 *
 * 两侧的插件对象本身不共享（解析出来的侧栏路径不同：源码模式指向
 * `./src/components/...`，包模式指向 `paths.packageSrc` 下的同名文件），但虚拟
 * id 和「哪些产物算音乐包」的判定两侧完全一致，而且正是最容易悄悄改歪的地方，
 * 所以收敛到这里。
 */
export const MUSIC_SIDEBAR_VIRTUAL_ID = "virtual:shirone-music-sidebar";

/** 关掉音乐组件时，`generateBundle` 阶段要从产物里剔除的文件。 */
export function isMusicBundleFile(fileName: string): boolean {
	return (
		fileName.includes("MusicSidebarClient") ||
		fileName.startsWith("_astro/music.") ||
		fileName.includes("/music.")
	);
}
