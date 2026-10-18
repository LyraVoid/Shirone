import type { FontRole } from "../types/fontConfig.ts";

/**
 * Astro 字体声明的 fallback 选项：组合栈由主题自己拼接，因此参与组合的
 * 角色必须关闭 Astro 的自动 fallback，避免第二层 fallback 插在组合之前。
 */
export function getFontFallbackOptions(
	role: FontRole,
	hasMonoCjk: boolean,
): { fallbacks?: string[]; optimizedFallbacks?: boolean } {
	return role === "body" || role === "cjk" || (role === "mono" && hasMonoCjk)
		? { fallbacks: [], optimizedFallbacks: false }
		: {};
}
