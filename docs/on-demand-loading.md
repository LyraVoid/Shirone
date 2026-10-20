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
| --- | --- |
| `src/config/commentConfig.ts` | 配置单一真源 + `resolveCommentOptions()` 校验 |
| `src/types/commentConfig.ts` | 配置类型（字段带中文注释） |
| `src/components/organisms/comment/CommentSection.astro` | 消费方：短路 + 动态导入 |
| `src/components/organisms/comment/Twikoo.astro` | 特性组件：样式内嵌 + 运行时懒加载 |
| `src/components/organisms/comment/Giscus.astro` | 第二个 Provider 参考实现：一次性脚本注入 + 主题事件同步 |
| `src/components/organisms/comment/Waline.astro` | 第三个 Provider 参考实现：局部内联样式 + M3E token 适配 + 本地化加载/错误/无 JavaScript 提示 |
| `src/utils/waline-runtime.ts` | Waline 自定义元素：JS/CSS 按需加载、超时重试、控件增强、Swup 实例销毁与异步竞态防护 |
| `src/utils/emoji-tokens.ts` | 表情统一处理 API（纯函数）：表情包 → 键/图片/语义标签目录，按 Waline 实际渲染规则解析与回写 `:key:` 和 `<img class="wl-emoji">` |
| `src/utils/emoji-input.ts` | 表情输入框：以 SDK 的 `<textarea>` 为隐藏模型，在其后渲染可编辑表面，把表情显示为图标 |
| `src/utils/waline-emoji.ts` | Waline 表情接线：预取表情包 `info.json` 作为内联表情包交给 Waline，并导出输入框挂载函数；仅在启用表情时动态加载 |
| `src/types/stylus.d.ts` | `stylus` 包最小类型声明（构建期编译样式用） |
| `src/utils/script-loader.ts` | `loadScriptOnce(url, timeoutMs?)` 动态加载第三方 SDK 并去重；失败或超时后清理缓存以允许重试 |

Waline 的工具栏、RSS、位置与浏览器/系统图标由 `Icon.svelte` 在启用的评论组件内 SSR 输出到惰性模板，不增加图标网络请求。运行时保留 SDK 的节点与事件，通过局部 `MutationObserver` 为后续回复表单和切换状态补齐图标、状态层、上传按钮键盘入口与取消按钮；页面断开时同时销毁观察器。RSS 页脚保留 SDK 的本地化文字和订阅链接，两个入口始终可见并按空间换行。评论框照搬主题 Twikoo 编辑区的线条设计：编辑框在前、资料字段在后，都是 `--surface-container-low` 底色加 1px `outline-variant` 描边与 `--shape-corner-m` 圆角，资料字段前是 `--surface-container` 的固定标签段；聚焦时描边转为 `--primary` 并加 2px `--primary-container` 光环。操作行沿用 Twikoo 的 2.75rem 控件和内容：圆形图标按钮在前、按钮在后；Markdown 指南链接与纯字数统计隐藏，配置了字数上限时才保留计数与超限提示。按钮用 `--secondary-container` 色调（Twikoo 的 `--surface-container-high` 与暗色卡片同色，看不出按钮），提交用 `--primary`；手机上按钮单独占一整行并分摊宽度。reaction 数量和加载图标共享同一中心锚点。样式仍只在 Waline 启用时输出。

