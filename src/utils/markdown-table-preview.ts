import MarkdownTableViewer from "@components/molecules/MarkdownTableViewer.svelte";
import { mount, unmount } from "svelte";

const viewers = new Map<HTMLElement, () => void>();

/**
 * Owns the teardown for every mounted viewer. The runtime descriptor only runs
 * when the incoming page still has tables, so leaving a table page needs this
 * document-level signal; the listener is dropped once no viewer remains.
 */
function removeDisconnectedViewers(): void {
	for (const [scroller, dispose] of viewers) {
		if (scroller.isConnected) continue;
		dispose();
		viewers.delete(scroller);
	}
	if (viewers.size === 0) {
		document.removeEventListener(
			"swup:content:replace",
			removeDisconnectedViewers,
		);
	}
}

export function initMarkdownTablePreviews(root: ParentNode): void {
	removeDisconnectedViewers();
	for (const scroller of root.querySelectorAll<HTMLElement>(
		".custom-md .markdown-table-scroll",
	)) {
		if (!scroller.isConnected || viewers.has(scroller)) continue;
		const table = scroller.querySelector<HTMLTableElement>(":scope > table");
		if (!table) continue;

		const target = document.createElement("div");
		target.className = "markdown-table-preview";
		scroller.before(target);
		if (target.moveBefore) target.moveBefore(scroller, null);
		else target.append(scroller);
		const viewer = mount(MarkdownTableViewer, {
			target,
			props: { scroller, table },
		});
		viewers.set(scroller, () => {
			void unmount(viewer);
			target.remove();
		});
	}

	if (viewers.size > 0) {
		document.addEventListener(
			"swup:content:replace",
			removeDisconnectedViewers,
		);
	}
}
