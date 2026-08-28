import fs from "node:fs/promises";
import path from "node:path";

/**
 * Content repository path contract:
 * - The content repository uses repository-relative paths such as
 *   `data/assets/anime/foo.webp` and `moments/images/foo.webp`.
 * - The theme repository keeps its existing source/public paths.
 * - Only this module translates between the two contracts.
 */

export const CONTENT_MAPPINGS = [
	{
		source: "albums",
		target: "public/images/albums",
		kind: "tree",
		excludeFiles: ["AGENTS.md", "README.md"],
	},
	{
		source: "moments",
		target: "src/content/moments",
		kind: "text-tree",
		excludeDirectories: ["images"],
	},
	{
		source: "moments/images",
		target: "public/images/moments",
		kind: "tree",
	},
	{ source: "posts", target: "src/content/posts", kind: "text-tree" },
	{ source: "spec", target: "src/content/spec", kind: "text-tree" },
	{ source: "data", target: "src/data", kind: "data-files" },
	{
		source: "data/assets/banner",
		target: "src/assets/images/banner",
		kind: "tree",
	},
	{
		source: "data/assets/banner",
		target: "public/assets/banner",
		kind: "tree",
		// This is a compatibility mirror only; the source-to-content export
		// uses src/assets/images/banner as the canonical source.
		directions: ["content-to-source"],
	},
	{
		source: "data/assets/music/cover",
		target: "src/assets/images/music",
		kind: "tree",
	},
	{
		source: "data/assets/music/url",
		target: "public/assets/music/url",
		kind: "tree",
	},
	{
		source: "data/assets/anime",
		target: "public/assets/anime",
		kind: "tree",
	},
	{
		source: "data/assets/projects",
		target: "public/assets/projects",
		kind: "tree",
	},
];

const COPYABLE_EXTENSIONS = new Set([
	".avif",
	".bmp",
	".gif",
	".jpeg",
	".jpg",
	".json",
	".md",
	".mdx",
	".mp3",
	".png",
	".svg",
	".tif",
	".tiff",
	".ts",
	".webp",
	".yml",
	".yaml",
]);

const TRANSFORMABLE_TEXT_EXTENSIONS = new Set([".md", ".mdx"]);

const PATH_PAIRS = [
	["/images/albums/", "albums/"],
	["/images/moments/", "moments/images/"],
	["/assets/music/url/", "data/assets/music/url/"],
	["/assets/anime/", "data/assets/anime/"],
	["/assets/projects/", "data/assets/projects/"],
	["assets/images/music/", "data/assets/music/cover/"],
	["assets/images/banner/", "data/assets/banner/"],
];

function isPathBoundary(value, index) {
	if (index === 0) return true;
	return /[\s("'`:=([\]]/.test(value[index - 1]);
}

function replaceExternalPath(text, external, source) {
	let result = "";
	let cursor = 0;
	let index = text.indexOf(external, cursor);
	while (index !== -1) {
		if (isPathBoundary(text, index)) {
			result += text.slice(cursor, index) + source;
			cursor = index + external.length;
		} else {
			result += text.slice(cursor, index + external.length);
			cursor = index + external.length;
		}
		index = text.indexOf(external, cursor);
	}
	return result + text.slice(cursor);
}

export function rewritePaths(text, direction) {
	let result = text;
	if (direction === "source-to-content") {
		for (const [source, external] of PATH_PAIRS) {
			result = replaceExternalPath(result, source, external);
		}
		return result;
	}

	for (const [source, external] of [...PATH_PAIRS].reverse()) {
		result = replaceExternalPath(result, external, source);
	}
	return result;
}

function normalizeRelative(relativePath) {
	const normalized = relativePath.replaceAll(path.sep, "/");
	if (
		normalized.startsWith("../") ||
		normalized.includes("/../") ||
		normalized === ".."
	) {
		throw new Error(`Refusing path traversal: ${relativePath}`);
	}
	return normalized;
}

async function collectFiles(
	root,
	relative = "",
	{ excludeDirectories = [], excludeFiles = [] } = {},
) {
	const directory = path.join(root, relative);
	const entries = await fs.readdir(directory, { withFileTypes: true });
	const excludedDirectories = new Set(excludeDirectories);
	const excludedFiles = new Set(excludeFiles);
	const files = [];
	for (const entry of entries) {
		const child = path.join(relative, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`Symbolic links are not allowed: ${child}`);
		}
		if (entry.isDirectory()) {
			if (relative === "" && excludedDirectories.has(entry.name)) continue;
			files.push(
				...(await collectFiles(root, child, {
					excludeDirectories,
					excludeFiles,
				})),
			);
			continue;
		}
		if (excludedFiles.has(entry.name)) continue;
		if (
			entry.name === ".gitkeep" ||
			COPYABLE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
		) {
			files.push(normalizeRelative(child));
		}
	}
	return files;
}

async function copyFile(sourceRoot, targetRoot, relativePath, transform) {
	const sourcePath = path.join(sourceRoot, relativePath);
	const targetPath = path.join(targetRoot, relativePath);
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	if (transform) {
		const input = await fs.readFile(sourcePath, "utf8");
		await fs.writeFile(targetPath, rewritePaths(input, transform), "utf8");
	} else {
		await fs.copyFile(sourcePath, targetPath);
	}
}

function withContentPathComment(content, relativePath, direction) {
	if (direction !== "source-to-content" || !relativePath.endsWith(".ts")) {
		return content;
	}
	return addPathComment(content, relativePath);
}

async function copyTree(sourceRoot, targetRoot, transform, options) {
	try {
		await fs.access(sourceRoot);
	} catch {
		return 0;
	}
	const files = await collectFiles(sourceRoot, "", options);
	for (const relativePath of files) {
		await copyFile(sourceRoot, targetRoot, relativePath, transform);
	}
	return files.length;
}

async function copyDataFiles(sourceRoot, targetRoot, transform) {
	let copied = 0;
	try {
		const entries = await fs.readdir(sourceRoot, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isSymbolicLink()) {
				throw new Error(`Symbolic links are not allowed: data/${entry.name}`);
			}
			if (entry.isFile() && path.extname(entry.name) === ".ts") {
				const sourcePath = path.join(sourceRoot, entry.name);
				const targetPath = path.join(targetRoot, entry.name);
				const input = await fs.readFile(sourcePath, "utf8");
				const rewritten = rewritePaths(input, transform);
				await fs.mkdir(path.dirname(targetPath), { recursive: true });
				await fs.writeFile(
					targetPath,
					withContentPathComment(
						rewritten,
						entry.name,
						transform === "source-to-content"
							? "source-to-content"
							: "content-to-source",
					),
					"utf8",
				);
				copied += 1;
			}
		}
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}

	const snapshots = path.join(sourceRoot, "anime-snapshots");
	copied += await copyTree(
		snapshots,
		path.join(targetRoot, "anime-snapshots"),
		transform,
	);
	return copied;
}

