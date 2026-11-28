import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Markdown 图片画廊（:::grid）端到端测试 — 基于 image-grid-demo 示例文章
 * - 验证网格轨道 / 宽高比 / 填充方式由 M3E 令牌与 CSS 变量驱动；
 * - 验证响应式降级（768px → 2 列，480px → 1 列，columns=1 保持单列）；
 * - 验证每个网格拥有独立 Fancybox 分组，不并入其它网格或整篇轮播组；
 * - 验证 Swup 无刷新跳转后画廊重新绑定。
 */
const POST_PATH = "/posts/image-grid-demo/";

async function openPost(page: import("@playwright/test").Page) {
	await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
	// 等待主题初始化与正文渲染完成
	await page.waitForFunction(() =>
		Boolean(
			getComputedStyle(document.documentElement)
				.getPropertyValue("--mc-primary")
				.trim(),
		),
	);
	const grids = page.locator(".custom-md .image-grid");
	// 示例文章共 19 个画廊网格
	await expect(grids).toHaveCount(19);
	return grids;
}

test.describe("Markdown image grid gallery", () => {
	test("renders grids with token-driven tracks, ratios and fills", async ({
		page,
	}) => {
		const grids = await openPost(page);
		const firstTableCode = page.locator(".custom-md table code").first();
		await expect(firstTableCode).toHaveCSS("padding-left", "4px");
		await expect(firstTableCode).toHaveCSS("padding-top", "0px");
		await expect(firstTableCode).toHaveCSS("border-radius", "4px");
		await expect(firstTableCode).toHaveCSS("font-size", "14px");
		const inlineCodeMarkers = await firstTableCode.evaluate((element) => ({
			before: getComputedStyle(element, "::before").content,
			after: getComputedStyle(element, "::after").content,
		}));
		expect(inlineCodeMarkers).toEqual({ before: "none", after: "none" });

		const codeFrames = page.locator(".custom-md .expressive-code .frame");
		const copyButtons = page.locator(
			".custom-md .expressive-code .frame > .copy-btn",
		);
		const codeFrameCount = await codeFrames.count();
		expect(codeFrameCount).toBeGreaterThan(0);
		await expect(copyButtons).toHaveCount(codeFrameCount);
		const firstCodeFrame = codeFrames.first();
		const copyButton = firstCodeFrame.locator(":scope > .copy-btn");
		await expect(copyButton).toHaveCount(1);
		await expect(copyButton).toHaveCSS("position", "absolute");
		await expect(copyButton).toHaveCSS("width", "32px");
		await expect(copyButton).toHaveCSS("height", "32px");
		await expect(copyButton).toHaveCSS("padding", "0px");
		await expect(copyButton).toHaveCSS("border-top-width", "1px");
		await expect(copyButton).toHaveCSS(
			"border-top-color",
			/^(?!rgba\(0, 0, 0, 0\)$).+/,
		);
		const languageBadge = await firstCodeFrame.evaluate((frame) => {
			const languageNode = frame.querySelector("[data-language]");
			if (!languageNode) return null;
			const style = getComputedStyle(languageNode, "::before");
			return {
				borderWidth: style.borderTopWidth,
				borderColor: style.borderTopColor,
				background: style.backgroundColor,
				shadow: style.boxShadow,
			};
		});
		expect(languageBadge).not.toBeNull();
		expect(languageBadge?.borderWidth).toBe("1px");
		expect(languageBadge?.borderColor).not.toBe("rgba(0, 0, 0, 0)");
		expect(languageBadge?.background).not.toBe("rgba(0, 0, 0, 0)");
		expect(languageBadge?.shadow).not.toBe("none");
		const copyButtonOffset = await firstCodeFrame.evaluate((frame) => {
			const button = frame.querySelector<HTMLElement>(":scope > .copy-btn");
			if (!button) return null;
			const frameRect = frame.getBoundingClientRect();
			const buttonRect = button.getBoundingClientRect();
			return {
				top: buttonRect.top - frameRect.top,
				right: frameRect.right - buttonRect.right,
			};
		});
		expect(copyButtonOffset).toEqual({ top: 12, right: 12 });

		// 最小语法网格：默认 3 列 / 16:10 / cover
		const first = grids.nth(0);
		await expect(first).toHaveAttribute("data-columns", "3");
		const firstStyles = await first.evaluate((element) => {
			const computed = getComputedStyle(element);
			return {
				columns: computed.getPropertyValue("--image-grid-columns").trim(),
				aspect: computed.getPropertyValue("--image-grid-aspect-ratio").trim(),
				fit: computed.getPropertyValue("--image-grid-fit").trim(),
				display: computed.display,
				trackCount: computed.gridTemplateColumns.split(" ").length,
			};
		});
		expect(firstStyles.display).toBe("grid");
		expect(firstStyles.columns).toBe("3");
		expect(firstStyles.aspect).toBe("16 / 10");
		expect(firstStyles.fit).toBe("cover");
		expect(firstStyles.trackCount).toBe(3);
		await expect(first.locator(".image-grid__item")).toHaveCount(2);
		// 无 title 时图注回退为 alt 文本
		await expect(first.locator(".image-grid__caption").first()).toHaveText(
			"Minimal syntax result: first image",
		);

		const firstImage = first.locator(".image-grid__link > img").first();
		const firstImageStyles = await firstImage.evaluate((element) => {
			const computed = getComputedStyle(element);
			return {
				objectFit: computed.objectFit,
				borderRadius: computed.borderRadius,
			};
		});
		expect(firstImageStyles.objectFit).toBe("cover");
		expect(firstImageStyles.borderRadius).toBe("0px");
		const geometry = await first.evaluate((element) => {
			const item = element.querySelector<HTMLElement>(".image-grid__item");
			const link = element.querySelector<HTMLElement>(".image-grid__link");
			const img = element.querySelector<HTMLImageElement>(
				".image-grid__link > img",
			);
			const caption = element.querySelector<HTMLElement>(
				".image-grid__caption",
			);
			if (!item || !link || !img || !caption) {
				throw new Error("image grid elements are missing");
			}
			const linkRect = link.getBoundingClientRect();
			const imgRect = img.getBoundingClientRect();
			const itemStyle = getComputedStyle(item);
			const captionStyle = getComputedStyle(caption);
			return {
				linkAspect: linkRect.width / linkRect.height,
				imgFillsWidth: Math.abs(imgRect.width - linkRect.width) <= 1,
				imgFillsHeight: Math.abs(imgRect.height - linkRect.height) <= 1,
				imgAlignedTop: Math.abs(imgRect.top - linkRect.top) <= 1,
				imgAlignedLeft: Math.abs(imgRect.left - linkRect.left) <= 1,
				itemMarginBlock: [itemStyle.marginTop, itemStyle.marginBottom],
				captionMarginTop: captionStyle.marginTop,
				captionFontSize: captionStyle.fontSize,
				captionLineHeight: captionStyle.lineHeight,
			};
		});
		expect(geometry.linkAspect).toBeCloseTo(16 / 10, 1);
		expect(geometry.imgFillsWidth).toBe(true);
		expect(geometry.imgFillsHeight).toBe(true);
		expect(geometry.imgAlignedTop).toBe(true);
		expect(geometry.imgAlignedLeft).toBe(true);
		expect(geometry.itemMarginBlock).toEqual(["0px", "0px"]);
		expect(geometry.captionMarginTop).toBe("8px");
		expect(geometry.captionFontSize).toBe("12px");
		expect(geometry.captionLineHeight).toBe("16px");
		await expect(firstImage).toHaveAttribute("loading", "lazy");
		await expect(firstImage).toHaveAttribute("decoding", "async");

		// 参数网格：columns=3 / 16:9，title 优先作为图注
		const parameterGrid = grids.nth(1);
		const parameterStyles = await parameterGrid.evaluate((element) => {
			const computed = getComputedStyle(element);
			return {
				aspect: computed.getPropertyValue("--image-grid-aspect-ratio").trim(),
				fit: computed.getPropertyValue("--image-grid-fit").trim(),
			};
		});
		expect(parameterStyles.aspect).toBe("16 / 9");
		expect(parameterStyles.fit).toBe("cover");
		await expect(
			parameterGrid.locator(".image-grid__caption").first(),
		).toHaveText("Landscape caption 1");

		// contain 填充透传（Layout and Cropping 的第二个网格，文章内第 5 个）
		const containGrid = grids.nth(4);
		await expect
			.poll(() =>
				containGrid.evaluate((element) =>
					getComputedStyle(element).getPropertyValue("--image-grid-fit").trim(),
				),
			)
			.toBe("contain");
		await expect(
			containGrid.locator(".image-grid__link > img").first(),
		).toHaveCSS("object-fit", "contain");

		// columns=1 网格保持单列
		const singleGrid = grids.filter({ hasText: "Single-column test image" });
		await expect(singleGrid).toHaveAttribute("data-columns", "1");

		expect(
			(await new AxeBuilder({ page }).include(".image-grid").analyze())
				.violations,
		).toEqual([]);
	});

	test("collapses tracks on tablet and narrow viewports", async ({ page }) => {
		await openPost(page);
		const countTracks = (selector: string) =>
			page.evaluate((target) => {
				const element = document.querySelector<HTMLElement>(target);
				if (!element) {
					throw new Error("image grid is missing");
				}
				return getComputedStyle(element).gridTemplateColumns.split(" ").length;
			}, selector);

		await page.setViewportSize({ width: 700, height: 900 });
		await expect
			.poll(() => countTracks(".custom-md .image-grid[data-columns='3']"))
			.toBe(2);
		// columns=1 的网格在平板断点保持单列
		await expect
			.poll(() => countTracks(".custom-md .image-grid[data-columns='1']"))
			.toBe(1);

		await page.setViewportSize({ width: 420, height: 900 });
		await expect
			.poll(() => countTracks(".custom-md .image-grid[data-columns='3']"))
			.toBe(1);
		await expect
			.poll(() => countTracks(".custom-md .image-grid[data-columns='2']"))
			.toBe(1);
	});

	test("opens an isolated lightbox group per grid", async ({ page }) => {
		const grids = await openPost(page);
		// 等待灯箱绑定就绪，避免点击早于异步绑定导致默认跳转
		await expect(page.locator("html")).toHaveAttribute(
			"data-fancybox-ready",
			"true",
			{ timeout: 15_000 },
		);
		const firstLinks = grids.nth(0).locator(".image-grid__link");
		const groupId = await firstLinks.first().getAttribute("data-fancybox");
		// F-17: 分组 id 由图片源位置派生（image-grid-<line>-<column>），确定性且随内容变化
		expect(groupId).toMatch(/^image-grid-[\d-]+$/);
		// 相邻网格分组互不相同
		const secondGroupId = await grids
			.nth(1)
			.locator(".image-grid__link")
			.first()
			.getAttribute("data-fancybox");
		expect(secondGroupId).toMatch(/^image-grid-[\d-]+$/);
		expect(secondGroupId).not.toBe(groupId);

		// 最小语法网格仅 2 张图，轮播范围不超过本网格（Fancybox v6 惰性创建非活动幻灯片，
		// 用计数器与缩略图数量作为分组大小的稳定契约）
		await firstLinks.nth(0).click();
		const dialog = page.locator(".fancybox__container.is-ready");
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		await expect(dialog.locator(".f-counter")).toHaveText("1/2");
		await expect(dialog.locator(".f-thumbs__slide")).toHaveCount(2);
		await expect(
			dialog.locator(".fancybox__slide.is-selected img:not(.is-clone)"),
		).toHaveAttribute("alt", "Minimal syntax result: first image");

		await page.keyboard.press("PageDown");
		await expect(dialog.locator(".f-counter")).toHaveText("2/2");
		await expect(
			dialog.locator(".fancybox__slide.is-selected img:not(.is-clone)"),
		).toHaveAttribute("alt", "Minimal syntax result: second image");

		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);

		// 另一网格从自己的分组第 1 张开始，互不串组
		const landscapeGrid = grids.filter({
			hasText: "16:9 test image one",
		});
		await landscapeGrid.locator(".image-grid__link").nth(0).click();
		const secondDialog = page.locator(".fancybox__container.is-ready");
		await expect(secondDialog).toBeVisible({ timeout: 15_000 });
		await expect(secondDialog.locator(".f-counter")).toHaveText("1/3");
		await expect(secondDialog.locator(".f-thumbs__slide")).toHaveCount(3);
		await expect(
			secondDialog.locator(".fancybox__slide.is-selected img:not(.is-clone)"),
		).toHaveAttribute("alt", "16:9 test image one");
		await page.keyboard.press("Escape");
		await expect(secondDialog).toHaveCount(0);
	});

	test("rebinds galleries after Swup navigation", async ({ page }) => {
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await page.evaluate((path) => window.swup?.navigate(path), POST_PATH);
		await page.waitForURL(`**${POST_PATH}`);

		const grids = page.locator(".custom-md .image-grid");
		await expect(grids).toHaveCount(19);
		await expect(page.locator("html")).toHaveAttribute(
			"data-fancybox-ready",
			"true",
			{ timeout: 15_000 },
		);

		await grids.nth(0).locator(".image-grid__link").nth(0).click();
		const dialog = page.locator(".fancybox__container.is-ready");
		await expect(dialog).toBeVisible({ timeout: 15_000 });
		await expect(dialog.locator(".f-counter")).toHaveText("1/2");
		await expect(dialog.locator(".f-thumbs__slide")).toHaveCount(2);
		await page.keyboard.press("Escape");
		await expect(dialog).toHaveCount(0);
	});
});
