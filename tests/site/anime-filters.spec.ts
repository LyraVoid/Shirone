import { expect, test } from "@playwright/test";

test("anime filters wrap whole chips and move the count below on narrow columns", async ({
	page,
}, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("theme", "dark"));
	await page.goto("/anime/?status=completed");
	await expect(
		page.locator(".anime-section__chips [aria-pressed='true']"),
	).toHaveText("Completed");
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.evaluate(() => document.fonts.ready);
	for (const width of [1800, 1280, 768, 640, 390, 320]) {
		await page.setViewportSize({ width, height: 900 });
		const geometry = await page
			.locator(".anime-section__filter-row")
			.evaluate((row) => {
				const group = row.querySelector<HTMLElement>(".anime-section__chips");
				const count = row.querySelector(".anime-section__count");
				if (!group || !count) throw new Error("Missing anime filters");
				const bounds = (element: Element) => {
					const rect = element.getBoundingClientRect();
					return {
						left: rect.left,
						right: rect.right,
						top: rect.top,
						bottom: rect.bottom,
					};
				};
				return {
					row: bounds(row),
					group: bounds(group),
					count: bounds(count),
					overflow: getComputedStyle(group).overflowX,
					chips: [...group.querySelectorAll("button")].map((chip) => ({
						bounds: bounds(chip),
						scroll: chip.scrollWidth,
						width: chip.clientWidth,
					})),
				};
			});
		expect(geometry.overflow).toBe("visible");
		for (const chip of geometry.chips) {
			expect(chip.bounds.left).toBeGreaterThanOrEqual(geometry.row.left);
			expect(chip.bounds.right).toBeLessThanOrEqual(geometry.row.right + 1);
			expect(chip.scroll).toBeLessThanOrEqual(chip.width);
		}
		if (width <= 390) {
			expect(geometry.count.top).toBeGreaterThan(geometry.group.bottom);
		} else {
			expect(geometry.count.left).toBeGreaterThan(geometry.group.right);
		}
		if (width === 1280 || width === 390) {
			await page.locator(".anime-section__tools").screenshot({
				path: testInfo.outputPath(`anime-filters-${width}.png`),
			});
		}
	}
});

test("anime filter icons render in SSR without JavaScript", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto("/anime/");
		const chips = page.locator(".anime-section__chips button");
		await expect(chips).toHaveCount(3);
		for (const chip of await chips.all()) {
			await expect(chip.locator(".m3-chip__icon svg")).toBeVisible();
		}
	} finally {
		await context.close();
	}
});

test("anime filter selection keeps button widths and focus stable after Swup navigation", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("api.iconify.design"))
			requests.push(request.url());
	});
	await page.goto("/");
	await page.locator('#top-row a[href="/anime/"]').click();
	await expect(page).toHaveURL(/\/anime\/$/);
	const chips = page.locator(".anime-section__chips button");
	await expect(chips).toHaveCount(3);
	await expect(
		page.locator("astro-island[ssr]").filter({ has: chips }),
	).toHaveCount(0);
	await page.evaluate(() => document.fonts.ready);
	const widths = await chips.evaluateAll((elements) =>
		elements.map((element) => element.getBoundingClientRect().width),
	);
	for (const chip of await chips.all()) {
		await chip.focus();
		await chip.press("Space");
		await expect(chip).toHaveAttribute("aria-pressed", "true");
		await expect(chip).toBeFocused();
		await expect(chip.locator(".m3-chip__icon svg")).toBeVisible();
		expect(
			await chips.evaluateAll((elements) =>
				elements.map((element) => element.getBoundingClientRect().width),
			),
		).toEqual(widths);
		await chip.press("Space");
		await expect(chip).toHaveAttribute("aria-pressed", "false");
	}
	expect(requests).toEqual([]);
});
