import { expect, test } from "@playwright/test";
import {
	type ResolvedMusicOptions,
	resolveMusicOptions,
} from "../../src/config/musicConfig";
import type { MusicConfig } from "../../src/types/musicConfig";
import {
	buildMetingUrl,
	createMusicRuntime,
	nextTrackIndex,
	parseMetingSong,
	previousTrackIndex,
} from "../../src/utils/music";

class MockAudio extends EventTarget {
	preload = "";
	volume = 1;
	muted = false;
	paused = true;
	currentTime = 0;
	duration = Number.NaN;
	loadCalls = 0;
	pauseCalls = 0;
	playCalls = 0;
	sources: string[] = [];
	playResults: Array<Promise<void>> = [];
	private source: string | null = null;

	get src(): string {
		return this.source ?? "";
	}

	set src(value: string) {
		this.source = value;
		this.sources.push(value);
	}

	getAttribute(name: string): string | null {
		return name === "src" ? this.source : null;
	}

	removeAttribute(name: string): void {
		if (name === "src") this.source = null;
	}

	load(): void {
		this.loadCalls += 1;
	}

	pause(): void {
		this.pauseCalls += 1;
		this.paused = true;
		this.dispatchEvent(new Event("pause"));
	}

	async play(): Promise<void> {
		this.playCalls += 1;
		const result = this.playResults.shift() ?? Promise.resolve();
		await result;
		this.paused = false;
		this.dispatchEvent(new Event("play"));
	}
}

function options(trackCount = 3): ResolvedMusicOptions {
	return {
		provider: "local",
		playlist: Array.from({ length: trackCount }, (_, index) => ({
			id: `track-${index}`,
			title: `Track ${index}`,
			source: `/music/track-${index}.mp3`,
			duration: 120 + index,
		})),
		defaultVolume: 0.7,
		defaultMode: "sequence",
	};
}

function deferred(): {
	promise: Promise<void>;
	resolve: () => void;
	reject: (error: unknown) => void;
} {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});
	return { promise, resolve, reject };
}

