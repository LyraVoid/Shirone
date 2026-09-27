import type { Page } from "@playwright/test";
import stylus from "stylus";
import { musicSidebarStylus } from "../../src/components/organisms/music/musicSidebarStyles";
import type { ResolvedMusicOptions } from "../../src/config/musicConfig";

const musicSidebarStyles = new Promise<string>((resolve, reject) => {
	stylus.render(musicSidebarStylus, (error, css) => {
		if (error) reject(error);
		else resolve(css);
	});
});

export const fixtureLabels = {
	previous: "Previous track",
	play: "Play",
	pause: "Pause",
	next: "Next track",
	mute: "Mute",
	unmute: "Unmute",
	playbackMode: "Playback mode",
	modeSequence: "Sequence",
	modeRepeatOne: "Repeat one",
	modeShuffle: "Shuffle",
	progress: "Progress: {current} of {duration}",
	volume: "Volume: {volume}%",
	showPlaylist: "Show playlist",
	hidePlaylist: "Hide playlist",
	empty: "No tracks available",
	loading: "Loading track",
	notRequested: "Not requested yet",
	nowPlaying: "Now playing: {title}",
	errors: {
		"empty-playlist": "No tracks available",
		"source-unavailable": "The track could not be played",
		"autoplay-blocked": "Playback requires interaction",
		"invalid-track": "The selected track is invalid",
	},
};

export const defaultTestOptions: ResolvedMusicOptions = {
	provider: "local",
	playlist: [
		{
			id: "one",
			title: "First track",
			artist: "First artist",
			source: "/test-media/one.mp3",
			duration: 180,
		},
		{
			id: "two",
			title: "Second track",
			artist: "Second artist",
			source: "/test-media/two.mp3",
			duration: 240,
		},
	],
	defaultVolume: 0.7,
	defaultMode: "sequence",
};

export async function mountMusicClient(
	page: Page,
	initialOptions: ResolvedMusicOptions = defaultTestOptions,
): Promise<void> {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await page.waitForFunction(() => {
		return (
			getComputedStyle(document.documentElement)
				.getPropertyValue("--primary")
				.trim().length > 0
		);
	});
	await page.addStyleTag({ content: await musicSidebarStyles });

	await page.evaluate(
		async ({ options, labels }) => {
			let audioCreations = 0;
			class TestAudio extends EventTarget {
				constructor() {
					super();
					audioCreations += 1;
				}

				preload = "";
				volume = 1;
				muted = false;
				paused = true;
				currentTime = 0;
				duration = 180;
				private source: string | null = null;

				get src(): string {
					return this.source ?? "";
				}

				set src(value: string) {
					this.source = value;
				}

				getAttribute(name: string): string | null {
					return name === "src" ? this.source : null;
				}

				removeAttribute(name: string): void {
					if (name === "src") this.source = null;
				}

				load(): void {
					queueMicrotask(() => {
						this.dispatchEvent(new Event("loadedmetadata"));
					});
				}

				pause(): void {
					if (this.paused) return;
					this.paused = true;
					this.dispatchEvent(new Event("pause"));
				}

				async play(): Promise<void> {
					this.paused = false;
					this.dispatchEvent(new Event("play"));
				}
			}

			Object.defineProperty(window, "Audio", {
				configurable: true,
				value: TestAudio,
			});

			const runtimeUrl = "/src/utils/music/index.ts";
			const runtimeModule = await import(/* @vite-ignore */ runtimeUrl);
			runtimeModule.destroyMusicRuntime();

			document.querySelectorAll(".sidebar-widget").forEach((el) => {
				if (
					el.querySelector("[data-music-player]") ||
					el.querySelector("#sidebar-music-player")
				) {
					el.remove();
				}
			});
			document
				.querySelectorAll('[data-id="sidebar-music-player"]')
				.forEach((el) => {
					el.remove();
				});
			document.querySelectorAll("[data-music-player]").forEach((el) => {
				el.remove();
			});
			document.querySelectorAll("#sidebar-music-player").forEach((el) => {
				el.remove();
			});

			const host = document.createElement("section");
			host.id = "music-client-test-host";

			host.style.cssText =
				"position: fixed; top: 80px; right: 16px; z-index: 2147483647; isolation: isolate; width: 320px; max-height: calc(100vh - 96px); overflow: auto; padding: 16px; background: var(--surface);";
			document.body.prepend(host);

			audioCreations = 0;

			const fixtureUrl = "/tests/fixtures/music-client.browser.ts";
			const browserFixture = await import(/* @vite-ignore */ fixtureUrl);
			const component = browserFixture.mountMusicClientFixture(host, {
				options,
				labels,
			});
			(
				window as typeof window & {
					__musicTestComponent?: unknown;
					__musicAudioCreations?: () => number;
				}
			).__musicTestComponent = component;
			(
				window as typeof window & {
					__musicAudioCreations?: () => number;
				}
			).__musicAudioCreations = () => audioCreations;
		},
		{ options: initialOptions, labels: fixtureLabels },
	);

	await page.locator("[data-music-player]").waitFor();
}

export async function remountMusicClient(
	page: Page,
	options: ResolvedMusicOptions,
): Promise<void> {
	await page.evaluate(
		async ({ options, labels }) => {
			const host = document.getElementById("music-client-test-host");
			if (!host) return;
			host.innerHTML = "";

			const runtimeUrl = "/src/utils/music/index.ts";
			const runtimeModule = await import(/* @vite-ignore */ runtimeUrl);
			runtimeModule.destroyMusicRuntime();

			const fixtureUrl = "/tests/fixtures/music-client.browser.ts";
			const browserFixture = await import(/* @vite-ignore */ fixtureUrl);
			browserFixture.mountMusicClientFixture(host, {
				options,
				labels,
			});
		},
		{ options, labels: fixtureLabels },
	);
	await page.locator("#music-client-test-host [data-music-player]").waitFor();
}
