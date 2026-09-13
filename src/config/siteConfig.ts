import type { SiteConfig } from "@/types/config";
import type {
	ResolvedTextureOptions,
	TextureConfig,
} from "@/types/textureConfig";
import { withUserConfig } from "../utils/config-overlay.ts";
// 注意：本文件会被 scripts/*.mjs 在 Node 里直接 import（如 fonts/check-fonts.mjs），
// 因此相对导入必须带 .ts 扩展名
import { resolveRainyDayOptions } from "./rainyDayConfig.ts";

/**
 * 站点核心配置：标题 / 语言 / 主题色（HCT 动态配色）/ 横幅 / 目录 / 进度条 / favicon。
 * 类型见 src/types/config.ts。
 */
export const siteConfig: SiteConfig = withUserConfig("site", {
	site: "https://shirone.mysqil.com/",
	base: "/",
	title: "Shirone",
	subtitle: "A Material 3 anime blog",
	// 电脑端顶栏标题与导航内容区域："left" 左对齐，"center" 居中。
	topAppBar: {
		contentAlign: "center",
	},
	// 显示设置面板控制：配置各项前端切换项的可见性（默认全部开启）。
	displaySettings: {
		colorStyle: true, // 是否展示配色风格 9 宫格
		colorSpec: true, // 是否展示 Color Spec 调色规范切换
		wallpaperMode: true, // 是否展示页面背景（纯色/横幅）切换
		layoutMode: true, // 是否展示文章列表布局（列表/网格）切换
		reduceMotion: true, // 是否展示减少动效切换
		texture: true, // 是否展示背景纹理选择
		rainyDay: true, // 是否展示雨滴特效开关（雨滴特效本身由 rainyDayConfig.enable 决定是否启用）
	},
	lang: "en", // Language code, e.g. 'en', 'zh_CN', 'ja', etc.
	// IANA time zone for precise post and moment timestamps. It is independent of lang.
	timeZone: "Asia/Shanghai",
	themeColor: {
		hue: 315, // Default hue 0-360. 站点设计默认粉紫（偏二次元）；262 紫 / 345 粉 也可选
		fixed: false, // Hide the theme color picker for visitors
		// Dynamic Material 3 palette style (TonalSpot/Vibrant/Content/Expressive/Rainbow/FruitSalad/Monochrome/Neutral/Fidelity)
		style: "tonalSpot",
		// Design spec version: "2021" (MD3) or "2025" (M3 Expressive)。角色集一致，
		// 差异仅在调色板派生（库的 colorSpec 静态为 2025 委托）
		spec: "2025",
	},
	// 默认页面背景模式："banner" 使用壁纸横幅，"none" 使用主题纯色。
	// 访客在“显示设置”中的选择会保存在浏览器中，并覆盖这里的默认值。
	wallpaperMode: {
		defaultMode: "banner",
	},
	// 页面背景纹理系统配置（5 大精美预设 + 零开销 HCT 动态取色）
	texture: {
		enable: true, // 是否启用背景纹理系统
		defaultPreset: "starlight", // 默认纹理预设："none" | "starlight" | "cyber-dots" | "topography" | "geometric" | "sakura"
		defaultOpacity: 0.12, // 默认纹理浓度 (0.05 ~ 0.25)
		allowMotion: true, // 是否允许背景微动效（开启 reduced-motion 时自动静止）
	},
	banner: {
		// 推荐将图片放入 src/assets，并填写相对 src 的路径，以启用构建期 AVIF/WebP 响应式优化。
		// 以 "/" 开头的 public 路径与远程 URL 仍可用，但会保留原图、不生成候选。
		// desktop 用于 >= 1024px；mobile 仅用于 < 1024px 的首页，手机非首页不显示壁纸。
		// 数组顺序就是轮播顺序；只需要静态 Banner 时，每组保留一张图片即可。
		src: {
			desktop: ["assets/images/banner/desktop/1.webp"],
			mobile: ["assets/images/banner/mobile/1.webp"],
		},
		// 图片裁切焦点："top"、"center" 或 "bottom"。
		position: "center",
		dim: {
			// 在图片上覆盖黑色遮罩以提高标题和顶部栏的对比度；opacity 范围为 0-1。
			enable: true,
			opacity: 0.24,
		},
		homeText: {
			// 仅在首页 Banner 中显示，标题与副标题会上下居中排列。
			enable: true,
			title: "Shirone",
			subtitle: [
				"特別なことはないけど、君がいると十分です",
				"今でもあなたは私の光",
				"君ってさ、知らないうちに私の毎日になってたよ",
				"君と話すと、なんか毎日がちょっと楽しくなるんだ",
				"今日はなんでもない日。でも、ちょっとだけいい日",
			],
			typewriter: {
				// 副标题逐字显示；关闭后直接显示完整副标题。
				enable: true,
				// 打字速度（每个字符间隔，毫秒）。
				speed: 100,
				// 回退反向删除速度（每个字符间隔，毫秒）。
				deleteSpeed: 50,
				// 打字完成后停顿时间，单位为毫秒。
				pauseTime: 2000,
				// 完成后是否循环播放；关闭表示只播放一次。
				loop: true,
			},
		},
		carousel: {
			// 是否开启多张图片自动轮播；多张图片时生效，单张图片时自动降级为静态展示。
			enable: true,
			// 轮播切换间隔时间（毫秒），运行时最小值限制为 3000ms。
			interval: 6000,
			// 交叉淡入淡出（Crossfade）过渡时长（毫秒，默认 1200ms）。
			fadeDuration: 1200,
			// 运镜呼吸动画模式："ken-burns"（默认，循环运镜）| "zoom-in"（推进）| "zoom-out"（拉远）| "pan-left"（左移）| "pan-right"（右移）| "none"（无运镜）。
			animation: "ken-burns",
		},
		waves: {
			// 在 Banner 底部渲染页面背景色水波纹；关闭后不输出波浪 DOM。
			enable: true,
		},
	},
	// Markdown 正文图片处理；仅匹配远程图片，不会产生额外网络请求或客户端代码。
	imageOptimization: {
		// 为需要防盗链兼容的图片 CDN 添加 referrerpolicy="no-referrer"，支持通配符。
		noReferrerDomains: ["*.hdslb.com"],
	},
	toc: {
		enable: true, // Display the table of contents on the right side of the post
		depth: 2, // Maximum heading depth to show in the table, from 1 to 3
	},
	progressIndicator: {
		// 进度条预设样式：dual 双向扫描（官方默认双线）/ single 单向扫描（单线）
		style: "dual",
	},
	favicon: [
		// 浏览器标签页图标，路径相对于 public 目录。
		{ src: "/logo/icon.webp" },
	],
});

