import { expect, test } from "@playwright/test";

// F-34：抽屉是对话框语义（role=dialog + aria-modal），焦点进入、循环、归还。
test.describe("navigation drawer dialog semantics", () => {
	test.beforeEach(async ({ page }) => {
		// 抽屉只在窄屏出现
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/", { waitUntil: "domcontentloaded" });
	});

	test("opens as a modal dialog with focus moved inside", async ({ page }) => {
		const trigger = page.locator("#nav-drawer-switch");
		await trigger.click();

		const wrapper = page.locator(".site-drawer");
		const dialog = page.locator(".site-drawer__panel");
		await expect(wrapper).toHaveClass(/site-drawer--open/);
		await expect(dialog).toHaveAttribute("aria-modal", "true");
		// 焦点已移入抽屉内的首个可聚焦元素
		await expect(dialog.locator("a[href], button").first()).toBeFocused();
	});

	test("returns focus to the trigger on Escape and scrim close", async ({
		page,
	}) => {
		const trigger = page.locator("#nav-drawer-switch");
		const wrapper = page.locator(".site-drawer");

		await trigger.click();
		await expect(wrapper).toHaveClass(/site-drawer--open/);

		await page.keyboard.press("Escape");
		await expect(wrapper).not.toHaveClass(/site-drawer--open/);
		await expect(trigger).toBeFocused();

		await trigger.click();
		await expect(wrapper).toHaveClass(/site-drawer--open/);
		// 面板宽 360px；.site-drawer fixed 区域宽 375px（390 视口扣除滚动条），须点在 [360, 375) 的 scrim 露出带内
		await page
			.locator(".site-drawer__scrim")
			.click({ position: { x: 372, y: 400 } });
		await expect(wrapper).not.toHaveClass(/site-drawer--open/);
		await expect(trigger).toBeFocused();
	});

	test("traps Tab focus inside the open drawer", async ({ page }) => {
		await page.locator("#nav-drawer-switch").click();
		const dialog = page.locator(".site-drawer__panel");
		await expect(dialog).toHaveAttribute("aria-modal", "true");

		const focusables = dialog.locator("a[href], button:not([disabled])");
		const count = await focusables.count();
		expect(count).toBeGreaterThan(1);

		// Tab 到底循环回首项，Shift+Tab 从首项回环到末项
		await focusables.nth(count - 1).focus();
		await page.keyboard.press("Tab");
		await expect(focusables.first()).toBeFocused();

		await page.keyboard.press("Shift+Tab");
		await expect(focusables.nth(count - 1)).toBeFocused();
	});
	test("syncs active item and focus contract after Swup navigation", async ({
		page,
	}) => {
		const trigger = page.locator("#nav-drawer-switch");
		const wrapper = page.locator(".site-drawer");

		// 经抽屉内的 Swup 链接跳转到归档页（swup:content:replace 后组件同步路由）
		await trigger.click();
		await expect(wrapper).toHaveClass(/site-drawer--open/);
		await page.locator('.site-drawer__item[href="/archive/"]').click();
		await page.waitForURL("**/archive/");
		await expect(
			page.locator('.site-drawer__item[aria-current="page"]'),
		).toHaveAttribute("href", "/archive/");

		// 导航后打开/关闭抽屉，焦点契约保持
		await trigger.click();
		await expect(wrapper).toHaveClass(/site-drawer--open/);
		await expect(
			page.locator(".site-drawer__panel").locator("a[href], button").first(),
		).toBeFocused();
		await page.keyboard.press("Escape");
		await expect(wrapper).not.toHaveClass(/site-drawer--open/);
		await expect(trigger).toBeFocused();
	});
});

