import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { loadConfigModule } from "./load-config.ts";
import type { ResolvedShironesPaths } from "./types.ts";

/**
 * Plugin-mode font pipeline.
 *
 * In source mode the theme subsets fonts into `src/assets/fonts/.subset/`.
 * That directory lives inside `node_modules` once the theme is installed as a
 * package, which is neither writable-by-contract nor preserved across installs.
 * So in plugin mode we emit subsets into `<projectRoot>/.shirones/fonts/`
 * instead and point Astro's local font provider at absolute paths.
 */

interface FontVariantLike {
	file?: string;
	weight?: string | number;
	style?: string;
	source?: string;
	subset?: string;
	unicodeRange?: string[];
}

interface FontFamilyLike {
	id?: string;
	family?: string;
	role?: string;
	source?: string;
	variants?: FontVariantLike[];
}

interface FontConfigLike {
	mode?: "custom" | "system";
	fontFamilies?: FontFamilyLike[];
	subsetting?: {
		enable?: boolean;
		includeCommon?: boolean;
		includeContent?: boolean;
		includeI18n?: boolean;
		includeConfig?: boolean;
		allowRemoteText?: boolean;
	};
	budget?: { maxFamilyBytes?: number };
}

const COMMON_SYMBOLS =
	"，。！？；：、‘’“”【】《》（）—…·「」『』〔〕｛｝〜～￥$€£%^&*+-*/=<>#@~`|\\_";

export const FONT_OUTPUT_DIRNAME = "fonts";

/** Absolute path of the directory holding generated subsets. */
export function fontCacheDir(paths: ResolvedShironesPaths): string {
	return join(paths.cacheDir, FONT_OUTPUT_DIRNAME);
}

async function walkFiles(dir: string, extensions: string[]): Promise<string[]> {
	if (!existsSync(dir)) return [];
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkFiles(full, extensions)));
		} else if (extensions.includes(extname(entry.name).toLowerCase())) {
			out.push(full);
		}
	}
	return out;
}

async function absorbFile(charSet: Set<string>, file: string): Promise<void> {
	const text = await readFile(file, "utf8");
	for (const ch of text) {
		if (ch.charCodeAt(0) > 31) charSet.add(ch);
	}
}

/**
 * Collect every character that can appear on the rendered site.
 *
 * Scans the *user's* content/config/data plus the package's i18n dictionaries,
 * which is the plugin-mode equivalent of the source-mode text collector.
 */
export async function collectSiteText(
	paths: ResolvedShironesPaths,
	fontConfig: FontConfigLike,
	extraCharacters = "",
): Promise<string> {
	const charSet = new Set<string>();
	const subsetting = fontConfig.subsetting ?? {};

	if (subsetting.includeCommon ?? true) {
		for (let code = 32; code <= 126; code += 1) {
			charSet.add(String.fromCharCode(code));
		}
		for (const ch of COMMON_SYMBOLS) charSet.add(ch);
	}

	if (subsetting.includeContent ?? true) {
		for (const file of await walkFiles(paths.contentDir, [".md", ".mdx"])) {
			await absorbFile(charSet, file);
		}
	}

	if (subsetting.includeI18n ?? true) {
		for (const file of await walkFiles(join(paths.packageSrc, "i18n"), [".ts", ".js"])) {
			await absorbFile(charSet, file);
		}
	}

	if (subsetting.includeConfig ?? true) {
		for (const file of await walkFiles(paths.configDir, [".ts", ".js"])) {
			await absorbFile(charSet, file);
		}
		for (const file of await walkFiles(paths.dataDir, [".ts", ".js", ".json"])) {
			await absorbFile(charSet, file);
		}
	}

	for (const ch of extraCharacters) {
		if (ch.charCodeAt(0) > 31) charSet.add(ch);
	}

	return Array.from(charSet).sort().join("");
}

