import { prefersReducedMotion } from "./motion";

let codeTreesInitialized = false;
let activeModalDialog: HTMLDialogElement | null = null;
let lastFocusedExpandBtn: HTMLElement | null = null;
let originalCodeTreePlaceholder: HTMLDivElement | null = null;
let mountedCodeTree: HTMLElement | null = null;
let unlockPageScroll: (() => void) | null = null;

function setExpandButtonState(
	button: HTMLButtonElement,
	expanded: boolean,
): void {
	const label = expanded
		? button.dataset.collapseLabel
		: button.dataset.expandLabel;
	if (label) {
		button.setAttribute("aria-label", label);
		button.title = label;
	}
	button
		.querySelector(".m3-code-tree__icon-expand")
		?.classList.toggle("hidden", expanded);
	button
		.querySelector(".m3-code-tree__icon-collapse")
		?.classList.toggle("hidden", !expanded);
}

function lockPageScroll(): void {
	const root = document.documentElement;
	const body = document.body;
	const previousOverflow = body.style.overflow;
	const previousPaddingInlineEnd = body.style.paddingInlineEnd;
	const scrollbarWidth = window.innerWidth - root.clientWidth;

	if (scrollbarWidth > 0) {
		const currentPadding =
			Number.parseFloat(getComputedStyle(body).paddingInlineEnd) || 0;
		body.style.paddingInlineEnd = `${currentPadding + scrollbarWidth}px`;
	}
	body.style.overflow = "hidden";

	unlockPageScroll = () => {
		body.style.overflow = previousOverflow;
		body.style.paddingInlineEnd = previousPaddingInlineEnd;
		unlockPageScroll = null;
	};
}

function createCodeTreePlaceholder(codeTree: HTMLElement): HTMLDivElement {
	const rect = codeTree.getBoundingClientRect();
	const styles = getComputedStyle(codeTree);
	const placeholder = document.createElement("div");
	placeholder.className = "m3-code-tree-placeholder";
	placeholder.setAttribute("aria-hidden", "true");
	placeholder.style.height = `${rect.height}px`;
	placeholder.style.marginBlock = `${styles.marginBlockStart} ${styles.marginBlockEnd}`;
	placeholder.style.marginInline = `${styles.marginInlineStart} ${styles.marginInlineEnd}`;
	placeholder.style.pointerEvents = "none";
	return placeholder;
}

function isElementVisible(
	button: HTMLButtonElement,
	container: HTMLElement,
): boolean {
	let current: HTMLElement | null = button.parentElement;
	while (current && current !== container) {
		if (
			current.tagName === "DETAILS" &&
			!(current as HTMLDetailsElement).open
		) {
			return false;
		}
		current = current.parentElement;
	}
	return true;
}

function switchCodeTreeFile(
	codeTree: HTMLElement,
	activeBtn: HTMLButtonElement,
	targetPath: string,
): void {
	// 1. Ensure all ancestor directory disclosures are open
	let parentDetails = activeBtn.closest<HTMLDetailsElement>(
		"details.m3-code-tree__disclosure",
	);
	while (parentDetails) {
		parentDetails.open = true;
		parentDetails =
			parentDetails.parentElement?.closest<HTMLDetailsElement>(
				"details.m3-code-tree__disclosure",
			) ?? null;
	}

	// 2. Update navigation buttons and treeitems
	const allNodes = codeTree.querySelectorAll<HTMLElement>(
		".m3-code-tree__tree-node--file",
	);
	for (const node of allNodes) {
		const btn = node.querySelector<HTMLButtonElement>(
			".m3-code-tree__file-btn",
		);
		const isCurrent = btn === activeBtn;
		node.setAttribute("aria-selected", isCurrent ? "true" : "false");
		if (btn) {
			btn.classList.toggle("m3-code-tree__file-btn--active", isCurrent);
			btn.tabIndex = isCurrent ? 0 : -1;
		}
	}

	// 3. Switch code panel
	const allPanels = codeTree.querySelectorAll<HTMLElement>(
		".m3-code-tree__panel",
	);
	for (const panel of allPanels) {
		const isCurrent = panel.dataset.filePath === targetPath;
		panel.classList.toggle("hidden", !isCurrent);
		panel.style.display = isCurrent ? "" : "none";
		if (isCurrent) {
			panel.removeAttribute("hidden");
		} else {
			panel.setAttribute("hidden", "true");
		}
	}
}

