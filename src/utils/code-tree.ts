let codeTreesInitialized = false;

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

/**
 * Initializes client-side interactive file navigation and panel switching
 * for M3E Code Trees with delegated listeners, directory disclosures, and full keyboard a11y.
 */
export function initCodeTrees(): void {
	if (typeof document === "undefined") return;
	if (codeTreesInitialized) return;
	codeTreesInitialized = true;

	// Delegated click handler
	document.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		if (!target) return;

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