/**
 * 解析并返回背景纹理配置选项（包含关闭短路与 0 开销优化判定）
 */
export function resolveTextureOptions(
	config: boolean | TextureConfig | undefined = siteConfig.texture,
	displaySettingsTexture: boolean = siteConfig.displaySettings?.texture ?? true,
): ResolvedTextureOptions {
	if (config === false || config === undefined) {
		return {
			enable: false,
			defaultPreset: "none",
			defaultOpacity: 0.12,
			allowMotion: false,
		};
	}

	if (config === true) {
		return {
			enable: true,
			defaultPreset: "starlight",
			defaultOpacity: 0.12,
			allowMotion: true,
		};
	}

	const enable = config.enable ?? true;
	const defaultPreset = config.defaultPreset ?? "starlight";
	const defaultOpacity = config.defaultOpacity ?? 0.12;
	const allowMotion = config.allowMotion ?? true;

	// 性能短路优化：
	// 如果配置 enable: false，或者 defaultPreset: "none" 且显示设置面板未允许切换（访客也无法开启），
	// 则自动视为完全关闭以达成零 DOM、零 CSS、零运行时代价。
	const effectiveEnable =
		enable && (defaultPreset !== "none" || displaySettingsTexture);

	return {
		enable: effectiveEnable,
		defaultPreset,
		defaultOpacity,
		allowMotion,
	};
}

/** 站点默认配色风格（访客未做选择时的回退值） */
export function getDefaultStyle(): string {
	return siteConfig.themeColor.style;
}

/** 站点默认 Color Spec（2021 / 2025） */
export function getDefaultSpec(): string {
	return siteConfig.themeColor.spec;
}

/** 解析并返回显示设置面板各项开关（未配置时默认 true） */
export function resolveDisplaySettings(): {
	colorStyle: boolean;
	colorSpec: boolean;
	wallpaperMode: boolean;
	layoutMode: boolean;
	reduceMotion: boolean;
	texture: boolean;
	rainyDay: boolean;
} {
	const cfg = siteConfig.displaySettings;
	const textureOpts = resolveTextureOptions(
		siteConfig.texture,
		cfg?.texture ?? true,
	);
	// 雨滴特效是重量级可选特性：只有主题把它编译进来（rainyDayConfig.enable）时面板才
	// 提供开关，displaySettings.rainyDay 仅用于作者侧隐藏该开关。
	const rainyDayOpts = resolveRainyDayOptions(siteConfig.rainyDay);
	return {
		colorStyle: cfg?.colorStyle ?? true,
		colorSpec: cfg?.colorSpec ?? true,
		wallpaperMode: cfg?.wallpaperMode ?? true,
		layoutMode: cfg?.layoutMode ?? true,
		reduceMotion: cfg?.reduceMotion ?? true,
		texture: textureOpts.enable && (cfg?.texture ?? true),
		rainyDay: rainyDayOpts.enable && (cfg?.rainyDay ?? true),
	};
}
