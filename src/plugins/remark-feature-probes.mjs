import { visit } from "unist-util-visit";

/**
 * Collect content capabilities during the shared Markdown compilation pass.
 * The values are consumed by route templates to keep optional assets page-scoped.
 */
export function remarkFeatureProbes() {
	return (tree, { data }) => {
		const markdownFeatures = {
			math: false,
			mermaid: false,
			codeInteractions: false,
			trees: false,
		};

		visit(tree, (node) => {
			if (node.type === "math" || node.type === "inlineMath") {
				markdownFeatures.math = true;
			}
			if (
				node.type === "mermaid" ||
				(node.type === "code" && node.lang?.toLowerCase() === "mermaid")
			) {
				markdownFeatures.mermaid = true;
			}
			if (
				node.type === "code" &&
				(node.meta?.includes("collapse") || node.meta?.includes("tree"))
			) {
				markdownFeatures.codeInteractions = true;
			}
			if (
				node.type === "fileTree" ||
				(node.type === "containerDirective" && node.name === "file-tree") ||
				(node.type === "containerDirective" &&
					node.name === "code-tree" &&
					node.children?.some((child) => child.type === "code"))
			) {
				markdownFeatures.trees = true;
			}
		});

		data.astro.frontmatter.markdownFeatures = markdownFeatures;
		data.astro.frontmatter.hasMath = markdownFeatures.math;
		data.astro.frontmatter.hasMermaid = markdownFeatures.mermaid;
		data.astro.frontmatter.hasCodeInteractions =
			markdownFeatures.codeInteractions;
	};
}
