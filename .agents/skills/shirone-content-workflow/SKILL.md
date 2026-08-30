---
name: shirone-content-workflow
description: Operate Shirone content separation and dual-repository workflows after configuration is established. Use for content:sync, content:watch, content:status, content:export, content:clean, content:eject, safe backups, reverse-export diffing, and dual-repository CI/CD operations. Use shirone-content-config to configure CONTENT_DIR, CONTENT_REPO_URL, shirone.content.json, mounts, or config/*.yaml overlays.
---

# Shirone 内容分离工作流与双仓运维

在 Shirone 的内容分离体系中，本技能专注于**配置建立后的日常操作流、增量物化生命周期管理与双仓 CI/CD 运维**。

当你需要执行内容同步、本地实时监听、状态体检、改动反向导出、工作区重置或排查双仓流水线时使用本技能。外部内容源声明、清单字段与 YAML 覆盖层的编写与校验，请交由 `shirone-content-config` 负责。

## 先读什么

1. `docs/content-separation/README.md` — 双仓解耦总架构、目录映射标准与物化机制（权威总纲，核心必读）。
2. `docs/content-separation/cli-workflows.md` — CLI 工具链使用规范、参数行为与工作流详解。
3. `docs/content-separation/dual-repo-ci.md` — GitHub Actions 跨仓调度流水线编排与 Secrets 凭据配置。
4. `docs/asset-pipeline.md` — 静态资源与派生产物的目录职责划分及构建期处理边界。
5. `scripts/content/` 下对应脚本 — 需要确认某项指令的具体执行逻辑时直接查阅对应源码。

## 两种工作模式

- **`local`（默认单仓模式）**：未配置任何外部内容源。`pnpm.cmd content:sync` 为完全静默的空操作，`git status` 保持干净，普通克隆与上游主题开发始终处于此模式。
- **`external`（双仓解耦模式）**：配置了本地目录或远端 Git 内容仓（通过环境变量、根目录 `.env` 或 `shirone.content.json`）。文章与数据由独立内容仓管理，构建与预览前通过 `content:sync` **增量物化**到代码仓标准路径。

> [!TIP]
> 设置 `SHIRONE_CONTENT_SYNC=0` 可临时强制回到 `local` 模式。单仓转双仓是使用者在个人 Fork 仓库中的一次性动作（`pnpm.cmd content:eject --yes`），切勿在上游主题主仓执行。

## 何时使用本技能

1. **日常写作与同步**：
   - 预览与构建前同步：`pnpm.cmd content:sync`（已自动接入 `dev` 与 `build` 流程首位）；
   - 边写边看实时热更新：`pnpm.cmd content:watch`（仅支持本地目录 `type: "path"`）；
   - 状态体检与排错：`pnpm.cmd content:status`（快速排查未生效或不同步问题，加 `--remote` 可联网探测远端）。
2. **反向回写导出**：
   - 在代码仓调试或误修改了文章、图片与配置，需要反向写回外部内容仓：`pnpm.cmd content:export`。
3. **工作区安全重置**：
   - 清理代码仓中已物化的所有外部文章与配置，安全恢复为主题初始 Demo 状态：`pnpm.cmd content:clean`。
4. **双仓 CI/CD 运维与排错**：
   - 维护内容仓触发脚本（`trigger-build.yml.example`）与代码仓 `.github/workflows/deploy.yml.example`、`.github/workflows/content-validate.yml` 的跨仓调度、构建凭据、并发截断与版本回滚。

## CLI 核心工具链

`scripts/content/cli.mjs` 是统一的命令分发器，冒号格式与空格子命令完全等价（如 `pnpm.cmd content:status` 与 `pnpm.cmd content status`）。

| 命令 | 核心作用与方向 | 对应脚本实现 |
|---|---|---|
| `content:sync` | **增量同步**：内容仓 → 代码仓，增量物化文件并生成 `content.lock.json` | `scripts/content/sync.mjs` |
| `content:validate` | **安全预检**：零写盘预检目录结构、命名冲突与配置类型 | `scripts/content/sync.mjs` |
| `content:watch` | **实时监听**：后台监听本地内容仓变动，自动同步并触发热重载 | `scripts/content/sync.mjs` |
| `content:status` | **状态体检**：只读检测内容源连接、文件资源、配置语法与同步状态 | `scripts/content/status.mjs` |
| `content:export` | **反向导出**：代码仓 → 内容仓，将改动安全反向写回外部仓库 | `scripts/content/export.mjs` |
| `content:clean` | **重置还原**：清除物化内容与生成物，安全恢复主题初始 Demo 态 | `scripts/content/clean.mjs` |
| `content:eject` | **一键解耦**：单仓转双仓，一键初始化独立的外部内容仓库 | `scripts/content/eject.mjs` |

> **安全演练机制**：`export`、`clean` 与 `eject` **默认只执行预演（Dry Run）**，打印变更计划而不落盘；只有显式附加 `--yes` 时才会实际执行，且执行前均会自动在 `.export-backup/` 或 `.content-backup/` 下创建带时间戳的完整快照备份。

## 必须守住的运维与物化红线

- **物化机制不可绕过**：
  Astro 的全自动图片 WebP/AVIF 转码管线、全站中文字体子集自动抽取、以及文章相对图片路径引用（`![](./cover.webp)`），都要求资源物理位于代码仓的 `src/` 与 `public/` 目录下。因此必须通过 `content:sync` 将外部内容增量拷贝落地，禁止绕过物化机制。
  - 标准映射：`content/` → `src/content/`、`data/` → `src/data/`、`assets/` → `src/assets/`（参与构建期优化）、`public/` → `public/`（原样静态资源）；
  - 特殊入口：`config/` 编译为 `src/user/user-config.ts`，`footer.html` 映射为 `src/config/FooterConfig.html`。

- **生成物严禁手工修改**：
  `src/user/user-config.ts` 是由 sync 自动编译输出的生成物（放置在 `src/user/` 是为了让图标扫描与 `scripts/fonts/text-collector.mjs` 的字形收集覆盖到用户配置文本），严禁直接手工编辑或迁走。若在代码仓中调整了配置，先运行 `pnpm.cmd content:export --config` 固化回 YAML 再执行清理。

- **受保护路径与生成物豁免**：
  以下构建期派生产物受系统严格保护，**既不参与同步裁剪，也不允许外部内容仓覆盖**（提供同名文件将报错拦截）：说说缩略图、番剧封面与快照、字体子集产物、各目录 `.gitkeep` 以及 `shirone.content.json` 中配置的 `keep` 白名单。
  > 依据 `docs/asset-pipeline.md`，`src/assets/` 和 `public/images/` 归属内容仓，而 `public/assets/` 下按业务域归档的是可重复构建的派生产物，二者绝不能混淆。

- **顶层目录对等裁剪**：
  同步裁剪只在内容仓确实拥有的顶层目录内发生。例如内容仓没有 `content/spec/` 时，代码仓原有的 `src/content/spec/` 将完整保留，反向导出亦同理。

- **反向导出写入规范**：
  导出操作会直接向外部 Git 仓库写盘，因此严格拒绝 `local` 模式、`CI=true` 或浅克隆工作副本；要求内容仓工作区干净且与配置现状一致。默认绝不删除文件，只有附加 `--prune` / `--prune-config` 时才允许清理多余文件（删除前强制备份）。

- **重置清理作用域**：
  `pnpm.cmd content:clean` 仅针对已声明的挂载目标和配置生成物进行重置，绝不会波及主题源码（这是它与 `git checkout -- src/` 的根本区别）。如果挂载点配置过宽，命令将直接拒绝执行以保障安全。

- **自定义挂载（`mounts`）约束**：
  源路径与目标路径必须是仓库内的相对目录，严禁使用 `..`，严禁读取 `.git/` 或 `node_modules/`，严禁写入 `scripts/`、`tests/` 等系统保留目录；多个挂载点不得重复或互为父子。

- **环境变量与密钥管理**：
  来源优先级为：进程环境变量 > `.env.local` > `.env` > `shirone.content.json` > `local` 默认值；空字符串等同未设置。`CONTENT_SYNC_PULL=false` 仅复用已存在的 `.content-src/`。**严禁在内容仓存放任何 API 密钥或 Token**，敏感凭据一律通过 GitHub Secrets 管理。

- **Markdown 相对引用路径限制**：
  对于自定义代码树语法 `@[code-tree]`，路径由 `src/plugins/markdown/code/remark-code-tree.mjs` 以代码仓根目录为基准解析，在双仓模式下必须填写物化后的路径（如 `src/content/posts/<slug>/snippets`），不能直接指向内容仓布局。

- **双仓 CI/CD 核心三要点**：
  1. 跨仓触发时按 `client_payload.sha` 准确检出对应版本内容，防止并发构建错版；
  2. `content:sync` 必须独立成步且置于字体子集化（`fonts:subset`）之前，防止文字缺失；
  3. 部署流水线需配置内容仓读取 Token（`CONTENT_REPO_TOKEN`）与触发 Token（`DISPATCH_TOKEN`），支持通过 `workflow_dispatch` 传入旧 SHA 快速回滚。

## 验证与测试

```powershell
pnpm.cmd content:validate            # 安全预检：零写盘检查结构冲突与配置类型
pnpm.cmd content:status              # 状态体检：检查内容源连接、配置语法与同步状态
pnpm.cmd content:status --remote     # 远端探测：检查远端仓库/分支连通性（联网）
pnpm.cmd content:export              # 预演反向导出：查看拟写回内容仓的改动清单（不写盘）
pnpm.cmd content:clean               # 预演重置还原：查看拟清理的物化文件清单（不写盘）
node --test tests/content/*.test.mjs  # 运行全套内容分离自动化测试
npx.cmd astro check                  # Astro 架构与类型检查（需 0 error 0 warning）
```

测试覆盖清单：
- `tests/content/content-sync.test.mjs`
- `tests/content/content-export.test.mjs`
- `tests/content/content-clean.test.mjs`
- `tests/content/content-eject.test.mjs`
- `tests/content/content-status.test.mjs`
- `tests/content/content-config.test.mjs`
- `tests/content/content-cli.test.mjs`

`local` 模式的回归标准：`pnpm.cmd content:sync` 无任何输出，且 `git status` 干净。修改本技能后运行 `pnpm.cmd check:manifest`。
