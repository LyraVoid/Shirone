import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { siteConfig } from "@/config/siteConfig";
import { initCodeCopyButtons } from "./code-copy";
import { initCodeTrees } from "./code-tree";
import { initFancybox } from "./fancybox-handler";
import { initKaTeXScrollbars } from "./katex-scroll";
import { scheduleMermaidRender } from "./mermaid";
import { prefersReducedMotion } from "./motion";

type DecryptedHeading = {
	depth: number;
	text: string;
	slug: string;
};

type DynamicTableOfContents = HTMLElement & {
	init?: () => void;
};

/**
 * 文章解密后的客户端运行时初始化协调器
 * @param container 容纳解密后 HTML 的 DOM 根容器元素
 */
export function initPostDecryption(container: HTMLElement): void {
	if (!container) return;

	// Copy uses one delegated listener, so it also covers HTML injected later.
	initCodeCopyButtons();
	initCodeTrees();

	if (
		typeof window !== "undefined" &&
		window.codeBlockCollapser?.setupCodeBlocks
	) {
		window.codeBlockCollapser.setupCodeBlocks(container);
	}

	void initFancybox().catch((error) => {
		console.error("Failed to initialize Fancybox after post decryption", error);
	});

	// The global Mermaid lifecycle is initialized by Layout; dynamic HTML needs a scan.
	scheduleMermaidRender();

	initKaTeXScrollbars(container);

	syncTableOfContents(container);

	handleAnchorScroll();
}

function syncTableOfContents(container: HTMLElement): void {
	const headings = Array.from(
		container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"),
	).flatMap<DecryptedHeading>((heading) => {
		if (!heading.id) return [];
		return [
			{
				depth: Number(heading.tagName.substring(1)),
				text: (heading.textContent ?? "").trim().replace(/#$/, "").trim(),
				slug: heading.id,
			},
		];
	});

	const toc =
		document.querySelector<DynamicTableOfContents>("table-of-contents");
	const nav = toc?.querySelector<HTMLElement>(".m3-blog-toc");
	if (!toc || !nav) return;

	nav.setAttribute("aria-label", i18n(I18nKey.tableOfContents));
	nav.replaceChildren();
	const base = headings.reduce(
		(minimum, heading) => Math.min(minimum, heading.depth),
		Number.POSITIVE_INFINITY,
	);
	let counter = 0;
	for (const heading of headings) {
		const relativeDepth = heading.depth - base;
		if (relativeDepth >= siteConfig.toc.depth) continue;
		const topLevel = relativeDepth === 0;
		const anchor = document.createElement("a");
		anchor.className = `m3-blog-toc__item${topLevel ? "" : " m3-blog-toc__item--sub"}`;
		anchor.href = `#${encodeURIComponent(heading.slug)}`;
		anchor.dataset.tocDepth = String(heading.depth);

		const mark = document.createElement("span");
		mark.className = "m3-blog-toc__mark";
		mark.setAttribute("aria-hidden", "true");
		if (topLevel) {
			counter += 1;
			mark.textContent = String(counter);
		} else {
			const dot = document.createElement("span");
			dot.className = "m3-blog-toc__dot";
			mark.append(dot);
		}

		const text = document.createElement("span");
		text.className = "m3-blog-toc__text";
		text.textContent = heading.text;
		anchor.append(mark, text);
		nav.append(anchor);
	}
	toc.init?.();

	// 通知悬浮目录（#floating-toc-tree）刷新：解密前悬浮面板 SSR 为空态，
	// 解密后需与侧栏 TOC 保持同步。fab-controller 监听该事件并克隆侧栏源。
	document.dispatchEvent(new CustomEvent("shirone:toc-synced"));
}

function handleAnchorScroll(): void {
	if (typeof window === "undefined" || !window.location.hash) return;
	let targetId: string;
	try {
		targetId = decodeURIComponent(window.location.hash.substring(1));
	} catch {
		return;
	}
	const target = document.getElementById(targetId);
	if (target) {
		requestAnimationFrame(() => {
			target.scrollIntoView({
				behavior: prefersReducedMotion() ? "auto" : "smooth",
				block: "start",
			});
		});
	}
}
