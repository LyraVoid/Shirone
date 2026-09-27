<script lang="ts">
import FloatingToolbar from "@components/atoms/action/FloatingToolbar.svelte";
import IconButton from "@components/atoms/action/IconButton.svelte";
import Dialog from "@components/atoms/overlay/Dialog.svelte";
import Tooltip from "@components/atoms/overlay/Tooltip.svelte";
import Icon from "@iconify/svelte";
import { lockPageScroll } from "@utils/scroll-lock";

interface MermaidViewerLabels {
	controls: string;
	zoomIn: string;
	zoomOut: string;
	reset: string;
	openFullscreen: string;
	closeFullscreen: string;
	fullscreenDiagram: string;
}

let {
	labels,
	onZoomIn,
	onZoomOut,
	onReset,
	onFullscreenOpen,
	onFullscreenClose,
}: {
	labels: MermaidViewerLabels;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onReset: () => void;
	onFullscreenOpen: (viewport: HTMLElement) => void;
	onFullscreenClose: () => void;
} = $props();

let fullscreenOpen = $state(false);
let fullscreenViewport = $state<HTMLElement | undefined>();
let inlineExpanded = $state(false);
let inlineToolbarRow = $state<HTMLElement | undefined>();

function closeInlineToolbar() {
	inlineExpanded = false;
}

$effect(() => {
	if (!inlineExpanded) return;
	const abortController = new AbortController();
	const { signal } = abortController;
	document.addEventListener(
		"pointerdown",
		(event) => {
			if (
				!fullscreenOpen &&
				event.target instanceof Node &&
				!inlineToolbarRow?.contains(event.target) &&
				!(
					event.target instanceof Element &&
					event.target.closest(".markdown-mermaid__viewport")
				)
			) {
				closeInlineToolbar();
			}
		},
		{ capture: true, signal },
	);
	document.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" && !fullscreenOpen) closeInlineToolbar();
		},
		{ signal },
	);
	return () => abortController.abort();
});

$effect(() => {
	if (!fullscreenOpen || !fullscreenViewport) return;
	onFullscreenOpen(fullscreenViewport);
	return onFullscreenClose;
});

$effect(() => {
	if (!fullscreenOpen) return;
	// 滚动锁必须补滚动条宽度，否则全屏打开/关闭时页面宽度会抖动
	// （纯色背景模式下没有常驻滚动条，偏移最明显）。
	return lockPageScroll();
});
</script>

<div
	class="mermaid-viewer__toolbar-row"
	data-mermaid-toolbar
	bind:this={inlineToolbarRow}
