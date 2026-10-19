<script lang="ts">
/**
 * M3E DateRangePicker — 日期范围选择器（官方 DateRangePicker 简化版）。
 * 与 DatePicker 同结构，选择逻辑：第一次点 = start，第二次点 = end
 * （若 end < start 则交换）；范围中间日期用 secondary-container 淡背景高亮。
 * start/end 均为 ISO "YYYY-MM-DD"（$bindable），onchange({start,end})。
 */
import { getLocaleWeekStart } from "@utils/locale-utils";

let {
	start = $bindable(""),
	end = $bindable(""),
	label = "选择日期范围",
	locale = "zh-CN",
	onchange,
	class: className = "",
}: {
	/** 范围起点（$bindable） */
	start?: string;
	/** 范围终点（$bindable） */
	end?: string;
	label?: string;
	locale?: string;
	onchange?: (range: { start: string; end: string }) => void;
	class?: string;
} = $props();

let viewYear = $state(2026);
let viewMonth = $state(0);
let today = $state("");

const weekStart = $derived(getLocaleWeekStart(locale));

function init() {
	const d = start ? new Date(start + "T00:00:00") : new Date();
	if (!Number.isNaN(d.getTime())) {
		viewYear = d.getFullYear();
		viewMonth = d.getMonth();
	}
	const t = new Date();
	today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
init();

const cells = $derived.by(() => {
	const first = new Date(viewYear, viewMonth, 1);
	let lead = (first.getDay() - (weekStart % 7) + 7) % 7;
	const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
	const out: ({ day: number; iso: string } | null)[] = [];
	for (let i = 0; i < 42; i++) {
		const day = i - lead + 1;
		out.push(
			day >= 1 && day <= daysInMonth
				? {
						day,
						iso: `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
					}
				: null,
		);
	}
	return out;
});

const weekNames = $derived(
	(() => {
		const names: string[] = [];
		for (let i = 0; i < 7; i++) {
			names.push(
				new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(
					new Date(2026, 0, 4 + i),
				),
			);
		}
		const s = weekStart % 7;
		return [...names.slice(s), ...names.slice(0, s)];
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

function inRange(iso: string): boolean {
	if (!start || !end) return false;
	return iso >= start && iso <= end;
}
function isStart(iso: string) {
	return iso === start;
}
function isEnd(iso: string) {
	return iso === end;
}

function select(iso: string) {
	if (!start || (start && end)) {
		start = iso;
		end = "";
	} else {
		if (iso < start) {
			end = start;
			start = iso;
		} else {
			end = iso;
		}
	}
	onchange?.({ start, end });
}
</script>

<div class="m3-date-range-picker {className}" role="group" aria-label={label}>
    <div class="m3-date-range-picker__header">
        <button type="button" class="m3-date-picker__nav" aria-label="上个月" onclick={prevMonth}>
            <span aria-hidden="true">‹</span>
        </button>
        <div class="m3-date-picker__month">{monthTitle}</div>
        <button type="button" class="m3-date-picker__nav" aria-label="下个月" onclick={nextMonth}>
            <span aria-hidden="true">›</span>
        </button>
    </div>
    <div class="m3-date-range-picker__week">
        {#each weekNames as w}
            <span class="m3-date-picker__weekday">{w}</span>
        {/each}
    </div>
    <div class="m3-date-range-picker__grid">
        {#each cells as cell, i (i)}
            {#if cell}
                <span class="m3-date-range-picker__day-wrap" class:m3-date-range-picker__day-wrap--mid={inRange(cell.iso) && !isStart(cell.iso) && !isEnd(cell.iso)}>
                    <button
                        type="button"
                        class="m3-date-picker__day m3-date-range-picker__day"
                        class:m3-date-picker__day--selected={isStart(cell.iso) || isEnd(cell.iso)}
                        class:m3-date-picker__day--today={today === cell.iso}
                        aria-pressed={isStart(cell.iso) || isEnd(cell.iso)}
                        aria-label={cell.iso}
                        onclick={() => select(cell.iso)}
                    >
                        {cell.day}
                    </button>
                </span>
            {:else}
                <span class="m3-date-picker__day m3-date-picker__day--empty"></span>
            {/if}
        {/each}
    </div>
</div>

<style lang="stylus">
.m3-date-range-picker
    display: inline-flex
    flex-direction: column
    gap: 12px
    width: 296px
    padding: 16px
    box-sizing: border-box
    border-radius: var(--shape-corner-l)
    background: var(--surface-container-high)
    color: var(--on-surface)

    /* 复用 DatePicker 头部/周/网格样式 */
    &__header
        display: flex
        align-items: center
        justify-content: space-between
        :global(.m3-date-picker__nav)
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
        :global(.m3-date-picker__month)
            font: var(--m3e-type-title-medium)

    &__week
        display: grid
        grid-template-columns: repeat(7, 1fr)
        gap: 2px
        :global(.m3-date-picker__weekday)
            display: flex
            align-items: center
            justify-content: center
            height: 32px
            font: var(--m3e-type-label-small)
            color: var(--on-surface-variant)

    &__grid
        display: grid
        grid-template-columns: repeat(7, 1fr)
        gap: 2px 0

    /* 日期：全圆 + 范围中间用 secondary-container 淡背景 */
    :global(.m3-date-picker__day)
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
        &.m3-date-picker__day--today
            box-shadow: inset 0 0 0 1px var(--primary)
        &.m3-date-picker__day--selected
            background: var(--primary-container)
            color: var(--on-primary-container)
            &:hover
                background: var(--primary-container)
        &.m3-date-picker__day--empty
            background: none
            cursor: default

    /* 范围中间日期：横向延伸的淡背景（圆角仅两端） */
    &__day-wrap
        display: flex
        align-items: center
        justify-content: center
        border-radius: 0

        &--mid
            background: unquote("color-mix(in oklab, var(--secondary-container) 40%, transparent)")
</style>
