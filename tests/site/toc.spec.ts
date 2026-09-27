import { expect, test } from "@playwright/test";

/**
 * 文章页目录（TOC）回归锁定：
 * - M3 tonal pill 高亮渲染（不再有旧虚线框 active-indicator）
 * - 滚动时高亮跟随阅读位置（最后滚过视口 35% 线的标题）
 * - 点击目录项锚点定位并同步高亮
 * - TOC 卡片固定在侧边栏（sticky），长目录在卡片内自适应滚动并自动居中流动
 * 注意：TOC 仅在 ≥1536px（2xl）显示，测试需用宽视口。
 */
test.describe("Site TOC", () => {
	test.use({ viewport: { width: 1600, height: 900 } });

	test("scroll highlight and anchor navigation", async ({ page }) => {
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		// 等 onload 动画收敛（TOC 初始化依赖稳定的布局尺寸）
		await page.waitForFunction(() => {
			const toc = document.getElementById("toc");
			if (!toc) return false;
			return [...document.querySelectorAll(".onload-animation")].every((el) => {
				if ((el as HTMLElement).offsetParent === null) return true;
				return getComputedStyle(el).opacity === "1";
			});
		});

		const items = page.locator("#toc .m3-blog-toc__item");
		const active = page.locator("#toc .m3-blog-toc__item--active");

		// 目录渲染 + 旧的虚线框指示器已移除
		await expect(items).toHaveCount(16);
		await expect(page.locator("#active-indicator")).toHaveCount(0);

		// 初始高亮第一个标题
		await expect(active).toHaveText(/1\. Creating a New Post/);
		const initialBounds = await page.evaluate(() => {
			const title = document.querySelector(
				".sidebar-toc .widget-layout__header",
			);
			const wrapper = document.getElementById("toc-inner-wrapper");
			const first = document.querySelector("#toc .m3-blog-toc__item");
			if (!title || !wrapper || !first) return null;
			return {
				titleBottom: title.getBoundingClientRect().bottom,
				wrapperTop: wrapper.getBoundingClientRect().top,
				firstTop: first.getBoundingClientRect().top,
			};
		});
		expect(initialBounds).not.toBeNull();
		expect(initialBounds!.wrapperTop).toBeGreaterThanOrEqual(
			initialBounds!.titleBottom,
		);
		expect(initialBounds!.firstTop).toBeGreaterThanOrEqual(
			initialBounds!.wrapperTop,
		);

		// 滚动到底部 → 高亮最后一个标题
		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight),
		);
		await expect(active).toHaveText(/6\. Next Steps & Customization/);

		// 点击目录项 → 锚点定位 + 高亮切回
		await page.click('#toc a[href="#1-creating-a-new-post"]');
		await expect(page).toHaveURL(/#1-creating-a-new-post/);
		await expect(active).toHaveText(/1\. Creating a New Post/);
	});

	test("keeps a long TOC inside a short viewport with internal smooth scroll", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1600, height: 500 });
		await page.goto("/posts/expressive-code/", { waitUntil: "networkidle" });
		await page.waitForFunction(() =>
			document.querySelector("#toc .m3-blog-toc__item--active"),
		);

		const wrapper = page.locator("#toc");
		const items = page.locator("#toc .m3-blog-toc__item");
		expect(await items.count()).toBeGreaterThan(5);

		// 目录容器形成内部滚动区
		await expect
			.poll(async () => {
				const size = await wrapper.evaluate((element) => ({
					clientHeight: element.clientHeight,
					scrollHeight: element.scrollHeight,
				}));
				return size.scrollHeight > size.clientHeight && size.clientHeight > 0;
			})
			.toBe(true);

		// 页面滚动到底部时，TOC 随 sticky 保持在视口内，且最后一项流动滚动到可视区域中
		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight),
		);
		const cardBottom = await page
			.locator(".sidebar-toc")
			.evaluate((element) => element.getBoundingClientRect().bottom);
		expect(cardBottom).toBeLessThanOrEqual(510);

		const last = items.last();
		await expect
			.poll(async () => {
				const [wrapperBox, lastBox] = await Promise.all([
					wrapper.boundingBox(),
					last.boundingBox(),
				]);
				if (!wrapperBox || !lastBox) return false;
				return (
					lastBox.y + lastBox.height <= wrapperBox.y + wrapperBox.height + 8
				);
			})
			.toBe(true);

		// 点击首末项正常切换高亮与定位
		await items.first().click();
		await expect(items.first()).toHaveClass(/m3-blog-toc__item--active/);
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						document.getElementById("expressive-code")?.getBoundingClientRect()
							.top,
				),
			)
			.toBe(80);

		await items.last().click();
		await expect(items.last()).toHaveClass(/m3-blog-toc__item--active/);
	});
});
