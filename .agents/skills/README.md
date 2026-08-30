# Shirone AI Skills

本目录是 Shirone AI skills 的唯一源目录,存放 [Agent Skills](https://agentskills.io) 格式的技能包(`SKILL.md` + YAML frontmatter)。支持该标准的 AI 编码助手(Claude Code、Codex 等)在克隆本仓库后会自动发现并按任务触发,无需额外配置。

## 自动发现与独立打包

- 项目内使用: 保持 `.agents/skills/<skill-name>/SKILL.md` 结构即可自动发现。新增或修改技能后运行 `pnpm.cmd check:manifest`。
- 生成可安装插件目录: 在仓库根目录运行 `pnpm.cmd skills:package`,输出到 `artifacts/shirone-ai-<version>/`。覆盖已有的非本工具目录时显式加 `-- --force`。
- 生成单文件安装包: 运行 `pnpm.cmd skills:package -- --zip`,输出 `artifacts/shirone-ai-<version>.zip`。也可用 `--output <path>` 指定输出路径。

打包命令每次都从本目录动态发现技能并生成插件清单,`artifacts/` 是构建产物而非第二份源码,因此不需要分开维护。

维护规则与两份提交流程见 `rules/ai-skills.md` 和 `docs/ai-skills-maintenance.md`。

## 定位

仓库的指导体系分三层,**skills 是任务化入口层,不重复任何下层内容**:

1. `AGENTS.md`(根 + 嵌套)——总纲与目录级附加规则;
2. `rules/` 与 `docs/`——硬性规则与权威规范,skills 只负责把"做某类任务该读哪些文档、守哪些红线、跑哪些命令"收敛成入口;
3. `.agents/skills/`——按任务触发的技能包,正文保持精简,细节一律委托给下层文档。

## 技能清单

### 开发者向(修改主题源码)

| 技能 | 适用任务 |
|---|---|
| [shirone-dev-workflow](shirone-dev-workflow/SKILL.md) | 日常开发与 npm 包发布工作流:环境、双模式验证、缓存清理、提交约定 |
| [shirone-component-dev](shirone-component-dev/SKILL.md) | 新增/修改/移动组件:分层、M3E 令牌、图标、动效、无障碍 |
| [shirone-context-menu](shirone-context-menu/SKILL.md) | 扩展桌面右键菜单:动作注册、定位、生命周期与 Markdown 内容能力契约 |
| [shirone-markdown-dev](shirone-markdown-dev/SKILL.md) | 开发自定义 Markdown 语法与 remark/rehype 插件 |
| [shirone-i18n](shirone-i18n/SKILL.md) | 新增/修改 UI 文案与语言包 |
| [shirone-feature](shirone-feature/SKILL.md) | 新增可选功能/第三方集成(零额外负担) |
| [shirone-sidebar](shirone-sidebar/SKILL.md) | 侧栏系统、widget、FAB 与 Swup 持久壳同步 |

### 用户向(写内容、配站点)

| 技能 | 适用任务 |
|---|---|
| [shirone-writing](shirone-writing/SKILL.md) | 撰写文章与动态:frontmatter、草稿、加密、图片 |
| [shirone-markdown-syntax](shirone-markdown-syntax/SKILL.md) | 使用自定义 Markdown 语法写作 |
| [shirone-config](shirone-config/SKILL.md) | 站点配置、npm 包初始化、启用可选功能、构建与部署 |
| [shirone-data](shirone-data/SKILL.md) | 管理相册及 friends、anime、projects、skills、devices、timeline 等数据页内容 |
| [shirone-content-config](shirone-content-config/SKILL.md) | 内容分离配置:内容源、清单、挂载、YAML 覆盖与配置校验 |
| [shirone-content-workflow](shirone-content-workflow/SKILL.md) | 内容分离工作流与双仓运维:sync/export/clean/eject、状态诊断与双仓 CI |

## 约定

- **命名**:目录名与 frontmatter `name` 一致,统一使用 `shirone-` 前缀——仓库已有面向访客的"技能展示页"(`src/pages/skills.astro`)占用 `skills` 一词,前缀避免歧义,也保证多仓库场景下不与其他项目的技能冲突。
- **语言**:frontmatter 的 `name`/`description` 用英文(`description` 面向触发匹配),正文用中文。
- **单一真源**:技能正文不得复制 `rules/`/`docs/` 的具体规范,只写摘要与路径;正文与文档清单中引用的仓库路径由 `scripts/check-skills.mjs`(`pnpm check:manifest` 的一部分)校验真实存在,防止文档移动后技能漂移。
- **新增技能**:创建 `<name>/SKILL.md` 后运行 `pnpm.cmd check:manifest` 验证。
