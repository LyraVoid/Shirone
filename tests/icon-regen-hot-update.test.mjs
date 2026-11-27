import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { build, createServer } from "vite";
import { ICON_COLLECTIONS_ID } from "../src/integration/vite/icon/collections.ts";
import { shironesIconRegeneration } from "../src/integration/vite/icon/regeneration.ts";

// The icon collection is the virtual module `virtual:shirone-icons`. These
// tests pin the two things that used to differ between a source checkout and a
// project that installs the package: which files are scanned, and whether what
// was scanned is the module `Icon.svelte` actually gets.

const RESOLVED_ID = `\0${ICON_COLLECTIONS_ID}`;
const LEGACY_SPECIFIER = "@/generated/local-icon-collections";

/**
 * A project on disk. `package` puts the theme under `node_modules` and the
 * user's config, data and content under `shirones/`, as `shirones init` does;
 * `source` is a checkout of the theme itself.
 */
function createProject(t, mode = "package") {
	const projectRoot = mkdtempSync(join(tmpdir(), "shirones-icons-"));
	t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
	const packageRoot =
		mode === "package"
			? join(projectRoot, "node_modules", "shirones")
			: projectRoot;
	const base = join(projectRoot, mode === "package" ? "shirones" : "src");
	const paths = {
		projectRoot,
		packageRoot,
		packageSrc: join(packageRoot, "src"),
		configDir: join(base, "config"),
		dataDir: join(base, mode === "package" ? "config/data" : "data"),
		contentDir: join(base, "content"),
		cacheDir: join(projectRoot, ".shirones"),
		isThemeRepo: mode === "source",
	};
	mkdirSync(paths.packageSrc, { recursive: true });
	return {
		paths,
		write(relativePath, content) {
			const file = join(projectRoot, relativePath);
			mkdirSync(dirname(file), { recursive: true });
			writeFileSync(file, content);
			return file;
		},
	};
}

/** The plugin plus everything it warned about. */
function createPlugin(paths, { command = "serve", extraSources } = {}) {
	const warnings = [];
	const plugin = shironesIconRegeneration(
		paths,
		{ warn: (message) => warnings.push(message) },
		extraSources,
	);
	plugin.configResolved({ command });
	return { plugin, warnings };
}

/** Whether the module the plugin serves contains `prefix:name`. */
function serves(plugin, id) {
	const [prefix, name] = id.split(":");
	const source = plugin.load(RESOLVED_ID);
	const collections = JSON.parse(
		source.match(/localIconCollections = (.+);\n$/)[1],
	);
	const collection = collections.find((item) => item.prefix === prefix);
	return Boolean(collection?.icons?.[name] || collection?.aliases?.[name]);
}

const icon = (id) => `<Icon icon="${id}" />\n`;

test("package mode scans everything the user writes, like a source checkout", (t) => {
	const project = createProject(t);
	project.write("src/components/Badge.astro", icon("fa7-brands:steam"));
	project.write("src/layouts/Shell.astro", icon("fa7-brands:gitlab"));
	project.write("src/pages/index.astro", icon("fa7-brands:mastodon"));
	project.write(
		"shirones/config/profileConfig.ts",
		'export const links = [{ icon: "fa7-brands:bilibili" }];\n',
	);
	project.write(
		"shirones/config/data/friends.ts",
		'export const friends = [{ icon: "simple-icons:discord" }];\n',
	);
	project.write(
		"shirones/content/posts/hello.md",
		"---\nmood: material-symbols:lock-outline-rounded\n---\n",
	);

	const { plugin, warnings } = createPlugin(project.paths);
	plugin.buildStart();

	for (const id of [
		"fa7-brands:steam",
		"fa7-brands:gitlab",
		"fa7-brands:mastodon",
		"fa7-brands:bilibili",
		"simple-icons:discord",
		"material-symbols:lock-outline-rounded",
	]) {
		assert.ok(serves(plugin, id), `${id} should be in the collection`);
	}
	assert.deepEqual(warnings, []);
});

test("a data directory moved outside src is scanned in both modes", (t) => {
	for (const mode of ["source", "package"]) {
		const project = createProject(t, mode);
		project.write(
			"my-data/links.ts",
			'export const links = [{ icon: "fa7-brands:telegram" }];\n',
		);
		const { plugin } = createPlugin({
			...project.paths,
			dataDir: join(project.paths.projectRoot, "my-data"),
		});
		plugin.buildStart();
		assert.ok(serves(plugin, "fa7-brands:telegram"), mode);
	}
});

