import type { Component } from "svelte";

/**
 * Props the theme's Icon accepts.
 *
 * Declared explicitly rather than inferred from `OfflineIcon` because the
 * upstream `@iconify/svelte` signature is deprecated and narrower than what
 * this component actually forwards — inferring it made every `<Icon icon="…">`
 * in an `.astro` file a type error, which is how the 28 migrated call sites
 * were caught.
 *
 * `icon` takes a `<prefix>:<name>` string from a generated collection, or a
 * bare `<name>` for the project's own `src/icons/*.svg` (see `Icon.svelte`).
 */
export interface IconProps {
	icon: string;
	/** Rendered width. Either dimension may be given alone; the other scales. */
	width?: number | string;
	/** Rendered height. */
	height?: number | string;
	/** Flip/rotate transforms, as `@iconify/svelte` spells them. */
	flip?: string;
	rotate?: number;
	/** Marks the icon decorative for assistive technology. */
	"aria-hidden"?: boolean | "true" | "false";
	/** Classes for the rendered `<svg>`, forwarded with the other props. */
	class?: string;
}

/**
 * Typed as a Svelte 5 `Component` (a function), not `SvelteComponent` (a class
 * instance): `svelte-check` rejects an instance type at every `<Icon>` in a
 * `.svelte` file.
 */
declare const Icon: Component<IconProps>;

export default Icon;
