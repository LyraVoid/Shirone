# 侧栏系统（SideBar）使用指导 — Shirone 主题

> 数据驱动的侧栏 widget 容器：单/双栏编排、响应式规则、页框联动与扩展方式。
> 配套文档：`sidebar-widgets.md`（内置组件逐个文档）、`common-components.md`（新增 widget 流程）、
> `atomic-structure.md`（分层）、`m3e-standard.md`（令牌与原子）。

---

## 1. 定位

`SideBar.astro`（`src/components/organisms/`）是**纯编排容器**，不做任何业务：

- 过滤：只渲染 `enable: true` 的 widget；
- 分栏：按 `column` 标签把 widget 分给主栏 / 副栏（各挂一个 SideBar 实例）；
- 分停靠位：栏内再按 `slot` 分 top（固定顶部）/ sticky（跟随滚动）；
- 渲染：经中央注册表 `componentMap` 把 widget 配置整份透传。

所有行为由 `src/config/sidebarConfig.ts` 驱动，类型定义在 `src/types/sidebarConfig.ts`。

## 2. 编排模型

### 2.1 顶层字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enable` | `boolean` | `true` | 侧栏总开关，false 时整列不渲染 |
| `arrangement` | `"single" \| "dual"` | `"single"` | 单栏 / 双栏 |
| `side` | `"left" \| "right"` | `"left"` | 主栏物理侧；dual 下副栏自动落对面 |
| `components` | `SidebarWidget[]` | — | widget 清单，**数组顺序 = 渲染顺序**（top 恒在 sticky 前） |

### 2.2 widget 三标签

每个 widget 条目携带三类标签，均独立生效：

| 标签 | 可选值 | 缺省 | 说明 |
|---|---|---|---|
| `enable` | `boolean` | —（必填） | 独立开关，false 不渲染该 widget |
| `slot` | `"top" \| "sticky"` | —（必填） | 栏内停靠位：top 固定顶部 / sticky 跟随滚动 |
| `column` | `"primary" \| "secondary"` | `"primary"` | 分栏标签，**仅 `arrangement: "dual"` 时生效** |

### 2.3 判别联合类型

widget 的专属配置（如分类的折叠阈值 `collapseAfter`）只存在于自己的联合分支里，新增 widget 时扩展 `SidebarWidget` 联合即可，不搞扁平大对象。

### 2.4 页面级过滤（pages 标签）

每个 widget 可选 `pages?: SidebarPage[]` 字段，控制只在哪些页面显示：

```ts
{ type: "stats", enable: true, slot: "top", column: "secondary", pages: ["home", "archive"] }
// 只在首页和归档页显示统计，文章页不显示
```

- **省略或空数组**：在所有页面显示（向后兼容，无需改动现有配置）；
- **有值**：仅在指定页面显示，其他页面自动隐藏。

可用页面标识符（`SidebarPage`）：

| 标识符 | 对应页面 |
|---|---|
| `"notFound"` | 404 页面（`404.astro`） |
| `"home"` | 首页（`[...page].astro` 及其分页） |
| `"archive"` | 归档页（`archive.astro`） |
| `"friends"` | 友链页（`friends.astro`） |
| `"moments"` | 动态页（`moments.astro`） |
| `"anime"` | 番剧页（`anime.astro`） |
| `"compass"` | 站点罗盘页（`compass.astro`） |
| `"skills"` | 技能页（`skills.astro`） |
| `"projects"` | 项目页（`projects.astro`） |
| `"timeline"` | 时间线页（`timeline.astro`） |
| `"albums"` | 相册索引与详情页（`albums.astro`、`albums/[id]/index.astro`） |
| `"about"` | 关于页（`about.astro`） |
| `"categories"` | 分类索引页（`categories.astro`） |
| `"tags"` | 标签索引页（`tags.astro`） |
| `"post"` | 文章详情页（`posts/[...slug].astro`） |

