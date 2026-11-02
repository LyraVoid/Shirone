import AxeBuilder from "@axe-core/playwright";
import type { Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";

const PLAIN_POST_PATH = "/posts/admonitions/";
const RICH_POST_PATH = "/posts/mdx-showcase/";
const IMAGE_GRID_POST_PATH = "/posts/image-grid-demo/";
const CODE_POST_PATH = "/posts/expressive-code/";
const TREE_POST_PATH = "/posts/markdown-enhancements/";
const COLLAPSE_POST_PATH = "/posts/collapse-panels/";
const MARKER_POST_PATH = "/posts/marker-highlights/";
const CONTENT_ANNOTATIONS_POST_PATH = "/posts/content-annotations/";
const STEPS_POST_PATH = "/posts/steps/";
const ADMONITIONS_POST_PATH = "/posts/admonitions/";
const ADMONITION_FREE_POST_PATH = "/posts/expressive-code/";
const ABBREVIATIONS_POST_PATH = "/posts/markdown-abbreviations/";
const OPTION_GROUPS_POST_PATH = "/posts/option-groups/";
const IMAGE_PRESENTATIONS_POST_PATH = "/posts/markdown-extended/";
const IMAGE_PRESENTATIONS_FREE_POST_PATH = "/posts/expressive-code/";
const EXPRESSIVE_CODE_FREE_PATH = "/";
const GITHUB_CARD_PATH = "/about/";
const ACFUN_VIDEO_PATH = "/posts/video/";
const ARTPLAYER_VIDEO_PATH = "/posts/video/";
const AUDIO_READER_POST_PATH = "/posts/audio-reader/";
const BILIBILI_VIDEO_PATH = "/posts/video/";
const YOUTUBE_VIDEO_PATH = "/posts/video/";

const GITHUB_REPOSITORY_MOCK = {
	description: "A static blog template built with Astro.",
	language: "TypeScript",
	stargazers_count: 4860,
	forks_count: 1243,
	owner: {
		avatar_url:
			"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><rect width='24' height='24' rx='12' fill='%236366f1'/></svg>",
	},
	license: { spdx_id: "MIT" },
};

const optionalRuntimeModules = {
	fancybox: /\/src\/utils\/fancybox-handler\.ts(?:\?|$)/,
	codeCollapse: /\/src\/utils\/code-collapse\.ts(?:\?|$)/,
	katex: /\/src\/utils\/katex-scroll\.ts(?:\?|$)/,
	mermaid: /\/src\/utils\/mermaid\.ts(?:\?|$)/,
	trees: /\/src\/styles\/markdown\/trees\.css(?:\?|$)/,
	collapsePanels: /\/src\/styles\/markdown\/collapse-panels\.css(?:\?|$)/,
	marker: /\/src\/styles\/markdown\/marker\.css(?:\?|$)/,
	contentAnnotations:
		/\/src\/styles\/markdown\/content-annotations\.css(?:\?|$)/,
	steps: /\/src\/styles\/markdown\/steps\.css(?:\?|$)/,
	admonitions: /\/src\/styles\/markdown\/admonitions\.css(?:\?|$)/,
	abbreviations: /\/src\/utils\/abbreviations\.ts(?:\?|$)/,
	optionGroups: /\/src\/utils\/option-groups\.ts(?:\?|$)/,
	codeTree: /\/src\/utils\/code-tree\.ts(?:\?|$)/,
};

function trackOptionalRuntimeRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		const url = request.url();
		if (
			Object.values(optionalRuntimeModules).some((pattern) => pattern.test(url))
		) {
			requests.push(url);
		}
	});
	return requests;
}

function hasRequestFor(requests: string[], modules: Array<RegExp>): boolean {
	return requests.some((url) => modules.some((pattern) => pattern.test(url)));
}

function trackGitHubApiRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "api.github.com")
			requests.push(request.url());
	});
	return requests;
}

function trackAcFunPlayerRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "www.acfun.cn") {
			requests.push(request.url());
		}
	});
	return requests;
}

function trackArtPlayerVideoRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "www.pexels.com") {
			requests.push(request.url());
		}
	});
	return requests;
}

function trackAudioReaderRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).pathname === "/assets/audio/Baka.wav") {
			requests.push(request.url());
		}
	});
	return requests;
}

function trackBilibiliPlayerRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "player.bilibili.com")
			requests.push(request.url());
	});
	return requests;
}

function trackYouTubePlayerRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on("request", (request: Request) => {
		if (new URL(request.url()).hostname === "www.youtube-nocookie.com") {
			requests.push(request.url());
		}
	});
	return requests;
}

test.describe("Markdown syntax runtime loading", () => {
	test("preloads ArtPlayer as a native video and cleans styles on navigation", async ({
		page,
	}) => {
		const videoRequests = trackArtPlayerVideoRequests(page);
		await page.route(
			"https://www.pexels.com/download/video/38538991/",
			(route) =>
				route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
		);

		await page.goto(ARTPLAYER_VIDEO_PATH, { waitUntil: "networkidle" });
		const player = page.locator("#swup-container [data-artplayer]");
		const video = player.locator("video");
		await expect(player).toHaveCount(1);
		await expect(player.locator("iframe")).toHaveCount(0);
		await expect(video).toHaveAttribute("preload", "auto");
		await expect(video).toHaveAttribute("controls", "");
		await expect(video).toHaveAttribute("playsinline", "");
		await expect(video).toHaveAttribute(
			"src",
			"https://www.pexels.com/download/video/38538991/",
		);
		await expect(video).not.toHaveAttribute("poster");
		expect(videoRequests.length).toBeGreaterThan(0);
		await expect(
			page.locator('style[data-swup-optional="artplayer"]'),
		).toHaveCount(1);
		const a11y = await new AxeBuilder({ page })
			.include("[data-artplayer]")
			.analyze();
		expect(a11y.violations).toEqual([]);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		// Swup prunes optional resources during its render settle; against
		// PLAIN_POST_PATH the marker can survive about five seconds, which is
		// exactly the default retry budget.
		await expect(
			page.locator('style[data-swup-optional="artplayer"]'),
		).toHaveCount(0, { timeout: 15_000 });
	});

	test("renders Audio Reader as a compact speaker control without preloading", async ({
		page,
	}) => {
		const audioRequests = trackAudioReaderRequests(page);
		await page.addInitScript(() => {
			const playingMedia = new WeakSet<HTMLMediaElement>();
			Object.defineProperty(HTMLMediaElement.prototype, "paused", {
				configurable: true,
				get(this: HTMLMediaElement) {
					return !playingMedia.has(this);
				},
			});
			Object.defineProperty(HTMLMediaElement.prototype, "play", {
				configurable: true,
				value(this: HTMLMediaElement) {
					playingMedia.add(this);
					this.dispatchEvent(new Event("play"));
					return Promise.resolve();
				},
			});
			Object.defineProperty(HTMLMediaElement.prototype, "pause", {
				configurable: true,
				value(this: HTMLMediaElement) {
					playingMedia.delete(this);
					this.dispatchEvent(new Event("pause"));
				},
			});
		});

		await page.goto(AUDIO_READER_POST_PATH, { waitUntil: "networkidle" });
		const readers = page.locator("#swup-container [data-audio-reader]");
		await expect(readers).toHaveCount(5);
		const reader = readers.first();
		const audio = reader.locator("audio");
		const toggle = reader.locator("[data-audio-reader-toggle]");
		expect(await toggle.evaluate((element) => element.tagName)).toBe("BUTTON");
		expect(
			await readers
				.locator("audio")
				.evaluateAll((elements) =>
					elements.map((element) => element.getAttribute("src")),
				),
		).toEqual([
			"/assets/audio/Baka.wav",
			"/assets/audio/Ciallo.wav",
			"/assets/audio/Ehe.wav",
			"/assets/audio/Imoi.wav",
			"/assets/audio/Zako.wav",
		]);
		await expect(audio).toHaveAttribute("preload", "none");
		await expect(audio).not.toHaveAttribute("controls", "");
		await expect(reader.locator("audio[controls]")).toHaveCount(0);
		expect(audioRequests).toEqual([]);
		await expect(toggle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		const inlineScale = await toggle.evaluate((element) => {
			const fontSize = Number.parseFloat(getComputedStyle(element).fontSize);
			return element.getBoundingClientRect().width / fontSize;
		});
		expect(inlineScale).toBeLessThanOrEqual(1.5);
		await expect(
			page.locator('style[data-swup-optional="audio-reader"]'),
		).toHaveCount(1);

		await toggle.click();
		await expect(reader).toHaveAttribute("data-audio-reader-state", "playing");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await expect(reader.locator(".m3-audio-reader__speaker")).toHaveCSS(
			"animation-name",
			"m3-audio-reader-wave",
		);
		await page.emulateMedia({ reducedMotion: "reduce" });
		await expect(reader.locator(".m3-audio-reader__speaker")).toHaveCSS(
			"animation-name",
			"none",
		);
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.evaluate(() =>
			document.documentElement.classList.add("motion-reduced"),
		);
		await expect(reader.locator(".m3-audio-reader__speaker")).toHaveCSS(
			"animation-name",
			"none",
		);
		await toggle.press("Space");
		await expect(reader).toHaveAttribute("data-audio-reader-state", "paused");
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await toggle.press("Space");
		await expect(reader).toHaveAttribute("data-audio-reader-state", "playing");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		const a11y = await new AxeBuilder({ page })
			.include("[data-audio-reader]")
			.analyze();
		expect(a11y.violations).toEqual([]);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		// Swup prunes optional resources during its render settle; against
		// PLAIN_POST_PATH the marker can survive about five seconds, which is
		// exactly the default retry budget.
		await expect(
			page.locator('style[data-swup-optional="audio-reader"]'),
		).toHaveCount(0, { timeout: 15_000 });
	});

	test("preloads the AcFun player near the viewport and cleans styles on navigation", async ({
		page,
	}) => {
		const playerRequests = trackAcFunPlayerRequests(page);
		await page.route("https://www.acfun.cn/player/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<!doctype html><main><h1>Player</h1></main>",
			}),
		);

		await page.goto(ACFUN_VIDEO_PATH, { waitUntil: "networkidle" });
		const facade = page.locator("#swup-container [data-acfun]");
		await expect(facade).toHaveCount(1);
		await expect(facade.locator(".m3-acfun__poster")).toHaveCount(0);
		await facade.scrollIntoViewIfNeeded();
		await expect(facade.locator("iframe")).toHaveCount(1);
		// The player runtime loads on demand, so the request can lag the
		// iframe on a cold Vite cache. Poll rather than asserting once; a
		// wrong src still fails inside the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 8_000 })
			.toEqual(["https://www.acfun.cn/player/ac48649632"]);
		await expect(page.locator('style[data-swup-optional="acfun"]')).toHaveCount(
			1,
		);
		await expect(facade.locator(".m3-acfun__stage")).toHaveCSS(
			"aspect-ratio",
			"16 / 9",
		);
		await expect(facade.locator(".m3-acfun__source")).toHaveAttribute(
			"href",
			"https://www.acfun.cn/v/ac48649632",
		);
		const a11y = await new AxeBuilder({ page })
			.include("[data-acfun]")
			.analyze();
		expect(a11y.violations).toEqual([]);

		const player = facade.locator("iframe");
		await expect(player).toHaveAttribute(
			"src",
			"https://www.acfun.cn/player/ac48649632",
		);
		await expect(player).toHaveAttribute("loading", "lazy");
		await expect(player).toHaveAttribute(
			"referrerpolicy",
			"strict-origin-when-cross-origin",
		);
		// The player runtime loads on demand, so the request can lag the
		// iframe on a cold Vite cache. Poll rather than asserting once; a
		// wrong src still fails inside the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 8_000 })
			.toEqual(["https://www.acfun.cn/player/ac48649632"]);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		// Swup prunes the outgoing page's optional resources during its render
		// settle, so the element disappears a beat after the URL changes. How
		// long that beat is depends on how much the incoming page has to lay
		// out: measured against /posts/admonitions/ the marker survives roughly
		// five seconds, which is exactly the default retry budget.
		await expect(page.locator('style[data-swup-optional="acfun"]')).toHaveCount(
			0,
			{
				timeout: 15_000,
			},
		);
		await expect(
			page.locator("#swup-container [data-acfun] iframe"),
		).toHaveCount(0);
	});

	test("preloads the YouTube player near the viewport and cleans styles on navigation", async ({
		page,
	}) => {
		const playerRequests = trackYouTubePlayerRequests(page);
		await page.route("https://www.youtube-nocookie.com/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<!doctype html><main><h1>Player</h1></main>",
			}),
		);

		await page.goto(YOUTUBE_VIDEO_PATH, { waitUntil: "networkidle" });
		const facade = page.locator("#swup-container [data-youtube]");
		await expect(facade).toHaveCount(1);
		await expect(facade.locator(".m3-youtube__poster")).toHaveCount(0);
		await facade.scrollIntoViewIfNeeded();
		await expect(facade.locator("iframe")).toHaveCount(1);
		// The player runtime is loaded on demand, so on a cold Vite cache the
		// facade can render before its script hydrates. Poll instead of
		// asserting once; a genuinely wrong src still fails within the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 15_000 })
			.toEqual([
				"https://www.youtube-nocookie.com/embed/5gIf0_xpFPI?rel=0&modestbranding=1",
			]);
		await expect(
			page.locator('style[data-swup-optional="youtube"]'),
		).toHaveCount(1);
		await expect(facade.locator(".m3-youtube__stage")).toHaveCSS(
			"aspect-ratio",
			"16 / 9",
		);
		await expect(facade.locator(".m3-youtube__source")).toHaveAttribute(
			"href",
			"https://www.youtube.com/watch?v=5gIf0_xpFPI",
		);
		const a11y = await new AxeBuilder({ page })
			.include("[data-youtube]")
			.analyze();
		expect(a11y.violations).toEqual([]);

		const player = facade.locator("iframe");
		await expect(player).toHaveAttribute(
			"src",
			"https://www.youtube-nocookie.com/embed/5gIf0_xpFPI?rel=0&modestbranding=1",
		);
		await expect(player).toHaveAttribute("loading", "lazy");
		await expect(player).toHaveAttribute(
			"referrerpolicy",
			"strict-origin-when-cross-origin",
		);
		// The player runtime is loaded on demand, so on a cold Vite cache the
		// facade can render before its script hydrates. Poll instead of
		// asserting once; a genuinely wrong src still fails within the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 15_000 })
			.toEqual([
				"https://www.youtube-nocookie.com/embed/5gIf0_xpFPI?rel=0&modestbranding=1",
			]);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		// Swup prunes optional resources during its render settle; against
		// PLAIN_POST_PATH the marker can survive about five seconds, which is
		// exactly the default retry budget.
		await expect(
			page.locator('style[data-swup-optional="youtube"]'),
		).toHaveCount(0, { timeout: 15_000 });
		await expect(
			page.locator("#swup-container [data-youtube] iframe"),
		).toHaveCount(0);
	});

	test("preloads the Bilibili player near the viewport and cleans styles on navigation", async ({
		page,
	}) => {
		const playerRequests = trackBilibiliPlayerRequests(page);
		await page.route("https://player.bilibili.com/**", (route) =>
			route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<!doctype html><main><h1>Player</h1></main>",
			}),
		);

		await page.goto(BILIBILI_VIDEO_PATH, { waitUntil: "networkidle" });
		const facade = page.locator("#swup-container [data-bilibili]");
		await expect(facade).toHaveCount(1);
		await expect(facade.locator(".m3-bilibili__poster")).toHaveCount(0);
		await facade.scrollIntoViewIfNeeded();
		await expect(facade.locator("iframe")).toHaveCount(1);
		// The player runtime loads on demand, so the request can lag the
		// iframe on a cold Vite cache. Poll rather than asserting once; a
		// wrong src still fails inside the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 15_000 })
			.toEqual([
				"https://player.bilibili.com/player.html?bvid=BV1fK4y1s7Qf&p=1&high_quality=1&danmaku=0",
			]);
		await expect(
			page.locator('style[data-swup-optional="bilibili"]'),
		).toHaveCount(1);
		await expect(facade.locator(".m3-bilibili__stage")).toHaveCSS(
			"aspect-ratio",
			"16 / 9",
		);
		await expect(facade.locator(".m3-bilibili__source")).toHaveAttribute(
			"href",
			"https://www.bilibili.com/video/BV1fK4y1s7Qf/?p=1",
		);
		const a11y = await new AxeBuilder({ page })
			.include("[data-bilibili]")
			.analyze();
		expect(a11y.violations).toEqual([]);

		const player = facade.locator("iframe");
		await expect(player).toHaveAttribute(
			"src",
			"https://player.bilibili.com/player.html?bvid=BV1fK4y1s7Qf&p=1&high_quality=1&danmaku=0",
		);
		await expect(player).toHaveAttribute("loading", "lazy");
		await expect(player).toHaveAttribute(
			"referrerpolicy",
			"strict-origin-when-cross-origin",
		);
		// The player runtime loads on demand, so the request can lag the
		// iframe on a cold Vite cache. Poll rather than asserting once; a
		// wrong src still fails inside the timeout.
		await expect
			.poll(() => playerRequests, { timeout: 15_000 })
			.toEqual([
				"https://player.bilibili.com/player.html?bvid=BV1fK4y1s7Qf&p=1&high_quality=1&danmaku=0",
			]);

		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		// Swup prunes optional resources during its render settle; against
		// PLAIN_POST_PATH the marker can survive about five seconds, which is
		// exactly the default retry budget.
		await expect(
			page.locator('style[data-swup-optional="bilibili"]'),
		).toHaveCount(0, { timeout: 15_000 });
		await expect(
			page.locator("#swup-container [data-bilibili] iframe"),
		).toHaveCount(0);
	});

	test("hydrates legacy GitHub cards only after their syntax is rendered", async ({
		page,
	}) => {
		const githubApiRequests = trackGitHubApiRequests(page);
		await page.route(
			"https://api.github.com/repos/LyraVoid/Shirone",
			async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 250));
				await route.fulfill({
					status: 200,
					contentType: "application/json",
					body: JSON.stringify(GITHUB_REPOSITORY_MOCK),
				});
			},
		);

		await page.goto(GITHUB_CARD_PATH, { waitUntil: "domcontentloaded" });
		const card = page.locator("#swup-container a.card-github");
		await expect(card).toHaveCount(1);
		await expect(card).toBeVisible();
		await expect(card).toHaveAttribute(
			"href",
			"https://github.com/LyraVoid/Shirone",
		);
		await expect(card).toHaveAttribute("rel", "noopener noreferrer");
		await expect(card).toHaveCSS("display", "block");
		await expect(card.locator("script")).toHaveCount(0);
		await expect
			.poll(async () => {
				return card.evaluate(
					(element) =>
						element.classList.contains("fetch-waiting") ||
						element.getAttribute("data-github-state") === "ready",
				);
			})
			.toBe(true);
		await expect(card.locator("[data-github-description]")).not.toBeHidden();
		await expect(card.locator("[data-github-info]")).not.toBeHidden();
		await expect(card.locator("[data-github-avatar]")).not.toBeHidden();
		expect(
			await card.evaluate((element) => element.offsetHeight),
		).toBeGreaterThan(80);
		await expect(card).toHaveAttribute("data-github-state", "ready");
		await expect(card).not.toHaveClass(/\bfetch-waiting\b/);
		await expect(card.locator("[data-github-description]")).toHaveText(
			GITHUB_REPOSITORY_MOCK.description,
		);
		await expect(card.locator("[data-github-stars]")).toHaveText("4.9K");
		await expect(card.locator("[data-github-forks]")).toHaveText("1.2K");
		await expect(card.locator("[data-github-license]")).toHaveText("MIT");
		await expect(card.locator("[data-github-language]")).toHaveText(
			"TypeScript",
		);
		await expect(card.locator("[data-github-avatar]")).toHaveAttribute(
			"src",
			GITHUB_REPOSITORY_MOCK.owner.avatar_url,
		);
		expect(githubApiRequests).toEqual([
			"https://api.github.com/repos/LyraVoid/Shirone",
		]);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await page.evaluate(
			(path) => window.swup?.navigate(path),
			GITHUB_CARD_PATH,
		);
		await page.waitForURL(`**${GITHUB_CARD_PATH}`);
		await expect(card).toHaveCount(1);
		await expect(card).toBeVisible();
		await expect(card.locator("script")).toHaveCount(0);
		await expect(card).toHaveAttribute("data-github-state", "ready");
		expect(githubApiRequests).toEqual([
			"https://api.github.com/repos/LyraVoid/Shirone",
			"https://api.github.com/repos/LyraVoid/Shirone",
		]);
	});

	test("keeps the SSR fallback when GitHub API returns an error", async ({
		page,
	}) => {
		await page.route("https://api.github.com/repos/LyraVoid/Shirone", (route) =>
			route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ message: "service unavailable" }),
			}),
		);

		await page.goto(GITHUB_CARD_PATH, { waitUntil: "domcontentloaded" });
		const card = page.locator("#swup-container a.card-github");
		await expect(card).toHaveAttribute("data-github-state", "error");
		await expect(card).toHaveClass(/\bfetch-error\b/);
		await expect(card).toHaveAttribute(
			"href",
			"https://github.com/LyraVoid/Shirone",
		);
		await expect(card.locator("[data-github-description]")).toBeHidden();
		await expect(card.locator("[data-github-info]")).toBeHidden();
		await expect(card.locator("[data-github-avatar]")).toBeHidden();
		await expect(card).toHaveAttribute("aria-busy", "false");
	});

	test("resolves a timed out GitHub request to the SSR fallback", async ({
		page,
	}) => {
		await page.route(
			"https://api.github.com/repos/LyraVoid/Shirone",
			async (route) => {
				await new Promise((resolve) => setTimeout(resolve, 10_250));
				try {
					await route.fulfill({
						status: 200,
						contentType: "application/json",
						body: JSON.stringify(GITHUB_REPOSITORY_MOCK),
					});
				} catch {
					// The client timeout aborts this route before the delayed response.
				}
			},
		);

		await page.goto(GITHUB_CARD_PATH, { waitUntil: "domcontentloaded" });
		const card = page.locator("#swup-container a.card-github");
		await expect(card).toHaveAttribute("data-github-state", "error", {
			timeout: 15_000,
		});
		await expect(card).toHaveClass(/\bfetch-error\b/);
		await expect(card.locator("[data-github-description]")).toBeHidden();
		await expect(card.locator("[data-github-info]")).toBeHidden();
		await expect(card).toHaveAttribute("aria-busy", "false");
	});

	test("keeps Mermaid styles page-scoped while deferring its runtime", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(
			hasRequestFor(requests, [
				optionalRuntimeModules.katex,
				optionalRuntimeModules.mermaid,
			]),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), RICH_POST_PATH);
		await page.waitForURL(`**${RICH_POST_PATH}`);
		await expect(page.locator(".markdown-mermaid").first()).toHaveAttribute(
			"data-mermaid-state",
			"ready",
			{ timeout: 15_000 },
		);
		const mermaidSurface = page.locator(".markdown-mermaid__surface").first();
		await expect(
			page.locator('style[data-swup-optional="mermaid"]'),
		).toHaveCount(1);
		await expect(mermaidSurface).toHaveCSS("border-top-style", "solid");
		const formula = page.locator(".katex-display").first();
		await expect(page.locator('style[data-swup-optional="math"]')).toHaveCount(
			1,
		);
		await formula.scrollIntoViewIfNeeded();
		await expect(formula).toHaveAttribute(
			"data-scrollbar-initialized",
			"true",
			{ timeout: 15_000 },
		);

		expect(
			requests.some((url) => optionalRuntimeModules.mermaid.test(url)),
		).toBe(true);
		expect(requests.some((url) => /mermaid\.css(?:\?|$)/.test(url))).toBe(
			false,
		);
		expect(requests.some((url) => optionalRuntimeModules.katex.test(url))).toBe(
			true,
		);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="mermaid"]'),
		).toHaveCount(0);
	});

	test("defers Fancybox until a Swup target contains a lightbox", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(hasRequestFor(requests, [optionalRuntimeModules.fancybox])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_GRID_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_GRID_POST_PATH}`);
		await expect(page.locator("html")).toHaveAttribute(
			"data-fancybox-ready",
			"true",
			{ timeout: 15_000 },
		);

		expect(
			requests.some((url) => optionalRuntimeModules.fancybox.test(url)),
		).toBe(true);
	});

	test("adds and removes image grid styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(0);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_GRID_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_GRID_POST_PATH}`);
		const imageGrid = page.locator(".image-grid").first();
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(1);
		await expect(imageGrid).toHaveCSS("display", "grid");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			EXPRESSIVE_CODE_FREE_PATH,
		);
		await page.waitForURL(`**${EXPRESSIVE_CODE_FREE_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="image-grids"]'),
		).toHaveCount(0);
	});

	test("adds and removes image presentation styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(IMAGE_PRESENTATIONS_FREE_POST_PATH, {
			waitUntil: "networkidle",
		});
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(0);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_PRESENTATIONS_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_PRESENTATIONS_POST_PATH}`);
		const imagePresentation = page.locator(".markdown-image-figure").first();
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(1);
		await expect(imagePresentation).toHaveCSS("margin-top", "24px");
		const captions = page.locator(".markdown-image-caption");
		await expect(captions).toHaveCount(2);
		for (const caption of await captions.all()) {
			await expect(caption).toHaveCSS("text-align", "center");
		}

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			IMAGE_PRESENTATIONS_FREE_POST_PATH,
		);
		await page.waitForURL(`**${IMAGE_PRESENTATIONS_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="image-presentations"]'),
		).toHaveCount(0);
	});

	test("loads code-collapse only for Markdown content with code blocks", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto("/", { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		expect(
			requests.some((url) => optionalRuntimeModules.codeCollapse.test(url)),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), CODE_POST_PATH);
		await page.waitForURL(`**${CODE_POST_PATH}`);
		const toggle = page.locator(".collapse-toggle-btn").first();
		await expect(toggle).toBeVisible();
		await expect(toggle).toHaveAttribute("aria-label", "Expand code block");
		await expect(toggle.locator("svg")).toHaveCSS("transform", "none");

		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-label", "Collapse code block");
		await expect(toggle.locator("svg")).toHaveCSS(
			"transform",
			"matrix(-1, 0, 0, -1, 0, 0)",
		);

		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-label", "Expand code block");
		await expect(toggle.locator("svg")).toHaveCSS("transform", "none");

		expect(
			requests.some((url) => optionalRuntimeModules.codeCollapse.test(url)),
		).toBe(true);
	});

	test("adds and removes Expressive Code styles with the Swup page lifecycle", async ({
		page,
	}) => {
		await page.goto(EXPRESSIVE_CODE_FREE_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(0);

		await page.evaluate((path) => window.swup?.navigate(path), CODE_POST_PATH);
		await page.waitForURL(`**${CODE_POST_PATH}`);
		const codeFrame = page.locator(".expressive-code .frame").first();
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(1);
		await expect(codeFrame).toHaveCSS("box-shadow", "none");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			EXPRESSIVE_CODE_FREE_PATH,
		);
		await page.waitForURL(`**${EXPRESSIVE_CODE_FREE_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="expressive-code"]'),
		).toHaveCount(0);
	});

	test("adds and removes tree styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			0,
			{ timeout: 15_000 },
		);
		expect(
			hasRequestFor(requests, [
				optionalRuntimeModules.trees,
				optionalRuntimeModules.codeTree,
			]),
		).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), TREE_POST_PATH);
		await page.waitForURL(`**${TREE_POST_PATH}`);
		const fileTree = page.locator(".m3-file-tree").first();
		await expect(fileTree).toBeVisible();
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			1,
		);
		await expect(fileTree).toHaveCSS("border-radius", "16px");

		const codeTreeButtons = page.locator(".m3-code-tree__file-btn");
		await codeTreeButtons.nth(1).click();
		await expect(codeTreeButtons.nth(1)).toHaveClass(
			/\bm3-code-tree__file-btn--active\b/,
		);
		await expect
			.poll(() =>
				hasRequestFor(requests, [
					optionalRuntimeModules.trees,
					optionalRuntimeModules.codeTree,
				]),
			)
			.toBe(true);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(page.locator('style[data-swup-optional="trees"]')).toHaveCount(
			0,
			{ timeout: 15_000 },
		);
	});

	test("adds and removes collapse panel styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.collapsePanels]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			COLLAPSE_POST_PATH,
		);
		await page.waitForURL(`**${COLLAPSE_POST_PATH}`);
		const collapsePanels = page.locator(".m3-collapse");
		await expect(collapsePanels).toHaveCount(2);
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(1);
		await expect(collapsePanels.first()).toHaveCSS("border-radius", "16px");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="collapse-panels"]'),
		).toHaveCount(0);
	});

	test("adds and removes marker styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.marker])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			MARKER_POST_PATH,
		);
		await page.waitForURL(`**${MARKER_POST_PATH}`);
		const marker = page.locator(".m3-marker").first();
		await expect(marker).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(1);
		await expect(marker).toHaveCSS("box-shadow", /inset/);

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="marker"]'),
		).toHaveCount(0);
	});

	test("adds and removes content annotation styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.contentAnnotations]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			CONTENT_ANNOTATIONS_POST_PATH,
		);
		await page.waitForURL(`**${CONTENT_ANNOTATIONS_POST_PATH}`);
		const trigger = page.locator(".m3-content-note__trigger").first();
		await expect(trigger).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(1);
		await expect(trigger).toHaveCSS("border-radius", "999px");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="content-annotations"]'),
		).toHaveCount(0);
	});

	test("adds and removes steps styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(PLAIN_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			0,
			{ timeout: 15_000 },
		);
		expect(hasRequestFor(requests, [optionalRuntimeModules.steps])).toBe(false);

		await page.evaluate((path) => window.swup?.navigate(path), STEPS_POST_PATH);
		await page.waitForURL(`**${STEPS_POST_PATH}`);
		const steps = page.locator(".m3-steps").first();
		await expect(steps).toBeVisible();
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			1,
		);
		await expect(steps).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

		await page.evaluate((path) => window.swup?.navigate(path), PLAIN_POST_PATH);
		await page.waitForURL(`**${PLAIN_POST_PATH}`);
		await expect(page.locator('style[data-swup-optional="steps"]')).toHaveCount(
			0,
			{ timeout: 15_000 },
		);
	});

	test("adds and removes admonition styles with the Swup page lifecycle", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.admonitions])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITIONS_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITIONS_POST_PATH}`);
		const admonition = page.locator(".m3-admonition").first();
		await expect(admonition).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(1);
		await expect(admonition).toHaveCSS("border-inline-start-width", "4px");

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="admonitions"]'),
		).toHaveCount(0);
	});

	test("loads abbreviation assets only for rendered references", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(0);
		expect(
			hasRequestFor(requests, [optionalRuntimeModules.abbreviations]),
		).toBe(false);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ABBREVIATIONS_POST_PATH,
		);
		await page.waitForURL(`**${ABBREVIATIONS_POST_PATH}`);
		const abbreviation = page.locator("abbr.m3-abbreviation").first();
		await expect(abbreviation).toBeVisible();
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(1);
		await expect(abbreviation).toHaveCSS("text-decoration-style", "dotted");
		await expect
			.poll(() =>
				hasRequestFor(requests, [optionalRuntimeModules.abbreviations]),
			)
			.toBe(true);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="abbreviations"]'),
		).toHaveCount(0);
	});

	test("loads option group assets only for rendered groups", async ({
		page,
	}) => {
		const requests = trackOptionalRuntimeRequests(page);

		await page.goto(ADMONITION_FREE_POST_PATH, { waitUntil: "networkidle" });
		await page.waitForFunction(() => Boolean(window.swup?.navigate));
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(0);
		expect(hasRequestFor(requests, [optionalRuntimeModules.optionGroups])).toBe(
			false,
		);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			OPTION_GROUPS_POST_PATH,
		);
		await page.waitForURL(`**${OPTION_GROUPS_POST_PATH}`);
		const optionGroup = page.locator(".m3-option-group").first();
		await expect(optionGroup).toHaveAttribute(
			"data-option-group-ready",
			"true",
		);
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(1);
		await expect(optionGroup).toHaveCSS("border-radius", "12px");
		await expect
			.poll(() =>
				hasRequestFor(requests, [optionalRuntimeModules.optionGroups]),
			)
			.toBe(true);

		await page.evaluate(
			(path) => window.swup?.navigate(path),
			ADMONITION_FREE_POST_PATH,
		);
		await page.waitForURL(`**${ADMONITION_FREE_POST_PATH}`);
		await expect(
			page.locator('style[data-swup-optional="option-groups"]'),
		).toHaveCount(0);
	});
});
