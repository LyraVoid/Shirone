/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

declare module "virtual:shirone-music-sidebar" {
	const component:
		| typeof import("@components/organisms/music/MusicSidebar.astro").default
		| null;
	export default component;
}

declare module "virtual:shirone-icons" {
	export const localIconCollections: unknown[];
}

/**
 * Digest of the Markdown extensions registered by plugin scripts, compiled in
 * by the integration (`vite.define`). Absent outside an Astro run.
 */
declare const __SHIRONES_MARKDOWN_DIGEST__: string | undefined;

declare module "*scripts/anime/providers/bangumi.mjs" {
	export function fetchBangumiData(config: unknown): Promise<{
		provider: "bangumi";
		accountRef: string;
		rawItems: unknown[];
	}>;
}

declare module "*scripts/anime/providers/bilibili.mjs" {
	export function fetchBilibiliData(config: unknown): Promise<{
		provider: "bilibili";
		accountRef: string;
		rawItems: unknown[];
	}>;
}
