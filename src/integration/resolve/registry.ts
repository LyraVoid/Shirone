import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import type { ResolvedShironesPaths } from "../types.ts";
import { normalisePath } from "./paths.ts";

/** Only files that can carry an import are worth opening. */
const SOURCE_EXTENSIONS = /\.(astro|svelte|ts|tsx|mjs|js)$/;

/**
 * Extensions probed when a user override is looked up without one.
 * Order matters: the first hit wins.
 */
export const CONFIG_EXTENSIONS: string[] = [".ts", ".mts", ".js", ".mjs"];
/**
 * Barrel files, which stay owned by the package at any depth. The pattern used
 * to be anchored (`/^index\./`), so a nested `atoms/index.ts` would have been
 * overridable despite the comment claiming otherwise.
 */
const BARREL_RE = /(?:^|\/)index\.(ts|js|mts|mjs)$/;
export const COMPONENT_EXTENSIONS: string[] = [
	".astro",
	".svelte",
	".ts",
	".js",
];

/** Strip a known source extension from a path. */
function stripExtension(path: string): string {
	return path.replace(/\.(ts|mts|js|mjs|astro|svelte)$/, "");
}

/**
 * Normalised, extension-stripped key used to look an override up. Both the
 * package path and the user path map onto the same key, so a `Foo.astro` in the
 * package and a `Foo.svelte` in the user's project resolve to one entry.
 */
export function overrideKey(path: string): string {
	return normalisePath(stripExtension(path));
}

export interface OverlayTarget {
	/** Directory inside the package that may be overridden. */
	packageDir: string;
	/** Directory in the user's project that takes precedence. */
	userDir: string;
	/** Extensions probed when resolving. */
	extensions: string[];
	/** Human readable label used in debug logs. */
	label: string;
}

/**
 * The directory pairs that participate in the override system.
 *
 * | package             | user project                 |
 * |---------------------|------------------------------|
 * | `src/config/*`      | `shirones/config/*`          |
 * | `src/data/*`        | `shirones/config/data/*`     |
 * | `src/components/**` | `src/components/**`          |
 * | `src/layouts/**`    | `src/layouts/**`             |
 */
export function createOverlayTargets(
	paths: ResolvedShironesPaths,
): OverlayTarget[] {
	return [
		{
			label: "config",
			packageDir: join(paths.packageSrc, "config"),
			userDir: paths.configDir,
			extensions: CONFIG_EXTENSIONS,
		},
		{
			label: "data",
			packageDir: join(paths.packageSrc, "data"),
			userDir: paths.dataDir,
			extensions: CONFIG_EXTENSIONS,
		},
		{
			label: "components",
			packageDir: join(paths.packageSrc, "components"),
			userDir: join(paths.projectRoot, "src", "components"),
			extensions: COMPONENT_EXTENSIONS,
		},
		{
			label: "layouts",
			packageDir: join(paths.packageSrc, "layouts"),
			userDir: join(paths.projectRoot, "src", "layouts"),
			extensions: COMPONENT_EXTENSIONS,
		},
	];
}

