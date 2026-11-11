import { prefersReducedMotion } from "./motion";

/** Same-document list history; cross-document navigation remains owned by Swup.
 * Keep Swup metadata and its public location in sync, without synthetic visits.
 * Call connect from onMount and return its cleanup function.
 */
export function createListHistory(options: {
	read: (params: URLSearchParams) => void;
	write: (params: URLSearchParams) => void;
	element: () => HTMLElement | null;
}): {
	connect: () => () => void;
	replace: () => void;
	push: () => void;
	scroll: () => void;
} {
	let pathname = "";
	let restoring = false;
	let frame = 0;
	let scrollTimer: ReturnType<typeof setTimeout> | undefined;
	const remember = () => {
		if (window.location.pathname !== pathname) return;
		history.replaceState(
			{ ...history.state, shironeListScroll: window.scrollY },
			"",
		);
	};
	const syncLocation = (url: URL) => {
		if (window.swup?.location.pathname === url.pathname) {
			window.swup.location.search = url.search;
		}
	};
	const update = (push = false) => {
		if (!pathname || window.location.pathname !== pathname) return;
		restoring = false;
		const url = new URL(window.location.href);
		options.write(url.searchParams);
		if (push && url.href === window.location.href) return;
		if (push) remember();
		const state = {
			...history.state,
			url: url.pathname + url.search + url.hash,
			shironeListPath: pathname,
			shironeListScroll: push
				? window.scrollY
				: (history.state?.shironeListScroll ?? window.scrollY),
		};
		if (push) history.pushState(state, "", url);
		else history.replaceState(state, "", url);
		syncLocation(url);
	};
	return {
		replace: () => update(),
		push: () => update(true),
		scroll: () => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				const element = options.element();
				if (!element?.isConnected) return;
				const header =
					document.querySelector("#top-row")?.getBoundingClientRect().height ??
					64;
				window.scrollTo({
					top: Math.max(
						0,
						window.scrollY + element.getBoundingClientRect().top - header,
					),
					behavior: prefersReducedMotion() ? "instant" : "smooth",
				});
				element.focus({ preventScroll: true });
			});
		},
		connect: () => {
			pathname = window.location.pathname;
			options.read(new URLSearchParams(window.location.search));
			const onScroll = () => {
				clearTimeout(scrollTimer);
				scrollTimer = setTimeout(() => {
					if (!restoring) remember();
				}, 100);
			};
			const onPopState = (event: PopStateEvent) => {
				if (
					window.location.pathname !== pathname ||
					event.state?.shironeListPath !== pathname ||
					!options.element()?.isConnected
				)
					return;
				// Sync before Swup reads location: it sees an already handled URL and skips
				// the visit. Other popstate listeners still receive the event. Local entries
				// retain the shell visit's history index; cross-path visits remain Swup-owned.
				clearTimeout(scrollTimer);
				restoring = true;
				options.read(new URLSearchParams(window.location.search));
				syncLocation(new URL(window.location.href));
				cancelAnimationFrame(frame);
				frame = requestAnimationFrame(() => {
					restoring = false;
					if (typeof event.state?.shironeListScroll === "number")
						window.scrollTo({
							top: event.state.shironeListScroll,
							behavior: "instant",
						});
					update();
				});
			};
			window.addEventListener("popstate", onPopState, true);
			window.addEventListener("scroll", onScroll, { passive: true });
			document.addEventListener("swup:visit:start", remember);
			return () => {
				cancelAnimationFrame(frame);
				clearTimeout(scrollTimer);
				window.removeEventListener("popstate", onPopState, true);
				window.removeEventListener("scroll", onScroll);
				document.removeEventListener("swup:visit:start", remember);
			};
		},
	};
}
