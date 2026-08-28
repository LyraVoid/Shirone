/**
 * Content repository paths are relative to its root.
 * sync-content.mjs rewrites content-relative media references to the
 * theme repository's existing /images and /assets paths before build.
 */
/**
 * 项目页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/projectsConfig.ts 控制。
 */
import type { ProjectItem } from "@/types/projectsConfig";

export const projectsData: ProjectItem[] = [
	{
		key: "shirone",
		title: "Shirone",
		summary:
			"An Astro blog theme shaped around an M3E component system, expressive content, and resilient client navigation.",
		category: "theme",
		phase: "building",
		technologies: ["Astro", "Svelte", "TypeScript", "Tailwind CSS"],
		icon: "material-symbols:deployed-code-outline-rounded",
		cover: "/assets/projects/shirone.webp",
		coverAlt: "Shirone theme homepage preview",
		featured: true,
		repository: "https://github.com/LyraVoid/Shirone",
		year: "2026",
	},
	{
		key: "folkpatch",
		title: "FolkPatch",
		summary: "A kernel-level root solution for Android, built on APatch.",
		category: "android",
		phase: "building",
		technologies: ["Kotlin", "APatch", "Android"],
		icon: "material-symbols:terminal-rounded",
		repository: "https://github.com/LyraVoid/FolkPatch",
	},
	{
		key: "kernelpatch",
		title: "KernelPatch",
		summary:
			"A kernel patch framework that powers APatch-style root on Android by loading code into the running kernel.",
		category: "android",
		phase: "shipped",
		technologies: ["C", "Linux Kernel", "Android"],
		icon: "material-symbols:extension-outline-rounded",
		repository: "https://github.com/lyravoid/KernelPatch",
	},
];

/** 获取所有项目数据列表 */
export function getProjectsList(): ProjectItem[] {
	return projectsData;
}
