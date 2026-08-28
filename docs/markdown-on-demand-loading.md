# Markdown 内容驱动按需加载规范

> 状态：规范性文档。用于约束 Shirone 自定义 Markdown 语法的特征探测、样式拆分、客户端增强和 Swup 生命周期。
>
> 通用配置型功能仍遵循 [`on-demand-loading.md`](./on-demand-loading.md)；语法定义、解析与 DOM 所有权仍遵循 [`markdown-extensions.md`](./markdown-extensions.md) 和 [`markdown-syntax-manifest.md`](./markdown-syntax-manifest.md)。

## 1. 目标与边界

作者只负责书写 Markdown。作者不得为了启用语法而维护 frontmatter 开关、全局布尔配置或资源清单。系统必须从成功解析的内容中生成特征快照，并据此决定当前页面需要哪些 CSS、JavaScript 和外部资源。

本规范的目标是：

1. 普通文章不下载未使用语法的资源，也不产生对应的运行时监听器或增强 DOM。
2. 所有正文在 JavaScript 不可用时仍可阅读；交互脚本只能增强 SSR 输出。
3. 直接加载、Swup 导航和加密文章解锁使用同一套特征与运行时契约。
4. 共享资源按职责打包，避免一个微小语法对应一个网络请求。
5. 新语法接入统一注册表，不在页面模板、运行时和测试中分别维护互相漂移的名单。

本规范不要求构建产物中完全不存在未被某篇文章使用的 chunk。验收对象是浏览器对当前页面的实际请求、样式表、脚本执行和 DOM，而不是 `dist/` 中是否存在可供其他页面使用的静态文件。

## 2. 两种“按需”必须区分

| 级别 | 定义 | 可接受用途 |
| --- | --- | --- |
| 首次命中按需 | 当前会话第一次遇到语法时加载，之后资源可能留在页面或模块缓存中 | 选择器作用域严格、体积较小且无法可靠卸载的增强脚本 |
| 页面级按需 | 资源只属于当前目标页面；离开最后一个消费者后由 Swup head 生命周期移除 | 会影响布局的语法 CSS、第三方样式、需要严格物理隔离的资源 |

动态 `import("./feature.css")` 通常只能保证“首次命中按需”。Vite 注入的样式节点不会因为 Swup 离开文章而自动移除，因此不能把它当作页面级 CSS 隔离方案。

如果资源只要求首次命中加载，必须满足：

- 所有选择器限定在稳定的语法根 class 下；
- 未命中语法时没有初始请求；
- 加载后对后续不含该语法的页面没有 computed-style 影响；
- 不创建脱离语法根节点的占位 DOM、全局控件或轮询器。

## 3. 强制不变量

### 3.1 内容探测

- 特征只能由 Markdown 处理链生成，不能信任作者手写的同名 frontmatter。
- 只有语法成功解析并准备输出对应 DOM 后才能标记命中。非法输入或回退为普通 Markdown 的输入不得误报。
- 负责确认语法成立的 remark/rehype 插件应同时负责记录特征；只有数学、普通代码块等稳定通用节点可以由集中探针收集。
- `src/plugins/markdown/manifest.json` 是语法身份、样式、运行时和测试路径的单一索引。资源注册不得再维护第二份完整语法清单。

### 3.2 SSR 优先

- `runtime.mode` 为 `none` 或 `native` 的语法不得为了资源加载而新增客户端 JavaScript。
- `client-enhanced` 语法的初始 HTML 必须完整、可读且语义正确；脚本失败时不能丢失正文。
- 条件 CSS 若决定布局，必须由目标页面的 `<head>` 声明，不能等到 `content:replace` 后再动态导入造成无样式闪烁。
- 客户端增强不得成为生成标题、正文、文件树节点或备选内容的唯一途径。

### 3.3 零额外负担

页面未命中某项语法时，该语法必须满足：

- 零对应 CSS/JS/第三方资源请求；
- 零增强 DOM 和布局偏移；
- 零语法专用事件监听器、观察器和定时器；
- 零外部网络请求；
- 不要求作者添加兼容性 frontmatter。

共享的 Markdown 基础排版和轻量运行时调度器不计作某一语法的专用负担，但必须保持职责最小，不得静态导入可选实现。

## 4. 资源分层

### A. Markdown 基础层

基础层随文章页面加载，负责普通段落、标题、列表、引用、表格、链接、行内代码和普通图片。它不能包含独立自定义语法的完整组件样式。

