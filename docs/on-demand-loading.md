# 按需加载与关闭零开销指南（On-demand Loading / Zero Cost when Disabled）

> Markdown 语法由内容命中驱动，不属于配置开关；其特征探测、样式包与 Swup 资源生命周期见 [`markdown-on-demand-loading.md`](./markdown-on-demand-loading.md)。

> 适用对象：任何可选特性、侧栏 widget、第三方服务（评论、统计、分享等）或可配置能力。
> 原则定义见 `rules/project-rules.md` §7；本文档给出**落地做法**与**验证方法**，参考实现为评论系统。

---

## 1. 目标定义

一个可选特性在**关闭 / 未配置 / 文章禁用**时，必须做到：

1. **零外部网络请求**：不预拉取、不加载任何第三方 script / link / font / iframe；
2. **零 DOM 与布局偏移**：完全不输出占位 DOM、空卡片、额外 margin / padding；
3. **零 bundle 膨胀**：第三方 SDK 与特性代码不进主 bundle，按需引入；
4. **零样式污染**：特性样式不进入共享 CSS，非使用页面不加载（见 §3，最易踩坑）。

开启时尽量**懒加载**：进入视口前不加载外部脚本。

---

## 2. 参考实现文件

| 文件 | 职责 |
|---|---|
| `src/config/commentConfig.ts` | 配置单一真源 + `resolveCommentOptions()` 校验 |
| `src/types/commentConfig.ts` | 配置类型（字段带中文注释） |
| `src/components/organisms/comment/CommentSection.astro` | 消费方：短路 + 动态导入 |
| `src/components/organisms/comment/Twikoo.astro` | 特性组件：样式内嵌 + 运行时懒加载 |
| `src/components/organisms/comment/Giscus.astro` | 第二个 Provider 参考实现：一次性脚本注入 + 主题事件同步 |
| `src/types/stylus.d.ts` | `stylus` 包最小类型声明（构建期编译样式用） |
| `src/utils/script-loader.ts` | `loadScriptOnce()` 动态加载第三方 SDK 并去重 |

**第二个参考实现（值得为重量级 npm 依赖抄一遍）：雨滴窗玻璃特效**

| 文件 | 职责 |
|---|---|
| `src/config/rainyDayConfig.ts` + `src/types/rainyDayConfig.ts` | 配置单一真源 + `resolveRainyDayOptions()` 校验、数值裁剪与关闭短路 |
| `src/components/molecules/BannerRainyWindow.astro` | 特性组件：零 CSS（全内联样式）+ 运行时懒加载（`load` + 空闲后才 `import("@arayui/rainy-day")`） |
| `astro.config.mjs` / `src/integration/index.ts` | 关闭时把组件模块整体替换为 `null`（`virtual:shirone-banner-rainy-window` + `generateBundle` 丢弃残留 chunk） |

它与评论系统的差别：依赖是 **npm 包而非 CDN 脚本**，所以「不进主 bundle」不能靠运行时注入 script，
必须配合虚拟模块把整块模块图摘掉；`astro.config.mjs` 里的开关与 `src/integration/` 必须同步（打包契约）。

---

## 3. 四层防护（按顺序落实）

### L1 配置默认关闭 + 组件短路

配置默认关闭，字段留空由用户填写：

```ts
// src/config/commentConfig.ts
export const commentConfig: CommentConfig = {
	enable: false,        // 默认关闭，零负担模板
	provider: "none",
	twikoo: { envId: "", /* 用户填写自己的地址 */ },
};
```

消费组件在渲染任何 DOM **之前**做校验短路：

```ts
// CommentSection.astro
const options = resolveCommentOptions(commentConfig);
if (!options || !postCommentEnabled) {
	return null;   // SSR 不输出任何节点
}
```

- 规则：可选特性默认 `enable: false`；校验逻辑收敛在 config 的 `resolve*Options()` 里，组件只消费解析结果。
- 多 Provider 特性（如评论的 twikoo / giscus）：`resolve*Options()` 返回判别联合，
  每个分支校验各自的必填字段——Giscus 的 `repo` / `repoId` / `categoryId`
  任一缺失同样返回 `null`，与未启用完全等价。

### L2 动态导入组件，避免进主 bundle

```ts
// CommentSection.astro
const Twikoo =
	options.provider === "twikoo"
		? (await import("@components/organisms/comment/Twikoo.astro")).default
		: null;
```

**注意：仅这一步不够。** Astro 会把模块图里的组件样式提升（hoist）为共享 CSS，
即使组件没有渲染、即使用的是 `?url` / `?inline` 导入，构建产物里所有共享布局的页面
仍会 `<link>` 这份 CSS。实测关闭评论时全部页面仍加载约 12KB。必须配合 L3。

### L3 样式隔离：`<style is:inline>` + 构建期编译（核心）

