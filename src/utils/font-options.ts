import {
	FONT_ROLES,
	type FontConfig,
	type FontFamilyDefinition,
	type FontRole,
	type FontVariant,
	type ResolvedFontOptions,
	type ResolvedFontRole,
} from "../types/fontConfig.ts";

/** 字体角色对应的 CSS 变量映射 */
const ROLE_VARIABLES: Record<FontRole, ResolvedFontRole["cssVariable"]> = {
	body: "--font-body",
	cjk: "--font-cjk",
	mono: "--font-mono",
	"mono-cjk": "--font-mono-cjk",
};

/** 系统回退字体栈 */
const SYSTEM_FALLBACKS: Record<FontRole, string> = {
	body: "ui-sans-serif, system-ui, sans-serif",
	cjk: "system-ui, sans-serif",
	mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
	"mono-cjk": "system-ui, sans-serif",
};

// 格式校验正则表达式
const LOCAL_FONT_PATH =
	/^src\/assets\/fonts\/(?!\.)(?!.*\.\.)[^?#[\]]+\.(?:woff2?|ttf|otf)$/i;
const FONTSOURCE_IMPORT =
	/^@fontsource(?:-variable)?\/[a-z0-9@._/-]+(?:\.css)?$/i;
const FAMILY_NAME = /^[\w][\w .'-]*$/u;
const IDENTIFIER = /^[a-z][a-z0-9-]*$/u;
const SUBSET_NAME = /^[a-z][a-z0-9-]*$/u;
const UNICODE_RANGE =
	/^(?:U\+[0-9A-F?]+(?:-[0-9A-F]+)?)(?:\s*,\s*U\+[0-9A-F?]+(?:-[0-9A-F]+)?)*$/iu;

/** 抛出带字段路径的字体配置错误 */
function fail(path: string, message: string): never {
	throw new Error(`Invalid font configuration at ${path}: ${message}`);
}

/** 校验正有限数 */
function assertFinitePositive(value: number, path: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		fail(path, "must be a positive finite number");
	}
}

/** 校验字体字重（单数字 1-1000 或升序范围字符串 "100 800"） */
function validateWeight(weight: FontVariant["weight"], path: string): void {
	if (typeof weight === "number") {
		if (!Number.isInteger(weight) || weight < 1 || weight > 1000) {
			fail(path, "must be an integer between 1 and 1000");
		}
		return;
	}

	const parts = weight.split(" ");
	if (
		parts.length !== 2 ||
		parts.some((part) => !/^\d+$/.test(part)) ||
		Number(parts[0]) < 1 ||
		Number(parts[1]) > 1000 ||
		Number(parts[0]) > Number(parts[1])
	) {
		fail(
			path,
			"must be a single weight or an ascending range between 1 and 1000",
		);
	}
}

/** 校验单个字体变体 */
function validateVariant(
	variant: FontVariant,
	definition: FontFamilyDefinition,
	index: number,
): void {
	const path = `fontFamilies[${index}].variants`;
	if (typeof variant.file !== "string" || variant.file.length === 0) {
		fail(`${path}.file`, "must be a non-empty path");
	}
	if (definition.source === "local" && !LOCAL_FONT_PATH.test(variant.file)) {
		fail(
			`${path}.file`,
			"local fonts must be font files under src/assets/fonts (.woff2, .woff, .ttf, .otf)",
		);
	}
	if (
		definition.source === "fontsource" &&
		!FONTSOURCE_IMPORT.test(variant.file)
	) {
		fail(`${path}.file`, "must be an audited @fontsource import specifier");
	}
	validateWeight(variant.weight, `${path}[${index}].weight`);
	if (variant.style !== "normal" && variant.style !== "italic") {
		fail(`${path}[${index}].style`, "must be normal or italic");
	}
	if (variant.subset !== undefined && !SUBSET_NAME.test(variant.subset)) {
		fail(
			`${path}[${index}].subset`,
			"must contain lowercase letters, numbers, and hyphens",
		);
	}
	if (
		variant.unicodeRange !== undefined &&
		!UNICODE_RANGE.test(variant.unicodeRange)
	) {
		fail(
			`${path}[${index}].unicodeRange`,
			"must be a valid comma-separated Unicode range",
		);
	}
}

/** 校验单个字体族配置 */
function validateFamily(definition: FontFamilyDefinition, index: number): void {
	const path = `fontFamilies[${index}]`;
	if (!IDENTIFIER.test(definition.id))
		fail(`${path}.id`, "must be a stable kebab-case identifier");
	if (!FAMILY_NAME.test(definition.family))
		fail(`${path}.family`, "contains unsupported CSS family characters");
	if (!(FONT_ROLES as readonly string[]).includes(definition.role))
		fail(`${path}.role`, `must be ${FONT_ROLES.join(", ")}`);
	if (!["local", "fontsource"].includes(definition.source))
		fail(`${path}.source`, "must be local or fontsource");
	if (definition.variants.length === 0)
		fail(`${path}.variants`, "must contain at least one variant");
	if (
		definition.fallback.length === 0 ||
		definition.fallback.some((item) => !FAMILY_NAME.test(item))
	) {
		fail(`${path}.fallback`, "must contain at least one valid system family");
	}
	if (!["swap", "optional", "block"].includes(definition.display))
		fail(`${path}.display`, "must be swap, optional, or block");
	if (typeof definition.preload !== "boolean")
		fail(`${path}.preload`, "must be a boolean");
	if (definition.licenseFile?.includes("..")) {
		fail(`${path}.licenseFile`, "must not escape the repository");
	}
	definition.variants.forEach((variant, variantIndex) => {
		validateVariant(variant, definition, variantIndex);
	});
}

/** 构造空角色回退对象 */
function emptyRole(role: FontRole): ResolvedFontRole {
	return {
		cssVariable: ROLE_VARIABLES[role],
		family: "",
		fallback: SYSTEM_FALLBACKS[role],
		variants: [],
		display: role === "cjk" ? "optional" : "swap",
		preload: false,
	};
}

/**
 * 解析并校验全站字体配置。
 * 纯静态校验，不访问浏览器或外部网络。
 */
export function resolveFontOptions(config: FontConfig): ResolvedFontOptions {
	if (config.mode !== "system" && config.mode !== "custom")
		fail("mode", "must be system or custom");
	if (!Array.isArray(config.fontFamilies))
		fail("fontFamilies", "must be an array");
	if (typeof config.subsetting.allowRemoteText !== "boolean") {
		fail("subsetting.allowRemoteText", "must be a boolean");
	}
	assertFinitePositive(config.budget.maxTotalBytes, "budget.maxTotalBytes");
	assertFinitePositive(config.budget.maxFamilyBytes, "budget.maxFamilyBytes");
	if (config.budget.maxFamilyBytes > config.budget.maxTotalBytes) {
		fail("budget.maxFamilyBytes", "cannot exceed budget.maxTotalBytes");
	}

	const roles = Object.fromEntries(
		FONT_ROLES.map((role) => [role, emptyRole(role)]),
	) as Record<FontRole, ResolvedFontRole>;
	const seenRoles = new Set<FontRole>();

	config.fontFamilies.forEach((definition, index) => {
		validateFamily(definition, index);
		if (seenRoles.has(definition.role))
			fail(
				`fontFamilies[${index}].role`,
				`role ${definition.role} is already defined`,
			);
		seenRoles.add(definition.role);
		if (config.mode === "custom") {
			roles[definition.role] = {
				cssVariable: ROLE_VARIABLES[definition.role],
				family: definition.family,
				fallback: definition.fallback.join(", "),
				variants: definition.variants.map((variant) => ({
					...variant,
					source: definition.source,
				})),
				display: definition.display,
				preload: definition.preload,
			};
		}
	});

	if (
		config.mode === "custom" &&
		roles.body.family === "" &&
		roles.body.variants.length === 0
	) {
		fail(
			"fontFamilies",
			"custom mode requires a body role or an explicit body baseline",
		);
	}

	// A `mono-cjk` supplement turns `mono` into the family-only first link of a
	// composed stack. Astro emits it as `--font-mono-base`; the theme then composes
	// `--font-mono` / `--m3e-font-mono-family` as `mono → mono-cjk (plus its
	// fallbacks) → system mono`.
	if (
		config.mode === "custom" &&
		roles["mono-cjk"].family &&
		roles.mono.family
	) {
		roles.mono.cssVariable = "--font-mono-base";
	}

	return {
		schemaVersion: 1,
		mode: config.mode,
		roles,
		preloadRoles: FONT_ROLES.filter((role) => roles[role].preload),
		subsetting: { ...config.subsetting },
		budget: { ...config.budget },
	};
}

/** 格式化 CSS font-family 字符串（添加双引号与转义） */
export function quoteFontFamily(family: string): string {
	return family ? `"${family.replaceAll('"', '\\"')}"` : "";
}

/**
 * 根据解析后的字体选项生成注入到 HTML `<head>` 的 CSS 变量定义
 */
export function createFontRoleStyle(options: ResolvedFontOptions): string {
	const hasMonoCjk = Boolean(options.roles["mono-cjk"].family);
	const declarations = FONT_ROLES.map((role) => {
		const resolved = options.roles[role];
		if (!resolved.family) return "";
		// Astro's <Font> owns the hashed `--font-mono-cjk`; the inline style only
		// composes it into the mono stack below.
		if (role === "mono-cjk") return "";
		// With a supplement the mono family is the first stack link, not the
		// complete value. Emit the composed alias below so this rule does not
		// depend on stylesheet order.
		if (role === "mono" && hasMonoCjk) return "";
		return `\t--${role === "mono" ? "m3e-font-mono-family" : `font-${role}`}: ${quoteFontFamily(resolved.family)};`;
	}).filter(Boolean);

	if (hasMonoCjk) {
		const monoBase = options.roles.mono.family
			? "var(--font-mono-base)"
			: "var(--m3e-font-mono-fallback)";
		declarations.push(
			`\t--m3e-font-mono-stack: ${monoBase}, var(--font-mono-cjk);`,
			"\t--m3e-font-mono-family: var(--m3e-font-mono-stack);",
			"\t--font-mono: var(--m3e-font-mono-stack);",
		);
	}

	const body = declarations.join("\n");
	return body ? `:root {\n${body}\n}` : "";
}

/** 返回当前模式下实际配置了 family 的字体角色，顺序与 FONT_ROLES 一致 */
export function getConfiguredFontRoles(
	options: ResolvedFontOptions,
): FontRole[] {
	if (options.mode !== "custom") return [];
	return FONT_ROLES.filter((role) => Boolean(options.roles[role].family));
}

/**
 * 提取所有 Fontsource 模式下的 CSS 导入路径列表，供虚拟模块消费
 */
export function getFontsourceImports(options: ResolvedFontOptions): string[] {
	if (options.mode !== "custom") return [];
	return (Object.keys(options.roles) as FontRole[])
		.flatMap((role) => options.roles[role].variants)
		.filter((variant) => variant.source === "fontsource")
		.map((variant) => variant.file);
}

/**
 * 获取指定角色下的本地字体变体列表
 */
export function getLocalFontVariants(
	options: ResolvedFontOptions,
	role: FontRole,
): ResolvedFontOptions["roles"][FontRole]["variants"] {
	return options.roles[role].variants.filter(
		(variant) => variant.source === "local",
	);
}
