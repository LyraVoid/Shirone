import { expect, test } from "@playwright/test";

/**
 * 系列（series）站点契约：文章内系列块 + 系列索引/详情页的排序与状态。
 * 同时锁定视觉契约——文章内系列块与 ArticleDiscovery 同语言（分节、无容器背景），
 * 防止退回「卡片套卡片」（DESIGN.md: Don't create nested cards）。
 */
const POST = "/posts/markdown-extended/";
const DETAIL = "/series/markdown-syntax-guide/";

async function openSitePage(
	page: import("@playwright/test").Page,
	path: string,
	theme = "light",
) {
	await page.addInitScript(
		(value) => localStorage.setItem("theme", value),
		theme,
	);
	await page.goto(path, { waitUntil: "domcontentloaded" });
	// 主题引擎初始化 + onload-animation 收敛（与 a11y 扫描同一前置条件）
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(
		() =>
			[...document.querySelectorAll(".onload-animation")].every(
				(el) =>
					el.offsetParent === null || getComputedStyle(el).opacity === "1",
			),
		undefined,
		{ timeout: 15_000 },
	);
}

test.describe("文章内系列块", () => {
	for (const theme of ["light", "dark"]) {
		test(`语义、链接与分节语言（${theme}）`, async ({ page }) => {
			await openSitePage(page, POST, theme);
			const card = page.locator("[data-series-card]");
			await expect(card).toHaveCount(1);
			await expect(card).toHaveAttribute(
				"data-series-slug",
				"markdown-syntax-guide",
			);
			await expect(card).toHaveAttribute("data-series-status", "completed");

			// 系列名是二级标题里的链接（与 Continue reading 同级）
			const heading = card.getByRole("heading", { level: 2 });
			await expect(heading).toHaveText("Markdown Syntax Guide");
			await expect(heading.getByRole("link")).toHaveAttribute(
				"href",
				"/series/markdown-syntax-guide/",
			);

			// 篇号 + 说明
			await expect(card).toContainText("Part 2 of 3");
			await expect(card).toContainText("This post is part of the series");

			// 组内上一篇/下一篇：目标与无障碍名称都带文章标题
			const prev = card.locator(".series-card__row--prev");
			const next = card.locator(".series-card__row--next");
			await expect(prev).toHaveAttribute("href", "/posts/markdown/");
			await expect(next).toHaveAttribute(
				"href",
				"/posts/markdown-enhancements/",
			);
			await expect(prev).toHaveAttribute(
				"aria-label",
				"Previous in series: Markdown Example",
			);
			await expect(next).toHaveAttribute(
				"aria-label",
				"Next in series: Shirone Markdown Enhancements",
			);
			await expect(prev).toContainText("Part 1 of 3");
			await expect(next).toContainText("Part 3 of 3");

			// 视觉契约：无容器背景/描边（不是嵌套卡片）
			await expect(card).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
			await expect(card).toHaveCSS("border-top-width", "0px");
		});
	}

	test("首篇只有下一篇，末篇只有上一篇", async ({ page }) => {
		for (const [path, prevCount, nextCount] of [
			["/posts/markdown/", 0, 1],
			["/posts/markdown-enhancements/", 1, 0],
		] as const) {
			await openSitePage(page, path);
			const card = page.locator("[data-series-card]");
			await expect(card.locator(".series-card__row--prev")).toHaveCount(
				prevCount,
			);
			await expect(card.locator(".series-card__row--next")).toHaveCount(
				nextCount,
			);
		}
	});

	test("bottom 位置紧贴正文：先于版权、分享与 Continue reading", async ({
		page,
	}) => {
		await openSitePage(page, POST);

		// 阅读顺序契约：cardPosition 默认 bottom = 正文之后、收尾区块（版权/分享/相关推荐）之前。
		// 不锁具体像素位置，只锁 DOM 顺序——系列导航属于「继续读」，不应被署名/分发/推荐挤到页面末尾。
		const closers: [string, string][] = [
			["license", ".m3-license-card"],
			["share", "[data-article-share]"],
			["discovery", "[data-article-discovery]"],
		];
		const readingOrder = await page.evaluate((pairs) => {
			const card = document.querySelector("[data-series-card]");
			const content = document.querySelector(".markdown-content");
			const follows = (anchor: Element, node: Element) =>
				Boolean(
					anchor.compareDocumentPosition(node) &
						Node.DOCUMENT_POSITION_FOLLOWING,
				);

			let closersBeforeCard: string[] = [];
			if (card) {
				closersBeforeCard = pairs
					.map(([name, selector]) => {
						const node = document.querySelector(selector);
						return node && !follows(card, node) ? name : null;
					})
					.filter((entry): entry is string => entry !== null);
			}

			return {
				// 存在性：demo 文章必须同时有正文、系列块与三个收尾区块，
				// 否则顺序断言会退化成空断言（缺哪个在 missingClosers 里点名）
				hasContent: Boolean(content),
				hasCard: Boolean(card),
				missingClosers: pairs
					.filter(([, selector]) => !document.querySelector(selector))
					.map(([name]) => name),
				// 顺序：系列块在正文之后、每个收尾区块之前
				cardAfterContent: Boolean(content && card && follows(content, card)),
				closersBeforeCard,
			};
		}, closers);

		// 存在性断言放在顺序断言之前：收尾区块没渲染时先在这里失败并点名，
		// 不会被误读成「顺序错了」
		expect(readingOrder.hasContent).toBe(true);
		expect(readingOrder.hasCard).toBe(true);
		expect(readingOrder.missingClosers).toEqual([]);

		expect(readingOrder.cardAfterContent).toBe(true);
		expect(readingOrder.closersBeforeCard).toEqual([]);
	});
});

test("系列详情页按 seriesOrder 排序并标注篇号", async ({ page }) => {
	await openSitePage(page, DETAIL);
	await expect(page.locator(".series-detail__title")).toHaveText([
		"Markdown Example",
		"Markdown Extended Features",
		"Shirone Markdown Enhancements",
	]);
	await expect(page.locator(".series-detail__index")).toHaveText([
		"01",
		"02",
		"03",
	]);
});

test("系列索引页给出状态、篇数与默认分类", async ({ page }) => {
	await openSitePage(page, "/series/");
	await expect(page.locator(".series-index__title")).toHaveText([
		"Media Embeds",
		"Markdown Syntax Guide",
	]);
	await expect(page.locator(".series-index__status")).toHaveText([
		"Ongoing",
		"Completed",
	]);
	await expect(page.locator(".series-index__card").first()).toContainText(
		"2 posts",
	);
});
