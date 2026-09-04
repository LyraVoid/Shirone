# 踩坑记录

> 本文档记录 Shirone 开发过程中踩过的坑、根因与正确做法。
> 每踩一个新坑，在此追加一条，避免团队重复踩。
> 配套文档：`rules/project-rules.md`（项目规则）、`docs/m3e-standard.md`（组件标准）。

---

## 1. Svelte 5 与 Astro 集成

### 1.1 cssHash 按文件名会导致 SSR/客户端样式丢失

**现象**：Svelte 组件移动目录后，SSR 渲染的 scope 哈希与客户端水合后的哈希不一致，样式丢失。

**根因**：Svelte 5 默认 `cssHash = hash(filename)`，同一组件在 SSR（源路径）与客户端（构建路径）拿到的 filename 可能不同。

**解法**（已落地）：`astro.config.mjs` 的 svelte 集成里改为基于 CSS 源码哈希，与路径无关：

```js
svelte({
    compilerOptions: {
        cssHash: ({ css, hash }) => `svelte-${hash(css)}`,
    },
}),
```

**教训**：不要回退到默认 filename 哈希。

---

### 1.2 Svelte 组件在 Astro 纯 SSR 下不水合

**现象**：Svelte 组件（如 `onerror`、`onclick`、事件监听）在 Astro 纯 SSR（无 `client:` 指令）下不生效。

**根因**：Astro 纯 SSR 只输出静态 HTML，不注入水合脚本。

**解法**：
- 需要交互就加 `client:load`（立即水合）或 `client:only="svelte"`；
- 纯展示组件（Avatar/Skeleton/AccentBar/Card 等）可接受纯 SSR 渐进增强，无需水合。

**注意**：Card 原子作为 Astro 容器（`<Card>...</Card>`）纯 SSR 渲染正常，children snippet 会被正确填充。

---

### 1.3 Svelte scoped 样式压过 Tailwind 类

**现象**：给 Svelte 原子传入 Tailwind 工具类（如 `hidden`、`flex`、`inline-block`）不生效，布局错乱。

**根因**：Svelte scoped 样式自带 class 哈希，specificity 为 `0,2,0`（如 `.m3-card.svelte-xxx`），而 Tailwind 工具类为 `0,1,0`。scoped 样式优先级更高。

**解法**：先确认组件是否应提供正式 prop/variant；仅当调用方 `class` 是明确的公开覆盖 API、且 Svelte scope 稳定压过普通工具类时，才使用 Tailwind `!`（important）前缀。完整准入条件、注释与测试要求见 `rules/css-important.md`。

**实际案例**：
- 文章页标题 AccentBar：`hidden md:inline-block` → `!hidden md:!inline-block`（否则移动端竖线不隐藏）；
- Navbar 用 Card 原子作容器：`flex` → `!flex`（否则 Card 的 `display: block` 压过 flex，子元素纵向堆叠错乱）；
- Navbar 顶部无圆角：`rounded-t-none` → `!rounded-t-none`。

**教训**：**任何** Svelte 原子作容器时，检查其 scoped 样式里的 `display`/`position`/`overflow` 是否与传入工具类冲突，冲突处一律加 `!`。

---

### 1.4 Astro 作用域 CSS 里的 `.dark &` 不匹配

**现象**：Astro 组件 scoped style 里写 `.dark &` 选择器命中不了。

**根因**：Astro 会给 `.dark` 也加 scope 属性，导致选择器变成 `.dark[data-astro-xxx] &`，实际 DOM 的 `.dark` 没有该属性。

**解法**：用 `:global(.dark) &` 代替 `.dark &`。

**关联**：Svelte 组件（如 Skeleton）在 Astro 组件里要用 `:global()` 选择器才能命中其内部元素。

### 1.5 @iconify/svelte 图标在 Astro 纯 SSR 下渲染空白

**现象**：Svelte 原子（如 IconButton）在**无 `client:*` 指令**的 Astro 页面（TopAppBar / Profile / 文章页）中，`icon` prop 渲染的图标消失，按钮只剩空圆。

