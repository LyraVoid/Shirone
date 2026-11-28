import { spawnSync } from "node:child_process";
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = join(root, ".agents", "skills");
const packageJson = JSON.parse(
	readFileSync(join(root, "package.json"), "utf8"),
);
const pluginName = "shirone-ai";
const pluginVersion = packageJson.version;

function readOption(name) {
	const index = process.argv.indexOf(name);
	if (index === -1) return null;
	const value = process.argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`缺少参数：${name}`);
	}
	return value;
}

function hasFlag(name) {
	return process.argv.includes(name);
}

/** Resolve symlinks on the part of `path` that exists, keeping any missing tail. */
function resolveOutputPath(path) {
	const resolved = resolve(path);
	try {
		return realpathSync(resolved);
	} catch {
		const parent = dirname(resolved);
		return parent === resolved
			? resolved
			: join(resolveOutputPath(parent), basename(resolved));
	}
}

function isSymlink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

function isInside(child, parent) {
	const rel = relative(parent, child);
	return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Writes and zip archives delete their destination first, so it must not be
 * the project, one of its ancestors, or the skills source. `resolveOutputPath`
 * makes a symlink that points at any of those behave like the path itself.
 */
function assertSafeOutputPath(destination) {
	const resolvedDestination = resolveOutputPath(destination);
	if (isInside(resolveOutputPath(root), resolvedDestination)) {
		throw new Error(
			`输出路径不能是项目目录或其上级目录：${resolvedDestination}`,
		);
	}
	if (isInside(resolvedDestination, resolveOutputPath(sourceDir))) {
		throw new Error(`输出路径不能覆盖技能源目录：${resolvedDestination}`);
	}
	return resolvedDestination;
}

function pluginManifest() {
	const authorName =
		typeof packageJson.author === "string"
			? packageJson.author
			: (packageJson.author?.name ?? "Shirone contributors");
	return {
		name: pluginName,
		version: pluginVersion,
		description:
			"Shirone theme skills for AI coding assistants and content workflows.",
		author: { name: authorName },
		repository: packageJson.repository?.url,
		license: packageJson.license,
		keywords: ["shirone", "astro", "svelte", "blog-theme"],
		skills: "./skills/",
		interface: {
			displayName: "Shirone AI Skills",
			shortDescription: "Skills for developing and using the Shirone theme.",
			longDescription:
				"A single installable bundle containing Shirone developer and user-facing skills.",
			developerName: "Shirone contributors",
			category: "Productivity",
			capabilities: ["Write", "Code"],
			defaultPrompt: ["Help me work with the Shirone theme."],
		},
	};
}

function discoverSkills() {
	if (!existsSync(sourceDir)) {
		throw new Error(`技能源目录不存在：${sourceDir}`);
	}
	const skills = readdirSync(sourceDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
		.map((entry) => entry.name)
		.sort();
	if (skills.length === 0) throw new Error(`技能源目录为空：${sourceDir}`);
	for (const skill of skills) {
		if (!existsSync(join(sourceDir, skill, "SKILL.md"))) {
			throw new Error(`${skill}/SKILL.md 缺失`);
		}
	}
	return skills;
}

function preparePlugin(destination, skills) {
	const resolvedDestination = assertSafeOutputPath(destination);
	if (existsSync(resolvedDestination)) {
		const marker = join(resolvedDestination, ".shirone-skills-package");
		const owner = existsSync(marker)
			? (readFileSync(marker, "utf8").trimStart().split(/\s+/)[0] ?? "")
			: "";
		if (!statSync(resolvedDestination).isDirectory() || owner !== pluginName) {
			throw new Error(
				`输出路径已存在且不是本工具生成的目录，请更换路径：${resolvedDestination}`,
			);
		}
	}
	rmSync(resolvedDestination, { recursive: true, force: true });
	mkdirSync(join(resolvedDestination, ".codex-plugin"), { recursive: true });
	mkdirSync(join(resolvedDestination, "skills"), { recursive: true });
	writeFileSync(
		join(resolvedDestination, ".shirone-skills-package"),
		`${pluginName} ${pluginVersion}\n`,
		"utf8",
	);
	writeFileSync(
		join(resolvedDestination, ".codex-plugin", "plugin.json"),
		`${JSON.stringify(pluginManifest(), null, 2)}\n`,
		"utf8",
	);
	for (const skill of skills) {
		cpSync(join(sourceDir, skill), join(resolvedDestination, "skills", skill), {
			recursive: true,
		});
	}
	return resolvedDestination;
}

function createZip(pluginRoot, zipPath) {
	// The resolved path is where a symlink points, and replacement deletes that.
	if (isSymlink(zipPath)) {
		throw new Error(`ZIP 输出路径不能是符号链接：${resolve(zipPath)}`);
	}
	const resolvedZip = assertSafeOutputPath(zipPath);
	if (existsSync(resolvedZip) && statSync(resolvedZip).isDirectory()) {
		throw new Error(`ZIP 输出路径已经是目录：${resolvedZip}`);
	}
	mkdirSync(dirname(resolvedZip), { recursive: true });
	rmSync(resolvedZip, { force: true });
	if (process.platform === "win32") {
		const command =
			"Compress-Archive -Path " +
			"'" +
			pluginRoot.replaceAll("'", "''") +
			"\\*' -DestinationPath '" +
			resolvedZip.replaceAll("'", "''") +
			"' -Force";
		const result = spawnSync(
			"powershell.exe",
			["-NoProfile", "-Command", command],
			{
				stdio: "inherit",
			},
		);
		if (result.status !== 0) throw new Error("Compress-Archive 打包失败");
		return resolvedZip;
	}
	const result = spawnSync("zip", ["-qr", resolvedZip, "."], {
		cwd: pluginRoot,
		stdio: "inherit",
	});
	if (result.status !== 0)
		throw new Error("zip 打包失败，请安装 zip 命令后重试");
	return resolvedZip;
}

function main() {
	const outputOption = readOption("--output");
	const zip = hasFlag("--zip");
	const defaultBase = join(root, "artifacts", `${pluginName}-${pluginVersion}`);
	const output = resolve(
		outputOption ?? (zip ? `${defaultBase}.zip` : defaultBase),
	);
	const skills = discoverSkills();
	if (zip) {
		const staging = join(
			root,
			"artifacts",
			`${pluginName}-${process.pid}-${Date.now()}-staging`,
		);
		try {
			preparePlugin(staging, skills);
			createZip(staging, output);
		} finally {
			rmSync(staging, { recursive: true, force: true });
		}
		console.log(`已打包 ${skills.length} 个技能：${output}`);
		return;
	}
	const destination = preparePlugin(output, skills);
	console.log(`已生成 ${skills.length} 个技能的插件目录：${destination}`);
}

try {
	main();
} catch (error) {
	console.error(
		`技能打包失败：${error instanceof Error ? error.message : String(error)}`,
	);
	process.exitCode = 1;
}
