import assert from "node:assert/strict";
import test from "node:test";
import { indexPagefindDirectory } from "../src/integration/pagefind.ts";

for (const { name, url, options, expected } of [
	{
		name: "Windows drive URLs",
		url: new URL("file:///D:/Code/My%20Blog/dist/"),
		options: { windows: true },
		expected: [
			["addDirectory", { path: "D:\\Code\\My Blog\\dist\\" }],
			["writeFiles", { outputPath: "D:\\Code\\My Blog\\dist\\pagefind" }],
		],
	},
	{
		name: "POSIX file URLs",
		url: new URL("file:///tmp/site/dist/"),
		options: { windows: false },
		expected: [
			["addDirectory", { path: "/tmp/site/dist/" }],
			["writeFiles", { outputPath: "/tmp/site/dist/pagefind" }],
		],
	},
]) {
	test(`uses native filesystem paths for Pagefind ${name}`, async () => {
		const calls = [];
		const index = {
			addDirectory: async (args) => calls.push(["addDirectory", args]),
			writeFiles: async (args) => calls.push(["writeFiles", args]),
		};

		await indexPagefindDirectory(url, index, options);

		assert.deepEqual(calls, expected);
	});
}
