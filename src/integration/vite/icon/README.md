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

`packageSrc` (the theme's own components) and `contentDir` (a user's posts,
absent in source mode). Together those cover both modes without a mode check:
in source mode the theme *is* the project, so `packageSrc` already contains
`src/content`.

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
fallback is what makes the two modes behave the same: in package mode the alias
resolves into `node_modules`, where this plugin must not write, so without the
redirect a user's own posts would never reach the collection.

### Verifying the redirect

Delete the packaged copy and build — if it still succeeds, the user's file is
what got read:

```
mv node_modules/shirones/src/generated/local-icon-collections.ts{,.bak}
pnpm build   # must succeed
```

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

So a blank icon in `dist/` means the build did not run this plugin, not that the
error was swallowed. If an icon is missing in dev, check the warning first, then
that the name exists in an installed set.