---
name: shirone-component-dev
description: Creating or modifying UI components in the Shirone theme - atomic design layering, M3E tokens, component API, icons, motion, and accessibility. Use when adding, changing, moving, or refactoring anything under src/components/.
---

# Shirone 组件开发

`src/components/` 按原子设计分层:`atoms/ → molecules/ → organisms/`，页面模板位于 `src/layouts/`，路由位于 `src/pages/`；高层只能组合本层与更底层。本技能约束新增或修改组件时的红线;完整模型以分层与 M3E 文档为准。

## 核心红线

1. **依赖方向**:只能引用本层与更底层;跨层引用一律 `@components/<层>/<文件>`,禁止 `../../` 相对链;禁止循环依赖;共享 UI 下沉为 molecule,不做 organism 平铺互引。
2. **职责边界**:原子/分子禁止查询内容集合(`posts`/`tags`/`categories`)、禁止 `localStorage` 持久化、禁止路由跳转——业务副作用归 organisms;Markdown 正文渲染唯一入口是 `src/components/content/Markdown.astro`。
3. **视觉一律走 token**:色值、圆角、字体、间距、动效用语义 token(`--primary`、`--surface-container-*`、`--shape-corner-*`、`--m3e-type-*`、`--m3e-duration-*`、`--m3e-easing-*`);交互反馈统一 `.m3-state-layer`,不自造 `:hover` 叠色;固定黑/白仅限图片覆盖层等文档化例外。视觉一致性以 `DESIGN.md` 为唯一真源。
4. **SSR 优先**:图标一律走 `atoms/display/Icon.svelte`,它在构建期内联服务端 SVG,`@iconify/svelte` 在无 hydration 岛上同样渲染——不需要为图标加水合岛;只有真正需要交互的组件加 `client:load`/`client:visible`,优先 `client:visible`;页面主体严禁 `client:only`。
5. **Svelte 单文件一种模式**:runes(`$props()`/`$state()`)与 legacy(`export let`/`$:`)不得混用;Stylus 中修饰符/元素选择器保持独立写法,防止 `&` 拼接出错误类名。
6. **文案不硬编码**:用户可见文案走 `src/i18n/i18nKey.ts` + `i18n()`(见 `shirone-i18n` 技能)。

## 新增原子的额外要求

- 先确认落地驱动(页面需要且现有原子组合不了),否则进 wishlist 不写码;
- 同一变更内更新 `src/components/atoms/manifest.json`(name/file/category/tier/source/landed/note)并跑 `pnpm.cmd check:manifest`;原子数量只在 manifest 里维护,不要在文档或说明中维护第二份计数;
- 暗色适配靠 CSS 变量自动切换,禁止组件内写 `.dark &` 颜色覆写。

## 动效

复用 `src/utils/motion.ts` 的 Svelte action(`fadeOutThenHide`、`flipFromRect`、`revealIn`、`collapse`),并遵守 `prefersReducedMotion()` 降级;新动效先读动效规范再动手。

## 必读文档

- `docs/atomic-structure.md` — 分层职责、依赖规则、禁止事项、落层决策表
- `docs/m3e-standard.md` — M3E 令牌层、形状契约、原子清单
- `DESIGN.md` — 视觉标识唯一真源(与 `docs/m3e-standard.md` 配合读)
- `rules/component-api.md` — 组件 API 设计契约(静态 .astro vs 交互原子、Props 规则)
- `rules/a11y.md` — 无障碍与键盘交互(闸门:axe WCAG 2.1 AA,明暗双模式 0 违规)
- `rules/css-important.md` — `!important` 的所有权边界
- `docs/common-components.md` — 分子组件目录与新增可复用组件/widget 流程
- `docs/animation.md` — 动效令牌、motion.ts 插件、降级约定
- `src/components/AGENTS.md` — 组件目录级附加规则
- `src/components/atoms/manifest.json` — 原子清单单一真源

## 验证命令

`npx.cmd astro check` → `pnpm.cmd check:manifest`(动过原子时)→ `pnpm.cmd design:lint`(token 违规)→ 最小 Playwright 分片 + `tests/site/icons.spec.ts` + `tests/site/a11y.spec.ts`;动效域变更加 `tests/site/motion.spec.ts`。

## npm 包兼容性

组件和布局修改必须同时适用于仓库 checkout 与 `node_modules` 中的 `shirones`。遵循 `src/integration/vite/overlay.ts` 的覆盖边界，保持包模式 alias 同步，并避免用 `process.cwd()` 读取主题自有文件。双模式检查清单见 `docs/packaging-contract.md` 和 `rules/project-rules.md` 第 12 节。
