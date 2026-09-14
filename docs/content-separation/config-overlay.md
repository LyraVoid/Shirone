# 内容分离：配置覆盖机制与合并规则

> 本文约定内容仓 `config/` 目录下 YAML 配置文件的覆盖语法、合并规则、配置领域映射表以及 TypeScript 类型安全校验机制。  
> 顶层总纲见 [内容分离总览](README.md)；主题原生配置定义与逐项注释见 `src/config/README.md`。

---

## 核心机制与流转流程

在内容分离模式下，内容仓 `config/` 目录下的各个 YAML 配置文件用于覆盖主题的对应配置领域。它并非简单的物理文件覆盖：

在构建或开发前，`content:sync` 会将这些 YAML 配置文件编译并提取为带有完整类型标注的代码模块 `src/user/user-config.ts`，随后在构建期与主题的默认配置进行深度合并。

```mermaid
flowchart LR
    UserYAML["内容仓 YAML 配置文件<br/>(例如 config/site.yaml)"] -- "content:sync<br/>编译提取" --> GeneratedTS["src/user/user-config.ts<br/>(带类型标注生成物)"]
    GeneratedTS -- "withUserConfig<br/>深度合并" --> FinalConfig["siteConfig 最终生效配置<br/>(以主题默认值为底座，叠加自定义覆盖)"]
```

### 覆盖核心原则：只写想要修改的配置项

配置覆盖层**不需要包含完整的默认配置**，只需写下你显式想要修改的配置项：

```yaml
# config/site.yaml
title: 我的博客
themeColor:
  hue: 262
```

- **平滑跟随主题升级**：未在 YAML 中填写的字段（如 `themeColor.fixed`、`themeColor.style` 等）会自动沿用主题的默认值。当未来主题更新加入了新特性或新配置时，你的博客能够自动获得支持，不会因为配置被写死在旧版本而失效；
- **合并规则：对象递归合并，数组整体替换**：
  - **嵌套对象**：递归按层级深入合并，未修改的子字段继续继承主题默认值；
  - **列表与数组**（如 `profile.links` 社交链接、`sidebar.components` 侧边栏组件）：**采用整体替换，不做逐项合并**。列表清单表达的是“这就是我要展示的全部项”，如果要修改或删减其中一项，请把完整的列表项写全。

### 文件与配置领域的对应关系

内容仓中的 YAML 文件与主题内部配置领域的映射关系如下：

| 配置文件 | 覆盖的主题配置 | 配置文件 | 覆盖的主题配置 |
| --- | --- | --- | --- |
| `site.yaml` | `siteConfig` 站点基本信息 | `skills.yaml` | `skillsConfig` 技能清单 |
| `profile.yaml` | `profileConfig` 个人资料与社交链接 | `projects.yaml` | `projectsConfig` 开源项目 |
| `sidebar.yaml` | `sidebarConfig` 侧边栏组件与布局 | `timeline.yaml` | `timelineConfig` 时间轴 |
| `nav-bar.yaml` | `navBarConfig` 顶部导航栏 | `devices.yaml` | `devicesConfig` 我的设备 |
| `post-list.yaml` | `postListConfig` 文章列表样式 | `music.yaml` | `musicConfig` 音乐播放器 |
| `article.yaml` | `articleConfig` 文章正文与阅读设置 | `anime.yaml` | `animeConfig` 番剧追番 |
| `comment.yaml` | `commentConfig` 评论系统 | `font.yaml` | `fontConfig` 字体与字号 |
| `announcement.yaml` | `announcementConfig` 全站公告 | `license.yaml` | `licenseConfig` 版权协议 |
| `fab.yaml` | `fabConfig` 浮动操作按钮 | `image-bloom.yaml` | `imageBloomConfig` 图片光晕特效 |
| `footer.yaml` | `footerConfig` 页脚基本信息 | `expressive-code.yaml` | `expressiveCodeConfig` 代码高亮设置 |
| `llms.yaml` | `llmsConfig` 大模型索引与全文输出 | `umami.yaml` | `umamiConfig` Umami 网站统计 |

各配置领域的可用字段、默认值与逐项注释均以代码仓中的 `src/config/<domain>Config.ts` 为准。系统同样支持 `.yml` 后缀；空文件与纯注释文件视作不覆盖。

`config/umami.yaml` 的 `websiteId` 与 `scriptUrl` 是可选的成对字段。省略两者时，`enable` 与 `shareUrl` 仍会启用公开统计读取；只有需要向 Umami 上报访问时才同时填写两者，单独填写任一字段不会加载采集脚本。

