/**
 * Icon collection generation.
 *
 * `Icon.svelte` imports `@/generated/local-icon-collections`, a tree-shaken
 * subset of the installed `@iconify-json/*` sets. Tree-shaking is the point:
 * the full sets are 30407 icons / 14.4 MB, while a typical theme uses ~200 of
 * them. The alternative — loading the Iconify API at runtime — would put a
 * network request on every first paint, and one chunk per icon would mean one
 * request per glyph.
 *
 * It also produces the `local` collection from a project's own
 * `src/icons/*.svg`, which used to come from astro-icon. That package is gone:
 * it decided which sets to load by reading the *user's* `package.json`, which
 * forced four `@iconify-json/*` packages onto every user's dependency list.
 * This module resolves from inside the installed package instead, so those
 * sets ship as ordinary dependencies of the theme and the user declares none
 * of them.
 *
 * The logic lives here rather than in the old standalone script so the Vite
 * plugin in `regeneration.ts` can call it directly, and so the integration
 * stays bundled into the published package: package-mode projects get the
 * same behaviour without shipping `scripts/`.
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import type { Dirent } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate an installed `@iconify-json/<prefix>/icons.json`.
 *
 * Resolution starts from this module so the theme's own icon sets are found
 * whether the project runs from source or installs `shirones` from npm. Walks
 * up the directory tree because pnpm's symlinked layout puts the real
 * directory outside any obvious `node_modules/<pkg>` prefix.
 */
function resolveIconSetPath(prefix: string): string | null {
	const require = createRequire(import.meta.url);
	try {
		return require.resolve(`@iconify-json/${prefix}/icons.json`);
	} catch {
		// Fall back to a manual walk for layouts where the package is not
		// resolvable by name but is present on disk.
		// fileURLToPath, not `new URL(...).pathname`: the latter skips
		// percent-decoding, so a checkout path containing a space, `#` or
		// non-ASCII character would yield a path that does not exist.
		let dir = dirname(fileURLToPath(import.meta.url));
		while (true) {
			const candidate = join(
				dir,
				"node_modules",
				"@iconify-json",
				prefix,
				"icons.json",
			);
			if (existsSync(candidate)) return candidate;
			const parent = dirname(dir);
			if (parent === dir) return null;
			dir = parent;
		}
	}
}

/**
 * Icon sets the theme is allowed to reference.
 * Mirrors `src/config/integrationsConfig.ts`.
 */
const ICON_PREFIXES: ReadonlySet<string> = new Set<string>([
	"fa7-brands",
	"fa7-solid",
	"material-symbols",
	"simple-icons",
]);

/**
 * Numbers in an SVG length attribute, ignoring units and percentages.
 *
 * `24` and `24px` both mean 24; `50%` has no absolute meaning without a
 * viewport, so it is treated as absent and the viewBox wins.
 */
