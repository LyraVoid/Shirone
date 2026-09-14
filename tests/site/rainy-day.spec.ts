import { expect, test } from "@playwright/test";
import { resolveRainyDayOptions } from "../../src/config/rainyDayConfig.ts";
import I18nKey from "../../src/i18n/i18nKey.ts";
import { i18n } from "../../src/i18n/translation.ts";

/**
 * 雨滴窗玻璃特效（Banner 上的 WebGL 雨滴）
 *
 * 该特性是重量级可选特性，本仓库默认开启（rainyDayConfig.enable: true）：
 * - 关闭时（enable: false）只断言「零足迹」（无图层、无载体属性、无 CORS 属性）；
 * - 开启时跑渲染、交互与 HiDPI 用例；两种状态各自 test.skip 守卫，
 *   保证任一种配置下套件都是绿的（见 docs/on-demand-loading.md §4.3）。
 */
const rainyDayEnabled = resolveRainyDayOptions().enable;

const LAYER = "[data-rainy-day-layer]";

test.describe("Rainy window effect — 关闭时零足迹", () => {
	test.skip(rainyDayEnabled, "雨滴特效已开启，零足迹用例不适用");

	test("首页不输出雨层，也不输出配置载体属性", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator(LAYER)).toHaveCount(0);
		await expect(page.locator("#config-carrier")).not.toHaveAttribute(
			"data-rainy-day-enabled",
		);
		await expect(page.locator(".banner-stage__media canvas")).toHaveCount(0);
		// 关闭态不应输出该属性
		expect(
			await page
				.locator(".banner-stage__image")
				.first()
				.getAttribute("crossorigin"),
		).toBeNull();
	});
});

test.describe("Rainy window effect — 开启后", () => {
	test.skip(
		!rainyDayEnabled,
		"雨滴特效未启用（rainyDayConfig.enable: false），启用后运行 UI 用例",
	);

	test("雨层挂在横幅媒体层内且不拦截交互", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const layer = page.locator(LAYER);
		await expect(layer).toHaveCount(1);
		await expect(layer).toHaveAttribute("aria-hidden", "true");
		await expect(layer).toHaveCSS("pointer-events", "none");
		await expect(layer).toHaveCSS("position", "absolute");

		// 归属：必须是 BannerStage 的媒体层子节点（遮罩/文案/水波纹都在它之后）
		const insideMedia = await layer.evaluate((el) =>
			Boolean(el.closest(".banner-stage__media")),
		);
		expect(insideMedia).toBe(true);

		// 懒挂载：等 load + 空闲后才会真正创建 WebGL 实例
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});
		await expect(layer.locator("canvas")).toHaveCount(1);
	});

	test("Swup 站内导航后雨层仍在（持久壳未重建）", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		const layer = page.locator(LAYER);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate(() => window.swup?.navigate("/about/"));
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"about",
		);

		await expect(layer).toHaveCount(1);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true");
	});

	test("系统减少动效时不渲染雨滴", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "networkidle" });
		// 图层容器仍在（SSR 输出），但不应创建 WebGL 实例
		await page.waitForTimeout(3500);
		await expect(page.locator(LAYER)).not.toHaveAttribute(
			"data-rainy-day-active",
			"true",
		);
	});

	test("运行中切换到系统「减少动效」会即时停用", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		const layer = page.locator(LAYER);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});

		// 挂载后切换也必须即时生效
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(layer).not.toHaveAttribute("data-rainy-day-active", "true");
	});

	test("显示设置里的开关能即时挂载与卸载", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		const layer = page.locator(LAYER);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});

		await page.locator("#display-settings-switch").click();
		// 按无障碍名称定位：位置选择器会点到它后面的「减少动效」开关
		const toggle = page
			.locator("#display-setting")
			.getByRole("checkbox", { name: i18n(I18nKey.rainyDay) });
		await toggle.click({ force: true });

		await expect(layer).not.toHaveAttribute("data-rainy-day-active", "true");
		const stored = await page.evaluate(() =>
			window.localStorage.getItem("rainy-day-enabled"),
		);
		expect(stored).toBe("false");

		// 再打开：恢复挂载
		await toggle.click({ force: true });
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});
	});
});

/**
 * HiDPI / 4K 回归：修复前 `canvas.width / clientWidth` 等于 devicePixelRatio，修复后恒为 1
 */
test.describe("Rainy window effect — 高分屏（dpr = 2）", () => {
	test.use({ deviceScaleFactor: 2 });
	test.skip(!rainyDayEnabled, "雨滴特效未启用（rainyDayConfig.enable: false）");

	test("画布绘制缓冲与 CSS 像素一致，背景不错位", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		const layer = page.locator(LAYER);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});

		const ratio = await layer
			.locator("canvas")
			.evaluate(
				(canvas) => (canvas as HTMLCanvasElement).width / canvas.clientWidth,
			);
		expect(ratio).toBe(1);
	});
});
