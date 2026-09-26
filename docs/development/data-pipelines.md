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
| `en-gamedata` | `ArknightsAssets/ArknightsGamedata` | `en/gamedata/excel`, `en/gamedata/levels` | the whole stage dataset: tables, maps, waves, enemy configurations |

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
| `stage-pipeline/build.mjs` | `data/stages/`, `data/stages-content.json`, `data/stage-geometry/`, `data/stage-conditional/`, `data/stage-tile-legend.json`, `public/stages-index.json` | EN gamedata |
| `build-mode-exclusions.mjs` | `data/excluded-contents.json` | `activity_table` types, content kinds |
| `import-stage-renders.mjs` | `preview` on stage records whose render is published; new renders staged in `.cache/stage-renders/` | EN `stage_table`, CN `map/` renders, the asset index |
| `import_is_nodes.py` | `data/is-nodes.json`; new IS renders staged in `.cache/is-nodes/` | `roguelike_topic_table`, fexli renders |
| `import_cc_stages.py` | `data/cc-stages.json`, CCB labels in `stages-content.json`; new CCB renders staged in `.cache/cc-stages/` | `medal_table`, `map/` renders |
| `import_stage_devices.py` | `data/stage-devices.json` | level files' `predefines`, `character_table` |
| `build-story-groups.mjs` | `data/story-groups.json` | `stage_table.storylines` |
| `build-content-windows.mjs` | `data/content-windows.json` | `activity_table`, `crisis_v2_table` |
| `import-item-icons.mjs` | `data/item-icons.json`; new token icons staged in `.cache/item-icons/` | stage drops, CN `item/` icons, the asset index |
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

Routine updates use `.github/workflows/prepare-content.yml` at 16:57 UTC,
after the public asset syncs. Unchanged upstream revisions skip expensive work.
The refresh includes English voice transcripts and missing English profile/archive
text, then proposes a reviewed release in `arkpedia-data`. The older
`refresh-stage-data.yml` workflow is a manual bundled-fallback tool only.

New supported records can reach the site without a website deployment through
[runtime content releases](runtime-content.md). New mechanics, schemas and UI
still require application changes.

### Art the importers fetch

No importer publishes art or writes it under `public/` (`check:assets` refuses any image
there). Each stages what `arkpedia-image-assets` does not publish yet under
`.cache/<kind>/`, as the source serves it, and lists it in `.cache/<kind>/staged.json`
with its destination and where it came from (`scripts/imports/staged_art.py`,
`scripts/lib/staged-art.mjs`); `config/staged-art.json` names the kinds: stage renders,
IS, CCB and RA renders, nation crests, drop and reward icons, album covers. Inside the
daily release the `staged-art` stage (`publish-catalogue-assets.sh --staged`) publishes
what each kind's stage staged in that run, if the stage ran to the end, with the
catalogue's deploy key and publisher: one size and encoding per destination folder
(material and item icons keep the game's 183px circled art), a source-map row for a
mirror's file, a provenance row in `sources/catalogue-imports.json` for every file, and a
fast-forward push retried from a fresh clone when another job pushed first. It then adopts
the new asset revisions and runs each importer that staged something again, so the records
point at the files and their quarantine entries clear in the same run. If anything after
the push fails, the stage is rolled back with the asset pins, and the next run adopts what
was pushed. A running event's stage with a map and still no preview is held by the
completeness stage (`stage-preview:<slug>`) whatever the reason. Run on its own,
`refresh-stage-data.sh` stages and reports, and publishes nothing.

`python3 scripts/sync/test-publish-catalogue-assets.py`, `python3 scripts/imports/test-degrading-importers.py`
and `scripts/tests/test-staged-art.ts` check this offline; the last runs the whole stage against a
scratch image repository, including a push that loses a race.

### What is not automatic

- Renders the CN mirror does not carry yet. A new event's stage renders arrive with
  yuanyan3060/ArknightsGameResource's `map/`; until then its stages show the event's
  poster, and the completeness stage lists them while the event runs.
- `TILES_PER_SECOND` in `lib/stages/stagePlayback.ts` is the one figure not read
  from the game's files; see the comment there.
- A brand-new *kind* of content (a new game mode, a new storyline) may need its own
  line in `build-mode-exclusions.mjs` or will simply land in "Events outside a
  storyline" until the storylines table names it.
