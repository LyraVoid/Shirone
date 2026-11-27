/** markdown-processor.mjs 的类型面（实现文件为 .mjs，astro.config 与 content-utils 共用） */

import type { MarkdownExtensions } from "./markdown-extensions.mjs";

export interface SiteMarkdownRenderResult {
	code: string;
	metadata: Record<string, unknown>;
}

export interface SiteMarkdownRenderer {
	render(
		content: string,
		renderOpts?: {
			fileURL?: URL;
			frontmatter?: Record<string, unknown>;
		},
	): Promise<SiteMarkdownRenderResult>;
}

export interface SiteMarkdownProcessor {
	name: "unified";
	options: {
		remarkPlugins: unknown[];
		rehypePlugins: unknown[];
	};
	createRenderer(
		shared?: Record<string, unknown>,
	): Promise<SiteMarkdownRenderer>;
}

export declare const siteMarkdownProcessor: SiteMarkdownProcessor;

/** Build the processor with a project's plugin-script extensions applied. */
export declare function createSiteMarkdownProcessor(
	extensions?: MarkdownExtensions,
): SiteMarkdownProcessor;
