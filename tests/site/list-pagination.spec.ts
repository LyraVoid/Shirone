import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
	createPaginationPages,
	removePaginationPages,
} from "../fixtures/pagination-pages.mjs";

declare global {
	interface Window {
		listVisits: number;
	}
}

const media =
	'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><path fill="#777" d="M0 0h200v300H0z"/></svg>';
const root = "/pagination-regression/";
const pager = (page: Page) => page.locator("nav.m3-blog-pagination");
const next = (page: Page) =>
	pager(page)
		.getByRole("button", { name: "Next page", exact: true })
		.filter({ visible: true });

async function ready(page: Page, domain: string, query = "") {
	// Image-gate tests intentionally keep requests pending. Wait for the document
	// and island readiness, rather than the unrelated window load event.
	await page.goto(`${root + domain}/${query}`, {
		waitUntil: "domcontentloaded",
	});
	await waitForList(page, domain);
}

async function waitForList(page: Page, domain: string) {
	await expect(
		page
			.locator("astro-island[ssr]")
			.filter({ has: page.locator(".friend-section, .anime-section") }),
	).toHaveCount(0);
	await expect(
		page.locator(`.${domain === "anime" ? "anime-card" : "friend-card"}`),
	).toHaveCount(12);
	await page.waitForFunction(() =>
		getComputedStyle(document.documentElement)
			.getPropertyValue("--mc-primary")
			.trim()
			.startsWith("#"),
	);
	await page.waitForFunction(() =>
		[...document.querySelectorAll<HTMLElement>(".onload-animation")].every(
			(element) =>
				element.offsetParent === null ||
				getComputedStyle(element).opacity === "1",
		),
	);
}

async function mockExternalRequests(page: Page) {
	await page.route(/^https?:\/\//, (route) => {
		const { hostname } = new URL(route.request().url());
		return hostname === "localhost" || hostname === "127.0.0.1"
			? route.fallback()
			: route.abort();
	});
}

async function expectToolsBelowNavbar(page: Page, prefix: string) {
	await expect
		.poll(() =>
			page.evaluate((domain) => {
				const tools = document.querySelector(`.${domain}-section__tools`);
				const navbar = document.querySelector("#navbar");
				if (!tools || !navbar) return Number.NEGATIVE_INFINITY;
				return (
					tools.getBoundingClientRect().top -
					navbar.getBoundingClientRect().bottom
				);
			}, prefix),
		)
		.toBeGreaterThanOrEqual(-1);
}

test.beforeAll(async () => {
	await createPaginationPages();
});
test.afterAll(async () => {
	await removePaginationPages();
});
test.beforeEach(async ({ page }) => {
	await mockExternalRequests(page);
	await page.route("**/pagination-media/**", (route) =>
		route.fulfill({ contentType: "image/svg+xml", body: media }),
	);
});