不要让 Astro 的 CSS 管线"看到"这份样式。做法：样式源码以模板字符串内嵌在组件
frontmatter，构建期用项目已有的 `stylus` 依赖编译成 CSS 字符串，再经
`<style is:inline set:html>` 随组件渲染内联输出：

```ts
// Twikoo.astro frontmatter
import stylus from "stylus";

const twikooStylus = `
	.shirone-twikoo-wrapper
		--tk-color-primary: var(--primary)
		...
`;

const twikooStyles = await new Promise<string>((resolve, reject) => {
	stylus.render(twikooStylus, (error, css) => {
		if (error) reject(error);
		else resolve(css);
	});
});
```

```astro
<!-- 组件模板：只随组件渲染出现 -->
<style is:inline set:html={twikooStyles}></style>
```

效果：

- 组件不渲染（关闭 / 未启用）→ 页面中**没有任何**该特性样式，dist 中也没有对应 CSS 资产；
- 组件渲染（开启的文章页）→ 样式内联在该页面 HTML 中，无需额外请求。

配套：

- `stylus` 无类型声明，需要 `src/types/stylus.d.ts` 提供最小 `declare module`；
- **不要**用 `import.meta.env` 做开关：config 文件可能被 Node 上下文（如 `astro.config.mjs`）
  导入，那里 `import.meta.env` 为 `undefined`，会直接崩溃；开关一律走 config 字面量。

### L4 运行时按需加载

- **视口懒加载**：`IntersectionObserver` 进入视口（预留 `rootMargin`）才执行初始化，
  进入视口前不加载外部脚本；
- **SDK 去重**：`loadScriptOnce(scriptUrl)` 保证同一脚本只注入一次（Swup 多次换页安全）；
- **一次性脚本的例外**：giscus 的 `client.js` 是绑定 `document.currentScript` 的一次性
  IIFE，复用 `loadScriptOnce()` 会让 Swup 换页后无法重新挂载；此时每次挂载注入新的
  `<script>` 元素（HTTP 缓存下成本极低），旧元素随容器替换自然丢弃，见 `Giscus.astro`；
- **加载状态**：优先用 CSS `:has()` 感知第三方组件的加载遮罩（如
  `&:has(> .el-loading-mask:not([style*="none"]))`），**不要**引入
  `MutationObserver` / 轮询 / 额外事件监听；
- **加载指示器**：复用项目原子组件（如 `LoadingIndicator`），不复制第三方样式。

---

## 4. 验证清单

### 4.1 构建产物扫描（关闭状态）

临时把 `enable` 设为 `false` 构建，扫描 `dist/`：

```bash
pnpm.cmd build
```

确认：所有 HTML 页面无该特性的 DOM、无 `<style>`、无 `<link>`/`<script>` 引用；
dist 中无对应 CSS 资产、无对应 JS chunk。验证后恢复配置。

### 4.2 构建产物扫描（开启状态）

`enable: true` 构建后确认：特性样式**只**出现在渲染该特性的页面，非使用页面零引用。

### 4.3 Playwright

- **零足迹测试**：访问不含该特性的页面（如首页），断言无 `#comments` / 特性容器 DOM、
  无特性 CSS 资产请求；
- **UI 测试跳过守卫**：特性默认关闭，UI 测试依赖真实渲染，因此在每个 UI 测试开头：

```ts
const commentsUiEnabled = resolveCommentOptions(commentConfig) !== null;

test("...", async ({ page }) => {
	test.skip(
		!commentsUiEnabled,
		"评论默认关闭，请在 src/config/commentConfig.ts 开启后运行 UI 测试",
	);
	// ...
});
```

这样默认状态下测试套件全绿（UI 用例跳过），本机开启特性后 UI 用例自动运行。

---

## 5. 常见陷阱小结

| 陷阱 | 说明 | 解法 |
|---|---|---|
| Astro CSS 提升 | 组件内 `<style>` / `?url` / `?inline` 导入会被收集进共享 CSS，所有页面加载 | `<style is:inline>` + 构建期编译（§3 L3） |
| `import.meta.env` 开关 | 非 Vite 上下文（Node 配置加载）下为 `undefined`，直接崩溃 | 开关走 config 字面量，不用 env |
| 测试依赖默认开启 | 默认关闭后 UI 测试失败 | `test.skip` 守卫（§4.3） |
| 第三方 SDK 进 bundle | 可选依赖被静态导入进主包 | 动态 `<script>` 注入 + `loadScriptOnce`（§3 L4） |
| 加载状态轮询 | 引入 MutationObserver / setInterval 增加复杂度 | CSS `:has()` 感知状态（§3 L4） |
| 关闭时输出骨架 | 即使关闭也渲染占位 DOM 造成布局偏移 | 消费组件短路 `return null`（§3 L1） |
