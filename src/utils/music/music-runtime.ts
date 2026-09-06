import type { ResolvedMusicOptions } from "@/config/musicConfig";
import { clampMusicVolume } from "@/config/musicConfig";
import type {
	MusicErrorCode,
	MusicRuntime,
	MusicSnapshot,
	MusicStatus,
	PlaybackMode,
	TrackDescriptor,
} from "@/types/musicConfig";
import { MUSIC_VOLUME_STORAGE_KEY, PLAYBACK_MODES } from "./constants";
import { fetchMetingTracks } from "./meting";
import { nextTrackIndex, previousTrackIndex } from "./playlist";

interface RuntimeState {
	currentIndex: number;
	status: MusicStatus;
	currentTime: number;
	duration: number;
	volume: number;
	muted: boolean;
	mode: PlaybackMode;
	error: MusicErrorCode | null;
}

interface MediaListeners {
	loadedmetadata: () => void;
	durationchange: () => void;
	timeupdate: () => void;
	play: () => void;
	pause: () => void;
	ended: () => void;
	error: () => void;
}

export interface MusicRuntimeDependencies {
	createAudio?: () => HTMLAudioElement;
	getStorage?: () => Storage | null;
	random?: () => number;
	fetch?: typeof fetch;
}

function finiteMediaValue(value: number): number {
	return Number.isFinite(value) && value > 0 ? value : 0;
}

function isAutoplayError(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === "NotAllowedError" || error.name === "SecurityError")
	);
}

