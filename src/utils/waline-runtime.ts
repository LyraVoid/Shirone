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

	private setupUploadControl(container: HTMLElement): void {
		// Waline 3.x 把带 aria-label 的 label 当上传按钮，缺少合法按钮语义与键盘入口。
		// 保留 Vue 拥有的节点，用原生按钮代理同一个 file input；名称仍来自 SDK 本地化。
		const label = container.querySelector<HTMLLabelElement>(
			'label[for="wl-image-upload"][aria-label]',
		);
		const input = label?.control;
		if (!label || !(input instanceof HTMLInputElement)) return;
		const button = document.createElement("button");
		button.type = "button";
		button.className = "wl-action m3-state-layer waline-upload";
		button.title = label.title;
		button.setAttribute(
			"aria-label",
			label.getAttribute("aria-label") || label.title,
		);
		button.append(
			...Array.from(label.childNodes, (node) => node.cloneNode(true)),
		);
		button.addEventListener("click", () => input.click(), {
			signal: this.lifecycle?.signal,
		});
		label.classList.add("waline-upload-label");
		label.hidden = true;
		label.before(button);
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
			this.setupUploadControl(container);
			this.setState("ready");
		} catch (error) {
			if (!this.isConnected || generation !== this.generation) return;
			this.request.abort();
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
