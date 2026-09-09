import type {
	CommentConfig,
	GiscusConfig,
	TwikooConfig,
} from "@/types/commentConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 评论系统配置单一真源。
 *
 * 遵循「零额外负担」原则：默认全局关闭（enable: false），
 * 在未开启时不产生任何外部网络请求、零额外 DOM 占位与零包体积膨胀。
 *
 * 【开启 Twikoo 评论配置步骤】
 * 1. 部署 Twikoo 服务端并获取环境 ID（腾讯云 CloudBase / Vercel / Railway / 私有部署等）；
 * 2. 将 `enable` 置为 `true`，并将 `provider` 设置为 `"twikoo"`；
 * 3. 填入你的 `twikoo.envId`；
 * 4. （可选）自定义 `scriptUrl`（如使用自建 CDN 或官方 unpkg/jsdelivr 源）。
 *
 * 【开启 Giscus 评论配置步骤】
 * 1. 准备一个公开 GitHub 仓库，并在仓库设置中开启 Discussions 功能；
 * 2. 安装 giscus App（https://github.com/apps/giscus）到该仓库；
 * 3. 在 https://giscus.app 按引导选择仓库与 Discussion 分类，
 *    取生成的 `data-repo-id` 与 `data-category-id`；
 * 4. 将 `enable` 置为 `true`，并将 `provider` 设置为 `"giscus"`，
 *    填入 `giscus.repo` / `giscus.repoId` / `giscus.categoryId` 三个必填字段；
 * 5. （可选）调整 `mapping`、`reactionsEnabled`、`inputPosition`、
 *    `theme.light` / `theme.dark`（giscus 主题键或自定义主题 CSS URL）、
 *    `lang` 与 `scriptUrl`（自托管 giscus 时替换）。
 */
export const commentConfig: CommentConfig = withUserConfig("comment", {
	/** 全局评论总开关：false 时完全不加载评论脚本与 DOM */
	enable: false,
	/** 评论提供商类型："none" | "twikoo" | "giscus" */
	provider: "none",
	/** 是否开启视口懒加载：滚动进入视口才动态加载评论组件（推荐 true） */
	lazy: true,
	/** Twikoo 专有配置 */
	twikoo: {
		/** Twikoo 环境 ID（如 "https://your-twikoo.vercel.app" 或腾讯云环境 ID） */
		envId: "",
		/** Twikoo 前端 JS 脚本 CDN 地址 */
		scriptUrl: "https://cdn.jsdelivr.net/npm/twikoo@1.7.20/dist/twikoo.min.js",
		/** 评论语言："auto"（跟随站点）| "zh-CN" | "zh-TW" | "en" | "ja" 等 */
		lang: "auto",
		/** 评论输入框占位提示文本 */
		placeholder: "Share your thoughts...",
	},
	/** Giscus 专有配置（基于 GitHub Discussions，评论数据存储在公开仓库中） */
	giscus: {
		/** 公开仓库，格式 "owner/repo"（必填） */
		repo: "",
		/** 仓库 ID，从 giscus.app 配置生成器获取（必填） */
		repoId: "",
		/** Discussion 分类名，如 "Announcements"；留空表示不限制分类搜索范围 */
		category: "Announcements",
		/** 分类 ID，从 giscus.app 配置生成器获取（必填） */
		categoryId: "",
		/** 页面 ↔ Discussion 映射：pathname（默认）/ url / title / og:title / specific / number */
		mapping: "pathname",
		/** 严格标题匹配（SHA-1 校验），避免 GitHub 模糊搜索误配相似标题 */
		strict: false,
		/** 是否显示主贴表情反应 */
		reactionsEnabled: true,
		/** 是否向父页面周期性发送 Discussion 元数据（供脚本消费） */
		emitMetadata: false,
		/** 评论输入框位置：bottom（默认，评论框在列表下方）| top（评论框在列表上方） */
		inputPosition: "bottom",
		/** 明暗两套 giscus 主题（giscus 主题键或自定义主题 CSS URL），跟随站点明暗切换 */
		theme: { light: "light", dark: "dark" },
		/** 评论语言："auto"（跟随站点）| giscus 语言码（如 "zh-CN"、"en"） */
		lang: "auto",
		/** giscus client.js 地址；自托管 giscus 时替换为自有地址 */
		scriptUrl: "https://giscus.app/client.js",
	},
});

export type ResolvedCommentOptions =
	| {
			provider: "twikoo";
			lazy: boolean;
			twikoo: TwikooConfig;
	  }
	| {
			provider: "giscus";
			lazy: boolean;
			giscus: GiscusConfig;
	  }
	| null;

/**
 * 解析并校验评论配置。未启用、提供商为 none 或关键参数缺失时返回 null。
 * 校验收敛在此纯函数中，消费组件只消费解析结果并短路。
 */
export function resolveCommentOptions(
	config: CommentConfig,
): ResolvedCommentOptions {
	if (!config.enable || config.provider === "none") {
		return null;
	}
	if (config.provider === "twikoo") {
		const envId = config.twikoo.envId?.trim();
		const scriptUrl = config.twikoo.scriptUrl?.trim();
		if (!envId || !scriptUrl) {
			return null;
		}
		return {
			provider: "twikoo",
			lazy: config.lazy,
			twikoo: {
				...config.twikoo,
				envId,
				scriptUrl,
			},
		};
	}
	if (config.provider === "giscus") {
		const repo = config.giscus.repo?.trim();
		const repoId = config.giscus.repoId?.trim();
		const categoryId = config.giscus.categoryId?.trim();
		if (!repo || !repoId || !categoryId) {
			return null;
		}
		return {
			provider: "giscus",
			lazy: config.lazy,
			giscus: {
				...config.giscus,
				repo,
				repoId,
				categoryId,
				category: config.giscus.category?.trim() ?? "",
				theme: {
					light: config.giscus.theme?.light?.trim() || "light",
					dark: config.giscus.theme?.dark?.trim() || "dark",
				},
				scriptUrl: config.giscus.scriptUrl?.trim(),
			},
		};
	}
	return null;
}
