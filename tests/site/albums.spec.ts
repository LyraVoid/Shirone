import { expect, type Page, test } from "@playwright/test";

/**
 * Album fixtures use picsum.photos for their remote images. Answer them with a
 * local SVG of the requested aspect ratio so layout assertions do not depend on
 * an external host being reachable or fast.
 */
async function mockRemoteAlbumImages(page: Page) {
	await page.route("https://picsum.photos/**", (route) => {
		const match = /\/(\d+)\/(\d+)$/.exec(new URL(route.request().url()).pathname);
		const width = Number(match?.[1] ?? 800);
		const height = Number(match?.[2] ?? 600);
		return route.fulfill({
			contentType: "image/svg+xml",
			body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#8a8a8a"/></svg>`,
		});
	});
}

test.beforeEach(async ({ page }) => {
	await mockRemoteAlbumImages(page);
});

test.describe("相册页响应式滚动", () => {
	test("从手机视口切换到桌面视口后仍可滚动", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/albums/AcgExample/", { waitUntil: "networkidle" });
		await expect(page.locator(".album-gallery__item").first()).toBeVisible();

		await page.setViewportSize({ width: 1440, height: 900 });
		await expect
			.poll(() =>
				page.evaluate(
					() => document.documentElement.scrollHeight > window.innerHeight,
				),
			)
			.toBe(true);

		await page.evaluate(() => window.scrollTo(0, 700));
		await expect
			.poll(() => page.evaluate(() => window.scrollY))
			.toBeGreaterThan(0);

		await expect(page.locator("html")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
		await expect(page.locator("body")).not.toHaveAttribute(
			"data-overlayscrollbars",
		);
	});
});

test.describe("受保护相册", () => {
	test("提供完整的密码输入与解锁反馈", async ({ page }) => {
		// The gate renders before its media; waiting for network idle would make
		// this test depend on picsum.photos being reachable and fast.
		await page.goto("/albums/EncryptedExample/", {
			waitUntil: "domcontentloaded",
		});

		const input = page.getByRole("textbox", { name: "Password" });
		const submit = page.getByRole("button", { name: "Unlock album" });
		const visibility = page.getByRole("button", { name: "Show password" });

		await expect(
			page.getByRole("heading", { name: "This album is protected" }),
		).toBeVisible();
		await expect(page.getByText("Six digits", { exact: true })).toBeVisible();
		await expect(input).toHaveAttribute("type", "password");
		await expect(input).toHaveAttribute("autocomplete", "current-password");

		await visibility.click();
		await expect(input).toHaveAttribute("type", "text");
		await expect(
			page.getByRole("button", { name: "Hide password" }),
		).toBeVisible();

		await submit.click();
		await expect(
			page.getByText("Enter a password", { exact: true }),
		).toBeVisible();
		await expect(input).toHaveAttribute("aria-invalid", "true");

		await input.fill("000000");
		await expect(
			page.getByText("Enter a password", { exact: true }),
		).toBeHidden();
		await submit.click();
		await expect(
			page.getByText("That password could not unlock this album", {
				exact: true,
			}),
		).toBeVisible();

		await input.fill("123456");
		await submit.click();
		await expect(page.locator(".album-gallery__item")).toHaveCount(2);
		await expect(page.locator(".album-gallery")).toHaveClass(
			/album-gallery--masonry/,
		);
		await expect(page.locator(".album-gallery")).not.toHaveClass(
			/album-gallery--grid/,
		);
		const portrait = page.getByAltText("A protected vertical photograph");
		const landscape = page.getByAltText("A protected garden landscape");
		await expect(
			page.locator(".album-gallery__item img").first(),
		).toHaveAttribute("alt", "A protected vertical photograph");
		await expect
			.poll(async () => {
				const portraitBox = await portrait.boundingBox();
				const landscapeBox = await landscape.boundingBox();
				if (!portraitBox || !landscapeBox) return false;
				const naturalDirections = await page.evaluate(() => {
					const portraitImage = document.querySelector(
						'img[alt="A protected vertical photograph"]',
					) as HTMLImageElement | null;
					const landscapeImage = document.querySelector(
						'img[alt="A protected garden landscape"]',
					) as HTMLImageElement | null;
					return Boolean(
						portraitImage &&
							landscapeImage &&
							portraitImage.naturalHeight > portraitImage.naturalWidth &&
							landscapeImage.naturalWidth > landscapeImage.naturalHeight,
					);
				});
				return (
					naturalDirections &&
					portraitBox.height > portraitBox.width &&
					landscapeBox.width > landscapeBox.height &&
					portraitBox.x <= landscapeBox.x
				);
			})
			.toBe(true);
		await expect(page.locator(".password-gate")).toBeHidden();
		await expect
			.poll(() =>
				page.locator(".album-detail__gallery").evaluate((element) => {
					const style = getComputedStyle(element);
					return (
						style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
						style.padding !== "0px"
					);
				}),
			)
			.toBe(true);
	});
});
