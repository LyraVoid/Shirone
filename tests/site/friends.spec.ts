import { expect, test } from "@playwright/test";

/**
 * 友链页功能锁定（pages/friends.astro -> organisms/FriendSection.svelte，client:visible）。
 * 视觉约束对齐站点设计语言：PageHeader 页内大标题（装饰图标）、胶囊搜索条、
 * 官方 Chips 筛选原子、PostCard 风格卡片（hover 箭头 + #tag 弱文本标签）、
 * 筛选状态 URL 同步（?q= / ?tag=）。
 * 数据来自 src/data/friends.ts（getFriendsList 稳定顺序），断言基于默认数据集；
 * 站点默认语言为 en（siteConfig.lang），文案断言用英文。
 */

const FRIEND_COUNT = 3;

test.describe("友链页", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/friends/");
		await expect(page.locator(".friend-card")).toHaveCount(FRIEND_COUNT);
	});

	test("渲染友链卡片（整卡可点，标题 / 描述 / 标签）", async ({ page }) => {
		const first = page.locator(".friend-card").first();
		await expect(first).toHaveAttribute("href", "https://mizuki.mysqil.com");
		await expect(first).toHaveAttribute("target", "_blank");
		await expect(first).toContainText("Mizuki");
		await expect(first).toContainText(
			"Another Fuwari-based blog theme with docs",
		);
		await expect(first.locator(".friend-card__tag").first()).toHaveText(
			"#Blog",
		);
	});

	test("使用站点统一的友链视觉结构", async ({ page }) => {
		// PageHeader 封装的大标题（带装饰图标）
		await expect(page.locator(".page-header")).toHaveCount(1);
		await expect(page.locator(".page-header__title")).toHaveText("Friends");
		await expect(page.locator(".page-header__icon svg")).toHaveCount(1);
		// PostCard 式箭头（chevron，hover 右滑）
		await expect(page.locator(".friend-card__arrow")).toHaveCount(FRIEND_COUNT);
		// 官方 Chips 原子（filter 形态）承担标签筛选
		await expect(
			page.locator(".friend-section__chips .m3-chip--filter"),
		).toHaveCount(4);
		// 换链说明为 PageHeader 副标题
		await expect(page.locator(".page-header__subtitle")).toBeVisible();
		await expect(page.locator(".page-header__subtitle")).toContainText(
			"Link exchange",
		);
	});

	test("筛选状态同步到 URL（?q= / ?tag=）", async ({ page }) => {
		await page.locator(".friend-section__search input").fill("Mizuki");
		await expect(page).toHaveURL(/[?&]q=Mizuki/);
		await page.getByRole("button", { name: "Blog", exact: true }).click();
		await expect(page).toHaveURL(/[?&]tag=Blog/);
		await page.locator(".friend-section__search input").fill("");
		await expect(page).toHaveURL(/[?&]tag=Blog/);
	});

	test("单选标签筛选（再点取消恢复全部，aria-pressed 同步）", async ({
		page,
	}) => {
		const blogFilter = page.getByRole("button", { name: "Blog", exact: true });
		await blogFilter.click();
		await expect(blogFilter).toHaveAttribute("aria-pressed", "true");
		await expect(page.locator(".friend-card")).toHaveCount(1);
		await expect(page.getByText("Mizuki", { exact: true })).toBeVisible();
		await blogFilter.click();
		await expect(page.locator(".friend-card")).toHaveCount(FRIEND_COUNT);
		await expect(blogFilter).toHaveAttribute("aria-pressed", "false");
	});

	test("搜索过滤 + 空态", async ({ page }) => {
		await page.locator(".friend-section__search input").fill("Astro");
		await expect(page.locator(".friend-card")).toHaveCount(1);
		await page.locator(".friend-section__search input").fill("no such site");
		await expect(page.locator(".friend-section__empty")).toBeVisible();
	});
});

test.describe("友链页 Swup 导航", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test("重复进入后保持组件样式并立即筛选", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		for (let visit = 0; visit < 3; visit++) {
			await page.locator('#top-row a[href="/friends/"]').click();
			await expect(page).toHaveURL(/\/friends\/$/);
			const list = page.locator(".friend-section__list");
			await expect(page.locator(".friend-card")).toHaveCount(FRIEND_COUNT);
			await expect(list).toHaveCSS("display", "grid");
			await expect(list).toHaveCSS("gap", "16px");
			await expect(list).toHaveCSS(
				"grid-template-columns",
				/\d+(\.\d+)?px \d+(\.\d+)?px/,
			);

			const blogFilter = page.getByRole("button", {
				name: "Blog",
				exact: true,
			});
			await blogFilter.click();
			await expect(page.locator(".friend-card")).toHaveCount(1);
			await expect(page.locator(".friend-section__loading")).toHaveCount(0);

			await page.locator('#top-row a[data-nav-key="home"]').click();
			await expect(page).toHaveURL(/\/$/);
		}
	});
});
