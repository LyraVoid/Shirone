# Contributing to Shirone

Thank you for your interest in Shirone. Contributions of all sizes are welcome, including bug reports, documentation improvements, translations, accessibility fixes, performance work, and new features that benefit the theme as a whole.

## Ways to Contribute

- Report a reproducible bug.
- Improve documentation or translations.
- Fix accessibility, responsive layout, or browser compatibility issues.
- Add tests for existing behavior.
- Propose a feature that fits Shirone's direction as an expressive, content-focused blog theme.

If you are planning a large feature, visual redesign, breaking configuration change, new dependency, or third-party integration, please open an issue or discussion first. This gives maintainers and contributors a chance to agree on the direction before implementation begins.

Changes that only replace the demo profile, posts, links, or artwork for one personal site are best kept in your own fork.

## Local Development

You will need Node.js 22.12 or newer and pnpm 9.x. The repository currently pins `pnpm@9.14.4`.

```bash
git clone https://github.com/<your-name>/Shirone.git
cd Shirone
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

The development server is available at `http://localhost:4321` by default.

On Windows PowerShell, use `pnpm.cmd` and `npx.cmd` if the script execution policy prevents the commands above from running.

## Project Guidelines

Please keep changes focused and follow the patterns already used in the surrounding code. The following guidelines cover the parts of Shirone that most often affect contributions.

### Components and data

Shirone uses an atomic component structure:

```text
atoms -> molecules -> organisms -> layouts -> pages
```

Dependencies should follow this direction. Reusable UI belongs in the lower layers, while route state, content queries, browser persistence, and other application behavior belong in organisms, utilities, layouts, or pages.

Use `@components/<layer>/<file>` for cross-layer imports. When adding, moving, or removing an atom, update `src/components/atoms/manifest.json` in the same change.

See [`docs/atomic-structure.md`](./docs/atomic-structure.md) and [`rules/component-api.md`](./rules/component-api.md) for the complete component guidelines.

### Rendering and navigation

Static content should remain useful without client-side JavaScript. Hydrate an Astro component only when its interaction requires browser code, and use `astro-icon` for icons rendered on pure SSR paths.

Shirone uses Swup for in-site navigation. Elements outside `#swup-container` remain mounted between pages, so route-dependent behavior must work both on a direct page load and after client navigation.

When editing Svelte components, follow the syntax already used by that file and do not mix runes with legacy reactive syntax. Stylus selectors should also follow the existing structure to avoid accidental selector concatenation.

### Design and accessibility

For visual changes, read [`DESIGN.md`](./DESIGN.md) and [`docs/m3e-standard.md`](./docs/m3e-standard.md).

- Use the existing semantic tokens for colors, typography, shapes, elevation, and motion.
- Keep light and dark themes consistent.
- Respect reduced-motion preferences.
- Preserve keyboard access, visible focus, native semantics, and accessible names.
- Avoid unrelated visual or formatting changes in the same pull request.

Accessibility guidance is available in [`rules/a11y.md`](./rules/a11y.md).

### Text and translations

User-facing interface text must use the i18n system instead of being written directly in a component. Add new keys to `src/i18n/i18nKey.ts` and provide translations in every locale module under `src/i18n/languages/`. Keep placeholder names consistent across languages.

Documentation translations should preserve commands, paths, links, and technical meaning while reading naturally in the target language.

### Configuration and optional features

Configuration values live in `src/config/`, with their shared types under `src/types/`. New optional fields should have backward-compatible defaults so existing sites and posts continue to build without migration work.

Optional integrations must remain lightweight when disabled. A disabled feature should not render empty containers, request third-party resources, shift the layout, or add its SDK to the main bundle. Load external code only after the feature has been enabled and its configuration is valid.

Read [`src/config/README.md`](./src/config/README.md) before changing configuration, and [`docs/on-demand-loading.md`](./docs/on-demand-loading.md) before adding an optional integration.

## Testing and Formatting Your Changes

Before committing or submitting a pull request, you must format your code and ensure all quality checks pass:

### 1. Mandatory Code Formatting

All source files must be formatted with Biome before committing:

```bash
pnpm format
```

To verify formatting in CI or pre-commit checks without writing files:

```bash
pnpm exec biome ci ./src
```

Both commands are scoped to `src/`: the repository-root config (`astro.config.mjs`) and `tests/**` are outside that scope and still carry pre-existing formatting deviations. Never reformat them as a side effect of an unrelated change — a repo-wide `biome format --write .` rewrites all of them at once and buries your diff. Verify the files you touched explicitly, for example `pnpm exec biome format tests/site/your.spec.ts` (read-only) or the same command with `--write` on that single path. A repo-wide `biome ci` without a path additionally reports pre-existing diagnostics from `scripts/**`, `tests/**` and the root config; the CI gate is the scoped `./src` check.

### 2. Quality Checks & Diagnostics

Run Astro diagnostics:

```bash
npx astro check
```

It must complete with zero errors. On Windows PowerShell, run `npx.cmd astro check`.

Choose the additional checks that match your change:

| Check / Task | Command | Note |
| --- | --- | --- |
| **Code Formatting** | `pnpm format` | **Mandatory before committing** |
| **Format Verification** | `pnpm exec biome ci ./src` | Read-only check for CI |
| **Astro Diagnostics** | `npx astro check` | **Must report 0 errors** |
| **TypeScript Checks** | `pnpm type-check` | For TypeScript or shared APIs |
| **Atom Manifest** | `pnpm check:manifest` | When atoms are added, moved, or deleted |
| **Playwright Tests** | `npx playwright test tests/site/<spec>.spec.ts` | For page or component behavior |
| **Accessibility Lock** | `npx playwright test tests/site/a11y.spec.ts` | For UI and component updates |
| **Production Build** | `pnpm build` | For content processing, fonts, and schemas |
| **Performance Audit** | `pnpm run perf:measure` | For performance-sensitive work |

UI changes should be checked at relevant desktop and mobile sizes in both light and dark themes. Include `tests/site/a11y.spec.ts`, and add screenshots to the pull request when the visual difference is intentional.

## Commits

Before committing, make sure:
1. All files are formatted using `pnpm format`;
2. `npx astro check` reports 0 errors;
3. Relevant tests pass.

Use [Conventional Commits](https://www.conventionalcommits.org/) with a concise English subject:

```text
feat(search): add result filters
fix(sidebar): sync widgets after navigation
docs(config): clarify music provider setup
test(article): cover encrypted post fallback
refactor(theme): simplify token resolution
```

Keep each commit centered on one concern and review the staged diff before committing. Generated build output, test reports, local environment files, credentials, and unrelated personal content should not be included.

## Pull Requests

Before opening a pull request:

1. Format all modified files with `pnpm format`.
2. Rebase or update your branch against the current default branch.
3. Review the complete diff and remove unrelated changes.
4. Run `npx astro check` and confirm zero errors.
5. Run the checks relevant to your work.
6. Confirm that existing configuration and content remain compatible.

In the pull request description, explain:

- what problem the change solves;
- how the behavior changed;
- which commands you used to verify it;
- whether it affects configuration, accessibility, performance, or existing content;
- which issue it closes, when applicable.

For visual changes, include before-and-after screenshots and note the tested viewport and theme. A reviewer may ask for additional tests or documentation when a change affects shared components or public configuration.

By submitting a contribution, you agree that it may be distributed under the repository's [MIT License](./LICENSE).