`config/comment.yaml` 通过 `provider` 在 Twikoo 与 Giscus 之间二选一。选择 Giscus（基于 GitHub Discussions）时需同时填写 `giscus.repo`、`giscus.repoId` 与 `giscus.categoryId` 三个必填字段（从 giscus.app 配置生成器获取）；任一必填缺失时 `resolveCommentOptions()` 返回 `null`，评论区静默关闭、零额外负担。`giscus.theme` 是明暗双值对象，可以只覆盖 `dark` 一侧，另一侧沿用主题默认值（嵌套对象递归合并）。

### 自定义页脚注入 (`config/footer.html`)

`config/footer.html` 是唯一的非 YAML 入口，用于注入自定义页脚 HTML 代码（如备案号、统计脚本等）。
- 同步时会原样拷贝至 `src/config/FooterConfig.html`；
- 需要同时在 `footer.yaml` 中配置 `enable: true` 才会真正渲染注入。

### 大模型与 AI 索引配置 (`config/llms.yaml`)

`config/llms.yaml` 用于自定义全站大模型索引文件 `/llms.txt` 与 `/llms-full.txt` 的生成规则：

```yaml
# config/llms.yaml
siteSummary: 一个关注 Web 与设计系统的中文技术博客
generateFull: true
descriptionMaxLength: 200
excludeTags:            # 列表整体替换：包含任一标签的文章不被收录到大模型产物中
  - secret
  - private
  - 日记
corePages:              # 整体替换默认的核心推荐页面列表
  - title: 首页
    url: /
    description: 最新文章流入口
  - title: 关于
    url: /about/
    description: 作者资料与技术栈
customSections:
  - title: Open Source
    description: 作者维护的开源项目
    items:
      - title: Shirone
        url: https://github.com/LyraVoid/Shirone
        description: Astro 的 M3E 博客主题
```

`siteSummary` 留空时会依次回退至副标题、个人简介或主标题。在此处写下的中文文本会自动纳入字形收集器，确保在抽取中文字体子集时不会发生缺字。

---

## 智能配置纠错与类型安全检查

在日常编辑 YAML 配置文件时，难免会遇到字段拼错、类型填错或手滑的情况。为防止错误配置导致网页渲染异常或线上构建崩溃，Shirone 提供了严格的**自动拼写与语法体检机制**。

### 1. 拼写错误与智能提示

当配置项存在拼写错误、非法类型或超出可选范围的值时，同步命令会立即拦截并给出明确的修改建议：

```text
[content] Content repository configuration failed type checking:
  config/profile.yaml's bioo: Object literal may only specify known properties,
    but 'bioo' does not exist in type '{ avatar?: ...; name?: ...; bio?: ... }'.
    Did you mean to write 'bio'?
  config/post-list.yaml's layout.mode: Type '"gird"' is not assignable to type 'PostListMode'.
  (Full context in generated src/user/user-config.ts)
```

系统会精准定位到是哪个文件、哪个字段写错了，并贴心提供 `Did you mean ...?` 的纠错建议。

### 2. 常见手滑与格式防呆

系统在解析阶段还会主动识别并拦截以下常见疏漏：
- **只写了键名未填内容**：例如写了 `title:` 但未填写标题文本（YAML 会解析为空值可能导致标题被意外清空），系统会提示显式填写 `""` 或相应默认值；
- **配置文件名拼写错误**：例如误将文件名保存为 `config/sidbar.yaml`，系统会提示 `Did you mean sidebar.yaml?` 并列出所有合法的配置文件名；
- **文件名冲突**：同一个配置领域同时存在了 `.yaml` 与 `.yml` 两份文件；
- **循环引用**：YAML 语法锚点造成的递归死循环。

---

## 导航栏配置规则 (`config/nav-bar.yaml`)

顶部导航栏驱动全站桌面端顶栏菜单与移动端导航抽屉。由于导航项需要引用系统预设并进行多语言国际化转换，因此采用**声明式列表**的形式进行配置，**整体替换**默认导航（列表内的条目与顺序完全由你决定）。

### 1. 三种核心配置写法

在 `config/nav-bar.yaml` 中，每个导航链接支持以下三种写法：

- **写法一：直接引用内置预设（最常用）**  
  只需声明 `preset: 预设名`，系统会自动绑定对应的标准路由、多语言名称和官方图标：
  ```yaml
  - preset: Home       # 首页
  - preset: Archive    # 归档
  - preset: Moments    # 动态说说
  ```
