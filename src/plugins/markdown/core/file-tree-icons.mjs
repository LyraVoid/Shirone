import materialSymbols from "@iconify-json/material-symbols/icons.json" with {
	type: "json",
};
import simpleIcons from "@iconify-json/simple-icons/icons.json" with {
	type: "json",
};
import { h } from "hastscript";

const MATERIAL_ICON_NAMES = {
	tree: "account-tree-outline-rounded",
	code: "code-rounded",
	disclosure: "chevron-right-rounded",
	folder: "folder-rounded",
	file: "draft-outline-rounded",
	data: "data-object-rounded",
	markdown: "markdown-outline-rounded",
	fullscreen: "fullscreen-rounded",
	fullscreenExit: "fullscreen-exit-rounded",
};

const EXACT_FILE_ICONS = new Map([
	["package.json", { collection: "simple", name: "npm", tone: "error" }],
	[".gitignore", { collection: "simple", name: "git", tone: "tertiary" }],
	["dockerfile", { collection: "simple", name: "docker", tone: "primary" }],
]);

const EXTENSION_ICONS = new Map([
	["ts", { collection: "simple", name: "typescript", tone: "primary" }],
	["mts", { collection: "simple", name: "typescript", tone: "primary" }],
	["cts", { collection: "simple", name: "typescript", tone: "primary" }],
	["tsx", { collection: "simple", name: "typescript", tone: "primary" }],
	["js", { collection: "simple", name: "javascript", tone: "secondary" }],
	["mjs", { collection: "simple", name: "javascript", tone: "secondary" }],
	["cjs", { collection: "simple", name: "javascript", tone: "secondary" }],
	["jsx", { collection: "simple", name: "javascript", tone: "secondary" }],
	["svelte", { collection: "simple", name: "svelte", tone: "error" }],
	["astro", { collection: "simple", name: "astro", tone: "tertiary" }],
	["vue", { collection: "simple", name: "vuedotjs", tone: "secondary" }],
	["json", { collection: "material", name: "data", tone: "tertiary" }],
	["json5", { collection: "material", name: "data", tone: "tertiary" }],
	["md", { collection: "material", name: "markdown", tone: "primary" }],
	["mdx", { collection: "material", name: "markdown", tone: "primary" }],
	["css", { collection: "simple", name: "css", tone: "primary" }],
	["styl", { collection: "simple", name: "stylus", tone: "tertiary" }],
	["stylus", { collection: "simple", name: "stylus", tone: "tertiary" }],
	["html", { collection: "simple", name: "html5", tone: "error" }],
	["htm", { collection: "simple", name: "html5", tone: "error" }],
	["py", { collection: "simple", name: "python", tone: "primary" }],
	["go", { collection: "simple", name: "go", tone: "primary" }],
	["rs", { collection: "simple", name: "rust", tone: "error" }],
	["rust", { collection: "simple", name: "rust", tone: "error" }],
	["sh", { collection: "simple", name: "gnubash", tone: "secondary" }],
	["bash", { collection: "simple", name: "gnubash", tone: "secondary" }],
	["yaml", { collection: "simple", name: "yaml", tone: "error" }],
	["yml", { collection: "simple", name: "yaml", tone: "error" }],
	["svg", { collection: "simple", name: "svg", tone: "tertiary" }],
]);

function resolveIcon(name, isDirectory, mode) {
	if (isDirectory) {
		return { collection: "material", name: "folder", tone: "primary" };
	}
	if (mode === "simple") {
		return { collection: "material", name: "file", tone: "default" };
	}

	const lowerName = name.toLowerCase();
	const exact = EXACT_FILE_ICONS.get(lowerName);
	if (exact) return exact;

	const extension = lowerName.includes(".")
		? lowerName.slice(lowerName.lastIndexOf(".") + 1)
		: "";
	return (
		EXTENSION_ICONS.get(extension) ?? {
			collection: "material",
			name: "file",
			tone: "default",
		}
	);
}

function getIconData(definition) {
	if (definition.collection === "simple") {
		return {
			icon: simpleIcons.icons[definition.name],
			width: simpleIcons.width,
			height: simpleIcons.height,
		};
	}

	const iconName = MATERIAL_ICON_NAMES[definition.name];
	return {
		icon: materialSymbols.icons[iconName],
		width: materialSymbols.width,
		height: materialSymbols.height,
	};
}

function createSvg(definition, extraClass) {
	const { icon, width, height } = getIconData(definition);
	const resolvedWidth = icon?.width ?? width ?? 24;
	const resolvedHeight = icon?.height ?? height ?? 24;
	const body =
		icon?.body ?? materialSymbols.icons[MATERIAL_ICON_NAMES.file].body;
	const path = body.match(
		/^<path fill="(?<fill>[^"]+)" d="(?<data>[^"]+)"\/>$/,
	);
	if (!path?.groups) {
		throw new TypeError(`Unsupported File Tree icon body: ${definition.name}`);
	}

	return h(
		"svg",
		{
			className: [
				"m3-file-tree__icon",
				`m3-file-tree__icon--${definition.tone}`,
				extraClass,
			],
			viewBox: `0 0 ${resolvedWidth} ${resolvedHeight}`,
			"aria-hidden": "true",
			focusable: "false",
		},
		[h("path", { fill: path.groups.fill, d: path.groups.data })],
	);
}

export function createFileTreeIcon(name, isDirectory, mode) {
	return createSvg(resolveIcon(name, isDirectory, mode), null);
}

export function createFileTreeHeaderIcon() {
	return createSvg(
		{ collection: "material", name: "tree", tone: "primary" },
		"m3-file-tree__header-icon",
	);
}

export function createCodeTreeHeaderIcon() {
	return createSvg(
		{ collection: "material", name: "code", tone: "primary" },
		"m3-code-tree__header-icon",
	);
}

export function createFileTreeDisclosureIcon() {
	return createSvg(
		{ collection: "material", name: "disclosure", tone: "default" },
		"m3-file-tree__disclosure-icon",
	);
}

export function createCodeTreeExpandIcon() {
	return createSvg(
		{ collection: "material", name: "fullscreen", tone: "default" },
		"m3-code-tree__action-icon",
	);
}

export function createCodeTreeCompressIcon() {
	return createSvg(
		{ collection: "material", name: "fullscreenExit", tone: "default" },
		"m3-code-tree__action-icon",
	);
}
