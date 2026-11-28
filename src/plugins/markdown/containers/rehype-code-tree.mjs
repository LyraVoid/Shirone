import { h } from "hastscript";
import { createDisclosure } from "../core/disclosure.mjs";
import {
	createCodeTreeCompressIcon,
	createCodeTreeExpandIcon,
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

function renderNav(tree, iconMode, title, labels) {
	const ariaLabel = title ? `${title} ${labels.nav}` : labels.nav;
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

function renderPanels(files, codeChildren, activePath, title, labels) {
	// 配对策略（重要）：remark 会在每个代码块的 mdast data 上写入
	// data-file-index / data-file-path（见 src/plugins/markdown/code/remark-code-tree.mjs），
	// 但这些属性并不会随 Astro 的 Markdown 处理器传到这里——实测到达组件的
	// 直接子元素是不带任何属性的裸 pre。因此：
	//   1. 若子元素确实带索引/路径属性（单元测试、其他处理器管线），按
	//      索引优先、路径回退配对，可容忍子元素与 files 声明顺序不一致；
	//   2. 否则退回按 pre 元素位置配对。这在真实管线上是正确的：remark
	//      构建 files[] 与遍历代码子节点用的是同一次循环，files[i].index ===
	//      第 i 个代码块的位置；只需过滤掉容器里夹带的散文段落，避免整体错位。
	// hast 属性键为驼峰（dataFileIndex），兼容连字符原始拼写。
	const childAttr = (child, name) =>
		child.properties?.[name] ??
		child.properties?.[name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
	const hasIndexedChildren = codeChildren.some(
		(child) => childAttr(child, "data-file-index") !== undefined,
	);
	const codeBlocks = codeChildren.filter(
		(child) =>
			child.tagName === "pre" ||
			childAttr(child, "data-file-index") !== undefined,
	);
	const remaining = [...codeBlocks];
	const pickChild = (file, cleanPath) => {
		if (hasIndexedChildren) {
			let at = remaining.findIndex(
				(child) =>
					String(childAttr(child, "data-file-index")) === String(file.index),
			);
			if (at === -1) {
				at = remaining.findIndex(
					(child) => childAttr(child, "data-file-path") === cleanPath,
				);
			}
			if (at === -1) return h("pre", {}, "");
			return remaining.splice(at, 1)[0];
		}
		return remaining.shift() ?? h("pre", {}, "");
	};
	const panels = files.map((file) => {
		const cleanPath = String(file.path)
			.replace(/\\/g, "/")
			.replace(/^\.?\//, "");
		const child = pickChild(file, cleanPath);
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

	const contentLabel = title ? `${title} ${labels.content}` : labels.content;
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

function renderHeader(title, labels) {
	return h("div", { class: "m3-code-tree__header" }, [
		h("div", { class: "m3-code-tree__header-start" }, [
			h("span", { class: "m3-code-tree__header-icon", "aria-hidden": "true" }, [
				createCodeTreeHeaderIcon(),
			]),
			h("span", { class: "m3-code-tree__title" }, title || labels.defaultTitle),
		]),
		h("div", { class: "m3-code-tree__header-actions" }, [
			h(
				"button",
				{
					type: "button",
					class: "m3-code-tree__action-btn m3-code-tree__expand-btn",
					"aria-label": labels.expand,
					"data-expand-label": labels.expand,
					"data-collapse-label": labels.collapse,
					title: labels.expand,
				},
				[
					h("span", { class: "m3-code-tree__icon-expand" }, [
						createCodeTreeExpandIcon(),
					]),
					h("span", { class: "m3-code-tree__icon-collapse hidden" }, [
						createCodeTreeCompressIcon(),
					]),
				],
			),
		]),
	]);
}

export function CodeTreeComponent(properties, children) {
	const title = resolveTitle(properties?.title);
	const height = resolveHeight(properties?.height);
	const iconMode = resolveIconMode(properties?.icon);
	// 无障碍标签由 markdown-processor 注入（i18n），此处仅为独立调用兜底
	const labels = {
		nav: properties?.["label-nav"] ?? "File navigation",
		content: properties?.["label-content"] ?? "Code content",
		expand: properties?.["label-expand"] ?? "Expand code tree",
		collapse: properties?.["label-collapse"] ?? "Collapse code tree",
		defaultTitle: properties?.["label-default-title"] ?? "Project",
	};
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
	const header = renderHeader(title, labels);
	const nav = renderNav(tree, iconMode, title, labels);
	const main = renderPanels(files, codeChildren, activePath, title, labels);

	const bodyChildren = [nav, main];
	const containerChildren = [
		header,
		h("div", { class: "m3-code-tree__body" }, bodyChildren),
	];

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
