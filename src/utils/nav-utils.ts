import type { NavBarLink } from "@/types/navBarConfig";

export type ResolvedNavBarLink = Omit<NavBarLink, "children"> & {
	children?: ResolvedNavBarLink[];
};

export function resolveNavBarLinks(links: NavBarLink[]): ResolvedNavBarLink[] {
	return links.map((link) => ({
		...link,
		children: link.children ? resolveNavBarLinks(link.children) : undefined,
	}));
}

/**
 * 站内路由归一化：去掉查询串、哈希与尾斜杠。
 * 站外链接与锚点返回 `null`，不参与功能裁剪。
 */
function normalizeNavRoute(url: string | undefined): string | null {
	if (!url?.startsWith("/")) return null;
	const pathname = url.split(/[?#]/)[0] ?? "";
	const normalized = pathname.replace(/\/+$/, "");
	return normalized === "" ? "/" : normalized;
}

/**
 * 裁掉指向「已关闭功能页面」的导航入口，children 递归处理。
 *
 * `unavailableRoutes` 由配置层按各功能的 `enable` 开关推导，形如 `"/moments"`
 * （站内路由、去尾斜杠）；关闭的功能页面会重定向到 `/404/`，导航不得保留死链。
 * 纯分组（自身无 `url`，只作为下拉容器）的子项被全部裁掉时整组隐藏，
 * 避免留下点不开的空下拉。
 */
export function pruneUnavailableNavLinks(
	links: ResolvedNavBarLink[],
	unavailableRoutes: ReadonlySet<string>,
): ResolvedNavBarLink[] {
	const kept: ResolvedNavBarLink[] = [];

	for (const link of links) {
		const children = link.children
			? pruneUnavailableNavLinks(link.children, unavailableRoutes)
			: undefined;

		if (children && children.length === 0 && link.url === undefined) continue;

		const route = normalizeNavRoute(link.url);
		if (route !== null && route !== "/" && unavailableRoutes.has(route)) {
			continue;
		}

		kept.push({ ...link, children });
	}

	return kept;
}

/**
 * 当前 URL → 导航高亮标识（pageKey）。
 * 分类/标签筛选优先于归档页（与抽屉/分类栏的筛选优先语义一致）；
 * 文章页、自定义页等无匹配时返回空串（不点亮任何导航项）。
 */
export function resolvePageKey(
	url: Pick<URL, "pathname" | "searchParams">,
	baseUrlOverride?: string,
): string {
	const rawBase = baseUrlOverride ?? import.meta.env?.BASE_URL ?? "/";
	const normalizedBase = rawBase.endsWith("/") ? rawBase : `${rawBase}/`;
	let pathname = url.pathname.replace(/\/+$/, "") || "/";

	if (
		normalizedBase !== "/" &&
		pathname.startsWith(rawBase.replace(/\/+$/, ""))
	) {
		pathname = pathname.slice(rawBase.replace(/\/+$/, "").length);
		pathname = pathname.replace(/\/+$/, "") || "/";
	}

	if (pathname === "/") return "home";
	if (url.searchParams.has("category")) return "categories";
	if (url.searchParams.has("tag")) return "tags";
	if (pathname === "/archive") return "archive";
	if (pathname === "/friends") return "friends";
	if (pathname === "/moments") return "moments";
	if (pathname === "/anime") return "anime";
	if (pathname === "/compass") return "compass";
	if (pathname === "/skills") return "skills";
	if (pathname === "/projects") return "projects";
	if (pathname === "/devices") return "devices";
	if (pathname === "/games") return "games";
	if (pathname === "/timeline") return "timeline";
	if (pathname === "/albums" || pathname.startsWith("/albums/"))
		return "albums";
	if (pathname === "/about") return "about";
	return "";
}
