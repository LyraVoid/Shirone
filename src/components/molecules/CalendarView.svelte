<script lang="ts">
/**
 * 月度文章历交互视图（Calendar.astro 的水合岛）。
 * 单月视图 + 切月 + 点击有文日展开当日文章；月/周名称由 Intl
 * 按站点 locale 生成（本地化数据不占 i18n key）。
 * 动效：切月网格 reveal 淡入、文章列表 collapse 展开（motion.ts
 * 原语，reduced-motion 自动瞬切）。
 */
import IconButton from "@components/atoms/action/IconButton.svelte";
import type { CalendarPost } from "@utils/calendar-data";
import { collapse, reveal } from "@utils/motion";

interface Props {
	/** BCP47 locale（由 siteConfig.lang 换算，Intl 用） */
	locale: string;
	startOfWeek: "mon" | "sun";
	/** dateKey（YYYY-MM-DD）→ 当日文章 */
	postsByDate: Record<string, CalendarPost[]>;
	/** 有文章月份列表（升序 YYYY-MM），跳月导航用 */
	activeMonths: string[];
	backTodayLabel: string;
	prevMonthLabel: string;
	nextMonthLabel: string;
}

let {
	locale,
	startOfWeek = "mon",
	postsByDate,
	activeMonths = [],
	backTodayLabel,
	prevMonthLabel,
	nextMonthLabel,
}: Props = $props();

const today = new Date();
let year = $state(today.getFullYear());
let month = $state(today.getMonth());
let selectedDate = $state<string | null>(null);

const monthTitle = $derived(
	new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
		new Date(year, month, 1),
	),
);

// 周名：2021-01-03 是周日，由此锚定一周 7 天（Intl weekday short）
const weekStartOffset = $derived(startOfWeek === "mon" ? 1 : 0);
const weekdays = $derived(
	Array.from({ length: 7 }, (_, i) => {
		const day = (i + weekStartOffset) % 7;
		return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
			new Date(2021, 0, 3 + day),
		);
	}),
);

const pad = (n: number) => String(n).padStart(2, "0");
const dateKey = (y: number, m: number, d: number) =>
	`${y}-${pad(m + 1)}-${pad(d)}`;

interface DayCell {
	day: number;
	key: string;
	posts: CalendarPost[];
}

const cells = $derived.by(() => {
	const first = new Date(year, month, 1).getDay();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const leading = (first - weekStartOffset + 7) % 7;
	const result: (DayCell | null)[] = Array.from(
		{ length: leading },
		() => null,
	);
	for (let d = 1; d <= daysInMonth; d++) {
		const key = dateKey(year, month, d);
		result.push({ day: d, key, posts: postsByDate[key] ?? [] });
	}
	return result;
});

const selectedPosts = $derived(
	selectedDate ? (postsByDate[selectedDate] ?? []) : [],
);
const listOpen = $derived(selectedPosts.length > 0);

const isCurrentMonth = $derived(
	year === today.getFullYear() && month === today.getMonth(),
);

function isTodayCell(cell: DayCell): boolean {
	return (
		cell.key === dateKey(today.getFullYear(), today.getMonth(), today.getDate())
	);
}

const currentMonthKey = $derived(`${year}-${pad(month + 1)}`);

// 相邻有文月：prev/next 跳过空月——博客日历的信息单元是「有文章的
// 月份」，空月没有可浏览的内容；无文章数据时退化为逐月 ±1。
const prevMonthKey = $derived.by(() => {
	let best: string | null = null;
	for (const key of activeMonths) {
		if (key < currentMonthKey) best = key;
		else break;
	}
	return best;
});
const nextMonthKey = $derived.by(() => {
	for (const key of activeMonths) {
		if (key > currentMonthKey) return key;
	}
	return null;
});
// 边界禁用：有文月存在且相邻方向没有更多有文月
const canPrev = $derived(activeMonths.length === 0 || prevMonthKey !== null);
const canNext = $derived(activeMonths.length === 0 || nextMonthKey !== null);

function shiftMonth(delta: number) {
	if (activeMonths.length > 0) {
		const target = delta < 0 ? prevMonthKey : nextMonthKey;
		if (!target) return;
		const [y, m] = target.split("-").map(Number);
		year = y;
		month = m - 1;
		selectedDate = null;
		return;
	}
	const next = new Date(year, month + delta, 1);
	year = next.getFullYear();
	month = next.getMonth();
	selectedDate = null;
}

function backToToday() {
	year = today.getFullYear();
	month = today.getMonth();
	selectedDate = null;
}

function toggleDay(cell: DayCell) {
	if (cell.posts.length === 0) return;
	selectedDate = selectedDate === cell.key ? null : cell.key;
}
</script>

