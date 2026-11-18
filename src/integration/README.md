# `src/integration/`

The theme runs in two modes and this directory is where they meet.

| Mode | What `shirones()` is | `paths.packageSrc` points at |
|---|---|---|
| Source | the repo itself, via `astro.config.mjs` | `<repo>/src` |
| Package | `node_modules/shirones/dist/index.js` | `<repo>/node_modules/shirones/dist/src` |

`detectPluginMode()` (`resolve/paths.ts`) tells the two apart by looking for
`/node_modules/` in its own module URL. It is the single switch that decides
whether user overrides, Vite shims and route injection apply.

## Layout

```
index.ts                     the shirones() integration — the only public entry
collections.ts               the collections entry, exported as shirones/collections
routes.ts                    route table consumed by injectRoute
cli.mjs                      `shirones init`
types.ts                     interfaces only; doubles as the package's .d.ts source

collections.manifest.json    content collections, read by the packaging repo
package.manifest.json        package-only dependencies and Vite alias classes

fonts.ts                     font collection and subsetting helpers

resolve/                      "where is this file?"
  paths.ts                     directory layout for both modes
  load-config.ts               config module loading with the overlay applied
  registry.ts                  which files a user has overridden

verify-peers.ts               which dependencies the project must declare

vite/                         everything handed to Vite as a Plugin
  overlay.ts                   lets a user shadow package files from shirones/
  fallback-resolver.ts         resolves theme-internal imports the project cannot see
  ssr-node-shims.ts            Node builtins stubbed for SSR
  icon/                        icon collection — see icon/README.md
  thumbnails/                  moment thumbnails — see thumbnails/README.md
```

Each `vite/<feature>/` folder owns a generated artefact: the module it writes,
the plugin that keeps it current, and a README covering the decisions. Both
regenerate during `astro dev`, `astro build` and — for icons — `astro sync`, so
neither needs a step in the script chain.

## Files that must stay at the root

The packaging repo (`yCENzh/shirones`) hardcodes these paths in
`scripts/build-package.mjs` as esbuild entry points, a copy source, or the
package's type source:

```
src/integration/index.ts
src/integration/collections.ts
src/integration/routes.ts
src/integration/cli.mjs
src/integration/types.ts
```

Moving any of them breaks the package build, and the fix has to land in both
repositories at once. Everything else is free to reorganise.

## Two things worth knowing before editing

**Vite resolves aliases before any plugin.** A `resolveId` here receives the
already-rewritten path, not the specifier a component imported. `enforce: "pre"`
does not change that. Plugins that need to intercept a specifier have to match
the post-alias form as well — see `vite/icon/regeneration.ts`, which matches
the tail of the rewritten path.

**`astro:config:setup` runs before Vite resolves anything.** Work that must
finish before the first import resolves belongs there — an import of a generated
module, for instance. Work that only has to beat a file copy can use
`buildStart` instead, which keeps it out of `astro sync`. Either way, `handleHotUpdate`
covers edits made while the dev server is already up — but only edits: Vite does
not call it for a file that was just created. `vite/icon/regeneration.ts`
listens to `server.watcher` for that reason.

## Adding a Vite plugin

Register it in the `vite.plugins` array inside `updateConfig()` in `index.ts`.
Give it a `shirone:`-prefixed name so it is identifiable in Vite's debug output,
and gate anything package-mode-only on `paths.isPluginMode` — the dev server runs
the same plugin list, so an ungated plugin that touches user paths will fail on
the theme's own checkout.