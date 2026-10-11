# Data pipelines and audits

## Chibi artwork

`sync-chibi-art.mjs` reads `arkpedia/arkpedia-sd-assets`' main commit, then its manifest at that exact commit. `websiteSkins` maps the existing skin IDs to complete front/back/base models; `build-chibi-index.mjs` emits only SD repository URLs for their skeletons, atlases and every texture page. Base animation models stay separate from battle facings, and shared originals stay explicit aliases.

The `chibi-art` refresh stage runs with each content release. The fingerprint watches the SD repository, and hydration retains the bundled chibi catalogue until the data repository carries it. Missing or incomplete manifests fail the stage and retain the previous catalogue; an update cannot remove an existing skin/facing. There is no browser fallback to an upstream asset repository.

To adopt an already published SD manifest locally:

```sh
node scripts/sync/sync-chibi-art.mjs
```

New original models must first be imported, validated and mapped in SD's `websiteSkins`. This stage adopts published coverage; it does not discover or substitute upstream artwork. The operator page props carry the pinned URLs through `arkpedia-data`, so later SD catalogue updates need a content release rather than an application redeploy.

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

### Regional web campaigns

`sync-community-web-events.mjs` runs in the daily content refresh after official
news. It reads the public EN/JP/KR website home and news feeds and the Korean
official Naver cafe's web-event announcements. A campaign announced in one region
also prompts a check of the same campaign subdomain in the other regions.

Publication requires each regional campaign's own canonical URL and a complete,
unambiguous period in its rules. Entry scripts are read as text, never executed.
The supported rule formats are English numeric/named-month dates with UTC−7 and
Japanese/Korean year-month-day dates in their server time zones. The final minute
is inclusive; date-only Korean opening notices stay date-only. Unsupported rules
go to `data/quarantine.json` for review, and source outages retain verified records.

Verified records and official CDN artwork URLs go to
`data/community-web-events.json`; the normal content release updates Community →
World without a code deployment. `config/community-web-events.json` supplies
manually verified fallback cards until a release carries them. Closed events
remain in the data but disappear from the current-events view automatically.

Discovery currently covers recent official website/cafe announcements linking
campaign microsites. Social-only announcements and other URL/rule formats may
still need a manual entry or a new source/parser. Run the sync locally with
`node scripts/sync/sync-community-web-events.mjs`; it updates the records and
quarantine report.

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
the new asset revisions (asked again while GitHub still reports the head from before the
push), re-pins the records that name art by revision as the `media-pins` stage did, and runs
each importer that staged something again, so the records point at the files and their
quarantine entries clear in the same run, and the next day's run finds nothing to publish. If anything after
the push fails, the stage is rolled back with the asset pins, and the next run adopts what
was pushed. A staged file the publisher leaves out (gone, changed since it was staged, or
not an image) is only logged: the importer that staged it holds it under its own stage
(`stage-render:<stem>`, `item-icon:<id>`, ...) until a run publishes it, so it is one entry in
the daily issue, not two. A running event's stage with a map and still no preview is held by the
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
