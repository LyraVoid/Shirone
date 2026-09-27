# 内容分离：独立内容仓库与双仓架构总览

> 本文介绍 Shirone 博客主题的「代码仓」与「内容仓」分离解耦架构、目录映射规范、同步机制与日常开发指南。  
> 详细子模块：[配置覆盖机制与合并规则](config-overlay.md) · [CLI 工具链与核心工作流](cli-workflows.md) · [双仓自动化构建部署与迁移指南](dual-repo-ci.md)  
> 静态资源分类与构建期处理见 `docs/asset-pipeline.md`；原生配置定义见 `src/config/README.md`。

---

## 什么是内容分离？

在传统静态博客中，博主的个人文章、相册图片、隐私数据往往和博客的主题源码混在同一个 Git 仓库中。这会导致两大痛点：
1. **主题更新极其困难**：当上游主题发布了新功能或修复了问题时，拉取更新容易与本地文章或自定义配置产生严重的 Git 冲突；
2. **私密性难以保障**：如果你想把博客代码开源，就不得不将自己的私人日记、草稿、好友联系方式一同公开；如果设为私有，又无法享受开源社区带来的便利。

**Shirone 的内容分离架构**将博客拆分为两个独立的仓库：
- **代码仓库（公开/Fork）**：存放 Shirone 主题源码、组件库与构建引擎，随时可以一键同步拉取上游主题的最新更新；
- **内容仓库（私有）**：仅存放你自己的文章、说说、相册照片、友链数据和个性化配置文件。平时只在内容仓写作，每次提交自动触发代码仓拉取构建并发布上线。

