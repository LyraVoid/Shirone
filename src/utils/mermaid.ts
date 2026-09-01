import type { MermaidInteractionController } from "./mermaid-interaction";

const DIAGRAM_SELECTOR = ".markdown-mermaid[data-mermaid]";
const THEME_PROPERTIES = [
	"--mc-primary",
	"--mc-on-primary",
	"--mc-primary-container",
	"--mc-on-primary-container",
	"--mc-secondary",
	"--mc-on-secondary",
	"--mc-secondary-container",
	"--mc-on-secondary-container",
	"--mc-tertiary",
	"--mc-on-tertiary",
	"--mc-tertiary-container",
	"--mc-on-tertiary-container",
	"--mc-surface",
	"--mc-surface-container-lowest",
	"--mc-surface-container-low",
	"--mc-surface-container",
	"--mc-surface-container-high",
	"--mc-on-surface",
	"--mc-on-surface-variant",
	"--mc-inverse-surface",
	"--mc-inverse-on-surface",
	"--mc-outline",
	"--mc-outline-variant",
	"--mc-error",
	"--mc-error-container",
	"--mc-on-error-container",
] as const;

const MERMAID_TEXT_CONTRAST = 4.5;
const MERMAID_LINE_CONTRAST = 3;

let initializationPromise: Promise<void> | undefined;
let renderTimer: number | undefined;
let renderSequence = 0;
let rendering = false;
let rerenderRequested = false;
let lastThemeSignature = "";
let swupBound = false;
const interactionControllers = new WeakMap<
	HTMLElement,
	MermaidInteractionController
>();
const interactionHosts = new Set<HTMLElement>();

function cleanupDisconnectedInteractions() {
	for (const host of interactionHosts) {
		if (host.isConnected) continue;
		interactionControllers.get(host)?.destroy();
		interactionControllers.delete(host);
		interactionHosts.delete(host);
	}
}

function readTheme() {
	const root = document.documentElement;
	const styles = getComputedStyle(root);
	const values = Object.fromEntries(
		THEME_PROPERTIES.map((property) => [
			property,
			styles.getPropertyValue(property).trim(),
		]),
	);
	const isDark = root.classList.contains("dark");
	const signature = [
		isDark ? "dark" : "light",
		...THEME_PROPERTIES.map((property) => values[property]),
	].join("|");

	return { isDark, values, signature };
}

function parseColor(color: string): [number, number, number] | null {
	const value = color.trim().toLowerCase();
	const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/)?.[1];
	if (hex) {
		const expanded =
			hex.length === 3
				? hex
						.split("")
						.map((channel) => channel + channel)
						.join("")
				: hex;
		return [
			Number.parseInt(expanded.slice(0, 2), 16),
			Number.parseInt(expanded.slice(2, 4), 16),
			Number.parseInt(expanded.slice(4, 6), 16),
		];
	}
	const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
	return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

