/**
 * Content repository paths are relative to its root.
 * sync-content.mjs rewrites content-relative media references to the
 * theme repository's existing /images and /assets paths before build.
 */
/**
 * 番剧收藏数据（本地数据源）。
 * 用于番剧页：src/pages/anime.astro → organisms/AnimeSection → molecules/AnimeCard。
 *
 * 添加条目：在 animeData 中追加一项即可，状态筛选 chips 与计数自动生成。
 * - cover 省略时卡片显示主题色渐变占位（补图前不破版）；
 * - link 省略时封面不可点；rating 为 0-10 个人评分；
 * - progress 是结构化追番进度，watching 状态在卡片上渲染进度条。
 * JSON 数据源（外部收藏服务拉取）见 utils/anime-data.ts 的 AnimeSource 分发。
 */

import type { AnimeIdentity } from "../types/animeConfig.ts";

/** 收藏状态（Bangumi 领域通行五态） */
export type AnimeStatus =
	| "watching"
	| "completed"
	| "planned"
	| "onHold"
	| "dropped";

export interface AnimeItem {
	title: string;
	/** 封面图地址（相对 /public 或绝对 URL）；省略 = 渐变占位 */
	cover?: string;
	/** 条目外链（Bangumi/官方站等）；省略则封面不可点 */
	link?: string;
	status: AnimeStatus;
	/** 个人评分 0-10 */
	rating: number;
	/** 追番进度：已看 / 总集数 */
	progress: { watched: number; total: number };
	/** 一句话感想 */
	description?: string;
	/** 放送年份（展示用） */
	year: string;
	/** 制作公司 */
	studio?: string;
	/** 题材标签 */
	genres: string[];
	/** 观看时间段（年-月） */
	period?: { start: string; end: string };
	/** 条目来源身份标识（可选，用于跨源去重与归档） */
	identity?: AnimeIdentity;
}

export const animeData: AnimeItem[] = [
	{
		title: "Lycoris Recoil",
		cover: "/assets/anime/lkls.webp",
		link: "https://www.bilibili.com/bangumi/media/md28338623",
		status: "completed",
		rating: 9.8,
		progress: { watched: 12, total: 12 },
		description: "Girl's gunfight",
		year: "2022",
		studio: "A-1 Pictures",
		genres: ["Action", "Slice of Life"],
		period: { start: "2022-07", end: "2022-09" },
	},
	{
		title: "Yowamushi Pedal",
		cover: "/assets/anime/rynh.webp",
		link: "https://www.bilibili.com/bangumi/media/md2590",
		status: "watching",
		rating: 9.5,
		progress: { watched: 8, total: 12 },
		description: "Girl's daily life, sweet and healing",
		year: "2015",
		studio: "Nexus",
		genres: ["Daily life", "Healing"],
		period: { start: "2015-07", end: "2015-09" },
	},
	{
		title: "Asteroid in Love",
		cover: "/assets/anime/laxxx.webp",
		link: "https://www.bilibili.com/bangumi/media/md28224128",
		status: "watching",
		rating: 9.2,
		progress: { watched: 5, total: 12 },
		description: "Meeting girls among the stars, pure love and healing",
		year: "2020",
		studio: "Doga Kobo",
		genres: ["Romance", "Healing"],
		period: { start: "2020-01", end: "2020-03" },
	},
	{
		title: "Is the Order a Rabbit?",
		cover: "/assets/anime/tz1.webp",
		link: "https://www.bilibili.com/bangumi/media/md2762",
		status: "planned",
		rating: 9.0,
		progress: { watched: 12, total: 12 },
		description: "A group of girls' warm daily life",
		year: "2014",
		studio: "White Fox",
		genres: ["Daily life", "Healing"],
		period: { start: "2014-04", end: "2014-06" },
	},
	{
		title: "The Secret of the Magic Girl",
		cover: "/assets/anime/cmmn.webp",
		link: "https://www.bilibili.com/bangumi/media/md26625039",
		status: "watching",
		rating: 9.0,
		progress: { watched: 8, total: 12 },
		description: "Muli, Muli!",
		year: "2024",
		studio: "C2C",
		genres: ["Daily life", "Healing", "Magic"],
		period: { start: "2025-07", end: "2025-10" },
	},
];
