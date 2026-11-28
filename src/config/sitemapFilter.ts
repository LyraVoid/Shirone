import { scanAllAlbums } from "../utils/album-scanner.ts";
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
import { siteConfig } from "./siteConfig.ts";
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
 * 提取 URL/路径在 BASE 之后的第一个路径段，用于与页面标识做精确匹配。
 *
 * 关键语义（对比旧的 includes 子串匹配）：`/posts/about/` 的页面标识是
 * `posts` 而不是 `about`——只有站点顶层的 `/about/` 才对应被关闭的 about 页。
 */
function getSegmentsAfterBase(pageUrl: string): string[] {
	let pathname = pageUrl;
	try {
		pathname = new URL(pageUrl).pathname;
	} catch {
		// 相对路径按原样处理
	}
	const base = (siteConfig.base ?? "/").replace(/^\/+|\/+$/g, "");
	if (base && pathname === `/${base}`) return [];
	if (base && pathname.startsWith(`/${base}/`)) {
		pathname = pathname.slice(base.length + 1);
	}
	return pathname.split("/").filter(Boolean);
}

export function getPageRootSegment(pageUrl: string): string | null {
	const firstSegment = getSegmentsAfterBase(pageUrl)[0];
	if (firstSegment === undefined) return null;
	try {
		return decodeURIComponent(firstSegment);
	} catch {
		return firstSegment;
	}
}

let hiddenAlbumIdCache: Set<string> | null = null;

function getHiddenAlbumIds(): Set<string> {
	hiddenAlbumIdCache ??= new Set(
		scanAllAlbums()
			.filter((album) => album.hidden)
			.map((album) => album.id),
	);
	return hiddenAlbumIdCache;
}

/**
 * 校验页面路径是否应当被收录进 sitemap。
 * 排除被关闭页面（精确匹配顶层路径段，`/posts/about/` 不受 about 关闭影响），
 * 以及已隐藏相册的详情页（列表不可见 ⇒ 不应被搜索引擎收录）。
 */
export function isSitemapPageAllowed(pageUrl: string): boolean {
	const segment = getPageRootSegment(pageUrl);
	if (segment === null) return true;
	if (getDisabledPages().includes(segment)) return false;

	// F-121：隐藏相册详情页仍可直达，但不进 sitemap
	if (segment === "albums" && albumsConfig.enable !== false) {
		const segments = getSegmentsAfterBase(pageUrl);
		const albumId = segments.length >= 2 ? segments[1] : null;
		if (albumId) {
			let decoded = albumId;
			try {
				decoded = decodeURIComponent(albumId);
			} catch {
				// 保持原值
			}
			if (getHiddenAlbumIds().has(decoded)) return false;
		}
	}
	return true;
}
