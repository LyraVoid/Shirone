import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
	copyFileSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(
	new URL("../scripts/check-package-manifest.mjs", import.meta.url),
);
const require = createRequire(import.meta.url);

/** Real package root of an installed dependency inside pnpm's store layout. */
function findPackageRoot(entry, expectedName) {
	let dir = dirname(entry);
	while (true) {
		try {
			const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
			if (pkg.name === expectedName) return dir;
		} catch {
			// Keep walking through pnpm's virtual store layout.
		}
		const parent = dirname(dir);
		if (parent === dir)
			throw new Error(`Could not find ${expectedName} package root`);
		dir = parent;
	}
}

/** Runs the check against a throwaway theme root. The script reads
 * package.json, src/ and tsconfig.json relative to its own location, so the
 * fixture gets a copy of it — and the child runs from an unrelated cwd
 * (`src/`) to prove the check is cwd-independent. */
function checkManifest(sources, extraDependencies = {}) {
	const root = mkdtempSync(join(tmpdir(), "shirone-package-manifest-"));
	try {
		const files = {
			"package.json": JSON.stringify({ dependencies: { astro: "^7.0.0" } }),
			"tsconfig.json": JSON.stringify({
				compilerOptions: { paths: { "@/*": ["src/*"] } },
			}),
			"src/integration/package.manifest.json": JSON.stringify({
				extraDependencies,
			}),
			...sources,
		};
		for (const [path, body] of Object.entries(files)) {
			mkdirSync(dirname(join(root, path)), { recursive: true });
			writeFileSync(join(root, path), body);
		}
		mkdirSync(join(root, "scripts"), { recursive: true });
		copyFileSync(SCRIPT, join(root, "scripts/check-package-manifest.mjs"));
		cpSync(
			findPackageRoot(require.resolve("jsonc-parser"), "jsonc-parser"),
			join(root, "node_modules/jsonc-parser"),
			{ recursive: true },
		);
		return spawnSync(
			process.execPath,
			[join(root, "scripts/check-package-manifest.mjs")],
			{ cwd: join(root, "src"), encoding: "utf8" },
		);
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

test("package manifest check rejects an undeclared dynamic runtime import", () => {
	const result = checkManifest({
		"src/integration/cli.mjs":
			'export async function loadParser() { return import("jsonc-parser"); }\n',
	});
	assert.equal(result.status, 1);
	assert.match(result.stderr, /jsonc-parser/);
});

test("package manifest check accepts a dynamic import shipped via extraDependencies", () => {
	const result = checkManifest(
		{
			"src/integration/cli.mjs":
				'export async function loadParser() { return import("jsonc-parser"); }\n',
		},
		{ "jsonc-parser": "^3.3.1" },
	);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /every bare import/);
});

test("package manifest check parses a tsconfig with comments and trailing commas", () => {
	const result = checkManifest({
		"tsconfig.json": `{
	"compilerOptions": {
		// a real comment line
		"paths": {
			"@/*": ["src/*"],
		},
	},
}`,
	});
	assert.equal(result.status, 0, result.stderr);
});
