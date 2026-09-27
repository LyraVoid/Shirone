import { expect, test } from "@playwright/test";
import { resolveUmamiOptions, umamiConfig } from "../../src/config/umamiConfig";
import type { UmamiConfig } from "../../src/types/umamiConfig";

const umamiEnabled = resolveUmamiOptions(umamiConfig) !== null;
const TEST_API_PATTERN = "http://127.0.0.1:4321/api/**";
const POST_PATH = "/posts/guide/";

type Box = { x: number; y: number; width: number; height: number } | null;

function expectStableBox(before: Box, after: Box) {
	expect(before).not.toBeNull();
	expect(after).not.toBeNull();
	expect(after?.x).toBeCloseTo(before?.x ?? 0, 4);
	expect(after?.y).toBeCloseTo(before?.y ?? 0, 4);
	expect(after?.width).toBeCloseTo(before?.width ?? 0, 4);
	expect(after?.height).toBeCloseTo(before?.height ?? 0, 4);
}

async function mockUmamiApi(page: import("@playwright/test").Page) {
	let releaseStats: (() => void) | undefined;
	const statsGate = new Promise<void>((resolve) => {
		releaseStats = resolve;
	});

	await page.route(TEST_API_PATTERN, async (route) => {
		const requestUrl = new URL(route.request().url());
		if (requestUrl.pathname.endsWith("/share/test-share")) {
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					websiteId: "website-test",
					token: "test-token",
				}),
			});
			return;
		}

		if (requestUrl.pathname.endsWith("/websites/website-test/stats")) {
			await statsGate;
			await route.fulfill({
				contentType: "application/json",
				body: JSON.stringify({
					pageviews: 98_765,
					visitors: 3_210,
					visits: 4_321,
				}),
			});
			return;
		}

		await route.abort();
	});

	return () => releaseStats?.();
}

async function waitForVisualReady(page: import("@playwright/test").Page) {
	await page.waitForLoadState("load");
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll(".onload-animation")].every((element) => {
			if ((element as HTMLElement).offsetParent === null) return true;
			return getComputedStyle(element).opacity === "1";
		}),
	);
}

