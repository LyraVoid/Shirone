import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { aboutConfig } from "@/config/aboutConfig";
import { albumsConfig } from "@/config/albumsConfig";
import { animeConfig } from "@/config/animeConfig";
import { compassConfig } from "@/config/compassConfig";
import { devicesConfig } from "@/config/devicesConfig";
import { friendsConfig } from "@/config/friendsConfig";
import { gamesConfig } from "@/config/gamesConfig";
import { momentsConfig } from "@/config/momentsConfig";
import { projectsConfig } from "@/config/projectsConfig";
import { seriesConfig } from "@/config/seriesConfig";
import { skillsConfig } from "@/config/skillsConfig";
import { timelineConfig } from "@/config/timelineConfig";
import type {
	NavBarConfig,
	NavBarConfigOverride,
	NavBarLink,
	NavBarLinkOverride,
} from "@/types/navBarConfig";
import { getUserConfig } from "../utils/config-overlay.ts";
import { pruneUnavailableNavLinks } from "../utils/nav-utils.ts";

/**
 * 导航栏配置（统一单一来源）。
 * - LinkPresets：命名链接预设表 —— 名称 / 地址 / 图标单点维护，可整体复用；
 * - navBarConfig：导航结构 —— 顺序 + 分组（children 子菜单），
 *   同时驱动顶栏下拉菜单与全端导航抽屉。
 * 新增入口：先在 LinkPresets 登记预设，再在 navBarConfig.links 按序引用。
 *
 * 内容仓可用 `config/nav-bar.yaml` 整体替换 `links`，写法见 `NavBarLinkOverride`。
 * 无论哪种来源，指向已关闭功能页面的入口都会在 `navBarConfig` 处被裁掉。
 */
export const LinkPresets: Record<string, NavBarLink> = {
	Home: {
		name: i18n(I18nKey.home),
		url: "/",
		icon: "material-symbols:home-outline-rounded",
		pageKey: "home",
	},
	Archive: {
		name: i18n(I18nKey.archive),
		url: "/archive/",
		icon: "material-symbols:archive-outline-rounded",
		pageKey: "archive",
	},
	Friends: {
		name: i18n(I18nKey.friends),
		url: "/friends/",
		icon: "material-symbols:handshake-outline-rounded",
		pageKey: "friends",
	},
	Moments: {
		name: i18n(I18nKey.moments),
		url: "/moments/",
		icon: "material-symbols:auto-awesome-outline-rounded",
		pageKey: "moments",
	},
	Anime: {
		name: i18n(I18nKey.anime),
		url: "/anime/",
		icon: "material-symbols:live-tv-outline-rounded",
		pageKey: "anime",
	},
	Compass: {
		name: i18n(I18nKey.compass),
		url: "/compass/",
		icon: "material-symbols:explore-rounded",
		pageKey: "compass",
	},
	Skills: {
		name: i18n(I18nKey.skills),
		url: "/skills/",
		icon: "material-symbols:workspaces-outline-rounded",
		pageKey: "skills",
	},
	Projects: {
		name: i18n(I18nKey.projects),
		url: "/projects/",
		icon: "material-symbols:deployed-code-outline-rounded",
		pageKey: "projects",
	},
	Devices: {
		name: i18n(I18nKey.devices),
		url: "/devices/",
		icon: "material-symbols:devices-rounded",
		pageKey: "devices",
	},
	Games: {
		name: i18n(I18nKey.games),
		url: "/games/",
		icon: "material-symbols:sports-esports-outline-rounded",
		pageKey: "games",
	},
	Timeline: {
		name: i18n(I18nKey.timeline),
		url: "/timeline/",
		icon: "material-symbols:timeline-rounded",
		pageKey: "timeline",
	},
	Albums: {
		name: i18n(I18nKey.albums),
		url: "/albums/",
		icon: "material-symbols:photo-library-outline-rounded",
		pageKey: "albums",
	},
	Categories: {
		name: i18n(I18nKey.categories),
		url: "/categories/",
		icon: "material-symbols:folder-outline-rounded",
		pageKey: "categories",
	},
	Tags: {
		name: i18n(I18nKey.tags),
		url: "/tags/",
		icon: "material-symbols:tag-rounded",
		pageKey: "tags",
	},
	Series: {
		name: i18n(I18nKey.series),
		url: "/series/",
		icon: "material-symbols:auto-stories-outline-rounded",
		pageKey: "series",
	},
	About: {
		name: i18n(I18nKey.about),
		url: "/about/",
		icon: "material-symbols:info-outline-rounded",
		pageKey: "about",
	},
	GitHub: {
		name: "GitHub",
		url: "https://github.com/LyraVoid/Shirone",
		icon: "fa6-brands:github",
		external: true,
		pageKey: "github",
	},
};

