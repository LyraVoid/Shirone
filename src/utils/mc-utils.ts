/**
 * Material 3 dynamic color engine (Shirone).
 *
 * Thin wrapper over Google's `@material/material-color-utilities` (HCT color
 * space) — the same algorithm family FolkPatch's MaterialKolor wraps — so both
 * the MD3 (2021) and M3 Expressive (2025) design specs and all 9 palette styles
 * (TonalSpot, Vibrant, Content, Expressive, …) resolve to real HCT tonal
 * palettes.
 *
 * The seed is derived from the existing `--hue` (0-360) so the hue slider keeps
 * working as before; the engine returns concrete hex values for every M3 role.
 */
import {
	type DynamicColor,
	type DynamicScheme,
	Hct,
	type MaterialDynamicColors,
	SchemeContent,
	SchemeExpressive,
	SchemeFidelity,
	SchemeFruitSalad,
	SchemeMonochrome,
	SchemeNeutral,
	SchemeRainbow,
	SchemeTonalSpot,
	SchemeVibrant,
} from "@material/material-color-utilities";

/** Palette style — mirrors `com.materialkolor.PaletteStyle`. */
export const MC_STYLES = [
	"tonalSpot",
	"vibrant",
	"content",
	"expressive",
	"rainbow",
	"fruitSalad",
	"monochrome",
	"neutral",
	"fidelity",
] as const;
export type McStyle = (typeof MC_STYLES)[number];

/** Design spec version — mirrors `ColorSpec.SpecVersion`. */
export const MC_SPECS = ["2021", "2025"] as const;
export type McSpec = (typeof MC_SPECS)[number];

/** Hue used by the dynamic engine's seed (mid-tone, medium chroma). */
const SEED_CHROMA = 60;
const SEED_TONE = 50;

/**
 * Build a seed ARGB from a hue (0-360). Uses a fixed chroma/tone so every hue
 * produces a usable, vibrant-but-not-muddy seed color.
 */
export function seedFromHue(hue: number): number {
	return Hct.from(hue, SEED_CHROMA, SEED_TONE).toInt();
}

/** Map every M3/M3E color role to its DynamicColor resolver. */
const roleMap: Record<string, DynamicColor | undefined> = {
	primary: undefined,
	onPrimary: undefined,
	primaryContainer: undefined,
	onPrimaryContainer: undefined,
	inversePrimary: undefined,
	primaryFixed: undefined,
	primaryFixedDim: undefined,
	onPrimaryFixed: undefined,
	onPrimaryFixedVariant: undefined,
	secondary: undefined,
	onSecondary: undefined,
	secondaryContainer: undefined,
	onSecondaryContainer: undefined,
	secondaryFixed: undefined,
	secondaryFixedDim: undefined,
	onSecondaryFixed: undefined,
	onSecondaryFixedVariant: undefined,
	tertiary: undefined,
	onTertiary: undefined,
	tertiaryContainer: undefined,
	onTertiaryContainer: undefined,
	tertiaryFixed: undefined,
	tertiaryFixedDim: undefined,
	onTertiaryFixed: undefined,
	onTertiaryFixedVariant: undefined,
	error: undefined,
	onError: undefined,
	errorContainer: undefined,
	onErrorContainer: undefined,
	surface: undefined,
	surfaceDim: undefined,
	surfaceBright: undefined,
	surfaceContainerLowest: undefined,
	surfaceContainerLow: undefined,
	surfaceContainer: undefined,
	surfaceContainerHigh: undefined,
	surfaceContainerHighest: undefined,
	onSurface: undefined,
	surfaceVariant: undefined,
	onSurfaceVariant: undefined,
	outline: undefined,
	outlineVariant: undefined,
	inverseSurface: undefined,
	inverseOnSurface: undefined,
	shadow: undefined,
	scrim: undefined,
	surfaceTint: undefined,
	primaryDim: undefined,
	secondaryDim: undefined,
	tertiaryDim: undefined,
	errorDim: undefined,
};

