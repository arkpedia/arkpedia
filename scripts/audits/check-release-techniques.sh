#!/usr/bin/env bash
# Compare the candidate release against the exact EN and CN revisions that produced it.
set -euo pipefail
tables=$(mktemp -d)
trap 'rm -rf "$tables"' EXIT
reference() {
  local repo=$1 revision=$2 excel=$3 cached=$4 dest=$5 table
  [[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid revision for $repo" >&2; return 1; }
  echo "Auditing techniques against $repo at $revision" >&2
  if [[ "$(git -C "$cached" rev-parse HEAD 2>/dev/null || true)" == "$revision" ]]; then
    echo "$cached"
    return
  fi
  mkdir -p "$dest" || return 1
  for table in character_table char_patch_table skill_table battle_equip_table uniequip_table; do
    curl --fail --silent --show-error --retry 3 --max-time 90 \
      "https://raw.githubusercontent.com/$repo/$revision/$excel/$table.json" -o "$dest/$table.json" || return 1
  done
  echo "$dest"
}
revision=$(node -p "require('./data/upstream.lock.json').repositories['ArknightsAssets/ArknightsGamedata'].commit")
cn=$(node --input-type=module -e "import {cnTablesRecord,readLock} from './scripts/content/pin-upstream.mjs'; const pin=cnTablesRecord(readLock('.')?.cnTables); if (!pin) throw new Error('Invalid or missing CN game-table pin'); console.log(pin.repository, pin.commit, pin.folder)")
read -r cn_repo cn_revision cn_folder <<< "$cn"
ARKPEDIA_EN_EXCEL=$(reference ArknightsAssets/ArknightsGamedata "$revision" en/gamedata/excel .cache/upstream/en-gamedata/en/gamedata/excel "$tables/en")
ARKPEDIA_CN_EXCEL=$(reference "$cn_repo" "$cn_revision" "$cn_folder/excel" .cache/upstream/cn-resource/gamedata/excel "$tables/cn")
export ARKPEDIA_EN_EXCEL ARKPEDIA_CN_EXCEL
node --import tsx scripts/audits/audit-techniques-vs-gamedata.ts --strict
