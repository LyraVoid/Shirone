<script lang="ts">
/**
 * M3E Menu — M3E 菜单原子（受控容器）。
 * 父级持有触发器与定位（渲染时可用 class 控制位置/显隐）；
 * 本组件负责容器样式、role="menu"、ESC 关闭与点击外部关闭。
 * 插槽内放 <button class="m3-menu-item"> 项（样式由本组件 :global 提供）。
 * variant: standard（surface 基，默认）/ vibrant（tertiary 基，高强调，慎用）。
 * 菜单项状态：.selected（单选高亮）/ .checked（勾选）；分组用 .m3-menu-group（组间距 2px）。
 */

import {
	announceMenuOpened,
	MENU_EXCLUSIVE_EVENT,
	nextMenuInstanceId,
} from "@utils/menu-bus";
import { onMount } from "svelte";

let {
	open = $bindable(false),
	label = "",
	variant = "standard",
	exclusive = true,
	class: className = "",
}: {
	open?: boolean;
	label?: string;
	variant?: "standard" | "vibrant";
	exclusive?: boolean;
	class?: string;
} = $props();

const instanceId = nextMenuInstanceId();

// 互斥单开：打开时广播，其他同总线实例自动关闭。
// 延迟一个宏任务广播，让触发交互（导致 open=true 的点击）先完成。
$effect(() => {
	if (!exclusive || !open) return;
	const t = setTimeout(() => announceMenuOpened(instanceId), 0);
	return () => clearTimeout(t);
});

onMount(() => {
	const onExclusive = (e: Event) => {
		const detail = (e as CustomEvent).detail;
		if (detail?.instanceId !== instanceId && open) open = false;
	};
	document.addEventListener(MENU_EXCLUSIVE_EVENT, onExclusive);
	return () => document.removeEventListener(MENU_EXCLUSIVE_EVENT, onExclusive);
});

let menuEl = $state<HTMLDivElement | undefined>();

// open 为 true 时挂 ESC + 外部点击关闭。
// 延迟一个宏任务再挂载：触发按钮本次点击（导致 open=true 的事件）会冒泡到
// document，若不延迟会被误判为「菜单外部点击」而立即关闭（真实点击下复现）。
$effect(() => {
	if (!open) return;
	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape") open = false;
	};
	const onClick = (e: MouseEvent) => {
		if (menuEl && !menuEl.contains(e.target as Node)) {
			// 点击落在其他菜单（role="menu"）内时不关闭，支持多菜单共存
			if ((e.target as Node).closest?.('[role="menu"]')) return;
			open = false;
		}
	};
	const timer = setTimeout(() => {
		document.addEventListener("keydown", onKeydown);
		document.addEventListener("click", onClick);
	}, 0);
	return () => {
		clearTimeout(timer);
		document.removeEventListener("keydown", onKeydown);
		document.removeEventListener("click", onClick);
	};
});
</script>

<div
    class="m3-menu m3-menu--{variant} {className}"
    class:closed={!open}
    role="menu"
    aria-label={label}
    bind:this={menuEl}
>
    <slot />
</div>

<style lang="stylus">
.m3-menu
    min-width: 7rem
    max-width: 17.5rem
    width: max-content
    padding: 0.5rem 0.25rem
    border-radius: var(--shape-corner-xs)
    /* StandardMenuTokens.ContainerColor = SurfaceContainerLow. */
    background: var(--surface-container-low)
    box-shadow: var(--m3e-elevation-2)
    max-height: 20rem
    overflow-y: auto
    /* 展开动画（官方 DropdownMenu transition：scale 0.8→1 + fade，
       FastSpatial/FastEffects spring 近似）。--menu-origin 按锚点缩放，
       调用方可覆盖（默认 top center 下拉）。展开态 transition 控制进入 */
    transform-origin: var(--menu-origin, top center)
    transform: scale(1)
    transition:
        opacity var(--m3e-duration-short) var(--m3e-easing-standard),
        transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
        visibility var(--m3e-duration-medium)

    /* 关闭时自隐藏（父级仅需控制 open 与定位）；收起更快 + 缩小淡出 */
    &.closed
        visibility: hidden
        opacity: 0
        transform: scale(0.8)
        pointer-events: none
        transition:
            opacity var(--m3e-duration-short) var(--m3e-easing-standard),
            transform var(--m3e-duration-short) var(--m3e-easing-emphasized-accelerate),
            visibility var(--m3e-duration-short)

    :global(.m3-menu-item)
        display: flex
        align-items: center
        gap: 0.75rem
        width: 100%
        min-height: 3rem
        padding: 0 0.75rem
        border: none
        border-radius: var(--shape-corner-s)
        background: transparent
        color: var(--on-surface)
        font: var(--m3e-type-label-large)
        text-align: left
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis
        cursor: pointer
        transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)
        /* Keep a fallback hover for consumers that do not opt into m3-state-layer. */
        &:not(.m3-state-layer):hover
            background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")
        &:focus-visible
            outline: 2px solid var(--primary)
            outline-offset: -2px

    /* 选中/勾选态（M3 菜单规范）：.selected 单选高亮、.checked 勾选 */
    :global(.m3-menu-item.selected),
    :global(.m3-menu-item.checked)
        background: var(--tertiary-container)
        color: var(--on-tertiary-container)

    /* 勾选图标动画（官方 expandHorizontally + fadeIn）：调用方给 check 图标加该类 */
    :global(.m3-menu-item__check)
        transform: scaleX(0)
        opacity: 0
        transition:
            transform var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate),
            opacity var(--m3e-duration-short) var(--m3e-easing-standard)

    :global(.m3-menu-item.selected .m3-menu-item__check),
    :global(.m3-menu-item.checked .m3-menu-item__check)
        transform: scaleX(1)
        opacity: 1

    /* 菜单项结构辅助类（调用方组织，Menu 提供样式）：
       __trailing 右对齐内容（官方 trailingContent）；
       __content 垂直排列 label + supportingText */
    :global(.m3-menu-item__trailing)
        margin-left: auto
        display: flex
        align-items: center

    :global(.m3-menu-item__content)
        display: flex
        flex-direction: column
        min-width: 0

    :global(.m3-menu-item__label)
        white-space: nowrap

    :global(.m3-menu-item__supporting)
        font: var(--m3e-type-body-small)
        color: var(--on-surface-variant)
        white-space: nowrap

    :global(.m3-menu-item:disabled)
        color: unquote("color-mix(in oklab, var(--on-surface) 38%, transparent)")
        cursor: default
        pointer-events: none

    /* 分组（官方 SegmentedMenuTokens）：surface-container-low 背景 + 4px padding，
       组间 2px 间距；hover 聚焦时圆角 8→16 变形（FastSpatial 动效感） */
    :global(.m3-menu-group)
        padding: 0.25rem
        border-radius: var(--shape-corner-s)
        background: var(--surface-container-low)
        transition: border-radius var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

        &:hover
            border-radius: var(--shape-corner-l)

    :global(.m3-menu-group + .m3-menu-group)
        margin-top: 2px

    /* === vibrant 变体：tertiary 基，高强调（官方 VibrantMenuTokens） === */
    &--vibrant
        background: var(--tertiary-container)
        color: var(--on-tertiary-container)
        :global(.m3-menu-item)
            color: var(--on-tertiary-container)
            &:hover
                background: unquote("color-mix(in oklab, var(--on-tertiary-container) 8%, transparent)")
            &:focus-visible
                outline: 2px solid var(--tertiary)
        :global(.m3-menu-item.selected),
        :global(.m3-menu-item.checked)
            background: var(--tertiary)
            color: var(--on-tertiary)
</style>
