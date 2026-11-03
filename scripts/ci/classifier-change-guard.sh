#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 || -z "$1" || -z "$2" || -z "$3" ]]; then
  echo "::error::Expected non-empty base SHA, head SHA, and GitHub output file."
  exit 2
fi

base="$1"
head="$2"
output_file="$3"

if git diff --quiet "$base" "$head" -- scripts/ci/classify-browser-suites.sh; then
  exit 0
else
  diff_status=$?
fi

if [[ "$diff_status" -eq 1 ]]; then
  echo "::warning::Changed-path classifier changed; forcing both browser suites."
  {
    printf 'comments=true\n'
    printf 'styles=true\n'
  } >> "$output_file"
  exit 0
fi

echo "::error::Failed to check whether the changed-path classifier changed (git diff exited $diff_status)."
exit "$diff_status"