/** Resolve a configured font file to an absolute path on disk. */
export function resolveFontSource(
	paths: ResolvedShironesPaths,
	file: string,
): string | null {
	const candidates = [
		join(paths.projectRoot, file), // user-supplied font in their own project
		join(paths.packageRoot, file), // font shipped with the package
		join(paths.packageSrc, file.replace(/^src\//, "")),
	];
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export interface SubsetResult {
	/** Map of original config `file` value -> absolute path of the subset file. */
	outputs: Map<string, string>;
}

/**
 * Run the subsetting pipeline. Returns a map used to rewrite the font
 * declarations handed to Astro.
 */
export async function runFontSubsetting(
	paths: ResolvedShironesPaths,
	fontConfig: FontConfigLike,
	extraCharacters: string,
	logger: { info: (m: string) => void; warn: (m: string) => void },
): Promise<SubsetResult> {
	const outputs = new Map<string, string>();

	const localVariants = (fontConfig.fontFamilies ?? [])
		.filter((family) => family.source === "local")
		.flatMap((family) => family.variants ?? [])
		.filter((variant): variant is FontVariantLike & { file: string } =>
			Boolean(variant.file),
		);

	if (localVariants.length === 0) {
		logger.info("no local font variants to subset");
		return { outputs };
	}

	const text = await collectSiteText(paths, fontConfig, extraCharacters);
	if (!text) {
		logger.warn("collected an empty charset; skipping subsetting");
		return { outputs };
	}

	const outDir = fontCacheDir(paths);
	await mkdir(outDir, { recursive: true });
	await writeFile(join(outDir, "charset.txt"), text, "utf8");
	logger.info(`collected ${text.length} unique characters`);

	const { default: subsetFont } = await import("subset-font");
	const maxFamilyBytes = fontConfig.budget?.maxFamilyBytes ?? 4 * 1024 * 1024;

	for (const variant of localVariants) {
		const source = resolveFontSource(paths, variant.file);
		if (!source) {
			throw new Error(
				`[shirones] Source font file not found: ${variant.file}. ` +
					`Place it in your project or point \`fontConfig\` at an existing file.`,
			);
		}

		const ext = extname(variant.file);
		const name = basename(variant.file, ext);
		const outputPath = join(outDir, `${name}.subset.woff2`);
		const tempPath = join(outDir, `${name}.subset.${Date.now()}.tmp`);

		// Reuse an existing subset when the charset has not changed.
		const stamp = join(outDir, `${name}.stamp`);
		if (existsSync(outputPath) && existsSync(stamp)) {
			const previous = await readFile(stamp, "utf8");
			if (previous === text) {
				outputs.set(variant.file, outputPath);
				logger.info(`${name}: reused cached subset`);
				continue;
			}
		}

		const started = Date.now();
		try {
			const buffer = await subsetFont(await readFile(source), text, {
				targetFormat: "woff2",
			});
			await writeFile(tempPath, buffer);

			const size = (await stat(tempPath)).size;
			if (size === 0) throw new Error("generated subset is empty");
			if (size > maxFamilyBytes) {
				throw new Error(
					`subset ${name}.subset.woff2 (${size} bytes) exceeds the family budget ` +
						`(${maxFamilyBytes} bytes)`,
				);
			}

			await rename(tempPath, outputPath);
			await writeFile(stamp, text, "utf8");

			const originalSize = (await stat(source)).size;
			const saved = (((originalSize - size) / originalSize) * 100).toFixed(1);
			logger.info(
				`${name}: ${(originalSize / 1024 / 1024).toFixed(2)} MB -> ` +
					`${(size / 1024).toFixed(1)} KB (-${saved}%) in ${Date.now() - started}ms`,
			);
			outputs.set(variant.file, outputPath);
		} catch (error) {
			await rm(tempPath, { force: true }).catch(() => undefined);
			throw error;
		}
	}

	return { outputs };
}

/**
 * Build the `fonts` array for `astro.config`, mirroring the logic the source
 * template keeps in `astro.config.mjs` but with package-aware path resolution.
 */
export async function buildFontDeclarations(
	paths: ResolvedShironesPaths,
	options: { subset: boolean; extraCharacters: string },
	logger: { info: (m: string) => void; warn: (m: string) => void },
	registryRef?: { overrides: Map<string, string> },
): Promise<unknown[]> {
	const configModule = await loadConfigModule(paths, "fontConfig", registryRef);
	const fontConfig = configModule.fontConfig as FontConfigLike | undefined;
	const resolvedFontOptions = configModule.resolvedFontOptions as
		| {
				mode?: string;
				roles: Record<
					string,
					{
						family?: string;
						cssVariable: string;
						display?: string;
						variants: FontVariantLike[];
					}
				>;
		  }
		| undefined;

	if (!fontConfig || !resolvedFontOptions) return [];
	if (resolvedFontOptions.mode !== "custom") return [];

	const shouldSubset = options.subset && (fontConfig.subsetting?.enable ?? false);
	let subsets = new Map<string, string>();
	if (shouldSubset) {
		({ outputs: subsets } = await runFontSubsetting(
			paths,
			fontConfig,
			options.extraCharacters,
			logger,
		));
	}

	const { fontProviders } = await import("astro/config");
	const declarations: unknown[] = [];

	for (const role of ["body", "cjk", "mono"]) {
		const resolvedRole = resolvedFontOptions.roles[role];
		if (!resolvedRole?.family) continue;

		// `body` and `cjk` compose one sans stack, so Astro's automatic fallback
		// metrics must stay off to avoid double-declaring fallback families.
		const isCompositeSans = role === "body" || role === "cjk";
		const fallbackOpts = isCompositeSans
			? { fallbacks: [], optimizedFallbacks: false }
			: {};

		const localVariants = resolvedRole.variants.filter((v) => v.source === "local");

		if (localVariants.length > 0) {
			declarations.push({
				provider: fontProviders.local(),
				name: resolvedRole.family,
				cssVariable: resolvedRole.cssVariable,
				options: {
					variants: localVariants.map((variant) => {
						const file = variant.file as string;
						const src = subsets.get(file) ?? resolveFontSource(paths, file);
						if (!src) {
							throw new Error(`[shirones] Missing font file for "${file}".`);
						}
						return {
							src: [src],
							weight: variant.weight,
							style: variant.style,
							display: resolvedRole.display,
							...(variant.subset ? { subset: variant.subset } : {}),
							...(variant.unicodeRange ? { unicodeRange: variant.unicodeRange } : {}),
						};
					}),
				},
				...fallbackOpts,
			});
			continue;
		}

		const fontsourceVariants = resolvedRole.variants.filter(
			(v) => v.source === "fontsource",
		);
		if (fontsourceVariants.length > 0) {
			declarations.push({
				provider: fontProviders.fontsource(),
				name: resolvedRole.family,
				cssVariable: resolvedRole.cssVariable,
				...fallbackOpts,
			});
		}
	}

	return declarations;
}
