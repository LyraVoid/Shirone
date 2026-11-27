# Markdown 插件顺序规范

本规范约束 Shirone 的 Markdown 处理链顺序，适用于 `src/utils/markdown-processor.mjs` 中的 `siteRemarkPlugins`、`siteRehypePlugins`，以及所有会读取或写入 Markdown AST、HAST 和 `remarkPluginFrontmatter` 的插件。

语法字段和样式包归属以 [`markdown-syntax-manifest.md`](./markdown-syntax-manifest.md) 为准，按需资源生命周期以 [`markdown-on-demand-loading.md`](./markdown-on-demand-loading.md) 为准。

## 1. 强制规则

1. Remark 和 Rehype 插件按数组中的注册顺序执行；不得依赖导入顺序、文件名或运行时遍历顺序。
2. 任何新增或移动插件都必须说明它读取的节点类型、写入的节点类型，以及它相对于前后插件的依赖边。
3. 负责把作者语法归一化为 directive 的插件必须位于 `remarkDirective` 之前；负责读取归一化 directive 的插件必须位于 `remarkDirective` 之后。
4. 负责生成页面能力快照的 `remarkFeatureProbes` 必须位于所有会改变其目标语法节点的 Remark 插件之后，并位于 `remarkSectionize`、`parseDirectiveNode` 之前。
5. Rehype 组件渲染完成后，后续插件只能消费稳定的 HTML 结构；不得再次把组件输出识别为作者语法并重复渲染。
6. 样式、运行时模块和页面模板不得复制另一份插件链。构建期离线渲染、Astro 内容渲染和测试必须共享同一处理器。

## 2. Remark 顺序

当前注册顺序如下。顺序编号是维护参考，不是可变 ID；修改顺序时必须同步更新本表及测试。

| 阶段 | 插件 | 顺序约束 | 责任 |
| --- | --- | --- | --- |
| 输入保护 | `remarkEscapeNumericColons` | 最早执行 | 防止比例文本被 directive 解析器误判 |
| 引用归一化 | `remarkContentAnnotations`、`remarkAbbreviations` | `remarkDirective` 之前 | 解析引用定义并生成后续可识别的语法节点 |
| 容器归一化 | `remarkAdmonitions`、`remarkCollapsePanels`、`remarkOptionGroups` | `remarkDirective` 之前 | 将作者友好的容器写法改为标准 directive 形态 |
| 行内归一化 | `remarkMarker` | `remarkDirective` 之前 | 将标记语法改为 text directive |
| 基础节点 | `remarkMath` | 探针之前 | 生成数学节点，供能力探针记录 |
| 树与代码 | `remarkFileTree`、`remarkCodeTree` | `remarkMermaid` 之前；探针之前 | 生成文件树、代码树节点并保留嵌套归属 |
| Mermaid | `remarkMermaid` | 探针之前 | 归一化 Mermaid 节点或代码块 |
| 统计与摘要 | `remarkReadingTime`、`remarkExcerpt` | 不得消费未解析的作者 directive | 生成文章统计和摘要元数据 |
| Directive 解析 | `remarkDirective` | 所有 directive 归一化插件之后 | 将 `::`、`:::`、`{.class}` 等输入解析为 directive AST |
| 能力探针 | `remarkFeatureProbes` | `remarkDirective` 之后；`remarkSectionize`、`parseDirectiveNode` 之前 | 根据规范化 AST 写入 `remarkPluginFrontmatter.markdownSyntaxes` |
| 章节结构 | `remarkSectionize` | 能力探针之后 | 生成文章章节结构，不得改变能力快照 |
| HAST 桥接准备 | `parseDirectiveNode` | Remark 阶段最后 | 为 Rehype 组件渲染写入 `data.hName` 和 `data.hProperties` |

### 2.1 关键依赖

- `remarkAdmonitions`、`remarkCollapsePanels`、`remarkOptionGroups` 和 `remarkMarker` 产生的文本必须先经过 `remarkDirective`，否则它们会继续作为普通文本。
- `remarkFeatureProbes` 不得提前到 `remarkDirective` 之前。`::github{...}` 等叶子指令在解析前仍是文本，提前探测会导致页面 HTML 有组件而 `remarkPluginFrontmatter.markdownSyntaxes` 为空。
- `remarkCodeTree` 内部的 fenced code 不得被重复记为 `expressive-code`；探针必须根据父级容器排除代码树子节点。
- `parseDirectiveNode` 只能在所有会修改 directive 名称、属性或子节点的插件之后执行。它是 Remark 到 Rehype 的桥接步骤，不是作者语法探针。

### 2.2 视频 Facade 验证

`remarkAcFun`、`remarkArtPlayer`、`remarkBilibili` 和 `remarkYouTube` 均在 `remarkDirective` 之后、`remarkFeatureProbes` 之前运行。它们分别验证严格的 AcFun 视频 ID、安全的原生视频来源、BV 号与 YouTube 视频 ID，以及非空 `title` 和安全的可选 `poster`；合法输入保留给后续渲染，非法输入还原为普通文本。因此 feature probe 只会为实际可渲染的视频组件声明页面级资源。

### 2.3 脚本插件的插入点

`shirones/scripts/` 里的脚本可以向本链登记 remark 插件（见 [`plugin-scripts.md`](./plugin-scripts.md)）。它们不写进 `siteRemarkPlugins`，而是由 `extendMarkdownPlugins()` 在构造处理器时插入两个固定位置：