<div class="m3-calendar">
	<header class="m3-calendar__bar">
		<IconButton
			variant="standard"
			size="xsmall"
			icon="material-symbols:chevron-left-rounded"
			label={prevMonthLabel}
			disabled={!canPrev}
			onclick={() => shiftMonth(-1)}
		/>
		<button
			type="button"
			class="m3-calendar__title"
			class:m3-calendar__title--clickable={!isCurrentMonth}
			title={isCurrentMonth ? undefined : backTodayLabel}
			aria-label={isCurrentMonth ? monthTitle : `${monthTitle}（${backTodayLabel}）`}
			onclick={() => {
				if (!isCurrentMonth) backToToday();
			}}
		>
			{monthTitle}
		</button>
		<IconButton
			variant="standard"
			size="xsmall"
			icon="material-symbols:chevron-right-rounded"
			label={nextMonthLabel}
			disabled={!canNext}
			onclick={() => shiftMonth(1)}
		/>
	</header>

	<div class="m3-calendar__weekdays" aria-hidden="true">
		{#each weekdays as weekday}
			<span class="m3-calendar__weekday">{weekday}</span>
		{/each}
	</div>

	{#key `${year}-${month}`}
		<div class="m3-calendar__grid" use:reveal={{ duration: 200 }}>
			{#each cells as cell}
				{#if cell === null}
					<span class="m3-calendar__blank" aria-hidden="true"></span>
				{:else}
					<button
						type="button"
						class={`m3-calendar__day${cell.posts.length > 0 ? " m3-calendar__day--has-posts" : ""}${isTodayCell(cell) ? " m3-calendar__day--today" : ""}${cell.key === selectedDate ? " m3-calendar__day--selected" : ""}`}
						disabled={cell.posts.length === 0}
						aria-current={isTodayCell(cell) ? "date" : undefined}
						aria-label={`${cell.key}${cell.posts.length > 0 ? `，${cell.posts.length} 篇文章` : ""}`}
						onclick={() => toggleDay(cell)}
					>
						{cell.day}
					</button>
				{/if}
			{/each}
		</div>
	{/key}

	<div class="m3-calendar__panel" use:collapse={{ open: listOpen }}>
		<ul class="m3-calendar__posts">
			{#each selectedPosts as post}
				<li class="m3-calendar__post">
					<a href={post.url}>{post.title}</a>
					<span class="m3-calendar__post-date">{post.date.slice(5)}</span>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style lang="stylus">
	.m3-calendar
		display: flex
		flex-direction: column
		gap: 0.5rem

		&__bar
			display: flex
			align-items: center
			gap: 0.25rem

		&__title
			flex: 1
			min-width: 0
			margin: 0
			padding: 0.25rem 0.5rem
			border: none
			border-radius: var(--shape-corner-s)
			background: transparent
			text-align: center
			font: var(--m3e-type-title-small)
			font-weight: 600
			color: var(--on-surface)
			white-space: nowrap
			transition:
				color var(--m3e-duration-short) var(--m3e-easing-standard),
				background-color var(--m3e-duration-short) var(--m3e-easing-standard)

			&--clickable
				color: var(--primary)
				cursor: pointer

				&:hover
					background: var(--btn-plain-bg-hover)

		&__weekdays
			display: grid
			grid-template-columns: repeat(7, 1fr)
			gap: 0.25rem

		&__weekday
			text-align: center
			font: var(--m3e-type-label-medium)
			color: var(--on-surface-variant)

		&__grid
			display: grid
			grid-template-columns: repeat(7, 1fr)
			gap: 0.25rem

		&__blank
			aspect-ratio: 1

		&__day
			aspect-ratio: 1
			display: flex
			align-items: center
			justify-content: center
			border: none
			border-radius: var(--shape-corner-s)
			background: transparent
			font: var(--m3e-type-label-large)
			font-variant-numeric: tabular-nums
			color: var(--on-surface-variant)
			cursor: default
			transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

			&--has-posts
				/* 淡 tint 状态层（primary 12%）：比实底 container 柔和得多，
				   有文日的视觉层级应低于今天（实底 primary）；数字保持
				   on-surface（primary 浅色系在白底卡片上对比度不足），
				   识别靠淡底 + 加粗；hover 加深 tint 一档 */
				background: unquote("color-mix(in oklab, var(--primary) 12%, transparent)")
				color: var(--on-surface)
				font-weight: 600
				cursor: pointer

				&:hover
					background: unquote("color-mix(in oklab, var(--primary) 20%, transparent)")

			&--today
				background: var(--primary)
				color: var(--on-primary)
				font-weight: 700

				&:hover
					filter: brightness(1.06)

			&--selected
				/* 选中强调：box-shadow 内描边跟随 corner-s 圆角
				   （outline 不跟圆角，会画出突兀的方框） */
				box-shadow: inset 0 0 0 2px var(--outline)

			&:disabled
				opacity: 0.55

		&__panel
			overflow: hidden

		&__posts
			list-style: none
			margin: 0
			padding: 0.25rem 0 0
			display: flex
			flex-direction: column
			gap: 0.125rem
			max-height: 9.5rem
			overflow-y: auto
			overscroll-behavior: contain
			scrollbar-width: thin
			scrollbar-color: var(--scrollbar-bg) transparent

			&::-webkit-scrollbar
				width: var(--m3e-space-2)

			&::-webkit-scrollbar-track
				background: transparent

			&::-webkit-scrollbar-thumb
				background: var(--scrollbar-bg)
				border-radius: var(--shape-corner-full)

				&:hover
					background: var(--scrollbar-bg-hover)

				&:active
					background: var(--scrollbar-bg-active)

		&__post
			display: flex
			align-items: baseline
			gap: 0.5rem
			padding: 0.25rem 0.5rem
			border-radius: var(--shape-corner-s)
			transition: background-color var(--m3e-duration-short) var(--m3e-easing-standard)

			&:hover
				background: var(--btn-plain-bg-hover)

			a
				min-width: 0
				flex: 1
				overflow: hidden
				text-overflow: ellipsis
				white-space: nowrap
				font: var(--m3e-type-body-medium)
				color: var(--on-surface)
				text-decoration: none
				transition: color var(--m3e-duration-short) var(--m3e-easing-standard)

			&:hover a
				color: var(--primary)

		&__post-date
			flex-shrink: 0
			font: var(--m3e-type-label-medium)
			color: var(--on-surface-variant)
			font-variant-numeric: tabular-nums
</style>