test.describe("music configuration and playlist helpers", () => {
	test("resolves valid local and remote media without rewriting signatures", () => {
		const config: MusicConfig = {
			enable: true,
			defaultVolume: 2,
			defaultMode: "shuffle",
			tracks: [
				{
					id: " local ",
					title: " Local track ",
					source: "./audio/local.mp3?version=1",
					cover: "covers/local.webp",
				},
				{
					id: "remote",
					title: "Remote track",
					source: "https://media.example/song.mp3?token=a%2Fb&sig=x+y",
				},
				{
					id: "remote",
					title: "Duplicate",
					source: "/duplicate.mp3",
				},
				{
					id: "unsafe",
					title: "Unsafe",
					source: "javascript:alert(1)",
				},
			],
		};

		const resolved = resolveMusicOptions(config);
		expect(resolved).not.toBeNull();
		expect(resolved?.defaultVolume).toBe(1);
		expect(resolved?.defaultMode).toBe("shuffle");
		expect(resolved?.playlist).toEqual([
			{
				id: "local",
				title: "Local track",
				source: "/audio/local.mp3?version=1",
				cover: "/covers/local.webp",
				artist: undefined,
				duration: undefined,
			},
			{
				id: "remote",
				title: "Remote track",
				source: "https://media.example/song.mp3?token=a%2Fb&sig=x+y",
				cover: undefined,
				artist: undefined,
				duration: undefined,
			},
		]);
		expect(Object.isFrozen(resolved)).toBe(true);
		expect(Object.isFrozen(resolved?.playlist)).toBe(true);
	});

	test("returns null when disabled or when no valid tracks remain", () => {
		expect(
			resolveMusicOptions({
				enable: false,
				tracks: [{ id: "one", title: "One", source: "/one.mp3" }],
				defaultVolume: 0.5,
				defaultMode: "sequence",
			}),
		).toBeNull();
		expect(
			resolveMusicOptions({
				enable: true,
				tracks: [{ id: "", title: "", source: "" }],
				defaultVolume: 0.5,
				defaultMode: "sequence",
			}),
		).toBeNull();
	});

	test("resolves default local data source when tracks is omitted", () => {
		const resolved = resolveMusicOptions({
			enable: true,
			provider: "local",
			defaultVolume: 0.7,
			defaultMode: "sequence",
		});
		expect(resolved).not.toBeNull();
		expect(resolved?.playlist.length).toBeGreaterThan(0);
		expect(resolved?.playlist[0].id).toBe("dazbee");
	});

	test("resolves custom and meting provider configurations", () => {
		const customResolved = resolveMusicOptions({
			enable: true,
			provider: "custom",
			tracks: [{ id: "c1", title: "Custom Song", source: "/custom.mp3" }],
			defaultVolume: 0.8,
			defaultMode: "repeat-one",
		});
		expect(customResolved).not.toBeNull();
		expect(customResolved?.provider).toBe("custom");
		expect(customResolved?.playlist).toHaveLength(1);
		expect(customResolved?.playlist[0].id).toBe("c1");

		const metingResolved = resolveMusicOptions({
			enable: true,
			provider: "meting",
			meting: { id: "12345", server: "netease", type: "playlist" },
			defaultVolume: 0.5,
			defaultMode: "shuffle",
		});
		expect(metingResolved).not.toBeNull();
		expect(metingResolved?.provider).toBe("meting");
		expect(metingResolved?.meting?.id).toBe("12345");

		const invalidMeting = resolveMusicOptions({
			enable: true,
			provider: "meting",
			meting: { id: "" },
			defaultVolume: 0.5,
			defaultMode: "shuffle",
		});
		expect(invalidMeting).toBeNull();

		const mixedResolved = resolveMusicOptions({
			enable: true,
			provider: "mixed",
			meting: { id: "12345" },
			defaultVolume: 0.7,
			defaultMode: "sequence",
		});
		expect(mixedResolved).not.toBeNull();
		expect(mixedResolved?.provider).toBe("mixed");
		expect(mixedResolved?.playlist.length).toBeGreaterThan(0);
		expect(mixedResolved?.meting?.id).toBe("12345");
	});

	test("builds meting url and parses raw meting song items", () => {
		const url = buildMetingUrl({ id: "999", server: "tencent", type: "song" });
		expect(url).toContain("server=tencent");
		expect(url).toContain("type=song");
		expect(url).toContain("id=999");

		const emptyUrl = buildMetingUrl({ id: "" });
		expect(emptyUrl).toBeNull();

		const parsed = parseMetingSong(
			{
				id: 123456,
				name: "Test Song",
				artist: "Test Artist",
				url: "https://example.com/song.mp3",
				pic: "https://example.com/cover.jpg",
				duration: 185000,
			},
			0,
			"netease",
		);
		expect(parsed).toEqual({
			id: "meting-netease-123456",
			title: "Test Song",
			artist: "Test Artist",
			source: "https://example.com/song.mp3",
			cover: "https://example.com/cover.jpg",
			duration: 185,
		});

		const invalid = parseMetingSong({ name: "", url: "" }, 0);
		expect(invalid).toBeNull();
	});

	test("covers empty, single, sequence, repeat, and deterministic shuffle indices", () => {
		expect(nextTrackIndex(-1, 0, "sequence")).toBe(-1);
		expect(previousTrackIndex(-1, 0, "sequence")).toBe(-1);
		expect(nextTrackIndex(0, 1, "shuffle", () => 0.9)).toBe(0);
		expect(previousTrackIndex(0, 1, "repeat-one")).toBe(0);
		expect(nextTrackIndex(2, 3, "sequence")).toBe(0);
		expect(previousTrackIndex(0, 3, "sequence")).toBe(2);
		expect(nextTrackIndex(1, 3, "repeat-one")).toBe(1);
		expect(nextTrackIndex(1, 3, "shuffle", () => 0)).not.toBe(1);
		expect(previousTrackIndex(1, 3, "shuffle", () => 0.99)).not.toBe(1);
	});
});