/** Resolve a path that may be missing its extension against the given list. */
export function probe(basePath: string, extensions: string[]): string | null {
	// Exact path first (the importer already carried an extension).
	if (extname(basePath) && existsSync(basePath)) return basePath;

	const withoutExt = stripExtension(basePath);
	for (const ext of extensions) {
		const candidate = `${withoutExt}${ext}`;
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/** Recursively list files under `root` (absolute paths). */
function walkFiles(root: string): string[] {
	const out: string[] = [];
	if (!existsSync(root)) return out;
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = join(root, entry.name);
		if (entry.isDirectory()) out.push(...walkFiles(full));
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

/**
 * Resolve a package-internal path to a user override, if one exists.
 * Returns `null` when the path is not overridable or no override is present.
 *
 * Kept for callers that do not have a registry handy (e.g. one-off probes).
 */
export function resolveOverride(
	targets: OverlayTarget[],
	absolutePath: string,
): string | null {
	const normalised = normalisePath(absolutePath);

	for (const target of targets) {
		const packageDir = normalisePath(target.packageDir);
		if (!normalised.startsWith(`${packageDir}/`)) continue;

		const rel = relative(target.packageDir, absolutePath);
		// `index.ts` barrels stay owned by the package: overriding them would
		// break the named-export contract the theme relies on.
		if (BARREL_RE.test(rel)) continue;

		const hit = probe(join(target.userDir, rel), target.extensions);
		if (hit) return hit;
	}
	return null;
}

/**
 * A mutable holder for the compiled registry, so the integration can swap in a
 * rebuilt one when the user's override files change in dev without recreating
 * the Vite plugins (whose closures captured the original reference).
 */
export interface OverrideRegistryRef {
	overrides: Map<string, string>;
}

/** The compiled override registry: every overridable package file → user file. */
export interface OverrideRegistry {
	/** Package key (extension-stripped) → user override file (absolute path). */
	overrides: Map<string, string>;
	/** Number of overrides registered per directory, for diagnostics. */
	counts: Record<string, number>;
}

/**
 * Scan the package and the user's project once and register every override in
 * a single pass. Resolution becomes a table lookup instead of a filesystem
 * probe per import, and the registry doubles as the single source of truth for
 * "what is overridden and what is not".
 */
export function buildOverrideRegistry(
	paths: ResolvedShironesPaths,
): OverrideRegistry {
	const targets = createOverlayTargets(paths);
	const overrides = new Map<string, string>();
	const counts: Record<string, number> = {};

	for (const target of targets) {
		let registered = 0;
		if (!existsSync(target.packageDir)) {
			counts[target.label] = 0;
			continue;
		}

		for (const abs of walkFiles(target.packageDir)) {
			const rel = relative(target.packageDir, abs);
			// `index.ts` barrels stay owned by the package: overriding one would
			// break the named-export contract the theme relies on. Matched at any
			// depth, not just the directory root.
			if (BARREL_RE.test(rel)) continue;

			const hit = probe(join(target.userDir, rel), target.extensions);
			if (hit) {
				overrides.set(overrideKey(abs), normalisePath(hit));
				registered += 1;
			}
		}
		counts[target.label] = registered;
	}

	return { overrides, counts };
}

/**
 * Files a user left in the theme-owned config/data directories that correspond
 * to no module the package ships — and therefore to nothing that will ever be
 * loaded.
 *
 * This is the silent half of an upgrade: when the theme renames a config module
 * (`siteConfig` → `site`), the integration asks for the new name, finds the
 * user's old file nowhere it looks, and quietly falls back to the packaged
 * default. The user's edits stop applying with no error and no warning.
 *
 * Only `configDir` and `dataDir` are scanned. Those directories belong entirely
 * to the theme, so a file the package does not know about is inert by
 * definition. `src/components` and `src/layouts` are deliberately *not*
 * scanned: they are shared with the user's own components, so every legitimate
 * file of theirs would be reported as an orphan.
 */
export function findOrphanUserFiles(paths: ResolvedShironesPaths): string[] {
	const targets = createOverlayTargets(paths).filter(
		(t) => t.label === "config" || t.label === "data",
	);
	const orphans: string[] = [];

	for (const target of targets) {
		if (!existsSync(target.userDir)) continue;
		const userDir = normalisePath(target.userDir);

		for (const file of walkFiles(target.userDir)) {
			const rel = relative(target.userDir, file);

			// `dataDir` lives *inside* `configDir` but maps to a different package
			// directory (`src/data`, not `src/config/data`), so scanning it under
			// the config target would report every data module as an orphan. The
			// data target covers it against the right place.
			if (target.label === "config") {
				const dataDir = normalisePath(paths.dataDir);
				if (dataDir !== userDir && dataDir.startsWith(`${userDir}/`)) {
					const withinData = `${normalisePath(file)}/`.startsWith(
						`${dataDir}/`,
					);
					if (withinData) continue;
				}
			}

			// A package module with any of the probed extensions counts as known.
			if (probe(join(target.packageDir, rel), target.extensions)) continue;
			orphans.push(file);
		}
	}

	return orphans.sort();
}

/** The package a project has to drop to be on the current icon pipeline. */
const LEGACY_ICON_IMPORT = "astro-icon";

type ImportToken = { kind: "word" | "string" | "punct"; value: string };

/**
 * Tokenize enough JavaScript/TypeScript to recognise module specifiers without
 * mistaking prose, comments, string values, or a regular expression for code.
 * This is intentionally not a parser: the registry only needs import edges.
 */
function importTokens(source: string): ImportToken[] {
	const tokens: ImportToken[] = [];
	let index = 0;

	while (index < source.length) {
		const char = source[index];
		if (/\s/.test(char)) {
			index += 1;
			continue;
		}

		if (source.startsWith("//", index)) {
			const newline = source.indexOf("\n", index + 2);
			index = newline < 0 ? source.length : newline + 1;
			continue;
		}
		if (source.startsWith("/*", index)) {
			const end = source.indexOf("*/", index + 2);
			index = end < 0 ? source.length : end + 2;
			continue;
		}

		if (char === "'" || char === '"') {
			const quote = char;
			let value = "";
			index += 1;
			while (index < source.length) {
				const current = source[index];
				if (current === "\\") {
					if (index + 1 < source.length) value += source[index + 1];
					index += 2;
					continue;
				}
				index += 1;
				if (current === quote) break;
				value += current;
			}
			tokens.push({ kind: "string", value });
			continue;
		}

		// Template literals are opaque to the import check: the theme's legacy
		// warning itself mentions `astro-icon` in one, but that text is not an
		// import. Dynamic imports inside template expressions are not used by
		// these override modules.
		if (char === "`") {
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === "`") {
					index += 1;
					break;
				}
				index += 1;
			}
			continue;
		}

		if (char === "/" && canStartRegularExpression(tokens.at(-1))) {
			index += 1;
			let inCharacterClass = false;
			while (index < source.length) {
				const current = source[index];
				if (current === "\\") {
					index += 2;
					continue;
				}
				if (current === "[") inCharacterClass = true;
				if (current === "]") inCharacterClass = false;
				index += 1;
				if (current === "/" && !inCharacterClass) break;
				if (current === "\n") break;
			}
			while (/[A-Za-z]/.test(source[index] ?? "")) index += 1;
			continue;
		}

		if (/[A-Za-z_$]/.test(char)) {
			const start = index;
			index += 1;
			while (/[A-Za-z0-9_$]/.test(source[index] ?? "")) index += 1;
			tokens.push({ kind: "word", value: source.slice(start, index) });
			continue;
		}

		if (source.startsWith("?.", index) || source.startsWith("=>", index)) {
			tokens.push({ kind: "punct", value: source.slice(index, index + 2) });
			index += 2;
			continue;
		}
		tokens.push({ kind: "punct", value: char });
		index += 1;
	}
	return tokens;
}

/** Whether a slash can begin a regexp at this token boundary. */
function canStartRegularExpression(previous: ImportToken | undefined): boolean {
	if (!previous) return true;
	if (previous.kind === "punct")
		return "([{=,:;!?&|+-*%^~<>".includes(previous.value);
	return (
		previous.kind === "word" &&
		[
			"return",
			"throw",
			"case",
			"delete",
			"void",
			"typeof",
			"instanceof",
			"in",
			"of",
			"yield",
			"await",
		].includes(previous.value)
	);
}

/** Does a specifier refer to the removed package or one of its subpaths? */
function isLegacyIconSpecifier(value: string | undefined): boolean {
	return (
		value === LEGACY_ICON_IMPORT ||
		value?.startsWith(`${LEGACY_ICON_IMPORT}/`) === true
	);
}

/** Recognise an import/export declaration's `from "specifier"` clause. */
function hasFromSpecifier(tokens: ImportToken[], start: number): boolean {
	for (let index = start + 1; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token.value === ";") return false;
		if (
			index > start + 1 &&
			token.kind === "word" &&
			(token.value === "import" || token.value === "export")
		)
			return false;
		if (
			token.kind === "word" &&
			token.value === "from" &&
			tokens[index + 1]?.kind === "string"
		) {
			return isLegacyIconSpecifier(tokens[index + 1].value);
		}
	}
	return false;
}

