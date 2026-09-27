import { expect, test } from "@playwright/test";

/**
 * FAB 悬浮导航体系测试：
 * - 桌面端 (>= 1024px)：悬浮 TOC 隐藏 (lg:hidden)，返回顶部滚动后显示
 * - 移动端 (< 768px)：悬浮 TOC 显示，点击展开 M3 目录卡片，ESC 键退出，点击标题平滑跳转并关闭
 * - 平板端 (768px ~ 1023px)：悬浮 TOC 正常显示
 * - 零额外负担：评论系统未启用时，页面中不输出评论 FAB 按钮 (#fab-comment-btn)
 */
test.describe("FAB Navigation System", () => {
	test("Desktop: Floating TOC is hidden on desktop, BackToTop behaves correctly on scroll", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		// 桌面端悬浮 TOC 必须处于隐藏状态 (lg:hidden)
		const tocBtn = page.locator("#fab-toc-btn");
		await expect(tocBtn).toBeHidden();

		// 默认 commentConfig.enable: false 时，根据零额外负担原则，不渲染评论按钮
		const commentBtn = page.locator("#fab-comment-btn");
		await expect(commentBtn).toHaveCount(0);

		// 初始状态下 BackToTop 不占据布局
		const topBtn = page.locator("#fab-top-btn");
		await expect(topBtn).toBeHidden();

		// 滚动越过 Banner 后 BackToTop 浮现
		await page.evaluate(() => window.scrollTo(0, 800));
		await page.waitForTimeout(300);
		await expect(topBtn).toBeVisible();

		// 点击 BackToTop 返回顶部
		await topBtn.click();
		await page.waitForTimeout(500);
		const scrollY = await page.evaluate(() => window.scrollY);
		expect(scrollY).toBeLessThanOrEqual(50);
	});

	test("Mobile: Floating TOC is visible, opens modal, supports ESC and heading jumps", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		const tocBtn = page.locator("#fab-toc-btn");
		await expect(tocBtn).toBeVisible();
		const homeBtn = page.locator("#fab-home-btn");
		await expect(homeBtn).toBeVisible();

		// 点击打开 TOC 弹窗
		await tocBtn.click();
		const panel = page.locator("#floating-toc-panel");
		await expect(panel).toHaveClass(/is-open/);

		// 按 Escape 键关闭
		await page.keyboard.press("Escape");
		await expect(panel).not.toHaveClass(/is-open/);

		// 再次打开并点击目录项跳转
		await tocBtn.click();
		await expect(panel).toHaveClass(/is-open/);

		const firstHeadingLink = page.locator("#floating-toc-tree a").first();
		await expect(firstHeadingLink).toBeVisible();
		await firstHeadingLink.click();

		// 点击后自动收起
		await expect(panel).not.toHaveClass(/is-open/);
		await expect(page).toHaveURL(/#1-creating-a-new-post/);
	});

	test("Mobile: Home action stays hidden on the home page", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator("#fab-home-btn")).toBeHidden();
	});

	test("Mobile: controls hide on downward scroll and reset after navigation", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		const controls = page.locator("#floating-controls");

		await page.evaluate(() => window.scrollTo(0, 800));
		await expect(controls).toHaveClass(/fab-scroll-hidden/);
		await expect(controls).toHaveAttribute("inert", "");
		await expect(controls).toHaveAttribute("aria-hidden", "true");
		await page.evaluate(() => window.scrollBy(0, -120));
		await expect(controls).not.toHaveClass(/fab-scroll-hidden/);
		await expect(controls).not.toHaveAttribute("inert", "");
		await expect(controls).not.toHaveAttribute("aria-hidden", "true");

		await page.evaluate(() => window.scrollTo(0, 900));
		await expect(controls).toHaveClass(/fab-scroll-hidden/);
		await page.evaluate(() => window.swup?.navigate("/posts/expressive-code/"));
		await page.waitForURL("**/posts/expressive-code/");
		await expect(controls).not.toHaveClass(/fab-scroll-hidden/);
	});

	test("Mobile: browser chrome collapse hides controls without a scroll delta", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			class TestVisualViewport extends EventTarget {
				width = 375;
				height = 560;
				offsetTop = 0;
			}
			Object.defineProperty(window, "visualViewport", {
				configurable: true,
				value: new TestVisualViewport(),
			});
		});
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		await page.evaluate(() => window.scrollTo(0, 800));
		await page.evaluate(() => window.scrollBy(0, -120));
		const controls = page.locator("#floating-controls");
		await expect(controls).not.toHaveClass(/fab-scroll-hidden/);

		await page.evaluate(() => {
			const viewport = window.visualViewport as VisualViewport & {
				height: number;
			};
			viewport.height = 640;
			viewport.dispatchEvent(new Event("resize"));
		});
		await expect(controls).toHaveClass(/fab-scroll-hidden/);
	});

	test("Dark mode: FAB keeps tonal contrast over dark surfaces", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.addInitScript(() => localStorage.setItem("theme", "dark"));
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		await expect(page.locator("html")).toHaveClass(/dark/);

		const colors = await page
			.locator("#fab-toc-btn button")
			.evaluate((button) => {
				const style = getComputedStyle(button);
				const root = getComputedStyle(document.documentElement);
				return {
					background: style.backgroundColor,
					foreground: style.color,
					card: root.getPropertyValue("--card-bg").trim(),
					page: root.getPropertyValue("--page-bg").trim(),
				};
			});

		expect(colors.background).not.toBe(colors.card);
		expect(colors.background).not.toBe(colors.page);
		expect(colors.background).not.toBe(colors.foreground);
	});

	test("Tablet: Floating TOC is visible on tablet viewport", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 820, height: 1180 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		const tocBtn = page.locator("#fab-toc-btn");
		await expect(tocBtn).toBeVisible();
	});

	test("Mobile: Floating TOC follows Swup article navigation", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.hooks));

		await page.evaluate(() => window.swup?.navigate("/posts/expressive-code/"));
		await page.waitForURL("**/posts/expressive-code/");
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"post",
		);
		await expect(page.locator("#floating-toc-tree a").first()).toHaveAttribute(
			"href",
			"#expressive-code",
		);
	});
});
