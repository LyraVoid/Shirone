<script lang="ts">
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import FriendCard from "@components/molecules/FriendCard.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import type { FriendItem } from "../../data/friends";

let {
	friends = [] as FriendItem[],
	title = i18n(I18nKey.friends),
	subtitle = i18n(I18nKey.friendsBanner),
}: {
	friends?: FriendItem[];
	title?: string;
	subtitle?: string;
} = $props();

let query = $state("");
let selectedTag = $state("");
let initialized = false;
/** 标签筛选过渡三段态：loading 展示指示器 → out 指示器淡出 → idle 列表揭幕（与动态页同语言） */
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

const tagItems = $derived(
	Array.from(new Set(friends.flatMap((friend) => friend.tags)))
		.sort((a, b) => a.localeCompare(b))
		.map((tag) => ({ value: tag, label: tag })),
);

const filtered = $derived.by(() => {
	const normalizedQuery = query.trim().toLowerCase();

	return friends.filter((friend) => {
		if (selectedTag && !friend.tags.includes(selectedTag)) return false;
		if (!normalizedQuery) return true;

		let searchableHost = friend.siteurl;
		try {
			searchableHost = new URL(friend.siteurl).hostname;
		} catch {
			/* Keep the original URL when it cannot be parsed. */
		}

		return [friend.title, friend.desc, searchableHost, ...friend.tags].some(
			(value) => value.toLowerCase().includes(normalizedQuery),
		);
	});
});

const visibleCount = $derived(filtered.length);

function countLabel(count: number) {
	return `${count} ${i18n(count === 1 ? I18nKey.friendsCount : I18nKey.friendsCounts)}`;
}

/** 标签筛选：指示器展示 → 淡出 → 列表重新揭幕（与动态页同语言） */
function onTagChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 300 + 150),
	];
}

// 筛选状态同步到 URL（?q= / ?tag=），刷新/分享/回退保留
$effect(() => {
	// 先读依赖（无论是否初始化都注册），避免首次 return 后不再追踪
	const q = query;
	const t = selectedTag;
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	params.delete("q");
	params.delete("tag");
	if (q) params.set("q", q);
	if (t) params.set("tag", t);
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
	selectedTag = params.get("tag") || "";
	initialized = true;
	return () => phaseTimers.forEach(clearTimeout);
});
</script>

<Card color="var(--card-bg)" radius="l" class="friend-section px-8 py-6">
	<PageHeader
		icon="material-symbols:handshake-outline-rounded"
		{title}
		{subtitle}
	/>

	{#if friends.length > 0}
		<div class="friend-section__tools">
			<div class="friend-section__search">
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
						class="friend-section__search-clear"
						aria-label={i18n(I18nKey.clear)}
						onclick={() => (query = "")}
					>
						<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
					</button>
				{/if}
			</div>

			{#if tagItems.length > 0}
				<div class="friend-section__chips">
					<Chips
						items={tagItems}
						variant="filter"
						bind:value={selectedTag}
						onchange={onTagChange}
					/>
				</div>
			{/if}
			<p class="friend-section__count">{countLabel(visibleCount)}</p>
		</div>
	{/if}

	{#if phase !== "idle"}
		<!-- 标签筛选过渡：contained 指示器展示后淡出，再由列表揭幕（与动态页同语言） -->
		<div
			class="friend-section__loading"
			class:friend-section__loading--out={phase === "out"}
		>
			<LoadingIndicator contained size={64} />
		</div>
	{:else if filtered.length > 0}
		{#key `${query}|${selectedTag}`}
			<div class="friend-section__list">
				{#each filtered as friend (friend.id)}
					<FriendCard {friend} />
				{/each}
			</div>
		{/key}
	{:else}
		<div class="friend-section__empty">
			<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.friendsNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
@import "../../styles/breakpoints.styl"

.friend-section
	display: block

	&__tools
		display: flex
		flex-direction: column
		gap: 0.875rem
		padding-bottom: 1.5rem
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

	/* 标签筛选过渡：区块位置的大号 contained LoadingIndicator（out = 淡出退场，与动态页同语言） */
	&__loading
		display: flex
		align-items: center
		justify-content: center
		min-height: 11rem
		padding-top: 1.5rem

		&--out
			animation: friend-loading-out var(--m3e-duration-short) var(--m3e-easing-emphasized-accelerate) both

	&__list
		display: grid
		grid-template-columns: 1fr
		gap: 1rem
		padding-top: 1.5rem
		animation: friend-fade-in var(--m3e-duration-medium) var(--m3e-easing-standard)

		@media (min-width: bp-md)
			grid-template-columns: repeat(2, 1fr)

	&__empty
		display: flex
		flex-direction: column
		align-items: center
		justify-content: center
		gap: 0.75rem
		min-height: 11rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-large)
		> :global(svg)
			width: 2.5rem
			height: 2.5rem

	@media (max-width: bp-sm - 1px)
		padding: 1rem 0.75rem

		&__list
			padding-top: 1.25rem

/* 筛选结果淡入（reduced-motion 由全局 motion-reduced 规则禁用动画） */
@keyframes friend-fade-in
	from
		opacity: 0
		transform: translateY(0.25rem)
	to
		opacity: 1
		transform: translateY(0)

/* 指示器退场：淡出 + 轻微收拢（reduced-motion 由全局规则压至终态） */
@keyframes friend-loading-out
	from
		opacity: 1
		transform: none
	to
		opacity: 0
		transform: scale(0.96)
</style>
