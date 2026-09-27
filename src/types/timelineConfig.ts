import type { PageMeta } from "./pageMeta.ts";

/** 时间线筛选分类。 */
export interface TimelineCategory {
	/** 稳定标识，供时间线条目引用与筛选。 */
	key: string;
	/** 用户可编辑的分类名称。 */
	label: string;
	/** Iconify 图标名。 */
	icon?: string;
}

/** 时间线条目的外部关联链接。 */
export interface TimelineLink {
	/** 链接显示名称。 */
	label: string;
	/** 目标 URL。 */
	url: string;
	/** 可选图标（Iconify 名）。 */
	icon?: string;
}

/** 单个时间线事件 / 里程碑节点。 */
export interface TimelineItem {
	/** 可选独立开关；关闭后不参与渲染与计数（优先使用 config.disabledTitles）。 */
	enable?: boolean;
	/** 节点标题（事件、职位或里程碑名称）。 */
	title: string;
	/** 时间或时间范围（如 "2026.08", "2024.09 – 2026.06"）。 */
	date: string;
	/** 归属分类 key（对应 TimelineCategory.key）。 */
	category?: TimelineCategory["key"];
	/** 副标题 / 机构 / 学校 / 公司 / 角色。 */
	subtitle?: string;
	/** 地点信息（如 "Tokyo, Japan", "Hangzhou, China"）。 */
	location?: string;
	/** 详细描述或背景说明。 */
	description?: string;
	/** 要点 / 关键成就清单。 */
	highlights?: string[];
	/** 技术栈 / 关联标签。 */
	tags?: string[];
	/** 关联链接列表（项目仓库、演示站、证书、文章等）。 */
	links?: TimelineLink[];
	/** 节点自定义图标（Iconify 名），未指定时使用分类图标或默认节点图标。 */
	icon?: string;
	/** 是否为重点里程碑节点（带突出徽标与重点渲染）。 */
	featured?: boolean;
}

/** 时间线页配置（行为层）。 */
export interface TimelineConfig extends PageMeta {
	/** 页面总开关；关闭后隐藏导航入口并将 /timeline/ 重定向到 404。 */
	enable: boolean;
	/** 筛选分类清单（决定 Chips 顺序）。 */
	categories: TimelineCategory[];
	/** 排序方向：默认按时间倒序 "desc"；可选 "asc"。 */
	order?: "desc" | "asc";
	/** 可选被禁用的节点标题列表。 */
	disabledTitles?: string[];
	/** 兼容通用 disabledKeys 别名。 */
	disabledKeys?: string[];
	/** 可选自定义数据（向后兼容；默认读取 src/data/timeline.ts）。 */
	items?: TimelineItem[];
}
