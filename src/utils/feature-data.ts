/**
 * 特色页面数据解析与合并工具。
 * 遵循「配置管行为，数据管内容」原则：
 * 将 src/config/*Config.ts 的控制行为（disabledKeys、order 等）
 * 应用于 src/data/*.ts 的内容数据集合。
 */
import { devicesData } from "../data/devices.ts";
import { gamesData } from "../data/games.ts";
import { projectsData } from "../data/projects.ts";
import { skillsData } from "../data/skills.ts";
import { timelineData } from "../data/timeline.ts";
import type { DeviceItem, DevicesConfig } from "../types/devicesConfig.ts";
import type { GameItem, GamesConfig } from "../types/gamesConfig.ts";
import type { ProjectItem, ProjectsConfig } from "../types/projectsConfig.ts";
import type { SkillItem, SkillsConfig } from "../types/skillsConfig.ts";
import type { TimelineConfig, TimelineItem } from "../types/timelineConfig.ts";
import { url } from "./url-utils.ts";

/**
 * 依据禁用列表过滤条目（纯函数）。
 */
export function filterByDisabledKeys<T>(
	items: readonly T[],
	disabledKeys?: readonly string[],
	getKey: (item: T) => string = (item) =>
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).key ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).id ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).name ??
		(
			item as unknown as {
				key?: string;
				id?: string;
				name?: string;
				title?: string;
			}
		).title ??
		"",
): T[] {
	if (!disabledKeys || disabledKeys.length === 0) {
		return [...items];
	}
	const disabledSet = new Set(disabledKeys);
	return items.filter((item) => !disabledSet.has(getKey(item)));
}

/**
 * 解析项目页展示数据。
 */
export function resolveProjectsData(
	config: ProjectsConfig,
	customItems?: readonly ProjectItem[],
): ProjectItem[] {
	const source = customItems ?? config.items ?? projectsData;
	const enabledItems = source.filter((item) => item.enable !== false);
	const filtered = filterByDisabledKeys(
		enabledItems,
		config.disabledKeys,
		(item) => item.key,
	);
	return filtered.map((item) => ({
		...item,
		cover: item.cover
			? item.cover.startsWith("/")
				? url(item.cover)
				: item.cover
			: undefined,
	}));
}

/**
 * 解析技能页展示数据。
 */
export function resolveSkillsData(
	config: SkillsConfig,
	customItems?: readonly SkillItem[],
): SkillItem[] {
	const source = customItems ?? config.items ?? skillsData;
	const enabledItems = source.filter((item) => item.enable !== false);
	return filterByDisabledKeys(
		enabledItems,
		config.disabledNames ?? config.disabledKeys,
		(item) => item.name,
	);
}

/**
 * 将时间线日期字符串解析为可比较的数值时间戳。
 * 支持格式：
 * - 单一日期: "2026.08", "2024-11", "2024/11", "2024.11.05"
 * - 区间: "2025.03 – Present", "2020.09 – 2024.06", "2020.09 - 至今"
 * 若区间包含 Present / 至今，终点按无穷大处理；
 * 排序主要基于起始时间（若起始时间相同则比较结束时间）。
 * 无法识别的格式返回负无穷（desc排在末尾）。
 */
export function parseTimelineDateKey(dateStr: string): { start: number; end: number } {
	if (!dateStr || typeof dateStr !== "string") {
		return { start: -Infinity, end: -Infinity };
	}

	const parts = dateStr.split(/\s*(?:–|-|—|~|to)\s*/i);
	const startPart = parts[0]?.trim();
	const endPart = parts[1]?.trim();

	const parseSingleDate = (str: string | undefined, isEnd = false): number => {
		if (!str) return isEnd ? -Infinity : -Infinity;
		const normalized = str.toLowerCase();
		if (
			normalized === "present" ||
			normalized === "now" ||
			normalized === "current" ||
			str.includes("今")
		) {
			return Infinity;
		}

		// 匹配形如 2026.08, 2026-08, 2026/08, 2026.08.12
		const match = str.match(/(\d{4})(?:[.\-/](\d{1,2}))?(?:[.\-/](\d{1,2}))?/);
		if (!match) return -Infinity;

		const year = Number.parseInt(match[1], 10);
		const month = match[2] ? Number.parseInt(match[2], 10) - 1 : (isEnd ? 11 : 0);
		const day = match[3] ? Number.parseInt(match[3], 10) : (isEnd ? 28 : 1);

		const d = new Date(Date.UTC(year, month, day));
		return Number.isNaN(d.getTime()) ? -Infinity : d.getTime();
	};

	const start = parseSingleDate(startPart, false);
	const end = endPart ? parseSingleDate(endPart, true) : start;

	return { start, end };
}

/**
 * 解析时间线页展示数据。
 */
export function resolveTimelineData(
	config: TimelineConfig,
	customItems?: readonly TimelineItem[],
): TimelineItem[] {
	const source = customItems ?? config.items ?? timelineData;
	const enabledItems = source.filter((item) => item.enable !== false);
	const filtered = filterByDisabledKeys(
		enabledItems,
		config.disabledTitles ?? config.disabledKeys,
		(item) => item.title,
	);

	const itemsWithIndex = filtered.map((item, index) => ({
		item,
		index,
		dateKey: parseTimelineDateKey(item.date),
	}));

	itemsWithIndex.sort((a, b) => {
		const order = config.order ?? "desc";
		let diff = 0;
		if (a.dateKey.start !== b.dateKey.start) {
			diff = a.dateKey.start - b.dateKey.start;
		} else if (a.dateKey.end !== b.dateKey.end) {
			diff = a.dateKey.end - b.dateKey.end;
		}

		if (diff !== 0) {
			return order === "asc" ? diff : -diff;
		}
		// 稳定排序：相同时保持原书写相对顺序
		return a.index - b.index;
	});

	return itemsWithIndex.map((x) => x.item);
}

/**
 * 解析设备页展示数据。
 */
export function resolveDevicesData(
	config: DevicesConfig,
	customItems?: readonly DeviceItem[],
): DeviceItem[] {
	const source = customItems ?? config.items ?? devicesData;
	const enabledItems = source.filter((item) => item.enable !== false);
	const filtered = filterByDisabledKeys(
		enabledItems,
		config.disabledIds ?? config.disabledKeys,
		(item) => item.id,
	);
	return filtered.map((item) => ({
		...item,
		image: item.image
			? item.image.startsWith("/")
				? url(item.image)
				: item.image
			: undefined,
	}));
}

/**
 * 解析游戏页展示数据。
 */
export function resolveGamesData(
	config: GamesConfig,
	customItems?: readonly GameItem[],
): GameItem[] {
	const source = customItems ?? config.items ?? gamesData;
	const enabledItems = source.filter((item) => item.enable !== false);
	const filtered = filterByDisabledKeys(
		enabledItems,
		config.disabledIds ?? config.disabledKeys,
		(item) => item.id,
	);
	return filtered.map((item) => ({
		...item,
		cover: item.cover
			? item.cover.startsWith("/")
				? url(item.cover)
				: item.cover
			: undefined,
	}));
}
