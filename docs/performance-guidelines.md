# 性能架构指南（Performance Architecture Guidelines）

> Shirone 全站性能设计的核心准则与工程实践。
> 配套规则：`rules/performance-rules.md`、`rules/project-rules.md`。
> 本地图片、图标与生成资产的目录和构建契约见 `docs/asset-pipeline.md`。

---

## 1. 核心理念

Shirone 遵循 **「内容先行、布局稳定、平滑渐显、按需水合、零额外负担」** 的性能哲学：

- **内容先于交互**：页面的主体可读内容（标题、正文、列表、卡片）必须在服务端直接渲染为静态 HTML，不依赖客户端 JavaScript 的下载与执行。
- **布局先于像素**：所有图片与媒体容器在资源加载前必须预先锁定几何尺寸与宽高比，彻底消除首屏与滚动时的累积布局偏移（CLS）。
- **动效自律与平衡**：动效服务于感知流畅度，统一使用 M3E 动效令牌，不阻塞首屏交互，并严格支持减弱动效降级。
- **关闭零开销**：任何可选功能或第三方扩展在未启用时必须产生 0 额外网络请求、0 额外 DOM 节点、0 产物体积膨胀。

---

## 2. 六大性能设计准则

### 2.1 SSR-First 渲染准则（消除首屏空白）

- **禁止滥用 `client:only`**：除涉及敏感密码/解密状态等必须在纯客户端执行的组件外，严禁在页面主体容器上使用 `client:only="svelte"`。
- **纯展示与交互分离**：
  - 纯展示组件无需客户端指令，直接由 Astro 在服务端编译输出为静态 HTML；
  - 包含客户端交互（如筛选、实时搜索、瀑布流定位）的组件，优先采用 `client:visible`（进入视口后惰性水合）或 `client:load`；
  - 确保在禁用 JavaScript 或弱网环境下，页面的静态内容依然完整可见。

### 2.2 Tonal Bloom 占位与防抖准则（消除 CLS 布局偏移）

- **几何尺寸预占位**：页面上的所有图片容器必须具备显式的 `aspect-ratio`（如封面 `16 / 9`、头像 `1 / 1`）或 CSS 尺寸，禁止由于图片异步加载完成导致周围元素位置跳动。
- **色调辉光占位（Tonal Bloom）**：
  - 统一接入 `ImageWrapper` 或 `image-bloom.css`；
  - 图片加载就绪前展示基于 M3E HCT 色彩衍生的渐变氛围底色；
  - 图片加载完成后平滑淡入（Fade-in），占位图层优雅淡出；
  - 全局配置 `imageBloomConfig.enable: false` 时不输出额外占位 DOM。

### 2.3 静态资源发现收窄准则（加速构建与冷启）

- **严禁宽泛 Glob**：禁止使用 `import.meta.glob("../**")` 无差别扫描工程目录。
- **显式扩展名过滤**：所有资源动态匹配必须指定精确后缀白名单：
  ```ts
  import.meta.glob<{ src: string }>("../**/*.{png,jpg,jpeg,webp,avif,svg,gif}", {
      import: "default",
  });
  ```
- **区分源文件与派生文件**：可编辑原图放在 `src/assets/` 或有稳定公开 URL 需求的 `public/images/`；可重复生成的缩略图统一放在 `public/assets/<domain>/`，忽略生成文件并保留 `.gitkeep`。禁止把临时图片写到仓库根目录或原图目录。
- **禁止持久化 Astro 内部 URL**：`/_image/`、`/@fs/` 和绝对磁盘路径只属于开发期图片服务，不得进入配置、内容或测试快照。
- **原图与列表图分工**：列表、网格和缩略图条使用响应式派生图，查看器和下载入口保留原图。完整流程见 `docs/asset-pipeline.md`。

### 2.4 动效令牌收敛与平滑切页准则（兼顾动画与帧率）

- **令牌驱动**：过渡与动画必须使用项目统一的 CSS 变量：
  - 时长：`--m3e-duration-short` (150ms)、`--m3e-duration-medium` (250ms/300ms) 等；
  - 缓动：`--m3e-easing-standard`、`--m3e-easing-emphasized-decelerate` 等；
  - 严禁散落手写未对齐的 `transition: all 0.3s`。
