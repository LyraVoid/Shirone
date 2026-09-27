# Agent Instructions for Shirone — M3E Blog Theme

## Summary

Shirone is a blog theme built with Astro 7, Svelte 5, Tailwind 4, Stylus, and pnpm. It is refactored into an M3E (Material 3 Extended) component library with data-driven orchestration. In-site navigation uses Swup, so the persistent shell and the replaceable page container have different lifecycles. Development happens on Windows; use the `.cmd` suffix for package commands (`pnpm.cmd`, `npx.cmd`, `npm.cmd`).

## Must-follow rules

- Optional features and third-party integrations (comments, analytics, widgets, etc.) must follow the **zero extra burden** rule: when disabled (`enable: false` or omitted), they must produce zero external network requests, zero DOM footprint/layout shift, zero npm bundle bloat (dynamic loading only), and full backward compatibility without requiring mass edits to existing content frontmatter.
- Read the relevant files in `rules/` and `docs/` before changing architecture, components, routing, or content pipelines. Run `npx.cmd astro check` before committing; it must report 0 errors. Use conventional commits in the form `type(scope): subject` (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`, or another justified type).
- For UI and visual changes, read the root `DESIGN.md` alongside `docs/m3e-standard.md`; `DESIGN.md` is the machine-readable and narrative source of truth for Shirone's visual identity.
- Never hard-code user-visible component copy. Use `src/i18n/i18nKey.ts` and all ten locale modules; parameterized strings keep the same `{placeholder}` names in every locale and are replaced by the consumer.
- Semantic colors, radii, typography, and motion must use the project design tokens (`--shape-corner-*`, `--m3e-type-*`, `--m3e-duration-*`, `--m3e-easing-*`, and surface/on-surface tokens). Fixed black/white values are allowed only for image-overlay readability or another documented content-specific exception. Official-spec geometry or motion constants need a clear local justification.
- Component dependencies follow the documented direction: atoms may compose atoms, molecules may compose atoms and suitable same-layer molecules, organisms may compose lower layers and explicitly owned smaller organisms, templates compose components, and pages compose templates/components. Lower layers must not import higher layers; avoid cycles and use `@components/<layer>/<file>` aliases for cross-layer imports.
- Atoms and molecules must not directly query Astro collections or own browser persistence. Build-time data adapters already used by a domain molecule may remain there; route state, `localStorage`, and persistent-shell synchronization belong in organisms or dedicated utilities with an explicit runtime contract.
- In Astro, SSR-only output must remain usable without hydration. Add `client:load`, `client:visible`, or `client:only="svelte"` only when interactivity requires it. On pure SSR paths, use `astro-icon`; `@iconify/svelte` does not render icons during SSR.
- In Svelte, follow the syntax already used by the file (runes or legacy) and never mix the two modes in one component. Use template-literal classes when conditional class names interact with scoped unused-CSS analysis; preserve valid `class:` directives elsewhere. In Stylus, keep modifier and element selectors as separate selectors where `&` would concatenate them incorrectly.
- Keep designs original and differentiated. `research/` is reference material only: do not copy its schemas, names, defaults, algorithms, component compositions, or visual layouts. Do not edit, install, build, format, or commit inside research checkouts; descendant `AGENTS.md` files there are upstream artifacts, not Shirone instructions.
- Persistent shell elements outside `#swup-container` are not rerendered by Swup. Logic that reacts to route changes must use the appropriate Swup lifecycle hook (`content:replace`, `page:view`, or event delegation) and must be tested for both direct load and client navigation.
- Shirone also ships as an npm package (`shirones`); `src/integration/` rebuilds `astro.config.mjs` for user projects. Any change to the theme source must keep both modes working — mirror config changes into `src/integration/`, avoid `process.cwd()` reads of theme-owned files, register Markdown syntax in the manifest, and follow the overlay rules. See `rules/project-rules.md` §12 and `docs/packaging-contract.md`.

## Required documents

- `rules/pitfalls.md` — Svelte/Astro integration, Stylus, cache, and testing pitfalls.
- `rules/css-important.md` — allowed CSS `!important` ownership boundaries, comments, and validation.
- `rules/project-rules.md` — project conventions and commit policy.
- `docs/atomic-structure.md` — component layering and ownership.
- `docs/m3e-standard.md` — M3E tokens and component standard.
- `docs/markdown-extensions.md` — Markdown plugin pipeline, Typography boundaries, cache refresh, and validation.
- `docs/markdown-on-demand-loading.md` — required before changing Markdown feature probes, conditional styles, runtime loading, or Swup resource lifecycles.
- `docs/markdown-syntax-manifest.md` — required before adding, changing, or retiring custom author-facing Markdown syntax.
- `docs/sidebar-system.md` — sidebar orchestration, page filtering, and Swup synchronization.
- `src/config/README.md` — required before changing configuration types or values.
- `rules/ai-skills.md` — required before adding or changing AI skills or their packaging workflow.
- `docs/npm-package-mode.md` — how the theme behaves when installed as the `shirones` package (config paths, content root, init).
- `docs/packaging-contract.md` — the two-mode contract every theme change must respect; see `rules/project-rules.md` §12 for the sync checklist.
- `docs/ai-skills-maintenance.md` — required for the skills/project documentation split and release checklist.
- The nearest nested `AGENTS.md` — local rules are additive and narrower than this file. The page-scope file is intentionally named `src/pages/_AGENTS.md`; the leading underscore keeps Astro from treating it as a route.
- `.agents/skills/README.md` — task-scoped AI skills for developers and theme users; consult the matching skill (and keep its content in sync) when working in its domain.

## Validation

- Common commands: `pnpm.cmd astro dev --port 4321`, `npx.cmd astro check`, `npx.cmd playwright test tests/site/<spec>.spec.ts`, `pnpm.cmd check:manifest`, `pnpm.cmd exec biome ci ./src`, `pnpm.cmd type-check`, and `pnpm.cmd build`.
- `pnpm.cmd lint` and `pnpm.cmd format` include `--write`; do not use them as read-only review checks. Use `pnpm.cmd exec biome ci ./src` when validation must not modify files.
- Run the smallest relevant Playwright fragment plus `tests/site/a11y.spec.ts` for page/component changes. Run album, icon, or motion fragments when those domains change. The visual suite uses local snapshots that are ignored by Git; update them only after confirming every difference is intentional, and do not absorb unrelated page-height or environment drift.
- If Stylus/Svelte changes appear stale in dev, clear `node_modules/.vite` and `.astro` and restart. If a Markdown/rehype/remark change appears stale, clear `.astro/data-store.json` and restart.
- Wait for theme initialization (`--mc-primary`) and `onload-animation` convergence before asserting computed styles or running accessibility checks.

## Repository context

- Sidebar configuration flows from `src/config/sidebarConfig.ts` through the `componentMap` registry in `src/components/organisms/SideBar.astro` to widget rendering. `SidebarPage` in `src/types/sidebarConfig.ts` is authoritative for page identifiers (`notFound`, `home`, `archive`, `friends`, `moments`, `anime`, `compass`, `skills`, `projects`, `devices`, `games`, `timeline`, `albums`, `about`, `categories`, `tags`, `rss`, `atom`, `post`). The `pages` filter reads `data-current-page` from `#swup-container` on SSR and after Swup replacement.
- Motion primitives live in `src/utils/motion.ts` (`fadeOutThenHide`, `flipFromRect`, `revealIn`, `collapse`); `prefersReducedMotion()` must be honored.
- Atom inventory and count are authoritative only in `src/components/atoms/manifest.json`; do not maintain a second hard-coded count in instructions or prose.
- Canonical page templates are under `src/layouts/`; `src/components/layout/` is not a parallel template layer.