function svgLength(value: string | undefined): number | null {
	if (typeof value !== "string") return null;
	const match = /^(\d+(?:\.\d+)?)/.exec(value.trim());
	if (!match) return null;
	const parsed = Number(match[1]);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Read an attribute from the opening `<svg …>` tag, single or double quoted. */
function svgAttribute(source: string, name: string): string | undefined {
	// Matched case-insensitively. A hand-written file may spell `viewbox` or
	// `VIEWBOX`, and SVG-as-HTML treats attribute names that way, so a
	// case-sensitive read drops the viewBox and mis-sizes the whole icon.
	const pattern = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
	const match = pattern.exec(source);
	if (!match) return undefined;
	return match[2] ?? match[3];
}

/**
 * Turn one `src/icons/<name>.svg` file into an Iconify icon.
 *
 * Deliberately lenient and regex-based: pulling in an SVG parser (or SVGO, or
 * `@iconify/tools`) for icons the user wrote by hand would add a dependency to
 * the theme for a feature an empty directory currently exercises zero times.
 * Anything that cannot be read is dropped rather than thrown on, matching what
 * astro-icon did — one malformed file should not fail the build.
 */
function parseLocalIcon(
	source: string,
): Record<string, number | string> | null {
	const open = /<svg\b[^>]*>/i.exec(source);
	if (!open) return null;
	const tag = open[0];

	// The closing tag is matched forward from the opening one rather than
	// located with `lastIndexOf`. A self-closing `<svg … />` and an uppercased
	// `</SVG>` both contain no `</svg>` for that to find, and `lastIndexOf`
	// returning −1 would slice from a negative offset and read whatever markup
	// follows as if it were the icon's geometry. An empty body is dropped here
	// too: an `<svg>` with no geometry is valid SVG but not a usable icon.
	const rest = source.slice(open.index + open[0].length);
	const close = /<\/\s*svg\s*>/i.exec(rest);
	const body = (close ? rest.slice(0, close.index) : "").trim();
	if (!body) return null;

	const viewBox = svgAttribute(tag, "viewBox");
	const parts = viewBox
		? viewBox
				.trim()
				.split(/[\s,]+/)
				.map(Number)
		: [];
	const width =
		parts.length === 4 && Number.isFinite(parts[2]) && parts[2] > 0
			? parts[2]
			: (svgLength(svgAttribute(tag, "width")) ?? 0);
	const height =
		parts.length === 4 && Number.isFinite(parts[3]) && parts[3] > 0
			? parts[3]
			: (svgLength(svgAttribute(tag, "height")) ?? 0);
	if (!width || !height) return null;

	return { body, width, height };
}

/**
 * Build the `local` collection from a project's own SVGs.
 *
 * Returns `null` when the directory is missing or holds no icon, so the
 * generated module stays byte-identical for a project that never adds one.
 */
export function collectLocalIcons(
	directory: string,
): Record<string, unknown> | null {
	if (!existsSync(directory)) return null;
	const icons: Record<string, Record<string, number | string>> = {};
	collectLocalIconsFrom(directory, directory, icons);
	if (Object.keys(icons).length === 0) return null;
	return { prefix: "local", icons };
}

/**
 * Walks `directory` recursively, naming each icon by its path relative to the
 * icon root: `src/icons/foo.svg` becomes `foo`, and `src/icons/sub/bar.svg`
 * becomes `sub/bar`.
 *
 * astro-icon exposed sub-directories the same way, so a package-mode override
 * file carried over from that era keeps working. Flattening instead would be
 * lossy — two files in different sub-directories can share a basename, and
 * silently dropping one of them is the failure nobody can diagnose.
 *
 * A directory that cannot be read contributes nothing rather than throwing:
 * the top-level caller already handles a missing directory, and an unreadable
 * one is no reason to fail a build that only wanted an optional icon.
 */
function collectLocalIconsFrom(
	root: string,
	directory: string,
	icons: Record<string, Record<string, number | string>>,
): void {
	let entries: Dirent[];
	try {
		entries = readdirSync(directory, { withFileTypes: true });
	} catch {
		return;
	}
	const nesting = relative(root, directory);
	const prefix = nesting === "" ? "" : `${nesting.split(sep).join("/")}/`;
	for (const entry of entries) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			collectLocalIconsFrom(root, absolute, icons);
			continue;
		}
		if (!entry.name.toLowerCase().endsWith(".svg")) continue;
		const parsed = parseLocalIcon(readFileSync(absolute, "utf8"));
		if (parsed) icons[`${prefix}${entry.name.slice(0, -4)}`] = parsed;
	}
}

/** The specifier `Icon.svelte` imports; see `regeneration.ts` for how it resolves. */
export const ICON_COLLECTIONS_SPECIFIER = "@/generated/local-icon-collections";

const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set<string>([
	".astro",
	".md",
	".mdx",
	".svelte",
	".ts",
	".tsx",
]);

/** `prefix:name`, e.g. `material-symbols:home-rounded`. */
const ICON_PATTERN = /\b(?<prefix>[a-z][a-z0-9-]*):(?<name>[a-z0-9-]+)\b/g;

function collectSourceFiles(directory: string): string[] {
	if (!existsSync(directory)) return [];
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const absolute = join(directory, entry.name);
		if (entry.isDirectory()) {
			// `generated/` holds previous output; scanning it would feed the
			// generator its own icon names back in.
			if (entry.name !== "generated")
				files.push(...collectSourceFiles(absolute));
		} else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
			files.push(absolute);
		}
	}
	return files;
}

