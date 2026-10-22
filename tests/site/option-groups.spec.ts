import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const POST_PATH = "/posts/option-groups/";

async function openPost(page: Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	const groups = page.locator(".custom-md .m3-option-group");
	await expect(groups).toHaveCount(3);
	await expect(groups.first()).toHaveAttribute(
		"data-option-group-ready",
		"true",
	);
	return groups;
}

test.describe("Markdown option groups", () => {
	test("switches with pointer and keyboard, synchronizes, and persists", async ({
		page,
	}) => {
		const groups = await openPost(page);
		const first = groups.nth(0);
		const second = groups.nth(1);

		await expect(first.locator('[role="tabpanel"]:visible')).toContainText(
			"pnpm.cmd add astro",
		);
		await first.getByRole("tab", { name: "npm", exact: true }).click();
		await expect(first).toHaveAttribute("data-active-value", "npm");
		await expect(second).toHaveAttribute("data-active-value", "npm");
		await expect(second.locator('[role="tabpanel"]:visible')).toContainText(
			"npm run dev",
		);

		const npmTab = first.getByRole("tab", { name: "npm", exact: true });
		await npmTab.focus();
		await page.keyboard.press("ArrowRight");
		await expect(first).toHaveAttribute("data-active-value", "pnpm");
		await expect(first.getByRole("tab", { name: "pnpm" })).toBeFocused();
		await page.keyboard.press("End");
		await expect(first).toHaveAttribute("data-active-value", "bun");

		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(page.locator(".m3-option-group").first()).toHaveAttribute(
			"data-active-value",
			"bun",
		);
	});

	test("keeps long option labels in one compact scrollable row", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.setViewportSize({ width: 390, height: 844 });
		const groups = await openPost(page);
		const manyOptions = groups.nth(2);
		const geometry = await manyOptions.evaluate((element) => {
			const tablist = element.querySelector<HTMLElement>(
				".m3-option-group__tablist",
			);
			const rootStyle = getComputedStyle(element);
			const tablistStyle = tablist ? getComputedStyle(tablist) : null;
			return {
				pageOverflow:
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth + 1,
				componentOverflow: element.scrollWidth > element.clientWidth + 1,
				tablistScrolls: Boolean(
					tablist && tablist.scrollWidth > tablist.clientWidth + 1,
				),
				scrollbarWidth: tablistStyle?.scrollbarWidth,
				borderRadius: Number.parseFloat(rootStyle.borderRadius),
			};
		});

		expect(geometry.pageOverflow).toBe(false);
		expect(geometry.componentOverflow).toBe(false);
		expect(geometry.tablistScrolls).toBe(true);
		expect(geometry.scrollbarWidth).toBe("none");
		expect(geometry.borderRadius).toBeGreaterThanOrEqual(12);

		const optionTabs = manyOptions.locator(".m3-option-group__tab");
		await expect(optionTabs).toHaveCount(5);
		await optionTabs.nth(4).click();
		await expect(manyOptions).toHaveAttribute(
			"data-active-value",
			"Offline recovery workflow",
		);

		const results = await new AxeBuilder({ page })
			.include(".m3-option-group")
			.analyze();
		expect(results.violations).toEqual([]);
	});

	test("contains the desktop wheel within an overflowing tab row", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		const groups = await openPost(page);
		const manyOptions = groups.nth(2);
		const tablist = manyOptions.locator(".m3-option-group__tablist");

		const hasOverflow = await tablist.evaluate(
			(element) => element.scrollWidth > element.clientWidth + 1,
		);
		expect(hasOverflow).toBe(true);
		await tablist.hover();
		await page.mouse.wheel(0, 160);
		const scrollLeft = await tablist.evaluate((element) => element.scrollLeft);
		expect(scrollLeft).toBeGreaterThan(0);

		await manyOptions.evaluate((element) => {
			element.scrollIntoView({ block: "center" });
			const list = element.querySelector<HTMLElement>(
				".m3-option-group__tablist",
			);
			if (list) list.scrollLeft = list.scrollWidth;
		});
		const pageScrollBefore = await page.evaluate(() => window.scrollY);
		await tablist.hover();
		await page.mouse.wheel(0, 160);
		const pageScrollAfter = await page.evaluate(() => window.scrollY);
		expect(pageScrollAfter).toBe(pageScrollBefore);
	});

	test("initializes after Swup replaces a page without option groups", async ({
		page,
	}) => {
		await page.goto("/posts/collapse-panels/", {
			waitUntil: "domcontentloaded",
		});
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), POST_PATH);
		await page.waitForURL(`**${POST_PATH}`);
		await expect(page.locator(".m3-option-group").first()).toHaveAttribute(
			"data-option-group-ready",
			"true",
		);
	});
});