**根因**：`@iconify/svelte` 的在线 `Icon` 组件靠运行时 `loadIcon`（浏览器 API）加载图标数据；SSR 无 hydration 时数据永远为 null → 渲染空，还可能在客户端请求 Iconify API。astro-icon 是构建期收集数据、SSR 直出 svg，无此问题。

**解法**：
- 静态 SSR 场景：用 `children` snippet 传 astro-icon 的 `<Icon>`（或任何已渲染 svg），**禁止**用 `icon` prop；
- 需要水合的 Svelte 场景：统一使用 `src/components/atoms/display/Icon.svelte`，它通过 `OfflineIcon` 消费 `src/generated/local-icon-collections.ts`，禁止业务组件直接导入在线 Iconify 组件；
- 新增或改名图标后运行 `pnpm.cmd icons:generate`，无效图标名必须修正，不能依赖网络回退；
- 组件 scoped CSS 里 `> :global(svg)` 会强制覆盖 children 图标的尺寸（如强制 24px 覆盖调用方 `text-[1.25rem]`）——尺寸规则只应作用于 `icon` prop 模式的图标容器（`.m3-icon-button__icon`），children 图标尺寸由调用方 class 控制。

**防回归**：`tests/site/icons.spec.ts` 断言真实页面（首页/侧栏/文章页）SSR 输出 svg 可见，并检查初始页面不请求 Iconify API；静态场景改回 `icon` prop 或交互场景绕过离线包装都会变红。

---

### 1.6 Svelte 5 unused-CSS 分析剥离条件类选择器

**现象**：`class:m3-tooltip--top={cond}` + 字面类名选择器 `.m3-tooltip--top { ... }` 的规则不出现在编译产物里，样式静默失效。日历组件也踩过同款（`{@const}` 块里的 class 指令被误判 unused，整段规则被注释掉）。

**根因**：vite-plugin-svelte 的 unused-CSS 分析对部分条件类写法误判为未使用并剥离——字面类名选择器（非 `&` 拼接产生）尤其容易中招。

**解法**（已验证）：
- 模板类名统一用 **template-literal class**：`class={`m3-tooltip m3-tooltip--${variant}${cond ? " m3-tooltip--top" : ""}`}`，不依赖 class 指令；
- CSS 选择器用 stylus `&` 拼接形态（`&--top`、`&--open`），与组件 class 绑定同源；
- 改完遍历 `document.styleSheets` 确认规则真实存在，再测行为。

---

### 1.7 Svelte 模板注释必须用 `<!-- -->`，`{/* */}` 会直接 parse error

**现象**：在 Svelte 模板（markup）里写 `/* 注释 */`（无花括号），注释文本被渲染进 DOM；改成 `{/* 注释 */}` 后反而编译报 `Unexpected token`（svelte 5.56.8，js_parse_error）。

**根因**：本项目 svelte 5.56.8 的模板解析对 `{/* */}` 不识别（实测 `compile('<div>{/* a */}</div>')` 即失败）。

**解法**：模板里的注释一律用 HTML 注释 `<!-- ... -->`（支持多行）；`/* ... */` 风格注释只放在 `<script>` / `<style>` 块内。

---

### 1.8 不能从子组件根（class 透传）做后代选择器：父组件 scope 类不在其上

**现象**：`<Card class="anime-section">` 包内容，样式写 `& .anime-list { display: grid }`（编译为 `.anime-section.svelte-父xx .anime-list.svelte-父xx`）——规则静默失效，`display:grid` 从未生效，列表全宽单列堆叠。单类规则（`&__tools` 等）不受影响，只有**从 Card 根出发的后代选择器**失效（番剧页布局 bug 的根因）。

**根因**：class 透传后落在 Card 模板内的根元素上，该元素带的是 **Card 的 scope class**（`svelte-pl9i7u`），不是父组件（AnimeSection）的 `svelte-1ds0vm7`，父样式选择器永远匹配不上。

**解法**：
- 单类规则（`&__xx`）照常写；
- 需要后代/子级选择器时，把宿主类放到模板内的真实元素上（如内层 `<div class="anime-section">`），或用 `:global(.宿主类)` 声明跨边界（容器查询宿主即用此法：`:global(.anime-section){container-type:inline-size}`）；
- 跨组件边界覆盖子组件内部类，统一 `:global(.子类)`，规则集中在布局拥有方（见 AnimeSection 的 list 模式）。

