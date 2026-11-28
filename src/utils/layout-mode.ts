/**
 * 文章列表布局模式（list/grid）：访客偏好的存取、应用与 FLIP 切换动效。
 *
 * - SSR 渲染 postListConfig.layout.mode（站点默认）；首屏由 PostPage 的
 *   is:inline 脚本在容器解析后立即覆盖访客偏好（防闪）；
 * - swup 导航替换内容后由 Layout 的 content:replace 钩子调用
 *   applyStoredLayoutMode 兜底；
 * - DisplaySettings 面板切换走 flipToMode：先记录各卡片位置，切类重排后
 *   从旧位置平移到新位置（transform-only 的 FLIP，M3E Expressive 的
 *   「切换即动效」表达），prefers-reduced-motion 时直接跳变。
 */
import { postListConfig } from "@/config/postListConfig";
import type { PostListMode } from "@/types/postListConfig";
import { packMasonry, setupMasonry } from "./masonry";
import { flipFromRect, prefersReducedMotion } from "./motion";

const MODE_KEY = "post-list-mode";

/** 布局偏好变更广播事件：DisplaySettings 派发，番剧页等消费方监听（detail.layout: PostListMode） */
export const LAYOUT_MODE_CHANGE_EVENT = "layout-mode-change";

const MODE_CLASS: Record<PostListMode, string> = {
	list: "m3e-post-list--list",
	grid: "m3e-post-list--grid",
};

/** 站点默认模式（postListConfig） */
export function defaultMode(): PostListMode {
	return postListConfig.layout.mode;
}

/** 访客偏好：localStorage 无有效值时回退站点默认 */
export function getStoredMode(): PostListMode {
	const value =
		typeof localStorage === "undefined" ? null : localStorage.getItem(MODE_KEY);
	return value === "list" || value === "grid" ? value : defaultMode();
}

export function storeMode(mode: PostListMode): void {
	// 存储被禁（隐私模式/企业策略）时静默降级：切换仍生效，只是不持久化
	try {
		localStorage.setItem(MODE_KEY, mode);
	} catch {
		// ignore
	}
}

function setModeClasses(container: HTMLElement, mode: PostListMode): void {
	container.classList.remove(MODE_CLASS.list, MODE_CLASS.grid);
	container.classList.add(MODE_CLASS[mode]);
	container.dataset.layoutMode = mode;
}

/** 把访客偏好应用到位的容器（swup 内容替换后 / 首载兜底，无动画） */
export function applyStoredLayoutMode(container: HTMLElement | null): void {
	if (!container) return;
	setModeClasses(container, getStoredMode());
	// 新容器需要重新挂接瀑布流（ResizeObserver 绑在旧容器上会随之失效）
	setupMasonry(container);
}

/**
 * 切换布局模式并播放 FLIP 重排（400ms = --m3e-duration-long）。
 * grid 模式切换后重新做最短列打包（span/列定位），卡片从旧位置平滑
 * 平移到新位置（位移播放走 motion.ts 的 flipFromRect 共享原语）；
 * reduced-motion 时不播放动画直接切换。
 */
export function flipToMode(container: HTMLElement, mode: PostListMode): void {
	const cards = Array.from(
		container.querySelectorAll<HTMLElement>(".m3-blog-postcard"),
	);
	const before = cards.map((card) => card.getBoundingClientRect());
	setModeClasses(container, mode);
	// grid：最短列打包；list：清掉 span/列定位内联样式（单列分支）
	packMasonry(container);
	if (prefersReducedMotion()) return;
	for (const [index, card] of cards.entries()) {
		flipFromRect(card, before[index], 400);
	}
}
