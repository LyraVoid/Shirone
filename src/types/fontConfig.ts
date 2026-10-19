/**
 * 字体构建模式：
 * - `"system"`：纯系统字体模式。完全依赖访客设备自带字体，零额外字体文件打包，零网络请求。
 * - `"custom"`：自定义字体模式。根据 `fontFamilies` 清单按需加载 Fontsource 包或本地 `.woff2` 字体。
 */
export type FontMode = "system" | "custom";

/** 全部字体角色，数组顺序即字体栈的组合顺序 */
export const FONT_ROLES = ["body", "cjk", "mono", "mono-cjk"] as const;

/**
 * 字体在设计系统中的角色划分：
 * - `"body"`：正文字体（主要用于西文、数字及默认文本，对应 CSS 变量 `--font-body`）。
 * - `"cjk"`：中日韩文本字体（用于汉字、假名等 CJK 字符展示，对应 CSS 变量 `--font-cjk`）。
 * - `"mono"`：等宽代码字体（用于代码块、行内代码、终端、图表标签，对应 CSS 变量 `--font-mono` / `--m3e-font-mono-family`）。
 * - `"mono-cjk"`：可选的代码 CJK 补充字体（用于代码/终端中的汉字等，对应 CSS 变量
 *   `--font-mono-cjk`）。配置后与 `mono` 组成 `mono → mono-cjk` 的栈；
 *   未配置时行为与只有 `mono` 时完全一致。
 */
export type FontRole = (typeof FONT_ROLES)[number];

/**
 * 字体资源来源：
 * - `"local"`：本地字体文件。必须存放在 `src/assets/fonts/` 目录下且格式为 `.woff2`。
 * - `"fontsource"`：Fontsource npm 包。通过 `@fontsource/*` 导入 CSS。
 *
 * 注：出于安全与性能考量，系统严禁使用任何运行期远程 URL（如 Google Fonts CDN 等）。
 */
export type FontSource = "local" | "fontsource";

/** 字体样式：常规体 ("normal") 或 斜体 ("italic") */
export type FontStyle = "normal" | "italic";

/**
 * 字体加载 display 策略：
 * - `"swap"`：最常用策略。先用回退字体立即渲染，字体下载完成后平滑替换。
 * - `"optional"`：大体积中文字体推荐。在极短等待时间内若未就绪则放弃当前会话替换，避免布局抖动。
 * - `"block"`：短时间阻塞文本渲染等待字体加载。
 */
export type FontDisplay = "swap" | "optional" | "block";

/**
 * 字体字重：
 * - 静态字体：单字重数字，如 `400`（常规）、`500`（中粗）、`700`（加粗）。
 * - 可变字体（Variable Font）：升序字重区间字符串，如 `"100 800"`、`"400 900"`。
 */
export type FontWeight = number | `${number} ${number}`;

/** 字体具体单项变体（指定字重、样式及对应文件） */
export interface FontVariant {
	/**
	 * 字体文件路径或导入标识：
	 * - 若 source 为 "local"：填写以 "src/assets/fonts/" 开头的 .woff2 路径，例如 "src/assets/fonts/ZenMaruGothic-Medium.woff2"。
	 * - 若 source 为 "fontsource"：填写已安装的 npm 包 css 路径，例如 "@fontsource/roboto/400.css"。
	 */
	file: string;
	/** 字体字重（数字或可变字体区间） */
	weight: FontWeight;
	/** 字体字形风格 */
	style: FontStyle;
	/** 稳定子集名称（如 "latin", "chinese-simplified" 等，供构建与清单检查使用，可选） */
	subset?: string;
	/** 明确的 Unicode 字符范围（如 "U+0000-00FF, U+0131"，可选） */
	unicodeRange?: string;
}

