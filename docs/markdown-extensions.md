# Markdown 扩展开发规范
> 插件注册顺序、阶段依赖和变更验收以 [`markdown-plugin-order.md`](./markdown-plugin-order.md) 为准。

> Markdown 语法的内容特征、条件样式包、动态运行时和 Swup 资源生命周期见 [`markdown-on-demand-loading.md`](./markdown-on-demand-loading.md)。

> 本文档定义 Shirone 的 remark/rehype 扩展、生成式 Markdown 小组件、全局内容样式、缓存刷新和验证契约。

已落地的作者语法以 `src/plugins/markdown/manifest.json` 为机器可读单一索引；字段含义、查询和维护流程见 [`markdown-syntax-manifest.md`](markdown-syntax-manifest.md)。未落地的研究能力不得提前登记。

## 1. 处理链与所有权

`src/utils/markdown-processor.mjs` 是站点 Markdown 插件链的单一事实来源。Astro 页面渲染与构建期离线渲染必须共用 `siteRemarkPlugins` 和 `siteRehypePlugins`，不得在第二处复制插件配置。

职责边界如下：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 语法解析 | `src/plugins/markdown/code/`、remark 插件 | 把作者输入转换为稳定 AST，不拥有视觉样式 |
| DOM 生成 | `src/plugins/markdown/containers/`、rehype 插件 | 输出语义 HTML、无障碍属性和稳定组件 class |
| 可复用核心 | `src/plugins/markdown/core/` | 共享纯函数、图标和 SSR 原语，不查询浏览器状态 |
| 组件样式 | `src/styles/markdown/` | 生成式小组件的 token 驱动样式 |
| 样式入口 | `src/styles/markdown.css`、`src/components/content/Markdown.astro` | 确保全站文章页加载对应全局样式 |

扩展默认在构建期完成。能由原生 HTML 表达的交互优先使用 `<details>/<summary>` 等 SSR 可用原语，不为静态内容增加 hydration、客户端脚本或网络请求。

## 2. Typography 边界

`Markdown.astro` 使用 `.prose` 和 `@tailwindcss/typography` 管理普通文章内容。生成式组件必须先判断自己属于哪一类：

- **正文型扩展**：希望继承文章段落、标题、列表或链接排版，保留在 `.prose` 管理下。
- **完整小组件**：拥有自己的列表、网格、工具栏、树或卡片布局，根节点必须添加 `not-prose`，由组件 CSS 完整拥有内部几何。

完整小组件仍需显式重置会影响几何的原生样式：

```css
.custom-md .m3-example__root,
.custom-md .m3-example__children {
	margin: 0;
	padding: 0;
	list-style: none;
}
```

原因不是普通 specificity 不足。`src/styles/main.css` 将 `markdown.css` 导入 `layer(components)`，而 Typography 规则可能位于不同层；cascade layer 顺序优先于选择器权重。遇到冲突时：

1. 先确定 Typography 是否应该拥有该节点；
2. 完整小组件使用 `not-prose` 建立边界；
3. 修正样式入口、scope 或源码顺序；
4. 不使用 `!important` 或堆叠选择器掩盖错误所有权。

`!important` 的例外边界仍以 `rules/css-important.md` 为准。

## 3. 样式入口

- `src/styles/main.css` 全局导入 `src/styles/markdown.css`；后者再导入 `src/styles/markdown/*.css`。
- `src/styles/markdown-typography.css` 是受限的 Typography 级联桥接入口：仅允许包含 `.markdown-content` 范围内、需要与 `@tailwindcss/typography` 同处 `utilities` 层的正文排版覆盖。不得把普通 Markdown 组件样式迁入该文件或借此建立新的通用优先级层。
- `src/components/content/Markdown.astro` 以全局 Stylus 样式导入 `src/styles/markdown-extend.styl`，供历史 Markdown 扩展使用。
- 新的独立小组件优先放入 `src/styles/markdown/`，由 `markdown.css` 显式导入；不要在文章、页面或插件生成的 HTML 中内联重复样式。
- 颜色、圆角、字体、间距和动效使用项目 token。生成式组件 class 必须稳定，不能依赖随机 ID 作为样式契约。

