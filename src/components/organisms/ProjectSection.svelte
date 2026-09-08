<script lang="ts">
/** 项目页主体（有机体）：实时搜索 + 按分类筛选（带 LoadingIndicator 过渡） + 瀑布流瓷砖网格。 */
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import ProjectCard from "@components/molecules/ProjectCard.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { packMasonry, setupMasonry } from "@utils/masonry";
import { onMount } from "svelte";
import type { ProjectCategory, ProjectItem } from "@/types/projectsConfig";

let {
	categories = [] as ProjectCategory[],
	items = [] as ProjectItem[],
}: { categories?: ProjectCategory[]; items?: ProjectItem[] } = $props();

let query = $state("");
let selectedCategory = $state("");
let initialized = false;
let gridEl: HTMLElement | undefined = $state();

/** 筛选过渡三段态：loading 展示指示器 → out 指示器淡出 → idle 列表 stagger 揭幕 */
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

const enabledItems = $derived(items.filter((item) => item.enable !== false));
const activeCategories = $derived(
	categories.filter((category) =>
		enabledItems.some((item) => item.category === category.key),
	),
);
const categoryItems = $derived(
	activeCategories.map((category) => ({
		value: category.key,
		label: category.label,
		leadingIcon: category.icon ?? "",
	})),
);

const filteredItems = $derived.by(() => {
	const normalized = query.trim().toLowerCase();
	return enabledItems.filter((item) => {
		if (selectedCategory && item.category !== selectedCategory) return false;
		if (!normalized) return true;
		return [
			item.title,
			item.summary,
			item.category,
			item.phase,
			item.year ?? "",
			...item.technologies,
		].some((val) => val.toLowerCase().includes(normalized));
	});
});

/** 分类筛选：指示器展示 → 淡出 → 网格 stagger 揭幕 */
function onCategoryChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 300 + 150),
	];
}

// URL 参数同步（?category= / ?q=）
$effect(() => {
	const c = selectedCategory;
	const q = query;
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	params.delete("category");
	params.delete("q");
	if (c) params.set("category", c);
	if (q.trim()) params.set("q", q.trim());
	const qs = params.toString();
	history.replaceState(
		history.state,
		"",
		qs ? `?${qs}` : window.location.pathname,
	);
});

/** 瀑布流：复用文章列表的最短列打包（utils/masonry.ts）。
 * 有封面/无封面卡片高度天然混合，span 行数消除列间空洞；
 * ResizeObserver 处理换列数，过滤后的子项重建由 $effect 重排。 */
onMount(() => {
	const params = new URLSearchParams(window.location.search);
	selectedCategory = params.get("category") || "";
	query = params.get("q") || "";
	initialized = true;

	if (!gridEl) return;
	setupMasonry(gridEl);
	document.fonts?.ready.then(() => packMasonry(gridEl)).catch(() => {});
	return () => {
		phaseTimers.forEach(clearTimeout);
	};
});

$effect(() => {
	// 依赖 filteredItems 与 phase：过滤完成回到 idle 状态后重新打包
	filteredItems;
	if (phase === "idle" && gridEl) {
		requestAnimationFrame(() => packMasonry(gridEl));
	}
});
</script>

<Card color="var(--card-bg)" radius="l" class="projects-section px-8 py-6">
	<PageHeader
		icon="material-symbols:deployed-code-outline-rounded"
		title={i18n(I18nKey.projects)}
		subtitle={i18n(I18nKey.projectsBanner)}
	/>

	{#if enabledItems.length > 0}
		<div class="projects-section__tools">
			<div class="projects-section__search-row">
				<div class="projects-section__search">
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
							class="projects-section__search-clear"
							aria-label={i18n(I18nKey.clear)}
							onclick={() => (query = "")}
						>
							<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
						</button>
					{/if}
				</div>
			</div>

			<div class="projects-section__filter-row">
				{#if categoryItems.length > 1}
					<div
						class="projects-section__chips"
						aria-label={i18n(I18nKey.projectCategories)}
					>
						<Chips
							items={categoryItems}
							variant="filter"
							bind:value={selectedCategory}
							onchange={onCategoryChange}
						/>
					</div>
				{/if}
				{#if filteredItems.length > 0}
					<p class="projects-section__count" aria-live="polite">
						{filteredItems.length} {i18n(I18nKey.projectsCounts)}
					</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if phase !== "idle"}
		<!-- 筛选过渡：contained 指示器展示后淡出，再由网格 stagger 揭幕 -->
		<div
			class="projects-section__loading"
			class:projects-section__loading--out={phase === "out"}
		>
			<LoadingIndicator contained size={64} />
		</div>
	{:else if filteredItems.length > 0}
		{#key `${selectedCategory}|${query}`}
			<div
				class="projects-section__grid"
				aria-live="polite"
				bind:this={gridEl}
			>
				{#each filteredItems as project, index (project.key)}
					<ProjectCard {project} delay={Math.min(index, 7) * 45} />
				{/each}
			</div>
		{/key}
	{:else}
		<div class="projects-section__empty">
			<Icon icon="material-symbols:folder-off-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.projectsNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.projects-section
	display: block

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.25rem
		border-bottom: 1px solid var(--outline-variant)

	&__search-row
		display: flex
		align-items: center
		width: 100%

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

	&__filter-row
		display: flex
		flex-wrap: wrap
		align-items: center
		justify-content: space-between
		gap: 0.75rem
		width: 100%

	&__chips
		flex: 1
		min-width: 0
		overflow-x: auto
		scrollbar-width: none
		&::-webkit-scrollbar
			display: none

	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
		white-space: nowrap

	/* 筛选过渡：区块位置的大号 contained LoadingIndicator（out = 淡出退场） */
	&__loading
		display: flex
		align-items: center
		justify-content: center
		min-height: 11rem
		padding-top: 1.5rem

		&--out
			animation: project-loading-out var(--m3e-duration-short) var(--m3e-easing-emphasized-accelerate) both

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

	&__grid
		display: grid
		grid-template-columns: minmax(0, 1fr)
		gap: 0.75rem
		margin-top: 1.25rem

		/* 瀑布流：仅 ≥md（单列下 packMasonry 自动清空定位，保持普通行距）。
		   约定与 PostPage/masonry.ts 同步：auto-rows 8px、row-gap 0、
		   行距 16px 烘焙进 span（column-gap 与 ROW_GAP 同值） */
		@media (min-width: bp-md)
			grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr))
			align-items: start
			grid-auto-rows: 8px
			row-gap: 0
			column-gap: var(--m3e-space-4)

/* 指示器退场：淡出 + 轻微收拢（reduced-motion 由全局规则压至终态） */
@keyframes project-loading-out
	from
		opacity: 1
		transform: none
	to
		opacity: 0
		transform: scale(0.96)
</style>