评论列表同样照搬主题的 Twikoo 样式，只在顶部多出文章表情反应：标题行上方是 1px `outline-variant` 分隔线，评论数加粗，排序选项是文字按钮（当前项为 `--primary` 粗体）；每条评论是 1px `outline-variant` 描边、`--shape-corner-l` 圆角的卡片（悬停为 Level 1 阴影），头像在左，昵称行、正文、浏览器/系统信息、回复表单与嵌套回复依次排在右侧同一列。回复是这一列里 `--page-bg` 底色、`--shape-corner-m` 圆角的描边小卡片，头像更小，没有回复时不留空容器；亮色模式下行内代码与代码块本与 `--page-bg` 同色，因此在回复卡片内提高到 `--surface-container-high`（Twikoo 在这里亮色下看不清代码底色，此处不照搬）。昵称加粗，徽章是 `--shape-corner-s` 的小标签，沿用 Twikoo 博主标签的配色（亮色 `--btn-regular-bg`，暗色 `--primary`），等级徽章用中性表面；时间用 Body Small。点赞、回复是名称行右侧的 `--primary` 小图标，按钮保留工具栏的触控尺寸并以负外边距溢出，不撑高名称行；状态层只包住图标与计数（32px 高的胶囊），只在悬停、按下和键盘焦点时出现，点击或轻触后按钮留着焦点也不常亮，触屏上也不显示悬停；Waline 写死为红色的已赞图标改用 `--primary`。正文对齐 Twikoo：链接与列表圆点用 `--primary`，各块之间留 `--m3e-space-2` 间距，让代码块、列表和引用不贴着上下文字（不照搬 Twikoo 的紧排），行内代码用 `--inline-code-*`，代码块是 `--codeblock-bg` 加描边，Waline 按深色代码块设计的高亮 token 映射到主题色；引用保留 `--primary` 引用条。浏览器/系统信息按 Twikoo 的顺序排列（位置、系统、浏览器），运行时按名称为每项配上品牌图标（Windows、Apple、Android、Linux、Edge、Chrome、Firefox、Safari、Opera、微信、QQ），认不出的名称用通用图标。窄屏时昵称与操作按钮保持同行，徽章与时间换到下一行，不照搬 Twikoo 把时间拆字换行；手机上只有昵称行留在头像旁，正文、浏览器/系统信息、回复表单与嵌套回复占满卡片宽度，嵌套回复的表单因此不被挤压；正文与上方的昵称、时间多隔一档（`--m3e-space-3`），时间因此归入卡片头部。回复与编辑表单像 Twikoo 一样出现在被回复评论的正文列内、嵌套回复之前，字段与文章表单相同且不加外框；取消也像 Twikoo 一样是操作行里提交按钮前的文字按钮：运行时插入一个转发到 SDK 关闭图标的按钮，文字取自 Waline 本地化的标题，SDK 的叉号在该按钮存在时隐藏，找不到操作行时作为后备保留。运行时把排序选项转为 radiogroup（单一 Tab 停靠点，方向键切换即选择），并把每个表情反应的图片框转为可切换按钮（ARIA 不允许列表项本身使用 button 角色），使二者都能用键盘操作。

表情启用时，评论框直接显示表情图标而不是 `:weibo_longing:` 这类短代码。所有表情的识别与回写都经过 `emoji-tokens`：它与 Waline 的 `parseEmoji` 使用同一扫描规则（`/:(.+?):/gu`，不跨行），只把 Waline 真正会渲染成图片的片段显示为图标；编辑模式和草稿里的 `<img class="wl-emoji">` 同样显示为图标并原样回写。图标的 `alt` 取表情的语义标签：词语名去掉分隔符（`laugh_and_cry` → `laugh and cry`），twemoji 这类码点名直接还原为对应的 Emoji 字符。同一行中较早的未配对冒号（如 `Note:`、`https:`）会吞掉短代码的开头冒号，此时选择器插入的表情改存为 Waline 自己的 `<img class="wl-emoji">`，保证评论框里的每个图标发布后仍是图片；手动输入的短代码则如实保持文字，与 Waline 预览一致。

