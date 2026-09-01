/**
 * 配置覆盖层生成：把内容仓 `config/*.yaml` 编译成 `src/user/user-config.ts`。
 *
 * 校验策略见 `config-domains.mjs`：不另立 schema，而是给生成物打上
 * `DeepPartial<SiteConfig>` 之类的类型标注，再用一份只含该文件的 tsconfig 跑 `tsc`。
 * `src/types/*Config.ts` 因此同时是运行时契约和用户配置的校验规则，不存在两套定义漂移的问题，
 * 拼错的键还能拿到 TypeScript 的「Did you mean ...?」建议。
 *
 * 生成物本身不含默认值，只含用户显式写下的键；合并发生在运行时的 `withUserConfig()`。
 * 这样主题升级新增的默认值会自动生效，而不会被一份快照式的全量配置冻住。
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml } from "yaml";
import {
	CONFIG_DIRECTORY,
	CONFIG_DOMAINS,
	DOMAIN_BY_FILE,
	FOOTER_HTML_SOURCE,
	FOOTER_HTML_TARGET,
	GENERATED_CONFIG_FILE,
} from "./config-domains.mjs";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

/** 只含该文件的 tsconfig 落点；放进 node_modules 缓存目录，天然不入库。 */
const TSCONFIG_CACHE = "node_modules/.cache/shirone/user-config.tsconfig.json";

/**
 * 最近一次**通过**类型校验的生成物摘要。
 *
 * 没有它的话，一次失败的构建会把非法配置留在磁盘上，
 * 下一次同步因为「文件没变」而跳过校验，破的配置就被静默放行了。
 */
const VALIDATION_STAMP = "node_modules/.cache/shirone/user-config.ok";

/**
 * 没有任何用户覆盖时生成物的内容。
 *
 * 与仓库中已提交的 `src/user/user-config.ts` 逐字节相同：`local` 模式下重新生成
 * 不会弄脏 `git status`，这是内容分离对主题使用者的基本承诺。
 */
export const EMPTY_MODULE = `/**
 * 用户配置覆盖层（由 \`pnpm content:sync\` 生成，请勿手工编辑）。
 *
 * \`local\` 模式下本文件保持为空对象，全站行为完全由 \`src/config/*Config.ts\` 的默认值决定。
 * \`external\` 模式下 \`scripts/content/config-overlay.mjs\` 会把内容仓 \`config/*.yaml\`
 * 校验、归一化之后写进 \`userConfigOverrides\`，再由 \`withUserConfig()\` 在各配置文件里深合并。
 *
 * 放在 \`src/user/\` 而不是 \`src/generated/\` 是有意为之：
 * \`scripts/icons/generate-local-icons.mjs\` 会跳过 \`src/generated/\`，
 * 只在用户配置里出现的图标（如 \`profile.links[].icon\`）会因此漏扫。
 *
 * 契约见 \`docs/content-separation/config-overlay.md\`。
 */

/** 领域名 -> 该领域的用户覆盖值（仅包含用户显式声明的键）。 */
export const userConfigOverrides: Readonly<Record<string, unknown>> = {};

/** 本次生成消费了内容仓中的哪些文件，用于溯源与错误提示。 */
export const userConfigSources: readonly string[] = [];
`;

function writeAtomically(path, contents) {
	const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
	writeFileSync(temporaryPath, contents);
	renameSync(temporaryPath, path);
}

function fail(message) {
	throw new Error(`[content] ${message}`);
}

function isPlainObject(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}

/** 编辑距离，只用于给拼错的文件名一个「你是不是想写…」的提示。 */
function editDistance(a, b) {
	const rows = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let i = 1; i <= a.length; i += 1) {
		let previous = rows[0];
		rows[0] = i;
		for (let j = 1; j <= b.length; j += 1) {
			const current = rows[j];
			rows[j] = Math.min(
				rows[j] + 1,
				rows[j - 1] + 1,
				previous + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
			previous = current;
		}
	}
	return rows[b.length];
}