| 插入点 | 位置 | 理由 |
| --- | --- | --- |
| `before-directive` | 紧邻 `remarkDirective` 之前 | 在主题任何读取 directive 的插件之前 |
| `after-directive`（默认） | 紧邻 `remarkFeatureProbes` 之前 | 满足规则 4：探针仍在所有会改变语法节点的插件之后 |

没有脚本登记时，处理器使用的就是 `siteRemarkPlugins` 数组本身。有登记时，链的最后还会多一个不做任何事的 `remarkPluginScriptsDigest`，它的选项是脚本内容的摘要，作用是让 Astro 的内容缓存在脚本变化时失效。

移动或删除 `remarkDirective`、`remarkFeatureProbes` 会让插入点失去锚点，`extendMarkdownPlugins()` 会直接抛错，`tests/plugin-scripts.test.mjs` 也会失败。

> 关于 `before-directive`：`remark-directive` 的语法是在解析阶段生效的，解析发生在所有插件的转换函数运行之前。因此在这个位置运行的转换函数看到的 directive 已经是节点而不是文本；它与 `after-directive` 的区别在于主题的 `remarkRestoreBareDirectives` 和视频校验插件还没有运行。

## 3. Rehype 顺序

| 阶段 | 插件 | 顺序约束 | 责任 |
| --- | --- | --- | --- |
| 数学输出 | `rehypeKatex` | 组件渲染之前 | 将数学节点输出为 KaTeX HTML |
| 标题 ID | `rehypeSlug` | `rehypeAutolinkHeadings` 之前 | 先建立稳定标题 ID |
| 容器预处理 | `rehypeCollapseGroups`、`rehypeOptionGroupIds` | 对应组件渲染之前 | 为折叠组和选项组写入稳定属性 |
| 组件渲染 | `rehypeComponents` | 图片和表格后处理之前 | 将 directive AST 渲染为稳定组件 DOM |
| 标题链接 | `rehypeAutolinkHeadings` | `rehypeSlug` 之后 | 根据已存在的标题 ID 添加锚点 |
| 图片增强 | `rehypeMarkdownImages` | `rehypeComponents` 之后 | 增强普通图片并跳过已渲染组件内部图片 |
| 表格包装 | `rehypeResponsiveTables` | Rehype 最后 | 为最终 HTML 中的表格添加滚动容器 |

### 3.1 Rehype 禁止事项

- 不得把 `rehypeMarkdownImages` 提前到 `rehypeComponents` 之前，否则它无法可靠识别 `image-grid`、Mermaid 等组件的跳过边界。
- 不得把 `rehypeAutolinkHeadings` 提前到 `rehypeSlug` 之前，否则锚点可能引用不存在或不稳定的 ID。
- 不得在 `rehypeComponents` 之后重新运行 directive 解析器或组件渲染器。
- 只允许最后的表格包装器修改表格外层结构；组件内部表格必须通过明确的跳过条件保持原样。

### 3.2 脚本插件的插入点

脚本登记的 rehype 插件同样只有两个固定位置：

| 插入点 | 位置 | 理由 |
| --- | --- | --- |
| `before-components` | 紧邻 `rehypeComponents` 之前 | directive 仍是以自身命名的元素，可在渲染前改写 |
| `end`（默认） | 链的最后，主题全部 rehype 插件之后 | 只消费稳定的最终 HTML（规则 5） |

脚本登记的 directive 渲染函数并入 `rehypeComponents` 的 `components` 选项，同名时覆盖主题自带的。

## 4. 新增或调整插件的流程

1. 先在本规范中确定插件所属阶段，并写出至少一条前置或后置依赖。
2. 在 `src/utils/markdown-processor.mjs` 中修改唯一的注册数组；不得在 Astro 页面、内容适配器或测试中复制链条。
3. 为输入 AST、输出 AST/HAST 和非法输入回退增加 Node 测试；若插件影响页面资源，再增加 `<head>`、computed style 和 Swup 导航测试。
4. 若插件产生新的作者语法，先更新 `src/plugins/markdown/manifest.json`，再更新本规范中的阶段表。
5. 清理 `.astro/data-store.json` 后验证一次，排除 Markdown 编译缓存造成的假结果；开发测试若复用旧服务，必须重启 Astro。
6. 提交前至少运行：

```powershell
pnpm.cmd check:manifest
node --test tests/plugins/markdown/feature-probes.test.mjs
npx.cmd astro check
npx.cmd playwright test tests/site/markdown-runtime.spec.ts
pnpm.cmd build
```

## 5. 变更验收

顺序变更只有同时满足以下条件才算完成：

- 正常 Markdown 的 AST、HTML 和页面样式不变；
- 受影响语法的 `remarkPluginFrontmatter.markdownSyntaxes` 与 manifest 一致；
- SSR 输出在 JavaScript 禁用时仍可读，且不引入额外运行时请求；
- 直接加载、Swup 导航、后退/前进均不会残留上一页的页面级样式；
- 失败输入仍保留原文或既定 SSR fallback，不通过猜测性正则改变正文；
- `astro check` 为 0 errors、0 warnings、0 hints，构建成功且工作区没有无关生成物。

如果顺序问题来自缓存、第三方集成或生命周期，必须同时记录在 [`rules/pitfalls.md`](../rules/pitfalls.md)，并在提交说明中指向对应条目。
