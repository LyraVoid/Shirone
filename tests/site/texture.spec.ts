import { expect, test } from "@playwright/test";

test.describe("M3E Ambient Texture & Pattern System", () => {
	test("01. 纹理图层正确挂载且具备硬件加速与穿透属性", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const textureCanvas = page.locator("#m3e-texture-canvas");
		await expect(textureCanvas).toBeAttached();
		await expect(textureCanvas).toHaveCSS("pointer-events", "none");
		await expect(textureCanvas).toHaveCSS("position", "fixed");
		await expect(textureCanvas).toHaveAttribute("aria-hidden", "true");
	});

	test("02. 默认纹理预设与数据载体正确同步", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const html = page.locator("html");
		await expect(html).toHaveAttribute("data-texture-preset", "starlight");

		const configCarrier = page.locator("#config-carrier");
		await expect(configCarrier).toHaveAttribute(
			"data-texture-preset",
			"starlight",
		);
		await expect(configCarrier).toHaveAttribute("data-texture-opacity", "0.12");
	});

	test("03. 纹理预设切换与事件广播正确响应", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// 监听 texture:change 事件
		const receivedEvent = page.evaluate(() => {
			return new Promise<{ preset: string; opacity: number }>((resolve) => {
				window.addEventListener(
					"texture:change",
					(e: Event) => {
						const customEvent = e as CustomEvent<{
							preset: string;
							opacity: number;
						}>;
						resolve(customEvent.detail);
					},
					{ once: true },
				);
			});
		});

		// 切换预设为 cyber-dots
		await page.evaluate(() => {
			// @ts-expect-error dynamic import in browser
			import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setTexturePreset("cyber-dots");
			});
		});

		const detail = await receivedEvent;
		expect(detail.preset).toBe("cyber-dots");
		await expect(page.locator("html")).toHaveAttribute(
			"data-texture-preset",
			"cyber-dots",
		);

		// 验证 local storage 已写入
		const stored = await page.evaluate(() =>
			localStorage.getItem("texture-preset"),
		);
		expect(stored).toBe("cyber-dots");
	});

	test("04. 纹理浓度透明度调节与 CSS 变量实时联动", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		await page.evaluate(async () => {
			// @ts-expect-error dynamic import in browser
			const mod = await import("/src/utils/setting-utils.ts");
			mod.setTextureOpacity(0.2);
		});

		const opacityStyle = await page.evaluate(() =>
			document.documentElement.style.getPropertyValue("--texture-opacity"),
		);
		expect(opacityStyle).toBe("0.2");

		const storedOpacity = await page.evaluate(() =>
			localStorage.getItem("texture-opacity"),
		);
		expect(storedOpacity).toBe("0.2");
	});

	test("05. 全部 6 种预设类型均可正确应用", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const presets = [
			"none",
			"starlight",
			"cyber-dots",
			"topography",
			"geometric",
			"sakura",
		] as const;

		for (const preset of presets) {
			await page.evaluate((p) => {
				// @ts-expect-error dynamic import in browser
				import("/src/utils/setting-utils.ts").then((mod) => {
					mod.setTexturePreset(p);
				});
			}, preset);

			await expect(page.locator("html")).toHaveAttribute(
				"data-texture-preset",
				preset,
			);
		}
	});

	test("06. 显示设置面板交互切换纹理预设与重置", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// 打开显示设置浮层
		const displaySettingsBtn = page.locator("#display-settings-switch");
		if (await displaySettingsBtn.isVisible()) {
			await displaySettingsBtn.click();
		} else {
			await page.evaluate(() => {
				document
					.getElementById("display-setting")
					?.classList.remove("float-panel-closed");
			});
		}

		// 找到 topography 纹理预设按钮并点击
		const topographyBtn = page.locator(
			'#display-setting button[role="radio"][aria-label*="Topography"], #display-setting button[role="radio"][aria-label*="流光等高线"], #display-setting button[role="radio"][aria-label*="等高線"]',
		);
		await expect(topographyBtn).toBeVisible();
		await topographyBtn.click();

		await expect(page.locator("html")).toHaveAttribute(
			"data-texture-preset",
			"topography",
		);

		// 点击重置按钮
		const resetBtn = page.locator(
			'#display-setting button[aria-label="Reset to Default"]',
		);
		await expect(resetBtn).toBeVisible();
		await resetBtn.click();

		// 重置后回到默认 starlight
		await expect(page.locator("html")).toHaveAttribute(
			"data-texture-preset",
			"starlight",
		);
	});

	test("07. Reduced Motion 模式下禁用背景纹理动画", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// 启用 reduced motion
		await page.evaluate(() => {
			// @ts-expect-error dynamic import in browser
			import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setMotionPreference(true);
			});
		});

		const textureCanvas = page.locator("#m3e-texture-canvas");
		await expect(textureCanvas).toHaveCSS("animation-name", "none");
	});

	test("08. 客户端 Swup 导航后纹理图层稳定持久", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		// 切换到 geometric
		await page.evaluate(() => {
			// @ts-expect-error dynamic import in browser
			import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setTexturePreset("geometric");
			});
		});

		// 站内跳转到归档页
		const archiveLink = page.locator('nav a[href*="/archive/"]').first();
		if (await archiveLink.isVisible()) {
			await archiveLink.click();
			await page.waitForURL("**/archive/**");
		} else {
			await page.goto("/archive/", { waitUntil: "domcontentloaded" });
		}

		// 验证纹理图层依旧存在且预设保持为 geometric
		const textureCanvas = page.locator("#m3e-texture-canvas");
		await expect(textureCanvas).toBeAttached();
		await expect(page.locator("html")).toHaveAttribute(
			"data-texture-preset",
			"geometric",
		);
	});

	test("09. 当预设为 none 时图层完全脱离渲染（display: none / 0 绘制）", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });

		await page.evaluate(() => {
			// @ts-expect-error dynamic import in browser
			import("/src/utils/setting-utils.ts").then((mod) => {
				mod.setTexturePreset("none");
			});
		});

		const textureCanvas = page.locator("#m3e-texture-canvas");
		await expect(textureCanvas).toHaveCSS("display", "none");
	});
});
