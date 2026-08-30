import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { contextMenuConfig } from "../../src/config/contextMenuConfig";
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

const translations = [en, es, id, ja, ko, th, tr, vi, zh_CN, zh_TW];
const contextMenuUiEnabled = contextMenuConfig.enable;
const postPath = "/posts/guide/";

async function waitForTheme(page: import("@playwright/test").Page) {
	await page.waitForFunction(() =>
		document.documentElement.style
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
}

async function selectFirstParagraph(page: import("@playwright/test").Page) {
	const paragraph = page.locator(".custom-md p").first();
	await paragraph.scrollIntoViewIfNeeded();
	const selectedText = await paragraph.evaluate((element) => {
		const range = document.createRange();
		range.selectNodeContents(element);
		const selection = window.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		return selection?.toString().trim() ?? "";
	});
	return { paragraph, selectedText };
}

test("registers context-menu copy in every locale", () => {
	for (const translation of translations) {
		expect(translation[I18nKey.copySelection].trim()).not.toBe("");
		expect(translation[I18nKey.sharePageLink].trim()).not.toBe("");
	}
});

test("leaves no custom menu footprint when disabled", async ({ page }) => {
	test.skip(
		contextMenuUiEnabled,
		"This assertion covers the default disabled mode",
	);
	await page.goto(postPath, { waitUntil: "domcontentloaded" });
	await waitForTheme(page);
	await page.locator(".custom-md p").first().click({ button: "right" });
	await expect(page.locator("[data-context-menu]")).toHaveCount(0);
});

test.describe("desktop context menu", () => {
	test.skip(
		!contextMenuUiEnabled,
		"右键菜单默认关闭，请在 src/config/contextMenuConfig.ts 开启后运行 UI 测试",
	);

	test.beforeEach(async ({ page }) => {
		await page.goto(postPath, { waitUntil: "domcontentloaded" });
		await waitForTheme(page);
	});

	test("copies selected text and renders only flat first-version actions", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"], {
			origin: "http://localhost:4321",
		});
		const { paragraph, selectedText } = await selectFirstParagraph(page);
		expect(selectedText).not.toBe("");

		await paragraph.click({ button: "right" });
		const menu = page.locator("[data-context-menu]");
		await expect(menu).toBeVisible();
		await expect(menu.locator('[role="menu"]')).toHaveCount(1);
		await expect(menu.locator('[aria-haspopup="menu"]')).toHaveCount(0);
		await expect(
			menu.locator("[data-context-menu-action]").first(),
		).toHaveAttribute("data-context-menu-action", "copySelection");
		const accessibility = await new AxeBuilder({ page })
			.include("[data-context-menu]")
			.analyze();
		expect(accessibility.violations).toEqual([]);
		const visual = await menu.evaluate((root) => {
			const container = root.querySelector<HTMLElement>(".context-menu");
			const firstItem = root.querySelector<HTMLElement>(
				"[data-context-menu-action]",
			);
			return {
				containerRadius: container
					? getComputedStyle(container).borderRadius
					: "",
				itemRadius: firstItem ? getComputedStyle(firstItem).borderRadius : "",
				itemOutline: firstItem ? getComputedStyle(firstItem).outlineStyle : "",
			};
		});
		expect(visual.containerRadius).toBe("16px");
		expect(visual.itemRadius).toBe("12px");
		expect(visual.itemOutline).toBe("none");
		await expect(
			menu.locator('[data-context-menu-action="copySelection"]'),
		).toBeVisible();
		await expect(
			menu.locator('[data-context-menu-action="sharePageLink"]'),
		).toBeVisible();
		await expect(
			menu.locator('[data-context-menu-action="sharePageLink"]'),
		).toContainText("Copy link");
		await expect(
			menu.locator('[data-context-menu-action="sharePageLink"] svg'),
		).toBeVisible();
		await expect(
			menu.locator('[data-context-menu-action="copySelection"]'),
		).toBeFocused();
		const scrollBeforeArrow = await page.evaluate(() => window.scrollY);
		await page.keyboard.press("ArrowDown");
		await expect(
			menu.locator('[data-context-menu-action="backToTop"]'),
		).toBeFocused();
		expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeArrow);
		await page.keyboard.press("ArrowUp");
		await expect(
			menu.locator('[data-context-menu-action="copySelection"]'),
		).toBeFocused();
		const actionIds = await menu
			.locator("[data-context-menu-action]")
			.evaluateAll((items) =>
				items.map((item) => item.getAttribute("data-context-menu-action")),
			);
		const allowedActions = new Set<string>(contextMenuConfig.actions);
		expect(actionIds.every((id) => id !== null && allowedActions.has(id))).toBe(
			true,
		);

		await menu.locator('[data-context-menu-action="copySelection"]').click();
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toBe(selectedText);
	});

	test("copies the current page URL like the article link button", async ({
		page,
		context,
	}) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"], {
			origin: "http://localhost:4321",
		});
		await page.addInitScript(() => {
			Object.defineProperty(navigator, "share", {
				configurable: true,
				value: async (data: ShareData) => {
					(window as Window & { sharedPage?: ShareData }).sharedPage = data;
				},
			});
		});
		await page.reload({ waitUntil: "domcontentloaded" });
		await waitForTheme(page);

		await page.locator(".custom-md p").first().click({ button: "right" });
		await page.locator('[data-context-menu-action="sharePageLink"]').click();
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toBe(await page.evaluate(() => window.location.href));
		await expect(page.locator(".m3-snackbar")).toHaveClass(/visible/);
		await expect(page.locator(".m3-snackbar")).toContainText(
			"Copied to clipboard",
		);
		expect(
			await page.evaluate(
				() => (window as Window & { sharedPage?: ShareData }).sharedPage,
			),
		).toBeUndefined();
	});

	test("returns to the top and keeps native editable menus untouched", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.evaluate(() => window.scrollTo(0, 800));
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeGreaterThan(0);

		const paragraph = page.locator(".custom-md p").last();
		await paragraph.scrollIntoViewIfNeeded();
		await paragraph.click({ button: "right" });
		await page.locator('[data-context-menu-action="backToTop"]').click();
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

		await page.locator("#swup-container").evaluate((container) => {
			const textarea = document.createElement("textarea");
			textarea.setAttribute("data-context-menu-test-input", "");
			container.append(textarea);
		});
		await page
			.locator("[data-context-menu-test-input]")
			.click({ button: "right" });
		await expect(page.locator("[data-context-menu]")).toHaveCount(0);
	});
});
