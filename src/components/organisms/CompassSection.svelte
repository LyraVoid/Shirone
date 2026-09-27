<script lang="ts">
/**
 * 站点罗盘页主体（有机体）：页头 + 搜索/分组筛选 + 分组陈列。
 * 数据由页面层构建期传入（本地数据源，零运行时请求）。
 * 筛选与站内 friends/moments/anime 同一交互语言：
 * - 分组 chips 单选过滤（再点取消恢复全部）：切换时走站内同款 LoadingIndicator
 *   三段过渡（loading → 淡出 → 列表 stagger 揭幕）；搜索即时过滤（label/note/域名），
 *   每键直接收放、不闪加载器（与 MomentSection 的搜索/标签分工一致）；
 * - 状态同步 URL（?q= / ?group=），刷新/分享/回退保留；
 * - 分组筛选与搜索可叠加。
 * 分组标题用站内 SectionTitle 语言（归档/日历同款），不引入额外装置。
 */
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import CompassTile from "@components/molecules/CompassTile.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import SectionTitle from "@components/molecules/SectionTitle.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import type { CompassShelf } from "../../data/compass";

let {
	shelves = [] as CompassShelf[],
	title = i18n(I18nKey.compass),
	subtitle = i18n(I18nKey.compassBanner),
}: {
	shelves?: CompassShelf[];
	title?: string;
	subtitle?: string;
} = $props();

let query = $state("");
let selectedGroup = $state("");
let initialized = false;
/** 分组筛选过渡三段态（站内同款）：loading 展示指示器 → out 指示器淡出 → idle 列表 stagger 揭幕 */
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

/** 分组筛选 chips（filter 单选，再点取消；分组图标作前置） */
const groupItems = $derived(
	shelves.map((shelf) => ({
		value: shelf.key,
		label: shelf.name,
		leadingIcon: shelf.icon ?? "",
	})),
);

function hostOf(href: string): string {
	try {
		return new URL(href).hostname;
	} catch {
		return href;
	}
}

/** 过滤：分组命中 + 搜索命中（label/note/域名）；整组无命中则组不渲染 */
const filteredShelves = $derived.by(() => {
	const normalizedQuery = query.trim().toLowerCase();
	return shelves
		.filter((shelf) => !selectedGroup || shelf.key === selectedGroup)
		.map((shelf) => ({
			...shelf,
			entries: normalizedQuery
				? shelf.entries.filter((entry) =>
						[entry.label, entry.note ?? "", hostOf(entry.href)]
							.join(" ")
							.toLowerCase()
							.includes(normalizedQuery),
					)
				: shelf.entries,
		}))
		.filter((shelf) => shelf.entries.length > 0);
});

const totalCount = $derived(
	filteredShelves.reduce((sum, shelf) => sum + shelf.entries.length, 0),
);

/** 分组筛选：指示器展示 → 淡出 → 列表 stagger 揭幕（MomentSection 同款三段） */
function onGroupChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 300 + 150),
	];
}

// 筛选状态同步到 URL（?q= / ?group=），刷新/分享/回退保留
$effect(() => {
	const q = query;
	const g = selectedGroup;
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	params.delete("q");
	params.delete("group");
	if (q) params.set("q", q);
	if (g) params.set("group", g);
	const qs = params.toString();
	history.replaceState(
		history.state,
		"",
		qs ? `?${qs}` : window.location.pathname,
	);
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	query = params.get("q") || "";
	selectedGroup = params.get("group") || "";
	initialized = true;
	return () => phaseTimers.forEach(clearTimeout);
});
</script>

<Card color="var(--card-bg)" radius="l" class="compass-section px-8 py-6">
	<PageHeader
		icon="material-symbols:explore-rounded"
		{title}
		{subtitle}
	/>

	{#if shelves.length > 0}
		<div class="compass-section__tools">
			<div class="compass-section__search">
				<TextField
					type="search"
					bind:value={query}
					placeholder={i18n(I18nKey.search)}
					label={i18n(I18nKey.search)}
					hideLabel
					variant="outlined"
					class="!rounded-(--shape-corner-l)"
				>
					<Icon slot="leading" icon="material-symbols:search-rounded" aria-hidden="true" />
				</TextField>
				{#if query}
					<button
						type="button"
						class="compass-section__search-clear"
						aria-label={i18n(I18nKey.clear)}
						onclick={() => (query = "")}
					>
						<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if groupItems.length > 1}
				<div class="compass-section__chips">
					<Chips
						items={groupItems}
						variant="filter"
						bind:value={selectedGroup}
						onchange={onGroupChange}
					/>
				</div>
			{/if}
			{#if totalCount > 1}
				<p class="compass-section__count">{totalCount} {i18n(I18nKey.compassCounts)}</p>
			{/if}
		</div>
	{/if}

	{#if phase !== "idle"}
		<!-- 分组筛选过渡：contained 指示器展示后淡出，再由列表 stagger 揭幕 -->
		<div
			class="compass-section__loading"
			class:compass-section__loading--out={phase === "out"}
		>
			<LoadingIndicator contained size={64} />
		</div>
	{:else if filteredShelves.length > 0}
		{#key `${selectedGroup}|${query}`}
			{#each filteredShelves as shelf (shelf.key)}
				<section class="compass-shelf" data-shelf={shelf.key}>
					<SectionTitle title={shelf.name} subtitle={shelf.blurb} icon={shelf.icon} />
					<div class="compass-shelf__grid">
						{#each shelf.entries as entry, i (entry.href)}
							<CompassTile {entry} delay={Math.min(i, 7) * 45} />
						{/each}
					</div>
				</section>
			{/each}
		{/key}
	{:else}
		<div class="compass-section__empty">
			<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.compassNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

/* 卡片容器（Card 原子根）移动端收窄内边距（同 anime/moment 风格） */
.compass-section
	display: block

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.25rem
		border-bottom: 1px solid var(--outline-variant)

	&__search
		position: relative
		width: 100%
		max-width: 32rem

		:global(.m3-text-field)
			width: 100%

	&__search-clear
		position: absolute
		right: 0.5rem
		top: 50%
		transform: translateY(-50%)
		display: inline-flex
		flex-shrink: 0
		align-items: center
		justify-content: center
		width: 1.75rem
		height: 1.75rem
		padding: 0.25rem
		border: none
		background: none
		color: var(--on-surface-variant)
		cursor: pointer
		border-radius: var(--shape-corner-full)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
		&:hover
			background: unquote("color-mix(in oklab, var(--on-surface-variant) 8%, transparent)")

	&__chips
		width: 100%

	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	/* 分组筛选过渡：区块位置的大号 contained LoadingIndicator（out = 淡出退场） */
	&__loading
		display: flex
		align-items: center
		justify-content: center
		min-height: 11rem
		padding-top: 1.5rem

		&--out
			animation: compass-loading-out var(--m3e-duration-short) var(--m3e-easing-emphasized-accelerate) both

	&__empty
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.75rem
		min-height: 11rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)
		> :global(svg)
			width: 2.5rem
			height: 2.5rem

/* 分组：间距 + 站内 SectionTitle 标题行（自带 margin-bottom） */
.compass-shelf
	margin-top: 1.75rem

.compass-shelf__grid
	display: grid
	grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr))
	gap: 0.75rem

	@media (max-width: bp-sm - 1px)
		gap: 0.625rem

/* 指示器退场：淡出 + 轻微收拢（reduced-motion 由全局规则压至终态） */
@keyframes compass-loading-out
	from
		opacity: 1
		transform: none
	to
		opacity: 0
		transform: scale(0.96)
</style>
