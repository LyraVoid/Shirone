# `vite/icon/`

`Icon.svelte` imports `virtual:shirone-icons`, a tree-shaken subset
of the installed `@iconify-json/*` sets. Tree-shaking is the reason this exists:

| | icons | size |
|---|---|---|
| full sets | 30407 | 14.4 MB |
| what a theme uses | ~200 | ~107 KB |

The alternatives do not work here. Loading the Iconify API at runtime puts a
network request on first paint, which `AGENTS.md` forbids; one chunk per icon
means one request per glyph. A single generated module keeps the icons offline
and in one request.

## Files

- `collections.ts` scans the sources, resolves each referenced glyph through
  its alias chain and returns the source of the module. It writes nothing.
- `regeneration.ts` is the Vite plugin that serves that source as
  `virtual:shirone-icons` and keeps it current.

## One module, both modes

The collection is a virtual module, generated in memory from the project it is
running in. A source checkout and a project that installs the package go through
the same code and get the same answer; there is no file on disk and no copy
shipped in the package.

It used to be a file, `src/generated/local-icon-collections.ts`, with a second
copy built into the package and a `resolveId` redirect that picked the project's
copy over the shipped one. In package mode the redirect lost to Vite's own
resolver, which found the shipped copy first, so only the icons the theme itself
uses were rendered. `tests/icon-regen-hot-update.test.mjs` asks a real Vite
server and a real build for the module instead of calling `resolveId` by hand,
because the hand-called version passed while that bug was live.

### The legacy specifier

Before this, `Icon.svelte` imported `@/generated/local-icon-collections`. A
project that overrides `Icon.svelte` with a copy from that time still does, so
the plugin answers that specifier with the virtual module too. Vite applies
aliases before plugins, so what arrives is the rewritten absolute path; the
plugin matches it by its tail, with either path separator. The plugin is
`enforce: "pre"` so that it is asked before Vite's resolver finds a stale file
left at that path.

## Where it runs

- `buildStart` generates the collection for `astro dev`, `astro build` and
  `astro sync`.
- In `astro dev` the plugin listens to the file watcher. Creating, changing or
  deleting a scanned source or an SVG under `src/icons/` regenerates after a
  150 ms debounce. If the result is the same as before, nothing else happens;
  an ordinary save does not touch the icon module. If it differs, the module is
  reloaded in every environment and the browser gets a full reload, because
  server-rendered icons are plain HTML.

There is deliberately no CLI wrapper and no step in the script chain.

## What gets scanned

Every place an icon name can be written and end up rendered:

| root | covers |
|---|---|
| `packageSrc` | the theme's own source |
| `<project>/src` | component and layout overrides, the project's own pages |
| `contentDir` | posts, moments, spec pages |
| `configDir`, `dataDir` | TS config and data overrides, e.g. `profileConfig.ts` |
| targets of `ShironesOptions.components` | explicit overrides, scanned as single files |

The list has no mode check, so an icon that works in a source checkout also
works in a project that installs the package. In source mode `<project>/src` is
`packageSrc` and already contains the other three; in package mode they default
to `shirones/`. `options.paths` can move any of them outside `src/`, which is
why they are listed on their own. Roots overlap freely: each file is read once.

A directory named `generated` is skipped: the collection used to be written to
`src/generated/`, and a project may still have that file. A file elsewhere in
the project (a `lib/` next to `src/`, say) is not scanned unless one of the
roots above contains it.

The scan is textual. It matches `prefix:name` for the allowed prefixes anywhere
in a file, so a name in a comment or in a post that only talks about an icon is
collected too. That costs a few bytes when the name exists and a warning when it
does not (see [Errors](#errors)).

`ICON_PREFIXES` in `collections.ts` is the allow-list of usable sets. A new set
needs adding there, and a `@iconify-json/<set>` entry in the theme's
`dependencies` — that is the whole configuration. Nothing else needs editing:
this module no longer shares the list with `astro-icon`, so there is no second
copy to keep in step.

## The `local` collection

A project's own `src/icons/*.svg` is emitted under the `local` prefix, which is
what replaced astro-icon's icon directory. It used to require four
`@iconify-json/*` packages on every user's `package.json` because astro-icon
located sets by reading that file; this module resolves them from inside the
installed package instead, so those sets ship as the theme's dependencies and
the user declares none of them.

`Icon.svelte` maps a bare `<icon>` (no `prefix:`) onto `local:`, which keeps
astro-icon's call-site syntax working. Parsing is regex-based and lenient — a
file with no `viewBox`/`width`/`height`, or an empty `<svg>`, is dropped rather
than thrown on, matching what astro-icon did.

## Errors

- **Unknown icon name**: a warning naming the icon and a file that mentions it,
  once per name; the icon is left out and renders as nothing. The build
  continues, in `astro dev` and `astro build` alike. It is a warning because
  the scan cannot tell a reference from a mention, and a sentence in a post
  should not be able to fail a deploy.
- **A missing icon set or a broken alias inside a set**: this is a broken
  install and would blank every icon. `astro build` throws; `astro dev` warns
  and keeps serving the previous collection.

The theme's own source is held to the stricter rule by
`tests/local-icons.test.mjs`, which fails on any unknown name under `src/`.

If an icon is blank, look for the warning first, then check that the file that
uses it is under one of the scanned roots.
