import fs from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";

const META_ATTRIBUTE_PATTERN =
	/(?:(?<name>[A-Za-z:][\w:-]*)(?:=(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'=<>`]+)))?)/g;

const EXT_TO_LANG = {
	ts: "typescript",
	mts: "typescript",
	cts: "typescript",
	tsx: "tsx",
	js: "javascript",
	mjs: "javascript",
	cjs: "javascript",
	jsx: "jsx",
	svelte: "svelte",
	astro: "astro",
	vue: "vue",
	json: "json",
	json5: "json",
	css: "css",
	styl: "stylus",
	stylus: "stylus",
	md: "markdown",
	mdx: "markdown",
	html: "html",
	htm: "html",
	py: "python",
	go: "go",
	rs: "rust",
	rust: "rust",
	sh: "shellsession",
	bash: "shellsession",
	yaml: "yaml",
	yml: "yaml",
	svg: "xml",
	xml: "xml",
	sql: "sql",
	toml: "toml",
};

export function parseCodeTreeFenceMeta(meta = "") {
	const normalized = String(meta).replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
	const attributes = {};
	for (const match of normalized.matchAll(META_ATTRIBUTE_PATTERN)) {
		const { name, double, single, bare } = match.groups;
		if (!name) continue;
		if (double !== undefined || single !== undefined || bare !== undefined) {
			attributes[name] = double ?? single ?? bare ?? "";
		} else {
			attributes[name] = true;
		}
	}
	return attributes;
}

export function scanLocalDirectory(dirPath, rootDir = process.cwd()) {
	if (!dirPath || typeof dirPath !== "string") return [];

	const cleanDir = dirPath.trim();
	const resolved = path.isAbsolute(cleanDir)
		? path.resolve(rootDir, cleanDir.replace(/^[/\\]+/, ""))
		: path.resolve(rootDir, cleanDir);

	const relativeToRoot = path.relative(rootDir, resolved);
	if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
		return [];
	}
	if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
		return [];
	}

	const results = [];

	function scan(currentDir, baseRel = "") {
		let entries = [];
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return;
		}

		entries.sort((a, b) => {
			if (a.isDirectory() === b.isDirectory()) {
				return a.name.localeCompare(b.name);
			}
			return a.isDirectory() ? -1 : 1;
		});

		for (const entry of entries) {
			if (
				entry.name.startsWith(".") ||
				entry.name === "node_modules" ||
				entry.name === "dist" ||
				entry.name === ".astro" ||
				entry.name === ".vite"
			) {
				continue;
			}

			const fullPath = path.join(currentDir, entry.name);
			const relPath = baseRel ? `${baseRel}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				scan(fullPath, relPath);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).slice(1).toLowerCase();
				let stat;
				try {
					stat = fs.statSync(fullPath);
				} catch {
					continue;
				}

				if (stat.size > 256 * 1024) continue; // Skip files > 256KB

				try {
					const content = fs.readFileSync(fullPath, "utf8");
					const lang = EXT_TO_LANG[ext] || ext || "text";
					results.push({
						type: "code",
						lang,
						meta: `title="${relPath.replace(/\\/g, "/")}"`,
						value: content,
					});
				} catch {
					// Ignore unreadable or binary files
				}
			}
		}
	}

	scan(resolved);
	return results;
}

function matchCodeTreeImport(node) {
	if (!node || !Array.isArray(node.children)) return null;

	// Form A: [ { type: "text", value: "@" }, { type: "link", url: "...", children: [{ value: "code-tree ..." }] } ]
	if (
		node.children.length === 2 &&
		node.children[0].type === "text" &&
		node.children[0].value.trim() === "@" &&
		node.children[1].type === "link"
	) {
		const link = node.children[1];
		const linkText = (link.children || [])
			.map((c) => c.value || "")
			.join("")
			.trim();
		if (linkText.startsWith("code-tree")) {
			const attrs = linkText.slice(9).trim();
			return { attrs, dir: link.url };
		}
	}

	// Form B: [ { type: "link", url: "...", children: [{ value: "@code-tree ..." }] } ]
	if (node.children.length === 1 && node.children[0].type === "link") {
		const link = node.children[0];
		const linkText = (link.children || [])
			.map((c) => c.value || "")
			.join("")
			.trim();
		if (linkText.startsWith("@code-tree")) {
			const attrs = linkText.slice(10).trim();
			return { attrs, dir: link.url };
		}
	}

	// Form C: [ { type: "text", value: "@[code-tree...](...)" } ]
	if (node.children.length === 1 && node.children[0].type === "text") {
		const match = node.children[0].value
			.trim()
			.match(/^@\[code-tree(?:\s+(?<attrs>[^\]]*))?\]\((?<dir>[^)]+)\)$/);
		if (match?.groups) {
			return match.groups;
		}
	}

	return null;
}

export function remarkCodeTree() {
	return (tree) => {
		// 1. Transform @[code-tree ...](dir) paragraphs
		visit(tree, "paragraph", (node, index, parent) => {
			const matched = matchCodeTreeImport(node);
			if (matched) {
				const { attrs, dir } = matched;
				const parsedAttrs = parseCodeTreeFenceMeta(attrs);
				const codeBlocks = scanLocalDirectory(dir);
				const directiveNode = {
					type: "containerDirective",
					name: "code-tree",
					attributes: { ...parsedAttrs, dir },
					children: codeBlocks,
				};
				if (parent && typeof index === "number") {
					parent.children[index] = directiveNode;
				}
			}
		});

		// 2. Transform leafDirective ::code-tree{dir="..."}
		visit(tree, (node, index, parent) => {
			if (node.type === "leafDirective" && node.name === "code-tree") {
				const dir = node.attributes?.dir;
				const codeBlocks = dir ? scanLocalDirectory(dir) : [];
				const directiveNode = {
					type: "containerDirective",
					name: "code-tree",
					attributes: node.attributes || {},
					children: codeBlocks,
				};
				if (parent && typeof index === "number") {
					parent.children[index] = directiveNode;
				}
			}
		});

		// 3. Process containerDirective :::code-tree
		visit(tree, (node) => {
			if (node.type === "containerDirective" && node.name === "code-tree") {
				if (
					node.attributes?.dir &&
					(!Array.isArray(node.children) || node.children.length === 0)
				) {
					node.children = scanLocalDirectory(node.attributes.dir);
				}

				const files = [];
				let codeIndex = 0;
				for (const child of node.children || []) {
					if (child.type === "code") {
						const meta = parseCodeTreeFenceMeta(child.meta);
						let filePath =
							meta.title ||
							meta.file ||
							`file-${codeIndex + 1}.${child.lang || "txt"}`;
						filePath = String(filePath)
							.replace(/\\/g, "/")
							.replace(/^\.?\//, "")
							.trim();
						const active = Boolean(meta[":active"] || meta.active);

						files.push({
							path: filePath,
							lang: child.lang || "text",
							active,
							index: codeIndex,
						});

						child.data = child.data || {};
						child.data.hProperties = {
							...(child.data.hProperties || {}),
							"data-file-path": filePath,
							"data-file-index": codeIndex,
						};

						codeIndex++;
					}
				}

				node.attributes = node.attributes || {};
				node.attributes.files = JSON.stringify(files);
				node.data = node.data || {};
				node.data.hName = "code-tree";
				node.data.hProperties = {
					...node.attributes,
					files: JSON.stringify(files),
				};
			}
		});
	};
}
