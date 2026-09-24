#!/usr/bin/env bash
# Scoped deploy keys can write only the two public media repositories.
set -euo pipefail
plan=.cache/catalogue/asset-plan.json
: "${CATALOGUE_IMAGE_DEPLOY_KEY:?Missing image repository deploy key}"
: "${CATALOGUE_SKIN_DEPLOY_KEY:?Missing artwork repository deploy key}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
umask 077
printf '%s\n' "$CATALOGUE_IMAGE_DEPLOY_KEY" > "$work/image-key"
printf '%s\n' "$CATALOGUE_SKIN_DEPLOY_KEY" > "$work/skin-key"
curl --fail --silent --show-error https://api.github.com/meta | node -e 'let s="";process.stdin.on("data",x=>s+=x).on("end",()=>{for(const key of JSON.parse(s).ssh_keys)console.log("github.com "+key)})' > "$work/known_hosts"
for kind in image skin; do
  GIT_SSH_COMMAND="ssh -i $work/$kind-key -o IdentitiesOnly=yes -o UserKnownHostsFile=$work/known_hosts -o StrictHostKeyChecking=yes" \
    git ls-remote "git@github.com:arkpedia/arkpedia-$kind-assets.git" HEAD > /dev/null
done
# Nothing to import still completes the stage: clear its quarantine entries, whose art
# has since been published some other way.
if [ "$(node -p "require('./$plan').files.length")" = 0 ]; then echo '[]' | node scripts/lib/quarantine.mjs catalogue-art; exit 0; fi
for kind in image skin; do
  repo="arkpedia-$kind-assets"
  git clone --filter=blob:none --no-checkout --depth 1 "https://github.com/arkpedia/$repo.git" "$work/$kind"
  git -C "$work/$kind" sparse-checkout init --cone
  git -C "$work/$kind" sparse-checkout set scripts sources .github
  git -C "$work/$kind" checkout
 done
python3 scripts/sync/publish-catalogue-assets.py "$plan" "$work/image" "$work/skin"
for kind in image skin; do
  if git -C "$work/$kind" diff --cached --quiet; then continue; fi
  git -C "$work/$kind" config user.name 'github-actions[bot]'
  git -C "$work/$kind" config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git -C "$work/$kind" commit -m 'Import newly discovered catalogue media'
  # Fast-forward only. A concurrent media job causes a retry, never an overwrite.
  GIT_SSH_COMMAND="ssh -i $work/$kind-key -o IdentitiesOnly=yes -o UserKnownHostsFile=$work/known_hosts -o StrictHostKeyChecking=yes" \
    git -C "$work/$kind" push "git@github.com:arkpedia/arkpedia-$kind-assets.git" HEAD:main
 done
npm run assets:update
