// 校验自定义 Markdown 作者语法 manifest 的结构与仓库路径。
// 用法：node scripts/check-markdown-manifest.mjs

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const manifestPath = join(root, "src", "plugins", "markdown", "manifest.json");
const VALID_STATUSES = new Set(["stable", "legacy", "deprecated"]);
const VALID_CATEGORIES = new Set([
	"container",
	"fence",
	"fence-meta",
	"inline-extension",
	"leaf-directive",
	"text-directive",
]);
const VALID_SOURCES = new Set(["shirone", "integration"]);
const VALID_RUNTIME_MODES = new Set([
	"none",
	"native",
	"client-enhanced",
	"inline-client",
]);

const errors = [];
const fail = (message) => errors.push(message);

function isNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function validateRepoPath(path, owner, field) {
	if (!isNonEmptyString(path)) {
		fail(`${owner}.${field} 包含空路径`);
		return;
	}
	if (
		isAbsolute(path) ||
		normalize(path)
			.split(/[\\/]+/)
			.includes("..")
	) {
		fail(`${owner}.${field} 必须是仓库内相对路径：${path}`);
		return;
	}
	if (!existsSync(join(root, ...path.split("/")))) {
		fail(`${owner}.${field} 指向不存在的文件：${path}`);
	}
}

let manifest;
try {
	manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (error) {
	console.error(`无法读取 Markdown manifest：${error.message}`);
	process.exit(1);
}

if (manifest.schema !== 1) fail(`不支持的 schema：${manifest.schema}`);
if (!Array.isArray(manifest.syntaxes)) fail("syntaxes 必须是数组");

const syntaxes = Array.isArray(manifest.syntaxes) ? manifest.syntaxes : [];
const manifestSyntaxIds = new Set(syntaxes.map((syntax) => syntax.id));
if (!Array.isArray(manifest.stylesheetPacks)) {
	fail("stylesheetPacks 必须是数组");
}

const stylesheetPacks = Array.isArray(manifest.stylesheetPacks)
	? manifest.stylesheetPacks
	: [];
const seenStylesheetPackIds = new Set();
const seenStylesheetPackSyntaxes = new Set();
const seenStylesheetPackStyles = new Set();
let previousStylesheetPackId = "";

for (const pack of stylesheetPacks) {
	const owner = isNonEmptyString(pack.id)
		? `stylesheetPacks.${pack.id}`
		: "stylesheetPacks.<unknown>";
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id ?? "")) {
		fail(`${owner}.id 必须使用 kebab-case`);
	}
	if (seenStylesheetPackIds.has(pack.id)) {
		fail(`重复 stylesheet pack id：${pack.id}`);
	}
	seenStylesheetPackIds.add(pack.id);
	if (
		previousStylesheetPackId &&
		pack.id.localeCompare(previousStylesheetPackId, "en") < 0
	) {
		fail(
			`stylesheetPacks 必须按 id 排序：${pack.id} 位于 ${previousStylesheetPackId} 之后`,
		);
	}
	previousStylesheetPackId = pack.id;

	for (const field of ["syntaxes", "styles"]) {
		if (!Array.isArray(pack[field]) || pack[field].length === 0) {
			fail(`${owner}.${field} 必须是非空数组`);
		}
	}
	for (const syntaxId of pack.syntaxes ?? []) {
		if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(syntaxId)) {
			fail(`${owner}.syntaxes 包含无效语法 ID：${syntaxId}`);
		}
		if (!manifestSyntaxIds.has(syntaxId)) {
			fail(`${owner}.syntaxes 引用了未登记语法：${syntaxId}`);
		}
		if (seenStylesheetPackSyntaxes.has(syntaxId)) {
			fail(`语法只能属于一个 stylesheet pack：${syntaxId}`);
		}
		seenStylesheetPackSyntaxes.add(syntaxId);
	}
	for (const stylePath of pack.styles ?? []) {
		if (!stylePath.endsWith(".css")) {
			fail(`${owner}.styles 只能声明 CSS 文件：${stylePath}`);
		}
		if (seenStylesheetPackStyles.has(stylePath)) {
			fail(`条件样式不能属于多个 pack：${stylePath}`);
		}
		seenStylesheetPackStyles.add(stylePath);
		validateRepoPath(stylePath, owner, "styles");
	}
}

const seenIds = new Set();
let previousId = "";

