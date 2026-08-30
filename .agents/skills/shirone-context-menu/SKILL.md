---
name: shirone-context-menu
description: Extending or integrating Shirone's optional desktop context menu, including action registration, M3E keyboard behavior, shared clipboard actions, Swup lifecycle, and coordination with Markdown-rendered features such as code trees.
---

# Shirone 右键菜单扩展

当任务涉及桌面右键菜单、菜单动作、菜单快捷键、菜单与 Markdown 组件联动，或要求给代码树等内容能力增加右键操作时使用本 skill。

## 先读这些文档

- `docs/context-menu-system.md`：菜单动作契约、Markdown 能力契约与验证清单
- `src/types/contextMenuConfig.ts`：动作 id 的类型边界
- `src/config/contextMenuConfig.ts`：默认开关与显示顺序
- `src/components/organisms/ContextMenu.svelte`：菜单生命周期、键盘行为与动作分发
- `src/layouts/MainGridLayout.astro`：`client:load` 挂载边界
- `docs/m3e-standard.md` 与 `DESIGN.md`：形状、颜色、图标、动效和无障碍要求

如果动作针对 Markdown 内容，再读：

- `docs/markdown-on-demand-loading.md`
- `docs/markdown-extensions.md`
- `docs/markdown-syntax-manifest.md`
- `src/plugins/markdown/manifest.json`

## 工作边界

1. 菜单 organism 负责浏览器事件、当前目标、路由生命周期、焦点和动作编排；不要把这些职责放进 Markdown remark/rehype 插件。
2. Markdown 插件负责语法解析、语义 DOM 和自身的运行时模块。菜单通过稳定的 `data-md-feature` 能力根节点协调，不读取插件私有 class，也不复制解析逻辑。
3. 菜单动作必须先判断目标是否具备能力；没有目标能力时不渲染该行，而不是显示一个不可用的假按钮。
4. 复用已有运行时工具。比如复制页面链接必须调用 `src/utils/copy-page-link.ts`，不能再次实现 `navigator.share()` 或另一套 Snackbar 文案。
5. 关闭 `contextMenuConfig.enable` 时必须保持零 DOM、零监听器、零网络请求和零额外 bundle 负担。
6. 所有 UI 文案进入 `I18nKey` 和十个 locale；图标使用本地离线图标集合；形状、颜色和动效使用 M3E token。

## 新增动作流程

1. 在 `ContextMenuAction` 增加动作 id，并决定它是否进入默认 `actions` 数组。
2. 在所有 locale 增加文案，在 `ContextMenu.svelte` 注册 label、icon、可见性和 handler。
3. 如果动作针对 Markdown，先定义 `data-md-feature` 和状态属性，再让菜单读取最近的能力根节点。
4. 将实际操作委托给已有 feature runtime；不要在菜单里实现 code-tree、tabs 或 Mermaid 的解析/状态机。
5. 为直接加载、Swup 导航、键盘操作、无目标内容和关闭配置增加测试。
6. 运行 `pnpm.cmd check:manifest`、`npx.cmd astro check` 和相关 Playwright 片段。

## 代码树等未来能力

推荐的最小 DOM 契约：

```html
<section data-md-feature="code-tree" data-code-tree-state="collapsed">
  ...
</section>
```

右键动作只处理最近的 code-tree 根节点，并调用 code-tree controller 的展开/折叠接口。Markdown 仍然要在没有菜单和没有脚本时可读；菜单只是增强入口。多个嵌套树、Swup 替换和脚本失败都必须有明确的回退行为。

## 完成前检查

- 文案、图标、焦点和 `Escape`/方向键行为完整
- 普通文本、输入框、代码块和 Markdown feature 的目标边界明确
- 未命中 Markdown 语法时没有专用资源或菜单行
- 禁用菜单时没有客户端足迹
- 直接加载和 Swup 导航均通过
- 必要时同步 `src/plugins/markdown/manifest.json`、Markdown 测试和 package-mode 路径
