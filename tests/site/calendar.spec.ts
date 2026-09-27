import { expect, test } from "@playwright/test";

/**
 * 侧栏日历 widget 回归：
 * - 渲染：单月网格 7 列、今天 aria-current、有文日填色标记；
 * - 切月与回今天；
 * - 点击有文日展开/收起当日文章（collapse，列表为文章链接）；
 * - reduced-motion 瞬切。
 * 站点 demo 数据：2024-05-01 有文章（markdown-extended），其余月份无文，
 * 因此「切到 2024-05」既验证切月也验证有文日标记。
 */
test.describe("sidebar calendar widget", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	async function openHome(page: import("@playwright/test").Page) {
		await page.goto("/", { waitUntil: "networkidle" });
		await calendar(page).scrollIntoViewIfNeeded();
		await page.waitForTimeout(800);
	}

	function calendar(page: import("@playwright/test").Page) {
		return page.locator('widget-layout[data-id="calendar"]');
	}

	function prevBtn(page: import("@playwright/test").Page) {
		return calendar(page).locator('[aria-label="Previous month"]');
	}

	function title(page: import("@playwright/test").Page) {
		return calendar(page).locator(".m3-calendar__title");
	}

	/** 连点 prev 切到目标标题（如 "May 2024"） */
	async function gotoMonth(
		page: import("@playwright/test").Page,
		target: string,
		maxClicks = 40,
	) {
		for (let i = 0; i < maxClicks; i++) {
			if ((await title(page).textContent())?.trim() === target) return;
			await prevBtn(page).click();
			await page.waitForTimeout(30);
		}
		throw new Error(`month ${target} not reached`);
	}

	test("renders month grid with today highlighted", async ({ page }) => {
		await openHome(page);

		await expect(title(page)).toBeVisible();
		// 日格数量对齐当前月份总天数
		const today = new Date();
		const daysInCurrentMonth = new Date(
			today.getFullYear(),
			today.getMonth() + 1,
			0,
		).getDate();
		await expect(calendar(page).locator(".m3-calendar__day")).toHaveCount(
			daysInCurrentMonth,
		);
		// 今天：aria-current="date"
		await expect(
			calendar(page).locator(".m3-calendar__day--today"),
		).toHaveAttribute("aria-current", "date");
	});

	test("navigates months and returns to today via title", async ({ page }) => {
		await openHome(page);

		const initial = (await title(page).textContent())?.trim();
		await prevBtn(page).click();
		await page.waitForTimeout(300);
		expect((await title(page).textContent())?.trim()).not.toBe(initial);
		// 非当前月：标题可点击回今天
		await title(page).click();
		await page.waitForTimeout(300);
		expect((await title(page).textContent())?.trim()).toBe(initial);
	});

	test("prev/next skip empty months and disable at boundaries", async ({
		page,
	}) => {
		await openHome(page);

		// 当前月（2026-09）无文：一次 prev 直达最近有文月（2026-08）
		await prevBtn(page).click();
		await page.waitForTimeout(300);
		expect((await title(page).textContent())?.trim()).toBe("August 2026");
		// 2026-08 之后无有文月：next 禁用
		await expect(
			calendar(page).locator('[aria-label="Next month"]'),
		).toBeDisabled();

		// 继续 prev：2026-07 → 2024-05 → 2024-04 → 2023-10 → 2023-08 → 2022-07
		for (const expected of [
			"July 2026",
			"May 2024",
			"April 2024",
			"October 2023",
			"August 2023",
			"July 2022",
		]) {
			await prevBtn(page).click();
			await page.waitForTimeout(250);
			expect((await title(page).textContent())?.trim()).toBe(expected);
		}
		// 最早有文月：prev 禁用
		await expect(
			calendar(page).locator('[aria-label="Previous month"]'),
		).toBeDisabled();
	});

	test("expands and collapses post list on post-day click", async ({
		page,
	}) => {
		await openHome(page);
		await gotoMonth(page, "May 2024");

		const postDay = calendar(page)
			.locator(".m3-calendar__day--has-posts")
			.first();
		await expect(postDay).toBeVisible();
		await expect(postDay).toHaveAttribute("aria-label", "2024-05-01，1 篇文章");

		// 展开：panel 高度 > 0，文章链接出现
		await postDay.click();
		await expect(
			calendar(page).locator(".m3-calendar__post a"),
		).toHaveAttribute("href", "/posts/markdown-extended/");
		await page.waitForTimeout(400);
		const openHeight = await calendar(page)
			.locator(".m3-calendar__panel")
			.evaluate((el) => el.getBoundingClientRect().height);
		expect(openHeight).toBeGreaterThan(0);

		// 收起：panel 归零
		await postDay.click();
		await page.waitForTimeout(400);
		const closedHeight = await calendar(page)
			.locator(".m3-calendar__panel")
			.evaluate((el) => el.getBoundingClientRect().height);
		expect(closedHeight).toBeLessThanOrEqual(4); // 顶部 padding 4px 残留
	});

	test("reduced motion toggles instantly", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openHome(page);
		await gotoMonth(page, "May 2024");

		const postDay = calendar(page)
			.locator(".m3-calendar__day--has-posts")
			.first();
		await postDay.click();
		// 瞬切：无 240ms 高度过渡等待，文章立即可见
		await expect(calendar(page).locator(".m3-calendar__post a")).toHaveCount(1);
	});
});