---

## 2. CSS / Stylus

### 2.1 Stylus 嵌套同名子元素会拼错类名

**现象**：`&__cover` 里再写 `&__cover-mask` 会编译成 `__cover__cover-mask`。

**根因**：Stylus 的 `&` 引用完整父选择器，同名前缀二次拼接。同类问题：`&--top` 里嵌套 `&__tip` 会拼成单类名 `.m3-tooltip--top__tip`（修饰符与元素合并，丢失后代关系）。

**解法**：把 `__cover-mask`、`__cover-arrow` 等放到 `&__cover` 同级，不要嵌套在 `&__cover` 内；修饰符块内的子元素选择器用完整类名 + 空格（`.m3-tooltip--top .m3-tooltip__tip`）或 `& .m3-tooltip__tip`，不要用 `&__tip`。

---

### 2.2 禁止硬编码色值 / 圆角 / 时长

**现象**：硬编码 `text-black/90`、`bg-black/60`、`transition: all 0.3s` 等，深浅色切换不统一。

**解法**：一律引用语义令牌：
- 文字：`text-90` / `text-75` / `text-50` / `text-30` / `text-25`（基于 on-surface 系，见 main.css）；
- 卡片：`var(--card-bg)` / `--float-panel-bg`；
- 圆角：`var(--radius-large)` / `--shape-corner-*`；
- 动效：`--m3e-duration-*` + `--m3e-easing-*`。

**唯一例外**：图片上的覆盖层（banner credit、头像 hover 遮罩、ImageWrapper 暗角、封面触摸箭头）必须用固定黑/白，保证在任意图片上可读。

---

## 3. 组件结构

### 3.1 不要用整个 `<a>` 包卡片

**现象**：卡片外层是 `<a>`，内部又有链接（标题、封面、分类），导致非法嵌套 `<a>` 套 `<a>`。

**解法**：卡片用 `<article>` + 多个独立 `<a>`（PostCard 原子已如此实现）。

---

### 3.2 原子 / 分子禁止跨层与业务副作用

- 原子不得 import 任何组件，只消费 token；
- 分子禁止 import 有机体；有机体间禁止平铺互相引用；
- 跨目录引用一律 `@components/<层>/<文件>`，禁止 `../../` 相对链；
- 数据获取（pagefind、`getSortedPosts`）、持久化（localStorage）属于有机体；原子/分子不做。

详见 `docs/atomic-structure.md`。

---

## 4. 内容插件（rehype/remark）

### 4.1 rehype 插件改动不热更新（构建期缓存）

**现象**：改了 `src/plugins/**/*.mjs`（如 File Tree 或 GitHub 卡片），dev server 页面 HTML 不变；即使重启 dev server，插件新增的 class 或 DOM 结构仍可能没有出现。

**根因**：rehype/remark 插件在 Markdown 编译期运行，Astro 的内容数据存储缓存了编译结果。只修改插件或样式文件不一定使文章内容缓存失效，因此新 CSS 可以已经加载，而页面仍使用旧 HTML。

**解法**：停止 dev server，优先删除 `.astro/data-store.json`，再重启：

```powershell
Remove-Item -LiteralPath ".astro\data-store.json" -Force
pnpm.cmd astro dev --port 4321
```

若问题还包含 Svelte scope hash 或 Vite 产物不一致，再按 §6.4 清理 `node_modules/.vite` 和整个 `.astro`。不要把修改文章正文当作正式的缓存刷新方案；它只能用于临时确认缓存判断。

**验证技巧**：直接检查插件预期生成的稳定 class、属性或 DOM 结构是否出现在页面中。若新 CSS 已生效但新 class 不存在，优先判断为 Markdown 内容缓存，而不是继续调整选择器。

---

### 4.2 fetch 必须检查 response.ok

**现象**：GitHub 卡片在 API 返回 403（限流）时显示 `NaN` / `Description not set`，而不是错误提示。

**根因**：`fetch(...).then(r => r.json())` 不检查 `response.ok`，403 的错误 JSON 被当成功数据解析，`data.forks` 是 undefined → `Intl.NumberFormat.format(undefined)` → `NaN`。

