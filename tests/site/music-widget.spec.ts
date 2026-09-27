import { expect, test } from "@playwright/test";
import { musicConfig, resolveMusicOptions } from "../../src/config/musicConfig";
import I18nKey from "../../src/i18n/i18nKey";
import { en } from "../../src/i18n/languages/en";
import { es } from "../../src/i18n/languages/es";
import { id } from "../../src/i18n/languages/id";
import { ja } from "../../src/i18n/languages/ja";
import { ko } from "../../src/i18n/languages/ko";
import { th } from "../../src/i18n/languages/th";
import { tr } from "../../src/i18n/languages/tr";
import { vi } from "../../src/i18n/languages/vi";
import { zh_CN } from "../../src/i18n/languages/zh_CN";
import { zh_TW } from "../../src/i18n/languages/zh_TW";
import { mountMusicClient, remountMusicClient } from "../fixtures/music-client";

const translations = [en, es, id, ja, ko, th, tr, vi, zh_CN, zh_TW];
const musicKeys = [
	I18nKey.musicPlayerTitle,
	I18nKey.musicPrevious,
	I18nKey.musicPlay,
	I18nKey.musicPause,
	I18nKey.musicNext,
	I18nKey.musicMute,
	I18nKey.musicUnmute,
	I18nKey.musicPlaybackMode,
	I18nKey.musicModeSequence,
	I18nKey.musicModeRepeatOne,
	I18nKey.musicModeShuffle,
	I18nKey.musicProgress,
	I18nKey.musicVolume,
	I18nKey.musicShowPlaylist,
	I18nKey.musicHidePlaylist,
	I18nKey.musicEmpty,
	I18nKey.musicLoading,
	I18nKey.musicNotRequested,
	I18nKey.musicNowPlaying,
	I18nKey.musicErrorEmptyPlaylist,
	I18nKey.musicErrorSourceUnavailable,
	I18nKey.musicErrorAutoplayBlocked,
	I18nKey.musicErrorInvalidTrack,
];

function placeholders(value: string): string[] {
	return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]).sort();
}

test.describe("music sidebar architecture", () => {
	test("all ten locales provide complete music copy with matching placeholders", () => {
		for (const key of musicKeys) {
			const expected = placeholders(en[key] as string);
			for (const dictionary of translations) {
				const value = dictionary[key];
				expect(typeof value).toBe("string");
				expect((value as string).trim().length).toBeGreaterThan(0);
				expect(placeholders(value as string)).toEqual(expected);
			}
		}
	});

	test("default-disabled site emits zero music DOM, CSS, JS chunks, and media requests", async ({
		page,
	}) => {
		test.skip(
			resolveMusicOptions(musicConfig) !== null,
			"Music feature is enabled in local configuration",
		);
		const requests: string[] = [];

		page.on("request", (request) => {
			const url = request.url();
			if (
				/\.(?:mp3|m4a|ogg|wav)(?:\?|$)/i.test(url) ||
				/MusicSidebar/i.test(url) ||
				/music-player/i.test(url) ||
				/music\.[a-zA-Z\d_-]+\.js/i.test(url)
			) {
				requests.push(url);
			}
		});
		await page.goto("/", { waitUntil: "networkidle" });
		await expect(page.locator("[data-music-player]")).toHaveCount(0);
		await expect(page.locator('[data-id="sidebar-music-player"]')).toHaveCount(
			0,
		);
		expect(requests).toEqual([]);

		const hasMusicStyles = await page.evaluate(() => {
			for (const sheet of Array.from(document.styleSheets)) {
				try {
					for (const rule of Array.from(sheet.cssRules || [])) {
						if (rule.cssText?.includes("music-player")) {
							return true;
						}
					}
				} catch {
					// cross-origin stylesheets
				}
			}
			return false;
		});
		expect(hasMusicStyles).toBe(false);
	});

	test("mixed provider does not request Meting before playback or playlist intent", async ({
		page,
	}) => {
		test.skip(
			musicConfig.provider !== "mixed",
			"Local configuration is not using the mixed provider",
		);
		let metingRequests = 0;
		await page.route("**/meting/**", async (route) => {
			metingRequests += 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: "[]",
			});
		});

		await page.goto("/", { waitUntil: "networkidle" });
		expect(metingRequests).toBe(0);
		await page
			.locator("[data-music-player] .music-player__playlist-toggle")
			.click();
		await expect.poll(() => metingRequests).toBe(1);
	});

	test("local covers are emitted as optimized Astro assets", async ({
		page,
	}) => {
		test.skip(
			musicConfig.provider !== "local" && musicConfig.provider !== "mixed",
			"Local configuration is not using local tracks",
		);

		await page.goto("/");
		const cover = page.locator("[data-music-player] .music-player__cover img");
		const src = await cover.getAttribute("src");
		const srcset = await cover.getAttribute("srcset");
		expect(src).toMatch(/^\/(?:_astro\/|_image\/\?)/);
		expect(src).not.toContain("/assets/music/cover/");
		expect(srcset).toContain(" 64w, ");
		expect(srcset).toContain(" 128w");
		await expect(cover).toHaveAttribute("sizes", "52px");
	});
});

