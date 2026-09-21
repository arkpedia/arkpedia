#!/usr/bin/env bash
#
# Rebuilds everything under data/ and public/ that describes stages, in the order
# the steps depend on each other. Run it after a new event lands.
#
# A fresh clone of THIS repo is all it needs. Everything upstream is pulled into
# .cache/upstream/ as partial, shallow, sparse checkouts -- only the paths a step
# actually reads are downloaded -- and re-running fetches just what moved.
#
# Every step is idempotent, so running it twice is harmless. Point any step at a
# local checkout instead with ARKPEDIA_CN / ARKPEDIA_EN.
set -euo pipefail
cd "$(dirname "$0")/../.."
# shellcheck source=lib/upstream.sh
. scripts/lib/upstream.sh

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step 'Upstream data'
# Every source is PUBLIC. Nothing here needs credentials or a sibling checkout,
# which is the point: this repo is what gets deployed, so it has to be able to
# rebuild its own data even if every other repo in the project goes away.
#
# CN gamedata, the level files the devices come out of, CCB map renders, item icons.
upstream_sync cn-resource https://github.com/yuanyan3060/ArknightsGameResource.git default \
  gamedata/excel gamedata/levels map item
# EN gamedata: the whole stage dataset comes out of this one. excel/ for the
# tables, levels/ for the maps, the waves and the enemy configurations.
upstream_sync en-gamedata https://github.com/ArknightsAssets/ArknightsGamedata.git default \
  en/gamedata/excel en/gamedata/levels

step 'Verified Global recruitment pool'
node scripts/sync/sync-recruitment.mjs

step 'The stage dataset: records, geometry, contents, index'
node scripts/stage-pipeline/build.mjs

# --- everything below is DERIVED from what the build just wrote --------------

step 'Limited-time game modes to exclude'
node scripts/build/build-mode-exclusions.mjs

step 'Integrated Strategies nodes: renders, Emergency Ops, borrowed names'
python3 scripts/imports/import_is_nodes.py

step 'Contingency Contract Battleplan: codes, names, renders, CCB labels'
python3 scripts/imports/import_cc_stages.py

step 'Reclamation Algorithm maps, which only the wiki has'
python3 scripts/imports/import_ra_maps.py

step 'Pre-placed devices on each map'
python3 scripts/imports/import_stage_devices.py

step 'Supply stages: which permanent stage hands out which material'
# After the stage build, because it reads data/stages.json.
node scripts/build/build-supply-stages.mjs

step "The depot screen's own item order"
node scripts/build/build-ingame-order.mjs

step "Base formulas (Workshop + Factory), for the planner's crafting"
# Reads the EN tables synced above. Not a stage step, but it is the only place the
# EN gamedata is already on disk, and a formula table that ages silently is worse
# than one that costs a few seconds here.
node scripts/imports/import-base-formulas.mjs

step 'Story groups: the acts and the 13 side-story lines'
node scripts/build/build-story-groups.mjs

step 'Annihilation rotation and SSS seasons'
node scripts/build/build-mode-rotations.mjs

# After the build, because it reads the Annihilation contents to know which nations
# to ask the wiki for. The hand-fed importers (import-story-marks.py,
# import-act-marks.py, import-mode-marks.py) are NOT here on purpose: their input is
# screenshots and traced art, not anything this script can fetch.
step 'Nation crests for the Annihilation cards'
python3 scripts/imports/import-nation-marks.py

step 'Run windows, for the Current group and the default chapter'
node scripts/build/build-content-windows.mjs

step 'Item icons for the drops'
node scripts/imports/import-item-icons.mjs

# Independent of the stage dataset -- it reads character_table and range_table, plus
# our own operator records for the alter names -- but it belongs to the same refresh:
# a new operator has to reach the map's deploy bar too.
step 'Operators the map can deploy: ranges and DP per promotion'
node scripts/build/build-operator-deploy.mjs
step 'Amiya class forms: the Guard and Medic operator records'
node scripts/build/build-amiya-forms.mjs
# After the Amiya forms, not before: that step WRITES two operator records into
# data/operators-5star, and this one reads every record in data/operators-* to decide
# whose skills it has to look up. Run the other way round it would simply not see the
# two forms and would leave their skill ranges out, silently -- it fails loudly on a
# record it cannot match in the gamedata, but not on a record that is not there yet.
step 'Skills that change an operator attack range'
node scripts/build/build-skill-ranges.mjs

# After the enemy index, since it reads the stat lines out of it, and after the stage
# records, since it reads which enemies each stage fields.
step 'Enemies of the running Stronghold Protocol event'
node scripts/build/build-stronghold-enemies.mjs

# Last, and it has to be last: it applies the exclusions to the index and copies
# in what the steps above resolved -- variant links, the names the source leaves
# blank, CCB codes and names, and the content labels.
step 'Index enrichment (must run last)'
node scripts/build/enrich-stage-index.mjs

step 'Event and banner calendars: real windows over estimates'
# The events files are written from announcements and carry ESTIMATED dates for
# the future; once the client ships an activity or gacha window, that window is
# the truth. This keeps the home page's countdowns agreeing with the Terminal,
# which reads the same client tables via build-content-windows.mjs.
step 'Recurring Standard and Kernel banners'
node scripts/sync/sync-recurring-banners.mjs
node scripts/sync/sync-event-windows.mjs

step 'Reward icons for events global has not received yet'
# CN-sourced art for the items the event stores name before the EN client ships
# them -- the art is identical on both servers, and when global launches and the
# data's names flip from CN to the official EN spellings, the same step fetches
# them again under the new names. See the script's own header for the sources.
python3 scripts/imports/import-reward-icons.py

step 'Banner art: swap CN banners for the EN uploads once global has them'
python3 scripts/sync/sync-banner-art.py

step 'Done'
node -e '
const fs = require("fs");
const index = JSON.parse(fs.readFileSync("public/stages-index.json", "utf-8"));
const count = (p) => fs.existsSync(p) ? fs.readdirSync(p).length : 0;
console.log(`  ${index.length} stages in the index`);
console.log(`  ${count("data/stages")} stage records, ${count("data/stage-geometry")} geometries`);
console.log(`  ${count("public/stages-images")} renders, ${count("public/item-icons")} item icons`);
console.log("  next: npm run build");
'
