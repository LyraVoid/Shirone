import type { WalineConfig } from "@/types/commentConfig";
import { loadScriptOnce } from "./script-loader";

interface WalineInstance {
	destroy: () => void;
}

interface WalineSdk {
	init: (
		options: Omit<WalineConfig, "scriptUrl" | "styleUrl"> & {
			el: HTMLElement;
			path: string;
			dark: boolean;
			comment: boolean;
			pageview: boolean;
		},
	) => WalineInstance;
}

declare global {
	interface Window {
		Waline?: WalineSdk;
	}
}

const RESOURCE_TIMEOUT_MS = 8_000;

/**
 * 每个页面拥有自己的实例、样式和观察器。
 * 自定义元素的连接/断开回调同时覆盖直达、Swup 替换与缓存页面返回，
 * 无需在持久壳上注册额外的全局监听器。
 */
class ShironeWaline extends HTMLElement {
	private instance?: WalineInstance;
	private observer?: IntersectionObserver;
	private controlsObserver?: MutationObserver;
	private lifecycle?: AbortController;
	private request?: AbortController;
	private stylesheet?: HTMLLinkElement;
	private generation = 0;
	private loading = false;

	connectedCallback(): void {
		this.lifecycle = new AbortController();
		this.setState("loading");
		this.querySelector(".waline-retry")?.addEventListener(
			"click",
			() => void this.mount(),
			{ signal: this.lifecycle.signal },
		);

		if (
			this.dataset.walineLazy === "true" &&
			"IntersectionObserver" in window
		) {
			this.observer = new IntersectionObserver(
				(entries) => {
					if (!entries.some((entry) => entry.isIntersecting)) return;
					this.observer?.disconnect();
					void this.mount();
				},
				{ rootMargin: "200px" },
			);
			this.observer.observe(this);
		} else {
			void this.mount();
		}
	}

	disconnectedCallback(): void {
		this.generation++;
		this.lifecycle?.abort();
		this.request?.abort();
		this.observer?.disconnect();
		this.controlsObserver?.disconnect();
		this.instance?.destroy();
		this.instance = undefined;
		this.stylesheet?.remove();
		this.loading = false;
	}

	private setState(state: "loading" | "ready" | "error"): void {
		this.dataset.walineState = state;
		const loading = this.querySelector<HTMLElement>(".waline-loading");
		const container = this.querySelector<HTMLElement>(".waline-container");
		const error = this.querySelector<HTMLElement>(".waline-error");
		if (loading) loading.hidden = state !== "loading";
		if (container) container.hidden = state !== "ready";
		if (error) error.hidden = state !== "error";
	}

	private loadStylesheet(url: string, signal: AbortSignal): Promise<void> {
		this.stylesheet?.remove();
		const link = document.createElement("link");
		this.stylesheet = link;
		link.rel = "stylesheet";
		link.href = url;
		link.dataset.walineStyle = "";
		return new Promise((resolve, reject) => {
			const cleanup = () => {
				link.onload = null;
				link.onerror = null;
				signal.removeEventListener("abort", abort);
			};
			const fail = (reason: unknown) => {
				cleanup();
				link.remove();
				reject(reason);
			};
			const abort = () => fail(signal.reason);
			link.onload = () => {
				cleanup();
				resolve();
			};
			link.onerror = () => fail(new Error("Waline stylesheet failed to load"));
			signal.addEventListener("abort", abort, { once: true });
			if (signal.aborted) abort();
			else this.append(link);
		});
	}

	private decorateControl(control: HTMLElement, icon: string): void {
		for (const name of ["m3-state-layer", "waline-icon-button"]) {
			if (!control.classList.contains(name)) control.classList.add(name);
		}
		if (!control.querySelector(":scope > .waline-icon")) {
			const template = this.querySelector<HTMLTemplateElement>(
				`template[data-waline-icon="${icon}"]`,
			);
			const glyph = template?.content.querySelector("svg");
			if (glyph) control.append(glyph.cloneNode(true));
		}
		if (!control.hasAttribute("aria-label") && control.title) {
			control.setAttribute("aria-label", control.title);
		}
		if (icon === "emoji" || icon === "preview") {
			const pressed = String(control.classList.contains("active"));
			if (control.getAttribute("aria-pressed") !== pressed)
				control.setAttribute("aria-pressed", pressed);
		}
	}

