import { expect, test } from "@playwright/test";
import { resolveBannerState } from "../../src/utils/banner-state";

function isBannerAsset(value: string): boolean {
	return /\/assets\/(?:images\/)?banner\//.test(decodeURIComponent(value));
}

function isBannerVariant(
	value: string,
	variant: "desktop" | "mobile",
): boolean {
	return decodeURIComponent(value).includes(`/banner/${variant}/`);
}

async function waitForBannerState(
	page: import("@playwright/test").Page,
	visible: boolean,
) {
	await page.waitForFunction(
		(expected) => document.body.dataset.bannerVisible === String(expected),
		visible,
	);
}

async function expectSubtitleTyping(page: import("@playwright/test").Page) {
	const subtitle = page.locator("#banner-wrapper [data-banner-home-copy] p");
	const expected = "特別なことはないけど、君がいると十分です";
	await expect(subtitle).toHaveAttribute("data-subtitle-state", "typing");
	const typingText = await subtitle.textContent();
	expect(typingText).toBeTruthy();
	expect(expected.startsWith(typingText ?? "")).toBe(true);
	await expect(subtitle).toHaveAttribute("data-subtitle-state", "complete", {
		timeout: 7_500,
	});
	await expect(subtitle).toHaveText(expected);
}

async function expectBannerOverlap(page: import("@playwright/test").Page) {
	const geometry = await page.evaluate(() => {
		const banner = document.getElementById("banner-wrapper");
		const categoryBar = document.getElementById("category-bar-region");
		if (!banner || !categoryBar) return null;

		const rootStyle = getComputedStyle(document.documentElement);
		const resolveLength = (property: string): number => {
			let value = rootStyle.getPropertyValue(property).trim();
			const variable = value.match(/^var\((--[^,)]+)/);
			if (variable) value = rootStyle.getPropertyValue(variable[1]).trim();
			const numericValue = Number.parseFloat(value);
			return value.endsWith("rem")
				? numericValue * Number.parseFloat(rootStyle.fontSize)
				: numericValue;
		};

		return {
			actual:
				banner.getBoundingClientRect().bottom -
				categoryBar.getBoundingClientRect().top,
			expected: resolveLength("--banner-panel-overlap"),
		};
	});

	expect(geometry).not.toBeNull();
	expect(geometry?.actual).toBeCloseTo(geometry?.expected ?? 0, 0);
}

async function expectWaveGeometry(
	page: import("@playwright/test").Page,
	expectedScale: string,
) {
	const geometry = await page.locator(".banner-waves").evaluate((waves) => {
		const rootStyle = getComputedStyle(document.documentElement);
		const layer = waves.querySelector<HTMLElement>(".banner-waves__layer");
		if (!layer) return null;
		const overlapProperty = rootStyle
			.getPropertyValue("--banner-panel-overlap")
			.trim();
		const overlapVariable = overlapProperty.match(/^var\((--[^,)]+)/);
		const overlapValue = overlapVariable
			? rootStyle.getPropertyValue(overlapVariable[1]).trim()
			: overlapProperty;
		const overlap = Number.parseFloat(overlapValue);
		return {
			height: waves.getBoundingClientRect().height,
			overlap: overlapValue.endsWith("rem")
				? overlap * Number.parseFloat(rootStyle.fontSize)
				: overlap,
			scale: getComputedStyle(layer)
				.getPropertyValue("--banner-wave-scale-y")
				.trim(),
		};
	});

	expect(geometry).not.toBeNull();
	expect(geometry?.height).toBeGreaterThan(geometry?.overlap ?? 0);
	expect(Number(geometry?.scale)).toBe(Number(expectedScale));
}

async function expectWavesAnimated(
	page: import("@playwright/test").Page,
	animated: boolean,
) {
	await expect(page.locator(".banner-waves")).toBeVisible();
	const animationCount = await page
		.locator(".banner-waves")
		.evaluate((waves) => waves.getAnimations({ subtree: true }).length);
	expect(animationCount > 0).toBe(animated);
}

async function expectRouteProgressAtAppBarBottom(
	page: import("@playwright/test").Page,
) {
	const rootSize = await page.evaluate(() =>
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
	);
	await expect(page.locator(".route-progress")).toHaveCSS(
		"top",
		`${rootSize * 4}px`,
	);
}

async function expectCompactTop(page: import("@playwright/test").Page) {
	const rootSize = await page.evaluate(() =>
		Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
	);
	await expect(page.locator("#main-layout")).toHaveCSS(
		"top",
		`${rootSize * 5.5}px`,
	);
}

