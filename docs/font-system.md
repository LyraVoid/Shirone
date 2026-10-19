# 全站字体使用与配置指南

Shirone 提供了一套全自动、类型安全且高性能的自托管字体系统。修改字体**无需改动任何 CSS、布局或组件**，只需要编辑单一配置文件：`src/config/fontConfig.ts`。本地 TTF/OTF 可以作为构建期子集化输入，但生产站点只允许交付优化后的 WOFF2。

---

## 快速导航

- [一、四大字体角色说明](#四大字体角色说明)
- [二、常见使用场景与示例](#常见使用场景与示例)
  - [场景 1：完全使用系统默认字体（零打包，最省流量）](#场景-1完全使用系统默认字体零打包最省流量)
  - [场景 2：更换中文字体（使用本地 .woff2 文件）](#场景-2更换中文字体使用本地-woff2-文件)
  - [场景 3：更换正文英文字体（使用本地 .woff2 文件）](#场景-3更换正文英文字体使用本地-woff2-文件)
  - [场景 4：使用 npm 的 Fontsource 字体包](#场景-4使用-npm-的-fontsource-字体包)
  - [场景 5：更换代码等宽字体](#场景-5更换代码等宽字体)
  - [场景 6：为代码中的 CJK 指定补充字体](#场景-6为代码中的-cjk-指定补充字体可选)
- [三、字段配置完全手册](#三字段配置完全手册)
- [四、修改后验证流程](#四修改后验证流程)
- [五、常见问题排查](#五常见问题排查)

---

## 一、四大字体角色说明

为了兼顾西文排版、中日韩（CJK）文字显示和代码可读性，系统将全站字体划分为 4 种独立角色：

| 角色 (`role`) | 对应 CSS 变量 | 职责与覆盖范围 | 推荐策略 |
|---|---|---|---|
| `body` | `--font-body` | 英文字母、阿拉伯数字、拉丁西文基础正文 | 推荐选用西文字形优美、中等字重的字体 |
| `cjk` | `--font-cjk` | 汉字、日文平假名/片假名、韩文等 CJK 字符 | 推荐选用字符集全、缺字率低的本地 `.woff2` 字体 |
| `mono` | `--font-mono` | 文章代码块、行内代码、终端界面、数据图表 | 推荐选用可变字重、对齐良好的等宽字体 |
| `mono-cjk` | `--font-mono-cjk` | 代码/终端中的 CJK 字符（可选补充） | `mono` 不含汉字时使用；推荐本地 CJK 等宽字体 |

> 💡 **字体级联机制**：西文字体排在前面，中日文字体排在第二位。当遇到英文字符时，优先使用 `body` 字体渲染；当遇到汉字或假名时，因为西文字体无对应字形，浏览器会自动无缝回退到 `cjk` 字体显示。
>
> 代码字体采用同样的顺序：配置 `mono-cjk` 后，栈为 `mono → mono-cjk（含其自身 fallback）→ 系统等宽`；拉丁字符先命中 `mono`，CJK 字符在 `mono` 缺字时才落到 `mono-cjk`。

---

## 二、常见使用场景与示例

打开配置文件：`src/config/fontConfig.ts`。

### 场景 1：完全使用系统默认字体（零打包，最省流量）

如果你不需要加载任何自定义字体，想直接使用访客设备自带的系统字体（如 macOS 的苹方 / San Francisco、Windows 的微软雅黑 / Segoe UI、Android 的 Roboto）：

```ts
export const fontConfig: FontConfig = {
    // 切换为纯系统字体模式
    mode: "system",
    // 留空即可，系统不会打包或加载任何字体文件
    fontFamilies: [],
    subsetting: {
        enable: false,
        includeContent: false,
        includeI18n: false,
        includeConfig: true,
        includeCommon: true,
        // 默认 true：构建期允许抓取 Meting 云端歌单的曲目文本，
        // 使歌名里的汉字进入字体子集，避免前台缺字。
        // 网络访问的取舍见 docs/performance-guidelines.md。
        allowRemoteText: true,
    },
    budget: {
        maxTotalBytes: 8 * 1024 * 1024,
        maxFamilyBytes: 5 * 1024 * 1024,
    },
};
```

---

### 场景 2：更换中文字体（使用本地 .woff2 文件）

1. 准备你的中文字体 `.woff2` 格式文件（例如 `MiSans-Normal.woff2`），放入 `src/assets/fonts/` 目录；
2. 在 `fontFamilies` 中找到 `role: "cjk"` 的配置项进行替换：

```ts
{
    id: "misans-cjk",
    family: "MiSans",
    role: "cjk",
    source: "local",
    variants: [
        {
            file: "src/assets/fonts/MiSans-Normal.woff2",
            weight: 400,
            style: "normal",
        },
    ],
    fallback: ["system-ui", "sans-serif"],
    display: "swap",
    preload: false,
}
```

---

### 场景 3：更换正文英文字体（使用本地 .woff2 文件）

1. 将西文字体（例如 `Inter-Regular.woff2`、`Inter-Bold.woff2`）放入 `src/assets/fonts/`；
2. 修改 `role: "body"` 的配置：

```ts
{
    id: "inter-body",
    family: "Inter",
    role: "body",
    source: "local",
    variants: [
        {
            file: "src/assets/fonts/Inter-Regular.woff2",
            weight: 400,
            style: "normal",
        },
        {
            file: "src/assets/fonts/Inter-Bold.woff2",
            weight: 700,
            style: "normal",
        },
    ],
    fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
    display: "swap",
    preload: false,
}
```

---

### 场景 4：使用 npm 的 Fontsource 字体包

Fontsource 提供了大量开源西文字体，无需手动下载 `.woff2` 文件。

1. 在终端安装字体包，例如安装 Lato：
   ```powershell
   pnpm.cmd add @fontsource/lato
   ```
2. 将 `source` 设为 `"fontsource"`：
```ts
{
    id: "lato-body",
    family: "Lato",
    role: "body",
    source: "fontsource",
    variants: [
        { file: "@fontsource/lato/400.css", weight: 400, style: "normal" },
        { file: "@fontsource/lato/700.css", weight: 700, style: "normal" },
    ],
    fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
    display: "swap",
    preload: false,
}
```

---

### 场景 5：更换代码等宽字体

如果你想使用 Fira Code 或其他等宽字体：

1. 安装字体包（或将 `.woff2` 放入 `src/assets/fonts/`）：
   ```powershell
   pnpm.cmd add @fontsource/fira-code
   ```
2. 修改 `role: "mono"`：
```ts
{
    id: "fira-code-mono",
    family: "Fira Code",
    role: "mono",
    source: "fontsource",
    variants: [
        { file: "@fontsource/fira-code/400.css", weight: 400, style: "normal" },
        { file: "@fontsource/fira-code/600.css", weight: 600, style: "normal" },
    ],
    fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
    display: "swap",
    preload: false,
}
```

### 场景 6：为代码中的 CJK 指定补充字体（可选）

如果 `mono` 字体不含汉字（多数西文等宽字体都是如此），可以额外声明 `mono-cjk`：

1. 把 CJK 等宽字体放入 `src/assets/fonts/`（或使用 Fontsource 包）；
2. 在 `fontFamilies` 中新增一条：

```ts
{
    id: "mono-cjk",
    family: "Mono CJK",
    role: "mono-cjk",
    source: "local",
    variants: [
        { file: "src/assets/fonts/MonoCjk.woff2", weight: 400, style: "normal" },
    ],
    fallback: ["system-ui", "sans-serif"],
    display: "swap",
    preload: false,
}
```

配置后，代码字体栈变为：

```text
mono → mono-cjk（含其自身 fallback）→ 系统等宽
```

- 拉丁字符优先命中 `mono`，`mono-cjk` 的拉丁字形不会抢走英文；
- `mono-cjk` 只在 `mono` 没有对应字形时接管；
- 未配置 `mono-cjk` 时，输出与只有 `mono` 时完全一致；
- CJK 字体的汉字宽度通常是 1em，而等宽字体的 advance 可能是 0.5em、0.55em 或 0.6em，因此**不保证**「1 个汉字 = 2 个 ASCII 列」；对齐效果取决于两个字体各自的 advance；
- 配置后 `mono` 的 Astro 声明会改用内部变量 `--font-mono-base`，主题再组合出公开的 `--font-mono` 完整栈；用户配置不需要关心这个变量，未配置的站点也不受影响。

---

## 三、字段配置完全手册

| 字段 | 类型 | 说明与规范 |
|---|---|---|
| `id` | `string` | 该项配置的唯一 ID（英文连字符命名，如 `"my-font-body"`） |
| `family` | `string` | 字体的标准 CSS 名称（如 `"ZenMaruGothic-Medium"`、`"Inter"`、`"JetBrains Mono"`） |
| `role` | `"body" \| "cjk" \| "mono" \| "mono-cjk"` | 字体角色（**不可重复**，每个角色最多声明一个） |
| `source` | `"local" \| "fontsource"` | 字体来源：`"local"`（本地文件）或 `"fontsource"`（npm 包） |
| `variants` | `Array` | 字体变体列表，包含具体的 `file` 路径、`weight` 字重、`style` 风格 |
| `fallback` | `string[]` | 兜底回退字体栈，最后必须以通用系统字体（如 `sans-serif` 或 `monospace`）结尾 |
| `display` | `"swap" \| "optional" \| "block"` | 字体加载显示策略，推荐默认使用 `"swap"` |
| `preload` | `boolean` | 是否在 `<head>` 中生成 `<link rel="preload">` 预加载关键字体（默认 `false`） |
| `budget` | `object` | 打包体积检查预算，防止误引入十几兆超大字体导致博客首屏缓慢 |

---

## 四、修改后验证流程

每次修改字体配置或添加本地字体后，请依次运行以下验证命令：

```powershell
# 1. 检查语法与配置类型（应报告 0 errors）
npx.cmd astro check

# 2. 执行静态编译与字体打包
pnpm.cmd build

# 3. 校验生产产物中的字体格式与体积预算
pnpm.cmd fonts:check
```

---

## 六、自动化字体子集化与 Meting 歌单文字处理

为了解决中文字体动辄 10MB~20MB 的首屏体积问题，系统内置了**自动化构建期子集化裁剪管道**：

### 1. Dev（开发）与 Build（构建）双模工作流
- **`pnpm.cmd dev` 开发环境**：自动直连原始全量字体文件。在写文章时，输入的任何生僻汉字与假名都立即实时渲染，**零等待、极速 HMR**。
- **`pnpm.cmd build` 生产构建**：自动触发字体子集化，将全站文字提取并生成专属 `.subset.woff2`。原始 TTF/OTF 只作为构建输入，不得复制到 `dist/` 或被生产 CSS 引用。

### 2. 涵盖所有音乐模式的文字采集
文字采集器（`scripts/fonts/text-collector.mjs`）能自动识别 `musicConfig.provider`：
- **`local` 本地模式**：自动扫描 `src/data/music.ts` 中所有的曲目名与艺术家；
- **`custom` 自定义列表**：扫描 `musicConfig.tracks` 中的所有曲目文字；
- **`meting` / `mixed` 云端歌单与混合模式**：自动请求 Meting 远端歌单接口，将远端歌单中的所有歌曲标题、歌手与专辑文字一并纳入子集提取池中，**彻底杜绝远端歌单歌名缺字**！

### 3. 单独执行子集化命令
```powershell
pnpm.cmd fonts:subset
```

子集化由项目依赖中的 HarfBuzz WebAssembly 实现，安装 pnpm 依赖后即可运行；构建机不需要额外安装 Python 或 `fontTools`。

### 4. 生产字体门禁

`pnpm.cmd build` 在构建结束后自动运行 `pnpm.cmd fonts:check`。检查器会同时验证：

- 生产 HTML/CSS 不引用远程字体 URL；
- 生产 HTML/CSS 不引用原始 `.ttf` / `.otf`；
- `dist/` 中不存在被意外复制的原始 `.ttf` / `.otf`（KaTeX 自带字体除外）；
- 所有实际引用的自定义字体满足 `fontConfig.budget` 的单字体族和总量预算。

因此不能只看网络面板中的一个字体文件，也不能仅检查 CSS。字体优化验收必须以完整生产构建和 `fonts:check` 结果为准。

1. **为什么我的中文字体遇到某些字时会变回默认字体？**
   - 说明所选中文字体的汉字库不全（例如部分艺术字体仅包含简体常用 3500 字，缺少繁体字或日本汉字）。
   - 建议选用 GBK 全字符集或包含超全 CJK 字符的字体（如开源的思源黑体、霞鹜文楷、萝莉体等）。
2. **为什么博客里的日文歌名或假名乱码/断层？**
   - 很多国内制作的艺术中文字体**完全没有绘制日文平假名与片假名**。
   - 如果你的博客包含日文歌曲或番剧页面，请务必确认字体包含 Hiragana (U+3040-U+309F) 与 Katakana (U+30A0-U+30FF) 字形。
3. **本地字体可以使用 `.ttf` 或 `.otf` 吗？**
   - 可以作为 `subsetting.enable: true` 时的构建输入，但必须放在 `src/assets/fonts/`，并由生产构建转换为 `.subset.woff2`。如果关闭子集化，建议直接提供优化后的 `.woff2`；无论配置如何，生产 `dist/` 都不允许包含或引用原始 `.ttf` / `.otf`。
4. **修改后页面字体没有刷新？**
   - 运行 `pnpm.cmd build` 重新编译，或在开发模式下刷新浏览器缓存（Ctrl + F5）。
