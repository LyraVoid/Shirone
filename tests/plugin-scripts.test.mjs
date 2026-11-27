/**
 * Plugin scripts (`shirones/scripts/`, docs/plugin-scripts.md).
 *
 * Three layers, each tested where it can fail on its own: finding and loading
 * the files, the API a script registers through, and what the registrations do
 * to the Markdown chain and the injected routes.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { pathToFileURL } from "node:url";
import rehypeComponents from "rehype-components";
import remarkDirective from "remark-directive";
import {
	findPluginScripts,
	loadPluginScripts,
	normaliseRoutePattern,
	resolveInjectedRoutes,
	runPlugins,
	toLoadedPlugin,
} from "../src/integration/plugins.ts";
import { resolvePaths } from "../src/integration/resolve/paths.ts";
import { remarkFeatureProbes } from "../src/plugins/remark-feature-probes.mjs";
import {
	assertMarkdownExtensionsVisible,
	extendMarkdownPlugins,
	NO_MARKDOWN_EXTENSIONS,
	publishMarkdownExtensions,
	readMarkdownExtensions,
	remarkPluginScriptsDigest,
} from "../src/utils/markdown-extensions.mjs";
import {
	createSiteMarkdownProcessor,
	siteMarkdownProcessor,
	siteRehypePlugins,
	siteRemarkPlugins,
} from "../src/utils/markdown-processor.mjs";

const scratch = [];
after(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function write(file, content) {
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

/** A project that installed the theme: package and site are separate trees. */
function project() {
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-plugin-theme-"));
	const siteRoot = mkdtempSync(join(tmpdir(), "shirones-plugin-site-"));
	scratch.push(themeRoot, siteRoot);
	write(join(themeRoot, "package.json"), '{"name":"shirones"}');
	write(
		join(themeRoot, "src/config/siteConfig.ts"),
		'export const siteConfig = { title: "theme default" };\n',
	);
	const paths = resolvePaths(
		{},
		pathToFileURL(`${siteRoot}/`),
		pathToFileURL(join(themeRoot, "index.js")).href,
	);
	return { themeRoot, siteRoot, paths };
}

function recordingLogger() {
	const lines = { info: [], warn: [] };
	return {
		lines,
		info: (message) => lines.info.push(message),
		warn: (message) => lines.warn.push(message),
	};
}

/** A plugin as `loadPluginScripts` would hand it over. */
function plugin(name, setup, digest = `digest-${name}`) {
	return { name, file: `/project/shirones/scripts/${name}.ts`, digest, setup };
}

function run(plugins, overrides = {}) {
	const { paths } = overrides.project ?? project();
	const logger = overrides.logger ?? recordingLogger();
	return runPlugins(plugins, {
		paths: overrides.paths ?? paths,
		command: overrides.command ?? "build",
		logger,
	});
}

const pluginOf = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const position = (chain, target) =>
	chain.findIndex((entry) => pluginOf(entry) === target);

// ── Finding the scripts ─────────────────────────────────────────────────────

test("scripts are the files directly in the directory, in name order", () => {
	const { paths } = project();
	const dir = paths.scriptsDir;
	for (const name of [
		"20-second.mjs",
		"10-first.ts",
		"30-third.js",
		"40-fourth.mts",
	]) {
		write(join(dir, name), "export default () => {};\n");
	}
	// None of these is a plugin.
	write(join(dir, "_helper.ts"), "export const x = 1;\n");
	write(join(dir, ".hidden.ts"), "export const x = 1;\n");
	write(join(dir, "types.d.ts"), "export type X = 1;\n");
	write(join(dir, "notes.md"), "# notes\n");
	write(join(dir, "lib/util.ts"), "export const x = 1;\n");

	assert.deepEqual(
		findPluginScripts(dir).map((file) => file.slice(dir.length + 1)),
		["10-first.ts", "20-second.mjs", "30-third.js", "40-fourth.mts"],
	);
});

test("a project without the directory has no scripts", () => {
	const { paths } = project();
	assert.deepEqual(findPluginScripts(paths.scriptsDir), []);
});

test("the scripts directory is <root>/scripts in both modes, and can be moved", () => {
	const { themeRoot, siteRoot } = project();
	const entry = pathToFileURL(join(themeRoot, "index.js")).href;
	const installed = resolvePaths({}, pathToFileURL(`${siteRoot}/`), entry);
	assert.equal(installed.isThemeRepo, false);
	assert.equal(installed.scriptsDir, join(siteRoot, "shirones", "scripts"));

	const repo = resolvePaths({}, pathToFileURL(`${themeRoot}/`), entry);
	assert.equal(repo.isThemeRepo, true);
	assert.equal(repo.scriptsDir, join(themeRoot, "shirones", "scripts"));

	assert.equal(
		resolvePaths(
			{ paths: { root: "site", scripts: "tools/plugins" } },
			pathToFileURL(`${siteRoot}/`),
			entry,
		).scriptsDir,
		join(siteRoot, "tools", "plugins"),
	);
	assert.equal(
		resolvePaths(
			{ paths: { root: "site" } },
			pathToFileURL(`${siteRoot}/`),
			entry,
		).scriptsDir,
		join(siteRoot, "site", "scripts"),
	);
});

