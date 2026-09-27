import assert from "node:assert/strict";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
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
} from "../src/integration/load-config.ts";
import { resolvePaths } from "../src/integration/paths.ts";

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
