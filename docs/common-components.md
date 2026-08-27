# 通用组件规范（molecules）— Shirone 主题

> 记录 `src/components/molecules/` 中**跨页面 / 区块复用**的通用组件：
> 职责、Props、用法与新增约定。配套文档：
> `atomic-structure.md`（分层）、`m3e-standard.md`（令牌与原子）、`animation.md`（动效库）、
> `sidebar-system.md`（侧栏编排）、`sidebar-widgets.md`（侧栏组件文档）、`fab-system.md`（FAB 与悬浮目录系统）。

---

## 1. 定位

通用组件 = molecules 层可复用的 UI 组合：

- **与原子（atoms）区别**：由多个原子组合而成，可含简单布局（如"图标 + 标题 + 副标题"）；
- **与有机体（organisms）区别**：不承载业务数据、不依赖站点内容集合、无路由/持久化副作用；
- 命名 PascalCase，跨目录引用用 `@components/molecules/<Name>`。

---

## 2. 标题组件族

站内标题统一走「图标 + 标题 + 副标题」三要素，分两级：

| 场景 | 组件 | 层级 | 三要素 |
|---|---|---|---|
| 页面顶部大标题 | `PageHeader` | 页面级 | 大号 `primary` 线性图标 + `headline-medium` 标题 + 副标题 |
| 区块/卡片内小标题 | `SectionTitle` | 区块级 | 可选小图标 + `title-large` 标题 + 可选副标题 |

### 2.1 PageHeader — 页面级标题

```svelte
<PageHeader
	icon="material-symbols:handshake-outline-rounded"
	title={i18n(I18nKey.friends)}
	subtitle={i18n(I18nKey.friendsBanner)}
/>
```

- 图标为无容器 `primary` 线性图标（不用实底方形容器）；
- 标题与副标题左缘对齐（副标题不缩进），与下方内容区齐平；
- 用于非首页内容页顶部（友链、归档、关于等），替代各页自维护的 h1 块。

> **SSR 静态页注意**：`PageHeader.svelte` 用 `@iconify/svelte` 渲染图标；
> 在无 hydration 的纯 SSR 页面上图标为空（HTML 只留占位）。纯 SSR 页面
> 请用视觉一致的 `atoms/display/PageHeader.astro`（astro-icon 构建期内联）；
> 分类/标签索引页即此用法；Svelte 岛内（client:only）继续用 molecules 版。

### 2.2 SectionTitle — 区块标题

```svelte
<SectionTitle
	icon="material-symbols:tag-rounded"
	title="Categories"
	subtitle="Browse posts by topic"
/>
<!-- 省略 icon / subtitle 亦可 -->
<SectionTitle title="Categories" />
```

- 用于侧栏卡片、设置面板等区块内的小标题；
- 图标可选、副标题可选，三者缺省时自动省略对应 DOM。

---

## 3. 其它通用分子组件

| 组件 | 用途 |
|---|---|
| `ButtonLink` / `ButtonTag` | 链接/标签形态的按钮（atoms 组合） |
| `PostMeta` | 文章元信息（日期/分类/标签） |
| `FriendCard` | 友链卡片（头像 + 站名 + 描述 + 标签，整卡链接） |
| `MomentCard` | 动态卡片（`<article>` 语义：头像/作者/时间/置顶/心情/正文/位置/标签） |
| `MomentGallery` | 动态图片画廊（两段式：自适应网格瓦片 → 内联查看器主舞台/缩略图条/键盘导航 → Fancybox 灯箱） |
| `Pagination` | 分页控件 |
| `SearchBar` | 搜索输入（分子层，docked 视觉） |
| `WidgetLayout` | 侧栏卡片容器（折叠标题 + 内容） |
| `Announcement` | 公告侧栏 widget（Banner 原子 round 形态，无标题外壳；内容源 `announcementConfig`） |
| `SiteStats` | 站点统计侧栏 widget（规格表行：MetaIcon 徽标 + 点线引导 + 表格数字；数据源 `utils/site-stats` 备忘化汇总） |
| `Calendar` | 月度文章历侧栏 widget（SSR 直出日期聚合 + CalendarView 水合岛：单月视图、切月 reveal、点击有文日 collapse 展开当日文章） |
| `SidebarTOC` | 文章目录侧栏 widget（WidgetLayout 外壳 + 内嵌 `<table-of-contents>` 自定义元素及 `TocList` 原子） |
| `FloatingActionButton` | 右下角浮动操作按钮包装器（响应式设备类受控 + 页面范围过滤属性） |
| `FloatingTOCPanel` | 移动端/平板浮动大纲目录卡片分子（M3 Surface Container High 风格、平滑滚动定位与隐藏滚动条） |

原子层通用件（`Button` / `Card` / `IconButton` / `Avatar` / `AccentBar` / `FAB` 等）见 `m3e-standard.md` §4。

---

## 4. 新增通用组件约定

1. 判断落层：跨场景复用的原子组合 → molecules；单元素 → atoms；带业务 → organisms；
2. 三要素齐全的标题组件优先复用 `PageHeader` / `SectionTitle`，不要各自手写；
3. 新增通用组件后：
   - 在本文件 §2 / §3 登记；
   - 更新 `atomic-structure.md` §6 的 molecules 清单；
   - 更新 `m3e-standard.md` §8 文件索引。

---

## 5. 关联文档

- `docs/atomic-structure.md` — 分层与依赖规划
- `docs/fab-system.md` — FAB 与移动端悬浮目录系统规范
- `docs/m3e-standard.md` — 设计令牌、原子组件、文件索引
- `docs/animation.md` — 动效令牌、`use:collapse` 插件与 reduced-motion
