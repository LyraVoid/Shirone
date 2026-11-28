import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * F-13: the type contract in `src/types/fontConfig.ts` requires builds to make
 * no external requests until a remote data contract exists, so the factory
 * default must be `false` and both pipeline gates must keep failing closed.
 */

const fontConfigSource = await readFile(
	fileURLToPath(new URL("../src/config/fontConfig.ts", import.meta.url)),
	"utf8",
);
const fontsIntegrationSource = await readFile(
	fileURLToPath(new URL("../src/integration/fonts.ts", import.meta.url)),
	"utf8",
);
const textCollectorSource = await readFile(
	fileURLToPath(
		new URL("../scripts/fonts/text-collector.mjs", import.meta.url),
	),
	"utf8",
);

test("the factory font config keeps builds offline (allowRemoteText: false)", () => {
	assert.match(fontConfigSource, /allowRemoteText:\s*false/);
});

test("both remote-text pipeline gates default to disabled", () => {
	assert.match(fontsIntegrationSource, /allowRemoteText \?\? false/);
	assert.match(textCollectorSource, /allowRemoteText \?\? false/);
});
