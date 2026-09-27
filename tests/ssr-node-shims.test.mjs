import assert from "node:assert/strict";
import test from "node:test";
import { shironesSsrNodeShims } from "../src/integration/ssr-node-shims.ts";

// The plugin exists because package mode inlines CommonJS dependencies into
// ESM prerender chunks, where `__dirname` / `__filename` / `require` do not
// exist. It is regex-driven and hooks both `transform` and `renderChunk`, so a
// Vite change can stop it applying without anything else visibly breaking —
// until a dependency that reads a sibling file from disk (stylus) is inlined.

const NM =
	"/site/node_modules/.pnpm/stylus@0.64.0/node_modules/stylus/lib/stylus.js";
const NM_DIR = "/site/node_modules/.pnpm/stylus@0.64.0/node_modules/stylus/lib";

/** Run `transform` the way Vite does for an SSR module. */
const transform = (code, id = NM, options = { ssr: true }) =>
	shironesSsrNodeShims().transform(code, id, options);

/** Run `renderChunk` against a resolved config. */
const renderChunk = (code, ssrBuild = true) => {
	const plugin = shironesSsrNodeShims();
	plugin.configResolved({ build: { ssr: ssrBuild } });
	return plugin.renderChunk(code);
};

test("injects __dirname and __filename into an inlined CommonJS module", () => {
	const out = transform("const dir = __dirname;\nconst self = __filename;\n");
	assert.ok(out, "expected a transform result");
	assert.equal(
		out.code,
		`const __filename = ${JSON.stringify(NM)};\n` +
			`const __dirname = ${JSON.stringify(NM_DIR)};\n` +
			"const dir = __dirname;\nconst self = __filename;\n",
	);
});

test("leaves a module that already declares the globals alone", () => {
	const code = "const __dirname = '/somewhere';\nuse(__dirname);\n";
	assert.equal(transform(code), null);
});

test("injects only the global that is actually referenced", () => {
	const out = transform("read(__dirname);\n");
	assert.ok(out);
	assert.match(out.code, /const __dirname = /);
	assert.doesNotMatch(out.code, /const __filename = /);
});

test("ignores a property access that merely looks like the global", () => {
	// `foo.__dirname` must not trigger an injection.
	assert.equal(transform("use(foo.__dirname);\n"), null);
});

test("only applies to SSR modules", () => {
	assert.equal(transform("use(__dirname);", NM, { ssr: false }), null);
	assert.equal(transform("use(__dirname);", NM, { ssr: undefined }), null);
	assert.equal(transform("use(__dirname);", NM, {}), null);
	// Calling the plugin with no options object at all — note this cannot go
	// through the helper above, whose default parameter would fill one in.
	assert.equal(shironesSsrNodeShims().transform("use(__dirname);", NM), null);
});

test("only applies to JavaScript inside node_modules", () => {
	assert.equal(transform("use(__dirname);", "/site/src/entry.js"), null);
	assert.equal(
		transform("use(__dirname);", NM.replace(/\.js$/, ".json")),
		null,
	);
});

test("uses the file path, not the module id, when the id carries a query", () => {
	const out = transform(
		"use(__dirname);\nconst f = __filename;\n",
		`${NM}?v=123`,
	);
	assert.ok(out);
	assert.doesNotMatch(out.code, /\?v=123/);
	assert.equal(
		out.code,
		`const __filename = ${JSON.stringify(NM)};\n` +
			`const __dirname = ${JSON.stringify(NM_DIR)};\n` +
			"use(__dirname);\nconst f = __filename;\n",
	);
});

test("renderChunk supplies require for an ESM chunk that calls it", () => {
	const out = renderChunk(
		'import x from "y";\nconst m = require("./lib/functions");\n',
	);
	assert.ok(out, "expected a renderChunk result");
	assert.match(out.code, /createRequire as __shironesCreateRequire/);
	assert.match(
		out.code,
		/const require = __shironesCreateRequire\(import\.meta\.url\);/,
	);
});

test("renderChunk derives __dirname inline when __filename is not referenced", () => {
	const out = renderChunk("const here = __dirname;\n");
	assert.ok(out);
	assert.match(out.code, /fileURLToPath as __shironesFileURLToPath/);
	assert.match(out.code, /dirname as __shironesDirname/);
	// Nothing referenced `__filename`, so it is not declared separately.
	assert.doesNotMatch(out.code, /const __filename = /);
	assert.match(
		out.code,
		/const __dirname = __shironesDirname\(__shironesFileURLToPath\(import\.meta\.url\)\);/,
	);
});

test("renderChunk reuses an existing __filename declaration", () => {
	const out = renderChunk(
		"const __filename = '/x.js';\nconst here = __dirname;\n",
	);
	assert.ok(out);
	assert.match(out.code, /const __dirname = __shironesDirname\(__filename\);/);
	// No duplicate declaration of __filename.
	assert.equal(out.code.match(/const __filename/g)?.length, 1);
});

test("renderChunk declares __filename when both globals are needed", () => {
	const out = renderChunk("use(__filename);\nuse(__dirname);\n");
	assert.ok(out);
	assert.match(
		out.code,
		/const __filename = __shironesFileURLToPath\(import\.meta\.url\);/,
	);
	assert.match(out.code, /const __dirname = __shironesDirname\(__filename\);/);
});

test("renderChunk stays out of the way when nothing needs shimming", () => {
	assert.equal(renderChunk('import x from "y";\nexport default x;\n'), null);
});

test("renderChunk does nothing for a client build", () => {
	assert.equal(renderChunk("const here = __dirname;\n", false), null);
});
