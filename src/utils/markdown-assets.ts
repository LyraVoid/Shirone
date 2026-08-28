import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import markdownManifest from "../plugins/markdown/manifest.json" with {
	type: "json",
};

type MarkdownStylesheetPack = {
	id: string;
	syntaxes: readonly string[];
	styles: readonly string[];
};

type MarkdownSyntaxSnapshot = {
	schema: 1;
	syntaxes: readonly string[];
};

const stylesheetPacks =
	markdownManifest.stylesheetPacks as readonly MarkdownStylesheetPack[];

/**
 * Resolves page-scoped stylesheets from manifest-owned syntax declarations.
 * The template marks each style block as Swup-optional so stale syntax styles
 * are removed during Swup navigation.
 */
export async function getMarkdownStylesheetAssets(
	snapshot: MarkdownSyntaxSnapshot,
): Promise<Array<{ pack: string; css: string }>> {
	const activePacks = stylesheetPacks.filter(({ syntaxes }) =>
		syntaxes.some((syntaxId) => snapshot.syntaxes.includes(syntaxId)),
	);
	return Promise.all(
		activePacks.map(async ({ id, styles }) => ({
			pack: id,
			css: (
				await Promise.all(
					styles.map((stylePath) =>
						readFile(resolve(process.cwd(), stylePath), "utf8"),
					),
				)
			).join("\n"),
		})),
	);
}