for (const domain of ["friends", "anime"]) {
	const prefix = domain === "friends" ? "friend" : "anime";
	const title = domain === "friends" ? "Friend" : "Anime";
	test(`${domain}: local history works when Swup starts before hydration`, async ({
		page,
	}) => {
		// The media-hydrated fixture keeps the island dormant until Swup owns
		// its native history listener, making registration order deterministic.
		await page.setViewportSize({ width: 1280, height: 900 });
		await page.goto(`${root + domain}-delayed/`, {
			waitUntil: "domcontentloaded",
		});
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await expect(
			page.locator("astro-island[ssr]").filter({
				has: page.locator(`.${prefix}-section`),
			}),
		).toHaveCount(1);
		await page.setViewportSize({ width: 1800, height: 1000 });
		await waitForList(page, domain);
		await page.evaluate(() => {
			window.listVisits = 0;
			document.addEventListener("swup:visit:start", () => window.listVisits++);
		});
		await next(page).click();
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 013`,
		);
		await page.goBack();
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 001`,
		);
		await page.goForward();
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 013`,
		);
		expect(await page.evaluate(() => window.listVisits)).toBe(0);
	});

	test(`${domain}: page replacement, reload, deep links and same-path history`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1800, height: 1000 });
		await ready(page, domain);
		await page.evaluate(() => {
			window.listVisits = 0;
			document.addEventListener("swup:visit:start", () => window.listVisits++);
			history.replaceState({ ...history.state, regressionMarker: "kept" }, "");
		});
		await next(page).click();
		await expect(page).toHaveURL(/page=2/);
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(12);
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 013`,
		);
		await expect(page.locator(`.${prefix}-section__tools`)).toBeFocused();
		await expectToolsBelowNavbar(page, prefix);
		await expect(pager(page).locator('[aria-current="page"]')).toHaveText("2");
		await expect.poll(() => page.evaluate(() => window.listVisits)).toBe(0);
		await expect
			.poll(() => page.evaluate(() => history.state.regressionMarker))
			.toBe("kept");
		await page.goBack();
		await expect(page).not.toHaveURL(/page=/);
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 001`,
		);
		await page.goForward();
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 013`,
		);
		await expect.poll(() => page.evaluate(() => window.listVisits)).toBe(0);
		await page.reload({ waitUntil: "domcontentloaded" });
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 013`,
		);
	});

	test(`${domain}: search and filter changes reset pagination`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1800, height: 1000 });
		await ready(page, domain);
		await next(page).click();
		await expectToolsBelowNavbar(page, prefix);
		await page.locator(`.${prefix}-section__search input`).fill("085");
		await expect(page).not.toHaveURL(/page=/);
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(1);
		await expect(pager(page)).toHaveCount(0);
		await expect(
			page.locator(`.${prefix}-section__search input`),
		).toBeFocused();
		await page.locator(`.${prefix}-section__search input`).fill("");
		await next(page).click();
		await expectToolsBelowNavbar(page, prefix);
		await page
			.getByRole("button", {
				name: domain === "friends" ? "Alpha" : "Watching",
				exact: true,
			})
			.click();
		await expect(page).not.toHaveURL(/page=/);
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(12);
		await next(page).click();
		await expect(page).toHaveURL(
			domain === "friends" ? /tag=Alpha.*page=2/ : /status=watching.*page=2/,
		);
		await expect(page.locator(`.${prefix}-card__title`).first()).toHaveText(
			`${title} 025`,
		);
		if (domain === "anime") {
			await page.getByRole("button", { name: "List", exact: true }).click();
			await expect(page.locator(".anime-list")).toHaveClass(/anime-list--list/);
			await expect(page).toHaveURL(/page=2/);
		}
	});

	test(`${domain}: mobile jump, invalid/last page and cross-page Swup history`, async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await ready(page, domain);
		await expect(
			pager(page).getByRole("button", { name: "Jump to page" }),
		).toHaveAccessibleName("Jump to page 1 / 8");
		await pager(page).getByRole("button", { name: "Jump to page" }).click();
		const jump = pager(page).getByRole("textbox", { name: "Jump to page" });
		await jump.fill("0");
		await jump.press("Enter");
		await expect(
			pager(page).getByRole("button", { name: "Jump to page" }),
		).toBeFocused();
		await pager(page).getByRole("button", { name: "Jump to page" }).click();
		await jump.press("Escape");
		await expect(
			pager(page).getByRole("button", { name: "Jump to page" }),
		).toBeFocused();
		await pager(page).getByRole("button", { name: "Jump to page" }).click();
		await jump.fill("8");
		await jump.press("Enter");
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(1);
		await expect(page.locator(`.${prefix}-card__title`)).toHaveText(
			`${title} 085`,
		);
		await expect(next(page)).toBeDisabled();
		await expectToolsBelowNavbar(page, prefix);
		await page.locator("[data-pagination-peer]").click();
		await expect(page).toHaveURL(
			new RegExp(`${root + (domain === "friends" ? "anime" : "friends")}/$`),
		);
		await page.goBack();
		await expect(page).toHaveURL(/page=8/);
		await expect(page.locator(`.${prefix}-card__title`)).toHaveText(
			`${title} 085`,
		);
		await page.goBack();
		await expect(page).not.toHaveURL(/page=/);
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(12);
		await page.goForward();
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(1);
		await page.goto(`${root + domain}/?page=999&utm_source=test#results`, {
			waitUntil: "domcontentloaded",
		});
		await expect(page).toHaveURL(/page=8/);
		await expect(page).toHaveURL(/utm_source=test/);
		await expect(page).toHaveURL(/#results$/);
		await expect(page.locator(`.${prefix}-card`)).toHaveCount(1);
		for (const invalid of ["-1", "1.5", "abc"]) {
			await ready(page, domain, `?page=${invalid}`);
			await expect(page).not.toHaveURL(/page=/);
		}
	});
}

