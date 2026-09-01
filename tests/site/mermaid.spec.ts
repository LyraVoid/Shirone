import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/markdown-extended/";
const DEMO_PATH = "/posts/markdown-mermaid/";

async function waitForViewer(page: import("@playwright/test").Page) {
	const diagram = page.locator(".markdown-mermaid").first();
	await expect(diagram).toHaveAttribute("data-mermaid-interaction", "ready", {
		timeout: 15_000,
	});
	return diagram;
}

test.describe("Mermaid diagrams", () => {
	test("preserves an SSR fallback and renders a themed SVG", async ({
		page,
		request,
	}) => {
		const response = await request.get(POST_PATH);
		expect(response.ok()).toBe(true);
		const html = await response.text();
		expect(html).toContain('data-mermaid-state="pending"');
		expect(html).toContain("Markdown rendering pipeline");

		await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
		const diagram = page.locator(".markdown-mermaid");
		await expect(diagram).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});
		await expect(diagram.locator("[data-mermaid-svg]")).toHaveCount(1);
		await expect(diagram.locator("svg title")).toHaveText(
			"Markdown rendering pipeline",
		);
		await expect(diagram.locator(".markdown-mermaid__fallback")).toBeHidden();
		expect(
			(await new AxeBuilder({ page }).include(".markdown-mermaid").analyze())
				.violations,
		).toEqual([]);

		const firstTheme = await diagram.getAttribute("data-mermaid-theme");
		await page.evaluate(() =>
			document.documentElement.classList.toggle("dark"),
		);
		await expect
			.poll(() => diagram.getAttribute("data-mermaid-theme"))
			.not.toBe(firstTheme);
		expect(
			(await new AxeBuilder({ page }).include(".markdown-mermaid").analyze())
				.violations,
		).toEqual([]);
	});

	test("stays within the article on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
		const diagram = page.locator(".markdown-mermaid");
		await expect(diagram).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});

		await expect(diagram).toHaveAttribute("data-mermaid-interaction", "ready");
		const toolbarRow = diagram.locator("[data-mermaid-toolbar]");
		const controlsButton = diagram.getByRole("button", {
			name: "Diagram controls",
		});
		const toolbarBounds = await toolbarRow.boundingBox();
		const controlsBounds = await controlsButton.boundingBox();
		if (!toolbarBounds || !controlsBounds) {
			throw new Error("Compact Mermaid controls are missing");
		}
		expect(toolbarBounds.height).toBeLessThanOrEqual(40);
		expect(controlsBounds.width).toBeLessThanOrEqual(40);
		expect(controlsBounds.height).toBeLessThanOrEqual(40);
		await expect(diagram.getByRole("button", { name: "Zoom in" })).toBeHidden();
		const bounds = await diagram.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const viewportElement = element.querySelector(
				".markdown-mermaid__viewport",
			);
			const svgElement = element.querySelector("[data-mermaid-svg]");
			if (!viewportElement || !svgElement) {
				throw new Error("Mermaid interaction elements are missing");
			}
			const viewport = viewportElement.getBoundingClientRect();
			const svg = svgElement.getBoundingClientRect();
			return {
				left: rect.left,
				right: rect.right,
				viewportWidth: innerWidth,
				fitted:
					svg.left >= viewport.left - 1 &&
					svg.right <= viewport.right + 1 &&
					svg.top >= viewport.top - 1 &&
					svg.bottom <= viewport.bottom + 1,
			};
		});
		expect(bounds.left).toBeGreaterThanOrEqual(0);
		expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth + 1);
		expect(bounds.fitted).toBe(true);
	});

	test("zooms, resets, and leaves ordinary wheel scrolling to the page", async ({
		page,
	}) => {
		await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
		const diagram = await waitForViewer(page);
		const viewport = diagram.locator(".markdown-mermaid__viewport");
		await expect(viewport).toHaveAttribute("data-mermaid-user-zoom", "1.0000");
		const controlsButton = diagram.getByRole("button", {
			name: "Diagram controls",
		});
		await expect(controlsButton).toBeVisible();
		await expect(diagram.getByRole("button", { name: "Zoom in" })).toBeHidden();
		await controlsButton.click();

		await diagram.getByRole("button", { name: "Zoom in" }).click();
		await expect
			.poll(() =>
				viewport
					.locator(".markdown-mermaid__transform")
					.evaluate((element) => getComputedStyle(element).transitionDuration),
			)
			.toBe("0.25s");
		await expect
			.poll(async () =>
				Number(await viewport.getAttribute("data-mermaid-user-zoom")),
			)
			.toBeGreaterThan(1);
		await page.waitForTimeout(260);

		const viewportBox = await viewport.boundingBox();
		if (!viewportBox) throw new Error("Mermaid viewport is missing");
		const svg = viewport.locator("svg");
		const beforePan = await svg.boundingBox();
		if (!beforePan) throw new Error("Mermaid SVG is missing");
		await page.mouse.move(
			viewportBox.x + viewportBox.width / 2,
			viewportBox.y + viewportBox.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			viewportBox.x + viewportBox.width / 2 - 80,
			viewportBox.y + viewportBox.height / 2,
			{ steps: 8 },
		);
		await page.mouse.up();
		await expect
			.poll(async () => (await svg.boundingBox())?.x ?? beforePan.x)
			.toBeLessThan(beforePan.x - 40);

		const beforeTouchPan = await svg.boundingBox();
		if (!beforeTouchPan) throw new Error("Mermaid SVG is missing");
		const touchStart = {
			x: viewportBox.x + viewportBox.width / 2,
			y: viewportBox.y + viewportBox.height / 2,
		};
		await viewport.dispatchEvent("pointerdown", {
			bubbles: true,
			buttons: 1,
			clientX: touchStart.x,
			clientY: touchStart.y,
			isPrimary: true,
			pointerId: 41,
			pointerType: "touch",
		});
		await page.evaluate(({ x, y }) => {
			document.dispatchEvent(
				new PointerEvent("pointermove", {
					bubbles: true,
					buttons: 1,
					clientX: x + 60,
					clientY: y + 30,
					isPrimary: true,
					pointerId: 41,
					pointerType: "touch",
				}),
			);
			document.dispatchEvent(
				new PointerEvent("pointerup", {
					bubbles: true,
					clientX: x + 60,
					clientY: y + 30,
					isPrimary: true,
					pointerId: 41,
					pointerType: "touch",
				}),
			);
		}, touchStart);
		await expect
			.poll(async () => (await svg.boundingBox())?.x ?? beforeTouchPan.x)
			.toBeGreaterThan(beforeTouchPan.x + 30);

		await diagram.getByRole("button", { name: "Reset view" }).click();
		await expect(viewport).toHaveAttribute("data-mermaid-user-zoom", "1.0000");

		await viewport.scrollIntoViewIfNeeded();
		const beforeScroll = await page.evaluate(() => scrollY);
		await viewport.hover();
		await page.mouse.wheel(0, -240);
		await expect
			.poll(() => page.evaluate(() => scrollY))
			.toBeLessThan(beforeScroll);
		await expect(viewport).toHaveAttribute("data-mermaid-user-zoom", "1.0000");

		await viewport.dispatchEvent("wheel", { ctrlKey: true, deltaY: -120 });
		await expect
			.poll(async () =>
				Number(await viewport.getAttribute("data-mermaid-user-zoom")),
			)
			.toBeGreaterThan(1);

		await page.mouse.click(8, 8);
		await expect(diagram.getByRole("button", { name: "Zoom in" })).toBeHidden();
	});

	test("keeps fullscreen modal state across theme renders and restores focus", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 640 });
		await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
		const diagram = await waitForViewer(page);
		await diagram.getByRole("button", { name: "Diagram controls" }).click();
		const openButton = diagram.getByRole("button", { name: "Open fullscreen" });
		await openButton.click();

		const dialog = page.getByRole("dialog", {
			name: /Fullscreen diagram:/,
		});
		await expect(dialog).toBeVisible();
		const fullscreenLayout = await dialog.evaluate((element) => {
			const content = element.querySelector<HTMLElement>(".m3-dialog__content");
			const title = element.querySelector<HTMLElement>(".m3-dialog__title");
			const toolbar = element.querySelector<HTMLElement>(
				".mermaid-viewer__fullscreen-toolbar .m3-toolbar",
			);
			const rect = element.getBoundingClientRect();
			const titleRect = title?.getBoundingClientRect();
			const toolbarRect = toolbar?.getBoundingClientRect();
			const dialogCenter = (rect.left + rect.right) / 2;
			const toolbarCenter = toolbarRect
				? (toolbarRect.left + toolbarRect.right) / 2
				: 0;
			return {
				clientHeight: element.clientHeight,
				scrollHeight: element.scrollHeight,
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				scrollLeft: element.scrollLeft,
				contentClientHeight: content?.clientHeight ?? 0,
				contentScrollHeight: content?.scrollHeight ?? 0,
				left: rect.left,
				right: rect.right,
				titleLeft: titleRect?.left ?? 0,
				toolbarCenterOffset: Math.abs(toolbarCenter - dialogCenter),
				viewportWidth: innerWidth,
			};
		});
		expect(fullscreenLayout.scrollHeight).toBeLessThanOrEqual(
			fullscreenLayout.clientHeight,
		);
		expect(fullscreenLayout.scrollWidth).toBeLessThanOrEqual(
			fullscreenLayout.clientWidth + 1,
		);
		expect(fullscreenLayout.scrollLeft).toBe(0);
		expect(fullscreenLayout.contentScrollHeight).toBeLessThanOrEqual(
			fullscreenLayout.contentClientHeight,
		);
		expect(fullscreenLayout.left).toBeGreaterThan(0);
		expect(fullscreenLayout.right).toBeLessThan(fullscreenLayout.viewportWidth);
		expect(fullscreenLayout.titleLeft).toBeGreaterThanOrEqual(
			fullscreenLayout.left,
		);
		expect(fullscreenLayout.toolbarCenterOffset).toBeLessThanOrEqual(2);
		await expect(
			dialog.locator("[data-mermaid-fullscreen-viewport] svg"),
		).toHaveCount(1);
		const fullscreenViewport = dialog.locator(
			"[data-mermaid-fullscreen-viewport]",
		);
		const fullscreenSvg = fullscreenViewport.locator("svg");
		await expect(fullscreenViewport).toHaveAttribute(
			"data-mermaid-pannable",
			"true",
		);
		const viewportBox = await fullscreenViewport.boundingBox();
		const beforePan = await fullscreenSvg.boundingBox();
		if (!viewportBox || !beforePan) {
			throw new Error("Fullscreen Mermaid interaction elements are missing");
		}
		await page.mouse.move(
			viewportBox.x + viewportBox.width / 2,
			viewportBox.y + viewportBox.height / 2,
		);
		await page.mouse.down();
		await page.mouse.move(
			viewportBox.x + viewportBox.width / 2 + 80,
			viewportBox.y + viewportBox.height / 2 + 40,
			{ steps: 8 },
		);
		await page.mouse.up();
		await expect
			.poll(async () => (await fullscreenSvg.boundingBox())?.x ?? beforePan.x)
			.toBeGreaterThan(beforePan.x + 40);
		const firstTheme = await diagram.getAttribute("data-mermaid-theme");
		await page.evaluate(() =>
			document.documentElement.classList.toggle("dark"),
		);
		await expect
			.poll(() => diagram.getAttribute("data-mermaid-theme"))
			.not.toBe(firstTheme);
		await expect(dialog).toBeVisible();
		await expect(
			dialog.locator("[data-mermaid-fullscreen-viewport] svg"),
		).toHaveCount(1);

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
		await expect(openButton).toBeFocused();
	});

	test("renders after Swup replaces the article content", async ({ page }) => {
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await page.evaluate((path) => window.swup?.navigate(path), POST_PATH);
		await page.waitForURL(`**${POST_PATH}`);

		const diagram = page.locator(".markdown-mermaid");
		await expect(diagram).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});
		await expect(diagram.locator("[data-mermaid-svg]")).toHaveCount(1);
	});

	test("renders every diagram in the dedicated demo article", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const diagrams = page.locator(".markdown-mermaid");
		await expect(diagrams).toHaveCount(14);
		await expect
			.poll(
				() =>
					diagrams.evaluateAll(
						(elements) =>
							elements.filter(
								(element) => element.dataset.mermaidState === "ready",
							).length,
					),
				{ timeout: 30_000 },
			)
			.toBe(14);
		await expect(diagrams.locator("[data-mermaid-svg]")).toHaveCount(14);
		await expect(diagrams.locator("[data-mermaid-toolbar]")).toHaveCount(14);
		const regions = diagrams.locator(
			'.markdown-mermaid__diagram[role="region"]',
		);
		await expect(regions).toHaveCount(14);
		expect(
			await regions.evaluateAll((elements) =>
				elements.every(
					(element) =>
						Boolean(element.getAttribute("aria-label")) ||
						Boolean(element.getAttribute("aria-labelledby")),
				),
			),
		).toBe(true);
		expect(
			(await new AxeBuilder({ page }).include(".markdown-mermaid").analyze())
				.violations,
		).toEqual([]);
	});

	test("keeps fullscreen modal and controls centered on compact mobile screens with long diagram titles", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 360, height: 640 });
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const diagram = await waitForViewer(page);
		await diagram.getByRole("button", { name: "Diagram controls" }).click();
		await diagram.getByRole("button", { name: "Open fullscreen" }).click();

		const dialog = page.getByRole("dialog", {
			name: /Fullscreen diagram:/,
		});
		await expect(dialog).toBeVisible();
		const layout = await dialog.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const title = element.querySelector<HTMLElement>(".m3-dialog__title");
			const closeBtn = element.querySelector<HTMLElement>(
				".m3-dialog__close-btn",
			);
			const toolbar = element.querySelector<HTMLElement>(
				".mermaid-viewer__fullscreen-toolbar .m3-toolbar",
			);
			const titleRect = title?.getBoundingClientRect();
			const closeRect = closeBtn?.getBoundingClientRect();
			const toolbarRect = toolbar?.getBoundingClientRect();
			const dialogCenter = (rect.left + rect.right) / 2;
			const toolbarCenter = toolbarRect
				? (toolbarRect.left + toolbarRect.right) / 2
				: 0;
			return {
				clientWidth: element.clientWidth,
				scrollWidth: element.scrollWidth,
				scrollLeft: element.scrollLeft,
				dialogLeft: rect.left,
				dialogRight: rect.right,
				titleLeft: titleRect?.left ?? 0,
				titleRight: titleRect?.right ?? 0,
				closeLeft: closeRect?.left ?? 0,
				closeRight: closeRect?.right ?? 0,
				toolbarCenterOffset: Math.abs(toolbarCenter - dialogCenter),
				viewportWidth: innerWidth,
			};
		});

		expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
		expect(layout.scrollLeft).toBe(0);
		expect(layout.dialogLeft).toBeGreaterThan(0);
		expect(layout.dialogRight).toBeLessThan(layout.viewportWidth);
		expect(layout.titleLeft).toBeGreaterThanOrEqual(layout.dialogLeft);
		expect(layout.titleRight).toBeLessThanOrEqual(layout.closeLeft);
		expect(layout.closeRight).toBeLessThanOrEqual(layout.dialogRight);
		expect(layout.toolbarCenterOffset).toBeLessThanOrEqual(2);

		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();
	});

	test("maintains readable contrast for edge labels and nodes in dark mode", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const diagrams = page.locator(".markdown-mermaid");
		await expect
			.poll(
				() =>
					diagrams.evaluateAll(
						(elements) =>
							elements.filter(
								(element) => element.dataset.mermaidState === "ready",
							).length,
					),
				{ timeout: 30_000 },
			)
			.toBe(14);

		await page.evaluate(() => {
			document.documentElement.classList.add("dark");
		});
		await expect
			.poll(
				() =>
					diagrams.evaluateAll(
						(elements) =>
							elements.filter(
								(element) =>
									element.dataset.mermaidState === "ready" &&
									element.dataset.mermaidTheme?.startsWith("dark|"),
							).length,
					),
				{ timeout: 30_000 },
			)
			.toBe(14);

		const flowchart = diagrams.first();
		const edgeLabelInfo = await flowchart.evaluate((element) => {
			const edgeLabels = Array.from(
				element.querySelectorAll<HTMLElement>(".edgeLabel"),
			);
			return edgeLabels.map((el) => {
				const style = getComputedStyle(el);
				return {
					color: style.color,
					visibility: style.visibility,
					display: style.display,
				};
			});
		});
		expect(edgeLabelInfo.length).toBeGreaterThan(0);
		for (const label of edgeLabelInfo) {
			expect(label.visibility).not.toBe("hidden");
			expect(label.display).not.toBe("none");
		}

		expect(
			(await new AxeBuilder({ page }).include(".markdown-mermaid").analyze())
				.violations,
		).toEqual([]);
	});

	test("keeps Mind Map branches and nodes readable", async ({ page }) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const mindMap = page.locator("svg.mindmapDiagram");
		await expect(mindMap).toHaveCount(1);
		const labels = mindMap.locator(".mindmap-node .nodeLabel");
		const labelCount = await labels.count();
		expect(labelCount).toBeGreaterThan(0);
		await expect(labels.first()).toBeVisible();

		const colors = await mindMap.evaluate((svg) => {
			const node = svg.querySelector<SVGElement>(
				".mindmap-node .node-bkg, .mindmap-node circle",
			);
			const edge = svg.querySelector<SVGElement>(".edgePaths path");
			const label = svg.querySelector<HTMLElement>(".mindmap-node .nodeLabel");
			if (!node || !edge || !label) {
				throw new Error("Mind Map SVG elements are missing");
			}
			return {
				nodeFill: getComputedStyle(node).fill,
				nodeStroke: getComputedStyle(node).stroke,
				edgeStroke: getComputedStyle(edge).stroke,
				labelColor: getComputedStyle(label).color,
			};
		});

		expect(colors.nodeFill).not.toBe("rgb(0, 0, 0)");
		expect(colors.nodeStroke).not.toBe("rgb(0, 0, 0)");
		expect(colors.edgeStroke).not.toBe("rgb(0, 0, 0)");
		expect(colors.labelColor).not.toBe("rgb(0, 0, 0)");
	});

	test("keeps Journey task labels readable on their fills", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const journey = page.locator('svg[aria-roledescription="journey"]');
		await expect(journey).toHaveCount(1);

		const contrastRatios = await journey.evaluate((svg) => {
			const toRgb = (value: string): [number, number, number] | null => {
				const channels = value
					.match(/[\d.]+/g)
					?.slice(0, 3)
					.map(Number);
				return channels?.length === 3
					? [channels[0], channels[1], channels[2]]
					: null;
			};
			const luminance = (value: string): number | null => {
				const channels = toRgb(value);
				if (!channels) return null;
				const linear = channels.map((channel) => {
					const normalized = channel / 255;
					return normalized <= 0.03928
						? normalized / 12.92
						: ((normalized + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			return [
				...svg.querySelectorAll<HTMLElement>("div.journey-section, div.task"),
			].map((label) => {
				const fill = label
					.closest("g")
					?.querySelector<SVGElement>("rect.journey-section, rect.task");
				const foreground = luminance(getComputedStyle(label).color);
				const background = fill && luminance(getComputedStyle(fill).fill);
				if (foreground === null || background === null) return 0;
				const lighter = Math.max(foreground, background);
				const darker = Math.min(foreground, background);
				return (lighter + 0.05) / (darker + 0.05);
			});
		});

		expect(contrastRatios.length).toBeGreaterThan(0);
		for (const ratio of contrastRatios) {
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("keeps Timeline labels readable on generated section fills", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const timeline = page.locator('svg[aria-roledescription="timeline"]');
		await expect(timeline).toHaveCount(1);

		const contrastRatios = await timeline.evaluate((svg) => {
			const toRgb = (value: string): [number, number, number] | null => {
				const channels = value
					.match(/[\d.]+/g)
					?.slice(0, 3)
					.map(Number);
				return channels?.length === 3
					? [channels[0], channels[1], channels[2]]
					: null;
			};
			const luminance = (value: string): number | null => {
				const channels = toRgb(value);
				if (!channels) return null;
				const linear = channels.map((channel) => {
					const normalized = channel / 255;
					return normalized <= 0.03928
						? normalized / 12.92
						: ((normalized + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			return [...svg.querySelectorAll<SVGGElement>(".timeline-node")].map(
				(node) => {
					const fill = node.querySelector<SVGElement>(".node-bkg");
					const label = node.querySelector<SVGTextElement>("text");
					const foreground = label && luminance(getComputedStyle(label).fill);
					const background = fill && luminance(getComputedStyle(fill).fill);
					if (foreground === null || background === null) {
						return 0;
					}
					const lighter = Math.max(foreground, background);
					const darker = Math.min(foreground, background);
					return (lighter + 0.05) / (darker + 0.05);
				},
			);
		});

		expect(contrastRatios.length).toBeGreaterThan(0);
		for (const ratio of contrastRatios) {
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("keeps Git Graph and Kanban labels readable in dark palettes", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const gitGraph = page.locator('svg[aria-roledescription="gitGraph"]');
		const kanban = page.locator('svg[aria-roledescription="kanban"]');
		const gitHost = page
			.locator(".markdown-mermaid")
			.filter({ has: gitGraph })
			.first();
		await expect(gitGraph).toHaveCount(1);
		await expect(kanban).toHaveCount(1);
		await expect(gitHost).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});

		await page.evaluate(() => {
			const root = document.documentElement;
			root.classList.add("dark");
			root.style.setProperty("--mc-surface-container-lowest", "#101010");
			root.style.setProperty("--mc-surface-container-low", "#1c1c1c");
			root.style.setProperty("--mc-surface-container", "#262626");
			root.style.setProperty("--mc-surface-container-high", "#303030");
			root.style.setProperty("--mc-on-surface", "#f5f5f5");
			root.style.setProperty("--mc-on-surface-variant", "#d0d0d0");
			root.style.setProperty("--mc-inverse-on-surface", "#101010");
		});
		await expect
			.poll(() => gitHost.getAttribute("data-mermaid-theme"), {
				timeout: 15_000,
			})
			.toContain("|#101010|");

		const ratios = await page.evaluate(() => {
			const luminance = (value: string): number | null => {
				const channels = value
					.match(/[\d.]+/g)
					?.slice(0, 3)
					.map(Number);
				if (channels?.length !== 3) return null;
				const linear = channels.map((channel) => {
					const normalized = channel / 255;
					return normalized <= 0.03928
						? normalized / 12.92
						: ((normalized + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			const ratio = (foreground: Element, background: Element): number => {
				const foregroundLuminance = luminance(
					getComputedStyle(foreground).fill,
				);
				const backgroundLuminance = luminance(
					getComputedStyle(background).fill,
				);
				if (foregroundLuminance === null || backgroundLuminance === null)
					return 0;
				const lighter = Math.max(foregroundLuminance, backgroundLuminance);
				const darker = Math.min(foregroundLuminance, backgroundLuminance);
				return (lighter + 0.05) / (darker + 0.05);
			};
			const pair = (
				root: ParentNode,
				foregroundSelector: string,
				backgroundSelector: string,
			): number[] => {
				const foregrounds = [...root.querySelectorAll(foregroundSelector)];
				const backgrounds = [...root.querySelectorAll(backgroundSelector)];
				return foregrounds.map((foreground, index) => {
					const background = backgrounds[index];
					return background ? ratio(foreground, background) : 0;
				});
			};
			const git = document.querySelector(
				'svg[aria-roledescription="gitGraph"]',
			);
			const board = document.querySelector(
				'svg[aria-roledescription="kanban"]',
			);
			if (!git || !board) return null;
			return {
				gitBranches: pair(git, ".branchLabel text", ".branchLabelBkg"),
				gitCommits: pair(git, ".commit-label", ".commit-label-bkg"),
				kanbanColumns: pair(
					board,
					".cluster-label .nodeLabel",
					".cluster > rect",
				),
				kanbanCards: pair(
					board,
					".node .markdown-node-label",
					".node .label-container",
				),
			};
		});

		expect(ratios).not.toBeNull();
		for (const group of Object.values(ratios ?? {})) {
			expect(group.length).toBeGreaterThan(0);
			for (const ratio of group) expect(ratio).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("keeps Class Diagram relation labels readable", async ({ page }) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const classDiagram = page.locator(
			'svg[aria-roledescription="classDiagram"]',
		);
		const classHost = page.locator(".markdown-mermaid").filter({
			has: classDiagram,
		});
		await expect(classDiagram).toHaveCount(1);
		await expect(classHost).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});
		await page.evaluate(() => {
			const root = document.documentElement;
			root.classList.add("dark");
			root.style.setProperty("--mc-surface-container-lowest", "#101010");
			root.style.setProperty("--mc-on-surface", "#f5f5f5");
			root.style.setProperty("--mc-on-surface-variant", "#d0d0d0");
			root.style.setProperty("--mc-inverse-on-surface", "#101010");
			root.style.setProperty("--mc-primary-container", "#3f3f3f");
			root.style.setProperty("--mc-on-primary-container", "#202020");
		});
		await expect
			.poll(() => classHost.getAttribute("data-mermaid-theme"), {
				timeout: 15_000,
			})
			.toContain("|#3f3f3f|");

		const ratios = await classDiagram.evaluate((svg) => {
			const luminance = (value: string): number | null => {
				const channels = value
					.match(/[\d.]+/g)
					?.slice(0, 3)
					.map(Number);
				if (channels?.length !== 3) return null;
				const linear = channels.map((channel) => {
					const normalized = channel / 255;
					return normalized <= 0.03928
						? normalized / 12.92
						: ((normalized + 0.055) / 1.055) ** 2.4;
				});
				return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
			};
			const edgeRatios = [
				...svg.querySelectorAll<HTMLElement>(".edgeLabel .labelBkg"),
			].map((label) => {
				const foreground = luminance(
					getComputedStyle(label.querySelector(".edgeLabel") ?? label).color,
				);
				const background = luminance(getComputedStyle(label).backgroundColor);
				if (foreground === null || background === null) return 0;
				const lighter = Math.max(foreground, background);
				const darker = Math.min(foreground, background);
				return (lighter + 0.05) / (darker + 0.05);
			});
			const nodeRatios = [
				...svg.querySelectorAll<HTMLElement>(".node"),
			].flatMap((node) => {
				const shape = node.querySelector<SVGElement>(
					".label-container path, .label-container rect",
				);
				const labels = [...node.querySelectorAll<HTMLElement>(".nodeLabel")];
				if (!shape) return [];
				return labels.map((label) => {
					const foreground = luminance(getComputedStyle(label).color);
					const background = luminance(getComputedStyle(shape).fill);
					if (foreground === null || background === null) return 0;
					const lighter = Math.max(foreground, background);
					const darker = Math.min(foreground, background);
					return (lighter + 0.05) / (darker + 0.05);
				});
			});
			return [...edgeRatios, ...nodeRatios];
		});

		expect(ratios.length).toBeGreaterThan(0);
		for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
	});

	test("recovers contrast when a palette makes surface text too dark", async ({
		page,
	}) => {
		await page.goto(DEMO_PATH, { waitUntil: "domcontentloaded" });
		const diagram = page.locator(".markdown-mermaid").first();
		await expect(diagram).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 15_000,
		});

		await page.evaluate(() => {
			const root = document.documentElement;
			root.classList.remove("dark");
			root.style.setProperty("--mc-surface-container-lowest", "#000000");
			root.style.setProperty("--mc-on-surface", "#202000");
			root.style.setProperty("--mc-on-surface-variant", "#303000");
			root.style.setProperty("--mc-inverse-on-surface", "#ffffff");
			root.style.setProperty("--mc-primary-container", "#050500");
			root.style.setProperty("--mc-on-primary-container", "#303000");
		});

		await expect
			.poll(() => diagram.getAttribute("data-mermaid-theme"), {
				timeout: 15_000,
			})
			.toContain("|#000000|");
		const edgeLabel = diagram.locator(".edgeLabel span");
		const edgeLabelCount = await edgeLabel.count();
		expect(edgeLabelCount).toBeGreaterThan(0);
		const firstEdgeLabel = edgeLabel.first();
		await expect
			.poll(() =>
				firstEdgeLabel.evaluate((element) => {
					const channels = getComputedStyle(element)
						.color.match(/[\d.]+/g)
						?.slice(0, 3)
						.map(Number);
					if (channels?.length !== 3) return 0;
					const luminance = channels
						.map((channel) => {
							const normalized = channel / 255;
							return normalized <= 0.03928
								? normalized / 12.92
								: ((normalized + 0.055) / 1.055) ** 2.4;
						})
						.reduce(
							(sum, channel, index) =>
								sum + channel * [0.2126, 0.7152, 0.0722][index],
							0,
						);
					return (luminance + 0.05) / 0.05;
				}),
			)
			.toBeGreaterThanOrEqual(4.5);

		const nodeContrast = await diagram
			.locator(".node")
			.first()
			.evaluate((node) => {
				const luminance = (value: string): number | null => {
					const channels = value
						.match(/[\d.]+/g)
						?.slice(0, 3)
						.map(Number);
					if (channels?.length !== 3) return null;
					return channels
						.map((channel) => {
							const normalized = channel / 255;
							return normalized <= 0.03928
								? normalized / 12.92
								: ((normalized + 0.055) / 1.055) ** 2.4;
						})
						.reduce(
							(sum, channel, index) =>
								sum + channel * [0.2126, 0.7152, 0.0722][index],
							0,
						);
				};
				const label = node.querySelector(".nodeLabel");
				const shape = node.querySelector(".label-container");
				if (!label || !shape) return 0;
				const foreground = luminance(getComputedStyle(label).color);
				const background = luminance(getComputedStyle(shape).fill);
				if (foreground === null || background === null) return 0;
				const lighter = Math.max(foreground, background);
				const darker = Math.min(foreground, background);
				return (lighter + 0.05) / (darker + 0.05);
			});
		expect(nodeContrast).toBeGreaterThanOrEqual(4.5);
	});
});
