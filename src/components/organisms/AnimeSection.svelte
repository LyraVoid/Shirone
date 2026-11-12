<script lang="ts">
/**
 * 番剧页主体（有机体）：页头 + 状态筛选 chips + 实时搜索 + 双布局（grid/list）+ 分页。
 * 数据由页面层经 utils/anime-data.getAnimeList() 构建期取得后以 props 传入；
 * 筛选状态与搜索同步 URL（?status= / ?q=），与友链/动态/相册页同一交互语言。
 *
 * 布局形态：番剧页独立偏好（localStorage `shirone:anime-layout-mode`，默认 grid 海报网格），
 * 不与博客文章列表偏好耦合；工具栏提供快速切换按钮，切类后逐卡 FLIP 平移。
 */
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import Icon from "@components/atoms/display/Icon.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import AnimeCard from "@components/molecules/AnimeCard.svelte";
import ListPagination from "@components/molecules/ListPagination.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { ANIME_STATUS_META } from "@utils/anime/status";
import { createListHistory } from "@utils/list-history";
import { flipFromRect } from "@utils/motion";
import { normalizePage, normalizePageSize } from "@utils/pagination";
import { onMount } from "svelte";
import type { AnimeItem } from "../../data/anime";

export type AnimeLayoutMode = "grid" | "list";

let {
	animes = [] as AnimeItem[],
	title = i18n(I18nKey.anime),
	subtitle = i18n(I18nKey.animeBanner),
	pageSize = 12,
}: {
	animes?: AnimeItem[];
	title?: string;
	subtitle?: string;
	pageSize?: number;
} = $props();

const ANIME_LAYOUT_KEY = "shirone:anime-layout-mode";

let query = $state("");
let selectedStatus = $state("");
let page = $state(1);
let mounted = $state(false);
let toolsEl = $state<HTMLElement | null>(null);

/** 布局形态：番剧页专属独立偏好，默认海报网格 (grid) */
let listMode = $state<AnimeLayoutMode>("grid");
let listEl = $state<HTMLElement | null>(null);

const LIST_MODE_CLASS: Record<AnimeLayoutMode, string> = {
	grid: "anime-list--grid",
	list: "anime-list--list",
};

/** 状态筛选 chips：只列数据中出现的状态（单选，再点取消 = 全部） */
const statusItems = $derived(
	Array.from(new Set(animes.map((anime) => anime.status))).map((status) => ({
		value: status,
		label: i18n(ANIME_STATUS_META[status].key),
		leadingIcon: ANIME_STATUS_META[status].icon,
	})),
);

const filtered = $derived.by(() => {
	const normalizedQuery = query.trim().toLowerCase();
	return animes.filter((anime) => {
		if (selectedStatus && anime.status !== selectedStatus) return false;
		if (!normalizedQuery) return true;
		return [
			anime.title,
			anime.description ?? "",
			anime.studio ?? "",
			anime.year,
			...anime.genres,
		].some((val) => val.toLowerCase().includes(normalizedQuery));
	});
});

const size = $derived(normalizePageSize(pageSize));
const totalPages = $derived(Math.ceil(filtered.length / size));
const currentPage = $derived(normalizePage(page, totalPages));
const visibleItems = $derived(
	filtered.slice((currentPage - 1) * size, currentPage * size),
);

function countLabel(count: number) {
	return `${count} ${i18n(I18nKey.animeCounts)}`;
}

const listHistory = createListHistory({
	read: (params) => {
		query = params.get("q") || "";
		selectedStatus = params.get("status") || "";
		page = normalizePage(params.get("page"), totalPages);
	},
	write: (params) => {
		for (const key of ["q", "status", "page"]) params.delete(key);
		if (query.trim()) params.set("q", query.trim());
		if (selectedStatus) params.set("status", selectedStatus);
		if (currentPage > 1) params.set("page", String(currentPage));
	},
	element: () => toolsEl,
});
function setQuery(value: string) {
	query = value;
	page = 1;
	listHistory.replace();
}
function setFilter(value: string) {
	selectedStatus = value;
	page = 1;
	listHistory.replace();
}
function changePage(value: number) {
	const next = normalizePage(value, totalPages);
	if (next === currentPage) return;
	page = next;
	listHistory.push();
	listHistory.scroll();
}

