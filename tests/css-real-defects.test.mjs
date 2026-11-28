import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// F-84 / F-85 / F-86：CSS 真实缺陷回归锁。
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** 递归收集 src 下的 css/styl/svelte/astro 文件 */
function collectStyles(dir, acc = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			collectStyles(p, acc);
		} else if (/\.(css|styl|svelte|astro)$/.test(name)) {
			acc.push(p);
		}
	}
	return acc;
}

test("every --m3e-space token in use is defined (F-84)", () => {
	const variables = readFileSync(
		join(root, "src/styles/variables.styl"),
		"utf8",
	);
	const defined = new Set(variables.match(/--m3e-space-[\w-]+(?=:)/g) ?? []);
	assert.ok(defined.has("--m3e-space-6"), "基础刻度存在");

	const files = collectStyles(join(root, "src"));
	for (const file of files) {
		const content = readFileSync(file, "utf8");
		const used = content.match(/var\(--m3e-space-[\w-]+\)/g) ?? [];
		for (const token of used) {
			const name = token.slice(4, -1);
			assert.ok(defined.has(name), `${file} 引用了未定义的 ${name}`);
		}
	}
});

test("font-faces.css has no src-less @font-face rules (F-85)", () => {
	const css = readFileSync(join(root, "src/styles/font-faces.css"), "utf8");
	const rules = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
	for (const rule of rules) {
		assert.match(
			rule,
			/src\s*:/,
			`无 src 的 @font-face 是死规则: ${rule.trim().slice(0, 60)}`,
		);
	}
});

test("fancybox backdrop uses the v6 variable name (F-86)", () => {
	const css = readFileSync(
		join(root, "src/styles/fancybox-custom.css"),
		"utf8",
	);
	// v5 旧名不再出现（v6 改名，旧名覆盖无效）
	assert.doesNotMatch(css, /--fancybox-bg\s*:/);
	const upstream = readFileSync(
		join(root, "node_modules/@fancyapps/ui/dist/fancybox/fancybox.css"),
		"utf8",
	);
	assert.match(css, /--fancybox-backdrop-bg\s*:/);
	assert.match(upstream, /--fancybox-backdrop-bg/, "上游 CSS 确认该变量存在");
});
