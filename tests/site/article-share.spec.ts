import { expect, test } from "@playwright/test";
import { resolveArticleShareOptions } from "../../src/config/articleConfig";
import I18nKey from "../../src/i18n/i18nKey";
import { en } from "../../src/i18n/languages/en";
import { es } from "../../src/i18n/languages/es";
import { id } from "../../src/i18n/languages/id";
import { ja } from "../../src/i18n/languages/ja";
import { ko } from "../../src/i18n/languages/ko";
import { th } from "../../src/i18n/languages/th";
import { tr } from "../../src/i18n/languages/tr";
import { vi } from "../../src/i18n/languages/vi";
import { zh_CN } from "../../src/i18n/languages/zh_CN";
import { zh_TW } from "../../src/i18n/languages/zh_TW";
import { sanitizeFilename } from "../../src/utils/share-poster";

const translations = [en, es, id, ja, ko, th, tr, vi, zh_CN, zh_TW];

const shareKeys = [
	I18nKey.shareArticle,
	I18nKey.shareArticleDescription,
	I18nKey.generateSharePoster,
	I18nKey.generatingSharePoster,
	I18nKey.sharePosterPreviewAlt,
	I18nKey.downloadSharePoster,
	I18nKey.sharePosterFailed,
	I18nKey.retry,
	I18nKey.copyFailed,
	I18nKey.close,
	I18nKey.scanToRead,
];

test.describe("article share configuration", () => {
	test("returns null when the share switch is disabled", () => {
		const result = resolveArticleShareOptions({
			share: {
				enable: false,
				includeCover: true,
			},
		});
		expect(result).toBeNull();
	});

	test("returns options with includeCover when enabled", () => {
		const result = resolveArticleShareOptions({
			share: {
				enable: true,
				includeCover: true,
			},
		});
		expect(result).toEqual({ includeCover: true });

		const withoutCover = resolveArticleShareOptions({
			share: {
				enable: true,
				includeCover: false,
			},
		});
		expect(withoutCover).toEqual({ includeCover: false });
	});

	test("sanitizes filenames safely", () => {
		expect(sanitizeFilename("Valid Title")).toBe("Valid-Title");
		expect(sanitizeFilename('Article: "Hello" / <World> ?')).toBe(
			"Article-Hello-World",
		);
		expect(sanitizeFilename("   ")).toBe("article-share");
		expect(sanitizeFilename("Special*Chars?|")).toBe("SpecialChars");
	});

	test("ensures all 10 locales have non-empty strings and matching placeholders", () => {
		for (const translation of translations) {
			for (const key of shareKeys) {
				expect(translation[key]).toBeDefined();
				expect(translation[key].trim()).not.toBe("");
			}
			expect(translation[I18nKey.sharePosterPreviewAlt]).toContain("{title}");
		}
	});
});

