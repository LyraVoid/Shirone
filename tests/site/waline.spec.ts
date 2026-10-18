import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
	commentConfig,
	resolveCommentOptions,
} from "../../src/config/commentConfig";

const options = resolveCommentOptions(commentConfig);
const enabled = options?.provider === "waline";
const waline = commentConfig.waline;
if (!waline)
	throw new Error("The theme's default Waline configuration is missing");
const ARTICLE = "/posts/guide/";
const OTHER_ARTICLE = "/posts/markdown-extended/";
const WRAPPER = "shirone-waline";

const SDK = `
window.__walineLoads = (window.__walineLoads || 0) + 1;
window.__walineMounts = window.__walineMounts || [];
window.__walineDestroyed = window.__walineDestroyed || [];
window.Waline = {
	init(options) {
		window.__walineMounts.push({ ...options, el: undefined });
		options.el.innerHTML = '<div class="wl-panel"><label>Comment<textarea class="wl-editor"></textarea></label><button class="wl-btn primary">Submit</button><label for="wl-image-upload" aria-label="Upload image"><span aria-hidden="true">Upload</span></label><input id="wl-image-upload" type="file" hidden></div>';
		return {
			destroy() {
				window.__walineDestroyed.push(options.path);
				options.el.replaceChildren();
			}
		};
	}
};
`;

async function mockWaline(page: Page) {
	await page.route(waline.scriptUrl, (route) =>
		route.fulfill({ contentType: "application/javascript", body: SDK }),
	);
	await page.route(waline.styleUrl, (route) =>
		route.fulfill({
			contentType: "text/css",
			body: `
			.wl-panel { background: var(--waline-bg-color); color: var(--waline-color); }
			.wl-editor { display: block; background: var(--waline-bg-color); color: var(--waline-color); }
			.wl-btn { background: var(--waline-theme-color); color: var(--waline-white); transition: color .4s; }
			`,
		}),
	);
}

async function mount(page: Page) {
	await page.locator(WRAPPER).scrollIntoViewIfNeeded();
	await expect(page.locator(WRAPPER)).toHaveAttribute(
		"data-waline-state",
		"ready",
	);
}

async function navigate(page: Page, path: string) {
	await page.waitForFunction(() => Boolean(window.swup));
	await page.evaluate(
		(target) =>
			new Promise<void>((resolve) => {
				document.addEventListener("swup:page:view", () => resolve(), {
					once: true,
				});
				void window.swup.navigate(target);
			}),
		path,
	);
	await page.waitForFunction(
		() => !document.documentElement.classList.contains("is-changing"),
	);
	await expect(page).toHaveURL(new RegExp(`${path}$`));
	await expect(page.locator("#swup-container")).toBeAttached();
}

async function snapshot(page: Page) {
	return page.evaluate(() => {
		const state = window as Window & {
			__walineLoads?: number;
			__walineMounts?: { path: string; lang: string; pageview: boolean }[];
			__walineDestroyed?: string[];
		};
		return {
			loads: state.__walineLoads ?? 0,
			mounts: state.__walineMounts ?? [],
			destroyed: state.__walineDestroyed ?? [],
		};
	});
}

test("pages without comments make no Waline requests or DOM", async ({
	page,
}) => {
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("@waline/")) requests.push(request.url());
	});
	await page.goto("/");
	await expect(page.locator(WRAPPER)).toHaveCount(0);
	await expect(page.locator("[data-waline-style]")).toHaveCount(0);
	expect(requests).toEqual([]);
});

test("disabled comments leave article DOM and resources unchanged", async ({
	page,
}) => {
	test.skip(options !== null, "Run with comments disabled or incomplete");
	const requests: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("@waline/")) requests.push(request.url());
	});
	await page.goto(ARTICLE);
	await expect(page.locator("#comments")).toHaveCount(0);
	await expect(page.locator(WRAPPER)).toHaveCount(0);
	expect(requests).toEqual([]);
});

