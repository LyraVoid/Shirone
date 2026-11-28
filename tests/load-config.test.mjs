import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import {
	invalidateConfigCache,
	loadConfigModule,
	requireConfigExport,
} from "../src/integration/resolve/load-config.ts";
import { resolvePaths } from "../src/integration/resolve/paths.ts";

const roots = [];
const world = () => {
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-load-"));
	const siteRoot = mkdtempSync(join(tmpdir(), "shirones-site-"));
	roots.push(themeRoot, siteRoot);
	mkdirSync(join(themeRoot, "src", "integration"), { recursive: true });
	mkdirSync(join(themeRoot, "src", "config"), { recursive: true });
	writeFileSync(join(themeRoot, "package.json"), '{ "name": "shirones" }\n');
	writeFileSync(join(siteRoot, "package.json"), '{ "name": "my-blog" }\n');
	const paths = resolvePaths(
		{},
		pathToFileURL(`${siteRoot}/`).href,
		pathToFileURL(join(themeRoot, "src", "integration", "index.ts")).href,
	);
	return { themeRoot, siteRoot, paths };
};

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const bundlesFor = (paths, key) =>
	readdirSync(join(paths.cacheDir, "loaded")).filter(
		(name) => name.startsWith(key) && name.endsWith(".mjs"),
	);

test("keeps exactly one bundle per config module across edits", async () => {
	const { themeRoot, paths } = world();
	const source = join(themeRoot, "src", "config", "siteConfig.ts");

	writeFileSync(source, 'export const siteConfig = { site: "one" };\n');
	const first = await loadConfigModule(paths, "siteConfig");
	assert.equal(first.siteConfig.site, "one");
	assert.equal(bundlesFor(paths, "config_siteConfig.").length, 1);

	// A new content hash means a new filename, so Node's ESM cache cannot serve
	// the old module — but the superseded file must not linger.
	writeFileSync(source, 'export const siteConfig = { site: "two" };\n');
	invalidateConfigCache();
	const second = await loadConfigModule(paths, "siteConfig");
	assert.equal(second.siteConfig.site, "two");

	const left = bundlesFor(paths, "config_siteConfig.");
	assert.equal(
		left.length,
		1,
		`expected the stale bundle to be pruned, found ${left.join(", ")}`,
	);
});

test("leaves other modules' bundles alone when pruning", async () => {
	const { themeRoot, paths } = world();
	writeFileSync(
		join(themeRoot, "src", "config", "siteConfig.ts"),
		'export const siteConfig = { site: "a" };\n',
	);
	writeFileSync(
		join(themeRoot, "src", "config", "musicConfig.ts"),
		"export const musicConfig = { enable: false };\n",
	);

	await loadConfigModule(paths, "siteConfig");
	await loadConfigModule(paths, "musicConfig");
	writeFileSync(
		join(themeRoot, "src", "config", "siteConfig.ts"),
		'export const siteConfig = { site: "b" };\n',
	);
	invalidateConfigCache();
	await loadConfigModule(paths, "siteConfig");

	assert.equal(bundlesFor(paths, "config_siteConfig.").length, 1);
	assert.equal(bundlesFor(paths, "config_musicConfig.").length, 1);
});

test("names the module when the user's config does not parse", async () => {
	const { themeRoot, paths } = world();
	// The bundle cache is process-global and keyed by module *name*, so an
	// earlier test's successful `config:siteConfig` would otherwise be handed
	// straight back without ever bundling the broken file below.
	invalidateConfigCache();
	writeFileSync(
		join(themeRoot, "src", "config", "siteConfig.ts"),
		'export const siteConfig = { site: "x" ;\n', // missing closing brace
	);

	await assert.rejects(
		() => loadConfigModule(paths, "siteConfig"),
		(error) => {
			assert.match(
				error.message,
				/\[shirones\] Failed to bundle "config:siteConfig"/,
			);
			assert.match(error.message, /siteConfig\.ts:\d+:\d+/);
			assert.ok(
				error.cause,
				"the original esbuild error stays attached as cause",
			);
			return true;
		},
	);
});

test("explains where to look when a config module is missing entirely", async () => {
	const { paths } = world();
	await assert.rejects(
		() => loadConfigModule(paths, "noSuchConfig"),
		/Could not find config module "noSuchConfig"[\s\S]*npx shirones init/,
	);
});

