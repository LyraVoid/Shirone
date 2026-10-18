<script lang="ts">
/**
 * M3E ButtonGroup — 按钮组原子（官方 ButtonGroup.kt 移植，数据驱动版）。
 * 40dp 高。两项变体：
 * - standard：12px 间距，每项独立 pill（ToggleButton 默认形状变形）
 * - connected：2px 间距；首项（外侧全圆 + 内侧 8px）、中间项（4dp 圆角）、
 *   尾项（外侧全圆 + 内侧 8px）；按压时内角 8→4px；选中项变全圆 pill
 *   （官方 ConnectedButtonGroup tokens + connectedButtonCheckedShape）
 * - 溢出指示器：ResizeObserver 测量，容器宽度不足时溢出项折叠进「更多」菜单
 *   （官方 ButtonGroupMeasurePolicy + OverflowIndicator）
 * - animateWidth：按压时 active 项宽度 ×1.15、其余项等比例压缩（官方
 *   expandedRatio 0.15 + expand/compress 逻辑，JS 宽度交换）
 *
 * 单选：value（$bindable）；多选：multiple + checkedValues（$bindable）。
 * 官方 weight 布局未实现（TODO）。
 */
import Icon from "@iconify/svelte";
import { onMount, tick, untrack } from "svelte";
import Menu from "../navigation/Menu.svelte";
import ToggleButton from "./ToggleButton.svelte";

export interface ButtonGroupItem {
	value: string;
	label?: string;
	icon?: string;
	/** weight：>0 时按比例分配剩余空间（flex-basis 0），无 weight 项按内容宽 */
	weight?: number;
}

let {
	items = [],
	value = $bindable(""),
	checkedValues = $bindable([] as string[]),
	multiple = false,
	variant = "standard",
	disabled = false,
	class: className = "",
	onchange,
}: {
	items?: ButtonGroupItem[];
	value?: string;
	checkedValues?: string[];
	multiple?: boolean;
	variant?: "standard" | "connected";
	disabled?: boolean;
	class?: string;
	onchange?: (value: string | string[]) => void;
} = $props();

const gapPx = variant === "connected" ? 2 : 12;
const MORE_BTN_W = 40; // 溢出「更多」按钮宽（官方 FilledIconButton 40dp）

// === 溢出测量（官方 ButtonGroupMeasurePolicy） ===
let containerEl: HTMLDivElement;
let visibleCount = $state(items.length);
let moreOpen = $state(false);
let itemWidths = $state<number[]>([]);

function measure() {
	if (!containerEl) return;
	// 用父级宽度作为稳定约束：容器是 inline-flex，宽度跟随可见项数，
	// 若用自身宽度测量会形成「隐藏项 → 变窄 → 再测量」的自反馈振荡。
	const parent = containerEl.parentElement;
	let availW = containerEl.clientWidth;
	if (parent) {
		const cs = getComputedStyle(parent);
		const pl = Number.parseFloat(cs.paddingLeft) || 0;
		const pr = Number.parseFloat(cs.paddingRight) || 0;
		availW = parent.clientWidth - pl - pr;
	}
	const itemEls = [
		...containerEl.querySelectorAll<HTMLElement>(".m3-button-group__item"),
	];
	// 首次用实测宽度并缓存；后续（含隐藏项）用缓存避免 display:none 宽度为 0
	const ws = itemEls.map((el, i) => itemWidths[i] ?? el.offsetWidth);

	let used = 0;
	let count = 0;
	for (let i = 0; i < ws.length; i++) {
		const next = used + ws[i] + (count > 0 ? gapPx : 0);
		// 预留溢出按钮（40 + 间距）：若放不下全部且当前项放入会挤掉按钮则截断
		const needMore = i < ws.length - 1;
		const reserve = needMore ? MORE_BTN_W + gapPx : 0;
		if (next + reserve > availW) break;
		used = next;
		count++;
	}
	// 相同值 Svelte 不重渲染；布局由父级宽度驱动，无自反馈
	visibleCount = count;
	itemWidths = ws;
}

