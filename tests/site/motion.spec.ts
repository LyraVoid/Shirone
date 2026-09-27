import { expect, test } from "@playwright/test";

/**
 * 动效回归锁定（归档页年份折叠，use:collapse 插件）：
 * - 正常模式：展开/收起播放高度过渡（动画期间为中间值）；
 * - Reduce Motion（系统 + 站点开关）：直接到位、不播动画；
 * - aria-expanded 与内容显隐正确。
 */
test.describe("Site motion", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	async function openArchive(page: import("@playwright/test").Page) {
		await page.goto("/archive/", { waitUntil: "networkidle" });
		await page.waitForTimeout(600);
	}

	async function bodyHeight(
		page: import("@playwright/test").Page,
		index: number,
	) {
		return page.evaluate((i) => {
			const body = document.querySelectorAll<HTMLElement>(
				".m3-blog-archive__body",
			)[i];
			return body
				? Number.parseFloat(getComputedStyle(body).height)
				: Number.NaN;
		}, index);
	}

	test("collapses/expands with a height transition", async ({ page }) => {
		await openArchive(page);

		// 第二个年份默认折叠（0px），点击展开播放动画
		expect(await bodyHeight(page, 1)).toBe(0);
		await page.click(
			".m3-blog-archive__group:nth-child(2) .m3-blog-archive__header",
		);

		// 动画进行中：高度应为 0 与最终值之间的中间值
		await page.waitForTimeout(100);
		const mid = await bodyHeight(page, 1);
		expect(mid).toBeGreaterThan(0);

		// 结束后归位 auto（内容完整高度）
		await page.waitForTimeout(300);
		const expanded = await bodyHeight(page, 1);
		expect(expanded).toBeGreaterThan(mid);
		await expect(
			page.locator(
				".m3-blog-archive__group:nth-child(2) .m3-blog-archive__item",
			),
		).toHaveCount(3);
	});

	test("does not collapse animate on initial render or grouping changes", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			const originalAnimate = HTMLElement.prototype.animate;
			Object.defineProperty(window, "__archiveCollapseAnimations", {
				value: 0,
				writable: true,
			});
			HTMLElement.prototype.animate = function (...args) {
				if (this.classList.contains("m3-blog-archive__body")) {
					(
						window as typeof window & { __archiveCollapseAnimations: number }
					).__archiveCollapseAnimations += 1;
				}
				return originalAnimate.apply(this, args);
			};
		});

		await openArchive(page);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __archiveCollapseAnimations: number })
						.__archiveCollapseAnimations,
			),
		).toBe(0);

		await page
			.getByRole("group", { name: "Group archive by" })
			.getByText("By Category", { exact: true })
			.click();
		await expect(page.locator(".m3-blog-archive__group-title")).toHaveText([
			"Examples",
			"Guides",
		]);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __archiveCollapseAnimations: number })
						.__archiveCollapseAnimations,
			),
		).toBe(0);

		await page
			.locator(".m3-blog-archive__group:nth-child(2) .m3-blog-archive__header")
			.click();
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __archiveCollapseAnimations: number })
						.__archiveCollapseAnimations,
			),
		).toBe(1);
	});

	test("restores manually expanded groups without replaying collapse motion", async ({
		page,
	}) => {
		await page.addInitScript(() => {
			const originalAnimate = HTMLElement.prototype.animate;
			Object.defineProperty(window, "__archiveCollapseAnimations", {
				value: 0,
				writable: true,
			});
			HTMLElement.prototype.animate = function (...args) {
				if (this.classList.contains("m3-blog-archive__body")) {
					(
						window as typeof window & { __archiveCollapseAnimations: number }
					).__archiveCollapseAnimations += 1;
				}
				return originalAnimate.apply(this, args);
			};
		});

		await openArchive(page);
		const secondHeader = page.locator(
			".m3-blog-archive__group:nth-child(2) .m3-blog-archive__header",
		);
		await secondHeader.click();
		await expect(secondHeader).toHaveAttribute("aria-expanded", "true");
		await page.waitForTimeout(300);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __archiveCollapseAnimations: number })
						.__archiveCollapseAnimations,
			),
		).toBe(1);

		await page.reload({ waitUntil: "networkidle" });
		await expect(secondHeader).toHaveAttribute("aria-expanded", "true");
		expect(await bodyHeight(page, 1)).toBeGreaterThan(0);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __archiveCollapseAnimations: number })
						.__archiveCollapseAnimations,
			),
		).toBe(0);
	});

	test("reduced motion lands instantly without transition", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openArchive(page);

		expect(await bodyHeight(page, 1)).toBe(0);
		await page.click(
			".m3-blog-archive__group:nth-child(2) .m3-blog-archive__header",
		);

		// 30ms 内即到位（无过渡中间值）
		await page.waitForTimeout(30);
		const height = await bodyHeight(page, 1);
		expect(height).toBeGreaterThan(0);
		await expect(
			page.locator(
				".m3-blog-archive__group:nth-child(2) .m3-blog-archive__item",
			),
		).toHaveCount(3);
	});

	test("toggles aria-expanded and hides content when collapsed", async ({
		page,
	}) => {
		await openArchive(page);

		const header = page.locator(
			".m3-blog-archive__group:nth-child(2) .m3-blog-archive__header",
		);
		await expect(header).toHaveAttribute("aria-expanded", "false");
		expect(await bodyHeight(page, 1)).toBe(0);

		await header.click();
		await page.waitForTimeout(400);
		await expect(header).toHaveAttribute("aria-expanded", "true");
		expect(await bodyHeight(page, 1)).toBeGreaterThan(0);
	});
});

