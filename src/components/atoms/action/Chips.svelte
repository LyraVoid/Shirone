<script lang="ts">
import Icon from "@components/atoms/display/Icon.svelte";

/**
 * M3E Chips — M3 标签组原子（官方 Chip 移植，token 对齐 v0.192 md-comp-{assist,filter,input,suggestion}-chip）：
 * - 四种官方形态：assist（描边辅助，可带 primary 18px 前置图标）/ filter（筛选，选中 secondary-container + 勾选）/
 *   input（输入，可带 24px 头像或前置图标 + 尾部删除）/ suggestion（建议，描边 + primary 前置图标）；
 * - 容器 32px 高、corner-small（8px）、label-large；flex-wrap 自动换行，gap 8px（--m3e-chip-gap 可覆盖）；
 * - filter 支持单选（value）/ 多选（multiple + values），均 $bindable；input 点击切换选中；
 * - 交互：原生 button + m3-state-layer（hover/focus/pressed），filter 用 aria-pressed；
 *   input 删除按钮独立触发 onremove（默认图标 material-symbols:cancel，可 trailingIcon 覆盖）；
 * - disabled 整体 / 单 chip（item.disabled）均支持，禁用态 opacity 0.38；
 * - 通用场景：标签筛选、输入标签、搜索建议、辅助操作入口。
 */
export interface ChipItem {
	/** 唯一标识 */
	value: string;
	/** 显示文本（label-large） */
	label: string;
	/** 前置图标（Iconify 名，18px；assist/suggestion 为 primary，input 为 on-surface-variant） */
	leadingIcon?: string;
	/** input 头像图片 URL（24px 圆形，优先于 leadingIcon 显示） */
	avatar?: string;
	/** 自定义尾部图标（input chip；缺省且可删除时显示删除 ×） */
	trailingIcon?: string;
	/** 单 chip 禁用 */
	disabled?: boolean;
	/** input chip 是否显示删除按钮（默认 true） */
	removable?: boolean;
}

let {
	items = [] as ChipItem[],
	variant = "filter",
	value = $bindable(""),
	values = $bindable([] as string[]),
	multiple = false,
	disabled = false,
	onselect,
	onremove,
	onchange,
	class: className = "",
}: {
	/** 标签数据列表 */
	items?: ChipItem[];
	/** 形态：assist / filter（默认）/ input / suggestion */
	variant?: "assist" | "filter" | "input" | "suggestion";
	/** 单选选中值（filter 单选 / input 选中），$bindable */
	value?: string;
	/** 多选选中值（filter + multiple），$bindable */
	values?: string[];
	/** filter 多选模式 */
	multiple?: boolean;
	/** 整体禁用 */
	disabled?: boolean;
	/** 点击触发（assist/suggestion 点击、各形态选中变化均触发） */
	onselect?: (item: ChipItem) => void;
	/** input 删除按钮触发（由父级从 items 中移除） */
	onremove?: (item: ChipItem) => void;
	/** 选中值变化回调 */
	onchange?: (value: string) => void;
	class?: string;
} = $props();

function isSelected(item: ChipItem): boolean {
	if (variant === "filter")
		return multiple ? values.includes(item.value) : value === item.value;
	return value === item.value;
}

function handleSelect(item: ChipItem) {
	if (disabled || item.disabled) return;
	if (variant === "filter") {
		if (multiple) {
			values = values.includes(item.value)
				? values.filter((v) => v !== item.value)
				: [...values, item.value];
		} else {
			value = value === item.value ? "" : item.value;
		}
		onchange?.(item.value);
	} else if (variant === "input") {
		value = value === item.value ? "" : item.value;
		onchange?.(item.value);
	}
	onselect?.(item);
}

function handleRemove(item: ChipItem) {
	if (disabled || item.disabled) return;
	onremove?.(item);
}
</script>

