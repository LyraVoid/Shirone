import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import {
	detectThemeRepo,
	findPackageRoot,
	normalisePath,
	resolvePaths,
} from "../src/integration/paths.ts";

// Two throwaway trees: the theme checkout (has `src/`) and a user's site.
const themeRoot = mkdtempSync(join(tmpdir(), "shirones-theme-"));
const siteRoot = mkdtempSync(join(tmpdir(), "shirones-site-"));
mkdirSync(join(themeRoot, "src", "integration"), { recursive: true });
writeFileSync(join(themeRoot, "package.json"), '{ "name": "shirones" }\n');
writeFileSync(join(siteRoot, "package.json"), '{ "name": "my-blog" }\n');

// An installed copy, as npm/pnpm would lay it out.
const installedRoot = join(siteRoot, "node_modules", "shirones");
mkdirSync(installedRoot, { recursive: true });
writeFileSync(join(installedRoot, "package.json"), '{ "name": "shirones" }\n');

after(() => {
	rmSync(themeRoot, { recursive: true, force: true });
	rmSync(siteRoot, { recursive: true, force: true });
});

const url = (p) => pathToFileURL(p).href;
/** `config.root` always arrives with a trailing slash. */
const rootUrl = (p) => pathToFileURL(`${p}/`).href;

test("detects the theme's own repository checkout", () => {
	const paths = resolvePaths(
		{},
		rootUrl(themeRoot),
		url(join(themeRoot, "src", "integration", "index.ts")),
	);
	assert.equal(paths.isThemeRepo, true);
	// The "user" directories point back at the repository's own layout.
	assert.equal(paths.configDir, join(themeRoot, "src", "config"));
	// Data modules sit *beside* `src/config/` in the repository, not under it.
	// Reading the package-mode shape here silently pointed the font pipeline at
	// a directory that does not exist.
	assert.equal(paths.dataDir, join(themeRoot, "src", "data"));
	assert.equal(paths.contentDir, join(themeRoot, "src", "content"));
});

test("detects an installed npm package", () => {
	const paths = resolvePaths(
		{},
		rootUrl(siteRoot),
		url(join(installedRoot, "index.js")),
	);
	assert.equal(paths.isThemeRepo, false);
	assert.equal(paths.configDir, join(siteRoot, "shirones", "config"));
	// …where a scaffolded project nests them under the config directory.
	assert.equal(paths.dataDir, join(siteRoot, "shirones", "config", "data"));
	assert.equal(paths.contentDir, join(siteRoot, "shirones", "content"));
});

test("treats a linked install as a dependency, not as the repository", () => {
	// `pnpm link` / a pnpm workspace / `npm link` reach the theme through a
	// symlink, and Node and Vite report the realpath — so the module URL points
	// at the checkout and carries no `node_modules` segment. Under the old
	// two-flag model this was neither "plugin" nor "in-repo", and the resulting
	// state injected no routes and never suggested `npx shirones init`.
	const paths = resolvePaths(
		{},
		rootUrl(siteRoot),
		url(join(themeRoot, "src", "integration", "index.ts")),
	);
	assert.equal(paths.isThemeRepo, false);
	// …and it still gets the package-mode directory defaults, which is what
	// makes "scaffold your config" and "inject the theme's routes" correct.
	assert.equal(paths.configDir, join(siteRoot, "shirones", "config"));
	assert.equal(paths.contentDir, join(siteRoot, "shirones", "content"));
});

test("explicit paths options win in every mode", () => {
	const overrides = {
		paths: {
			root: "content-root",
			config: "cfg",
			data: "cfg/data",
			content: "writing",
		},
	};
	for (const [label, root, mod] of [
		[
			"theme repo",
			themeRoot,
			join(themeRoot, "src", "integration", "index.ts"),
		],
		["installed", siteRoot, join(installedRoot, "index.js")],
	]) {
		const paths = resolvePaths(overrides, rootUrl(root), url(mod));
		assert.equal(paths.configDir, join(root, "cfg"), label);
		assert.equal(paths.dataDir, join(root, "cfg", "data"), label);
		assert.equal(paths.contentDir, join(root, "writing"), label);
	}
});

test("a bare `root` option relocates config, data and content together", () => {
	const paths = resolvePaths(
		{ paths: { root: "blog" } },
		rootUrl(siteRoot),
		url(join(installedRoot, "index.js")),
	);
	assert.equal(paths.configDir, join(siteRoot, "blog", "config"));
	assert.equal(paths.dataDir, join(siteRoot, "blog", "config", "data"));
	assert.equal(paths.contentDir, join(siteRoot, "blog", "content"));
});

test("packageSrc falls back to the package root when there is no src/", () => {
	const flat = mkdtempSync(join(tmpdir(), "shirones-flat-"));
	writeFileSync(join(flat, "package.json"), "{}\n");
	try {
		const paths = resolvePaths(
			{},
			rootUrl(siteRoot),
			url(join(flat, "index.js")),
		);
		assert.equal(paths.packageSrc, flat);
	} finally {
		rmSync(flat, { recursive: true, force: true });
	}
});

test("findPackageRoot walks up to the nearest package.json", () => {
	assert.equal(
		findPackageRoot(url(join(installedRoot, "deep", "index.js"))),
		installedRoot,
	);
});

test("the repository comparison ignores the trailing slash config.root carries", () => {
	// `fileURLToPath` of a `file:` URL keeps the trailing separator, so without
	// normalising, every checkout would compare unequal and be treated as a
	// dependency.
	assert.equal(normalisePath(`${themeRoot}/`), normalisePath(themeRoot));
	assert.equal(detectThemeRepo(`${themeRoot}/`, themeRoot), true);
	assert.equal(detectThemeRepo(siteRoot, themeRoot), false);
});

// ── The gate that used to misfire for a linked install ──────────────────────
import { prebundleCandidates } from "../src/integration/index.ts";

const SPECIFIERS = ["@swup/astro", "astro-icon", "stylus"];

test("pre-bundles the theme's own dependencies inside its repository", () => {
	const paths = resolvePaths(
		{},
		rootUrl(themeRoot),
		url(join(themeRoot, "src", "integration", "index.ts")),
	);
	assert.deepEqual(prebundleCandidates(paths, SPECIFIERS), SPECIFIERS);
});

test("skips the pre-bundle hint for an installed package", () => {
	const paths = resolvePaths(
		{},
		rootUrl(siteRoot),
		url(join(installedRoot, "index.js")),
	);
	assert.deepEqual(prebundleCandidates(paths, SPECIFIERS), []);
});

test("skips the pre-bundle hint for a linked install too", () => {
	// Before the single-flag model this returned the full list, because the
	// gate tested `isPluginMode` and a symlinked realpath carries no
	// `node_modules` segment — so Vite warned once per entry on every start.
	const paths = resolvePaths(
		{},
		rootUrl(siteRoot),
		url(join(themeRoot, "src", "integration", "index.ts")),
	);
	assert.deepEqual(prebundleCandidates(paths, SPECIFIERS), []);
});
