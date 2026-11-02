import { join, posix, win32 } from "node:path";
import { fileSystemPathFromUrl } from "./resolve/paths.ts";

interface PagefindIndex {
	addDirectory(options: { path: string }): Promise<unknown>;
	writeFiles(options: { outputPath: string }): Promise<unknown>;
}

/**
 * Build Pagefind's index from Astro's output URL using native filesystem paths.
 * `windows` is only exposed so the Windows path contract can be tested on any
 * CI host; production callers omit it and use the current platform.
 */
export async function indexPagefindDirectory(
	dir: URL,
	index: PagefindIndex,
	options?: { windows?: boolean },
): Promise<void> {
	const outDir = fileSystemPathFromUrl(dir, options);
	const pathApi =
		options?.windows === undefined ? { join } : options.windows ? win32 : posix;

	await index.addDirectory({ path: outDir });
	await index.writeFiles({ outputPath: pathApi.join(outDir, "pagefind") });
}