test("pageSize config and missing/invalid defaults", async ({ page }) => {
	await page.goto(`${root}small/`, { waitUntil: "domcontentloaded" });
	await expect(page.locator(".friend-card")).toHaveCount(5);
	await ready(page, "invalid");
});

test("slow covers and avatars stay local, failed and cached images settle", async ({
	page,
}) => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/pagination-media/*-1.svg", async (route) => {
		await gate;
		await route.fulfill({ contentType: "image/svg+xml", body: media });
	});
	await ready(page, "friends");
	const avatar = page.locator(".friend-card .m3-avatar").first();
	await expect(avatar.locator("img")).toHaveAttribute(
		"data-image-state",
		"pending",
	);
	await expect(avatar.locator(".m3-skeleton")).toBeVisible();
	const before = await avatar.boundingBox();
	release();
	await expect(avatar.locator("img")).toHaveAttribute(
		"data-image-state",
		"loaded",
	);
	await expect(avatar.locator(".m3-skeleton")).toBeHidden();
	expect(await avatar.boundingBox()).toEqual(before);
	await page.unroute("**/pagination-media/*-1.svg");
	const coverGate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/pagination-media/anime-1.svg", async (route) => {
		await coverGate;
		await route.fulfill({ contentType: "image/svg+xml", body: media });
	});
	await ready(page, "anime");
	const cover = page.locator(".anime-card__cover").first();
	await expect(cover.locator("img")).toHaveCSS("opacity", "0");
	await expect(cover.locator(".m3-skeleton")).toBeVisible();
	const coverBefore = await cover.boundingBox();
	await expect(page.locator(".anime-card__title").first()).toBeVisible();
	release();
	await expect(cover.locator("img")).toHaveAttribute(
		"data-image-state",
		"loaded",
	);
	await expect(cover.locator("img")).toHaveCSS("opacity", "1");
	expect(await cover.boundingBox()).toEqual(coverBefore);
	await page.unroute("**/pagination-media/anime-1.svg");
	await page.route("**/pagination-media/*-1.svg", (route) => route.abort());
	await ready(page, "anime");
	await expect(page.locator(".anime-card__placeholder").first()).toBeVisible();
	await expect(page.locator(".anime-card__cover").first()).toHaveAccessibleName(
		"Anime 001 8",
	);
	await expect(page.locator(".anime-card__cover-img").nth(1)).toHaveAttribute(
		"data-image-state",
		"loaded",
	);
	await ready(page, "friends");
	await expect(avatar.locator(".m3-avatar__fallback")).toHaveText("F");
});

