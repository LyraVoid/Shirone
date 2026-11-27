/**
 * Serve the icon collection as the virtual module `virtual:shirone-icons`.
 *
 * The collection used to be a file: written into the project's
 * `src/generated/`, with a second copy shipped in the package and a redirect
 * to pick between them. Two files meant two modes that could disagree — the
 * redirect silently lost to Vite's own resolver, so package-mode projects
 * rendered only the icons the theme itself uses. A virtual module has one
 * source in both modes and nothing on disk to go stale.
 *
 * `buildStart` generates it for `astro dev`, `astro build` and `astro sync`
 * alike; the file watcher regenerates it while the dev server is up.
 */

import { extname, join } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { normalisePath } from "../../resolve/paths.ts";
import type { ResolvedShironesPaths } from "../../types.ts";
import {
	buildIconCollections,
	ICON_COLLECTIONS_ID,
	SOURCE_EXTENSIONS,
} from "./collections.ts";

const RESOLVED_ID = `\0${ICON_COLLECTIONS_ID}`;

/**
 * The file this module replaced. An `Icon.svelte` override copied from an
 * older version still imports it; by the time the specifier gets here the `@/`
 * alias may have rewritten it to an absolute path, with either separator.
 */
const LEGACY_SPECIFIER =
	/(^@|[\\/]src)[\\/]generated[\\/]local-icon-collections(\.ts)?$/;

/** Coalesce the burst of events one save produces. */
const DEBOUNCE_MS = 150;

/**
 * Pending runs, keyed by project root at module scope.
 *
 * Module scope rather than a closure variable because the dev server rebuilds
 * this plugin whenever the config changes; a timer captured by a discarded
 * instance would still fire.
 */
const pending = new Map<string, ReturnType<typeof setTimeout>>();

export function shironesIconRegeneration(
	paths: ResolvedShironesPaths,
	logger?: { warn: (message: string) => void },
	/**
	 * Extra files or directories to scan, as absolute paths. The integration
	 * passes the targets of `ShironesOptions.components` here: an explicit
	 * override may live outside every directory listed below.
	 */
	extraSources: string[] = [],
): Plugin {
	// Everywhere an icon name can be written and end up rendered. No mode
	// check, so both modes scan the same places: in source mode the project's
	// `src/` is `packageSrc` and contains the other three; in package mode they
	// default to `shirones/`, and `options.paths` can move them anywhere.
	const roots = [
		paths.packageSrc,
		join(paths.projectRoot, "src"),
		paths.contentDir,
		paths.configDir,
		paths.dataDir,
		...extraSources,
	];
	// The project's own `src/icons/`, emitted as the `local` collection. It is
	// the only icon source owned by the user, so it is resolved from
	// `projectRoot` rather than from the package.
	const localIconDir = join(paths.projectRoot, "src", "icons");
	const watchedRoots = [...roots, localIconDir].map((root) =>
		normalisePath(root),
	);

	// Set by `configResolved`; see the thumbnails plugin for the rationale.
	let isBuild = false;
	let code = "export const localIconCollections = [];\n";
	// Regeneration runs on every save; say each bad name once.
	const reported = new Set<string>();

	/** Regenerate; returns whether the module changed. */
	const generate = (): boolean => {
		try {
			const result = buildIconCollections({ roots, localIconDir });
			for (const { icon, file } of result.unknown) {
				if (reported.has(icon)) continue;
				reported.add(icon);
				logger?.warn(
					`Unknown icon ${icon} (referenced in ${file}) is skipped and renders as nothing.`,
				);
			}
			const changed = result.code !== code;
			code = result.code;
			return changed;
		} catch (error) {
			const message = `[shirone] icon collection generation failed: ${
				error instanceof Error ? error.message : String(error)
			}`;
			// What is left to throw is a broken install (a missing icon set),
			// which would blank every icon: fail a build, keep the dev server
			// up on the previous collection.
			if (isBuild) throw new Error(message, { cause: error });
			logger?.warn(message);
			return false;
		}
	};

	/** Hand the regenerated module to a running dev server. */
	const refresh = (server: ViteDevServer) => {
		for (const environment of Object.values(server.environments)) {
			const module = environment.moduleGraph.getModuleById(RESOLVED_ID);
			if (module) environment.reloadModule(module);
		}
		// Server-rendered icons are plain HTML; only a reload redraws them.
		server.environments.client.hot.send({ type: "full-reload" });
	};

	return {
		name: "shirone:icon-regeneration",
		// `pre` so the legacy specifier is answered here even where a stale
		// generated file is still on disk for Vite's own resolver to find.
		enforce: "pre",

		configResolved(config) {
			isBuild = config.command === "build";
		},

		resolveId(source) {
			return source === ICON_COLLECTIONS_ID || LEGACY_SPECIFIER.test(source)
				? RESOLVED_ID
				: null;
		},

		load(id) {
			return id === RESOLVED_ID ? code : null;
		},

		buildStart() {
			generate();
		},

		// The watcher rather than `handleHotUpdate`: Vite calls that hook only
		// for changed files, so an icon in a newly created file went unnoticed
		// until something else was saved.
		configureServer(server) {
			server.watcher.on("all", (event, file) => {
				if (event !== "add" && event !== "change" && event !== "unlink") return;
				// Only a scanned source or a project icon can change the result.
				const extension = extname(file);
				if (extension !== ".svg" && !SOURCE_EXTENSIONS.has(extension)) return;
				const path = normalisePath(file);
				if (
					!watchedRoots.some(
						(root) => path === root || path.startsWith(`${root}/`),
					)
				)
					return;
				clearTimeout(pending.get(paths.projectRoot));
				pending.set(
					paths.projectRoot,
					setTimeout(() => {
						if (generate()) refresh(server);
					}, DEBOUNCE_MS),
				);
			});
		},
	};
}
