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
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const cliSource = join(ROOT, "src/integration/cli.mjs");
const rangeSource = join(ROOT, "src/integration/version-range.mjs");
const peers = {
	astro: "^7.4.5",
	svelte: "^5.57.3",
	"@astrojs/svelte": "^9.1.2",
	sharp: "^0.35.5",
	"@astrojs/check": "^0.9.12",
	typescript: "^6.0.3",
};

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

function createFixture({
	type = "commonjs",
	tsconfig,
	astroConfig,
	astroConfigFilename = "astro.config.mjs",
} = {}) {
	const root = mkdtempSync(join(tmpdir(), "shirones-cli-package-init-"));
	const packageRoot = join(root, "node_modules", "shirones");
	const project = join(root, "project");
	const template = join(packageRoot, "template");
	mkdirSync(join(packageRoot, "bin"), { recursive: true });
	mkdirSync(join(packageRoot, "node_modules"), { recursive: true });
	mkdirSync(join(template, "shirones/content/posts"), { recursive: true });
	mkdirSync(join(template, "public"), { recursive: true });
	mkdirSync(project, { recursive: true });

	copyFileSync(cliSource, join(packageRoot, "bin/cli.mjs"));
	copyFileSync(rangeSource, join(packageRoot, "bin/version-range.mjs"));
	const jsoncParserRoot = findPackageRoot(
		require.resolve("jsonc-parser"),
		"jsonc-parser",
	);
	cpSync(jsoncParserRoot, join(packageRoot, "node_modules/jsonc-parser"), {
		recursive: true,
	});

	writeFileSync(
		join(packageRoot, "package.json"),
		`${JSON.stringify(
			{
				name: "shirones",
				version: "1.0.0",
				type: "module",
				packageManager: "pnpm@11.28.2",
				peerDependencies: peers,
			},
			null,
			2,
		)}\n`,
	);
	writeFileSync(
		join(template, "astro.config.mjs"),
		'import { defineConfig } from "astro/config";\n' +
			'import shirones from "shirones";\n' +
			"export default defineConfig({ integrations: [shirones()] });\n",
	);
	writeFileSync(
		join(template, "shirones/content/posts/example.md"),
		"# Example\n",
	);
	writeFileSync(join(template, "public/favicon.svg"), "<svg/>\n");

	const projectPackage = {
		name: "existing-astro-project",
		version: "1.0.0",
		private: true,
		...(type == null ? {} : { type }),
		packageManager: "pnpm@11.28.2",
		dependencies: { ...peers, shirones: "^1.0.0" },
	};
	writeFileSync(
		join(project, "package.json"),
		`${JSON.stringify(projectPackage, null, 2)}\n`,
	);
	if (tsconfig !== undefined)
		writeFileSync(join(project, "tsconfig.json"), tsconfig);
	if (astroConfig !== undefined)
		writeFileSync(join(project, astroConfigFilename), astroConfig);

	return {
		root,
		project,
		runInit() {
			return spawnSync(
				process.execPath,
				[join(packageRoot, "bin/cli.mjs"), "init"],
				{
					cwd: project,
					encoding: "utf8",
					timeout: 30_000,
				},
			);
		},
		cleanup() {
			rmSync(root, { recursive: true, force: true });
		},
	};
}

test("init preserves an existing CommonJS package type", (t) => {
	const fixture = createFixture({ type: "commonjs" });
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	const pkg = JSON.parse(
		readFileSync(join(fixture.project, "package.json"), "utf8"),
	);
	assert.equal(pkg.type, "commonjs");
});

test("init does not add a package type to an existing project that omitted it", (t) => {
	const fixture = createFixture({ type: null });
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	const pkg = JSON.parse(
		readFileSync(join(fixture.project, "package.json"), "utf8"),
	);
	assert.equal(Object.hasOwn(pkg, "type"), false);
});

test("init adds aliases to JSONC tsconfig and preserves comments", (t) => {
	const fixture = createFixture({
		tsconfig: `{
  // Keep this project note when adding Shirone aliases.
  "compilerOptions": {
    "strict": true,
  },
}
`,
	});
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	const updated = readFileSync(join(fixture.project, "tsconfig.json"), "utf8");
	assert.match(updated, /Keep this project note/);
	const parseErrors = [];
	const parsed = require("jsonc-parser").parse(updated, parseErrors, {
		allowTrailingComma: true,
	});
	assert.deepEqual(parseErrors, []);
	assert.equal(parsed.compilerOptions.baseUrl, ".");
	assert.deepEqual(parsed.compilerOptions.paths["@/*"], [
		"./node_modules/shirones/src/*",
	]);
});

test("a comment mentioning the package does not make an unwired Astro config look wired", (t) => {
	const original = "// planning to add shirones later\nexport default {};\n";
	const fixture = createFixture({ astroConfig: original });
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /did not register the theme/);
	const active = readFileSync(
		join(fixture.project, "astro.config.mjs"),
		"utf8",
	);
	assert.match(active, /integrations:\s*\[shirones\(\)\]/);
	assert.equal(
		readFileSync(
			join(fixture.project, ".shirones-backup/astro.config.mjs"),
			"utf8",
		),
		original,
	);
});

test("a string containing import-like text does not make an Astro config look wired", (t) => {
	const original =
		"const docs = 'import theme from \"shirones\"';\n" +
		"const theme = () => ({});\n" +
		"export default { integrations: [theme()] };\n";
	const fixture = createFixture({ astroConfig: original });
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /did not register the theme/);
	assert.match(
		readFileSync(join(fixture.project, "astro.config.mjs"), "utf8"),
		/integrations:\s*\[shirones\(\)\]/,
	);
});

test("a statically imported integration call in the integrations array is preserved", (t) => {
	const original =
		"// Keep custom site settings.\n" +
		'import theme from "shirones";\n' +
		"export default { integrations: [theme()] };\n";
	const fixture = createFixture({ astroConfig: original });
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /already wires the theme in/);
	assert.equal(
		readFileSync(join(fixture.project, "astro.config.mjs"), "utf8"),
		original,
	);
});

test("an inline CommonJS require call in astro.config.cjs is preserved", (t) => {
	const original =
		"module.exports = { integrations: [require('shirones').shirones()] };\n";
	const fixture = createFixture({
		astroConfig: original,
		astroConfigFilename: "astro.config.cjs",
	});
	t.after(() => fixture.cleanup());

	const result = fixture.runInit();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /already wires the theme in/);
	assert.equal(
		readFileSync(join(fixture.project, "astro.config.cjs"), "utf8"),
		original,
	);
});
