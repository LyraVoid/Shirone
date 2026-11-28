import { h } from "hastscript";
import { visit } from "unist-util-visit";

const TAB_MARKER = /^@tab(?::active)?(?:[\t ]+|$)/;

function isElement(node, tagName) {
	return Boolean(
		node?.type === "element" && (!tagName || node.tagName === tagName),
	);
}

function isWhitespace(node) {
	return node?.type === "text" && node.value.trim() === "";
}

function textContent(node) {
	if (!node) return "";
	if (Array.isArray(node)) return node.map(textContent).join("");
	if (node.type === "text") return node.value;
	return Array.isArray(node.children)
		? node.children.map(textContent).join("")
		: "";
}

function cloneNode(node) {
	if (!node || typeof node !== "object") return node;
	return {
		...node,
		...(Array.isArray(node.children)
			? { children: node.children.map(cloneNode) }
			: {}),
	};
}

function cloneNodes(nodes) {
	return nodes.map(cloneNode);
}

function firstTextNode(nodes) {
	for (const node of nodes) {
		if (node?.type === "text") return node;
		if (Array.isArray(node?.children)) {
			const child = firstTextNode(node.children);
			if (child) return child;
		}
	}
	return null;
}

function lastTextNode(nodes) {
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		const node = nodes[index];
		if (Array.isArray(node?.children)) {
			const child = lastTextNode(node.children);
			if (child) return child;
		}
		if (node?.type === "text") return node;
	}
	return null;
}

function parseMarker(node) {
	if (!isElement(node, "p")) return null;
	const rawText = textContent(node);
	if (rawText.includes("\n")) return null;
	const marker = rawText.match(TAB_MARKER);
	if (!marker) return null;

	const title = cloneNodes(node.children || []);
	const firstText = firstTextNode(title);
	if (!firstText) return null;
	firstText.value = firstText.value.replace(TAB_MARKER, "");

	let value = "";
	const finalText = lastTextNode(title);
	if (finalText) {
		const fullTitle = textContent(title);
		const valueMatch = fullTitle.match(/(?<=\S)#([^#\n]+)$/);
		if (valueMatch) {
			const localIndex =
				valueMatch.index - (fullTitle.length - finalText.value.length);
			if (localIndex >= 0) {
				value = valueMatch[1].trim();
				finalText.value = finalText.value.slice(0, localIndex).trimEnd();
			}
		}
	}

	const titleText = textContent(title).trim();
	if (!titleText) return null;
	return {
		active: rawText.startsWith("@tab:active"),
		title,
		value: value || titleText,
	};
}

function parseItems(children) {
	const visible = children.filter((node) => !isWhitespace(node));
	const items = [];
	let current = null;

	for (const node of visible) {
		const marker = parseMarker(node);
		if (marker) {
			if (current) items.push(current);
			current = { ...marker, body: [] };
			continue;
		}
		if (!current) return { fallback: visible, items: null };
		current.body.push(node);
	}
	if (current) items.push(current);

	if (
		items.length < 2 ||
		new Set(items.map((item) => item.value)).size !== items.length ||
		items.some(
			(item) =>
				item.body.filter((node) => !isWhitespace(node)).length === 0 ||
				!item.value,
		)
	) {
		return { fallback: visible, items: null };
	}
	return { fallback: visible, items };
}

function renderTab(item, index, activeIndex, groupId) {
	const selected = index === activeIndex;
	return h(
		"button",
		{
			id: `${groupId}-tab-${index + 1}`,
			className: [
				"m3-option-group__tab",
				"m3-state-layer",
				...(selected ? ["m3-option-group__tab--active"] : []),
			],
			type: "button",
			role: "tab",
			ariaControls: `${groupId}-panel-${index + 1}`,
			ariaSelected: selected ? "true" : "false",
			tabIndex: selected ? 0 : -1,
			dataOptionValue: item.value,
		},
		[
			h(
				"span",
				{ className: "m3-option-group__tab-label" },
				cloneNodes(item.title),
			),
		],
	);
}

function renderPanel(item, index, activeIndex, groupId) {
	const selected = index === activeIndex;
	return h(
		"section",
		{
			id: `${groupId}-panel-${index + 1}`,
			className: [
				"m3-option-group__panel",
				...(selected ? ["m3-option-group__panel--active"] : []),
			],
			role: "tabpanel",
			ariaLabelledBy: `${groupId}-tab-${index + 1}`,
			tabIndex: 0,
			dataOptionValue: item.value,
		},
		[
			h(
				"div",
				{ className: "m3-option-group__panel-title" },
				cloneNodes(item.title),
			),
			h("div", { className: "m3-option-group__panel-content" }, item.body),
		],
	);
}

export function OptionGroupsComponent(properties, children = []) {
	const { fallback, items } = parseItems(
		Array.isArray(children) ? children : [],
	);
	if (!items) return fallback;

	const activeMarker = items.findIndex((item) => item.active);
	const activeIndex = activeMarker >= 0 ? activeMarker : 0;
	const groupId = properties?.dataOptionGroupId || "shirone-options";
	const syncKey = String(properties?.sync || "").trim();

	return h(
		"div",
		{
			className: "m3-option-group not-prose",
			dataOptionGroup: "",
			dataInitialIndex: String(activeIndex),
			...(syncKey ? { dataSyncKey: syncKey } : {}),
		},
		[
			h(
				"div",
				{
					className: "m3-option-group__tablist",
					role: "tablist",
					ariaOrientation: "horizontal",
				},
				items.map((item, index) =>
					renderTab(item, index, activeIndex, groupId),
				),
			),
			h(
				"div",
				{ className: "m3-option-group__panels" },
				items.map((item, index) =>
					renderPanel(item, index, activeIndex, groupId),
				),
			),
		],
	);
}

/** Assigns stable document-local ids before the component renderer runs. */
export function rehypeOptionGroupIds() {
	return (tree) => {
		let groupIndex = 0;
		visit(tree, "element", (node) => {
			if (node.tagName !== "tabs") return;
			groupIndex += 1;
			node.properties ||= {};
			node.properties.dataOptionGroupId = `shirone-options-${groupIndex}`;
		});
	};
}
