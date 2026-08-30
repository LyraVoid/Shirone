# 配置目录约定

本目录是 Shirone 全部用户可选配置的唯一入口。约定如下：

## 文件组织

| 内容 | 位置 | 示例 |
|---|---|---|
| 配置值（带注释的默认值） | `src/config/<domain>Config.ts` | `siteConfig.ts`、`sidebarConfig.ts`、`fabConfig.ts` |
| 配置类型 | `src/types/<domain>Config.ts` | `types/sidebarConfig.ts`、`types/fabConfig.ts` |

通用类型（多领域共享，如 `Favicon`、`LIGHT_DARK_MODE`）放在 `src/types/config.ts`。

## 导入规则

1. **消费方统一从 barrel 导入**：`import { siteConfig, fabConfig } from "@/config"`；
   只需要单一领域时可用具体文件：`import { fabConfig } from "@/config/fabConfig"`。
2. **禁止相对路径杂写法**：不允许 `../../config`、`../config`、`src/config` 三种历史写法。
3. **循环依赖规避**：`i18n/translation.ts` 依赖 `siteConfig`，而 `navBarConfig` 等又消费
   i18n——该类反向依赖模块只允许从具体文件导入（如 `@/config/siteConfig`），
   **禁止走 barrel**，否则形成 `index → navBar → translation → index` 环。
4. `astro.config.mjs` 在 Astro 配置层运行，用相对路径 `./src/config/<file>.ts` 导入。

## 配置（Behavior）与数据（Content）分层原则

Shirone 遵循「配置管行为，数据管内容」的清晰分层架构：

- **`src/config/*Config.ts`**：控制**展示行为与页面能力**（页面总开关 `enable`、分类显示顺序 `categories`、单项禁用列表 `disabledKeys`、排序方向 `order`、源切换与服务凭据）；
- **`src/data/*.ts`**：承载**具体的站点内容实体**（项目条目 `projects.ts`、技能清单 `skills.ts`、时间线节点 `timeline.ts`、设备列表 `devices.ts`、友链 `friends.ts`、罗盘 `compass.ts`、番剧 `anime.ts` 与本地音乐 `music.ts`）；
- **`src/utils/feature-data.ts`**：提供构建期纯函数，将 config 的过滤/排序等行为规则应用到对应 data 实体集合上，输出给页面/组件。

| 判别问题 | 归属 | 处理方式 |
|---|---|---|
| 它控制「页面是否开启 / 排序 / 凭据」？ | **Config** | 写在 `src/config/*Config.ts`（如 `enable: boolean`, `categories`, `order`） |
| 它是「站点要展示的具体条目与说明」？ | **Data** | 写在 `src/data/*.ts`（如 `ProjectItem[]`, `SkillItem[]`, `TimelineItem[]`） |
| 单项内容的停用 / 过滤？ | **Config** | 在 config 中声明 `disabledKeys`（或对应 ID 列表），data 保持纯净内容 |

## 新增一个配置项 / 配置文件

1. 类型定义加入 `src/types/<domain>Config.ts`（新领域则新建文件，字段带中文注释说明语义与默认值）；
2. 值加入 `src/config/<domain>Config.ts`，保持注释完整——注释是配置的文档；
3. 新文件在 `src/config/index.ts` barrel 注册导出；用 `withUserConfig("<domain>", { ... })`
   包住默认值字面量，并在 `scripts/content/config-domains.mjs` 登记该领域（见下文「用户覆盖层」）；
4. **安全默认与零额外负担**：可选外部服务/重量级特性默认必须为关闭（如 `enable: false`）。在关闭或未配置时，必须满足「零外部请求、零占位 DOM、零性能损耗、零主包膨胀」的零额外负担要求；
   落地做法与验证方法见 `docs/on-demand-loading.md`；
5. UI 文案走 `I18nKey` 枚举 + `i18n()`（如 `navBarConfig` 的用法），**不写死字符串**；
   新增 i18n key 必须同步补全 `src/i18n/languages/` 下全部 10 种语言；
6. 跑 `npx.cmd astro check` 确认 0 错误 0 警告。

## 用户覆盖层（内容仓 `config/*.yaml`）

本目录的每个领域配置都把自己的字面量默认值交给 `withUserConfig()`：

