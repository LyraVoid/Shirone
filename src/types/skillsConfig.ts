import type { PageMeta } from "./pageMeta.ts";

/** 技能熟练度：用于离散等级展示，不映射为伪精确百分比。 */
export type SkillLevel = "beginner" | "intermediate" | "advanced" | "expert";

/** 技能页分类。 */
export interface SkillCategory {
	/** 稳定标识，供技能引用与筛选。 */
	key: string;
	/** 用户可编辑的分类名称。 */
	label: string;
	/** Iconify 图标名。 */
	icon?: string;
}

/** 单项技能条目。 */
export interface SkillItem {
	/** 可选独立开关；关闭后不参与渲染与计数（优先使用 config.disabledNames）。 */
	enable?: boolean;
	name: string;
	description?: string;
	icon?: string;
	category: SkillCategory["key"];
	level: SkillLevel;
}

/** 技能页配置（行为层）。 */
export interface SkillsConfig extends PageMeta {
	/** 页面总开关；关闭后隐藏导航入口并将 /skills/ 重定向到 404。 */
	enable: boolean;
	/** 分类列表（决定 Chips 显示顺序）。 */
	categories: SkillCategory[];
	/** 可选被禁用的技能名称列表。 */
	disabledNames?: string[];
	/** 兼容通用 disabledKeys 别名。 */
	disabledKeys?: string[];
	/** 可选自定义数据（向后兼容；默认读取 src/data/skills.ts）。 */
	items?: SkillItem[];
}
