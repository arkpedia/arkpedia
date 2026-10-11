# Game data sources


Upstream sources are inputs to import jobs, not runtime dependencies for game
records. `arkpedia-data/source/` is the reviewed canonical dataset; generated
`release/` payloads and Arkpedia's asset repositories are the website's delivery
sources. Import jobs may read external game dumps; operator pages must not fetch
those dumps directly. See [runtime content](runtime-content.md).

Game mechanics should come from extracted regional client tables. Released
operators' mechanics, modules included, are rebuilt from them on every refresh (see
below); editorial records and anything no table holds still originate from earlier
imports. Do not claim those have been verified merely because the release passes
schema validation. Preserve regional
provenance, use stable game IDs, and compare disputed values with the extracted
tables before publishing a correction. Reviews and recommendations are editorial,
not game-dump facts.

| Source | What it provides | Used by |
| --- | --- | --- |
| [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) (`en/gamedata/excel`) | The EN client's own tables — `activity_table`, `gacha_table`, `character_table`, `stage_table`, `item_table`, `building_data`, `charword_table`, `skin_table` (which outfits bring a voice set of their own). Authoritative for anything global has shipped. | `sync-event-windows.mjs`, `build-content-windows.mjs`, `import-reward-icons.py`, `build-operator-voices.mjs` |
| [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) (`zh_CN`) | The CN client's tables and level files, for content global has not received yet, and for the CN names needed to search prts.wiki. Every CN table of a refresh comes from here, at one commit. | every CN reader of the refresh (`scripts/content/cn-tables.mjs`) |
| [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) | Most art: `item/`, `map/`, `avatar/`, `portrait/`, `enemy/`, `building_skill/`. Its CN gamedata stands in for Kengxxiao's on a day that mirror cannot serve it. | `import-reward-icons.py`, `import_cc_stages.py`, material and skill icons |
| [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource) | The wider art set — full character art, story sprites, medals. | one-off art imports |
| [arknights.wiki.gg](https://arknights.wiki.gg) | EN key art (`File:EN <name> banner.png`), banner lineups the client tables leave out, and curated tables for things nobody has extracted from the raw data. Numbers here are a lead, not an answer — it lags the live event. | arkpedia-image-assets' `sync-images.yml` (`sync_global_banner_art.py`, `sync_recurring_banner_art.py`: the English banner and event art, which releases take with that repository's commit), `sync-catalogue.mjs` and `sync-recurring-banners.mjs` (lineups, through `wiki-pages.mjs`), transparent material icons |
| [prts.wiki](https://prts.wiki) | The CN wiki. Best source for interface art the mirrors do not carry (mode emblems, alliance badges, stratagem icons), usually at higher resolution. Filed under CN names. | Stronghold Protocol icons |
| [Closure Wiki](https://closure.wiki) | Community reference for operations, maps, drops, enemies and raw stage data. Operation pages use stable stage IDs; [YW-8 (`act52side_08`)](https://closure.wiki/operations/act52side_08) is a checked example. | Manual stage and enemy cross-checks; listed on the Credits page. Not currently an automated import. |
| [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2/tree/voice) | Public upstream recordings mirrored into Arkpedia's language-specific voice repositories. Each mirror records its upstream revision in `source.json`. | `build-operator-voices.mjs` |
| [isHarryh/Ark-Voice](https://github.com/isHarryh/Ark-Voice) | Recording inventory used to identify audio absent from current dialogue tables, including unused promotion lines and replaced recordings. | `build-operator-voices.mjs` |
| [arkpedia/arkpedia-l2d-assets](https://github.com/arkpedia/arkpedia-l2d-assets) | The Global client's animated outfit art (dynamic illustrations) as Spine 3.8 models, one immutable folder per source bundle, listed in its `manifest.json`. The site reads only the manifest, at the repository's main commit, and points each artwork at its `model.json` at that commit (`data/dynamic-art.json`); the reader's browser loads a model when they press Animated. | `sync-dynamic-art.mjs` |

Confirmed official announcement times take priority; client tables reconcile
estimated windows when no confirmed announcement time is recorded:
`sync-event-windows.mjs` overwrites estimated windows in `data/events/events_*.json`
and `data/headhunting_banners.json` once `activity_table`/`gacha_table` ship a real
one, which is also what the skins page's availability countdowns are computed from.

For Closure Wiki operation references, use `https://closure.wiki/operations/<stageId>`
with the exact client stage ID, rather than a translated stage code or event name.
The checked YW-8 page contains CN text: a page's presence does not confirm Global
availability. Compare its reference data with the matching regional client tables
before making a correction. Automated imports continue to read those tables;
Closure Wiki is a supplemental reference, not a runtime dependency.

## Module data and derived displays


- `uniequip_table.json` provides stable module IDs, names, types, missions and costs.
- `battle_equip_table.json` provides stage attributes and trait/talent candidates.
- Every module stage -- its effect text, its labels, its attribute bonuses and its
  costs -- is rebuilt on every run from those two tables by `module-stages.mjs`, which
  the English refresh (`sync-operator-english.mjs`, `officialModules`) runs for every
  released operator and the catalogue runs for a new one. A module the Global client
  does not have yet is built the same way from the CN tables, in the CN client's words,
  and replaced by the English the night the Global tables carry it. Only a module
  neither table has is kept as recorded.
- So a hand edit to a module's stage text is overwritten by the next refresh: a
  correction belongs upstream, in the game tables' reading (`module-stages.mjs`) or,
  for a module neither table has, in `arkpedia-data/source`.
- `officialModules` matches existing modules by ID or their exact module code/name. A
  shared `Upgrade` type is not an identity: one module's stages, costs or trait are
  never copied into another because they share a type.
- `sync-module-stats.mjs` is a fallback for attribute bonuses only: it reconciles them
  with the Global client's `battle_equip_table` on records the English refresh does
  not match to a game character.
- `getModuleStageEffects` derives the selected level's active descriptions from
  the stored stage changes. Traits carry forward; later versions of the same
  named effect replace earlier versions. This is display composition, not stat
  addition or a source of new game numbers.

## Operator costs

- Every material an operator's upgrades cost -- each promotion (with its LMD from
  `gamedata_const`), skill level 2 to 7, mastery and module stage -- is written from the
  game's tables on every refresh by `sync-operator-costs.mjs` (stage `operator-costs`),
  over whatever the record had: `character_table` (or `char_patch_table`) and
  `uniequip_table` of the Global client for an operator Global has, else of the CN
  client. Material names come from `scripts/lib/material-items.mjs`: the EN client's,
  else `data/material-names.json`. A wiki value stays only for an operator neither
  table has.
- A cost it cannot write keeps the record's value and is reported in
  `data/quarantine.json`: a material no English name is known for yet (never written
  in Chinese), a skill whose place cannot say which skill it is (the Global table names
  it otherwise, or the CN table lists another number of skills), a promotion or module
  stage the record numbers otherwise.
- Then the stage reads every record back and fails on any cost that still disagrees
  with the tables, so a hand edit to a cost is overwritten the next night, and a cost
  that cannot be made to agree is named in the daily issue. A correction belongs in the
  game tables' reading or in `data/material-names.json`, not in the record.
- `node scripts/sync/sync-operator-costs.mjs --check` (with `ARKPEDIA_EN` and
  `ARKPEDIA_CN` pointing at the tables) writes nothing and lists every cost that
  disagrees: the sweep.

Keep one editable canonical record. Generated page payloads, search indexes and
bundled fallback snapshots are intentional derived copies; regenerate them from
that record, never correct them independently. This rule matters more than whether
records are encoded as JSON or stored in a database.