/** Extract JavaScript from Svelte/Astro files without treating page markup as code. */
function scriptBlocks(source: string): string[] {
	const blocks: string[] = [];
	const openTag = /<script\b[^>]*>/gi;
	const closeTag = /<\/script\s*>/gi;
	let cursor = 0;

	while (cursor < source.length) {
		const commentStart = source.indexOf("<!--", cursor);
		openTag.lastIndex = cursor;
		const opening = openTag.exec(source);
		if (commentStart !== -1 && (!opening || commentStart < opening.index)) {
			const commentEnd = source.indexOf("-->", commentStart + 4);
			if (commentEnd === -1) break;
			cursor = commentEnd + 3;
			continue;
		}
		if (!opening) break;

		const bodyStart = opening.index + opening[0].length;
		closeTag.lastIndex = bodyStart;
		const closing = closeTag.exec(source);
		if (!closing) {
			blocks.push(source.slice(bodyStart));
			break;
		}
		blocks.push(source.slice(bodyStart, closing.index));
		cursor = closing.index + closing[0].length;
	}
	return blocks;
}

/** Select executable source sections for each file format we scan. */
function importSources(source: string, file: string): string[] {
	const extension = extname(file).toLowerCase();
	if (extension === ".svelte") return scriptBlocks(source);
	if (extension === ".astro") {
		const frontmatter =
			/^(?:\uFEFF)?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(
				source,
			);
		const markup = frontmatter ? source.slice(frontmatter[0].length) : source;
		return [...(frontmatter ? [frontmatter[1]] : []), ...scriptBlocks(markup)];
	}
	return [source];
}