基础层当前由以下入口共同拥有：

- `src/styles/markdown.css` 中的通用正文规则；
- `src/styles/markdown-typography.css` 中的 Typography 桥接；
- `src/styles/markdown-extend.styl` 中尚未迁出的遗留通用规则。

迁移过程中必须先把“普通 Markdown 必需规则”和“自定义语法规则”分离，再从全局入口移除后者。不能先删除全局导入，再依赖客户端脚本补样式。

### B. 条件样式包

SSR 组件和首帧布局依赖的样式使用构建期特征决定条件 `<link rel="stylesheet">` 或内联 `<style>` 是否出现。样式按共享所有权分包，不按语法数量机械拆包。

目标样式包如下：

| 样式包 | 消费语法 | 说明 |
| --- | --- | --- |
| `markdown-disclosures` | admonition、collapse-panels、file-tree | 原生 disclosure 与提示容器共享的结构规则 |
| `markdown-trees` | file-tree、code-tree | 文件层级、图标、差异状态和树形布局 |
| `markdown-inline-enhancements` | abbreviation、content-annotation、marker | 正文内增强，保持在 `.custom-md` 边界内 |
| `markdown-option-groups` | option-groups | SSR 面板和增强后 tabs 的稳定布局 |
| `markdown-steps` | steps | 步骤轨道与序号结构 |
| `markdown-media` | image-grid、image-presentation | 文章图片画廊、宽度与图注 |
| `markdown-code` | expressive-code、code-tree 中的代码面板 | Expressive Code 覆盖与折叠控件样式 |
| `markdown-math` | math | KaTeX 与滚动容器依赖 |

同一页面命中多个消费者时，每个样式包只能声明一次。若实测某个包非常小且拆分会增加更多请求，可以与生命周期相同的相邻包合并；合并决定必须记录在清单说明中，并以生产构建请求数据为依据。

页面级样式有两种允许的输出形式：

- 可由构建器安全产出地址的样式使用 `<link rel="stylesheet" data-swup-optional="<pack-id>">`。
- 纯 SSR 样式若用 `?url` 导入会让未命中页面仍请求 Vite URL 模块，可由服务器按 `process.cwd()` 解析源码并输出 `<style data-swup-optional="<pack-id>">`。不得使用预渲染后的 `import.meta.url` 回读 `src/styles`，因为静态构建时模块已移动到 `dist/.prerender`。

两种形式都必须由当前页面的特征快照决定，且同一包在一个 `<head>` 中只出现一次。

### C. 选择器驱动的动态运行时

交互实现继续由 `src/utils/markdown-runtime.ts` 统一调度。每个运行时描述符至少包含：

- 能唯一确认最终 DOM 的稳定选择器；
- 动态模块加载函数；
- 接收当前 Markdown 根节点的幂等初始化函数；
- 可重复调用或全局只绑定一次的明确契约；
- 若创建观察器、控制器或全局监听器，对应的清理所有者。

特征元数据负责避免错误资源进入页面，DOM 选择器负责在运行时再次确认。两者是双重防线，不能用其中一个完全替代另一个。

### D. 用户意图触发资源

Fancybox、远程视频和其他第三方能力必须在内容命中后继续等待用户动作或明确的视口策略。GitHub card 的 `::github` 作者语法本身是该卡片元数据请求的明确启用意图，因此命中后可加载 GitHub API；普通 GitHub 链接不得触发预取。内容特征命中只表示“允许加载”，不表示必须在首屏立即加载。

## 5. 特征快照契约

`remarkPluginFrontmatter.markdownSyntaxes` 是构建期生成数据，不是作者配置。它取代布尔 `markdownFeatures` 与 `hasMath`、`hasMermaid`、`hasCodeInteractions` 兼容字段。若第三方 Markdown 集成在该快照可用前消费节点，页面可读取同一归一化语法链生成的专用源 AST 快照；不得改用正文正则或客户端 DOM 探测。

目标快照应表达语法事实，而不是直接复制打包决策：

```ts
type MarkdownSyntaxSnapshot = {
	schema: 1;
	syntaxes: readonly MarkdownSyntaxId[];
};
```

样式包和运行时由站点注册表根据 `syntaxes` 推导；页面级 CSS 以 manifest 顶层 `stylesheetPacks` 的语法声明为准。禁止让每个插件直接写入 CSS URL、chunk 名或页面模板标记，否则资源拆包会反向污染解析层。

