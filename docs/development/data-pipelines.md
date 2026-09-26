# Data pipelines and audits

## audit-base-skills.mjs

Checks the base-skill model against the game's own `building_data.json`.

```bash
npm run audit:base              # check -- exits 1 on any new finding
npm run audit:base -- --update  # accept the current state as the baseline
```

Needs the EN gamedata. Defaults to the upstream cache the stage pipeline keeps,
`.cache/upstream/en-gamedata/en/gamedata/excel`, so `npm run stages:refresh` is what
fills it; override with `ARKPEDIA_GAMEDATA`. With no gamedata present it prints
`SKIPPED` and exits 0, so it never blocks work on a machine that doesn't have it.

### What it checks, and why the type system can't

Every base skill reaches the calculation either through a
`lib/base/*SpecialSkills.ts` map keyed `"Operator|SkillName"`, or through a
generic regex over its English description. **Both fail silently.** A handler
key carrying a quote the scraped name lacks is simply never called, and a skill
that matches no handler and no regex is worth zero. Neither shows up in `tsc`,
in a build, or in the UI -- Viviana's key was wrong for as long as the handler
existed, and the only symptom was a plausible-looking number.

| check | catches |
|---|---|
| `activation` | an Elite 2 skill that should replace its Elite 0 version but stacks with it, or a skill live at the wrong tier |
| `deadKeys` | handler keys matching no real operator/skill -- dead code |
| `coverage` | skills no handler and no regex touches |
| `unmatched` | operators absent from the gamedata dump, so unverifiable |

### The baseline

`base-skill-audit-baseline.json` holds the known, accepted findings, so a clean
run means "nothing new" rather than "nothing at all". It currently holds only
deliberate omissions: Training Room (129 skills) and Workshop (118), neither
modelled on purpose, plus `Ukusik`, who postdates the EN dump.

Only baseline something after deciding it is genuinely not worth modelling.
Anything else appearing here is either a bug or an operator to wire up.

### After a gamedata refresh

1. Regenerate the slot table (see the header of `lib/base/baseSkillSlots.ts`).
2. Run `npm run audit:base`.
3. Work through anything it reports as NEW.

Step 2 is the point of all this: new operators arrive with skills whose
conditions only exist as English prose, so a human still has to read them and
write the handler. What this removes is having to *notice* that they need one.

## Stage data pipeline

### Before the first refresh

Serving the site needs nothing but `npm install`: every byte it reads is committed.
Refreshing needs two things the repo cannot install for you:

```bash
python3 --version          # 3.10 or newer
pip install pillow certifi # renders are converted to webp; urllib needs a trust store
```

Nothing else. Every upstream source is public and no step needs credentials: this
repo is what gets deployed, so it has to be able to rebuild its own data even if
every other repo in the project goes away.

`npm run stages:refresh` rebuilds everything under `data/` and `public/` that
describes stages, in dependency order. A fresh clone of this repo is all it needs:
the first step pulls the upstream data into `.cache/upstream/` as partial, shallow,
sparse checkouts, downloading only the paths the later steps read.

| cache | upstream | paths | why |
| --- | --- | --- | --- |
| `cn-tables` | `Kengxxiao/ArknightsGameData` | `zh_CN/gamedata/excel`, `zh_CN/gamedata/levels` | CN gamedata and level files |
| `cn-tables-fallback` | `yuanyan3060/ArknightsGameResource` | `gamedata/excel`, `gamedata/levels` | the same, only on a day the first cannot serve them |
| `cn-art` | `yuanyan3060/ArknightsGameResource` | `map`, `item` | CCB renders, item icons |
| `en-gamedata` | `ArknightsAssets/ArknightsGamedata` | `en/gamedata/excel`, `en/gamedata/levels` | the whole stage dataset: tables, maps, waves, enemy configurations (a level Global has dropped is read from the CN tables instead) |

Every CN table of a run comes from one mirror at one commit
(`scripts/content/cn-tables.mjs`): Kengxxiao at the pinned commit, else its commit from the
last run, else yuanyan3060, whichever first passes the table contract, recorded as
`cnTables` in `data/upstream.lock.json`. The steps read `.cache/upstream/cn-resource`, a
directory of links: `gamedata/` to the tables the run settled on, `map/` and `item/` to
`cn-art`. The two mirrors write enums differently (names against numbers); the stage steps
take either, the catalogue only names, so on a yuanyan day it keeps its records as they were.
Only no usable CN tables stops the refresh; without the art, `item-icons` is skipped.

Every input is gamedata. Measured drop rates from `penguin-stats.io` used to be read
here too and were removed: they were the only non-gamedata input and the only one that
changed without the game changing, so a scheduled refresh produced a diff most days
from sample counts that were never displayed.

IS renders come over HTTPS per file from `fexli/ArknightsResource`, at a commit
pinned in `import_is_nodes.py` — bump `REPO_COMMIT` for a new season's renders.

Then `npm run build`. Set `ARKPEDIA_CN` or `ARKPEDIA_EN` to point a step at a local
checkout instead of the cache.

### What each script owns

