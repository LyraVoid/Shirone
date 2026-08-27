import { h } from "hastscript";
import { createDisclosure } from "../core/disclosure.mjs";
import {
	createCodeTreeHeaderIcon,
	createFileTreeDisclosureIcon,
	createFileTreeIcon,
} from "../core/file-tree-icons.mjs";

const MAX_TITLE_LENGTH = 200;
const DEFAULT_HEIGHT = "420px";
const VALID_HEIGHT_PATTERN = /^\d+(?:\.\d+)?(?:px|rem|em|vh|%)$/;

function isElement(node, tagName) {
	return node?.type === "element" && (!tagName || node.tagName === tagName);
}

export function resolveTitle(value) {
	return typeof value === "string"
		? value.trim().slice(0, MAX_TITLE_LENGTH)
		: "";
}

export function resolveHeight(value) {
	if (typeof value === "string" && VALID_HEIGHT_PATTERN.test(value.trim())) {
		return value.trim();
	}
	return DEFAULT_HEIGHT;
}

export function resolveIconMode(value) {
	return value === "simple" ? "simple" : "colored";
}

export function buildCodeFileTree(files, activePath) {
	const root = { name: "", isDirectory: true, children: [] };

	for (const file of files) {
		const cleanPath = String(file.path)
			.replace(/\\/g, "/")
			.replace(/^\.?\//, "");
		const parts = cleanPath.split("/").filter(Boolean);
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const isLast = i === parts.length - 1;

			if (isLast) {
				current.children.push({
					name: part,
					isDirectory: false,
					fullPath: cleanPath,
					fileIndex: file.index,
					isActive: cleanPath === activePath,
				});
			} else {
				let dirNode = current.children.find(
					(child) => child.isDirectory && child.name === part,
				);
				if (!dirNode) {
					dirNode = {
						name: part,
						isDirectory: true,
						children: [],
					};
					current.children.push(dirNode);
				}
				current = dirNode;
			}
		}
	}

	return root.children;
}

function renderNavNode(node, level, iconMode) {
	if (node.isDirectory) {
		return h(
			"li",
			{
				class: "m3-code-tree__tree-node m3-code-tree__tree-node--dir",
				role: "treeitem",
				"aria-level": String(level),
			},
			[
				createDisclosure({
					summary: [
						h(
							"span",
							{ class: "m3-code-tree__dir-icon", "aria-hidden": "true" },
							[createFileTreeIcon(node.name, true, iconMode)],
						),
						h("span", { class: "m3-code-tree__dir-name" }, node.name),
					],
					children: [
						h(
							"ul",
							{ class: "m3-code-tree__sub-tree", role: "group" },
							node.children.map((child) =>
								renderNavNode(child, level + 1, iconMode),
							),
						),
					],
					indicator: createFileTreeDisclosureIcon(),
					open: true,
					className: "m3-code-tree__disclosure",
					summaryClassName: "m3-code-tree__dir-label",
					contentClassName: "m3-code-tree__branch",
				}),
			],
		);
	}

	const isSelected = Boolean(node.isActive);
	return h(
		"li",
		{
			class: "m3-code-tree__tree-node m3-code-tree__tree-node--file",
			role: "treeitem",
			"aria-level": String(level),
			"aria-selected": isSelected ? "true" : "false",
		},
		[
			h(
				"button",
				{
					type: "button",
					class: [
						"m3-code-tree__file-btn",
						isSelected ? "m3-code-tree__file-btn--active" : "",
					]
						.filter(Boolean)
						.join(" "),
					"data-file-target": node.fullPath,
					tabindex: isSelected ? "0" : "-1",
				},
				[
					h("span", {
						class: "m3-disclosure__indicator m3-disclosure__indicator--spacer",
						"aria-hidden": "true",
					}),
					h(
						"span",
						{ class: "m3-code-tree__file-icon", "aria-hidden": "true" },
						[createFileTreeIcon(node.name, false, iconMode)],
					),
					h("span", { class: "m3-code-tree__file-name" }, node.name),
				],
			),
		],
	);
}

