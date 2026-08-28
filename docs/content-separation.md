# 内容分离指南

Shirone 支持在构建前从独立的内容仓库同步文章、动态、相册、数据文件和媒体资源。内容分离默认关闭；关闭时不会访问内容仓库，也不会改变现有构建逻辑。

## 目录映射

内容仓库使用仓库根目录相对路径。主题仓库使用现有的 `src/` 与 `public/` 路径。路径转换只由 `scripts/content-sync-lib.mjs` 执行，内容文件不应自行写入主题仓库路径。

| 内容仓库路径 | 主题仓库路径 |
| --- | --- |
| `albums/` | `public/images/albums/` |
| `moments/*.md` | `src/content/moments/*.md` |
| `moments/images/` | `public/images/moments/` |
| `posts/` | `src/content/posts/` |
| `spec/` | `src/content/spec/` |
| `data/*.ts` | `src/data/*.ts` |
| `data/anime-snapshots/` | `src/data/anime-snapshots/` |
| `data/assets/banner/` | `src/assets/images/banner/` |
| `data/assets/banner/` | `public/assets/banner/` |
| `data/assets/music/cover/` | `src/assets/images/music/` |
| `data/assets/music/url/` | `public/assets/music/url/` |
| `data/assets/anime/` | `public/assets/anime/` |
| `data/assets/projects/` | `public/assets/projects/` |

`public/assets/banner/` 是兼容性镜像目录，只在同步内容仓库到主题仓库时生成。建立内容仓库时，横幅以 `src/assets/images/banner/` 为唯一导出来源，避免两个主题目录中的同名文件互相覆盖。

`data/assets/moments/thumbnails/` 是生成资源，不参与同步。同步动态原图后，现有 `images:generate` 流程会重新生成 `public/assets/moments/thumbnails/`。

## 内容仓库中的路径写法

内容仓库中的路径是仓库根目录相对路径。例如：

```ts
cover: "data/assets/projects/shirone.webp"
source: "data/assets/music/url/dazbee.mp3"
```

同步到主题仓库后会分别变为：

```ts
cover: "/assets/projects/shirone.webp"
source: "/assets/music/url/dazbee.mp3"
```

文章和动态中的本地媒体也使用内容仓库相对路径：

```markdown
![Album image](albums/AcgExample/07.webp)
```

同步后会变为：

```markdown
![Album image](/images/albums/AcgExample/07.webp)
```

动态 frontmatter 中的图片使用：

```yaml
images:
  - src: moments/images/scenery/scene-1.webp
```

同步后会变为 `/images/moments/scenery/scene-1.webp`。这些路径转换由脚本完成；不要在内容仓库中写 `D:\Projects\Shirone` 等本机绝对路径。

数据 TypeScript 文件在创建内容仓库时会自动添加注释，说明上述路径契约。不要删除这些注释，也不要在内容文件中修改主题组件或配置的导入逻辑。

## 从当前项目建立内容仓库

在主题仓库根目录执行：

```powershell
pnpm.cmd content-separation <内容仓库名称> <建立位置>
```

例如：

```powershell
pnpm.cmd content-separation Shirone-content D:\Projects
```

脚本会创建：

```text
D:\Projects\Shirone-content\
```

并按照上表复制当前项目的内容和媒体，同时将路径转换为内容仓库格式。脚本还会在主题仓库根目录创建或更新 `.env`：

```env
ENABLE_CONTENT_SYNC=true
```

该命令不会覆盖已存在的目标目录，也不会删除源项目文件。新仓库会尝试执行 `git init`，之后应自行提交内容并配置远程仓库。

## 从远程内容仓库同步

启用内容同步时，必须设置：

```env
ENABLE_CONTENT_SYNC=true
CONTENT_REPO_URL="git@github.com:your-name/shirone-content.git"
```

`CONTENT_REPO_URL` 支持：

- HTTPS 公共仓库；
- HTTPS 私有仓库（使用当前 Git 凭据）；
- SSH 仓库（使用当前 SSH key）；
- 本地 Git 仓库的 `file:///` URL。

手动执行同步：

```powershell
pnpm.cmd sync-content
```

脚本会先把仓库浅克隆到主题仓库的 `.temp/`，完成白名单路径映射和文本路径转换后删除临时 checkout。`.temp/` 已被 Git 忽略。

同步会把内容仓库视为受管内容的权威来源：远程仓库实际提供的文件会覆盖主题仓库中的对应文件，远程仓库已删除的受管文件也会从主题仓库删除。相册目录中的 `AGENTS.md`、`README.md` 等主题仓库说明文件不属于受管内容，会被保留。同步先在隔离的暂存目录完成映射和校验，再应用到主题仓库；应用失败时会尽力回滚，避免留下半同步状态。

同步过程使用 `.temp/` 下的临时 checkout、暂存目录和锁文件。正常结束后这些文件会删除；启动时也会清理上一次被中断后遗留的临时目录。不要把 `.temp/` 中的内容作为内容仓库数据使用。

## 构建和开发服务器

`pnpm.cmd dev`、`pnpm.cmd start` 和 `pnpm.cmd build` 已经在现有图标、缩略图和字体步骤之前调用 `sync-content`。

关闭时：

```env
ENABLE_CONTENT_SYNC=false
```

同步脚本直接退出，后续构建步骤保持原样。

开启时，流程为：

```text
同步内容仓库
→ 生成本地图标
→ 生成动态缩略图
→ 字体子集化
→ Astro 构建
→ Pagefind 索引
```

CI 中可以直接设置环境变量，不需要提交 `.env`：

```text
ENABLE_CONTENT_SYNC=true
CONTENT_REPO_URL=...
```

环境变量优先于 `.env` 中的同名值。启用同步但缺少 `CONTENT_REPO_URL` 时，脚本会立即失败，不会继续使用不完整的内容构建。

## 注意事项

1. 内容同步会修改当前工作树中的内容目标文件，并删除远程已删除的受管文件。建议在 CI 或专用构建 checkout 中启用，不要在有未提交内容修改的工作树中直接同步。
2. 脚本只同步固定白名单，不能覆盖 `src/components/`、`src/pages/`、`src/config/`、`scripts/`、`package.json` 或其他主题代码。
3. 相册 `info.json` 中的本地图片必须与相册目录一起同步；已知路径的公开 `public/` 文件仍然可以被直接访问，密码相册不是服务端授权。
4. 内容仓库中的 Markdown、TypeScript 和 JSON 不应包含密钥、Cookie 或其他凭据。
5. 修改内容仓库中的动态图片后，不需要手工提交缩略图；运行构建流程会重新生成派生文件。
6. 切换 `.env` 或远程仓库内容后，开发服务器必要时需要重启，以便 Astro 重新扫描内容集合。
