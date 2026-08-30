---
name: shirone-dev-workflow
description: Daily development workflow for the Shirone Astro blog theme - environment setup, validation gates, cache clearing, commit conventions, npm package-mode smoke tests, and release validation. Use when building, testing, validating, formatting, committing, or preparing a Shirone package release.
---

## CI 与 Node 测试排查

修改 Markdown、i18n 或 Node 直接加载的测试路径时，先阅读 `docs/ci-and-node-tests.md`。Node 22/24 不能执行运行时 TypeScript `enum`；需要 enum 形状的 key 时使用 `.mjs` 运行时桥接和 `.d.mts` 类型声明。翻译仍必须通过 `i18n()` 和 locale 注册表。

将 `node --test "tests/**/*.test.mjs"` 与 `npx.cmd astro check` 串行执行：Astro check 会触发内容同步，可能与 `tests/content/*` 夹具竞争。检查 GitHub 失败时，先用 `gh run view <run-id> --json status,conclusion,headSha,jobs,url` 查看摘要，再用 `gh run view <run-id> --job <job-id> --log-failed` 查看失败日志。

# Shirone 开发工作流

Shirone 是 Astro 7 + Svelte 5 + Tailwind 4 + Stylus + pnpm 的 M3E 博客主题,开发环境为 Windows。本技能覆盖日常开发的环境、验证与提交流程;架构与组件规范见 `shirone-component-dev` 等专项技能。

## 环境要点

- Windows PowerShell 禁脚本执行:一律使用 `pnpm.cmd` / `npx.cmd` / `npm.cmd` 后缀。
- 包管理器锁定 pnpm(`preinstall` 强制),Node >= 22.12。
- 开发服务器:`pnpm.cmd astro dev --port 4321`(`pnpm.cmd dev` 会先跑图标/缩略图生成)。

## 提交前验证门禁

按变更范围执行下表；运行的门禁必须全绿。`type-check` 适用于 TypeScript/共享 API 变更，性能测量用于观测而不是自动阻断。

| 命令 | 作用 |
|---|---|
| `pnpm.cmd format` | Biome 格式化(`--write`,提交代码前必须跑) |
| `npx.cmd astro check` | 必须报 **0 errors / 0 warnings** |
| `pnpm.cmd check:manifest` | 原子清单 + Markdown 语法清单 + AI skills 校验 |
| `pnpm.cmd type-check` | `tsc --noEmit --isolatedDeclarations` |
| `pnpm.cmd exec biome ci ./src` | 只读 lint 校验(`lint`/`format` 带 `--write`,**不能**当只读检查用) |
| `npx.cmd playwright test tests/site/<spec>.spec.ts` | 只跑最小相关分片;UI 变更必加 `tests/site/a11y.spec.ts` |

## 缓存与陈旧问题

- Stylus/Svelte 变更不生效:清 `node_modules/.vite` 与 `.astro` 后重启 dev。
- Markdown/rehype/remark 变更不生效:清 `.astro/data-store.json` 后重启。

## 测试注意事项

- 断言计算样式或跑无障碍检查前,等待主题初始化(`--mc-primary` 出现)与 `onload-animation` 收敛。
- 视觉回归快照仅存本地(已 gitignore);确认每处差异都 intentional 才更新,不吸收无关的页高/环境漂移。
- Playwright 单 worker,`reuseExistingServer`。

## 提交约定

- Conventional commits:`type(scope): subject`,`type` 取 `feat`/`fix`/`test`/`docs`/`refactor`/`chore`;body 用英语。
- `git add -u` + 显式 `git add <新文件>`,**绝不 `git add -A`**(演示页、临时文件会被带进去);绝不提交 `*Demo.svelte`、`atoms-*-test.astro`。
- 提交前先向用户确认,不擅自提交。
- `research/` 目录已 gitignore、仅供参考,永不提交、不构建、不编辑。

## 必读文档

- `AGENTS.md` — 仓库总纲(必遵规则、必读文档清单、验证命令)
- `rules/project-rules.md` — 项目硬性规则与质量门禁
- `rules/pitfalls.md` — Svelte/Astro/Stylus/缓存/测试踩坑记录
- `INDEX.md` — 部署分层与标准部署流程

## npm 包模式与发布

Shirone 同时支持源码 checkout 和已发布的 `shirones` npm 包。修改主题源码前先阅读 `docs/npm-package-mode.md`、`docs/packaging-contract.md`，并遵循 `rules/project-rules.md` 第 12 节，确保源码模式与包模式同步。包模式下禁止通过 `process.cwd()` 读取主题自有文件。

进行包模式冒烟测试时，在临时项目运行 `npx.cmd shirones init`，检查 `shirones/`、`public/`、项目根依赖和 pnpm 构建脚本许可配置。先运行 `pnpm.cmd check:manifest`、`npx.cmd astro check`、`pnpm.cmd type-check`、`pnpm.cmd build`，再在包模式临时项目运行 `astro build` 和开发服务器冒烟测试。

发布由 `yCENzh/shirones` 仓库的 Actions -> Build & Publish 手动触发；合并前使用 `Build and validate, but do not publish` 进行预演。npm 版本以本仓库 `package.json` 的 `version` 为准。
