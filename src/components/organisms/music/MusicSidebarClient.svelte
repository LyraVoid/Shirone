<script lang="ts">
import IconButton from "@components/atoms/action/IconButton.svelte";
import ProgressIndicator from "@components/atoms/feedback/ProgressIndicator.svelte";
import Tooltip from "@components/atoms/overlay/Tooltip.svelte";
import Icon from "@iconify/svelte";
import { collapse } from "@utils/motion";
import { onMount } from "svelte";
import type { ResolvedMusicOptions } from "@/config/musicConfig";
import type {
	MusicErrorCode,
	MusicRuntime,
	MusicSnapshot,
	PlaybackMode,
} from "@/types/musicConfig";

interface Labels {
	previous: string;
	play: string;
	pause: string;
	next: string;
	mute: string;
	unmute: string;
	playbackMode: string;
	modeSequence: string;
	modeRepeatOne: string;
	modeShuffle: string;
	progress: string;
	volume: string;
	showPlaylist: string;
	hidePlaylist: string;
	empty: string;
	loading: string;
	nowPlaying: string;
	errors: Record<MusicErrorCode, string>;
}

interface Props {
	options: ResolvedMusicOptions;
	labels: Labels;
}

let { options, labels }: Props = $props();
let runtime = $state<MusicRuntime | null>(null);
const hasInitialTracks = options.playlist.length > 0;
const hasMeting =
	(options.provider === "meting" || options.provider === "mixed") &&
	Boolean(options.meting?.id);

let snapshot = $state<MusicSnapshot>({
	playlist: options.playlist,
	currentIndex: hasInitialTracks ? 0 : -1,
	currentTrack: options.playlist[0] ?? null,
	status: !hasInitialTracks && hasMeting ? "loading" : "idle",
	currentTime: 0,
	duration: options.playlist[0]?.duration ?? 0,
	volume: options.defaultVolume,
	muted: false,
	mode: options.defaultMode,
	error: hasInitialTracks || hasMeting ? null : "empty-playlist",
});
let playlistOpen = $state(false);
const playlistId = "sidebar-music-playlist";

const modeLabels: Record<PlaybackMode, string> = {
	sequence: labels.modeSequence,
	"repeat-one": labels.modeRepeatOne,
	shuffle: labels.modeShuffle,
};
const modeIcons: Record<PlaybackMode, string> = {
	sequence: "material-symbols:repeat-rounded",
	"repeat-one": "material-symbols:repeat-one-rounded",
	shuffle: "material-symbols:shuffle-rounded",
};

const playing = $derived(snapshot.status === "playing");
const loading = $derived(snapshot.status === "loading");
const hasTracks = $derived(snapshot.playlist.length > 0);
const currentTitle = $derived(
	snapshot.currentTrack?.title ?? (loading ? labels.loading : labels.empty),
);
const currentArtist = $derived(
	snapshot.currentTrack?.artist ?? (loading ? "..." : "—"),
);

const modeLabel = $derived(modeLabels[snapshot.mode]);
const modeIcon = $derived(modeIcons[snapshot.mode]);
const duration = $derived(Math.max(0, snapshot.duration));
let draggingSeek = $state(false);
let dragTime = $state<number | null>(null);

const currentEffectiveTime = $derived(
	draggingSeek && dragTime !== null ? dragTime : snapshot.currentTime,
);
const progressMax = $derived(duration > 0 ? duration : 1);
const progressRatio = $derived(
	duration > 0 ? Math.min(Math.max(currentEffectiveTime / duration, 0), 1) : 0,
);
const displayTime = $derived(formatTime(currentEffectiveTime));
const displayDuration = $derived(formatTime(duration));
const progressLabel = $derived(
	labels.progress
		.replace("{current}", displayTime)
		.replace("{duration}", displayDuration),
);
const volumeLabel = $derived(
	labels.volume.replace("{volume}", String(Math.round(snapshot.volume * 100))),
);
const liveMessage = $derived.by(() => {
	if (snapshot.error && snapshot.status === "error")
		return labels.errors[snapshot.error];
	if (snapshot.status === "loading") return labels.loading;
	if (snapshot.currentTrack && snapshot.status === "playing") {
		return labels.nowPlaying.replace("{title}", snapshot.currentTrack.title);
	}
	return "";
});