**解法**：
- 检查 `response.ok`，非 2xx 抛错走 catch；
- 加 AbortController 超时，防请求悬挂；
- catch 里替换为明确的错误文案。

**附加**：未认证的 GitHub API 按 IP 限流（60 次/小时），测试中务必 mock（`page.route`）避免 flaky。

### 4.3 AbortController 超时不能当作 Swup 取消

**现象**：GitHub API 超时后，卡片一直保留 `fetch-waiting` 和 `aria-busy="true"`，SSR 仓库链接也无法回到可用状态。

**根因**：超时和 Swup 内容替换都通过同一个 `AbortController` 触发 `AbortError`。如果 catch 只判断 `signal.aborted`，就会把超时误判为正常的旧页面清理。

**解法**：为超时单独记录 `timedOut` 标记。仅在请求确实失败或超时且卡片仍连接到文档时设置错误状态；Swup 取消的旧卡片不再修改 DOM。超时和非 2xx 响应都必须收起动态字段并保留 SSR 链接。

---

### 4.4 Markdown 扩展 DOM 存在但样式消失，不一定是缓存

**现象**：Skills 等普通内容正常，但 About 页的 GitHub 卡片只剩无样式链接；检查 HTML 时 `.card-github` 节点仍然存在。

**根因**：rehype 插件负责生成 DOM，`src/styles/markdown-extend.styl` 负责扩展卡片样式，两者是独立链路。若 `src/components/content/Markdown.astro` 遗漏全局样式导入，插件仍会生成正确 HTML，但卡片视觉完全丢失。这种情况清浏览器缓存不会解决。

**解法**：
- `Markdown.astro` 必须保留 `<style lang="stylus" is:global>` 对 `markdown-extend.styl` 的导入；
- 先区分“DOM 未生成”和“CSS 未命中”：前者查插件与 Astro 内容缓存，后者查样式入口、全局作用域和 computed style；
- 回归测试不能只断言 `.card-github` 存在，还要断言关键计算样式，例如 `display: block` 和无下划线链接。

---

### 4.5 Tailwind Typography 会介入 Markdown 小组件的内部布局

**现象**：Markdown 小组件已经命中自己的 CSS，但 `ul`/`ol` 仍出现意外的 margin 或 padding；提高组件选择器权重后计算样式仍不改变。File Tree 曾把嵌套目录设为 `padding-inline-start: 8px`，浏览器实际仍得到 Typography 注入的约 `1.625em`。

**根因**：`Markdown.astro` 的根容器带有 `.prose`，`@tailwindcss/typography` 会为正文列表、标题、链接等后代生成排版规则。同时 `src/styles/markdown.css` 通过 `@import ... layer(components)` 接入；当冲突规则处于不同 cascade layer 时，层顺序先于选择器 specificity 决定胜负，所以继续堆叠 class 不一定有效。

**解法**：

- 对拥有完整内部排版的生成式组件，在组件根节点添加 `not-prose`，明确退出 Typography 管理；
- 组件 CSS 继续显式声明其根列表与嵌套列表的 `margin`、`padding`、`list-style`，不要依赖浏览器或 prose 默认值；
- 只有正文型扩展继续继承 `.prose`；不要为了对抗 layer 使用 `!important`，也不要无止境提高选择器权重；
- 在 SSR 单元测试中断言 `not-prose` 输出，在 Playwright 中断言关键 computed style 和无横向溢出。

**排障顺序**：先看 DOM 是否为新版本，再看规则是否已进入样式表，最后看 computed style 的实际获胜声明。DOM 旧走 §4.1；规则缺失查样式入口；规则存在但值被覆盖才查 Typography、cascade layer 与 scope。

完整契约见 `docs/markdown-extensions.md`。

---

### 4.6 页面级 Markdown CSS 不能依赖 `?url` 静态导入或预渲染后的 `import.meta.url`

**现象**：树语法的 CSS 已从 `markdown.css` 移出，普通文章也没有对应的 `<link>`，但开发工具仍会请求 `trees.css?url`；改用 `import.meta.url` 读取同一份 CSS 后，开发环境正常，`pnpm.cmd build` 却在 `dist/.prerender` 下报源文件不存在。