const defaultNavBarConfig: NavBarConfig = {
	links: [
		LinkPresets.Home,
		LinkPresets.Archive,
		LinkPresets.Friends,
		LinkPresets.Moments,
		LinkPresets.Anime,
		LinkPresets.Compass,
		LinkPresets.Albums,
		{
			name: i18n(I18nKey.more),
			icon: "material-symbols:apps-rounded",
			children: [
				LinkPresets.Timeline,
				LinkPresets.Projects,
				LinkPresets.Devices,
				LinkPresets.Games,
				LinkPresets.Skills,
				// 分类/标签入口不进导航菜单（避免菜单项过多），预设已登记指向独立页面，
				// 需要时取消注释即可
				// LinkPresets.Categories,
				// LinkPresets.Tags,
				LinkPresets.About,
				LinkPresets.GitHub,
			],
		},
	],
};

import { resolveI18nText } from "../utils/i18n-utils.ts";

function fail(message: string): never {
	throw new Error(`[config] nav-bar：${message}`);
}

function resolveName(name: string): string {
	return resolveI18nText(name);
}

/**
 * 已关闭功能对应的站内路由（去尾斜杠），供 `pruneUnavailableNavLinks()` 裁剪导航入口。
 *
 * 功能关闭时对应页面会 `Astro.redirect("/404/")`，因此这些路由不得再出现在导航里。
 * 关闭判定只看配置，与导航结构无关，因此默认结构与内容仓声明式条目共用同一张表。
 */
const unavailableFeatureRoutes: ReadonlySet<string> = new Set([
	...(friendsConfig.enable ? [] : ["/friends"]),
	...(momentsConfig.enable ? [] : ["/moments"]),
	...(animeConfig.enable ? [] : ["/anime"]),
	...(compassConfig.enable ? [] : ["/compass"]),
	...(albumsConfig.enable ? [] : ["/albums"]),
	...(skillsConfig.enable ? [] : ["/skills"]),
	...(projectsConfig.enable ? [] : ["/projects"]),
	...(devicesConfig.enable ? [] : ["/devices"]),
	...(gamesConfig.enable ? [] : ["/games"]),
	...(timelineConfig.enable ? [] : ["/timeline"]),
	...(aboutConfig.enable ? [] : ["/about"]),
	...(seriesConfig.enable ? [] : ["/series"]),
]);

/**
 * 把内容仓的声明式导航条目还原成 `NavBarLink`。
 *
 * 预设名与 i18n 词条只有在这里才能校验（`LinkPresets` 与 `I18nKey` 都住在代码仓，
 * 生成期的 Node 脚本受路径别名所限读不到），因此错误在构建加载配置时抛出。
 */
export function resolveNavBarLinks(
	entries: readonly NavBarLinkOverride[],
	presets: Record<string, NavBarLink> = LinkPresets,
): NavBarLink[] {
	return entries.map((entry) => {
		let base: NavBarLink | null = null;
		if (entry.preset !== undefined) {
			base = presets[entry.preset] ?? null;
			if (!base) {
				fail(
					`未知的预设 "${entry.preset}"。可用预设：${Object.keys(presets).join("、")}。`,
				);
			}
		}

		const name =
			entry.name !== undefined ? resolveName(entry.name) : base?.name;
		if (name === undefined) {
			fail("每个条目都需要 name，或用 preset 引用一个内置预设。");
		}

		// 未声明 children 时沿用预设自带的子菜单（已由 ...base 带入）。
		return {
			...base,
			name,
			...(entry.url !== undefined ? { url: entry.url } : {}),
			...(entry.icon !== undefined ? { icon: entry.icon } : {}),
			...(entry.pageKey !== undefined ? { pageKey: entry.pageKey } : {}),
			...(entry.external !== undefined ? { external: entry.external } : {}),
			...(entry.children
				? { children: resolveNavBarLinks(entry.children, presets) }
				: {}),
		};
	});
}

const userNavBar = getUserConfig("navBar") as NavBarConfigOverride | undefined;

/**
 * 导航栏最终结构。
 *
 * 默认结构与内容仓 `config/nav-bar.yaml`（声明式列表，整体替换默认导航，不走任何
 * enable 分支）在这里汇合后统一裁剪：功能关掉时入口一并消失，两种模式下行为一致，
 * 不会留下点进去 404 的死链。
 */
export const navBarConfig: NavBarConfig = {
	links: pruneUnavailableNavLinks(
		resolveNavBarLinks(
			userNavBar ? userNavBar.links : defaultNavBarConfig.links,
		),
		unavailableFeatureRoutes,
	),
};