test.describe("banner wallpaper", () => {
	test("uses mutually exclusive home and contextual copy modes", () => {
		const base = {
			mode: "banner" as const,
			viewport: "desktop" as const,
			imageCount: 1,
			carouselEnabled: false,
			reducedMotion: false,
		};
		expect(resolveBannerState({ ...base, page: "home" }).copyMode).toBe("home");
		expect(resolveBannerState({ ...base, page: "post" }).copyMode).toBe(
			"context",
		);
		expect(
			resolveBannerState({ ...base, viewport: "mobile", page: "post" })
				.copyMode,
		).toBeNull();
	});

	test("server response includes article banner context", async ({
		request,
	}) => {
		const response = await request.get("/posts/guide/");
		expect(response.ok()).toBe(true);
		const html = await response.text();
		expect(html).toContain("data-banner-context-title");
		expect(html).toContain("Simple Guides for Fuwari");
		expect(html).toContain("How to use this blog template.");
		expect(html).toContain('datetime="2024-04-01"');
	});

	test("centers article context in a bounded box with home-scale type", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		const stage = page.locator("#banner-wrapper");
		const context = stage.locator("[data-banner-context]");
		await expect(stage).toHaveAttribute("data-copy-mode", "context");
		await expect(context).toBeVisible();
		await expect(context.locator("[data-banner-context-title]")).toHaveText(
			"Simple Guides for Fuwari",
		);
		await expect(
			context.locator("[data-banner-context-description]"),
		).toHaveText("How to use this blog template.");
		await expect(context.locator("time")).toHaveAttribute(
			"datetime",
			"2024-04-01",
		);

		const layout = await context.evaluate((element) => {
			const stage = document.getElementById("banner-wrapper");
			const homeTitle = document.querySelector<HTMLElement>(
				"[data-banner-home-copy] h1",
			);
			const title = element.querySelector<HTMLElement>(
				"[data-banner-context-title]",
			);
			if (!stage || !homeTitle || !title) return null;
			const stageRect = stage.getBoundingClientRect();
			const boxRect = element.getBoundingClientRect();
			return {
				centerX: Math.abs(
					boxRect.left +
						boxRect.width / 2 -
						(stageRect.left + stageRect.width / 2),
				),
				centerY: Math.abs(
					boxRect.top +
						boxRect.height / 2 -
						(stageRect.top + stageRect.height / 2),
				),
				boxWidth: boxRect.width,
				maxWidth: Number.parseFloat(getComputedStyle(element).maxWidth),
				titleSize: getComputedStyle(title).fontSize,
				homeTitleSize: getComputedStyle(homeTitle).fontSize,
				textAlign: getComputedStyle(element).textAlign,
				overflows:
					element.scrollWidth > element.clientWidth ||
					element.scrollHeight > element.clientHeight,
			};
		});
		expect(layout).not.toBeNull();
		expect(layout?.centerX).toBeLessThan(1);
		expect(layout?.centerY).toBeLessThan(1);
		expect(layout?.boxWidth).toBeLessThanOrEqual(1024);
		expect(layout?.titleSize).toBe(layout?.homeTitleSize);
		expect(layout?.textAlign).toBe("center");
		expect(layout?.overflows).toBe(false);
	});

	test("fits long contextual titles onto one line at desktop widths", async ({
		page,
	}) => {
		for (const width of [1440, 1024]) {
			await page.setViewportSize({ width, height: 1000 });
			await page.goto("/posts/markdown-extended/", {
				waitUntil: "domcontentloaded",
			});
			await waitForBannerState(page, true);
			const title = page.locator("[data-banner-context-title]");
			await expect(title).toHaveAttribute("data-title-fit", "scaled");
			const layout = await title.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					fontSize: Number.parseFloat(style.fontSize),
					lineHeight: Number.parseFloat(style.lineHeight),
					height: element.getBoundingClientRect().height,
					overflows: element.scrollWidth > element.clientWidth,
					whiteSpace: style.whiteSpace,
				};
			});
			expect(layout.overflows).toBe(false);
			expect(layout.whiteSpace).toBe("nowrap");
			expect(layout.height).toBeLessThanOrEqual(layout.lineHeight + 1);
			expect(layout.fontSize).toBeGreaterThanOrEqual(36);
			expect(layout.fontSize).toBeLessThan(80);
		}
	});

	test("shows localized context on a non-post page", async ({ page }) => {
		await page.goto("/friends/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		const context = page.locator("[data-banner-context]");
		await expect(context.locator("[data-banner-context-title]")).toHaveText(
			"Friends",
		);
		await expect(
			context.locator("[data-banner-context-description]"),
		).toHaveText(
			"Link exchange is welcome — see the About page for how to apply.",
		);
		await expect(context.locator("[data-banner-context-meta]")).toBeHidden();
	});

	test("shows collection context and omits duplicate supporting text", async ({
		page,
	}) => {
		await page.goto("/archive/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator("[data-banner-context-title]")).toHaveText(
			"Archive",
		);
		await expect(page.locator("[data-banner-context-description]")).toHaveText(
			/^\d+ posts$/,
		);

		await page.goto("/about/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator("[data-banner-context-title]")).toHaveText(
			"About",
		);
		await expect(page.locator("[data-banner-context-details]")).toBeHidden();
	});

	test("server response keeps the complete home subtitle", async ({
		request,
	}) => {
		const response = await request.get("/");
		expect(response.ok()).toBe(true);
		const html = await response.text();
		expect(html).toContain("特別なことはないけど、君がいると十分です");
		expect(html).toContain("<picture");
		expect(html).toContain('fetchpriority="high"');
		expect(html).not.toContain("/assets/banner/desktop/1.webp");
	});

	test("desktop exposes subtitle typewriter controls", async ({ page }) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-subtitle-typewriter-enabled",
			"true",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-subtitle-typewriter-speed",
			"100",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-subtitle-typewriter-delete-speed",
			"50",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-subtitle-typewriter-pause-time",
			"2000",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-subtitle-typewriter-loop",
			"true",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-home-subtitles",
			JSON.stringify([
				"特別なことはないけど、君がいると十分です",
				"今でもあなたは私の光",
				"君ってさ、知らないうちに私の毎日になってたよ",
				"君と話すと、なんか毎日がちょっと楽しくなるんだ",
				"今日はなんでもない日。でも、ちょっとだけいい日",
			]),
		);
	});

	test("desktop loads only desktop images and types home subtitle", async ({
		page,
	}) => {
		const requests: string[] = [];
		page.on("request", (request) => {
			if (isBannerAsset(request.url())) requests.push(request.url());
		});

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator("#banner-wrapper h1")).toHaveText("Shirone");
		await expectSubtitleTyping(page);
		await expect(page.locator("#navbar")).toHaveClass(
			/top-app-bar--transparent/,
		);
		await expect(page.locator(".route-progress")).toHaveCSS("top", "0px");
		await expect(page.locator(".banner-waves__layer")).toHaveCount(4);
		await expectWavesAnimated(page, true);
		await expectBannerOverlap(page);
		await expectWaveGeometry(page, "1");
		await expect(page.locator("#main-layout")).toHaveCSS(
			"top",
			/^[4-9]\d{2}(\.\d+)?px$/,
		);
		expect(
			requests.some((request) => isBannerVariant(request, "desktop")),
		).toBe(true);
		expect(requests.some((request) => isBannerVariant(request, "mobile"))).toBe(
			false,
		);
		expect(
			await page
				.locator(".banner-stage__image--front")
				.evaluate((image) => image.getAnimations().length),
		).toBe(0);
	});

	test("desktop progress moves below the app bar after leaving the Banner", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator(".route-progress")).toHaveCSS("top", "0px");

		await page.evaluate(() => window.scrollTo(0, window.innerHeight));
		await page.waitForFunction(
			() => document.body.dataset.bannerScrolled === "true",
		);
		await expect(page.locator("#navbar")).not.toHaveClass(
			/top-app-bar--transparent/,
		);
		await expectRouteProgressAtAppBarBottom(page);
	});

	test("mobile post hides wallpaper and keeps compact content geometry", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const requests: string[] = [];
		page.on("request", (request) => {
			if (isBannerAsset(request.url())) requests.push(request.url());
		});

		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, false);
		await expect(page.locator("#banner-wrapper")).toBeHidden();
		await expect(page.locator(".banner-waves")).toBeHidden();
		await expectCompactTop(page);
		await expect(page.locator("#navbar")).not.toHaveClass(
			/top-app-bar--transparent/,
		);
		await expectRouteProgressAtAppBarBottom(page);
		expect(requests).toEqual([]);
	});

	test("mobile home loads only mobile image resources", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		const requests: string[] = [];
		page.on("request", (request) => {
			if (isBannerAsset(request.url())) requests.push(request.url());
		});

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expectWavesAnimated(page, true);
		await expectBannerOverlap(page);
		await expectWaveGeometry(page, "0.72");
		expect(requests.some((request) => isBannerVariant(request, "mobile"))).toBe(
			true,
		);
		expect(
			requests.some((request) => isBannerVariant(request, "desktop")),
		).toBe(false);
	});

	test("tablet home keeps the full wave geometry at the desktop breakpoint", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 768, height: 900 });
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expectWavesAnimated(page, true);
		await expectBannerOverlap(page);
		await expectWaveGeometry(page, "1");
	});

	test("solid preference persists after SSR banner discovery", async ({
		page,
	}) => {
		await page.addInitScript(() =>
			localStorage.setItem("wallpaper-mode", "none"),
		);
		const requests: string[] = [];
		page.on("request", (request) => {
			if (isBannerAsset(request.url())) requests.push(request.url());
		});

		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, false);
		await expect(page.locator("#banner-wrapper")).toBeHidden();
		await expect(page.locator(".banner-waves")).toBeHidden();
		await expectCompactTop(page);
		expect(requests).toHaveLength(1);
		expect(isBannerVariant(requests[0], "desktop")).toBe(true);
	});

	test("display settings switches modes immediately and persists", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await page.locator("#display-settings-switch").click();
		await page.getByText("Solid", { exact: true }).click();
		await waitForBannerState(page, false);
		expect(
			await page.evaluate(() => localStorage.getItem("wallpaper-mode")),
		).toBe("none");
		await expectCompactTop(page);

		await page.reload({ waitUntil: "domcontentloaded" });
		await waitForBannerState(page, false);
		await page.locator("#display-settings-switch").click();
		await page.getByText("Banner", { exact: true }).click();
		await waitForBannerState(page, true);
	});

	test("automatic carousel crossfades to the next desktop image", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		const desktopImageCount = await page
			.locator("#banner-wrapper")
			.evaluate((stage) => {
				const value = (stage as HTMLElement).dataset.desktopImages;
				return value ? JSON.parse(value).length : 0;
			});
		test.skip(
			desktopImageCount < 2,
			"carousel requires at least two desktop images",
		);
		const before = await page
			.locator(".banner-stage__image--active")
			.getAttribute("src");
		await page.waitForFunction(
			(initial) =>
				document
					.querySelector<HTMLImageElement>(".banner-stage__image--active")
					?.getAttribute("src") !== initial,
			before,
			{ timeout: 7500 },
		);
		const after = await page
			.locator(".banner-stage__image--active")
			.getAttribute("src");
		expect(after).not.toBe(before);
	});

	test("carousel visits every desktop image in order without repeating the first slide", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		const images = await page.locator("#banner-wrapper").evaluate((stage) => {
			const value = (stage as HTMLElement).dataset.desktopImages;
			return value ? JSON.parse(value) : [];
		});
		test.skip(images.length < 4, "carousel order test requires four desktop images");

		const interval = await page
			.locator("#banner-wrapper")
			.evaluate((stage) =>
				Math.max(
					Number.parseInt(
						(stage as HTMLElement).dataset.carouselInterval || "6000",
						10,
					),
					3000,
				),
			);
		const seen: string[] = [];
		const readActiveSrc = () =>
			page
				.locator(".banner-stage__image--active")
				.getAttribute("src")
				.then((src) => src || "");

		seen.push(await readActiveSrc());
		for (let step = 1; step < images.length; step += 1) {
			const previous = seen.at(-1);
			await page.waitForFunction(
				(expected) =>
					document
						.querySelector<HTMLImageElement>(".banner-stage__image--active")
						?.getAttribute("src") !== expected,
				previous,
				{ timeout: interval + 2500 },
			);
			seen.push(await readActiveSrc());
		}

		expect(seen).toHaveLength(images.length);
		expect(new Set(seen).size).toBe(images.length);
		for (let index = 0; index < images.length; index += 1) {
			expect(seen[index]).toContain(images[index].split("/").pop() || "");
		}
	});

	test("reduced motion keeps the initial slide static", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(
			page.locator("#banner-wrapper [data-banner-home-copy] p"),
		).toHaveText("特別なことはないけど、君がいると十分です");
		await expect(
			page.locator("#banner-wrapper [data-banner-home-copy] p"),
		).toHaveAttribute("data-subtitle-state", "complete");
		await expectWavesAnimated(page, false);
		const before = await page
			.locator(".banner-stage__image--active")
			.getAttribute("src");
		await page.waitForTimeout(6500);
		const after = await page
			.locator(".banner-stage__image--active")
			.getAttribute("src");
		expect(after).toBe(before);
	});

	test("manual reduced motion keeps the wave boundary static", async ({
		page,
	}) => {
		await page.addInitScript(() =>
			localStorage.setItem("mc-motion", "reduced"),
		);
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(
			page.locator("#banner-wrapper [data-banner-home-copy] p"),
		).toHaveText("特別なことはないけど、君がいると十分です");
		await expect(
			page.locator("#banner-wrapper [data-banner-home-copy] p"),
		).toHaveAttribute("data-subtitle-state", "complete");
		await expect(page.locator("html")).toHaveClass(/motion-reduced/);
		await expectWavesAnimated(page, false);
	});

	test("Swup replaces contextual copy without retaining the previous page", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"data-copy-mode",
			"home",
		);
		await page.waitForFunction(() => Boolean(window.swup?.hooks));

		await page.evaluate(() => {
			(
				window as typeof window & { __swupPersistenceProbe?: string }
			).__swupPersistenceProbe = "preserved";
		});
		await page
			.locator(
				'#swup-container a.m3-blog-postcard__title[href="/posts/guide/"]',
			)
			.click();
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"post",
		);
		await expect(page.locator("[data-banner-context-title]")).toHaveText(
			"Simple Guides for Fuwari",
		);
		await expect(page.locator("#banner-wrapper")).toHaveAttribute(
			"aria-label",
			"Simple Guides for Fuwari",
		);
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __swupPersistenceProbe?: string })
						.__swupPersistenceProbe,
			),
		).toBe("preserved");

		await page.locator('#navbar a[href="/friends/"]').click();
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"friends",
		);
		await expect(page.locator("[data-banner-context-title]")).toHaveText(
			"Friends",
		);
		await expect(page.locator("[data-banner-context-description]")).toHaveText(
			"Link exchange is welcome — see the About page for how to apply.",
		);
		await expect(page.locator("[data-banner-context-meta]")).toBeHidden();
		expect(
			await page.evaluate(
				() =>
					(window as typeof window & { __swupPersistenceProbe?: string })
						.__swupPersistenceProbe,
			),
		).toBe("preserved");
	});

	test("animates contextual copy only on motion-enabled desktop navigation", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 1000 });
		await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
		await waitForBannerState(page, true);
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await page.evaluate(() => {
			const stage = document.getElementById("banner-wrapper");
			if (!stage) return;
			const states: string[] = [];
			new MutationObserver(() => {
				states.push(stage.dataset.contextMotion || "");
			}).observe(stage, {
				attributes: true,
				attributeFilter: ["data-context-motion"],
			});
			(
				window as typeof window & { __bannerMotionStates?: string[] }
			).__bannerMotionStates = states;
		});

		await page.locator('#navbar a[href="/friends/"]').click();
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"friends",
		);
		await page.waitForFunction(() => {
			const states =
				(window as typeof window & { __bannerMotionStates?: string[] })
					.__bannerMotionStates || [];
			return (
				states.includes("in") &&
				document.getElementById("banner-wrapper")?.dataset.contextMotion ===
					"idle"
			);
		});
		const states = await page.evaluate(
			() =>
				(window as typeof window & { __bannerMotionStates?: string[] })
					.__bannerMotionStates || [],
		);
		expect(states).toContain("out");
		expect(states).toContain("in");
		expect(states.at(-1)).toBe("idle");
	});

	test("skips contextual copy animation on mobile and reduced motion", async ({
		page,
	}) => {
		for (const setup of [
			async () => page.setViewportSize({ width: 390, height: 844 }),
			async () => {
				await page.setViewportSize({ width: 1440, height: 1000 });
				await page.emulateMedia({ reducedMotion: "reduce" });
			},
		]) {
			await setup();
			await page.goto("/posts/guide/", { waitUntil: "domcontentloaded" });
			await page.waitForFunction(() => Boolean(window.swup?.hooks));
			await page.evaluate(() => {
				(
					window.swup as typeof window.swup & {
						navigate: (url: string) => void;
					}
				).navigate("/friends/");
			});
			await page.waitForFunction(
				() =>
					document.getElementById("swup-container")?.dataset.currentPage ===
					"friends",
			);
			await expect(page.locator("#banner-wrapper")).toHaveAttribute(
				"data-context-motion",
				"idle",
			);
		}
	});

	test("Swup home to post removes mobile wallpaper without leaving a gap", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/", { waitUntil: "networkidle" });
		await waitForBannerState(page, true);
		await expect(page.locator(".banner-waves")).toHaveCount(1);

		await page.evaluate(() => {
			(
				document.querySelector(
					'#swup-container a[href^="/posts/"]',
				) as HTMLAnchorElement
			)?.click();
		});
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"post",
		);
		await waitForBannerState(page, false);
		await expect(page.locator(".banner-waves")).toHaveCount(1);
		await expect(page.locator(".banner-waves")).toBeHidden();
		await expectCompactTop(page);
	});
});
