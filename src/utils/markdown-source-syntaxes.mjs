import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { remarkCodeTree } from "../plugins/markdown/code/remark-code-tree.mjs";
import { remarkFileTree } from "../plugins/markdown/code/remark-file-tree.mjs";
import { remarkMermaid } from "../plugins/remark-mermaid.mjs";
import { createMarkdownSyntaxSnapshot } from "./markdown-syntaxes.mjs";

const sourceSyntaxProcessor = unified()
	.use(remarkParse)
	.use(remarkDirective)
	.use(remarkFileTree)
	.use(remarkCodeTree)
	.use(remarkMermaid);

/**
 * Detects source-only syntax facts for integrations that run before Astro
 * exposes render frontmatter.
 */
export function getSourceMarkdownSyntaxSnapshot(source = "") {
	const tree = sourceSyntaxProcessor.runSync(
		sourceSyntaxProcessor.parse(source),
	);
	let hasExpressiveCode = false;

	visit(tree, "code", (_node, _index, parent) => {
		if (parent?.type === "containerDirective" && parent.name === "code-tree") {
			return;
		}

		hasExpressiveCode = true;
	});

	return createMarkdownSyntaxSnapshot(
		hasExpressiveCode ? ["expressive-code"] : [],
	);
}