**实现机制（含 Swup 站内导航）**：

1. 每个页面通过 `MainGridLayout` 的 `page` prop 声明自身类型；
2. SSR 全量渲染所有 widget，包装层打 `data-sidebar-pages`（pages 列表序列化）
   与 `hidden` 初始标记（不匹配当前页面的先隐藏）——判定逻辑在
   `src/utils/sidebar-page.ts`，SSR 与客户端共用；
3. 侧栏静态渲染在 Swup 容器外，站内导航后不重渲染：`page` 同时输出到
   `#swup-container` 的 `data-current-page`，Swup 替换容器时同步该属性，
   SideBar 的脚本监听 `content:replace` 按新页面重新切换各 widget 与
   空组的 `hidden` 状态。
4. 显隐切换带 M3E 动效（退场淡出 → 留存组件 FLIP 平移 → 入场淡入，
   reduced-motion 瞬切），实现走 `motion.ts` 的集合变更原语，
   见 `animation.md` §3。

> 新增页面时务必在 `SidebarPage` 联合中加分支并传 `page` prop——漏传的页面
> 上，带 `pages` 限制的 widget 一律不显示（宁可少显示，不显示到错误页面）。

### 2.5 音乐 widget 的启用与加载

音乐是默认关闭的可选 widget，使用独立的全局配置与侧栏条目双重控制。只有
`musicConfig.enable: true`、`musicConfig.tracks` 至少有一首有效曲目，且
`sidebarConfig.components` 中 `type: "music"` 的条目也为 `enable: true` 时，
才允许动态加载并渲染 `MusicSidebar`。music 默认条目必须保持 `enable: false`。

任一条件不满足时必须在导入与渲染前短路：零播放器 DOM / 布局偏移、零音频或封面网络请求、
零主 bundle 代码/依赖、零共享或提升 CSS。不能静态导入后仅用 CSS 隐藏；动态加载与样式隔离
遵循 `on-demand-loading.md` 的零额外负担约定。

### 2.6 持久侧栏运行时

侧栏位于 `#swup-container` 外，是持久 shell。启用后的 `MusicSidebar` 作为交互岛只挂载一次，
当前曲目、播放/暂停状态、播放位置、音量和播放模式均由该持久运行时持有。Swup 导航只替换
主内容并同步页面过滤，不得在 `content:replace` / `page:view` 时重建音频实例或把播放器重置为
`musicConfig.defaultVolume` / `musicConfig.defaultMode`；直接加载页面时则正常初始化一次。

## 3. 响应式行为

断点沿用站点既有 Tailwind 约定：`lg` = 1024px，`xl` = 1280px。

| 视口 | 行为 |
|---|---|
| < 1024px | 单列堆叠：内容在前、侧栏在后 |
| 1024 – 1279px | 两列：主栏 + 内容；**dual 也退化为单栏**（副栏 `hidden`，无配置项） |
| ≥ 1280px | `single`：两列不变；`dual`（且副栏有 enable 的 widget）：三列 `副栏 · 内容 · 主栏` |

> 副栏为空时 `dual` 实际等同 `single`——这是有意设计：副栏没有内容就不占位，不会出现空列。

## 4. 页框与 TOC 联动

- **页框宽度自动解析**：`--page-width` 由 `resolvePageWidth()`（`src/utils/responsive-utils.ts`）按编排注入——`single` → 85rem，`dual`（三列生效时）→ 96rem。导航栏 / 主面板 / TOC 容器的 `max-w-[var(--page-width)]` 全部自动跟随，无需手改。
- **TOC 让位**：三列生效时右侧悬浮目录轨（`min-[1700px]` rail）自动隐藏，避免与副栏抢右侧视口余量；空的 `#toc` 元素保留（它是 swup 的替换容器，删除会破坏切页）。
- 调整默认宽度：`src/constants/constants.ts` 的 `PAGE_WIDTH` / `PAGE_WIDTH_DUAL`。

