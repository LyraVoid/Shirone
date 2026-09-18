---
name: shirone-config
description: Configuring a Shirone blog site - site identity, theme colors, navigation, sidebar, pages, comments, Umami analytics, music, anime sources, fonts, llms.txt, npm package initialization, and build/deploy. Use when enabling or tuning features, changing site behavior, preparing deployment, or configuring a project that consumes shirones.
---

# Shirone 站点配置

配置的唯一入口是 `src/config/`(类型在 `src/types/`),**注释就是文档**——每个字段的语义、默认值和可选值都写在配置文件注释里。完整契约见 `src/config/README.md`。

## 分层原则:配置管行为,数据管内容

- `src/config/*Config.ts`:页面开关 `enable`、分类顺序 `categories`、单项禁用 `disabledKeys`、排序 `order`、数据源与凭据;
- `src/data/*.ts`:具体内容实体(`projects.ts`、`skills.ts`、`timeline.ts`、`devices.ts`、`games.ts`、`friends.ts`、`compass.ts`、`anime.ts`、`music.ts`);
- 消费方统一从 `@/config` barrel 导入(个别循环依赖模块例外,见配置目录 README)。

## 常用配置速查

| 文件 | 职能 |
|---|---|
| `siteConfig.ts` | 站点 URL/base、标题、语言、HCT 主题色种子(色相×风格)、背景纹理、横幅、TOC 深度、favicon |
| `profileConfig.ts` | 头像、名称、简介、社交链接 |
| `navBarConfig.ts` | 导航链接(`LinkPresets` 预设) |
| `sidebarConfig.ts` | 侧栏编排:`arrangement` 单/双栏、`side`、widget 清单与页面过滤 |
| `postListConfig.ts` | 分页大小、list/grid 布局 |
| `articleConfig.ts` | 相关文章、分享与海报 |
| `commentConfig.ts` | 评论系统(默认关闭,Twikoo / Giscus 双 Provider) |
| `umamiConfig.ts` | Umami 数据统计：公开分享统计读取，以及可选的官方访问采集脚本 |
| `musicConfig.ts` | 侧栏音乐(当前默认启用，可手动关闭；local/custom/meting/mixed 四种模式) |
| `animeConfig.ts` | 追番页数据源:本地 / Bangumi 快照 / Bilibili 快照 |
| `fontConfig.ts` | 字体(构建期 TTF→WOFF2 子集化) |
| `llmsConfig.ts` | 生成 AI 友好的 `/llms.txt` 与 `/llms-full.txt` |
| `skillsConfig.ts` 等页面配置 | 技能/项目/时间线/设备/游戏页开关与分类,内容在对应 `src/data/*.ts`；友链、罗盘、番剧和音乐数据也在该目录维护 |
| `seriesConfig.ts` | 系列连载（`/series/` 索引与详情页、文章内系列卡位置 `cardPosition`、默认开启，关闭时入口与页面同步隐藏） |
| `fabConfig.ts` | 右下角悬浮控制流 |
| `footerConfig.ts` / `FooterConfig.html` | 可选页脚 HTML 注入(默认关闭) |
| `licenseConfig.ts` / `expressiveCodeConfig.ts` | 文章版权声明与代码块主题 |
| `announcementConfig.ts` / `imageBloomConfig.ts` / `textureConfig.ts` | 公告、图片辉光与背景纹理的站点级行为 |

## 内容时间

`siteConfig.timeZone` 使用 IANA 时区名（默认 `Asia/Shanghai`），用于解释文章的 `publishedAt` / `updatedAt` 精确时间并校验其所属日历日期。它独立于 `lang`：语言切换不会改变内容归档日期或同日文章排序。

修改该值前，检查已有文章的精确时间在新时区下是否仍落在其 `published`（以及可选的 `updated`）日期；否则构建会报错。仅有 `published: YYYY-MM-DD` 的既有内容不受影响。文章字段的写法和同日排序规则见 `shirone-writing`。

## 启用可选功能的通用模式

