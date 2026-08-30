<script lang="ts">
import Icon from "@components/atoms/display/Icon.svelte";
import Menu from "@components/atoms/navigation/Menu.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { copyPageLink } from "@utils/copy-page-link";
import { prefersReducedMotion } from "@utils/motion";
import { tick } from "svelte";
import type { ContextMenuAction } from "@/types/contextMenuConfig";
import type { SidebarPage } from "@/types/sidebarConfig";

let {
	actions,
	pages,
}: { actions: ContextMenuAction[]; pages?: SidebarPage[] } = $props();

let open = $state(false);
let x = $state(0);
let y = $state(0);
let menuRoot = $state<HTMLDivElement>();
let selectionText = $state("");
let openedFromKeyboard = $state(false);

const labels: Record<ContextMenuAction, string> = {
	copySelection: i18n(I18nKey.copySelection),
	backToTop: i18n(I18nKey.backToTop),
	sharePageLink: i18n(I18nKey.copyLink),
};

const icons: Record<ContextMenuAction, string> = {
	copySelection: "material-symbols:content-copy-rounded",
	backToTop: "material-symbols:keyboard-arrow-up-rounded",
	sharePageLink: "material-symbols:link-rounded",
};

function isDesktopPointer(): boolean {
	return window.matchMedia(
		"(min-width: 1024px) and (hover: hover) and (pointer: fine)",
	).matches;
}

function isAllowedPage(): boolean {
	if (!pages?.length) return true;
	const page = document
		.querySelector("#swup-container")
		?.getAttribute("data-current-page");
	return Boolean(page && pages.includes(page as SidebarPage));
}

function availableActions(): ContextMenuAction[] {
	return actions.filter((action) => {
		if (action === "copySelection") return selectionText.length > 0;
		if (action === "backToTop") return window.scrollY > 0;
		return true;
	});
}

let visibleActions = $state<ContextMenuAction[]>([]);

function selectedTextAt(target: Element): string {
	const selection = window.getSelection();
	if (!selection || selection.isCollapsed || selection.rangeCount === 0)
		return "";
	try {
		if (!selection.getRangeAt(0).intersectsNode(target)) return "";
	} catch {
		return "";
	}
	return selection.toString().trim();
}

async function show(event: MouseEvent) {
	if (
		!isDesktopPointer() ||
		!isAllowedPage() ||
		!(event.target instanceof Element)
	)
		return;
	if (!event.target.closest("#swup-container")) return;
	if (
		event.target.closest(
			"input, textarea, select, [contenteditable='true'], [role='menu']",
		)
	)
		return;

	selectionText = selectedTextAt(event.target);
	visibleActions = availableActions();
	if (visibleActions.length === 0) return;
	event.preventDefault();
	openedFromKeyboard = event.clientX === 0 && event.clientY === 0;

	const estimatedWidth = 240;
	const estimatedItemHeight = 44;
	const estimatedHeight = Math.min(
		visibleActions.length * estimatedItemHeight + 16,
		320,
	);
	x = Math.max(
		8,
		Math.min(event.clientX, window.innerWidth - estimatedWidth - 8),
	);
	y = Math.max(
		8,
		Math.min(event.clientY, window.innerHeight - estimatedHeight - 8),
	);
	open = true;
	await tick();
	const bounds = menuRoot?.getBoundingClientRect();
	if (bounds) {
		x = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
		y = Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8));
	}
	menuRoot?.querySelector<HTMLButtonElement>(".m3-menu-item")?.focus();
}

function close() {
	open = false;
}

async function copyText(text: string): Promise<void> {
	try {
		if (!navigator.clipboard) throw new Error("Clipboard API unavailable");
		await navigator.clipboard.writeText(text);
		return;
	} catch {
		const textarea = document.createElement("textarea");
		textarea.value = text;
		textarea.setAttribute("readonly", "");
		textarea.style.position = "fixed";
		textarea.style.opacity = "0";
		document.body.append(textarea);
		textarea.select();
		document.execCommand("copy");
		textarea.remove();
	}
}

