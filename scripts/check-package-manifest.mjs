/**
 * Fail when a bare specifier imported from `src/` is not a real dependency.
 *
 * A package-mode-only failure this catches: the theme imports a bare specifier
 * that is listed in `devDependencies` (or nowhere at all). Source mode works —
 * devDependencies are installed either way — so the theme builds and the tests
 * pass, while `shirones init` in a user's project dies mid-build because the
 * package does not ship that dependency.
 *
 * `@iconify-json/simple-icons` was exactly this bug: a `devDependency` imported
 * at runtime by `src/plugins/markdown/core/file-tree-icons.mjs`, listed by hand
 * in the packaging repo so users got a working build.
 *
 * The check runs here, in the theme, because that is where the import is
 * written. The packaging repo reads `package.manifest.json` for the fix; it
 * cannot catch a missing entry that was never declared anywhere.
 *
 * Run: `node scripts/check-package-manifest.mjs`
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { extname, join, relative, resolve } from "node:path";

const ROOT = resolve(".");
const SRC = join(ROOT, "src");
const MANIFEST = join(SRC, "integration", "package.manifest.json");

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

/** Every dependency the package can legitimately satisfy at runtime. */
const declared = new Set([
	...Object.keys(pkg.dependencies ?? {}),
	...Object.keys(pkg.peerDependencies ?? {}),
]);

let manifest;
try {
	manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
	console.error(`[manifest] cannot read ${relative(ROOT, MANIFEST)}`);
	process.exit(1);
}

/** Shipped by the package even though the theme lists them as devDependencies. */
const shippedByPackage = new Set(Object.keys(manifest.extraDependencies ?? {}));
for (const name of shippedByPackage) declared.add(name);

/** Path aliases from tsconfig `paths` — not npm packages. */
const tsconfigText = readFileSync(join(ROOT, "tsconfig.json"), "utf8")
	.replace(/^\s*\/\/.*$/gm, "")
	.replace(/,(\s*[}\]])/g, "$1");
const tsconfigPaths = JSON.parse(tsconfigText).compilerOptions?.paths ?? {};
const aliasPrefixes = Object.keys(tsconfigPaths).map((p) =>
	p.replace(/\*$/, ""),
);

/**
 * Node builtins and `node:`-prefixed specifiers.
 *
 * `builtinModules` is the authoritative list; a hand-written one drifts (it was
 * missing `node:test` and `node:sqlite`, among others) and every omission is a
 * false positive someone then has to silence.
 */
const BUILTIN_MODULES = new Set(builtinModules);
const isBuiltin = (spec) =>
	spec.startsWith("node:") || BUILTIN_MODULES.has(spec.split("/")[0]);

// Virtual specifiers. These are never files on disk, so they cannot be npm
// packages and must not be reported:
//   - `astro:*`           Astro's own virtual modules (`astro:content`,
//                          `astro:assets`, `astro:transitions`, …)
//   - `virtual:*`          Vite virtual modules the theme registers; here
//                          `virtual:shirone-music-sidebar`, declared as
//                          MUSIC_SIDEBAR_VIRTUAL_ID in src/config/integrationsConfig.ts
//   - `#*`                 Node subpath imports
//   - `shirones`           self-reference inside src/integration, which is the
//                          package's own public name and only appears in doc
//                          comments, never as a real import
const isVirtual = (spec) =>
	spec.startsWith("astro:") ||
	spec.startsWith("virtual:") ||
	spec.startsWith("#") ||
	spec === "shirones";

const SCANNED = new Set([
	".ts",
	".mts",
	".js",
	".mjs",
	".cjs",
	".astro",
	".svelte",
	".tsx",
	".jsx",
]);

/** Collect every file under `src/`, skipping generated and binary trees. */
function walk(dir, acc = []) {
	for (const entry of readdirSync(dir)) {
		if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
			continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, acc);
		else if (SCANNED.has(extname(entry))) acc.push(full);
	}
	return acc;
}

/**
 * Extract specifiers that are imported at **runtime**, keyed by name.
 *
 * Deliberately regex-based: the alternative is evaluating theme source, and this
 * runs on every commit. Two consequences shape the implementation.
 *
 * Comments are stripped first. Prose routinely mentions specifiers in backticks
 * — `import shirones from 'shirones'` in a usage example — and a checker that
 * reads documentation as code buries real findings under noise.
 *
 * Type-only imports are excluded, and the decision is made **per specifier, not
 * per file**. `import type Swup from "swup"` needs the types at compile time but
 * emits no runtime import, so it cannot break a user's build. A file that mixes
 * a type import with a genuinely undeclared runtime import must still report the
 * latter — testing `import type` against the whole source would waive it.
 */