> [!TIP]
> **强烈推荐开启内容分离**：  
> 将博文内容与博客源码彻底解耦，不仅能让你的原创文章、相册照片与个人配置安全地存放在独立私有仓库中，日后还能零心智负担地一键拉取上游主题更新，再也不用担心 Git 代码冲突。运行 `pnpm content:eject --yes` 即可一键完成解耦迁出（详见 [从单仓向双仓模式迁移指南](dual-repo-ci.md#从单仓向双仓模式迁移指南)）。

---

## 两种工作模式

| 模式 | 适用场景与触发条件 | 行为与特性 |
| --- | --- | --- |
| `local`（默认单仓模式） | 未配置任何外部内容源时默认生效 | 直接使用代码仓自带的示例文章与配置。`pnpm content:sync` 为完全静默的空操作，日常开发与普通主题完全一致，克隆即用 |
| `external`（双仓解耦模式） | 配置了本地目录（`CONTENT_DIR`）或远端 Git 内容仓（`CONTENT_REPO_URL` / `shirone.content.json`） | 真正的“文章只在内容仓写”。在本地预览或线上构建前，系统会自动将外部内容仓的数据安全同步至代码仓标准路径 |

> **平滑切换**：新克隆主题默认为单仓模式。当你想要将现有博客升级为双仓解耦时，只需运行 `pnpm content:eject --yes` 即可一键完成环境初始化与解耦迁出，详见 [从单仓向双仓模式迁移指南](dual-repo-ci.md#从单仓向双仓模式迁移指南)。

---

## 为什么需要自动同步落盘（物化机制）？

在双仓模式下，系统会在构建或开发前将外部内容快速增量同步至代码仓标准路径（即“物化”），而不是直接让 Astro 读取外部目录。这一设计是基于现代静态生成器（Astro 与 Vite）的核心构建特性考量：
1. **全自动图片优化与压缩**：主题内置了高性能图片处理管线，在构建时需要对文章内的图片自动进行 WebP 与 AVIF 转码压缩，这要求图片资源必须处于工程的扫描范围内；
2. **中文字体子集自动抽取**：为了减小博客首屏字体加载体积，系统会在打包时扫描全站文章与配置用到的所有汉字，并从庞大的中文字体包中抽取对应字形；
3. **文章相对图片引用**：在文章中使用 `![](./cover.webp)` 引用同目录配图时，工程需要标准的相对路径解析。

**最佳平衡点**：通过 `pnpm content:sync` 在构建前进行极速的**增量同步落盘**，耗时仅需几十毫秒，既实现了“文章在独立仓库写作”的解耦诉求，又完整保留了 Astro 原生强大的全自动图片压缩与极速构建能力。

---

## 内容仓标准目录结构

一个标准的内容仓库结构如下所示，各个目录在同步时会自动映射到代码仓的对应位置：

```text
shirone-content/
├── shirone.content.json        # 可选：内容仓自定义元数据与挂载配置
├── config/                     # 站点配置覆盖（编译为 src/user/user-config.ts）
│   ├── site.yaml  profile.yaml  sidebar.yaml  nav-bar.yaml  ...
│   └── footer.html             # 自定义页脚注入 HTML（映射至 src/config/FooterConfig.html）
├── content/                    # 核心内容区（映射至 src/content/）
│   ├── posts/                  # 博客文章与配图
│   ├── moments/                # 说说动态
│   ├── series/                 # 系列实体（每个 <slug>.md = 一个系列；须平铺，slug 即路由段）
│   └── spec/                   # 特殊页面
├── data/                       # 结构化数据（映射至 src/data/）
│   ├── projects.ts  skills.ts  timeline.ts  devices.ts
│   ├── friends.ts   compass.ts music.ts     anime.ts
│   ├── games.ts
│   └── anime-snapshots/        # 番剧数据快照基线（可选；anime:sync 会覆盖 <provider>.json）
├── assets/                     # 高清原始图片（映射至 src/assets/，参与构建期压缩转码）
│   └── images/
└── public/                     # 原样静态资源（映射至 public/，原样发布不转码）
    ├── images/
    └── assets/
```

- **路径映射完全兼容**：`assets/` 与 `public/` 的映射保持了标准路径语义，因此配置中的图片路径写法无需任何额外修改；
- **配置文件安全编译**：`config/` 目录下的 YAML 文件不会直接拷贝，而是会自动提取编译为带有完整类型定义的模块，详见 [配置覆盖机制与合并规则](config-overlay.md)；
- **系统元目录自动跳过**：内容仓中的 `.git/`、`.github/`、`.vscode/`、`scripts/` 以及 `README.md` 等仓库辅助文件不会被同步到代码仓。

> **安全提示**：内容仓库中**严禁存放任何敏感密钥**（如 B 站登录凭据、GitHub 访问令牌等），所有密钥应通过 GitHub Secrets 或本地环境变量进行管理。

---

## 同步与安全保护规则

### 1. 精准同步与目录隔离（绝不误删主题自带文件）

同步工具在清理旧文件（裁剪）时，**仅在内容仓确实提供的子目录内发生**：
- 如果你在内容仓更新了 `content/posts/`，同步时只会更新文章，不会波及其他目录；
- 主题自带的核心字体（`src/assets/fonts/`）、默认图标（`public/favicon/`）等系统文件完全独立存在，永远不会被误删；
- 这种机制确保了“主题自带静态资源”与“博主个人内容”可以安全共存。

### 2. 构建期派生资源豁免保护

以下由博客系统在构建期自动生成的派生产物受系统严格保护，既不会被误删，也不允许被内容仓同名文件覆盖：
- `public/assets/moments/thumbnails/**`（说说动态生成的缩略图缓存）
- `public/assets/anime/covers/**`（追番页面自动下载的番剧封面）
- `src/assets/fonts/.subset/**`（中文字体子集抽取产物）

**特例——番剧快照（`src/data/anime-snapshots/**`）**：它刻意不在上方「禁止覆盖」清单内，同步方向**允许**内容仓提供并物化。快照的语义是「基线（last-known-good）」：
- `<provider>.json`（如 `bilibili.json`）由 `anime:sync` 生成与覆盖；抓取失败或返回空列表时默认保留上一次有效快照（`snapshot.keepLastValid`，默认 `true`；跳过覆盖时打印警告且命令以退出码 0 结束）；
- 自定义 `source.file`（如 `manual.json`）是使用者的纯静态 JSON 输入（不填 provider 即完全不发起外部请求），`anime:sync` 永不写入；
- 反向导出永不回写快照，`content:clean` 也不备份、不删除它。

### 3. 代码仓自有文件白名单 (`keep`)

如果你在代码仓的某个挂载目录中放置了属于代码仓自己的特殊文件，可以在 `shirone.content.json` 中配置 `keep` 白名单，同步时将跳过对这些文件的处理：

```json
{
  "keep": ["src/data/my-special-data.ts"]
}
```

### 4. 增量比对与幂等处理

同步过程采用“文件大小 + 修改时间戳”进行智能比对。如果文件内容未发生变化，不会产生任何重复写入；重复执行同步耗时接近 0 秒。

---

## 清单文件与环境变量支持

### 1. 清单文件 (`shirone.content.json`)

位于代码仓根目录的配置文件（配置项参考 `shirone.content.example.json`）：

| 字段 | 说明 |
| --- | --- |
| `schemaVersion` | 清单结构版本，默认为 `1` |
| `source.type` | 内容源类型：`"path"`（本地目录）或 `"git"`（远端仓库） |
| `source.path` | 本地内容目录路径（相对代码仓根目录解析） |
| `source.url` / `source.ref` | 远端 Git 仓库地址与目标分支/Tag/Commit SHA（默认为 `main`） |
| `mounts` | 自定义挂载映射表（可按需关闭或重定向某个挂载点） |
| `keep` | 受保护的文件白名单列表（支持通配符 `*` 与 `**`） |
| `prune` | 设为 `false` 时仅执行增量拷贝，不删除已不存在的文件 |

### 2. 环境变量与 `.env` 支持

系统会自动读取代码仓根目录下的 `.env` 与 `.env.local` 文件，配置优先级为：`进程环境变量` > `.env.local` > `.env` > `shirone.content.json`。

| 环境变量 | 作用与说明 |
| --- | --- |
| `CONTENT_DIR` | 本地内容仓库绝对或相对路径。本地开发推荐直接写在 `.env` 中；CI 环境中配合仓库拉取使用 |
| `CONTENT_REPO_URL` | 远端 Git 内容仓库地址（私有仓库可配合访问令牌使用，日志中会自动脱敏） |
| `CONTENT_REPO_REF` | 指定内容仓分支、标签或 Commit SHA（默认为 `main`） |
| `SHIRONE_CONTENT_SYNC` | 设为 `0` 或 `false` 时可强制关闭同步，临时回到单仓模式 |
| `CONTENT_SYNC_PULL` | 设为 `false` 时离线复用已存在的本地临时缓存副本，不主动联网拉取 |

---

## 本地开发与写作推荐流

### 推荐工作流：双终端实时写作

1. **配置本地路径**：在代码仓根目录新建 `.env` 文件，指定你的外部内容仓路径：
   ```bash
   # .env
   CONTENT_DIR="G:/Code/Blog/shirone-content"
   ```
2. **启动本地开发**：打开终端 1，正常启动博客预览：
   ```powershell
   pnpm dev
   ```
3. **开启实时监听**：打开终端 2，启动实时同步工具：
   ```powershell
   pnpm content:watch
   ```
4. **尽情写作**：在内容仓中使用任意你喜欢的 Markdown 编辑器（如 Obsidian、VSCode、Typora）撰写文章或调整 YAML 配置。每次按 `Ctrl + S` 保存时，系统会在**毫秒级**极速完成增量同步，并在浏览器中实现丝滑的局部热重载。

---

## 边界与注意事项

1. **配置字段拼写要求**：内容仓 YAML 配置文件不支持随意捏造的未知字段。拼写错误时同步工具会主动拦截并给出修改建议，防止配置静默失效；
2. **数据文件类型一致性**：内容仓中的 `data/*.ts` 数据文件会引用代码仓的 TypeScript 类型定义，若主题升级涉及数据结构调整，运行 `npx astro check` 即可快速捕获；
3. **外部编辑器路径设置**：如果你在代码仓中使用 Front Matter CMS 等可视化插件，请将内容源直接指向外部内容仓库目录，避免编辑落盘后的临时副本；
4. **特殊 Markdown 语法路径**：`@[code-tree]` 与 `<!-- @include: ... -->` 这两类读取文件系统的特殊扩展语法，在解析时需填写相对于代码仓根目录的路径。其余 15 种 Markdown 自定义语法完全不受影响，天然兼容。

---

## 常用诊断与验证命令

```powershell
pnpm content:validate           # 安全预检：零写盘快速检查配置语法与结构冲突
pnpm content:status             # 状态体检：检查内容源连接、文件数量与同步状态
pnpm content:status --remote    # 额外检查远端 Git 仓库连接与最新版本（会联网）
pnpm content:export             # 预演反向导出计划（不修改磁盘文件）
pnpm content:clean              # 预演重置还原计划（不修改磁盘文件）
node --test tests/content/*.test.mjs  # 运行内容分离全套单元测试
npx.cmd astro check             # 检查全站 TypeScript 与 Astro 类型（0 error）
pnpm build                      # 执行完整生产打包构建
```

`local` 单仓模式下的回归验证标准：运行 `pnpm content:sync` 时无任何终端输出，且 `git status` 保持绝对干净。