// ── Reading a script's export ───────────────────────────────────────────────

test("a plugin is an object with setup() or a bare setup function", () => {
	const calls = [];
	const object = toLoadedPlugin(
		"/p/scripts/cards.ts",
		{ name: " fancy-cards ", setup: (api) => calls.push(["object", api]) },
		"d1",
	);
	assert.equal(object.name, "fancy-cards");
	assert.equal(object.digest, "d1");
	object.setup("api");

	const unnamed = toLoadedPlugin("/p/scripts/cards.ts", { setup() {} }, "d");
	assert.equal(unnamed.name, "cards");

	const bare = toLoadedPlugin(
		"/p/scripts/10-routes.mjs",
		(api) => calls.push(["function", api]),
		"d2",
	);
	assert.equal(bare.name, "10-routes");
	bare.setup("api");

	assert.deepEqual(calls, [
		["object", "api"],
		["function", "api"],
	]);
});

test("setup() keeps its `this`", () => {
	const module = {
		name: "stateful",
		prefix: "x",
		setup() {
			return this.prefix;
		},
	};
	assert.equal(toLoadedPlugin("/p/a.ts", module, "d").setup({}), "x");
});

test("a file that exports no plugin is an error naming the file", () => {
	for (const exported of [undefined, null, 42, "text", {}, { setup: 1 }]) {
		assert.throws(
			() => toLoadedPlugin("/p/scripts/helper.ts", exported, "d"),
			/\/p\/scripts\/helper\.ts is not a plugin.*sub-directory.*`_`/s,
		);
	}
});

// ── The API ─────────────────────────────────────────────────────────────────

test("a plugin sees the command, the mode and the project's paths", async () => {
	const fixture = project();
	const seen = [];
	await run(
		[
			plugin("probe", (api) => {
				seen.push(api.command, api.packageMode, api.paths);
			}),
		],
		{ project: fixture, command: "dev" },
	);
	assert.deepEqual(seen, [
		"dev",
		true,
		{
			projectRoot: fixture.paths.projectRoot,
			configDir: fixture.paths.configDir,
			dataDir: fixture.paths.dataDir,
			contentDir: fixture.paths.contentDir,
			scriptsDir: fixture.paths.scriptsDir,
		},
	]);
});

test("packageMode is false inside the theme's own repository", async () => {
	const { themeRoot } = project();
	const paths = resolvePaths(
		{},
		pathToFileURL(`${themeRoot}/`),
		pathToFileURL(join(themeRoot, "index.js")).href,
	);
	let mode;
	await run([plugin("probe", (api) => (mode = api.packageMode))], { paths });
	assert.equal(mode, false);
});

test("the plugin's logger prefixes its name", async () => {
	const logger = recordingLogger();
	await run(
		[
			plugin("chatty", (api) => {
				api.logger.info("hello");
				api.logger.warn("careful");
			}),
		],
		{ logger },
	);
	assert.deepEqual(logger.lines, {
		info: ["[chatty] hello"],
		warn: ["[chatty] careful"],
	});
});

test("registrations are collected in load order, with default positions", async () => {
	const fixture = project();
	const page = write(join(fixture.siteRoot, "src/reading.astro"), "---\n---\n");
	const iconDir = join(fixture.siteRoot, "extra");
	mkdirSync(iconDir);
	const remarkA = () => {};
	const remarkB = () => {};
	const rehypeA = () => {};
	const rehypeB = () => {};
	const card = () => {};
	const done = () => {};

	const result = await run(
		[
			plugin("one", async (api) => {
				api.markdown.remark(remarkA);
				api.markdown.rehype([rehypeA, { option: 1 }], {
					at: "before-components",
				});
				api.routes.add({
					pattern: "reading/",
					entrypoint: "src/reading.astro",
				});
				api.routes.remove("/anime/");
				api.fonts.keep("㊙");
				await Promise.resolve();
				api.onBuildDone(done);
			}),
			plugin("two", (api) => {
				api.markdown.remark(remarkB, { at: "before-directive" });
				api.markdown.rehype(rehypeB);
				api.markdown.directive("card", card);
				api.routes.replace("devices", page);
				api.icons.scan("extra", page);
				api.fonts.keep("〠");
			}),
		],
		{ project: fixture },
	);

	assert.deepEqual(result.names, ["one", "two"]);
	assert.deepEqual(result.markdown.remark, [
		{ plugin: remarkA, at: "after-directive" },
		{ plugin: remarkB, at: "before-directive" },
	]);
	assert.deepEqual(result.markdown.rehype, [
		{ plugin: [rehypeA, { option: 1 }], at: "before-components" },
		{ plugin: rehypeB, at: "end" },
	]);
	assert.deepEqual(result.markdown.directives, { card });
	assert.deepEqual(result.routes.added, [
		{ pattern: "/reading", entrypoint: page, plugin: "one" },
	]);
	assert.deepEqual([...result.routes.removed], [["/anime", "one"]]);
	assert.deepEqual(
		[...result.routes.replaced],
		[["/devices", { entrypoint: page, plugin: "two" }]],
	);
	assert.deepEqual(result.iconSources, [iconDir, page]);
	assert.equal(result.fontCharacters, "㊙〠");
	assert.deepEqual(result.buildDone, [{ plugin: "one", handler: done }]);
});

