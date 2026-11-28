import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import esbuild from "esbuild";

// F-30 / F-70 / F-110：localStorage 访问必须在“存储被禁”时静默降级，脏值不得进入渲染管线。
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const layoutMode = readFileSync(join(root, "src/utils/layout-mode.ts"), "utf8");
const settingUtils = readFileSync(
	join(root, "src/utils/setting-utils.ts"),
	"utf8",
);
const layout = readFileSync(join(root, "src/layouts/Layout.astro"), "utf8");

test("storeMode survives disabled storage (F-30)", () => {
	const fn = layoutMode.match(/export function storeMode[\s\S]*?\n}/)?.[0];
	assert.ok(fn, "storeMode 函数存在");
	assert.match(fn, /try\s*\{/);
	assert.match(fn, /catch/);
});

test("getHue rejects non-numeric stored values (F-110)", () => {
	const fn =
		layoutMode.match(/export function getHue[\s\S]*?\n}/)?.[0] ??
		settingUtils.match(/export function getHue[\s\S]*?\n}/)?.[0];
	assert.ok(fn, "getHue 函数存在");
	assert.match(fn, /Number\.isFinite/);
	// 完全数值校验（拒绝 '120oops' 等前缀解析误判）
	assert.match(fn, /\/\^\\d\+\(\?:\\\.\\d\+\)\?\$\/\.test/);
	// 存储访问被浏览器策略阻止时回落，不中断初始化
	assert.match(fn, /safeGetItem\(/);
	assert.match(fn, /getDefaultHue\(\)/);
	// 脏值不再被写回
	const setHue = settingUtils.match(/export function setHue[\s\S]*?\n}/)?.[0];
	assert.ok(setHue);
	assert.match(setHue, /String\(hue\)/);
});

