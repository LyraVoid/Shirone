<script lang="ts">
/**
 * M3E DateInput — 日期文本输入原子（官方 DateInputTextField 移植的独立版）。
 * 输入按 YYYY/MM/DD 自动分段（官方 DateInputFormat），blur/Enter 校验：
 * 格式错误 / 非法日期 → 错误态（error 色下划线 + 提示，官方 DateInputValidator）。
 * value 为 ISO "YYYY-MM-DD"（$bindable），非法输入保留为空且报错。
 * 结构对齐 TextField：浮动 label + 下划线 + 可选 leading 插槽。
 *
 * 用法：<DateInput bind:value={date} label="出生日期" />
 */
import Icon from "@iconify/svelte";

let {
	value = $bindable(""),
	label = "",
	placeholder = "YYYY/MM/DD",
	yearRange,
	leading,
	class: className = "",
}: {
	/** ISO 日期 "YYYY-MM-DD" 或空（$bindable）；非法输入时保持旧值并报错 */
	value?: string;
	label?: string;
	placeholder?: string;
	/** 允许的年份范围（默认 1900-当前年） */
	yearRange?: [number, number];
	/** leading 图标插槽（默认日历图标） */
	leading?: import("svelte").Snippet;
	class?: string;
} = $props();

let text = $state("");
let error = $state("");
let focused = $state(false);

// 初始化显示值
function syncText() {
	text = value ? value.replace(/-/g, "/") : "";
}
$effect(() => {
	syncText();
});

// 输入时自动格式化：YYYY/MM/DD 分段
function onInput(e: Event) {
	const raw = (e.target as HTMLInputElement).value
		.replace(/[^\d]/g, "")
		.slice(0, 8);
	let out = "";
	for (let i = 0; i < raw.length; i++) {
		if (i === 4 || i === 6) out += "/";
		out += raw[i];
	}
	text = out;
	error = "";
}

function validate(s: string): string {
	const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
	if (!m) return "格式应为 YYYY/MM/DD";
	const y = +m[1];
	const mo = +m[2];
	const d = +m[3];
	const [minY = 1900, maxY = new Date().getFullYear()] = yearRange ?? [];
	if (y < minY || y > maxY) return `年份需在 ${minY}-${maxY} 之间`;
	if (mo < 1 || mo > 12) return "月份无效";
	if (d < 1 || d > 31) return "日期无效";
	const dt = new Date(y, mo - 1, d);
	if (
		dt.getFullYear() !== y ||
		dt.getMonth() !== mo - 1 ||
		dt.getDate() !== d
	) {
		return "不是有效日期";
	}
	return "";
}

function onBlur() {
	focused = false;
	const err = validate(text);
	if (err) {
		error = err;
		value = "";
		return;
	}
	if (text) {
		const [y, mo, d] = text.split("/");
		value = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
	}
	error = "";
}
</script>

<div
    class="m3-date-input {className}"
    class:m3-date-input--error={!!error}
    class:m3-date-input--focused={focused}
>
    <span class="m3-date-input__icon">
        {#if leading}
            {@render leading()}
        {:else}
            <Icon icon="material-symbols:calendar-today" width="20" height="20" />
        {/if}
    </span>
    <div class="m3-date-input__field">
        <input
            type="text"
            inputmode="numeric"
            bind:value={text}
            placeholder={focused ? placeholder : undefined}
            aria-label={label || placeholder}
            oninput={onInput}
            onfocus={() => (focused = true)}
            onblur={onBlur}
        />
        {#if label}
            <span class="m3-date-input__label" class:m3-date-input__label--float={text || focused}>
                {label}
            </span>
        {/if}
    </div>
    <span class="m3-date-input__underline" aria-hidden="true"></span>
    {#if error}
        <span class="m3-date-input__error">{error}</span>
    {/if}
</div>

<style lang="stylus">
.m3-date-input
    position: relative
    display: flex
    align-items: center
    gap: 12px
    padding: 0 16px
    background: var(--field-filled-bg)
    border-radius: var(--shape-corner-xs) var(--shape-corner-xs) 0 0
    transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

    &:hover
        background: unquote("color-mix(in oklab, var(--on-surface) 12%, var(--field-filled-bg))")

    &__icon
        display: flex
        flex: none
        color: var(--on-surface-variant)
        > :global(svg)
            width: 1.25rem
            height: 1.25rem

    &__field
        position: relative
        flex: 1
        display: flex
        flex-direction: column
        justify-content: center
        min-height: 56px
        padding-top: 8px

    input
        width: 100%
        border: none
        outline: none
        background: none
        font: var(--m3e-type-body-large)
        color: var(--on-surface)
        caret-color: var(--primary)

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
            top: 8px
            transform: none
            font: var(--m3e-type-body-small)
            color: var(--primary)

    &--focused &__label--float
        color: var(--primary)

    &__underline
        position: absolute
        left: 0
        right: 0
        bottom: 0
        height: 1px
        background: var(--outline-variant)
        transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

    &--focused &__underline
        height: 2px
        background: var(--primary)

    &--error &__underline
        height: 2px
        background: var(--error)

    &__error
        position: absolute
        top: 100%
        left: 16px
        margin-top: 4px
        font: var(--m3e-type-label-small)
        color: var(--error)
</style>
