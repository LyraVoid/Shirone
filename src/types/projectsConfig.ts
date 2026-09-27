import type { PageMeta } from "./pageMeta.ts";

/** 项目阶段：强调当前交付状态，不映射为百分比进度。 */
export type ProjectPhase = "shipped" | "building" | "exploring";

/** 项目页筛选分类。 */
export interface ProjectCategory {
	/** 稳定标识，供项目引用与筛选。 */
	key: string;
	/** 用户可编辑的分类名称。 */
	label: string;
	/** Iconify 图标名。 */
	icon?: string;
}

/** 单个项目条目。 */
export interface ProjectItem {
	/** 可选独立开关；关闭后不参与渲染与计数（优先使用 config.disabledKeys）。 */
	enable?: boolean;
	/** 稳定标识，用作列表 key 与测试选择器。 */
	key: string;
	title: string;
	summary: string;
	category: ProjectCategory["key"];
	phase: ProjectPhase;
	technologies: string[];
	/** 无封面时使用的 Iconify 图标。 */
	icon?: string;
	/** 可选项目封面，建议使用本地 WebP/AVIF。 */
	cover?: string;
	/** 封面承载额外信息时提供；纯装饰封面留空。 */
	coverAlt?: string;
	/** 代表项目标记，供页面做重点项目识别。 */
	featured?: boolean;
	website?: string;
	repository?: string;
	/** 自由格式的年份或时间范围，如 2024–2026。 */
	year?: string;
}

/** 项目页配置（行为层）。 */
export interface ProjectsConfig extends PageMeta {
	/** 页面总开关；关闭后隐藏导航入口并将 /projects/ 重定向到 404。 */
	enable: boolean;
	/** 分类列表（决定 Chips 显示顺序）。 */
	categories: ProjectCategory[];
	/** 可选被禁用的项目 key 列表。 */
	disabledKeys?: string[];
	/** 可选自定义数据（向后兼容；默认读取 src/data/projects.ts）。 */
	items?: ProjectItem[];
}
