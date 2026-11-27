# 脚本插件（`shirones/scripts/`）

不 fork 主题，也能改主题行为的入口。把一个脚本放进 `shirones/scripts/`，Astro 启动时就会加载它；脚本通过一个小 API 向主题登记自己要做的事。

源码模式（clone 本仓库）和 npm 包模式用同一套代码，目录也是同一个：项目根下的 `shirones/scripts/`。

## 1. 它能做什么，不能做什么

能做：

| 能力 | API |
| --- | --- |
| 往 Markdown 处理链里加 remark / rehype 插件 | `api.markdown.remark()`、`api.markdown.rehype()` |
| 新增一个 directive（`::name`、`:::name`、`:name[…]`）的渲染，或替换主题自带的 | `api.markdown.directive()` |
| 新增页面；包模式下删除或替换主题注入的页面 | `api.routes.add()`、`remove()`、`replace()` |
| 让图标扫描多看几个目录或文件 | `api.icons.scan()` |
| 让字体子集多保留一些字符 | `api.fonts.keep()` |
| 构建写完之后跑一段代码 | `api.onBuildDone()` |

不能做，也不打算在这一层做：

- **改配置值。** 配置已经有入口：在 `shirones/config/`（源码模式是 `src/config/`）放同名文件。配置会被打进浏览器端代码，而脚本只在 Astro 进程里运行，让脚本改配置就要多一条把函数结果序列化到两端的通道，不值得。脚本可以**读**配置：`import { siteConfig } from "@/config/siteConfig"`，读到的是项目自己的那一份。
- **往页面里插内容、加侧栏组件类型、替换主题内部模块。** 组件和布局按同路径文件覆写（见 [npm-package-mode.md](./npm-package-mode.md)）。
- **加 Astro integration 或 Vite 插件。** 写在 `astro.config.mjs` 里。

## 2. 写一个插件

```ts
// shirones/scripts/reading-list.ts
import type { ShironesPlugin } from "@/types/plugin";

export default {
	name: "reading-list",
	setup(api) {
		api.routes.add({ pattern: "/reading", entrypoint: "src/reading.astro" });
		api.fonts.keep("㊙");
	},
} satisfies ShironesPlugin;
```

也可以直接导出一个函数，等价于只有 `setup` 的对象，名字取文件名：

```js
// shirones/scripts/10-routes.mjs
export default (api) => {
	api.routes.add({ pattern: "/reading", entrypoint: "src/reading.astro" });
};
```

规则：

- 只加载目录**第一层**的 `.ts`、`.mts`、`.js`、`.mjs` 文件，按文件名排序依次执行。要控制先后就加数字前缀。
- 以 `_` 或 `.` 开头的文件、`.d.ts`、子目录都不是插件，可以放辅助代码，由插件 `import`。
- 第一层的文件如果没有默认导出一个插件，启动报错。这是故意的：悄悄跳过的话，写错导出的插件看起来就像"加载了但没生效"。
- `setup` 可以是 `async`。所有登记必须在 `setup` 返回（或它返回的 Promise 结束）之前完成，之后再调用 API 会抛错。
- 两个插件不能同名。

目录可以换：`shirones({ paths: { scripts: "tools/plugins" } })`，相对项目根。

### 脚本里能 import 什么

脚本和配置文件用同一个加载器（esbuild 打包后在 Node 里执行），所以：

- TypeScript 直接写，不需要编译。
- 主题的路径别名可用：`@/config/…`、`@utils/…`、`@/types/…`。
- Node 内置模块可用。脚本只在 Astro 进程里运行，它 import 的东西不会进浏览器包。
- 主题自己装了的依赖（`unist-util-visit`、`hastscript` 等）可以直接 import，即使你的项目没有装。项目自己装了同名依赖时用项目的。

## 3. API

`setup(api)` 收到的对象，类型定义在 `src/types/plugin.ts`。

### 3.1 基本信息

