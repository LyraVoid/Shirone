/**
 * Content repository paths are relative to its root.
 * sync-content.mjs rewrites content-relative media references to the
 * theme repository's existing /images and /assets paths before build.
 */
/**
 * 站点罗盘数据（本地数据源）。
 * 用途：src/pages/compass.astro → organisms/CompassSection → molecules/CompassTile。
 * 添加站点：往对应 Shelf.entries 追加一项；数组顺序即展示顺序。
 * - icon：Iconify 名（material-symbols:xxx）或图片 URL（http(s)/绝对路径）；
 *   省略时瓷砖显示 label 首字母 tonal 块（不自动抓取 favicon）。
 * - image：用户自定义图片 URL（http(s)/绝对路径），优先于 icon 渲染；
 *   加载失败自动降级为首字母块。
 */

/** 单条站点记录 */
export interface CompassEntry {
	/** 站点名（瓷砖标题） */
	label: string;
	/** 外链地址 */
	href: string;
	/** 一句话说明（瓷砖副行；省略则显示域名） */
	note?: string;
	/** 图标：Iconify 名或图片 URL；省略 = 首字母兜底 */
	icon?: string;
	/** 用户自定义图片（http(s)/绝对路径）：优先于 icon 渲染；省略则走 icon/首字母 */
	image?: string;
}

/** 分组（Shelf = 罗盘上的收纳格） */
export interface CompassShelf {
	/** 锚点 id（字母数字，作分组定位与跳转） */
	key: string;
	/** 分组名 */
	name: string;
	/** 分组图标（Iconify 名，SectionTitle 行首） */
	icon?: string;
	/** 分组副文案（标题下弱文本，可选） */
	blurb?: string;
	entries: CompassEntry[];
}

export const compassData: CompassShelf[] = [
	{
		key: "dev",
		name: "Development",
		icon: "material-symbols:code-rounded",
		blurb: "Sites I keep open while writing code",
		entries: [
			{
				label: "GitHub",
				href: "https://github.com",
				note: "Code hosting & collaboration",
				icon: "fa6-brands:github",
			},
			{
				label: "MDN",
				href: "https://developer.mozilla.org",
				note: "Authoritative web docs",
				icon: "material-symbols:menu-book-rounded",
			},
			{
				label: "Stack Overflow",
				href: "https://stackoverflow.com",
				note: "Q&A and debugging",
			},
		],
	},
	{
		key: "design",
		name: "Design",
		icon: "material-symbols:palette-outline-rounded",
		blurb: "Colors, icons and inspiration",
		entries: [
			{
				label: "Iconify",
				href: "https://icon-sets.iconify.design",
				note: "Searchable open-source icon sets",
			},
			{
				label: "Material Symbols",
				href: "https://fonts.google.com/icons",
				note: "Official M3 icon set",
				icon: "material-symbols:star-rounded",
			},
			{
				label: "Excalidraw",
				href: "https://excalidraw.com",
				note: "Hand-drawn whiteboard collaboration",
			},
		],
	},
	{
		key: "tools",
		name: "Tools",
		icon: "material-symbols:build-outline-rounded",
		entries: [
			{
				label: "Squoosh",
				href: "https://squoosh.app",
				note: "Image compression & conversion",
			},
			{
				label: "Regex101",
				href: "https://regex101.com",
				note: "Regex testing & debugging",
			},
		],
	},
	{
		key: "reads",
		name: "Reading",
		icon: "material-symbols:auto-stories-outline-rounded",
		entries: [
			{ label: "Hacker News", href: "https://news.ycombinator.com" },
			{ label: "V2EX", href: "https://www.v2ex.com" },
			{
				label: "Solidot",
				href: "https://www.solidot.org",
				note: "Tech and culture news",
			},
		],
	},
];
