#!/usr/bin/env bash
# Compare the candidate operator records with the EN revision recorded by their release.
set -euo pipefail
revision=$(node -p "require('./data/upstream.lock.json').repositories['ArknightsAssets/ArknightsGamedata'].commit")
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid EN revision in data/upstream.lock.json' >&2; exit 1; }
echo "Auditing techniques against EN game data at $revision"
checkout=.cache/upstream/en-gamedata
excel=en/gamedata/excel
if [[ "$(git -C "$checkout" rev-parse HEAD 2>/dev/null || true)" == "$revision" ]]; then
  export ARKPEDIA_EN_EXCEL="$checkout/$excel"
else
  # Editorial releases run without the upstream checkout. Fetch only the five reference
  # tables, from the same immutable revision, without changing the candidate records.
  tables=$(mktemp -d)
  trap 'rm -rf "$tables"' EXIT
  for table in character_table char_patch_table skill_table battle_equip_table uniequip_table; do
    curl --fail --silent --show-error --retry 3 --max-time 90 \
      "https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/$revision/$excel/$table.json" -o "$tables/$table.json"
  done
  export ARKPEDIA_EN_EXCEL="$tables"
fi
node --import tsx scripts/audits/audit-techniques-vs-gamedata.ts --strict