>
	<FloatingToolbar
		bind:expanded={inlineExpanded}
		label={labels.controls}
		expandLabel={labels.controls}
		class="mermaid-viewer__toolbar"
	>
		{#snippet leading()}
			<span class="mermaid-viewer__controls-icon" aria-hidden="true">
				<Icon icon="material-symbols:more-horiz" />
			</span>
		{/snippet}
		<Tooltip label={labels.zoomIn} placement="bottom">
			<IconButton
				icon="material-symbols:zoom-in-rounded"
				label={labels.zoomIn}
				size="xsmall"
				onclick={onZoomIn}
			/>
		</Tooltip>
		<Tooltip label={labels.zoomOut} placement="bottom">
			<IconButton
				icon="material-symbols:zoom-out-rounded"
				label={labels.zoomOut}
				size="xsmall"
				onclick={onZoomOut}
			/>
		</Tooltip>
		<Tooltip label={labels.reset} placement="bottom">
			<IconButton
				icon="material-symbols:fit-screen-rounded"
				label={labels.reset}
				size="xsmall"
				onclick={onReset}
			/>
		</Tooltip>
		<Tooltip label={labels.openFullscreen} placement="bottom">
			<IconButton
				icon="material-symbols:fullscreen-rounded"
				label={labels.openFullscreen}
				size="xsmall"
				onclick={() => (fullscreenOpen = true)}
			/>
		</Tooltip>
	</FloatingToolbar>
</div>

<Dialog
	bind:open={fullscreenOpen}
	title={labels.fullscreenDiagram}
	class="mermaid-viewer__dialog"
>
	<div class="mermaid-viewer__fullscreen-shell">
		<div
			class="mermaid-viewer__fullscreen-viewport"
			data-mermaid-fullscreen-viewport
			role="region"
			aria-label={labels.fullscreenDiagram}
			tabindex="0"
			bind:this={fullscreenViewport}
		></div>
		<div class="mermaid-viewer__fullscreen-toolbar">
			<FloatingToolbar expanded={true} label={labels.controls}>
				<Tooltip label={labels.zoomIn} placement="top">
					<IconButton
						icon="material-symbols:zoom-in-rounded"
						label={labels.zoomIn}
						onclick={onZoomIn}
					/>
				</Tooltip>
				<Tooltip label={labels.zoomOut} placement="top">
					<IconButton
						icon="material-symbols:zoom-out-rounded"
						label={labels.zoomOut}
						onclick={onZoomOut}
					/>
				</Tooltip>
				<Tooltip label={labels.reset} placement="top">
					<IconButton
						icon="material-symbols:fit-screen-rounded"
						label={labels.reset}
						onclick={onReset}
					/>
				</Tooltip>
				<Tooltip label={labels.closeFullscreen} placement="top">
					<IconButton
						icon="material-symbols:close-rounded"
						label={labels.closeFullscreen}
						onclick={() => (fullscreenOpen = false)}
					/>
				</Tooltip>
			</FloatingToolbar>
		</div>
	</div>
</Dialog>

<style lang="stylus">
.mermaid-viewer
	&__toolbar-row
		display: flex
		justify-content: flex-end
		min-height: 2.5rem

	&__controls-icon
		display: inline-flex
		align-items: center
		justify-content: center
		pointer-events: none

		:global(svg)
			width: 1.25rem
			height: 1.25rem

	&__fullscreen-shell
		display: grid
		grid-template-columns: minmax(0, 1fr)
		grid-template-rows: minmax(0, 1fr) auto
		gap: var(--m3e-space-3)
		width: 100%
		height: 100%
		min-width: 0
		min-height: 0

	&__fullscreen-viewport
		width: 100%
		min-width: 0
		min-height: 0
		overflow: hidden
		border: 1px solid var(--outline-variant)
		border-radius: var(--shape-corner-l)
		background: var(--surface-container-lowest)
		outline: none

		&:focus-visible
			outline: 2px solid var(--primary)
			outline-offset: 2px

	&__fullscreen-toolbar
		display: flex
		justify-content: center
		width: 100%
		min-width: 0

:global(.mermaid-viewer__toolbar.m3-toolbar--expanded)
	gap: 0
	padding: 4px

	:global(.m3-toolbar__leading)
		display: none

:global(.mermaid-viewer__toolbar .m3-toolbar__content)
	gap: 0

:global(.mermaid-viewer__toolbar .m3-toolbar__toggle)
	width: 2rem
	height: 2rem

:global(.mermaid-viewer__dialog.m3-dialog)
	display: grid
	grid-template-columns: minmax(0, 1fr)
	grid-template-rows: auto minmax(0, 1fr)
	gap: var(--m3e-space-3)
	box-sizing: border-box
	width: calc(100vw - (2 * var(--m3e-space-4)))
	height: calc(100dvh - (2 * var(--m3e-space-4)))
	max-width: none
	max-height: none
	overflow: hidden
	padding: var(--m3e-space-4)

	:global(.m3-dialog__header)
		min-width: 0
		margin-bottom: 0

	:global(.m3-dialog__title)
		min-width: 0
		overflow: hidden
		margin: 0
		font: var(--m3e-type-title-large)
		text-overflow: ellipsis
		white-space: nowrap

	:global(.m3-dialog__content)
		min-width: 0
		height: auto
		min-height: 0
		overflow: hidden

	:global(.m3-dialog__actions)
		display: none
</style>