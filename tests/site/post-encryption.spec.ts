import fs from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("文章加密安全与防泄密", () => {
	test("静态 HTML 源码不包含任何未授权正文内容", async ({ page }) => {
		const response = await page.goto("/posts/encrypted-demo/", {
			waitUntil: "networkidle",
		});
		expect(response?.ok()).toBe(true);

		const html = await page.content();

		// 绝不包含正文独有的机密明文字符
		expect(html).not.toContain(
			"Congratulations! You have successfully unlocked",
		);
		expect(html).not.toContain("Web Crypto API (AES-256-GCM + PBKDF2)");
		expect(html).not.toContain("Euler's identity");
		expect(html).not.toContain("Architecture Note");
		expect(html).not.toContain(
			"A demonstration of client-side authenticated decryption",
		);

		// 包含门控组件与密文容器
		expect(html).toContain("password-gate");
		expect(html).toContain("post:encrypted-demo");
	});

	test("RSS 订阅源中加密文章正文被脱敏", async ({ request }) => {
		const response = await request.get("/rss.xml");
		if (response.ok()) {
			const xml = await response.text();
			if (xml.includes("<item>")) {
				expect(xml).toContain(
					"🔒 Password Protection and Post Encryption Demo",
				);
				expect(xml).not.toContain(
					"Congratulations! You have successfully unlocked",
				);
				expect(xml).toMatch(
					/This post is encrypted|本文已加密保护|password-protected/,
				);
			}
		}
		if (fs.existsSync("dist/rss.xml")) {
			const xml = fs.readFileSync("dist/rss.xml", "utf8");
			expect(xml).toContain("🔒 Password Protection and Post Encryption Demo");
			expect(xml).not.toContain(
				"Congratulations! You have successfully unlocked",
			);
			expect(xml).toMatch(
				/This post is encrypted|本文已加密保护|password-protected/,
			);
		}
	});
});