**根因**：Astro 页面中的静态或动态 `?url` 导入会进入浏览器可见的 Vite 模块图，在开发期仍可能形成 URL 模块请求，因此不满足未命中语法的零资源请求。静态预渲染会把服务器模块放入 `dist/.prerender`，使相对 `import.meta.url` 不再指向仓库中的 `src/styles`。

**解法**：
- 对纯 SSR、会影响布局且需要随 Swup 页面离开的样式，在服务器端按特征快照读取 CSS 源文件，并只在命中页 `<head>` 输出带 `data-swup-optional` 的内联 `<style>`；不要为加载 CSS 新增客户端脚本。
- 服务器读取源码时使用 `resolve(process.cwd(), "src/styles/...")`。构建命令必须从仓库根目录执行；不要把预渲染模块路径当作源码定位依据。
- `updateHead.persistTags` 必须同时排除 `link[data-swup-optional]` 与 `style[data-swup-optional]`，否则离开命中页后内联规则会遗留在持久外壳中。
- 回归测试同时断言普通文章没有目标 CSS/JS 请求和可选样式节点，命中页只有一个样式节点且 computed style 生效；最后执行 `pnpm.cmd build` 覆盖预渲染路径。

**教训**：`?url` 没有插入 stylesheet 并不等于没有网络负担；开发期的 URL 模块请求同样属于未命中语法的额外成本。路径方案必须同时经过 dev、Swup 和静态构建验证。

---

### 4.7 按页样式测试的“普通文章”基线可能本身命中待迁移语法

**现象**：为新的 Markdown 语法添加“普通文章无可选样式”断言时，起始页已经存在目标 `data-swup-optional` 样式块，导致禁用态断言失败；此前未按页拆分的全局 CSS 会掩盖这个错误的测试前提。

**根因**：运行时测试中的路径常量可能因历史命名或最初的演示页面用途被误认为普通 Markdown 页面。迁移某个语法后，该页面自身的特征快照开始正确触发对应样式包，测试失败并不表示 Swup 的样式持久化规则有误。

**解法**：

- 每个语法的禁用态测试使用明确的 `*_FREE_POST_PATH`，并选择经内容检查确认不含该语法的文章；
- 保留已有测试的基线，除非它们也需要证明不命中同一个语法，避免无关路径替换扩大回归面；
- 失败时先检查目标页的 `remarkPluginFrontmatter.markdownSyntaxes` 和实际 Markdown 内容，再检查 `<head>`、Swup 生命周期与请求记录。

**教训**：测试基线是资源隔离契约的一部分。变量名中的 `PLAIN` 不足以证明页面没有命中待测语法。

---

### 4.8 Swup 样式回归夹具不能混入无关的外部运行时

**现象**：目标语法页同时包含 Mermaid、GitHub 卡片等额外运行时；卡片请求失败后，从该页面返回基线页的 Swup 导航可能无法收敛，掩盖了实际已正确注入和移除的可选样式。

**根因**：页面级样式迁移测试需要只验证一个语法包的生命周期，但复杂演示页会同时启动网络请求和其他页面运行时。它们的失败、重试或销毁时序会扩大测试的不确定性。

**解法**：为每个语法同时维护经过内容检查的 `*_FREE_POST_PATH`，并让往返两端都避开无关的网络组件与重型运行时；复杂综合演示页保留给组件自身的集成测试。

**教训**：Swup 回归夹具不仅要“不命中待测语法”，还要隔离与该生命周期断言无关的运行时副作用。

---

### 4.9 第三方 Markdown 集成可能在特征快照前改写节点

**现象**：共享 Remark 处理器的 fenced code 探测单测通过，但 Astro 页面中的 `remarkPluginFrontmatter` 仍未标记 Expressive Code，按页样式包因此没有注入。

**根因**：第三方集成可能在 Astro 的内容处理链中先消费或改写节点；独立处理器与页面渲染链并不一定保留相同的中间节点类型。