test("falls back to the package copy for a sibling an override does not mirror", async () => {
	const { themeRoot, siteRoot, paths } = world();
	const themeConfig = join(themeRoot, "src", "config");
	const userConfig = join(siteRoot, "shirones", "config");
	mkdirSync(userConfig, { recursive: true });

	// The package ships both modules.
	writeFileSync(
		join(themeConfig, "sitemapFilter.ts"),
		'import { siteConfig } from "./siteConfig.ts";\n' +
			"export const isAllowed = () => siteConfig.site;\n",
	);
	writeFileSync(
		join(themeConfig, "siteConfig.ts"),
		'export const siteConfig = { site: "from-package" };\n',
	);

	// The user overrides only the entry module, not the sibling it imports.
	writeFileSync(
		join(userConfig, "sitemapFilter.ts"),
		'import { siteConfig } from "./siteConfig.ts";\n' +
			"export const isAllowed = () => `user:${siteConfig.site}`;\n",
	);

	invalidateConfigCache();
	const loaded = await loadConfigModule(paths, "sitemapFilter");
	// The user's copy wins for the entry…
	assert.equal(loaded.isAllowed(), "user:from-package");
	// …and the sibling it never mirrored resolves to the package's.
});

test("a mirrored sibling still wins over the package copy", async () => {
	const { themeRoot, siteRoot, paths } = world();
	const themeConfig = join(themeRoot, "src", "config");
	const userConfig = join(siteRoot, "shirones", "config");
	mkdirSync(userConfig, { recursive: true });

	writeFileSync(
		join(themeConfig, "sitemapFilter.ts"),
		'import { siteConfig } from "./siteConfig.ts";\n' +
			"export const isAllowed = () => siteConfig.site;\n",
	);
	writeFileSync(
		join(themeConfig, "siteConfig.ts"),
		'export const siteConfig = { site: "from-package" };\n',
	);
	writeFileSync(
		join(userConfig, "sitemapFilter.ts"),
		'import { siteConfig } from "./siteConfig.ts";\n' +
			"export const isAllowed = () => `user:${siteConfig.site}`;\n",
	);
	// This one the user did mirror.
	writeFileSync(
		join(userConfig, "siteConfig.ts"),
		'export const siteConfig = { site: "from-user" };\n',
	);

	invalidateConfigCache();
	const loaded = await loadConfigModule(paths, "sitemapFilter");
	assert.equal(loaded.isAllowed(), "user:from-user");
});

// F-50: a user's config/sitemapFilter.ts override that loads fine but omits the
// predicate used to fail deep inside @astrojs/sitemap at build time.
test("requireConfigExport names the config file when the export is missing", async () => {
	const { themeRoot, siteRoot, paths } = world();
	const userConfig = join(siteRoot, "shirones", "config");
	mkdirSync(userConfig, { recursive: true });
	writeFileSync(
		join(themeRoot, "src", "config", "sitemapFilter.ts"),
		"export const isSitemapPageAllowed = () => true;\n",
	);
	writeFileSync(
		join(userConfig, "sitemapFilter.ts"),
		"export const isPageAllowed = () => true;\n",
	);

	invalidateConfigCache();
	const loaded = await loadConfigModule(paths, "sitemapFilter");
	assert.throws(
		() =>
			requireConfigExport(loaded, "sitemapFilter.ts", "isSitemapPageAllowed"),
		{ message: "config/sitemapFilter.ts must export isSitemapPageAllowed" },
	);
});

test("requireConfigExport returns the predicate a config does export", async () => {
	const { themeRoot, paths } = world();
	writeFileSync(
		join(themeRoot, "src", "config", "sitemapFilter.ts"),
		"export const isSitemapPageAllowed = () => true;\n",
	);

	invalidateConfigCache();
	const loaded = await loadConfigModule(paths, "sitemapFilter");
	const checked = requireConfigExport(
		loaded,
		"sitemapFilter.ts",
		"isSitemapPageAllowed",
	);
	assert.equal(checked, loaded.isSitemapPageAllowed);
	assert.equal(checked("anything"), true);
});

test("the sitemap filter is validated before the integration casts it", () => {
	const source = readFileSync(
		new URL("../src/integration/index.ts", import.meta.url),
		"utf8",
	);
	assert.match(
		source,
		/requireConfigExport<\(page: string\) => boolean>\(\s*\n\s*sitemapModule,/,
		"index.ts must validate the export instead of asserting it",
	);
	assert.doesNotMatch(
		source,
		/isSitemapPageAllowed as \(/,
		"the bare type assertion is what made the failure unlocatable",
	);
});
