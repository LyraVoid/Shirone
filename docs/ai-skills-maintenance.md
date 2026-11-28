# AI Skills 功能维护手册

本手册说明如何为 Shirone 增加、修改、废弃 AI skills，以及如何把 skills 与项目文档拆成两份提交。硬性约束见 `rules/ai-skills.md`。

## 目录模型

```text
.agents/skills/                 # 唯一源目录，Agent 会自动发现
├── shirone-<domain>/
│   ├── SKILL.md                # 必需：frontmatter + 技能正文
│   └── agents/openai.yaml      # 可选：Codex 展示元数据
└── README.md                   # 人类可读索引
```

每个子目录是一个技能，不是一个独立项目。不要创建第二个 skills 根目录。插件目录和 ZIP 由脚本临时生成。

## 增加技能

1. 先确认现有技能无法覆盖新任务，并确定它属于开发者向还是用户向。
2. 创建 `.agents/skills/shirone-<domain>/SKILL.md`，填写英文 `name` 和 `description` frontmatter。
3. 正文只保留触发入口、阅读顺序、红线和验证命令；详细规则写入 `rules/` 或 `docs/` 后引用。
4. 在 `.agents/skills/README.md` 增加一行索引，并在需要时补充 `agents/openai.yaml`。
5. 运行 `pnpm.cmd check:manifest` 和该技能的 `quick_validate.py`。

## 修改或废弃技能

- 触发条件改变时，检查是否会与其他技能重叠，并同步更新 README 索引。
- 权威行为改变时，先更新 `rules/` 或 `docs/`，再更新技能中的摘要和路径。
- 技能不再需要时，删除整个技能目录并从 README 移除；随后运行完整 manifest 校验。
- 不直接修改 `artifacts/` 中的生成文件。需要新包时重新执行打包脚本。

## 两份提交的实际流程

一次功能变更同时涉及技能和项目文档时，建议按以下顺序准备：

### 提交一：项目文档

包含权威规则、架构、配置契约和项目说明，例如 `AGENTS.md`、`rules/**`、`docs/**`、根 README。确认文档中的路径、命令和默认值与源码一致后提交：

```text
docs(project): document <feature>
```

### 提交二：AI skills

包含 `.agents/skills/**` 以及 skills 专用的校验/打包工具变更。确认技能只引用已存在的项目路径后提交：

```text
docs(skills): add or update <skill>
```

使用 `git add` 显式指定文件，避免把临时演示页、ZIP、截图或其他未相关文件带入提交。两个提交都要有实际内容；如果某次变更只影响一层，就只提交对应的一份。

## 打包与发布

在仓库根目录运行：

```powershell
pnpm.cmd skills:package
pnpm.cmd skills:package -- --zip
```

默认产物分别是 `artifacts/shirone-ai-<version>/` 和 `artifacts/shirone-ai-<version>.zip`。需要指定路径时增加 `--output <path>`。脚本只覆盖本工具生成的目录(含 `.shirone-skills-package` 标记);其他已存在目录、项目根目录及其上级目录、技能源目录都会被拒绝,`--force` 不能绕过。打包脚本会自动发现所有技能，因此新增技能不需要修改打包清单。

## 完成检查表

- `.agents/skills/` 是唯一技能源目录，没有重复副本。
- README 索引、frontmatter 名称和目录名一致。
- 技能引用的 `rules/`、`docs/`、`src/` 路径真实存在。
- `pnpm.cmd check:manifest` 通过。
- 每个受影响技能的 `quick_validate.py` 通过。
- ZIP 包含 `.codex-plugin/plugin.json` 和全部技能目录，并通过 `validate_plugin.py`。
- 现有功能开关和默认值未被无意改变。