onMount(() => {
	let unsubscribe = () => {};
	let active = true;
	void import("@utils/music").then(({ getMusicRuntime }) => {
		if (!active) return;
		runtime = getMusicRuntime(options);
		unsubscribe = runtime.subscribe((next) => {
			snapshot = next;
		});
	});
	return () => {
		active = false;
		unsubscribe();
	};
});

function formatTime(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "0:00";
	const seconds = Math.floor(value);
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function cycleMode(): void {
	const modes: PlaybackMode[] = ["sequence", "repeat-one", "shuffle"];
	const index = modes.indexOf(snapshot.mode);
	runtime?.setMode(modes[(index + 1) % modes.length]);
}

function togglePlaylist(): void {
	playlistOpen = !playlistOpen;
	if (playlistOpen) void runtime?.initialize();
}

function onProgressPointerDown(): void {
	draggingSeek = true;
}

function onProgressInput(event: Event): void {
	const val = Number((event.currentTarget as HTMLInputElement).value);
	dragTime = Number.isFinite(val) ? Math.max(0, val) : null;
}

function onProgressChange(event: Event): void {
	const val = Number((event.currentTarget as HTMLInputElement).value);
	draggingSeek = false;
	dragTime = null;
	if (Number.isFinite(val)) {
		runtime?.seek(Math.max(0, val));
	}
}

function onProgressPointerUp(event: PointerEvent): void {
	draggingSeek = false;
	const input = event.currentTarget as HTMLInputElement;
	const val = Number(input.value);
	dragTime = null;
	if (Number.isFinite(val)) {
		runtime?.seek(Math.max(0, val));
	}
}

function setVolume(event: Event): void {
	runtime?.setVolume(Number((event.currentTarget as HTMLInputElement).value));
}
</script>

	<div class="music-player" data-music-player>
		<div class="music-player__track">
			<div class={`music-player__cover${playing ? " music-player__cover--playing" : ""}`}>
				{#if snapshot.currentTrack?.cover}
					<img
						src={snapshot.currentTrack.cover}
						srcset={snapshot.currentTrack.coverSrcset}
						sizes={snapshot.currentTrack.coverSizes}
						width={snapshot.currentTrack.coverWidth}
						height={snapshot.currentTrack.coverHeight}
						alt=""
						loading="lazy"
						decoding="async"
					/>
				{:else}
					<Icon icon="material-symbols:music-note-rounded" aria-hidden="true" />
				{/if}
			</div>
			<div class="music-player__metadata">
				<strong title={currentTitle}>{currentTitle}</strong>
				<span title={currentArtist}>{currentArtist}</span>
				<div class="music-player__submeta">
					<div class="music-player__time-display" aria-hidden="true">
						<span>{displayTime}</span>
						<span class="music-player__time-separator">/</span>
						<span>{displayDuration}</span>
					</div>
					<div class="music-player__volume-inline">
						<Tooltip label={snapshot.muted ? labels.unmute : labels.mute} placement="top">
							<IconButton
								icon="material-symbols:volume-up-rounded"
								checkedIcon="material-symbols:volume-off-rounded"
								label={snapshot.muted ? labels.unmute : labels.mute}
								size="xsmall"
								toggle
								checked={snapshot.muted}
								onclick={() => runtime?.setMuted(!snapshot.muted)}
							/>
						</Tooltip>
						<div class="music-player__volume-slider-wrap">
							<input
								type="range"
								min="0"
								max="1"
								step="0.01"
								value={snapshot.volume}
								aria-label={volumeLabel}
								oninput={setVolume}
								class="music-player__volume-slider"
								style={`--vol-pct: ${Math.round(snapshot.volume * 100)}%`}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="music-player__progress">
			<div class="music-player__progress-control">
				<ProgressIndicator
					variant="linear"
					wavy
					progress={progressRatio}
					amplitude={playing ? 1 : 0}
					label={progressLabel}
					ariaHidden
					showStop={false}
					showThumb
					class="music-player__progress-visual"
				/>
				<input
					type="range"
					min="0"
					max={progressMax}
					step="0.1"
					value={Math.min(currentEffectiveTime, progressMax)}
					disabled={duration <= 0 || !hasTracks}
					aria-label={progressLabel}
					onpointerdown={onProgressPointerDown}
					onpointerup={onProgressPointerUp}
					oninput={onProgressInput}
					onchange={onProgressChange}
				/>
			</div>
		</div>

		<div class="music-player__controls">
			<Tooltip label={modeLabel} placement="top">
				<IconButton
					icon={modeIcon}
					label={`${labels.playbackMode}: ${modeLabel}`}
					size="xsmall"
					disabled={!hasTracks}
					onclick={cycleMode}
				/>
			</Tooltip>
			<Tooltip label={labels.previous} placement="top">
				<IconButton
					icon="material-symbols:skip-previous-rounded"
					label={labels.previous}
					size="small"
					disabled={!hasTracks}
					onclick={() => void runtime?.previous()}
				/>
			</Tooltip>
			<Tooltip label={playing ? labels.pause : labels.play} placement="top">
				<IconButton
					icon="material-symbols:play-arrow-rounded"
					checkedIcon="material-symbols:pause-rounded"
					label={playing ? labels.pause : labels.play}
					variant="filled"
					size="medium"
					toggle
					checked={playing}
					disabled={!hasTracks && !hasMeting}
					onclick={() => void runtime?.toggle()}
				/>
			</Tooltip>
			<Tooltip label={labels.next} placement="top">
				<IconButton
					icon="material-symbols:skip-next-rounded"
					label={labels.next}
					size="small"
					disabled={!hasTracks}
					onclick={() => void runtime?.next()}
				/>
			</Tooltip>
			<Tooltip label={playlistOpen ? labels.hidePlaylist : labels.showPlaylist} placement="top">
				<IconButton
					icon="material-symbols:queue-music-rounded"
					label={playlistOpen ? labels.hidePlaylist : labels.showPlaylist}
					size="xsmall"
					class="music-player__playlist-toggle"
					ariaExpanded={playlistOpen}
					ariaControls={playlistId}
					disabled={!hasTracks && !hasMeting}
					onclick={togglePlaylist}
				/>
			</Tooltip>
		</div>

		<div
			id={playlistId}
			class="music-player__playlist-panel"
			inert={!playlistOpen}
			aria-hidden={!playlistOpen}
			use:collapse={{ open: playlistOpen }}
		>
		{#if hasTracks}
			<ol class="music-player__playlist">
				{#each snapshot.playlist as track, index (track.id)}
					<li>
						<button
							type="button"
							class={`music-player__playlist-item m3-state-layer${index === snapshot.currentIndex ? " music-player__playlist-item--current" : ""}`}
							aria-current={index === snapshot.currentIndex ? "true" : undefined}
							onclick={() => void runtime?.select(index)}
						>
							<span class="music-player__playlist-index" aria-hidden="true">
								{#if index === snapshot.currentIndex && playing}
									<Icon icon="material-symbols:play-arrow-rounded" />
								{:else}
									{index + 1}
								{/if}
							</span>
							<span class="music-player__playlist-copy">
								<strong>{track.title}</strong>
								{#if track.artist}<span>{track.artist}</span>{/if}
							</span>
							{#if track.duration}
								<time>{formatTime(track.duration)}</time>
							{/if}
						</button>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="music-player__empty">{labels.empty}</p>
		{/if}
	</div>

	{#if snapshot.error && snapshot.status === "error"}
		<p class="music-player__error">{labels.errors[snapshot.error]}</p>
	{/if}
	<p class="sr-only" aria-live="polite" aria-atomic="true">{liveMessage}</p>
</div>
