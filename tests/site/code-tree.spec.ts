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
		await page.waitForFunction(() => "codeBlockCollapser" in window);

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
});
