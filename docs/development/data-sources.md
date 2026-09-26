# Game data sources


Upstream sources are inputs to import jobs, not runtime dependencies for game
records. `arkpedia-data/source/` is the reviewed canonical dataset; generated
`release/` payloads and Arkpedia's asset repositories are the website's delivery
sources. Import jobs may read external game dumps; operator pages must not fetch
those dumps directly. See [runtime content](runtime-content.md).

Game mechanics should come from extracted regional client tables. Some historical
module descriptions and editorial records still originate from earlier imports;
they are not all refreshed by the stat synchronizer. Do not claim they have been
verified merely because the release passes schema validation. Preserve regional
provenance, use stable game IDs, and compare disputed values with the extracted
tables before publishing a correction. Reviews and recommendations are editorial,
not game-dump facts.

| Source | What it provides | Used by |
| --- | --- | --- |
| [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) (`en/gamedata/excel`) | The EN client's own tables — `activity_table`, `gacha_table`, `character_table`, `stage_table`, `item_table`, `building_data`. Authoritative for anything global has shipped. | `sync-event-windows.mjs`, `build-content-windows.mjs`, `import-reward-icons.py` |
| [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) (`zh_CN`) | The CN client's tables and level files, for content global has not received yet, and for the CN names needed to search prts.wiki. Every CN table of a refresh comes from here, at one commit. | every CN reader of the refresh (`scripts/content/cn-tables.mjs`) |
| [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) | Most art: `item/`, `map/`, `avatar/`, `portrait/`, `enemy/`, `building_skill/`. Its CN gamedata stands in for Kengxxiao's on a day that mirror cannot serve it. | `import-reward-icons.py`, `import_cc_stages.py`, material and skill icons |
| [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource) | The wider art set — full character art, story sprites, medals. | one-off art imports |
| [arknights.wiki.gg](https://arknights.wiki.gg) | EN key art (`File:EN <name> banner.png`), banner lineups the client tables leave out, and curated tables for things nobody has extracted from the raw data. Numbers here are a lead, not an answer — it lags the live event. | arkpedia-image-assets' `sync-images.yml` (`sync_global_banner_art.py`, `sync_recurring_banner_art.py`: the English banner and event art, which releases take with that repository's commit), `sync-catalogue.mjs` and `sync-recurring-banners.mjs` (lineups, through `wiki-pages.mjs`), transparent material icons |
| [prts.wiki](https://prts.wiki) | The CN wiki. Best source for interface art the mirrors do not carry (mode emblems, alliance badges, stratagem icons), usually at higher resolution. Filed under CN names. | Stronghold Protocol icons |
| [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2/tree/voice) | Public upstream recordings mirrored into Arkpedia's language-specific voice repositories. Each mirror records its upstream revision in `source.json`. | `build-operator-voices.mjs` |
| [isHarryh/Ark-Voice](https://github.com/isHarryh/Ark-Voice) | Recording inventory used to identify audio absent from current dialogue tables, including unused promotion lines and replaced recordings. | `build-operator-voices.mjs` |

Confirmed official announcement times take priority; client tables reconcile
estimated windows when no confirmed announcement time is recorded:
`sync-event-windows.mjs` overwrites estimated windows in `data/events/events_*.json`
and `data/headhunting_banners.json` once `activity_table`/`gacha_table` ship a real
one, which is also what the skins page's availability countdowns are computed from.

## Module data and derived displays

- `uniequip_table.json` provides stable module IDs, names, types, missions and costs.
- `battle_equip_table.json` provides stage attributes and trait/talent candidates.
- `sync-module-stats.mjs` reconciles attribute bonuses. It does **not** refresh all
  stored effect descriptions; those require a separately validated import.
- `sync-operator-english.mjs` matches existing modules by ID or their exact module
  code/name. A shared `Upgrade` type is not an identity. CN-only records survive
  an English refresh instead of being replaced by another Global module.
- `getModuleStageEffects` derives the selected level's active descriptions from
  the stored stage changes. Traits carry forward; later versions of the same
  named effect replace earlier versions. This is display composition, not stat
  addition or a source of new game numbers.

Keep one editable canonical record. Generated page payloads, search indexes and
bundled fallback snapshots are intentional derived copies; regenerate them from
that record, never correct them independently. This rule matters more than whether
records are encoded as JSON or stored in a database.