```typescript
export const siteConfig: SiteConfig = withUserConfig("site", {
	title: "Shirone",
	// ...默认值连同注释一起留在代码仓
});
```

`local` 模式下 `withUserConfig()` 原样返回默认值，零开销。`external` 模式下，
内容仓 `config/site.yaml` 里的键会与默认值**深合并**（对象递归合并、数组整体替换）
后返回，合并源是 `pnpm content:sync` 生成的 `src/user/user-config.ts`。

因此本目录的定位没有变：**它是默认值与配置文档的唯一真源**，
注释写得越清楚，内容仓那边越不需要猜。契约与 YAML 写法见
[`docs/content-separation/config-overlay.md`](../../docs/content-separation/config-overlay.md)。

新增配置领域时，除了本文下方的清单，还要在
`scripts/content/config-domains.mjs` 补一行登记（领域名、YAML 文件名、类型），
它同时驱动生成、校验与 `content:eject` 的起步文件；`tests/content/content-config.test.mjs`
会检查登记表的文件名唯一且为 kebab-case。

`navBarConfig` 是唯一不走 `withUserConfig()` 的领域：导航项要引用 `LinkPresets`
并调用 `i18n()`，深合并只会得到一堆未解析的引用，因此它由 `resolveNavBarLinks()`
把内容仓的声明式条目还原成 `NavBarLink`。

### 反向导出覆盖层（`content:export --config`）

覆盖层是双向的：`pnpm content:export --config` 会求「当前生效配置」与「主题默认值」的差，
把最小覆盖集写回内容仓的 `config/*.yaml`（保留用户已有的注释与格式，只增改不删键）。
它是 `deepMerge` 的精确逆运算，因此喂回 `content:sync` 之后生效配置逐字段不变。

典型用途是救援：`content:clean` 会把 `src/user/user-config.ts` 重置成空覆盖层，
在那份生成物里的改动会因此丢失；导出能先把它固化成 YAML。默认只预演，用法与安全机制见
[`docs/content-separation/cli-workflows.md`](../../docs/content-separation/cli-workflows.md)。

两条边界要知道：

- **`navBar` 不参与导出**。`resolveNavBarLinks()` 的解析不可逆，`config/nav-bar.yaml` 只能手工维护；
- **不会把本目录的源码改动提升成覆盖**。直接修改 `<domain>Config.ts` 里的默认值字面量时，
  「默认值」与「生效值」同步变化，差分为空，那处改动不会进入导出计划。
  这是有意为之：把当前默认值提升成内容仓的永久覆盖，等于把配置冻结在这一版主题上。
  想固化就在 fork 里提交它，或照常在内容仓写一条对应的 YAML 覆盖。

领域键与 YAML 文件名一律 kebab-case 对应驼峰：`llms` ↔ `config/llms.yaml` ↔ `llmsConfig`，
`postList` ↔ `config/post-list.yaml` ↔ `postListConfig`。

## 现有配置一览

