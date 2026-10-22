import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/content-annotations/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md");
}

test.describe("Markdown content annotations", () => {
	test("opens an anchored native popover and closes it with Escape", async ({
		page,
	}) => {
		const article = await openPost(page);
		const trigger = article.locator(".m3-content-note__trigger").first();
		const targetId = await trigger.getAttribute("popovertarget");
		expect(targetId).toBeTruthy();
		const popover = page.locator(`#${targetId}`);

		await expect(trigger).toHaveAttribute("aria-label", "islands");
		await expect(popover).toHaveAttribute("role", "note");
		await expect(popover).toBeHidden();
		await trigger.click();
		await expect(popover).toBeVisible();
		await expect(
			popover.getByText("An island is an interactive"),
		).toBeVisible();

		const geometry = await popover.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				viewportWidth: window.innerWidth,
				viewportHeight: window.innerHeight,
				borderRadius: Number.parseFloat(style.borderRadius),
			};
		});
		expect(geometry.left).toBeGreaterThanOrEqual(0);
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth);
		expect(geometry.top).toBeGreaterThanOrEqual(0);
		expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
		expect(geometry.borderRadius).toBeGreaterThan(0);

		await page.keyboard.press("Escape");
		await expect(popover).toBeHidden();

		const results = await new AxeBuilder({ page })
			.include(".markdown-content")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("keeps long notes anchored and contained on mobile", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const article = await openPost(page);
		const trigger = article.locator(".m3-content-note__trigger").nth(1);
		const targetId = await trigger.getAttribute("popovertarget");
		const popover = page.locator(`#${targetId}`);
		await trigger.click();
		await expect(popover).toBeVisible();

		const geometry = await popover.evaluate((element) => {
			const rect = element.getBoundingClientRect();
			const triggerRect = document
				.querySelector(`[popovertarget="${element.id}"]`)
				?.getBoundingClientRect();
			const style = getComputedStyle(element);
			return {
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom,
				viewportHeight: window.innerHeight,
				maxHeight: Number.parseFloat(style.maxHeight),
				supportsAnchor: CSS.supports("position-area: block-end"),
				positionAnchor: style.positionAnchor,
				verticalGap: triggerRect
					? Math.min(
							Math.abs(rect.top - triggerRect.bottom),
							Math.abs(triggerRect.top - rect.bottom),
						)
					: Number.POSITIVE_INFINITY,
				hasPageOverflow:
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth + 1,
			};
		});

		expect(geometry.left).toBeGreaterThan(0);
		expect(geometry.right).toBeLessThan(390);
		expect(geometry.top).toBeGreaterThanOrEqual(0);
		expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight);
		expect(geometry.maxHeight).toBeLessThan(geometry.viewportHeight);
		expect(geometry.hasPageOverflow).toBe(false);
		if (geometry.supportsAnchor) {
			expect(geometry.positionAnchor).not.toBe("auto");
			expect(geometry.verticalGap).toBeLessThanOrEqual(16);
		}
	});
});
