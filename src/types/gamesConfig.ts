/**
 * 游戏展示页配置类型定义。
 * 遵循 Shirone 配置契约：配置放在 src/config/gamesConfig.ts，
 * 数据放在 src/data/games.ts，类型放在本文件；页面总开关关闭时 /games/ 重定向 404 且导航隐藏。
 *
 * 与设备/番剧页的区别：游戏封面是横屏的（胶囊图），卡片以横向封面为主视觉，
 * 因此 GameItem 的媒体字段是 cover（cover 填充的宽幅 banner）而非方图。
 */

import type { PageMeta } from "./pageMeta.ts";

/** 游玩状态 */
export type GameStatus = "playing" | "completed" | "backlog" | "wishlist";

/** 游戏分类定义（数组顺序即筛选 Chips 渲染顺序） */
export interface GameCategory {
	/** 稳定标识，供游戏引用与筛选。 */
	key: string;
	/** 用户可编辑的分类名称。 */
	label: string;
	/** Iconify 图标名（筛选 Chip 前置图标）。 */
	icon?: string;
	/** 可选的分类说明。 */
	description?: string;
}

/** 单个游戏条目 */
export interface GameItem {
	/** 可选独立开关；关闭后不参与渲染与计数（优先使用 config.disabledIds）。 */
	enable?: boolean;
	/** 稳定标识（URL 片段 / 测试选择器）。 */
	id: string;
	/** 游戏名称。 */
	name: string;
	/** 开发商/工作室（如 miHoYo, FromSoftware）。 */
	developer: string;
	/** 所属分类（对应 GameCategory.key）。 */
	category: string;
	/** 游玩状态。 */
	status: GameStatus;
	/** 横屏封面图（站内绝对路径，建议 16:9 或更宽的本地 WebP/AVIF）。 */
	cover?: string;
	/** 无封面时使用的 Iconify 图标。 */
	icon?: string;
	/** 评分（0–5，支持 0.5 步进）。 */
	rating?: number;
	/** 已游玩时长（小时）。 */
	hours?: number;
	/** 平台（如 PC / PlayStation / Switch / Mobile）。 */
	platform?: string;
	/** 发行年份（自由格式，如 "2024"）。 */
	year?: string;
	/** 类型标签（渲染为卡片上的 chips）。 */
	tags?: string[];
	/** 游戏简评/感受。 */
	description: string;
	/** 商店页、官网或评测链接。 */
	link?: string;
	/** 特别推荐标记（渲染 Featured 徽章）。 */
	featured?: boolean;
}

/** 游戏页全局配置（行为层） */
export interface GamesConfig extends PageMeta {
	/** 页面总开关；关闭后隐藏导航入口并将 /games/ 重定向到 404。 */
	enable: boolean;
	/** 游戏分类列表（决定 Chips 渲染顺序）。 */
	categories: GameCategory[];
	/** 可选被禁用的游戏 ID 列表。 */
	disabledIds?: string[];
	/** 兼容通用 disabledKeys 别名。 */
	disabledKeys?: string[];
	/** 可选自定义数据（向后兼容；默认读取 src/data/games.ts）。 */
	items?: GameItem[];
}
