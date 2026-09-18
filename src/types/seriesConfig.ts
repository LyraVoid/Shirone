/**
 * 系列（有序连载文章组）配置。
 * 领域注册见 `scripts/content/config-domains.mjs`（key: "series"）。
 */
export interface SeriesConfig {
	/** 关闭后系列页 404、导航/侧栏入口隐藏、文章内系列卡不渲染（零额外负担） */
	enable: boolean;
	/** 系列索引页标题：$t: 前缀取 i18n 词条，普通字符串为字面量覆盖 */
	title: string;
	/**
	 * 系列索引页描述（SEO meta）：$t: 前缀取 i18n 词条，普通字符串为字面量覆盖；
	 * 空字符串 = 使用动态汇总（「x 个系列 · y 篇文章」）。
	 */
	description: string;
	/** 文章内系列卡位置：top = 头部元信息区下方；bottom = 相关阅读之后 */
	cardPosition: "top" | "bottom";
}
