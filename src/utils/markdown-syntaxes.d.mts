export interface MarkdownSyntaxSnapshot {
	schema: 1;
	syntaxes: readonly string[];
}

export declare const MARKDOWN_SYNTAX_SNAPSHOT_SCHEMA: 1;

export declare function createMarkdownSyntaxSnapshot(
	syntaxes?: readonly string[],
): MarkdownSyntaxSnapshot;

export declare function hasMarkdownSyntax(
	snapshot: unknown,
	syntaxId: string,
): boolean;

export declare function mergeMarkdownSyntaxSnapshots(
	...snapshots: unknown[]
): MarkdownSyntaxSnapshot;
