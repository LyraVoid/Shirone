/** Type surface of markdown-extensions.mjs. */

export interface MarkdownExtensions {
	/** Changes whenever a plugin script changes; empty without extensions. */
	digest: string;
	remark: { plugin: unknown; at: "before-directive" | "after-directive" }[];
	rehype: { plugin: unknown; at: "before-components" | "end" }[];
	/** Directive name to renderer. */
	directives: Record<
		string,
		(properties: Record<string, unknown>, children: unknown[]) => unknown
	>;
}

export declare const NO_MARKDOWN_EXTENSIONS: MarkdownExtensions;

export declare function publishMarkdownExtensions(
	extensions: MarkdownExtensions,
): void;

export declare function readMarkdownExtensions(): MarkdownExtensions;

export declare function hasMarkdownExtensions(
	extensions: MarkdownExtensions,
): boolean;

export declare function remarkPluginScriptsDigest(): () => void;

export declare function assertMarkdownExtensionsVisible(
	expected: string | undefined,
): void;

export declare function extendMarkdownPlugins(
	base: {
		remarkPlugins: unknown[];
		rehypePlugins: unknown[];
		directive: unknown;
		probes: unknown;
		components: unknown;
	},
	extensions: MarkdownExtensions,
): { remarkPlugins: unknown[]; rehypePlugins: unknown[] };
