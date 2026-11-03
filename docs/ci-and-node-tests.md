# CI and Node Test Contract

This project runs unit tests directly with Node. CI uses Node 26.13.0. Astro/Vite supplies TypeScript, aliases, and extension resolution during development, but `node --test` does not; code loaded by tests must work in both environments.

## Runtime boundaries

- Do not make a pure Node test path import a TypeScript module containing a runtime `enum`. Node's strip-only TypeScript loader does not support `enum`.
- When a Node test needs enum-shaped keys, expose string keys through an `.mjs` runtime bridge and keep the TypeScript declaration in a matching `.d.mts` file.
- TypeScript files loaded directly by Node must use explicit `.ts` extensions for relative imports. Do not rely on Vite aliases such as `@/`.
- User-facing copy must still go through `i18n()` and the `I18nKey` registry. A runtime bridge changes loading only; it must not duplicate translations or bypass the ten locale modules.
- The repository's supported Node floor is 26.13.0 (`package.json#engines.node`, README, and Contributing). CI pins Node 26.13.0 for diagnostics, unit tests, source builds, and Windows path regressions. Individual Astro packages may support earlier Node releases, but that is not the project's stated runtime floor.

## Browser regression path selection

The main `ci.yml` runs quality checks, diagnostics, Node unit tests, and a Node 26.13.0 production build for every PR and push. Only the Playwright browser suites are path-gated.

- For a PR, changed paths are computed from the base SHA to the PR merge commit; for a push, from the event's `before` SHA to the current commit. Manual dispatches and new-branch pushes select both browser suites.
- `tests/fixtures/**` selects the comment suite. Source, site-browser tests, dependencies, runtime/build config, scripts, public assets, and workflow changes select both comment and style suites. Fast paths are limited to explicit documentation/Markdown patterns and the Node-test globs (`tests/*.test.mjs`, `tests/*/*.test.mjs`). Bash `*` can match `/`, so the second pattern also matches deeper paths such as `tests/plugins/markdown/katex-version.test.mjs`; these globs are not limited to one directory level. Unrecognized paths fall back to both suites, and mixed changes take the most conservative selection.
- Unknown paths select both suites; a failed diff or invalid output must fail the stable regression checks rather than silently skip tests. The classifier reads NUL-delimited Git paths, so spaces, Unicode, and newlines are not split or quoted incorrectly.
- The workflow calls `scripts/ci/detect-browser-suites.sh`, which runs `scripts/ci/classifier-change-guard.sh` and `scripts/ci/classify-browser-suites.sh` into separate temporary output files. If the classifier or the orchestrator changed, the guard's `comments=true` and `styles=true` values are authoritative; only the selected result is appended to `GITHUB_OUTPUT`, so a later classifier result cannot overwrite the guard. `git diff --quiet` status 1 means a protected script changed; statuses greater than 1 are Git errors and fail closed. `tests/ci-path-filter.test.mjs` runs the detector on temporary Git histories, including a classifier that reports false after changing, and asserts the final output; it also tests changed classifier, changed orchestrator, unchanged, and invalid-base guard cases.
- The classifier integration tests run Bash on POSIX hosts when it is available. Native Windows is skipped because the tests pass POSIX paths and temporary Git paths to Bash without Windows path translation; use WSL/Linux to run them locally. CI runs them on Ubuntu.

The Biome step in `ci.yml` currently has `continue-on-error: true`; a green required check does not itself make Biome blocking. Run `pnpm exec biome ci ./src` locally for source changes and review formatter edits rather than assuming CI status enforces them.

The Node 26.13.0 production build exercises source mode. The 30-minute Style regressions check is a stable aggregate over four parallel Playwright shards. `scripts/ci/list-style-regression-specs.mjs` selects every top-level `tests/site/*.spec.ts` except `comments.spec.ts` and `waline.spec.ts` (kept in the separate disabled/Waline/Twikoo mode matrix) and `visual.spec.ts` (its golden screenshots are ignored and local-only). `tests/style-regression-specs.test.mjs` checks this selection against the filesystem and the four-shard workflow matrix. The prior 14-spec focused suite took about 21.5 minutes in the 2-GiB local review sandbox (147 passed, 2 intentionally skipped); the expanded all-applicable suite is now divided across four shards. This workflow does not build and install a `shirones` npm tarball. Changes under `src/integration/` or other package-mode wiring should also follow [npm package mode](./npm-package-mode.md) and the [packaging contract](./packaging-contract.md); do not treat a source-mode green run as package-mode evidence.

## Local validation order

After changing Markdown processing, i18n modules, or test loading paths, run:

```powershell
pnpm.cmd exec biome ci ./src
npx.cmd astro check
pnpm.cmd check:manifest
node --test "tests/**/*.test.mjs"
git diff --check
```

Do not run `astro check` in parallel with content-sync tests. Astro check triggers content synchronization, while `tests/content/*` uses temporary repository fixtures; concurrent runs can cause false failures such as empty stderr. Run the complete unit suite separately.

## GitHub Actions diagnosis

Inspect the run summary first, then the failed job logs:

```powershell
gh run view <run-id> --json status,conclusion,headSha,jobs,url
gh run view <run-id> --job <job-id> --log-failed
```

Reproduce the failed step locally with the same Node major version and command. Keep build, diagnostics, and unit-test failures separate; change implementation only when the failure reproduces in an isolated run.

## Before committing

- Review `git diff` and confirm locale files contain only required import or formatting changes.
- Stage paths explicitly. Never use `git add -A`, which can include `Shirone-Content/`, temporary fixtures, or build output.
- Use a conventional commit such as `fix(markdown): support direct Node markdown tests`.
