import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
	new URL("../scripts/check-package-manifest.mjs", import.meta.url),
);

/** Runs the check in a throwaway theme root: it reads `package.json` and `src/` from the cwd. */
function checkManifest(sources) {
	const root = mkdtempSync(join(tmpdir(), "shirone-package-manifest-"));
	try {
		const files = {
			"package.json": JSON.stringify({ dependencies: { astro: "^7.0.0" } }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: { paths: { "@/*": ["src/*"] } },
			}),
			"src/integration/package.manifest.json": JSON.stringify({
				extraDependencies: {},
			}),
			...sources,
		};
		for (const [path, body] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), body);
		}
		return spawnSync(process.execPath, [SCRIPT], {
			cwd: root,
			encoding: "utf8",
		});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test('a tokenizer comparing the string "from" is not read as an import', () => {
	const result = checkManifest({
		"src/registry.ts": [
			'import { defineConfig } from "astro/config";',
			"export function isImport(tokens, index) {",
			"\tconst token = tokens[index];",
			"\treturn (",
			'\t\ttoken.value === "from" &&',
			'\t\ttokens[index + 1]?.kind === "string"',
			"\t);",
			"}",
			'export const compact = ["import","from","astro"];',
		].join("\n"),
	});
	assert.equal(result.status, 0, result.stderr);
});

test("undeclared runtime imports still fail, type-only imports do not", () => {
	const result = checkManifest({
		"src/main.ts": [
			'import type { Options } from "type-only-package";',
			'import pad from "left-pad";',
			'const lazy = () => import("lazy-package");',
		].join("\n"),
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /left-pad/);
	assert.match(result.stderr, /lazy-package/);
	assert.doesNotMatch(result.stderr, /type-only-package/);
});
