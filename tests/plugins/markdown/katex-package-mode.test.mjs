import assert from "node:assert/strict";
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	invalidateConfigCache,
	loadPackageModule,
} from "../../../src/integration/resolve/load-config.ts";
import { resolvePaths } from "../../../src/integration/resolve/paths.ts";

const projectRoot = fileURLToPath(new URL("../../..", import.meta.url));
const roots = [];

after(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function findPackageRoot(entry, expectedName) {
	let directory = dirname(entry);
	while (true) {
		const manifestPath = join(directory, "package.json");
		if (existsSync(manifestPath)) {
			const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
			if (manifest.name === expectedName) return directory;
		}
		const parent = dirname(directory);
		if (parent === directory) {
			throw new Error(
				`Could not find ${expectedName} package root from ${entry}`,
			);
		}
		directory = parent;
	}
}

function linkPackage(source, destination) {
	mkdirSync(dirname(destination), { recursive: true });
	symlinkSync(
		source,
		destination,
		process.platform === "win32" ? "junction" : "dir",
	);
}

function writePackage(root, metadata, source) {
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "package.json"), JSON.stringify(metadata));
	writeFileSync(join(root, "index.js"), source);
}

test("package-mode KaTeX rendering uses the theme's direct version and matching CSS", async () => {
	const themeRoot = mkdtempSync(join(tmpdir(), "shirones-katex-theme-"));
	const siteRoot = mkdtempSync(join(tmpdir(), "shirones-katex-site-"));
	roots.push(themeRoot, siteRoot);
	mkdirSync(join(themeRoot, "src", "integration"), { recursive: true });
	mkdirSync(join(themeRoot, "src", "utils"), { recursive: true });
	mkdirSync(join(themeRoot, "node_modules"), { recursive: true });
	writeFileSync(join(themeRoot, "package.json"), '{"name":"shirones"}\n');
	writeFileSync(join(siteRoot, "package.json"), '{"name":"consumer"}\n');

	const paths = resolvePaths(
		{},
		pathToFileURL(`${siteRoot}/`).href,
		pathToFileURL(join(themeRoot, "src", "integration", "index.ts")).href,
	);
	assert.equal(paths.isThemeRepo, false);

	// Model a consumer install: rehype-katex has the old range and a nested
	// 0.16 renderer, while the theme's direct KaTeX package supplies the CSS.
	const projectRequire = createRequire(join(projectRoot, "package.json"));
	const directKatexRoot = findPackageRoot(
		projectRequire.resolve("katex"),
		"katex",
	);
	const directKatex = join(themeRoot, "node_modules", "katex");
	linkPackage(directKatexRoot, directKatex);

	const actualRehypeRoot = findPackageRoot(
		projectRequire.resolve("rehype-katex"),
		"rehype-katex",
	);
	const rehypeKatex = join(themeRoot, "node_modules", "rehype-katex");
	mkdirSync(rehypeKatex, { recursive: true });
	for (const entry of readdirSync(actualRehypeRoot)) {
		if (entry === "node_modules") continue;
		cpSync(join(actualRehypeRoot, entry), join(rehypeKatex, entry), {
			recursive: true,
		});
	}

	const rehypeRequire = createRequire(join(actualRehypeRoot, "package.json"));
	for (const dependency of [
		"hast-util-from-html-isomorphic",
		"hast-util-to-text",
		"unist-util-visit-parents",
	]) {
		const dependencyRoot = findPackageRoot(
			rehypeRequire.resolve(dependency),
			dependency,
		);
		linkPackage(dependencyRoot, join(themeRoot, "node_modules", dependency));
	}
	linkPackage(
		findPackageRoot(projectRequire.resolve("unified"), "unified"),
		join(themeRoot, "node_modules", "unified"),
	);

	const nestedKatex = join(rehypeKatex, "node_modules", "katex");
	writePackage(
		nestedKatex,
		{
			name: "katex",
			version: "0.16.47",
			type: "module",
			exports: { ".": "./index.js" },
		},
		[
			"export default {",
			'  version: "0.16.47",',
			"  renderToString() { return '<span class=\"vbox\">legacy</span>'; },",
			"};",
		].join("\n"),
	);

	writeFileSync(
		join(themeRoot, "src", "utils", "markdown-processor.mjs"),
		String.raw`
import { unified } from "unified";
import rehypeKatex from "rehype-katex";

const tree = {
  type: "root",
  children: [{
    type: "element",
    tagName: "span",
    properties: { className: ["math-inline"] },
    children: [{ type: "text", value: "\\not=" }],
  }],
};
const rendered = await unified().use(rehypeKatex).run(tree);
const classes = [];
function visit(node) {
  if (Array.isArray(node.properties?.className)) classes.push(...node.properties.className);
  for (const child of node.children ?? []) visit(child);
}
visit(rendered);
export const renderedClasses = classes;
`,
	);

	invalidateConfigCache();
	const bundled = await loadPackageModule(
		paths,
		"utils/markdown-processor.mjs",
	);
	const directManifest = JSON.parse(
		readFileSync(join(directKatex, "package.json"), "utf8"),
	);
	const stylesheet = readFileSync(
		join(directKatex, "dist", "katex.css"),
		"utf8",
	);

	assert.match(directManifest.version, /^0\.18\./);
	assert.equal(
		JSON.parse(readFileSync(join(nestedKatex, "package.json"), "utf8")).version,
		"0.16.47",
	);
	assert.ok(
		bundled.renderedClasses.includes("katex-vbox"),
		`expected KaTeX 0.18 markup, got: ${bundled.renderedClasses.join(" ")}`,
	);
	assert.ok(bundled.renderedClasses.includes("katex-thinbox"));
	assert.ok(stylesheet.includes(".katex-vbox"));
	assert.ok(stylesheet.includes(".katex-thinbox"));
	assert.ok(!bundled.renderedClasses.includes("vbox"));
});
