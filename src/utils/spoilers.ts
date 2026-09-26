const SPOILER_SELECTOR = ".m3-spoiler[data-spoiler]";
const boundSpoilers = new WeakSet<HTMLButtonElement>();

function setExpanded(button: HTMLButtonElement, expanded: boolean): void {
	button.setAttribute("aria-expanded", String(expanded));
}

function wire(button: HTMLButtonElement): void {
	if (boundSpoilers.has(button)) return;
	boundSpoilers.add(button);

	button.addEventListener("click", () => {
		setExpanded(button, button.getAttribute("aria-expanded") !== "true");
	});
}

/** Adds touch and keyboard toggling to SSR-native spoiler buttons. */
export function initSpoilers(container: ParentNode = document): void {
	if (typeof document === "undefined") return;
	container.querySelectorAll<HTMLButtonElement>(SPOILER_SELECTOR).forEach(wire);
}