// RO 高频回调合并到单帧，避免测量 → 隐藏项 → 容器变窄 → 再测量 的振荡
let measureRaf: number | null = null;
function scheduleMeasure() {
	if (measureRaf !== null) return;
	measureRaf = requestAnimationFrame(() => {
		measureRaf = null;
		measure();
	});
}

// items 变化：清缓存、重置为全可见后重测
$effect(() => {
	items;
	untrack(() => {
		itemWidths = [];
		visibleCount = items.length;
		tick().then(() => {
			if (containerEl) {
				// 全部项先恢复可见以便测量
				containerEl
					.querySelectorAll(".m3-button-group__item--hidden")
					.forEach((el) => {
						el.classList.remove("m3-button-group__item--hidden");
					});
				measure();
			}
		});
	});
});

onMount(() => {
	// 观察父级（外部约束宽度），自身项隐藏引起的尺寸变化不触发重测，杜绝振荡
	const target = containerEl.parentElement ?? containerEl;
	const ro = new ResizeObserver(() => scheduleMeasure());
	ro.observe(target);
	tick().then(measure);
	return () => {
		ro.disconnect();
		if (measureRaf !== null) cancelAnimationFrame(measureRaf);
	};
});

// === animateWidth 宽度交换（官方 expand/compress） ===
function onItemPointerDown(i: number) {
	if (disabled || items.length < 2 || i >= visibleCount) return;
	const itemEls = [
		...containerEl.querySelectorAll<HTMLElement>(".m3-button-group__item"),
	].slice(0, visibleCount);
	const ws = itemEls.map((el) => el.offsetWidth);
	const active = ws[i];
	if (!active) return;
	const growth = Math.round(active * 0.15);
	const othersTotal = ws.reduce((s, w, j) => (j === i ? s : s + w), 0) || 1;
	let compressed = 0;
	ws.forEach((_, j) => {
		if (j === i) return;
		const share = Math.round((growth * ws[j]) / othersTotal);
		ws[j] -= share;
		compressed += share;
	});
	ws[i] = active + growth - (compressed - growth); // 修正舍入，总宽不变
	itemEls.forEach((el, j) => {
		el.style.width = `${ws[j]}px`;
	});
}

function resetWidths() {
	if (!containerEl) return;
	containerEl
		.querySelectorAll<HTMLElement>(".m3-button-group__item")
		.forEach((el) => {
			el.style.width = "";
		});
}

function onItemPointerUp() {
	resetWidths();
}

function isChecked(item: ButtonGroupItem) {
	return multiple ? checkedValues.includes(item.value) : value === item.value;
}

function handleChange(item: ButtonGroupItem) {
	if (multiple) {
		checkedValues = checkedValues.includes(item.value)
			? checkedValues.filter((v) => v !== item.value)
			: [...checkedValues, item.value];
		onchange?.(checkedValues);
	} else {
		value = item.value;
		onchange?.(value);
	}
}
</script>

<div
    class="m3-button-group m3-button-group--{variant} {className}"
    role="group"
    bind:this={containerEl}
    onpointerup={onItemPointerUp}
    onpointercancel={onItemPointerUp}
