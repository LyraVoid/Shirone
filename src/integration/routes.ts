import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { normalisePath } from "./paths.ts";

export interface ShironeRoute {
	/** Route pattern passed to `injectRoute`. */
	pattern: string;
	/** Absolute path of the page module inside the package. */
	entrypoint: string;
	/** Path relative to the package `src/pages` directory. */
	source: string;
}

/** File extensions Astro treats as routable page modules. */
const PAGE_EXTENSIONS = [".astro", ".ts", ".js", ".md", ".mdx"];

/**
 * Documentation files that live alongside pages but must never become routes.
 * The theme keeps authoring notes in `src/pages/_AGENTS.md`.
 */
const DOC_FILENAMES = new Set([
	"AGENTS.md",
	"README.md",
	"CONTRIBUTING.md",
	"LICENSE.md",
]);

function isPageFile(name: string): boolean {
	if (name.startsWith("_")) return false;
	if (name.endsWith(".d.ts")) return false;
	if (DOC_FILENAMES.has(name)) return false;
	return PAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * Convert a path relative to `src/pages` into an Astro route pattern.
 *
 * ```
 * archive.astro          -> /archive
 * [...page].astro        -> /[...page]
 * albums/[id]/index.astro-> /albums/[id]
 * atom.xml.ts            -> /atom.xml
 * robots.txt.ts          -> /robots.txt
 * posts/[...slug].astro  -> /posts/[...slug]
 * ```
 */
export function toRoutePattern(relativePath: string): string {
	let route = normalisePath(relativePath);

	// Drop the module extension only (keeps `.xml` / `.txt` in endpoint names).
	route = route.replace(/\.(astro|ts|js|mdx|md)$/, "");

	// `foo/index` collapses to `foo`, and a bare `index` becomes the site root.
	route = route.replace(/(^|\/)index$/, "");

	if (!route.startsWith("/")) route = `/${route}`;
	// Collapse the empty string produced by a root `index` page.
	if (route === "/") return "/";
	return route.replace(/\/+$/, "");
}

/**
 * Walk the package's `src/pages` directory and produce the full route table.
 * Scanning at runtime keeps the package in sync with the theme automatically,
 * so adding a page upstream needs no changes here.
 */
export function collectRoutes(pagesDir: string): ShironeRoute[] {
	if (!existsSync(pagesDir)) return [];

	const routes: ShironeRoute[] = [];

	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith("_")) continue;
				walk(full);
				continue;
			}
			if (!isPageFile(entry.name)) continue;

			const rel = relative(pagesDir, full);
			routes.push({
				pattern: toRoutePattern(rel),
				entrypoint: full,
				source: normalisePath(rel),
			});
		}
	};

	walk(pagesDir);

	// Stable ordering keeps build logs and manifests diff-friendly.
	return routes.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/**
 * Filter out routes the user asked to drop. Patterns are matched loosely so
 * both `"/anime"` and `"anime"` work.
 */
export function filterRoutes(
	routes: ShironeRoute[],
	exclude: string[] = [],
): ShironeRoute[] {
	if (exclude.length === 0) return routes;
	const normalised = new Set(
		exclude.map((value) => (value.startsWith("/") ? value : `/${value}`)),
	);
	return routes.filter(
		(route) =>
			!normalised.has(route.pattern) && !normalised.has(`/${route.source}`),
	);
}