test("real Swup wait shows route progress and all failure exits clear it", async ({
	page,
}) => {
	await ready(page, "friends");
	await page.waitForFunction(() => Boolean(window.swup?.hooks));
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	await page.route("**/pagination-regression/anime/**", async (route) => {
		const response = await route.fetch();
		await gate;
		await route.fulfill({ response });
	});
	await page.locator("[data-pagination-peer]").click();
	await expect(page.locator(".route-progress")).toHaveCSS("opacity", "1");
	release();
	await expect(page.locator(".anime-card")).toHaveCount(12);
	await expect(page.locator(".route-progress")).toHaveCSS("opacity", "0");
	// The real visit ends after `page:view`, and `visit:end` clears the shell
	// classes by hiding the bar; wait for that before synthesising events, or a
	// late hide can race the synthetic `visit:start` and keep opacity at 0.
	await expect(page.locator("html")).not.toHaveClass(/is-changing/);
	for (const name of [
		"visit:abort",
		"visit:fail",
		"fetch:error",
		"fetch:timeout",
	]) {
		await page.evaluate(() =>
			document.dispatchEvent(new CustomEvent("swup:visit:start")),
		);
		await expect(page.locator(".route-progress")).toHaveCSS("opacity", "1");
		await page.evaluate(
			(event) => document.dispatchEvent(new CustomEvent(`swup:${event}`)),
			name,
		);
		await expect(page.locator(".route-progress")).toHaveCSS("opacity", "0");
	}
});

test("repeated soft visits keep one owner for list history", async ({
	page,
}) => {
	await ready(page, "friends");
	await page.waitForFunction(() => Boolean(window.swup?.hooks));
	for (let visit = 0; visit < 3; visit++) {
		await next(page).click();
		await expect(page.locator(".friend-card__title").first()).toHaveText(
			"Friend 013",
		);
		await page.locator("[data-pagination-peer]").click();
		await expect(page.locator(".anime-card")).toHaveCount(12);
		await page.locator("[data-pagination-peer]").click();
		await expect(page.locator(".friend-card__title").first()).toHaveText(
			"Friend 001",
		);
		await next(page).click();
		await page.goBack();
		await expect(page.locator(".friend-card__title").first()).toHaveText(
			"Friend 001",
		);
	}
});

test("pager fits wide and narrow columns without horizontal overflow", async ({
	page,
}, testInfo) => {
	await ready(page, "friends");
	await page.goto(`${root}window/?page=5`, { waitUntil: "domcontentloaded" });
	await expect(page.locator(".friend-card__title").first()).toHaveText(
		"Friend 041",
	);
	for (const width of [1800, 1280, 768, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await pager(page).scrollIntoViewIfNeeded();
		const geometry = await pager(page).evaluate((el) => ({
			width: el.clientWidth,
			scroll: el.scrollWidth,
			breakpoint: 640,
		}));
		expect(geometry.scroll).toBeLessThanOrEqual(geometry.width);
		await expect(
			pager(page).locator(
				geometry.width >= geometry.breakpoint
					? ".m3-blog-pagination__desktop"
					: ".m3-blog-pagination__mobile",
			),
		).toBeVisible();
		const target = await next(page).boundingBox();
		expect(target?.width).toBeGreaterThanOrEqual(48);
		expect(target?.height).toBeGreaterThanOrEqual(48);
		if (width === 1800 || width === 390) {
			await page.screenshot({
				path: testInfo.outputPath(`pager-${width}.png`),
			});
		}
	}
});

test("static blog pager keeps links and mobile jump working", async ({
	page,
}) => {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	await page.setViewportSize({ width: 1800, height: 1000 });
	// This pager uses a deferred delegated script rather than a hydrated island.
	await page.goto("/", { waitUntil: "load" });
	const staticPager = page.locator(".m3-blog-pagination");
	await expect(staticPager.locator('[aria-current="page"]')).toHaveText("1");
	await staticPager
		.getByRole("link", { name: "Next page", exact: true })
		.click();
	await expect(page).toHaveURL(/\/2\/$/);
	await expect(staticPager.locator('[aria-current="page"]')).toHaveText("2");
	// Swup is idle-loaded; this link can still perform a full navigation.
	// Wait for the new document's delegated handler before clicking its jump.
	await page.waitForLoadState("load");
	await expect(page.locator("html")).not.toHaveClass(/is-changing/);
	await page.setViewportSize({ width: 390, height: 844 });
	await staticPager.getByRole("button", { name: "Jump to page" }).click();
	const input = staticPager.getByRole("textbox", { name: "Jump to page" });
	await input.fill("0");
	await input.press("Enter");
	await expect(input).toHaveCount(0);
	await expect(page).toHaveURL(/\/2\/$/);
	await staticPager.getByRole("button", { name: "Jump to page" }).click();
	await input.fill("1");
	await input.press("Enter");
	await expect(page).toHaveURL("/");
	await expect(staticPager.locator('[aria-current="page"]')).toHaveText("1");
	expect(errors).toEqual([]);
});

test("SSR keeps every entry accessible without JavaScript", async ({
	browser,
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false });
	const page = await context.newPage();
	try {
		await mockExternalRequests(page);
		await page.route("**/pagination-media/**", (route) =>
			route.fulfill({ contentType: "image/svg+xml", body: media }),
		);
		for (const domain of ["friends", "anime"]) {
			await page.goto(`${root + domain}/`, { waitUntil: "domcontentloaded" });
			const prefix = domain === "friends" ? "friend" : "anime";
			await expect(page.locator(`.${prefix}-card`)).toHaveCount(85);
			await expect(page.locator(`.${prefix}-card__title`).last()).toBeVisible();
			await expect(pager(page)).toHaveCount(0);
		}
	} finally {
		await context.close();
	}
});

