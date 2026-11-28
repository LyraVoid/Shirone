import type { ResolvedUmamiOptions, UmamiConfig } from "@/types/umamiConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * Umami 统计配置单一真源（由 oddmisc 提供）。
 *
 * 遵循「零额外负担」原则：默认全局关闭（enable: false），
 * 在未开启时不产生任何外部网络请求、零额外 DOM 占位与零包体积膨胀。
 *
 * 详细用法见：`docs/umami-guide.md`
 */
export const umamiConfig: UmamiConfig = withUserConfig("umami", {
	/** 全局 Umami 统计总开关：false 时完全不加载 oddmisc 运行时脚本与 DOM */
	enable: false,
	/** Umami 分享链接（必填） */
	shareUrl: "",
	/** Umami Website ID；与 scriptUrl 同时填写时启用访问采集 */
	websiteId: "",
	/** Umami 采集脚本 URL；与 websiteId 同时填写时启用访问采集 */
	scriptUrl: "",
});

/**
 * 解析并校验 Umami 配置。未启用，或既没有分享链接、也没有成对的采集
 * 凭据时返回 null。
 *
 * 分享链接（shareUrl）只驱动 oddmisc 的公开分享统计与统计 UI；访问采集
 * 脚本只需要 websiteId 与 scriptUrl 同时存在。两者按各自缺失的门控注入
 * （见 Layout.astro 与 createBundledIntegrations）。
 */
export function resolveUmamiOptions(config: UmamiConfig): ResolvedUmamiOptions {
	if (!config.enable) {
		return null;
	}
	const shareUrl = config.shareUrl?.trim();
	const websiteId = config.websiteId?.trim() || undefined;
	const scriptUrl = config.scriptUrl?.trim() || undefined;
	// Nothing to inject: no share stats, and the tracking script would 404
	// without both credentials.
	if (!shareUrl && !(websiteId && scriptUrl)) {
		return null;
	}
	return {
		shareUrl: shareUrl || undefined,
		websiteId,
		scriptUrl,
	};
}

export type { ResolvedUmamiOptions };