function suggestFile(name) {
	const candidates = CONFIG_DOMAINS.map((domain) => domain.file)
		.map((file) => ({ file, distance: editDistance(name, file) }))
		.filter((item) => item.distance <= Math.max(2, item.file.length / 3))
		.sort((a, b) => a.distance - b.distance);
	return candidates[0]?.file;
}

/**
 * 递归校验 YAML 解析结果只含 JSON 可表达的值。
 *
 * 主要拦两类事故：写了 `title:` 却忘了填值（解析成 null，深合并会把标题抹掉），
 * 以及 YAML 锚点造成的循环引用（会让后面的序列化无限递归）。
 */
function assertSerializable(value, path, file, seen) {
	if (value === null) {
		fail(
			`${file}'s ${path || "top level"} is null.` +
				' Keys without values in YAML parse to null; use "" to clear text, or [] to clear lists.',
		);
	}
	const kind = typeof value;
	if (kind === "string" || kind === "number" || kind === "boolean") {
		if (kind === "number" && !Number.isFinite(value)) {
			fail(`${file}'s ${path} is not a finite number.`);
		}
		return;
	}
	if (kind !== "object") {
		fail(`${file}'s ${path} is of type ${kind} which cannot be represented as configuration.`);
	}
	if (seen.has(value)) {
		fail(`${file}'s ${path} forms a circular reference (YAML anchor points to itself).`);
	}
	seen.add(value);

	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			assertSerializable(item, `${path}[${index}]`, file, seen);
		}
	} else if (isPlainObject(value)) {
		for (const [key, item] of Object.entries(value)) {
			assertSerializable(item, path ? `${path}.${key}` : key, file, seen);
		}
	} else {
		fail(
			`${file}'s ${path} is ${Object.prototype.toString.call(value)}, ` +
				"configuration only accepts strings, numbers, booleans, arrays, and mappings.",
		);
	}
	seen.delete(value);
}

/** 读取并校验内容仓 `config/` 下的全部 YAML 覆盖。 */
export function readConfigOverrides(configDirectory) {
	if (!existsSync(configDirectory)) return [];

	const entries = [];
	const filesByDomain = new Map();
	for (const entry of readdirSync(configDirectory, { withFileTypes: true })) {
		if (!entry.isFile()) continue;
		const extension = entry.name.slice(entry.name.lastIndexOf("."));
		if (!YAML_EXTENSIONS.has(extension)) continue;

		const base = entry.name.slice(0, -extension.length);
		const domain = DOMAIN_BY_FILE[base];
		if (!domain) {
			const suggestion = suggestFile(base);
			fail(
				`Content repository ${CONFIG_DIRECTORY}/${entry.name} has no matching config domain.` +
					(suggestion ? ` Did you mean ${suggestion}.yaml?` : "") +
					` Available filenames: ${CONFIG_DOMAINS.map((item) => item.file).join(", ")}.`,
			);
		}

		const relative = `${CONFIG_DIRECTORY}/${entry.name}`;
		const previous = filesByDomain.get(domain.key);
		if (previous) {
			fail(
				`${previous} and ${relative} both override ${domain.key}.` +
					" Each config domain can only have one .yaml or .yml file.",
			);
		}
		filesByDomain.set(domain.key, relative);

		let value;
		try {
			value = parseYaml(
				readFileSync(join(configDirectory, entry.name), "utf8"),
			);
		} catch (error) {
			fail(`${relative} is not valid YAML: ${error.message}`);
		}
		// 空文件解析成 undefined/null，视作「没有覆盖」而不是错误：
		// 用户常常先建好文件再慢慢填。
		if (value === null || value === undefined) continue;
		if (!isPlainObject(value)) {
			fail(`Top level of ${relative} must be a key-value mapping.`);
		}
		// 只有键才有覆盖的意义；空映射与空文件一样跳过。
		if (Object.keys(value).length === 0) continue;
		assertSerializable(value, "", relative, new Set());

		entries.push({ domain, file: relative, value });
	}

	// 按登记表顺序输出，让生成物的 diff 与文件系统枚举顺序无关。
	const order = new Map(
		CONFIG_DOMAINS.map((domain, index) => [domain.key, index]),
	);
	entries.sort((a, b) => order.get(a.domain.key) - order.get(b.domain.key));
	return entries;
}

