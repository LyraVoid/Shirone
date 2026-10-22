import type { WalineEmojiInfo } from "@/types/commentConfig";
import {
	createEmojiCatalog,
	type EmojiCatalog,
	type EmojiPack,
} from "./emoji-tokens";

export { attachEmojiInput } from "./emoji-input";

/**
 * Waline's emoji packs, resolved once for both Waline and the emoji input.
 *
 * Preset URLs are fetched here (`<preset>/info.json`, as Waline would) and handed
 * to Waline as inline pack objects, so the picker and the input share one
 * request and one key → image map. A preset that fails stays a URL: Waline
 * retries it as before and its shortcodes simply remain text in the input.
 */

/** What Waline 3.x loads for `emoji: true` or an omitted option. */
const DEFAULT_PRESETS: readonly string[] = [
	"//unpkg.com/@waline/emojis@1.1.0/weibo",
];

export interface WalineEmoji {
	/** The `emoji` option for `Waline.init`. */
	readonly option: (WalineEmojiInfo | string)[];
	readonly catalog: EmojiCatalog;
}

const isOptionalString = (value: unknown): boolean =>
	value === undefined || typeof value === "string";

function isPack(value: unknown): value is EmojiPack {
	if (typeof value !== "object" || value === null) return false;
	const pack = value as Record<string, unknown>;
	return (
		typeof pack.name === "string" &&
		typeof pack.icon === "string" &&
		Array.isArray(pack.items) &&
		pack.items.every((item) => typeof item === "string") &&
		isOptionalString(pack.folder) &&
		isOptionalString(pack.prefix) &&
		isOptionalString(pack.type)
	);
}

async function fetchPack(
	preset: string,
	signal: AbortSignal,
): Promise<WalineEmojiInfo> {
	const folder = preset.replace(/\/+$/u, "");
	const response = await fetch(`${folder}/info.json`, { signal });
	if (!response.ok)
		throw new Error(`Emoji pack ${folder} answered ${response.status}`);
	// Same precedence as Waline: the pack's own fields win over its folder.
	const pack: unknown = { folder, ...(await response.json()) };
	if (!isPack(pack)) throw new Error(`Emoji pack ${folder} is malformed`);
	return pack;
}

/** Resolves the configured `emoji` option; null when emoji are switched off. */
export async function resolveWalineEmoji(
	option: unknown,
	signal: AbortSignal,
): Promise<WalineEmoji | null> {
	const entries: unknown[] =
		option === undefined || option === true
			? [...DEFAULT_PRESETS]
			: Array.isArray(option)
				? option
				: [];
	if (entries.length === 0) return null;
	const resolved = await Promise.all(
		entries.map((entry) =>
			typeof entry === "string"
				? fetchPack(entry, signal).catch(() => entry)
				: entry,
		),
	);
	const packs = resolved.filter(isPack);
	return {
		option: resolved as (WalineEmojiInfo | string)[],
		catalog: createEmojiCatalog(packs),
	};
}
