export type { PermalinkConfig } from "./permalinkConfig.ts";

import type { AUTO_MODE, DARK_MODE, LIGHT_MODE } from "@constants/constants";
import type { TextureConfig } from "./textureConfig";

export type WallpaperMode = "banner" | "none";

export type TopAppBarContentAlign = "left" | "center";

export type DisplaySettingsConfig = {
	/** 是否在显示设置面板展示配色风格（9 宫格）选择器（默认 true） */
	colorStyle?: boolean;
	/** 是否在显示设置面板展示 Color Spec（调色规范 2021 / 2025）切换器（默认 true） */
	colorSpec?: boolean;
	/** 是否在显示设置面板展示 Page background（页面背景 纯色 / 横幅）切换器（默认 true） */
	wallpaperMode?: boolean;
	/** 是否在显示设置面板展示 Layout（文章列表布局 列表 / 网格）切换器（默认 true） */
	layoutMode?: boolean;
	/** 是否在显示设置面板展示 Reduce motion（减少动效）切换器（默认 true） */
	reduceMotion?: boolean;
	/** 是否在显示设置面板展示背景纹理选择器（默认 true，且受 texture.enable 控制） */
	texture?: boolean;
};

export type BannerThemeSource = {
	light: string[];
	dark: string[];
};

export type BannerSourceValue = string[] | BannerThemeSource;

export type BannerConfig = {
	src: {
		desktop: BannerSourceValue;
		mobile: BannerSourceValue;
	};
	position?: "top" | "center" | "bottom";
	dim: {
		enable: boolean;
		opacity: number;
	};
	homeText: {
		enable: boolean;
		title: string;
		/** 首页副标题文本，支持单条字符串或多条交替循环的字符串数组 */
		subtitle: string | string[];
		typewriter: {
			enable: boolean;
			/** 打字速度（每个字符间隔，毫秒，默认 120） */
			speed: number;
			/** 回退反向删除速度（每个字符间隔，毫秒，默认 50） */
			deleteSpeed?: number;
			/** 打字完成后等待停顿时间（毫秒，默认 2000） */
			pauseTime?: number;
			/** 完成后是否循环播放（默认 true） */
			loop: boolean;
		};
	};
	carousel: {
		enable: boolean;
		interval: number;
		/** 交叉淡入淡出过渡时长（毫秒，默认 1200） */
		fadeDuration?: number;
		/** 运镜呼吸动画模式："ken-burns"（默认，序列运镜）| "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "none" */
		animation?:
			| "ken-burns"
			| "zoom-in"
			| "zoom-out"
			| "pan-left"
			| "pan-right"
			| "none";
	};
	waves: {
		enable: boolean;
	};
};

export type SiteConfig = {
	site: string;
	base?: string;
	title: string;
	subtitle: string;
	/** 默认社交媒体分享预览图（og:image / twitter:image），支持本地相对路径或远程绝对链接。未配置时自动回退为第一张桌面版横幅壁纸。 */
	ogImage?: string;
	topAppBar: {
		/** 桌面端标题与导航内容组的对齐方式。 */
		contentAlign: TopAppBarContentAlign;
	};

	/** 显示设置浮层各切换项的前端可见性控制 */
	displaySettings?: DisplaySettingsConfig;

	lang:
		| "en"
		| "zh_CN"
		| "zh_TW"
		| "ja"
		| "ko"
		| "es"
		| "th"
		| "vi"
		| "tr"
		| "id";

	/** IANA time zone used to interpret precise content timestamps. */
	timeZone: string;

	themeColor: {
		hue: number;
		fixed: boolean;
		style: string;
		spec: string;
	};
	wallpaperMode: {
		defaultMode: WallpaperMode;
	};
	/** 页面背景纹理系统配置，支持布尔值直接开关或详细配置对象 */
	texture?: boolean | TextureConfig;
	banner: BannerConfig;
	/** Markdown 正文图片处理配置。 */
	imageOptimization?: {
		/** 添加 `referrerpolicy="no-referrer"` 的远程图片域名，支持 `*.example.com` 通配符。 */
		noReferrerDomains?: string[];
	};
	toc: {
		enable: boolean;
		depth: 1 | 2 | 3;
	};

	/** 进度条预设样式（页面切换进度条等，仅线性扫描模式） */
	progressIndicator: {
		/** dual 双向扫描（官方默认双线）/ single 单向扫描（单线） */
		style: "dual" | "single";
	};

	favicon: Favicon[];
};

export type Favicon = {
	src: string;
	theme?: "light" | "dark";
	sizes?: string;
};

export type ProfileConfig = {
	avatar?: string;
	name: string;
	bio?: string;
	links: {
		name: string;
		url: string;
		icon: string;
	}[];
};

export type LicenseConfig = {
	enable: boolean;
	name: string;
	url: string;
};

export type LIGHT_DARK_MODE =
	| typeof LIGHT_MODE
	| typeof DARK_MODE
	| typeof AUTO_MODE;

export type BlogPostData = {
	body: string;
	title: string;
	published: Date;
	publishedAt?: Date;
	updated?: Date;
	updatedAt?: Date;
	description: string;
	tags: string[];
	draft?: boolean;
	image?: string;
	category?: string;
	alias?: string;
	permalink?: string;
	prevTitle?: string;
	prevUrl?: string;
	nextUrl?: string;
	prevSlug?: string;
	nextTitle?: string;
	nextSlug?: string;
};

export type ExpressiveCodeConfig = {
	theme: string;
	lightTheme?: string;
	darkTheme?: string;
};
