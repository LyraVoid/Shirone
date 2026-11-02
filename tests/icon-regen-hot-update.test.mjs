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

function makePlugin(root) {
	return shironesIconRegeneration(
		{
			projectRoot: root,
			packageRoot: root,
			packageSrc: join(root, "src"),
			configDir: join(root, "config"),
			dataDir: join(root, "data"),
			contentDir: join(root, "content"),
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

function readOutput(path) {
	return existsSync(path) ? readFileSync(path, "utf8") : "";
}