test("without plugins nothing is contributed", async () => {
	const result = await run([]);
	assert.deepEqual(result.names, []);
	assert.equal(result.markdown, NO_MARKDOWN_EXTENSIONS);
	assert.equal(result.markdown.digest, "");
	assert.deepEqual(result.routes.added, []);
	assert.equal(result.fontCharacters, "");
});

test("only Markdown registrations produce a Markdown digest", async () => {
	const quiet = await run([plugin("routes", (api) => api.fonts.keep("x"))]);
	assert.equal(quiet.markdown, NO_MARKDOWN_EXTENSIONS);

	const remark = (api) => api.markdown.remark(() => {});
	const first = await run([plugin("md", remark, "aaa")]);
	const same = await run([plugin("md", remark, "aaa")]);
	const edited = await run([plugin("md", remark, "bbb")]);
	// A script that registers nothing for Markdown may still be the helper the
	// one that does imports, so every script counts.
	const neighbour = await run([
		plugin("md", remark, "aaa"),
		plugin("other", () => {}, "ccc"),
	]);

	assert.match(first.markdown.digest, /^[0-9a-f]{12}$/);
	assert.equal(same.markdown.digest, first.markdown.digest);
	assert.notEqual(edited.markdown.digest, first.markdown.digest);
	assert.notEqual(neighbour.markdown.digest, first.markdown.digest);
});

test("a later plugin replaces an earlier plugin's directive, with a warning", async () => {
	const logger = recordingLogger();
	const first = () => "first";
	const second = () => "second";
	const result = await run(
		[
			plugin("a", (api) => api.markdown.directive("card", first)),
			plugin("b", (api) => api.markdown.directive("card", second)),
		],
		{ logger },
	);
	assert.equal(result.markdown.directives.card, second);
	assert.deepEqual(logger.lines.warn, [
		'[plugins] "b" replaces the "card" directive registered by "a"',
	]);
});

test("every unusable argument is an error naming the plugin and its file", async () => {
	const fixture = project();
	write(join(fixture.siteRoot, "page.astro"), "---\n---\n");
	const cases = [
		[
			(api) => api.markdown.remark("remark-gfm"),
			/markdown\.remark\(\) needs a unified plugin.*got "remark-gfm"/,
		],
		[
			(api) => api.markdown.remark([{}, {}]),
			/markdown\.remark\(\) needs a unified plugin.*got an array/,
		],
		[
			(api) => api.markdown.remark(() => {}, { at: "start" }),
			/markdown\.remark\(\) does not know the position "start"; use "before-directive" or "after-directive"/,
		],
		[
			(api) => api.markdown.rehype(undefined),
			/markdown\.rehype\(\) needs a unified plugin.*got undefined/,
		],
		[
			(api) => api.markdown.rehype(() => {}, { at: "after-directive" }),
			/markdown\.rehype\(\) does not know the position "after-directive"; use "before-components" or "end"/,
		],
		[
			(api) => api.markdown.directive("My Card", () => {}),
			/markdown\.directive\(\) needs a name of lowercase letters.*got "My Card"/,
		],
		[
			(api) => api.markdown.directive("card", "<div>"),
			/markdown\.directive\("card"\) needs a function.*got "<div>"/,
		],
		[
			(api) => api.routes.add({ pattern: "", entrypoint: "page.astro" }),
			/routes\.add\(\) needs a route pattern, got ""/,
		],
		[
			(api) => api.routes.add(),
			/routes\.add\(\) needs a route pattern, got undefined/,
		],
		[
			(api) => api.routes.add({ pattern: "/x" }),
			/routes\.add\(\) needs a path, got undefined/,
		],
		[
			(api) => api.routes.add({ pattern: "/x", entrypoint: "missing.astro" }),
			/routes\.add\(\) points at .*missing\.astro, which does not exist/,
		],
		[
			(api) => api.routes.remove(7),
			/routes\.remove\(\) needs a route pattern, got number/,
		],
		[
			(api) => api.routes.replace("/x", "missing.astro"),
			/routes\.replace\(\) points at .*missing\.astro, which does not exist/,
		],
		[
			(api) => api.icons.scan("nowhere"),
			/icons\.scan\(\) points at .*nowhere, which does not exist/,
		],
		[
			(api) => api.fonts.keep(["a"]),
			/fonts\.keep\(\) needs a string, got an array/,
		],
		[
			(api) => api.onBuildDone("later"),
			/onBuildDone\(\) needs a function, got "later"/,
		],
	];
	for (const [setup, expected] of cases) {
		await assert.rejects(
			run([plugin("bad", setup)], { project: fixture }),
			(error) => {
				assert.match(error.message, expected);
				assert.match(
					error.message,
					/^\[shirones\] plugin "bad" \(\/project\/shirones\/scripts\/bad\.ts\): /,
				);
				return true;
			},
		);
	}
});

