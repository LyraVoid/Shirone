import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/steps/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md .m3-steps");
}

test.describe("Markdown Steps component", () => {
	test("renders an unframed step rail with stable marker and content geometry", async ({
		page,
	}) => {
		const steps = await openPost(page);
		await expect(steps).toHaveCount(1);
		await expect(steps).toHaveAttribute("aria-label", "Production deployment");
		await expect(steps.locator(".m3-steps__item")).toHaveCount(4);
		await expect(steps.locator(".m3-steps__index")).toHaveCount(4);
		await expect(steps.locator(".m3-steps__header")).toHaveCount(0);
		await expect(steps.locator(".expressive-code")).toHaveCount(4);

		const geometry = await steps.evaluate((element) => {
			const firstItem = element.querySelector<HTMLElement>(".m3-steps__item");
			const firstIndex = element.querySelector<HTMLElement>(".m3-steps__index");
			const firstContent =
				element.querySelector<HTMLElement>(".m3-steps__content");
			const secondIndex =
				element.querySelectorAll<HTMLElement>(".m3-steps__index")[1];
			if (!firstItem || !firstIndex || !firstContent || !secondIndex) {
				throw new Error("Steps geometry nodes are missing");
			}
			const rootStyle = getComputedStyle(element);
			const itemStyle = getComputedStyle(firstItem);
			const indexStyle = getComputedStyle(firstIndex);
			const indexRect = firstIndex.getBoundingClientRect();
			const contentRect = firstContent.getBoundingClientRect();
			const secondIndexRect = secondIndex.getBoundingClientRect();
			return {
				background: rootStyle.backgroundColor,
				borderStyle: rootStyle.borderStyle,
				borderRadius: rootStyle.borderRadius,
				itemDisplay: itemStyle.display,
				gridColumns: itemStyle.gridTemplateColumns,
				indexBorderRadius: Number.parseFloat(indexStyle.borderRadius),
				indexWidth: indexRect.width,
				indexRight: indexRect.right,
				contentLeft: contentRect.left,
				indexCenter: indexRect.left + indexRect.width / 2,
				secondIndexCenter: secondIndexRect.left + secondIndexRect.width / 2,
			};
		});

		expect(geometry.background).toBe("rgba(0, 0, 0, 0)");
		expect(geometry.borderStyle).toBe("none");
		expect(geometry.borderRadius).toBe("0px");
		expect(geometry.itemDisplay).toBe("grid");
		expect(geometry.gridColumns).not.toBe("none");
		expect(geometry.indexBorderRadius).toBeGreaterThanOrEqual(
			geometry.indexWidth / 2,
		);
		expect(geometry.indexRight).toBeLessThan(geometry.contentLeft);
		expect(geometry.indexCenter).toBeCloseTo(geometry.secondIndexCenter, 0);

		const results = await new AxeBuilder({ page })
			.include(".m3-steps")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("keeps the rail and embedded code inside a narrow article viewport", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const steps = await openPost(page);

		const geometry = await steps.evaluate((element) => {
			const index = element.querySelector<HTMLElement>(".m3-steps__index");
			const content = element.querySelector<HTMLElement>(".m3-steps__content");
			if (!index || !content) throw new Error("Steps mobile nodes are missing");
			const indexRect = index.getBoundingClientRect();
			const contentRect = content.getBoundingClientRect();
			return {
				hasPageOverflow:
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth + 1,
				hasComponentOverflow: element.scrollWidth > element.clientWidth + 1,
				indexRight: indexRect.right,
				contentLeft: contentRect.left,
			};
		});

		expect(geometry.hasPageOverflow).toBe(false);
		expect(geometry.hasComponentOverflow).toBe(false);
		expect(geometry.indexRight).toBeLessThan(geometry.contentLeft);
	});
});