test.describe("文章加密交互与解密流", () => {
	test("提供完整的密码验证、解密渲染、TOC样式与会话持久化", async ({
		page,
	}) => {
		await page
			.context()
			.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto("/posts/encrypted-demo/", { waitUntil: "networkidle" });

		const gate = page.locator(".password-gate");
		await expect(gate).toBeVisible();

		const input = page.locator('input[name="password"]');
		const submit = page.locator('.password-gate button[type="submit"]');

		await expect(input).toHaveAttribute("type", "password");
		await expect(input).toHaveAttribute("autocomplete", "current-password");

		// 密码显隐切换
		const showBtn = page.locator(
			'.password-gate button[aria-label="显示密码"], .password-gate button[aria-label="Show password"]',
		);
		const hideBtn = page.locator(
			'.password-gate button[aria-label="隐藏密码"], .password-gate button[aria-label="Hide password"]',
		);
		if ((await showBtn.count()) > 0 && (await showBtn.isVisible())) {
			await showBtn.click();
			await expect(input).toHaveAttribute("type", "text");
			await hideBtn.click();
			await expect(input).toHaveAttribute("type", "password");
		}

		// 空密码提交
		await submit.click();
		await expect(page.locator(".password-gate")).toContainText(
			/请输入密码|Enter a password|Password is required/,
		);

		// 错误密码提交
		await input.fill("wrong-password-123");
		await submit.click();
		await expect(page.locator(".password-gate")).toContainText(
			/密码错误|Incorrect password|无法解锁/,
		);

		// 正确密码提交
		await input.fill("shirone-secret");
		await submit.click();

		// 验证解密成功，正文呈现
		const content = page.locator(".markdown-content");
		await expect(content).toBeVisible({ timeout: 10000 });
		await expect(content).toContainText(
			"Congratulations! You have successfully unlocked",
		);
		await expect(gate).toBeHidden();

		const headingSpacing = await content.evaluate((root) => {
			const rootStyles = getComputedStyle(document.documentElement);
			return {
				sectionSpace: rootStyles.getPropertyValue("--m3e-space-4").trim(),
				compactSpace: rootStyles.getPropertyValue("--m3e-space-2").trim(),
				headings: [
					"password-protected-article",
					"1-security-architecture-and-core-features",
				].map((id) => {
					const heading = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
					if (!heading) throw new Error(`Missing decrypted heading #${id}`);
					const computed = getComputedStyle(heading);
					return {
						marginTop: computed.marginTop,
						marginBottom: computed.marginBottom,
					};
				}),
			};
		});
		expect(headingSpacing.headings).toEqual([
			{ marginTop: "0px", marginBottom: headingSpacing.compactSpace },
			{
				marginTop: headingSpacing.sectionSpace,
				marginBottom: headingSpacing.compactSpace,
			},
		]);

		// 解密后运行时能力必须真实完成初始化，而不是只插入 HTML。
		await expect(page.locator(".markdown-content pre").first()).toBeVisible();
		await expect(
			page.locator('.markdown-mermaid[data-mermaid-state="ready"]'),
		).toBeVisible({ timeout: 15000 });
		await expect(
			page.locator(".markdown-mermaid [data-mermaid-svg]"),
		).toBeVisible();

		// 验证动态重建的 TOC 结构与样式完整性
		const tocHeading = page
			.locator("#toc a.m3-blog-toc__item")
			.filter({ hasText: "Security Architecture and Core Features" });
		await expect(tocHeading).toHaveCount(1);
		await expect(tocHeading).toHaveText(
			"1. Security Architecture and Core Features",
		);
		await expect(tocHeading).toHaveCSS("display", "flex");
		await expect(tocHeading.locator(".m3-blog-toc__mark")).toBeVisible();

		const formula = page.locator(".katex-display").first();
		await formula.scrollIntoViewIfNeeded();
		await expect(formula).toHaveAttribute("data-scrollbar-initialized", "true");
		expect(
			await formula.evaluate((element) =>
				Boolean(element.closest(".katex-display-container")),
			),
		).toBe(true);

		const copyButton = page.locator(".markdown-content .copy-btn").first();
		await copyButton.click();
		await expect(copyButton).toHaveClass(/success/);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
			"decryptProtectedContent",
		);

		// 会话存储安全契约：存储解密后载荷供会话继承，绝不存储密码明文字段
		const sessionRaw = await page.evaluate(() =>
			sessionStorage.getItem("shirone:protected:v1:post%3Aencrypted-demo"),
		);
		expect(sessionRaw).not.toBeNull();
		const parsedSession = JSON.parse(sessionRaw || "{}");
		expect(parsedSession.content).toContain(
			"Congratulations! You have successfully unlocked",
		);
		expect(parsedSession.password).toBeUndefined();

		// Swup 站内跳转后返回保持已解锁状态
		await page.click('nav a[href="/archive/"]');
		await expect(page).toHaveURL(/.*\/archive\/?/);
		await expect(page.locator(".m3-blog-archive")).toBeVisible();

		await page.click('.m3-blog-archive a[href*="encrypted-demo"]');
		await expect(page).toHaveURL(/.*\/posts\/encrypted-demo\/?/);

		// 验证直接展示解密内容，无需二次输入
		await expect(page.locator(".markdown-content")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator(".password-gate")).toBeHidden();

		// 会话持久化验证：页面刷新（F5）后仍保持解锁，无需重新输入密码
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator(".markdown-content")).toBeVisible({
			timeout: 10000,
		});
		await expect(page.locator(".password-gate")).toBeHidden();
		await expect(page.locator("#toc a.m3-blog-toc__item")).toHaveCount(5);

		// 清除会话后刷新，应当重新出现密码门
		await page.evaluate(() => sessionStorage.clear());
		await page.reload({ waitUntil: "networkidle" });
		await expect(page.locator(".password-gate")).toBeVisible();
		await expect(page.locator(".markdown-content")).toHaveCount(0);
	});

	test("移动端解密后悬浮 TOC 与侧栏同步并支持锚点跳转", async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 667 });
		await page.goto("/posts/encrypted-demo/", { waitUntil: "networkidle" });

		// 未解锁前悬浮 TOC 为空态
		const tocBtn = page.locator("#fab-toc-btn");
		await expect(tocBtn).toBeVisible();
		await tocBtn.click();
		const panel = page.locator("#floating-toc-panel");
		await expect(panel).toHaveClass(/is-open/);
		await expect(
			page.locator("#floating-toc-tree a.m3-blog-toc__item"),
		).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(panel).not.toHaveClass(/is-open/);

		// 解锁文章
		await page.locator('input[name="password"]').fill("shirone-secret");
		await page.locator('.password-gate button[type="submit"]').click();
		await expect(page.locator(".markdown-content")).toBeVisible({
			timeout: 10000,
		});

		// 解密后悬浮 TOC 同步侧栏标题
		await tocBtn.click();
		await expect(panel).toHaveClass(/is-open/);
		const floatingItem = page
			.locator("#floating-toc-tree a.m3-blog-toc__item")
			.filter({ hasText: "Security Architecture and Core Features" });
		await expect(floatingItem).toHaveCount(1);

		// 点击条目锚点跳转并自动收起
		await expect(floatingItem).toHaveAttribute(
			"href",
			/security-architecture-and-core-features/i,
		);
		await floatingItem.click();
		await expect(panel).not.toHaveClass(/is-open/);
		await expect(page).toHaveURL(/security-architecture-and-core-features/i);
	});
});

