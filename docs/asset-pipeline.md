# 本地资产与响应式媒体流水线

> 本文约定图片、图标和其他生成资产从源码到生产产物的目录边界、生成方式与验收方法。
> 性能原则见 `docs/performance-guidelines.md`，字体另见 `docs/font-system.md`。

---

## 1. 目录职责

| 目录 | 职责 | Git 策略 | 页面是否直接引用 |
| --- | --- | --- | --- |
| `src/assets/` | 受 Astro/Vite 管理的原始资产，如 banner、头像、文章封面和本地音乐封面 | 提交原始文件 | 通过 import、`resolveImageAsset()` 或 `astro:assets` 引用 |
| `public/images/` | 必须保留稳定公开 URL 的原始内容，如动态原图 | 提交原始文件 | 可以直接引用 `/images/...` |
| `public/assets/<domain>/` | 可重复生成的派生文件，如动态响应式缩略图 | 忽略生成文件，只提交 `.gitkeep` | 可以引用稳定的派生 URL |
| `src/generated/` | 构建前生成、参与编译的源码数据，如本地图标集合 | 按具体生成器约定提交 | 只能由代码导入，不能作为公开 URL |
| `.astro/`、`dist/`、`artifacts/` | 框架缓存、最终构建产物和本地审计报告 | 全部忽略 | 禁止写入配置或内容数据 |

生成文件必须满足以下约束：

1. 输出目录按业务域归档，不能写到仓库根目录、原图目录或名称含糊的临时目录。
2. 生成器必须可重复执行，跳过仍然有效的产物，并删除已无对应源文件的过期产物。
3. `.gitignore` 忽略目录内的生成文件，同时用 `.gitkeep` 保留空目录。不要依赖开发者手工清理。
4. `dev` 与 `build` 必须在消费产物前运行生成器；单独排障时再使用显式生成命令。

当前命令：

图标集合与说说缩略图都已改为自动生成，不再需要手动命令：

- 图标集合在 `astro:config:setup` 重算（`dev` / `build` / `sync` 都覆盖），dev 期间新增图标还会触发 HMR 重算。
- 缩略图在 `buildStart` 重算（`dev` / `build` 覆盖），dev 期间新增图片也会触发 HMR 重算。

---

## 2. Astro 图片来源与 Sharp

Astro 图片优化有两类输入，不能混为一谈：

- `src/assets/` 中的本地图片应先解析为 `ImageMetadata`，再交给 `getImage()` 或 Astro `<Image>`；项目统一使用 `resolveImageAsset()` 兼容配置中的相对路径。
- `public/` 中的文件是公开 URL。它们不会自动变成 `ImageMetadata`；需要多尺寸版本时，使用项目生成器写入 `public/assets/<domain>/`。

开发环境中，Astro 可能生成形如 `/_image/?href=/@fs/C:/...` 的内部地址。这只是开发期图片服务协议：

- 不要把 `/_image/`、`/@fs/` 或绝对磁盘路径写入配置、内容或测试快照；
- `MissingSharp` 表示本机无法解析图片服务依赖，不表示图片源路径错误；
- 本项目把 `sharp` 作为直接依赖，因为 Astro 图片服务和动态缩略图生成器都需要它；安装后应重启 dev server；
- 生产验收以 `pnpm.cmd build` 后的 preview 为准，不能根据 dev 内部 URL 推断最终 CDN/静态文件地址。

若本地图片没有进入 Astro 管线，先检查配置路径能否被 `src/utils/asset-utils.ts` 的显式图片 glob 命中。不要扩大 glob 到整个仓库来掩盖路径问题。

---

## 3. 响应式图片交付

### 3.1 通用规则

1. 为图片提供真实 `width`/`height` 或稳定的 `aspect-ratio`，先锁定布局再加载像素。
2. `srcset` 的候选宽度应覆盖组件实际显示范围；`sizes` 必须描述真实布局，而不是统一写 `100vw`。
3. 优先输出 AVIF/WebP，并保留一个浏览器可用的 fallback。
4. 生成时使用 `withoutEnlargement` 或等效逻辑，禁止把小图放大成虚假的高分辨率候选。
5. 只有实际 LCP 图片使用 eager/high priority；列表、侧栏和离屏媒体保持 lazy。
6. 测试应接受 dev 与 production 的不同资源 URL，断言格式、尺寸、候选集和请求行为，而不是固定内部哈希。

