<script lang="ts">
import Icon from "@iconify/svelte";

/**
 * M3E Autocomplete — M3 自动补全输入（官方 Autocomplete 移植，token 对齐 v0.192 md-comp-{filled,outlined}-autocomplete）：
 * - 输入框视觉与站点 TextField 一致（filled：--field-filled-bg + 下划线；outlined：surface + 描边）；
 * - 输入时按 label 过滤选项，菜单 surface-container + elevation-2 + corner-extra-small；
 * - 键盘：ArrowUp/Down 导航、Enter 选中、Esc 关闭、外部点击关闭；
 * - 允许自由输入（不强制命中选项），选中项回调 onselect / onchange。
 */
let acId = 0;
const menuId = `m3-autocomplete-menu-${++acId}`;

let {
	value = $bindable(""),
	options = [],
	variant = "filled",
	label = "",
	placeholder = "",
	disabled = false,
	helper = "",
	error = "",
	onselect,
	onchange,
	class: className = "",
	style = "",
}: {
	/** 输入文本（$bindable） */
	value?: string;
	/** 选项：{ value, label, leading? } */
	options?: { value: string; label: string; leading?: string }[];
	/** filled（默认）/ outlined */
	variant?: "filled" | "outlined";
	label?: string;
	placeholder?: string;
	disabled?: boolean;
	/** 辅助提示 */
	helper?: string;
	/** 错误提示（非空进入 error 态） */
	error?: string;
	/** 选中选项回调 */
	onselect?: (option: {
		value: string;
		label: string;
		leading?: string;
	}) => void;
	/** 文本变化回调 */
	onchange?: (value: string) => void;
	class?: string;
	style?: string;
} = $props();

let open = $state(false);
let focused = $state(false);
let activeIndex = $state(-1);
let rootEl = $state<HTMLDivElement>();
let inputEl = $state<HTMLInputElement>();
let menuEl = $state<HTMLDivElement>();

const filtered = $derived(
	value
		? options.filter((o) => o.label.toLowerCase().includes(value.toLowerCase()))
		: options,
);

function selectOption(o: { value: string; label: string; leading?: string }) {
	value = o.label;
	open = false;
	activeIndex = -1;
	onselect?.(o);
	onchange?.(o.label);
	inputEl?.focus();
}

function positionMenu() {
	const r = rootEl;
	const m = menuEl;
	if (!r || !m) return;
	const rr = r.getBoundingClientRect();
	const mh = m.offsetHeight;
	const spaceBelow = window.innerHeight - rr.bottom - 8;
	const top = mh <= spaceBelow ? rr.bottom + 4 : Math.max(8, rr.top - mh - 4);
	m.style.left = `${rr.left}px`;
	m.style.top = `${top}px`;
	m.style.width = `${rr.width}px`;
}

function onInput() {
	open = true;
	activeIndex = filtered.length ? 0 : -1;
	onchange?.(value);
}

function onKeydown(e: KeyboardEvent) {
	if (disabled) return;
	if (e.key === "ArrowDown" || e.key === "ArrowUp") {
		e.preventDefault();
		if (!filtered.length) return;
		open = true;
		activeIndex =
			e.key === "ArrowDown"
				? (activeIndex + 1) % filtered.length
				: (activeIndex - 1 + filtered.length) % filtered.length;
	} else if (e.key === "Enter") {
		if (open && activeIndex >= 0 && filtered[activeIndex]) {
			e.preventDefault();
			selectOption(filtered[activeIndex]);
		}
	} else if (e.key === "Escape") {
		open = false;
		activeIndex = -1;
	}
}

function onBlur() {
	focused = false;
	/* 延迟让点击菜单项先触发 */
	setTimeout(() => {
		open = false;
		activeIndex = -1;
	}, 150);
}
</script>

<div
	bind:this={rootEl}
	class="m3-autocomplete m3-autocomplete--{variant} {className}"
	class:m3-autocomplete--focused={focused}
	class:m3-autocomplete--error={!!error}
	class:m3-autocomplete--open={open}
	{style}
