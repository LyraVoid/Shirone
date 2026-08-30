import { h } from "hastscript";

const TAGS = new Set(["name", "type", "default", "required", "optional", "deprecated", "description"]);

function textContent(node) {
	if (!node) return "";
	if (Array.isArray(node)) return node.map(textContent).join("");
	if (node.type === "text") return node.value || "";
	return Array.isArray(node.children) ? node.children.map(textContent).join("") : "";
}

function parseMetadata(children, fallbackName) {
	const metadata = { name: fallbackName };
	const body = [];
	for (const child of Array.isArray(children) ? children : []) {
		if (child.type !== "element" || child.tagName !== "p") { body.push(child); continue; }
		const lines = textContent(child).split("\n").map((line) => line.trim()).filter(Boolean);
		if (!lines.length || lines.some((line) => !line.startsWith("@"))) { body.push(child); continue; }
		let recognized = true;
		for (const line of lines) {
			const match = line.match(/^@([a-z]+)(?:\s+(.*))?$/i);
			if (!match || !TAGS.has(match[1].toLowerCase())) { recognized = false; break; }
			const tag = match[1].toLowerCase();
			const value = (match[2] || "").trim().replace(/^`|`$/g, "");
			if (["required", "optional", "deprecated"].includes(tag)) metadata[tag] = true;
			else if (value) metadata[tag] = value;
		}
		if (!recognized) body.push(child);
	}
	return { metadata, body };
}

export function FieldGroupComponent(_properties, children = []) {
	return h("div", { class: "m3-field-group not-prose", "data-field-group": true }, children);
}

export function FieldComponent(properties = {}, children = []) {
	let content = Array.isArray(children) ? [...children] : [];
	let label = String(properties.name || "").trim();
	if (properties["has-directive-label"] && content.length) {
		label = label || textContent(content.shift()).trim();
	}
	const { metadata, body } = parseMetadata(content, label);
	const name = metadata.name || String(properties.name || "").trim();
	const status = metadata.required ? properties["label-required"] : metadata.optional ? properties["label-optional"] : metadata.deprecated ? properties["label-deprecated"] : "";
	const meta = [h("span", { class: "m3-field__name" }, name)];
	if (status) meta.push(h("span", { class: `m3-field__status m3-field__status--${metadata.required ? "required" : metadata.deprecated ? "deprecated" : "optional"}` }, status));
	if (metadata.type) meta.push(h("code", { class: "m3-field__type" }, metadata.type));
	const output = [h("div", { class: "m3-field__meta" }, meta)];
	if (metadata.default) output.push(h("code", { class: "m3-field__default" }, metadata.default));
	if (body.length) output.push(h("div", { class: "m3-field__description" }, body));
	return h("div", { class: "m3-field", "data-field": true }, output);
}
