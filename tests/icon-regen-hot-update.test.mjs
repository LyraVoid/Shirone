import assert from "node:assert/strict";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ICON_COLLECTIONS_SPECIFIER } from "../src/integration/vite/icon/collections.ts";
import { shironesIconRegeneration } from "../src/integration/vite/icon/regeneration.ts";

// Vite hands plugin paths through with posix separators on every platform,
// while the plugin derives its own copies of those paths with the platform
// separator — a bare `===` never matches on Windows. Two contracts depend on
// the comparison being separator-normalized:
//
// 1. The hot-update guard: every write of the output re-enters
//    `handleHotUpdate`; an unrecognized path re-ran the generator in a
//    self-sustaining loop (one full page reload per write).
// 2. The `resolveId` redirect: `@/generated/local-icon-collections` must
//    resolve to the user's copy when it exists, or package mode silently
//    reads the shipped collection and ignores everything the plugin wrote.
//
// The regression below feeds both separator styles of each path, which only
// a normalizing comparison can recognize on every platform.

function makePlugin(root, overrides = {}) {
	return shironesIconRegeneration(
		{
			projectRoot: root,
			packageRoot: overrides.packageRoot ?? root,
			packageSrc: overrides.packageSrc ?? join(root, "src"),
			configDir: overrides.configDir ?? join(root, "config"),
			dataDir: overrides.dataDir ?? join(root, "data"),
			contentDir: overrides.contentDir ?? join(root, "content"),
			cacheDir: join(root, ".shirones"),
			isThemeRepo: false,
		},
		{ warn: () => {} },
	);
}

function waitFor(predicate, timeoutMs) {
	const deadline = Date.now() + timeoutMs;
	return new Promise((resolve, reject) => {
		const tick = () => {
			if (predicate()) return resolve();
			if (Date.now() > deadline) {
				return reject(new Error("condition not met in time"));
			}
			setTimeout(tick, 25);
		};
		tick();
	});
}