### 3.1 提示容器

Admonition 支持现有方括号标题、GitHub Alert 与常用的空格标题写法：

```markdown
:::tip[原有标题]
正文
:::

::: warning 空格标题
正文
:::

> [!IMPORTANT]
> 正文

::: details 可选内容
正文
:::
```

类型集合为 `note | info | tip | important | warning | caution | details`。`remark-admonitions.mjs` 只负责在代码围栏之外归一化作者输入；方括号标题和 GitHub Alert 继续由既有 directive 管线解析，最终都进入 `rehype-component-admonition.mjs`。`details` 在内部使用独立指令名，避免 `rehype-components` 把渲染后的原生 `<details>` 再次当作待处理组件。

组件根节点使用 `not-prose`，内部段落、列表、引用、代码与折叠标题的几何由 `markdown/admonitions.css` 完整拥有。不要把提示容器重新改成 `blockquote`，也不要把样式追加回 `markdown-extend.styl`：前者会泄漏通用引用样式，后者会让新旧样式入口重复竞争。独立演示页位于 `src/content/posts/admonitions.md`。

### 3.2 马克笔高亮

Marker 使用 `==内容==` 为正文中的短语提供原生 `<mark>` 高亮；可选的语义后缀为 `.primary`、`.secondary`、`.tertiary`、`.error` 与 `.tip`：

```markdown
==默认使用主题主色==
==次级强调=={.secondary}
==需要修正的条件=={.error}
```

`remark-marker.mjs` 只在代码围栏和行内代码之外将作者语法改写为 text directive，再由 `rehype-component-marker.mjs` 输出带稳定 class 的语义化 `<mark>`。未知变体、空内容、未闭合语法和转义文本保留原文，避免不完整的文章内容被静默改写。样式位于 `markdown/marker.css`，只使用 M3E 语义色 token，不依赖客户端模块、动画或网络请求。独立演示页位于 `src/content/posts/marker-highlights.md`。

### 3.3 缩写词

Abbreviations 使用标准定义行 `*[TERM]: Full expansion`，在当前文章内为正文中的同名术语输出原生 `<abbr>`：

```markdown
*[SSR]: Server-Side Rendering
*[LCP]: Largest Contentful Paint

SSR-first output should keep LCP stable.
```

术语须以字母或数字开始，后续仅允许字母、数字、句点、下划线、加号或连字符，最长 48 个字符。定义只在当前 Markdown 文档生效且不输出为正文；重复、非法或空定义保留为普通 Markdown。已定义术语可出现在普通文本和粗体等标准行内 Markdown 中，代码围栏、行内代码、链接、图片和原始 HTML 不会被改写。输出保留原生 `abbr` 语义与可访问名称，并以「原生 Popover 顶层 + CSS Anchor 定位」的 tooltip 在悬停、键盘聚焦或触屏点击时展示释义；因为气泡位于 top layer，越过正文边界的部分不会被侧栏或父级布局裁剪，也不使用浏览器原生 `title` 气泡。文档包含该语法时才动态加载 `src/utils/abbreviations.ts` 绑定交互；纯 SSR 与禁用时零客户端模块、hydration 或网络请求。独立演示页位于 `src/content/posts/markdown-abbreviations.md`。

### 3.4 折叠面板

Collapse Panels 使用 `::: collapse` 包裹一个顶层无序列表，每个列表项的首个段落是标题，空行后的块级内容是面板正文：

```markdown
::: collapse accordion
- :+ 默认展开的标题

  支持段落、列表、引用和代码块。

- 第二个标题

  打开此项时，手风琴组中的上一项自动关闭。
:::
```