/** 字体族配置定义 */
export interface FontFamilyDefinition {
	/**
	 * 配置唯一标识符（使用小写字母与连字符，如 "roboto-body"、"zen-maru-cjk"），非 CSS family 名称。
	 */
	id: string;
	/**
	 * 真实的 CSS `font-family` 名称（如 "Roboto"、"Zen Maru Gothic"、"JetBrains Mono Variable"）。
	 */
	family: string;
	/** 绑定的角色："body" | "cjk" | "mono" | "mono-cjk"，每个角色最多定义一个字体族 */
	role: FontRole;
	/** 字体来源："local"（本地 .woff2）或 "fontsource"（npm 包） */
	source: FontSource;
	/** 包含的字体变体列表（至少提供一个变体） */
	variants: FontVariant[];
	/**
	 * 回退字体列表（必须以通用系统字体结尾），例如：
	 * - 正文/CJK：`["ui-sans-serif", "system-ui", "sans-serif"]`
	 * - 代码等宽：`["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"]`
	 */
	fallback: string[];
	/** 字体加载 display 策略，默认推荐 "swap" */
	display: FontDisplay;
	/** 是否在 HTML `<head>` 中生成 `<link rel="preload">` 进行关键资源预加载 */
	preload: boolean;
	/**
	 * 本地自托管字体的开源许可证说明文件路径（可选，推荐随字体一同存放，如 "src/assets/fonts/LICENSE.txt"）
	 */
	licenseFile?: string;
}

/**
 * 字体子集化配置选项（预留配置项）
 */
export interface FontSubsettingOptions {
	/** 是否开启构建期字符子集裁剪 */
	enable: boolean;
	/** 是否扫描文章 Markdown/MDX 内容以提取字形 */
	includeContent: boolean;
	/** 是否包含 i18n 语言词典字符 */
	includeI18n: boolean;
	/** 是否包含站点配置文字字符 */
	includeConfig: boolean;
	/** 是否包含通用标点与基础字符 */
	includeCommon: boolean;
	/**
	 * 是否允许拉取远端文本进行分析。
	 * 安全限制：在远端数据契约确立前必须保持为 false，禁止构建访问外部网络。
	 */
	allowRemoteText: boolean;
}

/** 字体打包体积预算限制（防止意外引入巨型字体导致首屏加载缓慢） */
export interface FontBudget {
	/** 全站字体产物总大小上限（单位：字节，默认 4MB = 4 * 1024 * 1024） */
	maxTotalBytes: number;
	/** 单个字体族产物大小上限（单位：字节，默认 2MB = 2 * 1024 * 1024） */
	maxFamilyBytes: number;
}

/** 全站字体完整配置对象 */
export interface FontConfig {
	/** 构建模式："system"（纯系统字体）或 "custom"（自定义字体） */
	mode: FontMode;
	/** 字体族清单列表 */
	fontFamilies: FontFamilyDefinition[];
	/** 字体子集化配置 */
	subsetting: FontSubsettingOptions;
	/** 字体体积预算限制 */
	budget: FontBudget;
}

/** 已经过校验并补全来源的字体变体 */
export interface ResolvedFontVariant extends FontVariant {
	source: FontSource;
}

/** 已经过校验并完成角色变量绑定的字体角色 */
export interface ResolvedFontRole {
	/** 绑定的 CSS 变量名（body/cjk 为 `--font-*`；mono 在配置 `mono-cjk` 时改用 `--font-mono-base`） */
	cssVariable:
		| "--font-body"
		| "--font-cjk"
		| "--font-mono"
		| "--font-mono-base"
		| "--font-mono-cjk";
	/** 字体 family 名称，若未配置则为空字符串 */
	family: string;
	/** 格式化后的回退字体链 CSS 字符串 */
	fallback: string;
	/** 该角色包含的所有变体 */
	variants: ResolvedFontVariant[];
	/** 字体加载 display 策略 */
	display: FontDisplay;
	/** 是否预加载 */
	preload: boolean;
}

/**
 * 经由 `resolveFontOptions()` 验证与标准化后的最终字体选项对象，供 Astro 模板与 CSS 消费。
 */
export interface ResolvedFontOptions {
	schemaVersion: 1;
	mode: FontMode;
	roles: Record<FontRole, ResolvedFontRole>;
	preloadRoles: FontRole[];
	subsetting: FontSubsettingOptions;
	budget: FontBudget;
}
