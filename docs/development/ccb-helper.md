# CCB helper

Local route: `/game-modes/ccb`. The paired `feat/ccb-helper` branch in `arkpedia-data` owns
`source/data/ccb/archive.json`, its offline normalizer, and account-map trust thresholds.
Data dependency: `6d03e6bb4a968b94ed6480611e383178f62a77e2` (branch `feat/ccb-helper-season5`).
Preview pins the recovered archive in `config/ccb-archive.json`; normal content hydration cannot overwrite it.

Game Modes links to it in Preview. The archive covers CCB #1–5, with all five maps
per season, including reused rotational maps. CCB #5 has run on CN only; its season
and new map names are unofficial translations and the page says so.

## Page

One page, in the game's look, without its menu depth: every season, the permanent
site and the rotating sites are one press away in the hub, and every indicator group
is drawn at once as its tree of contract tiles. A tile is a toggle button carrying the
contract's own glyph. A side panel shows the pointed-at contract, the selection and
total risk, and stays at the bottom of the screen at phone width. Selecting a whole
group adds its bonus risk (`bonus`, the game's `rewardScore`); the snapshots record no
extra effect for a completed group. Under the hub: the map picture (opens large), the
battle parameters and the map's enemies as tiles, which drive the stat comparison.

Interface art (contract glyphs, region logos, area pictures, season banners) is
published in `arkpedia-image-assets` under `content-art/contingency-contract/` by that
repository's daily sync and pinned with the Integrated Strategies art in
`config/is-game-art.json`. Reader-facing text is in `components/ccb/strings.ts`.

## Sources

- Contract nodes, coordinates, edges, exclusions, scores, class/tile selectors and
  numerical effects: [pinned CN server-response snapshots](https://github.com/pfyy/OpenBachelorS/tree/5b879c824b1d2987a3b23def47a2a31945138057/data/crisisV2).
- English map names where available: [HellaAPI's archived season records](https://awedtan.ca/api/ccb).
- Enemy baselines: the existing stage records, geometry enemy levels and per-stage
  overrides. Replacement variants include stage-local `useDb: false` definitions.
- Trust thresholds: `favor_table.json` from [HellaAssets](https://github.com/HellaOrg/HellaAssets/blob/086b6839e8518cbc7b9a00acc0fef59b15801a59/gamedata/excel/favor_table.json),
  carried in `game-account-map.json`; arkpedia-data’s game-account-map builds read the
  upstream table. Account field names were checked against ArkPRTS's data model.

The CN archive is not evidence of Global availability, schedules, or officially
localized labels. English group labels and effect summaries are editorial; the
source Chinese names and fully substituted descriptions remain available in notes.

Rebuild the normalized archive from `arkpedia-data/importer/` with:

```
python3 scripts/imports/import-ccb-archive.py --input-dir <snapshot-directory>
```

The input directory holds `ccb-raw-1.json` through `ccb-raw-5.json` (from the pinned
paths above) and, optionally, `ccb-seasons.json` from HellaAPI. Builds and browser
visits perform no game login or game-server requests. `/ccb` is compiled as a Preview-only static page, outside production content publication. Its compact archive and map baselines
travel in page props together, so map changes are instant and do not mix releases.
`build-ccb-catalogue.ts` prepares `public/_ccb/catalogue.json` before the page build.
Cold Workers read that snapshot through their `ASSETS` binding, just as the IS page
reads its shipped theme manifest, so neither page depends on local source files or
a previously populated page cache.

## Calculation boundary

The helper compares sheet stats with direct contract effects. Operator level,
promotion, trust, direct potential bonuses and direct module attributes form the
baseline. Skills, talents and module combat effects are excluded. An imported build
is only a default: editing the helper does not write to the account or roster.
New imports retain displayed trust and the equipped module; older records remain
valid and show a manual/re-import prompt for those missing fields.

Additive percentage tiers sum; multiplicative runes multiply. Flat stat modifiers
apply before the percentage and multiplicative layers. ASPD changes affect attack
interval, with the 10–600 ASPD cap. Ground/high-tile and profession masks, enemy IDs,
and deployment-duration conditions are honored. Damage-taken reductions appear
separately from DEF/RES. Enemy replacement contracts change the modified baseline
and then apply the remaining contracts to the replacement's ID.

Mechanics outside the sheet calculator remain in the active modifier list and are
marked. They include skill/talent changes, tile mechanics, conditional statuses,
HP loss, SP recovery and battle rules. This is not a combat/damage simulator.
Node unlock/path progression and reward state are not
simulated. The displayed score is the sum of selected contract points plus the bonus of every completed group.

Underdawn contains two nodes for `enemy_atk_1`. Node identity and effect identity
are separate: selecting its alternate node replaces its earlier selection so one
archived effect is not counted/applied twice. A packed rune mutex key is not a node
exclusion group: additive tiers sharing that key can still be selected together.

## UI

The overview follows source group rows and widths; the group detail draws the source
node positions and adjacency. Contract connections and selected nodes use `--cat-red`
as game data, while ordinary controls use the site's usual selected/focus states.
Numerically lower stats use `--cat-red`, higher stats `--cat-green`, independently
of whether that change helps the player. Both also show signed numerical deltas.

## Checks

```
node --import tsx --test scripts/tests/test-ccb.ts scripts/tests/test-game-account.ts
npm run typecheck
npm run lint
npm run audit:styles
npm run check:styles
```
