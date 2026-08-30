import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/markdown-enhancements/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md .m3-code-tree");
}

test.describe("Markdown interactive code trees", () => {
	test.beforeEach(() => {
		test.setTimeout(60_000);
	});

	test("renders accessible, token-driven SSR code tree with foldable directories and panel switching", async ({
		page,
	}) => {
		const codeTrees = await openPost(page);
		await expect(codeTrees.first()).toBeVisible();
		const articleText = await page.locator(".custom-md").innerText();
		expect(articleText).toContain("├──");
		expect(articleText).not.toMatch(/\?{3,}/);

		const firstTree = codeTrees.first();
		await expect(firstTree).toHaveClass(/\bnot-prose\b/);
		await expect(firstTree).toHaveAttribute(
			"aria-label",
			"Shirone Component Demo",
		);

		const treeRoot = firstTree.locator(".m3-code-tree__tree-root");
		await expect(treeRoot).toHaveAttribute("role", "tree");

		// Foldable directory disclosures
		const dirDisclosures = firstTree.locator(
			"details.m3-code-tree__disclosure",
		);
		await expect(dirDisclosures.first()).toBeVisible();
		await expect(dirDisclosures.first()).toHaveAttribute("open", "");

		const dirSummary = dirDisclosures
			.first()
			.locator("> summary.m3-code-tree__dir-label");
		await expect(dirSummary).toBeVisible();

		const fileItems = firstTree.locator(".m3-code-tree__tree-node--file");
		const fileButtons = firstTree.locator(".m3-code-tree__file-btn");
		await expect(fileButtons).toHaveCount(3);
		await expect(fileItems).toHaveCount(3);

		// Button 0 (src/Button.svelte) is active by default because of entry="src/Button.svelte"
		await expect(fileButtons.nth(0)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(0)).toHaveAttribute("aria-selected", "true");
		await expect(fileButtons.nth(1)).not.toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(1)).toHaveAttribute("aria-selected", "false");

		// Panels
		const panels = firstTree.locator(".m3-code-tree__panel");
		await expect(panels).toHaveCount(3);
		await expect(panels.nth(0)).toBeVisible();
		await expect(panels.nth(1)).toBeHidden();
		await expect(panels.nth(2)).toBeHidden();

		// Hover and re-touch/re-click active button: verify highlight persists
		await fileButtons.nth(0).hover();
		await expect(fileButtons.nth(0)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(0)).toHaveAttribute("aria-selected", "true");

		const activeHoverBg = await fileButtons.nth(0).evaluate((btn) => {
			return getComputedStyle(btn).backgroundColor;
		});
		expect(activeHoverBg).not.toBe("rgba(0, 0, 0, 0)");
		expect(activeHoverBg).not.toBe("transparent");

		await fileButtons.nth(0).click();
		await expect(fileButtons.nth(0)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(0)).toHaveAttribute("aria-selected", "true");
		await expect(panels.nth(0)).toBeVisible();

		// Click Button 1 (src/styles/button.styl)
		await fileButtons.nth(1).click();
		await expect(fileButtons.nth(1)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(1)).toHaveAttribute("aria-selected", "true");
		await expect(fileButtons.nth(0)).not.toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(0)).toHaveAttribute("aria-selected", "false");

		await expect(panels.nth(0)).toBeHidden();
		await expect(panels.nth(1)).toBeVisible();
		await expect(panels.nth(2)).toBeHidden();

		// Keyboard navigation: ArrowDown from Button 1 to Button 2
		await fileButtons.nth(1).focus();
		await page.keyboard.press("ArrowDown");
		await expect(fileButtons.nth(2)).toBeFocused();
		await expect(fileButtons.nth(2)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(2)).toHaveAttribute("aria-selected", "true");
		await expect(panels.nth(2)).toBeVisible();
		await expect(panels.nth(1)).toBeHidden();

		// Keyboard navigation: Home key moves to first button
		await page.keyboard.press("Home");
		await expect(fileButtons.nth(0)).toBeFocused();
		await expect(fileButtons.nth(0)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect(fileItems.nth(0)).toHaveAttribute("aria-selected", "true");
		await expect(panels.nth(0)).toBeVisible();

		// Test folding: clicking the styles directory summary collapses it
		const stylesDirDisclosure = firstTree
			.locator("details.m3-code-tree__disclosure")
			.nth(1);
		const stylesSummary = stylesDirDisclosure.locator(
			"> summary.m3-code-tree__dir-label",
		);
		await stylesSummary.click();
		await expect(stylesDirDisclosure).not.toHaveAttribute("open", "");
		await expect(fileButtons.nth(1)).toBeHidden();

		// Expanding directory back open
		await stylesSummary.click();
		await expect(stylesDirDisclosure).toHaveAttribute("open", "");
		await expect(fileButtons.nth(1)).toBeVisible();

		// Check computed styles and tokens
		const styles = await firstTree.evaluate((element) => {
			const tree = getComputedStyle(element);
			const header = element.querySelector<HTMLElement>(
				".m3-code-tree__header",
			);
			const nav = element.querySelector<HTMLElement>(".m3-code-tree__nav");
			const activeBtn = element.querySelector<HTMLElement>(
				".m3-code-tree__file-btn--active",
			);
			return {
				borderRadius: tree.borderRadius,
				headerBackground: header
					? getComputedStyle(header).backgroundColor
					: "",
				navBackground: nav ? getComputedStyle(nav).backgroundColor : "",
				activeBtnRadius: activeBtn
					? getComputedStyle(activeBtn).borderRadius
					: "",
			};
		});

		expect(styles.borderRadius).toBe("16px");
		expect(styles.activeBtnRadius).toBe("8px");

		// Run accessibility check
		const results = await new AxeBuilder({ page })
			.include(".custom-md .m3-code-tree")
			.disableRules(["color-contrast"])
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("supports narrow mobile viewport layout without horizontal page overflow", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });

		const codeTrees = await openPost(page);
		const firstTree = codeTrees.first();
		await expect(firstTree).toBeVisible();

		const layout = await firstTree.evaluate((element) => {
			const body = element.querySelector<HTMLElement>(".m3-code-tree__body");
			const nav = element.querySelector<HTMLElement>(".m3-code-tree__nav");
			return {
				flexDirection: body ? getComputedStyle(body).flexDirection : "",
				navWidth: nav ? getComputedStyle(nav).width : "",
				hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
			};
		});

		expect(layout.flexDirection).toBe("column");
		expect(layout.hasHorizontalOverflow).toBe(false);
	});

	test("uses one contained scrollbar and lets code controls scroll with content", async ({
		page,
	}) => {
		await openPost(page);

		const codeTree = page.locator(
			'.custom-md .m3-code-tree[aria-label="Site Configuration"]',
		);
		await expect(codeTree).toBeVisible();

		const nav = codeTree.locator(".m3-code-tree__nav");
		const content = codeTree.locator(".m3-code-tree__content");
		const activePanel = codeTree.locator(".m3-code-tree__panel:not([hidden])");
		const codeHeader = activePanel.locator("figcaption.header");
		const copyButton = activePanel.locator(".frame > .copy-btn");

		await expect(activePanel.locator(".collapse-toggle-btn")).toHaveCount(0);
		await expect(copyButton).toHaveCount(1);

		const scrollStyles = await codeTree.evaluate((element) => {
			const navElement =
				element.querySelector<HTMLElement>(".m3-code-tree__nav");
			const contentElement = element.querySelector<HTMLElement>(
				".m3-code-tree__content",
			);
			const headerElement = element.querySelector<HTMLElement>(
				".m3-code-tree__panel:not([hidden]) figcaption.header",
			);
			const copyElement = element.querySelector<HTMLElement>(
				".m3-code-tree__panel:not([hidden]) .frame > .copy-btn",
			);
			const pre = element.querySelector<HTMLElement>(
				".m3-code-tree__panel:not([hidden]) pre",
			);
			return {
				navScrollbar: navElement
					? getComputedStyle(navElement).scrollbarWidth
					: "",
				navOverscroll: navElement
					? getComputedStyle(navElement).overscrollBehavior
					: "",
				contentScrollbar: contentElement
					? getComputedStyle(contentElement).scrollbarWidth
					: "",
				contentOverscroll: contentElement
					? getComputedStyle(contentElement).overscrollBehavior
					: "",
				headerPosition: headerElement
					? getComputedStyle(headerElement).position
					: "",
				copyParentIsFrame:
					copyElement?.parentElement?.classList.contains("frame"),
				preOverflow: pre ? getComputedStyle(pre).overflow : "",
				contentScrollable: contentElement
					? contentElement.scrollHeight > contentElement.clientHeight
					: false,
			};
		});

		expect(scrollStyles.navScrollbar).toBe("none");
		expect(scrollStyles.navOverscroll).toBe("contain");
		expect(scrollStyles.contentScrollbar).toBe("none");
		expect(scrollStyles.contentOverscroll).toBe("contain");
		expect(scrollStyles.headerPosition).not.toBe("sticky");
		expect(scrollStyles.copyParentIsFrame).toBe(true);
		expect(scrollStyles.preOverflow).toBe("visible");
		expect(scrollStyles.contentScrollable).toBe(true);

		const headerTopBefore = (await codeHeader.boundingBox())?.y;
		const copyTopBefore = (await copyButton.boundingBox())?.y;
		expect(headerTopBefore).toBeDefined();
		expect(copyTopBefore).toBeDefined();

		await content.evaluate((element) => {
			element.scrollTop = 120;
		});

		const headerTopAfter = (await codeHeader.boundingBox())?.y;
		const copyTopAfter = (await copyButton.boundingBox())?.y;
		expect(headerTopAfter).toBeLessThan((headerTopBefore ?? 0) - 100);
		expect(copyTopAfter).toBeLessThan((copyTopBefore ?? 0) - 100);

		await content.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		await content.hover();
		const pageScrollBefore = await page.evaluate(() => window.scrollY);
		await page.mouse.wheel(0, 800);
		const pageScrollAfter = await page.evaluate(() => window.scrollY);
		expect(pageScrollAfter).toBe(pageScrollBefore);

		await expect(nav).toBeVisible();
	});

	test("supports modal fullscreen expand, keyboard escape and focus restore", async ({
		page,
	}) => {
		const codeTrees = await openPost(page);
		const firstTree = codeTrees.first();
		const expandBtn = firstTree.locator(".m3-code-tree__expand-btn");
		await expect(expandBtn).toBeVisible();
		const layoutBefore = await page.evaluate(() => {
			const container = document.querySelector<HTMLElement>("#swup-container");
			const codeTree = document.querySelector<HTMLElement>(".m3-code-tree");
			return {
				containerLeft: container?.getBoundingClientRect().left ?? 0,
				documentHeight: document.documentElement.scrollHeight,
				codeTreeHeight: codeTree?.getBoundingClientRect().height ?? 0,
			};
		});

		// Click expand button to open dialog
		await expandBtn.click();

		const dialog = page.locator("dialog.m3-code-tree-dialog");
		await expect(dialog).toBeVisible();
		await expect(dialog).toHaveAttribute("open", "");
		const layoutWhileOpen = await page.evaluate(() => {
			const container = document.querySelector<HTMLElement>("#swup-container");
			const placeholder = document.querySelector<HTMLElement>(
				".m3-code-tree-placeholder",
			);
			return {
				containerLeft: container?.getBoundingClientRect().left ?? 0,
				documentHeight: document.documentElement.scrollHeight,
				placeholderHeight: placeholder?.getBoundingClientRect().height ?? 0,
			};
		});
		expect(layoutWhileOpen.containerLeft).toBeCloseTo(
			layoutBefore.containerLeft,
			1,
		);
		expect(layoutWhileOpen.documentHeight).toBeGreaterThanOrEqual(
			layoutBefore.documentHeight,
		);
		expect(layoutWhileOpen.placeholderHeight).toBeCloseTo(
			layoutBefore.codeTreeHeight,
			1,
		);

		// Verify dialog contents and file switching inside dialog
		const dialogTree = dialog.locator(".m3-code-tree");
		await expect(dialogTree).toBeVisible();

		const fileButtons = dialog.locator(".m3-code-tree__file-btn");
		await fileButtons.nth(1).click();
		const panels = dialog.locator(".m3-code-tree__panel");
		await expect(panels.nth(1)).toBeVisible();
		await expect(panels.nth(0)).toBeHidden();

		// Press Escape to close modal
		await page.keyboard.press("Escape");
		await expect(dialog).toBeHidden();

		// Verify focus restored to expand button
		await expect(expandBtn).toBeFocused();
		await expect(expandBtn).toHaveAttribute(
			"aria-label",
			await expandBtn.getAttribute("data-expand-label"),
		);
		await expect(expandBtn).toHaveAttribute(
			"title",
			await expandBtn.getAttribute("data-expand-label"),
		);
		await expect(
			expandBtn.locator(".m3-code-tree__icon-expand"),
		).not.toHaveClass(/hidden/);
		await expect(expandBtn.locator(".m3-code-tree__icon-collapse")).toHaveClass(
			/hidden/,
		);

		// Verify tree restored into main document flow
		await expect(firstTree).toBeVisible();
		await expect(
			firstTree.locator(".m3-code-tree__panel").nth(1),
		).toBeVisible();
		const layoutAfter = await page.evaluate(() => {
			const container = document.querySelector<HTMLElement>("#swup-container");
			return {
				containerLeft: container?.getBoundingClientRect().left ?? 0,
				documentHeight: document.documentElement.scrollHeight,
			};
		});
		expect(layoutAfter.containerLeft).toBeCloseTo(
			layoutBefore.containerLeft,
			1,
		);
		expect(layoutAfter.documentHeight).toBe(layoutBefore.documentHeight);
	});

	test("uses the full mobile viewport without empty modal columns or rows", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const codeTrees = await openPost(page);
		await codeTrees.first().locator(".m3-code-tree__expand-btn").click();

		const dialog = page.locator("dialog.m3-code-tree-dialog");
		await expect(dialog).toBeVisible();
		const layout = await dialog.evaluate((element) => {
			const body = element.querySelector<HTMLElement>(".m3-code-tree__body");
			const nav = element.querySelector<HTMLElement>(".m3-code-tree__nav");
			const content = element.querySelector<HTMLElement>(
				".m3-code-tree__content",
			);
			const dialogRect = element.getBoundingClientRect();
			const bodyRect = body?.getBoundingClientRect();
			const navRect = nav?.getBoundingClientRect();
			const contentRect = content?.getBoundingClientRect();
			return {
				dialogRect,
				dialogRight: dialogRect.right,
				viewportWidth: window.innerWidth,
				pageHasHorizontalOverflow:
					document.documentElement.scrollWidth > window.innerWidth + 1,
				bodyFlexDirection: body ? getComputedStyle(body).flexDirection : "",
				navRect,
				contentRect,
				contentMaxHeight: content ? getComputedStyle(content).maxHeight : "",
				bodyBottom: bodyRect?.bottom ?? 0,
			};
		});

		expect(layout.dialogRect.x).toBeCloseTo(0, 1);
		expect(layout.dialogRect.y).toBeCloseTo(0, 1);
		expect(layout.dialogRect.width).toBeCloseTo(390, 1);
		expect(layout.dialogRect.height).toBeCloseTo(844, 1);
		expect(layout.dialogRight).toBeCloseTo(layout.viewportWidth, 1);
		expect(layout.pageHasHorizontalOverflow).toBe(false);
		expect(layout.bodyFlexDirection).toBe("column");
		expect(layout.navRect?.width).toBeCloseTo(layout.dialogRect.width, 1);
		expect(layout.navRect?.height).toBeLessThan(layout.dialogRect.height * 0.4);
		expect(layout.contentRect?.width).toBeCloseTo(layout.dialogRect.width, 1);
		expect(layout.contentRect?.bottom).toBeCloseTo(layout.bodyBottom, 1);
		expect(layout.contentMaxHeight).toBe("none");
	});
});