test("two plugins cannot add the same route", async () => {
	const fixture = project();
	write(join(fixture.siteRoot, "page.astro"), "---\n---\n");
	const add = (api) =>
		api.routes.add({ pattern: "/reading", entrypoint: "page.astro" });
	await assert.rejects(
		run([plugin("a", add), plugin("b", add)], { project: fixture }),
		/plugin "b".*routes\.add\("\/reading"\) repeats a route added by "a"/,
	);
});

test("two plugins cannot share a name", async () => {
	await assert.rejects(
		run([plugin("same", () => {}), plugin("same", () => {})]),
		/two plugins are named "same"/,
	);
});

test("an exception in setup() names the plugin and keeps the cause", async () => {
	const cause = new TypeError("boom");
	await assert.rejects(
		run([
			plugin("fragile", () => {
				throw cause;
			}),
		]),
		(error) => {
			assert.equal(
				error.message,
				'[shirones] plugin "fragile" (/project/shirones/scripts/fragile.ts) threw in setup(): boom',
			);
			assert.equal(error.cause, cause);
			return true;
		},
	);
});

test("a registration after setup() returned is an error, not a silent loss", async () => {
	let late;
	const result = await run([
		plugin("late", (api) => {
			late = api;
		}),
	]);
	assert.throws(
		() => late.markdown.remark(() => {}),
		/plugin "late".*markdown\.remark\(\) was called after setup\(\) had returned/,
	);
	assert.throws(() => late.fonts.keep("x"), /fonts\.keep\(\) was called after/);
	assert.throws(
		() => late.onBuildDone(() => {}),
		/onBuildDone\(\) was called after/,
	);
	assert.equal(result.fontCharacters, "");
});

// ── Routes ──────────────────────────────────────────────────────────────────

test("route patterns are compared without a trailing slash", () => {
	assert.equal(normaliseRoutePattern("reading"), "/reading");
	assert.equal(normaliseRoutePattern("/reading/"), "/reading");
	assert.equal(normaliseRoutePattern("/notes/[slug]//"), "/notes/[slug]");
	assert.equal(normaliseRoutePattern("/"), "/");
});

const themeRoutes = () => [
	{
		pattern: "/",
		entrypoint: "/theme/pages/index.astro",
		source: "index.astro",
	},
	{
		pattern: "/anime",
		entrypoint: "/theme/pages/anime.astro",
		source: "anime.astro",
	},
	{
		pattern: "/devices",
		entrypoint: "/theme/pages/devices.astro",
		source: "devices.astro",
	},
];

function routeRegistrations({ added = [], removed = [], replaced = [] } = {}) {
	return {
		added,
		removed: new Map(removed),
		replaced: new Map(replaced),
	};
}

test("remove drops a theme route, replace re-points one, add appends", () => {
	const logger = recordingLogger();
	const routes = resolveInjectedRoutes(
		themeRoutes(),
		routeRegistrations({
			added: [
				{ pattern: "/reading", entrypoint: "/site/reading.astro", plugin: "p" },
			],
			removed: [["/anime", "p"]],
			replaced: [
				["/devices", { entrypoint: "/site/devices.astro", plugin: "p" }],
			],
		}),
		logger,
	);
	assert.deepEqual(routes, [
		{ pattern: "/", entrypoint: "/theme/pages/index.astro" },
		{ pattern: "/devices", entrypoint: "/site/devices.astro" },
		{ pattern: "/reading", entrypoint: "/site/reading.astro" },
	]);
	assert.deepEqual(logger.lines.warn, []);
});

test("without registrations the theme's routes pass through", () => {
	assert.deepEqual(
		resolveInjectedRoutes(
			themeRoutes(),
			routeRegistrations(),
			recordingLogger(),
		),
		themeRoutes().map(({ pattern, entrypoint }) => ({ pattern, entrypoint })),
	);
});

test("a route the theme does not inject is a warning, and the build goes on", () => {
	const logger = recordingLogger();
	const routes = resolveInjectedRoutes(
		themeRoutes(),
		routeRegistrations({
			removed: [["/gone", "p"]],
			replaced: [["/renamed", { entrypoint: "/site/x.astro", plugin: "q" }]],
		}),
		logger,
	);
	assert.equal(routes.length, 3);
	assert.deepEqual(logger.lines.warn, [
		'[plugins] "p": routes.remove("/gone") matches no route the theme injects',
		'[plugins] "q": routes.replace("/renamed") matches no route the theme injects; use routes.add() for a new page',
	]);
});

test("adding over a theme route is an error that points at replace", () => {
	assert.throws(
		() =>
			resolveInjectedRoutes(
				themeRoutes(),
				routeRegistrations({
					added: [
						{ pattern: "/anime", entrypoint: "/site/a.astro", plugin: "p" },
					],
				}),
				recordingLogger(),
			),
		/plugin "p": routes\.add\("\/anime"\) collides with a route the theme injects; use routes\.replace/,
	);
});