function renderNav(tree, iconMode, title) {
	const ariaLabel = title ? `${title} 文件导航` : "文件导航";
	return h("nav", { class: "m3-code-tree__nav", "aria-label": ariaLabel }, [
		h(
			"ul",
			{
				class: "m3-code-tree__tree-root",
				role: "tree",
				"aria-label": ariaLabel,
			},
			tree.map((node) => renderNavNode(node, 1, iconMode)),
		),
	]);
}

function renderPanels(files, codeChildren, activePath, title) {
	const panels = files.map((file, index) => {
		const child = codeChildren[index] ?? h("pre", {}, "");
		const cleanPath = String(file.path)
			.replace(/\\/g, "/")
			.replace(/^\.?\//, "");
		const isSelected = cleanPath === activePath;
		const props = {
			class: ["m3-code-tree__panel", isSelected ? "" : "hidden"]
				.filter(Boolean)
				.join(" "),
			"data-file-path": cleanPath,
		};
		if (!isSelected) {
			props.hidden = true;
			props.style = "display: none;";
		}
		return h("div", props, [child]);
	});

	const contentLabel = title ? `${title} 代码` : "代码内容";
	return h(
		"div",
		{
			class: "m3-code-tree__content",
			role: "region",
			"aria-label": contentLabel,
		},
		panels,
	);
}

function renderHeader(title) {
	if (!title) return null;
	return h("div", { class: "m3-code-tree__header" }, [
		h("span", { class: "m3-code-tree__header-icon", "aria-hidden": "true" }, [
			createCodeTreeHeaderIcon(),
		]),
		h("span", { class: "m3-code-tree__title" }, title),
	]);
}

export function CodeTreeComponent(properties, children) {
	const title = resolveTitle(properties?.title);
	const height = resolveHeight(properties?.height);
	const iconMode = resolveIconMode(properties?.icon);

	let files = [];
	if (properties?.files) {
		try {
			files =
				typeof properties.files === "string"
					? JSON.parse(properties.files)
					: properties.files;
		} catch {
			files = [];
		}
	}

	const codeChildren = (Array.isArray(children) ? children : []).filter(
		(child) => isElement(child),
	);

	if (files.length === 0 && codeChildren.length > 0) {
		files = codeChildren.map((child, index) => {
			const filePath =
				child.properties?.["data-file-path"] || `file-${index + 1}`;
			return { path: String(filePath), index };
		});
	}

	if (files.length === 0) {
		return [];
	}

	let activePath = String(files[0].path)
		.replace(/\\/g, "/")
		.replace(/^\.?\//, "");

	if (properties?.entry) {
		const entry = String(properties.entry)
			.replace(/\\/g, "/")
			.replace(/^\.?\//, "")
			.trim();
		const matched = files.find((f) => {
			const p = String(f.path)
				.replace(/\\/g, "/")
				.replace(/^\.?\//, "");
			return (
				p === entry || p.endsWith(`/${entry}`) || p.split("/").pop() === entry
			);
		});
		if (matched) {
			activePath = String(matched.path)
				.replace(/\\/g, "/")
				.replace(/^\.?\//, "");
		}
	} else {
		const activeFile = files.find((f) => f.active);
		if (activeFile) {
			activePath = String(activeFile.path)
				.replace(/\\/g, "/")
				.replace(/^\.?\//, "");
		}
	}

	const tree = buildCodeFileTree(files, activePath);
	const header = renderHeader(title);
	const nav = renderNav(tree, iconMode, title);
	const main = renderPanels(files, codeChildren, activePath, title);

	const bodyChildren = [nav, main];
	const containerChildren = [];
	if (header) {
		containerChildren.push(header);
	}
	containerChildren.push(
		h("div", { class: "m3-code-tree__body" }, bodyChildren),
	);

	return h(
		"div",
		{
			class: "m3-code-tree not-prose",
			style: `--code-tree-height: ${height};`,
			"data-icon-mode": iconMode,
			...(title ? { "aria-label": title } : {}),
		},
		containerChildren,
	);
}
