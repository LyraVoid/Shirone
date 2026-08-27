# 原子化分层结构规范 — Shirone 主题

> 本文档定义 `src/components/` 的原子化（Atomic Design）分层结构：
> 各层职责、依赖方向与**禁止事项**。
> 适用版本：基于 Astro 7 + Svelte 5 + Tailwind CSS 4。
> 配套文档：`docs/m3e-standard.md`（M3E 令牌与设计规范）、`docs/fab-system.md`（FAB 与悬浮目录系统）、`docs/sidebar-system.md`（侧栏编排）、`docs/sidebar-widgets.md`（侧栏组件文档）。

---

## 1. 分层总览

```
┌─────────────────────────────────────────────┐
│ pages/          页面路由（唯一入口，编排模板） │
├─────────────────────────────────────────────┤
│ layouts/        Templates：页面骨架与布局     │
├─────────────────────────────────────────────┤
│ organisms/      有机体：独立 UI 区块 + 业务   │
├─────────────────────────────────────────────┤
│ molecules/      分子：原子的组合              │
├─────────────────────────────────────────────┤
│ atoms/          原子：最小可复用 UI 元素      │
└─────────────────────────────────────────────┘
        ▲ 依赖方向：只允许向上引用
```

特殊层（不参与组合链，但归属同一目录体系）：

| 目录 | 职责 | 引用方 |
|---|---|---|
| `system/` | 全局基础设施（ConfigCarrier、GlobalStyles） | 仅 templates（layouts） |
| `content/` | 内容渲染器（Markdown 正文） | 仅 pages |

---

## 2. 各层职责与允许依赖

| 层 | 目录 | 职责 | 允许依赖 |
|---|---|---|---|
| **原子** | `atoms/` | 单一职责的 UI 元素（64 个，清单单一真源见 `atoms/manifest.json`） | 仅设计令牌（`--mc-*`、`--m3e-*`、语义别名）与 `.m3-state-layer`，**不得 import 任何组件** |
| **分子** | `molecules/` | 原子的固定组合：PageHeader、SectionTitle、ButtonLink、ButtonTag、Tags、Categories、PostMeta、SearchBar、SidebarTOC、FloatingActionButton、FloatingTOCPanel、WidgetLayout、ImageWrapper、License、Pagination、ArticleDiscoveryItem 等 | atoms + 同层分子（须同层方向合理） |
| **有机体** | `organisms/` | 独立业务区块：TopAppBar、SideBar、Footer、Search、PostCard、PostPage、FloatingControls、ArchivePanel、DisplaySettings、Profile、LightDarkSwitch、SiteNavigationDrawer、RouteProgress、CategoryBar、BackToTop、BannerStage、MusicSidebar 等 | atoms + molecules + 被组合的**更小** organism |
| **模板** | `layouts/` | 页面骨架与网格布局：Layout、MainGridLayout | organisms + molecules + system |
| **页面** | `pages/` | 路由级编排：`[...page].astro`、`about.astro`、`archive.astro`、`posts/[...slug].astro` | layouts + organisms + molecules + content |
| **系统** | `system/` | 全局基础设施 | 仅令牌与 utils |
| **内容** | `content/` | Markdown 正文渲染 | 仅令牌与 utils |

---

## 3. 依赖规则

1. **单向向上**：`atoms → molecules → organisms → templates → pages`。任何层只能依赖自己与更底层。
2. **同层分子互依赖**允许，但禁止循环（A → B → A）。
3. **同层有机体互依赖**原则上禁止；例外：大有机体组合专门的小有机体（如 SideBar 组合 Profile、MainGridLayout 组合 FloatingControls 与 SideBar）。
4. **禁止反向依赖**：底层绝对不能 import 高层组件。

---

## 4. 禁止事项（Checklist）

### 4.1 技术栈混用与水合

1. **禁止在纯 SSR 页面引入 `@iconify/svelte` 图标**——没有 hydration 岛的页面上 Svelte 图标不会渲染。纯 SSR 页面（如全静态文章页、分类列表）统一用 `astro-icon`。
2. **禁止在 `.svelte` 中混用 runes 与旧响应式语法**——全文件保持一致（`<script lang="ts">` 中用 `$props()`、`$state()` 时全用 runes；旧语法全用 `export let`、`let`、`$:`）。
3. **禁止给静态展示组件无端添加 `client:load`**——只有带用户交互（搜索、切换、轮播、抽屉、点赞等）的组件才加 client 指令。首选 `client:visible` 惰性水合。
4. **禁止破坏 Stylus 选择器连接**——如 `.btn { &.active { ... } }` 输出 `.btn.active`（正确）；若写成 `& .active` 则变成后代选择器（可能非预期）。避免 `&` 与父级类名拼接出错误命名的 CSS 类。

### 4.2 依赖方向

5. **禁止低层依赖高层**：`atoms/` 内禁止出现 `import ... from "@components/molecules/..."` 或 `@components/organisms/..."`；`molecules/` 禁止 import `organisms/`。
6. **禁止循环依赖**：任何两组件（或两层）之间不得 A→B→A。
7. **禁止组件 import `layouts/` 或 `pages/`**——反向依赖模板/页面层。
8. **禁止 organism 互相平铺引用**：若 organism X 与 organism Y 需要共享某块 UI，该块应下沉为 molecule，而不是 X→Y 或 Y→X。

### 4.3 代码与样式

