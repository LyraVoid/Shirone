<script lang="ts">
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import Icon from "@components/atoms/display/Icon.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import FriendCard from "@components/molecules/FriendCard.svelte";
import ListPagination from "@components/molecules/ListPagination.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { createListHistory } from "@utils/list-history";
import { reveal } from "@utils/motion";
import { normalizePage, normalizePageSize } from "@utils/pagination";
import { onMount } from "svelte";
import type { FriendItem } from "../../data/friends";

let {
	friends = [] as FriendItem[],
	title = i18n(I18nKey.friends),
	subtitle = i18n(I18nKey.friendsBanner),
	pageSize = 12,
}: {
	friends?: FriendItem[];
	title?: string;
	subtitle?: string;
	pageSize?: number;
} = $props();

let query = $state("");
let selectedTag = $state("");
let page = $state(1);
let mounted = $state(false);
let toolsEl = $state<HTMLElement | null>(null);

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

const size = $derived(normalizePageSize(pageSize));
const totalPages = $derived(Math.ceil(filtered.length / size));
const currentPage = $derived(normalizePage(page, totalPages));
const visibleItems = $derived(
	filtered.slice((currentPage - 1) * size, currentPage * size),
);
const visibleCount = $derived(filtered.length);

function countLabel(count: number) {
	return `${count} ${i18n(count === 1 ? I18nKey.friendsCount : I18nKey.friendsCounts)}`;
}

const listHistory = createListHistory({
	read: (params) => {
		query = params.get("q") || "";
		selectedTag = params.get("tag") || "";
		page = normalizePage(params.get("page"), totalPages);
	},
	write: (params) => {
		for (const key of ["q", "tag", "page"]) params.delete(key);
		if (query.trim()) params.set("q", query.trim());
		if (selectedTag) params.set("tag", selectedTag);
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
	selectedTag = value;
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

onMount(() => {
	mounted = true;
	const disconnect = listHistory.connect();
	listHistory.replace();
	return disconnect;
});
</script>

<Card color="var(--card-bg)" radius="l" class="friend-section px-8 py-6">
	<PageHeader
		icon="material-symbols:handshake-outline-rounded"
		{title}
		{subtitle}
	/>

	{#if friends.length > 0}
		<div class="friend-section__tools" bind:this={toolsEl} tabindex="-1">
			<div class="friend-section__search">
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
						class="friend-section__search-clear"
						aria-label={i18n(I18nKey.clear)}
						onclick={() => setQuery("")}
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
						bind:value={() => selectedTag, setFilter}
					/>
				</div>
			{/if}
			<p class="friend-section__count">{countLabel(visibleCount)}</p>
		</div>
	{/if}

	{#if visibleItems.length > 0}
		{#key JSON.stringify([query, selectedTag, currentPage])}
			<div class="friend-section__list" use:reveal>
				{#each visibleItems as friend (friend.id)}
					<FriendCard {friend} />
				{/each}
			</div>
		{/key}
		{#if !mounted && filtered.length > size}
			<noscript>
				<div class="friend-section__list">
					{#each filtered.slice(size) as friend (friend.id)}
						<FriendCard {friend} />
					{/each}
				</div>
			</noscript>
		{/if}
	{:else}
		<div class="friend-section__empty">
			<Icon icon="material-symbols:search-off-outline-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.friendsNoResults)}</span>
		</div>
	{/if}
	{#if totalPages > 1}
		<div class="friend-section__pagination">
			<ListPagination {currentPage} {totalPages} onpagechange={changePage} />
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

	&__pagination
		margin-top: var(--m3e-space-6)
		min-height: 3rem

	&__list
		display: grid
		grid-template-columns: 1fr
		gap: 1rem
		padding-top: 1.5rem

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

</style>
