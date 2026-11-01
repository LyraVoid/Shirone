import { visit } from "unist-util-visit";

/**
 * Keep the source fallback keyboard-scrollable in both Astro's Markdown and
 * MDX compilation paths. Applying the attribute at the final HAST stage avoids
 * differences in how each compiler serializes remark `hChildren` properties.
 */
export function rehypeMermaidFallback() {
	return (tree) => {
		visit(tree, "element", (node) => {
			if (node.tagName !== "pre") return;
			const classes = node.properties?.className;
			if (
				Array.isArray(classes) &&
				classes.includes("markdown-mermaid__fallback")
			) {
				node.properties.tabIndex = 0;
			}
		});
	};
}