### 3.2 原图与缩略图分离

动态图片采用两段式资源契约：

- 卡片网格和缩略图条读取 `thumbnailSrc` / `thumbnailSrcset`；
- 查看器舞台和 Fancybox 始终读取原始 `src`。

这能降低列表流量，同时避免“优化”后灯箱只能看到低清图。新增动态原图后无需手动操作：生成器在每次构建时于 `public/assets/moments/thumbnails/` 创建 `192/384/640` 宽度的 WebP，并清理孤立文件。它按源图内容哈希判断新鲜度，因此未变更时是空操作。

### 3.3 本地音乐封面

本地封面必须放在 `src/assets/` 并通过 `resolveImageAsset()` 进入 Astro 管线。服务端生成 64/128 像素候选后，应把本地 `cover`、`coverSrcset` 和 `coverSizes` 一并传给客户端播放器。

远端 Meting 数据只能补全远端歌曲信息，不能覆盖配置中已有的本地封面。播放器或 Meting 脚本应在播放、展开歌单等明确意图后加载，初始页面不得请求第三方接口或封面。

---

## 4. 图标的 SSR 与离线边界

图标统一走 `atoms/display/Icon.svelte`，不按渲染生命周期分叉：

- 它在构建期从 `src/generated/local-icon-collections.ts`（摇树后的本地集合）输出内联服务端 SVG，无论页面有没有 hydration 岛，HTML 里都有成品图标。
- 裸名（无 `prefix:`）指向项目自己的 `src/icons/*.svg`，由该组件回退 `local:` 前缀，调用方无需关心。
- 禁止业务组件直接导入在线 Iconify 组件，避免首屏访问 Iconify API，也避免 SSR 阶段输出空图标。

`src/integration/vite/icon/collections.ts` 会扫描项目实际使用的图标名，从已安装的 `@iconify-json/*` 集合生成最小本地数据，产物写入 `src/generated/local-icon-collections.ts`。该文件在 `astro:config:setup` 自动重算，无需手动命令；但**图标名拼错不会自动修复**——生成器只在报错时跳过，Material Symbols 的错误名称不会因本地化而纠正。

图标回归至少应覆盖：

- 直接访问页面时 SSR SVG 可见；
- Svelte 水合后图标仍可见；
- Swup 客户端导航后图标仍存在；
- 首屏没有 `api.iconify.design` 等外部图标请求。

---

## 5. 按意图延迟加载

“组件在首屏可见”不等于“它依赖的完整功能必须立即加载”。搜索索引、远端歌单和播放器 SDK 应在用户表达意图后初始化：

- 搜索：点击搜索入口或聚焦搜索交互后再加载 Pagefind；
- 音乐：播放、展开歌单或其他明确操作后再加载 Meting；
- 可选功能关闭时继续满足 0 请求、0 DOM、0 bundle 的零额外负担约束。

延迟加载不能牺牲静态 UI：按钮、标签和本地封面仍应由 SSR 输出。Swup 持久外壳中的事件绑定必须可重复初始化并去重。

---

## 6. 验收清单

涉及本地资产或响应式媒体时，按风险运行：

```powershell
npx.cmd astro check
pnpm.cmd build
```

随后运行受影响的 Playwright 用例和 `tests/site/a11y.spec.ts`。浏览器检查应同时覆盖桌面与移动视口，并核对：

1. 图片和图标实际可见，不只检查 DOM 节点存在；
2. `srcset` 选择符合视口，没有把原始大图用于小缩略图；
3. 灯箱仍请求原图；本地音乐封面未被远端数据覆盖；
4. 初始请求中没有 Iconify、Meting 或不必要的搜索索引；
5. `git status --short` 不出现生成的缩略图、Lighthouse 报告、`.astro` 或 `dist`；
6. Lighthouse 使用 production preview，报告目录保持 Git 忽略。

