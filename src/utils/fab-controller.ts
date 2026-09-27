/**
 * Shirone FAB 运行时控制器
 * 负责：滚动监测、Swup 导航同步、TOC 弹窗开闭与焦点捕获、页面过滤协同。
 */
import {
	fadeOutThenHide,
	flipFromRect,
	prefersReducedMotion,
	revealIn,
} from "@utils/motion";

interface FabControllerState {
	tocOpen: boolean;
	bannerHeight: number;
}

class FabController {
	private state: FabControllerState = {
		tocOpen: false,
		bannerHeight: 35,
	};

	private bound = false;
	private previousFocus: HTMLElement | null = null;
	private animateVisibility = false;
	private visibilityGeneration = 0;
	private visibilitySync: Promise<void> = Promise.resolve();
	private readonly mobileViewport = window.matchMedia("(max-width: 767.98px)");
	private mobileScrollAnchor = window.scrollY;
	private visualViewportHeight = window.visualViewport?.height ?? 0;
	private visualViewportWidth = window.visualViewport?.width ?? 0;

	constructor() {
		this.init();
	}

	public init(): void {
		const controls = document.getElementById("floating-controls");
		if (controls?.dataset.bannerHeight) {
			const parsed = Number.parseFloat(controls.dataset.bannerHeight);
			if (!Number.isNaN(parsed) && parsed > 0) {
				this.state.bannerHeight = parsed;
			}
		}

		if (this.bound) {
			this.syncPageState();
			return;
		}
		this.bound = true;

		this.bindScrollListener();
		this.bindMobileViewportListener();
		this.bindEvents();
		this.bindSwupHooks();
		this.syncPageState();
		requestAnimationFrame(() => {
			this.animateVisibility = true;
		});
	}