迁移要求：

1. 数组去重并保持稳定排序，保证缓存和测试输出确定。
2. 语法 ID 必须来自 Markdown manifest；未知 ID 在开发和 CI 中报错。
3. 离线渲染器与 Astro `render(entry)` 必须返回相同快照。
4. 加密文章仍在构建期获得完整快照，但受保护正文不能因为资源标签泄露敏感文本。
5. 兼容字段不得重新引入；需要布尔判断时由消费者调用共享快照查询函数。

## 6. 现有语法的目标分类

| 语法 | 首帧样式 | 客户端运行时 | 目标加载方式 |
| --- | --- | --- | --- |
| abbreviation | inline enhancements | `abbreviations.ts` | 条件 CSS + 选择器动态 JS |
| admonition | disclosures | 无 | 条件 CSS，纯 SSR |
| code-tree | trees + code | `code-tree.ts`、复制交互 | 条件 CSS + 选择器动态 JS |
| collapse-panels | disclosures | 无 | 条件 CSS，原生 `<details>` |
| content-annotation | inline enhancements | 无 | 条件 CSS，原生 Popover |
| expressive-code | code | `code-copy.ts`、`code-collapse.ts` | 条件 CSS + 分离的动态 JS |
| file-tree | disclosures + trees | 无 | 条件 CSS，原生 `<details>` |
| image-grid | media | Fancybox | 条件 CSS；灯箱等待用户意图 |
| image-presentation | media | 无 | 条件 CSS，纯 SSR |
| marker | inline enhancements | 无 | 条件 CSS，纯 SSR |
| math | math | `katex-scroll.ts` | 条件第三方 CSS + 选择器动态 JS |
| mermaid | Mermaid 专用样式 | `mermaid.ts`、`mermaid-interaction.ts` | 可读 fallback；样式严格按页管理，运行时首次命中加载 |
| option-groups | option groups | `option-groups.ts` | 条件 CSS + 选择器动态 JS |
| steps | steps | 无 | 条件 CSS，纯 SSR |
| github-card | legacy | `github-cards.ts` | SSR 仓库链接 + 条件 GitHub API 元数据增强 |
| spoiler | legacy | 无 | 不扩展使用面；迁移时补齐触屏与键盘语义 |

Mermaid 样式由 `stylesheetPacks.mermaid` 输出为 Swup 管理的可选 style block，离开 Mermaid 页面后随页面 head 生命周期移除；`mermaid.ts` 与交互模块仍仅在首次命中 Mermaid DOM 时加载。不得在运行时中手工遍历或删除 Vite 注入节点。

Legacy `github-card` 保留 `::github{repo="owner/repo"}` 作者输入。SSR 始终输出含 `noopener noreferrer` 的仓库链接；仅当页面命中该语法时，`github-cards.ts` 才动态加载并请求 GitHub API，以填充描述、星标、分叉、许可证、语言和头像。请求失败时回退为 SSR 链接，Swup 内容替换会取消尚未完成的请求。`spoiler` 仍为 legacy：在补齐原生键盘与触屏语义前，不得新增使用或作为新语法的实现参考。

## 7. Swup 生命周期

持久外壳不随 `#swup-container` 重建，因此页面资源和运行时必须分别处理：

1. 基础 `<link>` 和 `<style>` 使用 Swup 的持久规则保留。
2. 条件 stylesheet 或 style block 必须带 `data-swup-optional="<pack-id>"`，不得匹配持久选择器。
3. 从命中页导航到未命中页时，旧条件 stylesheet 必须移除；反向导航必须插入目标 stylesheet。
4. 影响布局的 stylesheet 必须在目标内容显示前可用。不能用 `content:replace` 后的异步导入弥补。
5. `content:replace` 后，运行时调度器只扫描新的 `#swup-container`；全局事件委托可以保留，但必须幂等绑定。
6. `page:view` 用于依赖最终可见页面的行为，不得重复承担内容替换初始化。
7. 浏览器前进/后退和 Swup cache 恢复必须与普通客户端导航等价。

`astro.config.mjs` 的 `persistTags` 规则必须持续从 `link` 与 `style` 两类节点排除 `[data-swup-optional]`。新增样式包时不得把可选资源改成 `data-swup-persist`。

## 8. 加密文章

加密文章解锁后不会重新执行 Astro 页面脚本。解锁流程必须在插入正文后调用共享的 `initMarkdownRuntime(container)`，不得为每项语法维护一套解密专用初始化代码。

