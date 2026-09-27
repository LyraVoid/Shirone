import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvedFontOptions } from "../../src/config/fontConfig.ts";
import { siteConfig } from "../../src/config/siteConfig.ts";
import { resolveFontAssetPath } from "./asset-path.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const dist = join(projectRoot, "dist");
const maxTotalBytes = Number(
	process.env.FONT_MAX_TOTAL_BYTES ?? resolvedFontOptions.budget.maxTotalBytes,
);
const maxFamilyBytes = Number(
	process.env.FONT_MAX_FAMILY_BYTES ??
		resolvedFontOptions.budget.maxFamilyBytes,
);

async function walk(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walk(path)));
		} else {
			files.push(path);
		}
	}
	return files;
}

function resolveAssetPath(reference) {
	const relative = resolveFontAssetPath(reference, siteConfig.base ?? "/");
	return join(dist, ...relative.split("/"));
}

try {
	const allFiles = await walk(dist);
	const textFiles = allFiles.filter((file) =>
		[".html", ".css"].includes(extname(file).toLowerCase()),
	);

	const referencedFonts = new Set();
	const remoteUrls = [];
	const rawFonts = [];

	for (const file of textFiles) {
		const content = await readFile(file, "utf8");
		const urlMatches = content.matchAll(
			/url\(\s*(?:['"])?([^'")]+)(?:['"])?\s*\)/gi,
		);
		for (const match of urlMatches) {
			const rawUrl = match[1].trim();
			if (!/\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(rawUrl)) continue;

			// Exclude KaTeX math formula fonts
			if (/[/\\]KaTeX_[^/\\]+\.(?:woff2?|ttf|otf)/i.test(rawUrl)) continue;

			if (/^https?:\/\//i.test(rawUrl)) {
				remoteUrls.push({ file, rawUrl });
				continue;
			}

			// Reject raw unsubsetted TTF/OTF in production build
			if (/\.(?:ttf|otf)(?:[?#]|$)/i.test(rawUrl)) {
				rawFonts.push({ file, rawUrl });
				continue;
			}

			const diskPath = resolveAssetPath(rawUrl);
			referencedFonts.add(diskPath);
		}
	}

	if (remoteUrls.length > 0) {
		throw new Error(
			`production CSS/HTML contains forbidden remote font URLs:\n${remoteUrls.map((r) => `  - ${r.file}: ${r.rawUrl}`).join("\n")}`,
		);
	}

	if (rawFonts.length > 0) {
		throw new Error(
			`production CSS/HTML references uncompressed raw font files (.ttf/.otf):\n${rawFonts.map((r) => `  - ${r.file}: ${r.rawUrl}`).join("\n")}\nOnly optimized .woff2 fonts are permitted in production.`,
		);
	}

	// Double-insurance: verify no uncompressed raw font files exist anywhere on disk in dist/ (except KaTeX)
	const rawFontsOnDisk = allFiles.filter((file) => {
		const ext = extname(file).toLowerCase();
		if (ext !== ".ttf" && ext !== ".otf") return false;
		if (/[/\\]KaTeX_[^/\\]+\.(?:ttf|otf)/i.test(file)) return false;
		return true;
	});

	if (rawFontsOnDisk.length > 0) {
		throw new Error(
			`production dist/ contains uncompressed raw font files on disk:\n${rawFontsOnDisk.map((f) => `  - ${f}`).join("\n")}\nOnly optimized .woff2 fonts are permitted in dist/.`,
		);
	}

	let totalBytes = 0;
	const assetDetails = [];

	for (const fontPath of referencedFonts) {
		try {
			const size = (await stat(fontPath)).size;
			totalBytes += size;
			const name = basename(fontPath);
			assetDetails.push({ name, size, path: fontPath });

			if (size > maxFamilyBytes) {
				throw new Error(
					`font asset ${name} (${(size / 1024 / 1024).toFixed(2)} MB, ${size} B) exceeds max family budget limit of ${(maxFamilyBytes / 1024 / 1024).toFixed(2)} MB (${maxFamilyBytes} B)`,
				);
			}
		} catch (error) {
			if (error?.code === "ENOENT") {
				throw new Error(`referenced font asset not found on disk: ${fontPath}`);
			}
			throw error;
		}
	}

	if (totalBytes > maxTotalBytes) {
		throw new Error(
			`referenced custom font assets total ${totalBytes} bytes, exceeding total budget limit of ${maxTotalBytes} bytes`,
		);
	}

	console.log(
		`[fonts:check] ✓ Passed! ${referencedFonts.size} custom font assets referenced (${(totalBytes / 1024).toFixed(1)} KB / ${(maxTotalBytes / 1024).toFixed(1)} KB budget):`,
	);
	for (const asset of assetDetails) {
		console.log(`  - ${asset.name}: ${(asset.size / 1024).toFixed(1)} KB`);
	}
} catch (error) {
	if (error?.code === "ENOENT") {
		console.error(
			"fonts:check requires a production dist/ directory; run pnpm.cmd build first",
		);
	} else {
		console.error(error instanceof Error ? error.message : error);
	}
	process.exitCode = 1;
}
