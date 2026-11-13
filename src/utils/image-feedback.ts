/** Progressive enhancement: SSR images stay visible without JavaScript. */
export function imageFeedback(
	node: HTMLImageElement,
	source: string | undefined,
): {
	update: (next: string | undefined) => void;
	destroy: () => void;
} {
	let active = Boolean(source);
	const loaded = () => {
		if (active) node.dataset.imageState = "loaded";
	};
	const failed = () => {
		if (active) node.dataset.imageState = "error";
	};
	const refresh = (next: string | undefined) => {
		active = Boolean(next);
		node.removeEventListener("load", loaded);
		node.removeEventListener("error", failed);
		if (!next) {
			delete node.dataset.imageState;
			return;
		}
		node.addEventListener("load", loaded);
		node.addEventListener("error", failed);
		if (node.complete) node.naturalWidth > 0 ? loaded() : failed();
		else node.dataset.imageState = "pending";
	};
	refresh(source);
	return {
		update: refresh,
		destroy: () => {
			node.removeEventListener("load", loaded);
			node.removeEventListener("error", failed);
		},
	};
}