test.describe("Waline enabled", () => {
	test.skip(
		!enabled,
		"Enable Waline with a test serverURL to exercise the provider",
	);
	test.beforeEach(async ({ page }) => {
		await mockWaline(page);
	});

	test("loads JS and CSS only near the viewport and mounts once", async ({
		page,
	}) => {
		const resources: string[] = [];
		page.on("request", (request) => {
			if ([waline.scriptUrl, waline.styleUrl].includes(request.url()))
				resources.push(request.url());
		});
		await page.goto(ARTICLE);
		if (commentConfig.lazy) expect(resources).toEqual([]);
		await mount(page);
		await page.evaluate(() => {
			document.dispatchEvent(new Event("swup:content:replace"));
			document.dispatchEvent(new Event("swup:page:view"));
		});
		expect(resources.sort()).toEqual(
			[waline.scriptUrl, waline.styleUrl].sort(),
		);
		const state = await snapshot(page);
		expect(state.loads).toBe(1);
		expect(state.mounts).toHaveLength(1);
		expect(state.mounts[0]).toMatchObject({
			path: ARTICLE,
			pageview: false,
			...(waline.locale ? { locale: waline.locale } : {}),
			...(waline.emoji !== undefined ? { emoji: waline.emoji } : {}),
		});
		expect(state.mounts[0]).not.toHaveProperty("placeholder");
		await expect(page.locator(".waline-loading")).toBeHidden();
	});

	test("loads immediately when lazy is false", async ({ page }) => {
		await page.route("**/posts/guide/", async (route) => {
			if (!route.request().isNavigationRequest()) {
				await route.continue();
				return;
			}
			const response = await route.fetch();
			const html = (await response.text()).replace(
				'data-waline-lazy="true"',
				'data-waline-lazy="false"',
			);
			await route.fulfill({ response, body: html });
		});
		await page.goto(ARTICLE);
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"ready",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	});

	test("upload control is keyboard accessible", async ({ page }) => {
		await page.goto(ARTICLE);
		await mount(page);
		const chooser = page.waitForEvent("filechooser");
		await page.getByRole("button", { name: "Upload image" }).press("Enter");
		expect(await (await chooser).element().getAttribute("type")).toBe("file");
	});

	for (const resource of ["scriptUrl", "styleUrl"] as const) {
		test(`recovers from ${resource} failure through the retry button`, async ({
			page,
		}) => {
			let failed = false;
			await page.route(waline[resource], async (route) => {
				if (!failed) {
					failed = true;
					await route.abort();
				} else {
					await route.fallback();
				}
			});
			await page.goto(ARTICLE);
			await page.locator(WRAPPER).scrollIntoViewIfNeeded();
			await expect(page.locator(WRAPPER)).toHaveAttribute(
				"data-waline-state",
				"error",
			);
			await expect(page.locator(".waline-loading")).toBeHidden();
			await page.locator(".waline-retry").click();
			await expect(page.locator(WRAPPER)).toHaveAttribute(
				"data-waline-state",
				"ready",
			);
			expect((await snapshot(page)).mounts).toHaveLength(1);
		});
	}

	test("destroys old instances and remounts correct paths through real Swup navigation", async ({
		page,
	}) => {
		await page.goto("/");
		await navigate(page, ARTICLE);
		await mount(page);
		await navigate(page, OTHER_ARTICLE);
		await mount(page);
		await navigate(page, "/");
		await expect(page.locator(WRAPPER)).toHaveCount(0);
		await expect(page.locator("[data-waline-style]")).toHaveCount(0);
		await navigate(page, ARTICLE);
		await mount(page);
		const state = await snapshot(page);
		expect(state.loads).toBe(1);
		expect(state.mounts.map((item) => item.path)).toEqual([
			ARTICLE,
			OTHER_ARTICLE,
			ARTICLE,
		]);
		expect(state.destroyed).toEqual([ARTICLE, OTHER_ARTICLE]);
	});

	test("ignores late SDK completion after leaving a page", async ({ page }) => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route(waline.scriptUrl, async (route) => {
			await gate;
			await route.fulfill({ contentType: "application/javascript", body: SDK });
		});
		await page.goto(ARTICLE);
		const started = page.waitForRequest(waline.scriptUrl);
		await page.locator(WRAPPER).scrollIntoViewIfNeeded();
		await started;
		await navigate(page, "/");
		release();
		await expect.poll(async () => (await snapshot(page)).loads).toBe(1);
		expect((await snapshot(page)).mounts).toEqual([]);
		await expect(page.locator("[data-waline-style]")).toHaveCount(0);
		await navigate(page, OTHER_ARTICLE);
		await mount(page);
		expect((await snapshot(page)).mounts.map((item) => item.path)).toEqual([
			OTHER_ARTICLE,
		]);
	});

	test("follows theme tokens, fits mobile and respects reduced motion", async ({
		page,
	}) => {
		await page.addInitScript(() => localStorage.setItem("theme", "auto"));
		await page.goto(ARTICLE);
		await mount(page);
		await page.waitForFunction(() =>
			document.documentElement.style
				.getPropertyValue("--mc-primary")
				.startsWith("#"),
		);
		await page.waitForFunction(() =>
			[...document.querySelectorAll(".onload-animation")].every(
				(el) =>
					(el as HTMLElement).offsetParent === null ||
					getComputedStyle(el).opacity === "1",
			),
		);
		for (const dark of [false, true]) {
			await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
			await expect
				.poll(() =>
					page.evaluate(() =>
						document.documentElement.classList.contains("dark"),
					),
				)
				.toBe(dark);
			await expect
				.poll(() =>
					page.locator(".wl-panel").evaluate((el) => {
						const expected = document.createElement("span");
						expected.style.backgroundColor = "var(--card-bg)";
						el.append(expected);
						const matches =
							getComputedStyle(el).backgroundColor ===
							getComputedStyle(expected).backgroundColor;
						expected.remove();
						return matches;
					}),
				)
				.toBe(true);
			const result = await new AxeBuilder({ page })
				.include("#comments")
				.analyze();
			expect(result.violations).toEqual([]);
		}
		await page.setViewportSize({ width: 390, height: 844 });
		const box = await page.locator(WRAPPER).boundingBox();
		expect(box).not.toBeNull();
		if (!box) throw new Error("Waline must have a visible layout box");
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(390);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(page.locator(".wl-btn")).toHaveCSS(
			"transition-duration",
			"0s",
		);
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.evaluate(() =>
			document.documentElement.classList.add("motion-reduced"),
		);
		await expect(page.locator(".wl-btn")).toHaveCSS(
			"transition-duration",
			"0s",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	});
});

