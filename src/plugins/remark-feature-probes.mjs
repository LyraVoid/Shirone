import { visit } from "unist-util-visit";
import { createMarkdownSyntaxSnapshot } from "../utils/markdown-syntaxes.mjs";
import { getAcFunEmbedData } from "./markdown/core/acfun.mjs";
import { getArtPlayerEmbedData } from "./markdown/core/artplayer.mjs";
import { getAudioReaderEmbedData } from "./markdown/core/audio-reader.mjs";
import { getBilibiliEmbedData } from "./markdown/core/bilibili.mjs";
import { getYouTubeEmbedData } from "./markdown/core/youtube.mjs";

const IMAGE_PRESENTATION_WIDTH_TOKEN = /(?:^|\s)w-(?:[1-9]\d?|100)%(?=\s|$)/;

function getDirectiveLabel(children = []) {
	return children
		.map((child) => (typeof child.value === "string" ? child.value : ""))
		.join("")
		.trim();
}

/**
 * Collect content capabilities during the shared Markdown compilation pass.
 * The values are consumed by route templates to keep optional assets page-scoped.
 */
export function remarkFeatureProbes() {
	return (tree, { data }) => {
		const syntaxes = new Set();
		if (tree.data?.shironeIncludes) syntaxes.add("include");

		visit(tree, (node, _index, parent) => {
			if (node.type === "math" || node.type === "inlineMath") {
				syntaxes.add("math");
			}
			if (
				node.type === "mermaid" ||
				(node.type === "code" && node.lang?.toLowerCase() === "mermaid")
			) {
				syntaxes.add("mermaid");
			}
			if (
				node.type === "code" &&
				!(parent?.type === "containerDirective" && parent.name === "code-tree")
			) {
				syntaxes.add("expressive-code");
			}
			if (
				node.type === "fileTree" ||
				(node.type === "containerDirective" && node.name === "file-tree")
			) {
				syntaxes.add("file-tree");
			}
			if (
				node.type === "containerDirective" &&
				node.name === "code-tree" &&
				node.children?.some((child) => child.type === "code")
			) {
				syntaxes.add("code-tree");
			}
			if (node.type === "containerDirective" && node.name === "collapse") {
				syntaxes.add("collapse-panels");
			}
			if (node.type === "textDirective" && node.name === "m3-mark") {
				syntaxes.add("marker");
			}
			if (node.type === "textDirective" && node.name === "spoiler") {
				syntaxes.add("spoiler");
			}
			if (
				node.type === "textDirective" &&
				node.name === "audio-reader" &&
				getAudioReaderEmbedData(
					node.attributes,
					getDirectiveLabel(node.children),
				)
			) {
				syntaxes.add("audio-reader");
			}
			if (node.type === "leafDirective" && node.name === "github") {
				syntaxes.add("github-card");
			}
			if (
				node.type === "leafDirective" &&
				node.name === "acfun" &&
				getAcFunEmbedData(node.attributes)
			) {
				syntaxes.add("acfun");
			}
			if (
				node.type === "leafDirective" &&
				node.name === "artplayer" &&
				getArtPlayerEmbedData(node.attributes)
			) {
				syntaxes.add("artplayer");
			}
			if (
				node.type === "leafDirective" &&
				node.name === "bilibili" &&
				getBilibiliEmbedData(node.attributes)
			) {
				syntaxes.add("bilibili");
			}
			if (
				node.type === "leafDirective" &&
				node.name === "youtube" &&
				getYouTubeEmbedData(node.attributes)
			) {
				syntaxes.add("youtube");
			}
			if (node.type === "contentAnnotationReference") {
				syntaxes.add("content-annotation");
			}
			if (node.type === "containerDirective" && node.name === "steps") {
				syntaxes.add("steps");
			}
			if (
				node.type === "containerDirective" &&
				[
					"note",
					"info",
					"tip",
					"important",
					"warning",
					"caution",
					"admonition-details",
				].includes(node.name)
			) {
				syntaxes.add("admonition");
			}
			if (node.type === "abbreviation") {
				syntaxes.add("abbreviation");
			}
			if (node.type === "containerDirective" && node.name === "grid") {
				syntaxes.add("image-grid");
			}
			if (
				node.type === "image" &&
				parent?.type === "paragraph" &&
				parent.children.length === 1 &&
				(Boolean(node.title?.trim()) ||
					IMAGE_PRESENTATION_WIDTH_TOKEN.test(node.alt ?? ""))
			) {
				syntaxes.add("image-presentation");
			}
			if (node.type === "containerDirective" && node.name === "tabs") {
				syntaxes.add("option-groups");
			}
			if (node.type === "containerDirective" && ["field", "field-group"].includes(node.name)) {
				syntaxes.add("fields");
			}
		});

		data.astro.frontmatter.markdownSyntaxes = createMarkdownSyntaxSnapshot([
			...syntaxes,
		]);
	};
}
