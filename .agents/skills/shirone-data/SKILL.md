---
name: shirone-data
description: Managing Shirone data-backed pages and albums - adding or editing album folders, info.json metadata, local or external photos, friends, compass, anime, projects, skills, devices, games, timelines, and music data. Use when changing content outside src/content/ that feeds these pages.
---

# Shirone 数据与相册

## 先判断归属

- 文章和动态写入 `src/content/`，使用 `shirone-writing`。
- 页面行为、开关、排序和凭据写入 `src/config/`，使用 `shirone-config`。
- 具体条目内容写入 `src/data/`；不要把内容实体塞进 config。
- 相册不是 Content Collection，而是 `public/images/albums/` 下的目录数据。

## 数据页工作流

1. 先阅读对应类型和数据文件：`src/types/<domain>Config.ts`、`src/data/<domain>.ts`，确认字段和现有条目形状。
2. 只修改内容实体；筛选、排序、页面开关使用对应 `src/config/*Config.ts` 的 `categories`、`disabledKeys`、`order` 和 `enable`。
3. 新增条目后运行 `npx.cmd astro check`、`pnpm.cmd check:manifest`，并执行对应页面测试，例如 `tests/site/friends.spec.ts`、`tests/site/anime.spec.ts`、`tests/site/projects.spec.ts`、`tests/site/devices.spec.ts`、`tests/site/games.spec.ts`、`tests/site/timeline.spec.ts`。

## 相册工作流

每个相册是 `public/images/albums/<id>/` 目录：

- 本地照片模式需要 `info.json`、`cover.webp` 或 `cover.jpg`，其余图片直接放在同目录；文件名可用 `标题_标签1_标签2.ext`。
- 外部照片模式在 `info.json` 设置 `"mode": "external"`、`cover` 和 `photos` 数组；每个照片至少提供 `src`，可选 `thumbnail`、`alt`、`title`、`tags`、日期和相机信息。
- `title`、`description`、`date`(YYYY-MM-DD)、`location`、`tags`、`layout`(`masonry`/`grid`)、`columns`(2/3/4)、`hidden`、`password` 和 `passwordHint` 按 `src/types/album.ts` 与 `src/utils/album-scanner.ts` 处理。
- 设有 `password` 的相册必须同时验证详情页和受保护照片，不能把密码或明文受保护清单写入公开文章或日志。

示例结构：

```text
public/images/albums/summer/
├── info.json
├── cover.webp
├── beach_海边.webp
└── sunset_晚霞.webp
```

相册变更后运行 `npx.cmd astro check`、`pnpm.cmd check:manifest`，以及 `npx.cmd playwright test tests/site/albums.spec.ts tests/site/post-encryption.spec.ts`。

## 必读文档

- `src/config/README.md` — config/data 归属和配置导入规则
- `src/types/album.ts`、`src/utils/album-scanner.ts` — 相册实际 schema 与扫描规则
- `src/data/` — 各数据页内容实体
- `src/config/` — 各数据页行为配置
- `src/pages/_AGENTS.md` — 相册保护与 SSR 约束

## npm 包模式数据路径

运行 `npx.cmd shirones init` 后，用户数据生成在 `shirones/config/data/` 和 `shirones/content/`，相册及其他静态媒体仍位于用户项目的 `public/`。不要编辑 `node_modules/shirones` 中的包文件；构建期消费数据路径时遵循 `docs/npm-package-mode.md` 和 `docs/packaging-contract.md`。