	private bindScrollListener(): void {
		const handleScroll = () => {
			const scrollTop = Math.max(
				document.body.scrollTop,
				document.documentElement.scrollTop,
				window.scrollY,
			);
			const topBtn = document.getElementById("fab-top-btn");
			const configuredRatio = Number.parseFloat(
				topBtn?.dataset.fabThreshold ?? "",
			);
			const ratio = Number.isFinite(configuredRatio)
				? configuredRatio
				: this.state.bannerHeight;
			const threshold = (window.innerHeight * ratio) / 100;

			if (topBtn) {
				const nextAllowed = String(scrollTop > threshold);
				if (topBtn.dataset.fabScrollAllowed !== nextAllowed) {
					topBtn.dataset.fabScrollAllowed = nextAllowed;
					this.scheduleVisibilitySync();
				}
			}
			this.syncMobileScrollVisibility(scrollTop);
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		this.mobileViewport.addEventListener("change", () =>
			this.resetMobileVisibility(),
		);
		handleScroll();
	}

	private syncMobileScrollVisibility(scrollTop: number): void {
		if (!this.mobileViewport.matches || scrollTop < 80 || this.state.tocOpen) {
			this.setMobileControlsHidden(false);
			this.mobileScrollAnchor = scrollTop;
			return;
		}
		const delta = scrollTop - this.mobileScrollAnchor;
		if (Math.abs(delta) < 8) return;
		this.setMobileControlsHidden(delta > 0);
		this.mobileScrollAnchor = scrollTop;
	}

	private bindMobileViewportListener(): void {
		const viewport = window.visualViewport;
		if (!viewport) return;
		const sync = () => {
			const widthChanged =
				Math.abs(viewport.width - this.visualViewportWidth) > 16;
			const heightDelta = viewport.height - this.visualViewportHeight;
			const active = document.activeElement;
			const editing =
				active instanceof HTMLElement &&
				(active.matches("input, textarea, select") || active.isContentEditable);
			if (
				this.mobileViewport.matches &&
				!widthChanged &&
				!editing &&
				!this.state.tocOpen &&
				window.scrollY >= 80
			) {
				if (heightDelta > 16) this.setMobileControlsHidden(true);
				else if (heightDelta < -16) this.setMobileControlsHidden(false);
			}
			this.visualViewportHeight = viewport.height;
			this.visualViewportWidth = viewport.width;
		};
		viewport.addEventListener("resize", sync);
		viewport.addEventListener("scroll", sync);
	}

	private setMobileControlsHidden(hidden: boolean): void {
		const controls = document.getElementById("floating-controls");
		if (!controls) return;
		if (hidden && controls.contains(document.activeElement)) {
			(document.activeElement as HTMLElement).blur();
		}
		controls.classList.toggle("fab-scroll-hidden", hidden);
		controls.toggleAttribute("inert", hidden);
		if (hidden) controls.setAttribute("aria-hidden", "true");
		else controls.removeAttribute("aria-hidden");
	}

	private resetMobileVisibility(): void {
		this.mobileScrollAnchor = window.scrollY;
		this.visualViewportHeight = window.visualViewport?.height ?? 0;
		this.visualViewportWidth = window.visualViewport?.width ?? 0;
		this.setMobileControlsHidden(false);
	}

	private bindEvents(): void {
		const tocBtn = document.getElementById("fab-toc-btn");
		const closeBtn = document.getElementById("floating-toc-close-btn");
		const panel = document.getElementById("floating-toc-panel");

		tocBtn?.addEventListener("click", (e) => {
			e.stopPropagation();
			this.toggleToc();
		});

		closeBtn?.addEventListener("click", (e) => {
			e.stopPropagation();
			this.closeToc();
		});

		// 点击面板外部区域自动收起
		document.addEventListener("click", (e) => {
			if (this.state.tocOpen && panel && !panel.contains(e.target as Node)) {
				this.closeToc();
			}
		});

		// ESC 键收起面板
		document.addEventListener("keydown", (e) => {
			if (e.key === "Escape" && this.state.tocOpen) {
				e.preventDefault();
				this.closeToc();
			} else if (e.key === "Tab" && this.state.tocOpen && panel) {
				this.trapFocus(e, panel);
			}
		});

		// 解密协调器重建侧栏 TOC 后发出通知，刷新悬浮目录（覆盖面板已打开时解密完成的情况）
		document.addEventListener("shirone:toc-synced", () => {
			this.resetMobileVisibility();
			this.syncFloatingToc();
		});

		// 目录项点击平滑跳转并自动收起
		panel?.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const anchor = target.closest<HTMLAnchorElement>("a[href^='#']");
			if (anchor) {
				const hash = anchor.getAttribute("href");
				if (hash && hash.length > 1) {
					const targetId = decodeURIComponent(hash.substring(1));
					const headingEl = document.getElementById(targetId);
					if (headingEl) {
						e.preventDefault();
						const offsetTop = Math.max(
							0,
							headingEl.getBoundingClientRect().top + window.scrollY - 80,
						);
						history.pushState(history.state, "", hash);
						window.scrollTo({ top: offsetTop, behavior: "smooth" });
					}
				}
				if (panel?.dataset.tocCloseOnSelect !== "false") {
					this.closeToc();
				}
			}
		});
	}

	public toggleToc(): void {
		this.state.tocOpen ? this.closeToc() : this.openToc();
	}

	public openToc(): void {
		// 打开前总是从侧栏源（#toc nav.m3-blog-toc）刷新目录内容：
		// 加密文章解锁后侧栏 TOC 由 post-decryption 客户端重建，
		// 悬浮面板需还原实时状态而非残留 SSR 空态。
		this.syncFloatingToc();
		const panel = document.getElementById("floating-toc-panel");
		if (!panel) return;
		this.resetMobileVisibility();
		this.previousFocus =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		this.state.tocOpen = true;
		panel.classList.add("is-open");
		panel.setAttribute("aria-hidden", "false");
		document
			.querySelector("#fab-toc-btn button")
			?.setAttribute("aria-expanded", "true");
		panel.focus();
	}

	public closeToc(): void {
		const panel = document.getElementById("floating-toc-panel");
		this.state.tocOpen = false;
		if (panel) {
			panel.classList.remove("is-open");
			panel.setAttribute("aria-hidden", "true");
		}
		document
			.querySelector("#fab-toc-btn button")
			?.setAttribute("aria-expanded", "false");
		if (this.previousFocus?.isConnected) this.previousFocus.focus();
		this.previousFocus = null;
	}

	public scrollToTop(): void {
		window.scrollTo({ top: 0, behavior: "smooth" });
	}

	public scrollToComment(): void {
		const button = document.getElementById("fab-comment-btn");
		let target: Element | null = null;
		const selector = button?.dataset.fabTargetSelector;
		if (selector) {
			try {
				target = document.querySelector(selector);
			} catch {
				target = null;
			}
		}
		target ||=
			document.getElementById("comments") ||
			document.querySelector("[data-comment-section]") ||
			document.querySelector("#comment-container") ||
			document.querySelector("#twikoo") ||
			document.querySelector(".comment-section");
		if (target) {
			target.scrollIntoView({ behavior: "smooth" });
		}
	}

	public navigateToHome(): void {
		const homeUrl = (document.documentElement.dataset.base || "/") as string;
		if (window.swup) {
			window.swup.navigate(homeUrl);
		} else {
			window.location.href = homeUrl;
		}
	}

	public syncPageState(): void {
		this.resetMobileVisibility();
		const container = document.getElementById("swup-container");
		const currentPage = container?.dataset.currentPage;
		const hasCommentsAttr = container?.dataset.hasComments;
		const items = document.querySelectorAll<HTMLElement>("[data-fab-item]");

		let visibilityChanged = false;
		items.forEach((item) => {
			const type = item.dataset.fabType;
			const pagesAttr = item.dataset.fabPages;

			let isAllowed = true;
			if (pagesAttr && pagesAttr !== "all" && pagesAttr !== "") {
				const allowedPages = pagesAttr.split(",").filter(Boolean);
				isAllowed = Boolean(currentPage && allowedPages.includes(currentPage));
			}
			if (type === "home" && item.dataset.fabOnlySubPages === "true") {
				isAllowed = isAllowed && currentPage !== "home";
			}

			// 评论按钮专属检测：若当前页面未启用/无评论区，则隐藏
			if (type === "comment") {
				const commentSectionExists = Boolean(
					document.querySelector("#comments, [data-comment-section]"),
				);
				const isCommentActive =
					hasCommentsAttr === "true" || commentSectionExists;
				if (!isCommentActive) {
					isAllowed = false;
				}
			}

			const nextAllowed = String(isAllowed);
			if (item.dataset.fabPageAllowed !== nextAllowed) {
				item.dataset.fabPageAllowed = nextAllowed;
				visibilityChanged = true;
			}
		});
		if (visibilityChanged) this.scheduleVisibilitySync();

		this.syncFloatingToc();
		this.closeToc();
	}

	private getFabSlot(item: HTMLElement): HTMLElement {
		let current = item;
		while (
			current.parentElement &&
			current.parentElement.id !== "floating-controls"
		) {
			current = current.parentElement;
		}
		return current;
	}

	private getVisibleSlots(): HTMLElement[] {
		return Array.from(
			document.querySelectorAll<HTMLElement>(
				"#floating-controls > [data-fab-slot]:not(.hidden), #floating-controls > [data-fab-item]:not(.hidden)",
			),
		);
	}

	private scheduleVisibilitySync(): void {
		this.visibilityGeneration += 1;
		this.visibilitySync = this.visibilitySync.then(() =>
			this.syncVisibilityCollection(),
		);
	}

	private shouldShowItem(item: HTMLElement): boolean {
		const pageAllowed = item.dataset.fabPageAllowed !== "false";
		const scrollAllowed =
			item.dataset.fabType !== "top" ||
			item.dataset.fabScrollAllowed === "true";
		return pageAllowed && scrollAllowed;
	}

	private async syncVisibilityCollection(): Promise<void> {
		const generation = this.visibilityGeneration;
		const items = Array.from(
			document.querySelectorAll<HTMLElement>("[data-fab-item]"),
		);
		const slots = items.map((item) => ({
			item,
			slot: this.getFabSlot(item),
			show: this.shouldShowItem(item),
		}));
		const exiters = slots.filter(
			({ slot, show }) => !show && !slot.classList.contains("hidden"),
		);
		const enterers = slots.filter(
			({ slot, show }) => show && slot.classList.contains("hidden"),
		);
		if (exiters.length === 0 && enterers.length === 0) return;

		const visibleBefore = this.getVisibleSlots();
		const rects = new Map(
			visibleBefore.map((visible) => [
				visible,
				visible.getBoundingClientRect(),
			]),
		);

		if (!this.animateVisibility || prefersReducedMotion()) {
			exiters.forEach(({ slot }) => {
				slot.classList.add("hidden");
			});
			enterers.forEach(({ slot }) => {
				slot.classList.remove("hidden");
			});
			this.clearLegacyVisibilityClasses(slots);
			return;
		}
		this.clearLegacyVisibilityClasses(slots);

		await Promise.all(exiters.map(({ slot }) => fadeOutThenHide(slot)));
		if (generation !== this.visibilityGeneration) {
			return;
		}
		enterers.forEach(({ slot }) => {
			slot.classList.remove("hidden");
		});
		visibleBefore
			.filter((visible) => !exiters.some(({ slot }) => slot === visible))
			.forEach((visible) => {
				const rect = rects.get(visible);
				if (rect) flipFromRect(visible, rect);
			});
		enterers.forEach(({ slot }) => {
			revealIn(slot);
		});
	}

	private clearLegacyVisibilityClasses(
		slots: Array<{ item: HTMLElement; slot: HTMLElement }>,
	): void {
		slots.forEach(({ item, slot }) => {
			item.classList.remove("is-hidden", "is-page-hidden");
			slot.classList.remove("is-hidden", "is-page-hidden");
		});
	}

	public syncFloatingToc(): void {
		const tree = document.getElementById("floating-toc-tree");
		const source = document.querySelector("#toc nav.m3-blog-toc");
		const panel = document.getElementById("floating-toc-panel");
		if (!tree || !panel) return;
		if (!source) {
			const empty = document.createElement("div");
			empty.className =
				"py-6 text-center text-xs text-[var(--on-surface-variant)]";
			empty.textContent = panel.dataset.emptyLabel ?? "";
			tree.replaceChildren(empty);
			return;
		}
		const clone = source.cloneNode(true) as HTMLElement;
		const maxDepth = Number.parseInt(panel.dataset.tocMaxDepth ?? "3", 10);
		const entries = [
			...clone.querySelectorAll<HTMLElement>("[data-toc-depth]"),
		];
		const depths = entries
			.map((entry) => Number.parseInt(entry.dataset.tocDepth ?? "", 10))
			.filter(Number.isFinite);
		const baseDepth = depths.length > 0 ? Math.min(...depths) : 1;
		entries.forEach((entry) => {
			const depth = Number.parseInt(entry.dataset.tocDepth ?? "", 10);
			if (Number.isFinite(depth) && depth >= baseDepth + maxDepth) {
				entry.remove();
			}
		});
		tree.replaceChildren(clone);
	}

	private trapFocus(event: KeyboardEvent, panel: HTMLElement): void {
		const focusable = [
			...panel.querySelectorAll<HTMLElement>(
				"button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
			),
		];
		if (!focusable.length) {
			event.preventDefault();
			panel.focus();
			return;
		}
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}

	private bindSwupHooks(): void {
		const swup = window.swup;
		if (!swup) {
			document.addEventListener("swup:enable", () => this.bindSwupHooks(), {
				once: true,
			});
			return;
		}
		swup.hooks.on("content:replace", () => this.syncPageState());
		swup.hooks.on("page:view", () => this.syncPageState());
		swup.hooks.on("visit:start", () => this.closeToc());
	}
}

let controllerInstance: FabController | null = null;

export function initFabController(): FabController {
	if (!controllerInstance) {
		controllerInstance = new FabController();
		(window as unknown as { __shironeFab: FabController }).__shironeFab =
			controllerInstance;
	} else {
		controllerInstance.syncPageState();
	}
	return controllerInstance;
}
