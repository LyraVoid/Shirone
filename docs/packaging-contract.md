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
> SSR build (hence `src/integration/vite/ssr-node-shims.ts`). So build-time Node
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

### Every relative import used by the copied CLI must be in the package archive

The package publisher copies the CLI rather than bundling it. A relative import
that works in the source tree is not automatically present in the published
archive, especially when its source directory is excluded from the package
payload. A missing sibling is discovered only after a successful install, when
`shirones init` fails with `ERR_MODULE_NOT_FOUND`.

`src/integration/version-range.mjs` is shared with `verify-peers.ts` so peer
validation and `init --update` use the same range logic. The integration bundle
can inline that import; the standalone CLI still needs the sibling at its
published relative path (or a packaging step that bundles the CLI without
changing its dependency-free startup contract).

**Release validation must use the actual archive.** The publisher should derive
or explicitly maintain the CLI sibling list, inspect the `npm pack` tarball,
install that tarball in a clean temporary project, and invoke the CLI path that
imports the range engine (including `init --update`). A source-only manifest
check or a successful import from the repository does not prove that the
published package contains the file.

### What the range engine does and does not decide

`src/integration/version-range.mjs` is a deliberate SemVer **subset**, shared by
`verify-peers.ts` and `cli.mjs` so the two cannot drift. It reads full and
partial versions (for example `^7`, `^8`, `~7.3`, and `7.3.x`), caret and tilde
ranges including both 0.x caret boundaries, and comparator sets as
conjunctions. Full SemVer prerelease identifiers are compared in order, and
build metadata does not affect precedence.

The following limits are deliberate:

- **Prerelease admission follows npm's tuple rule.** A prerelease version is
  rejected unless the range explicitly names a prerelease comparator on that
  same `major.minor.patch` tuple. Thus `7.4.0-beta.1` does not satisfy `^7.3.5`
  or `*`, while `>=7.3.6-beta.1 <8.0.0` can admit matching prereleases of
  `7.3.6` that fall inside both bounds.
- **Unsupported range syntax fails open.** `||`, `workspace:`, `file:`,
  `link:`, `npm:`, dist-tags, and hyphen ranges are not interpreted; they do
  not cause a peer violation or a CLI rewrite. This avoids rejecting a build
  for syntax the lightweight engine cannot safely assess.
- **An installed version is ground truth for the current project.** When
  `node_modules/<pkg>` exists, that concrete version decides even if the
  declared range is broader. For example, `astro: ^7.0.0` with `astro@7.4.2`
  installed passes if the theme requires `^7.3.5`. This is useful with a valid
  lockfile, but it does **not** prove every version allowed by `^7.0.0` is
  supported; a fresh install could choose an older release. The check and
  `init --update` only repair ranges that provably have no compatible version;
  they do not narrow a broad range. Keep the declared floor and lockfile
  appropriate for the project that will be installed.

This is not a complete SemVer implementation, and the peer-check message does
not claim it is. Do not describe the check as full SemVer validation.

## The peer dependency list

The shortest possible one, and each entry has a verified reason in
`src/integration/verify-peers.ts`. Three distinct mechanisms force a package
onto the user's project:

| Mechanism | Packages | Why bundling fails |
| --- | --- | --- |
| Imported by the user's own config | `astro` | the project *is* an Astro project |
| Imported by the user's config **and** declared a peer by it | `svelte`, `@astrojs/svelte` | `astro.config.mjs` imports `@astrojs/svelte` to register the integration, and that package names `svelte` a peer dependency — so both resolve from the project root, and a nested copy stays invisible to pnpm's peer resolution |
| Imported by Astro itself, dynamically | `sharp` | Astro's image service resolves it from its own location; the `@img/*` bindings must also be version-matched |

`@astrojs/svelte` does place a `optimizeDeps.exclude: ["svelte"]` entry, but
that is not the reason for the peer: the entry only *names* `svelte`, and the
name resolves wherever the resolved layout puts it. The root dependency is
required by the config-file import and the peer relationship, not by that list.

Plus `@astrojs/check` and `typescript`, which only `astro check` needs — they
are declared so the command works right after `init`, not because a build
requires them.

The four `@iconify-json/*` sets used to belong in this table. They were
removed when `astro-icon` was dropped: it located icon sets by reading the
**user's** `package.json`, so no amount of bundling could make them
transitive. Nothing in the theme reads a manifest for icons any more —
`vite/icon/collections.ts` resolves them from inside the installed package and
emits a tree-shaken collection — so they now ship as ordinary dependencies.

That is the case worth internalising: *resolving* and *discovering* are
different questions, and only the consumer's source tells you which one it
does. A package that resolves fine from inside the theme is still unusable if
the consumer looks it up in a manifest you do not control. The removal left
one extra step behind — the theme now owns icon rendering, including the
`local` collection a project's own `src/icons/*.svg` feeds, and the
`@iconify/svelte` alias is mirrored in `tsconfig.json` so TypeScript resolves
the theme's `Icon.svelte` rather than the real package's deprecated types.

`src/integration/verify-peers.ts` is the single source of truth for that list,
and `astro:config:setup` enforces it before anything expensive runs. Adding a
package there means adding it to `PEER_REQUIREMENTS`, choosing its tier, and
writing down the mechanism — the reason string is user-visible, so it is the
contract's documentation as much as the code is. Its tests
(`tests/verify-peers.test.mjs`) cover absent, stale, unparseable and
tooling-only cases.

## Adding things

| You add | What to do |
| --- | --- |
| A route in `src/pages/` | Nothing. `routes.ts` discovers it and `injectRoute`s it. Non-HTML endpoints (`*.txt.ts`, `*.xml.ts`) are handled. |
| A config module in `src/config/` | Nothing, if it follows the existing shape — the template picks it up and its relative imports are rewritten. Keep it exporting through the `src/config/index.ts` barrel. |
| An integration option (swup, expressive-code, svelte, mdx, or the shared `vite.build` keys) | Put it in `src/config/integrationsConfig.ts`, not in the wiring. The integration — the single Astro config entry point for source mode and package mode alike — reads it, so one edit covers both. Do **not** export it through the barrel and do **not** route it through `withUserConfig` — package mode bundles this file at build time, so it has no user-overlay layer. Wiring (aliases, `preprocess`, `optimizeDeps`, `vite.plugins`, expressive-code `themes`/`plugins`) stays in `src/integration/index.ts`, where per-mode branches are commented. |
| A content collection | Three things, all in this repo. Export its schema from `src/integration/collections.ts` (name it `<singular>Schema`), declare it in `src/content.config.ts` with `glob({ base: "./src/content/<key>", … })`, and add one entry to `src/integration/collections.manifest.json`. `tests/collections-manifest.test.mjs` fails if those three disagree. The pipeline reads that manifest to generate a package-mode user's `content.config.ts`, and copies `src/content/` recursively, so **shirones needs no change**. |
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
