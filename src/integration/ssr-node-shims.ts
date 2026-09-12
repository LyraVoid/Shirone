import nodePath from "node:path";
import type { Plugin } from "vite";

/**
 * Some of the theme's build-time dependencies are CommonJS packages that read
 * `__dirname` / `__filename` / `require` at runtime (for example `stylus`,
 * which the music sidebar and the Twikoo widget use to compile their inline
 * stylesheets).
 *
 * In the source-mode repository those packages stay *external* to the SSR
 * bundle, so Node loads them as real CJS and the globals exist. In npm-package
 * mode the theme lives inside `node_modules`, so Vite happily inlines them into
 * the ESM prerender chunks — where `__dirname` is not defined and rendering
 * dies with `ReferenceError: __dirname is not defined`.
 *
 * Rather than trying to keep every such package external (which would then fail
 * to resolve from the emitted chunk under pnpm's strict layout), we simply
 * re-create the CJS globals at the top of any SSR chunk that references them.
 */
export function shironesSsrNodeShims(): Plugin {
	let isSsr = false;

	return {
		name: "shirones:ssr-node-shims",
		apply: "build",
		enforce: "post",
		/**
		 * Per-module fix: give every bundled CommonJS module inside
		 * `node_modules` its *real* `__dirname` / `__filename`, so packages that
		 * load sibling files from disk at runtime (stylus reads
		 * `lib/functions/index.styl`) keep working after being inlined.
		 */
		transform(code, id, transformOptions) {
			if (!transformOptions?.ssr) return null;
			if (!id.includes("node_modules")) return null;
			const file = id.split("?")[0];
			if (!/\.(c?js)$/.test(file)) return null;

			const usesFilename =
				/(?<![\w$.])__filename(?![\w$])/.test(code) &&
				!/(?:const|let|var|function)\s+__filename\b/.test(code);
			const usesDirname =
				/(?<![\w$.])__dirname(?![\w$])/.test(code) &&
				!/(?:const|let|var|function)\s+__dirname\b/.test(code);
			if (!usesFilename && !usesDirname) return null;

			const lines: string[] = [];
			if (usesFilename) {
				lines.push(`const __filename = ${JSON.stringify(file)};`);
			}
			if (usesDirname) {
				lines.push(
					`const __dirname = ${JSON.stringify(nodePath.dirname(file))};`,
				);
			}
			return { code: `${lines.join("\n")}\n${code}`, map: null };
		},
		configResolved(config) {
			isSsr = Boolean(config.build?.ssr);
		},
		renderChunk(code) {
			if (!isSsr) return null;

			const filenameDeclared = /(?:const|let|var|function)\s+__filename\b/.test(
				code,
			);
			const needsFilename =
				/(?<![\w$.])__filename(?![\w$])/.test(code) && !filenameDeclared;
			const needsDirname =
				/(?<![\w$.])__dirname(?![\w$])/.test(code) &&
				!/(?:const|let|var|function)\s+__dirname\b/.test(code);
			const needsRequire =
				/(?<![\w$.])require\s*\(/.test(code) &&
				!/(?:const|let|var|function)\s+require\b/.test(code);

			if (!needsFilename && !needsDirname && !needsRequire) return null;

			const lines: string[] = [];
			if (needsFilename || needsDirname) {
				lines.push(
					'import { fileURLToPath as __shironesFileURLToPath } from "node:url";',
				);
			}
			if (needsDirname) {
				lines.push('import { dirname as __shironesDirname } from "node:path";');
			}
			if (needsRequire) {
				lines.push(
					'import { createRequire as __shironesCreateRequire } from "node:module";',
				);
			}
			if (needsFilename) {
				lines.push(
					"const __filename = __shironesFileURLToPath(import.meta.url);",
				);
			}
			if (needsDirname) {
				lines.push(
					`const __dirname = __shironesDirname(${filenameDeclared ? "__filename" : needsFilename ? "__filename" : "__shironesFileURLToPath(import.meta.url)"});`,
				);
			}
			if (needsRequire) {
				lines.push("const require = __shironesCreateRequire(import.meta.url);");
			}

			// `__filename` may be declared without being used when only
			// `__dirname` was requested; that is harmless.
			return { code: `${lines.join("\n")}\n${code}`, map: null };
		},
	};
}