function closeCodeTreeModal(): void {
	if (!activeModalDialog) return;

	const dialog = activeModalDialog;
	const restoreDom = () => {
		if (mountedCodeTree && originalCodeTreePlaceholder?.parentNode) {
			originalCodeTreePlaceholder.parentNode.replaceChild(
				mountedCodeTree,
				originalCodeTreePlaceholder,
			);
		}
		mountedCodeTree = null;
		originalCodeTreePlaceholder = null;

		if (dialog.open) {
			dialog.close();
		}
		dialog.remove();
		activeModalDialog = null;

		unlockPageScroll?.();

		if (lastFocusedExpandBtn?.isConnected) {
			setExpandButtonState(lastFocusedExpandBtn as HTMLButtonElement, false);
			lastFocusedExpandBtn.focus();
		}
		lastFocusedExpandBtn = null;
	};

	if (prefersReducedMotion()) {
		restoreDom();
	} else {
		dialog.classList.add("closing");
		dialog.addEventListener(
			"animationend",
			() => {
				restoreDom();
			},
			{ once: true },
		);
	}
}

function openCodeTreeModal(
	codeTree: HTMLElement,
	triggerBtn: HTMLButtonElement,
): void {
	if (activeModalDialog) {
		closeCodeTreeModal();
	}

	lastFocusedExpandBtn = triggerBtn;

	// Create dialog element within .custom-md wrapper to retain markdown styles
	const dialog = document.createElement("dialog");
	dialog.className = "m3-code-tree-dialog custom-md";
	dialog.setAttribute("aria-label", "Expanded Code Tree");

	// Move DOM node into dialog with placeholder anchor for restoration
	originalCodeTreePlaceholder = createCodeTreePlaceholder(codeTree);
	codeTree.parentNode?.insertBefore(originalCodeTreePlaceholder, codeTree);
	mountedCodeTree = codeTree;
	dialog.appendChild(codeTree);

	document.body.appendChild(dialog);
	activeModalDialog = dialog;

	// Backdrop click handler
	dialog.addEventListener("click", (event) => {
		if (event.target === dialog) {
			closeCodeTreeModal();
		}
	});

	// Native cancel (ESC) handler
	dialog.addEventListener("cancel", (event) => {
		event.preventDefault();
		closeCodeTreeModal();
	});

	lockPageScroll();
	dialog.showModal();

	const modalExpandBtn = codeTree.querySelector<HTMLButtonElement>(
		".m3-code-tree__expand-btn",
	);
	if (modalExpandBtn) {
		setExpandButtonState(modalExpandBtn, true);
		modalExpandBtn.focus();
	}
}

/**
 * Initializes client-side interactive file navigation, panel switching,
 * and fullscreen modal expansion for M3E Code Trees with delegated listeners.
 */
export function initCodeTrees(): void {
	if (typeof document === "undefined") return;
	if (codeTreesInitialized) return;
	codeTreesInitialized = true;

	// Delegated click handler
	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		// 1. Expand / Collapse button click
		const expandBtn = target.closest<HTMLButtonElement>(
			".m3-code-tree__expand-btn",
		);
		if (expandBtn) {
			const codeTree = expandBtn.closest<HTMLElement>(".m3-code-tree");
			if (!codeTree) return;

			if (activeModalDialog?.contains(expandBtn)) {
				closeCodeTreeModal();
			} else {
				openCodeTreeModal(codeTree, expandBtn);
			}
			return;
		}

		// 2. File button click
		const fileBtn = target.closest<HTMLButtonElement>(
			".m3-code-tree__file-btn",
		);
		if (!fileBtn) return;

		const codeTree = fileBtn.closest<HTMLElement>(".m3-code-tree");
		if (!codeTree) return;

		const targetPath = fileBtn.dataset.fileTarget;
		if (!targetPath) return;

		switchCodeTreeFile(codeTree, fileBtn, targetPath);
	});

	// Delegated keyboard navigation
	document.addEventListener("keydown", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

		const fileBtn = target.closest<HTMLButtonElement>(
			".m3-code-tree__file-btn",
		);
		if (!fileBtn) return;

		const codeTree = fileBtn.closest<HTMLElement>(".m3-code-tree");
		if (!codeTree) return;

		const allButtons = Array.from(
			codeTree.querySelectorAll<HTMLButtonElement>(".m3-code-tree__file-btn"),
		);
		const visibleButtons = allButtons.filter((btn) =>
			isElementVisible(btn, codeTree),
		);
		const currentIndex = visibleButtons.indexOf(fileBtn);
		if (currentIndex === -1) return;

		let nextIndex = -1;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			nextIndex = (currentIndex + 1) % visibleButtons.length;
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			nextIndex =
				(currentIndex - 1 + visibleButtons.length) % visibleButtons.length;
		} else if (event.key === "Home") {
			event.preventDefault();
			nextIndex = 0;
		} else if (event.key === "End") {
			event.preventDefault();
			nextIndex = visibleButtons.length - 1;
		}

		if (nextIndex !== -1 && visibleButtons[nextIndex]) {
			const targetBtn = visibleButtons[nextIndex];
			targetBtn.focus();
			const targetPath = targetBtn.dataset.fileTarget;
			if (targetPath) {
				switchCodeTreeFile(codeTree, targetBtn, targetPath);
			}
		}
	});
}
