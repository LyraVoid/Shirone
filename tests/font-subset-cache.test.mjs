import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runFontSubsetting } from "../src/integration/fonts.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fontAsset = (name) =>
	join(REPO_ROOT, "node_modules", "@fontsource", "outfit", "files", name);

// The subset cache must key on the source font file's identity too: swapping
// in a different font under the same basename used to keep serving the old
// glyphs from the cache.
const root = mkdtempSync(join(tmpdir(), "shirones-font-cache-"));
test.after(() => rmSync(root, { recursive: true, force: true }));

for (const dir of [
	join(root, "project"),
	join(root, "cache"),
	join(root, "src", "config"),
	join(root, "src", "data"),
	join(root, "src", "i18n"),
]) {
	mkdirSync(dir, { recursive: true });
}

const fontFile = join(root, "project", "test.woff2");

function makePaths() {
	return {
		projectRoot: join(root, "project"),
		packageRoot: root,
		packageSrc: join(root, "src"),
		configDir: join(root, "src", "config"),
		dataDir: join(root, "src", "data"),
		contentDir: join(root, "src", "content"),
		scriptsDir: join(root, "src", "scripts"),
		cacheDir: join(root, "cache"),
		isThemeRepo: false,
	};
}

function makeLogger() {
	const messages = [];
	return {
		messages,
		info(message) {
			this.messages.push(message);
		},
		warn(message) {
			this.messages.push(message);
		},
	};
}

function makeFontConfig() {
	return {
		fontFamilies: [
			{
				source: "local",
				variants: [{ file: "test.woff2", weight: 400 }],
			},
		],
		subsetting: {
			enable: true,
			includeContent: false,
			includeI18n: false,
			includeConfig: false,
			includeCommon: true,
		},
	};
}

async function runSubsetting() {
	const logger = makeLogger();
	const { outputs } = await runFontSubsetting(
		makePaths(),
		makeFontConfig(),
		"",
		logger,
	);
	return { logger, outputs };
}
function lastMessage(logger) {
	return logger.messages[logger.messages.length - 1];
}

test("font subsetting reuses the cache only while the source file matches", async () => {
	cpSync(fontAsset("outfit-latin-400-normal.woff2"), fontFile);

	const first = await runSubsetting();
	assert.ok(
		!lastMessage(first.logger).includes("reused cached subset"),
		first.logger.messages.join("\n"),
	);

	const second = await runSubsetting();
	assert.match(lastMessage(second.logger), /reused cached subset/);
	const cachedOutput = readFileSync(second.outputs.get("test.woff2")).toString(
		"hex",
	);

	// Same basename, same charset — but a different font file under it.
	cpSync(fontAsset("outfit-latin-700-normal.woff2"), fontFile);
	const third = await runSubsetting();
	assert.ok(
		!lastMessage(third.logger).includes("reused cached subset"),
		`stale cache reused: ${lastMessage(third.logger)}`,
	);
	assert.notEqual(
		readFileSync(third.outputs.get("test.woff2")).toString("hex"),
		cachedOutput,
	);
});
