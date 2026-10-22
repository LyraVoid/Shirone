import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/markdown-abbreviations/";

async function openPost(page: import("@playwright/test").Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md abbr.m3-abbreviation");
}

test.describe("Markdown abbreviations", () => {
	test("shows an anchored native popover on hover and closes with Escape", async ({
		page,
	}) => {
		const abbreviations = await openPost(page);
		await expect(abbreviations).toHaveCount(4);
		const first = abbreviations.nth(0);
		await expect(first).toHaveAttribute(
			"data-abbreviation-expansion",
			"Server-Side Rendering",
		);
		await expect(first).not.toHaveAttribute("title");
		await expect(first).toHaveAttribute("style", "anchor-name: --m3-abbr-1");

		const targetId = await first.getAttribute("aria-describedby");
		expect(targetId).toBeTruthy();
		const popover = page.locator(`#${targetId}`);
		await expect(popover).toHaveAttribute("role", "tooltip");
		await expect(popover).toBeHidden();

		await first.hover();
		await expect(popover).toBeVisible();
		await expect(popover).toHaveText("Server-Side Rendering");

		const geometry = await popover.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const anchorRect = document
				.querySelector<HTMLElement>(`[aria-describedby="${element.id}"]`)
				?.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight,
				supportsAnchor: CSS.supports("position-area: block-start"),
				positionAnchor: style.positionAnchor,
				verticalGap: anchorRect
					? Math.min(
							Math.abs(anchorRect.top - rect.bottom),
							Math.abs(rect.top - anchorRect.bottom),
						)
					: Number.POSITIVE_INFINITY,
			};
		});

		expect(geometry.left).toBeGreaterThanOrEqual(0);
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
		expect(geometry.top).toBeGreaterThanOrEqual(0);
		expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
		if (geometry.supportsAnchor) {
			expect(geometry.positionAnchor).not.toBe("auto");
			expect(geometry.verticalGap).toBeLessThanOrEqual(16);
		}

		await page.keyboard.press("Escape");
		await expect(popover).toBeHidden();

		const results = await new AxeBuilder({ page })
			.include(".markdown-content")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("keeps abbreviations and popovers within a narrow reading column", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const abbreviations = await openPost(page);
		const first = abbreviations.nth(0);
		const targetId = await first.getAttribute("aria-describedby");
		expect(targetId).toBeTruthy();
		const popover = page.locator(`#${targetId}`);

		await first.focus();
		await expect(popover).toBeVisible();

		const geometry = await abbreviations.evaluateAll((elements) => ({
			hasPageOverflow:
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth + 1,
			hasAbbreviationOverflow: elements.some(
				(element) => element.scrollWidth > element.clientWidth + 1,
			),
		}));
		const popoverBounds = await popover.evaluate((element) => ({
			left: element.getBoundingClientRect().left,
			right: element.getBoundingClientRect().right,
			viewportWidth: window.innerWidth,
		}));

		expect(geometry.hasPageOverflow).toBe(false);
		expect(geometry.hasAbbreviationOverflow).toBe(false);
		expect(popoverBounds.left).toBeGreaterThanOrEqual(0);
		expect(popoverBounds.right).toBeLessThanOrEqual(
			popoverBounds.viewportWidth,
		);
	});
});