function relativeLuminance(color: string): number | null {
	const channels = parseColor(color);
	if (!channels) return null;
	const linear = channels.map((channel) => {
		const normalized = channel / 255;
		return normalized <= 0.03928
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	if (foregroundLuminance === null || backgroundLuminance === null) return 0;
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);
	return (lighter + 0.05) / (darker + 0.05);
}

function readableColor(
	background: string,
	candidates: string[],
	minimumContrast: number,
): string {
	let best = candidates[0] ?? background;
	let bestContrast = contrastRatio(best, background);
	for (const candidate of candidates) {
		const contrast = contrastRatio(candidate, background);
		if (contrast > bestContrast) {
			best = candidate;
			bestContrast = contrast;
		}
		if (contrast >= minimumContrast) return candidate;
	}
	return best;
}

function createThemeVariables(values: Record<string, string>, isDark: boolean) {
	const surfaceLowest =
		values["--mc-surface-container-lowest"] || (isDark ? "#0f0e0c" : "#ffffff");
	const surfaceLow =
		values["--mc-surface-container-low"] || (isDark ? "#1c1b18" : "#f7f2ee");
	const surfaceContainer =
		values["--mc-surface-container"] || (isDark ? "#201f1c" : "#f1ede7");
	const surfaceHigh =
		values["--mc-surface-container-high"] || (isDark ? "#2b2a26" : "#ebe7e1");
	const onSurface =
		values["--mc-on-surface"] || (isDark ? "#e6e1db" : "#1c1b18");
	const onSurfaceVariant =
		values["--mc-on-surface-variant"] || (isDark ? "#cdc4be" : "#4b4540");
	const inverseOnSurface =
		values["--mc-inverse-on-surface"] || (isDark ? "#1c1b18" : "#e6e1db");

	const primary = values["--mc-primary"] || (isDark ? "#d0bcff" : "#6750a4");
	const onPrimary =
		values["--mc-on-primary"] || (isDark ? "#381e72" : "#ffffff");
	const primaryContainer =
		values["--mc-primary-container"] || (isDark ? "#4f378b" : "#eaddff");
	const onPrimaryContainer =
		values["--mc-on-primary-container"] || (isDark ? "#eaddff" : "#21005d");

	const secondary =
		values["--mc-secondary"] || (isDark ? "#ccc2dc" : "#625b71");
	const onSecondary =
		values["--mc-on-secondary"] || (isDark ? "#332d3f" : "#ffffff");
	const secondaryContainer =
		values["--mc-secondary-container"] || (isDark ? "#4a4458" : "#e8def8");
	const onSecondaryContainer =
		values["--mc-on-secondary-container"] || (isDark ? "#e8def8" : "#1d192b");

	const tertiary = values["--mc-tertiary"] || (isDark ? "#efb8c8" : "#7d5260");
	const onTertiary =
		values["--mc-on-tertiary"] || (isDark ? "#492532" : "#ffffff");
	const tertiaryContainer =
		values["--mc-tertiary-container"] || (isDark ? "#633b48" : "#ffd8e4");
	const onTertiaryContainer =
		values["--mc-on-tertiary-container"] || (isDark ? "#ffd8e4" : "#31111d");

	const error = values["--mc-error"] || (isDark ? "#f2b8b5" : "#b3261e");
	const errorContainer =
		values["--mc-error-container"] || (isDark ? "#8c1d18" : "#f9dedc");

	const canvasText = readableColor(
		surfaceLowest,
		[onSurface, onSurfaceVariant, inverseOnSurface, onPrimaryContainer],
		MERMAID_TEXT_CONTRAST,
	);
	const canvasLine = readableColor(
		surfaceLowest,
		[onSurfaceVariant, onSurface, inverseOnSurface, onPrimaryContainer],
		MERMAID_LINE_CONTRAST,
	);
	const primaryText = readableColor(
		primaryContainer,
		[onPrimaryContainer, onPrimary, canvasText, inverseOnSurface],
		MERMAID_TEXT_CONTRAST,
	);
	const secondaryText = readableColor(
		secondaryContainer,
		[onSecondaryContainer, onSecondary, canvasText, inverseOnSurface],
		MERMAID_TEXT_CONTRAST,
	);
	const tertiaryText = readableColor(
		tertiaryContainer,
		[onTertiaryContainer, onTertiary, canvasText, inverseOnSurface],
		MERMAID_TEXT_CONTRAST,
	);
	const surfaceLowText = readableColor(
		surfaceLow,
		[onSurface, onSurfaceVariant, inverseOnSurface, onPrimaryContainer],
		MERMAID_TEXT_CONTRAST,
	);
	const surfaceContainerText = readableColor(
		surfaceContainer,
		[onSurface, onSurfaceVariant, inverseOnSurface, onPrimaryContainer],
		MERMAID_TEXT_CONTRAST,
	);
	const surfaceHighText = readableColor(
		surfaceHigh,
		[onSurface, onSurfaceVariant, inverseOnSurface, onPrimaryContainer],
		MERMAID_TEXT_CONTRAST,
	);
	const gitLabelText = readableColor(
		surfaceContainer,
		[onSurface, onSurfaceVariant, inverseOnSurface, onPrimaryContainer],
		MERMAID_TEXT_CONTRAST,
	);
	const primaryBorder = readableColor(
		primaryContainer,
		[primary, canvasLine, inverseOnSurface],
		MERMAID_LINE_CONTRAST,
	);
	const secondaryBorder = readableColor(
		secondaryContainer,
		[secondary, canvasLine, inverseOnSurface],
		MERMAID_LINE_CONTRAST,
	);
	const tertiaryBorder = readableColor(
		tertiaryContainer,
		[tertiary, canvasLine, inverseOnSurface],
		MERMAID_LINE_CONTRAST,
	);

	return {
		darkMode: isDark,
		fontFamily: getComputedStyle(document.body).fontFamily,
		background: surfaceLowest,
		mainBkg: primaryContainer,
		textColor: canvasText,
		journeySectionBackground: surfaceLow,
		journeySectionTextColor: surfaceLowText,
		journeyTaskBackground: surfaceContainer,
		journeyTaskTextColor: surfaceContainerText,
		timelineNodeBackground: surfaceHigh,
		timelineNodeTextColor: surfaceHighText,
		gitLabelBackground: surfaceContainer,
		gitLabelTextColor: gitLabelText,
		kanbanColumnBackground: surfaceLow,
		kanbanColumnTextColor: surfaceLowText,
		kanbanCardBackground: surfaceContainer,
		kanbanCardTextColor: surfaceContainerText,
		classEdgeLabelBackground: primaryContainer,
		classEdgeLabelTextColor: primaryText,

		// Primary / Node tokens
		primaryColor: primaryContainer,
		primaryTextColor: primaryText,
		primaryBorderColor: primaryBorder,
		nodeBkg: primaryContainer,
		nodeTextColor: primaryText,
		nodeBorder: primaryBorder,

		// Secondary tokens
		secondaryColor: secondaryContainer,
		secondaryTextColor: secondaryText,
		secondaryBorderColor: secondaryBorder,

		// Tertiary tokens
		tertiaryColor: tertiaryContainer,
		tertiaryTextColor: tertiaryText,
		tertiaryBorderColor: tertiaryBorder,

		// Lines & Arrows
		lineColor: canvasLine,
		arrowheadColor: canvasLine,
		defaultLinkColor: canvasLine,

		// Clusters & Subgraphs
		clusterBkg: surfaceLow,
		clusterBorder: canvasLine,
		titleColor: canvasText,

		// Edge & Link labels (must contrast against diagram canvas)
		edgeLabelBackground: surfaceLowest,
		labelBackground: surfaceLowest,
		labelTextColor: canvasText,

		// Sequence diagram
		actorBkg: primaryContainer,
		actorBorder: primaryBorder,
		actorTextColor: primaryText,
		actorLineColor: canvasLine,
		signalColor: canvasLine,
		signalTextColor: canvasText,
		labelBoxBkgColor: surfaceContainer,
		labelBoxBorderColor: canvasLine,
		loopTextColor: canvasText,
		noteBkgColor: tertiaryContainer,
		noteTextColor: tertiaryText,
		noteBorderColor: tertiaryBorder,
		activationBkgColor: secondaryContainer,
		activationBorderColor: secondaryBorder,
		sequenceNumberColor: onPrimary,

		// State diagram
		stateBkg: primaryContainer,
		stateLabelColor: primaryText,
		transitionColor: canvasLine,
		transitionLabelColor: canvasText,
		labelBackgroundColor: surfaceLowest,
		altBackground: surfaceLowest,
		compositeBackground: surfaceLow,
		compositeBorder: canvasLine,
		compositeTitleBackground: surfaceContainer,
		specialStateColor: primary,
		innerEndBackground: canvasText,

		// Class diagram
		classText: canvasText,

		// ER diagram
		relationColor: canvasLine,
		relationLabelColor: canvasText,
		relationLabelBackground: surfaceLowest,
		attributeBackgroundColorOdd: surfaceLowest,
		attributeBackgroundColorEven: surfaceLow,

		// GitGraph
		branchLabelColor: canvasText,
		gitBranchLabel0: canvasText,
		gitBranchLabel1: canvasText,
		gitBranchLabel2: canvasText,
		gitBranchLabel3: canvasText,
		gitBranchLabel4: canvasText,
		gitBranchLabel5: canvasText,
		gitBranchLabel6: canvasText,
		gitBranchLabel7: canvasText,
		tagLabelColor: primaryText,
		tagLabelBackground: primaryContainer,
		tagLabelBorder: primaryBorder,
		commitLabelColor: canvasText,
		commitLabelBackground: surfaceLowest,

		// Pie chart
		pieTitleTextColor: canvasText,
		pieLegendTextColor: canvasText,
		pieStrokeColor: surfaceLowest,

		// Gantt chart
		gridColor: canvasLine,
		todayLineColor: error,
		sectionBkgColor: surfaceLow,
		altSectionBkgColor: surfaceLowest,
		sectionBkgColor2: surfaceContainer,
		taskBorderColor: primaryBorder,
		taskBkgColor: primaryContainer,
		taskTextColor: primaryText,
		taskTextLightColor: canvasText,
		taskTextDarkColor: canvasText,
		taskTextOutsideColor: canvasText,
		activeTaskBorderColor: primaryBorder,
		activeTaskBkgColor: primary,
		doneTaskBkgColor: surfaceHigh,
		doneTaskBorderColor: canvasLine,
		critBorderColor: error,
		critBkgColor: errorContainer,
	};
}

function parseSvg(svg: string): SVGElement {
	const documentNode = new DOMParser().parseFromString(svg, "image/svg+xml");
	if (documentNode.querySelector("parsererror")) {
		throw new Error("Mermaid returned invalid SVG markup");
	}

	const svgElement = documentNode.documentElement;
	if (svgElement.tagName.toLowerCase() !== "svg") {
		throw new Error("Mermaid did not return an SVG element");
	}

	svgElement.removeAttribute("height");
	svgElement.style.removeProperty("max-width");
	const viewBox = svgElement.getAttribute("viewBox")?.split(/\s+/).map(Number);
	if (viewBox?.length === 4 && Number.isFinite(viewBox[2])) {
		svgElement.style.width = `${Math.ceil(viewBox[2])}px`;
	}
	svgElement.setAttribute("data-mermaid-svg", "");

	return document.importNode(svgElement, true) as unknown as SVGElement;
}

function readDiagramSource(diagram: HTMLElement): string {
	const fallback = diagram.querySelector<HTMLElement>(
		".markdown-mermaid__fallback",
	)?.textContent;
	if (fallback) return fallback;

	return Array.from(
		diagram.querySelectorAll<HTMLElement>(".expressive-code .ec-line > .code"),
	)
		.map((line) => line.textContent ?? "")
		.join("\n");
}

function findDiagramHeading(diagram: HTMLElement): HTMLElement | null {
	let sibling = diagram.previousElementSibling;
	while (sibling) {
		if (/^H[1-6]$/.test(sibling.tagName)) return sibling as HTMLElement;
		sibling = sibling.previousElementSibling;
	}
	return null;
}

async function renderDiagrams() {
	if (rendering) {
		rerenderRequested = true;
		return;
	}

	cleanupDisconnectedInteractions();
	const diagrams = Array.from(
		document.querySelectorAll<HTMLElement>(DIAGRAM_SELECTOR),
	);
	if (diagrams.length === 0) return;

	const theme = readTheme();
	const targets = diagrams.filter(
		(diagram) => diagram.dataset.mermaidTheme !== theme.signature,
	);
	if (targets.length === 0) return;

	rendering = true;
	try {
		const { default: mermaid } = await import("mermaid");
		const themeVariables = createThemeVariables(theme.values, theme.isDark);
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			suppressErrorRendering: true,
			theme: "base",
			themeVariables,
		});

		for (const diagram of targets) {
			diagram.style.setProperty(
				"--mermaid-canvas-text",
				themeVariables.textColor,
			);
			diagram.style.setProperty(
				"--mermaid-canvas-line",
				themeVariables.lineColor,
			);
			diagram.style.setProperty(
				"--mermaid-canvas-background",
				themeVariables.background,
			);
			diagram.style.setProperty(
				"--mermaid-node-text",
				themeVariables.primaryTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-node-background",
				themeVariables.primaryColor,
			);
			diagram.style.setProperty(
				"--mermaid-journey-section-background",
				themeVariables.journeySectionBackground,
			);
			diagram.style.setProperty(
				"--mermaid-journey-section-text",
				themeVariables.journeySectionTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-journey-task-background",
				themeVariables.journeyTaskBackground,
			);
			diagram.style.setProperty(
				"--mermaid-journey-task-text",
				themeVariables.journeyTaskTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-timeline-node-background",
				themeVariables.timelineNodeBackground,
			);
			diagram.style.setProperty(
				"--mermaid-timeline-node-text",
				themeVariables.timelineNodeTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-git-label-background",
				themeVariables.gitLabelBackground,
			);
			diagram.style.setProperty(
				"--mermaid-git-label-text",
				themeVariables.gitLabelTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-kanban-column-background",
				themeVariables.kanbanColumnBackground,
			);
			diagram.style.setProperty(
				"--mermaid-kanban-column-text",
				themeVariables.kanbanColumnTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-kanban-card-background",
				themeVariables.kanbanCardBackground,
			);
			diagram.style.setProperty(
				"--mermaid-kanban-card-text",
				themeVariables.kanbanCardTextColor,
			);
			diagram.style.setProperty(
				"--mermaid-class-edge-label-background",
				themeVariables.classEdgeLabelBackground,
			);
			diagram.style.setProperty(
				"--mermaid-class-edge-label-text",
				themeVariables.classEdgeLabelTextColor,
			);
			const source = readDiagramSource(diagram);
			const output = diagram.querySelector<HTMLElement>(
				".markdown-mermaid__diagram",
			);
			if (!source || !output) {
				diagram.dataset.mermaidState = "error";
				console.error(
					"Failed to render Mermaid diagram: source is unavailable",
				);
				continue;
			}

			diagram.dataset.mermaidState = "loading";
			try {
				const id = `shirone-mermaid-${++renderSequence}`;
				const { svg } = await mermaid.render(id, source);
				if (!diagram.isConnected || readTheme().signature !== theme.signature) {
					rerenderRequested = true;
					continue;
				}

				const svgElement = parseSvg(svg);
				const title = svgElement.querySelector("title")?.textContent?.trim();
				output.tabIndex = 0;
				output.setAttribute("role", "region");
				if (title) {
					output.setAttribute("aria-label", title);
					output.removeAttribute("aria-labelledby");
				} else {
					const heading = findDiagramHeading(diagram);
					if (heading?.id) {
						output.setAttribute("aria-labelledby", heading.id);
						output.removeAttribute("aria-label");
					}
				}
				const controller = interactionControllers.get(diagram);
				if (controller) {
					controller.replaceSvg(svgElement);
				} else {
					output.querySelector("[data-mermaid-svg]")?.remove();
					output.append(svgElement);
				}
				diagram.dataset.mermaidTheme = theme.signature;
				diagram.dataset.mermaidState = "ready";

				if (!controller) {
					try {
						const { attachMermaidInteraction } = await import(
							"./mermaid-interaction"
						);
						if (!diagram.isConnected) continue;
						const nextController = attachMermaidInteraction(
							diagram,
							output,
							svgElement,
						);
						interactionControllers.set(diagram, nextController);
						interactionHosts.add(diagram);
					} catch (error) {
						console.error("Failed to add Mermaid diagram interactions", error);
					}
				}
			} catch (error) {
				diagram.dataset.mermaidState = "error";
				console.error("Failed to render Mermaid diagram", error);
			}
		}
	} finally {
		rendering = false;
		if (rerenderRequested) {
			rerenderRequested = false;
			scheduleMermaidRender();
		}
	}
}

export function scheduleMermaidRender(): void {
	window.clearTimeout(renderTimer);
	renderTimer = window.setTimeout(() => void renderDiagrams());
}

async function initializeMermaidDiagrams(): Promise<void> {
	lastThemeSignature = readTheme().signature;

	const themeObserver = new MutationObserver(() => {
		const nextSignature = readTheme().signature;
		if (nextSignature === lastThemeSignature) return;
		lastThemeSignature = nextSignature;
		scheduleMermaidRender();
	});
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ["class", "style"],
	});

	const bindSwup = () => {
		if (!window.swup?.hooks || swupBound) return;
		swupBound = true;
		window.swup.hooks.on("content:replace", () => {
			cleanupDisconnectedInteractions();
			scheduleMermaidRender();
		});
	};
	if (window.swup?.hooks) {
		bindSwup();
	} else {
		document.addEventListener("swup:enable", bindSwup, { once: true });
	}
	scheduleMermaidRender();
}

export function initMermaidDiagrams(): Promise<void> {
	initializationPromise ??= initializeMermaidDiagrams();
	return initializationPromise;
}
