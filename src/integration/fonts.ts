import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { buildMetingUrl } from "../utils/music/meting.ts";
import type { MetingMusicConfig, MusicProvider } from "../types/musicConfig.ts";
import { loadConfigModule } from "./load-config.ts";
import type { ResolvedShironesPaths } from "./types.ts";

/**
 * Font subsetting pipeline for the integration.
 *
 * In plugin (npm package) mode the theme lives inside `node_modules`, which is
 * neither writable-by-contract nor preserved across installs, so subsets are
 * emitted into `<projectRoot>/.shirones/fonts/` and Astro's local font
 * provider is pointed at absolute paths.
 *
 * In in-repo (source) mode the repository's toolchain expects subsets in
 * `src/assets/fonts/.subset/` (see the `.gitignore` entry and
 * `scripts/fonts/check-fonts.mjs`), so the integration keeps writing there —
 * the same location the retired `scripts/fonts/subset-fonts.mjs` build step
 * used to fill.
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
	if (paths.isThemeRepo) {
		// The theme's own repository: the original output location, shared
		// with the repo scripts and `.gitignore`.
		return join(paths.packageRoot, "src/assets/fonts/.subset");
	}
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
		// Generated config-overlay modules (`src/user/user-config.ts` in source
		// mode, the shipped stub in package mode) carry rendered site text
		// (site title, announcements, category labels, ...).
		for (const file of await walkFiles(join(paths.packageSrc, "user"), [
			".ts",
			".js",
		])) {
			await absorbFile(charSet, file);
		}
	}

	for (const ch of extraCharacters) {
		if (ch.charCodeAt(0) > 31) charSet.add(ch);
	}

	return Array.from(charSet).sort().join("");
}

interface MusicConfigLike {
	enable?: boolean;
	provider?: MusicProvider;
	meting?: MetingMusicConfig;
}

const METING_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Shirone/1.0";

/**
 * Mirror of the repo-side text collector's Meting step: when the music module
 * runs in `meting`/`mixed` mode, song titles and artist names only exist on
 * the remote playlist API, so the subset would miss those glyphs entirely.
 *
 * Gated by `fontConfig.subsetting.allowRemoteText`; any failure degrades to a
 * warning — remote text is an enhancement, never a build blocker.
 *
 * `registryRef` carries the user's component/config overrides and only exists
 * in package mode. Source mode has no `shirones/` overlay at all, but that
 * needs no special case here: `paths.configDir` already resolves to the
 * repository's own `src/config` in that mode, so `loadConfigModule` reads the
 * repo's `musicConfig` on its first probe and the package-source fallback it
 * would otherwise take points at the very same directory.
 */
async function collectMetingText(
	paths: ResolvedShironesPaths,
	fontConfig: FontConfigLike,
	logger: { info: (m: string) => void; warn: (m: string) => void },
	registryRef?: { overrides: Map<string, string> },
): Promise<string> {
	if (!(fontConfig.subsetting?.allowRemoteText ?? false)) return "";

	const musicModule = await loadConfigModule(paths, "musicConfig", registryRef);
	const musicConfig = musicModule.musicConfig as MusicConfigLike | undefined;
	if (!musicConfig?.enable) return "";

	const provider = musicConfig.provider ?? "local";
	if (provider !== "meting" && provider !== "mixed") return "";

	const url = buildMetingUrl(musicConfig.meting ?? {});
	if (!url) return "";

	logger.info(`fetching Meting playlist text: ${url}`);
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 8000);
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { "User-Agent": METING_USER_AGENT },
		});
		clearTimeout(timeoutId);

		if (!response.ok) {
			logger.warn(
				`Meting API returned HTTP ${response.status}, skipping remote song text`,
			);
			return "";
		}

		const data = (await response.json()) as unknown;
		if (!Array.isArray(data)) return "";

		let songCount = 0;
		const charSet = new Set<string>();
		for (const song of data) {
			const record = song as { name?: string; title?: string; artist?: string; author?: string };
			const str = `${record.name ?? record.title ?? ""} ${record.artist ?? record.author ?? ""}`;
			if (!str.trim()) continue;
			songCount += 1;
			for (const ch of str) {
				if (ch.charCodeAt(0) > 31) charSet.add(ch);
			}
		}
		logger.info(`collected text from ${songCount} Meting remote songs`);
		return Array.from(charSet).sort().join("");
	} catch (error) {
		logger.warn(
			`failed to fetch Meting playlist text (${(error as Error).message}), continuing with local charset`,
		);
		return "";
	}
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
	registryRef?: { overrides: Map<string, string> },
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
	const metingText = await collectMetingText(paths, fontConfig, logger, registryRef);
	const charset = text + metingText;
	if (!charset) {
		logger.warn("collected an empty charset; skipping subsetting");
		return { outputs };
	}

	const outDir = fontCacheDir(paths);
	await mkdir(outDir, { recursive: true });
	await writeFile(join(outDir, "charset.txt"), charset, "utf8");
	logger.info(`collected ${charset.length} unique characters`);

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
			if (previous === charset) {
				outputs.set(variant.file, outputPath);
				logger.info(`${name}: reused cached subset`);
				continue;
			}
		}

		const started = Date.now();
		try {
			const buffer = await subsetFont(await readFile(source), charset, {
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
			await writeFile(stamp, charset, "utf8");

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
			registryRef,
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
