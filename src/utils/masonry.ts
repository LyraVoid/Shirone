/**
 * 瀑布流打包（grid row-span 实现，无绝对定位）：
 * 卡片保持文档流与语义，仅由 JS 赋 `grid-column-start`（最短列分配，
 * 顺序接近行主序）与 `grid-row-end: span N`（N = 卡片高度换算的行数）。
 * 列数仍由 CSS `repeat(auto-fill, minmax(--post-card-min, 1fr))` 决定，
 * 本模块只做分配——容器换列数（resize）后重新 pack 即可。
 *
 * 配套约定（PostPage / Project / Device 样式，需同步改）：
 * - grid 模式 `grid-auto-rows: 8px`、`row-gap: 0`（行距烘焙进 span）；
 * - 行距 = ROW_GAP px（与 column-gap 同值，均对应 --m3e-space-4）。
 *
 * 单列时分两种：低于该断言行距是真实 `gap`、行高 `auto`，清空定位即可；
 * 达到断点而容器仍只放得下一列时，必须照样写 span，否则卡片只占一行
 * 8px、内容溢出并与下一张重叠。
 */

const ROW_UNIT = 8; // px，对应 PostPage grid-auto-rows
const ROW_GAP = 16; // px，烘焙进 span 的视觉行距（--m3e-space-4）

/**
 * 最短列打包：给每张卡片设置列定位与行跨度。
 * 单列时是否写 span 取决于 CSS 是否把行距烘焙进了 span（见下）。
 */
export function packMasonry(container: HTMLElement): void {
	const cards = Array.from(container.children) as HTMLElement[];
	if (cards.length === 0) return;

	for (const card of cards) {
		card.style.gridColumnStart = "";
		card.style.gridColumnEnd = "";
		card.style.gridRowEnd = "";
	}

	const computed = getComputedStyle(container);
	const template = computed.gridTemplateColumns;
	// `none` means the grid has no used tracks — the container or an ancestor is
	// `display: none`. Children then measure 0px, so any span derived from that
	// would be wrong; the ResizeObserver repacks once it becomes visible.
	if (!template || template === "none") return;

	const colCount = template.split(" ").filter(Boolean).length;
	if (colCount === 0) return;

	// The ≥md media query bakes the row gap into each card's span:
	// `grid-auto-rows: 8px` makes every implicit row 8px tall and `row-gap: 0`
	// removes the gap, so a card's real footprint is
	// `ceil((height + ROW_GAP) / ROW_UNIT)` rows. Below that breakpoint neither
	// declaration applies, the rows are `auto` and the gap is a real `gap`, so a
	// card left at its default one-row span already occupies its natural height.
	//
	// That is why a single-column early return used to be safe on mobile and
	// broken on a narrow desktop: at ≥md with one column, clearing the spans
	// leaves every card spanning one 8px row while its content is hundreds of
	// pixels tall, so the next card is placed immediately after and the two
	// overlap. Reading the mode from the computed style rather than assuming it
	// from the column count is what keeps both cases correct.
	const bakesRowGapIntoSpans =
		computed.gridAutoRows !== "auto" && computed.gridAutoRows !== "normal";

	if (colCount === 1) {
		if (!bakesRowGapIntoSpans) return;
		for (const card of cards) {
			card.style.gridRowEnd = `span ${Math.ceil(
				(card.offsetHeight + ROW_GAP) / ROW_UNIT,
			)}`;
		}
		return;
	}

	const measurements = cards.map((card) => {
		const height = card.offsetHeight;
		const gridColumnEnd = getComputedStyle(card).gridColumnEnd;
		const spanMatch = gridColumnEnd.match(/span\s+(\d+)/);
		const dataSpan = Number.parseInt(card.dataset.masonrySpan ?? "", 10);
		const span = Math.min(
			Math.max(
				Number.isFinite(dataSpan)
					? dataSpan
					: spanMatch
						? Number.parseInt(spanMatch[1], 10)
						: 1,
				1,
			),
			colCount,
		);
		return { card, height, span };
	});

	const columnHeights = new Array<number>(colCount).fill(0);
	const plans = [];

	for (const { card, height, span } of measurements) {
		let shortest = 0;
		let shortestHeight = Number.POSITIVE_INFINITY;
		for (let col = 0; col <= colCount - span; col++) {
			const candidateHeight = Math.max(...columnHeights.slice(col, col + span));
			if (candidateHeight < shortestHeight) {
				shortest = col;
				shortestHeight = candidateHeight;
			}
		}
		plans.push({
			card,
			colStart: String(shortest + 1),
			colEnd: `span ${span}`,
			rowEnd: `span ${Math.ceil((height + ROW_GAP) / ROW_UNIT)}`,
		});
		for (let col = shortest; col < shortest + span; col++) {
			columnHeights[col] = shortestHeight + height + ROW_GAP;
		}
	}

	for (const plan of plans) {
		plan.card.style.gridColumnStart = plan.colStart;
		plan.card.style.gridColumnEnd = plan.colEnd;
		plan.card.style.gridRowEnd = plan.rowEnd;
	}
}

/**
 * 挂接瀑布流生命周期：立即 pack + 容器宽度变化（换列数）时重排。
 * swup 内容替换后容器是新元素，需对新区块重新调用；模块只持有一个
 * observer，观察新容器前断开旧的，避免每次导航泄漏一份 observer + 旧树。
 */
let masonryObserver: ResizeObserver | null = null;
let masonryContainer: HTMLElement | null = null;
let masonryFrameId: number | null = null;

export function setupMasonry(container: HTMLElement): void {
	packMasonry(container);
	if (typeof ResizeObserver === "undefined") return;
	if (!masonryObserver) {
		masonryObserver = new ResizeObserver(() => {
			const target = masonryContainer;
			if (!target) return;
			if (!target.isConnected) {
				// 容器已被 swup 替换丢弃：断开并释放引用，让旧子树整体可回收
				masonryObserver?.disconnect();
				masonryContainer = null;
				return;
			}
			if (masonryFrameId !== null) cancelAnimationFrame(masonryFrameId);
			masonryFrameId = requestAnimationFrame(() => {
				masonryFrameId = null;
				packMasonry(target);
			});
		});
	}
	masonryObserver.disconnect();
	masonryContainer = container;
	masonryObserver.observe(container);
}