test("bootstrap script never touches localStorage unguarded (F-70)", () => {
	const script = layout.match(
		/<script is:inline define:vars[\s\S]*?<\/script>/,
	)?.[0];
	assert.ok(script, "首屏引导脚本存在");
	// 唯一一次直接访问在 readStorage 的 try/catch 内
	const direct = script.match(/localStorage\.getItem\(/g)?.length ?? 0;
	assert.equal(direct, 1);
	assert.match(
		script,
		/const readStorage = \(key\) => \{[\s\S]*?try[\s\S]*?catch/,
	);
	// 其余读取全部走 readStorage
	for (const key of [
		"theme",
		"hue",
		"mc-motion",
		"wallpaper-mode",
		"texture-preset",
		"texture-opacity",
	]) {
		assert.match(script, new RegExp(`readStorage\\('${key}'\\)`));
	}
});

test("bootstrap script validates stored hue (F-110)", () => {
	const script = layout.match(
		/<script is:inline define:vars[\s\S]*?<\/script>/,
	)?.[0];
	assert.match(
		script ?? "",
		/\/\^\\d\+\(\?:\\\.\\d\+\)\?\$\/\.exec\(storedHue\.trim\(\)\)/,
	);
	// 应用校验后的数值，而非原始字符串
	assert.match(script ?? "", /hueMatch \? hueMatch\[0\] : configHue/);
});

test("theme storage reads/writes are guarded (round-3 + round-4)", () => {
	const fn = (name, src) =>
		src.match(new RegExp(`export function ${name}[\\s\\S]*?\\n}`))?.[0];
	assert.match(fn("setHue", settingUtils), /safeSetItem\(/);
	assert.match(fn("setTheme", settingUtils), /safeSetItem\(/);
	assert.match(fn("getStoredTheme", settingUtils), /safeGetItem\(/);
	// round-4：applyCurrentScheme 的真实调用路径（getStyle/getSpec）也必须有守卫
	const themeUtils = readFileSync(
		join(root, "src/utils/theme-utils.ts"),
		"utf8",
	);
	assert.match(fn("getStyle", themeUtils), /safeGetItem\(STYLE_KEY\)/);
	assert.match(fn("getSpec", themeUtils), /safeGetItem\(SPEC_KEY\)/);
	assert.match(fn("setStyle", themeUtils), /safeSetItem\(/);
	assert.match(fn("setSpec", themeUtils), /safeSetItem\(/);
});

test("initialization path survives blocked storage (F-70/F-110 behavioral)", async () => {
	// 打包 setting-utils（保留真实 applyCurrentScheme；仅替换 @/config 与
	// mc-utils 调色引擎这两个争议路径之外的依赖），在“存储被禁”沙箱中
	// 走完 getHue → setHue(→applyCurrentScheme) → setTheme → getStoredTheme 完整路径
	const bundled = await esbuild.build({
		entryPoints: [join(root, "src/utils/setting-utils.ts")],
		bundle: true,
		format: "esm",
		platform: "neutral",
		write: false,
		alias: { "@constants": join(root, "src/constants") },
		plugins: [
			{
				name: "shim-config-theme-utils",
				setup(build) {
					for (const target of ["@/config", "@utils/mc-utils"]) {
						build.onResolve(
							{ filter: new RegExp(`^${target.replaceAll("/", "\\/")}$`) },
							() => ({ path: target, namespace: "shim" }),
						);
					}
					build.onLoad({ filter: /.*/, namespace: "shim" }, (args) => ({
						contents:
							args.path === "@/config"
								? 'export const siteConfig = { themeColor: { hue: 260 } };\nexport const expressiveCodeConfig = {};\nexport const getDefaultStyle = () => "default-style";\nexport const getDefaultSpec = () => "default-spec";'
								: 'export const MC_STYLES = ["default-style"];\nexport const MC_SPECS = ["default-spec"];\nexport function resolveScheme() { return {}; }',
						loader: "js",
					}));
				},
			},
		],
	});
	const outFile = join(root, ".tmp-setting-utils.test.mjs");
	writeFileSync(outFile, bundled.outputFiles[0].text);

	const throwingStorage = {
		getItem() {
			throw new Error("blocked");
		},
		setItem() {
			throw new Error("blocked");
		},
	};
	const rootEl = {
		classList: {
			add() {},
			remove() {},
			toggle() {},
			contains() {
				return false;
			},
		},
		style: {
			getPropertyValue: () => "",
			setProperty() {},
			removeProperty() {},
		},
		dataset: {},
		setAttribute() {},
	};
	globalThis.localStorage = throwingStorage;
	globalThis.document = {
		documentElement: rootEl,
		querySelector: () => rootEl,
		getElementById: () => null,
	};
	globalThis.window = {
		matchMedia: () => ({ matches: false }),
		dispatchEvent() {},
	};
	globalThis.CustomEvent = class CustomEvent {
		constructor(type, init) {
			this.type = type;
			this.detail = init?.detail;
		}
	};

	try {
		const su = await import(pathToFileURL(outFile).href);
		// 读取被禁 → 内存默认值
		assert.equal(su.getHue(), 260);
		assert.equal(typeof su.getStoredTheme(), "string");
		// 写入被禁 → 不抛异常，初始化继续
		su.setHue(300);
		su.setTheme("light");
	} finally {
		rmSync(outFile, { force: true });
	}
});

test("write-blocked storage keeps the session selection (round-5)", async () => {
	// 打包 theme-utils（@/config shim，调色引擎保持真实实现）：
	// 读取可用、写入被禁时，setStyle/setSpec 的选择必须在本会话内生效
	const bundled = await esbuild.build({
		entryPoints: [join(root, "src/utils/theme-utils.ts")],
		bundle: true,
		format: "esm",
		platform: "neutral",
		write: false,
		plugins: [
			{
				name: "shim-config",
				setup(build) {
					build.onResolve({ filter: /^@\/config$/ }, () => ({
						path: "@/config",
						namespace: "shim",
					}));
					build.onLoad({ filter: /.*/, namespace: "shim" }, () => ({
						contents:
							'export const siteConfig = { themeColor: { hue: 260 } };\nexport const getDefaultStyle = () => "tonalSpot";\nexport const getDefaultSpec = () => "2021";',
						loader: "js",
					}));
				},
			},
		],
	});
	const outFile = join(root, ".tmp-theme-utils.test.mjs");
	writeFileSync(outFile, bundled.outputFiles[0].text);

	const rootEl = {
		classList: {
			add() {},
			remove() {},
			toggle() {},
			contains() {
				return false;
			},
		},
		style: {
			getPropertyValue: () => "",
			setProperty() {},
			removeProperty() {},
		},
		dataset: {},
		setAttribute() {},
	};
	globalThis.document = {
		documentElement: rootEl,
		querySelector: () => rootEl,
		getElementById: () => null,
	};
	globalThis.window = {
		matchMedia: () => ({ matches: false }),
		dispatchEvent() {},
	};
	globalThis.CustomEvent = class CustomEvent {
		constructor(type, init) {
			this.type = type;
			this.detail = init?.detail;
		}
	};

	try {
		const tu = await import(pathToFileURL(outFile).href);
		// 写入成功 → 落盘持久化，选择生效
		const store = {};
		globalThis.localStorage = {
			getItem: (k) => store[k] ?? null,
			setItem: (k, v) => {
				store[k] = String(v);
			},
		};
		tu.setStyle("vibrant");
		assert.equal(tu.getStyle(), "vibrant");
		assert.equal(store["mc-style"], "vibrant", "成功写入必须持久化");

		// 同一存储、写入被禁（读取仍可用）→ 内存覆盖保住本次会话的选择，
		// 且既有持久化值不受影响
		globalThis.localStorage = {
			getItem: (k) => store[k] ?? null,
			setItem() {
				throw new Error("blocked");
			},
		};
		tu.setSpec("2025");
		assert.equal(tu.getSpec(), "2025", "持久化失败不得丢失会话内选择");
		assert.equal(tu.getStyle(), "vibrant", "既有持久化值仍要生效");
	} finally {
		rmSync(outFile, { force: true });
	}
});
