<div align="center">

<img src="./public/logo/icon.webp" width="88" height="88" alt="Shirone 圖示" />

# Shirone

**一款以 Material 3 Expressive 為基礎、富有表現力的二次元部落格主題。**

為長文寫作、個人收藏，以及讓網站真正屬於你的細節而生的安靜閱讀空間。

[線上預覽](https://shirone.mysqil.com/) · [專案文件](https://docs.shirone.mysqil.com/) · [回報問題](https://github.com/LyraVoid/Shirone/issues)

[English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [日本語](./README.ja.md)

![Node.js >= 22.12](https://img.shields.io/badge/Node.js-%3E%3D22.12-5FA04E?logo=nodedotjs&logoColor=white)
![pnpm 9](https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm&logoColor=white)
![Astro 7](https://img.shields.io/badge/Astro-7-BC52EE?logo=astro&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg)](./LICENSE)

</div>

> [!IMPORTANT]
> **請先閱讀[線上文件](https://docs.shirone.mysqil.com/)。** 主題設定、內容工作流程與部署說明均以此為主要入口。

## 從這裡開始

[線上文件](https://docs.shirone.mysqil.com/)是設定主題、管理內容和部署網站的主要入口。本儲存庫包含主題原始碼；如果希望將個人內容獨立管理，請使用 [Shirone-Content](https://github.com/LyraVoid/Shirone-Content)。

## 實測表現

目前參考跑分中，Performance、Accessibility、Best Practices 和 SEO 均為 100，Agentic browsing 三項檢查全部通過。詳細效能指標在本次測試中同樣達到 100；實際結果會因託管環境、內容和網路條件而變化。

![Shirone 效能跑分](./Benchmark.webp)

![Shirone 首頁](./public/assets/projects/shirone.webp)

<table>
  <tr>
    <td align="center"><strong>色彩魔法</strong><br><sub>隨光線、心情與選擇變化的 HCT 動態配色。</sub></td>
    <td align="center"><strong>流暢旅程</strong><br><sub>Swup 讓頁面輕盈切換，也讓周圍的世界保持鮮活。</sub></td>
  </tr>
  <tr>
    <td align="center"><strong>故事魔導書</strong><br><sub>以同一套寫作流程容納 Markdown、MDX、公式、圖表、程式碼與圖片。</sub></td>
    <td align="center"><strong>安靜守護</strong><br><sub>SSR 優先、無障礙友善，可選功能停用時真正不留負擔。</sub></td>
  </tr>
</table>

## ✦ 寫給每個故事的小小咒語

Shirone 是一款使用 Astro 7、Svelte 5、Tailwind CSS 4 與 Stylus 建構的靜態個人部落格主題。這裡的魔法不是堆疊華麗特效，而是藏在會隨光線與心情變化的色彩裡，藏在不打斷氛圍的翻頁之間，也藏在讓個人小天地慢慢鮮活起來的細節中。

柔軟的外表之下，是一套由設計令牌驅動的 Material 3 Expressive 元件系統。內容優先由伺服器端渲染輸出，Swup 則提供流暢的站內導覽，並讓頁面切換時的外圍應用框架持續運作。

除了長篇文章，Shirone 也適合展示動態、相簿、追番、友站、專案、技能與時間軸等個人內容。

## ✦ 魔導書裡的能力

- 基於 HCT 的動態配色，支援 Material 3 與 Material 3 Expressive 規範
- 明暗主題、橫幅與純色背景、可選紋理以及訪客顯示偏好
- 響應式版面，可設定單側欄或雙側欄
- 基於 Swup 的無重新整理導覽、持久化外圍框架、路由進度與減少動態效果支援
- 支援 Markdown 與 MDX，以及數學公式、Mermaid、提示區塊、增強程式碼區塊和圖片藝廊
- Pagefind 全文搜尋、RSS 與 Sitemap
- 文章目錄、延伸閱讀、分享、加密與可選留言
- 彙整、分類、標籤、友站、動態、番劇、相簿、專案、技能和時間軸等獨立頁面
- 內建 10 種介面語言
- SSR 優先、鍵盤友善，並配有無障礙測試
- 可選整合遵循「零額外負擔」原則：停用時不產生外部請求、DOM、版面位移或主套件程式碼

## 快速開始

### 環境需求

- [Node.js](https://nodejs.org/) 22.12 或更新版本
- [pnpm](https://pnpm.io/) 9.x（儲存庫鎖定為 `pnpm@9.14.4`）

### 在本機執行

```bash
git clone https://github.com/LyraVoid/Shirone.git
cd Shirone
corepack enable
pnpm install
pnpm dev
```

在瀏覽器中開啟 `http://localhost:4321`。

若 Windows PowerShell 的指令碼執行原則阻止命令執行，請改用 `pnpm.cmd` 與 `npx.cmd`。

### 使用 npm 套件

不想複製主題儲存庫？可以將 Shirone 安裝為 `shirones` npm 套件，在空資料夾中初始化部落格——無需 Astro 起始範本，也無需手動安裝依賴：

```bash
mkdir my-blog
cd my-blog
npx shirones init   # 寫入 package.json，安裝 astro、主題及其 peer 依賴
pnpm dev
```

`init` 會建立 `astro.config.mjs`、`shirones/` 下的型別化設定、範例內容與靜態資源；你依然可以透過 `src/components/` 與 `src/layouts/` 覆寫主題元件。隨時重新執行 `npx shirones init` 可檢查漂移（不會覆寫你的檔案），傳入 `--force` 可還原範本檔案。詳見 [npm 套件模式](./docs/npm-package-mode.md) 與 [shirones 儲存庫](https://github.com/yCENzh/shirones)。

### 自訂網站

1. 在 `src/config/siteConfig.ts` 設定正式網址、標題、語言、主題、橫幅與顯示選項。
2. 在 `src/config/profileConfig.ts` 和 `src/config/navBarConfig.ts` 更新個人資料與導覽。
3. 檢查 `src/config/` 中各項功能的設定檔；檔案內的註解說明了預設值與支援選項。
4. 替換 `src/content/`、`src/data/` 與 `public/` 中的範例文章、個人資料和媒體資源。
5. 使用 `pnpm new-post <filename>` 建立文章，再到 `src/content/posts/` 編輯。

完整設定契約請參閱 [`src/config/README.md`](./src/config/README.md)。

## 官方配套儲存庫

Shirone 將主題原始碼、個人網站內容與 npm 發布職責分離；下列官方儲存庫分別服務不同工作流程：

| 儲存庫 | 適用情境 | 包含內容 |
| --- | --- | --- |
| [Shirone-Content](https://github.com/LyraVoid/Shirone-Content) | 使用外部內容來源的雙儲存庫網誌 | 文章、動態、資料、媒體與 `config/*.yaml` 覆寫的內容範本。請 Fork 或複製到自己的儲存庫（通常設為私有），再讓本主題儲存庫指向它。參閱[內容分離指南](./docs/content-separation/README.md)。 |
| [shirones](https://github.com/yCENzh/shirones) | 維護與發布 `shirones` npm 套件 | 手動建置與發布流程。它在建置時拉取本儲存庫，並刻意不保存主題原始碼；一般網誌使用者應安裝 `shirones`，不需要直接使用此儲存庫。參閱 [npm 套件模式](./docs/npm-package-mode.md)。 |

## 核心設定

| 檔案 | 用途 |
| --- | --- |
| `src/config/siteConfig.ts` | 網站網址、識別、語言、動態配色、橫幅、紋理、目錄與顯示設定 |
| `src/config/profileConfig.ts` | 作者資料與社群連結 |
| `src/config/navBarConfig.ts` | 主導覽 |
| `src/config/sidebarConfig.ts` | 側欄版面、小工具與頁面篩選 |
| `src/config/postListConfig.ts` | 分頁與列表/網格呈現 |
| `src/config/articleConfig.ts` | 更新提示、延伸閱讀與文章分享 |
| `src/config/commentConfig.ts` | 可選留言服務 |
| `src/config/musicConfig.ts` | 可選的本機、自訂、Meting 或混合音樂來源 |
| `src/config/animeConfig.ts` | 番劇頁與本機/Bangumi/Bilibili 快照資料來源 |

## 撰寫文章

文章放在 `src/content/posts/` 中，支援 Markdown 與 MDX。最小 Frontmatter 範例：

```yaml
---
title: 我的第一篇文章
published: 2026-08-26
description: 顯示於文章列表與中繼資料中的簡短摘要。
image: ./cover.webp
tags: [Astro, 隨筆]
category: 寫作
draft: false
---
```

常用的選填欄位包括 `updated`、`pinned`、`comment`、`lang`、`encrypted`、`password`、`passwordHint` 與 `hideHomeContent`。圖片可使用遠端 URL、從 `public/` 開始的絕對路徑，或相對於文章檔案的路徑。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 啟動開發伺服器 |
| `pnpm new-post <filename>` | 建立新文章 |
| `pnpm format` | 執行 Biome 格式化程式碼（提交前必跑） |
| `pnpm check` | 執行 Astro 診斷 |
| `pnpm type-check` | 執行 TypeScript 檢查 |
| `pnpm check:manifest` | 驗證元件清單 |
| `pnpm test` | 執行 Playwright 測試 |
| `pnpm build` | 將網站與 Pagefind 索引建置到 `dist/` |
| `pnpm preview` | 預覽正式環境建置 |
| `pnpm lighthouse` | 執行桌面版正式環境稽核 |

## 部署

Shirone 會產生靜態的 `dist/` 目錄，可部署至 Vercel、Netlify、GitHub Pages 或任何靜態託管服務。

部署前，請更新 `src/config/siteConfig.ts` 中的 `site` 與 `base`，然後執行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm type-check
pnpm check:manifest
pnpm build
```

託管平台的建置命令填寫 `pnpm build`，輸出目錄填寫 `dist`。更多說明請參閱 [`INDEX.md`](./INDEX.md)。

## 專案文件

- [`src/config/README.md`](./src/config/README.md) - 設定參考
- [`docs/m3e-standard.md`](./docs/m3e-standard.md) - 設計令牌與元件標準
- [`docs/atomic-structure.md`](./docs/atomic-structure.md) - 元件分層與相依規則
- [`docs/markdown-extensions.md`](./docs/markdown-extensions.md) - Markdown 外掛、樣式、快取與測試契約
- [`docs/sidebar-system.md`](./docs/sidebar-system.md) - 側欄編排與 Swup 同步
- [`docs/on-demand-loading.md`](./docs/on-demand-loading.md) - 可選功能的零額外負擔實作
- [`docs/font-system.md`](./docs/font-system.md) - 字型設定與正式環境子集化

## 參與貢獻

歡迎提交 Issue 與 Pull Request。若準備開發大型功能或視覺改動，請先建立 Issue 或 Discussion。提交程式碼前請閱讀 [`CONTRIBUTING.md`](./CONTRIBUTING.md) 與儲存庫規則，提交前務必執行 `pnpm format` 格式化程式碼，讓每個 Pull Request 聚焦於單一明確主題，並使用 Conventional Commits。

## 致謝

Shirone 最初由 [saicaca](https://github.com/saicaca) 的 [Fuwari](https://github.com/saicaca/fuwari) 重構而來。現今的 M3E 設計系統、元件架構、頁面模組與編排機制皆以 Shirone 的名義持續開發。感謝 Fuwari 專案及其貢獻者提供最初的基礎。

## 同行者

每一次貢獻，都在 Shirone 的魔導書裡寫下新的一行。感謝所有陪伴這個小世界成長的人。

<div align="center">
  <a href="https://github.com/LyraVoid/Shirone/graphs/contributors">
    <img src="https://contrib.rocks/image?repo=LyraVoid/Shirone" alt="Shirone 貢獻者" />
  </a>
</div>

## 星光軌跡

<div align="center">
  <a href="https://star-history.com/#LyraVoid/Shirone&amp;Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date&amp;theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
      <img alt="Shirone Star History 趨勢圖" src="https://api.star-history.com/svg?repos=LyraVoid/Shirone&amp;type=Date" />
    </picture>
  </a>
  <p><sub>每一顆 Star，都是讓 Shirone 向更遠處發光的一點星屑。</sub></p>
</div>

## 授權條款

Shirone 以 [MIT License](./LICENSE) 開源。儲存庫保留了該授權條款要求的原始版權聲明。