| 文件 | 职责 |
|---|---|
| `footerConfig.ts` | 页脚自定义 HTML 注入开关（控制是否读取并注入 `src/config/FooterConfig.html`，关闭时零开销） |
| `siteConfig.ts` | 站点部署 URL / base 路径 / 标题标识 / 语言 / IANA 时区 / HCT 主题色 / 背景纹理系统 / 显示设置浮层开关 / 横幅 / TOC 深度 / 进度条 / favicon（含 `getDefaultStyle` / `getDefaultSpec` / `resolveDisplaySettings` 回退值） |
| `profileConfig.ts` | 博主资料：头像 / 名称 / 简介 / 社交链接 |
| `licenseConfig.ts` | 文章版权声明 |
| `expressiveCodeConfig.ts` | 代码块明暗主题 |
| `navBarConfig.ts` | 导航栏链接（`LinkPresets` 预设表 + 组装） |
| `sidebarConfig.ts` | 侧栏编排与 widget 清单（`arrangement` 单/双栏、`side` 主栏物理侧、widget `column` 分栏标签；判别联合类型见 `types/sidebarConfig.ts`；编排指导见 `docs/sidebar-system.md`，组件文档见 `docs/sidebar-widgets.md`，新增 widget checklist 见 `docs/common-components.md` §3.1） |
| `fabConfig.ts` | 右下角悬浮控制流（FAB）配置：总开关、各操作项（返回顶部、悬浮目录、直达评论、返回首页、自定义操作）、细粒度设备受控矩阵（`devices?: ("mobile" | "tablet" | "desktop")[]`）、页面范围过滤与图标定制；架构见 `docs/fab-system.md` |
| `announcementConfig.ts` | 公告内容（侧栏 announcement widget 消费，text 为空不渲染） |
| `musicConfig.ts` | 侧栏音乐全局配置：总开关（默认关闭）、`provider` 模式切换接口、`defaultVolume` 初始音量与 `defaultMode` 初始播放模式（本地曲目清单维护在 `src/data/music.ts`）；与 `sidebarConfig` 的 music 条目共同控制 `MusicSidebar`，详见下文与 `docs/sidebar-widgets.md` |
| `postListConfig.ts` | 文章列表：分页大小 + 布局（list/grid 模式、封面位置、grid 卡片宽度档位） |
| `articleConfig.ts` | 文章详情：最后更新提示、延伸阅读（相关/随机文章抽样）、以及文章尾部分享区块（总开关、海报生成与封面配置） |
| `commentConfig.ts` | 评论系统：全局开关（默认关闭）、Provider 选择（Twikoo 等）、视口懒加载与服务凭据配置 |
| `contextMenuConfig.ts` | 桌面端右键增强：可选开关（当前默认开启）；配置允许页面与操作顺序，关闭时零 DOM、零监听器、零客户端资源 |
| `umamiConfig.ts` | Umami 统计：全局开关（默认关闭）、公开分享统计读取，以及可选的官方访问采集脚本配置；支持内容仓 `config/umami.yaml` 覆盖（领域键 `umami`） |
| `skillsConfig.ts` | 技能页行为控制：页面总开关、分类清单与单项禁用列表（技能内容维护在 `src/data/skills.ts`）；关闭页面时导航入口同步隐藏 |
| `projectsConfig.ts` | 项目页行为控制：页面总开关、分类清单与单项禁用列表（项目内容维护在 `src/data/projects.ts`）；关闭页面时导航入口同步隐藏 |
| `timelineConfig.ts` | 时间线页行为控制：页面总开关、分类清单、排序方向与单项禁用列表（时间线内容维护在 `src/data/timeline.ts`）；关闭页面时导航入口同步隐藏 |
| `devicesConfig.ts` | 设备页行为控制：页面总开关、场景分类清单与单项禁用列表（设备清单维护在 `src/data/devices.ts`）；关闭页面时导航入口同步隐藏 |
| `animeConfig.ts` | 番剧页与外部追番数据源：数据源选择（本地 / Bangumi 快照 / Bilibili 快照）、失败降级、提供方凭据环境配置与快照生命周期管理（本地番剧维护在 `src/data/anime.ts`） |
| `llmsConfig.ts` | 大语言模型与 AI 友好内容系统：`/llms.txt`（索引）与 `/llms-full.txt`（全量正文汇编）静态端点生成控制、加密文章过滤、排除标签与自定义章节配置；支持内容仓 `config/llms.yaml` 覆盖（领域键 `llms`） |

非首页 Banner 的标题、说明和可选日期由各页面通过 `MainGridLayout` 提供，并在 Swup 导航后从被替换的主内容容器同步。该上下文默认显示、不设配置开关；说明为空或与标题相同时自动省略，移动端非首页仍沿用紧凑布局并隐藏 Banner。

## 侧栏编排与页框宽度

- `arrangement: "single"`（默认）——全部 widget 渲染进唯一侧栏，页框 85rem；
- `arrangement: "dual"`——`column: "secondary"` 的 widget 进入副栏（视口 ≥ 1280px 起三列），
  其余留在主栏；页框自动放宽到 96rem，TOC 悬浮 rail 自动让位（右侧余量被副栏占据）。
  1280px 以下自动退化为单栏（只显主栏），无需配置。
- `side: "left" | "right"` 决定主栏物理侧，dual 线下副栏落在对面。
- 页框宽度用 `resolvePageWidth()`（`src/utils/responsive-utils.ts`）按编排自动解析，
  常量在 `src/constants/constants.ts`（`PAGE_WIDTH` / `PAGE_WIDTH_DUAL`），不提供手动覆盖。

