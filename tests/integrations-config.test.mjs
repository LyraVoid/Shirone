import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	expressiveCodeShared,
	IMAGE_ENDPOINT_ROUTE,
	iconInclude,
	isMusicBundleFile,
	MUSIC_SIDEBAR_VIRTUAL_ID,
	svelteCompilerOptions,
	swupForwardOptions,
	swupOptions,
	TRAILING_SLASH,
	viteBuildShared,
} from "../src/config/integrationsConfig.ts";

/**
 * 这些断言守的是「两个 Astro 配置入口共享同一份选项」这个约定本身。
 *
 * 共享模块只是把重复收敛到一处；如果收敛后的值本身是错的（比如尾斜杠配对
 * 写歪、图标集漏了一个），两份配置会**一致地**错下去，而
 * `shirones` 仓 `scripts/validate.mjs` 里的配置一致性检查只比形状、不比值，
 * 抓不到这类问题。所以值本身要在这里钉住。
 */
describe("shared integrations config", () => {
	it("pins the trailing-slash / image-route pairing", () => {
		// 这条是整个模块里最容易悄悄改坏的一处：Astro 只在 resolveConfig 阶段
		// 规范化一次 image.endpoint.route，包模式改 trailingSlash 已经晚了。
		// 见 IMAGE_ENDPOINT_ROUTE 上的注释。
		if (TRAILING_SLASH === "always") {
			assert.ok(
				IMAGE_ENDPOINT_ROUTE.endsWith("/"),
				'trailingSlash "always" requires a trailing slash on the image route',
			);
		} else {
			assert.ok(
				!IMAGE_ENDPOINT_ROUTE.endsWith("/"),
				`trailingSlash "${TRAILING_SLASH}" requires no trailing slash on the image route`,
			);
		}
		assert.equal(IMAGE_ENDPOINT_ROUTE.replace(/\/$/, ""), "/_image");
	});

	it("keeps the swup persistTags selectors that scope styles per page", () => {
		// 少了 :not([data-swup-optional]) 的话，按页注入的语法高亮样式会在
		// Swup 切换后残留。包模式此前正是漏了这个。
		assert.equal(
			swupOptions.updateHead.persistTags,
			"link[rel=stylesheet]:not([data-swup-optional]), style:not([data-swup-optional])",
		);
	});

	it("passes swup ignore as the array form the type declares", () => {
		// @swup/astro 1.8.0 的 Options 声明 ignore 为 (string | RegExp)[] |
		// function；裸字符串只是运行时碰巧能用。
		assert.ok(Array.isArray(swupOptions.ignore));
		assert.deepEqual(swupOptions.ignore, ['a[href="#"]']);
	});

	it("keeps the forward-compat swup options separate", () => {
		// 拆开是为了绕过对象字面量的多余属性检查。并回去之前要先确认
		// @swup/astro 的类型已经认识这两个键。
		assert.equal(swupForwardOptions.animateHistoryBrowsing, false);
		assert.equal(typeof swupForwardOptions.skipPopStateHandling, "function");
		assert.equal(
			swupForwardOptions.skipPopStateHandling({ state: { url: "/a/#x" } }),
			true,
		);
		assert.equal(swupForwardOptions.skipPopStateHandling({ state: {} }), false);
		// 不能和主选项重复，否则展开时会互相覆盖。
		for (const key of Object.keys(swupForwardOptions)) {
			assert.ok(
				!(key in swupOptions),
				`${key} is in both swupOptions and swupForwardOptions`,
			);
		}
	});

	it("declares every icon collection the theme actually references", () => {
		// 340 处图标引用里 material-symbols 占 308、simple-icons 占 21。漏了只
		// 会在 pnpm 严格布局下暴露（源码模式有 astro-icon 的自动发现兜底）。
		// 精确比对键集也顺带挡住了源码模式曾有的畸形键
		// "preprocess: vitePreprocess(),"（从 svelte.config.js 误粘过来的）。
		assert.deepEqual(Object.keys(iconInclude).sort(), [
			"fa6-brands",
			"fa6-regular",
			"fa6-solid",
			"material-symbols",
			"simple-icons",
		]);
		for (const collections of Object.values(iconInclude)) {
			assert.deepEqual(collections, ["*"]);
		}
	});

	it("keeps expressive-code style overrides and frames", () => {
		assert.equal(
			expressiveCodeShared.styleOverrides.codeBackground,
			"var(--codeblock-bg)",
		);
		assert.equal(
			expressiveCodeShared.styleOverrides.codeFontFamily,
			"var(--m3e-font-mono-family)",
		);
		assert.deepEqual(expressiveCodeShared.styleOverrides.textMarkers, {
			delHue: 0,
			insHue: 180,
			markHue: 250,
		});
		assert.equal(expressiveCodeShared.frames.showCopyToClipboardButton, false);
		assert.deepEqual(
			expressiveCodeShared.defaultProps.overridesByLang.shellsession,
			{ showLineNumbers: false },
		);
		// themes 和 plugins 故意不在这里：两侧的取值方式不同，见模块注释。
		assert.ok(!("themes" in expressiveCodeShared));
		assert.ok(!("plugins" in expressiveCodeShared));
	});

	it("derives the svelte compiler options from the caller's dev flag", () => {
		// 源码模式从 process.argv 判断，包模式从 config:setup 的 command 判断，
		// 所以 isDev 必须由调用方传。
		const dev = svelteCompilerOptions(true);
		const prod = svelteCompilerOptions(false);
		assert.equal(dev.warningFilter(), false, "dev suppresses warnings");
		assert.equal(prod.warningFilter(), true, "build surfaces warnings");
		// cssHash 必须只依赖 css 内容，SSR 与客户端的作用域哈希才会一致。
		const hash = (s) => `h${s.length}`;
		assert.equal(dev.cssHash({ css: "a{}", hash }), "svelte-h3");
		assert.equal(
			dev.cssHash({ css: "a{}", hash }),
			prod.cssHash({ css: "a{}", hash }),
		);
	});

	it("keeps the vite build options that both modes share", () => {
		assert.equal(viteBuildShared.minify, "esbuild");
		assert.equal(viteBuildShared.cssCodeSplit, true);
		assert.equal(viteBuildShared.cssMinify, "esbuild");
		assert.equal(viteBuildShared.chunkSizeWarningLimit, 1000);
		// esbuild 的 drop/pure 故意不在这里：那会剥掉用户自己代码里的
		// console.log，是源码模式独有的构建期优化。
		assert.ok(!("esbuild" in viteBuildShared));
	});

	it("silences only the mixed static/dynamic import advisory", () => {
		const { onwarn } = viteBuildShared.rollupOptions;
		const forwarded = [];
		const warn = (w) => forwarded.push(w);

		const advisory = {
			message:
				"X is dynamically imported by a but also statically imported by b",
		};
		const other = { message: "something else entirely" };

		onwarn(advisory, warn);
		assert.equal(forwarded.length, 0, "the advisory is swallowed");

		onwarn(other, warn);
		assert.deepEqual(forwarded, [other], "every other warning is forwarded");
	});

	it("matches the music bundle files both modes prune", () => {
		assert.equal(MUSIC_SIDEBAR_VIRTUAL_ID, "virtual:shirone-music-sidebar");
		assert.equal(isMusicBundleFile("MusicSidebarClient.js"), true);
		assert.equal(isMusicBundleFile("_astro/music.abc123.js"), true);
		assert.equal(isMusicBundleFile("chunks/music.def456.js"), true);
		assert.equal(isMusicBundleFile("_astro/header.abc123.js"), false);
		assert.equal(isMusicBundleFile("index.html"), false);
	});
});
