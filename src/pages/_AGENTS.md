# Page Scope

- Keep route files thin: load/shape route data, choose the correct `page` identifier, pass page data into `MainGridLayout`, and delegate presentation to components. Read `src/config/README.md` before changing configuration-driven page behavior.
- Use an existing `SidebarPage` value from `src/types/sidebarConfig.ts`; when a genuinely new page class is introduced, update the type, sidebar filtering, and focused tests together. Keep visible route copy in i18n rather than hard-coded strings.
- Preserve SSR output for titles, descriptions, metadata, and accessible names. Add a Svelte hydration directive only for behavior that cannot run in SSR. On SSR-only routes, use `astro-icon` for icons.
- Components outside `#swup-container` persist across navigation. Any Banner, sidebar, top-bar, or other shell state that depends on the current page must synchronize on Swup lifecycle events and be tested on both direct refresh and client navigation.
- Keep endpoint routes such as RSS, robots, and sitemap build/server-only; do not introduce browser hydration there. For album detail routes, encrypt protected photo payloads before emitting them and never expose the plaintext protected manifest in SSR HTML.
- After route changes, run the focused page fragment and `tests/site/a11y.spec.ts`; include a Swup navigation assertion when the change affects persistent shell state.