test("an explicit component override outside src is scanned as a single file", (t) => {
	const project = createProject(t);
	const override = project.write(
		"custom/PostCard.astro",
		icon("fa7-brands:steam"),
	);
	project.write("custom/Unused.astro", icon("fa7-brands:gitlab"));

	const { plugin } = createPlugin(project.paths, { extraSources: [override] });
	plugin.buildStart();

	assert.ok(serves(plugin, "fa7-brands:steam"));
	assert.ok(
		!serves(plugin, "fa7-brands:gitlab"),
		"a sibling of the override is not rendered and must not be scanned",
	);
});

test("files under a `generated` directory are not scanned", (t) => {
	const project = createProject(t);
	project.write("src/generated/stale.ts", '"fa7-brands:steam";\n');
	const { plugin } = createPlugin(project.paths);
	plugin.buildStart();
	assert.ok(!serves(plugin, "fa7-brands:steam"));
});

// The scan is textual: a name in a comment or in a post about icons looks the
// same as a real reference. It costs a warning, not the build.
test("an unknown icon is reported once and skipped, in a build and in dev", (t) => {
	for (const command of ["build", "serve"]) {
		const project = createProject(t);
		const page = project.write(
			"src/pages/index.astro",
			`${icon("fa7-brands:no-such-icon-anywhere")}${icon("fa7-brands:steam")}`,
		);
		const { plugin, warnings } = createPlugin(project.paths, { command });

		plugin.buildStart();
		plugin.buildStart();

		assert.equal(warnings.length, 1, command);
		assert.match(warnings[0], /fa7-brands:no-such-icon-anywhere/);
		assert.ok(warnings[0].includes(page), "the warning names the file");
		assert.ok(serves(plugin, "fa7-brands:steam"), "the rest still renders");
		assert.ok(!serves(plugin, "fa7-brands:no-such-icon-anywhere"));
	}
});

test("the legacy specifier resolves to the virtual module in every form", () => {
	const { plugin } = createPlugin({
		projectRoot: "/p",
		packageSrc: "/p/src",
		configDir: "/p/src/config",
		dataDir: "/p/src/data",
		contentDir: "/p/src/content",
	});
	for (const specifier of [
		ICON_COLLECTIONS_ID,
		LEGACY_SPECIFIER,
		// What the `@/` alias turns it into, as Vite reports it on POSIX and
		// on Windows.
		"/p/node_modules/shirones/src/generated/local-icon-collections",
		"C:\\p\\src\\generated\\local-icon-collections",
		"/p/src/generated/local-icon-collections.ts",
	]) {
		assert.equal(plugin.resolveId(specifier), RESOLVED_ID, specifier);
	}
	for (const specifier of [
		"virtual:shirone-music-sidebar",
		"/p/src/generated/other",
		"/p/lib/local-icon-collections",
	]) {
		assert.equal(plugin.resolveId(specifier), null, specifier);
	}
});

