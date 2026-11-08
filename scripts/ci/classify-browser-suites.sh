#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo "::error::Expected base SHA, head SHA, and GitHub output file."
  exit 2
fi
if [[ -z "$1" || -z "$2" || -z "$3" ]]; then
  echo "::error::Base SHA, head SHA, and GitHub output file must be non-empty."
  exit 2
fi

base="$1"
head="$2"
output_file="$3"
changed_paths_file=$(mktemp)
trap 'rm -f "$changed_paths_file"' EXIT

# -z prevents Git from quoting non-ASCII, whitespace, or newline-containing paths.
if ! git diff --name-only --no-renames -z "$base" "$head" > "$changed_paths_file"; then
  echo "::error::Failed to compute changed paths; refusing to skip browser suites."
  exit 1
fi

comments=false
styles=false
select_both_suites() {
  comments=true
  styles=true
}

while IFS= read -r -d '' path; do
  case "$path" in
    # Comment suites also consume fixtures outside tests/site/; keep this before docs/config patterns.
    tests/fixtures/*)
      comments=true
      ;;
    # Source, dependency, runtime/build config, scripts, assets and workflow
    # changes select both browser regression suites.
    package.json|pnpm-lock.yaml|pnpm-workspace.yaml|.npmrc|tsconfig*.json|biome.json|pagefind.yml|frontmatter.json|shirone.content.example.json|vercel.json|lighthouserc.cjs|astro.config.*|svelte.config.*|src/*|scripts/*|public/*|.github/workflows/*|.github/actions/*|tests/site/*|playwright.config.*)
      select_both_suites
      ;;
    # Only explicit documentation and unit-test files are safe browser-suite fast paths.
    docs/*|*.md|*.mdx|tests/*.test.mjs|tests/*/*.test.mjs)
      ;;
    # Unknown paths fail closed for browser regressions.
    *)
      select_both_suites
      ;;
  esac
done < "$changed_paths_file"

printf 'Selected browser suites: comments=%s, styles=%s\n' "$comments" "$styles"
{
  printf 'comments=%s\n' "$comments"
  printf 'styles=%s\n' "$styles"
} >> "$output_file"