**解法**：保留共享特征探测，并为受集成处理顺序影响的 Expressive Code 使用独立的构建期源 AST 探针。该探针复用 Markdown 指令及代码语法归一化，排除 Mermaid、file-tree 与 code-tree；路由只消费其结构化结果，不得回退为正文正则或运行时 DOM 探测。

**教训**：特征探测新增后必须验证最终 `remarkPluginFrontmatter` 和 `<head>` 输出，不能只依赖独立处理器单测。

---

### 4.10 Node 原生 TypeScript 测试不会隐式加载 JSON 模块

**现象**：在 Astro/Vite 中可用的 JSON 默认导入，被 Node 的 `node --test` 直接执行时以 `ERR_IMPORT_ATTRIBUTE_MISSING` 失败。

**根因**：Vite 会处理 JSON 模块导入；Node 的原生 ESM 加载器要求每个 JSON 导入显式声明模块类型，二者的默认行为不同。

**解法**：供 Node 直接执行的 `.ts`/`.mjs` 工具模块统一写成 `import manifest from "./manifest.json" with { type: "json" };`。不要只依赖 Astro 开发服务器或构建通过来证明独立工具可运行。

**教训**：共享构建期工具新增 JSON 依赖后，至少运行一次对应的 Node 单测或脚本入口。

---

### 4.11 嵌套代码块不能同时触发容器语法和 Expressive Code

**现象**：`code-tree` 内的 fenced code 同时被记录为 `code-tree` 与 `expressive-code`，使文章额外注入 Expressive Code 的页面级样式包。

**根因**：共享 AST 遍历按节点类型标记普通 code fence 时，没有排除已被容器语法拥有的子节点；同一个源节点因此落入两个互斥的语法分类。

**解法**：探针标记普通 fenced code 前，检查其父节点是否为 `code-tree` 容器；容器内部代码只记录为 `code-tree`。源 AST 回退探针使用相同排除条件，并保留两条回归用例。

**教训**：语法快照应记录最终 DOM 所有权，而不是只按 AST 节点类型累加；嵌套语法必须明确分类优先级。

---

### 4.12 `.mjs` 的同名 `.d.ts` 不会自动成为 TypeScript 模块声明

**现象**：TypeScript 文件从 `./module.mjs` 导入类型时，即使目录中存在 `module.d.ts`，Astro check 仍报告该类型不是模块导出成员。

**根因**：带扩展名的 ESM 导入按实际 `.mjs` 模块解析，TypeScript 不会把同名 `.d.ts` 自动当作其声明覆盖；该行为与无扩展名模块解析不同。

**解法**：为 `.mjs` 运行时模块提供同名 `.d.mts` 声明，并让 TypeScript/Astro 消费者使用显式 `.mjs` 导入；简单局部数据契约也可在消费者中声明最小结构类型。不要为了仅有的类型信息改变可被 Node 直接执行的运行时导入。

**教训**：新增 Node 原生可执行的 `.mjs` 工具模块后，必须运行 Astro check 验证 TypeScript 消费端，而不只运行 Node 单测。

---

## 5. 测试

### 5.1 主题初始化后要等过渡收敛

**现象**：断言 computed 样式拿到动画中间帧的 rgba 混合值。

**根因**：主题引擎写入 `--mc-*` 后组件颜色带 transition。

**解法**：`openTestPage` 里已等待 `--mc-primary` 写入 + 350ms；视觉回归用 `emulateMedia({ reducedMotion: "reduce" })` 折叠动画。

---

### 5.2 axe 扫描要防「假通过」

**现象**：主题未应用、动画未收敛时扫描，可能漏报或误报。

**解法**：
- 断言页面确实处于目标模式（`document.documentElement.classList.contains("dark")`）；
- 等待 `onload-animation` 全部收敛（opacity 1）；
- 真实页面的 GitHub 卡片 API mock 固定响应，避免骨架屏误报。

---

### 5.3 视觉截图命名去掉平台后缀

**现象**：`toHaveScreenshot` 生成 `xxx-win32.png`，跨平台 CI 不一致。

**解法**（已落地）：`playwright.config.ts` 里：

```ts
snapshotPathTemplate: "{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{ext}",
```

**注意**：黄金截图默认不入库（`.gitignore` 忽略 `tests/site/visual.spec.ts-snapshots/`），新环境首次需 `--update-snapshots` 生成。

