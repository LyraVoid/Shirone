<script lang="ts">
import Icon from "@components/atoms/display/Icon.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { paginationPages } from "@utils/pagination";
import { onMount, tick } from "svelte";

/** Interactive list pager. A distinct basename preserves package-mode overrides. */
let {
	currentPage,
	totalPages,
	onpagechange,
}: {
	currentPage: number;
	totalPages: number;
	onpagechange: (page: number) => void;
} = $props();
const pages = $derived(paginationPages(currentPage, totalPages));
let mounted = $state(false);
let editing = $state(false);
let draft = $state("");
let input = $state<HTMLInputElement>();
let jumpButton = $state<HTMLButtonElement>();
const pageLabel = (page: number) =>
	i18n(I18nKey.paginationPage).replace("{page}", String(page));
onMount(() => {
	mounted = true;
});

async function edit() {
	draft = String(currentPage);
	editing = true;
	await tick();
	input?.focus();
	input?.select();
}
async function cancel() {
	editing = false;
	await tick();
	jumpButton?.focus();
}
function commit() {
	const page = /^\d+$/.test(draft) ? Number(draft) : 0;
	if (
		!Number.isSafeInteger(page) ||
		page < 1 ||
		page > totalPages ||
		page === currentPage
	) {
		void cancel();
		return;
	}
	editing = false;
	onpagechange(page);
}
</script>

{#if mounted && totalPages > 1}
	<nav class="m3-blog-pagination" aria-label={i18n(I18nKey.paginationLabel)}>
		<span class="sr-only" aria-live="polite" aria-atomic="true">
			{pageLabel(currentPage)}
		</span>
		<div class="m3-blog-pagination__mobile">
			{@render arrow(-1)}
			{#if editing}
				<input
					class="m3-blog-pagination__jump-input"
					type="text"
					inputmode="numeric"
					maxlength={String(totalPages).length}
					aria-label={i18n(I18nKey.paginationJump)}
					bind:value={draft}
					bind:this={input}
					onblur={() => (editing = false)}
					onkeydown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commit();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							void cancel();
						}
					}}
				/>
			{:else}
				<button
					type="button"
					class="m3-blog-pagination__jump m3-state-layer"
					aria-label={`${i18n(I18nKey.paginationJump)} ${currentPage} / ${totalPages}`}
					bind:this={jumpButton}
					onclick={edit}
				>
					<span class="m3-blog-pagination__jump-current">{currentPage}</span>
					<span class="m3-blog-pagination__jump-sep" aria-hidden="true">/</span>
					<span class="m3-blog-pagination__jump-total">{totalPages}</span>
				</button>
			{/if}
			{@render arrow(1)}
		</div>
		<div class="m3-blog-pagination__desktop">
			{@render arrow(-1)}
			<div class="m3-blog-pagination__nums">
				{#each pages as page, index (`${index}:${page}`)}
					{#if page === -1}
						<span class="m3-blog-pagination__ellipsis" aria-hidden="true">
							<Icon icon="material-symbols:more-horiz" />
						</span>
					{:else}
						<button
							type="button"
							class={`m3-blog-pagination__num m3-state-layer ${page === currentPage ? 'm3-blog-pagination__num--active' : ''}`}
							aria-label={pageLabel(page)}
							aria-current={page === currentPage ? "page" : undefined}
							onclick={() => onpagechange(page)}
						>{page}</button>
					{/if}
				{/each}
			</div>
			{@render arrow(1)}
		</div>
	</nav>
{/if}

{#snippet arrow(direction: number)}
	<button
		type="button"
		class="m3-blog-pagination__arrow m3-state-layer"
		aria-label={i18n(direction < 0 ? I18nKey.paginationPrev : I18nKey.paginationNext)}
		disabled={direction < 0 ? currentPage <= 1 : currentPage >= totalPages}
		onclick={() => onpagechange(currentPage + direction)}
	>
		<Icon icon={direction < 0 ? "material-symbols:chevron-left-rounded" : "material-symbols:chevron-right-rounded"} />
	</button>
{/snippet}

<style lang="stylus">
@import "../../styles/pagination.styl"
</style>
