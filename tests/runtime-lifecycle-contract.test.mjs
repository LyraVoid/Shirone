import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (relative) =>
	readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("F-11: search guards result writes with an incrementing request token", () => {
	const source = read("../src/components/organisms/Search.svelte");
	assert.match(source, /let searchToken = 0;/);
	assert.match(source, /const token = \+\+searchToken;/);
	// 慢的旧响应不得写入 result / 清除 isSearching
	assert.match(source, /if \(token !== searchToken\) return;/);
	assert.match(source, /if \(token === searchToken\) isSearching = false;/);
});
test("F-11b: clearing the query invalidates pending search responses", () => {
	const source = read("../src/components/organisms/Search.svelte");
	// 清空分支必须推进 searchToken：否则在途响应（token === searchToken）
	// 仍会晚到并覆盖 result = []，造成"清空后旧结果闪现"
	const clear = source.match(/if \(!keyword\) \{[\s\S]*?\n\t\}/);
	assert.ok(clear, "missing !keyword clear branch");
	assert.match(clear[0], /searchToken\+\+/);
});


test("F-26: masonry keeps a single module-level ResizeObserver", () => {
	const source = read("../src/utils/masonry.ts");
	assert.match(source, /let masonryObserver: ResizeObserver \| null = null;/);
	// 不允许每次 setupMasonry 都 new 一个 observer（swup 导航会叠加泄漏）
	assert.equal(source.match(/new ResizeObserver\(/g)?.length, 1);
	// 观察新容器前必须断开旧的
	assert.match(
		source,
		/masonryObserver\.disconnect\(\);\s*\n\s*masonryContainer = container;\s*\n\s*masonryObserver\.observe\(container\);/,
	);
});

test("F-46: swup:enable fallback listeners are registered at most once", () => {
	const files = [
		"../src/layouts/Layout.astro",
		"../src/components/organisms/CategoryBar.astro",
	];
	for (const file of files) {
		const source = read(file);
		assert.match(
			source,
			/addEventListener\(\s*"swup:enable",[\s\S]{0,300}?\{ once: true \}/,
			`${file} misses { once: true } on its swup:enable fallback`,
		);
	}
});