test("removing a theme route frees its pattern for add", () => {
	assert.deepEqual(
		resolveInjectedRoutes(
			themeRoutes().slice(1, 2),
			routeRegistrations({
				added: [
					{ pattern: "/anime", entrypoint: "/site/a.astro", plugin: "p" },
				],
				removed: [["/anime", "p"]],
			}),
			recordingLogger(),
		),
		[{ pattern: "/anime", entrypoint: "/site/a.astro" }],
	);
});

test("where the theme injects no routes, add still works and the rest only warns", () => {
	const logger = recordingLogger();
	const routes = resolveInjectedRoutes(
		null,
		routeRegistrations({
			added: [
				{ pattern: "/reading", entrypoint: "/site/reading.astro", plugin: "p" },
			],
			removed: [["/anime", "p"]],
			replaced: [["/devices", { entrypoint: "/site/d.astro", plugin: "q" }]],
		}),
		logger,
	);
	assert.deepEqual(routes, [
		{ pattern: "/reading", entrypoint: "/site/reading.astro" },
	]);
	assert.deepEqual(logger.lines.warn, [
		'[plugins] "p": routes.remove("/anime") is ignored: the theme\'s pages are files under src/pages/ here; edit them directly',
		'[plugins] "q": routes.replace("/devices") is ignored: the theme\'s pages are files under src/pages/ here; edit them directly',
	]);
});

// ── The Markdown chain ──────────────────────────────────────────────────────

const base = () => ({
	remarkPlugins: siteRemarkPlugins,
	rehypePlugins: siteRehypePlugins,
	directive: remarkDirective,
	probes: remarkFeatureProbes,
	components: rehypeComponents,
});

test("without extensions the chains are the theme's own arrays", () => {
	const { remarkPlugins, rehypePlugins } = extendMarkdownPlugins(
		base(),
		NO_MARKDOWN_EXTENSIONS,
	);
	assert.equal(remarkPlugins, siteRemarkPlugins);
	assert.equal(rehypePlugins, siteRehypePlugins);
	assert.deepEqual(
		siteMarkdownProcessor.options.remarkPlugins,
		siteRemarkPlugins,
	);
	assert.deepEqual(
		siteMarkdownProcessor.options.rehypePlugins,
		siteRehypePlugins,
	);
});

test("each anchor is a fixed place in the theme's order", () => {
	const early = () => {};
	const early2 = () => {};
	const late = () => {};
	const late2 = () => {};
	const beforeComponents = () => {};
	const end = () => {};
	const end2 = () => {};
	const remarkBefore = siteRemarkPlugins.length;
	const rehypeBefore = siteRehypePlugins.length;

	const { remarkPlugins, rehypePlugins } = extendMarkdownPlugins(base(), {
		digest: "abc",
		remark: [
			{ plugin: late, at: "after-directive" },
			{ plugin: early, at: "before-directive" },
			{ plugin: [late2, { x: 1 }], at: "after-directive" },
			{ plugin: early2, at: "before-directive" },
		],
		rehype: [
			{ plugin: end, at: "end" },
			{ plugin: beforeComponents, at: "before-components" },
			{ plugin: end2, at: "end" },
		],
		directives: {},
	});

	// before-directive: immediately before remark-directive, in order.
	const directive = position(remarkPlugins, remarkDirective);
	assert.equal(position(remarkPlugins, early), directive - 2);
	assert.equal(position(remarkPlugins, early2), directive - 1);
	// after-directive: immediately before the feature probes, in order, so the
	// probes still see every plugin's output (markdown-plugin-order.md rule 4).
	const probes = position(remarkPlugins, remarkFeatureProbes);
	assert.equal(position(remarkPlugins, late), probes - 2);
	assert.equal(position(remarkPlugins, late2), probes - 1);
	assert.ok(directive < position(remarkPlugins, late));
	// The digest marker is last and carries the digest as its options.
	assert.deepEqual(remarkPlugins.at(-1), [
		remarkPluginScriptsDigest,
		{ digest: "abc" },
	]);
	assert.equal(remarkPlugins.length, remarkBefore + 5);

	const components = position(rehypePlugins, rehypeComponents);
	assert.equal(position(rehypePlugins, beforeComponents), components - 1);
	assert.equal(rehypePlugins.at(-2), end);
	assert.equal(rehypePlugins.at(-1), end2);
	assert.equal(rehypePlugins.length, rehypeBefore + 3);

	// The theme's own order is intact around the insertions…
	const inserted = new Set([
		early,
		early2,
		late,
		late2,
		beforeComponents,
		end,
		end2,
		remarkPluginScriptsDigest,
	]);
	assert.deepEqual(
		remarkPlugins.filter((entry) => !inserted.has(pluginOf(entry))),
		siteRemarkPlugins,
	);
	assert.deepEqual(
		rehypePlugins.filter((entry) => !inserted.has(pluginOf(entry))),
		siteRehypePlugins,
	);
	// …and the theme's arrays were not touched.
	assert.equal(siteRemarkPlugins.length, remarkBefore);
	assert.equal(siteRehypePlugins.length, rehypeBefore);
});