function initRoleMap(colors: MaterialDynamicColors) {
	roleMap.primary = colors.primary();
	roleMap.onPrimary = colors.onPrimary();
	roleMap.primaryContainer = colors.primaryContainer();
	roleMap.onPrimaryContainer = colors.onPrimaryContainer();
	roleMap.inversePrimary = colors.inversePrimary();
	roleMap.primaryFixed = colors.primaryFixed();
	roleMap.primaryFixedDim = colors.primaryFixedDim();
	roleMap.onPrimaryFixed = colors.onPrimaryFixed();
	roleMap.onPrimaryFixedVariant = colors.onPrimaryFixedVariant();
	roleMap.secondary = colors.secondary();
	roleMap.onSecondary = colors.onSecondary();
	roleMap.secondaryContainer = colors.secondaryContainer();
	roleMap.onSecondaryContainer = colors.onSecondaryContainer();
	roleMap.secondaryFixed = colors.secondaryFixed();
	roleMap.secondaryFixedDim = colors.secondaryFixedDim();
	roleMap.onSecondaryFixed = colors.onSecondaryFixed();
	roleMap.onSecondaryFixedVariant = colors.onSecondaryFixedVariant();
	roleMap.tertiary = colors.tertiary();
	roleMap.onTertiary = colors.onTertiary();
	roleMap.tertiaryContainer = colors.tertiaryContainer();
	roleMap.onTertiaryContainer = colors.onTertiaryContainer();
	roleMap.tertiaryFixed = colors.tertiaryFixed();
	roleMap.tertiaryFixedDim = colors.tertiaryFixedDim();
	roleMap.onTertiaryFixed = colors.onTertiaryFixed();
	roleMap.onTertiaryFixedVariant = colors.onTertiaryFixedVariant();
	roleMap.error = colors.error();
	roleMap.onError = colors.onError();
	roleMap.errorContainer = colors.errorContainer();
	roleMap.onErrorContainer = colors.onErrorContainer();
	roleMap.surface = colors.surface();
	roleMap.surfaceDim = colors.surfaceDim();
	roleMap.surfaceBright = colors.surfaceBright();
	roleMap.surfaceContainerLowest = colors.surfaceContainerLowest();
	roleMap.surfaceContainerLow = colors.surfaceContainerLow();
	roleMap.surfaceContainer = colors.surfaceContainer();
	roleMap.surfaceContainerHigh = colors.surfaceContainerHigh();
	roleMap.surfaceContainerHighest = colors.surfaceContainerHighest();
	roleMap.onSurface = colors.onSurface();
	roleMap.surfaceVariant = colors.surfaceVariant();
	roleMap.onSurfaceVariant = colors.onSurfaceVariant();
	roleMap.outline = colors.outline();
	roleMap.outlineVariant = colors.outlineVariant();
	roleMap.inverseSurface = colors.inverseSurface();
	roleMap.inverseOnSurface = colors.inverseOnSurface();
	roleMap.shadow = colors.shadow();
	roleMap.scrim = colors.scrim();
	roleMap.surfaceTint = colors.surfaceTint();
	roleMap.primaryDim = colors.primaryDim();
	roleMap.secondaryDim = colors.secondaryDim();
	roleMap.tertiaryDim = colors.tertiaryDim();
	roleMap.errorDim = colors.errorDim();
}

/** Build the DynamicScheme for a style. */
function buildScheme(
	style: McStyle,
	isDark: boolean,
	seed: number,
	spec: McSpec,
): DynamicScheme {
	const hct = Hct.fromInt(seed);
	switch (style) {
		case "content":
			return new SchemeContent(hct, isDark, 0, spec);
		case "expressive":
			return new SchemeExpressive(hct, isDark, 0, spec);
		case "fidelity":
			return new SchemeFidelity(hct, isDark, 0, spec);
		case "fruitSalad":
			return new SchemeFruitSalad(hct, isDark, 0, spec);
		case "monochrome":
			return new SchemeMonochrome(hct, isDark, 0, spec);
		case "neutral":
			return new SchemeNeutral(hct, isDark, 0, spec);
		case "rainbow":
			return new SchemeRainbow(hct, isDark, 0, spec);
		case "vibrant":
			return new SchemeVibrant(hct, isDark, 0, spec);
		default:
			return new SchemeTonalSpot(hct, isDark, 0, spec);
	}
}

function argbToHex(argb: number): string {
	return `#${[16, 8, 0]
		.map((shift) => ((argb >> shift) & 0xff).toString(16).padStart(2, "0"))
		.join("")}`;
}

export type McScheme = Record<string, string | null>;

/**
 * Resolve every M3/M3E color role to hex for a given seed hue, style, spec and
 * light/dark mode.
 *
 * 关于 spec（2021 vs 2025）：在 @material/material-color-utilities@0.4.0 中
 * `MaterialDynamicColors.colorSpec` 是静态属性、模块加载时固定为 2025 版委托
 * （material_dynamic_colors.js:295），因此**所有角色（含 `*Dim`/`*Fixed`）
 * 在 2021 与 2025 下都会解析出值**；2021/2025 的实际差异仅在调色板派生层
 * （DynamicSchemePalettesDelegateImpl2021 vs 2025），不影响角色集。
 * 仅当角色的 DynamicColor resolver 为 undefined 时，才返回 null（防御性保留）。
 */
export function resolveScheme(
	hue: number,
	isDark: boolean,
	style: McStyle,
	spec: McSpec,
): McScheme {
	const scheme = buildScheme(style, isDark, seedFromHue(hue), spec);
	initRoleMap(scheme.colors);
	const out: McScheme = {};
	for (const name of Object.keys(roleMap)) {
		const dc = roleMap[name];
		if (!dc) {
			out[name] = null;
			continue;
		}
		const argb = dc.getArgb(scheme);
		out[name] = argbToHex(argb);
	}
	return out;
}
