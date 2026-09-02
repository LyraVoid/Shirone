import { siteMarkdownProcessor } from "./markdown-processor.mjs";

let rendererPromise;

/** Compile backend-authored Markdown through the same pipeline as static content. */
export async function renderDynamicMarkdown(source, frontmatter = {}) {
	rendererPromise ??= siteMarkdownProcessor.createRenderer({});
	const renderer = await rendererPromise;
	const { code, metadata } = await renderer.render(source, { frontmatter });

	return {
		html: code,
		headings: metadata.headings ?? [],
		frontmatter: metadata.frontmatter ?? frontmatter,
	};
}
