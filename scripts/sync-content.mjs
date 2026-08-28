import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { mapContentTree, parseBoolean } from "./content-sync-lib.mjs";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = path.join(projectRoot, ".temp");

try {
	if (typeof process.loadEnvFile === "function") {
		process.loadEnvFile(path.join(projectRoot, ".env"));
	} else {
		const envText = await fs.readFile(path.join(projectRoot, ".env"), "utf8");
		for (const line of envText.split(/\r?\n/)) {
			const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
			if (!match || process.env[match[1]] !== undefined) continue;
			process.env[match[1]] = match[2].replace(
				/^(?:"([\s\S]*)"|'([\s\S]*)')$/,
				"$1$2",
			);
		}
	}
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

if (!parseBoolean(process.env.ENABLE_CONTENT_SYNC)) {
	console.log(
		"[content-sync] Disabled; existing content build path is unchanged.",
	);
	process.exit(0);
}

const repositoryUrl = process.env.CONTENT_REPO_URL?.trim();
if (!repositoryUrl) {
	throw new Error(
		"ENABLE_CONTENT_SYNC=true requires CONTENT_REPO_URL (HTTPS, SSH, or a local file URL).",
	);
}
if (
	!/^(?:https?|ssh|file):\/\//i.test(repositoryUrl) &&
	!/^[^/\\@\s]+@[^:\s]+:.+/.test(repositoryUrl)
) {
	throw new Error(
		"CONTENT_REPO_URL must be an HTTPS, SSH, or file URL (scp-style SSH URLs are supported).",
	);
}

const checkoutRoot = path.join(tempRoot, `content-repo-${process.pid}`);
await fs.rm(checkoutRoot, { recursive: true, force: true });
await fs.mkdir(tempRoot, { recursive: true });

try {
	await execFileAsync(
		"git",
		["clone", "--depth", "1", "--", repositoryUrl, checkoutRoot],
		{ cwd: projectRoot, windowsHide: true },
	);
	const copied = await mapContentTree(
		checkoutRoot,
		projectRoot,
		"content-to-source",
	);
	console.log(`[content-sync] Mapped ${copied} files from ${repositoryUrl}.`);
} finally {
	await fs.rm(checkoutRoot, { recursive: true, force: true });
	try {
		const entries = await fs.readdir(tempRoot);
		if (entries.length === 0) await fs.rmdir(tempRoot);
	} catch (error) {
		if (error?.code !== "ENOENT") {
			process.exitCode = 1;
			console.warn(`[content-sync] Could not remove ${tempRoot}:`, error);
		}
	}
}