test.describe("Waline without JavaScript", () => {
	test.skip(!enabled, "Enable Waline to verify its noscript fallback");
	test.use({ javaScriptEnabled: false });
	test("shows a localized fallback without fetching the SDK", async ({
		page,
	}) => {
		const resources: string[] = [];
		page.on("request", (request) => {
			if ([waline.scriptUrl, waline.styleUrl].includes(request.url()))
				resources.push(request.url());
		});
		await page.goto(ARTICLE);
		await expect(page.locator(".waline-noscript")).toBeVisible();
		await expect(page.locator(".waline-loading")).toBeHidden();
		expect(resources).toEqual([]);
	});
});

test("Waline script timeout clears loading and permits retry", async ({
	page,
}) => {
	test.skip(!enabled, "Enable Waline to verify loading timeouts");
	await mockWaline(page);
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let first = true;
	await page.route(waline.scriptUrl, async (route) => {
		if (first) {
			first = false;
			await gate;
		}
		await route.fallback();
	});
	try {
		await page.goto(ARTICLE, { waitUntil: "domcontentloaded" });
		await page.locator(WRAPPER).scrollIntoViewIfNeeded();
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"error",
			{ timeout: 12_000 },
		);
		await expect(page.locator(".waline-loading")).toBeHidden();
		release();
		await page.locator(".waline-retry").click();
		await expect(page.locator(WRAPPER)).toHaveAttribute(
			"data-waline-state",
			"ready",
		);
		expect((await snapshot(page)).mounts).toHaveLength(1);
	} finally {
		release();
	}
});