test.describe("layout shift motion primitive", () => {
	test("animates a target displaced by source resizing", async ({ page }) => {
		await page.goto("/archive/");
		const result = await page.evaluate(async () => {
			const { observeLayoutShifts } = await import("/src/utils/motion.ts");
			const host = document.createElement("div");
			const source = document.createElement("div");
			const target = document.createElement("div");
			source.style.height = "40px";
			target.style.height = "20px";
			host.append(source, target);
			document.body.append(host);
			const beforeLayout = target.offsetTop;
			const beforeVisual = target.getBoundingClientRect().top;
			const stop = observeLayoutShifts(target, source, 1000);
			await new Promise(requestAnimationFrame);
			source.style.height = "180px";
			await new Promise<void>((resolve) => setTimeout(resolve, 50));
			const animation = target.getAnimations()[0];
			const frames =
				animation?.effect instanceof KeyframeEffect
					? animation.effect.getKeyframes()
					: [];
			const afterLayout = target.offsetTop;
			const afterVisual = target.getBoundingClientRect().top;
			stop();
			host.remove();
			return {
				layoutDelta: afterLayout - beforeLayout,
				visualDelta: afterVisual - beforeVisual,
				animationCount: animation ? 1 : 0,
				fromTransform: String(frames[0]?.transform),
			};
		});

		expect(result.layoutDelta).toBeGreaterThan(100);
		expect(result.visualDelta).toBeLessThan(20);
		expect(result.animationCount).toBe(1);
		expect(result.fromTransform).toContain("translate(0px, -140px)");
	});

	test("snaps without animation when motion is reduced", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/archive/");
		const animationCount = await page.evaluate(async () => {
			const { observeLayoutShifts } = await import("/src/utils/motion.ts");
			const host = document.createElement("div");
			const source = document.createElement("div");
			const target = document.createElement("div");
			source.style.height = "40px";
			target.style.height = "20px";
			host.append(source, target);
			document.body.append(host);
			const stop = observeLayoutShifts(target, source, 1000);
			await new Promise(requestAnimationFrame);
			source.style.height = "180px";
			await new Promise<void>((resolve) => setTimeout(resolve, 50));
			const count = target.getAnimations().length;
			stop();
			host.remove();
			return count;
		});

		expect(animationCount).toBe(0);
	});
});

/**
 * 侧栏 pages 过滤（swup 导航同步 + 集合变更原语）：
 * 站点配置 stats 仅 home/archive 可见，首页↔文章页导航会触发退场/入场。
 * swup 触发时机不可控，动画中间值不做采样断言（避免 flake），
 * 锁定终态：hidden 切换正确、留存 widget 可见、双向导航可恢复。
 */