function addPathComment(content, filePath) {
	if (
		!filePath.endsWith(".ts") ||
		content.startsWith("/**\n * Content repository")
	) {
		return content;
	}
	return `/**\n * Content repository paths are relative to its root.\n * sync-content.mjs rewrites content-relative media references to the\n * theme repository's existing /images and /assets paths before build.\n */\n${content}`;
}

export async function mapContentTree(contentRoot, projectRoot, direction) {
	let copied = 0;

	for (const mapping of CONTENT_MAPPINGS) {
		if (mapping.directions && !mapping.directions.includes(direction)) {
			continue;
		}
		const sourceRelative =
			direction === "content-to-source" ? mapping.source : mapping.target;
		const targetRelative =
			direction === "content-to-source" ? mapping.target : mapping.source;
		const sourceRoot = path.resolve(
			direction === "content-to-source" ? contentRoot : projectRoot,
			sourceRelative,
		);
		const targetRoot = path.resolve(
			direction === "content-to-source" ? projectRoot : contentRoot,
			targetRelative,
		);
		if (mapping.kind === "data-files") {
			copied += await copyDataFiles(
				sourceRoot,
				targetRoot,
				direction === "content-to-source"
					? "content-to-source"
					: "source-to-content",
			);
			continue;
		}

		if (mapping.kind === "text-tree") {
			const files = await collectFilesSafe(sourceRoot, mapping);
			for (const relativePath of files) {
				const sourcePath = path.join(sourceRoot, relativePath);
				const targetPath = path.join(targetRoot, relativePath);
				await fs.mkdir(path.dirname(targetPath), { recursive: true });
				if (
					TRANSFORMABLE_TEXT_EXTENSIONS.has(
						path.extname(relativePath).toLowerCase(),
					)
				) {
					const input = await fs.readFile(sourcePath, "utf8");
					const rewritten = rewritePaths(
						input,
						direction === "content-to-source"
							? "content-to-source"
							: "source-to-content",
					);
					const output =
						direction === "source-to-content"
							? addPathComment(rewritten, relativePath)
							: rewritten;
					await fs.writeFile(targetPath, output, "utf8");
				} else {
					await fs.copyFile(sourcePath, targetPath);
				}
				copied += 1;
			}
			continue;
		}

		copied += await copyTree(sourceRoot, targetRoot, null, mapping);
	}

	return copied;
}

async function collectFilesSafe(root, options = {}) {
	try {
		return await collectFiles(root, "", options);
	} catch (error) {
		if (error?.code === "ENOENT") return [];
		throw error;
	}
}

export function parseBoolean(value, fallback = false) {
	if (value === undefined) return fallback;
	return ["1", "true", "yes", "on"].includes(
		String(value).trim().toLowerCase(),
	);
}

export function projectPath(projectRoot, value) {
	const resolved = path.resolve(projectRoot, value);
	const relative = path.relative(projectRoot, resolved);
	if (relative.startsWith("..") || path.isAbsolute(relative)) {
		throw new Error(
			`Path must stay inside the project or explicit content root: ${value}`,
		);
	}
	return resolved;
}
