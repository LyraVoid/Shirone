import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/markdown-enhancements/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md .m3-file-tree");
}

test.describe("Markdown file trees", () => {
	test("renders both syntaxes as accessible, token-driven SSR trees", async ({
		page,
	}) => {
		// 文档有 ~25k 节点，前置断言跑完后 axe 扫描需要超过默认的 30s 预算。
		test.slow();
		const trees = await openPost(page);
		await expect(trees).toHaveCount(2);
		await expect(trees.nth(0)).toHaveClass(/\bnot-prose\b/);
		await expect(trees.nth(0)).toHaveAttribute(
			"aria-label",
			"Shirone source tree",
		);
		await expect(trees.nth(1)).toHaveAttribute("data-icon-mode", "simple");
		await expect(trees.nth(0).locator('[role="treeitem"]')).toHaveCount(19);
		await expect(trees.nth(1).locator('[role="treeitem"]')).toHaveCount(5);
		await expect(trees.nth(0).locator("svg").first()).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		await expect(trees.locator("script, iframe")).toHaveCount(0);

		const disclosures = trees.nth(0).locator(".m3-file-tree__disclosure");
		await expect(disclosures).toHaveCount(10);
		await expect(disclosures.nth(0)).toHaveAttribute("open", "");
		await expect(disclosures.nth(1)).not.toHaveAttribute("open", "");
		await expect(
			disclosures.nth(1).locator(".m3-file-tree__node--added"),
		).not.toBeVisible();

		const nestedSummary = disclosures.nth(1).locator("summary");
		await nestedSummary.click();
		await expect(disclosures.nth(1)).toHaveAttribute("open", "");
		await expect(
			disclosures.nth(1).locator(".m3-file-tree__node--added"),
		).toBeVisible();
		await nestedSummary.press("Enter");
		await expect(disclosures.nth(1)).not.toHaveAttribute("open", "");
		await nestedSummary.dblclick();
		const selectedText = await page.evaluate(() =>
			window.getSelection()?.toString(),
		);
		expect(selectedText).toBe("");

		const styles = await trees.nth(0).evaluate((element) => {
			const tree = getComputedStyle(element);
			const addedRow = element.querySelector<HTMLElement>(
				".m3-file-tree__node--added > .m3-file-tree__row",
			);
			const firstNode = element.querySelector<HTMLElement>(
				".m3-file-tree__node",
			);
			if (!addedRow || !firstNode) {
				throw new Error("File Tree test nodes are missing");
			}
			const added = getComputedStyle(addedRow);
			const summary = element.querySelector<HTMLElement>(
				".m3-disclosure__summary",
			);
			if (!summary) throw new Error("File Tree disclosure is missing");
			return {
				borderRadius: tree.borderRadius,
				fontFamily: tree.fontFamily,
				addedBackground: added.backgroundColor,
				listStyle: getComputedStyle(firstNode).listStyleType,
				userSelect: getComputedStyle(summary).userSelect,
			};
		});
		expect(styles.borderRadius).toBe("16px");
		// `--font-mono` is owned by Astro Fonts whenever a custom mono role is
		// enabled (see the comment in src/styles/font-faces.css), so the resolved
		// stack is the generated family rather than the `ui-monospace` fallback
		// chain, which only applies when `--font-mono` is absent. Assert the family
		// that actually applies and that it is not inheriting the body stack.
		expect(styles.fontFamily).toContain("JetBrains Mono");
		expect(styles.fontFamily).not.toContain("Outfit");
		expect(styles.addedBackground).not.toBe("rgba(0, 0, 0, 0)");
		expect(styles.listStyle).toBe("none");
		expect(styles.userSelect).toBe("none");
		await expect(
			trees.nth(0).locator(".m3-file-tree__comment").first(),
		).toHaveCSS("text-align", "right");

		const results = await new AxeBuilder({ page })
			.include(".m3-file-tree")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("hides comments and wraps long filenames on narrow screens", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const trees = await openPost(page);
		const firstTree = trees.nth(0);
		await firstTree
			.locator(".m3-file-tree__disclosure")
			.nth(1)
			.locator("summary")
			.click();
		const comment = firstTree.locator(".m3-file-tree__comment").first();
		await expect(comment).not.toBeVisible();
		const geometry = await firstTree.evaluate((element) => {
			const treeRect = element.getBoundingClientRect();
			const longName = element.querySelector<HTMLElement>(
				".m3-file-tree__node--added .m3-file-tree__name",
			);
			if (!longName) throw new Error("Long File Tree filename is missing");
			longName.textContent =
				"ResponsiveNavigationDisclosureControllerWithOverflowCoverage.svelte";
			const nameRect = longName.getBoundingClientRect();
			return {
				contained: nameRect.right <= treeRect.right + 1,
				hasHorizontalOverflow: element.scrollWidth > element.clientWidth + 1,
				overflowWrap: getComputedStyle(longName).overflowWrap,
			};
		});
		expect(geometry.contained).toBe(true);
		expect(geometry.hasHorizontalOverflow).toBe(false);
		expect(geometry.overflowWrap).toBe("anywhere");
		const transitionSeconds = await firstTree
			.locator(".m3-disclosure__indicator")
			.first()
			.evaluate((element) =>
				Number.parseFloat(getComputedStyle(element).transitionDuration),
			);
		expect(transitionSeconds).toBeLessThanOrEqual(0.00001);
	});
});
