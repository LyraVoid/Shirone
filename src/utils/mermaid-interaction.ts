import MermaidDiagramViewer from "@components/molecules/MermaidDiagramViewer.svelte";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import Panzoom, { type PanOptions, type PanzoomObject } from "@panzoom/panzoom";
import { prefersReducedMotion } from "@utils/motion";
import { mount, unmount } from "svelte";

const MIN_USER_ZOOM = 0.5;
const MAX_USER_ZOOM = 8;
const ZOOM_FACTOR = 1.25;
const SCALE_EPSILON = 0.001;
// Keep the diagram center inside the viewport so free panning cannot lose it.
const PAN_CENTER_INSET_RATIO = 0.1;
const ID_REFERENCE_ATTRIBUTES = new Set([
	"aria-activedescendant",
	"aria-controls",
	"aria-describedby",
	"aria-details",
	"aria-errormessage",
	"aria-flowto",
	"aria-labelledby",
	"aria-owns",
]);
let fullscreenCloneSequence = 0;

interface SvgSize {
	width: number;
	height: number;
}

export interface MermaidInteractionController {
	replaceSvg(svg: SVGElement): void;
	refit(): void;
	reset(): void;
	destroy(): void;
}

function readSvgSize(svg: SVGElement): SvgSize {
	const viewBox = svg.getAttribute("viewBox")?.trim().split(/\s+/).map(Number);
	if (
		viewBox?.length === 4 &&
		Number.isFinite(viewBox[2]) &&
		Number.isFinite(viewBox[3]) &&
		viewBox[2] > 0 &&
		viewBox[3] > 0
	) {
		return { width: viewBox[2], height: viewBox[3] };
	}

	const width = Number.parseFloat(svg.getAttribute("width") ?? "");
	const height = Number.parseFloat(svg.getAttribute("height") ?? "");
	if (width > 0 && height > 0) return { width, height };
	throw new Error("Mermaid SVG has no usable dimensions");
}

function prepareSvg(svg: SVGElement, size: SvgSize) {
	for (const property of [
		"cursor",
		"touch-action",
		"transform",
		"transform-origin",
		"transition",
		"user-select",
	]) {
		svg.style.removeProperty(property);
	}
	svg.style.width = `${size.width}px`;
	svg.style.height = `${size.height}px`;
	svg.style.maxWidth = "none";
	svg.style.maxHeight = "none";
	svg.style.margin = "0";
	svg.setAttribute("text-rendering", "geometricPrecision");
}

function cloneSvgForFullscreen(source: SVGElement) {
	const clone = source.cloneNode(true) as SVGElement;
	const sequence = ++fullscreenCloneSequence;
	const suffix = `-fullscreen-${sequence}`;
	const replacements = new Map<string, string>();
	for (const element of clone.querySelectorAll<HTMLElement>("[id]")) {
		const id = element.id;
		const nextId = `${id}${suffix}`;
		replacements.set(id, nextId);
		element.id = nextId;
	}
	if (clone.id) {
		const nextId = `${clone.id}${suffix}`;
		replacements.set(clone.id, nextId);
		clone.id = nextId;
	}
	const references = [...replacements].sort(
		([left], [right]) => right.length - left.length,
	);
	const replaceHashReferences = (sourceValue: string) => {
		let value = sourceValue;
		for (const [index, [id]] of references.entries()) {
			value = value.replaceAll(
				`#${id}`,
				`#__shirone_mermaid_reference_${sequence}_${index}__`,
			);
		}
		for (const [index, [, nextId]] of references.entries()) {
			value = value.replaceAll(
				`#__shirone_mermaid_reference_${sequence}_${index}__`,
				`#${nextId}`,
			);
		}
		return value;
	};
	for (const element of [clone, ...clone.querySelectorAll<SVGElement>("*")]) {
		for (const attribute of element.getAttributeNames()) {
			let value = element.getAttribute(attribute);
			if (!value) continue;
			if (ID_REFERENCE_ATTRIBUTES.has(attribute)) {
				value = value
					.split(/\s+/)
					.map((id) => replacements.get(id) ?? id)
					.join(" ");
			}
			element.setAttribute(attribute, replaceHashReferences(value));
		}
		if (element.tagName.toLowerCase() === "style" && element.textContent) {
			element.textContent = replaceHashReferences(element.textContent);
		}
	}
	return clone;
}