| 字段 | 含义 |
| --- | --- |
| `api.command` | `"dev"`、`"build"`、`"preview"`、`"sync"`。每种命令都会执行插件。 |
| `api.packageMode` | 主题作为 npm 包安装时为 `true`，在主题自己的仓库里为 `false`。 |
| `api.paths` | `projectRoot`、`configDir`、`dataDir`、`contentDir`、`scriptsDir`，都是绝对路径。 |
| `api.logger` | `info(message)`、`warn(message)`，输出带插件名前缀。 |

### 3.2 Markdown

```ts
api.markdown.remark(plugin, { at: "after-directive" });
api.markdown.rehype(plugin, { at: "end" });
api.markdown.directive("card", (properties, children) => hastNode);
```

`plugin` 是一个 unified 插件，或 `[plugin, options]`。

插入点是固定的四个，不能插到任意位置。主题自己的插件顺序是一份契约（[markdown-plugin-order.md](./markdown-plugin-order.md)），四个插入点都选在不破坏它的地方：

| `at` | 位置 | 这时树的状态 |
| --- | --- | --- |
| remark `"before-directive"` | `remarkDirective` 之前 | directive 已经是节点。主题对 directive 的处理都还没跑：正文里一个孤立的 `:word` 还是 `textDirective`，主题的视频嵌入也还没校验。 |
| remark `"after-directive"`（默认） | `remarkFeatureProbes` 之前 | 主题已把孤立的 `:word` 还原成文本，嵌入已校验。剩下的 directive 就是会被渲染成组件的那些。 |
| rehype `"before-components"` | `rehypeComponents` 之前 | directive 是以自己名字命名的元素（`::github` 是 `<github>`），还没渲染。 |
| rehype `"end"`（默认） | 最后 | 最终的 HTML 树。 |

同一个插入点上，先登记的先执行。

`directive(name, component)`：`name` 只能是小写字母、数字和连字符，以字母开头。`component` 收到 directive 的属性和子节点（hast），返回替换它的 hast 节点，也就是 `rehype-components` 的约定。名字和主题自带的 directive 相同时，替换主题的渲染；后加载的插件替换先加载的插件登记的同名 directive，并打印一条警告。

```ts
import { h } from "hastscript";

api.markdown.directive("card", (properties, children) =>
	h("aside", { class: "card", "data-title": properties.title }, children),
);
```

```md
::card[正文]{title="标题"}
```

**作用范围。** 登记的插件对所有经过主题 Markdown 处理器的内容生效：文章、独立页面、动态（moments）。下面几处不经过这个处理器，插件不生效，主题自带的 directive 在这些地方同样不渲染：

- RSS / Atom 的正文（`src/utils/feed.ts` 用另一个解析器渲染原始 Markdown）；
- `llms-full.txt`（原始 Markdown）；
- 列表卡片上的摘要和阅读时间（在两个 remark 插入点之前就算好了）。

**样式。** 插件只产出 HTML。新 directive 需要的 CSS 自己加载，例如放进全局样式或覆写的布局里。主题的按需样式包（`src/plugins/markdown/manifest.json`）不认识插件登记的 directive。

### 3.3 路由

```ts
api.routes.add({ pattern: "/reading", entrypoint: "src/reading.astro" });
api.routes.remove("/anime");
api.routes.replace("/devices", "src/my-devices.astro");
```

- `entrypoint` 是绝对路径，或相对项目根的路径；文件不存在时启动报错。
- `pattern` 比较时忽略首尾斜杠：`reading`、`/reading/` 是同一个。
- `add` 的路由和主题仍在注入的路由相同时报错，提示改用 `replace`。两个插件 `add` 同一路由也报错。先 `remove` 再 `add` 同一个 pattern 是允许的。
- `remove`、`replace` 指向主题没有注入的路由时只警告，不让构建失败：主题升级后改名或删掉了某个页面，不应该让你的站点构建不了。

