/**
 * 代码块折叠（长代码块自动折叠 + 折叠/展开按钮）。
 * 运行时为 `.expressive-code` 代码块注入折叠按钮，行数达到阈值时默认折叠。
 */
const DEFAULT_CONFIG = {
	enabled: true,
	lineThreshold: 20,
	previewLines: 10,
	defaultCollapsed: true,
} as const;

function positiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readConfig(carrier: HTMLElement | null) {
	const dataset = carrier?.dataset ?? {};
	return {
		enabled:
			dataset.codeCollapseEnabled === undefined
				? DEFAULT_CONFIG.enabled
				: dataset.codeCollapseEnabled === "true",
		lineThreshold: positiveInteger(
			dataset.codeCollapseLineThreshold,
			DEFAULT_CONFIG.lineThreshold,
		),
		previewLines: positiveInteger(
			dataset.codeCollapsePreviewLines,
			DEFAULT_CONFIG.previewLines,
		),
		defaultCollapsed:
			dataset.codeCollapseDefaultCollapsed === undefined
				? DEFAULT_CONFIG.defaultCollapsed
				: dataset.codeCollapseDefaultCollapsed === "true",
	};
}

export class CodeBlockCollapser {
	private processedBlocks = new WeakSet<Element>();
	private config: ReturnType<typeof readConfig>;

	constructor() {
		this.config = readConfig(document.getElementById("config-carrier"));
		this.setupCodeBlocks();
	}

	setupCodeBlocks(root: ParentNode = document) {
		if (!this.config.enabled) return;
		requestAnimationFrame(() => {
			for (const codeBlock of root.querySelectorAll(".expressive-code")) {
				if (this.processedBlocks.has(codeBlock)) continue;
				this.processedBlocks.add(codeBlock);
				this.enhanceCodeBlock(codeBlock as HTMLElement);
			}
		});
	}

	private enhanceCodeBlock(codeBlock: HTMLElement) {
		// Code Tree owns a fixed-height scroll viewport. Collapsing an embedded
		// block creates a second, conflicting height model and leaves dead space.
		if (codeBlock.closest(".m3-code-tree")) return;

		const frame = codeBlock.querySelector(":scope > .frame");
		const pre = frame?.querySelector(":scope > pre");
		const lineCount = pre?.querySelectorAll(".ec-line").length ?? 0;

		if (!frame || !pre || lineCount < this.config.lineThreshold) return;

		const collapsed = this.config.defaultCollapsed;
		codeBlock.classList.add(
			"collapsible",
			"auto-collapsible",
			collapsed ? "collapsed" : "expanded",
		);
		codeBlock.dataset.codeLineCount = String(lineCount);
		codeBlock.style.setProperty(
			"--code-collapse-preview-height",
			this.calculatePreviewHeight(pre),
		);

		const button = this.createToggleButton();
		frame.append(button);
		this.updateButton(button, collapsed);
		button.addEventListener("click", () =>
			this.toggleCollapse(codeBlock, button),
		);
	}

	private calculatePreviewHeight(pre: Element): string {
		const line = pre.querySelector(".ec-line");
		const lineHeight = Number.parseFloat(
			line ? getComputedStyle(line).lineHeight : "",
		);
		const preStyle = getComputedStyle(pre);
		const verticalPadding =
			Number.parseFloat(preStyle.paddingTop) +
			Number.parseFloat(preStyle.paddingBottom);
		const height =
			(Number.isFinite(lineHeight) ? lineHeight : 24) *
				this.config.previewLines +
			(Number.isFinite(verticalPadding) ? verticalPadding : 0);
		return `${height}px`;
	}

	private createToggleButton(): HTMLButtonElement {
		const button = document.createElement("button");
		button.className = "collapse-toggle-btn";
		button.type = "button";
		button.innerHTML = `
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path fill="currentColor" d="m12 16.2-6.4-6.4 1.4-1.4 5 5 5-5 1.4 1.4z"></path>
			</svg>
		`;
		return button;
	}

	private updateButton(button: HTMLButtonElement, collapsed: boolean) {
		button.setAttribute("aria-expanded", String(!collapsed));
		button.setAttribute("aria-label", collapsed ? "展开代码块" : "折叠代码块");
		button.title = collapsed ? "展开代码块" : "折叠代码块";
	}

	private toggleCollapse(codeBlock: HTMLElement, button: HTMLButtonElement) {
		const collapsed = !codeBlock.classList.contains("collapsed");
		codeBlock.classList.toggle("collapsed", collapsed);
		codeBlock.classList.toggle("expanded", !collapsed);
		this.updateButton(button, collapsed);
	}
}

// swup 每次替换内容后，为新的代码块注入折叠按钮。
// swup 可能异步启用（swup:enable），需要监听该事件后再绑定 page:view。
const setupCollapse = () => {
	window.codeBlockCollapser = new CodeBlockCollapser();
	const bindSwup = () => {
		window.swup?.hooks?.on("page:view", () => {
			window.codeBlockCollapser.setupCodeBlocks();
		});
	};
	if (window.swup?.hooks) {
		bindSwup();
	} else {
		document.addEventListener("swup:enable", bindSwup, { once: true });
	}
};

setupCollapse();

declare global {
	interface Window {
		codeBlockCollapser: CodeBlockCollapser;
	}
}