for (const syntax of syntaxes) {
	const owner = isNonEmptyString(syntax.id) ? syntax.id : "<unknown>";
	for (const field of [
		"id",
		"name",
		"status",
		"category",
		"source",
		"summary",
	]) {
		if (!isNonEmptyString(syntax[field])) fail(`${owner} 缺少字段 ${field}`);
	}

	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(syntax.id ?? "")) {
		fail(`${owner}.id 必须使用 kebab-case`);
	}
	if (seenIds.has(syntax.id)) fail(`重复 id：${syntax.id}`);
	seenIds.add(syntax.id);
	if (previousId && syntax.id.localeCompare(previousId, "en") < 0) {
		fail(`syntaxes 必须按 id 排序：${syntax.id} 位于 ${previousId} 之后`);
	}
	previousId = syntax.id;

	if (!VALID_STATUSES.has(syntax.status))
		fail(`${owner}.status 非法：${syntax.status}`);
	if (!VALID_CATEGORIES.has(syntax.category)) {
		fail(`${owner}.category 非法：${syntax.category}`);
	}
	if (!VALID_SOURCES.has(syntax.source))
		fail(`${owner}.source 非法：${syntax.source}`);

	if (!Array.isArray(syntax.forms) || syntax.forms.length === 0) {
		fail(`${owner}.forms 至少需要一个语法形式`);
	} else {
		for (const [index, form] of syntax.forms.entries()) {
			for (const field of ["kind", "pattern", "example"]) {
				if (!isNonEmptyString(form[field])) {
					fail(`${owner}.forms[${index}] 缺少字段 ${field}`);
				}
			}
		}
	}

	if (!Array.isArray(syntax.attributes)) fail(`${owner}.attributes 必须是数组`);
	for (const [index, attribute] of (syntax.attributes ?? []).entries()) {
		if (!isNonEmptyString(attribute.name)) {
			fail(`${owner}.attributes[${index}] 缺少 name`);
		}
		if (typeof attribute.required !== "boolean") {
			fail(`${owner}.attributes[${index}].required 必须是 boolean`);
		}
		if (!Object.hasOwn(attribute, "default")) {
			fail(`${owner}.attributes[${index}] 缺少 default`);
		}
	}

	if (!isNonEmptyString(syntax.registeredIn)) {
		fail(`${owner}.registeredIn 不能为空`);
	} else {
		validateRepoPath(syntax.registeredIn, owner, "registeredIn");
	}

	for (const field of ["implementation", "styles", "docs", "tests"]) {
		if (!Array.isArray(syntax[field])) {
			fail(`${owner}.${field} 必须是数组`);
			continue;
		}
		for (const path of syntax[field]) validateRepoPath(path, owner, field);
	}

	if (!syntax.runtime || !VALID_RUNTIME_MODES.has(syntax.runtime.mode)) {
		fail(`${owner}.runtime.mode 非法：${syntax.runtime?.mode}`);
	}
	for (const field of ["modules", "network"]) {
		if (!Array.isArray(syntax.runtime?.[field])) {
			fail(`${owner}.runtime.${field} 必须是数组`);
		}
	}
	for (const path of syntax.runtime?.modules ?? []) {
		validateRepoPath(path, owner, "runtime.modules");
	}
	if (!Array.isArray(syntax.notes)) fail(`${owner}.notes 必须是数组`);
	if (syntax.status === "deprecated" && !isNonEmptyString(syntax.replacement)) {
		fail(`${owner} 已 deprecated，必须提供 replacement`);
	}
}

const syntaxStyles = new Set(
	syntaxes.flatMap((syntax) =>
		Array.isArray(syntax.styles) ? syntax.styles : [],
	),
);
for (const stylePath of seenStylesheetPackStyles) {
	if (!syntaxStyles.has(stylePath)) {
		fail(`stylesheet pack 样式未由任何语法声明：${stylePath}`);
	}
}

if (errors.length > 0) {
	console.error(`Markdown manifest 存在 ${errors.length} 处问题：`);
	for (const error of errors) console.error(`- ${error}`);
	process.exit(1);
}

const statusCounts = Object.fromEntries(
	[...VALID_STATUSES].map((status) => [
		status,
		syntaxes.filter((syntax) => syntax.status === status).length,
	]),
);
console.log(`Markdown 自定义语法: ${syntaxes.length}`);
console.log(`status: ${JSON.stringify(statusCounts)}`);
console.log(`stylesheet packs: ${stylesheetPacks.length}`);
console.log("✓ Markdown manifest 结构与路径有效");