---

## 6. 环境与命令

### 6.1 PowerShell 中文乱码

**现象**：PowerShell 读中文文件、写中文提交信息乱码。

**解法**：
- 读中文文件前 `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)`；
- 写含中文文件用 `[System.IO.File]::WriteAllText(path, content, [System.Text.UTF8Encoding]::new($false))`；
- 提交信息含中文/引号时，写临时文件 `git commit -F`，避免命令行转义问题（直接 `git commit -m "中文 \"引号\""` 会被 PowerShell 转义搞乱）。

---

### 6.2 一律用 npx.cmd / npm.cmd / pnpm.cmd

系统 PowerShell 禁脚本执行，裸 `npx` / `pnpm` 可能失败，统一用 `.cmd` 后缀。

---

### 6.3 npm 的「Unknown project config」警告可忽略

`npx.cmd xxx` 常带 stderr 警告 `npm warn Unknown project config "manage-package-manager-versions"`，导致 `[exit code: 1]`。这是 npm 无关警告，不是命令失败——判断成败以 stdout 的实质结果为准（如 `0 errors`、`N passed`）。

---

### 6.4 改了 Svelte 组件样式不生效？先清 vite 缓存

**现象**：改了 Svelte 组件（如 Tooltip）后，页面上同一组件内 root 与子元素的 scope hash 不一致（`svelte-a` vs `svelte-b`），或新 CSS 规则不在产物里；重启 dev server 也无效。

**根因**：Astro dev 的 vite 模块缓存（`node_modules/.vite`）残留旧编译产物，新编译的 DOM 与旧编译的 CSS scope 对不上。

**解法**：删 `node_modules/.vite` + `.astro` 后重启 dev server。

**验证技巧**：怀疑样式未生效时，先遍历 `document.styleSheets` 确认规则存在、并比对元素 scope 属性是否一致，再决定清缓存还是查选择器。

---

## 7. 相册系统

### 7.1 受保护相册的布局必须和普通相册保持一致

**现象**：相册解锁后看起来不像普通相册：出现固定网格、空列、横图像竖图一样被限制，或解锁前后的容器背景/内边距冲突。

**根因**：`public/images/albums/<id>/info.json` 的 `layout` 同时传给锁定前的 `ProtectedAlbum` 和解锁后的 `AlbumGallery`。示例相册曾误写为 `"grid"`，而普通相册使用 `"masonry"`，导致解锁后切换成另一套布局。外层容器又曾按锁定态永久去掉背景和内边距，进一步放大了差异。

**解法**：
- 瀑布流相册明确写 `"layout": "masonry"`；只有确实需要等宽网格时才使用 `"grid"`；
- 解锁后的内容必须复用同一个 `AlbumGallery`，不要为受保护相册复制一套画廊 CSS；
- 外层受保护容器只在仍包含 `.password-gate` 时取消背景/内边距，解锁后恢复普通相册容器；
- 回归测试必须在输入正确密码后断言 `album-gallery--masonry`、图片方向和容器样式。

**教训**：保护机制只负责隐藏/解密数据，不应改变相册展示契约。

### 7.2 本地相册文件名会影响顺序、标题、标签和 URL

**现象**：文件名包含 SHA 哈希、混用 `1.webp` / `d1.webp` / 无规律前缀时，页面显示标题不可读，排序难以预测；批量改名后若没有沿用扫描器排序，图片顺序会改变。

**根因**：本地相册扫描器直接使用文件 basename 生成 `AlbumPhoto` 的 `alt`/`title`，并用 `localeCompare(..., { numeric: true })` 排序；basename 中的下划线还会被解析为标签。文件名也是公开图片 URL 的一部分。

**解法**：
- 本地相册图片使用统一的零填充编号，如 `01.webp`、`02.webp`；`cover.webp` 必须保留；
- 批量重名前先统计实际图片数量，不要假设数量；
- 按扫描器的完整排序函数生成映射，先临时改名再改最终名，避免 Windows 文件名冲突；
- 若需要语义标题，使用明确的 basename，并确认下划线后的片段确实应该成为标签；
- 重命名后检查所有代码/测试/文档中的具体文件 URL，并运行相册回归测试。

