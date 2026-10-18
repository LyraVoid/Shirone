<script lang="ts">
/**
 * M3E DatePicker — 日期选择器（官方 DatePicker 移植的简化日历版）。
 * 头部月份导航（‹ 年 月 ›）+ 周标题 + 日期网格；
 * 今天描边高亮、选中态 primary-container 全圆、hover state layer；
 * 选择日期后 value（ISO "YYYY-MM-DD"）更新并触发 onchange。
 * 简化：不做输入模式/年视图切换（官方 DatePickerInputMode/YearPicker）。
 *
 * 用法：<DatePicker bind:value={date} />
 *      <DatePicker bind:value={date} locale="en-US" />
 */
import { getLocaleWeekStart } from "@utils/locale-utils";

let {
	value = $bindable(""),
	label = "选择日期",
	locale = "zh-CN",
	onchange,
	class: className = "",
}: {
	/** 选中日期 ISO "YYYY-MM-DD"（$bindable） */
	value?: string;
	label?: string;
	/** 本地化（周起始/星期名） */
	locale?: string;
	/** 选择变化回调 */
	onchange?: (date: string) => void;
	class?: string;
} = $props();

// 当前显示月份（本地状态，初始为 value 或今天）
let viewYear = $state(2026);
let viewMonth = $state(0);
let today = $state("");

// 周一=1（zh-CN）/ 周日=7（en-US）按 locale 周起始
const weekStart = $derived(getLocaleWeekStart(locale));

function init() {
	const d = value ? new Date(value + "T00:00:00") : new Date();
	if (!Number.isNaN(d.getTime())) {
		viewYear = d.getFullYear();
		viewMonth = d.getMonth();
	}
	const t = new Date();
	today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
init();

// 网格：6 行 7 列，从月首对齐周起始
const cells = $derived.by(() => {
	const first = new Date(viewYear, viewMonth, 1);
	// weekStart: 1=周一 7=周日 → JS getDay 0=周日
	let lead = (first.getDay() - (weekStart % 7) + 7) % 7;
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const out: ({ day: number; iso: string; inMonth: boolean } | null)[] = [];
	for (let i = 0; i < 42; i++) {
		const day = i - lead + 1;
		if (day < 1 || day > daysInMonth) {
			out.push(null);
		} else {
			out.push({
				day,
				iso: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
				inMonth: true,
			});
		}
	}
	return out;
});

const weekNames = $derived(
	(() => {
		const names: string[] = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(2026, 0, 4 + i); // 2026-01-04 周日
			names.push(
				new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(d),
			);
		}
		// 按 weekStart 重排
		const start = weekStart % 7; // JS 0=周日
		return [...names.slice(start), ...names.slice(0, start)];
	})(),
);

const monthTitle = $derived(
	new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
		new Date(viewYear, viewMonth, 1),
	),
);

function prevMonth() {
	if (viewMonth === 0) {
		viewYear--;
		viewMonth = 11;
	} else {
		viewMonth--;
	}
}
function nextMonth() {
	if (viewMonth === 11) {
		viewYear++;
		viewMonth = 0;
	} else {
		viewMonth++;
	}
}
function select(iso: string) {
	value = iso;
	onchange?.(iso);
}
</script>

<div class="m3-date-picker {className}" role="group" aria-label={label}>
    <div class="m3-date-picker__header">
        <button type="button" class="m3-date-picker__nav" aria-label="上个月" onclick={prevMonth}>
            <span aria-hidden="true">‹</span>
        </button>
        <div class="m3-date-picker__month">{monthTitle}</div>
        <button type="button" class="m3-date-picker__nav" aria-label="下个月" onclick={nextMonth}>
            <span aria-hidden="true">›</span>
        </button>
    </div>
    <div class="m3-date-picker__week">
        {#each weekNames as w}
            <span class="m3-date-picker__weekday">{w}</span>
        {/each}
    </div>
    <div class="m3-date-picker__grid">
        {#each cells as cell, i (i)}
            {#if cell}
                <button
                    type="button"
                    class="m3-date-picker__day"
                    class:m3-date-picker__day--selected={value === cell.iso}
                    class:m3-date-picker__day--today={today === cell.iso}
                    aria-pressed={value === cell.iso}
                    aria-label={cell.iso}
                    onclick={() => select(cell.iso)}
                >
                    {cell.day}
                </button>
            {:else}
                <span class="m3-date-picker__day m3-date-picker__day--empty"></span>
            {/if}
        {/each}
    </div>
</div>

<style lang="stylus">
.m3-date-picker
    display: inline-flex
    flex-direction: column
    gap: 12px
    width: 296px
    padding: 16px
    box-sizing: border-box
    border-radius: var(--shape-corner-l)
    background: var(--surface-container-high)
    color: var(--on-surface)

    &__header
        display: flex
        align-items: center
        justify-content: space-between

    &__month
        font: var(--m3e-type-title-medium)

    &__nav
        display: flex
        align-items: center
        justify-content: center
        width: 40px
        height: 40px
        border: none
        border-radius: var(--shape-corner-full)
        background: none
        color: var(--on-surface-variant)
        font-size: 1.25rem
        cursor: pointer
        transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)
        &:hover
            background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")
        &:focus-visible
            outline: 2px solid var(--primary)
            outline-offset: -2px

    &__week
        display: grid
        grid-template-columns: repeat(7, 1fr)
        gap: 2px

    &__weekday
        display: flex
        align-items: center
        justify-content: center
        height: 32px
        font: var(--m3e-type-label-small)
        color: var(--on-surface-variant)

    &__grid
        display: grid
        grid-template-columns: repeat(7, 1fr)
        gap: 2px

    &__day
        display: flex
        align-items: center
        justify-content: center
        width: 36px
        height: 36px
        margin: 0 auto
        border: none
        border-radius: var(--shape-corner-full)
        background: none
        color: var(--on-surface)
        font: var(--m3e-type-body-medium)
        cursor: pointer
        transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard), color var(--m3e-duration-short) var(--m3e-easing-standard)
        &:hover
            background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")
        &:focus-visible
            outline: 2px solid var(--primary)
            outline-offset: -2px

        &--today
            box-shadow: inset 0 0 0 1px var(--primary)

        &--selected
            background: var(--primary-container)
            color: var(--on-primary-container)
            &:hover
                background: var(--primary-container)

        &--empty
            background: none
            cursor: default
</style>
