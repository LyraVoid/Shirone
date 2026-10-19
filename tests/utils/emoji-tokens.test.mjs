import assert from "node:assert/strict";
import { test } from "node:test";

import {
	createEmojiCatalog,
	emojiLabel,
	encodeEmoji,
	findEmoji,
	parseEmojiText,
	serializeEmojiText,
} from "../../src/utils/emoji-tokens.ts";

const weibo = {
	name: "Weibo",
	folder: "//unpkg.com/@waline/emojis@1.1.0/weibo",
	prefix: "weibo_",
	type: "png",
	icon: "doge",
	items: ["smile", "longing", "laugh_and_cry", "doge"],
};
const twemoji = {
	name: "twemoji",
	folder: "https://cdn.example/tw",
	type: "svg",
	icon: "1f600",
	items: ["1f600", "1f468-200d-1f469", "face"],
};
const catalog = createEmojiCatalog([weibo, twemoji]);

// Waline 3.16.1 `parseEmoji`, verbatim apart from naming: the behaviour to match.
const walineParseEmoji = (text, map) =>
	text.replaceAll(/:(.+?):/gu, (placeholder, key) =>
		map[key]
			? `<img class="wl-emoji" src="${map[key]}" alt="${key}">`
			: placeholder,
	);
const walineMap = Object.fromEntries(
	[...weibo.items.map((item) => `weibo_${item}`), ...twemoji.items].map(
		(key) => [key, catalog.get(key).src],
	),
);
const render = (segments) =>
	segments
		.map((segment) =>
			segment.kind === "text"
				? segment.text
				: (segment.source ??
					`<img class="wl-emoji" src="${segment.glyph.src}" alt="${segment.glyph.key}">`),
		)
		.join("");

const CORPUS = [
	"",
	"plain text",
	":weibo_longing::weibo_longing:",
	"Hello :weibo_smile: world :1f600:",
	"Note: see :weibo_smile:",
	"https://example.com :weibo_smile: ok",
	"10:30 :weibo_smile:",
	"a:b:weibo_smile:",
	"::weibo_smile:",
	":weibo_unknown: :weibo_doge:",
	"line one:\n:weibo_doge: line two",
	'kept <img class="wl-emoji" src="https://old.example/weibo_smile.png" alt="weibo_smile"> then :weibo_doge:',
	'<img class="wl-emoji" src="//unpkg.com/@waline/emojis@1.1.0/weibo/weibo_doge.png" alt="weibo_doge">:weibo_smile:',
];

test("catalog resolves keys and image paths the way Waline's getLink does", () => {
	assert.equal(catalog.size, 7);
	assert.deepEqual(catalog.get("weibo_longing"), {
		key: "weibo_longing",
		src: "//unpkg.com/@waline/emojis@1.1.0/weibo/weibo_longing.png",
		label: "longing",
	});
	assert.equal(catalog.get("1f600").src, "https://cdn.example/tw/1f600.svg");
	assert.equal(catalog.get("longing"), undefined);
	assert.equal(
		createEmojiCatalog([{ name: "bare", icon: "a", items: ["a"] }]).get("a")
			.src,
		"a",
	);
	const override = createEmojiCatalog([
		weibo,
		{
			name: "Later",
			folder: "/local",
			prefix: "weibo_",
			icon: "smile",
			items: ["smile"],
		},
	]);
	assert.equal(override.get("weibo_smile").src, "/local/weibo_smile");
	assert.equal(override.size, weibo.items.length);
});

test("labels read words as phrases and code point names as the emoji itself", () => {
	assert.equal(emojiLabel("laugh_and_cry"), "laugh and cry");
	assert.equal(emojiLabel("no-idea"), "no idea");
	assert.equal(emojiLabel("1f600"), String.fromCodePoint(0x1f600));
	assert.equal(
		emojiLabel("1f468-200d-1f469"),
		String.fromCodePoint(0x1f468, 0x200d, 0x1f469),
	);
	assert.equal(emojiLabel("2639"), String.fromCodePoint(0x2639));
	// Hex-looking words and non-pictographic code points keep their name.
	assert.equal(emojiLabel("face"), "face");
	assert.equal(emojiLabel("2024"), "2024");
	assert.equal(emojiLabel("d800"), "d800");
	assert.equal(emojiLabel("___"), "___");
});

