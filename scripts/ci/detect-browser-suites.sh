#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 || -z "${1:-}" || -z "${2:-}" || -z "${3:-}" ]]; then
  echo "::error::Expected non-empty base SHA, head SHA, and GitHub output file."
  exit 2
fi

base="$1"
head="$2"
output_file="$3"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

guard_output="$temp_dir/guard-output"
classifier_output="$temp_dir/classifier-output"
: > "$guard_output"
: > "$classifier_output"

# Keep the guard and classifier outputs separate. The guard is authoritative
# when the classifier itself changed; appending both files to GITHUB_OUTPUT
# would let the classifier's later false values overwrite the guard's true ones.
"$script_dir/classifier-change-guard.sh" "$base" "$head" "$guard_output"
"$script_dir/classify-browser-suites.sh" "$base" "$head" "$classifier_output"

if grep -Fxq 'comments=true' "$guard_output" &&
  grep -Fxq 'styles=true' "$guard_output"; then
  cat "$guard_output" >> "$output_file"
else
  cat "$classifier_output" >> "$output_file"
fi