test.describe("移动端密码门控响应式布局与防溢出", () => {
	for (const width of [375, 360, 320]) {
		test(`${width}px 视口下密码门控输入框与按钮自适应且无水平溢出`, async ({
			page,
		}) => {
			await page.setViewportSize({ width, height: 667 });
			await page.goto("/posts/encrypted-demo/", { waitUntil: "networkidle" });

			const gate = page.locator(".password-gate");
			await expect(gate).toBeVisible();

			const metrics = await page.evaluate(() => {
				const gateEl = document.querySelector(".password-gate");
				const formEl = document.querySelector(".password-gate__form");
				const fieldEl = document.querySelector(".password-gate__field");
				const inputEl = document.querySelector(".password-gate__input");
				const submitEl = document.querySelector(".password-gate__submit");
				const doc = document.documentElement;

				if (!gateEl || !formEl || !fieldEl || !inputEl || !submitEl) {
					throw new Error("Missing password gate elements");
				}

				const gateRect = gateEl.getBoundingClientRect();
				const formRect = formEl.getBoundingClientRect();
				const fieldRect = fieldEl.getBoundingClientRect();
				const inputRect = inputEl.getBoundingClientRect();
				const submitRect = submitEl.getBoundingClientRect();

				return {
					docScrollWidth: doc.scrollWidth,
					docClientWidth: doc.clientWidth,
					gateWidth: Math.round(gateRect.width),
					formWidth: Math.round(formRect.width),
					fieldWidth: Math.round(fieldRect.width),
					inputWidth: Math.round(inputRect.width),
					submitWidth: Math.round(submitRect.width),
					fieldRight: fieldRect.right,
					inputRight: inputRect.right,
					submitRight: submitRect.right,
					formRight: formRect.right,
					gateRight: gateRect.right,
				};
			});

			// 页面整体绝不出现横向滚动
			expect(metrics.docScrollWidth).toBeLessThanOrEqual(
				metrics.docClientWidth + 1,
			);

			// 输入框和提交按钮的宽度必须自适应收缩至与表单容器完全一致
			expect(metrics.inputWidth).toBe(metrics.formWidth);
			expect(metrics.fieldWidth).toBe(metrics.formWidth);
			expect(metrics.submitWidth).toBe(metrics.formWidth);

			// 右侧边界绝不能超出表单和门控卡片
			expect(metrics.inputRight).toBeLessThanOrEqual(metrics.formRight + 1);
			expect(metrics.submitRight).toBeLessThanOrEqual(metrics.gateRight + 1);
		});
	}
});