>
	<div class="m3-autocomplete__field" class:m3-autocomplete__field--floated={!!label && (value || focused)}>
		<input
			bind:this={inputEl}
			bind:value
			class="m3-autocomplete__input"
			placeholder={focused ? placeholder : undefined}
			aria-label={label || placeholder}
			role="combobox"
			aria-expanded={open}
			aria-controls={menuId}
			aria-activedescendant={open && activeIndex >= 0 ? `m3-autocomplete-item-${activeIndex}` : undefined}
			disabled={disabled}
			onfocus={() => (focused = true)}
			onblur={onBlur}
			oninput={onInput}
			onkeydown={onKeydown}
		/>
		{#if label}
			<span
				class="m3-autocomplete__label"
				class:m3-autocomplete__label--float={value || focused}
			>{label}</span>
		{/if}
		{#if value}
			<button class="m3-autocomplete__clear" aria-label="清除" tabindex="-1"
				onclick={() => { value = ""; onchange?.(""); inputEl?.focus(); }}>
				<Icon icon="material-symbols:close" />
			</button>
		{/if}
	</div>
	<span class="m3-autocomplete__underline" aria-hidden="true"></span>
	{#if error}
		<span class="m3-autocomplete__error">{error}</span>
	{:else if helper}
		<span class="m3-autocomplete__helper">{helper}</span>
	{/if}

	{#if open && filtered.length}
		<div id={menuId} bind:this={menuEl} class="m3-autocomplete__menu" role="listbox">
			{#each filtered as o, i (o.value)}
				<button
					id={`m3-autocomplete-item-${i}`}
					class="m3-autocomplete__item"
					class:m3-autocomplete__item--active={i === activeIndex}
					role="option"
					aria-selected={i === activeIndex}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => selectOption(o)}
					onmouseenter={() => (activeIndex = i)}
				>
					{#if o.leading}
						<Icon icon={o.leading} class="m3-autocomplete__item-icon" />
					{/if}
					<span class="m3-autocomplete__item-label">{o.label}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style lang="stylus">
.m3-autocomplete
	position: relative
	box-sizing: border-box
	color: var(--on-surface)
	font: var(--m3e-type-body-large)
	transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard), border-color var(--m3e-duration-short) var(--m3e-easing-standard)

	&--filled
		.m3-autocomplete__field
			border-radius: var(--shape-corner-m) 0 0 var(--shape-corner-m)
			background: var(--field-filled-bg)

		&:hover .m3-autocomplete__field
			background: unquote("color-mix(in oklab, var(--on-surface) 12%, var(--field-filled-bg))")

		&.m3-autocomplete--focused .m3-autocomplete__field
			background: unquote("color-mix(in oklab, var(--on-surface) 16%, var(--field-filled-bg))")

	&--outlined
		.m3-autocomplete__field
			border-radius: var(--shape-corner-xs)
			border: 1px solid var(--outline-variant)
			background: var(--surface)

		&:hover .m3-autocomplete__field
			border-color: var(--outline)

		&.m3-autocomplete--focused .m3-autocomplete__field
			border-color: var(--primary)
			border-width: 2px

	&--error
		&.m3-autocomplete--filled .m3-autocomplete__underline
			opacity: 1
			transform: scaleX(1)
			background: var(--error)

		&.m3-autocomplete--outlined .m3-autocomplete__field
			border-color: var(--error)
			border-width: 2px

		--m3-ac-label-color: var(--error)

	.m3-autocomplete__field
		position: relative
		display: flex
		align-items: center
		height: 3rem /* 48px */
		padding: 0 1rem
		box-sizing: border-box
		overflow: hidden

	.m3-autocomplete__input
		flex: 1
		min-width: 0
		background: transparent
		border: none
		outline: none
		color: var(--on-surface)
		caret-color: var(--primary)
		font: inherit
		transition: padding-top var(--m3e-duration-short) var(--m3e-easing-standard)

		&::placeholder
			color: var(--on-surface-variant)

		&:disabled
			opacity: 0.38

	.m3-autocomplete__field--floated .m3-autocomplete__input
		padding-top: 0.625rem /* 10px：文字轻微下移避开浮动 label */

	.m3-autocomplete__label
		position: absolute
		left: 1rem
		top: 50%
		transform: translateY(-50%)
		font: var(--m3e-type-body-large)
		color: var(--on-surface-variant)
		pointer-events: none
		transition: all var(--m3e-duration-short) var(--m3e-easing-standard)

		&--float
			top: 0.25rem /* 4px：顶部留白，不贴边 */
			transform: none
			font: var(--m3e-type-body-small)
			color: var(--m3-ac-label-color, var(--primary))

	.m3-autocomplete__clear
		display: inline-flex
		align-items: center
		justify-content: center
		width: 1.5rem
		height: 1.5rem
		padding: 0
		border: none
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		flex-shrink: 0

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

	.m3-autocomplete__underline
		position: absolute
		left: 0.5rem
		right: 0.5rem
		bottom: 0
		height: 2px
		border-radius: var(--shape-corner-full)
		background: var(--primary)
		opacity: 0
		transform: scaleX(0.5)
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard), transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)

	&--filled &__underline
		display: block

	&--filled.m3-autocomplete--focused &__underline
		opacity: 1
		transform: scaleX(1)

	.m3-autocomplete__error,
	.m3-autocomplete__helper
		display: block
		margin-top: 4px
		padding: 0 1rem
		font: var(--m3e-type-label-small)
		color: var(--error)

	.m3-autocomplete__helper
		color: var(--on-surface-variant)

	.m3-autocomplete__menu
		position: fixed
		z-index: 200
		background: var(--surface-container)
		border-radius: var(--shape-corner-xs) /* corner-extra-small 4px */
		box-shadow: var(--m3e-elevation-2)
		padding: 0.25rem 0
		box-sizing: border-box
		overflow: hidden auto
		max-height: 16rem

	.m3-autocomplete__item
		display: flex
		align-items: center
		gap: 0.75rem
		width: 100%
		height: 3rem /* 48px */
		padding: 0 1rem
		border: none
		background: transparent
		color: var(--on-surface)
		font: var(--m3e-type-body-large)
		text-align: start
		cursor: pointer

		&--active
			background: unquote("color-mix(in oklab, var(--on-surface) 12%, transparent)")

		.m3-autocomplete__item-icon
			width: 1.25rem
			height: 1.25rem
			color: var(--on-surface-variant)
			flex-shrink: 0

		.m3-autocomplete__item-label
			flex: 1
			min-width: 0
			overflow: hidden
			text-overflow: ellipsis
			white-space: nowrap
</style>