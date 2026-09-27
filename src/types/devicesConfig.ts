/**
 * 设备展示页配置类型定义。
 * 遵循 Shirone 配置契约：配置放在 src/config/devicesConfig.ts，
 * 数据放在 src/data/devices.ts，类型放在本文件；页面总开关关闭时 /devices/ 重定向 404 且导航隐藏。
 */

import type { PageMeta } from "./pageMeta.ts";

/** 设备生命周期状态 */
export type DeviceStatus = "active" | "backup" | "archived" | "wishlist";

/** 场景分类定义（数组顺序即筛选 Chips 渲染顺序） */
export interface DeviceCategory {
	/** 稳定标识，供设备引用与筛选。 */
	key: string;
	/** 用户可编辑的分类名称。 */
	label: string;
	/** Iconify 图标名（筛选 Chip 前置图标）。 */
	icon?: string;
	/** 可选的分类说明。 */
	description?: string;
}

/** 单个设备详细规格属性（键值对，可选用于展开详情） */
export interface DeviceSpecItem {
	key: string;
	label: string;
	value: string;
}

/** 单个设备条目 */
export interface DeviceItem {
	/** 可选独立开关；关闭后不参与渲染与计数（优先使用 config.disabledIds）。 */
	enable?: boolean;
	/** 稳定标识（URL 片段 / 测试选择器）。 */
	id: string;
	/** 设备名称（如 MacBook Pro 16"）。 */
	name: string;
	/** 品牌/厂商（如 Apple, Sony）。 */
	brand: string;
	/** 所属场景分类（对应 DeviceCategory.key）。 */
	category: string;
	/** 使用状态。 */
	status: DeviceStatus;
	/** 核心规格简述（卡片醒目位置，如 M3 Max / 64GB / 2TB）。 */
	specs: string;
	/** 可选详细规格列表。 */
	specDetails?: DeviceSpecItem[];
	/** 设备使用感受/简评。 */
	description: string;
	/** 设备展示图片（站内绝对路径，建议本地 WebP/AVIF）。 */
	image?: string;
	/** 无图片时使用的 Iconify 图标。 */
	icon?: string;
	/** 官方主页、测评或购买链接。 */
	link?: string;
	/** 主力/特别推荐标记（渲染 Featured 徽章）。 */
	featured?: boolean;
	/** 购入或开始使用年份（自由格式，如 "2024"）。 */
	year?: string;
}

/** 设备页全局配置（行为层） */
export interface DevicesConfig extends PageMeta {
	/** 页面总开关；关闭后隐藏导航入口并将 /devices/ 重定向到 404。 */
	enable: boolean;
	/** 场景分类列表（决定 Chips 渲染顺序）。 */
	categories: DeviceCategory[];
	/** 可选被禁用的设备 ID 列表。 */
	disabledIds?: string[];
	/** 兼容通用 disabledKeys 别名。 */
	disabledKeys?: string[];
	/** 可选自定义数据（向后兼容；默认读取 src/data/devices.ts）。 */
	items?: DeviceItem[];
}