>
    {#each items as item, i (item.value)}
        <ToggleButton
            controlled
            variant={variant === "connected" ? "tonal" : "filled"}
            checked={isChecked(item)}
            disabled={disabled}
            onclick={() => handleChange(item)}
            onpointerdown={() => onItemPointerDown(i)}
            label={item.label}
            ariaLabel={item.label ?? item.value}
            style={item.weight ? `flex-grow: ${item.weight}` : undefined}
            class={"m3-button-group__item m3-button-group__item--" + (i === 0 ? "first" : i === items.length - 1 ? "last" : "middle") + (i >= visibleCount ? " m3-button-group__item--hidden" : "") + (item.weight ? " m3-button-group__item--weight" : "")}
        >
            {#if item.icon}
                <Icon icon={item.icon}></Icon>
            {/if}
        </ToggleButton>
    {/each}
    {#if items.length > visibleCount}
        <div class="m3-button-group__overflow">
            <button
                type="button"
                class="m3-button-group__more m3-state-layer"
                aria-label="更多选项"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                onclick={() => (moreOpen = !moreOpen)}
            >
                <Icon icon="material-symbols:more-vert"></Icon>
            </button>
            <Menu bind:open={moreOpen} label="更多选项" class="m3-button-group__menu">
                <div class="m3-menu-group">
                    {#each items.slice(visibleCount) as item}
                        <button
                            type="button"
                            class="m3-menu-item"
                            class:checked={isChecked(item)}
                            onclick={() => {
                                handleChange(item);
                                moreOpen = false;
                            }}
                        >
                            {#if item.icon}
                                <Icon icon={item.icon} class="m3-button-group__menu-icon" />
                            {/if}
                            {item.label ?? item.value}
                        </button>
                    {/each}
                </div>
            </Menu>
        </div>
    {/if}
</div>

<style lang="stylus">
.m3-button-group
    position: relative
    display: inline-flex
    align-items: stretch

    /* === standard：12px 间距（ButtonGroupSmallTokens.BetweenSpace） === */
    &--standard
        gap: 0.75rem

    /* === connected：2px 间距 + 首/中/尾形状 + 内角变形（官方 tokens） === */
    &--connected
        gap: 2px
        :global(.m3-toggle-button)
            border-radius: 4px
        /* 首项：外侧全圆 + 内侧 8px；按压内角 8→4px */
        :global(.m3-button-group__item--first)
            border-radius: var(--shape-corner-full) 8px 8px var(--shape-corner-full)
        :global(.m3-button-group__item--first:active)
            border-radius: var(--shape-corner-full) 4px 4px var(--shape-corner-full)
        /* 尾项：外侧全圆 + 内侧 8px；按压内角 8→4px */
        :global(.m3-button-group__item--last)
            border-radius: 8px var(--shape-corner-full) var(--shape-corner-full) 8px
        :global(.m3-button-group__item--last:active)
            border-radius: 4px var(--shape-corner-full) var(--shape-corner-full) 4px
        /* 选中项：全圆 pill（官方 connectedButtonCheckedShape = CornerFull） */
        :global(.m3-toggle-button--checked)
            border-radius: var(--shape-corner-full)

    /* 项：宽度交换动画（官方 animateWidth，总宽不变） */
    :global(.m3-button-group__item)
        flex: 0 0 auto
        transition:
            border-radius var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
            background-color var(--m3e-duration-medium) var(--m3e-easing-standard),
            color var(--m3e-duration-medium) var(--m3e-easing-standard),
            border-color var(--m3e-duration-medium) var(--m3e-easing-standard),
            box-shadow var(--m3e-duration-medium) var(--m3e-easing-standard),
            width var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

    /* weight 项（官方 NonAdaptiveButtonGroupMeasurePolicy）：flex-basis 0 + flex-grow
       按 weight 比例分配剩余空间；无 weight 项保持内容宽 */
    :global(.m3-button-group__item--weight)
        flex-basis: 0
        flex-shrink: 1

    /* 溢出项折叠进「更多」菜单 */
    :global(.m3-button-group__item--hidden)
        display: none

    /* === 溢出「更多」按钮（官方 FilledIconButton + DropdownMenu） === */
    &__overflow
        position: relative

    &__more
        display: flex
        align-items: center
        justify-content: center
        width: 2.5rem
        height: 2.5rem
        border: none
        border-radius: var(--shape-corner-full)
        background: var(--secondary-container)
        color: var(--on-secondary-container)
        --m3e-state-color: var(--on-secondary-container)
        cursor: pointer
        > :global(svg)
            width: 1.25rem
            height: 1.25rem

    &__menu
        position: absolute
        top: calc(100% + 0.25rem)
        right: 0

    :global(.m3-button-group__menu-icon)
        font-size: 1.25rem
        flex-shrink: 0
</style>
