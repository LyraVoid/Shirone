import { expect, test } from "@playwright/test";

const GITHUB_MOCK = {
	description: "A static blog template built with Astro.",
	language: "TypeScript",
	stargazers_count: 4860,
	forks_count: 1243,
	owner: {
		avatar_url:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='12' fill='%236366f1'/></svg>",
	},
	license: { spdx_id: "MIT" },
};

test.describe("MDX Support and M3E Integration", () => {
	test.use({ viewport: { width: 1280, height: 900 } });

	test.beforeEach(async ({ page }) => {
		await page.route("https://api.github.com/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(GITHUB_MOCK),
			}),
		);
	});

	test("direct navigation renders MDX article with metadata, TOC and M3E components", async ({
		page,
	}) => {
		await page.goto("/posts/mdx-showcase/", { waitUntil: "networkidle" });
		await page.waitForTimeout(600);

		// 验证标题与元数据
		const title = page.locator("#post-container [data-pagefind-meta='title']");
		await expect(title).toContainText(
			"MDX Integration and M3E Atomic Components",
		);

		// 验证 M3E 展示型组件（纯 SSR 输出）
		const filledCards = page.locator(".m3-card.m3-card--filled");
		await expect(filledCards.first()).toBeVisible();

		const accentBars = page.locator(".m3-accent-bar");
		await expect(accentBars.first()).toBeVisible();

		const badges = page.locator(".m3-badge");
		await expect(badges.first()).toBeVisible();

		const skeletons = page.locator(".m3-skeleton");
		await expect(skeletons.first()).toBeVisible();

		// 验证 Svelte 5 客户端水合岛（交互型与反馈原子）
		const buttons = page.locator(".m3-button");
		await expect(buttons.first()).toBeVisible();

		const loadingIndicators = page.locator(".m3-loading");
		await expect(loadingIndicators.first()).toBeVisible();

		const chips = page.locator(".m3-chip");
		await expect(chips.first()).toBeVisible();

		const segmentedButtons = page.locator(".m3-segmented");
		await expect(segmentedButtons.first()).toBeVisible();

		const checkboxes = page.locator(".m3-checkbox");
		await expect(checkboxes.first()).toBeVisible();

		const textFields = page.locator(".m3-text-field");
		await expect(textFields.first()).toBeVisible();

		const switchInput = page
			.locator("#post-container .m3-switch__input")
			.first();
		await switchInput.scrollIntoViewIfNeeded();
		await page.waitForTimeout(300);
		await expect(switchInput).toBeVisible();
		await expect(switchInput).toBeChecked();

		// 测试开关交互
		await switchInput.click({ force: true });
		await expect(switchInput).not.toBeChecked();

		// 验证进度指示器
		const progress = page.locator(".m3-progress");
		await expect(progress.first()).toBeVisible();

		// 验证 Markdown 扩展指令（Admonition, KaTeX）
		const admonition = page.locator(".admonition");
		await expect(admonition.first()).toBeVisible();

		const githubCard = page.locator(".card-github").first();
		await expect(githubCard).toHaveCSS("display", "block");
		await expect(githubCard).toHaveCSS("text-decoration-line", "none");

		const katex = page.locator(".katex");
		await expect(katex.first()).toBeVisible();

		const mermaid = page.locator(".markdown-mermaid");
		await expect(mermaid).toHaveAttribute("data-mermaid-state", "ready", {
			timeout: 10_000,
		});
		await expect(mermaid.locator("[data-mermaid-svg]")).toHaveCount(1);
	});

	test("Swup client-side navigation smoothly loads MDX post and hydrates islands", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForTimeout(500);

		// 点击跳转到 MDX 演示文章
		const mdxPostLink = page.locator('a[href*="/posts/mdx-showcase/"]').first();
		await expect(mdxPostLink).toBeVisible();
		await mdxPostLink.click();

		// 等待 Swup 页面过渡完成并进入文章页
		await expect(page).toHaveURL(/\/posts\/mdx-showcase\/?/);
		await page.waitForTimeout(600);

		// 验证文章正文与水合状态
		const switchInput = page
			.locator("#post-container .m3-switch__input")
			.first();
		await switchInput.scrollIntoViewIfNeeded();
		await page.waitForTimeout(400);
		await expect(switchInput).toBeVisible();
		await expect(switchInput).toBeChecked();

		await switchInput.click({ force: true });
		await expect(switchInput).not.toBeChecked();
	});

	test("markdown details stay within the reading column on narrow screens", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/posts/mdx-showcase/", { waitUntil: "networkidle" });
		await page.waitForFunction(
			() =>
				getComputedStyle(document.documentElement)
					.getPropertyValue("--mc-primary")
					.trim().length > 0,
		);

		const markdown = page.locator(".custom-md").first();
		await markdown.evaluate((root) => {
			const fixture = document.createElement("div");
			fixture.dataset.markdownDetailFixture = "true";
			fixture.style.width = "15rem";

			const paragraph = document.createElement("p");
			const link = document.createElement("a");
			link.href = "#responsive-link";
			link.textContent = `https://example.com/${"unbroken-segment-".repeat(12)}`;
			paragraph.append(link);

			const image = document.createElement("img");
			image.alt = "Responsive test fixture";
			image.width = 1200;
			image.height = 400;
			image.src =
				"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='400'/%3E";

			fixture.append(paragraph, image);
			root.prepend(fixture);
		});

		const fixture = page.locator("[data-markdown-detail-fixture]");
		const longLink = fixture.locator("a");
		await expect(longLink).toHaveCSS("display", "inline");
		const linkLineCount = await longLink.evaluate(
			(element) => element.getClientRects().length,
		);
		expect(linkLineCount).toBeGreaterThan(1);

		const image = fixture.locator("img");
		await expect(image).toHaveCSS("display", "block");
		await expect(image).toHaveCSS("max-width", "100%");
		const imageFits = await image.evaluate(
			(element) =>
				element.getBoundingClientRect().width <=
				(element.parentElement?.getBoundingClientRect().width ?? 0),
		);
		expect(imageFits).toBe(true);

		const nestedTocItem = page
			.locator('.m3-blog-toc__item[data-toc-depth="3"]')
			.first();
		await expect(nestedTocItem).toHaveCSS("padding-left", "24px");
		await expect(nestedTocItem).toHaveCSS("margin-left", "0px");

		const tableScroller = page.locator(".markdown-table-scroll").first();
		await expect(tableScroller).toHaveAttribute("tabindex", "0");
		await expect(tableScroller.locator("table")).toHaveCSS("margin-top", "0px");
		await expect(tableScroller.locator("th").first()).toHaveCSS(
			"padding-left",
			"16px",
		);
		await expect(tableScroller.locator("td").first()).toHaveCSS(
			"padding-left",
			"16px",
		);
		const tableScrollsHorizontally = await tableScroller.evaluate(
			(element) => element.scrollWidth > element.clientWidth,
		);
		expect(tableScrollsHorizontally).toBe(true);
		await tableScroller.focus();
		await page.keyboard.press("ArrowRight");
		await expect
			.poll(() => tableScroller.evaluate((element) => element.scrollLeft))
			.toBeGreaterThan(0);

		const formula = page.locator(".katex-display").first();
		await formula.scrollIntoViewIfNeeded();
		const formulaContainer = page
			.locator(".katex-display-container:has(.katex-display)")
			.first();
		await expect(formulaContainer).toBeAttached();
		await expect(formulaContainer).toHaveCSS("max-width", /.+/);
		const formulaFits = await formulaContainer.evaluate(
			(element) =>
				element.getBoundingClientRect().right <=
				(element.parentElement?.getBoundingClientRect().right ?? 0) + 1,
		);
		expect(formulaFits).toBe(true);

		const githubCard = page.locator(".card-github").first();
		await expect(githubCard).not.toHaveClass(/fetch-waiting/);
		await expect(githubCard).toHaveClass(/m3-state-layer/);
		await expect(githubCard).toHaveCSS("border-top-width", "0px");
		const githubCardSurface = await githubCard.evaluate((element) => ({
			background: getComputedStyle(element).backgroundColor,
			token: getComputedStyle(document.documentElement)
				.getPropertyValue("--license-block-bg")
				.trim(),
		}));
		expect(githubCardSurface.background.replaceAll(" ", "")).toBe(
			githubCardSurface.token.replaceAll(" ", ""),
		);
		await expect(githubCard).toHaveCSS("scale", "none");
		await githubCard.hover();
		await expect
			.poll(() =>
				githubCard.evaluate((element) => getComputedStyle(element).boxShadow),
			)
			.not.toBe("none");
	});

	test("RSS feed contains cleaned MDX content without raw exports or JSX leaks", async ({
		page,
	}) => {
		const response = await page.goto("/rss.xml");
		expect(response?.status()).toBe(200);

		const text = await response?.text();
		expect(text).toContain(
			"<title>MDX Integration and M3E Atomic Components</title>",
		);
		// 确保不包含裸露的 export 声明和 import 语句
		expect(text).not.toContain("export const authorInfo");
		expect(text).not.toContain('import Button from "@components');
	});
});