test("path comparisons survive separator styles", async () => {
	const root = mkdtempSync(join(tmpdir(), "shirones-icon-regen-"));
	const srcDir = join(root, "src");
	const output = join(srcDir, "generated", "local-icon-collections.ts");
	mkdirSync(srcDir, { recursive: true });
	mkdirSync(join(srcDir, "generated"), { recursive: true });

	const sample = join(srcDir, "sample.astro");
	writeFileSync(sample, '<Icon icon="material-symbols:home-rounded" />\n');

	const plugin = makePlugin(root);
	try {
		// Initial generation through the same handler a real edit would hit.
		plugin.handleHotUpdate({ file: sample });
		await waitFor(() => existsSync(output), 2_000);
		assert.ok(
			readOutput(output).includes("home-rounded"),
			"initial generation should include the referenced icon",
		);

		// resolveId must redirect the collections specifier — and both
		// separator styles of the derived absolute path — to the user's copy.
		// The posix form is what Vite reports on Windows (the shape that used
		// to slip past the bare `===`); the backslash form pins the
		// normalization on POSIX platforms, where the native form matches
		// either way.
		const withoutExtension = output.replace(/\.ts$/, "");
		assert.equal(plugin.resolveId(ICON_COLLECTIONS_SPECIFIER), output);
		for (const form of [
			withoutExtension,
			withoutExtension.replace(/\\/g, "/"),
			withoutExtension.replace(/\//g, "\\"),
		]) {
			assert.equal(plugin.resolveId(form), output);
		}

		// Drop the reference, then feed the output's own change event in both
		// separator styles. A regeneration would now produce a collection
		// without the icon, which is exactly what must not happen. The posix
		// form is what Vite reports on Windows — the shape that used to slip
		// past the `===` guard and start the regeneration loop.
		rmSync(sample);
		const posixForm = output.replace(/\\/g, "/");
		const backslashForm = output.replace(/\//g, "\\");
		for (const form of [posixForm, backslashForm]) {
			const before = readOutput(output);
			plugin.handleHotUpdate({ file: form });
			await assert.rejects(
				waitFor(() => readOutput(output) !== before, 2_000),
				{ message: "condition not met in time" },
				`the output path change event (${form}) must not re-run the generator`,
			);
		}

		// Positive control: a real source edit still regenerates.
		writeFileSync(
			join(srcDir, "other.astro"),
			'<Icon icon="material-symbols:tag-rounded" />\n',
		);
		plugin.handleHotUpdate({ file: join(srcDir, "other.astro") });
		await waitFor(() => readOutput(output).includes("tag-rounded"), 2_000);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("package-mode profile config overrides contribute brand icons", () => {
	const projectRoot = mkdtempSync(join(tmpdir(), "shirones-icon-config-"));
	const packageRoot = join(projectRoot, "node_modules", "shirones");
	const packageSrc = join(packageRoot, "src");
	const configDir = join(projectRoot, "shirones", "config");
	const contentDir = join(projectRoot, "shirones", "content");
	const output = join(
		projectRoot,
		"src",
		"generated",
		"local-icon-collections.ts",
	);
	mkdirSync(packageSrc, { recursive: true });
	mkdirSync(configDir, { recursive: true });
	writeFileSync(
		join(configDir, "profileConfig.ts"),
		[
			"export const profileConfig = {",
			"  links: [",
			'    { name: "Bilibili", icon: "fa7-brands:bilibili" },',
			'    { name: "Discord", icon: "fa7-brands:discord" },',
			'    { name: "Bilibili Simple", icon: "simple-icons:bilibili" },',
			'    { name: "Discord Simple", icon: "simple-icons:discord" },',
			"  ],",
			"};",
		].join("\n"),
	);

	const plugin = makePlugin(projectRoot, {
		packageRoot,
		packageSrc,
		configDir,
		dataDir: join(configDir, "data"),
		contentDir,
	});
	try {
		plugin.buildStart();
		const generated = readOutput(output);
		const match = generated.match(/localIconCollections = (.+) as const;/);
		assert.ok(match, "buildStart should write the generated icon collection");
		const collections = JSON.parse(match[1]);
		for (const [prefix, name] of [
			["fa7-brands", "bilibili"],
			["fa7-brands", "discord"],
			["simple-icons", "bilibili"],
			["simple-icons", "discord"],
		]) {
			const collection = collections.find((item) => item.prefix === prefix);
			assert.ok(
				collection?.icons?.[name] || collection?.aliases?.[name],
				`${prefix}:${name} from profileConfig.ts should be in the offline collection`,
			);
		}
	} finally {
		rmSync(projectRoot, { recursive: true, force: true });
	}
});

// The scan list carries no mode check: an icon that works in a source checkout
// must work in a project that installs the package, wherever the user wrote it.
// Before, package mode only looked at the package source, `shirones/content`
// and `shirones/config`, so an icon used only in the project's own components,
// layouts or pages rendered as nothing.

/** A package-mode layout: the theme under `node_modules`, user files outside. */
function createPackageProject() {
	const projectRoot = mkdtempSync(join(tmpdir(), "shirones-icon-parity-"));
	const packageRoot = join(projectRoot, "node_modules", "shirones");
	const packageSrc = join(packageRoot, "src");
	const configDir = join(projectRoot, "shirones", "config");
	mkdirSync(packageSrc, { recursive: true });
	mkdirSync(configDir, { recursive: true });
	return {
		projectRoot,
		output: join(projectRoot, "src", "generated", "local-icon-collections.ts"),
		overrides: {
			packageRoot,
			packageSrc,
			configDir,
			dataDir: join(configDir, "data"),
			contentDir: join(projectRoot, "shirones", "content"),
		},
		write(relativePath, content) {
			const file = join(projectRoot, relativePath);
			mkdirSync(join(file, ".."), { recursive: true });
			writeFileSync(file, content);
			return file;
		},
		cleanup: () => rmSync(projectRoot, { recursive: true, force: true }),
	};
}

function readCollections(output) {
	const match = readOutput(output).match(
		/localIconCollections = (.+) as const;/,
	);
	assert.ok(match, "the generated icon collection should exist");
	return JSON.parse(match[1]);
}

function hasIcon(collections, id) {
	const [prefix, name] = id.split(":");
	const collection = collections.find((item) => item.prefix === prefix);
	return Boolean(collection?.icons?.[name] || collection?.aliases?.[name]);
}

test("package mode scans the project's own components, layouts and pages", (t) => {
	const project = createPackageProject();
	t.after(project.cleanup);
	project.write(
		"src/components/atoms/Badge.svelte",
		'<Icon icon="fa7-brands:telegram" />\n',
	);
	project.write(
		"src/layouts/MainLayout.astro",
		'<Icon icon="fa7-brands:steam" />\n',
	);
	project.write(
		"src/pages/about/index.astro",
		'<Icon icon="simple-icons:mastodon" />\n',
	);
	project.write(
		"src/lib/links.ts",
		'export const link = { icon: "fa7-solid:paw" };\n',
	);

	makePlugin(project.projectRoot, project.overrides).buildStart();
	const collections = readCollections(project.output);
	for (const id of [
		"fa7-brands:telegram",
		"fa7-brands:steam",
		"simple-icons:mastodon",
		"fa7-solid:paw",
	]) {
		assert.ok(hasIcon(collections, id), `${id} should be bundled`);
	}
});

test("a data directory outside src is scanned in both modes", (t) => {
	for (const isThemeRepo of [false, true]) {
		const root = mkdtempSync(join(tmpdir(), "shirones-icon-data-"));
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const dataDir = join(root, "my-data");
		mkdirSync(join(root, "src"), { recursive: true });
		mkdirSync(dataDir, { recursive: true });
		writeFileSync(
			join(dataDir, "friends.ts"),
			'export const friends = [{ icon: "fa7-brands:twitch" }];\n',
		);

		const plugin = shironesIconRegeneration(
			{
				projectRoot: root,
				packageRoot: root,
				packageSrc: join(root, "src"),
				configDir: join(root, "src", "config"),
				dataDir,
				contentDir: join(root, "src", "content"),
				cacheDir: join(root, ".shirones"),
				isThemeRepo,
			},
			{ warn: () => {} },
		);
		plugin.buildStart();
		assert.ok(
			hasIcon(
				readCollections(
					join(root, "src", "generated", "local-icon-collections.ts"),
				),
				"fa7-brands:twitch",
			),
			`custom data directory should be scanned (isThemeRepo=${isThemeRepo})`,
		);
	}
});

test("an explicit component override outside src is scanned as a single file", (t) => {
	const project = createPackageProject();
	t.after(project.cleanup);
	const override = project.write(
		"custom/PostCard.astro",
		'<Icon icon="simple-icons:codeberg" />\n',
	);
	// A neighbour the theme never renders. It names an icon that does not
	// exist, so scanning the whole directory would also fail the generation.
	project.write(
		"custom/notes.ts",
		'export const note = "fa7-brands:not-a-real-icon";\n',
	);

	shironesIconRegeneration(
		{
			projectRoot: project.projectRoot,
			...project.overrides,
			cacheDir: join(project.projectRoot, ".shirones"),
			isThemeRepo: false,
		},
		{ warn: () => {} },
		[override],
	).buildStart();
	const collections = readCollections(project.output);
	assert.ok(hasIcon(collections, "simple-icons:codeberg"));
	assert.equal(hasIcon(collections, "fa7-brands:not-a-real-icon"), false);
});

test("an unknown icon in a project page names the file, fails a build and only warns in dev", (t) => {
	const project = createPackageProject();
	t.after(project.cleanup);
	const page = project.write(
		"src/pages/links.astro",
		'<Icon icon="fa7-brands:not-a-real-icon" />\n',
	);
	const paths = {
		projectRoot: project.projectRoot,
		...project.overrides,
		cacheDir: join(project.projectRoot, ".shirones"),
		isThemeRepo: false,
	};

	const build = shironesIconRegeneration(paths, { warn: () => {} });
	build.configResolved({ command: "build" });
	assert.throws(
		() => build.buildStart(),
		(error) =>
			error.message.includes("Unknown icon fa7-brands:not-a-real-icon") &&
			error.message.includes(page),
	);

	const warnings = [];
	const dev = shironesIconRegeneration(paths, {
		warn: (message) => warnings.push(message),
	});
	dev.configResolved({ command: "serve" });
	dev.buildStart();
	assert.equal(warnings.length, 1);
	assert.ok(warnings[0].includes(page), warnings[0]);
});

test("the project's generated directory is never fed back into the scan", (t) => {
	const project = createPackageProject();
	t.after(project.cleanup);
	// A stale output naming an icon nothing references any more.
	project.write(
		"src/generated/local-icon-collections.ts",
		'export const stale = "fa7-brands:telegram";\n',
	);
	project.write("src/pages/index.astro", '<Icon icon="fa7-brands:steam" />\n');

	makePlugin(project.projectRoot, project.overrides).buildStart();
	const collections = readCollections(project.output);
	assert.ok(hasIcon(collections, "fa7-brands:steam"));
	assert.equal(hasIcon(collections, "fa7-brands:telegram"), false);
});

function readOutput(path) {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}