- **写法二：基于预设进行局部属性覆盖**  
  在保留预设多语言与图标的同时，覆盖特定属性（例如修改 GitHub 开源仓库地址）：
  ```yaml
  - preset: GitHub
    url: https://github.com/your-username/your-repo
  ```
- **写法三：完全自定义独立菜单项与二级下拉菜单**  
  自由定义名称、路径与图标（支持 Material Symbols 或 Iconify 图标库），并可通过 `children` 创建二级子菜单（子菜单递归支持以上所有写法）：
  ```yaml
  - name: 留言板
    url: /guestbook/
    icon: material-symbols:chat-outline-rounded
  - name: $t:more             # $t: 前缀自动引用内置多语言词条
    icon: material-symbols:apps-rounded
    children:                 # 二级下拉菜单
      - preset: Timeline
      - preset: Projects
      - preset: Skills
      - preset: About
  ```

### 2. 完整导航预设清单速查表

主题内置了 15 个开箱即用的页面预设（定义于 `src/config/navBarConfig.ts`）：

| 预设名称 (`preset`) | 目标路由 | 对应功能与页面 |
| --- | --- | --- |
| `Home` | `/` | 博客首页文章列表 |
| `Archive` | `/archive/` | 文章时间归档 |
| `Friends` | `/friends/` | 友情链接与博友圈 |
| `Moments` | `/moments/` | 动态与说说广场 |
| `Anime` | `/anime/` | 番剧与追番列表 |
| `Compass` | `/compass/` | 常用网址与罗盘导航 |
| `Skills` | `/skills/` | 个人专业技能清单 |
| `Projects` | `/projects/` | 开源项目与作品集 |
| `Devices` | `/devices/` | 我的数字设备与装备 |
| `Timeline` | `/timeline/` | 个人经历与大事件时间轴 |
| `Albums` | `/albums/` | 摄影相册与图库 |
| `Categories` | `/categories/` | 文章分类聚合独立页 |
| `Tags` | `/tags/` | 标签聚合独立页 |
| `About` | `/about/` | 关于博主与站点 |
| `GitHub` | `https://github.com/...` | GitHub 外部项目外链 |

> **提示**：若预设名称拼写错误（如误写为 `preset: Archives`）或多语言词条不存在，系统在编译构建时会直接报错并列出所有可用预设，便于快速核对。

### 3. 已关闭的功能会自动从导航中消失

导航栏是**整体替换**的，因此它不会跟随各功能自己的 `enable` 开关自动增删；但指向已关闭功能页面的入口会在解析期被统一裁掉，不会留下点进去跳 `/404/` 的死链：

- 判定对象是**站内路由**（去尾斜杠、忽略查询串与哈希），因此 `preset: Moments`、`url: /moments/`、`url: /moments?sort=recent` 三种写法一视同仁；
- 裁剪对 `children` 递归生效；只作下拉容器（自身无 `url`）的分组若子项被全部裁掉，该分组也会一并隐藏，不会留下点不开的空下拉；
- 站外链接（`https://...`）、锚点（`#top`）与始终存在的页面（`/`、`/archive/`、`/categories/`、`/tags/`）不受影响。

也就是说：`config/moments.yaml` 里写 `enable: false` 之后，`config/nav-bar.yaml` 中所有指向 `/moments/` 的条目都无需删除即可自动隐身；重新开启时会照常出现（对应路由表见 `src/config/navBarConfig.ts`，实现见 `pruneUnavailableNavLinks()`）。

---

## 自动生成物说明 (`src/user/user-config.ts`)

`src/user/user-config.ts` 是连接外部内容仓与博客代码引擎的**自动化桥接文件**。在执行同步时，系统会自动将所有 YAML 配置编译并提取为该 TypeScript 模块。

### 注意事项与保障机制

1. **请勿手动修改该文件**  
   所有配置项均应在外部内容仓的 YAML 文件中维护。手动编辑该文件会在下一次执行 `content:sync` 时被自动生成的最新内容直接覆盖；
2. **全自动图标扫描与打包**  
   你在 YAML 配置中声明的所有图标（如社交链接、自定义导航项图标），构建系统会自动扫描此文件并完成离线图标的打包与内嵌，无需手动注册图标组件；
3. **中文字体子集抽取保障**  
   你在配置文件中填写的各类中文文本（站点标题、副标题、全站公告、个人简介等），中文字体子集抽取工具会自动提取其中的汉字字形，确保打包出的轻量中文字体完整不缺字；
4. **单仓模式零污染**  
   在默认的单仓模式下，该文件保持为空覆盖且与仓库追踪状态完全一致，日常开发或构建不会在 Git 工作区产生任何未提交的脏文件。