**两种模式的差别，只有这一处。** 包模式下主题的页面是 integration 注入的，`remove`、`replace` 改的就是这张注入表。源码模式下主题的页面是 `src/pages/` 里的文件，Astro 自己发现它们，没有注入表可改；这时 `remove`、`replace` 打印警告并被忽略，要改页面请直接改文件。`shirones({ injectRoutes: false })` 时同理。`add` 在两种模式下都生效。

### 3.4 图标

```ts
api.icons.scan("shirones/scripts/_icons", "/abs/path/to/file.md");
```

图标集合由扫描源码里出现的 `前缀:名字` 得到。插件渲染出的图标名如果只出现在扫描范围之外（例如脚本自己的代码里，`shirones/scripts/` 不在默认范围内），就用它把那个文件或目录加进来，例如 `api.icons.scan(api.paths.scriptsDir)`。路径不存在时启动报错。

### 3.5 字体

```ts
api.fonts.keep("㊙〠");
```

字体子集按站点内容里出现过的字符裁剪。只在运行时才出现的字符（脚本生成的文字、客户端代码拼出来的文字）用它保留。效果等同于 `shirones({ fonts: { extraCharacters } })`，两者相加。

### 3.6 构建完成

```ts
api.onBuildDone(async ({ dir, logger }) => {
	// dir：构建输出目录的绝对路径
});
```

`astro build` 写完站点之后、Pagefind 建搜索索引之前执行，所以这里改写的 HTML 会被索引到。多个处理函数按登记顺序逐个执行。抛错会让构建失败。`astro dev` 不会执行。

## 4. 开发时的行为

- 新增、修改、删除 `shirones/scripts/` 下的任何文件（包括子目录里的辅助文件），dev server 自动重启并重新加载全部脚本。
- 脚本改动后，已缓存的 Markdown 渲染结果会失效重算，不需要手动清 `.astro/`。
- 脚本有语法错误或 `setup` 抛错时：dev server 保留上一次能用的配置继续运行，并打印错误；`astro build` 直接失败。

## 5. 出错时

所有错误都带插件名和文件路径：

```
[shirones] plugin "reading-list" (/…/shirones/scripts/reading-list.ts): routes.add() points at /…/src/reading.astro, which does not exist
```

参数不对、文件不存在、插件重名、路由冲突、`setup` 抛错，都是启动失败，不是警告。只有"主题里没有这个路由"和"替换了另一个插件的 directive"是警告。

## 6. 实现说明（给维护者）

- 加载与 API：`src/integration/plugins.ts`。接线：`src/integration/index.ts` 的"2.5 Plugin scripts"。
- 没有脚本时，Markdown 处理链就是 `siteRemarkPlugins`、`siteRehypePlugins` 这两个数组本身，不多一个插件，不多一次拷贝。
- **Markdown 扩展要跨两个运行环境。** Astro 用 integration 传给它的处理器渲染内容；动态页正文则由站点自己的代码（`content-utils.ts`）通过 Vite 加载的 `markdown-processor.mjs` 渲染。两边是同一个 Node 进程里的两份模块实例，所以登记结果放在 `globalThis[Symbol.for("shirones.markdown-extensions")]` 上共享（`src/utils/markdown-extensions.mjs`）。
- **共享失败不能悄悄发生。** integration 把登记内容的摘要编译进站点代码（`__SHIRONES_MARKDOWN_DIGEST__`），站点渲染动态前比对摘要和它实际看到的扩展，不一致就抛错。否则文章用了插件、动态没用，页面看起来只是"有点不对"。
- **内容缓存。** Astro 用配置的 JSON 判断是否丢弃内容缓存，函数在 JSON 里不出现，所以改脚本不会改变这份 JSON。处理链末尾因此加了一个什么也不做的 remark 插件，它的选项就是脚本摘要。
- **dev 重启。** Astro 只在变更路径与 `addWatchFile` 登记的路径完全相等时重启，登记目录对目录里的文件无效。integration 因此登记目录本身，并在 `astro:server:setup` 里把目录内的增、删、改转发成该目录的一次 `change`。
- 测试：`tests/plugin-scripts.test.mjs`。
