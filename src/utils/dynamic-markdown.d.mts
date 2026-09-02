import type { MarkdownHeading } from "astro";

export interface DynamicMarkdownResult {
	html: string;
	headings: MarkdownHeading[];
	frontmatter: Record<string, unknown>;
}

export declare function renderDynamicMarkdown(
	source: string,
	frontmatter?: Record<string, unknown>,
): Promise<DynamicMarkdownResult>;