function propertyKey(key) {
	return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

/**
 * 把一个值展开成带缩进的 TS 字面量行，并为每一行记下它对应的配置路径。
 *
 * 行 -> 路径的映射让 `tsc` 报出的行号可以翻译回用户 YAML 里的键名。
 */
function emitValue(value, depth, path, prefix, lines) {
	const pad = "\t".repeat(depth);

	if (Array.isArray(value)) {
		if (value.length === 0) {
			lines.push({ path, text: `${pad}${prefix}[],` });
			return;
		}
		lines.push({ path, text: `${pad}${prefix}[` });
		for (const [index, item] of value.entries()) {
			emitValue(item, depth + 1, `${path}[${index}]`, "", lines);
		}
		lines.push({ path, text: `${pad}],` });
		return;
	}

	if (isPlainObject(value)) {
		const entries = Object.entries(value);
		if (entries.length === 0) {
			lines.push({ path, text: `${pad}${prefix}{},` });
			return;
		}
		lines.push({ path, text: `${pad}${prefix}{` });
		for (const [key, item] of entries) {
			emitValue(
				item,
				depth + 1,
				path ? `${path}.${key}` : key,
				`${propertyKey(key)}: `,
				lines,
			);
		}
		lines.push({ path, text: `${pad}},` });
		return;
	}

	lines.push({ path, text: `${pad}${prefix}${JSON.stringify(value)},` });
}

/**
 * 生成 `src/user/user-config.ts` 的源码。
 *
 * @returns {{source: string, lineOwners: ({file: string, path: string}|null)[]}}
 *   `lineOwners[i]` 是第 i+1 行归属的 YAML 文件与配置路径。
 */
export function generateModule(entries) {
	if (entries.length === 0) return { source: EMPTY_MODULE, lineOwners: [] };

	/** @type {{text: string, owner: {file: string, path: string}|null}[]} */
	const lines = [];
	const push = (text, owner = null) => lines.push({ text, owner });

	push("/**");
	push(" * 用户配置覆盖层（由 `pnpm content:sync` 生成，请勿手工编辑）。");
	push(" *");
	push(" * 内容来自内容仓的以下文件，改配置请改那边：");
	for (const entry of entries) push(` * - ${entry.file}`);
	push(" *");
	push(
		" * 每个领域的类型标注让 `tsc` 直接校验用户配置：拼错的键、越界的枚举、填错的类型",
	);
	push(" * 都会在这里报错，错误信息里的行号可以对回上面的 YAML 文件。");
	push(" */");
	push("");

	const modules = new Map();
	for (const entry of entries) {
		if (!modules.has(entry.domain.module)) modules.set(entry.domain.module, []);
		modules.get(entry.domain.module).push(entry.domain.type);
	}
	for (const module of [...modules.keys()].sort()) {
		const names = [...new Set(modules.get(module))].sort();
		push(`import type { ${names.join(", ")} } from "${module}";`);
	}
	push("");

	if (entries.some((entry) => entry.domain.partial !== false)) {
		push("/**");
		push(" * 用户只需要写想改的键，因此每个领域都按「深度可选」校验。");
		push(" *");
		push(
			" * 数组保持原类型不放宽：清单类配置（侧栏 widget、社交链接）的覆盖语义是整体替换，",
		);
		push(
			" * 半个元素没有意义，而且保留完整类型才能让判别联合的 `type` 字段继续生效。",
		);
		push(" */");
		push("type DeepPartial<T> = T extends readonly unknown[]");
		push("\t? T");
		push("\t: T extends object");
		push("\t\t? { [K in keyof T]?: DeepPartial<T[K]> }");
		push("\t\t: T;");
		push("");
	}

	for (const entry of entries) {
		const annotation =
			entry.domain.partial === false
				? entry.domain.type
				: `DeepPartial<${entry.domain.type}>`;
		push(`// ${entry.file}`);
		const body = [];
		emitValue(entry.value, 0, "", "", body);
		push(`const ${entry.domain.key}: ${annotation} = ${body[0].text.trim()}`);
		for (const line of body.slice(1, -1)) {
			push(line.text, { file: entry.file, path: line.path });
		}
		push(`${body[body.length - 1].text.replace(/,$/, "")};`);
		push("");
	}

	push("/** 领域名 -> 该领域的用户覆盖值（仅包含用户显式声明的键）。 */");
	push(
		"export const userConfigOverrides: Readonly<Record<string, unknown>> = {",
	);
	for (const entry of entries) push(`\t${entry.domain.key},`);
	push("};");
	push("");
	push("/** 本次生成消费了内容仓中的哪些文件，用于溯源与错误提示。 */");
	push("export const userConfigSources: readonly string[] = [");
	for (const entry of entries) push(`\t${JSON.stringify(entry.file)},`);
	push("];");

	return {
		source: `${lines.map((line) => line.text).join("\n")}\n`,
		lineOwners: lines.map((line) => line.owner),
	};
}

function writeTsconfig(root) {
	const configPath = join(root, TSCONFIG_CACHE);
	mkdirSync(dirname(configPath), { recursive: true });
	// include/extends 都相对本文件所在目录解析，因此要退回仓库根。
	const toRoot = "../../..";
	writeFileSync(
		configPath,
		`${JSON.stringify(
			{
				extends: `${toRoot}/tsconfig.json`,
				include: [`${toRoot}/${GENERATED_CONFIG_FILE}`],
				compilerOptions: { noEmit: true, declaration: false, plugins: [] },
			},
			null,
			2,
		)}\n`,
	);
	return configPath;
}

const DIAGNOSTIC_PATTERN = /^(.+?)\((\d+),(\d+)\): error TS\d+: (.+)$/;

/**
 * 用一份只含生成物的 tsconfig 跑 `tsc`，把类型错误翻译回内容仓的 YAML 文件与键路径。
 *
 * 只编译一个文件加上 `src/types/` 依赖图，通常 2~3 秒；且仅在生成物内容变化时才会触发。
 */
export function typeCheckModule(root, lineOwners) {
	const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
	if (!existsSync(tsc)) {
		fail("Cannot find local typescript to check user config. Please run pnpm install first.");
	}

	let output = "";
	try {
		execFileSync(
			process.execPath,
			[tsc, "-p", writeTsconfig(root), "--pretty", "false"],
			{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
		return;
	} catch (error) {
		output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
	}

	const messages = [];
	for (const line of output.split(/\r?\n/)) {
		const match = DIAGNOSTIC_PATTERN.exec(line.trim());
		if (!match) continue;
		const [, file, lineNumber, , message] = match;
		const owner = file.replace(/\\/g, "/").endsWith(GENERATED_CONFIG_FILE)
			? lineOwners[Number(lineNumber) - 1]
			: null;
		messages.push(
			owner
				? `  ${owner.file}'s ${owner.path || "top level"}: ${message}`
				: `  ${line.trim()}`,
		);
	}

	fail(
		`Content repository configuration failed type checking:\n${messages.join("\n") || `  ${output.trim()}`}\n` +
			`  (Full context in generated ${GENERATED_CONFIG_FILE})`,
	);
}

/**
 * 把内容仓的 `config/` 物化成配置覆盖层。
 *
 * @param {object} options
 * @param {string} options.root 代码仓根目录
 * @param {string} options.sourceRoot 内容仓根目录
 * @param {boolean} [options.dryRun] 只校验不落盘
 * @param {(message: string) => void} [options.warn]
 * @param {string[]} [options.previousConfigFiles] 上一次 lock 记录的配置文件
 * @returns {{files: string[], changed: boolean}}
 */
export function syncUserConfig({
	root,
	sourceRoot,
	dryRun = false,
	warn,
	previousConfigFiles = [],
}) {
	const configDirectory = join(sourceRoot, CONFIG_DIRECTORY);
	const entries = readConfigOverrides(configDirectory);
	const { source, lineOwners } = generateModule(entries);

	const targetPath = join(root, GENERATED_CONFIG_FILE);
	const stampPath = join(root, VALIDATION_STAMP);
	const existedBefore = existsSync(targetPath);
	const current = existedBefore ? readFileSync(targetPath, "utf8") : "";
	const digest = createHash("sha256").update(source).digest("hex");
	const validated = existsSync(stampPath)
		? readFileSync(stampPath, "utf8").trim()
		: "";

	// 比对前抹平换行：生成器一律写 LF，而 Windows 的 core.autocrlf 会把签出的文件
	// 变成 CRLF；按原始字节比较会让每次同步都判定为「有改动」。
	const changed = current.split("\r\n").join("\n") !== source;
	const needsCheck = entries.length > 0 && validated !== digest;

	if (changed) {
		mkdirSync(dirname(targetPath), { recursive: true });
		writeAtomically(targetPath, source);
	}
	try {
		// 校验读的是磁盘上的文件，所以必须发生在落盘之后。
		if (needsCheck) {
			typeCheckModule(root, lineOwners);
			if (!dryRun) {
				mkdirSync(dirname(stampPath), { recursive: true });
				writeFileSync(
					stampPath,
					`${digest}
`,
				);
			}
		}
	} finally {
		// dry-run 先写后还原，净效果仍是「校验了，但没改动仓库」。
		if (dryRun && changed) {
			if (existedBefore) writeAtomically(targetPath, current);
			else rmSync(targetPath, { force: true });
		}
	}

	const files = entries.map((entry) => entry.file);

	const footerSource = join(configDirectory, FOOTER_HTML_SOURCE);
	const footerTarget = join(root, FOOTER_HTML_TARGET);
	let footerChanged = false;
	if (existsSync(footerSource)) {
		const sourceBody = readFileSync(footerSource);
		const targetBody = existsSync(footerTarget)
			? readFileSync(footerTarget)
			: null;
		footerChanged = !targetBody?.equals(sourceBody);
		if (!dryRun && footerChanged) {
			mkdirSync(dirname(footerTarget), { recursive: true });
			copyFileSync(footerSource, footerTarget);
		}
		files.push(`${CONFIG_DIRECTORY}/${FOOTER_HTML_SOURCE}`);
	} else if (
		previousConfigFiles.includes(`${CONFIG_DIRECTORY}/${FOOTER_HTML_SOURCE}`)
	) {
		let themeFooter = null;
		try {
			themeFooter = execFileSync(
				"git",
				["--no-optional-locks", "show", `HEAD:${FOOTER_HTML_TARGET}`],
				{
					cwd: root,
					stdio: ["ignore", "pipe", "ignore"],
					env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
				},
			);
		} catch {
			// eject 后目标不再被 Git 跟踪；此时应删除旧的外部页脚。
		}

		const targetBody = existsSync(footerTarget)
			? readFileSync(footerTarget)
			: null;
		footerChanged = themeFooter
			? !targetBody?.equals(themeFooter)
			: targetBody !== null;
		if (!dryRun && footerChanged) {
			if (themeFooter) {
				mkdirSync(dirname(footerTarget), { recursive: true });
				writeFileSync(footerTarget, themeFooter);
			} else {
				rmSync(footerTarget, { force: true });
			}
		}
	}

	if (existsSync(configDirectory) && files.length === 0) {
		warn?.(
			`No recognizable config files found in ${CONFIG_DIRECTORY}/ of content repository, no overrides generated.`,
		);
	}

	return { files, changed: changed || footerChanged };
}