<div class="m3-chips {className}">
	{#each items as item (item.value)}
		{@const selected = isSelected(item)}
		{@const chipDisabled = disabled || item.disabled}
		{#if variant === "input"}
			<span
				class="m3-chip m3-chip--input {selected ? "m3-chip--selected" : ""} m3-state-layer"
				class:m3-chip--disabled={chipDisabled}
			>
				<button
					type="button"
					class="m3-chip__action"
					disabled={chipDisabled}
					aria-pressed={selected}
					onclick={() => handleSelect(item)}
				>
					{#if item.avatar}
						<img class="m3-chip__avatar" src={item.avatar} alt="" />
					{:else if item.leadingIcon}
						<span class="m3-chip__icon" aria-hidden="true"><Icon icon={item.leadingIcon} /></span>
					{/if}
					<span class="m3-chip__label">{item.label}</span>
				</button>
				{#if item.removable !== false}
					<button
						type="button"
						class="m3-chip__remove"
						aria-label={"移除 " + item.label}
						disabled={chipDisabled}
						onclick={() => handleRemove(item)}
					>
						<Icon icon={item.trailingIcon ?? "material-symbols:cancel"} />
					</button>
				{/if}
			</span>
		{:else}
			<button
				type="button"
				class="m3-chip m3-chip--{variant} {selected ? "m3-chip--selected" : ""} m3-state-layer"
				class:m3-chip--disabled={chipDisabled}
				aria-pressed={variant === "filter" ? selected : undefined}
				disabled={chipDisabled}
				onclick={() => handleSelect(item)}
			>
				{#if variant === "filter" && selected}
					<span class="m3-chip__icon" aria-hidden="true"><Icon icon="material-symbols:check" /></span>
				{:else if item.leadingIcon}
					<span class="m3-chip__icon" aria-hidden="true"><Icon icon={item.leadingIcon} /></span>
				{/if}
				<span class="m3-chip__label">{item.label}</span>
			</button>
		{/if}
	{/each}
</div>

<style lang="stylus">
.m3-chips
	display: flex
	flex-wrap: wrap
	gap: var(--m3e-chip-gap, 0.5rem)

.m3-chip
	display: inline-flex
	flex-shrink: 0
	align-items: center
	box-sizing: border-box
	height: 2rem /* 32px */
	gap: 0.5rem
	padding: 0 1rem
	border: 1px solid var(--outline)
	border-radius: var(--shape-corner-s) /* corner-small 8px */
	background: transparent
	color: var(--on-surface)
	font: var(--m3e-type-label-large)
	white-space: nowrap
	cursor: pointer
	user-select: none
	--m3e-state-color: var(--on-surface)

	&--disabled
		opacity: 0.38
		pointer-events: none

	/* === 图标 === */
	&__icon, &__remove
		display: inline-flex
		align-items: center
		justify-content: center
		flex-shrink: 0

		> :global(svg)
			width: 18px
			height: 18px

	&__avatar
		width: 1.5rem /* 24px */
		height: 1.5rem
		border-radius: var(--shape-corner-full)
		object-fit: cover
		flex-shrink: 0

	/* === 形态 === */
	&--assist
		color: var(--on-surface)
		--m3e-state-color: var(--on-surface)

		.m3-chip__icon
			color: var(--primary) /* with-icon-icon-color */

	&--suggestion
		color: var(--on-surface-variant) /* suggestion label 用 on-surface-variant */
		--m3e-state-color: var(--on-surface-variant)

		.m3-chip__icon
			color: var(--primary)

	&--filter, &--input
		&.m3-chip--selected
			background: var(--secondary-container)
			color: var(--on-secondary-container)
			border-color: transparent
			--m3e-state-color: var(--on-secondary-container)

			.m3-chip__icon
				color: var(--on-secondary-container)

	/* === input 内部结构 === */
	&--input
		padding: 0 0.25rem 0 1rem /* 右侧给删除按钮留位 */

		.m3-chip__icon
			color: var(--on-surface-variant)

		&.m3-chip--selected .m3-chip__icon
			color: var(--on-secondary-container)

	&__action
		display: inline-flex
		align-items: center
		gap: 0.5rem
		height: 100%
		padding: 0
		border: none
		background: transparent
		color: inherit
		font: inherit
		cursor: pointer

	&__remove
		width: 1.5rem
		height: 1.5rem
		padding: 0
		border: none
		border-radius: var(--shape-corner-full)
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

		&:hover
			background: unquote("color-mix(in srgb, var(--on-surface-variant) 8%, transparent)")

		&:active
			background: unquote("color-mix(in srgb, var(--on-surface-variant) 12%, transparent)")
</style>
