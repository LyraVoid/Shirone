/**
 * Fancybox 处理器
 * 管理图片灯箱的按需加载和生命周期
 */

import {
	FANCYBOX_SELECTORS,
	type FancyboxConfig,
	getDefaultFancyboxConfig,
} from "./fancybox-config";
// Keep the custom rules in the same eagerly tracked stylesheet graph as the
// handler. A dynamic CSS import can make Astro emit a prefetch URL for a
// below-inlining chunk that is not published, causing a first-open 404.
import "../styles/fancybox-custom.css";

// Fancybox 模块类型
// biome-ignore lint/suspicious/noExplicitAny: Fancybox 模块动态加载，无精确类型
type FancyboxModule = any;

/**
 * Fancybox 处理器类
 * 负责图片灯箱的按需加载和绑定管理
 */
export class FancyboxHandler {
	private Fancybox: FancyboxModule | null = null;
	private boundSelectors: string[] = [];
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	/**
	 * 初始化 Fancybox
	 * 按需加载 Fancybox 模块和样式；
	 * 并发调用（如 client:only 岛挂载晚于全局 init）合并为一次，防止双绑
	 */
	async init(): Promise<void> {
		if (!this.checkForImages()) {
			return;
		}

		this.initPromise ??= this.doInit();
		await this.initPromise;
	}

	private async doInit(): Promise<void> {
		if (!this.Fancybox) {
			await this.loadFancybox();
		}

		// 避免重复绑定
		if (this.boundSelectors.length > 0) {
			return;
		}

		this.syncImageGridLinkTargets();
		this.bindSelectors();
		this.initialized = true;
		// 供测试与外部脚本等待绑定就绪的稳定契约（cleanup 时移除）
		document.documentElement.dataset.fancyboxReady = "true";
	}

	/**
	 * 对齐画廊链接的灯箱目标地址。
	 * Astro 图片资产管线只改写 <img> 的 src（相对路径 → 优化地址），
	 * 画廊 <a> 的 href 在 AST 阶段仍是原始相对路径；绑定前将其同步为
	 * 渲染后的图片地址，避免灯箱打开 404。
	 */
	private syncImageGridLinkTargets(): void {
		for (const link of document.querySelectorAll<HTMLAnchorElement>(
			".image-grid__link",
		)) {
			const img = link.querySelector("img");
			const target = img?.currentSrc || img?.src;
			if (target) {
				link.href = target;
			}
		}
	}

	/**
	 * 检查页面是否有需要灯箱的图片
	 */
	private checkForImages(): boolean {
		return (
			document.querySelector(FANCYBOX_SELECTORS.articleImages) !== null ||
			document.querySelector(FANCYBOX_SELECTORS.imageGrids) !== null ||
			document.querySelector(FANCYBOX_SELECTORS.singleFancybox) !== null
		);
	}

	/**
	 * 以编程方式打开灯箱轮播（如内联图片查看器的「查看原图」入口）。
	 * 与委托绑定互不影响；未加载过模块时先按需加载。
	 */
	async showGallery(
		items: { src: string; caption?: string }[],
		startIndex = 0,
	): Promise<void> {
		if (!this.Fancybox) {
			await this.loadFancybox();
		}
		const config = getDefaultFancyboxConfig();
		this.Fancybox.show(items, {
			...config,
			Carousel: { ...config.Carousel, startIndex },
		});
	}

	/**
	 * 按需加载 Fancybox 模块和样式
	 */
	private async loadFancybox(): Promise<void> {
		const mod = await import("@fancyapps/ui");
		this.Fancybox = mod.Fancybox;
		await import("@fancyapps/ui/dist/fancybox/fancybox.css");
	}

	/**
	 * 绑定图片选择器
	 */
	private bindSelectors(): void {
		if (!this.Fancybox) {
			return;
		}

		const commonConfig = getDefaultFancyboxConfig();

		// 文章正文图片和封面（整篇作为单一轮播组）
		this.Fancybox.bind(
			FANCYBOX_SELECTORS.articleImages,
			this.createArticleConfig(commonConfig),
		);
		this.boundSelectors.push(FANCYBOX_SELECTORS.articleImages);

		// 画廊网格：Fancybox 按每个链接的 data-fancybox 值将同一网格聚合为独立轮播组，
		// 不设置 groupAll，避免跨网格/跨文章合并。
		this.Fancybox.bind(FANCYBOX_SELECTORS.imageGrids, commonConfig);
		this.boundSelectors.push(FANCYBOX_SELECTORS.imageGrids);

		// 带 data-fancybox 属性的其他单独元素（已排除画廊链接）
		this.Fancybox.bind(FANCYBOX_SELECTORS.singleFancybox, commonConfig);
		this.boundSelectors.push(FANCYBOX_SELECTORS.singleFancybox);
	}

	/**
	 * 创建文章图片的灯箱配置
	 * 整篇文章的图片作为一个轮播组
	 */
	private createArticleConfig(commonConfig: FancyboxConfig): FancyboxConfig {
		const carouselConfig = commonConfig.Carousel ?? {};
		const lazyloadConfig = (carouselConfig as { Lazyload?: unknown }).Lazyload;

		return {
			...commonConfig,
			groupAll: true,
			Carousel: {
				...carouselConfig,
				transition: "slide",
				Lazyload: {
					...(typeof lazyloadConfig === "object" ? lazyloadConfig : {}),
					preload: 2,
				},
			},
		};
	}

	/**
	 * 清理 Fancybox 绑定
	 * 在页面切换前调用
	 */
	cleanup(): void {
		if (!this.Fancybox) {
			return;
		}

		for (const selector of this.boundSelectors) {
			this.Fancybox.unbind(selector);
		}
		this.boundSelectors = [];
		// 解绑后允许下次 init 重新绑定；同时清除就绪契约，避免跨页假就绪
		this.initPromise = null;
		delete document.documentElement.dataset.fancyboxReady;
	}

	/**
	 * 完全销毁 Fancybox
	 */
	destroy(): void {
		this.cleanup();
		this.Fancybox = null;
		this.initialized = false;
		this.initPromise = null;
	}

	/**
	 * 获取初始化状态
	 */
	isInitialized(): boolean {
		return this.initialized;
	}
}

// 全局单例
let globalFancyboxHandler: FancyboxHandler | null = null;

/**
 * 获取全局 Fancybox 处理器实例
 */
export function getFancyboxHandler(): FancyboxHandler {
	if (!globalFancyboxHandler) {
		globalFancyboxHandler = new FancyboxHandler();
	}
	return globalFancyboxHandler;
}

/**
 * 初始化 Fancybox（便捷函数）
 */
export async function initFancybox(): Promise<void> {
	const handler = getFancyboxHandler();
	await handler.init();
}

/**
 * 清理 Fancybox（便捷函数）
 */
export function cleanupFancybox(): void {
	if (globalFancyboxHandler) {
		globalFancyboxHandler.cleanup();
	}
}

/**
 * 以编程方式打开灯箱轮播（便捷函数）
 */
export async function openFancyboxGallery(
	items: { src: string; caption?: string }[],
	startIndex = 0,
): Promise<void> {
	await getFancyboxHandler().showGallery(items, startIndex);
}
