#!/usr/bin/env bash
#
# Keeps the upstream data this repo derives from in .cache/upstream/, so a fresh
# clone of THIS repo plus `npm run stages:refresh` is all that is needed -- no
# sibling checkouts on the machine.
#
# Partial, shallow and sparse: only the paths a script actually reads are ever
# downloaded. Re-running fetches just what moved.
set -euo pipefail

upstream_dir() { echo ".cache/upstream/$1"; }

# upstream_sync <name> <url> <ref|default> <path>...
#
# `default` resolves the remote's own default branch, which is not something to
# assume: of the three repos this pulls, two are on main and one on master, and
# passing the wrong one fails at the clone.
upstream_sync() {
  local name="$1" url="$2" ref="$3"
  shift 3
  local dir
  dir="$(upstream_dir "$name")"
  if [ "$ref" = "default" ]; then
    ref="$(git ls-remote --symref "$url" HEAD | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2; exit }')"
    [ -n "$ref" ] || { echo "  cannot resolve a default branch for $url" >&2; return 1; }
  fi
  if [ ! -d "$dir/.git" ]; then
    printf '  cloning %s (%s)\n' "$name" "$ref"
    mkdir -p "$(dirname "$dir")"
    # Not quiet: a failure here used to leave an empty directory and every step
    # after it reading nothing.
    git clone --filter=blob:none --no-checkout --depth 1 --branch "$ref" "$url" "$dir"
    git -C "$dir" sparse-checkout init --cone
  fi
  git -C "$dir" sparse-checkout set "$@"
  git -C "$dir" fetch --depth 1 origin "$ref"
  git -C "$dir" checkout --quiet FETCH_HEAD
  printf '  %s at %s (%s)\n' "$name" "$(git -C "$dir" rev-parse --short HEAD)" "$ref"
}
