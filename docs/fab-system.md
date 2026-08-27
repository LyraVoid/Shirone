# 右下角悬浮控制流（FAB）与移动端目录系统规范 — Shirone 主题

> 本文档定义 Shirone M3E 博客主题的右下角悬浮操作体系（Floating Action Button, FAB）与移动端大纲目录系统（Floating TOC）：
> 架构定位、原子化分层、细粒度设备受控矩阵、零额外负担原则、Swup 导航同步与无障碍标准。
> 适用版本：Astro 7 + Svelte 5 + Tailwind CSS 4。
> 配套文档：`docs/atomic-structure.md`（分层规范）、`docs/m3e-standard.md`（M3E 令牌与组件规范）、`docs/sidebar-system.md`（侧栏编排）、`src/config/README.md`（配置契约）。

---

## 1. 系统定位与设计愿景

Shirone 作为偏二次元现代风格的 **M3E（Material 3 Expressive 2025）** 博客主题，右下角悬浮控制流承担着关键的全局交互体验：

1. **按设备精细化呈现（Per-Device Granular Targeting）**：
   - 桌面端（≥ 1024px）：侧边栏已有粘性目录（`SidebarTOC`），默认隐藏 FAB-TOC，避免视觉冗余与遮挡；
   - 移动端（< 768px）与平板端（768px ~ 1023px）：侧边栏折叠隐藏，自动浮现 FAB-TOC，一键呼出 M3 风格目录卡片；
   - 支持开发者在配置中针对每一个按钮单独配置生效设备矩阵（`devices?: ("mobile" | "tablet" | "desktop")[]`）。
2. **零额外负担与 CSS-First SSR 直出（Zero Extra Burden & CSS-First Zero-Flicker）**：
   - 绝不依赖客户端 JS（如 `window.innerWidth`）进行首次显隐计算，彻底杜绝首屏闪烁（FOUC）与累计布局偏移（CLS = 0）；
   - 在 SSR 构建期通过纯函数生成确定的 Tailwind 响应式类名（如 `flex lg:hidden`、`hidden lg:flex`）；
   - 当特性关闭（如未开启评论或文章禁用评论）时，输出 **0 DOM 节点、0 外部请求、0 样式开销**。
3. **严格原子化解耦（Strict Atomic Hierarchy）**：
   - 遵循 `atoms` → `molecules` → `organisms` → `layouts` 单向依赖规范；
   - 单一 TOC 架构：旧版冗余的 `TOC.astro` 予以移除，侧栏目录直接封装于 `SidebarTOC.astro`，移动端目录由 `FloatingTOCPanel.astro` 独立承载。
4. **架构纯粹与单一职责（No Music in FAB）**：
   - FAB 控制流不集成音乐播放器，音乐播放能力由专属的持久侧栏组件（`MusicSidebar`）独立管理，保持 FAB 结构轻量与纯粹。

---

## 2. 原子化分层结构

```
src/
├── components/
│   ├── atoms/
│   │   ├── action/FAB.svelte              # M3E 官方规范 FAB 按钮原子
│   │   └── blog/TocList.astro             # 语义化 TOC 大纲列表原子
│   ├── molecules/
│   │   ├── FloatingActionButton.astro     # 响应式包装分子（设备受控 + 页面过滤）
│   │   ├── FloatingTOCPanel.astro         # 移动端/平板 M3 浮动大纲面板卡片分子
│   │   └── SidebarTOC.astro               # 桌面端侧边栏粘性大纲分子（含 custom element）
│   └── organisms/
│       ├── FloatingControls.astro         # 右下角悬浮控制流总编排有机体（挂载于持久外壳）
│       └── BackToTop.astro                # 向下兼容历史引用 shim
├── utils/
│   ├── fab-responsive.ts                  # SSR 响应式设备类名纯函数编译器
│   └── fab-controller.ts                  # 客户端滚动监听、Swup 钩子与 FAB 状态机
├── types/
│   └── fabConfig.ts                       # TypeScript 类型定义与配置契约
└── config/
    └── fabConfig.ts                       # 用户可配置的 FAB 行为与设备映射
```

---

## 3. 细粒度设备受控矩阵（Per-Device Matrix）

### 3.1 响应式断点映射

Shirone 对齐 Tailwind CSS 4 响应式标准断点：

| 语义标识 (`FabDeviceTarget`) | 断点区间 | 典型设备 | 适用说明 |
|---|---|---|---|
| `"mobile"` | `< 768px` | 手机竖屏/横屏 | 侧栏完全折叠，全屏阅读模式，需呼出悬浮目录 |
| `"tablet"` | `768px ~ 1023px` (`md` ~ `lg`) | iPad / 平板 | 侧栏处于单栏折叠流，需悬浮目录辅助导航 |
| `"desktop"` | `≥ 1024px` (`lg`+) | 桌面显示器 / 笔记本 | 侧栏处于双栏/三栏粘性呈现，自带侧栏目录，隐藏悬浮目录 |

