# 动效库规范（M3E）— Shirone 主题

> 记录站内动效令牌、动画插件与降级约定。新增动效先读本文档，
> 动画插件放在 `src/utils/motion.ts`，回归测试放在 `tests/site/motion.spec.ts`。

---

## 1. 动效令牌

统一引用设计令牌，禁止散落的 `0.3s` / `linear` 等硬编码：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--m3e-duration-short` | 150ms | hover/focus、状态色 |
| `--m3e-duration-medium` | 250ms | 指示器滑动、面板开关 |
| `--m3e-duration-long` | 400ms | 大位移/抽屉 |
| `--m3e-easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 通用 |
| `--m3e-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | 进入/展开 |
| `--m3e-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | 退出/收起 |

## 2. 动效降级（Reduce Motion）

站内两套开关，动画一律遵守：

- **系统**：`prefers-reduced-motion: reduce` 媒体查询；
- **站点手动**：`html.motion-reduced`（设置面板「Reduce motion」开关）。

统一用 `prefersReducedMotion()`（`src/utils/motion.ts`）检测，降级时动画直接到位、不播过渡。

## 3. 动画插件（最小补丁）

`src/utils/motion.ts` 提供可复用 Svelte action，声明式接入，无业务侵入：

### `use:collapse` — 展开/折叠（高度 0↔auto）

```svelte
<div use:collapse={{ open: expanded }}>
  <!-- 折叠内容始终渲染，由插件控制高度与 overflow -->
</div>
```

- 高度动画用 **WAAPI** 驱动（`element.animate`）：可取消、无逐帧 rAF 开销，结束归位 `auto`；
- `prefersReducedMotion()` 命中时直接切换高度、跳过动画；
- 参数 `duration` 可覆盖时长（默认 240ms，M3 emphasized-decelerate）。

适用：年份折叠、手风琴、下拉面板等。新增同类动效优先复用本插件，不要各自造轮子。

### `revealIn` / `fadeOutThenHide` / `flipFromRect` — 集合变更原语（非 Svelte）

Svelte action 之外的元素级函数（SideBar 的 pages 过滤等场景按需组合），
与 action 同一套曲线、时长令牌与降级约定：

```ts
import { fadeOutThenHide, flipFromRect, revealIn } from "@utils/motion";

// 变更前记录位置 → 退场原地淡出（150ms short，accelerate）让出布局后隐藏
const rects = new Map(items.map((el) => [el, el.getBoundingClientRect()]));
await Promise.all(exiters.map((el) => fadeOutThenHide(el)));

// 切换 hidden / 移动元素后：留存元素从旧位置 FLIP 到新位置（250ms medium，emphasized）
for (const el of survivors) flipFromRect(el, rects.get(el)!);
// 入场元素淡入上移（250ms medium，decelerate），多个时 delay 递增做阶梯
enterers.forEach((el, i) => revealIn(el, { delay: i * 50 }));
```

- **退场先淡出再隐藏**：淡出期间元素仍占布局，位移 FLIP 才有正确的起点；
- `flipFromRect` 同时是文章列表 list↔grid 重排（`layout-mode.ts` 的
  `flipToMode`，400ms long）的共享实现；
- 快速连续变更时调用方需做代际保护（旧回调在 `await` 恢复点作废），
  参见 `SideBar.astro` 的 `syncSidebarPages`。

## 4. 性能约定

- 优先 CSS transition / WAAPI，避免逐帧 `requestAnimationFrame` 手写补间；
- 动效只作用于 `transform` / `opacity` / 一次性高度动画，不长期持有布局；
- 折叠动画读取一次 `scrollHeight`（单帧布局），结束后清除内联高度；
- `destroy` 中取消进行中的动画并还原内联样式。

## 5. 回归测试

友链与番剧分页复用 `.m3-state-layer` 的 hover / focus / pressed 反馈、短时颜色过渡和
`reveal` 入场；本地筛选与翻页立即更新，不人为延迟或显示全列表 loading。跨路由等待
继续使用 `RouteProgress`，在成功、取消、失败、超时出口清理。头像和封面复用 `Skeleton`
提供固定尺寸的局部占位，图片成功后短时淡入，失败后显示原有占位；不阻塞文字和分页。
系统与站点的 Reduce Motion 均直接到位。分页相关场景在
`tests/site/list-pagination.spec.ts` 覆盖。

`tests/site/motion.spec.ts` 锁定：

- **归档页折叠动画**（`collapse`）：正常模式展开/收起播放高度过渡（动画期间为中间值）；
  Reduce Motion 直接到位（无中间值）；`aria-expanded` 与折叠内容正确。
- **侧栏 pages 过滤**（集合变更原语，经 swup 导航触发）：首页↔文章页双向导航后
  stats 包装层 hidden 切换正确、留存 widget 保持可见；Reduce Motion 走瞬切路径。
  swup 触发时机不可控，不做动画中间值采样（避免 flake），锁定终态。

新增动效组件时，在此文件追加对应场景。
