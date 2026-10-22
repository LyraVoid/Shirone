import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/collapse-panels/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md .m3-collapse");
}

test.describe("Markdown collapse panels", () => {
	test("supports independent and native accordion disclosure behavior", async ({
		page,
	}) => {
		const groups = await openPost(page);
		await expect(groups).toHaveCount(2);

		const independent = groups.nth(0);
		const independentItems = independent.locator("details");
		await expect(independentItems).toHaveCount(3);
		await expect(independentItems.nth(1)).toHaveAttribute("open", "");
		await independentItems.nth(0).locator("summary").click();
		await expect(independentItems.nth(0)).toHaveAttribute("open", "");
		await expect(independentItems.nth(1)).toHaveAttribute("open", "");

		const accordion = groups.nth(1);
		const accordionItems = accordion.locator("details");
		await expect(accordionItems.nth(0)).toHaveAttribute("open", "");
		const names = await accordionItems.evaluateAll((items) =>
			items.map((item) => item.getAttribute("name")),
		);
		expect(new Set(names).size).toBe(1);
		expect(names[0]).toBeTruthy();

		const secondSummary = accordionItems.nth(1).locator("summary");
		await secondSummary.focus();
		await page.keyboard.press("Enter");
		await expect(accordionItems.nth(0)).not.toHaveAttribute("open", "");
		await expect(accordionItems.nth(1)).toHaveAttribute("open", "");

		const geometry = await accordion.evaluate((element) => {
			const style = getComputedStyle(element);
			const summaries = element.querySelectorAll<HTMLElement>("summary");
			return {
				borderRadius: Number.parseFloat(style.borderRadius),
				borderStyle: style.borderStyle,
				background: style.backgroundColor,
				minSummaryHeight: Math.min(
					...Array.from(
						summaries,
						(summary) => summary.getBoundingClientRect().height,
					),
				),
			};
		});
		expect(geometry.borderRadius).toBeGreaterThanOrEqual(12);
		expect(geometry.borderStyle).toBe("solid");
		expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
		expect(geometry.minSummaryHeight).toBeGreaterThanOrEqual(48);

		const results = await new AxeBuilder({ page })
			.include(".m3-collapse")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("contains open rich content within a narrow article viewport", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const groups = await openPost(page);
		await expect(groups).toHaveCount(2);
		const independentClosedItems = groups
			.nth(0)
			.locator("details:not([open]) > summary");
		while ((await independentClosedItems.count()) > 0) {
			await independentClosedItems.first().click();
		}

		const geometry = await groups.evaluateAll((elements) => ({
			hasPageOverflow:
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth + 1,
			hasComponentOverflow: elements.some(
				(element) => element.scrollWidth > element.clientWidth + 1,
			),
		}));

		expect(geometry.hasPageOverflow).toBe(false);
		expect(geometry.hasComponentOverflow).toBe(false);
	});
});
