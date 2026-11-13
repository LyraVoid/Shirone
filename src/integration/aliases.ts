/**
 * Theme path aliases, mapped to sub-directories of the package `src/`.
 * `@/` stays last: it is the broadest pattern.
 *
 * Single source for the Vite alias table, the Node-side esbuild mirror and the
 * dev dep-optimizer exclusion.
 */
export const THEME_ALIASES: readonly (readonly [string, string])[] = [
	["@components/", "components/"],
	["@utils/", "utils/"],
	["@layouts/", "layouts/"],
	["@i18n/", "i18n/"],
	["@constants/", "constants/"],
	["@assets/", "assets/"],
	["@/", ""],
];

/** Bare alias namespaces for Vite's `optimizeDeps.exclude` (`@components`, `@`, …). */
export const ALIAS_NAMESPACES: string[] = THEME_ALIASES.map(([prefix]) =>
	prefix.slice(0, -1),
);

/** A prefix as a regex source, for the alias matchers. */
export function aliasPattern(prefix: string): string {
	return prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
