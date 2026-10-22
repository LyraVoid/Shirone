import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/admonitions/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	return page.locator(".custom-md .m3-admonition");
}

test.describe("Markdown admonitions", () => {
	test("renders token-driven semantic variants and an accessible disclosure", async ({
		page,
	}) => {
		const admonitions = await openPost(page);
		await expect(admonitions).toHaveCount(7);
		await expect(page.locator(".custom-md aside.m3-admonition")).toHaveCount(6);
		expect(
			await admonitions.evaluateAll((elements) =>
				elements.map((element) => element.getAttribute("data-admonition")),
			),
		).toEqual([
			"note",
			"info",
			"tip",
			"important",
			"warning",
			"caution",
			"details",
		]);

		const note = admonitions.filter({
			has: page.getByText("Deployment context"),
		});
		const geometry = await note.evaluate((element) => {
			const style = getComputedStyle(element);
			const title = element.querySelector<HTMLElement>(".m3-admonition__title");
			if (!title) throw new Error("Admonition title is missing");
			return {
				background: style.backgroundColor,
				borderInlineStartWidth: Number.parseFloat(style.borderInlineStartWidth),
				borderRadius: Number.parseFloat(style.borderRadius),
				titleFontSize: Number.parseFloat(getComputedStyle(title).fontSize),
			};
		});

		expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
		expect(geometry.borderInlineStartWidth).toBe(4);
		expect(geometry.borderRadius).toBeGreaterThanOrEqual(12);
		expect(geometry.titleFontSize).toBeGreaterThan(0);

		const details = page.locator("details.m3-admonition");
		const summary = details.locator("summary");
		await expect(details).not.toHaveAttribute("open", "");
		expect(
			await summary.evaluate((element) => {
				const style = getComputedStyle(element);
				return [style.borderBottomLeftRadius, style.borderBottomRightRadius];
			}),
		).not.toEqual(["0px", "0px"]);
		await summary.focus();
		await page.keyboard.press("Enter");
		await expect(details).toHaveAttribute("open", "");
		expect(
			await summary.evaluate((element) => {
				const style = getComputedStyle(element);
				return [style.borderBottomLeftRadius, style.borderBottomRightRadius];
			}),
		).toEqual(["0px", "0px"]);

		const results = await new AxeBuilder({ page })
			.include(".m3-admonition")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("contains rich content within a narrow article viewport", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const admonitions = await openPost(page);
		await page.locator("details.m3-admonition > summary").click();

		const geometry = await admonitions.evaluateAll((elements) => ({
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
