# 组件 API 设计规范

> Shirone M3E 原子组件的对外接口约定。新增 / 修改原子前必读。
> 配套：`rules/project-rules.md`（§4 原子组件约定）、`docs/m3e-standard.md`（§4 组件清单）。

---

## 1. 静态 vs 交互

| 类型 | 文件 | 说明 |
|---|---|---|
| 静态原子 | `.astro` | 无交互、纯展示或仅导航跳转（如 `action/Chip.astro`、`blog/PostCard.astro`） |
| 交互原子 | `.svelte`（Svelte 5） | 有状态、事件、焦点管理（如 `selection/Switch.svelte`、`overlay/Dialog.svelte`） |

判断标准：只要需要「点击回调以外的状态管理」（展开/收起、`$bindable`、焦点陷阱、ResizeObserver），用 Svelte；纯导航 `<a>`、纯展示用 Astro。

---

## 2. Props 命名约定

### 2.1 通用 props（所有原子应支持）

| prop | 类型 | 约定 |
|---|---|---|
| `class` | `string` | 透传扩展类，`class:list` 合并，**永不覆盖调用方类** |
| `style` | `string` | 透传内联样式（Svelte 用 `style` + `--m3-*` CSS 变量） |
| `id` | `string` | 根元素透传（供 CSS 选择器 / 锚点 / `aria-labelledby` 引用） |
| `variant` | 字符串枚举 | 视觉变体，默认值取 M3 官方默认（如 Button filled、Card filled） |
| `size` | 字符串枚举 | 尺寸档，默认 medium（或官方默认） |
| `disabled` | `boolean` | 交互禁用，视觉 opacity 0.38 + pointer-events none（对齐官方） |

### 2.2 变体 / 尺寸枚举

- **变体用 `variant`**：如 `filled` / `tonal` / `outlined` / `text`；`filled` / `elevated` / `outlined`；`primary` / `secondary` / `tertiary` / `surface`。
- **尺寸用 `size`**：如 `small` / `medium` / `large`，或 M3E 五档 `xsmall` / `small` / `medium` / `large` / `xlarge`。
- **圆角用 `radius`**：token 名（`m` / `l` / `xl` / `full`）或任意 CSS 长度，不传跟随组件默认。参考 `action/FAB.svelte`、`display/Card.svelte` 的 `RADIUS_TOKENS` 映射。
- 枚举值小写、语义化，禁止缩写（`s`/`m`/`l` 作尺寸值除外）。

### 2.3 回调命名

| 场景 | 命名 | 示例 |
|---|---|---|
| 组件自身事件 | 小写 `on` + 动词 | `onclick`、`onchange`、`onselect`、`onclose`、`onrefresh`、`onsort` |
| Svelte 5 事件 | `on<Event>` | `onclick`（原生），自定义用 `onxxx` 并 `$props()` 声明 |

**约定**：Svelte 5 中，能被 `$bindable` 的状态不另设 onChange；需要通知父组件副作用时才加回调（如 `Select.onselect`、`SearchView.onclose`）。

### 2.4 双向绑定

需要父组件读写状态时用 Svelte 5 `$bindable`：

```svelte
let { checked = $bindable(false), open = $bindable(false) } = $props();
```

`$bindable` 与回调的关系：`$bindable` 表达「状态」，回调表达「事件副作用」，二者可并存（如 `Dialog.open` $bindable + `onclose` 事件）。

---

## 3. 可访问性 props

| prop | 约定 |
|---|---|
| `label` | 可见文本（Button Extended FAB、Switch 等）或作为 `aria-label` 回退 |
| `ariaLabel` | 纯图标组件的无障碍标签（IconButton/FAB 图标模式） |

**约定**：图标按钮、无可见文字的控件，`label`/`ariaLabel` 至少提供一个；有可见文字时优先用文字作为可访问名称。

---

## 4. 内容插槽（children / snippet / slot）

| 形式 | 场景 |
|---|---|
| `<slot />`（Astro） | 静态原子，插入任意内容 |
| `children` snippet（Svelte 5） | 交互原子，插入任意内容 |
| 命名插槽 / snippet | 结构化组件（如 AppBar 的 `navigationIcon`/`actions`、Dialog 的 `actions`） |

**Svelte 5 约定**：用 `children?: import("svelte").Snippet` + `{@render children?.()}`，不用 legacy `<slot>`（Svelte 5 已弃用 slot 元素）。

---

## 5. 根元素与状态层

- 交互组件根元素挂 `m3-state-layer` 类（获得 M3 状态层：hover 8% / focus 10% / pressed 12%）。
- 原生语义优先：能用 `<button>`/`<input>`/`<a>` 不用 `<div>` 自造交互（除非结构需要，如 Card 可点击容器用 button）。
- 提供 `href` 时渲染 `<a>`（导航链接），避免 `<a>` 套 `<button>` 非法嵌套。

---

## 6. 样式隔离

- 组件样式用 scoped（Astro `<style>` / Svelte `<style lang="stylus">`），类名带 `m3-<component>` 前缀。
- 内部元素用 `__` 分隔（`m3-button__content`），状态修饰符用 `--`（`m3-button--filled`）。
- 颜色/圆角/动效一律走 token，禁止硬编码（见 `rules/pitfalls.md` §2.2）。
- 覆盖 scoped 样式用 `:global()`（组件内）或调用方用 Tailwind `!`（见 `rules/pitfalls.md` §1.3）。

---

## 7. 文档与测试配套

每个新原子必须配套（见 `rules/project-rules.md` §4）：

1. `docs/m3e-standard.md` §4 清单补一行（含「移植 / 原创」来源）；
2. `*Demo.svelte` 演示页（不入库）；
3. `tests/atoms/*.spec.ts`（渲染 token + 交互 + 键盘）；
4. a11y 扫描清单（`tests/atoms/a11y.spec.ts` 的 pages 数组）。

---

## 8. 零开销与条件渲染（零额外负担）

- **禁用/未配置时零 DOM**：可选组件（如评论区、额外侧栏 widget、可选装饰、分享海报等）在被配置关闭或数据无效时，必须直接不渲染任何 HTML（返回 `null` 或空），不得输出带有高度、内边距或占位边框的空外壳。
- **动态资源按需加载**：第三方 SDK 或重量级可选脚本严禁在组件静态顶层导入中引入，必须在用户开启并满足挂载条件（如视口懒加载）时才动态加载。

---

## 9. 反例（避免）

- ❌ `size="S"` / `variant="PRIMARY"`（大小写枚举）
- ❌ `onChange` 驼峰（Svelte 用 `onchange` 小写，或 `$bindable`）
- ❌ 根元素不用 class:list，直接拼接字符串覆盖调用方类
- ❌ 自造 `:hover { background }` 叠色（应挂 `.m3-state-layer`）
- ❌ `<a><button></button></a>`（非法嵌套）
- ❌ 在原子里 import 其他组件 / 做数据获取（原子只消费 token）

---

## 10. 移动端尺寸与自适应约束

- 输入型原子（如 TextField）根元素必须具备 `width: 100%` 与 `min-width: 0`，其内部原生 input 元素必须具备 `width: 100%` 与 `min-width: 0`，切断浏览器默认内在宽度对外部布局的干扰。
- 采用网格布局的表单或有机体容器必须显式定义列模板（如 `grid-template-columns: minmax(0, 1fr)`），网格项必须显式声明 `min-width: 0`，严禁依赖隐式轨道和默认的自动最小尺寸。

