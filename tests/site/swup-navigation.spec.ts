import { expect, test } from "@playwright/test";

/**
 * Swup 容器契约：containers 声明 ["main", "#toc"]，缺任何一个都会让
 * Swup 判定容器失配并退化为整页刷新。#toc 平时只由目录 widget 渲染，
 * 布局层必须在 widget 关闭时兜底输出一个空容器。
 */

async function waitForThemeInit(page: import("@playwright/test").Page) {
	await page.waitForFunction(() => {
		return getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#");
	});
}

test.describe("swup container contract", () => {
	test("in-site navigation stays soft with the #toc container present", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForThemeInit(page);
		await expect(page.locator("#toc")).toHaveCount(1);
		await page.waitForFunction(() => Boolean(window.swup?.hooks));

		// 全页刷新会重建 window 对象：标记存活 = 导航没有退化为硬导航
		await page.evaluate(() => {
			(
				window as unknown as { __swupSoftNavProbe?: string }
			).__swupSoftNavProbe = "alive";
		});

		await page.evaluate(() =>
			(
				window as unknown as { swup: { navigate: (url: string) => void } }
			).swup.navigate("/archive/"),
		);
		await page.waitForFunction(() => {
			return (
				document.getElementById("swup-container")?.dataset.currentPage ===
				"archive"
			);
		});
		await expect(page.locator("#toc")).toHaveCount(1);
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __swupSoftNavProbe?: string })
						.__swupSoftNavProbe,
			),
		).toBe("alive");

		await page.evaluate(() =>
			(
				window as unknown as { swup: { navigate: (url: string) => void } }
			).swup.navigate("/"),
		);
		await page.waitForFunction(() => {
			return (
				document.getElementById("swup-container")?.dataset.currentPage ===
				"home"
			);
		});
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __swupSoftNavProbe?: string })
						.__swupSoftNavProbe,
			),
		).toBe("alive");
	});

	test("deep direct load carries the container too", async ({ page }) => {
		await page.goto("/archive/", { waitUntil: "domcontentloaded" });
		await waitForThemeInit(page);
		await expect(page.locator("#toc")).toHaveCount(1);
	});

	test("layout provides the container even when the TOC widget is disabled", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForThemeInit(page);
		await expect(page.locator("#toc")).toHaveCount(1);

		// With the TOC widget enabled its hidden wrappers already provide
		// `#toc` on every page, so the layout's fallback container is absent;
		// the fallback carries `data-swup-toc-fallback`, which is the
		// discriminator. Skip in that configuration — run the no-toc content
		// fixture (`CONTENT_DIR=tests/fixtures/content/no-toc pnpm
		// content:sync`) to exercise this path.
		const fallbackActive = await page.evaluate(() =>
			document.querySelector("#toc")?.hasAttribute("data-swup-toc-fallback"),
		);
		test.skip(
			fallbackActive !== true,
			"TOC widget is enabled; its wrappers provide #toc",
		);
		await page.waitForFunction(() => Boolean(window.swup?.hooks));

		await page.evaluate(() => {
			(
				window as unknown as { __swupSoftNavProbe?: string }
			).__swupSoftNavProbe = "alive";
		});

		await page.evaluate(() =>
			(
				window as unknown as { swup: { navigate: (url: string) => void } }
			).swup.navigate("/archive/"),
		);
		await page.waitForFunction(() => {
			return (
				document.getElementById("swup-container")?.dataset.currentPage ===
				"archive"
			);
		});
		expect(
			await page.evaluate(
				() =>
					(window as unknown as { __swupSoftNavProbe?: string })
						.__swupSoftNavProbe,
			),
		).toBe("alive");
	});
});
