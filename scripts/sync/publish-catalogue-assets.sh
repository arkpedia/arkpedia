#!/usr/bin/env bash
# Publishes media into the two public media repositories, with deploy keys scoped to them.
#
#   publish-catalogue-assets.sh            the catalogue stage's media plan
#                                          (.cache/catalogue/asset-plan.json), into
#                                          arkpedia-image-assets and arkpedia-skin-assets
#   publish-catalogue-assets.sh --staged   the art this run's importers staged under .cache/
#                                          (config/staged-art.json), into arkpedia-image-assets;
#                                          then each importer that staged some runs again, so
#                                          its records point at the files and its quarantine
#                                          entries clear in the same run
#
# Every push is a fast-forward. When one is refused -- a sync or another job pushed first --
# or a clone fails, the attempt starts over from a fresh clone of the new head, the plan is
# built again on top of it (a file that is there now is skipped), and the push is retried, up
# to four attempts in all. A plan that does not build is not retried: that is not the network.
#
# After the push the run adopts the new revisions (npm run assets:update). In --staged mode it
# then runs the importers again (scripts/sync/adopt-staged-art.mjs). The whole of it is one
# refresh stage: if anything after the push fails, the stage's changes under data/ -- the
# asset pins with the rest -- are put back, so no record points at a file the release does
# not pin, and the next run, pinning the new head, adopts what was pushed.
set -euo pipefail
mode=catalogue
case "${1:-}" in
  '') ;;
  --staged) mode=staged ;;
  *) echo "usage: publish-catalogue-assets.sh [--staged]" >&2; exit 2 ;;
esac
if [ "$mode" = staged ]; then
  plan=.cache/staged-art/asset-plan.json stage=staged-art kinds=(image)
  python3 scripts/sync/publish-catalogue-assets.py plan-staged "$plan"
else
  plan=.cache/catalogue/asset-plan.json stage=catalogue-art kinds=(image skin)
fi
: "${CATALOGUE_IMAGE_DEPLOY_KEY:?Missing image repository deploy key}"
if [ "$mode" = catalogue ]; then : "${CATALOGUE_SKIN_DEPLOY_KEY:?Missing artwork repository deploy key}"; fi
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077
printf '%s\n' "$CATALOGUE_IMAGE_DEPLOY_KEY" > "$work/image-key"
if [ "$mode" = catalogue ]; then printf '%s\n' "$CATALOGUE_SKIN_DEPLOY_KEY" > "$work/skin-key"; fi
curl --fail --silent --show-error https://api.github.com/meta | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{for(const key of JSON.parse(s).ssh_keys)console.log("github.com "+key)})' > "$work/known_hosts"
ssh_for() { echo "ssh -i $work/$1-key -o IdentitiesOnly=yes -o UserKnownHostsFile=$work/known_hosts -o StrictHostKeyChecking=yes"; }
# Every day, with or without anything to publish: a key that stopped working shows up the day
# it does, not the day a new event's art waits on it.
for kind in "${kinds[@]}"; do
  GIT_SSH_COMMAND=$(ssh_for "$kind") git ls-remote "git@github.com:arkpedia/arkpedia-$kind-assets.git" HEAD > /dev/null
done
# Nothing to import still completes the stage: clear its quarantine entries, whose art
# has since been published some other way.
if [ "$(node -p "require('./$plan').files.length")" = 0 ]; then echo '[]' | node scripts/lib/quarantine.mjs "$stage"; exit 0; fi

# One attempt: fresh clones, the plan built on them, a commit and a fast-forward push per
# repository. Exits 75 (try again) when a clone or a push fails, 1 when the build does.
attempt() {
  rm -rf "$work/repos"
  mkdir -p "$work/repos"
  local kind roots=()
  for kind in "${kinds[@]}"; do
    local at="$work/repos/$kind"
    git clone --quiet --filter=blob:none --no-checkout --depth 1 "https://github.com/arkpedia/arkpedia-$kind-assets.git" "$at" || return 75
    git -C "$at" sparse-checkout init --cone && git -C "$at" sparse-checkout set scripts sources .github && git -C "$at" checkout --quiet || return 75
    roots+=("$at")
  done
  python3 scripts/sync/publish-catalogue-assets.py "$plan" "${roots[@]}" --stage "$stage" --published "$work/published.json" || return 1
  for kind in "${kinds[@]}"; do
    at="$work/repos/$kind"
    if git -C "$at" diff --cached --quiet; then continue; fi
    git -C "$at" -c user.name='github-actions[bot]' -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
      commit --quiet -m "$([ "$mode" = staged ] && echo 'Publish art the content refresh staged' || echo 'Import newly discovered catalogue media')" || return 1
    GIT_SSH_COMMAND=$(ssh_for "$kind") git -C "$at" push "git@github.com:arkpedia/arkpedia-$kind-assets.git" HEAD:main || return 75
  done
}
attempts=4
backoff=${ARKPEDIA_PUBLISH_BACKOFF_SECONDS:-20}
for try in $(seq 1 "$attempts"); do
  status=0
  attempt || status=$?
  if [ "$status" = 0 ]; then break; fi
  if [ "$status" != 75 ] || [ "$try" = "$attempts" ]; then
    echo "Publishing failed (attempt $try of $attempts, exit $status); nothing further is adopted." >&2
    exit "$status"
  fi
  echo "A clone or push did not go through (attempt $try of $attempts); starting over from the new head in $((backoff * try))s." >&2
  sleep $((backoff * try))
done
npm run assets:update
if [ "$mode" = staged ]; then node scripts/sync/adopt-staged-art.mjs "$work/published.json"; fi
