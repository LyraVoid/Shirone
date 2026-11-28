import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// F-12：链接是纯 `<a>`，不得为每条社交链接挂 Tooltip 岛（一次 hydration）。
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
	join(here, "../src/components/organisms/Profile.astro"),
	"utf8",
);

test("Profile link list stays pure static output (F-12)", () => {
	assert.doesNotMatch(source, /client:/, "链接循环里不允许任何 client 指令");
	assert.doesNotMatch(source, /Tooltip/, "装饰性 Tooltip 不再包裹链接");
	// 链接仍以 IconButton（href 锚点）输出
	assert.match(source, /<IconButton href=/);
});
