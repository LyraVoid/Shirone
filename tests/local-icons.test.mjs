import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import {
	collectLocalIcons,
	ICON_PREFIXES,
} from "../src/integration/vite/icon/collections.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const dir = mkdtempSync(join(tmpdir(), "shirones-local-icons-"));

after(() => {
	rmSync(dir, { recursive: true, force: true });
});

test("every allowed icon set is a dependency of the theme", () => {
	// The contract that replaced astro-icon's `iconInclude`: astro-icon located
	// sets by reading the *user's* manifest, which is why four @iconify-json
	// packages used to land in every project's package.json. This module
	// resolves from inside the installed package instead, so a set only has to
	// be declared here — and if it is missing, package mode silently drops the
	// icons while source mode still finds them.
	const declared = new Set(Object.keys(pkg.dependencies ?? {}));
	for (const prefix of ICON_PREFIXES) {
		assert.ok(
			declared.has(`@iconify-json/${prefix}`),
			`@iconify-json/${prefix} is allowed but not a dependency of the theme`,
		);
	}
});

test("the allow-list is exactly the four sets the theme references", () => {
	assert.deepEqual([...ICON_PREFIXES].sort(), [
		"fa7-brands",
		"fa7-solid",
		"material-symbols",
		"simple-icons",
	]);
});

test("a missing directory yields no collection", () => {
	assert.equal(collectLocalIcons(join(dir, "absent")), null);
});

test("an empty directory yields no collection", () => {
	mkdirSync(join(dir, "empty"), { recursive: true });
	assert.equal(collectLocalIcons(join(dir, "empty")), null);
});

test("a directory holding only non-SVG files yields no collection", () => {
	mkdirSync(join(dir, "no-svg"), { recursive: true });
	writeFileSync(join(dir, "no-svg", "notes.txt"), "not an icon");
	assert.equal(collectLocalIcons(join(dir, "no-svg")), null);
});

test("an SVG becomes a local-prefixed icon", () => {
	const target = join(dir, "one");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "star.svg"),
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4l1.5-7.5L2 9h7z"/></svg>',
	);
	const collection = collectLocalIcons(target);
	assert.ok(collection);
	assert.equal(collection.prefix, "local");
	assert.deepEqual(Object.keys(collection.icons), ["star"]);
	const icon = collection.icons.star;
	assert.equal(icon.width, 24);
	assert.equal(icon.height, 24);
	assert.match(String(icon.body), /<path/);
});

test("viewBox drives the dimensions when width/height disagree", () => {
	const target = join(dir, "viewbox");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "box.svg"),
		'<svg width="999" height="999" viewBox="0 0 32 16"><rect width="32" height="16"/></svg>',
	);
	const icon = collectLocalIcons(target)?.icons.box;
	assert.ok(icon);
	assert.equal(icon.width, 32);
	assert.equal(icon.height, 16);
});

test("width and height attributes are used when there is no viewBox", () => {
	const target = join(dir, "dims");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "dot.svg"),
		'<svg xmlns="http://www.w3.org/2000/svg" width="16px" height="16px"><circle r="8"/></svg>',
	);
	const icon = collectLocalIcons(target)?.icons.dot;
	assert.ok(icon);
	assert.equal(icon.width, 16);
	assert.equal(icon.height, 16);
});

test("a file with no geometry is dropped, not fatal", () => {
	const target = join(dir, "partial");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "good.svg"),
		'<svg viewBox="0 0 8 8"><path d="M0 0h8v8H0z"/></svg>',
	);
	// No width, height or viewBox: nothing to size it by.
	writeFileSync(join(target, "bad.svg"), '<svg><path d="M0 0h8v8H0z"/></svg>');
	// An empty svg carries no artwork.
	writeFileSync(join(target, "blank.svg"), '<svg viewBox="0 0 8 8"></svg>');
	const collection = collectLocalIcons(target);
	assert.deepEqual(Object.keys(collection.icons), ["good"]);
});

