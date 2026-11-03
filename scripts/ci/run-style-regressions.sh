#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 1 || ! "$1" =~ ^[1-9][0-9]*/[1-9][0-9]*$ ]]; then
  echo "::error::Expected a Playwright shard in INDEX/TOTAL form, such as 1/4."
  exit 2
fi

shard="$1"
shard_index="${shard%%/*}"
shard_total="${shard##*/}"
if (( shard_index > shard_total )); then
  echo "::error::Shard index must not exceed the total shard count."
  exit 2
fi

mapfile -t specs < <(node scripts/ci/list-style-regression-specs.mjs)
if [[ "${#specs[@]}" -eq 0 ]]; then
  echo "::error::No style regression specs were discovered."
  exit 1
fi

printf 'Running %s site specs in Playwright shard %s.\n' "${#specs[@]}" "$shard"
pnpm exec playwright test "${specs[@]}" "--shard=$shard"