test("pager renders localized names and page placeholders", async ({
	page,
}) => {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.evaluate(async () => {
		const target = document.createElement("div");
		target.id = "pagination-locale-probe";
		document.body.append(target);
		const { mountPaginationProbe } = await import(
			"/tests/site/fixtures/component-probes.ts"
		);
		await mountPaginationProbe(target);
	});
	const probe = page.locator("#pagination-locale-probe");
	await expect(probe.getByRole("navigation")).toHaveAccessibleName("分页导航");
	await expect(probe.locator('[aria-current="page"]')).toHaveAccessibleName(
		"第 2 页",
	);
	await expect(
		probe.getByRole("button", { name: "下一页", exact: true }),
	).toHaveCount(1);
});

for (const preference of ["system", "site"]) {
	test(`reduced motion ${preference} keeps local flips immediate`, async ({
		page,
	}) => {
		if (preference === "system")
			await page.emulateMedia({ reducedMotion: "reduce" });
		await ready(page, "anime");
		if (preference === "site")
			await page.evaluate(() =>
				document.documentElement.classList.add("motion-reduced"),
			);
		await next(page).click();
		await expect(page.locator(".anime-card__title").first()).toHaveText(
			"Anime 013",
		);
		expect(
			await page
				.locator(".anime-card")
				.first()
				.evaluate(
					(el) =>
						el.getAnimations().filter((a) => a.playState === "running").length,
				),
		).toBe(0);
	});
}

for (const theme of ["light", "dark"]) {
	test(`pagination a11y ${theme}`, async ({ page }) => {
		await page.addInitScript(
			(value) => localStorage.setItem("theme", value),
			theme,
		);
		await ready(page, "friends");
		await expect
			.poll(() =>
				page.evaluate(() =>
					document.documentElement.classList.contains("dark"),
				),
			)
			.toBe(theme === "dark");
		const result = await new AxeBuilder({ page })
			.include("nav.m3-blog-pagination")
			.withTags(["wcag2a", "wcag2aa", "wcag21aa"])
			.analyze();
		expect(result.violations).toEqual([]);
		const dimensions = await next(page).boundingBox();
		expect(dimensions?.width).toBeGreaterThanOrEqual(48);
		expect(dimensions?.height).toBeGreaterThanOrEqual(48);
	});
}
