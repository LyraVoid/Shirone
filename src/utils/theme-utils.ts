import {
	MC_SPECS,
	MC_STYLES,
	type McScheme,
	type McSpec,
	type McStyle,
	resolveScheme,
} from "@utils/mc-utils";
import { getDefaultSpec, getDefaultStyle, siteConfig } from "@/config";

const STYLE_KEY = "mc-style";
/**
 * 与 setting-utils.ts 的安全包装同语义：浏览器策略阻止存储访问时，
 * 读取返回 null、写入被忽略，主题推导不得被存储异常打断。
 * 本地实现而非复用 setting-utils 包装，避免 theme-utils ↔ setting-utils 循环导入。
 */
function safeGetItem(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSetItem(key: string, value: string): boolean {
	try {
		localStorage.setItem(key, value);
		return true;
	} catch {
		return false;
	}
}

/** 持久化失败时的会话内覆盖：写入被浏览器策略阻止时，用户选择仍要生效。 */
let styleOverride: McStyle | null = null;
let specOverride: McSpec | null = null;

const SPEC_KEY = "mc-spec";

/** CSS custom-property names emitted for each M3/M3E role. */
const ROLE_TO_CSS: Record<string, string> = {
	primary: "--mc-primary",
	onPrimary: "--mc-on-primary",
	primaryContainer: "--mc-primary-container",
	onPrimaryContainer: "--mc-on-primary-container",
	inversePrimary: "--mc-inverse-primary",
	primaryFixed: "--mc-primary-fixed",
	primaryFixedDim: "--mc-primary-fixed-dim",
	onPrimaryFixed: "--mc-on-primary-fixed",
	onPrimaryFixedVariant: "--mc-on-primary-fixed-variant",
	secondary: "--mc-secondary",
	onSecondary: "--mc-on-secondary",
	secondaryContainer: "--mc-secondary-container",
	onSecondaryContainer: "--mc-on-secondary-container",
	secondaryFixed: "--mc-secondary-fixed",
	secondaryFixedDim: "--mc-secondary-fixed-dim",
	onSecondaryFixed: "--mc-on-secondary-fixed",
	onSecondaryFixedVariant: "--mc-on-secondary-fixed-variant",
	tertiary: "--mc-tertiary",
	onTertiary: "--mc-on-tertiary",
	tertiaryContainer: "--mc-tertiary-container",
	onTertiaryContainer: "--mc-on-tertiary-container",
	tertiaryFixed: "--mc-tertiary-fixed",
	tertiaryFixedDim: "--mc-tertiary-fixed-dim",
	onTertiaryFixed: "--mc-on-tertiary-fixed",
	onTertiaryFixedVariant: "--mc-on-tertiary-fixed-variant",
	error: "--mc-error",
	onError: "--mc-on-error",
	errorContainer: "--mc-error-container",
	onErrorContainer: "--mc-on-error-container",
	surface: "--mc-surface",
	surfaceDim: "--mc-surface-dim",
	surfaceBright: "--mc-surface-bright",
	surfaceContainerLowest: "--mc-surface-container-lowest",
	surfaceContainerLow: "--mc-surface-container-low",
	surfaceContainer: "--mc-surface-container",
	surfaceContainerHigh: "--mc-surface-container-high",
	surfaceContainerHighest: "--mc-surface-container-highest",
	onSurface: "--mc-on-surface",
	surfaceVariant: "--mc-surface-variant",
	onSurfaceVariant: "--mc-on-surface-variant",
	outline: "--mc-outline",
	outlineVariant: "--mc-outline-variant",
	inverseSurface: "--mc-inverse-surface",
	inverseOnSurface: "--mc-inverse-on-surface",
	shadow: "--mc-shadow",
	scrim: "--mc-scrim",
	surfaceTint: "--mc-surface-tint",
	primaryDim: "--mc-primary-dim",
	secondaryDim: "--mc-secondary-dim",
	tertiaryDim: "--mc-tertiary-dim",
	errorDim: "--mc-error-dim",
};

export function isMcStyle(v: string): v is McStyle {
	return (MC_STYLES as readonly string[]).includes(v);
}

export function isMcSpec(v: string): v is McSpec {
	return (MC_SPECS as readonly string[]).includes(v);
}

export function getStyle(): McStyle {
	const stored = styleOverride ?? safeGetItem(STYLE_KEY);
	return stored && isMcStyle(stored) ? stored : (getDefaultStyle() as McStyle);
}

export function getSpec(): McSpec {
	const stored = specOverride ?? safeGetItem(SPEC_KEY);
	return stored && isMcSpec(stored) ? stored : (getDefaultSpec() as McSpec);
}

export function setStyle(style: McStyle): void {
	styleOverride = safeSetItem(STYLE_KEY, style) ? null : style;
	applyCurrentScheme();
}

export function setSpec(spec: McSpec): void {
	specOverride = safeSetItem(SPEC_KEY, spec) ? null : spec;
	applyCurrentScheme();
}

/**
 * Serialize the site-default light and dark schemes as static CSS so the first
 * paint already carries them and visitors on the defaults never run the engine.
 */
export function createDefaultSchemeStyle(): string {
	const { hue, style, spec } = siteConfig.themeColor;
	const block = (isDark: boolean) => {
		const scheme = resolveScheme(hue, isDark, style as McStyle, spec as McSpec);
		return Object.entries(ROLE_TO_CSS)
			.filter(([role]) => scheme[role])
			.map(([role, cssVar]) => `${cssVar}:${scheme[role]}`)
			.join(";");
	};
	return `:root{${block(false)}}:root.dark{${block(true)}}`;
}

let appliedSchemeKey = "";

/**
 * Recompute and apply the dynamic M3/M3E scheme for the current hue, style,
 * spec and light/dark mode, writing concrete hex values onto CSS custom
 * properties on `:root`. The site-default scheme is shipped as static CSS by
 * `createDefaultSchemeStyle()`, so for it the inline overrides are cleared
 * instead; unchanged inputs are skipped to avoid redundant style recalcs.
 */
export function applyCurrentScheme(): void {
	const root = document.querySelector(":root") as HTMLElement | null;
	if (!root) return;

	const hue = Number.parseInt(
		root.style.getPropertyValue("--hue") || "250",
		10,
	);
	const isDark = root.classList.contains("dark");
	const style = getStyle();
	const spec = getSpec();
	const key = `${hue}|${isDark}|${style}|${spec}`;
	if (key === appliedSchemeKey) return;
	appliedSchemeKey = key;

	const isDefault =
		hue === siteConfig.themeColor.hue &&
		style === getDefaultStyle() &&
		spec === getDefaultSpec();
	const scheme: McScheme = isDefault
		? {}
		: resolveScheme(hue, isDark, style, spec);

	for (const [role, cssVar] of Object.entries(ROLE_TO_CSS)) {
		const value = scheme[role];
		if (value) {
			root.style.setProperty(cssVar, value);
		} else {
			root.style.removeProperty(cssVar);
		}
	}
}
