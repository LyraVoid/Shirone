import { expect, test } from "@playwright/test";
import { resolveRainyDayOptions } from "../../src/config/rainyDayConfig.ts";
import I18nKey from "../../src/i18n/i18nKey.ts";
import { i18n } from "../../src/i18n/translation.ts";

/**
 * 全页雨幕（原雨滴窗玻璃特效，Banner 上的 WebGL 雨滴）
 *
 * 该特性是重量级可选特性，本仓库默认开启（rainyDayConfig.enable: true）：
 * - 关闭时（enable: false）只断言「零足迹」（无图层、无载体属性、无 CORS 属性）；
 * - 开启时跑渲染、层级、交互与 HiDPI 用例；两种状态各自 test.skip 守卫，
 *   保证任一种配置下套件都是绿的（见 docs/on-demand-loading.md §4.3）。
 */
const rainyDayEnabled = resolveRainyDayOptions().enable;

const LAYER = "[data-rainy-day-layer]";

test.describe("Rainy window layer — 关闭时零足迹", () => {
	test.skip(rainyDayEnabled, "全页雨幕已开启，零足迹用例不适用");

	test("首页不输出雨层，也不输出配置载体属性", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(page.locator(LAYER)).toHaveCount(0);
		await expect(page.locator("[data-rainy-body-rain]")).toHaveCount(0);
		await expect(page.locator("#config-carrier")).not.toHaveAttribute(
			"data-rainy-day-enabled",
		);
		await expect(page.locator("canvas")).toHaveCount(0);
		// 关闭态不应输出该属性
		expect(
			await page
				.locator(".banner-stage__image")
				.first()
				.getAttribute("crossorigin"),
		).toBeNull();
	});
});

