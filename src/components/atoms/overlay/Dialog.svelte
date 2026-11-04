<script lang="ts">
/**
 * M3E Dialog atom. Native <dialog> supplies top-layer rendering, modal
 * background inertness, and the browser focus trap.
 */

import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Icon from "@iconify/svelte";
import { prefersReducedMotion } from "@utils/motion";
import { tick } from "svelte";

let {
	open = $bindable(false),
	title = "",
	showCloseButton = true,
	children,
	actions,
	class: className = "",
}: {
	open?: boolean;
	title?: string;
	showCloseButton?: boolean;
	children?: import("svelte").Snippet;
	actions?: import("svelte").Snippet;
	class?: string;
} = $props();

let dialogEl = $state<HTMLDialogElement | undefined>();
let rendering = $state(false);
let closing = $state(false);
let lastFocused: HTMLElement | null = null;

function restoreFocus() {
	if (lastFocused?.isConnected) lastFocused.focus();
	lastFocused = null;
}

function finishClose() {
	if (dialogEl?.open) dialogEl.close();
	rendering = false;
	closing = false;
	restoreFocus();
}

function close() {
	open = false;
}

function onCancel(event: Event) {
	event.preventDefault();
	close();
}

function onBackdropClick(event: MouseEvent) {
	if (event.target !== dialogEl || !dialogEl) return;
	const rect = dialogEl.getBoundingClientRect();
	if (
		event.clientX < rect.left ||
		event.clientX > rect.right ||
		event.clientY < rect.top ||
		event.clientY > rect.bottom
	) {
		close();
	}
}

function onAnimationEnd(event: AnimationEvent) {
	if (closing && event.target === dialogEl) finishClose();
}

$effect(() => {
	if (open) {
		if (!rendering) lastFocused = document.activeElement as HTMLElement | null;
		rendering = true;
		closing = false;
		tick().then(() => {
			if (!dialogEl || !open) return;
			if (!dialogEl.open) dialogEl.showModal();
			dialogEl.focus();
		});
	} else if (rendering) {
		if (prefersReducedMotion()) finishClose();
		else closing = true;
	}
});

$effect(() => {
	return () => {
		if (dialogEl?.open) dialogEl.close();
		restoreFocus();
	};
});
</script>

{#if rendering}
	<dialog
		class={`m3-dialog ${className}`}
		class:closing
		aria-label={title}
		tabindex="-1"
		bind:this={dialogEl}
		oncancel={onCancel}
		onclick={onBackdropClick}
		onanimationend={onAnimationEnd}
	>
		{#if title || showCloseButton}
			<div class="m3-dialog__header">
				{#if title}
					<div class="m3-dialog__title">{title}</div>
				{/if}
				{#if showCloseButton}
					<button
						type="button"
						class="m3-dialog__close-btn m3-state-layer"
						aria-label={i18n(I18nKey.close)}
						onclick={close}
					>
						<Icon icon="material-symbols:close-rounded" />
					</button>
				{/if}
			</div>
		{/if}
		{#if children}
			<div class="m3-dialog__content">
				{@render children()}
			</div>
		{/if}
		{#if actions}
			<div class="m3-dialog__actions">
				{@render actions()}
			</div>
		{/if}
	</dialog>
{/if}

<style lang="stylus">
.m3-dialog
	position: fixed
	left: 50%
	top: 50%
	transform: translate(-50%, -50%)
	box-sizing: border-box
	min-width: 17.5rem
	max-width: calc(100vw - 3rem)
	margin: 0
	border: none
	border-radius: var(--shape-corner-xl)
	background: var(--surface-container-high)
	color: var(--on-surface)
	box-shadow: var(--m3e-elevation-3)
	padding: 1.5rem
	animation: m3-dialog-in var(--m3e-duration-medium) var(--m3e-easing-emphasized-decelerate)

	&:focus
		outline: none

	&.closing
		animation: m3-dialog-out var(--m3e-duration-medium) var(--m3e-easing-emphasized-accelerate) forwards

	&::backdrop
		background: unquote("color-mix(in srgb, var(--mc-scrim, #000) 32%, transparent)")
		animation: m3-dialog-fade-in var(--m3e-duration-medium) var(--m3e-easing-standard)

	&.closing::backdrop
		animation: m3-dialog-fade-out var(--m3e-duration-medium) var(--m3e-easing-standard) forwards

	&__header
		display: flex
		align-items: center
		justify-content: space-between
		gap: 1rem
		min-width: 0
		margin-bottom: 1rem

	&__title
		min-width: 0
		font: var(--m3e-type-headline-small)
		color: var(--on-surface)
		margin-bottom: 0

	&__close-btn
		display: inline-flex
		align-items: center
		justify-content: center
		width: 2.25rem
		height: 2.25rem
		padding: 0
		border: none
		border-radius: var(--shape-corner-full)
		background: transparent
		color: var(--on-surface-variant)
		cursor: pointer
		flex-shrink: 0
		margin-left: auto
		--m3e-state-color: var(--on-surface)
		transition:
			background-color var(--m3e-duration-short) var(--m3e-easing-standard),
			color var(--m3e-duration-short) var(--m3e-easing-standard)

		> :global(svg)
			width: 1.25rem
			height: 1.25rem

	&__content
		min-width: 0
		font: var(--m3e-type-body-medium)
		color: var(--on-surface-variant)

	&__actions
		display: flex
		justify-content: flex-end
		gap: 0.5rem
		margin-top: 1.5rem

@keyframes m3-dialog-fade-in
	from
		opacity: 0
	to
		opacity: 1

@keyframes m3-dialog-fade-out
	from
		opacity: 1
	to
		opacity: 0

@keyframes m3-dialog-in
	from
		opacity: 0
		transform: translate(-50%, -50%) scale(0.9)
	to
		opacity: 1
		transform: translate(-50%, -50%) scale(1)

@keyframes m3-dialog-out
	from
		opacity: 1
		transform: translate(-50%, -50%) scale(1)
	to
		opacity: 0
		transform: translate(-50%, -50%) scale(0.9)
</style>