import { expect, test } from "@playwright/test";

/**
 * SSR 图标渲染防回归。
 * 背景：@iconify/svelte 的 Icon 依赖客户端运行时加载数据，SSR 无 hydration 时渲染空白。
 * 因此所有图标都必须走 `atoms/display/Icon.svelte`——它在构建期把用到的图标
 * 摇成一棵小树（`src/generated/local-icon-collections.ts`），SSR 直出 svg。
 * 若绕过它改成在线 Iconify 组件、或让生成链路拿不到图标集，本文件就会失败。
 */
test.describe("SSR 图标渲染", () => {
	test("首页及设置交互不请求 Iconify API", async ({ page }) => {
		const requests: string[] = [];
		page.on("request", (request) => {
			if (request.url().startsWith("https://api.iconify.design/")) {
				requests.push(request.url());
			}
		});
		await page.goto("/", { waitUntil: "networkidle" });
		await page.locator("#display-settings-switch").click();
		await expect(page.locator("#display-settings-switch svg")).toBeVisible();
		expect(requests).toEqual([]);
	});

	test("首页顶栏按钮图标可见（移动端汉堡 + 桌面端设置）", async ({ page }) => {
		// 移动视口：汉堡按钮可见
		await page.setViewportSize({ width: 375, height: 720 });
		await page.goto("/");
		await expect(page.locator("#nav-drawer-switch svg")).toBeVisible();
		await expect(page.locator("#display-settings-switch svg")).toBeVisible();
		// 桌面视口：汉堡隐藏（lg:!hidden）、设置按钮仍可见
		await page.setViewportSize({ width: 1280, height: 720 });
		await expect(page.locator("#nav-drawer-switch")).toBeHidden();
		await expect(page.locator("#display-settings-switch svg")).toBeVisible();
	});

	test("侧栏个人资料社交链接图标可见（3 个）", async ({ page }) => {
		await page.goto("/");
		const links = page.locator("a[rel='me'] svg");
		await expect(links).toHaveCount(3);
		await expect(links.first()).toBeVisible();
	});

	test("文章页复制链接按钮图标可见", async ({ page }) => {
		await page.goto("/posts/markdown/");
		await expect(page.locator("#copy-post-link svg")).toBeVisible();
	});

	test("Icon only emits data-icon when the caller provides it", async ({
		page,
	}) => {
		await page.goto("/");
		await page.evaluate(async () => {
			const defaultHost = document.createElement("div");
			defaultHost.id = "icon-default-probe";
			const callerHost = document.createElement("div");
			callerHost.id = "icon-caller-probe";
			document.body.append(defaultHost, callerHost);
			const { mountIconProbe } = await import(
				"/tests/site/fixtures/component-probes.ts"
			);
			mountIconProbe(defaultHost);
			mountIconProbe(callerHost, "caller-owned-value");
		});

		const defaultSvg = page.locator("#icon-default-probe svg");
		const callerSvg = page.locator("#icon-caller-probe svg");
		await expect(defaultSvg).toHaveCount(1);
		await expect(defaultSvg).not.toHaveAttribute("data-icon");
		await expect(callerSvg).toHaveAttribute("data-icon", "caller-owned-value");
	});

	test("BackToTop FAB 图标 SSR 渲染存在（初始隐藏态）", async ({ page }) => {
		// BackToTop 初始带 .is-hidden（opacity 0 + 移出视口），只断言 svg 存在（SSR 直出）
		await page.goto("/");
		await expect(page.locator("#fab-top-btn svg")).toHaveCount(1);
	});
});