### 3.2 SSR 响应式类名编译 (`src/utils/fab-responsive.ts`)

通过纯函数 `resolveDeviceClasses(devices)` 将设备数组编译为原子 CSS 类，确保首屏零水合开销：

```typescript
// 示例映射效果：
resolveDeviceClasses(["mobile", "tablet"])  => "flex lg:hidden"    // 仅在手机与平板显示
resolveDeviceClasses(["desktop"])            => "hidden lg:flex"    // 仅在桌面端显示
resolveDeviceClasses(["mobile"])             => "flex md:hidden"    // 仅在手机显示
resolveDeviceClasses(["tablet", "desktop"])  => "hidden md:flex"    // 平板与电脑显示
resolveDeviceClasses(undefined)              => "flex"              // 全设备通用
```

---

## 4. 移动端悬浮目录面板（`FloatingTOCPanel.astro`）

### 4.1 视觉与交互规范
- **容器材质**：M3 `Surface Container High` 令牌色（`var(--surface-container-high)`）+ 1px `var(--outline-variant)` 微边框；
- **阴影与圆角**：`box-shadow: var(--m3e-elevation-3)`，圆角 `var(--shape-corner-xl)`（28px）；
- **动效规格**：
  - 展开：`transform: translateY(0) scale(1)`，持续时间 `--m3e-duration-medium`（350ms），缓动 `--m3e-easing-emphasized-decelerate`；
  - 收起：`transform: translateY(0.75rem) scale(0.94)`，渐隐过渡；
- **滚动条隐藏与顺畅触控**：
  ```stylus
  .m3-floating-toc-panel__content
      overflow-y: auto
      overscroll-behavior: contain
      scrollbar-width: none
      -ms-overflow-style: none
      -webkit-overflow-scrolling: touch

      &::-webkit-scrollbar
          display: none
          width: 0
          height: 0
  ```
- **点击与键盘交互**：
  - 点击大纲锚点平滑滚动至标题对应视口（预留 80px 顶部固定导航间距），跳转后自动收起面板；
  - 支持快捷键 `Escape` 或点击面板外部区域无感关闭；
  - 具备标准无障碍属性：`role="dialog"`、`aria-modal="true"`、`aria-label`。

---

## 5. 零额外负担（Zero Extra Burden）与评论协同

### 5.1 评论按钮动态感知
1. **构建期检查**：若全局未启用评论系统（`commentConfig.enable: false`），评论按钮直接不输出 DOM；
2. **文章级检查**：若特定文章 frontmatter 设置 `comments: false`，文章页面容器标记 `data-has-comments="false"`；
3. **运行时协同**：`FabController.syncPageState()` 在 Swup 每次页面切换后，自动检测当前页面评论区节点（`#comments, [data-comment-section]`），无评论区时平滑隐藏评论按钮。

---

## 6. Swup 持久外壳（Persistent Shell）协同

`FloatingControls` 静态挂载于 `#swup-container` 外层的持久外壳中，避免全站页面跳转时的 DOM 重建与状态丢失：

1. **`swup:content:replace`**：
   - 重新读取新页面的 `data-current-page`；
   - 执行 `syncPageState()` 对带有 `data-fab-pages` 的按钮进行显隐过滤；
2. **`swup:visit:start`**：
   - 若悬浮目录面板处于展开状态，导航开始时自动收起面板；
3. **滚动阈值监听**：
   - 返回顶部按钮实时监听滚动高度，超过视口横幅高度阈值（`data-banner-height`）后平滑淡入。

---

## 7. 自动化测试与质量锁

本体系由 Playwright 测试矩阵全程覆盖（`tests/site/fab-navigation.spec.ts`）：

| 测试用例 | 验证要点 |
|---|---|
| **Desktop 测试** | 桌面视口（1280px）下 FAB-TOC 严格隐藏（`display: none`），BackToTop 滚动后正常浮现并支持回顶 |
| **Mobile 测试** | 移动视口（375px）下 FAB-TOC 正常显示，点击呼出大纲卡片，ESC 键与点击外部收起，点击标题平滑定位 |
| **Tablet 测试** | 平板视口（820px）下 FAB-TOC 正确呈现 |
| **A11y 测试** | 亮暗主题全页面无障碍扫描（`tests/site/a11y.spec.ts`）0 违规 |
| **TOC 回归** | 侧栏目录与长目录内部滚动测试（`tests/site/toc.spec.ts`）全部通过 |