test.describe("music runtime", () => {
	test("initializes one audio element without assigning or loading a source", async () => {
		const audio = new MockAudio();
		let creations = 0;
		const runtime = createMusicRuntime(options(), {
			createAudio: () => {
				creations += 1;
				return audio as unknown as HTMLAudioElement;
			},
			getStorage: () => null,
		});

		await Promise.all([runtime.initialize(), runtime.initialize()]);
		expect(creations).toBe(1);
		expect(audio.preload).toBe("none");
		expect(audio.src).toBe("");
		expect(audio.loadCalls).toBe(0);
		expect(audio.sources).toEqual([]);
	});

	test("loads only on explicit commands and restores validated volume", async () => {
		const audio = new MockAudio();
		const writes: Array<[string, string]> = [];
		const storage = {
			getItem: () => "0.35",
			setItem: (key: string, value: string) => writes.push([key, value]),
		} as unknown as Storage;
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
			getStorage: () => storage,
		});

		await runtime.initialize();
		expect(runtime.getSnapshot().volume).toBe(0.35);
		await runtime.play();
		expect(audio.sources).toEqual(["/music/track-0.mp3"]);
		expect(audio.loadCalls).toBe(1);
		runtime.setVolume(5);
		expect(runtime.getSnapshot().volume).toBe(1);
		expect(writes.at(-1)?.[1]).toBe("1");
	});

	test("tolerates unavailable storage and emits immutable immediate snapshots", async () => {
		const audio = new MockAudio();
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
			getStorage: () => {
				throw new Error("blocked");
			},
		});
		const snapshots: number[] = [];
		const unsubscribe = runtime.subscribe((value) =>
			snapshots.push(value.volume),
		);
		expect(snapshots).toEqual([0.7]);
		expect(Object.isFrozen(runtime.getSnapshot())).toBe(true);
		expect(Object.isFrozen(runtime.getSnapshot().playlist)).toBe(true);
		expect(Object.isFrozen(runtime.getSnapshot().playlist[0])).toBe(true);
		await runtime.initialize();
		runtime.setVolume(0.4);
		unsubscribe();
		unsubscribe();
		runtime.setVolume(0.2);
		expect(snapshots.at(-1)).toBe(0.4);
	});

	test("ignores stale play promises after selecting another track", async () => {
		const audio = new MockAudio();
		const first = deferred();
		audio.playResults.push(first.promise, Promise.resolve());
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});

		const firstPlay = runtime.play();
		await expect.poll(() => audio.playCalls).toBe(1);
		await runtime.select(1);
		first.resolve();
		await firstPlay;
		expect(runtime.getSnapshot().currentIndex).toBe(1);
		expect(runtime.getSnapshot().status).toBe("playing");
		expect(audio.sources).toEqual(["/music/track-0.mp3", "/music/track-1.mp3"]);
	});

	test("ignores a same-source play attempt invalidated by pause", async () => {
		const audio = new MockAudio();
		const first = deferred();
		audio.playResults.push(first.promise);
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});

		const play = runtime.play();
		await expect.poll(() => audio.playCalls).toBe(1);
		runtime.pause();
		first.resolve();
		await play;
		expect(runtime.getSnapshot().currentIndex).toBe(0);
		expect(runtime.getSnapshot().status).not.toBe("playing");
		expect(audio.sources).toEqual(["/music/track-0.mp3"]);
	});

	test("rewinds an explicitly reselected loaded track", async () => {
		const audio = new MockAudio();
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});
		await runtime.play();
		audio.currentTime = 42;
		audio.dispatchEvent(new Event("timeupdate"));
		await runtime.select(0);
		expect(audio.currentTime).toBe(0);
		expect(runtime.getSnapshot().currentTime).toBe(0);
		expect(audio.loadCalls).toBe(1);
	});

	test("bounds source failure recovery to one complete playlist traversal", async () => {
		const audio = new MockAudio();
		audio.playResults.push(
			Promise.reject(new Error("first")),
			Promise.reject(new Error("second")),
			Promise.reject(new Error("third")),
		);
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});
		runtime.setMode("repeat-one");
		await runtime.play();
		expect(audio.sources).toEqual([
			"/music/track-0.mp3",
			"/music/track-1.mp3",
			"/music/track-2.mp3",
		]);
		expect(runtime.getSnapshot().status).toBe("error");
		expect(runtime.getSnapshot().error).toBe("source-unavailable");
	});

	test("keeps recovery bounded when failed sources emit metadata first", async () => {
		const audio = new MockAudio();
		const attempts = [deferred(), deferred(), deferred()];
		audio.playResults.push(...attempts.map((attempt) => attempt.promise));
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});

		const play = runtime.play();
		for (let index = 0; index < attempts.length; index += 1) {
			await expect.poll(() => audio.playCalls).toBe(index + 1);
			audio.dispatchEvent(new Event("loadedmetadata"));
			attempts[index].reject(new Error(`failed-${index}`));
		}
		await play;
		expect(audio.playCalls).toBe(3);
		expect(runtime.getSnapshot().error).toBe("source-unavailable");
	});

	test("manual navigation advances while repeat-one remains active", async () => {
		const audio = new MockAudio();
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});
		runtime.setMode("repeat-one");
		await runtime.next();
		expect(runtime.getSnapshot().currentIndex).toBe(1);
		await runtime.previous();
		expect(runtime.getSnapshot().currentIndex).toBe(0);
		expect(runtime.getSnapshot().mode).toBe("repeat-one");
	});

	test("reports browser autoplay rejection without traversing the playlist", async () => {
		const audio = new MockAudio();
		audio.playResults.push(
			Promise.reject(new DOMException("blocked", "NotAllowedError")),
		);
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});
		await runtime.play();
		expect(audio.sources).toEqual(["/music/track-0.mp3"]);
		expect(runtime.getSnapshot().error).toBe("autoplay-blocked");
	});

	test("destroy cancels deferred initialization", async () => {
		const audio = new MockAudio();
		let creations = 0;
		const runtime = createMusicRuntime(options(), {
			createAudio: () => {
				creations += 1;
				return audio as unknown as HTMLAudioElement;
			},
		});

		const initialization = runtime.initialize();
		runtime.destroy();
		await initialization;
		expect(creations).toBe(0);
		await runtime.initialize();
		expect(creations).toBe(1);
	});

	test("destroy invalidates media state and permits deterministic reinitialization", async () => {
		const audios = [new MockAudio(), new MockAudio()];
		let index = 0;
		const runtime = createMusicRuntime(options(), {
			createAudio: () => audios[index++] as unknown as HTMLAudioElement,
		});
		await runtime.select(2);
		runtime.setMode("shuffle");
		runtime.setMuted(true);
		runtime.destroy();
		expect(runtime.getSnapshot()).toMatchObject({
			currentIndex: 0,
			status: "idle",
			currentTime: 0,
			muted: false,
			mode: "sequence",
			error: null,
		});
		await runtime.initialize();
		expect(index).toBe(2);
		expect(audios[1].src).toBe("");
		expect(audios[1].loadCalls).toBe(0);
	});

	test("meting provider fetches tracks asynchronously and handles fetch failure", async () => {
		const mockTracks = [
			{
				id: 101,
				name: "Meting Song 1",
				artist: "Artist 1",
				url: "https://example.com/1.mp3",
				duration: 200000,
			},
		];
		const mockFetch = (async () => ({
			ok: true,
			json: async () => mockTracks,
		})) as unknown as typeof fetch;

		const metingOptions: ResolvedMusicOptions = {
			provider: "meting",
			playlist: [],
			meting: { id: "123456", server: "netease", type: "playlist" },
			defaultVolume: 0.7,
			defaultMode: "sequence",
		};

		const audio = new MockAudio();
		const runtime = createMusicRuntime(metingOptions, {
			createAudio: () => audio as unknown as HTMLAudioElement,
			fetch: mockFetch,
		});

		expect(runtime.getSnapshot().status).toBe("loading");
		await runtime.initialize();
		expect(runtime.getSnapshot().status).toBe("idle");
		expect(runtime.getSnapshot().playlist).toHaveLength(1);
		expect(runtime.getSnapshot().playlist[0].title).toBe("Meting Song 1");

		const failingFetch = (async () => ({
			ok: false,
			status: 500,
		})) as unknown as typeof fetch;

		const failingRuntime = createMusicRuntime(metingOptions, {
			createAudio: () => new MockAudio() as unknown as HTMLAudioElement,
			fetch: failingFetch,
		});

		await failingRuntime.initialize();
		expect(failingRuntime.getSnapshot().status).toBe("error");
		expect(failingRuntime.getSnapshot().error).toBe("source-unavailable");
	});

	test("mixed provider combines local tracks with fetched meting tracks seamlessly", async () => {
		const mockTracks = [
			{
				id: 999,
				name: "Meting Cloud Track",
				artist: "Cloud Singer",
				url: "https://example.com/cloud.mp3",
				duration: 210000,
			},
		];
		const mockFetch = (async () => ({
			ok: true,
			json: async () => mockTracks,
		})) as unknown as typeof fetch;

		const mixedOptions: ResolvedMusicOptions = {
			provider: "mixed",
			playlist: [
				{
					id: "local-1",
					title: "Local Song",
					source: "/local.mp3",
					duration: 180,
				},
			],
			meting: { id: "123456", server: "netease", type: "playlist" },
			defaultVolume: 0.7,
			defaultMode: "sequence",
		};

		const audio = new MockAudio();
		const runtime = createMusicRuntime(mixedOptions, {
			createAudio: () => audio as unknown as HTMLAudioElement,
			fetch: mockFetch,
		});

		expect(runtime.getSnapshot().status).toBe("idle");
		expect(runtime.getSnapshot().playlist).toHaveLength(1);
		expect(runtime.getSnapshot().playlist[0].id).toBe("local-1");

		await runtime.initialize();
		expect(runtime.getSnapshot().playlist).toHaveLength(2);
		expect(runtime.getSnapshot().playlist[0].title).toBe("Local Song");
		expect(runtime.getSnapshot().playlist[1].title).toBe("Meting Cloud Track");
	});

	test("mixed provider initializes in loading state and populates tracks when local playlist is empty", async () => {
		const mockTracks = [
			{
				id: 888,
				name: "Cloud Solo Track",
				artist: "Cloud Artist",
				url: "https://example.com/cloud-solo.mp3",
				duration: 200000,
			},
		];
		const mockFetch = (async () => ({
			ok: true,
			json: async () => mockTracks,
		})) as unknown as typeof fetch;

		const emptyMixedOptions: ResolvedMusicOptions = {
			provider: "mixed",
			playlist: [],
			meting: { id: "654321", server: "netease", type: "playlist" },
			defaultVolume: 0.7,
			defaultMode: "sequence",
		};

		const audio = new MockAudio();
		const runtime = createMusicRuntime(emptyMixedOptions, {
			createAudio: () => audio as unknown as HTMLAudioElement,
			fetch: mockFetch,
		});

		expect(runtime.getSnapshot().status).toBe("loading");
		expect(runtime.getSnapshot().currentIndex).toBe(-1);
		expect(runtime.getSnapshot().playlist).toHaveLength(0);
		expect(runtime.getSnapshot().error).toBeNull();

		await runtime.initialize();
		expect(runtime.getSnapshot().status).toBe("idle");
		expect(runtime.getSnapshot().currentIndex).toBe(0);
		expect(runtime.getSnapshot().playlist).toHaveLength(1);
		expect(runtime.getSnapshot().playlist[0].title).toBe("Cloud Solo Track");
		expect(runtime.getSnapshot().currentTrack?.title).toBe("Cloud Solo Track");
		expect(runtime.getSnapshot().error).toBeNull();
	});

	test("preserves duration when repeating track in repeat-one mode without track metadata duration", async () => {
		const audio = new MockAudio();
		const testOptions: ResolvedMusicOptions = {
			provider: "local",
			playlist: [
				{
					id: "no-meta-track",
					title: "No Meta Track",
					source: "/music/no-meta.mp3",
					// duration is undefined
				},
			],
			defaultVolume: 0.7,
			defaultMode: "repeat-one",
		};

		const runtime = createMusicRuntime(testOptions, {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});

		expect(runtime.getSnapshot().duration).toBe(0);

		await runtime.play();
		audio.duration = 215;
		audio.dispatchEvent(new Event("loadedmetadata"));

		expect(runtime.getSnapshot().status).toBe("playing");
		expect(runtime.getSnapshot().duration).toBe(215);

		audio.currentTime = 215;
		audio.dispatchEvent(new Event("timeupdate"));
		expect(runtime.getSnapshot().currentTime).toBe(215);

		audio.dispatchEvent(new Event("ended"));
		await expect.poll(() => audio.playCalls).toBe(2);

		expect(runtime.getSnapshot().duration).toBe(215);
		expect(runtime.getSnapshot().currentTime).toBe(0);
		expect(runtime.getSnapshot().currentIndex).toBe(0);
	});

	test("falls back to detected duration when metadata duration is explicitly zero", async () => {
		const audio = new MockAudio();
		const testOptions: ResolvedMusicOptions = {
			provider: "local",
			playlist: [
				{
					id: "zero-meta-track",
					title: "Zero Meta Track",
					source: "/music/zero-meta.mp3",
					duration: 0,
				},
			],
			defaultVolume: 0.7,
			defaultMode: "repeat-one",
		};

		const runtime = createMusicRuntime(testOptions, {
			createAudio: () => audio as unknown as HTMLAudioElement,
		});

		expect(runtime.getSnapshot().duration).toBe(0);

		await runtime.play();
		audio.duration = 180;
		audio.dispatchEvent(new Event("loadedmetadata"));

		expect(runtime.getSnapshot().status).toBe("playing");
		expect(runtime.getSnapshot().duration).toBe(180);

		audio.currentTime = 180;
		audio.dispatchEvent(new Event("ended"));
		await expect.poll(() => audio.playCalls).toBe(2);

		expect(runtime.getSnapshot().duration).toBe(180);
		expect(runtime.getSnapshot().currentTime).toBe(0);
	});
});