test.describe("music sidebar client", () => {
	test.beforeEach(async ({ page }) => {
		await mountMusicClient(page);
	});

	test("exposes labeled commands and native range semantics", async ({
		page,
	}) => {
		await expect(
			page.getByRole("button", { name: "Previous track" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Play", exact: true }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Next track" }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Mute" })).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Playback mode: Sequence" }),
		).not.toHaveAttribute("aria-pressed");
		const playlistPanel = page.locator("#sidebar-music-playlist");
		await expect(playlistPanel).toHaveAttribute("inert", "");
		await expect(playlistPanel).toHaveAttribute("aria-hidden", "true");
		await expect(
			page.getByRole("button", { name: /Second track/ }),
		).toHaveCount(0);

		const progress = page.getByRole("slider", { name: /Progress:/ });
		await expect(progress).toHaveAttribute("min", "0");
		await expect(progress).toHaveAttribute("max", "180");
		const volume = page.getByRole("slider", { name: "Volume: 70%" });
		await volume.focus();
		await page.keyboard.press("ArrowLeft");
		await expect(page.getByRole("slider", { name: "Volume: 69%" })).toHaveValue(
			"0.69",
		);
	});

	test("plays, switches tracks, cycles modes, and announces only state changes", async ({
		page,
	}) => {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
		await expect(
			page.locator('[data-music-player] [aria-live="polite"]'),
		).toHaveText("Now playing: First track");
		await page.getByRole("button", { name: "Next track" }).click();
		await expect(page.locator(".music-player__metadata strong")).toHaveText(
			"Second track",
		);
		await expect(
			page.locator('[data-music-player] [aria-live="polite"]'),
		).toHaveText("Now playing: Second track");
		await page.getByRole("button", { name: "Playback mode: Sequence" }).click();
		await expect(
			page.getByRole("button", { name: "Playback mode: Repeat one" }),
		).toBeVisible();
	});

	test("expands the playlist without changing the host width", async ({
		page,
	}) => {
		const host = page.locator("#music-client-test-host");
		const widthBefore = await host.evaluate(
			(element) => element.getBoundingClientRect().width,
		);
		const toggle = page.locator(".music-player__playlist-toggle");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-expanded", "true");
		await expect(toggle).toHaveAttribute(
			"aria-controls",
			"sidebar-music-playlist",
		);
		await expect(page.locator("#sidebar-music-playlist")).not.toHaveAttribute(
			"inert",
		);
		await expect(page.locator("#sidebar-music-playlist")).toHaveAttribute(
			"aria-hidden",
			"false",
		);
		await expect(
			page.getByRole("button", { name: /Second track/ }),
		).toBeVisible();
		const widthAfter = await host.evaluate(
			(element) => element.getBoundingClientRect().width,
		);
		expect(widthAfter).toBe(widthBefore);
		await page.getByRole("button", { name: /Second track/ }).click();
		await expect(
			page.getByRole("button", { name: /Second track/ }),
		).toHaveAttribute("aria-current", "true");
	});

	test("normal motion animates the playing cover", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "no-preference" });
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect(page.locator(".music-player__cover--playing")).toHaveCSS(
			"animation-name",
			"music-cover-playing",
		);
		await expect(page.locator(".music-player__cover--playing")).not.toHaveCSS(
			"animation-duration",
			"0s",
		);
	});

	test("manual transport advances in repeat-one mode", async ({ page }) => {
		await page.getByRole("button", { name: "Playback mode: Sequence" }).click();
		await page.getByRole("button", { name: "Next track" }).click();
		await expect(page.locator(".music-player__metadata strong")).toHaveText(
			"Second track",
		);
		await page.getByRole("button", { name: "Previous track" }).click();
		await expect(page.locator(".music-player__metadata strong")).toHaveText(
			"First track",
		);
		await expect(
			page.getByRole("button", { name: "Playback mode: Repeat one" }),
		).toBeVisible();
	});

	test("reduced motion removes cover animation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await expect(page.locator(".music-player__cover--playing")).toHaveCSS(
			"animation-name",
			"none",
		);
	});

	test("keeps one runtime audio object across Swup navigation", async ({
		page,
	}) => {
		await page.getByRole("button", { name: "Play", exact: true }).click();
		await page.getByRole("button", { name: "Next track" }).click();
		await page.waitForFunction(() => Boolean(window.swup?.hooks));
		await page.evaluate(() => {
			(
				window.swup as typeof window.swup & {
					navigate: (url: string) => void;
				}
			).navigate("/archive/");
		});
		await page.waitForFunction(
			() =>
				document.getElementById("swup-container")?.dataset.currentPage ===
				"archive",
		);
		await expect(
			page.locator("#music-client-test-host .music-player__metadata strong"),
		).toHaveText("Second track");
		const creations = await page.evaluate(() =>
			(
				window as typeof window & {
					__musicAudioCreations?: () => number;
				}
			).__musicAudioCreations?.(),
		);
		expect(creations).toBe(1);
	});

	test("meting mode waits for user intent before fetching and hydrates the playlist", async ({
		page,
	}) => {
		let metingRequests = 0;
		await page.route("**/meting/**", async (route) => {
			metingRequests += 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([
					{
						id: 9901,
						name: "Remote Anime Song",
						artist: "Remote Singer",
						url: "https://example.com/remote.mp3",
						pic: "https://example.com/remote.jpg",
						duration: 195000,
					},
					{
						id: 9902,
						name: "Second Remote Song",
						artist: "Another Singer",
						url: "https://example.com/second.mp3",
						duration: 210000,
					},
				]),
			});
		});

		await remountMusicClient(page, {
			provider: "meting",
			playlist: [],
			meting: { id: "test-meting-id", server: "netease", type: "playlist" },
			defaultVolume: 0.7,
			defaultMode: "sequence",
		});

		expect(metingRequests).toBe(0);
		// 未交互前：不谎报「正在加载」，显示「尚未请求」占位（issue #58）。
		await expect(
			page.locator("#music-client-test-host .music-player__metadata strong"),
		).toHaveText("Not requested yet");
		const toggle = page.locator(".music-player__playlist-toggle");
		await toggle.click();
		await expect(
			page.locator("#music-client-test-host .music-player__metadata strong"),
		).toHaveText("Remote Anime Song", { timeout: 5000 });
		await expect(
			page.locator("#music-client-test-host .music-player__metadata > span"),
		).toHaveText("Remote Singer");

		expect(metingRequests).toBe(1);
		await expect(page.locator("#sidebar-music-playlist")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /Second Remote Song/ }),
		).toBeVisible();
	});

	test("meting preload=metadata fetches when the widget enters the viewport, without interaction", async ({
		page,
	}) => {
		let metingRequests = 0;
		await page.route("**/meting/**", async (route) => {
			metingRequests += 1;
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify([
					{
						id: 9901,
						name: "Remote Anime Song",
						artist: "Remote Singer",
						url: "https://example.com/remote.mp3",
						pic: "https://example.com/remote.jpg",
						duration: 195000,
					},
				]),
			});
		});

		await remountMusicClient(page, {
			provider: "meting",
			playlist: [],
			meting: {
				id: "test-meting-id",
				server: "netease",
				type: "playlist",
				preload: "metadata",
			},
			defaultVolume: 0.7,
			defaultMode: "sequence",
		});

		// 无任何交互：进入视口即预取元数据（仅元信息，音频不预取），卡片直接显示第一首曲目
		await expect(
			page.locator("#music-client-test-host .music-player__metadata strong"),
		).toHaveText("Remote Anime Song", { timeout: 5000 });
		await expect(
			page.locator("#music-client-test-host .music-player__metadata > span"),
		).toHaveText("Remote Singer");
		expect(metingRequests).toBe(1);

		// 预取后展开播放列表不重复请求（initialize 幂等）
		await page.locator(".music-player__playlist-toggle").click();
		await expect.poll(() => metingRequests).toBe(1);
	});

	test("custom mode renders user defined tracks directly without network delay", async ({
		page,
	}) => {
		await remountMusicClient(page, {
			provider: "custom",
			playlist: [
				{
					id: "custom-track-1",
					title: "Custom User Melody",
					artist: "Indie Artist",
					source: "/audio/custom.mp3",
					duration: 150,
				},
			],
			defaultVolume: 0.8,
			defaultMode: "shuffle",
		});

		await expect(
			page.locator("#music-client-test-host .music-player__metadata strong"),
		).toHaveText("Custom User Melody");
		await expect(
			page.locator("#music-client-test-host .music-player__metadata > span"),
		).toHaveText("Indie Artist");
	});
});
