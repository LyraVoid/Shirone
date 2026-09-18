import { expect, test } from "@playwright/test";

const GAME_COUNT = 2;

test.describe("游戏展示页", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/games/");
		await expect(page.locator(".game-card")).toHaveCount(GAME_COUNT);
	});

	test("渲染页面标题、游戏卡片与评分/时长/状态信息", async ({ page }) => {
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"games",
		);
		await expect(page.locator(".page-header__title")).toHaveText("Games");
		await expect(page.locator(".games-section__count")).toHaveText("2 games");

		const minecraft = page.locator('[data-game="minecraft"]');
		await expect(minecraft.locator("h2")).toHaveText("Minecraft");
		await expect(minecraft.locator(".game-card__developer")).toHaveText(
			"Mojang Studios",
		);
		await expect(minecraft.locator('[data-status="playing"]')).toContainText(
			"Playing",
		);
		await expect(minecraft.locator(".game-card__rating")).toContainText("5.0");
		await expect(minecraft.locator(".game-card__hours")).toContainText(
			"420 hrs",
		);
		await expect(minecraft.locator(".game-card__platform")).toContainText("PC");
		await expect(minecraft.locator(".game-card__year")).toHaveText("2011");
		await expect(minecraft.locator(".game-card__tag").first()).toHaveText(
			"Sandbox",
		);
		await expect(minecraft).not.toHaveClass(/game-card--featured/);
		await expect(
			minecraft.getByRole("link", { name: "Store page" }),
		).toHaveAttribute("href", "https://www.minecraft.net/");

		// 精选卡：徽标与横屏封面主视觉
		const nte = page.locator('[data-game="nte-neverness-to-everness"]');
		await expect(nte).toHaveClass(/game-card--featured/);
		await expect(nte.locator(".game-card__featured")).toContainText("Featured");
		await expect(nte.locator(".game-card__cover")).toBeVisible();
	});

	test("直接加载时导航高亮与侧栏页面过滤正确", async ({ page }) => {
		await expect(
			page.locator('a[data-nav-key="games"]').first(),
		).toHaveAttribute("aria-current", "page");
		await expect(
			page.locator('widget-layout[data-id="categories"]'),
		).toBeVisible();
		await expect(page.locator('widget-layout[data-id="tags"]')).toBeVisible();
	});

	test("分类筛选同步剩余游戏与计数（含 LoadingIndicator 过渡）", async ({
		page,
	}) => {
		// 无条目的分类（RPG / Action / Casual）不渲染 chips
		await expect(
			page.getByRole("button", { name: "RPG", exact: true }),
		).toHaveCount(0);

		await page.getByRole("button", { name: "Open World", exact: true }).click();
		await expect(
			page.locator(".games-section__loading .m3-loading--contained"),
		).toBeVisible();
		await expect(page.locator(".game-card")).toHaveCount(1);
		await expect(page.locator(".games-section__count")).toHaveText("1 games");
		await expect(
			page.locator('[data-game="nte-neverness-to-everness"]'),
		).toBeVisible();
		await expect(page.locator('[data-game="minecraft"]')).toHaveCount(0);
		await expect(page.locator(".games-section__loading")).toHaveCount(0);

		// 再次点击已选分类取消筛选，恢复全部
		await page.getByRole("button", { name: "Open World", exact: true }).click();
		await expect(page.locator(".game-card")).toHaveCount(GAME_COUNT);
	});

	test("搜索无结果时展示空状态反馈", async ({ page }) => {
		const searchInput = page.locator(".games-section__search input");
		await searchInput.fill("Unknown9999");
		await expect(page.locator(".game-card")).toHaveCount(0);
		await expect(page.locator(".games-section__empty")).toContainText(
			"No games matched your filters",
		);
	});

	test("实时搜索过滤与清除（URL ?q= 同步）", async ({ page }) => {
		const searchInput = page.locator(".games-section__search input");
		await expect(searchInput).toBeVisible();
		await searchInput.fill("Minecraft");
		await expect(page.locator(".game-card")).toHaveCount(1);
		await expect(page.locator('[data-game="minecraft"]')).toBeVisible();
		await expect(page).toHaveURL(/[?&]q=Minecraft/);

		// 清除搜索恢复全部
		const clearBtn = page.locator(".games-section__search-clear");
		await clearBtn.click();
		await expect(page.locator(".game-card")).toHaveCount(GAME_COUNT);
		await expect(page).not.toHaveURL(/q=/);
	});

	test("URL 参数刷新后恢复筛选状态", async ({ page }) => {
		await page.getByRole("button", { name: "Sandbox", exact: true }).click();
		await expect(page).toHaveURL(/[?&]category=sandbox/);
		await expect(page.locator(".game-card")).toHaveCount(1);
		await expect(page.locator('[data-game="minecraft"]')).toBeVisible();

		// 刷新后恢复同一次筛选
		await page.reload();
		await expect(page.locator(".game-card")).toHaveCount(1);
		await expect(page.locator('[data-game="minecraft"]')).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Sandbox", exact: true }),
		).toHaveAttribute("aria-pressed", "true");
	});
});

test.describe("游戏展示页 Swup 导航", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test("从持久顶栏进入后同步页面、导航与侧栏状态", async ({ page }) => {
		await page.goto("/skills/", { waitUntil: "domcontentloaded" });
		await page.getByRole("button", { name: "More", exact: true }).click();
		await page.locator('a[data-nav-key="games"]').click();

		await expect(page).toHaveURL(/\/games\/$/);
		await expect(page.locator("#swup-container")).toHaveAttribute(
			"data-current-page",
			"games",
		);
		await expect(page.locator(".game-card")).toHaveCount(GAME_COUNT);
		await expect(page.locator('a[data-nav-key="games"]')).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(
			page.locator('widget-layout[data-id="categories"]'),
		).toBeVisible();
		await expect(page.locator('widget-layout[data-id="tags"]')).toBeVisible();
	});
});