/** Check for actual static/dynamic imports, re-exports, and CommonJS requires. */
function importsLegacyIcon(source: string): boolean {
	const tokens = importTokens(source);
	for (let index = 0; index < tokens.length; index += 1) {
		const token = tokens[index];
		if (token.kind !== "word") continue;
		const previous = tokens[index - 1];
		if (
			token.value === "import" &&
			previous?.value !== "." &&
			previous?.value !== "?."
		) {
			const next = tokens[index + 1];
			if (next?.kind === "string" && isLegacyIconSpecifier(next.value))
				return true;
			if (
				next?.value === "(" &&
				tokens[index + 2]?.kind === "string" &&
				isLegacyIconSpecifier(tokens[index + 2].value)
			)
				return true;
			if (next?.value !== "." && hasFromSpecifier(tokens, index)) return true;
		}
		if (token.value === "export" && hasFromSpecifier(tokens, index))
			return true;
		if (
			token.value === "require" &&
			tokens[index + 1]?.value === "(" &&
			tokens[index + 2]?.kind === "string" &&
			isLegacyIconSpecifier(tokens[index + 2].value)
		)
			return true;
	}
	return false;
}

/**
 * Overridden files that still import the removed `astro-icon` package.
 *
 * Scoped to overrides only, never to the project's own components: a file the
 * user copied out of the theme and edited carries the theme's imports with it,
 * so a surviving one there is a real migration signal. A file the user wrote
 * themselves is their business, and reporting it would cry wolf on ordinary
 * code — which is why `findOrphanUserFiles` keeps away from `src/components`
 * for the same reason.
 *
 * Reading only registered overrides keeps this cheap: a project that customises
 * nothing scans nothing. Comments and string bodies are ignored; only module
 * specifiers in actual import/export/require syntax trigger the warning.
 */
export function findLegacyIconImports(
	overrides: ReadonlyMap<string, string>,
): string[] {
	const found: string[] = [];
	for (const userCopy of overrides.values()) {
		if (!SOURCE_EXTENSIONS.test(userCopy)) continue;
		try {
			const source = readFileSync(userCopy, "utf8");
			if (importSources(source, userCopy).some(importsLegacyIcon))
				found.push(userCopy);
		} catch {
			// An unreadable file is a resolution problem the registry already
			// reports; it is not a reason to fail a build.
		}
	}
	return found.sort();
}
