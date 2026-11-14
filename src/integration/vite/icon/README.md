# `vite/icon/`

`Icon.svelte` imports `@/generated/local-icon-collections`, a tree-shaken subset
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

- `collections.ts` — scans the sources, resolves each referenced glyph through
  its alias chain, writes the collection module.
- `regeneration.ts` — the Vite plugin that keeps it current.

## Where it runs

`regeneration.ts` regenerates in two places:

- `buildStart` — the collection must exist before Vite resolves
  `Icon.svelte`. Verified to fire for `astro dev`, `astro build` **and**
  `astro sync`, so all three regenerate it and none of them needs a step in the
  script chain. `astro check` does the same, which is why a broken icon name
  shows up before CI rather than at runtime.
- `handleHotUpdate` — an icon added while the dev server is up regenerates
  without a restart. This is the reason the plugin exists at all; generation used
  to happen only in the script chain, which ran once before the server started.

There is deliberately no CLI wrapper. An earlier version exposed
`pnpm icons:generate`; with the hook in place it had no callers left except the
`dev`/`build` chains it duplicated.

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

Only `<project>/src/generated/` is skipped, so the generator never reads its own
output. A file elsewhere in the project (a `lib/` next to `src/`, say) is not
scanned unless one of the roots above contains it.

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

## Gotcha: Vite resolves aliases before plugins

`Icon.svelte` writes the specifier `@/generated/local-icon-collections`, but by
the time a plugin's `resolveId` runs, Vite has already rewritten it — to
`packageRoot/src/...` in source mode (via tsconfig paths) and to
`<package>/src/...` in package mode. `enforce: "pre"` does not change this.

This is also why the collection is a real file rather than a virtual module.
Serving it from `load()` needs the virtual id to parse as TypeScript (the
generated source uses `as const`), and a generated module has to exist on disk
for the packaging step's local-import check anyway.

`regeneration.ts` writes the file and adds a `resolveId` that points
`Icon.svelte` at it, falling back to the copy shipped in the package. That
redirect is what makes the two modes behave the same: in package mode the alias
resolves into `node_modules`, where this plugin must not write, so without it
nothing the user wrote would ever reach a rendered icon.

The plugin is `enforce: "pre"` for the sake of that hook. Vite's own resolver
runs before ordinary plugins and the shipped copy always exists, so an ordinary
plugin is never asked about this specifier: Vite resolves it to the shipped copy
and stops. The project's collection was then generated correctly and never read,
and every icon the theme itself does not use rendered as nothing, on the server
and in the browser alike.

### Verifying the redirect

Keep the shipped copy in place; deleting it first hides exactly the failure
above, because Vite then has nothing to resolve and falls through to the plugin.

Use an icon the theme does not use anywhere (so the shipped copy lacks it), for
example a new brand icon in `shirones/config/profileConfig.ts`, and confirm it
renders. (No concrete name is given here on purpose: this file is under `src/`
and `.md` is scanned, so naming an icon would add it to every collection.) In `astro dev` the browser side can be read off directly: the
transformed `Icon.svelte` must import `/src/generated/local-icon-collections.ts`,
not a path under `node_modules`.

`tests/icon-regen-hot-update.test.mjs` runs the same check against a real Vite
server for both the server and the browser environment.

Confirm the consumer actually has the change first. `pnpm build` in the
packaging repo only rewrites `dist/`; a throwaway consumer keeps the tarball it
installed until it re-installs. Testing against a stale install makes a working
redirect look broken — and `Icon.svelte` shipping as source is easy to miss,
because `find node_modules/shirones -name Icon.svelte` follows no symlink under
pnpm's layout and reports nothing while the file is there.

## Errors: dev warns, build throws

`regeneration.ts` catches failures and then splits by command, which `configResolved`
records:

- `astro dev` warns and keeps going, leaving the previous collection in place.
  A typo in one post should cost one icon, not take the dev server down.
- `astro build` **throws**. An icon that fails to resolve renders as nothing at
  runtime, which is exactly the silent breakage worth failing a deploy on.

The message names the first file that mentions the bad icon
(`Unknown icon fa7-brands:… (referenced in /path/to/file)`), because the scan
covers the user's own files as well as the theme's.

So a blank icon in `dist/` means the build did not run this plugin, not that the
error was swallowed. If an icon is missing in dev, check the warning first, then
that the name exists in an installed set.