test.describe("article share page integration", () => {
	test("renders section in correct DOM position", async ({ page }) => {
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		const share = page.locator("[data-article-share]");
		await expect(share).toBeVisible();

		const domOrder = await page.evaluate(() => {
			const container = document.querySelector("#post-container");
			const license = document.querySelector(".license-container");
			const share = document.querySelector("[data-article-share]");
			const discovery = document.querySelector("[data-article-discovery]");

			return {
				insidePost: Boolean(container?.contains(share)),
				afterLicense: Boolean(
					license &&
						share &&
						license.compareDocumentPosition(share) &
							Node.DOCUMENT_POSITION_FOLLOWING,
				),
				beforeDiscovery: Boolean(
					discovery &&
						share &&
						share.compareDocumentPosition(discovery) &
							Node.DOCUMENT_POSITION_FOLLOWING,
				),
			};
		});

		expect(domOrder.insidePost).toBe(true);
		expect(domOrder.afterLicense).toBe(true);
		expect(domOrder.beforeDiscovery).toBe(true);
	});

	test("opens share dialog, generates a content-height poster with cover, and supports close", async ({
		page,
	}) => {
		page.on("pageerror", (err) => console.error("Page error:", err));
		page.on("console", (msg) =>
			console.log("Console:", msg.type(), msg.text()),
		);

		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		await page.waitForTimeout(300);

		const shareButton = page.locator("[data-article-share] .m3-button--filled");
		await shareButton.scrollIntoViewIfNeeded();
		await page.waitForTimeout(500);
		await expect(shareButton).toBeVisible();
		await shareButton.click();

		const dialog = page.locator("dialog.m3-dialog");
		await expect(dialog).toBeVisible();

		// Wait for poster generation
		const previewImg = dialog.locator(".share-poster-preview__img");
		await expect(previewImg).toBeVisible({ timeout: 10000 });

		const dimensions = await previewImg.evaluate((img: HTMLImageElement) => ({
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
		}));
		expect(dimensions.naturalWidth).toBe(1080);
		expect(dimensions.naturalHeight).toBeGreaterThanOrEqual(900);
		expect(dimensions.naturalHeight).toBeLessThan(1300);

		const previewLayout = await dialog.evaluate((element) => {
			const content = element.querySelector<HTMLElement>(".m3-dialog__content");
			const body = element.querySelector<HTMLElement>(".share-dialog-content");
			const preview = element.querySelector<HTMLElement>(
				".share-poster-preview",
			);
			const image = element.querySelector<HTMLImageElement>(
				".share-poster-preview__img",
			);
			if (!content || !body || !preview || !image) {
				throw new Error("Share poster preview is incomplete");
			}
			return {
				contentOverflowY: getComputedStyle(content).overflowY,
				contentOverflows: content.scrollHeight > content.clientHeight + 1,
				bodyAspectRatio: getComputedStyle(body).aspectRatio,
				previewHeight: preview.getBoundingClientRect().height,
				imageHeight: image.getBoundingClientRect().height,
			};
		});
		expect(previewLayout.contentOverflowY).toBe("visible");
		expect(previewLayout.contentOverflows).toBe(false);
		expect(previewLayout.bodyAspectRatio).toBe("auto");
		expect(previewLayout.previewHeight).toBeGreaterThan(
			previewLayout.imageHeight,
		);

		// Download button should be enabled in the 2-column grid
		const downloadBtn = dialog.locator(
			".share-dialog-actions .m3-button--filled",
		);
		await expect(downloadBtn).toBeEnabled();

		// Header close button is present and functional
		const closeBtn = dialog.locator(".m3-dialog__close-btn");
		await expect(closeBtn).toBeVisible();
		await closeBtn.click();
		await expect(dialog).toBeHidden();
	});

	test("uses a compact no-cover layout without a fixed middle gap", async ({
		page,
	}) => {
		await page.goto("/posts/markdown/", { waitUntil: "networkidle" });

		const shareButton = page.locator("[data-article-share] .m3-button--filled");
		await shareButton.scrollIntoViewIfNeeded();
		await shareButton.click();

		const previewImg = page.locator(
			"dialog.m3-dialog .share-poster-preview__img",
		);
		await expect(previewImg).toBeVisible({ timeout: 10000 });

		const dimensions = await previewImg.evaluate((img: HTMLImageElement) => ({
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
		}));
		expect(dimensions.naturalWidth).toBe(1080);
		expect(dimensions.naturalHeight).toBeGreaterThanOrEqual(650);
		expect(dimensions.naturalHeight).toBeLessThan(950);
		expect(dimensions.naturalHeight).toBeLessThan(dimensions.naturalWidth);
	});

	test("regenerates the cached poster after switching to dark mode", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.addInitScript(() => localStorage.setItem("theme", "light"));
		await page.goto("/posts/markdown/", { waitUntil: "networkidle" });
		await expect(page.locator("html")).not.toHaveClass(/dark/);

		const shareButton = page.locator("[data-article-share] .m3-button--filled");
		await shareButton.scrollIntoViewIfNeeded();
		await page.waitForTimeout(500);
		await shareButton.click();
		const previewImg = page.locator(
			"dialog.m3-dialog .share-poster-preview__img",
		);
		await expect(previewImg).toBeVisible({ timeout: 10000 });

		const lightPosterUrl = await previewImg.getAttribute("src");
		await page.locator("dialog.m3-dialog .m3-dialog__close-btn").click();
		await expect(page.locator("dialog.m3-dialog")).toBeHidden();

		await page.locator("#scheme-switch").click();
		await expect(page.locator("html")).toHaveClass(/dark/);
		await shareButton.click();

		await expect
			.poll(() => previewImg.getAttribute("src"), { timeout: 10000 })
			.not.toBe(lightPosterUrl);
		await expect(previewImg).toBeVisible();

		const surfacePixel = await previewImg.evaluate(
			async (img: HTMLImageElement) => {
				await img.decode();
				const canvas = document.createElement("canvas");
				canvas.width = img.naturalWidth;
				canvas.height = img.naturalHeight;
				const context = canvas.getContext("2d");
				if (!context) throw new Error("Unable to sample poster canvas");
				context.drawImage(img, 0, 0);
				return Array.from(
					context.getImageData(16, img.naturalHeight - 16, 1, 1).data,
				);
			},
		);
		expect(surfacePixel[0] + surfacePixel[1] + surfacePixel[2]).toBeLessThan(
			300,
		);
	});

	test("responsive layout on narrow viewport (390x844)", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });

		const share = page.locator("[data-article-share]");
		await expect(share).toBeVisible();

		const overflow = await share.evaluate((el) => ({
			scrollWidth: el.scrollWidth,
			clientWidth: el.clientWidth,
			overflows: el.scrollWidth > el.clientWidth,
		}));
		expect(overflow.overflows).toBe(false);
	});

	test("copies link and shows snackbar feedback", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"], {
			origin: "http://localhost:4321",
		});
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });
		await page.waitForTimeout(300);

		const shareButton = page.locator("[data-article-share] .m3-button--filled");
		await shareButton.scrollIntoViewIfNeeded();
		await page.waitForTimeout(500);
		await shareButton.click();

		const dialog = page.locator("dialog.m3-dialog");
		await expect(dialog).toBeVisible();

		const copyBtn = dialog.locator(
			".m3-button:has-text('Copy link'), .m3-button:has-text('复制链接')",
		);
		await expect(copyBtn).toBeVisible();
		await copyBtn.click();
		await page.waitForTimeout(400);

		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toContain("/posts/guide/");

		const snackbar = page.locator(".m3-snackbar");
		await expect(snackbar).toHaveClass(/visible/);
	});

	test("handles post navigation via Swup cleanly", async ({ page }) => {
		await page.goto("/posts/guide/", { waitUntil: "networkidle" });

		const firstDiscoveryLink = page
			.locator("[data-article-discovery] .article-discovery-item__link")
			.first();
		const targetHref = await firstDiscoveryLink.getAttribute("href");
		expect(targetHref).toBeTruthy();

		await firstDiscoveryLink.click();
		await page.waitForTimeout(600);

		const share = page.locator("[data-article-share]");
		await expect(share).toBeVisible();
	});

	test("copies the current post URL after Swup navigation", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"], {
			origin: "http://localhost:4321",
		});
		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate(() => window.swup?.navigate("/posts/guide/"));
		await expect(page).toHaveURL(/\/posts\/guide\/?$/);
		await expect(page.locator("#copy-post-link")).toBeVisible();

		await page.locator("#copy-post-link").click();
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toContain("/posts/");
		expect(clipboard).toBe(await page.evaluate(() => window.location.href));
	});
});
