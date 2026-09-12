/**
 * 配置内省：分别取出「主题默认值」与「当前生效值」，供 `config-diff.mjs` 求差。
 *
 * 难点在于「主题默认值」拿不到：`src/config/<domain>Config.ts` 里的
 * `withUserConfig(domain, defaults)` 返回的已经是「默认值 ⊕ 用户覆盖」，
 * 直接 import 只能得到生效值。
 *
 * 解法是起一个子进程，用 Node 的 `module.registerHooks()` 把
 * `src/user/user-config.ts` 这个模块拦截成空覆盖层，再在该进程里 import 各配置模块，
 * `withUserConfig()` 于是原样返回默认值字面量。这样做的好处是：
 *
 * - **不改任何运行时源码**：不需要在 `src/utils/config-overlay.ts` 里加默认值注册表。
 *   注册表方案会把每个领域的默认值对象钉在模块作用域里，让 tree-shaking 无法丢弃它们，
 *   等于为了一个构建期工具给客户端 bundle 增重。
 * - **不落盘**：不需要「临时把 user-config.ts 换成空模块再还原」。
 *   `syncUserConfig` 的 `dryRun` 用的是那套做法，但它在同一进程内、且有 `finally` 还原；
 *   导出场景下进程若被 Ctrl+C 或异常终止，会把一份空覆盖层永久留在磁盘上。
 * - **两次读取互不污染**：默认值与生效值来自两个独立进程，ESM 模块缓存不会串味。
 *
 * `navBar` 不在内省范围内：它走 `getUserConfig()` + `resolveNavBarLinks()`，
 * `i18n()` 与 `LinkPresets` 解析之后无法反推回声明式写法（而且它 import `@i18n/*`
 * 路径别名，Node 直接 import 就会失败）。见 `docs/content-separation/config-overlay.md`。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_DOMAINS } from "./config-domains.mjs";

/** 内省用的子进程脚本。 */
const WORKER = fileURLToPath(
	new URL("./config-introspect-worker.mjs", import.meta.url),
);

/**
 * 可反向导出的领域：走 `withUserConfig()` 的纯数据领域。
 *
 * 判据是 `partial !== false`——`partial: false` 的领域用的是「整体替换的中间形态」，
 * 生效值经过领域自己的翻译函数，不是深合并的结果，因此不可反推。当前只有 `navBar`。
 */
export const EXPORTABLE_DOMAINS = Object.freeze(
	CONFIG_DOMAINS.filter((domain) => domain.partial !== false),
);

/** 排除在反向导出之外的领域，附上原因（计划输出里要显式告知，不能静默跳过）。 */
export const EXCLUDED_DOMAINS = Object.freeze(
	CONFIG_DOMAINS.filter((domain) => domain.partial === false).map((domain) => ({
		domain,
		reason:
			"Nav bar items reference LinkPresets and call i18n(); resolveNavBarLinks() is irreversible, " +
			"and inferred declarative config would fail under certain setups",
	})),
);

function fail(message) {
	throw new Error(`[content] ${message}`);
}

function runWorker(root, mode) {
	const keys = EXPORTABLE_DOMAINS.map((domain) => domain.key);
	let stdout;
	try {
		stdout = execFileSync(
			process.execPath,
			[
				WORKER,
				`--mode=${mode}`,
				`--root=${root}`,
				`--domains=${keys.join(",")}`,
			],
			{
				cwd: root,
				encoding: "utf8",
				maxBuffer: 32 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
				// 内省只读配置模块，不该受内容源解析影响；也避免子进程再触发一次 .env 加载副作用。
				env: { ...process.env, SHIRONE_CONFIG_INTROSPECT: mode },
			},
		);
	} catch (error) {
		const detail = `${error.stderr ?? ""}${error.stdout ?? ""}`.trim();
		fail(
			`Introspecting ${mode === "defaults" ? "theme default config" : "current effective config"} failed: ` +
				`${detail || error.message}`,
		);
	}

	const start = stdout.indexOf("{");
	if (start === -1)
		fail(
			`Config introspection child process did not output JSON (mode=${mode}).`,
		);
	try {
		return JSON.parse(stdout.slice(start));
	} catch (error) {
		fail(
			`Config introspection result is not valid JSON (mode=${mode}): ${error.message}`,
		);
	}
}

/**
 * 取全部可导出领域的 `{ defaults, effective }`。
 *
 * @param {string} root 代码仓根目录
 * @returns {{
 *   values: Record<string, {defaults: unknown, effective: unknown}>,
 *   overrides: Record<string, unknown> | null,
 *   errors: {key: string, message: string}[],
 * }}
 *   `overrides` 是代码仓当前已物化的覆盖层（`src/user/user-config.ts` 的
 *   `userConfigOverrides`），供调用方与内容仓 YAML 现状交叉校验；读不到时为 `null`。
 */
export function introspectConfig(root) {
	if (!existsSync(join(root, "src", "config"))) {
		fail(
			`No src/config/ found under ${root}, cannot introspect config. Please run at code repository root.`,
		);
	}

	const defaults = runWorker(root, "defaults");
	const effective = runWorker(root, "effective");

	const values = {};
	const errors = [];
	for (const domain of EXPORTABLE_DOMAINS) {
		const left = defaults.values[domain.key];
		const right = effective.values[domain.key];
		const error =
			defaults.errors[domain.key] ??
			effective.errors[domain.key] ??
			(left === undefined || right === undefined
				? "Config module does not export a config object for this domain"
				: null);
		if (error) {
			errors.push({ key: domain.key, message: error });
			continue;
		}
		values[domain.key] = { defaults: left, effective: right };
	}
	return { values, overrides: effective.overrides ?? null, errors };
}