export function createMusicRuntime(
	options: ResolvedMusicOptions,
	dependencies: MusicRuntimeDependencies = {},
): MusicRuntime {
	let currentPlaylist: readonly TrackDescriptor[] = Object.freeze(
		options.playlist.map((track) => Object.freeze({ ...track })),
	);
	const listeners = new Set<(snapshot: MusicSnapshot) => void>();
	const createAudio = dependencies.createAudio ?? (() => new Audio());
	const getStorage =
		dependencies.getStorage ??
		(() => (typeof window === "undefined" ? null : window.localStorage));
	const random = dependencies.random ?? Math.random;
	const customFetch =
		dependencies.fetch ?? (typeof fetch !== "undefined" ? fetch : undefined);

	const hasInitialTracks = currentPlaylist.length > 0;
	const hasMeting =
		(options.provider === "meting" || options.provider === "mixed") &&
		Boolean(options.meting?.id);

	let state: RuntimeState = {
		currentIndex: hasInitialTracks ? 0 : -1,
		status: !hasInitialTracks && hasMeting ? "loading" : "idle",
		currentTime: 0,
		duration: currentPlaylist[0]?.duration ?? 0,
		volume: clampMusicVolume(options.defaultVolume),
		muted: false,
		mode: options.defaultMode,
		error: hasInitialTracks || hasMeting ? null : "empty-playlist",
	};
	let audio: HTMLAudioElement | null = null;
	let mediaListeners: MediaListeners | null = null;
	let initializePromise: Promise<void> | null = null;
	let lifecycleGeneration = 0;
	let sourceGeneration = 0;
	let playbackAttemptGeneration = 0;
	let playbackRequested = false;
	let loadedIndex = -1;
	const failedTrackIds = new Set<string>();
	const knownDurations = new Map<string, number>();

	function snapshot(): MusicSnapshot {
		return Object.freeze({
			playlist: currentPlaylist,
			currentIndex: state.currentIndex,
			currentTrack: currentPlaylist[state.currentIndex] ?? null,
			status: state.status,
			currentTime: state.currentTime,
			duration: state.duration,
			volume: state.volume,
			muted: state.muted,
			mode: state.mode,
			error: state.error,
		});
	}

	function emit(): void {
		const next = snapshot();
		for (const listener of listeners) listener(next);
	}

	function patch(next: Partial<RuntimeState>): void {
		state = { ...state, ...next };
		emit();
	}

	function readStoredVolume(): number {
		try {
			const raw = getStorage()?.getItem(MUSIC_VOLUME_STORAGE_KEY);
			if (raw == null || raw.trim() === "") return state.volume;
			const stored = Number(raw);
			return Number.isFinite(stored) && stored >= 0 && stored <= 1
				? stored
				: state.volume;
		} catch {
			return state.volume;
		}
	}

	function persistVolume(volume: number): void {
		try {
			getStorage()?.setItem(MUSIC_VOLUME_STORAGE_KEY, String(volume));
		} catch {
			// Storage is an optional enhancement; playback remains functional without it.
		}
	}

	function removeMediaListeners(): void {
		if (!audio || !mediaListeners) return;
		for (const [event, listener] of Object.entries(mediaListeners)) {
			audio.removeEventListener(event, listener);
		}
		mediaListeners = null;
	}

	function bindMediaListeners(generation: number): void {
		if (!audio) return;
		const isCurrent = () => generation === sourceGeneration && audio !== null;
		mediaListeners = {
			loadedmetadata: () => {
				if (!isCurrent() || !audio) return;
				const duration = finiteMediaValue(audio.duration);
				const track = currentPlaylist[state.currentIndex];
				if (track && duration > 0) knownDurations.set(track.id, duration);
				patch({
					status: audio.paused ? "ready" : "playing",
					duration:
						duration ||
						track?.duration ||
						knownDurations.get(track?.id ?? "") ||
						0,
					error: null,
				});
			},
			durationchange: () => {
				if (!isCurrent() || !audio) return;
				const duration = finiteMediaValue(audio.duration);
				const track = currentPlaylist[state.currentIndex];
				if (track && duration > 0) knownDurations.set(track.id, duration);
				patch({
					duration:
						duration ||
						track?.duration ||
						knownDurations.get(track?.id ?? "") ||
						0,
				});
			},
			timeupdate: () => {
				if (!isCurrent() || !audio) return;
				patch({ currentTime: Math.max(0, audio.currentTime) });
			},
			play: () => {
				if (!isCurrent() || !audio) return;
				if (!playbackRequested) {
					audio.pause();
					return;
				}
				patch({ status: "playing", error: null });
			},
			pause: () => {
				if (!isCurrent() || state.status === "error") return;
				patch({ status: state.currentTime > 0 ? "paused" : "ready" });
			},
			ended: () => {
				if (!isCurrent()) return;
				playbackRequested = false;
				void advanceAfterEnded();
			},
			error: () => {
				if (!isCurrent()) return;
				void recoverFromSourceError();
			},
		};
		for (const [event, listener] of Object.entries(mediaListeners)) {
			audio.addEventListener(event, listener);
		}
	}

	async function initialize(): Promise<void> {
		if (
			audio &&
			(options.provider === "local" ||
				options.provider === "custom" ||
				currentPlaylist.length > 0)
		) {
			return;
		}
		if (initializePromise) return initializePromise;
		const generation = lifecycleGeneration;
		const pending = Promise.resolve().then(async () => {
			if (generation !== lifecycleGeneration) return;

			if (
				(options.provider === "meting" || options.provider === "mixed") &&
				options.meting &&
				customFetch
			) {
				if (
					options.provider === "meting" ||
					(options.provider === "mixed" && currentPlaylist.length === 0)
				) {
					patch({ status: "loading", error: null });
				}
				try {
					const fetched = await fetchMetingTracks(options.meting, customFetch);
					if (generation !== lifecycleGeneration) return;
					if (fetched.length > 0) {
						if (options.provider === "mixed") {
							const hadTracks = currentPlaylist.length > 0;
							const existingIds = new Set(currentPlaylist.map((t) => t.id));
							const merged = [...currentPlaylist];
							for (const item of fetched) {
								if (!existingIds.has(item.id)) {
									existingIds.add(item.id);
									merged.push(Object.freeze({ ...item }));
								}
							}
							currentPlaylist = Object.freeze(merged);
							if (!hadTracks) {
								patch({
									currentIndex: 0,
									duration: currentPlaylist[0]?.duration ?? 0,
									status: "idle",
									error: null,
								});
							} else {
								patch({
									duration:
										currentPlaylist[state.currentIndex]?.duration ??
										state.duration,
									error: null,
								});
							}
						} else {
							currentPlaylist = Object.freeze(
								fetched.map((track) => Object.freeze({ ...track })),
							);
							patch({
								currentIndex: 0,
								status: "idle",
								duration: currentPlaylist[0]?.duration ?? 0,
								error: null,
							});
						}
					} else if (
						options.provider === "meting" ||
						(options.provider === "mixed" && currentPlaylist.length === 0)
					) {
						patch({ status: "error", error: "empty-playlist" });
					}
				} catch {
					if (generation !== lifecycleGeneration) return;
					if (
						options.provider === "meting" ||
						(options.provider === "mixed" && currentPlaylist.length === 0)
					) {
						patch({ status: "error", error: "source-unavailable" });
					}
				}
			}

			if (generation !== lifecycleGeneration || audio) return;
			audio = createAudio();
			audio.preload = "none";
			const volume = readStoredVolume();
			audio.volume = volume;
			audio.muted = state.muted;
			patch({ volume });
		});
		initializePromise = pending;
		try {
			await pending;
		} finally {
			if (initializePromise === pending) initializePromise = null;
		}
	}

	async function ensureSource(): Promise<number | null> {
		await initialize();
		if (state.currentIndex < 0 || !currentPlaylist[state.currentIndex]) {
			patch({ status: "error", error: "empty-playlist" });
			return null;
		}
		if (!audio) return null;
		if (loadedIndex === state.currentIndex && audio.getAttribute("src")) {
			return sourceGeneration;
		}

		sourceGeneration += 1;
		const generation = sourceGeneration;
		removeMediaListeners();
		audio.pause();
		audio.removeAttribute("src");
		loadedIndex = state.currentIndex;
		const track = currentPlaylist[state.currentIndex];
		audio.src = track.source;
		bindMediaListeners(generation);
		audio.load();
		patch({
			status: "loading",
			currentTime: 0,
			duration:
				(track.duration && track.duration > 0
					? track.duration
					: knownDurations.get(track.id)) ?? 0,
			error: null,
		});
		return generation;
	}

	async function playLoadedSource(resetRecovery = true): Promise<void> {
		if (resetRecovery) failedTrackIds.clear();
		playbackRequested = true;
		const attempt = ++playbackAttemptGeneration;
		const generation = await ensureSource();
		if (
			attempt !== playbackAttemptGeneration ||
			generation === null ||
			!audio
		) {
			return;
		}
		try {
			await audio.play();
			if (
				attempt !== playbackAttemptGeneration ||
				generation !== sourceGeneration
			) {
				return;
			}
			patch({ status: "playing", error: null });
		} catch (error) {
			if (
				attempt !== playbackAttemptGeneration ||
				generation !== sourceGeneration
			) {
				return;
			}
			playbackRequested = false;
			if (isAutoplayError(error)) {
				patch({ status: "error", error: "autoplay-blocked" });
				return;
			}
			await recoverFromSourceError();
		}
	}

	async function selectInternal(
		index: number,
		autoplay: boolean,
	): Promise<void> {
		playbackRequested = false;
		playbackAttemptGeneration += 1;
		if (
			!Number.isInteger(index) ||
			index < 0 ||
			index >= currentPlaylist.length
		) {
			patch({ status: "error", error: "invalid-track" });
			return;
		}
		const track = currentPlaylist[index];
		const isSameLoadedSource =
			loadedIndex === index && Boolean(audio?.getAttribute("src"));
		if (audio) audio.pause();
		if (isSameLoadedSource && audio) {
			audio.currentTime = 0;
		} else {
			loadedIndex = -1;
		}
		const fallbackDuration =
			(track ? knownDurations.get(track.id) : undefined) ??
			(isSameLoadedSource
				? (audio ? finiteMediaValue(audio.duration) : 0) || state.duration
				: 0);
		patch({
			currentIndex: index,
			status: "idle",
			currentTime: 0,
			duration:
				track?.duration && track.duration > 0
					? track.duration
					: fallbackDuration,
			error: null,
		});
		if (autoplay) await playLoadedSource(false);
		else await ensureSource();
	}

	async function recoverFromSourceError(): Promise<void> {
		const currentTrack = currentPlaylist[state.currentIndex];
		if (!currentTrack) {
			patch({ status: "error", error: "empty-playlist" });
			return;
		}
		failedTrackIds.add(currentTrack.id);
		if (failedTrackIds.size >= currentPlaylist.length) {
			patch({ status: "error", error: "source-unavailable" });
			return;
		}

		for (let offset = 1; offset < currentPlaylist.length; offset += 1) {
			const candidate = (state.currentIndex + offset) % currentPlaylist.length;
			const track = currentPlaylist[candidate];
			if (track && !failedTrackIds.has(track.id)) {
				await selectInternal(candidate, true);
				return;
			}
		}
		patch({ status: "error", error: "source-unavailable" });
	}

	async function advanceAfterEnded(): Promise<void> {
		failedTrackIds.clear();
		const index = nextTrackIndex(
			state.currentIndex,
			currentPlaylist.length,
			state.mode,
			random,
		);
		await selectInternal(index, true);
	}

	return {
		initialize,
		getSnapshot: snapshot,
		subscribe(listener) {
			listeners.add(listener);
			listener(snapshot());
			let subscribed = true;
			return () => {
				if (!subscribed) return;
				subscribed = false;
				listeners.delete(listener);
			};
		},
		async play() {
			await playLoadedSource(true);
		},
		pause() {
			playbackRequested = false;
			playbackAttemptGeneration += 1;
			if (!audio) return;
			audio.pause();
			patch({ status: state.currentTime > 0 ? "paused" : "ready" });
		},
		async toggle() {
			if (state.status === "playing") this.pause();
			else await this.play();
		},
		async select(index) {
			failedTrackIds.clear();
			await selectInternal(index, true);
		},
		async next() {
			failedTrackIds.clear();
			const mode = state.mode === "repeat-one" ? "sequence" : state.mode;
			const index = nextTrackIndex(
				state.currentIndex,
				currentPlaylist.length,
				mode,
				random,
			);
			await selectInternal(index, true);
		},
		async previous() {
			failedTrackIds.clear();
			if (audio && audio.currentTime > 3) {
				audio.currentTime = 0;
				patch({ currentTime: 0 });
				return;
			}
			const mode = state.mode === "repeat-one" ? "sequence" : state.mode;
			const index = previousTrackIndex(
				state.currentIndex,
				currentPlaylist.length,
				mode,
				random,
			);
			await selectInternal(index, true);
		},
		seek(seconds) {
			if (!Number.isFinite(seconds) || seconds < 0) return;
			const requestedIndex = state.currentIndex;
			void ensureSource().then((generation) => {
				if (
					generation === null ||
					generation !== sourceGeneration ||
					requestedIndex !== state.currentIndex ||
					!audio
				) {
					return;
				}
				const duration = finiteMediaValue(audio.duration) || state.duration;
				const target = duration > 0 ? Math.min(seconds, duration) : seconds;
				audio.currentTime = target;
				patch({ currentTime: target });
			});
		},
		setVolume(value) {
			const volume = clampMusicVolume(value, state.volume);
			if (audio) audio.volume = volume;
			patch({ volume });
			persistVolume(volume);
		},
		setMuted(value) {
			if (audio) audio.muted = value;
			patch({ muted: value });
		},
		setMode(mode) {
			if (!PLAYBACK_MODES.includes(mode)) return;
			patch({ mode });
		},
		destroy() {
			lifecycleGeneration += 1;
			sourceGeneration += 1;
			playbackAttemptGeneration += 1;
			playbackRequested = false;
			removeMediaListeners();
			if (audio) {
				audio.pause();
				audio.removeAttribute("src");
			}
			audio = null;
			initializePromise = null;
			loadedIndex = -1;
			failedTrackIds.clear();
			knownDurations.clear();
			currentPlaylist = Object.freeze(
				options.playlist.map((track) => Object.freeze({ ...track })),
			);
			const hasDestroyInitialTracks = currentPlaylist.length > 0;
			const hasDestroyMeting =
				(options.provider === "meting" || options.provider === "mixed") &&
				Boolean(options.meting?.id);
			state = {
				currentIndex: hasDestroyInitialTracks ? 0 : -1,
				status:
					!hasDestroyInitialTracks && hasDestroyMeting ? "loading" : "idle",
				currentTime: 0,
				duration: currentPlaylist[0]?.duration ?? 0,
				volume: state.volume,
				muted: false,
				mode: options.defaultMode,
				error:
					hasDestroyInitialTracks || hasDestroyMeting ? null : "empty-playlist",
			};
			emit();
		},
	};
}

let sharedRuntime: MusicRuntime | null = null;

export function getMusicRuntime(options: ResolvedMusicOptions): MusicRuntime {
	sharedRuntime ??= createMusicRuntime(options);
	return sharedRuntime;
}

export function destroyMusicRuntime(): void {
	sharedRuntime?.destroy();
	sharedRuntime = null;
}
