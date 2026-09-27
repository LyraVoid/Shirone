import type { ProjectsConfig } from "@/types/projectsConfig";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 项目页行为与展示配置。
 *
 * 遵循「配置管行为，数据管内容」原则：
 * - enable：页面总开关；false 时导航入口同步隐藏，访问 /projects/ 跳转 404；
 * - categories：筛选分类清单（数组顺序即页面顶部 Chips 顺序）；
 * - disabledKeys：可选被禁用的项目 key 列表（例如 ["folkpatch"]）；
 *
 * 注：项目的具体内容数据（标题、描述、技术栈、链接、封面等）请在 `src/data/projects.ts` 中维护。
 */
export const projectsConfig: ProjectsConfig = withUserConfig("projects", {
	enable: true,
	title: "$t:projects",
	description: "$t:projectsBanner",
	categories: [
		{
			key: "theme",
			label: "Theme",
			icon: "material-symbols:palette-outline-rounded",
		},
		{
			key: "android",
			label: "Android",
			icon: "material-symbols:android-rounded",
		},
	],
	// disabledKeys: [],
});