**教训**：相册文件名不是只影响磁盘可读性的内部细节，它是内容元数据和路由资源的一部分。

---

## 8. 本地资产流水线

### 8.1 `/_image/?href=/@fs/...` 是开发期协议，不是可持久化 URL

**现象**：直接访问 Astro 生成的 `/_image/` 地址时报 `MissingSharp`，或者把其中的 Windows 绝对路径误认为生产站点泄漏了错误资源地址。

**根因**：Astro dev 用 `/_image` 路由和 `/@fs` 标识读取工作区文件，并调用 Sharp 转码。这是内部协议；Sharp 未安装、原生包未正确解析或 dev server 未重启都会使该路由失败。

**解法**：
- `sharp` 保持为项目直接依赖，安装或锁文件变化后重启 dev server；
- 配置只保存源资产路径，组件通过 `resolveImageAsset()` / `getImage()` 产生 URL；
- 禁止在配置、内容、测试快照中保存 `/_image`、`/@fs` 或绝对磁盘路径；
- 最终结论以 `pnpm.cmd build` + production preview 为准。

### 8.2 原图、派生图和构建缓存不能混放

**现象**：优化后的临时图片散落在根目录或原图目录，`git status` 出现大量二进制文件；删掉原图后旧缩略图仍被页面引用。

**根因**：没有区分可编辑源文件、可重复生成的派生文件和框架缓存，也没有让生成器负责过期产物清理。

**解法**：
- 原始资产放 `src/assets/` 或 `public/images/`；
- 可重复生成的公开派生图放 `public/assets/<domain>/`，忽略目录内容并只跟踪 `.gitkeep`；
- 生成器必须幂等、跳过有效输出并删除孤立产物；
- `.astro/`、`dist/` 和 Lighthouse 报告始终保持忽略；
- 完整目录契约见 `docs/asset-pipeline.md`。

### 8.3 本地音乐封面必须在服务端解析后保留到客户端数据

**现象**：配置了本地封面，但播放器显示空白、远端封面或未经优化的原图。

**根因**：字符串相对路径没有进入 Astro 资产管线，或者 Meting 返回的数据在客户端合并时覆盖了已解析的本地 `cover` / `srcset`。

**解法**：服务端先用 `resolveImageAsset()` 解析本地封面并生成 64/128 像素候选，再把完整封面字段传给客户端；合并远端歌单时，本地配置优先。测试既要断言图片可见，也要断言 URL 来自 `/_astro/` 或图片服务且初始页面没有 Meting 请求。

---

## 9. 移动端布局与盒模型自适应

### 9.1 网格隐式轨道与原生输入框内在尺寸引发移动端溢出

**现象**：在移动端窄屏视口（如 375px、360px、320px）下，门控卡片或弹窗内的表单输入框和提交按钮无法随父容器收缩，宽度固定在特定像素（如 282.5px），导致输入框右侧边框与尾部图标超出卡片容器边界被裁切，或撑大页面产生水平滚动条。

**根因**：
1. 容器声明了网格布局但未显式定义列模板，浏览器生成隐式轨道，其尺寸默认为内容最大尺寸；
2. 网格项的最小宽度默认为自动，阻止容器向内收缩到内容尺寸以下；
3. 原生输入框标签未声明完全占满宽度，浏览器根据默认内在宽度（约 20 字符宽度）参与父级内容尺寸计算，加上前后图标、间距和内边距后形成固定下限；
4. 连锁反应导致声明了占满宽度的提交按钮被一同撑大，在卡片隐藏溢出的作用下右侧被切除。

**解法**：
- 表单网格必须显式声明列模板并允许收缩：`grid-template-columns: minmax(0, 1fr)`；
- 网格项必须显式覆盖默认限制：`min-width: 0`；
- 通用输入原子组件根元素与内部原生输入框必须声明 `width: 100%` 与 `min-width: 0`，切断原生内在尺寸对外部布局的干扰。

**防回归**：在 `tests/site/post-encryption.spec.ts` 等测试中对移动端窄屏视口进行断言，验证输入框与按钮计算宽度与表单容器完全一致，且页面整体无任何水平滚动。

