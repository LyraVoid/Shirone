# Markdown 自定义语法索引指南

> 语法命中后的条件样式、动态运行时和 Swup 资源生命周期见 [`markdown-on-demand-loading.md`](./markdown-on-demand-loading.md)。

`src/plugins/markdown/manifest.json` 是 Shirone 已支持的作者级 Markdown 扩展语法的机器可读单一索引。本指南解释清单边界和维护流程；具体 AST、CSS、缓存与测试规则仍以 `docs/markdown-extensions.md` 为准。

## 1. 清单解决什么问题

清单让作者和维护者不必从插件注册表、演示文章和样式文件反向猜测语法：

- `forms` 给出可识别的输入形式、简写模式和最小示例；
- `attributes` 列出参数、允许值和默认值；
- `implementation` 与 `registeredIn` 指向转换器和唯一注册入口；
- `styles`、`runtime` 和 `network` 明确浏览器与网络成本；
- `docs` 与 `tests` 指向正式示例和回归证据；
- `status` 标明语法是否适合继续采用。

清单只收录在生产构建中已经可解析的作者语法。普通 CommonMark/GFM、frontmatter、自动阅读时间、标题锚点、响应式表格等不需要特殊作者输入的行为不登记。`research/` 中的候选能力也不得在实现前登记。

## 2. 状态含义

| 状态 | 含义 | 新文章 |
| --- | --- | --- |
| `stable` | 当前正式支持，并按兼容契约维护 | 可以使用 |
| `legacy` | 为既有文章保留，但实现不满足当前全部工程标准 | 不扩大使用面，优先选择稳定替代方案 |
| `deprecated` | 已进入移除流程，条目必须声明 `replacement` | 不得新增 |

`source` 只描述实现来源：`shirone` 表示项目自研，`integration` 表示由已接入的 Markdown/渲染生态能力提供。它不改变兼容级别。

## 3. 查询方式

直接阅读 `manifest.json`，或在 PowerShell 中生成紧凑索引：

```powershell
$manifest = Get-Content -Raw -Encoding utf8 src\plugins\markdown\manifest.json | ConvertFrom-Json
$manifest.syntaxes | Format-Table id, name, status, category
```

查询单项完整契约：

```powershell
$manifest.syntaxes | Where-Object id -eq "file-tree" | ConvertTo-Json -Depth 10
```

不要在本指南维护第二份语法列表或固定数量；清单内容和数量只以 JSON 为准。

## 4. 字段契约

| 字段 | 要求 |
| --- | --- |
| `id` | 稳定的 kebab-case 标识；发布后不随展示名称改动 |
| `name` | 便于检索的展示名称，不是组件内用户文案 |
| `status` | `stable`、`legacy` 或 `deprecated` |
| `category` | 语法入口类型，例如 container、fence、text directive 或 fence metadata |
| `source` | `shirone` 或 `integration` |
| `summary` | 一句话说明作者输入和结果 |
| `forms` | 每种受支持输入的 `kind`、`pattern` 和可直接理解的 `example` |
| `attributes` | 参数名、是否必填、允许值和实际默认值；没有参数时为空数组 |
| `implementation` | 仓库内生产实现路径；纯第三方转换可以为空数组 |
| `registeredIn` | 实际注册入口，通常是统一处理器或 `astro.config.mjs` |
| `styles` | 该语法依赖的样式所有者 |
| `stylesheetPacks` | 顶层条件样式包注册表；每个包声明唯一 `id`、触发它的构建期 `syntaxes` 与实际 CSS `styles`，由服务端资源装配器直接消费 |
| `runtime` | `mode`、客户端模块和可能产生的网络请求 |
| `docs` | 面向作者的真实演示或使用文档 |
| `tests` | 已有的语法、DOM 或页面回归测试；缺口如实保留为空数组 |
| `notes` | 无法由其他字段表达的兼容或使用边界 |

所有文件路径必须相对仓库根目录、使用 `/`，并指向真实文件。`network` 必须同时记录第三方请求和作者显式媒体 URL；空数组表示语法自身不会请求网络。

## 5. 新语法准入流程

1. 在独立演示文章中定义真实使用场景，不修改旧文章来承载新展示；
2. 先固定作者输入、AST/DOM、非法输入回退、安全 allowlist 和 SSR 行为；
3. 通过 `src/utils/markdown-processor.mjs` 注册，Expressive Code 集成则通过 `astro.config.mjs`；
4. 增加生产实现、样式、单元测试、页面测试和正式作者文档；
5. 在功能已经可用后添加 manifest 条目，并按 `id` 排序；
6. 运行 `pnpm.cmd check:markdown-manifest` 和完整的 `pnpm.cmd check:manifest`；
7. 按 `docs/markdown-extensions.md` 完成缓存刷新、Playwright、a11y、Astro check 与构建验证。

不得为了迁移计划或目录整齐预建 manifest 条目。计划中的 Details、Steps、Code Group 等只有生产实现与文档落地后才能进入正式清单。

## 6. 修改与退役

- 新增可选属性必须有保守默认值，不要求批量修改旧文章；
- 改变现有 pattern、默认值或错误回退属于兼容性变更，需要迁移说明和回归夹具；
- 暂时缺少测试不应伪造路径，`tests: []` 会把缺口保留在索引中；
- 旧实现不满足当前无障碍、国际化、网络或生命周期标准时标为 `legacy`；
- 退役先改为 `deprecated` 并填写稳定替代项，确认内容库不再使用后才删除条目和实现；
- 插件、样式、演示或测试移动后，必须在同一提交更新 manifest。

## 7. 校验命令

```powershell
pnpm.cmd check:markdown-manifest
pnpm.cmd check:manifest
```

校验器会检查 schema、ID 唯一性与排序、枚举值、语法形式、参数结构、运行时结构、条件样式包的特征与 CSS 唯一性，以及所有仓库路径是否存在。它不会代替语法渲染测试，也不会证明 CSS 或 Swup 生命周期正确。
