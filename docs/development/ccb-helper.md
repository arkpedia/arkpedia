# CCB helper

The canonical route is `/game-modes/ccb`. The original `/ccb` bookmark redirects
there. Game Modes links to the helper regardless of the published content revision.
The app pins `config/ccb-archive.json` from the archive and offline normalizer at
`arkpedia-data` commit `6d03e6bb4a968b94ed6480611e383178f62a77e2`.

The archive covers CCB #1–5, with all five maps
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
repository's daily sync and pinned in `config/ccb-art.json`. Reader-facing text is in `components/ccb/strings.ts`.

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
visits perform no game login or game-server requests. The application build combines
the pinned contracts with its hydrated stage and operator records in a content-hashed
file under `public/_ccb/`. The page sends the file URL in its small Next.js payload and
the browser downloads the catalogue once. Cold Workers read the manifest through
their `ASSETS` binding. Each map uses the same snapshot after loading.

## Calculation boundary

The helper compares sheet stats with direct contract effects. Operator level,
promotion, trust, direct potential bonuses and direct module attributes form the
baseline. Skills, talents and module combat effects are excluded. An imported build
is only a default: editing the helper does not write to the account or roster.
Imported builds use the equipped module when the account contains it. Trust is
filled when the account records it or the import data includes the trust thresholds.
Readers can enter missing values in the editor.

The squad compares up to 13 distinct operators under the active contracts. Each
operator retains its own edited build, deployment tile and timing. Save preset
stores one squad and its build settings in this browser. Loading replaces the
current squad and evaluates it against the contracts currently selected on the board.

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
simulated. The displayed score sums contract points and completed-group bonuses. Maximum risk
accounts for conflicting alternatives and the group bonuses available together.

Underdawn contains two nodes for `enemy_atk_1`. Node identity and effect identity
are separate: selecting its alternate node replaces its earlier selection so one
archived effect is not counted/applied twice. A packed rune mutex key is not a node
exclusion group: additive tiers sharing that key can still be selected together.

## UI

The board draws source node positions and adjacency. Oversized boards have
horizontal controls. Contract connections and selected nodes use `--cat-red`
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
