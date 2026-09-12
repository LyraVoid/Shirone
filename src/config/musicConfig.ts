import { musicTracks } from "../data/music.ts";
import type {
	MetingMusicConfig,
	MusicConfig,
	MusicProvider,
	PlaybackMode,
	TrackDescriptor,
} from "../types/musicConfig.ts";
import { withUserConfig } from "../utils/config-overlay.ts";

/**
 * 侧栏音乐配置单一真源。
 * 遵循「零额外负担」原则：禁用时不产生任何网络请求与额外 DOM。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【四种工作模式（Provider）使用指南】
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. "local"（本地独立模式，默认）：
 *    - 数据源：src/data/music.ts
 *    - 特点：零外部 API 依赖，首屏毫秒级就绪，静态打包直出，断网也能正常播放。
 *    - 示例：
 *      provider: "local"
 *
 * 2. "custom"（自定义列表模式）：
 *    - 数据源：直接在 tracks 字段显式传入曲目数组（支持外链音频与封面）
 *    - 特点：灵活自定义，无需修改通用数据文件。
 *    - 示例：
 *      provider: "custom",
 *      tracks: [
 *        { id: "song-1", title: "Song", artist: "Artist", source: "https://.../a.mp3", cover: "https://.../c.jpg" }
 *      ]
 *
 * 3. "meting"（云端歌单模式）：
 *    - 数据源：Meting API 远端歌单（网易云 / QQ音乐 / 酷狗等）
 *    - 特点：客户端异步按需拉取，海量曲库与封面自动解析。
 *    - 可选 `preload: "metadata"`：组件进入视口即预取歌单元数据（不含音频流），
 *      首屏直接显示第一首曲目；默认 "none"（不预取，交互后才请求）。
 *    - 示例：
 *      provider: "meting",
 *      meting: { server: "netease", type: "playlist", id: "14164869977" }
 *
 * 4. "mixed"（混合增强模式，推荐）：
 *    - 数据源：本地曲目（src/data/music.ts）+ Meting API 远端歌单自动合并
 *    - 特点：首屏立即可播本地音乐，后台无感拉取远端歌单并在就绪后无缝扩容；
 *            若遇断网或云端接口故障，自动静默降级为本地曲目播放，绝不报红破版。
 *    - 示例：
 *      provider: "mixed",
 *      meting: { server: "netease", type: "playlist", id: "14164869977" }
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const musicConfig: MusicConfig = withUserConfig("music", {
	enable: true,
	provider: "mixed",
	// tracks: [
	// 	{
	// 		id: "custom-1",
	// 		title: "示例曲目",
	// 		artist: "艺术家",
	// 		cover: "/assets/music/cover/example.webp",
	// 		source: "/assets/music/url/example.mp3",
	// 		duration: 240,
	// 	},
	// ],
	meting: {
		server: "netease",
		type: "playlist",
		id: "14164869977",
		// 进入视口时预取歌单元数据（仅元信息，不预取音频流）：
		// "metadata"（取）| "none"（默认，不取；交互后才请求，卡片显示「尚未请求」占位）
		preload: "none",
	},
	defaultVolume: 0.7,
	defaultMode: "sequence",
});

export interface ResolvedMusicOptions {
	readonly provider: MusicProvider;
	readonly playlist: readonly TrackDescriptor[];
	readonly meting?: MetingMusicConfig;
	readonly defaultVolume: number;
	readonly defaultMode: PlaybackMode;
}

const ABSOLUTE_MEDIA_SOURCE = /^(?:https?:)?\/\//i;
const UNSAFE_SCHEME = /^[a-z][a-z\d+.-]*:/i;

function normalizeMediaSource(value: string): string | null {
	const source = value.trim();
	if (!source) return null;
	if (ABSOLUTE_MEDIA_SOURCE.test(source) || source.startsWith("/")) {
		return source;
	}
	if (UNSAFE_SCHEME.test(source)) return null;
	return `/${source.replace(/^\.\//, "")}`;
}

function normalizeTrack(
	track: TrackDescriptor,
	usedIds: Set<string>,
): TrackDescriptor | null {
	const id = track.id.trim();
	const title = track.title.trim();
	const source = normalizeMediaSource(track.source);
	if (!id || !title || !source || usedIds.has(id)) return null;

	usedIds.add(id);
	const artist = track.artist?.trim() || undefined;
	const cover = track.cover
		? (normalizeMediaSource(track.cover) ?? undefined)
		: undefined;
	const duration =
		typeof track.duration === "number" &&
		Number.isFinite(track.duration) &&
		track.duration > 0
			? track.duration
			: undefined;

	return Object.freeze({ id, title, source, artist, cover, duration });
}

export function clampMusicVolume(value: number, fallback = 0.7): number {
	if (!Number.isFinite(value)) return fallback;
	return Math.min(1, Math.max(0, value));
}

/** 补齐 meting 配置的默认值（如 preload 默认 "none"），让 ResolvedMusicOptions 自包含。 */
function resolveMetingConfig(
	meting: MetingMusicConfig | undefined,
): MetingMusicConfig | undefined {
	if (!meting) return meting;
	return Object.freeze({ ...meting, preload: meting.preload ?? "none" });
}

export function resolveMusicOptions(
	config: MusicConfig,
): ResolvedMusicOptions | null {
	if (!config.enable) return null;

	const provider: MusicProvider = config.provider ?? "local";

	if (provider === "meting") {
		const id = config.meting?.id?.trim();
		if (!id) return null;
		return Object.freeze({
			provider: "meting",
			playlist: Object.freeze([]),
			meting: resolveMetingConfig(config.meting),
			defaultVolume: clampMusicVolume(config.defaultVolume),
			defaultMode: config.defaultMode,
		});
	}

	let rawTracks: readonly TrackDescriptor[] = [];
	if (provider === "local" || provider === "mixed") {
		rawTracks = config.tracks ?? musicTracks;
	} else if (provider === "custom") {
		rawTracks = config.tracks ?? [];
	}

	const usedIds = new Set<string>();
	const playlist = rawTracks
		.map((track) => normalizeTrack(track, usedIds))
		.filter((track): track is TrackDescriptor => track !== null);

	if (provider === "mixed") {
		const metingId = config.meting?.id?.trim();
		if (playlist.length === 0 && !metingId) return null;
		return Object.freeze({
			provider: "mixed",
			playlist: Object.freeze(playlist),
			meting: resolveMetingConfig(config.meting),
			defaultVolume: clampMusicVolume(config.defaultVolume),
			defaultMode: config.defaultMode,
		});
	}

	if (playlist.length === 0) return null;

	return Object.freeze({
		provider,
		playlist: Object.freeze(playlist),
		defaultVolume: clampMusicVolume(config.defaultVolume),
		defaultMode: config.defaultMode,
	});
}
