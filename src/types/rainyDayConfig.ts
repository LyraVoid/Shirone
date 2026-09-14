/**
 * 雨滴窗玻璃特效（全页雨幕 / Rainy Window）配置契约
 *
 * 与 `textureConfig` 的分工：纹理是整页背景上的纯 CSS 图案；雨幕需要一张真实图片
 * 作为折射源（取自当前可见的横幅图片），渲染为覆盖整个视口的固定环境层，
 * 因此整页背景呈现为「壁纸 + 雨」，只有在壁纸可见时（`wallpaperMode: "banner"`）
 * 才会挂载。
 *
 * 效果由 WebGL（Three.js）渲染：本仓库默认关闭（`rainyDayConfig.enable: false`）；
 * 改为 `true` 时才会编译进产物（见 `docs/on-demand-loading.md`），关闭时零 DOM / 零样式 / 零 chunk。
 */
export interface RainyDayConfig {
	/** 总开关（构建期生效，默认 false）：true 时才编译进产物；false 时该特性零 DOM、零样式、零 bundle */
	enable?: boolean;
	/** 主题启用后访客首次进入时的默认状态；访客可在显示设置里关掉（存 localStorage） */
	defaultEnabled?: boolean;

	/** 雨滴密度 0-1（0.3 稀疏、0.5 适中、0.8 密集） */
	intensity?: number;
	/** 下落速度 0-10 */
	speed?: number;
	/** 亮度 0-1 */
	brightness?: number;
	/** 法线强度 0-3（雨滴立体感） */
	normal?: number;
	/** 雨滴图案缩放 0.1-3（越大雨滴越大、越稀疏） */
	zoom?: number;
	/** 玻璃模糊强度 0-10（太大会糊掉背景） */
	blurIntensity?: number;
	/** 模糊迭代次数 1-64（越大越慢） */
	blurIterations?: number;
	/** 闪电效果 */
	lightning?: boolean;
	/** 镜头平移 */
	panning?: boolean;
	/** 后处理（开启更细腻，稍耗性能） */
	postProcessing?: boolean;
	/** 限帧 15-120（省电关键） */
	fps?: number;

	/** 移动端是否启用（默认关闭，省电） */
	mobile?: boolean;
	/** 尊重系统「减少动效」设置（默认开） */
	respectReducedMotion?: boolean;
	/** 弱网 / 省流（saveData 或 2G）不加载（默认开） */
	skipOnSlowNetwork?: boolean;
	/** 切到后台标签页时暂停渲染（默认开） */
	pauseWhenHidden?: boolean;

	/**
	 * 雨雾浓度 0-1：竖向南端的浓度——banner 带内恒为不透明（雨最明显，接替淡出的横幅图片），
	 * 往下在 `mistFadeVh` 内过渡到本值：正文区保持浅色 M3 底 + 背景纹理 + 雨雾。默认 0.4。
	 */
	mistStrength?: number;

	/**
	 * 蒙版过渡长度（vh，0-100，默认 12）：从 banner 带底部起多少视口高度内，
	 * 蒙版从「不透明」过渡到 `mistStrength`。0 = 硬边。
	 */
	mistFadeVh?: number;

	/**
	 * @deprecated 正文区雨丝已整体移除（refactor(rainy-day): remove the CSS body rain overlay）。
	 * 保留该字段只为让升级后的旧配置继续通过类型检查与构建；设置它不再有任何效果。
	 */
	bodyRain?: boolean;
	/** @deprecated 同上，不再生效 */
	bodyRainOpacity?: number;
	/** @deprecated 同上，不再生效 */
	bodyRainSpeed?: number;

	/** 轮播换图时雨层的交叉淡入时长（毫秒；0 = 直接切换） */
	bgFadeMs?: number;
	/** 延后到 load + 浏览器空闲再挂载，把特效库移出首屏关键路径（默认开） */
	lazy?: boolean;
	/** `lazy` 的 idle 兜底超时（毫秒）：最迟这么久一定挂载 */
	idleDelayMs?: number;
	/** 挂载完成后的淡入时长（毫秒；0 = 不淡入） */
	fadeInMs?: number;
}

/**
 * 规范化解析后的雨滴特效选项：消费方只用这份结果，不再各自判空与裁剪。
 *
 * 数值字段一律保证落在合法区间；`enable` 已含「未配置即关闭」的短路判定。
 */
export interface ResolvedRainyDayOptions {
	enable: boolean;
	defaultEnabled: boolean;
	intensity: number;
	speed: number;
	brightness: number;
	normal: number;
	zoom: number;
	blurIntensity: number;
	blurIterations: number;
	lightning: boolean;
	panning: boolean;
	postProcessing: boolean;
	fps: number;
	mobile: boolean;
	respectReducedMotion: boolean;
	skipOnSlowNetwork: boolean;
	pauseWhenHidden: boolean;
	mistStrength: number;
	mistFadeVh: number;
	bgFadeMs: number;
	lazy: boolean;
	idleDelayMs: number;
	fadeInMs: number;
}
