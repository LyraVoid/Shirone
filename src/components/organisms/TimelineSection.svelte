<script lang="ts">
/**
 * 时间线页主体（有机体）：
 * - 页面大标题 + 分类过滤 Chips + 时间线卡片流 + 空状态处理；
 * - 响应式 M3E 容器（<Card>）与优雅的纵向间距节奏；
 * - 数据由构建期静态传入，交互筛选在客户端实时响应。
 */
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import TimelineCard from "@components/molecules/TimelineCard.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import type { TimelineCategory, TimelineItem } from "@/types/timelineConfig";

let {
	categories = [] as TimelineCategory[],
	items = [] as TimelineItem[],
	title = i18n(I18nKey.timeline),
	subtitle = i18n(I18nKey.timelineBanner),
}: {
	categories?: TimelineCategory[];
	items?: TimelineItem[];
	title?: string;
	subtitle?: string;
} = $props();

let selectedCategory = $state("");

const enabledItems = $derived(items.filter((item) => item.enable !== false));

const categoryMap = $derived(
	new Map(categories.map((c) => [c.key, { label: c.label, icon: c.icon }])),
);

const activeCategories = $derived(
	categories.filter((category) =>
		enabledItems.some((item) => item.category === category.key),
	),
);

const categoryChips = $derived(
	activeCategories.map((category) => ({
		value: category.key,
		label: category.label,
		leadingIcon: category.icon ?? "",
	})),
);

const filteredItems = $derived(
	selectedCategory
		? enabledItems.filter((item) => item.category === selectedCategory)
		: enabledItems,
);
</script>

<Card color="var(--card-bg)" radius="l" class="timeline-section px-8 py-6">
	<!-- 页面大标题 -->
	<PageHeader
		icon="material-symbols:timeline-rounded"
		{title}
		{subtitle}
	/>

	<!-- 分类筛选器与计数条 -->
	{#if enabledItems.length > 0}
		<div class="timeline-section__tools">
			{#if categoryChips.length > 1}
				<div
					class="timeline-section__chips"
					aria-label={i18n(I18nKey.timelineCategories)}
				>
					<Chips items={categoryChips} variant="filter" bind:value={selectedCategory} />
				</div>
			{/if}

			<p class="timeline-section__count">
				{filteredItems.length} {i18n(I18nKey.timelineCounts)}
			</p>
		</div>
	{/if}

	<!-- 时间线事件流 -->
	{#if filteredItems.length > 0}
		<div class="timeline-section__list" aria-live="polite">
			{#each filteredItems as item, index (item.title + item.date)}
				{@const cat = item.category ? categoryMap.get(item.category) : undefined}
				<TimelineCard
					{item}
					categoryLabel={cat?.label}
					categoryIcon={cat?.icon}
					delay={Math.min(index, 7) * 45}
					isLast={index === filteredItems.length - 1}
				/>
			{/each}
		</div>
	{:else}
		<!-- 筛选无结果时的空状态提示 -->
		<div class="timeline-section__empty">
			<Icon icon="material-symbols:event-busy-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.timelineNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.timeline-section
	display: block

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.25rem
		margin-bottom: 1.5rem
		border-bottom: 1px solid var(--outline-variant)

		@media (max-width: bp-sm - 1px)
			margin-bottom: 1rem
			padding-bottom: 1rem

	&__chips
		width: 100%

	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)

	&__list
		display: flex
		flex-direction: column
		width: 100%

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
</style>
