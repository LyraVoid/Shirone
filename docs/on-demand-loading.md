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
| `src/components/organisms/comment/Waline.astro` | 第三个 Provider 参考实现：局部内联样式 + M3E token 适配 + 本地化加载/错误/无 JavaScript 提示 |
| `src/utils/waline-runtime.ts` | Waline 自定义元素：JS/CSS 按需加载、超时重试、Swup 实例销毁与异步竞态防护 |
| `src/types/stylus.d.ts` | `stylus` 包最小类型声明（构建期编译样式用） |
| `src/utils/script-loader.ts` | `loadScriptOnce(url, timeoutMs?)` 动态加载第三方 SDK 并去重；失败或超时后清理缓存以允许重试 |

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
- 多 Provider 特性（如评论的 twikoo / giscus / waline）：`resolve*Options()` 返回判别联合，
  每个分支校验各自的必填字段——Giscus 的 `repo` / `repoId` / `categoryId`
  任一缺失同样返回 `null`，与未启用完全等价。Waline 配置块可省略以兼容旧配置；
  选中 Waline 后，`serverURL` 必须是有效 HTTP(S) 地址，`scriptUrl` / `styleUrl`
  必须非空，否则同样不渲染评论区。

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
- **Waline 的独立 JS/CSS**：`lazy: true` 时，两者都在评论区接近视口后加载；
  `lazy: false` 时立即加载。JS 使用 `loadScriptOnce(scriptUrl, 8000)` 去重，
  CSS 通过评论容器内的 `<link>` 加载，二者均成功后才初始化实例。资源加载超过
  8 秒或失败时显示本地化错误与重试按钮；自托管或升级客户端时，JS/CSS 必须保持同版本。
- **Waline 的页面生命周期**：`<shirone-waline>` 通过 `connectedCallback()` /
  `disconnectedCallback()` 覆盖直接加载与 Swup 容器替换；离开页面时销毁实例、
  断开观察器、取消页面监听及样式等待，并移除该实例的 CSS。共享 SDK 脚本保留复用，
  异步结果用页面代际和连接状态校验，避免脚本晚到时初始化已离开的页面。
- **一次性脚本的例外**：giscus 的 `client.js` 是绑定 `document.currentScript` 的一次性
  IIFE，复用 `loadScriptOnce()` 会让 Swup 换页后无法重新挂载；此时每次挂载注入新的
  `<script>` 元素（HTTP 缓存下成本极低），旧元素随容器替换自然丢弃，见 `Giscus.astro`；
- **加载状态**：优先用 CSS `:has()` 感知第三方组件的加载遮罩（如
  `&:has(> .el-loading-mask:not([style*="none"]))`），**不要**引入
  `MutationObserver` / 轮询 / 额外事件监听；
- **加载指示器**：复用项目原子组件（如 `LoadingIndicator`），不复制第三方样式。
- **iframe 的 `color-scheme` 只能放宽，不能收窄**：第三方 iframe 外壳必须声明
  `color-scheme: light dark`（与 giscus 自带 `default.css` 一致）。收窄成 `normal` /
  `only light` 后，浏览器偏好为暗色而站点仍是亮色时，Chromium 会给这个 light-only 的
  iframe 强制铺一层不透明深色画布，评论区出现黑底（见 `rules/pitfalls.md` §2.3）。
  外壳只负责声明自身支持的配色方案，iframe 内部配色仍由第三方 `data-theme` 自绘。

---

## 4. 验证清单

### 4.1 构建产物扫描（关闭状态）

临时把 `enable` 设为 `false` 构建，扫描 `dist/`：

```bash
pnpm.cmd build
```

确认：所有 HTML 页面无该特性的 DOM、无 `<style>`、无 `<link>`/`<script>` 引用；
无特性样式进入共享 CSS，第三方 SDK 与特性运行时不进入主 bundle。Astro 可能仍生成
未被引用的独立 Provider JS chunk；应检查页面和共享入口的依赖及浏览器请求，
不能仅凭该文件存在判定发生了加载。验证后恢复配置。

### 4.2 构建产物扫描（开启状态）

`enable: true` 构建后确认：特性样式**只**出现在渲染该特性的页面，非使用页面零引用。

### 4.3 Playwright

- **零足迹测试**：访问不含该特性的页面（如首页），断言无 `#comments` / 特性容器 DOM、
  无特性 CSS 资产请求；
- **Waline 回归入口**：`tests/waline-config.test.mjs` 验证配置解析与旧配置兼容；
  `tests/site/waline.spec.ts` 覆盖关闭状态、JS/CSS 懒加载、失败重试、Swup 切页与晚到响应、
  主题/移动端/减少动态效果、上传按钮键盘操作和无 JavaScript 回退。开启 Waline 并配置
  有效 `serverURL` 后运行该分片及 `tests/site/a11y.spec.ts`，再恢复原配置。
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
