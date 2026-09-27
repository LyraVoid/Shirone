---
name: shirone-writing
description: Writing blog posts and moments for a Shirone blog - frontmatter schemas, drafts, pinned posts, encrypted posts, images, tags, categories, and the new-post scaffold. Use when creating or editing content under src/content/.
---

# Shirone 内容写作(文章与动态)

内容放在 `src/content/posts/`(文章,支持 `.md`/`.mdx`)与 `src/content/moments/`(动态,仅 `.md`)。Schema 定义在 `src/content.config.ts`。相册不属于 Content Collection，改用 `shirone-data`。

## 文章 frontmatter

```yaml
---
title: 必填
published: 2026-01-01   # 必填日历日期
publishedAt: 2026-01-01T09:30:00+08:00 # 可选精确发布时间，用于同日排序
updated: 2026-02-01     # 可选日历日期
updatedAt: 2026-02-01T14:20:00+08:00   # 可选精确更新时间
description: 摘要文本
image: 封面图路径
tags: [astro, 笔记]
category: 随笔
series: 系列 slug        # 可选，留空=不属于任何系列
seriesOrder: 3          # 可选，系列内顺序；缺省按发布日期
pinned: false           # 置顶
draft: false            # 草稿(不发布)
comment: true           # 文章级评论开关(默认 true,继承全局)
lang: ""                # 覆盖站点默认语言的渲染语言
# 加密文章
encrypted: false
password: ""            # 字符串或数字
passwordHint: ""        # 密码提示
hideHomeContent: true   # 加密内容在首页隐藏(默认 true)
---
```

`prevTitle`/`prevSlug`/`nextTitle`/`nextSlug` 为系统内部字段,不要手写。

## 日期与排序

- `published` 和 `updated` 是日历日期，使用 `YYYY-MM-DD`；它们决定文章归档与跨日排序。
- 同一天发布多篇文章时，为每篇补充带时区偏移的 ISO 8601 `publishedAt`，例如 `2026-01-01T09:30:00+08:00`。列表会在置顶状态相同、`published` 相同的文章之间按该时间倒序排列。
- `publishedAt` 必须落在 `siteConfig.timeZone` 解释后的 `published` 当天；修改日期时，`updatedAt` 也必须落在对应 `updated` 当天，且不能单独存在。
- 脚手架 `pnpm.cmd new-post` 会按 `siteConfig.timeZone` 同时写入 `published` 与 `publishedAt`（两者必然同一天，与机器时区无关）；之后若改了 `published`，必须同步改 `publishedAt`，否则构建报错。内容分离模式下内容仓若覆盖了 `timeZone`，用 `SHIRONE_TZ=<IANA 时区>` 运行脚手架。
- 未填写精确时间时保持兼容：同日文章以内容 ID 作稳定兜底排序。不要把 `published` 写成带时间的字符串；站点时区改用 `shirone-config` 配置。

## 系列(series)

- 系列实体放在 `src/content/series/<slug>.md`，frontmatter 为 `title`（必填）、`status: "ongoing" | "completed"`（默认 `ongoing`）、`defaultCategory`（可选）；正文是可选系列总览。实体须平铺在该目录根下，slug 即单个路由段（`/series/<slug>/`），不要用 `a/b` 嵌套目录。
- 文章用 `series` 填系列 slug、`seriesOrder` 填系列内位置；一篇文章最多属于一个系列，两者都可省略（省略即普通文章）。
- 分类回退链：`post.category` → `series.defaultCategory` → 未分类，显式 `category` 始终优先；单一解析点为 `resolveSeriesPostCategory`（`src/utils/series-utils.ts`）。
- 阅读顺序：`seriesOrder` 优先；仅部分文章标注时，未标注项按发布日期排在标注项之后，同序再按 slug 兜底。
- 未知 slug 静默容忍，不产生死链、不阻断构建，每个未知 slug 仅在构建日志打印一次 `[series] ...` 警告。
- 站内入口为 `/series/`（每系列一张卡片的索引）与 `/series/<slug>/`（系列总览 + 有序文章列表）。

## 动态(moments)frontmatter

`published`(必填)、`pinned`、`location`、`mood`(Iconify 图标名,如 `material-symbols:sentiment-excited-outline-rounded`)、`tags: []`、`images: [{src, alt}]`、`draft`。

## 工作流

1. 脚手架:`pnpm.cmd new-post <filename>` 生成 `src/content/posts/<filename>.md` 骨架(含按站点时区算好的 `published` + `publishedAt`,见「日期与排序」);
2. 写正文:自定义语法直接使用,无需任何启用开关(见 `shirone-markdown-syntax` 技能);图片可用相对路径引用同目录资源;
3. 本地预览:`pnpm.cmd dev` 后访问 `http://localhost:4321`。

## 现成范例(demo 文章即文档)

`src/content/posts/` 下的示例文章同时是语法文档,写作前可参考:`markdown.md`(基础)、`markdown-extended.md`(扩展语法)、`admonitions.md`、`spoilers.md`、`steps.md`、`option-groups.md`、`collapse-panels.md`、`marker-highlights.md`、`markdown-abbreviations.md`、`markdown-mermaid.md`、`expressive-code.md`、`encrypted-demo.md`(加密)、`video.md`、`image-grid-demo/`(图片画廊)、`markdown-includes.md`(文件包含)。

## 注意事项

- 正式发布前删除或保持 `draft: false`;不要提交带真实密码的加密文章到公开仓库;
- 站点级设置(语言、主题色等)不属于文章 frontmatter,见 `shirone-config` 技能;
- frontmatter 字段校验失败会导致构建报错,先对照 `src/content.config.ts` 的 schema 排查。

## 必读文档

- `src/content.config.ts` — posts/moments 的 zod schema 权威定义
- `scripts/new-post.js` — `pnpm new-post` 脚手架行为
- `src/content/posts/` — 示例文章(语法活文档)
- `src/content/moments/` — 动态示例

## npm 包模式内容路径

在运行 `npx.cmd shirones init` 初始化的项目中，将文章和 moments 写入 `shirones/content/posts/` 与 `shirones/content/moments/`。不要编辑 `node_modules/shirones/src/content/`；包模式路径以及 include/图片的归属规则见 `docs/npm-package-mode.md` 和 `docs/packaging-contract.md`。
