import { aboutConfig } from "./aboutConfig.ts";
import { albumsConfig } from "./albumsConfig.ts";
import { animeConfig } from "./animeConfig.ts";
import { compassConfig } from "./compassConfig.ts";
import { devicesConfig } from "./devicesConfig.ts";
import { friendsConfig } from "./friendsConfig.ts";
import { gamesConfig } from "./gamesConfig.ts";
import { momentsConfig } from "./momentsConfig.ts";
import { projectsConfig } from "./projectsConfig.ts";
import { seriesConfig } from "./seriesConfig.ts";
import { skillsConfig } from "./skillsConfig.ts";
import { timelineConfig } from "./timelineConfig.ts";

/** 获取所有被配置 enable: false 关闭的页面标识清单 */
export function getDisabledPages(): string[] {
	const disabled: string[] = [];
	if (skillsConfig.enable === false) disabled.push("skills");
	if (projectsConfig.enable === false) disabled.push("projects");
	if (timelineConfig.enable === false) disabled.push("timeline");
	if (devicesConfig.enable === false) disabled.push("devices");
	if (gamesConfig.enable === false) disabled.push("games");
	if (animeConfig.enable === false) disabled.push("anime");
	if (aboutConfig.enable === false) disabled.push("about");
	if (friendsConfig.enable === false) disabled.push("friends");
	if (momentsConfig.enable === false) disabled.push("moments");
	if (albumsConfig.enable === false) disabled.push("albums");
	if (compassConfig.enable === false) disabled.push("compass");
	if (seriesConfig.enable === false) disabled.push("series");
	return disabled;
}

/**
 * 校验页面路径是否应当被收录进 sitemap。
 * 排除被关闭页面（例如 /skills/, /skills/index.html 等）以及 404 跳转存根。
 */
export function isSitemapPageAllowed(pageUrl: string): boolean {
	const disabled = getDisabledPages();
	for (const p of disabled) {
		if (
			pageUrl.endsWith(`/${p}/`) ||
			pageUrl.endsWith(`/${p}`) ||
			pageUrl.includes(`/${p}/`)
		) {
			return false;
		}
	}
	return true;
}