async function run(action: ContextMenuAction) {
	close();
	if (action === "backToTop") {
		window.scrollTo({
			top: 0,
			behavior: prefersReducedMotion() ? "auto" : "smooth",
		});
		return;
	}
	if (action === "copySelection") {
		await copyText(selectionText);
		return;
	}
	await copyPageLink();
}

function menuItemsFor(target: EventTarget | null): HTMLButtonElement[] {
	const currentMenu =
		target instanceof Element
			? target.closest<HTMLElement>('[role="menu"]')
			: null;
	if (!currentMenu) return [];
	return Array.from(
		currentMenu.querySelectorAll<HTMLButtonElement>(":scope > .m3-menu-item"),
	);
}

function onMenuKeydown(event: KeyboardEvent) {
	if (!openedFromKeyboard) openedFromKeyboard = true;
	const active = document.activeElement as HTMLButtonElement;
	const items = Array.from(menuItemsFor(event.target));
	const index = items.indexOf(active);
	if (event.key === "ArrowDown" || event.key === "ArrowUp") {
		event.preventDefault();
		const direction = event.key === "ArrowDown" ? 1 : -1;
		items[(index + direction + items.length) % items.length]?.focus();
	}
	if (event.key === "Home" || event.key === "End") {
		event.preventDefault();
		items[event.key === "Home" ? 0 : items.length - 1]?.focus();
	}
}

$effect(() => {
	document.addEventListener("contextmenu", show);
	document.addEventListener("swup:visit:start", close);
	document.addEventListener("swup:content:replace", close);
	return () => {
		document.removeEventListener("contextmenu", show);
		document.removeEventListener("swup:visit:start", close);
		document.removeEventListener("swup:content:replace", close);
	};
});
</script>

{#if open}
	<div
		bind:this={menuRoot}
		class="context-menu-layer"
		class:context-menu--keyboard-focus={openedFromKeyboard}
		data-context-menu
		style={`--context-menu-x: ${x}px; --context-menu-y: ${y}px`}
		onkeydown={onMenuKeydown}
	>
		<Menu bind:open label={i18n(I18nKey.more)} class="context-menu">
			{#each visibleActions as action}
				<button
					class="m3-menu-item m3-state-layer"
					type="button"
					role="menuitem"
					data-context-menu-action={action}
					onclick={() => run(action)}
				>
					<Icon icon={icons[action]} class="m3-menu-item__icon" aria-hidden="true" />
					<span class="m3-menu-item__label">{labels[action]}</span>
				</button>
			{/each}
		</Menu>
	</div>
{/if}

<style lang="stylus">
.context-menu-layer
	position: fixed
	left: var(--context-menu-x)
	top: var(--context-menu-y)
	z-index: 120
	pointer-events: none

.context-menu-layer :global(.context-menu)
	pointer-events: auto
	min-width: 12rem
	max-width: 17rem
	background: var(--surface-container-low)
	padding: 0.5rem 0.25rem
	border-radius: var(--shape-corner-l)
	box-shadow: var(--m3e-elevation-2)

.context-menu-layer :global(.context-menu .m3-menu-item)
	min-height: 3rem
	padding: 0 0.75rem
	gap: 0.75rem
	font: var(--m3e-type-label-large)
	color: var(--on-surface)
	--m3e-state-color: var(--on-surface)
	border-radius: var(--shape-corner-m)

.context-menu-layer :global(.context-menu .m3-menu-item:focus-visible)
	/* Pointer-open menus should not show a keyboard focus ring around the first row. */
	outline: none
	outline-offset: 0

.context-menu-layer.context-menu--keyboard-focus :global(.context-menu .m3-menu-item:focus-visible)
	outline: 2px solid var(--m3e-focus-outline, var(--primary))
	outline-offset: 2px

.context-menu-layer :global(.m3-menu-item__icon)
	flex: 0 0 1.5rem
	width: 1.5rem
	height: 1.5rem
	color: var(--on-surface-variant)
	display: block

@media (max-width: 1023.98px), (hover: none), (pointer: coarse)
	.context-menu-layer
		display: none

@media (hover: hover) and (pointer: fine)
	.context-menu-layer :global(.context-menu .m3-menu-item)
		/* Desktop density -1 resolves the standard 48dp row to 44dp. */
		min-height: 2.75rem
</style>
