# Context Menu System

This document is the project contract for the optional desktop context-menu enhancement. It describes how a future action is added and how an action that operates on Markdown-rendered content must coordinate with the Markdown pipeline.

## Current Version

The first version exposes three flat actions:

| Action id | Visible label | Availability | Effect |
| --- | --- | --- | --- |
| `copySelection` | `copy` | A non-empty text selection intersects the clicked element | Copies ordinary selected text |
| `backToTop` | `backToTop` | The page is scrolled | Scrolls the document to the top |
| `sharePageLink` | `copyLink` | Always on an allowed page | Copies `window.location.href`, exactly like `#copy-post-link` |

`sharePageLink` is retained as the configuration id for compatibility. Its behavior is intentionally copy-link behavior, not `navigator.share()` behavior.

The enhancement is rendered only when `contextMenuConfig.enable` is true. Consumers can disable it to remove the organism, its listener, and its client bundle from the page.

## Source Map

| Responsibility | Source |
| --- | --- |
| Public configuration | `src/config/contextMenuConfig.ts` |
| Action id contract | `src/types/contextMenuConfig.ts` |
| Menu organism and event lifecycle | `src/components/organisms/ContextMenu.svelte` |
| Layout mounting and `client:load` boundary | `src/layouts/MainGridLayout.astro` |
| Shared page-link copy behavior | `src/utils/copy-page-link.ts` |
| User-facing labels | `src/i18n/i18nKey.ts` and all ten locale modules |
| Markdown feature registry | `src/plugins/markdown/manifest.json` |
| Markdown runtime loading | `docs/markdown-on-demand-loading.md` |

## Adding A Menu Action

Add an action in this order:

1. Extend `ContextMenuAction` in `src/types/contextMenuConfig.ts`.
2. Add the default id to `contextMenuConfig.actions` only when the action is part of the product default. Keep the array as the user-controlled display order.
3. Add one i18n key and translations in all ten locale modules. The menu must never contain literal UI copy.
4. Add the icon to the `icons` map in `ContextMenu.svelte`. Use a local icon name already covered by `src/generated/local-icon-collections.ts`; run `pnpm.cmd icons:generate` when introducing a new icon name.
5. Add the action's eligibility rule to `availableActions()`. An action that has no valid target must not render a disabled-looking row.
6. Add the smallest handler branch in `run()`. Keep route state, browser APIs, and Swup lifecycle work in the organism or an explicitly named utility.
7. Add a focused Playwright assertion for order, visibility, keyboard behavior, effect, and the disabled configuration. Run `npx.cmd astro check` and the relevant site tests.

Do not add a nested submenu for a first-level action. If an action later needs children, design a separate M3E menu contract and tests before changing the flat v1 API.

## Markdown Coordination

The context menu is a page-level organism. Markdown plugins own parsing and the semantic DOM they generate; they do not import or call `ContextMenu.svelte`. This separation keeps authoring syntax usable without JavaScript and keeps Markdown on-demand loading content-driven.

When an action operates on a Markdown feature, coordinate through a stable DOM capability contract:

1. The remark/rehype implementation emits a semantic feature root, for example `data-md-feature="code-tree"`, and any state attributes needed by the action.
2. `ContextMenu.svelte` captures the nearest feature root from the context-menu target. It does not scan the whole document or infer a feature from class names that are private to a plugin.
3. The action is included only when that root exposes the required capability. A normal paragraph, a code block without a tree root, or a page without the syntax keeps the action absent.
4. The action delegates to the feature's existing runtime utility or dispatches a namespaced event on that root. It must not duplicate tree parsing, state storage, or Markdown syntax rules.
5. The feature remains fully readable and usable when the optional context menu is disabled or when its runtime script fails.

For a future code-tree action, the contract should look like this:

```html
<section
  data-md-feature="code-tree"
  data-code-tree-state="collapsed"
>
  ...
</section>
```

The menu can then expose `expandCodeTree` or `collapseCodeTree` only for the nearest code-tree root and invoke the code-tree controller for that root. The Markdown manifest remains the source of truth for the syntax, implementation, runtime module, styles, and tests; the context-menu document only defines the integration boundary.

Do not put a context-menu-only frontmatter flag in an article. Whether an action is available must come from the rendered content capability and the current runtime state, not from author-maintained duplicate configuration.

## Lifecycle And Swup

The organism is hydrated once in the persistent layout. It closes on `swup:visit:start` and `swup:content:replace`; an action that reads or mutates Markdown content must resolve its target after replacement, not retain a stale element reference. Test both a direct article load and a Swup navigation into an article.

Keyboard rules are part of the action contract: the first item receives focus, `ArrowUp`/`ArrowDown` cycle within the current menu, `Home`/`End` jump to the bounds, `Escape` closes, and browser scrolling must not occur while the menu handles those keys.

## Zero-Burden And Package Rules

- `enable: false` means no menu DOM, listener, hydration, or action-specific resource.
- A Markdown syntax that is not present must not add an action-specific script, stylesheet, network request, or polling loop.
- Third-party code is never imported into the base context-menu organism. Use on-demand loading owned by the Markdown feature when the manifest requires it.
- Keep source-checkout and `shirones` package mode behavior aligned. New utilities and DOM contracts must use repository paths that survive the integration overlay.

## Verification Checklist

- `pnpm.cmd check:manifest`
- `npx.cmd astro check`
- `pnpm.cmd exec biome ci ./src` (pre-existing diagnostics must be recorded rather than hidden)
- Context-menu Playwright tests with the feature enabled and disabled
- `tests/site/a11y.spec.ts` for menu semantics and keyboard focus
- The affected Markdown plugin unit/site tests when the action targets Markdown content
- Direct-load and Swup-navigation coverage