9. **禁止硬编码色值、圆角、阴影、动效时长**——一律引用 `--mc-*`、语义令牌（`--primary`、`--surface-container-high`…）与 `--m3e-*`；例外仅限站点固有内容色（如广告牌语义色，见 m3e-standard.md §3.1）。
10. **禁止散落的非令牌动效**——如 `transition: all 0.3s`、`animation: xxx 1s linear`；统一用 `--m3e-duration-*` + `--m3e-easing-*`。
11. **禁止硬编码用户可见文本**——UI 文案必须走 `i18nKey.ts` 与 10 种语言映射（见 project-rules.md §4）。
12. **禁止在组件内写死暗色模式覆写**——暗色适配应通过 CSS 变量在主题切换时自动切换，而不是在组件内写 `.dark & { ... }` 覆写颜色逻辑。
13. **禁止跨层 relative import**——`../../`、`../misc/` 等一律替换为 `@components/<层>/<文件>`。

### 4.4 职责边界

14. **禁止在原子 / 分子中引入业务副作用**——数据获取（pagefind、`getSortedPosts`）、持久化（localStorage）、路由跳转属于有机体；交互副作用（事件监听、焦点管理，如 SearchBar 的窗口焦点保护）允许留在分子。
15. **禁止在分子中编排页面级布局**——网格列数、固定定位、`hidden lg:block` 之类的响应式骨架属于模板（MainGridLayout）与有机体；分子只承载自身尺寸。
16. **禁止原子 / 分子直接查询站点内容集合**——`posts` / `categories` / `tags` 的集合访问在 molecules（Tags、Categories）及以上层。
17. **禁止在分子中渲染 Markdown 正文**——正文渲染唯一入口是 `content/Markdown.astro`，由 pages 调用。
18. **禁止在功能禁用时渲染空占位 DOM**——可选功能、组件或第三方服务在未启用/禁用/无数据时必须直接返回 `null` 或不输出节点，不得渲染空壳容器或导致多余的间距与布局偏移（零额外负担原则）。

---

## 5. 新增组件时如何落层（决策表）

| 新组件是什么 | 落层 |
|---|---|
| 单一 UI 元素，无组合、无业务，可被任意复用 | atoms |
| 2 个以上原子的固定组合（如"标签 chip 列表"、"浮动按钮包装器"） | molecules |
| 独立业务区块，带数据/状态/布局职责（如"右下角悬浮控制流"、"文章卡片流"） | organisms |
| 全局基础设施（脚本注入、全局样式载体） | system |
| 渲染 content 集合正文 | content |
| 页面骨架 / 网格 | layouts |

落层后检查：
1. import 是否只指向本层与更底层？
2. 是否有循环依赖？
3. 是否用了 `@components/<层>/<文件>` 别名？
4. 是否只消费令牌、未硬编码数值？
5. 是否把业务副作用留在了 organisms？

---

## 6. 当前分层清单（2026-08）

| 层 | 组件 |
|---|---|
| atoms/ | 63 个原子组件（Button、Chip、IconButton、FAB、FABMenu、Slider、SegmentedButton、TextField、Switch、Checkbox、RadioButton、Dialog、Menu、Badge、Divider、Snackbar、Tabs、Select、DataTable、SearchView、Autocomplete、SheetSide、Carousel、PullToRefresh、DatePicker、TimePicker、Chips、Banner、Tooltip、Card、AppBar、NavigationBar/Rail/Drawer、ExposedDropdownMenu、ListItem、LoadingIndicator、ProgressIndicator、AlertDialog、BadgedBox、SplitButton、ToggleButton、ButtonGroup、SearchBar、DateInput、FloatingToolbar、BottomSheet 等；完整清单与 tier 见 `atoms/manifest.json`） |
| molecules/ | PageHeader、SectionTitle、ButtonLink、ButtonTag、Tags、Categories、Announcement、SiteStats、Calendar、CalendarView、AnimeCard、CompassTile、PostMeta、SearchBar、SidebarTOC、FloatingActionButton、FloatingTOCPanel、WidgetLayout、ImageWrapper、License、Pagination、FriendCard、MomentCard、MomentGallery、AlbumCard、LastUpdatedNotice、ArticleDiscoveryItem、SkillCard、ProjectCard、TimelineCard、BannerWaves、MermaidDiagramViewer |
| organisms/ | TopAppBar、SideBar、Footer、Search、PostCard、PostPage、FloatingControls、ArchivePanel、DisplaySettings、Profile、LightDarkSwitch、SiteNavigationDrawer、RouteProgress、CategoryBar、BackToTop、BannerStage、FriendSection、MomentSection、AnimeSection、CompassSection、AlbumSection、AlbumGallery、PasswordGate、ProtectedAlbum、EncryptedContent、ProtectedPost、ArticleDiscovery、ArticleShare、SkillSection、ProjectSection、TimelineSection、MusicSidebar |
| system/ | ConfigCarrier、GlobalStyles |
| content/ | Markdown |
| layouts/ | Layout、MainGridLayout |
| pages/ | 首页、archive、friends、moments、about、posts/[...slug]、[…page] 等路由 |

---

## 7. 维护约定

- 重构涉及组件移动时，用 `git mv`（保留历史），并同步更新全部 import（`@components/<新层>/<文件>`）。
- 层清单（§6）与 m3e-standard.md 的 §8 文件索引随结构变更同步维护。
