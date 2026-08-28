import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mapContentTree, projectPath } from "./content-sync-lib.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function usage() {
	console.error(
		"Usage: pnpm content-separation <repository-name> <parent-directory>",
	);
}

async function ensureEnvFlag() {
	const envPath = path.join(projectRoot, ".env");
	let content = "";
	try {
		content = await fs.readFile(envPath, "utf8");
	} catch (error) {
		if (error?.code !== "ENOENT") throw error;
	}
	const lines = content ? content.split(/\r?\n/) : [];
	const index = lines.findIndex((line) =>
		/^\s*ENABLE_CONTENT_SYNC\s*=/.test(line),
	);
	if (index >= 0) lines[index] = "ENABLE_CONTENT_SYNC=true";
	else lines.push("ENABLE_CONTENT_SYNC=true");
	const normalized = lines.filter(
		(line, i) => i < lines.length - 1 || line !== "",
	);
	await fs.writeFile(envPath, `${normalized.join("\n")}\n`, "utf8");
}

const [repositoryName, parentDirectory] = process.argv.slice(2);
if (
	!repositoryName ||
	!parentDirectory ||
	repositoryName.includes("/") ||
	repositoryName.includes("\\")
) {
	usage();
	process.exit(1);
}

const parentRoot = path.resolve(parentDirectory);
const targetRoot = projectPath(parentRoot, repositoryName);
try {
	await fs.access(targetRoot);
	console.error(`Target directory already exists: ${targetRoot}`);
	process.exit(1);
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

await fs.mkdir(targetRoot, { recursive: true });
let copied;
try {
	copied = await mapContentTree(projectRoot, targetRoot, "source-to-content");
} catch (error) {
	await fs.rm(targetRoot, { recursive: true, force: true });
	throw error;
}
await fs.writeFile(
	path.join(targetRoot, "README.md"),
	"# Shirone content repository\n\nThis repository contains content and media for a Shirone theme build.\nPaths are repository-relative and are rewritten by `sync-content.mjs`.\nGenerated moment thumbnails are intentionally excluded.\n",
	"utf8",
);
await fs.writeFile(
	path.join(targetRoot, ".gitignore"),
	"data/assets/moments/thumbnails/*\n!data/assets/moments/thumbnails/.gitkeep\n",
	"utf8",
);
await ensureEnvFlag();

try {
	await execFileAsync("git", ["init", targetRoot], { cwd: projectRoot });
} catch {
	console.warn(
		"[content-separation] git init was skipped; initialize the new repository manually if needed.",
	);
}

console.log(`[content-separation] Created ${targetRoot}`);
console.log(
	`[content-separation] Copied ${copied} content files and enabled ENABLE_CONTENT_SYNC=true.`,
);
