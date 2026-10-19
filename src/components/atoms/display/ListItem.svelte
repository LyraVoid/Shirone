<script lang="ts">
import type { Snippet } from "svelte";

/**
 * M3E ListItem — 列表项原子（官方 ListItem.kt 移植）。
 * 行高按内容自动：仅 headline 56dp（官方 ContainerHeight）/ 两行 72dp /
 * 三行 88dp（overline + headline + supporting）。
 * headline 用 label-large、supporting body-medium、overline label-small
 * （官方 ListTokens ItemLabelTextFont/ItemSupportingTextFont/ItemOverlineFont）。
 * leading 40dp（图标/头像）、trailing 24dp（官方 ItemLeading/ItemTrailing）。
 * onClick 传入渲染为 button（可点击/选中态），否则 div。
 *
 * 用法：<ListItem headline="标题" supporting="副标题" leading={snippet} trailing={snippet} />
 *      <ListItem headline="项" onClick={...} selected={...} />
 */
let {
	headline,
	overLine,
	supporting,
	leading,
	trailing,
	selected = false,
	onClick,
	class: className = "",
}: {
	/** 主标题（string 或 snippet，label-large） */
	headline: string | import("svelte").Snippet;
	/** 上标（string 或 snippet，label-small） */
	overLine?: string | import("svelte").Snippet;
	/** 副标题（string 或 snippet，body-medium） */
	supporting?: string | import("svelte").Snippet;
	/** 前导插槽（40dp 图标/头像） */
	leading?: import("svelte").Snippet;
	/** 尾部插槽（24dp 图标/开关等） */
	trailing?: import("svelte").Snippet;
	/** 选中态（背景 secondary-container 圆角） */
	selected?: boolean;
	/** 传入渲染为可点击 button */
	onClick?: (e: MouseEvent) => void;
	class?: string;
} = $props();

const twoLine = $derived(!!supporting || !!overLine);
const threeLine = $derived(!!overLine && !!supporting);
</script>

{#if onClick}
    <button
        class="m3-list-item {className}"
        class:m3-list-item--two-line={twoLine && !threeLine}
        class:m3-list-item--three-line={threeLine}
        class:m3-list-item--selected={selected}
        class:m3-list-item--clickable={true}
        onclick={onClick}
        aria-pressed={selected}
    >
        {@render slotInner(leading, overLine, headline, supporting, trailing)}
    </button>
{:else}
    <div
        class="m3-list-item {className}"
        class:m3-list-item--two-line={twoLine && !threeLine}
        class:m3-list-item--three-line={threeLine}
        class:m3-list-item--selected={selected}
    >
        {@render slotInner(leading, overLine, headline, supporting, trailing)}
    </div>
{/if}

{#snippet slotInner(
    leading: Snippet | undefined,
    overLine: string | Snippet | undefined,
    headline: string | Snippet,
    supporting: string | Snippet | undefined,
    trailing: Snippet | undefined,
)}
    {#if leading}
        <div class="m3-list-item__leading">{@render leading()}</div>
    {/if}
    <div class="m3-list-item__content">
        {#if overLine}
            <div class="m3-list-item__overline">
                {#if typeof overLine === "string"}{overLine}{:else}{@render overLine()}{/if}
            </div>
        {/if}
        <div class="m3-list-item__headline">
            {#if typeof headline === "string"}{headline}{:else}{@render headline()}{/if}
        </div>
        {#if supporting}
            <div class="m3-list-item__supporting">
                {#if typeof supporting === "string"}{supporting}{:else}{@render supporting()}{/if}
            </div>
        {/if}
    </div>
    {#if trailing}
        <div class="m3-list-item__trailing">{@render trailing()}</div>
    {/if}
{/snippet}

<style lang="stylus">
.m3-list-item
    display: flex
    align-items: center
    gap: 16px
    width: 100%
    min-height: 56px
    box-sizing: border-box
    padding: 8px 16px
    border: none
    border-radius: var(--shape-corner-s)
    background: none
    color: var(--on-surface)
    text-align: inherit
    font: inherit
    cursor: default
    transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

    &--two-line
        min-height: 72px

    &--three-line
        min-height: 88px

    &--selected
        background: var(--secondary-container)
        color: var(--on-secondary-container)

    &--clickable
        cursor: pointer
        &:hover
            background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")
        &:focus-visible
            outline: 2px solid var(--secondary)
            outline-offset: -2px

    &--selected.m3-list-item--clickable:hover
        background: unquote("color-mix(in oklab, var(--on-secondary-container) 8%, var(--secondary-container))")

    &__leading
        display: flex
        align-items: center
        flex: none
        color: var(--on-surface-variant)
        > :global(svg)
            width: 1.5rem
            height: 1.5rem

    &--selected &__leading
        color: var(--on-secondary-container)

    &__content
        flex: 1
        min-width: 0
        display: flex
        flex-direction: column

    &__overline
        font: var(--m3e-type-label-small)
        color: var(--on-surface-variant)

    &__headline
        font: var(--m3e-type-label-large)
        color: var(--on-surface)
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis

    &--selected &__headline
        color: var(--on-secondary-container)

    &__supporting
        font: var(--m3e-type-body-medium)
        color: var(--on-surface-variant)
        display: -webkit-box
        -webkit-line-clamp: 2
        -webkit-box-orient: vertical
        overflow: hidden

    &__trailing
        display: flex
        align-items: center
        flex: none
        color: var(--on-surface-variant)
        > :global(svg)
            width: 1.5rem
            height: 1.5rem
</style>