function readStoredLayoutMode(): AnimeLayoutMode {
	try {
		const stored = localStorage.getItem(ANIME_LAYOUT_KEY);
		if (stored === "list" || stored === "grid") return stored;
	} catch {
		/* Ignore local storage access failure */
	}
	return "grid";
}

/** 切布局：切类前记录卡片位置，下一帧逐卡 FLIP 平移（reduced-motion 跳变） */
function switchLayoutMode(mode: AnimeLayoutMode) {
	if (mode === listMode) return;
	const cards = Array.from(
		listEl?.querySelectorAll<HTMLElement>(".anime-card") ?? [],
	);
	const before = cards.map((card) => card.getBoundingClientRect());
	listMode = mode;
	try {
		localStorage.setItem(ANIME_LAYOUT_KEY, mode);
	} catch {
		/* Ignore local storage access failure */
	}
	requestAnimationFrame(() => {
		cards.forEach((card, index) => {
			flipFromRect(card, before[index], 400);
		});
	});
}

onMount(() => {
	mounted = true;
	listMode = readStoredLayoutMode();
	const disconnect = listHistory.connect();
	listHistory.replace();
	return disconnect;
});
</script>

<Card color="var(--card-bg)" radius="l" class="anime-section px-8 py-6">
	<PageHeader
		icon="material-symbols:live-tv-outline-rounded"
		{title}
		{subtitle}
	/>

	{#if animes.length > 0}
		<div class="anime-section__tools" bind:this={toolsEl} tabindex="-1">
			<div class="anime-section__search-row">
				<div class="anime-section__search">
					<TextField
						type="search"
						bind:value={() => query, setQuery}
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
							class="anime-section__search-clear"
							aria-label={i18n(I18nKey.clear)}
							onclick={() => setQuery("")}
						>
							<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
						</button>
					{/if}
				</div>

				<div class="anime-section__layout-switch" role="group" aria-label={i18n(I18nKey.layoutMode)}>
					<button
						type="button"
						class="anime-section__layout-btn"
						class:anime-section__layout-btn--active={listMode === "grid"}
						aria-label={i18n(I18nKey.layoutGrid)}
						title={i18n(I18nKey.layoutGrid)}
						aria-pressed={listMode === "grid"}
						onclick={() => switchLayoutMode("grid")}
					>
						<Icon icon="material-symbols:grid-view-rounded" aria-hidden="true" />
					</button>
					<button
						type="button"
						class="anime-section__layout-btn"
						class:anime-section__layout-btn--active={listMode === "list"}
						aria-label={i18n(I18nKey.layoutList)}
						title={i18n(I18nKey.layoutList)}
						aria-pressed={listMode === "list"}
						onclick={() => switchLayoutMode("list")}
					>
						<Icon icon="material-symbols:view-list-rounded" aria-hidden="true" />
					</button>
				</div>
			</div>

			<div class="anime-section__filter-row">
				{#if statusItems.length > 1}
					<div class="anime-section__chips">
						<Chips
							items={statusItems}
							variant="filter"
							bind:value={() => selectedStatus, setFilter}
						/>
					</div>
				{/if}

				{#if filtered.length > 0}
					<p class="anime-section__count" aria-live="polite">{countLabel(filtered.length)}</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if visibleItems.length > 0}
		{#key JSON.stringify([query, selectedStatus, currentPage])}
			<div class="anime-list {LIST_MODE_CLASS[listMode]}" bind:this={listEl}>
				{#each visibleItems as anime, i (anime.title)}
					<AnimeCard {anime} delay={Math.min(i, 3) * 25} />
				{/each}
			</div>
		{/key}
		{#if !mounted && filtered.length > size}
			<noscript>
				<div class="anime-list anime-list--grid">
					{#each filtered.slice(size) as anime (anime.title)}
						<AnimeCard {anime} />
					{/each}
				</div>
			</noscript>
		{/if}
	{:else}
		<div class="anime-section__empty">
			{#if animes.length === 0}
				<Icon icon="material-symbols:tv-off-outline-rounded" aria-hidden="true" />
				<span>{i18n(I18nKey.animeSyncEmpty)}</span>
			{:else}
				<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
				<span>{i18n(I18nKey.animeNoResults)}</span>
			{/if}
		</div>
	{/if}
	{#if totalPages > 1}
		<div class="anime-section__pagination">
			<ListPagination {currentPage} {totalPages} onpagechange={changePage} />
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.anime-section
	display: block

	@media (max-width: bp-sm - 1px)
		/* 卡片容器（Card 原子根）移动端收窄内边距 */
		padding: 1rem 0.75rem

		.anime-list--grid, .anime-list--list
			padding-top: 1rem
			gap: 0.625rem

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.25rem
		border-bottom: 1px solid var(--outline-variant)

	&__search-row
		display: flex
		align-items: center
		gap: 0.625rem
		width: 100%

	&__search
		position: relative
		flex: 1
		min-width: 0
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

	&__filter-row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		width: 100%

	&__chips
		/* Let the count wrap before squeezing a wrapping Chips group. */
		flex: 0 1 auto
		min-width: 0
		max-width: 100%

	&__count
		margin: 0
		margin-inline-start: auto
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		white-space: nowrap

	&__layout-switch
		display: inline-flex
		flex-shrink: 0
		align-items: center
		padding: 0.125rem
		border-radius: var(--shape-corner-m)
		background: var(--surface-container-high)
		border: 1px solid var(--outline-variant)

	&__layout-btn
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.125rem
		height: 2.125rem
		border: none
		border-radius: var(--shape-corner-s)
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			color var(--m3e-duration-short) var(--m3e-easing-standard)
		> :global(svg)
			width: 1.25rem
			height: 1.25rem

		&:hover
			color: var(--on-surface)
			background: unquote("color-mix(in oklab, var(--on-surface) 8%, transparent)")

		&--active
			background: var(--primary-container)
			color: var(--on-primary-container)
			&:hover
				background: var(--primary-container)
				color: var(--on-primary-container)

	&__pagination
		margin-top: var(--m3e-space-6)
		min-height: 3rem

	&__empty
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.875rem
		min-height: 12rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)
		> :global(svg)
			width: 2.75rem
			height: 2.75rem
			color: var(--outline)

/* 海报网格（grid）：手机 2 列、平板 3 列、电脑端精准 4 列，紧凑美观 */
.anime-list--grid
	display: grid
	grid-template-columns: repeat(2, 1fr)
	gap: 0.875rem
	padding-top: 1.25rem

	@media (min-width: 32rem)
		grid-template-columns: repeat(3, 1fr)
		gap: 0.875rem

	@media (min-width: bp-md)
		grid-template-columns: repeat(4, 1fr)
		gap: 1rem

/* 横向列表（list）：单列，超宽视口双列；卡片横排（封面固定宽 + 正文铺开）。
   跨组件边界覆盖卡片内部类，统一走 :global（容器级驱动，规则集中在布局拥有方）。 */
.anime-list--list
	display: grid
	grid-template-columns: 1fr
	gap: 1rem
	padding-top: 1.25rem

	@media (min-width: 88rem)
		grid-template-columns: repeat(2, 1fr)

	:global(.anime-card)
		flex-direction: row

	:global(.anime-card__cover)
		width: 8.5rem
		flex-shrink: 0

		@media (min-width: 48rem)
			width: 11rem

	:global(.anime-card__body)
		flex: 1
		min-width: 0
		padding: 1.125rem 1.25rem
		justify-content: space-between

	:global(.anime-card__desc)
		-webkit-line-clamp: 3

</style>
