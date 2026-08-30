---
name: shirone-content-config
description: Configure Shirone content separation and external content repositories. Use when setting up or changing CONTENT_DIR, CONTENT_REPO_URL, CONTENT_REPO_REF, shirone.content.json, content-repository mounts, config/*.yaml overlays, source precedence, or content-repository configuration validation. Use shirone-content-workflow for day-to-day sync, export, clean, status, and deployment operations after configuration is established.
---

# Shirone 内容分离配置

本技能负责把代码仓和内容仓正确连接，并让内容仓的 YAML 覆盖可验证、可升级。它不承担日常同步、导出、清理或部署执行；这些操作交给 `shirone-content-workflow`。

## 先读什么

1. `docs/content-separation/README.md`：模式选择、内容目录边界、物化机制与来源配置。
2. `docs/content-separation/config-overlay.md`：YAML 领域映射、合并规则和生成层约定。
3. `src/config/README.md`：各配置领域的字段契约和内容/配置边界。
4. `docs/asset-pipeline.md`：涉及 `assets/`、`public/` 或派生产物时读取。
5. `docs/content-separation/dual-repo-ci.md`：配置远端内容仓、Secrets 或跨仓部署时读取。
6. `shirone.content.example.json`：创建或审阅内容源清单时读取。

## 配置顺序

1. 识别目标模式：没有内容源时保留 `local`；需要将文章、数据和用户配置脱离代码仓时使用 `external`。
2. 为外部内容源选择一种入口：本地目录使用 `CONTENT_DIR`；远端仓库使用 `CONTENT_REPO_URL` 与可选的 `CONTENT_REPO_REF`；需要提交到仓库的可复现配置时使用根目录 `shirone.content.json`。以权威文档规定的优先级为准，不同时维护互相矛盾的来源。
3. 只在内容仓维护可物化的用户内容：`content/`、`data/`、`assets/`、`public/` 与 `config/`。挂载映射必须保持在仓库内，不能使用 `..`，不能覆盖 `scripts/`、`tests/`、`.git/` 或主题自有生成物。
4. 将站点行为写入内容仓 `config/*.yaml`，只写需要覆盖的键。对象递归合并，数组整体替换；`nav-bar.yaml` 使用其声明式解析路径，不能按普通深合并推断。
5. 不编辑 `src/user/user-config.ts`。它是同步生成物；需要保留代码仓中已有的有效配置时，使用 `content:export --config` 生成内容仓 YAML。
6. 为可选外部功能保留安全默认值。关闭或配置不完整时必须没有请求、DOM 或客户端负担；凭据只放到 CI/托管平台 Secrets。Umami 的 `websiteId` 与 `scriptUrl` 是可选成对字段，只有两者同时有效才加载采集脚本。

## 配置审阅清单

- 内容仓只保留其拥有的数据，不把 `public/assets/` 派生产物、字体子集、缩略图快照或 `.gitkeep` 迁入。
- `config/` 中每个文件名都与领域映射一致，且同一领域不能同时存在 `.yaml` 与 `.yml`。
- 未声明字段继续继承主题默认值；不要将完整默认配置复制到内容仓。
- 外部内容仓存在时，编辑器、CI 和本地开发都指向同一个来源，避免修改物化后的代码仓副本。
- 远端私有内容仓的读取令牌和跨仓触发令牌分别配置为 Secrets，不提交到 `.env`、YAML 或清单。

## 验证与交接

从代码仓根目录执行：

```powershell
pnpm.cmd content:validate
pnpm.cmd content:status
pnpm.cmd content:status --remote
```

仅在来源、映射和 YAML 均通过验证后，再交给 `shirone-content-workflow` 执行 `content:sync`、`content:watch`、`content:export`、`content:clean` 或双仓部署。涉及主题源码或配置领域扩展时，同时遵守 `shirone-config` 与 `docs/packaging-contract.md` 的双模式约束。