test("a single-quoted, oddly spaced svg still parses", () => {
	const target = join(dir, "spacing");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "odd.svg"),
		"<svg  xmlns = 'http://www.w3.org/2000/svg'   viewBox='0 0 20 20' ><path d='M0 0h20v20H0z'/></svg>",
	);
	const icon = collectLocalIcons(target)?.icons.odd;
	assert.ok(icon);
	assert.equal(icon.width, 20);
	assert.match(String(icon.body), /<path/);
});

test("the extension is stripped from the name, case-insensitively", () => {
	const target = join(dir, "ext");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "Bell.SVG"),
		'<svg viewBox="0 0 8 8"><path d="M0 0h8z"/></svg>',
	);
	const collection = collectLocalIcons(target);
	assert.deepEqual(Object.keys(collection.icons), ["Bell"]);
});

test("sub-directories become `sub/name` icons instead of being skipped", () => {
	// astro-icon kept sub-directories the same way, so an override file
	// carried over from that era keeps resolving. Skipping them silently lost
	// icons with nothing in the build to point at.
	const target = join(dir, "nested");
	mkdirSync(join(target, "sub"), { recursive: true });
	writeFileSync(
		join(target, "top.svg"),
		'<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>',
	);
	writeFileSync(
		join(target, "sub", "inner.svg"),
		'<svg viewBox="0 0 24 24"><path d="M1 1h22v22H1z"/></svg>',
	);
	const collection = collectLocalIcons(target);
	assert.ok(collection);
	assert.deepEqual(Object.keys(collection.icons).sort(), ["sub/inner", "top"]);
});

test("two same-named icons in different sub-directories do not collide", () => {
	const target = join(dir, "collide");
	for (const sub of ["a", "b"]) {
		mkdirSync(join(target, sub), { recursive: true });
		writeFileSync(
			join(target, sub, "same.svg"),
			'<svg viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
		);
	}
	const collection = collectLocalIcons(target);
	assert.ok(collection);
	assert.deepEqual(Object.keys(collection.icons).sort(), ["a/same", "b/same"]);
	const a = collection.icons["a/same"];
	const b = collection.icons["b/same"];
	assert.ok(a);
	assert.ok(b);
});

test("a self-closing <svg /> holds no geometry and is dropped", () => {
	// `lastIndexOf("</svg>")` found nothing here and sliced from −1, which read
	// whatever followed the tag as geometry.
	const target = join(dir, "selfclosing");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "empty.svg"),
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"/><style>.x{fill:red}</style>',
	);
	assert.equal(collectLocalIcons(target), null);
});

test("an uppercased </SVG> still bounds the geometry", () => {
	// The trailing comment is the point: with `lastIndexOf("</svg>")` returning
	// -1, `slice(open, -1)` kept everything up to the final character, so the
	// comment arrived inside the icon body along with the geometry.
	const target = join(dir, "uppercase-close");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "up.svg"),
		'<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></SVG><!-- generated by hand -->',
	);
	const icon = collectLocalIcons(target)?.icons.up;
	assert.ok(icon);
	assert.equal(icon.width, 24);
	assert.equal(icon.height, 24);
	assert.match(String(icon.body), /<path/);
	assert.doesNotMatch(String(icon.body), /generated by hand/);
});

test("a lower-cased viewbox attribute still sizes the icon", () => {
	// SVG-as-HTML matches attribute names case-insensitively, so a case-
	// sensitive read dropped the viewBox and left the icon unsized.
	const target = join(dir, "lower-viewbox");
	mkdirSync(target, { recursive: true });
	writeFileSync(
		join(target, "low.svg"),
		'<svg VIEWBOX="0 0 32 16"><rect width="32" height="16"/></svg>',
	);
	const icon = collectLocalIcons(target)?.icons.low;
	assert.ok(icon);
	assert.equal(icon.width, 32);
	assert.equal(icon.height, 16);
});
