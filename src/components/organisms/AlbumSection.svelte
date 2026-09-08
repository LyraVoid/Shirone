<script lang="ts">
import Chips from "@components/atoms/action/Chips.svelte";
import Card from "@components/atoms/display/Card.svelte";
import LoadingIndicator from "@components/atoms/feedback/LoadingIndicator.svelte";
import TextField from "@components/atoms/input/TextField.svelte";
import AlbumCard from "@components/molecules/AlbumCard.svelte";
import PageHeader from "@components/molecules/PageHeader.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { onMount } from "svelte";
import type { AlbumIndexItem } from "@/types/album";

let { albums = [] as AlbumIndexItem[] }: { albums?: AlbumIndexItem[] } =
	$props();
let query = $state("");
let selectedTag = $state("");
let initialized = false;
type FilterPhase = "idle" | "loading" | "out";
let phase = $state<FilterPhase>("idle");
let phaseTimers: ReturnType<typeof setTimeout>[] = [];

const tagItems = $derived(
	Array.from(new Set(albums.flatMap((album) => album.tags)))
		.sort((a, b) => a.localeCompare(b))
		.map((tag) => ({ value: tag, label: tag })),
);

const filtered = $derived.by(() => {
	const normalized = query.trim().toLowerCase();
	return albums.filter((album) => {
		if (selectedTag && !album.tags.includes(selectedTag)) return false;
		if (!normalized) return true;
		return [album.title, album.description, album.location, ...album.tags]
			.join(" ")
			.toLowerCase()
			.includes(normalized);
	});
});

function onTagChange() {
	phaseTimers.forEach(clearTimeout);
	phase = "loading";
	phaseTimers = [
		setTimeout(() => (phase = "out"), 300),
		setTimeout(() => (phase = "idle"), 450),
	];
}

$effect(() => {
	if (!initialized) return;
	const params = new URLSearchParams(window.location.search);
	params.delete("q");
	params.delete("albumTag");
	if (query.trim()) params.set("q", query.trim());
	if (selectedTag) params.set("albumTag", selectedTag);
	const search = params.toString();
	history.replaceState(
		history.state,
		"",
		search ? `?${search}` : window.location.pathname,
	);
});

onMount(() => {
	const params = new URLSearchParams(window.location.search);
	query = params.get("q") || "";
	selectedTag = params.get("albumTag") || "";
	initialized = true;
	return () => phaseTimers.forEach(clearTimeout);
});
</script>

<Card color="var(--card-bg)" radius="l" class="album-section px-8 py-6">
	<PageHeader
		icon="material-symbols:photo-library-outline-rounded"
		title={i18n(I18nKey.albums)}
		subtitle={i18n(I18nKey.albumsBanner)}
	/>

	{#if albums.length > 0}
		<div class="album-section__tools">
			<div class="album-section__search">
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
						class="album-section__clear"
						aria-label={i18n(I18nKey.clear)}
						onclick={() => (query = "")}
					>
						<Icon icon="material-symbols:close-rounded" aria-hidden="true" />
					</button>
				{/if}
			</div>
			{#if tagItems.length > 0}
				<Chips items={tagItems} variant="filter" bind:value={selectedTag} onchange={onTagChange} />
			{/if}
			<p class="album-section__count" aria-live="polite">
				{filtered.length} {i18n(I18nKey.albumsCounts)}
			</p>
		</div>
	{/if}

	{#if phase !== "idle"}
		<div class="album-section__loading" class:album-section__loading--out={phase === "out"}>
			<LoadingIndicator contained size={64} />
		</div>
	{:else if filtered.length > 0}
		<div class="album-section__grid">
			{#each filtered as album, index (album.id)}
				<div class="album-section__item" style={`--album-delay: ${Math.min(index, 7) * 45}ms`}>
					<AlbumCard {album} />
				</div>
			{/each}
		</div>
	{:else}
		<div class="album-section__empty">
			<Icon icon="material-symbols:search-off-rounded" aria-hidden="true" />
			<span>{i18n(I18nKey.albumsNoResults)}</span>
		</div>
	{/if}
</Card>

<style lang="stylus">
.album-section
	display: block
	&__tools
		display: grid
		gap: 0.875rem
		padding-bottom: 1.5rem
		border-bottom: 1px solid var(--outline-variant)
	&__search
		position: relative
		width: 100%
		max-width: 32rem
		:global(.m3-text-field)
			width: 100%
	&__clear
		position: absolute
		right: 0.5rem
		top: 50%
		display: grid
		place-items: center
		width: 1.75rem
		height: 1.75rem
		padding: 0.25rem
		transform: translateY(-50%)
		border: 0
		border-radius: var(--shape-corner-full)
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		> :global(svg)
			width: 1.25rem
			height: 1.25rem
	&__count
		margin: 0
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-small)
	&__grid
		display: grid
		grid-template-columns: repeat(1, minmax(0, 1fr))
		gap: 1rem
		padding-top: 1.5rem
		@media (min-width: 40rem)
			grid-template-columns: repeat(2, minmax(0, 1fr))
		@media (min-width: 75rem)
			grid-template-columns: repeat(3, minmax(0, 1fr))
	&__item
		min-width: 0
		animation: album-card-in var(--m3e-duration-long) var(--m3e-easing-emphasized-decelerate) both
		animation-delay: var(--album-delay)
	&__loading
		display: grid
		place-items: center
		min-height: 12rem
		padding-top: 1.5rem
		opacity: 1
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)
		&--out
			opacity: 0
	&__empty
		display: grid
		place-items: center
		gap: 0.75rem
		min-height: 12rem
		padding-top: 1.5rem
		color: var(--on-surface-variant)
		font: var(--m3e-type-body-medium)
		> :global(svg)
			width: 2rem
			height: 2rem

@keyframes album-card-in
	from
		opacity: 0
		transform: translateY(0.5rem)
	to
		opacity: 1
		transform: translateY(0)

:global(html.motion-reduced) .album-section__item
	animation: none

:global(html.motion-reduced) .album-section__loading
	transition: none

@media (prefers-reduced-motion: reduce)
	.album-section__item
		animation: none
	.album-section__loading
		transition: none
</style>