样式有两种允许路径：

- 构建期快照可以安全公开语法类别时，由文章 `<head>` 预先声明条件样式；
- 若语法类别也需要隐藏，则解锁控制器通过统一资源管理器加载对应样式包，并等待样式就绪后显示正文。

不得把明文、标题、代码内容或 Mermaid 源码写入特征快照或资源 URL。

## 9. Manifest 与注册表

每项生产语法必须在 `src/plugins/markdown/manifest.json` 准确声明：

- `styles`：实际拥有该语法视觉结果的源文件；
- `runtime.mode`：`none`、`native`、`client-enhanced` 或受控遗留模式；
- `runtime.modules`：只有页面命中后才允许加载的模块；
- `runtime.network`：所有可能的外部请求；
- `tests`：至少一个解析或站点级证据。

资源注册表可以维护可执行加载函数，但必须引用 manifest 中已有的语法 ID。`pnpm.cmd check:manifest` 应逐步增加以下校验：

- 注册表引用的语法 ID 存在且为生产状态；
- client-enhanced 语法至少有一个运行时模块和 DOM 选择器测试；
- native/none 语法没有客户端模块；
- 条件样式包引用的源文件在 manifest 中可追溯；
- 同一个 CSS 源文件不会同时进入基础包和条件包。

## 10. 测试与验收

每次迁移一个语法或样式包，至少覆盖以下矩阵：

| 场景 | 必须断言 |
| --- | --- |
| 普通文章直接加载 | 没有目标 CSS/JS 请求，没有目标增强 DOM |
| 语法文章直接加载 | SSR 内容可读，条件样式存在，增强完成 |
| 普通文章 -> 语法文章 | Swup 添加样式，运行时只初始化新容器 |
| 语法文章 -> 普通文章 | 页面级样式被移除，普通内容 computed style 未污染 |
| 语法 A -> 语法 B | 共享包不重复请求，独占包正确替换 |
| 后退/前进 | 与普通 Swup 导航结果一致 |
| JavaScript 禁用 | 正文、文件树和 fallback 仍可阅读 |
| 加密文章解锁 | 插入正文后样式和运行时均正确，且不重复绑定 |

请求测试应监听明确的源模块或生产 chunk，不只断言 DOM 最终存在。样式测试同时检查 `<link>/<style>` 数量和关键 computed style，避免“资源已请求但级联未生效”的假通过。

最低验证命令：

```powershell
pnpm.cmd check:manifest
npx.cmd astro check
npx.cmd playwright test tests/site/markdown-runtime.spec.ts
npx.cmd playwright test tests/site/<syntax>.spec.ts
pnpm.cmd build
```

涉及视觉组件时追加 `tests/site/a11y.spec.ts` 的相关页面；涉及 Mermaid、图片、代码树或动效时追加对应专项用例。

## 11. 迁移顺序

1. 扩展特征快照和 manifest 校验，但保留现有兼容字段。
2. 从 `markdown.css` 中分离基础规则与条件样式包，先迁移文件树/代码树共享样式。
3. 在文章模板中根据注册表输出去重的 `data-swup-optional` stylesheet 或 style block。
4. 为普通文章、树语法文章和相互 Swup 导航增加请求与 computed-style 测试。
5. 迁移纯 SSR 语法样式，确认没有引入客户端加载器。
6. 迁移交互语法样式与运行时，继续复用 `markdown-runtime.ts`。
7. 处理 `markdown-extend.styl` 中的遗留语法，最后再收紧基础包边界。
8. 所有消费者迁移后删除已废弃的特征映射和兼容字段。

每一步必须可独立提交、可独立回滚，并保持当前文章无需修改 frontmatter。

## 12. 禁止模式

- 禁止让作者写 `hasFileTree: true`、`enableMermaid: true` 等手动开关。
- 禁止在全局入口静态导入第三方语法库或全部自定义语法样式。
- 禁止为纯 SSR 语法增加只用于加载 CSS 的客户端脚本。
- 禁止在多个页面模板复制语法到资源的映射。
- 禁止用宽泛选择器扫描整页并猜测作者原始 Markdown。
- 禁止在 Swup 导航后保留会影响普通页面的未限定语法样式。
- 禁止把动态 CSS import 宣称为可自动卸载的页面级隔离。
- 禁止为了减少请求把重型第三方 CSS 合并回全站基础包。
