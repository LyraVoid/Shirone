import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// F-122：禁用时端点必须返回空 body 的 404——Astro 静态构建只在 4xx 且 body 为空时跳过写文件，
// 否则 dist 里会留下写着 "Not Found" 的 llms.txt / llms-full.txt。
test("disabled llms endpoints return an empty 404 body", () => {
	for (const page of ["llms.txt.ts", "llms-full.txt.ts"]) {
		const source = readFileSync(
			new URL(`../../src/pages/${page}`, import.meta.url),
			"utf8",
		);
		assert.match(source, /return new Response\(null, \{ status: 404 \}\);/);
	}
});
