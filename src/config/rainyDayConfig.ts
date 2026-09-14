import type {
	RainyDayConfig,
	ResolvedRainyDayOptions,
} from "@/types/rainyDayConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

// 供 barrel 与消费方复用（与 umamiConfig 的写法一致）
export type { RainyDayConfig, ResolvedRainyDayOptions };

/**
 * 雨滴窗玻璃特效：整页 WebGL 雨幕（基于 @arayui/rainy-day）。
 *
 * 归属：由 `layouts/Layout.astro` 挂载的页面级环境层（`organisms/RainyWindowLayer.astro`），
 * 以「当前可见的横幅图片」为折射源，折射后整页背景呈现为「壁纸 + 雨」，
 * 内容、顶栏与 hero 文案都浮在它之上。
 *
 * 本仓库默认开启（`enable: true`）：构建后访客首次进入即看到雨幕，也可随时在
 * 「显示设置」里关掉（存 localStorage）。不想用时把 `enable` 改为 `false` —— 关闭时
 * 遵循「关闭零开销」：不渲染组件（零 DOM）、不加载特效库（含 Three.js）、不输出任何
 * 样式与 DOM、产物里零 chunk。纯色背景（`wallpaperMode: none`）、移动端非首页与
 * 弱网/减少动效环境下不会挂载。
 *
 * 参数范围：intensity 0-1、speed 0-10、brightness 0-1、normal 0-3、zoom 0.1-3、
 * blurIntensity 0-10、blurIterations 1-64、fps 15-120、mistStrength 0-1；越界值会被 resolve 时裁剪。
 */
export const rainyDayConfig: RainyDayConfig = withUserConfig("rainyDay", {
	enable: true, // 总开关（构建期生效）：false = 该特性完全不进产物
	defaultEnabled: true, // 主题启用后访客首次进入时的默认状态（之后由访客自己的开关决定）

	intensity: 0.2, // 雨滴密度
	speed: 1, // 下落速度
	brightness: 0.9, // 亮度
	normal: 1, // 法线强度（雨滴立体感）
	zoom: 2, // 雨滴图案缩放：值越大雨滴越大、越稀疏
	blurIntensity: 0.2, // 玻璃模糊
	blurIterations: 12, // 模糊迭代（越小越快）
	lightning: false, // 闪电
	panning: false, // 镜头平移
	postProcessing: true, // 后处理
	fps: 30, // 限帧，省电关键

	mobile: false, // 移动端默认不启用
	respectReducedMotion: true, // 系统开了「减少动效」就不渲染
	skipOnSlowNetwork: true, // 弱网 / 省流不加载
	pauseWhenHidden: true, // 切到后台标签页暂停渲染

	// 雨雾浓度 0-1（默认 0.25）：特效库输出的是不透明画面，所以「背景保持原样 + 全页都有雨」
	// 只能靠让雨层半透明——本值即「雨层的不透明度」。
	// 0 = 看不到雨；0.25 = 默认，柔和雨雾/水光叠在整页，页面底色与背景纹理保持原样；
	// 0.4 ≈ 雨感明显；0.7 ≈ 照片为主；1 = 完全不透明雨幕（页面背景被壁纸照片替换，雨最明显）。
	mistStrength: 0.25,

	bgFadeMs: 500, // 轮播换图时雨层交叉淡入时长
	lazy: true, // 延后到 load + 空闲再挂载
	idleDelayMs: 2500, // idle 兜底超时：最迟这么久一定挂载
	fadeInMs: 600, // 挂载完成后的淡入时长
});

/** 未启用时的零开销结果：同一份常量，避免每次调用新建对象 */
const DISABLED_RAINY_DAY_OPTIONS: ResolvedRainyDayOptions = Object.freeze({
	enable: false,
	defaultEnabled: false,
	intensity: 0,
	speed: 0,
	brightness: 0,
	normal: 0,
	zoom: 0,
	blurIntensity: 0,
	blurIterations: 1,
	lightning: false,
	panning: false,
	postProcessing: false,
	fps: 15,
	mobile: false,
	respectReducedMotion: true,
	skipOnSlowNetwork: true,
	pauseWhenHidden: true,
	mistStrength: 0,
	bgFadeMs: 0,
	lazy: true,
	idleDelayMs: 0,
	fadeInMs: 0,
});

/** 把数值裁剪进区间（`integer` 为真时取整），非法值回退到默认值 */
function clampNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
	integer = false,
): number {
	const parsed = typeof value === "number" ? value : Number(value);
	const safe = Number.isFinite(parsed) ? parsed : fallback;
	const clamped = Math.min(Math.max(safe, min), max);
	return integer ? Math.round(clamped) : clamped;
}

function boolOption(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

/**
 * 解析并返回雨滴特效选项（把「未配置即关闭」的短路与数值校验收敛在这里）。
 *
 * 支持三种写法：`false` / 未配置 → 关闭；`true` → 用主题默认值启用；
 * 对象 → 逐字段覆盖默认值（内容仓 `config/rainy-day.yaml` 的深合并结果同样走这里）。
 */
export function resolveRainyDayOptions(
	config: boolean | RainyDayConfig | undefined = rainyDayConfig,
): ResolvedRainyDayOptions {
	if (config !== true && (typeof config !== "object" || config === null)) {
		return DISABLED_RAINY_DAY_OPTIONS;
	}

	if (config === true) {
		return {
			...DISABLED_RAINY_DAY_OPTIONS,
			enable: true,
			defaultEnabled: true,
			intensity: 0.2,
			speed: 1,
			brightness: 0.9,
			normal: 1,
			zoom: 2,
			blurIntensity: 0.2,
			blurIterations: 12,
			postProcessing: true,
			fps: 30,
			mistStrength: 0.25,
			bgFadeMs: 500,
			idleDelayMs: 2500,
			fadeInMs: 600,
		};
	}

	return {
		enable: config.enable ?? true,
		defaultEnabled: config.defaultEnabled ?? true,
		intensity: clampNumber(config.intensity, 0.2, 0, 1),
		speed: clampNumber(config.speed, 1, 0, 10),
		brightness: clampNumber(config.brightness, 0.9, 0, 1),
		normal: clampNumber(config.normal, 1, 0, 3),
		zoom: clampNumber(config.zoom, 2, 0.1, 3),
		blurIntensity: clampNumber(config.blurIntensity, 0.2, 0, 10),
		blurIterations: clampNumber(config.blurIterations, 12, 1, 64, true),
		lightning: boolOption(config.lightning, false),
		panning: boolOption(config.panning, false),
		postProcessing: boolOption(config.postProcessing, true),
		fps: clampNumber(config.fps, 30, 15, 120, true),
		mobile: boolOption(config.mobile, false),
		respectReducedMotion: boolOption(config.respectReducedMotion, true),
		skipOnSlowNetwork: boolOption(config.skipOnSlowNetwork, true),
		pauseWhenHidden: boolOption(config.pauseWhenHidden, true),
		mistStrength: clampNumber(config.mistStrength, 0.25, 0, 1),
		bgFadeMs: clampNumber(config.bgFadeMs, 500, 0, 5000),
		lazy: boolOption(config.lazy, true),
		idleDelayMs: clampNumber(config.idleDelayMs, 2500, 0, 10000),
		fadeInMs: clampNumber(config.fadeInMs, 600, 0, 5000),
	};
}