容器选项 `expand` 默认展开所有普通面板；在 `accordion` 模式中只默认展开第一项。条目标题前缀 `:+` / `:-` 分别覆盖当前条目的初始展开或折叠状态，手风琴只采用第一个 `:+`。解析器只接受一个顶层无序列表，并要求每项具有独立标题段落和正文；混合内容、缺少正文或未知容器选项会保留为普通 Markdown，不猜测边界。

渲染器组合 `core/disclosure.mjs` 输出原生 `<details>/<summary>`。手风琴通过文档内唯一的原生 `details[name]` 分组完成，不增加 hydration、客户端事件监听、模块或网络请求；普通模式允许多项同时展开。组件根节点使用 `not-prose`，紧凑连续面板、正文排版、窄屏间距、打印展开和 reduced-motion 降级由 `markdown/collapse-panels.css` 完整拥有。独立演示页位于 `src/content/posts/collapse-panels.md`。

### 3.5 选项组

Option Groups 使用 `::: tabs#同步标识` 容器和独占一行的 `@tab` 标记组织等价内容。`@tab:active` 指定初始项；标题末尾的 `#值` 提供稳定同步值，但不进入可见标题：

```markdown
::: tabs#runtime

@tab Node.js#node

Node.js 对应的完整 Markdown 正文。

@tab:active **Bun**#bun

Bun 对应的完整 Markdown 正文。

:::
```

同步标识只接受字母、数字、点、下划线和连字符。具有相同标识且包含相同值的选项组会同步切换，并在读者主动切换后把该值写入独立的 `localStorage` 键；无标识的组互不影响。每组至少需要两个值不重复的选项，每个 `@tab` 标题后必须用空行分隔非空正文。标题支持行内 Markdown，正文支持完整块级 Markdown。前导混合内容、单选项、重复值、空正文或不完整结构会保留为普通 Markdown。

SSR 输出不会预先隐藏任何面板，并重复输出每个面板标题，因此脚本不可用时仍能连续阅读全文。客户端模块只在页面实际包含 `.m3-option-group` 时动态加载，增强后才隐藏非活动面板并启用点击、方向键、Home/End、ARIA 状态、同 id 同步与记忆。初始化覆盖直接加载、Swup 内容替换和加密文章解锁；不使用 hydration、第三方依赖或网络请求。组件根节点使用 `not-prose`，选项栏保持单行并在自身范围内横向滑动；长标题截断但标签仍可点击，键盘切换只滚动该选项栏。窄屏边界和打印展开由 `markdown/option-groups.css` 完整拥有。独立演示页位于 `src/content/posts/option-groups.md`。

## 4. 缓存与刷新

普通 Markdown 图片独占一行时，即使紧邻正文或连续出现，也可以通过 title 为每张图片生成图注；与文字在同一行混排的图片不生成块级图注。宽度令牌为 `w-N%`（1–100）。

修改 remark/rehype 插件后，Astro dev 可能继续提供旧的 Markdown 编译结果。典型信号是：新 CSS 已出现，但插件新增的 class 或 DOM 结构不存在。

Windows 下的最小刷新流程：

```powershell
# 先在运行 dev server 的终端按 Ctrl+C
Remove-Item -LiteralPath ".astro\data-store.json" -Force
pnpm.cmd astro dev --port 4321
```

只在出现 Svelte scope hash、Vite 模块或 Stylus 产物不一致时，才进一步清理 `node_modules/.vite` 与整个 `.astro`。不要先清浏览器缓存，也不要通过长期保留无意义的文章正文改动来驱动重编译。

## 5. CSS 不生效的诊断顺序

| 观察 | 判断 | 下一步 |
| --- | --- | --- |
| 预期 class/DOM 不存在 | Markdown 编译结果陈旧或插件未注册 | 查 `markdown-processor.mjs`，再清 `.astro/data-store.json` 并重启 |
| DOM 正确，但组件规则不在样式表 | 样式入口遗漏或构建时被移除 | 查 `main.css`、`markdown.css`、`Markdown.astro` 与产物 CSS |
| 规则存在且命中，但 computed style 被改变 | Typography、cascade layer 或其他所有者冲突 | 判断是否应加 `not-prose`，检查 layer，不先加 `!important` |
| Svelte DOM 中 scoped class hash 不一致 | Vite/Svelte 编译缓存陈旧 | 清 `node_modules/.vite` 与 `.astro`，重启 |
| 直接加载正常，Swup 导航后异常 | 生命周期或页面替换边界错误 | 同时验证 direct load 与 client navigation |