test.describe("Umami analytics", () => {
	test("resolver rejects disabled and incomplete configuration", () => {
		const disabled: UmamiConfig = {
			enable: false,
			shareUrl: "http://127.0.0.1:4321/share/test-share",
		};
		const incomplete: UmamiConfig = { enable: true, shareUrl: "" };

		expect(resolveUmamiOptions(disabled)).toBeNull();
		expect(resolveUmamiOptions(incomplete)).toBeNull();
	});

	test("resolver trims enabled configuration", () => {
		const resolved = resolveUmamiOptions({
			enable: true,
			shareUrl: "  http://127.0.0.1:4321/share/test-share  ",
			websiteId: "  website-test  ",
			scriptUrl: "  http://127.0.0.1:4321/script.js  ",
		});

		expect(resolved).toEqual({
			shareUrl: "http://127.0.0.1:4321/share/test-share",
			websiteId: "website-test",
			scriptUrl: "http://127.0.0.1:4321/script.js",
		});
	});

	test("disabled mode has no analytics DOM, runtime, or requests", async ({
		page,
	}) => {
		test.skip(umamiEnabled, "This assertion covers the default disabled mode");
		const analyticsRequests: string[] = [];
		page.on("request", (request) => {
			if (/oddmisc|127\.0\.0\.1:4321\/api/i.test(request.url())) {
				analyticsRequests.push(request.url());
			}
		});

		await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
		await page.waitForTimeout(500);

		await expect(page.locator("[data-shirone-umami]")).toHaveCount(0);
		await expect(page.locator("style[data-shirone-umami-runtime]")).toHaveCount(
			0,
		);
		await expect(
			page.locator('script[src*="umami"], script[src*="oddmisc"]'),
		).toHaveCount(0);
		expect(analyticsRequests).toEqual([]);
		expect(await page.evaluate(() => Boolean(window.oddmisc))).toBe(false);
	});

	for (const viewport of [
		{ name: "desktop", width: 1280, height: 900 },
		{ name: "mobile", width: 390, height: 844 },
	]) {
		test(`enabled ${viewport.name} UI is SSR-visible and stable while values load`, async ({
			page,
		}) => {
			test.skip(
				!umamiEnabled,
				"Enable Umami with the documented local test URL to run this assertion",
			);
			await page.setViewportSize(viewport);
			await page.addInitScript(() => {
				localStorage.clear();
				const target = window as Window & {
					__shironeCaptureLayoutShift?: boolean;
					__shironeUmamiLayoutShift?: number;
				};
				target.__shironeUmamiLayoutShift = 0;
				new PerformanceObserver((list) => {
					if (!target.__shironeCaptureLayoutShift) return;
					for (const entry of list.getEntries()) {
						const shift = entry as PerformanceEntry & {
							hadRecentInput: boolean;
							value: number;
						};
						if (!shift.hadRecentInput) {
							target.__shironeUmamiLayoutShift =
								(target.__shironeUmamiLayoutShift ?? 0) + shift.value;
						}
					}
				}).observe({ type: "layout-shift", buffered: true });
			});
			const releaseStats = await mockUmamiApi(page);

			await page.goto(POST_PATH, { waitUntil: "domcontentloaded" });
			const stats = page.locator(
				`[data-shirone-umami][data-umami-path="${POST_PATH}"]`,
			);
			await expect(stats).toBeVisible();
			await expect(stats.locator("[data-shirone-umami-pageviews]")).toHaveText(
				"--",
			);
			await expect(stats.locator("[data-shirone-umami-visits]")).toHaveText(
				"--",
			);
			await waitForVisualReady(page);

			const before = await stats.boundingBox();
			await page.evaluate(() => {
				(
					window as Window & {
						__shironeCaptureLayoutShift?: boolean;
						__shironeUmamiLayoutShift?: number;
					}
				).__shironeCaptureLayoutShift = true;
			});
			releaseStats();
			await expect(stats).toHaveAttribute("data-umami-loaded", "true");
			await expect(
				stats.locator("[data-shirone-umami-display]"),
			).toHaveAttribute("aria-busy", "false");
			await expect(
				stats.locator("[data-shirone-umami-pageviews]"),
			).toHaveAttribute("title", "98765");
			await expect(
				stats.locator("[data-shirone-umami-visits]"),
			).toHaveAttribute("title", "4321");
			await page.evaluate(() => new Promise(requestAnimationFrame));
			const after = await stats.boundingBox();

			expectStableBox(before, after);
			expect(
				await page.evaluate(
					() =>
						(window as Window & { __shironeUmamiLayoutShift?: number })
							.__shironeUmamiLayoutShift ?? 0,
				),
			).toBe(0);
		});
	}

	test("profile metrics stay on one line", async ({ page }) => {
		test.skip(
			!umamiEnabled,
			"Enable Umami with the documented local test URL to run this assertion",
		);
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/", { waitUntil: "domcontentloaded" });
		const display = page.locator(
			".shirone-umami-stats--profile [data-shirone-umami-display]",
		);
		await expect(display).toBeVisible();
		await expect(display).toHaveCSS("flex-wrap", "nowrap");
		await expect(display).toHaveCSS("white-space", "nowrap");
	});

	test("enabled runtime loads article stats after Swup navigation", async ({
		page,
	}) => {
		test.skip(
			!umamiEnabled,
			"Enable Umami with the documented local test URL to run this assertion",
		);
		await page.addInitScript(() => localStorage.clear());
		const releaseStats = await mockUmamiApi(page);
		releaseStats();
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), POST_PATH);
		await expect(page).toHaveURL(/\/posts\/guide\/?$/);

		const articleStats = page.locator(
			`[data-shirone-umami][data-umami-path="${POST_PATH}"]`,
		);
		await expect(articleStats).toHaveAttribute("data-umami-loaded", "true");
		await expect(
			articleStats.locator("[data-shirone-umami-pageviews]"),
		).toHaveAttribute("title", "98765");
	});
});
