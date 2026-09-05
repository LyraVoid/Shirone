# Packaging contract

Rules that new theme code has to respect so it keeps working when the theme is
installed from npm instead of cloned. None of them are visible in the source
repository — the code runs fine there either way — so they have to be applied
deliberately when writing the code, or discovered later as a broken release.

Read this alongside [npm-package-mode.md](./npm-package-mode.md), which explains
*how* the two modes coexist. This document is the checklist.

## The one rule everything else follows from

> In package mode the theme lives in `node_modules/shirones/`, and
> `process.cwd()` is the **user's project**, which contains no `src/`.

So: anything derived from `cwd` addresses the user's project, and anything
derived from the module's own location addresses the theme.

## Reading files at build time

**Do not** locate theme-owned files through `process.cwd()`:

```ts
// ✗ breaks in package mode: the user's project has no src/styles/
const css = await readFile(resolve(process.cwd(), "src/styles/markdown/trees.css"), "utf8");
```

Let the bundler inline the content instead. It is correct in both modes, and it
removes a disk read per render:

```ts
// ✓
import treesCss from "../styles/markdown/trees.css?raw";
```

`import.meta.url` is **not** a safe substitute: the pages are rendered by Node
during the build, and in that bundle Rollup rewrites `import.meta.url` to the
emitted chunk's location rather than the source file's.

> **"Server" in a static site.** Shirone ships as SSG — every page is HTML on
> disk and there is no server at runtime. But Astro still *renders* those pages
> by executing components in Node at build time, and Vite calls that build the
> SSR build (hence `src/integration/ssr-node-shims.ts`). So build-time Node
> concerns — `__dirname`, `require`, filesystem reads — are real here even
> though nothing runs on a server in production.

`process.cwd()` *is* correct when the target genuinely belongs to the user —
`public/images/albums/`, a directory named in their config, generated caches
under `.shirones/`.

### Files that exist in both places

Config-adjacent files that ship in the template land in `shirones/config/` in a
user's project but sit in `src/config/` in the source repository. Probe both,
user location first:

```ts
const found = [
  path.join(process.cwd(), "shirones", "config", "FooterConfig.html"),
  path.join(process.cwd(), "src", "config", "FooterConfig.html"),
].find((candidate) => fs.existsSync(candidate));
```

The same applies to any default path written into a config file — it will be
resolved against the user's project. `animeConfig.ts` defaults its snapshot
cache to `"src/data/anime-snapshots"`, which is why the pipeline rewrites that
literal to `shirones/config/data/anime-snapshots` when it scaffolds the
template. A new default of this kind needs either a rewrite rule in
`prepare-templates.mjs` or a path that is already correct in both layouts.

## Tailwind

`src/styles/main.css` must keep its `@source` directive immediately after the
import:

```css
@import "tailwindcss";
@source "../**/*.{astro,svelte,ts,tsx,js,jsx,mjs,cjs,md,mdx,html}";
```

Tailwind v4's automatic content detection **never scans `node_modules`**.
Without this line the package build emits the theme's own CSS variables and
Stylus component styles but none of the base utilities, producing a page whose
colours are right and whose layout has collapsed. The path is relative to the
CSS file, so it resolves to the theme's own `src/` in both modes.

## Imports and dependencies

- Anything reachable from a page — including transitively — must be in
  `dependencies`, never `devDependencies`. In source mode devDependencies are
  installed so the mistake is invisible; in package mode the user's build dies.
  If upstream really wants it as a devDependency, add it to
  `EXTRA_DEPENDENCIES` in the pipeline's `scripts/config.mjs`.
- Prefer the theme aliases (`@/`, `@components/`, `@utils/`, …) over deep
  relative paths that climb out of a directory. The overlay resolver
  understands aliases everywhere; relative escapes only work when the importer
  is inside the package.
- A package that is resolved by Node rather than Vite (`require.resolve`,
  dynamic `import()` outside the bundle) must be a **peer** dependency, because
  pnpm's strict layout hides the theme's own copy from the project root.

## Adding things

| You add | What to do |
| --- | --- |
| A route in `src/pages/` | Nothing. `routes.ts` discovers it and `injectRoute`s it. Non-HTML endpoints (`*.txt.ts`, `*.xml.ts`) are handled. |
| A config module in `src/config/` | Nothing, if it follows the existing shape — the template picks it up and its relative imports are rewritten. Keep it exporting through the `src/config/index.ts` barrel. |
| A data module in `src/data/` | Nothing. It is scaffolded to `shirones/config/data/`. Remember imports of `../config/x` become `../x` there. |
| A component or layout | Nothing for it to work; it becomes overridable automatically. |
| A new top-level `src/` directory | Nothing, except for `content/` and `integration/`. The shirones pipeline copies every top-level `src/` directory not in `PACKAGE_SRC_EXCLUDES` (`scripts/config.mjs`, currently `content` and `integration`). `content/` is user-owned and ships through the template; `integration/` is the theme's own wiring that shirones rebuilds for npm mode. (This used to be a whitelist, `PACKAGE_SRC_DIRS` — `src/user/` was added upstream and missed it, breaking the packaged build. That failure mode is gone.) |
| A file that is neither source nor content (`.html`, `.json`, an asset read at runtime) | Decide who owns it. Theme-owned → import it through the bundler. User-owned → ship it in the template and probe both locations. |

## Before merging into the packaged branch

Run a dry run of the pipeline: **shirones → Actions → Build & Publish → Run
workflow**, set *Upstream branch/tag* to your branch and tick *Build and
validate, but do not publish*. It performs a real install, `shirones init`, an
`astro build` and a dev-server smoke test in a scratch project — which is what
catches the failures above before a user does.

## Verifying a release against the source site

The check that has caught every regression so far is a diff of the two deployed
sites — the package build and the source build — rather than reading diffs:

1. Every route returns the same status on both.
2. Per page, the set of `data-*` attribute names, custom element tag names and
   the `<script>` count are identical. A feature that silently failed to load
   shows up here as an attribute present on one side only.
3. Per page, the set of CSS classes used in the HTML but not defined in any
   stylesheet. Compare the package build's missing set **against the source
   build's missing set** — only the difference is signal. Strip Tailwind's
   escapes (`.replace("\\","")`) before extracting selectors, or the result is
   hundreds of false positives.
