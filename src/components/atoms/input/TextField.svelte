<script lang="ts">
/**
 * M3E TextField — M3 文本输入原子（官方 TextField 移植）。
 * variant: filled（默认，surface-container-high + 底部下划线 focus 亮起）/
 *          outlined（surface + outline-variant 1px 边框 + focus primary 2px）。
 * error：错误态（下划线/边框变 error 色 + 可选错误提示）。
 * label 浮动（focus/有值时上浮顶部），leading/trailing 图标或操作用命名插槽。
 * hideLabel：label 只作为 aria-label（无障碍名），不渲染可见浮动标签。
 */
let {
	type = "text",
	placeholder = "",
	value = $bindable(""),
	name = "",
	id = "",
	label = "",
	/** 为 true 时 label 仅作 aria-label，不渲染可见浮动标签 */
	hideLabel = false,
	variant = "filled",
	error = "",
	disabled = false,
	autocomplete = "",
	onfocus = () => {},
	oninput = () => {},
	onblur = () => {},
	class: className = "",
}: {
	type?: string;
	placeholder?: string;
	value?: string;
	name?: string;
	id?: string;
	label?: string;
	hideLabel?: boolean;
	/** filled（默认）/ outlined */
	variant?: "filled" | "outlined";
	/** 错误提示（非空时错误态：error 色下划线/边框 + 提示文字） */
	error?: string;
	disabled?: boolean;
	autocomplete?: string;
	onfocus?: () => void;
	oninput?: () => void;
	onblur?: () => void;
	class?: string;
} = $props();

let focused = $state(false);
</script>

<div
    class="m3-text-field m3-text-field--{variant} {className}"
    class:m3-text-field--error={!!error}
    class:m3-text-field--focused={focused}
>
    <span class="m3-text-field__icon"><slot name="leading" /></span>
    <div class="m3-text-field__field">
        <input
            {type}
            {name}
            {id}
            bind:value
            placeholder={hideLabel ? placeholder : focused ? placeholder : undefined}
            aria-label={label || placeholder}
            aria-invalid={error ? "true" : undefined}
            aria-describedby={error && id ? `${id}-error` : undefined}
            {disabled}
            autocomplete={autocomplete || undefined}
            onfocus={() => {
                focused = true;
                onfocus();
            }}
            onblur={() => {
                focused = false;
                onblur();
            }}
            {oninput}
        />
        {#if label && !hideLabel}
            <span
                class="m3-text-field__label"
                class:m3-text-field__label--float={value || focused}
            >
                {label}
            </span>
        {/if}
    </div>
    <span class="m3-text-field__trailing"><slot name="trailing" /></span>
    <span class="m3-text-field__underline" aria-hidden="true"></span>
    {#if error}
        <span id={id ? `${id}-error` : undefined} class="m3-text-field__error" aria-live="polite">{error}</span>
    {/if}
</div>

<style lang="stylus">
.m3-text-field
    position: relative
    display: flex
    align-items: center
    gap: 0.75rem
    width: 100%
    min-width: 0
    height: 3rem
    box-sizing: border-box
    color: var(--on-surface)
    font: var(--m3e-type-body-large)
    transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard), border-color var(--m3e-duration-short) var(--m3e-easing-standard)

    /* ===== filled（默认）：surface-container-high + 底部下划线 ===== */
    &--filled
        padding: 0 1rem
        border-radius: var(--shape-corner-m)
        background: var(--surface-container-high)
        &:hover
            background: unquote("color-mix(in oklab, var(--on-surface) 12%, var(--surface-container-high))")
        &:focus-within
            background: unquote("color-mix(in oklab, var(--on-surface) 16%, var(--surface-container-high))")

    /* ===== outlined：surface + 边框线 ===== */
    &--outlined
        padding: 0 1rem
        border-radius: var(--shape-corner-xs)
        border: 1px solid var(--outline-variant)
        background: var(--surface)
        &:hover
            border-color: var(--outline)
        &:focus-within
            border-color: var(--primary)
            border-width: 2px

    /* 错误态：下划线/边框变 error */
    &--error.m3-text-field--filled &__underline
        opacity: 1
        transform: scaleX(1)
        background: var(--error)

    &--error.m3-text-field--outlined
        border-color: var(--error)
        border-width: 2px
        &:hover
            border-color: var(--error)

    &__icon,
    &__trailing
        display: flex
        align-items: center
        flex: none
        color: var(--on-surface-variant)
        font-size: 1.25rem
        line-height: 1

    &__icon:empty,
    &__trailing:empty
        display: none

    &__field
        position: relative
        flex: 1
        min-width: 0
        display: flex
        align-items: center
        height: 100%

    input
        width: 100% /* 确保输入框填满弹性容器并覆盖浏览器默认内在尺寸 */
        flex: 1
        min-width: 0
        background: transparent
        border: none
        outline: none
        color: var(--on-surface)
        caret-color: var(--primary)
        font: inherit
        &::placeholder
            color: var(--on-surface-variant)
        &:disabled
            cursor: not-allowed

    &:has(input:disabled)
        opacity: 0.38
        pointer-events: none

    /* 浮动 label：focus/有值时上浮顶部（M3 标准） */
    &__label
        position: absolute
        left: 0
        top: 50%
        transform: translateY(-50%)
        font: var(--m3e-type-body-large)
        color: var(--on-surface-variant)
        pointer-events: none
        transition: all var(--m3e-duration-short) var(--m3e-easing-standard)

        &--float
            top: 0
            transform: none
            font: var(--m3e-type-body-small)
            color: var(--primary)

    &--error &__label--float
        color: var(--error)

    /* filled 下划线 */
    &__underline
        position: absolute
        left: 0.5rem
        right: 0.5rem
        bottom: 0.25rem
        height: 2px
        border-radius: var(--shape-corner-full)
        background: var(--primary)
        opacity: 0
        transform: scaleX(0.5)
        transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard), transform var(--m3e-duration-short) var(--m3e-easing-emphasized-decelerate)

    &--filled &__underline
        display: block

    &--filled:focus-within &__underline
        opacity: 1
        transform: scaleX(1)

    &__error
        position: absolute
        top: 100%
        left: 1rem
        margin-top: 4px
        font: var(--m3e-type-label-small)
        color: var(--error)
</style>