test("the digest reaches Astro's config comparison, which drops functions", () => {
	// Astro decides whether to drop its content cache by comparing the config
	// as JSON. Editing a plugin changes no JSON, so the digest has to.
	const chain = (digest) =>
		JSON.stringify(
			extendMarkdownPlugins(base(), {
				digest,
				remark: [{ plugin: () => {}, at: "after-directive" }],
				rehype: [],
				directives: {},
			}),
		);
	assert.notEqual(chain("one"), chain("two"));
	assert.equal(chain("one"), chain("one"));
});

test("a directive is added next to the theme's, and may replace one of them", () => {
	const card = () => {};
	const note = () => {};
	const { rehypePlugins } = extendMarkdownPlugins(base(), {
		digest: "abc",
		remark: [],
		rehype: [],
		directives: { card, note },
	});
	const themeComponents =
		siteRehypePlugins[position(siteRehypePlugins, rehypeComponents)][1]
			.components;
	const [, options] = rehypePlugins[position(rehypePlugins, rehypeComponents)];

	assert.equal(options.components.card, card);
	assert.equal(options.components.note, note);
	assert.notEqual(themeComponents.note, note);
	assert.equal(themeComponents.card, undefined);
	assert.equal(options.components.github, themeComponents.github);
	assert.deepEqual(
		Object.keys(options.components).sort(),
		[...Object.keys(themeComponents), "card"].sort(),
	);
});

test("a chain that lost an anchor fails loudly instead of misplacing plugins", () => {
	const extensions = {
		digest: "abc",
		remark: [{ plugin: () => {}, at: "after-directive" }],
		rehype: [],
		directives: {},
	};
	assert.throws(
		() => extendMarkdownPlugins({ ...base(), probes: () => {} }, extensions),
		/no longer contains the feature probes/,
	);
	assert.throws(
		() => extendMarkdownPlugins({ ...base(), directive: () => {} }, extensions),
		/no longer contains remark-directive/,
	);
	assert.throws(
		() =>
			extendMarkdownPlugins({ ...base(), components: () => {} }, extensions),
		/no longer contains rehype-components/,
	);
});

async function render(processor, markdown) {
	const renderer = await processor.createRenderer({});
	const { code } = await renderer.render(markdown, { frontmatter: {} });
	return code;
}

const SAMPLE = [
	"PROBE in a paragraph, with a :stray colon word.",
	"",
	'::probe-card[inner]{title="hello"}',
	"",
	":::note",
	"PROBE inside a theme directive.",
	":::",
	"",
	"> a quote",
	"",
].join("\n");

/** What a script would register, written without any helper library. */
function sampleExtensions() {
	const walk = (node, visit) => {
		visit(node);
		for (const child of node.children ?? []) walk(child, visit);
	};
	return {
		digest: "sample",
		remark: [
			{
				at: "after-directive",
				plugin: () => (tree) =>
					walk(tree, (node) => {
						if (node.type === "text") {
							node.value = node.value.replaceAll("PROBE", "replaced");
						}
					}),
			},
			{
				// Directives are nodes at both positions; here the theme has
				// not yet turned the stray `:stray` back into text.
				at: "before-directive",
				plugin: () => (tree) =>
					walk(tree, (node) => {
						if (node.type === "textDirective" && node.name === "stray") {
							node.type = "text";
							node.value = "caught-early";
							node.children = undefined;
						}
					}),
			},
			{
				at: "after-directive",
				plugin: () => (tree) =>
					walk(tree, (node) => {
						if (node.type === "textDirective" && node.name === "stray") {
							node.type = "text";
							node.value = "caught-late";
						}
					}),
			},
		],
		rehype: [
			{
				at: "before-components",
				plugin: () => (tree) =>
					walk(tree, (node) => {
						if (node.tagName === "probe-card") {
							node.properties.seen = "before-components";
						}
					}),
			},
			{
				at: "end",
				plugin: () => (tree) =>
					walk(tree, (node) => {
						if (node.tagName === "blockquote") {
							node.properties["data-end"] = "yes";
						}
					}),
			},
		],
		directives: {
			"probe-card": (properties, children) => ({
				type: "element",
				tagName: "aside",
				properties: {
					className: ["probe-card"],
					"data-title": properties.title,
					"data-seen": properties.seen,
				},
				children,
			}),
		},
	};
}

