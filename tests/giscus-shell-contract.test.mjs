import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import stylus from "stylus";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GISCUS_COMPONENT = "src/components/organisms/comment/Giscus.astro";

async function compiledGiscusShellCss() {
	const source = await readFile(join(ROOT, GISCUS_COMPONENT), "utf8");
	const block = source.match(/const giscusStylus = `([\s\S]*?)`;/);
	assert.ok(block, "Giscus.astro must embed its shell styles in giscusStylus");
	return stylus.render(block[1]);
}

test("giscus iframe shell keeps both color schemes enabled", async () => {
	const css = await compiledGiscusShellCss();

	// 浏览器偏好暗色而站点为亮色时，light-only 的 iframe 会被 Chromium 强制铺上
	// 不透明深色画布，评论区出现黑底（Shirone#80）。外壳必须声明 light dark。
	assert.match(css, /\.giscus-frame\s*\{[^}]*color-scheme:\s*light dark\s*;/);
	assert.doesNotMatch(css, /color-scheme:\s*(?:normal|only light)\s*;/);
});
