/**
 * Moment thumbnail generation.
 *
 * Moments pages show a downscaled copy of each image; the originals stay where
 * they are and the site serves the thumbnails. Astro copies `public/` verbatim,
 * so nothing here participates in module resolution — the only ordering
 * requirement is that it finishes before the copy.
 *
 * Freshness is decided by hashing the source image, not by mtime: every CI
 * checkout (and every `pnpm content:sync` materialisation) writes new mtimes,
 * so an mtime comparison would miss on every run and regenerate the full set
 * each time. The digest also makes an unchanged re-run a no-op, which is what
 * makes it affordable to call this on every build.
 */

import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { CACHE_DIR_NAME } from "../../resolve/paths.ts";

const WIDTHS = [192, 384, 640];
const SUPPORTED_EXTENSIONS = new Set([
	".avif",
	".jpeg",
	".jpg",
	".png",
	".webp",
]);

export interface MomentThumbnailOptions {
	/** Project root; sources and outputs are resolved beneath it. */
	projectRoot: string;
	/** Where moment images live, relative to `projectRoot`. */
	sourceDir?: string;
	/** Where thumbnails are written, relative to `projectRoot`. */
	outputDir?: string;
	/**
	 * Remove existing thumbnails that no source image produces. Defaults to
	 * `true` so dev and build drop stale outputs. `content:clean` passes
	 * `false`: it treats thumbnails as exempt build-time artifacts and must
	 * not delete them just because the repo has no moment images.
	 */
	prune?: boolean;
	/**
	 * Where the digest cache lives. Defaults to a dotfile outside the output
	 * directory: everything under `public/` is copied verbatim into `dist/`
	 * and served as-is, so a cache written there is published.
	 */
	cachePath?: string;
}

async function collectImages(directory: string): Promise<string[]> {
	let entries: Dirent[];
	try {
		entries = await fs.readdir(directory, { withFileTypes: true });
	} catch {
		// A project may have no moment images at all; a missing directory is fine.
		return [];
	}
	const images: string[] = [];
	for (const entry of entries) {
		const absolutePath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			images.push(...(await collectImages(absolutePath)));
		} else if (
			SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
		) {
			images.push(absolutePath);
		}
	}
	return images;
}

async function readCache(cachePath: string): Promise<Record<string, string>> {
	try {
		const parsed = JSON.parse(await fs.readFile(cachePath, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, string>)
			: {};
	} catch {
		return {};
	}
}

async function hashFile(filePath: string): Promise<string> {
	return createHash("sha256")
		.update(await fs.readFile(filePath))
		.digest("hex");
}

async function hasUsableOutput(outputPath: string): Promise<boolean> {
	try {
		return (await fs.stat(outputPath)).size > 0;
	} catch {
		return false;
	}
}

export interface MomentThumbnailResult {
	generated: number;
	removed: number;
	total: number;
}

/**
 * Regenerate thumbnails for every image under the source directory and prune
 * outputs whose source is gone.
 *
 * The cache is keyed by content digest, so this is cheap to call repeatedly and
 * safe to run on every build.
 */
export async function generateMomentThumbnails({
	projectRoot,
	sourceDir = "public/images/moments",
	outputDir = "public/assets/moments/thumbnails",
	prune = true,
	cachePath: cachePathOption,
}: MomentThumbnailOptions): Promise<MomentThumbnailResult> {
	const sourceRoot = path.resolve(projectRoot, sourceDir);
	const outputRoot = path.resolve(projectRoot, outputDir);
	// Never inside `outputRoot`: that directory is published verbatim, so a
	// cache file there would be served at a guessable URL and would disclose
	// the content directory's shape along with each image's digest.
	const cachePath =
		cachePathOption ??
		path.join(projectRoot, CACHE_DIR_NAME, "moment-thumbnails.json");
	await fs.mkdir(path.dirname(cachePath), { recursive: true });

	// Repositories generated before the cache moved still carry the old file
	// inside `public/`, where the next build would copy it into `dist/` and
	// publish it. Drop it on sight.
	const legacyCache = path.join(outputRoot, ".cache.json");
	if (legacyCache !== cachePath && existsSync(legacyCache)) {
		await fs.rm(legacyCache, { force: true });
	}

	const images = await collectImages(sourceRoot);
	const previousCache = await readCache(cachePath);
	const nextCache: Record<string, string> = {};
	const expectedOutputs = new Set<string>();
	let generated = 0;

	for (const sourcePath of images) {
		const relativePath = path.relative(sourceRoot, sourcePath);
		const cacheKey = relativePath.split(path.sep).join("/");
		const digest = await hashFile(sourcePath);
		const parsed = path.parse(relativePath);

		for (const width of WIDTHS) {
			const outputPath = path.join(
				outputRoot,
				parsed.dir,
				`${parsed.name}-${width}.webp`,
			);
			expectedOutputs.add(path.resolve(outputPath).toLowerCase());
			if (
				previousCache[cacheKey] === digest &&
				(await hasUsableOutput(outputPath))
			) {
				continue;
			}
			await fs.mkdir(path.dirname(outputPath), { recursive: true });
			await sharp(sourcePath)
				.rotate()
				.resize({ width, withoutEnlargement: true })
				.webp({ quality: 64, effort: 5, smartSubsample: true })
				.toFile(outputPath);
			generated += 1;
		}

		nextCache[cacheKey] = digest;
	}

	await fs.mkdir(outputRoot, { recursive: true });
	let removed = 0;
	// Pruning is only meaningful when the sources were actually read. A
	// project with a custom content root has no `public/images/moments`, and
	// treating "no sources" as "no thumbnails wanted" would delete every
	// existing thumbnail on each dev/build.
	const canPrune = prune && existsSync(sourceRoot);
	if (canPrune) {
		for (const outputPath of await collectImages(outputRoot)) {
			if (expectedOutputs.has(path.resolve(outputPath).toLowerCase())) continue;
			await fs.unlink(outputPath);
			removed += 1;
		}
	}

	await fs.writeFile(cachePath, `${JSON.stringify(nextCache, null, 2)}\n`);

	return { generated, removed, total: images.length };
}