test.describe("sidebar pages filter (swup sync)", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	async function clickLink(
		page: import("@playwright/test").Page,
		selector: string,
	) {
		await page.evaluate((sel) => {
			(document.querySelector(sel) as HTMLAnchorElement | null)?.click();
		}, selector);
	}

	async function statsWrapperHidden(page: import("@playwright/test").Page) {
		return page.evaluate(() => {
			const wrapper = document
				.querySelector('widget-layout[data-id="site-stats"]')
				?.closest("[data-sidebar-pages]");
			return !wrapper || wrapper.classList.contains("hidden");
		});
	}

	async function statsTagIconHasInlinePath(
		page: import("@playwright/test").Page,
	) {
		return page.evaluate(() => {
			const row = [...document.querySelectorAll(".m3-site-stats__row")].find(
				(element) => element.textContent?.includes("Tags"),
			);
			const icon = row?.querySelector(
				'svg[data-icon="material-symbols:tag-rounded"]',
			);
			return !!icon?.querySelector("path");
		});
	}

	function waitStatsHidden(
		page: import("@playwright/test").Page,
		hidden: boolean,
	) {
		return page.waitForFunction(
			(expectHidden) => {
				const wrapper = document
					.querySelector('widget-layout[data-id="site-stats"]')
					?.closest("[data-sidebar-pages]");
				if (!wrapper) return false;
				return wrapper.classList.contains("hidden") === expectHidden;
			},
			hidden,
			{ timeout: 5000 },
		);
	}

	function waitCurrentPage(
		page: import("@playwright/test").Page,
		value: string,
	) {
		return page.waitForFunction(
			(expected) =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				expected,
			value,
			{ timeout: 5000 },
		);
	}

	test("stats hides on post page and returns on home (animated path)", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "networkidle" });
		expect(await statsWrapperHidden(page)).toBe(false);
		for (const selector of ["#sidebar", "#sidebar-secondary"]) {
			const sidebar = page.locator(selector);
			await expect(sidebar).not.toHaveCSS("overflow-y", "auto");
		}
		// swup 点击文章卡链接 → 文章页：退场淡出（150ms）后 hidden
		await clickLink(page, '#swup-container a[href^="/posts/"]');
		await waitCurrentPage(page, "post");
		await waitStatsHidden(page, true);
		await expect(page.locator("#toc")).toHaveCSS("overflow-y", "auto");

		// 留存 widget（tags）保持可见
		const tagsVisible = await page.evaluate(() => {
			const wrapper = document
				.querySelector('widget-layout[data-id="tags"]')
				?.closest("[data-sidebar-pages]");
			return !!wrapper && !wrapper.classList.contains("hidden");
		});
		expect(tagsVisible).toBe(true);

		// swup 点回首页：stats 入场恢复，且图标仍为自包含 SVG
		await clickLink(page, '#top-row a[href="/"]');
		await waitCurrentPage(page, "home");
		await waitStatsHidden(page, false);
		expect(await statsTagIconHasInlinePath(page)).toBe(true);
	});

	test("stats tag icon remains self-contained after post to archive navigation", async ({
		page,
	}) => {
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		expect(await statsWrapperHidden(page)).toBe(true);

		await clickLink(page, '#top-row a[href="/archive/"]');
		await waitCurrentPage(page, "archive");
		await waitStatsHidden(page, false);
		expect(await statsTagIconHasInlinePath(page)).toBe(true);
	});

	test("rapid navigation keeps only the final page widgets visible", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "networkidle" });
		expect(await statsWrapperHidden(page)).toBe(false);

		await clickLink(page, '#swup-container a[href^="/posts/"]');
		await waitCurrentPage(page, "post");
		await page.waitForFunction(() => {
			const wrapper = document
				.querySelector('widget-layout[data-id="site-stats"]')
				?.closest<HTMLElement>("[data-sidebar-pages]");
			return wrapper
				?.getAnimations()
				.some((animation) => animation.playState === "running");
		});

		await clickLink(page, '#top-row a[href="/archive/"]');
		await waitCurrentPage(page, "archive");
		await waitStatsHidden(page, false);
		await page.waitForFunction(() =>
			[...document.querySelectorAll<HTMLElement>("[data-sidebar-pages]")].every(
				(widget) =>
					widget
						.getAnimations()
						.every((animation) => animation.playState !== "running"),
			),
		);

		expect(await statsWrapperHidden(page)).toBe(false);
		expect(await statsTagIconHasInlinePath(page)).toBe(true);
	});

	test("reduced motion lands instantly without fade", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "networkidle" });

		await clickLink(page, '#swup-container a[href^="/posts/"]');
		await waitCurrentPage(page, "post");
		// 瞬切路径：无 150ms 淡出等待，hidden 立即出现
		await waitStatsHidden(page, true);
	});
});