检查顺序必须是 **DOM -> 样式表 -> computed style -> 缓存/生命周期**。只看源码声明无法证明浏览器最终采用了该值。

## 6. 测试契约

每个新的 Markdown 小组件至少覆盖：

1. Node 单元测试：输入语法、SSR DOM、稳定 class、无障碍属性、空输入和错误回退；完整小组件断言根节点含 `not-prose`。
2. Playwright：真实文章直接加载，断言关键 computed style、布局边界、键盘操作和无横向溢出。
3. 响应式：至少验证一个窄屏尺寸；移动端隐藏或换行策略必须有明确断言。
4. 无障碍：运行最小组件用例及 `tests/site/a11y.spec.ts` 的相关页面。
5. 构建验证：运行 `npx.cmd astro check` 与 `pnpm.cmd build`，不能只依赖 dev server 热更新结果。

Admonitions、Collapse Panels、Option Groups、Marker、File Tree、Code Tree、Steps 与 Content Annotations 的对应覆盖位于：

- `tests/plugins/markdown/containers/admonitions.test.mjs`
- `tests/plugins/markdown/inline/abbreviations.test.mjs`
- `tests/plugins/markdown/containers/collapse-panels.test.mjs`
- `tests/plugins/markdown/containers/option-groups.test.mjs`
- `tests/plugins/markdown/inline/markers.test.mjs`
- `tests/plugins/markdown/containers/file-tree.test.mjs`
- `tests/plugins/markdown/containers/code-tree.test.mjs`
- `tests/plugins/markdown/containers/steps.test.mjs`
- `tests/plugins/markdown/inline/content-annotations.test.mjs`
- `tests/plugins/markdown/core/disclosure.test.mjs`
- `tests/site/file-tree.spec.ts`
- `tests/site/admonitions.spec.ts`
- `tests/site/abbreviations.spec.ts`
- `tests/site/collapse-panels.spec.ts`
- `tests/site/option-groups.spec.ts`
- `tests/site/markers.spec.ts`
- `tests/site/code-tree.spec.ts`
- `tests/site/steps.spec.ts`
- `tests/site/content-annotations.spec.ts`

## 7. 提交前检查

- [ ] 插件已注册到统一 Markdown 处理链；
- [ ] 作者语法已登记到 `src/plugins/markdown/manifest.json`，且路径、状态与运行时成本真实；
- [ ] SSR 输出无不必要脚本、hydration 或外部请求；
- [ ] 完整小组件根节点包含 `not-prose`；
- [ ] 列表、网格和工具栏的几何由组件样式明确拥有；
- [ ] 没有使用 `!important` 对抗 Typography 或 cascade layer；
- [ ] 清理内容缓存后验证过真实输出；
- [ ] 单元测试、Playwright、a11y、Astro Check 与构建通过。

## 6.10 文件导入

使用独立一行的 HTML 注释，将仓库内 Markdown 文件在构建期展开到当前文章：

```markdown
<!-- @include: ../snippets/example.md -->
<!-- @include: ../snippets/example.md{2-6} -->
<!-- @include: ../snippets/example.md{5-} -->
<!-- @include: ../snippets/example.md{-4} -->
<!-- @include: ../snippets/example.md#region-name -->
```

路径相对当前 Markdown 文件解析，也可使用仓库根目录相对路径。行号从 1 开始且包含首尾行；区域由源文件中的 `#region name` 与 `#endregion` 标记界定。缺失文件、非法范围、未闭合区域、仓库外路径和递归包含都会保留原注释。代码围栏中的 include 注释不会展开。
