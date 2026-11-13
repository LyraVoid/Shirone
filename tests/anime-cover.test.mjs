import assert from "node:assert/strict";
import test from "node:test";
import {
	applyMirror,
	detectImageExtension,
} from "../scripts/anime/providers/cover.mjs";

const cover = "https://lain.bgm.tv/pic/cover/l/ab/cd/123.jpg";

test("cover mirrors keep query proxies verbatim and normalize path separators", () => {
	assert.equal(
		applyMirror(cover, "https://wsrv.nl/?url="),
		`https://wsrv.nl/?url=${cover}`,
	);
	assert.equal(
		applyMirror(cover, "https://proxy.example.com/"),
		`https://proxy.example.com/${cover}`,
	);
	assert.equal(
		applyMirror(cover, "https://proxy.example.com"),
		`https://proxy.example.com/${cover}`,
	);
	assert.equal(
		applyMirror(cover, "https://proxy.example.com///"),
		`https://proxy.example.com/${cover}`,
	);
	assert.equal(applyMirror(cover, undefined), cover);
	assert.equal(applyMirror(cover, ""), cover);
	assert.equal(applyMirror("", "https://proxy.example.com/"), "");
});

test("cover extension follows magic bytes before the content type", () => {
	const webp = Buffer.alloc(16);
	webp.write("RIFF", 0, "latin1");
	webp.write("WEBP", 8, "latin1");
	const avif = Buffer.alloc(16);
	avif.write("ftypavif", 4, "latin1");

	assert.equal(
		detectImageExtension(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/png"),
		"jpg",
	);
	assert.equal(
		detectImageExtension(Buffer.from([0x89, 0x50, 0x4e, 0x47]), null),
		"png",
	);
	assert.equal(detectImageExtension(webp, "image/jpeg"), "webp");
	assert.equal(detectImageExtension(Buffer.from("GIF89a"), null), "gif");
	assert.equal(detectImageExtension(avif, null), "avif");
	assert.equal(detectImageExtension(Buffer.alloc(0), "image/avif"), "avif");
	assert.equal(detectImageExtension(Buffer.alloc(0), null), "webp");
});