function motionOptions() {
	if (prefersReducedMotion()) return { animate: false } as const;
	const styles = getComputedStyle(document.documentElement);
	return {
		animate: true,
		duration:
			Number.parseFloat(styles.getPropertyValue("--m3e-duration-medium")) ||
			250,
		easing:
			styles.getPropertyValue("--m3e-easing-emphasized-decelerate").trim() ||
			"cubic-bezier(0.05, 0.7, 0.1, 1)",
	};
}

class DiagramPanZoomSession {
	private panzoom: PanzoomObject | undefined;
	private size: SvgSize;
	private fitScale = 1;
	private stateFrame = 0;
	private resizeFrame = 0;
	private resizeObserver: ResizeObserver | undefined;
	private abortController: AbortController | undefined;

	constructor(
		private readonly viewport: HTMLElement,
		svg: SVGElement,
		private readonly fullscreen: boolean,
	) {
		this.size = readSvgSize(svg);
		this.install(svg, 1);
	}

	private measureFit() {
		const rect = this.viewport.getBoundingClientRect();
		if (rect.width <= 0) return 0;
		if (!this.fullscreen) {
			const fit = Math.min(1, rect.width / this.size.width);
			this.viewport.style.height = `${Math.max(1, this.size.height * fit)}px`;
			return fit;
		}
		if (rect.height <= 0) return 0;
		return Math.min(
			rect.width / this.size.width,
			rect.height / this.size.height,
		);
	}

	private baselinePan(scale = this.fitScale) {
		void scale;
		return { x: 0, y: 0 };
	}

	private install(svg: SVGElement, userZoom: number) {
		this.size = readSvgSize(svg);
		prepareSvg(svg, this.size);
		const transformShell = document.createElement("div");
		transformShell.className = "markdown-mermaid__transform";
		transformShell.style.width = `${this.size.width}px`;
		transformShell.style.height = `${this.size.height}px`;
		transformShell.style.marginLeft = `${-this.size.width / 2}px`;
		transformShell.style.marginTop = `${-this.size.height / 2}px`;
		transformShell.append(svg);
		this.viewport.replaceChildren(transformShell);
		this.viewport.classList.add("markdown-mermaid__viewport");

		this.fitScale = this.measureFit();
		if (this.fitScale <= 0) {
			this.resizeFrame = requestAnimationFrame(() =>
				this.install(svg, userZoom),
			);
			return;
		}

		const scale = this.fitScale * userZoom;
		const baseline = this.baselinePan(scale);
		this.panzoom = Panzoom(transformShell, {
			animate: false,
			canvas: true,
			cursor: "default",
			disablePan: true,
			maxScale: this.fitScale * MAX_USER_ZOOM,
			minScale: this.fitScale * MIN_USER_ZOOM,
			startScale: this.fitScale,
			startX: this.baselinePan().x,
			startY: this.baselinePan().y,
			step: 0.25,
			touchAction: this.fullscreen ? "none" : "pan-y",
			handleStartEvent: (event) => {
				if (!(event instanceof PointerEvent) || event.pointerType !== "touch") {
					event.preventDefault();
				}
				event.stopPropagation();
			},
		});
		this.panzoom.zoom(scale, { animate: false, force: true });
		this.panzoom.pan(baseline.x, baseline.y, {
			animate: false,
			force: true,
		});

		this.abortController = new AbortController();
		const { signal } = this.abortController;
		this.viewport.addEventListener("wheel", this.onWheel, {
			passive: false,
			signal,
		});
		transformShell.addEventListener("panzoomchange", this.onTransform, {
			signal,
		});
		transformShell.addEventListener("panzoomstart", this.onPanStart, {
			signal,
		});
		transformShell.addEventListener("panzoomend", this.onPanEnd, { signal });

		this.resizeObserver = new ResizeObserver(() => this.scheduleRefit());
		this.resizeObserver.observe(this.viewport);
		this.syncInteractionState();
		this.constrainPan();
	}

	private onWheel = (event: WheelEvent) => {
		if (!this.fullscreen && !event.ctrlKey && !event.metaKey) return;
		this.panzoom?.zoomWithWheel(event);
		this.scheduleStateSync();
	};