- **页面切换平滑滚动**：Swup 保持 `smoothScrolling: true` 配合 `transition-swup-` 贝塞尔过渡，保证切页时平滑自然回到顶部。
- **减弱动效强制静止**：所有动画及过渡必须通过 `@media (prefers-reduced-motion: reduce)` 或 `prefersReducedMotion()` 提供直接跳变终态，不产生动画残留。

### 2.5 滚动条槽位与布局宽度稳定准则（切页不横移）

- **槽位常驻预留**：`html` 必须保持 `scrollbar-gutter: stable`（`src/styles/main.css` 的 base 层）。文档级容器 `#main-layout` 是 `w-full` 的绝对定位元素，宽度等于初始包含块宽度；经典滚动条出现/消失会让整页横移一个滚动条宽度（Windows Chrome 15px）。Banner 模式因文档恒高于视口而滚动条常驻，纯色背景模式下短页没有滚动条，`#page-height-extend` 又会在切页两端临时开关滚动条，因此槽位预留是纯色模式切页不横移的前提。
- **语义是「有内容可滚动才显示滚动条」**：Banner 模式与所有长页因此与今天逐像素一致；短页不显示滚动条，只留 15px 空槽位。不用 `overflow-y: scroll`（滚动条常显）是因为短页会多出无意义的一条滚动条——实测其轨道色与页面底色差 (2,11,3)，而空槽位本就显示页面底色，顶栏右上角 15×64px 的差异也只有这一量级（暗色实测 Δ≤0.5）。旧版 Safari（< 18.2）忽略该声明，退回原行为；macOS 默认覆盖式滚动条本来就不影响布局宽度。
- **滚动锁必须实测再补偿**：任何以 `overflow: hidden` 锁定页面滚动的代码（如代码树全屏、Mermaid 全屏）必须走 `src/utils/scroll-lock.ts`，不得内联直接改 `body.style.overflow`。该工具用 `body` 的 border box 宽度锁定前后各测一次，只在布局真的变宽时补等量 `padding-inline-end`；槽位预留生效时滚动条消失但布局不变，补了反而会把顶部栏压窄 15px。补偿只覆盖 `body` 内容盒内的常规流元素（顶部栏等），`#main-layout` 由槽位预留兜底。
- **回归锁定**：`tests/site/layout-stability.spec.ts` 覆盖槽位预留、长短页布局宽度一致、长/短页双向 Swup 导航、壁纸模式切换、页面滚动锁与无槽位时的补偿；该 spec 刻意关闭 Playwright 默认的 `--hide-scrollbars`，否则滚动条宽度恒为 0，契约不可观测。

### 2.6 构建管线与资源预算准则（包体瘦身与离线自律）

- **构建显式压缩**：Vite 构建管线开启 esbuild 压缩、CSS 代码拆分，并在生产打包时通过 `pure: ["console.log", "console.debug"]` 自动移除调试日志。
- **离线与零外部依赖构建**：`fontConfig.subsetting.allowRemoteText` 默认设为 `false`，字体子集化与站点构建不依赖外部网络 API。
- **零额外负担落地**：第三方 widget（如评论、播放器）必须通过动态加载或条件构建插件接入。

---

## 3. 性能门禁与基线指标

| 指标 | 目标基线 | 含义与判定 |
|---|---|---|
| **LCP (Largest Contentful Paint)** | **< 500ms** | 最大内容绘制时间，首屏卡片与标题即时呈现 |
| **CLS (Cumulative Layout Shift)** | **< 0.05**（实测 <0.01） | 累积布局偏移，图片与组件加载零跳动 |
| **FCP (First Contentful Paint)** | **< 250ms** | 首次内容绘制，HTML 服务端直出即刻上屏 |

---

## 4. 验证与度量工具

- **自动化性能度量**：
  ```bash
  pnpm.cmd run perf:measure
  ```
  自动启动本地预览服务器，通过 Playwright 采集首页、友链、项目、番剧、动态、归档等核心页面的 Web Vitals 指标。
- **Lighthouse CI 审计**：
  ```bash
  pnpm.cmd lighthouse:desktop
  pnpm.cmd lighthouse:mobile
  ```
- **类型与构建检查**：
  ```bash
  npx.cmd astro check
  pnpm.cmd fonts:check
  pnpm.cmd build
  ```