	private setupControls(container: HTMLElement): void {
		const enhance = () => {
			for (const actions of container.querySelectorAll<HTMLElement>(
				".wl-actions",
			)) {
				// Waline 3.x keeps the emoji toggle first and the preview toggle last;
				// optional GIF/upload controls are between them. Titles are localized.
				const emoji = actions.querySelector<HTMLElement>(
					":scope > button:first-of-type",
				);
				const preview = actions.querySelector<HTMLElement>(
					":scope > button:last-child",
				);
				if (emoji) this.decorateControl(emoji, "emoji");
				if (preview && preview !== emoji)
					this.decorateControl(preview, "preview");

				// Keep Vue's upload label, but proxy the adjacent input with a keyboard button.
				// Query within this toolbar: reply forms reuse the SDK's input IDs.
				const label = actions.querySelector<HTMLLabelElement>(
					'label[for="wl-image-upload"][aria-label]',
				);
				const input =
					actions.querySelector<HTMLInputElement>('input[type="file"]');
				let upload = actions.querySelector<HTMLButtonElement>(".waline-upload");
				if (label && input) {
					if (!upload) {
						upload = document.createElement("button");
						upload.type = "button";
						upload.className = "wl-action waline-upload";
						upload.title = label.title;
						upload.setAttribute(
							"aria-label",
							label.getAttribute("aria-label") || label.title,
						);
						upload.addEventListener("click", () => input.click(), {
							signal: this.lifecycle?.signal,
						});
						label.before(upload);
					}
					if (!label.classList.contains("waline-upload-label"))
						label.classList.add("waline-upload-label");
					label.hidden = true;
					this.decorateControl(upload, "image");
				} else {
					upload?.remove();
				}
				for (const control of actions.querySelectorAll(
					"a.wl-action, button.wl-action",
				)) {
					if (!control.classList.contains("m3-state-layer"))
						control.classList.add("m3-state-layer");
				}
			}
			for (const link of container.querySelectorAll<HTMLAnchorElement>(
				".wl-meta-foot .wl-rss > a",
			)) {
				this.decorateControl(link, "rss");
			}
			for (const close of container.querySelectorAll<HTMLElement>(
				".wl-close",
			)) {
				this.decorateControl(close, "close");
			}
		};
		enhance();
		// Replies render later, and Vue rewrites toggle classes. Reapply only missing
		// decoration; leave SDK-owned nodes and event handlers intact.
		this.controlsObserver = new MutationObserver(enhance);
		this.controlsObserver.observe(container, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ["class"],
		});
	}

	private async mount(): Promise<void> {
		if (this.loading || this.instance || !this.isConnected) return;
		const container = this.querySelector<HTMLElement>(".waline-container");
		const { walineScriptUrl, walineStyleUrl, walineOptions } = this.dataset;
		if (!container || !walineScriptUrl || !walineStyleUrl || !walineOptions)
			return;

		const generation = this.generation;
		this.loading = true;
		this.setState("loading");
		this.request = new AbortController();
		const signal = AbortSignal.any([
			this.request.signal,
			AbortSignal.timeout(RESOURCE_TIMEOUT_MS),
		]);
		try {
			await Promise.all([
				loadScriptOnce(walineScriptUrl, RESOURCE_TIMEOUT_MS),
				this.loadStylesheet(walineStyleUrl, signal),
			]);
			// script 标签不能可靠取消底层加载；离开页面后绝不再初始化旧容器。
			if (!this.isConnected || generation !== this.generation) return;
			const sdk = window.Waline;
			if (typeof sdk?.init !== "function")
				throw new Error("Waline SDK unavailable");
			container.hidden = false;
			this.instance = sdk.init({ ...JSON.parse(walineOptions), el: container });
			this.setupControls(container);
			this.setState("ready");
		} catch (error) {
			if (!this.isConnected || generation !== this.generation) return;
			this.request.abort();
			this.controlsObserver?.disconnect();
			this.stylesheet?.remove();
			container.replaceChildren();
			this.setState("error");
			console.error("[Shirone Comments] Waline initialization failed:", error);
		} finally {
			if (generation === this.generation) this.loading = false;
		}
	}
}

if (!customElements.get("shirone-waline")) {
	customElements.define("shirone-waline", ShironeWaline);
}
