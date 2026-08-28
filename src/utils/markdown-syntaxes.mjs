import markdownManifest from "../plugins/markdown/manifest.json" with {
	type: "json",
};

export const MARKDOWN_SYNTAX_SNAPSHOT_SCHEMA = 1;

const knownSyntaxIds = new Set(markdownManifest.syntaxes.map(({ id }) => id));

export function createMarkdownSyntaxSnapshot(syntaxes = []) {
	const normalizedSyntaxes = [...new Set(syntaxes)].sort();
	const unknownSyntaxId = normalizedSyntaxes.find(
		(syntaxId) => !knownSyntaxIds.has(syntaxId),
	);

	if (unknownSyntaxId) {
		throw new Error(`Unknown Markdown syntax ID: ${unknownSyntaxId}`);
	}

	return {
		schema: MARKDOWN_SYNTAX_SNAPSHOT_SCHEMA,
		syntaxes: normalizedSyntaxes,
	};
}

export function hasMarkdownSyntax(snapshot, syntaxId) {
	return (
		snapshot?.schema === MARKDOWN_SYNTAX_SNAPSHOT_SCHEMA &&
		Array.isArray(snapshot.syntaxes) &&
		snapshot.syntaxes.includes(syntaxId)
	);
}

export function mergeMarkdownSyntaxSnapshots(...snapshots) {
	return createMarkdownSyntaxSnapshot(
		snapshots.flatMap((snapshot) =>
			snapshot?.schema === MARKDOWN_SYNTAX_SNAPSHOT_SCHEMA &&
			Array.isArray(snapshot.syntaxes)
				? snapshot.syntaxes
				: [],
		),
	);
}
