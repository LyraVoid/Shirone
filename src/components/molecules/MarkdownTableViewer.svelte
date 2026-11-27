<script lang="ts">
import IconButton from "@components/atoms/action/IconButton.svelte";
import Dialog from "@components/atoms/overlay/Dialog.svelte";
import Tooltip from "@components/atoms/overlay/Tooltip.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";

let { scroller, table }: { scroller: HTMLElement; table: HTMLTableElement } =
	$props();

let open = $state(false);
let overflowing = $state(false);
const expandLabel = i18n(I18nKey.markdownTableExpand);
const title = i18n(I18nKey.markdownTablePreview);

$effect(() => {
	const observer = new ResizeObserver(() => {
		if (table.parentElement !== scroller) return;
		overflowing =
			scroller.clientWidth > 0 && scroller.scrollWidth > scroller.clientWidth;
	});
	observer.observe(scroller);
	observer.observe(table);
	return () => observer.disconnect();
});

function moveTable(destination: HTMLElement) {
	if (destination.moveBefore && destination.isConnected && table.isConnected) {
		destination.moveBefore(table, null);
	} else {
		destination.append(table);
	}
}

function showTable(viewport: HTMLElement) {
	const { scrollLeft } = scroller;
	const minBlockSize = scroller.style.minBlockSize;
	// Keep the article at the same height while the original table is in the dialog.
	scroller.style.minBlockSize = `${scroller.offsetHeight}px`;
	moveTable(viewport);

	return {
		destroy() {
			moveTable(scroller);
			scroller.style.minBlockSize = minBlockSize;
			scroller.scrollLeft = scrollLeft;
		},
	};
}
</script>

{#if overflowing || open}
	<div class="m3-markdown-table-viewer__action not-prose">
		<Tooltip label={expandLabel} placement="top">
			<IconButton
				icon="material-symbols:fullscreen-rounded"
				label={expandLabel}
				variant="tonal"
				size="xsmall"
				ariaHaspopup="dialog"
				onclick={() => (open = true)}
			/>
		</Tooltip>
	</div>
{/if}

<Dialog bind:open {title} class="m3-markdown-table-viewer__dialog">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users can scroll this named region.) -->
	<div
		class="m3-markdown-table-viewer__scroll"
		role="region"
		aria-label={title}
		tabindex="0"
		use:showTable
	></div>
</Dialog>

<style lang="stylus">
:global(.markdown-table-preview)
	position: relative
	min-inline-size: 0

.m3-markdown-table-viewer__action
	position: absolute
	inset-block-start: var(--m3e-space-2)
	inset-inline-end: var(--m3e-space-2)
	z-index: 1
	display: flex

	@media (pointer: coarse)
		:global(.m3-icon-button)
			min-inline-size: calc(2 * var(--m3e-space-6))
			min-block-size: calc(2 * var(--m3e-space-6))

@media (hover: hover) and (pointer: fine)
	.m3-markdown-table-viewer__action
		opacity: 0
		pointer-events: none
		transition: opacity var(--m3e-duration-short) var(--m3e-easing-standard)

	:global(.markdown-table-preview:hover) > .m3-markdown-table-viewer__action,
	.m3-markdown-table-viewer__action:focus-within
		opacity: 1
		pointer-events: auto

:global(.m3-markdown-table-viewer__dialog.m3-dialog)
	display: flex
	flex-direction: column
	width: calc(100% - 2 * var(--m3e-space-4))
	min-width: 0
	max-width: 90rem
	max-height: calc(100dvh - 2 * var(--m3e-space-4))
	padding: var(--m3e-space-4)
	overflow: hidden
	overscroll-behavior: contain

	&::backdrop
		overflow: hidden
		overscroll-behavior: contain

	:global(.m3-dialog__header)
		margin-block-end: var(--m3e-space-3)

	:global(.m3-dialog__title)
		font: var(--m3e-type-title-large)

	@media (pointer: coarse)
		:global(.m3-dialog__close-btn)
			min-inline-size: calc(2 * var(--m3e-space-6))
			min-block-size: calc(2 * var(--m3e-space-6))

	:global(.m3-dialog__content)
		display: flex
		flex-direction: column
		min-height: 0

.m3-markdown-table-viewer__scroll
	overflow: auto
	overscroll-behavior: contain
	border-radius: var(--shape-corner-m)
	background: var(--surface-container-lowest)
	scrollbar-width: thin
	scrollbar-color: var(--scrollbar-bg) transparent

	&:focus-visible
		outline: 2px solid var(--primary)
		outline-offset: 2px

	> :global(table)
		margin: 0
		font: inherit

	:global(th), :global(td)
		min-inline-size: 5.5rem

	:global(th), :global(td), :global(code)
		white-space: normal
		overflow-wrap: anywhere
</style>