test("registered plugins and directives change the rendered HTML", async () => {
	const plain = await render(siteMarkdownProcessor, SAMPLE);
	assert.match(plain, /PROBE in a paragraph/);
	assert.match(plain, /<probe-card title="hello">inner<\/probe-card>/);
	assert.doesNotMatch(plain, /data-end/);

	const html = await render(
		createSiteMarkdownProcessor(sampleExtensions()),
		SAMPLE,
	);
	// remark, after-directive: also inside a theme directive's body.
	assert.match(html, /replaced in a paragraph/);
	assert.match(html, /replaced inside a theme directive/);
	assert.doesNotMatch(html, /PROBE/);
	// before-directive ran before the theme restored the stray directive to
	// text, after-directive ran after and found nothing left to catch.
	assert.match(plain, /with a :stray colon word/);
	assert.match(html, /with a caught-early colon word/);
	const lateOnly = sampleExtensions();
	lateOnly.remark = lateOnly.remark.filter(
		(entry) => entry.at === "after-directive",
	);
	assert.match(
		await render(createSiteMarkdownProcessor(lateOnly), SAMPLE),
		/with a :stray colon word/,
	);
	// rehype before-components saw the element; the directive rendered it.
	assert.match(
		html,
		/<aside class="probe-card" data-title="hello" data-seen="before-components">inner<\/aside>/,
	);
	// rehype, end.
	assert.match(html, /<blockquote data-end="yes">/);
	// The theme's own directive still renders as before.
	assert.match(html, /admonition/);
});

test("a script directive can replace the theme's renderer", async () => {
	const html = await render(
		createSiteMarkdownProcessor({
			digest: "x",
			remark: [],
			rehype: [],
			directives: {
				note: (_properties, children) => ({
					type: "element",
					tagName: "div",
					properties: { className: ["my-note"] },
					children,
				}),
			},
		}),
		SAMPLE,
	);
	assert.match(html, /<div class="my-note">/);
	assert.doesNotMatch(html, /admonition/);
});

// ── Sharing the extensions with the site's own code ─────────────────────────

test("published extensions are what the next processor is built from", async () => {
	assert.equal(readMarkdownExtensions(), NO_MARKDOWN_EXTENSIONS);
	const extensions = sampleExtensions();
	publishMarkdownExtensions(extensions);
	try {
		assert.equal(readMarkdownExtensions(), extensions);
		// What `markdown-processor.mjs` does when the site imports it.
		const html = await render(createSiteMarkdownProcessor(), SAMPLE);
		assert.match(html, /replaced in a paragraph/);
		// Any copy of the module sees it: the registry is a global symbol.
		assert.equal(
			globalThis[Symbol.for("shirones.markdown-extensions")],
			extensions,
		);
	} finally {
		publishMarkdownExtensions(NO_MARKDOWN_EXTENSIONS);
	}
	assert.equal(readMarkdownExtensions(), NO_MARKDOWN_EXTENSIONS);
});

test("the site refuses to render when it cannot see the integration's extensions", () => {
	// No scripts on either side.
	assertMarkdownExtensionsVisible("");
	assertMarkdownExtensionsVisible(undefined);
	// The integration loaded scripts, this runtime sees none.
	assert.throws(
		() => assertMarkdownExtensionsVisible("abc123"),
		/not visible to the site's server code \(expected "abc123", found ""\)/,
	);
	publishMarkdownExtensions({ ...sampleExtensions(), digest: "abc123" });
	try {
		assertMarkdownExtensionsVisible("abc123");
		assert.throws(
			() => assertMarkdownExtensionsVisible("other"),
			/not visible/,
		);
		assert.throws(() => assertMarkdownExtensionsVisible(""), /not visible/);
	} finally {
		publishMarkdownExtensions(NO_MARKDOWN_EXTENSIONS);
	}
});

// ── Loading real files ──────────────────────────────────────────────────────

test("scripts are bundled like config modules: TypeScript, helpers, theme aliases", async () => {
	const fixture = project();
	const dir = fixture.paths.scriptsDir;
	write(
		join(dir, "10-typed.ts"),
		[
			'import type { ShironesPlugin } from "@/types/plugin";',
			'import { siteConfig } from "@/config/siteConfig";',
			'import { suffix } from "./lib/suffix.ts";',
			"const label: string = `${siteConfig.title}${suffix}`;",
			"export default {",
			'\tname: "typed",',
			"\tsetup(api) {",
			"\t\tapi.fonts.keep(label);",
			"\t},",
			"} satisfies ShironesPlugin;",
			"",
		].join("\n"),
	);
	write(join(dir, "lib/suffix.ts"), 'export const suffix: string = "!";\n');
	write(
		join(dir, "20-bare.mjs"),
		'export default (api) => api.fonts.keep("?");\n',
	);

	const plugins = await loadPluginScripts(fixture.paths);
	assert.deepEqual(
		plugins.map(({ name, file }) => [name, file]),
		[
			["typed", join(dir, "10-typed.ts")],
			["20-bare", join(dir, "20-bare.mjs")],
		],
	);
	const result = await run(plugins, { project: fixture });
	assert.equal(result.fontCharacters, "theme default!?");
});

test("a script reads the project's own config, not the theme default", async () => {
	const fixture = project();
	write(
		join(fixture.paths.configDir, "siteConfig.ts"),
		'export const siteConfig = { title: "my blog" };\n',
	);
	write(
		join(fixture.paths.scriptsDir, "title.ts"),
		'import { siteConfig } from "@/config/siteConfig";\n' +
			"export default (api) => api.fonts.keep(siteConfig.title);\n",
	);
	const result = await run(await loadPluginScripts(fixture.paths), {
		project: fixture,
	});
	assert.equal(result.fontCharacters, "my blog");
});