`emoji-input` 不替换 Waline 的状态：SDK 的 `<textarea>` 保留为隐藏模型，用户编辑经原生 value setter 加 `input` 事件写回（与键盘输入同一路径，Vue 的 `v-model`、字数统计、预览和草稿存储照常工作）；SDK 自己的写入（上传占位、提交后清空、编辑模式、回复框共享草稿）经实例级 `value` 访问器观察后重新渲染；`selectionStart` / `selectionEnd` 与 `focus()` 由编辑表面应答，因此 SDK 在光标处插入的逻辑不变。选择器按钮在捕获阶段改由编辑表面插入，保留光标与撤销历史，按钮的 `mousedown` 不夺走焦点；粘贴、拖放的图片仍交给 Waline 的上传处理，文字只按纯文本插入；复制与剪切导出的是存储文本。Ctrl/Cmd+Enter 等快捷键转发给原 `<textarea>`。表情关闭（`emoji: false`）、表情包全部获取失败或模块加载失败时不挂载编辑表面，Waline 保留原生 `<textarea>`，表情模块也不会被下载。

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
- 多 Provider 特性（如评论的 Twikoo / Giscus / Waline）：`resolve*Options()` 返回判别联合，
  每个分支校验各自的必填字段——Giscus 的 `repo` / `repoId` / `categoryId`
  任一缺失同样返回 `null`，与未启用完全等价。
  选中 Waline 后，`serverURL` 必须是有效 HTTP(S) 地址，`scriptUrl` / `styleUrl`
  必须非空，否则同样不渲染评论区。Waline 选项以 JSON 写入页面，无法携带函数，
  因此 `imageUploader` / `highlighter` / `texRenderer` 只接受 `true` / `false`；
  传入函数会让 `resolveCommentOptions()` 在构建时直接报错，而不是悄悄退回 Waline 的默认实现。

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
  表情启用时，表情模块与表情包 `info.json` 和 JS/CSS 并行加载，同受 8 秒超时约束；
  取得的表情包以内联对象交给 Waline，Waline 不再重复请求。单个表情包失败时保留其 URL
  交给 Waline 自行重试，不阻断评论区初始化。`emoji: false` 时既不加载模块也不请求表情包。
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
  `tests/utils/emoji-tokens.test.mjs` 以 Waline 的 `parseEmoji` 为基准校验表情解析与回写；
  `tests/site/waline.spec.ts` 覆盖关闭状态、JS/CSS 懒加载、失败重试、Swup 切页与晚到响应、
  主题/移动端/减少动态效果、上传按钮键盘操作、Twikoo 式描边字段（固定标签段、聚焦描边与光环、
  编辑框在前）、表情输入框（选择、输入、粘贴、撤销、复制、SDK 写入、键盘与 axe、
  `emoji: false` 与表情包失败回退）、评论列表（Twikoo 式描边卡片与嵌套回复、回复卡片内代码的
  token、头像列与正文列布局及手机整宽布局、浏览器/系统图标与顺序、正文列内的无框回复表单、
  操作行里的取消按钮与隐藏的 Markdown 链接和字数、评论动作的紧凑状态层（点击后不常亮、键盘焦点
  可见）与正文块间距、排序 radiogroup 与表情反应的键盘操作、
  窄屏布局与双主题 axe）和无 JavaScript 回退。
- **Waline 开启态夹具**：`tests/fixtures/content/waline/config/comment.yaml` 只开启 Waline
  并填入不会被访问的 `serverURL`，SDK、样式、表情包与 API 均由 spec mock。
  `CONTENT_DIR=tests/fixtures/content/waline pnpm content:sync` 把它编译进
  `src/user/user-config.ts`，与内容仓配置覆盖走同一路径；之后运行
  `tests/site/comments.spec.ts`、`tests/site/waline.spec.ts` 与 `tests/site/a11y.spec.ts`，
  结束后用 `git restore src/user/user-config.ts` 还原覆盖层并删除 `content.lock.json`
  （`content:clean` 会连同挂载目录里未跟踪的内容一起清理，不适合这里）。
- **Twikoo 开启态夹具**：`tests/fixtures/content/twikoo/config/comment.yaml` 的 `envId` 与
  `scriptUrl` 对应 `tests/site/comments.spec.ts` 中的 mock，用法与还原方式同上，开启后运行
  `tests/site/comments.spec.ts` 中的 Twikoo UI 用例。
- **CI**：Comment regressions 任务先在默认关闭状态运行评论、Markdown 与 a11y 分片，再分别在
  Waline 与 Twikoo 夹具下运行对应的评论分片。
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
| --- | --- | --- |
| Astro CSS 提升 | 组件内 `<style>` / `?url` / `?inline` 导入会被收集进共享 CSS，所有页面加载 | `<style is:inline>` + 构建期编译（§3 L3） |
| `import.meta.env` 开关 | 非 Vite 上下文（Node 配置加载）下为 `undefined`，直接崩溃 | 开关走 config 字面量，不用 env |
| 测试依赖默认开启 | 默认关闭后 UI 测试失败 | `test.skip` 守卫（§4.3） |
| 第三方 SDK 进 bundle | 可选依赖被静态导入进主包 | 动态 `<script>` 注入 + `loadScriptOnce`（§3 L4） |
| 加载状态轮询 | 引入 MutationObserver / setInterval 增加复杂度 | CSS `:has()` 感知状态（§3 L4） |
| 关闭时输出骨架 | 即使关闭也渲染占位 DOM 造成布局偏移 | 消费组件短路 `return null`（§3 L1） |