export interface GenerateIconCollectionsOptions {
	/** Directories to scan for `prefix:name` references. */
	roots: string[];
	/** Where to write the generated module. */
	outputPath: string;
	/**
	 * Directory holding a project's own `*.svg` icons, emitted as the `local`
	 * collection. Absent, empty or unreadable means no `local` entry at all.
	 */
	localIconDir?: string;
}

/**
 * Scan `roots`, resolve each referenced glyph, and write the collection module.
 *
 * Throws on an unknown icon name or a missing icon set: a collection that
 * silently drops a glyph is harder to notice than a failure. Callers running
 * inside the dev server are expected to catch — see `shironesIconRegeneration`.
 */
export function generateIconCollections({
	roots,
	outputPath,
	localIconDir,
}: GenerateIconCollectionsOptions): number {
	const requested = new Map<string, Set<string>>();
	for (const root of roots) {
		for (const file of collectSourceFiles(root)) {
			const source = readFileSync(file, "utf8");
			for (const match of source.matchAll(ICON_PATTERN)) {
				const { prefix, name } = match.groups as {
					prefix: string;
					name: string;
				};
				if (!ICON_PREFIXES.has(prefix) || name === "xxx") continue;
				if (!requested.has(prefix)) requested.set(prefix, new Set());
				requested.get(prefix)?.add(name);
			}
		}
	}

	const collections: Record<string, unknown>[] = [];
	for (const [prefix, names] of [...requested].sort(([a], [b]) =>
		a.localeCompare(b),
	)) {
		// Resolve from this module, not from `projectRoot`. In package mode
		// `projectRoot` is the user's project, which does not contain the
		// theme's own devDependencies under pnpm's strict layout.
		const iconSetPath = resolveIconSetPath(prefix);
		if (!iconSetPath) {
			throw new Error(
				`[local-icons] Missing installed icon set @iconify-json/${prefix} for ${[...names][0]}`,
			);
		}
		const set = JSON.parse(readFileSync(iconSetPath, "utf8"));
		const icons: Record<string, unknown> = {};
		const aliases: Record<string, unknown> = {};

		// Follow the alias chain so an alias the theme asked for resolves to the
		// same glyph as the concrete icon it points at.
		function include(name: string, chain: string[] = []): void {
			if (icons[name] || aliases[name]) return;
			if (set.icons?.[name]) {
				icons[name] = set.icons[name];
				return;
			}
			const alias = set.aliases?.[name];
			if (!alias) {
				throw new Error(`[local-icons] Unknown icon ${prefix}:${name}`);
			}
			if (chain.includes(name)) {
				throw new Error(
					`[local-icons] Circular alias ${prefix}:${[...chain, name].join(" -> ")}`,
				);
			}
			aliases[name] = alias;
			include(alias.parent, [...chain, name]);
		}

		for (const name of [...names].sort()) include(name);
		collections.push({
			prefix,
			...(set.width ? { width: set.width } : {}),
			...(set.height ? { height: set.height } : {}),
			icons,
			...(Object.keys(aliases).length ? { aliases } : {}),
		});
	}

	// The user's own `src/icons/*.svg`, under the `local` prefix. Appended last
	// so a project icon can shadow nothing and nothing can shadow it — the set
	// lists do not overlap, because `local` is not an `@iconify-json` prefix.
	const local = localIconDir ? collectLocalIcons(localIconDir) : null;
	if (local) collections.push(local);

	const output = [
		"// Generated by src/integration/vite/icon/collections.ts. Do not edit.",
		`export const localIconCollections = ${JSON.stringify(collections)} as const;`,
		"",
	].join("\n");
	// Write-then-rename so a dev server reading mid-write never sees a partial file.
	const temporaryPath = `${outputPath}.tmp`;
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(temporaryPath, output, "utf8");
	renameSync(temporaryPath, outputPath);

	return collections.reduce(
		(total, collection) =>
			total +
			Object.keys(collection.icons as object).length +
			Object.keys((collection.aliases as object) ?? {}).length,
		0,
	);
}

export { ICON_PREFIXES, SOURCE_EXTENSIONS };
