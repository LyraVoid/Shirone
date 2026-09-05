<div align="center">

<img src="./public/logo/icon.webp" width="88" height="88" alt="Shirone 图标" />

# Shirone

**一个基于 Material 3 Expressive、富有表现力的二次元博客主题。**

为长文写作、个人收藏，以及让网站真正属于你的细节而生的安静阅读空间。

[在线预览](https://shirone.mysqil.com/) · [项目文档](https://docs.shirone.mysqil.com/) · [反馈问题](https://github.com/LyraVoid/Shirone/issues)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

![Node.js >= 22.12](https://img.shields.io/badge/Node.js-%3E%3D22.12-5FA04E?logo=nodedotjs&logoColor=white)
![pnpm 9](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)
![Astro 7](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg)](./LICENSE)

</div>

> [!IMPORTANT]
> **请先阅读[在线文档](https://docs.shirone.mysqil.com/)。** 主题配置、内容工作流与部署说明均以此为主入口。

## 从这里开始

[在线文档](https://docs.shirone.mysqil.com/)是配置主题、管理内容和部署站点的主要入口。本仓库包含主题源码；如果希望将个人内容独立管理，请使用 [Shirone-Content](https://github.com/LyraVoid/Shirone-Content)。

## 实测表现

当前参考跑分中，Performance、Accessibility、Best Practices 和 SEO 均为 100，Agentic browsing 三项检查全部通过。详细性能指标在本次测试中同样达到 100；实际结果会因托管环境、内容和网络条件而变化。

![Shirone 性能跑分](./Benchmark.webp)

![Shirone 首页](./public/assets/projects/shirone.webp)

<table>
  <tr>
    <td align="center"><strong>色彩魔法</strong><br><sub>随光线、心情与选择变化的 HCT 动态配色。</sub></td>
    <td align="center"><strong>流畅旅程</strong><br><sub>Swup 让页面轻盈切换，也让周围的世界保持鲜活。</sub></td>
  </tr>
  <tr>
    <td align="center"><strong>故事魔导书</strong><br><sub>用同一套写作流容纳 Markdown、MDX、公式、图表、代码与图片。</sub></td>
    <td align="center"><strong>安静守护</strong><br><sub>SSR 优先、无障碍友好，可选功能关闭时真正不留负担。</sub></td>
  </tr>
</table>

## ✦ 写给每个故事的小小咒语

Shirone 是一个使用 Astro 7、Svelte 5、Tailwind CSS 4 和 Stylus 构建的静态个人博客主题。这里的魔法并不是堆叠华丽特效，而是藏在会随光线和心情变化的色彩里，藏在不打断氛围的翻页间，也藏在让个人小天地慢慢鲜活起来的细节中。

柔软的外表之下，是一套由设计令牌驱动的 Material 3 Expressive 组件系统。内容优先通过服务端渲染输出，Swup 则负责流畅的站内导航，并让页面切换时的外围应用框架保持运行。

除了长文写作，Shirone 也适合展示瞬间、相册、追番、友链、项目、技能和时间线等个人内容。

## ✦ 魔导书里的能力

- 基于 HCT 的动态配色，支持 Material 3 与 Material 3 Expressive 规范
- 明暗主题、横幅与纯色背景、可选纹理以及访客显示偏好
- 响应式布局，可配置单侧栏或双侧栏
- 基于 Swup 的无刷新导航、持久化外围框架、路由进度与减少动效支持
- 支持 Markdown 与 MDX，以及数学公式、Mermaid、提示块、增强代码块和图片画廊
- Pagefind 全文搜索、RSS 与 Sitemap
- 文章目录、延伸阅读、分享、加密与可选评论
- 归档、分类、标签、友链、瞬间、番剧、相册、项目、技能和时间线等独立页面
- 内置 10 种界面语言
- SSR 优先、键盘友好，并配有无障碍测试
- 可选集成遵循“零额外负担”原则：关闭时不会产生外部请求、DOM、布局偏移或主包代码

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 22.12 或更高版本
- [pnpm](https://pnpm.io/) 9.x（仓库锁定为 `pnpm@9.14.4`）

### 本地运行

```bash
git clone https://github.com/LyraVoid/Shirone.git
cd Shirone
corepack enable
pnpm install
pnpm dev
```

在浏览器中打开 `http://localhost:4321`。

如果 Windows PowerShell 的脚本执行策略阻止运行命令，请改用 `pnpm.cmd` 和 `npx.cmd`。

### 使用 npm 包

不想克隆主题仓库？可以直接把 Shirone 安装为 `shirones` npm 包，在空文件夹中初始化博客——无需 Astro 起步模板，也无需手动安装依赖：

```bash
mkdir my-blog
cd my-blog
npx shirones init   # 写入 package.json，安装 astro、主题及其 peer 依赖
pnpm dev
```

`init` 会生成 `astro.config.mjs`、`shirones/` 下的类型化配置、示例内容与静态资源；你依然可以通过 `src/components/` 和 `src/layouts/` 覆盖主题组件。随时重新运行 `npx shirones init` 可检查漂移（它不会覆盖你的文件），传入 `--force` 可还原模板文件。详见 [npm 包模式](./docs/npm-package-mode.md) 与 [shirones 仓库](https://github.com/yCENzh/shirones)。

### 定制站点

1. 在 `src/config/siteConfig.ts` 中设置正式网址、标题、语言、主题、横幅和显示选项。
2. 在 `src/config/profileConfig.ts` 和 `src/config/navBarConfig.ts` 中更新个人资料与导航。
3. 检查 `src/config/` 中各功能对应的配置文件；文件内注释说明了默认值和可用选项。
4. 替换 `src/content/`、`src/data/` 与 `public/` 中的示例文章、个人数据和媒体资源。
5. 使用 `pnpm new-post <filename>` 创建文章，再到 `src/content/posts/` 中编辑。

完整配置契约请参阅 [`src/config/README.md`](./src/config/README.md)。

## 官方配套仓库

Shirone 将主题源码、个人站点内容和 npm 发布职责分离；以下官方仓库分别服务于不同工作流：

| 仓库 | 适用场景 | 包含内容 |
| --- | --- | --- |
| [Shirone-Content](https://github.com/LyraVoid/Shirone-Content) | 使用外部内容源的双仓博客 | 文章、说说、数据、媒体与 `config/*.yaml` 覆盖的内容模板。请 Fork 或克隆到自己的仓库（通常设为私有），再让本主题仓指向它。参阅[内容分离指南](./docs/content-separation/README.md)。 |
| [shirones](https://github.com/yCENzh/shirones) | 维护和发布 `shirones` npm 包 | 手动构建与发布流水线。它在构建时拉取本仓库，且刻意不保存主题源码；普通博客用户应安装 `shirones`，不需要直接使用此仓库。参阅 [npm 包模式](./docs/npm-package-mode.md)。 |

## 核心配置

| 文件 | 用途 |
| --- | --- |
| `src/config/siteConfig.ts` | 站点网址、标识、语言、动态配色、横幅、纹理、目录和显示设置 |
| `src/config/profileConfig.ts` | 作者资料与社交链接 |
| `src/config/navBarConfig.ts` | 主导航 |
| `src/config/sidebarConfig.ts` | 侧栏布局、挂件和页面过滤 |
| `src/config/postListConfig.ts` | 分页与列表/网格展示 |
| `src/config/articleConfig.ts` | 更新提示、延伸阅读和文章分享 |
| `src/config/commentConfig.ts` | 可选评论服务 |
| `src/config/musicConfig.ts` | 可选的本地、自定义、Meting 或混合音乐源 |
| `src/config/animeConfig.ts` | 番剧页与本地/Bangumi/Bilibili 快照数据源 |

## 撰写文章

文章放在 `src/content/posts/` 中，支持 Markdown 与 MDX。最小 Frontmatter 示例：

```yaml
---
title: 我的第一篇文章
published: 2026-08-26
description: 显示在文章列表和元数据中的简短摘要。
image: ./cover.webp
tags: [Astro, 随笔]
category: 写作
draft: false
---
```

常用可选字段包括 `updated`、`pinned`、`comment`、`lang`、`encrypted`、`password`、`passwordHint` 和 `hideHomeContent`。图片可以使用远程 URL、从 `public/` 开始的绝对路径，或相对于文章文件的路径。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动开发服务器 |
| `pnpm new-post <filename>` | 创建新文章 |
| `pnpm format` | 运行 Biome 格式化代码（提交前必跑） |
| `pnpm check` | 运行 Astro 诊断 |
| `pnpm type-check` | 运行 TypeScript 检查 |
| `pnpm check:manifest` | 校验组件清单 |
| `pnpm test` | 运行 Playwright 测试 |
| `pnpm build` | 构建站点与 Pagefind 索引到 `dist/` |
| `pnpm preview` | 预览生产构建 |
| `pnpm lighthouse` | 运行桌面端生产环境审计 |

## 部署

Shirone 会生成静态的 `dist/` 目录，可部署到 Vercel、Netlify、GitHub Pages 或任意静态托管服务。

部署前，请更新 `src/config/siteConfig.ts` 中的 `site` 和 `base`，然后运行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm type-check
pnpm check:manifest
pnpm build
```

托管平台的构建命令填写 `pnpm build`，输出目录填写 `dist`。更多说明见 [`INDEX.md`](./INDEX.md)。

## 项目文档

- [`src/config/README.md`](./src/config/README.md) - 配置参考
- [`docs/m3e-standard.md`](./docs/m3e-standard.md) - 设计令牌与组件标准
- [`docs/atomic-structure.md`](./docs/atomic-structure.md) - 组件分层与依赖规则
- [`docs/markdown-extensions.md`](./docs/markdown-extensions.md) - Markdown 插件、样式、缓存与测试契约
- [`docs/sidebar-system.md`](./docs/sidebar-system.md) - 侧栏编排与 Swup 同步
- [`docs/on-demand-loading.md`](./docs/on-demand-loading.md) - 可选功能的零额外负担实现
- [`docs/font-system.md`](./docs/font-system.md) - 字体配置与生产环境子集化

## 参与贡献

欢迎提交 Issue 和 Pull Request。准备开发大型功能或视觉改动前，请先发起 Issue 或 Discussion。提交代码前请阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 和仓库规则，提交前务必运行 `pnpm format` 格式化代码，确保每个 Pull Request 只处理一个明确主题，并使用 Conventional Commits。

## 致谢

Shirone 最初基于 [saicaca](https://github.com/saicaca) 的 [Fuwari](https://github.com/saicaca/fuwari) 重构而来。如今的 M3E 设计系统、组件架构、页面模块和编排机制均以 Shirone 的名义继续开发。感谢 Fuwari 项目及其贡献者提供的最初基础。

## 同行者

每一次贡献，都在 Shirone 的魔导书里写下新的一行。感谢所有陪伴这个小世界成长的人。

<div align="center">
  <a href="https://github.com/LyraVoid/Shirone/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=LyraVoid/Shirone" alt="Shirone 贡献者" />
  </a>
</div>

## 星光轨迹

<div align="center">
  <a href="https://star-history.com/#LyraVoid/Shirone&amp;Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
      <img alt="Shirone Star History 趋势图" src="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
    </picture>
  </a>
  <p><sub>每一颗 Star，都是让 Shirone 向更远处发光的一点星屑。</sub></p>
</div>

## 许可证

Shirone 使用 [MIT License](./LICENSE) 开源。仓库保留了该许可证要求的原始版权声明。
