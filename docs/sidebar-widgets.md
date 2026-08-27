# 侧栏 Widget 清单与契约 — Shirone 主题

> 本文档记录 `SideBar.astro` 支持的全部 widget：
> 配置形式、视觉规格、数据源、依赖与实现要点。
> 适用版本：Astro 7 + Svelte 5 + Tailwind CSS 4。
> 配套文档：`docs/sidebar-system.md`（编排机制）、`src/config/README.md`（配置契约）、`docs/fab-system.md`（FAB 与悬浮目录系统）。

---

## 1. Widget 契约总览

SideBar 通过 `src/config/sidebarConfig.ts` 中的 `components` 数组动态编排 widget。
每个条目的 `type` 对应一个注册在 `SideBar.astro` 的组件：

| type | 组件 | 默认 slot | 职责与呈现 |
|---|---|---|---|
| `profile` | `Profile` | top | 博主资料卡片（头像 + 名字 + 简介 + 社交链接） |
| `categories` | `Categories` | sticky | 分类列表（按文章数降序，支持 `collapseAfter`） |
| `tags` | `Tags` | sticky | 标签列表（按文章数降序，支持 `collapseAfter`） |
| `announcement` | `Announcement` | top | 独立公告卡片（由 `announcementConfig.ts` 驱动） |
| `stats` | `SiteStats` | top | 站点统计规格表 |
| `calendar` | `Calendar` | sticky | 月度文章历（SSR 直出 + 水合岛） |
| `music` | `MusicSidebar` | top | 持久音乐播放器（全局配置 + widget 双开关，默认关闭） |
| `toc` | `SidebarTOC` | sticky | 当前文章目录（通常只在文章页显示） |

### 1.1 通用字段

每个 widget 条目都支持以下字段（判别联合类型中的公共部分）：

```ts
interface SidebarWidgetBase {
    /** 是否启用该 widget，false 则完全不渲染 */
    enable: boolean;
    /** 放置槽位：top（顶部随页面滚动）| sticky（吸顶跟随） */
    slot: "top" | "sticky";
    /** 所在分栏（dual 编排下有效）：primary（主栏）| secondary（副栏） */
    column?: "primary" | "secondary";
    /** 允许展示的页面列表，不填或包含当前页面类型时显示 */
    pages?: SidebarPage[];
}
```

---

## 2. Profile — 博主资料卡片

- **数据源**：`src/config/profileConfig.ts` 中的 `profileConfig`；
- **渲染**：头像（`Avatar` 原子）、博主名、简介与社交链接（`IconButton` 原子 + `Tooltip` 原子）；
- **页面范围**：全页面通用，通常置于主栏 `slot: "top"` 顶部。

---

## 3. Categories — 分类列表

- **数据源**：`src/utils/content-utils.ts` 的 `getCategoryList()`；
- **渲染**：`WidgetLayout` 外壳 + 分类项列表；
- **折叠行为**：支持 `collapseAfter` 字段，超出数量后以平滑动画展开/收起；
- **页面范围**：全页面通用。

---

## 4. Tags — 标签列表

- **数据源**：`src/utils/content-utils.ts` 的 `getTagList()`；
- **渲染**：`WidgetLayout` 外壳 + 标签 Chip 列表；
- **折叠行为**：支持 `collapseAfter` 字段；
- **页面范围**：全页面通用。

---

## 5. Announcement — 站点公告

- **数据源**：`src/config/announcementConfig.ts` 中的 `announcementConfig`；
- **渲染**：纯卡片（无 `WidgetLayout` 标题外壳），支持关闭与 localStorage 记忆；
- **零额外负担**：内容为空或已关闭时不渲染 DOM；
- **页面范围**：默认 `pages: ["home"]`。

---

## 6. SiteStats — 站点统计

- **数据源**：`src/utils/site-stats.ts`（总字数、文章数、运行天数等备忘化计算）；
- **渲染**：`WidgetLayout` 外壳 + 键值对网格；
- **页面范围**：通常在首页与归档页显示。

---

## 7. Calendar — 月度文章历

- **数据源**：`src/utils/calendar-data.ts`（文章日期聚合）；
- **渲染**：`CalendarView.svelte`（`client:visible` 水合岛）；
- **页面范围**：全页面通用。

---

## 8. MusicSidebar — 侧栏音乐播放器

- **数据源**：本地 `src/data/music.ts` / 自定义 `tracks` / Meting API 云端歌单；
- **渲染**：M3 卡片风格播放器（专辑封面、歌曲信息、进度条、播放/上一首/下一首/音量控制）；
- **零额外负担**：仅在全局 `musicConfig.enable` 且本 widget `enable: true` 时动态加载；
- **页面范围**：全页面通用，挂载于持久侧栏中，Swup 导航不中断播放。

---

## 9. 音乐配置示例

```ts
{ type: "music", enable: false, slot: "top" }
```

---

## 10. SidebarTOC — 当前文章目录

- **数据源**：当前文章的 Markdown headings，由页面布局传给 SideBar，再透传给 `SidebarTOC`；
- **渲染**：`WidgetLayout` + 内嵌 `<table-of-contents>` 自定义元素及 `TocList` 原子，内容区限制为视口内高度（`max-height: calc(100dvh - 15rem)`）并独立滚动，平滑高亮当前阅读位置（M3 tonal pill 状态）；
- **页面范围**：默认使用 `pages: ["post"]`，侧栏位于 Swup 容器外，目录内容与当前锚点状态由既有 Swup 同步逻辑维护；
- **移动端互补**：桌面端（≥ 1024px）呈现本组件，移动端与平板端则自动切换由右下角悬浮控制流中的 `FloatingTOCPanel` 提供大纲抽屉（详见 `docs/fab-system.md`）。

---

## 11. 新增 widget 的设计约束

1. **外观语言**：优先复用既有原子——`MetaIcon`（单图标徽标）、`Chip` / `Button` / `Card`、`WidgetLayout`（标题外壳）、`AccentBar`；不要自创新的徽标/容器风格；
2. **外壳取舍**：短消息类（如公告）不用 `WidgetLayout`；有明确"分组 + 列表"语义的（分类/标签/统计），以及音乐等需要统一侧栏标题的有机体使用；
3. **取数**：一律走 `utils/content-utils` 或独立 utils（如 `site-stats`），组件内不直接 `getCollection`；多页面共享的重计算（如总字数）要备忘化；
4. **文案**：标题与标签用 `i18n(I18nKey.*)`，新增 key 必须补全 `src/i18n/languages/` 全部 10 种语言；
5. **默认关闭**：新 widget 的默认条目 `enable: false`，保证存量站点 DOM 零变化；
6. **文档同步**：`sidebar-system.md` §7 总览表 + 本文件补一节；新增 organism 同步更新 `atomic-structure.md` §6 的清单与数量。