/** A Vite server over a package-mode project, wired like the integration. */
async function createPackageServer(t, project, plugin) {
	const server = await createServer({
		configFile: false,
		root: project.paths.projectRoot,
		logLevel: "silent",
		plugins: [plugin],
		resolve: {
			alias: [{ find: /^@\//, replacement: `${project.paths.packageSrc}/` }],
		},
		optimizeDeps: { noDiscovery: true },
		// No real file watching: the watcher test emits its events by hand,
		// and a real event for the same write arriving at its own time would
		// make the order of regenerations depend on the machine.
		server: { middlewareMode: true, ws: false, watch: null },
		appType: "custom",
	});
	t.after(() => server.close());
	return server;
}

// Unit-calling `resolveId` proves nothing about what Vite does: the previous
// file-based redirect passed that way while Vite's own resolver answered first
// and the plugin was never asked. So ask a real server, with a stale copy of
// the old file on disk where the alias points.
test("Vite serves the project's icons for the new and the legacy specifier", async (t) => {
	const project = createProject(t);
	project.write("src/pages/index.astro", icon("fa7-brands:steam"));
	project.write(
		"node_modules/shirones/src/generated/local-icon-collections.ts",
		'export const localIconCollections = ["stale-shipped-copy"];\n',
	);
	const importer = join(
		project.paths.packageSrc,
		"components/atoms/display/Icon.svelte",
	);
	const { plugin } = createPlugin(project.paths);
	const server = await createPackageServer(t, project, plugin);
	plugin.buildStart();

	for (const name of ["client", "ssr"]) {
		const { pluginContainer } = server.environments[name];
		for (const specifier of [ICON_COLLECTIONS_ID, LEGACY_SPECIFIER]) {
			const resolved = await pluginContainer.resolveId(specifier, importer);
			assert.equal(resolved?.id, RESOLVED_ID, `${name}: ${specifier}`);
			const loaded = await pluginContainer.load(resolved.id);
			const code = typeof loaded === "string" ? loaded : loaded.code;
			assert.match(code, /"fa7-brands"/, `${name}: ${specifier}`);
			assert.doesNotMatch(code, /stale-shipped-copy/);
		}
	}
});

// A production build resolves through the bundler rather than the dev plugin
// container, so it is checked on its own.
for (const ssr of [false, true]) {
	test(`a ${ssr ? "server" : "browser"} build bundles the project's icons`, async (t) => {
		const project = createProject(t);
		project.write("src/pages/index.astro", icon("fa7-brands:steam"));
		const entry = project.write(
			"node_modules/shirones/src/entry.ts",
			`import { localIconCollections } from "${ICON_COLLECTIONS_ID}";\n` +
				"console.log(JSON.stringify(localIconCollections));\n",
		);
		const { plugin } = createPlugin(project.paths, { command: "build" });

		const result = await build({
			configFile: false,
			root: project.paths.projectRoot,
			logLevel: "silent",
			plugins: [plugin],
			build: {
				write: false,
				minify: false,
				ssr,
				rollupOptions: { input: entry },
			},
		});
		const code = [result]
			.flat()
			.flatMap((output) => output.output)
			.map((chunk) => chunk.code ?? "")
			.join("\n");
		assert.match(code, /fa7-brands/);
	});
}

function waitFor(predicate, timeoutMs = 2_000) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const tick = () => {
			if (predicate()) return resolve();
			if (Date.now() > deadline) return reject(new Error("timed out"));
			setTimeout(tick, 25);
		};
		tick();
	});
}

// Vite calls `handleHotUpdate` only for changed files, so an icon in a newly
// created file used to wait for some other save. The plugin listens to the
// watcher instead. Events are emitted by hand: what is under test is the
// plugin's reaction, not how fast the OS reports a write. That Vite's real
// watcher delivers these events is checked against `astro dev`, not here.
test("a running dev server picks up new, changed and deleted files, and reloads only when the icons change", async (t) => {
	const project = createProject(t);
	const { plugin } = createPlugin(project.paths);
	const server = await createPackageServer(t, project, plugin);
	plugin.buildStart();

	const reloads = [];
	const { hot } = server.environments.client;
	const send = hot.send.bind(hot);
	hot.send = (payload, ...rest) => {
		if (payload?.type === "full-reload") reloads.push(payload);
		return send(payload, ...rest);
	};
	const emit = (event, file) => server.watcher.emit("all", event, file);
	const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

	// A new file.
	const page = project.write("src/pages/new.astro", icon("fa7-brands:steam"));
	emit("add", page);
	await waitFor(() => serves(plugin, "fa7-brands:steam"));
	assert.equal(reloads.length, 1);

	// A save that changes no icon: regenerated, identical, no reload.
	const helper = project.write("src/lib/util.ts", "export const one = 1;\n");
	emit("add", helper);
	await settle();
	assert.equal(reloads.length, 1, "an unrelated save must not reload the page");

	// A file type that cannot hold an icon is ignored outright.
	project.write("src/pages/new.astro", icon("fa7-brands:gitlab"));
	emit("change", join(project.paths.projectRoot, "src/notes.txt"));
	await settle();
	assert.ok(!serves(plugin, "fa7-brands:gitlab"));

	const outside = project.write("other/unrelated.ts", "export const x = 1;\n");
	emit("change", outside);
	await settle();
	assert.ok(!serves(plugin, "fa7-brands:gitlab"));

	// The same edit, reported for the file that changed.
	emit("change", page);
	await waitFor(() => serves(plugin, "fa7-brands:gitlab"));
	assert.equal(reloads.length, 2);

	// A project icon dropped into `src/icons/`.
	const svg = project.write(
		"src/icons/logo.svg",
		'<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>\n',
	);
	emit("add", svg);
	await waitFor(() => serves(plugin, "local:logo"));

	// A deleted file takes its icon with it.
	rmSync(page);
	emit("unlink", page);
	await waitFor(() => !serves(plugin, "fa7-brands:gitlab"));
});
