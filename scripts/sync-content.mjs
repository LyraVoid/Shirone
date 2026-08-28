import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	applyMappedContent,
	mapContentTree,
	parseBoolean,
} from "./content-sync-lib.mjs";

const execFileAsync = promisify(execFile);
const gitCommand = process.platform === "win32" ? "git.exe" : "git";
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tempRoot = path.join(projectRoot, ".temp");
const lockPath = path.join(tempRoot, "content-sync.lock");

function displayRepositoryUrl(value) {
	try {
		if (/^[^/\\@\s]+@[^:\s]+:.+/.test(value)) {
			const [, host, repositoryPath] = value.match(
				/^[^/\\@\s]+@([^:\s]+):(.+)/,
			);
			return `ssh://${host}/${repositoryPath}`;
		}
		const parsed = new URL(value);
		parsed.username = "";
		parsed.password = "";
		parsed.search = "";
		parsed.hash = "";
		return parsed.toString().replace(/\/$/, "");
	} catch {
		return "configured repository";
	}
}

function processIsAlive(pid) {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return error?.code === "EPERM";
	}
}

async function acquireLock() {
	await fs.mkdir(tempRoot, { recursive: true });
	try {
		const handle = await fs.open(lockPath, "wx");
		await handle.writeFile(`${process.pid}\n`, "utf8");
		return handle;
	} catch (error) {
		if (error?.code !== "EEXIST") throw error;
		let pid = 0;
		try {
			pid = Number.parseInt(await fs.readFile(lockPath, "utf8"), 10);
		} catch {}
		if (processIsAlive(pid)) {
			throw new Error("Another content synchronization is already running.");
		}
		await fs.rm(lockPath, { force: true });
		return acquireLock();
	}
}

async function cleanStaleArtifacts() {
	let entries;
	try {
		entries = await fs.readdir(tempRoot, { withFileTypes: true });
	} catch (error) {
		if (error?.code === "ENOENT") return;
		throw error;
	}
	for (const entry of entries) {
		if (
			entry.isDirectory() &&
			/^(?:content-repo|content-stage|content-backup)-/.test(entry.name)
		) {
			await fs.rm(path.join(tempRoot, entry.name), {
				recursive: true,
				force: true,
			});
		}
	}
}

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

const lockHandle = await acquireLock();
await cleanStaleArtifacts();
const runId = `${process.pid}-${Date.now()}`;
const checkoutRoot = path.join(tempRoot, `content-repo-${runId}`);
const stageRoot = path.join(tempRoot, `content-stage-${runId}`);

try {
	await execFileAsync(
		gitCommand,
		["clone", "--depth", "1", "--", repositoryUrl, checkoutRoot],
		{ cwd: projectRoot, windowsHide: true },
	);
	const copied = await mapContentTree(
		checkoutRoot,
		stageRoot,
		"content-to-source",
	);
	if (copied === 0) {
		throw new Error(
			"Content repository contains no supported content files; refusing to build with stale local content.",
		);
	}
	await applyMappedContent(stageRoot, projectRoot);
	console.log(
		`[content-sync] Mapped ${copied} files from ${displayRepositoryUrl(repositoryUrl)}.`,
	);
} catch (error) {
	if (error?.cmd || error?.stderr) {
		throw new Error(
			`[content-sync] Git clone failed for ${displayRepositoryUrl(repositoryUrl)} (exit code ${error.code ?? "unknown"}). Ensure Git is installed and available on PATH.`,
		);
	}
	throw error;
} finally {
	await fs.rm(checkoutRoot, { recursive: true, force: true });
	await fs.rm(stageRoot, { recursive: true, force: true });
	try {
		await lockHandle.close();
		await fs.rm(lockPath, { force: true });
	} catch (error) {
		process.exitCode = 1;
		console.warn("[content-sync] Could not release synchronization lock.", error);
	}
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