## 右下角悬浮控制流（FAB）配置契约

`fabConfig.ts` 控制右下角悬浮操作栏的呈现与交互：

```typescript
export const fabConfig: FabConfig = {
    enable: true,
    items: [
        {
            type: "top",
            enable: true,
            icon: "material-symbols:keyboard-arrow-up-rounded",
            // 未指定 devices 时全设备生效；滚过横幅高度阈值后平滑浮现
        },
        {
            type: "toc",
            enable: true,
            icon: "material-symbols:format-list-bulleted-rounded",
            pages: ["post"],
            // 桌面端侧栏已有粘性 TOC，故默认仅在移动端与平板端显示悬浮目录
            devices: ["mobile", "tablet"],
        },
        {
            type: "comment",
            enable: true,
            icon: "material-symbols:comment-outline-rounded",
            pages: ["post"],
            devices: ["mobile", "tablet"],
        },
        {
            type: "home",
            enable: false,
            icon: "material-symbols:home-outline-rounded",
        },
    ],
};
```

### 核心规则与受控特性

1. **细粒度设备受控（`devices`）**：
   - `"mobile"`（< 768px）
   - `"tablet"`（768px ~ 1023px）
   - `"desktop"`（≥ 1024px）
   - 省略时默认所有设备均允许；SSR 阶段直接输出 Tailwind CSS 响应式类（如 `flex lg:hidden`），零首屏闪烁，CLS = 0。
2. **页面范围过滤（`pages`）**：
   - 过滤逻辑与侧栏 `SidebarPage` 统一，通过 `#swup-container` 的 `data-current-page` 在 Swup 站内导航时联动隐藏/显示。
3. **评论按钮零额外负担**：
   - 全局未开启评论系统（`commentConfig.enable: false`）或当前文章关闭评论时，评论 FAB 按钮产物为 0 DOM，零多余外链请求与布局偏移。
4. **无音乐挂件（保持纯粹）**：
   - FAB 控制流不集成音乐播放器，避免与侧边栏 `MusicSidebar` 产生双重状态混乱及包体积膨胀。

## 侧栏音乐启用契约与四种模式

侧栏音乐是默认关闭的可选能力，必须同时满足以下三项才加载并渲染：

1. `musicConfig.enable` 为 `true`；
2. 对应数据源（本地 `src/data/music.ts`、自定义 `tracks` 或 `meting` 远端歌单）至少包含一首有效曲目/合法歌单 ID；
3. `sidebarConfig.components` 中 `type: "music"` 的条目存在且 `enable: true`（默认条目为 `false`）。

### 四种数据源工作模式（`provider`）

| 模式 | 配置名 | 数据源 | 特点与适用场景 |
|---|---|---|---|
| **本地模式** | `"local"` | `src/data/music.ts` | 默认模式。零外部 API 依赖，构建期静态打包，首屏毫秒级就绪，支持离线/断网播放。 |
| **自定义列表** | `"custom"` | `musicConfig.tracks` | 灵活自定义。直接在配置中传入曲目数组（支持外链音频与封面），无需修改通用数据文件。 |
| **云端歌单** | `"meting"` | `musicConfig.meting` | 接入 Meting API（网易云、QQ 音乐、酷狗等），客户端异步按需拉取，曲目与封面自动清洗加载。 |
| **混合增强模式** | `"mixed"` | 本地数据 + Meting API | **推荐**。首屏立即播放本地音乐，后台无感拉取远端歌单并在就绪后无缝追加合并；若遇断网或云端接口故障，自动静默降级为本地曲目，绝不破版。 |

任一条件不满足时，音乐功能不得输出 DOM 或样式，不得请求音频/封面等资源，也不得把播放器代码或依赖带入主 bundle。配置消费者应先完成三项校验，再动态加载 `MusicSidebar`；不能用隐藏空卡片代替短路。

`defaultVolume` 与 `defaultMode` 只定义播放器首次初始化的音量和播放模式。播放器挂载后由持久侧栏运行时持有当前曲目、播放位置、音量与模式，Swup 站内导航不应重新读取默认值或重建播放器。
