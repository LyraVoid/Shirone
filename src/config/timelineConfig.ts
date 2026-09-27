import type { TimelineConfig } from "@/types/timelineConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 时间线页行为与展示配置。
 *
 * 遵循「配置管行为，数据管内容」原则：
 * - enable：页面总开关；false 时导航入口同步隐藏，访问 /timeline/ 跳转 404；
 * - categories：筛选分类清单（数组顺序即页面顶部 Chips 顺序）；
 * - order：排序方向，默认为 "desc"（时间倒序，最新在前）；可选 "asc"（正序）；
 * - disabledTitles：可选被禁用的事件标题列表；
 *
 * 注：时间线的具体节点数据（标题、日期、经历描述、要点列表、关联链接等）请在 `src/data/timeline.ts` 中维护。
 */
export const timelineConfig: TimelineConfig = withUserConfig("timeline", {
	enable: true,
	title: "$t:timeline",
	description: "$t:timelineBanner",
	categories: [
		{
			key: "milestone",
			label: "Milestones",
			icon: "material-symbols:flag-rounded",
		},
		{
			key: "project",
			label: "Projects",
			icon: "material-symbols:code-rounded",
		},
		{
			key: "career",
			label: "Career",
			icon: "material-symbols:work-rounded",
		},
		{
			key: "education",
			label: "Education",
			icon: "material-symbols:school-rounded",
		},
		{
			key: "life",
			label: "Life",
			icon: "material-symbols:favorite-rounded",
		},
	],
	order: "desc",
	// disabledTitles: [],
});