| script | writes | reads |
| --- | --- | --- |
| `stage-pipeline/build.mjs` | `data/stages/`, `data/stages-content.json`, `data/stage-geometry/`, `data/stage-conditional/`, `data/stage-tile-legend.json`, `public/stages-index.json` | EN gamedata; a CN level file where Global has dropped a stage's own (see `scripts/stage-pipeline/README.md`) |
| `build-supply-stages.mjs` | `data/supply-stages.json` (the planner's supply table) | the supply content's stage records and their guaranteed drops |
| `build-mode-exclusions.mjs` | `data/excluded-contents.json`; holds in `data/quarantine.json` | `activity_table` types, content kinds, `data/game-modes.json` |
| `import_is_nodes.py` | `data/is-nodes.json`, IS renders | `roguelike_topic_table`, fexli renders |
| `import_cc_stages.py` | `data/cc-stages.json`, CCB renders, CCB labels in `stages-content.json` | `medal_table`, `map/` renders |
| `import_stage_devices.py` | `data/stage-devices.json` | level files' `predefines`, `character_table` |
| `build-story-groups.mjs` | `data/story-groups.json` | `stage_table.storylines` |
| `build-content-windows.mjs` | `data/content-windows.json` | `activity_table`, `crisis_v2_table` |
| `import-item-icons.mjs` | `public/item-icons/`, `data/item-icons.json` | upstream `images/manifest.json` |
| `enrich-stage-index.mjs` | `public/stages-index.json` (in place) | everything above |
| `build-enemy-records.mjs` | `data/enemies/`, `data/enemy_appearances.json` | `enemy_handbook_table`, `enemy_database`, stage records, the enriched index |
| `build-enemy-stage-appearances.mjs` | `data/enemy-stage-appearances.json` | stage records, the enriched index |
| `build-enemies-index.mjs` | `public/enemies-index.json` | `data/enemies/`, `data/enemy_appearances.json` |
| `build-stronghold-enemies.mjs` | `data/stronghold_enemies.json` | stage records, `data/enemies/`, `public/enemies-index.json` |

`enrich-stage-index.mjs` **runs last of the steps that write the index**: it applies
the exclusions and folds in the variant links, the names the source leaves blank, CCB
codes and names, and the content labels. Running it before the others leaves the index
missing all of that. The enemy steps run after it, because they take the enriched
index as the list of stages that get a page. `check-completeness.mjs` fails a release
in which a listed stage fields an enemy with no record or no `enemies-index.json` row.

### Doing it on a schedule

Routine updates use `.github/workflows/prepare-content.yml` (the schedule and the
gates are in [runtime content](runtime-content.md)). Unchanged upstream revisions skip
expensive work. The refresh includes English voice transcripts and missing English
profile/archive text, then publishes a release to `arkpedia-data`. It is the only
workflow that runs `stages:refresh` or `assets:update`
(`scripts/tests/test-workflow-files.ts` holds that).

The app's own `data/` is never rebuilt from upstream on a schedule. It is the bundled
fallback (Check, the browser specs, `ARKPEDIA_CONTENT_DISABLED=1`), and it follows the
canonical records in `arkpedia-data`, not the mirrors:

```bash
node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> data/stages data/stage-geometry public/stages-index.json
node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> --check data/stages   # exits 1 on a difference
```

A workflow that used to rebuild `data/` from upstream and open a pull request into this
repository (`refresh-stage-data.yml`) was retired on 2026-09-26: its bundle could diverge
from `arkpedia-data` (a hand correction made there was overwritten in the app copy), and
merging it re-pinned the deploy's assets and deployed production.

New supported records can reach the site without a website deployment through
[runtime content releases](runtime-content.md). New mechanics, schemas and UI
still require application changes.

### What is not automatic

- New RENDERS. `scripts/stage-pipeline/` decides which stage points at which
  in-game map picture and resolves it against `public/stages-images/`, but it does
  not fetch new artwork: a new event's renders still have to be added there.
- `TILES_PER_SECOND` in `lib/stages/stagePlayback.ts` is the one figure not read
  from the game's files; see the comment there.
- A brand-new *kind* of content. `data/game-modes.json` (kept by hand in arkpedia-data,
  checked by `lib/stages/gameModes.mjs`) says what each `activity_table` type is: a
  limited-time mode whose stages the list never offers (`excludedActivityTypes`), a
  challenge mode the game files as an event but shows under Seasonal Challenge
  (`seasonalChallenges`, with the display code its contents carry), or a story episode
  (`storyActivityTypes`, a pattern). An event of a type it does not classify is still
  listed as an ordinary event, but `build-mode-exclusions.mjs` holds it in
  `data/quarantine.json` (key `activity-type:<content>`, naming the type), so the daily
  "Content quarantined" issue lists it until the record says what it is. A challenge
  season whose code is not the record's is held the same way (`challenge-label:`). Either
  fix is a data edit in arkpedia-data, not an app deploy. A new storyline still lands in
  "Events outside a storyline" until the storylines table names it.
- A second Reclamation Algorithm season. `data/ra-nodes.json` is one season's survey
  (`contentId`, sandbox_1); another season's page draws no map until it has its own.
