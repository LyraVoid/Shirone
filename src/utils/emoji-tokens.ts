/**
 * Emoji token codec: the one place that decides which parts of stored comment
 * text are emoji, what each one means, and how it is written back.
 *
 * Stored text keeps the grammar Waline uses. A shortcode is `:key:`, where the
 * key is a pack prefix plus an item name, and Waline swaps it for an image only
 * when its own left-to-right scan (`/:(.+?):/gu`, which cannot cross a line
 * break) isolates exactly that key. Submitted and edited comments instead carry
 * the element Waline writes for it, `<img class="wl-emoji" src="…" alt="key">`,
 * which renders regardless of its neighbours. Parsing reports the spans Waline
 * will actually turn into images; encoding chooses, per emoji, a form Waline is
 * guaranteed to render. An input built on this codec therefore never shows an
 * icon that the published comment would print as `:key:`, or the reverse.
 *
 * Pure string logic with no DOM access, so Node tests import it directly.
 */

/** An emoji pack in the shape of Waline's `info.json` or an inline pack object. */
export interface EmojiPack {
	name: string;
	folder?: string;
	prefix?: string;
	type?: string;
	icon: string;
	items: string[];
}

/** One emoji: the key stored in text, its image, and the meaning read aloud. */
export interface EmojiGlyph {
	readonly key: string;
	readonly src: string;
	readonly label: string;
}

/** Lookup from storage key to glyph, built once per set of packs. */
export interface EmojiCatalog {
	readonly size: number;
	get(key: string): EmojiGlyph | undefined;
}

/** A span of stored text that renders as an emoji. */
export interface EmojiMatch {
	readonly start: number;
	readonly end: number;
	readonly glyph: EmojiGlyph;
	/** Set for the element form, which is kept verbatim so it round-trips exactly. */
	readonly source?: string;
}

export type EmojiSegment =
	| { readonly kind: "text"; readonly text: string }
	| {
			readonly kind: "emoji";
			readonly glyph: EmojiGlyph;
			readonly source?: string;
	  };

// Identical to Waline's `parseEmoji`; parity with it is the point of this module.
const SHORTCODE = /:(.+?):/gu;
// Exactly what `parseEmoji` emits, and therefore what edited comments contain.
const ELEMENT = /<img class="wl-emoji" src="([^"<>]*)" alt="([^"<>]*)">/gu;
// The text after the last line break, where a pending colon can still pair up.
const LAST_LINE = /[^\n\r\u2028\u2029]*$/u;
// Item names such as twemoji's `1f600` or `1f468-200d-1f469` are code points.
const CODE_POINTS = /^[\da-f]{2,6}(?:[-_][\da-f]{2,6})*$/iu;
const PICTOGRAPHIC = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;
const UNSAFE_ATTRIBUTE = /["<>]/u;

/**
 * Reads an item name as the emoji's meaning: code point names become the emoji
 * itself, word names lose their separators (`laugh_and_cry` → `laugh and cry`).
 */
export function emojiLabel(name: string): string {
	if (CODE_POINTS.test(name)) {
		const points = name.split(/[-_]/u).map((part) => Number.parseInt(part, 16));
		if (
			points.every(
				(point) => point <= 0x10ffff && (point < 0xd800 || point > 0xdfff),
			)
		) {
			const emoji = String.fromCodePoint(...points);
			if (PICTOGRAPHIC.test(emoji)) return emoji;
		}
	}
	return name.replace(/[\s_-]+/gu, " ").trim() || name;
}

// Same path rule as Waline's `getLink`, so both sides resolve identical URLs.
function packLink(item: string, pack: EmojiPack): string {
	const folder = pack.folder ? `${pack.folder}/` : "";
	const type = pack.type ? `.${pack.type}` : "";
	return `${folder}${pack.prefix ?? ""}${item}${type}`;
}

/** Builds the key → glyph lookup; a later pack overrides an earlier key, as in Waline. */
export function createEmojiCatalog(packs: readonly EmojiPack[]): EmojiCatalog {
	const glyphs = new Map<string, EmojiGlyph>();
	for (const pack of packs) {
		for (const item of pack.items) {
			const key = `${pack.prefix ?? ""}${item}`;
			glyphs.set(key, {
				key,
				src: packLink(item, pack),
				label: emojiLabel(item),
			});
		}
	}
	return { size: glyphs.size, get: (key) => glyphs.get(key) };
}

/** Lists the spans of `text` that Waline renders as emoji, in order. */
export function findEmoji(text: string, catalog: EmojiCatalog): EmojiMatch[] {
	const elements: EmojiMatch[] = [];
	for (const match of text.matchAll(ELEMENT)) {
		const [source, src, key] = match;
		const label = catalog.get(key)?.label ?? emojiLabel(key);
		elements.push({
			start: match.index,
			end: match.index + source.length,
			glyph: { key, src, label },
			source,
		});
	}
	const matches = [...elements];
	for (const match of text.matchAll(SHORTCODE)) {
		const glyph = catalog.get(match[1]);
		const start = match.index;
		const end = start + match[0].length;
		if (
			glyph &&
			!elements.some((element) => start < element.end && end > element.start)
		)
			matches.push({ start, end, glyph });
	}
	return matches.sort((a, b) => a.start - b.start);
}

/** Splits stored text into the text and emoji Waline will render. */
export function parseEmojiText(
	text: string,
	catalog: EmojiCatalog,
): EmojiSegment[] {
	const segments: EmojiSegment[] = [];
	let cursor = 0;
	for (const { start, end, glyph, source } of findEmoji(text, catalog)) {
		if (start > cursor)
			segments.push({ kind: "text", text: text.slice(cursor, start) });
		segments.push(
			source === undefined
				? { kind: "emoji", glyph }
				: { kind: "emoji", glyph, source },
		);
		cursor = end;
	}
	if (cursor < text.length)
		segments.push({ kind: "text", text: text.slice(cursor) });
	return segments;
}

/**
 * Writes one emoji after `preceding`, the stored text before it. An element
 * source stays verbatim. Otherwise the shortcode is used where Waline's scan
 * isolates it, and Waline's own element where an earlier unmatched colon on the
 * same line (`Note:`, `https:`) would swallow the shortcode's opening colon.
 */
export function encodeEmoji(
	preceding: string,
	glyph: EmojiGlyph,
	source?: string,
): string {
	if (source !== undefined) return source;
	const shortcode = `:${glyph.key}:`;
	const line = `${LAST_LINE.exec(preceding)?.[0] ?? ""}${shortcode}`;
	let last: RegExpExecArray | undefined;
	for (const match of line.matchAll(SHORTCODE)) last = match;
	if (last?.[1] === glyph.key && last.index + last[0].length === line.length)
		return shortcode;
	if (UNSAFE_ATTRIBUTE.test(glyph.src + glyph.key)) return shortcode;
	return `<img class="wl-emoji" src="${glyph.src}" alt="${glyph.key}">`;
}

/** Joins segments back into stored text; inverse of `parseEmojiText`. */
export function serializeEmojiText(segments: readonly EmojiSegment[]): string {
	let text = "";
	for (const segment of segments)
		text +=
			segment.kind === "text"
				? segment.text
				: encodeEmoji(text, segment.glyph, segment.source);
	return text;
}