test.describe("Rainy window layer — 开启后", () => {
	test.skip(
		!rainyDayEnabled,
		"全页雨幕未启用（rainyDayConfig.enable: false），启用后运行 UI 用例",
	);

	test("全页雨层：固定覆盖视口、位于内容之下且不拦截交互", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });

		const layer = page.locator(LAYER);
		await expect(layer).toHaveCount(1);
		await expect(layer).toHaveAttribute("aria-hidden", "true");
		await expect(layer).toHaveCSS("pointer-events", "none");
		await expect(layer).toHaveCSS("position", "fixed");

		// 归属：页面级环境层，挂在 Swup 容器之外的持久壳（Layout）里
		const outsideSwup = await layer.evaluate(
			(el) => !el.closest("#swup-container"),
		);
		expect(outsideSwup).toBe(true);

		// 几何：fixed + inset:0 → 铺满整个视口
		const box = await layer.boundingBox();
		const viewport = await page.evaluate(() => ({
			width: document.documentElement.clientWidth,
			height: document.documentElement.clientHeight,
		}));
		expect(box).not.toBeNull();
		expect(Math.abs((box?.width ?? 0) - viewport.width)).toBeLessThanOrEqual(2);
		expect(Math.abs((box?.height ?? 0) - viewport.height)).toBeLessThanOrEqual(
			2,
		);

		// 层级契约（静态部分）：雨层固定在 0
		const zIndexOf = (selector: string) =>
			page
				.locator(selector)
				.evaluate((el) => Number(getComputedStyle(el).zIndex), selector);
		const layerZ = await layer.evaluate((el) =>
			Number(getComputedStyle(el).zIndex),
		);
		expect(layerZ).toBe(0);

		// 绘制顺序：同层（z-index 0）按树序，雨层必须晚于横幅子树 → 盖住横幅图片
		const afterBanner = await layer.evaluate((el) => {
			const banner = document.getElementById("banner-wrapper");
			if (!banner) return false;
			const relation = banner.compareDocumentPosition(el);
			return Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING);
		});
		expect(afterBanner).toBe(true);

		// 懒挂载：等 load + 空闲后才会真正创建 WebGL 实例
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});
		await expect(layer.locator("canvas")).toHaveCount(1);

		// 激活后的层级契约：雨层(0) < 背景纹理(1) < 主内容(z-30) < 顶栏(z-50)。
		// 雨层不透明，纹理必须被抬到它之上才可见（见 styles/textures.css）
		await expect(page.locator("html")).toHaveAttribute(
			"data-rainy-active",
			"true",
		);
		const textureZ = await zIndexOf("#m3e-texture-canvas");
		expect(textureZ).toBeGreaterThan(layerZ);
		expect(await zIndexOf("#main-layout")).toBeGreaterThan(textureZ);
		expect(await zIndexOf("#top-row")).toBeGreaterThan(textureZ);

		// 过场＋纹理层保护：纹理必须留在雨层之上才能保持原样强度；雨层淡入到 1，
		// 同时横幅图片（.banner-stage__media）淡出，让雨层在同一位置接替壁纸
		const media = page.locator(".banner-stage__media");
		await expect
			.poll(() => layer.evaluate((el) => Number(getComputedStyle(el).opacity)))
			.toBeCloseTo(1, 2);
		await expect
			.poll(() => media.evaluate((el) => Number(getComputedStyle(el).opacity)))
			.toBeCloseTo(0, 2);
		// 竖向蒙版把 banner 带设为不透明，正文区落到配置的雨雾浓度
		const maskImage = await layer.evaluate(
			(el) => getComputedStyle(el).maskImage,
		);
		expect(maskImage).toContain("linear-gradient");

		// 正文区雨丝：随雨幕一起淡入，并被蒙版挡在 banner 带之外
		const bodyRain = page.locator("[data-rainy-body-rain]");
		await expect(bodyRain).toHaveCount(1);
		await expect
			.poll(() => bodyRain.evaluate((el) => Number(getComputedStyle(el).opacity)))
			.toBeCloseTo(1, 2);
		expect(
			await bodyRain.evaluate((el) => getComputedStyle(el).maskImage),
		).toContain("linear-gradient");
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
		// 卸载后：激活标记移除、雨层回到透明，背景纹理回到基线层级（关闭态零变化）
		await expect(page.locator("html")).not.toHaveAttribute(
			"data-rainy-active",
			"true",
		);
		// 卸载会走 ~600ms 淡出，用 poll 等它归零；横幅图片同时淡回来，雨丝同步骤隐
		await expect
			.poll(() => layer.evaluate((el) => Number(getComputedStyle(el).opacity)))
			.toBe(0);
		await expect
			.poll(() =>
				page
					.locator("[data-rainy-body-rain]")
					.evaluate((el) => Number(getComputedStyle(el).opacity)),
			)
			.toBe(0);
		await expect
			.poll(() =>
				page
					.locator(".banner-stage__media")
					.evaluate((el) => Number(getComputedStyle(el).opacity)),
			)
			.toBeCloseTo(1, 2);
		expect(
			await page
				.locator("#m3e-texture-canvas")
				.evaluate((el) => Number(getComputedStyle(el).zIndex)),
		).toBe(-20);
		const stored = await page.evaluate(() =>
			window.localStorage.getItem("rainy-day-enabled"),
		);
		expect(stored).toBe("false");

		// 再打开：恢复挂载，纹理重新抬到雨层之上，雨层淡入、横幅图片再次淡出
		await toggle.click({ force: true });
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});
		expect(
			await page
				.locator("#m3e-texture-canvas")
				.evaluate((el) => Number(getComputedStyle(el).zIndex)),
		).toBeGreaterThan(0);
		await expect
			.poll(() => layer.evaluate((el) => Number(getComputedStyle(el).opacity)))
			.toBeCloseTo(1, 2);
		await expect
			.poll(() =>
				page
					.locator(".banner-stage__media")
					.evaluate((el) => Number(getComputedStyle(el).opacity)),
			)
			.toBeCloseTo(0, 2);
	});

	test("切到后台标签页暂停渲染循环，回到前台恢复", async ({ page }) => {
		await page.goto("/", { waitUntil: "networkidle" });
		const layer = page.locator(LAYER);
		await expect(layer).toHaveAttribute("data-rainy-day-active", "true", {
			timeout: 15000,
		});

		// 浏览器不提供直接切后台的 API：覆写 document.hidden 后派发 visibilitychange。
		// 组件在该事件里调用库的 pause()（内部 cancelAnimationFrame），并把状态写到属性上。
		await page.evaluate(() => {
			Object.defineProperty(document, "hidden", {
				configurable: true,
				get: () => true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect(layer).toHaveAttribute("data-rainy-day-paused", "true");

		await page.evaluate(() => {
			Object.defineProperty(document, "hidden", {
				configurable: true,
				get: () => false,
			});
			document.dispatchEvent(new Event("visibilitychange"));
		});
		await expect(layer).not.toHaveAttribute("data-rainy-day-paused", "true");
	});

	test("纯色背景（wallpaperMode: none）时取不到壁纸，不挂载", async ({
		page,
	}) => {
		await page.addInitScript(() =>
			window.localStorage.setItem("wallpaper-mode", "none"),
		);
		await page.goto("/", { waitUntil: "networkidle" });
		// 图层容器仍在（SSR 输出），但不创建 WebGL 实例
		await page.waitForTimeout(3500);
		await expect(page.locator(LAYER)).not.toHaveAttribute(
			"data-rainy-day-active",
			"true",
		);
		// 未激活：纹理层保持基线层级，背景与改动前一致
		expect(
			await page
				.locator("#m3e-texture-canvas")
				.evaluate((el) => Number(getComputedStyle(el).zIndex)),
		).toBe(-20);
	});
});

/**
 * HiDPI / 4K 回归：修复前 `canvas.width / clientWidth` 等于 devicePixelRatio，修复后恒为 1
 */
test.describe("Rainy window layer — 高分屏（dpr = 2）", () => {
	test.use({ deviceScaleFactor: 2 });
	test.skip(!rainyDayEnabled, "全页雨幕未启用（rainyDayConfig.enable: false）");

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