可选功能在关闭或未配置时必须**零开销**(零请求/零 DOM/零 bundle)；是否默认启用由现有产品配置决定，不得在修改 skill 时擅自改变。启用时:

1. 在对应 `*Config.ts` 置 `enable: true` 并填写凭据(如 Twikoo `envId`,或 Giscus 的 `giscus.repo` / `repoId` / `categoryId` 三必填——从 giscus.app 获取,缺任一则评论区静默关闭);
2. 部分功能需同时满足多条件,如侧栏音乐要求:`musicConfig.enable` + 数据源有有效曲目 + `sidebarConfig.components` 中 music 条目 `enable: true`;
3. 侧栏 widget 的显隐/分栏/页面范围在 `sidebarConfig.ts` 编排;
4. 页面级开关(如 skills/projects)关闭时导航入口同步隐藏;系列功能还提供 `LinkPresets.Series`(`/series/`)预设但不在默认导航列表中,需用户自行加入 `src/config/navBarConfig.ts`,其内容仓覆盖文件为 `config/series.yaml`(领域键 `series`)。

## Umami 数据统计

当用户询问访问统计、Umami、页面浏览量或访客追踪时，只修改 `src/config/umamiConfig.ts`。字段注释是配置契约的单一真源，完整说明见 `docs/umami-guide.md`。

1. **公开统计读取**：设置 `enable: true` 并填写有效的 `shareUrl`（Umami `share/<shareId>` 格式），启用站点与文章统计 UI。
2. **官方访问采集**：只有在站点所有者明确要求上报访问数据时，才同时填写 `websiteId` 和 `scriptUrl`。任一字段为空，都不得加载官方 Umami 脚本。
3. **安全默认**：新项目或未配置时保留 `enable: false`、`shareUrl: ""`、`websiteId: ""`、`scriptUrl: ""`。不要把临时服务器地址、share token、API key 或私密凭据写入 skill 或提交。
4. **零额外负担与稳定 UI**：关闭或配置不完整时必须没有外部请求、统计 DOM、客户端运行时和功能样式；开启后统计 UI 先由 SSR 输出占位，异步数值只替换固定槽位内的文本，不得造成布局抖动。
5. **开发服务器**：使用 `shirones()` 的项目修改 Umami 配置后要重启 Astro dev server。集成会在启动时读取配置，已经运行的进程不会因热更新重新创建集成。

## 构建与部署(摘要)

标准流程(详见 `INDEX.md`):

1. 确认 `src/config/siteConfig.ts` 与 `astro.config.mjs` 的 `site`/`base`;
2. 发布前检查:`npx.cmd astro check`、`pnpm.cmd check:manifest`、`pnpm.cmd type-check`;
3. 构建:`pnpm.cmd build`(含图标、缩略图、字体子集化、Pagefind 索引);
4. 托管平台:Install `pnpm.cmd install --frozen-lockfile`,Build `pnpm.cmd build`,Output `dist`;
5. 发布后验证首页、文章页、资源路径、明暗主题初始化与 Swup 导航。

`dist/` 是可再生产物,不手改;URL 或 `base` 变更后必须重新构建。

## 必读文档

- `src/config/README.md` — 配置契约、config/data 判别表、导入规则
- `docs/umami-guide.md` — Umami share URL、访问采集、客户端 API 与零负担说明
- `INDEX.md` — 部署分层与标准部署流程
- `README.md` — Quick Start 与主配置表
- `src/config/` 各文件 — 字段级注释文档
- `src/data/` — 内容实体数据文件

## npm 包模式配置

运行 `npx.cmd shirones init` 后，用户配置位于 `shirones/config/`，内容位于 `shirones/content/`。不要编辑 `node_modules/shirones/src/`；包模式的路径和覆盖规则以 `docs/npm-package-mode.md`、`docs/packaging-contract.md` 为准。修改主题默认值时遵循 `rules/project-rules.md` 第 12 节，并同时验证源码模式和包模式。