test("parsing marks exactly the spans Waline renders as emoji", () => {
	for (const text of CORPUS) {
		assert.equal(
			render(parseEmojiText(text, catalog)),
			walineParseEmoji(text, walineMap),
			JSON.stringify(text),
		);
	}
	assert.deepEqual(parseEmojiText("Note: see :weibo_smile:", catalog), [
		{ kind: "text", text: "Note: see :weibo_smile:" },
	]);
	assert.deepEqual(
		findEmoji("a :weibo_doge: b", catalog).map(({ start, end }) => [
			start,
			end,
		]),
		[[2, 14]],
	);
});

test("the element form keeps its own image and round-trips verbatim", () => {
	const [, emoji] = parseEmojiText(CORPUS[11], catalog);
	assert.equal(emoji.kind, "emoji");
	assert.equal(emoji.glyph.src, "https://old.example/weibo_smile.png");
	assert.equal(emoji.glyph.label, "smile");
	assert.equal(emoji.source.startsWith('<img class="wl-emoji"'), true);
	for (const text of CORPUS)
		assert.equal(serializeEmojiText(parseEmojiText(text, catalog)), text);
});

test("encoding falls back to Waline's element where a stray colon would swallow the shortcode", () => {
	const smile = catalog.get("weibo_smile");
	assert.equal(encodeEmoji("", smile), ":weibo_smile:");
	assert.equal(encodeEmoji("line:\n", smile), ":weibo_smile:");
	assert.equal(encodeEmoji(":weibo_doge: ", smile), ":weibo_smile:");
	for (const preceding of [
		"Note: ",
		"https://example.com ",
		"x:",
		"10:30 ",
		"a:b:c: ",
	]) {
		const encoded = encodeEmoji(preceding, smile);
		assert.equal(
			encoded,
			`<img class="wl-emoji" src="${smile.src}" alt="weibo_smile">`,
		);
		assert.match(
			walineParseEmoji(preceding + encoded, walineMap),
			/alt="weibo_smile"/u,
		);
	}
	assert.equal(encodeEmoji("Note: ", smile, "<kept>"), "<kept>");
	const unsafe = { key: "x", src: 'a"b', label: "x" };
	assert.equal(encodeEmoji("Note: ", unsafe), ":x:");
});

test("every serialised emoji renders, whatever text surrounds it", () => {
	const pieces = [
		"a",
		" ",
		":",
		"Note: ",
		"https://x.y/",
		"10:30",
		"\n",
		":weibo_smile:",
		"中文",
	];
	const keys = ["weibo_smile", "weibo_doge", "1f600"];
	let seed = 20261019;
	const next = (limit) => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed % limit;
	};
	for (let round = 0; round < 400; round++) {
		const segments = [];
		for (let index = next(8) + 1; index > 0; index--)
			segments.push(
				next(3) === 0
					? { kind: "emoji", glyph: catalog.get(keys[next(keys.length)]) }
					: { kind: "text", text: pieces[next(pieces.length)] },
			);
		let text = "";
		const spans = [];
		for (const segment of segments) {
			const start = text.length;
			text +=
				segment.kind === "text"
					? segment.text
					: encodeEmoji(text, segment.glyph);
			if (segment.kind === "emoji")
				spans.push([start, text.length, segment.glyph.key]);
		}
		assert.equal(serializeEmojiText(segments), text);
		const found = findEmoji(text, catalog);
		for (const [start, end, key] of spans)
			assert.ok(
				found.some(
					(match) =>
						match.start === start &&
						match.end === end &&
						match.glyph.key === key,
				),
				`${JSON.stringify(text)} loses ${key} at ${start}`,
			);
		assert.equal(
			render(parseEmojiText(text, catalog)),
			walineParseEmoji(text, walineMap),
		);
	}
});
