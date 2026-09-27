import { expect, test } from "@playwright/test";

/**
 * 文章列表布局模式（list/grid）锁定：
 * - SSR 输出站点默认模式（postListConfig.layout.mode = list）；
 * - 访客偏好 localStorage `post-list-mode` 由 PostPage 的 is:inline 脚本
 *   在首屏应用（防闪），swup 导航由 Layout 钩子兜底；
 * - 设置面板 SegmentedButton 切换：容器类 / data 属性 / localStorage 持久；
 * - reduced-motion 下切换不产生 WAAPI 动画（FLIP 折叠为直接跳变）。
 */
/** 卡片上正在播放/待播的动画数（fill:forwards 的已结束动画不计入） */
function runningCardAnimations(): number {
	return Array.from(document.querySelectorAll(".m3-blog-postcard"))
		.flatMap((el) => el.getAnimations())
		.filter((a) => a.playState === "running" || a.playState === "pending")
		.length;
}

test.describe("文章列表布局模式", () => {
	test("置顶文章排在首位并输出 SSR 状态标记", async ({ page }) => {
		await page.goto("/");
		const firstCard = page.locator(".m3-blog-postcard").first();
		await expect(firstCard.locator(".m3-blog-postcard__title")).toContainText(
			"Shirone Authoring & Usage Guide",
		);
		await expect(firstCard.locator(".m3-blog-postcard__pin svg")).toBeVisible();
		await expect(firstCard.locator(".m3-blog-postcard__title")).toHaveAttribute(
			"aria-label",
			/Shirone Authoring & Usage Guide, Pinned/,
		);
	});

	test("SSR 输出站点默认 list 容器类", async ({ page }) => {
		await page.goto("/");
		await expect(page.locator("#post-list")).toHaveClass(/m3e-post-list--list/);
		await expect(page.locator("#post-list")).not.toHaveClass(
			/m3e-post-list--grid/,
		);
	});

	test("访客偏好 grid：首屏内联脚本应用 + 刷新持久", async ({ page }) => {
		await page.addInitScript(() =>
			localStorage.setItem("post-list-mode", "grid"),
		);
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.goto("/");
		const container = page.locator("#post-list");
		await expect(container).toHaveClass(/m3e-post-list--grid/);
		await expect(container).toHaveAttribute("data-layout-mode", "grid");
		// 容器真实切换为网格布局（而非仅类名）
		await expect
			.poll(() =>
				page
					.locator("#post-list")
					.evaluate((el) => getComputedStyle(el).display),
			)
			.toBe("grid");
		await page.reload();
		await expect(page.locator("#post-list")).toHaveClass(/m3e-post-list--grid/);
	});

	test("设置面板切换到 grid：容器切换 + 偏好写入 localStorage", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1600, height: 900 });
		await page.goto("/");
		await page.locator("#display-settings-switch").click();
		// DisplaySettings 为 client:only 岛，等水合产物出现；radio 被
		// 标签遮挡，点击可见段标签（真实用户路径）
		const gridLabel = page.locator("#display-setting").getByText("Grid");
		await gridLabel.waitFor({ state: "visible", timeout: 10_000 });
		await gridLabel.click();
		await expect(page.locator("#post-list")).toHaveClass(/m3e-post-list--grid/);
		expect(
			await page.evaluate(() => localStorage.getItem("post-list-mode")),
		).toBe("grid");
		// 正常动效下 FLIP 应在播放：切到 grid 后卡片上有进行中的动画
		await expect
			.poll(() => page.evaluate(runningCardAnimations))
			.toBeGreaterThan(0);
	});

	test("手机竖屏锁定 list：grid 偏好实际渲染为单列", async ({ page }) => {
		await page.addInitScript(() =>
			localStorage.setItem("post-list-mode", "grid"),
		);
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/");
		const container = page.locator("#post-list");
		// 偏好类保留（回到宽屏时生效），窄屏下容器按 flex 单列渲染
		await expect(container).toHaveClass(/m3e-post-list--grid/);
		await expect
			.poll(() => container.evaluate((el) => getComputedStyle(el).display))
			.toBe("flex");
	});

	test("单侧栏压窄内容时回退 ListUI，空间恢复后自动回到 GridUI", async ({
		page,
	}) => {
		await page.addInitScript(() =>
			localStorage.setItem("post-list-mode", "grid"),
		);
		// lg 到 xl 之间只显示主侧栏；此时内容列不足以容纳两张 regular 卡片。
		await page.setViewportSize({ width: 1050, height: 900 });
		await page.goto("/");
		const container = page.locator("#post-list");
		const firstCover = page.locator(".m3-blog-postcard__cover").first();

		// 偏好仍为 grid，但有效布局回退为桌面 ListUI。
		await expect(container).toHaveAttribute("data-layout-mode", "grid");
		await expect(container).toHaveClass(/m3e-post-list--grid/);
		await expect
			.poll(() => container.evaluate((el) => getComputedStyle(el).display))
			.toBe("flex");
		await expect
			.poll(() => firstCover.evaluate((el) => getComputedStyle(el).position))
			.toBe("absolute");

		// 容器重新满足两列宽度后，纯响应式恢复 GridUI，无需改写偏好。
		await page.setViewportSize({ width: 1600, height: 900 });
		await expect
			.poll(() => container.evaluate((el) => getComputedStyle(el).display))
			.toBe("grid");
		await expect
			.poll(() => firstCover.evaluate((el) => getComputedStyle(el).position))
			.toBe("relative");

		await page.setViewportSize({ width: 1050, height: 900 });
		await expect
			.poll(() => container.evaluate((el) => getComputedStyle(el).display))
			.toBe("flex");
	});

	test("reduced-motion：切换无 WAAPI 动画（FLIP 折叠为直接跳变）", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		// 等 onload stagger 动画（含延迟阶段）全部收敛，避免基线误报
		await page.waitForFunction(
			() => {
				const els = [...document.querySelectorAll(".onload-animation")];
				return els.every((el) => {
					if ((el as HTMLElement).offsetParent === null) return true;
					return getComputedStyle(el).opacity === "1";
				});
			},
			undefined,
			{ timeout: 15_000 },
		);
		await page.locator("#display-settings-switch").click();
		const gridLabel = page.locator("#display-setting").getByText("Grid");
		await gridLabel.waitFor({ state: "visible", timeout: 10_000 });
		await gridLabel.click();
		await expect(page.locator("#post-list")).toHaveClass(/m3e-post-list--grid/);
		// FLIP 被 reduced-motion 折叠：卡片上无正在播放/待播的动画
		// （已结束但 fill:forwards 的 onload 动画不计入；页面级常驻动画排除）
		await expect.poll(() => page.evaluate(runningCardAnimations)).toBe(0);
	});
});
