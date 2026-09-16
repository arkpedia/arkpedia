# Game data sources


Everything on the site that states a fact about the game is derived from one of
these, not typed in by hand. The refresh pipeline (`scripts/sync/refresh-stage-data.sh`)
pulls from them; each script's own header says which it uses and why.

| Source | What it provides | Used by |
| --- | --- | --- |
| [ArknightsAssets/ArknightsGamedata](https://github.com/ArknightsAssets/ArknightsGamedata) (`en/gamedata/excel`) | The EN client's own tables — `activity_table`, `gacha_table`, `character_table`, `stage_table`, `item_table`, `building_data`. Authoritative for anything global has shipped. | `sync-event-windows.mjs`, `build-content-windows.mjs`, `import-reward-icons.py` |
| [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData) (`zh_CN`) | The CN client's tables, for content global has not received yet, and for the CN names needed to search prts.wiki. | CN-ahead lookups |
| [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource) | CN gamedata plus most art: `item/`, `avatar/`, `portrait/`, `enemy/`, `building_skill/`. | `import-reward-icons.py`, material and skill icons |
| [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource) | The wider art set — full character art, story sprites, medals. | one-off art imports |
| [arknights.wiki.gg](https://arknights.wiki.gg) | EN key art (`File:EN <name> banner.png`), and curated tables for things nobody has extracted from the raw data. Numbers here are a lead, not an answer — it lags the live event. | `sync-banner-art.py`, transparent material icons |
| [prts.wiki](https://prts.wiki) | The CN wiki. Best source for interface art the mirrors do not carry (mode emblems, alliance badges, stratagem icons), usually at higher resolution. Filed under CN names. | Stronghold Protocol icons |
| [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2/tree/voice) | Public upstream recordings mirrored into Arkpedia's language-specific voice repositories. Each mirror records its upstream revision in `source.json`. | `build-operator-voices.mjs` |
| [isHarryh/Ark-Voice](https://github.com/isHarryh/Ark-Voice) | Recording inventory used to identify audio absent from current dialogue tables, including unused promotion lines and replaced recordings. | `build-operator-voices.mjs` |

Dates are reconciled against the client tables rather than announcements:
`sync-event-windows.mjs` overwrites estimated windows in `data/events/events_*.json`
and `data/headhunting_banners.json` once `activity_table`/`gacha_table` ship a real
one, which is also what the skins page's availability countdowns are computed from.