## 5. 配置示例

**单栏（默认）**：

```ts
export const sidebarConfig: SidebarConfig = {
	enable: true,
	arrangement: "single",
	side: "left",
	components: [
		{ type: "profile", enable: true, slot: "top" },
		{ type: "announcement", enable: false, slot: "top" },
		{ type: "music", enable: false, slot: "top" },
		{ type: "categories", enable: true, slot: "sticky" },
		{ type: "tags", enable: true, slot: "sticky" },
	],
};
```

**双栏**：切 `arrangement: "dual"`，把想进副栏的 widget 标 `column: "secondary"`：

```ts
{
	arrangement: "dual",
	side: "left",
	components: [
		{ type: "profile", enable: true, slot: "top" },                                 // 主栏 top
		{ type: "categories", enable: true, slot: "sticky" },                           // 主栏 sticky
		{ type: "stats", enable: true, slot: "top", column: "secondary" },              // 副栏 top
		{ type: "tags", enable: true, slot: "sticky", column: "secondary" },            // 副栏 sticky
	],
}
```

**主栏换边**：只改 `side: "right"`，主栏右置、副栏自动落左，其余不变。

## 6. 新增 widget

完整 checklist 见 `common-components.md` §3.1。核心五步：

1. `src/types/sidebarConfig.ts` 扩展 `SidebarWidget` 联合分支（专属配置放分支内）；
2. 实现组件（molecules 优先；带取数/业务放 organisms），接收 `widget` prop；
3. `SideBar.astro` 的 `componentMap` 注册——`satisfies Record<SidebarWidget["type"], unknown>` 保证漏注册时编译期报错；
4. `sidebarConfig.components` 加默认条目（**新 widget 默认 `enable: false`**，保证存量站点零变化）；
5. 本文件 §7 的 widget 总览表 + `sidebar-widgets.md` 补组件文档。

## 7. 内置 widget 总览

| type | 组件 | 数据源 | 标题外壳 | 专属配置 |
|---|---|---|---|---|
| `profile` | `Profile`（organisms） | `profileConfig` | 无（自带头像卡） | — |
| `categories` | `Categories` | `getCategoryList` | `WidgetLayout` | `collapseAfter?`（默认 5） |
| `tags` | `Tags` | `getTagList` | `WidgetLayout` | `collapseAfter?`（默认 20） |
| `announcement` | `Announcement` | `announcementConfig` | 无（Banner round） | — |
| `stats` | `SiteStats` | `getSiteStats` | `WidgetLayout` | — |
| `calendar` | `Calendar` | `getCalendarData` | `WidgetLayout` | `startOfWeek?`（默认 `"mon"`） |
| `music` | `MusicSidebar`（organisms） | `musicConfig` | `WidgetLayout` | —（内容与初始状态来自全局配置） |
| `toc` | `SidebarTOC` | 当前文章 headings | `WidgetLayout` | —（通常限定 `pages: ["post"]`） |

逐个文档见 `sidebar-widgets.md`。

## 8. 常见问题

**改 `arrangement: "dual"` 了却没出现副栏？**
没有任何 widget 标 `column: "secondary"`（且 `enable: true`），副栏就不会渲染——这是设计行为，不是 bug。

**想在某页不显示侧栏？**
给相关 widget 配置 `pages` 白名单；省略或留空表示所有页面。若要整列在某个页面消失，需确保该栏
的全部已启用 widget 都不匹配该页面，SideBar 会在 SSR 与 Swup 导航后同步收起空组。

**副栏放什么合适？**
建议放轻量信息型 widget（stats、tags），把交互密集或重要的（profile、categories）留在主栏；副栏 sticky 堆叠不要超过 2–3 个，避免占满视口。

**改了 sidebarConfig 没生效？**
`.astro` 内联 stylus 的 HMR 不稳定是已知问题：先重启 dev server 再看；配置本身改动会随页面刷新生效。
