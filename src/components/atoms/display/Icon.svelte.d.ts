import type { Component } from "svelte";

/**
 * Props the theme's Icon accepts.
 *
 * Declared explicitly rather than inferred from `OfflineIcon`: the upstream
 * `@iconify/svelte` signature is deprecated and narrower than what this
 * component actually forwards, so inferring it turned every
 * `<Icon icon="…">` in an `.astro` file into a type error.
 *
 * `icon` takes a `<prefix>:<name>` string from a generated collection, or a
 * bare `<name>` for the project's own `src/icons/*.svg` (see `Icon.svelte`).
 * The `name` spelling remains accepted for compatibility with files copied
 * from the removed `astro-icon` integration; it is warned about in dev only.
 * The two spellings form a discriminated union so exactly one is supplied.
 */
interface IconAppearance {
	/** Rendered width. Either dimension may be given alone; the other scales. */
	width?: number | string;
	/** Rendered height. */
	height?: number | string;
	/** Passed through to the rendered `<svg>`. */
	class?: string;
	/** Passed through to the rendered `<svg>`. */
	style?: string;
	/** Renders the icon inline instead of as a replaced block. */
	inline?: boolean;
	/** Stroke colour, when the icon's own artwork uses `currentColor`. */
	color?: string;
	/** Mirrors the artwork horizontally, vertically, or both. */
	flip?: string;
	/** Rotation in degrees, clockwise. */
	rotate?: number;
	/** Marks the icon decorative for assistive technology. */
	"aria-hidden"?: boolean | "true" | "false";
}

/** The current spelling. */
interface CurrentIconProps extends IconAppearance {
	icon: string;
	name?: never;
}

/**
 * The spelling the removed `astro-icon` integration used. Accepted for
 * compatibility only and warned about in dev; use `icon`.
 *
 * @deprecated
 */
interface LegacyIconProps extends IconAppearance {
	name: string;
	icon?: never;
}

export type IconProps = CurrentIconProps | LegacyIconProps;

/**
 * Typed as a Svelte 5 `Component` (a function), not `SvelteComponent` (a class
 * instance): `svelte-check` rejects an instance type at every `<Icon>` in a
 * `.svelte` file.
 */
declare const Icon: Component<IconProps>;

export default Icon;
