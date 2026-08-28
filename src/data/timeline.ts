/**
 * Content repository paths are relative to its root.
 * sync-content.mjs rewrites content-relative media references to the
 * theme repository's existing /images and /assets paths before build.
 */
/**
 * 时间线页数据源（纯内容）。
 * 页面展示与筛选规则由 src/config/timelineConfig.ts 控制。
 */
import type { TimelineItem } from "@/types/timelineConfig";

export const timelineData: TimelineItem[] = [
	{
		title: "Shirone Theme M3E Major Architecture Upgrade",
		date: "2026.08",
		category: "milestone",
		subtitle: "Open Source Project",
		description:
			"Refactored the entire blog theme into a Material 3 Expressive atomic component system with token-driven styling, complete keyboard navigation, and full accessibility compliance.",
		highlights: [
			"Implemented dynamic HCT palette calculation and state layer tokens",
			"Added multi-page capabilities: Timeline, Skills, Projects, and Protected Albums",
			"Zero-error strict type-checking and automated visual regression locks",
		],
		tags: ["Astro", "Svelte 5", "M3E", "Tailwind 4"],
		links: [
			{
				label: "GitHub Repository",
				url: "https://github.com/LyraVoid/Shirone",
				icon: "fa6-brands:github",
			},
		],
		icon: "material-symbols:rocket-launch-rounded",
		featured: true,
	},
	{
		title: "Senior Frontend Engineer",
		date: "2025.03 – Present",
		category: "career",
		subtitle: "Technology Lab",
		location: "Tokyo, Japan",
		description:
			"Leading frontend architecture, web performance optimization, and interactive design system development for modern web platforms.",
		highlights: [
			"Spearheaded design system unification across web products",
			"Reduced core bundle load times by 40% using modern SSR and asset pipelines",
		],
		tags: ["TypeScript", "Architecture", "Performance", "Design System"],
		icon: "material-symbols:work-rounded",
		featured: true,
	},
	{
		title: "Full-Stack Web Application Launch",
		date: "2024.11",
		category: "project",
		subtitle: "Independent Creation",
		description:
			"Designed and built an end-to-end creative workflow application with real-time collaboration and cloud synchronization.",
		highlights: [
			"Designed intuitive fluid canvas interface with low-latency interaction",
			"Built serverless backend APIs with edge caching and relational persistence",
		],
		tags: ["Svelte", "Node.js", "PostgreSQL", "Cloudflare"],
		icon: "material-symbols:deployed-code-outline-rounded",
	},
	{
		title: "Computer Science & Engineering Degree",
		date: "2020.09 – 2024.06",
		category: "education",
		subtitle: "University of Technology",
		location: "Hangzhou, China",
		description:
			"Focused on computer systems, software engineering, human-computer interaction, and distributed architectures.",
		highlights: [
			"Graduated with honors and outstanding graduate thesis award",
			"Led university open source student community and hackathons",
		],
		tags: ["Computer Science", "Algorithms", "Software Engineering"],
		icon: "material-symbols:school-rounded",
	},
	{
		title: "Started Personal Blog & Tech Notes",
		date: "2022.04",
		category: "life",
		subtitle: "First Step into Tech Writing",
		description:
			"Published my first article online and began documenting frontend exploration, creative coding, and personal reflections.",
		tags: ["Blogging", "Writing", "Open Web"],
		icon: "material-symbols:edit-note-rounded",
	},
];

/** 获取所有时间线数据列表 */
export function getTimelineList(): TimelineItem[] {
	return timelineData;
}
