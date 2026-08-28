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
	"--mc-outline",
	"--mc-outline-variant",
	"--mc-error",
	"--mc-error-container",
	"--mc-on-error-container",
] as const;

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
	const outline = values["--mc-outline"] || (isDark ? "#968e88" : "#7d7570");
	const outlineVariant =
		values["--mc-outline-variant"] || (isDark ? "#4b4540" : "#cdc4be");

	const primary = values["--mc-primary"] || (isDark ? "#d0bcff" : "#6750a4");
	const onPrimary =
		values["--mc-on-primary"] || (isDark ? "#381e72" : "#ffffff");
	const primaryContainer =
		values["--mc-primary-container"] || (isDark ? "#4f378b" : "#eaddff");
	const onPrimaryContainer =
		values["--mc-on-primary-container"] || (isDark ? "#eaddff" : "#21005d");

	const secondary =
		values["--mc-secondary"] || (isDark ? "#ccc2dc" : "#625b71");
	const secondaryContainer =
		values["--mc-secondary-container"] || (isDark ? "#4a4458" : "#e8def8");
	const onSecondaryContainer =
		values["--mc-on-secondary-container"] || (isDark ? "#e8def8" : "#1d192b");

	const tertiary = values["--mc-tertiary"] || (isDark ? "#efb8c8" : "#7d5260");
	const tertiaryContainer =
		values["--mc-tertiary-container"] || (isDark ? "#633b48" : "#ffd8e4");
	const onTertiaryContainer =
		values["--mc-on-tertiary-container"] || (isDark ? "#ffd8e4" : "#31111d");

	const error = values["--mc-error"] || (isDark ? "#f2b8b5" : "#b3261e");
	const errorContainer =
		values["--mc-error-container"] || (isDark ? "#8c1d18" : "#f9dedc");

	return {
		darkMode: isDark,
		fontFamily: getComputedStyle(document.body).fontFamily,
		background: surfaceLowest,
		mainBkg: primaryContainer,
		textColor: onSurface,

		// Primary / Node tokens
		primaryColor: primaryContainer,
		primaryTextColor: onPrimaryContainer,
		primaryBorderColor: primary,
		nodeBkg: primaryContainer,
		nodeTextColor: onPrimaryContainer,
		nodeBorder: primary,

		// Secondary tokens
		secondaryColor: secondaryContainer,
		secondaryTextColor: onSecondaryContainer,
		secondaryBorderColor: secondary,

		// Tertiary tokens
		tertiaryColor: tertiaryContainer,
		tertiaryTextColor: onTertiaryContainer,
		tertiaryBorderColor: tertiary,

		// Lines & Arrows
		lineColor: onSurfaceVariant,
		arrowheadColor: onSurfaceVariant,
		defaultLinkColor: onSurfaceVariant,

		// Clusters & Subgraphs
		clusterBkg: surfaceLow,
		clusterBorder: outlineVariant,
		titleColor: onSurface,

		// Edge & Link labels (must contrast against diagram canvas)
		edgeLabelBackground: surfaceLowest,
		labelBackground: surfaceLowest,
		labelTextColor: onSurface,

		// Sequence diagram
		actorBkg: primaryContainer,
		actorBorder: primary,
		actorTextColor: onPrimaryContainer,
		actorLineColor: outlineVariant,
		signalColor: onSurface,
		signalTextColor: onSurface,
		labelBoxBkgColor: surfaceContainer,
		labelBoxBorderColor: outlineVariant,
		loopTextColor: onSurface,
		noteBkgColor: tertiaryContainer,
		noteTextColor: onTertiaryContainer,
		noteBorderColor: tertiary,
		activationBkgColor: secondaryContainer,
		activationBorderColor: secondary,
		sequenceNumberColor: onPrimary,

		// State diagram
		stateBkg: primaryContainer,
		stateLabelColor: onPrimaryContainer,
		transitionColor: onSurfaceVariant,
		transitionLabelColor: onSurface,
		labelBackgroundColor: surfaceLowest,
		altBackground: surfaceLowest,
		compositeBackground: surfaceLow,
		compositeBorder: outlineVariant,
		compositeTitleBackground: surfaceContainer,
		specialStateColor: primary,
		innerEndBackground: onSurface,

		// Class diagram
		classText: onSurface,

		// ER diagram
		relationColor: onSurfaceVariant,
		relationLabelColor: onSurface,
		relationLabelBackground: surfaceLowest,
		attributeBackgroundColorOdd: surfaceLowest,
		attributeBackgroundColorEven: surfaceLow,

		// GitGraph
		branchLabelColor: onSurface,
		gitBranchLabel0: onSurface,
		gitBranchLabel1: onSurface,
		gitBranchLabel2: onSurface,
		gitBranchLabel3: onSurface,
		gitBranchLabel4: onSurface,
		gitBranchLabel5: onSurface,
		gitBranchLabel6: onSurface,
		gitBranchLabel7: onSurface,
		tagLabelColor: onPrimaryContainer,
		tagLabelBackground: primaryContainer,
		tagLabelBorder: primary,
		commitLabelColor: onSurface,
		commitLabelBackground: surfaceLowest,

		// Pie chart
		pieTitleTextColor: onSurface,
		pieLegendTextColor: onSurface,
		pieStrokeColor: surfaceLowest,

		// Gantt chart
		gridColor: outlineVariant,
		todayLineColor: error,
		sectionBkgColor: surfaceLow,
		altSectionBkgColor: surfaceLowest,
		sectionBkgColor2: surfaceContainer,
		taskBorderColor: primary,
		taskBkgColor: primaryContainer,
		taskTextColor: onPrimaryContainer,
		taskTextLightColor: onSurface,
		taskTextDarkColor: onSurface,
		taskTextOutsideColor: onSurface,
		activeTaskBorderColor: primary,
		activeTaskBkgColor: primary,
		doneTaskBkgColor: surfaceHigh,
		doneTaskBorderColor: outline,
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
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: "strict",
			suppressErrorRendering: true,
			theme: "base",
			themeVariables: createThemeVariables(theme.values, theme.isDark),
		});

		for (const diagram of targets) {
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
