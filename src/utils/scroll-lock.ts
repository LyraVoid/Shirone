/**
 * 页面滚动锁（含滚动条宽度补偿）。
 *
 * 锁定 `body` 滚动有时会让经典滚动条消失，页面布局宽度随即增加一个滚动条宽度
 * （Windows Chrome 实测 15px），`body` 内容盒内的常规流元素都会横移。这里在
 * 锁定期间补上等宽的 `padding-inline-end`，解锁时原样还原。
 *
 * 三个关键约束：
 * 1. 是否补偿取决于「锁定后布局宽度有没有真的变宽」，而不是 `innerWidth` 与
 *    `documentElement.clientWidth` 的差：在 `html { scrollbar-gutter: stable }`
 *    （见 `src/styles/main.css`）下，滚动条消失后该差值会变成 0，但槽位仍然
 *    预留、布局宽度根本没变，此时补偿反而会把常规流元素白窄 15px。因此这里用
 *    `body` 的 border box 宽度锁定前后各测一次，只在真的变宽时补偿等量内边距。
 * 2. 补偿只覆盖 `body` 内容盒内的常规流元素（例如 `#top-row` 顶部栏）。
 *    `#main-layout` 是相对初始包含块定位的绝对定位容器，`body` 内边距影响不到它，
 *    它的宽度只能靠上面的槽位预留保证。
 * 3. 解锁必须原样还原内联样式，避免与其它滚动锁调用点互相污染。
 */

export type ScrollLockRelease = () => void;

/**
 * 锁定页面滚动，返回解锁函数（幂等）。
 *
 * 只改内联样式，不引入持久状态：多次调用会以最后一次的原始值为基准，
 * 解锁函数只还原自己写入的内容。
 */
export function lockPageScroll(): ScrollLockRelease {
	const body = document.body;
	const previousOverflow = body.style.overflow;
	const previousPaddingInlineEnd = body.style.paddingInlineEnd;

	const widthBefore = body.getBoundingClientRect().width;
	body.style.overflow = "hidden";
	const growth = Math.round(body.getBoundingClientRect().width - widthBefore);

	// 只有布局真的变宽（滚动条确实消失且槽位未预留）才补偿
	if (growth > 0) {
		const currentPadding =
			Number.parseFloat(getComputedStyle(body).paddingInlineEnd) || 0;
		body.style.paddingInlineEnd = `${currentPadding + growth}px`;
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		body.style.overflow = previousOverflow;
		body.style.paddingInlineEnd = previousPaddingInlineEnd;
	};
}