function runtimeSpecifiers(source) {
	const code = stripComments(source);
	const out = new Set();

	// `import type … from "x"`, and the `{ … } from "x"` block form. Their
	// specifiers are collected with the source offset of the type-only statement
	// so the runtime pass can tell a specifier apart by *which statement* used
	// it. A file-level Set is not enough: one `import type … from "x"` would
	// waive every runtime `from "x"` in the same file.
	const typeOnlyRanges = [];
	const typePatterns = [
		/\bimport\s+type\s+[^;'"]*?\bfrom\s*["']([^"'\s]+)["']/g,
		/\bexport\s+type\s+[^;'"]*?\bfrom\s*["']([^"'\s]+)["']/g,
	];
	for (const re of typePatterns) {
		for (const m of code.matchAll(re)) {
			typeOnlyRanges.push({
				spec: m[1],
				start: m.index,
				end: m.index + m[0].length,
			});
		}
	}

	/** True when this occurrence of `spec` sits inside a type-only statement. */
	const isTypeOnlyOccurrence = (spec, index) =>
		typeOnlyRanges.some(
			(range) =>
				range.spec === spec && index >= range.start && index < range.end,
		);

	// A specifier never contains whitespace, and the `from` keyword is never
	// directly preceded by a quote. Without both rules, a tokenizer comparing
	// `token.value === "from" && next?.kind === "string"` reads the code between
	// the two literals as an undeclared package.
	const patterns = [
		/(?<!["'`])\bfrom\s*["']([^"'\s]+)["']/g,
		/\bimport\s*\(\s*["']([^"'\s]+)["']\s*\)/g,
		/\bimport\s+["']([^"'\s]+)["']/g,
		/\brequire\s*\(\s*["']([^"'\s]+)["']\s*\)/g,
	];
	for (const re of patterns) {
		for (const m of code.matchAll(re)) {
			const spec = m[1];
			if (spec.startsWith(".") || spec.startsWith("/")) continue;
			if (isTypeOnlyOccurrence(spec, m.index)) continue;
			out.add(spec);
		}
	}
	return out;
}

/** Remove line and block comments. Good enough for specifier extraction. */
function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Reduce a specifier to its package name for the dependency lookup. */
function packageName(spec) {
	if (spec.startsWith("@")) return spec.split("/").slice(0, 2).join("/");
	return spec.split("/")[0];
}

const violations = new Map();
for (const file of walk(SRC)) {
	// A declaration file is never emitted and never executed, so a bare
	// import in one cannot break an installed package — including a
	// side-effect import like `import "@swup/scroll-plugin"` in
	// `src/global.d.ts`, which the theme does not need at runtime because
	// `@swup/astro` registers its own scroll plugin.
	if (file.endsWith(".d.ts")) continue;
	const source = readFileSync(file, "utf8");
	for (const spec of runtimeSpecifiers(source)) {
		if (isVirtual(spec)) continue;
		const name = packageName(spec);
		if (isBuiltin(name)) continue;
		if (aliasPrefixes.some((p) => spec.startsWith(p))) continue;
		if (declared.has(name)) continue;
		if (!violations.has(name)) violations.set(name, new Set());
		violations.get(name).add(relative(ROOT, file));
	}
}

if (violations.size === 0) {
	const files = walk(SRC).length;
	console.log(
		`[manifest] ✓ every bare import in ${files} src/ files resolves ` +
			`(${shippedByPackage.size} shipped by the package via the manifest)`,
	);
	process.exit(0);
}

console.error("[manifest] ✗ these bare imports are not declared anywhere:\n");
for (const [name, files] of [...violations].sort()) {
	console.error(`  ${name}`);
	for (const f of [...files].slice(0, 3)) console.error(`      ${f}`);
	if (files.size > 3) console.error(`      …and ${files.size - 3} more`);
	console.error("");
}
console.error(
	"  Fix one of:\n" +
		"    - add it to `dependencies` (or `peerDependencies`) in package.json\n" +
		"    - add it to `extraDependencies` in src/integration/package.manifest.json\n" +
		"      if the packaging repo must ship it even though it is a devDependency\n" +
		"    - add it to tsconfig.json `paths` if it is a theme path alias\n" +
		"    - or import it by relative path\n",
);
process.exit(1);
