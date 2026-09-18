---
name: shirone-feature
description: Adding optional features, third-party integrations, or new config domains to the Shirone theme under the zero-extra-burden rule - config/data split, on-demand loading, and remote data contracts. Use when adding comments, analytics, widgets, remote data sources, or new toggleable capabilities.
---

# Shirone 可选功能与第三方集成

Shirone 的可选能力(评论、统计、音乐、追番、页脚注入等)遵循**零额外负担**(Zero Cost when Disabled)原则,原则定义在 `rules/project-rules.md` §7,落地方法以 `docs/on-demand-loading.md` 为准(参考实现:评论系统)。

## 零额外负担四规则(关闭/未配置/文章禁用时)

1. **零外部网络请求**:不预拉取任何第三方 script/link/font/iframe;
2. **零 DOM 污染与布局偏移**:不输出占位 DOM、空卡片或额外间距,存量页面 DOM/视觉快照基线 100% 不变;特性若自带导航/侧栏入口(导航链接、侧栏 widget、页内卡片、sitemap),关闭时必须与页面一起裁剪;
3. **零 bundle 膨胀**:第三方 SDK 不进主 bundle,按需动态引入;
4. **存量数据兼容**:内容 Schema 提供安全默认值,禁止强制批量改写存量文章 frontmatter。

## 核心红线

1. **L1 配置开关 + 短路**:新可选能力通常默认 `enable: false`，但已有功能的产品默认值不得擅自改变;凭据字段留空由用户填写。校验逻辑收敛在 config 的 `resolve*Options()` 纯函数里,消费组件在输出任何 DOM 前短路返回 `null`。
2. **L2 动态导入组件**:按 provider `(await import(...))` 引入特性组件,避免进主 bundle。**仅这一步不够**——Astro 会把模块图里的样式提升为共享 CSS,即使组件没渲染,所有页面仍会 `<link>` 它(实测约 12KB)。
3. **L3 样式隔离(最易踩坑)**:特性样式源码以模板字符串内嵌组件 frontmatter,构建期用项目已有的 `stylus` 依赖编译,`<style is:inline>` 输出,不让 Astro CSS 管线"看到"它;第三方 SDK 用 `src/utils/script-loader.ts` 的 `loadScriptOnce()` 去重懒加载,进入视口前不加载。
4. **配置与数据分层**:`src/config/*Config.ts` 管行为(开关/分类/排序/凭据),`src/data/*.ts` 管内容实体,`src/utils/feature-data.ts` 在构建期把行为规则应用到数据;新配置项的类型进 `src/types/<domain>Config.ts`,字段注释就是文档,barrel 注册见 `src/config/README.md`。
5. **远程数据契约**(全站统一,规范已冻结):区分**构建期快照平面**(纯静态化、凭据不进浏览器、禁运行时轮询)与**运行时按需平面**(交互/视口触发、不阻塞首屏 SSR);所有请求必须显式超时(`AbortSignal.timeout()`/`AbortController`)、请求去重、绑定 Swup 页面代际防止切页竞态。
6. **性能红线**:页面主体 SSR 直出,严禁 `client:only`;图片容器预设宽高比;动效走 token 并支持 `prefers-reduced-motion`。

## 必读文档

- `docs/on-demand-loading.md` — 四层防护落地做法与验证方法(L1–L3 + 验证)
- `docs/remote-data-system.md` — 远程数据双平面模型与网络契约(冻结规范)
- `rules/project-rules.md` — §7 零额外负担原则、§11 性能准则
- `rules/performance-rules.md` — 性能硬性红线
- `docs/performance-guidelines.md` — 性能架构指南
- `src/config/README.md` — 配置契约、config/data 判别表、新增配置项流程
- `docs/umami-guide.md` — Umami share URL、访问采集、客户端 API 与零负担说明
- 参考实现:`src/config/commentConfig.ts`、`src/components/organisms/comment/CommentSection.astro`、`src/components/organisms/comment/Twikoo.astro`、`src/components/organisms/comment/Giscus.astro`(第二 Provider:一次性 IIFE 脚本注入与主题事件同步的例外模式)、`src/utils/script-loader.ts`

## 验证命令

`npx.cmd astro check` → 关闭状态下 `pnpm.cmd build`,检查产物中无该特性的 CSS/JS/外部请求 → 开启状态跑对应 Playwright 分片(如 `tests/site/comments.spec.ts`)+ `tests/site/a11y.spec.ts` → 有页面级影响时运行 `pnpm.cmd perf:measure` 并记录 LCP/CLS；该脚本目前只测量和打印指标，不会自动执行阈值断言。
