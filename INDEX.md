# Shirone 部署分层索引

本索引用于快速定位 Shirone 从源码到线上站点的部署边界。组件分层的权威定义仍以 [`docs/atomic-structure.md`](docs/atomic-structure.md) 为准；本文件只描述部署相关的目录、配置和验证入口。

## 分层总览

```text
内容层       src/content + src/data + 用户图片（可选：独立内容仓库）
源码层       src/content + src/components + src/layouts + src/pages
配置层       src/config + src/types + astro.config.mjs
校验层       astro check + manifest check + type-check + Playwright
构建层       Astro build  ->  dist/
托管层       Vercel / Netlify / GitHub Pages / 其他静态托管平台
```

依赖方向是单向的：托管平台只接收构建产物，构建过程读取配置和源码；运行中的页面不应反向修改构建配置或内容集合。

## 各层职责

| 层 | 位置 | 部署职责 |
| --- | --- | --- |
| 内容 | `src/content/`、`src/data/`、`public/images/` | 文章、说说、系列实体、站点数据实体与用户图片。默认随仓库维护；也可迁到独立内容仓库，构建前由 `pnpm content:sync` 物化到同样的路径。边界与双仓 CI 见 `docs/content-separation/README.md`。 |
| 源码 | `src/` | 页面、布局、组件、Markdown 内容和运行时脚本。组件组合遵循 `atoms → molecules → organisms → layouts → pages`。 |
| 配置 | `src/config/`、`src/types/`、`astro.config.mjs` | 设置站点 URL、`base` 路径、站点标识、语言、主题和功能开关。部署前优先检查 `src/config/siteConfig.ts` 与 `astro.config.mjs`。迁到独立内容仓后，这里仍是默认值与配置文档的真源，用户覆盖走内容仓 `config/*.yaml`，见 `docs/content-separation/config-overlay.md`。 |
| 资产 | `src/assets/`、`public/images/`、`public/assets/` | 保存原始媒体，并在构建前生成可重复创建的响应式派生资源。目录边界见 `docs/asset-pipeline.md`。 |
| 校验 | `rules/`、`tests/`、`scripts/` | 在发布前检查类型、Astro 产物、组件清单、无障碍和关键页面行为。 |
| 构建 | `dist/`（生成目录） | `astro build` 生成的静态发布产物。不要手工编辑；每次发布都应从干净构建重新生成。 |
| 托管 | 平台项目设置 | 使用仓库构建命令生成 `dist/`，将发布目录指向 `dist/`，并按平台要求配置站点域名与环境变量。 |

## 标准部署流程

1. 在 [`src/config/siteConfig.ts`](src/config/siteConfig.ts) 和 [`astro.config.mjs`](astro.config.mjs) 中确认 `site`、`base` 与站点标识。
2. 安装锁定依赖：`pnpm.cmd install --frozen-lockfile`。
3. 执行发布前检查：`npx.cmd astro check`、`pnpm.cmd check:manifest`、`pnpm.cmd type-check`；涉及页面或交互时，再运行对应的 Playwright 用例。
4. 构建：`pnpm.cmd build`（等价于 `astro build`），确认 `dist/` 生成且无构建错误。
5. 在托管平台配置：
   - Install：`pnpm install --frozen-lockfile`
   - Build：`pnpm build`
   - Output：`dist`
6. 发布后检查首页、文章页、静态资源路径、明暗主题初始化和站内 Swup 导航。

## CI 对照

GitHub Actions 的 [`ci.yml`](.github/workflows/ci.yml) 运行 Biome、`astro check`、清单校验与单元测试，并在 Node.js 22/24 上分别执行 `pnpm build`。本地发布前应至少复现同一组命令；`ci.yml` 不负责部署到具体托管平台。

使用独立内容仓库时，另有两个流程：[`deploy.yml.example`](.github/workflows/deploy.yml.example) 是双仓构建与部署的示例（复制为 `deploy.yml` 后补全部署步骤），[`content-validate.yml`](.github/workflows/content-validate.yml) 是供内容仓调用的可复用校验流程。

## 重要边界

- `dist/` 是可删除并重新生成的构建产物，不纳入源码编辑流程。
- `research/` 仅供参考，不参与构建和部署。
- 可选功能默认关闭时必须满足零额外负担：不输出占位 DOM、不发起外部请求、不增加主 bundle。
- 纯 SSR 页面不应无端添加 hydration 指令；需要交互的组件才使用 `client:load`、`client:visible` 或 `client:only`。
- 部署 URL 或 `base` 变更后，应重新构建并验证资源链接和 Swup 导航，不能只替换托管平台域名。

## 相关文档

- [`README.md`](README.md)：首次运行与常用命令
- [`src/config/README.md`](src/config/README.md)：配置契约
- [`docs/content-separation/`](docs/content-separation/README.md)：独立内容仓库、物化规则、配置覆盖与双仓 CI
- [`docs/atomic-structure.md`](docs/atomic-structure.md)：组件分层
- [`docs/m3e-standard.md`](docs/m3e-standard.md)：M3E 令牌与组件标准
- [`docs/markdown-extensions.md`](docs/markdown-extensions.md)：Markdown 插件、样式所有权、缓存刷新与验证
- [`docs/markdown-syntax-manifest.md`](docs/markdown-syntax-manifest.md)：自定义 Markdown 作者语法清单、状态与维护流程
- [`docs/asset-pipeline.md`](docs/asset-pipeline.md)：本地图片、离线图标与生成资产流水线
- [`rules/project-rules.md`](rules/project-rules.md)：质量门禁与提交流程
- [`rules/pitfalls.md`](rules/pitfalls.md)：Astro/Svelte、缓存与测试注意事项