	private onTransform = () => this.scheduleStateSync(false);

	private onPanStart = () => {
		if (this.isPannable()) this.viewport.dataset.mermaidDragging = "true";
	};

	private onPanEnd = () => {
		delete this.viewport.dataset.mermaidDragging;
		this.constrainPan();
	};

	private scheduleStateSync(constrain = true) {
		cancelAnimationFrame(this.stateFrame);
		this.stateFrame = requestAnimationFrame(() => {
			this.syncInteractionState();
			if (constrain) this.constrainPan();
		});
	}

	private scheduleRefit() {
		cancelAnimationFrame(this.resizeFrame);
		this.resizeFrame = requestAnimationFrame(() => this.refit());
	}

	private isPannable() {
		if (!this.panzoom) return false;
		const scale = this.panzoom.getScale();
		return this.fullscreen || scale > this.fitScale + SCALE_EPSILON;
	}

	private syncInteractionState() {
		if (!this.panzoom) return;
		const scale = this.panzoom.getScale();
		const pannable = this.isPannable();
		this.viewport.dataset.mermaidScale = scale.toFixed(4);
		this.viewport.dataset.mermaidUserZoom = (scale / this.fitScale).toFixed(4);
		this.viewport.dataset.mermaidPannable = String(pannable);
		this.panzoom.setOptions({
			disablePan: !pannable,
			cursor: pannable ? "grab" : "default",
			touchAction: this.fullscreen || pannable ? "none" : "pan-y",
		});
	}

	private constrainPan(options: PanOptions = { animate: false }) {
		if (!this.panzoom) return;
		const rect = this.viewport.getBoundingClientRect();
		const scale = this.panzoom.getScale();
		const pan = this.panzoom.getPan();
		if (!this.isPannable()) {
			if (
				Math.abs(pan.x) >= SCALE_EPSILON ||
				Math.abs(pan.y) >= SCALE_EPSILON
			) {
				this.panzoom.pan(0, 0, { ...options, force: true });
			}
			return;
		}
		const maxX = (rect.width * (0.5 - PAN_CENTER_INSET_RATIO)) / scale;
		const maxY = (rect.height * (0.5 - PAN_CENTER_INSET_RATIO)) / scale;
		const x = Math.min(maxX, Math.max(-maxX, pan.x));
		const y = Math.min(maxY, Math.max(-maxY, pan.y));
		if (
			Math.abs(x - pan.x) < SCALE_EPSILON &&
			Math.abs(y - pan.y) < SCALE_EPSILON
		) {
			return;
		}
		this.panzoom.pan(x, y, { ...options, force: true });
	}

	zoomIn() {
		this.zoomBy(ZOOM_FACTOR);
	}

	zoomOut() {
		this.zoomBy(1 / ZOOM_FACTOR);
	}

	private zoomBy(factor: number) {
		if (!this.panzoom) return;
		const options = motionOptions();
		this.panzoom.zoom(this.panzoom.getScale() * factor, options);
		this.constrainPan(options);
		this.scheduleStateSync(false);
	}

	reset() {
		this.panzoom?.reset(motionOptions());
		this.scheduleStateSync(false);
	}

	refit() {
		if (!this.panzoom) return;
		const userZoom = Math.min(
			MAX_USER_ZOOM,
			Math.max(MIN_USER_ZOOM, this.panzoom.getScale() / this.fitScale),
		);
		const nextFit = this.measureFit();
		if (nextFit <= 0 || Math.abs(nextFit - this.fitScale) < SCALE_EPSILON)
			return;
		this.fitScale = nextFit;
		const baseline = this.baselinePan();
		this.panzoom.setOptions({
			maxScale: nextFit * MAX_USER_ZOOM,
			minScale: nextFit * MIN_USER_ZOOM,
			startScale: nextFit,
			startX: baseline.x,
			startY: baseline.y,
		});
		const scale = nextFit * userZoom;
		const centered = this.baselinePan(scale);
		this.panzoom.zoom(scale, { animate: false, force: true });
		this.panzoom.pan(centered.x, centered.y, { animate: false, force: true });
		this.scheduleStateSync();
	}

