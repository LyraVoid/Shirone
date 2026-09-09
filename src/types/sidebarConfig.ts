/**
 * 侧栏配置类型。值与默认配置见 src/config/sidebarConfig.ts。
 *
 * 编排采用判别联合：每个 widget 只携带自己的配置项，新增 widget 时
 * 在此扩展联合分支，并在 SideBar.astro 的 componentMap 注册组件。
 */

/** widget 在侧栏中的停靠位：top 位于顶部 / sticky 位于跟随滚动区域 */
export type SidebarWidgetSlot = "top" | "sticky";

/**
 * widget 所属列：primary 主栏（默认）/ secondary 副栏。
 * column 标签仅在 arrangement: "dual" 时生效；single 下全部落到主栏。
 */
export type SidebarColumn = "primary" | "secondary";

/** 侧栏编排：single 单栏 / dual 双栏（xl 1280px 起副栏介入） */
export type SidebarArrangement = "single" | "dual";

/** 主栏物理侧：left（默认）/ right；dual 下副栏落在对面 */
export type SidebarSide = "left" | "right";

/**
 * 页面标识符：widget 的 pages 过滤目标。
 * 每个页面通过 MainGridLayout 的 page prop 声明自身；MainGridLayout
 * 同时把它输出到 #swup-container 的 data-current-page（Swup 替换
 * 容器时同步属性），供 SideBar 在导航后重新过滤。
 */
export type SidebarPage =
	| "notFound" // 404 页面
	| "home" // 首页（[...page].astro 及其分页）
	| "archive" // 归档
	| "friends" // 友链
	| "moments" // 动态
	| "anime" // 番剧收藏
	| "compass" // 站点罗盘
	| "skills" // 技能
	| "projects" // 项目
	| "devices" // 设备展示
	| "timeline" // 时间线
	| "albums" // 相册
	| "about" // 关于
	| "categories" // 分类索引
	| "tags" // 标签索引
	| "rss" // RSS 订阅指南
	| "atom" // Atom 订阅指南
	| "post"; // 文章详情页

/** 资料卡（内容来自 profileConfig，无 WidgetLayout 标题外壳） */
export interface ProfileWidget {
	type: "profile";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

/** 分类列表（最多显示 collapseAfter 项，超出后链接到完整索引页） */
export interface CategoriesWidget {
	type: "categories";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 侧栏直接展示上限，默认 5 */
	collapseAfter?: number;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

/** 标签云（最多显示 collapseAfter 项，超出后链接到完整索引页） */
export interface TagsWidget {
	type: "tags";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 侧栏直接展示上限，默认 20 */
	collapseAfter?: number;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

/** 公告（内容来自 announcementConfig，text 为空时不渲染） */
export interface AnnouncementWidget {
	type: "announcement";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

/** 站点统计（数据自动汇总：文章/动态/分类/标签/总字数/运行天数） */
export interface StatsWidget {
	type: "stats";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

/** 月度文章历（有文日填色标记，点击日期展开当日文章） */
export interface CalendarWidget {
	type: "calendar";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
	/** 周起始日，默认 mon（周一） */
	startOfWeek?: "mon" | "sun";
}

/** 文章目录（仅文章详情页显示） */
export interface TocWidget {
	type: "toc";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	pages?: SidebarPage[];
}

/** 持久音乐播放器（内容来自 musicConfig） */
export interface MusicWidget {
	type: "music";
	enable: boolean;
	slot: SidebarWidgetSlot;
	column?: SidebarColumn;
	/** 限定显示的页面，省略或空数组表示所有页面 */
	pages?: SidebarPage[];
}

export type SidebarWidget =
	| ProfileWidget
	| CategoriesWidget
	| TagsWidget
	| AnnouncementWidget
	| StatsWidget
	| CalendarWidget
	| TocWidget
	| MusicWidget;

/**
 * 侧栏整体配置。components 渲染顺序 = 数组顺序，top 恒排在 sticky 之前。
 * arrangement 决定单/双栏：dual 时带 column: "secondary" 标签的 widget
 * 进入副栏（xl 1280px 以下自动退回单栏），其余留在主栏。
 */
export interface SidebarConfig {
	enable: boolean;
	arrangement: SidebarArrangement;
	/** 主栏物理侧，默认 left */
	side: SidebarSide;
	components: SidebarWidget[];
}
