export type PlaybackMode = "sequence" | "repeat-one" | "shuffle";

export type MusicProvider = "local" | "meting" | "custom" | "mixed";

export type MetingServer = "netease" | "tencent" | "kugou" | "xiami" | "baidu";

export type MetingType = "playlist" | "song" | "album" | "artist";

export type MusicErrorCode =
	| "empty-playlist"
	| "source-unavailable"
	| "autoplay-blocked"
	| "invalid-track";

export type MusicStatus =
	| "idle"
	| "loading"
	| "ready"
	| "playing"
	| "paused"
	| "error";

export interface TrackDescriptor {
	readonly id: string;
	readonly title: string;
	readonly artist?: string;
	readonly source: string;
	readonly cover?: string;
	/** 构建期生成的封面候选；远程 Meting 曲目保持为空。 */
	readonly coverSrcset?: string;
	readonly coverSizes?: string;
	readonly coverWidth?: number;
	readonly coverHeight?: number;
	readonly duration?: number;
}

export type MetingPreloadMode = "metadata" | "none";

export interface MetingMusicConfig {
	/** 音乐平台，默认 netease（网易云音乐） */
	readonly server?: MetingServer;
	/** 资源类型，默认 playlist（歌单） */
	readonly type?: MetingType;
	/** 歌单 / 单曲 / 专辑 ID */
	readonly id?: string;
	/** Meting API 地址模板，默认使用公开 API */
	readonly api?: string;
	/**
	 * 是否在音乐组件进入视口时预取歌单元数据：
	 * - "metadata"：进入视口即请求一次歌单，**仅取元信息**（曲名/歌手/封面，不预取音频流），
	 *   返回后卡片直接显示第一首曲目；
	 * - "none"（默认）：不预取，等用户播放/展开播放列表时才请求（卡片显示「尚未请求」占位）。
	 */
	readonly preload?: MetingPreloadMode;
}

export interface MusicConfig {
	/** 是否全局启用音乐功能 */
	readonly enable: boolean;
	/** 音频数据源模式：local（本地曲目） | meting（Meting 远端歌单） | custom（显式传入 tracks） | mixed（本地与远端歌单合并） */
	readonly provider?: MusicProvider;
	/** 本地播放列表（provider 为 local, custom, mixed 时生效；未填时默认读取 src/data/music.ts） */
	readonly tracks?: readonly TrackDescriptor[];
	/** Meting API 配置（provider 为 meting 或 mixed 时生效） */
	readonly meting?: MetingMusicConfig;
	/** 初始音量，范围 0–1 */
	readonly defaultVolume: number;
	/** 初始播放模式 */
	readonly defaultMode: PlaybackMode;
}

export interface MusicSnapshot {
	readonly playlist: readonly TrackDescriptor[];
	readonly currentIndex: number;
	readonly currentTrack: TrackDescriptor | null;
	readonly status: MusicStatus;
	readonly currentTime: number;
	readonly duration: number;
	readonly volume: number;
	readonly muted: boolean;
	readonly mode: PlaybackMode;
	readonly error: MusicErrorCode | null;
}

export interface MusicRuntime {
	initialize(): Promise<void>;
	getSnapshot(): MusicSnapshot;
	subscribe(listener: (snapshot: MusicSnapshot) => void): () => void;
	play(): Promise<void>;
	pause(): void;
	toggle(): Promise<void>;
	select(index: number): Promise<void>;
	next(): Promise<void>;
	previous(): Promise<void>;
	seek(seconds: number): void;
	setVolume(value: number): void;
	setMuted(value: boolean): void;
	setMode(mode: PlaybackMode): void;
	destroy(): void;
}