	replaceSvg(svg: SVGElement) {
		const userZoom = this.panzoom
			? Math.min(
					MAX_USER_ZOOM,
					Math.max(MIN_USER_ZOOM, this.panzoom.getScale() / this.fitScale),
				)
			: 1;
		this.releaseEngine();
		this.install(svg, userZoom);
	}

	private releaseEngine() {
		cancelAnimationFrame(this.stateFrame);
		cancelAnimationFrame(this.resizeFrame);
		this.resizeObserver?.disconnect();
		this.abortController?.abort();
		this.panzoom?.destroy();
		this.panzoom?.resetStyle();
		this.panzoom = undefined;
		delete this.viewport.dataset.mermaidDragging;
	}

	destroy() {
		this.releaseEngine();
		this.viewport.classList.remove("markdown-mermaid__viewport");
		this.viewport.style.removeProperty("height");
		for (const key of ["mermaidScale", "mermaidUserZoom", "mermaidPannable"]) {
			delete this.viewport.dataset[key];
		}
	}
}

class MermaidInteractionControllerImpl implements MermaidInteractionController {
	private readonly inlineSession: DiagramPanZoomSession;
	private fullscreenSession: DiagramPanZoomSession | undefined;
	private currentSvg: SVGElement;
	private readonly uiRoot: HTMLElement;
	private readonly component: ReturnType<typeof mount>;

	constructor(
		private readonly host: HTMLElement,
		viewport: HTMLElement,
		svg: SVGElement,
	) {
		this.currentSvg = svg;
		this.inlineSession = new DiagramPanZoomSession(viewport, svg, false);
		this.uiRoot = document.createElement("div");
		this.uiRoot.className = "markdown-mermaid__controls";
		viewport.before(this.uiRoot);

		const diagramName =
			viewport.getAttribute("aria-label") ?? i18n(I18nKey.mermaidControls);
		const fullscreenDiagram = i18n(I18nKey.mermaidFullscreenDiagram).replace(
			"{diagram}",
			diagramName,
		);
		this.component = mount(MermaidDiagramViewer, {
			target: this.uiRoot,
			props: {
				labels: {
					controls: i18n(I18nKey.mermaidControls),
					zoomIn: i18n(I18nKey.mermaidZoomIn),
					zoomOut: i18n(I18nKey.mermaidZoomOut),
					reset: i18n(I18nKey.mermaidResetView),
					openFullscreen: i18n(I18nKey.mermaidOpenFullscreen),
					closeFullscreen: i18n(I18nKey.mermaidCloseFullscreen),
					fullscreenDiagram,
				},
				onZoomIn: () => this.activeSession().zoomIn(),
				onZoomOut: () => this.activeSession().zoomOut(),
				onReset: () => this.activeSession().reset(),
				onFullscreenOpen: (fullscreenViewport: HTMLElement) =>
					this.openFullscreen(fullscreenViewport),
				onFullscreenClose: () => this.closeFullscreen(),
			},
		});
		host.dataset.mermaidInteraction = "ready";
	}

	private activeSession() {
		return this.fullscreenSession ?? this.inlineSession;
	}

	private openFullscreen(viewport: HTMLElement) {
		this.closeFullscreen();
		this.fullscreenSession = new DiagramPanZoomSession(
			viewport,
			cloneSvgForFullscreen(this.currentSvg),
			true,
		);
	}

	private closeFullscreen() {
		this.fullscreenSession?.destroy();
		this.fullscreenSession = undefined;
	}

	replaceSvg(svg: SVGElement) {
		this.currentSvg = svg;
		this.inlineSession.replaceSvg(svg);
		if (this.fullscreenSession) {
			this.fullscreenSession.replaceSvg(cloneSvgForFullscreen(svg));
		}
	}

	refit() {
		this.inlineSession.refit();
		this.fullscreenSession?.refit();
	}

	reset() {
		this.activeSession().reset();
	}

	destroy() {
		this.closeFullscreen();
		this.inlineSession.destroy();
		void unmount(this.component);
		this.uiRoot.remove();
		delete this.host.dataset.mermaidInteraction;
	}
}

export function attachMermaidInteraction(
	host: HTMLElement,
	viewport: HTMLElement,
	svg: SVGElement,
): MermaidInteractionController {
	return new MermaidInteractionControllerImpl(host, viewport, svg);
}