test("an edited script, or an edited helper, is loaded fresh with a new digest", async () => {
	const fixture = project();
	const dir = fixture.paths.scriptsDir;
	const script = join(dir, "version.ts");
	const helper = join(dir, "lib/value.ts");
	write(
		script,
		'import { value } from "./lib/value.ts";\n' +
			"export default (api) => api.fonts.keep(`a${value}`);\n",
	);
	write(helper, 'export const value = "1";\n');

	const load = async () => {
		const plugins = await loadPluginScripts(fixture.paths);
		const result = await run(plugins, { project: fixture });
		return [plugins[0].digest, result.fontCharacters];
	};

	const [firstDigest, first] = await load();
	assert.equal(first, "a1");
	assert.match(firstDigest, /^[0-9a-f]{12}$/);
	assert.deepEqual(await load(), [firstDigest, "a1"]);

	write(helper, 'export const value = "2";\n');
	const [helperDigest, afterHelper] = await load();
	assert.equal(afterHelper, "a2");
	assert.notEqual(helperDigest, firstDigest);

	write(
		script,
		'import { value } from "./lib/value.ts";\n' +
			"export default (api) => api.fonts.keep(`b${value}`);\n",
	);
	const [scriptDigest, afterScript] = await load();
	assert.equal(afterScript, "b2");
	assert.notEqual(scriptDigest, helperDigest);
});

test("a script can import a dependency only the theme has installed", async () => {
	// pnpm's strict layout: the theme's dependencies sit next to the theme, out
	// of the project's reach. In the theme's repository the same import simply
	// resolves, so without the fallback a script would work in one mode only.
	const fixture = project();
	write(
		join(fixture.themeRoot, "node_modules/theme-only-dep/package.json"),
		'{"name":"theme-only-dep","version":"1.0.0","type":"module","exports":"./index.js"}',
	);
	write(
		join(fixture.themeRoot, "node_modules/theme-only-dep/index.js"),
		'export const origin = "theme";\n',
	);
	// A dependency the project installed itself wins over the theme's copy.
	for (const [root, origin] of [
		[fixture.themeRoot, "theme"],
		[fixture.siteRoot, "project"],
	]) {
		write(
			join(root, "node_modules/shared-dep/package.json"),
			'{"name":"shared-dep","version":"1.0.0","type":"module","exports":"./index.js"}',
		);
		write(
			join(root, "node_modules/shared-dep/index.js"),
			`export const origin = "${origin}";\n`,
		);
	}
	write(
		join(fixture.paths.scriptsDir, "deps.mjs"),
		'import { readFileSync } from "node:fs";\n' +
			'import { origin as a } from "theme-only-dep";\n' +
			'import { helper } from "./lib/helper.mjs";\n' +
			'import { origin as b } from "shared-dep";\n' +
			"export default (api) => api.fonts.keep(`${a},${b},${helper},${typeof readFileSync}`);\n",
	);
	write(
		join(fixture.paths.scriptsDir, "lib/helper.mjs"),
		'import { origin } from "theme-only-dep";\nexport const helper = `helper:${origin}`;\n',
	);

	const result = await run(await loadPluginScripts(fixture.paths), {
		project: fixture,
	});
	assert.equal(result.fontCharacters, "theme,project,helper:theme,function");
});

test("an import nobody has installed is an error naming the script", async () => {
	const fixture = project();
	write(
		join(fixture.paths.scriptsDir, "missing.mjs"),
		'import "no-such-package-anywhere";\nexport default () => {};\n',
	);
	await assert.rejects(loadPluginScripts(fixture.paths), (error) => {
		assert.match(error.message, /Failed to bundle "plugin:missing\.mjs"/);
		assert.match(error.message, /no-such-package-anywhere/);
		return true;
	});
});

test("the fallback is for scripts only: a config module resolves as before", async () => {
	const fixture = project();
	write(
		join(fixture.themeRoot, "node_modules/theme-only-dep/package.json"),
		'{"name":"theme-only-dep","version":"1.0.0","type":"module","exports":"./index.js"}',
	);
	write(
		join(fixture.themeRoot, "node_modules/theme-only-dep/index.js"),
		'export const origin = "theme";\n',
	);
	write(
		join(fixture.paths.configDir, "siteConfig.ts"),
		'import { origin } from "theme-only-dep";\nexport const siteConfig = { title: origin };\n',
	);
	const { loadConfigModule } = await import(
		"../src/integration/resolve/load-config.ts"
	);
	await assert.rejects(
		loadConfigModule(fixture.paths, "siteConfig"),
		/theme-only-dep/,
	);
});

test("a syntax error is reported with the script's name and position", async () => {
	const fixture = project();
	write(join(fixture.paths.scriptsDir, "broken.ts"), "export default {{{\n");
	await assert.rejects(loadPluginScripts(fixture.paths), (error) => {
		assert.match(error.message, /Failed to bundle "plugin:broken\.ts"/);
		assert.match(error.message, /broken\.ts:1:\d+/);
		return true;
	});
});
