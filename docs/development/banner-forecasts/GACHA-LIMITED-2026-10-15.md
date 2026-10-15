# Limited navigation and Global banner ingestion — 15 October 2026

Crossover banners belong in the simulator's Limited navigation group. Their stored pull type, simulator configuration, 120-pull guarantee, five-star guarantee, isolated pity, and historical records retain their distinct rules. The desktop tabs and phone dropdown use the same grouping. Historical banner and alias links resolve to the corresponding group rather than silently selecting the first Upcoming banner.

## Verified source findings

The current EN game-data extraction is [ArknightsAssets commit 3aaa25b649fed5dedad9527602826dc487ea07d8](https://github.com/ArknightsAssets/ArknightsGamedata/blob/3aaa25b649fed5dedad9527602826dc487ea07d8/en/gamedata/excel/gacha_table.json), published 14 October. The independent [PuppiizSunniiz extraction at 5420229ab69a019d9593a0f85c49f9523f57e2c4](https://github.com/PuppiizSunniiz/ArknightsGameData_YoStar/blob/5420229ab69a019d9593a0f85c49f9523f57e2c4/en_US/gamedata/excel/gacha_table.json) agrees. These are extracted primary game tables, not official schedule announcements.

| Banner | Region / identity | Verified timing and status |
|---|---|---|
| Orienteering #7 | CN `SPECIAL_73_0_3`; no EN pool shipped in either extraction | CN 15–29 May 2026. Existing Global 18 October–1 November remains an **estimate**, with Global candidates withheld. The client's official shared title is “Orienteering Headhunting”; #7 is the site's edition label. |
| Standard #178 | Global `DOUBLE_EN_42_0_2` | **Datamined** 23 October 11:00 UTC–6 November 11:00 UTC, end exclusive (04:00–03:59 UTC−7). Nameplate artwork reads Ines / Zuo Le / Record Keeper / Spuria / Proviso. |
| Sealed With Time | Global `LIMITED_EN_42_0_1` | **Announced** 14 October 15:00 UTC–28 October 11:00 UTC. [Official news 4814, section 02](https://www.arknights.global/news/4814) overrides the client's 12:00 UTC maintenance opening. |
| Kernel Locating #13 | Global `FESCLASSIC_EN_42_0_1` | **Announced** 20 October 11:00 UTC–3 November 11:00 UTC; [news 4814, section 15](https://www.arknights.global/news/4814), with candidate IDs confirmed by the client. |

Standard #178's artwork was read with the existing OCR/name-matching importer from [the EN asset extraction](https://github.com/ArknightsAssets/ArknightsAssets2/tree/6df8f6877a03e16f6a1499172a8de10f0f6f773a/assets/dyn/%5B%5Ben%5D%5D/ui/gacha/double_en_42_0_2). No Global #7 release date or candidate set is invented.

## Update path

Prepare content runs the catalogue, then `refresh-stage-data.sh` runs `sync-recurring-banners.mjs` and `sync-event-windows.mjs`. The recurring stage now finishes with EN reconciliation, after wiki/CN enrichment. It imports exact active/upcoming client windows, respects named official announcement times, and resolves future Orienteering editions through a unique recorded immediate EN predecessor, independent of drifting forecast dates. The client candidate IDs replace CN candidates only once a Global pool exists. Incomplete/unknown candidates publish an empty pending lineup and quarantine entry. JP/CN IDs and conflicting edition identities cannot claim an EN forecast. Previous source URLs survive unchanged timestamps, so mirror revisions alone do not churn data.

The following event-window stage preserves announcement-backed windows. A content release updates this data without a subsequent code deploy once the compiler is published. Both app snapshots and the separate public data correction are supplied; app data alone would be overwritten by release hydration.

## Publication

Production requires approval: merge the reviewed application PR to `main`, wait for its exact-commit Check and NAS Deploy, then dispatch Prepare content release on `main` with the reviewed correction branch as `data_ref` and `refresh_upstream=false` (or a successful normal refresh). Verify `/build-info.json`, the `live` pointer's generator/revision, and served Gacha props. Only the dev branch/channel is authorized for publication in this task.

## Local validation

Eight Playwright checks passed at desktop 1440×1000 and Pixel 7 widths: category controls, historical crossover deep links/reload, crossover and limited guarantee displays, pulls, datamined Standard #178 labels/candidates, and Orienteering #7 forecast withholding across Gacha and the schedule/calendar. The screenshots are `test-results/gacha-limited-desktop.png` and `test-results/gacha-limited-mobile.png` in the isolated review checkout; both were visually inspected, with no horizontal page overflow.

Typecheck, lint (existing warnings within its budget), style drift/unstyled-class gates, the full production build and its trace/client-chunk gates passed. The broad regression run had 1,865 passes and three expected skips; its one additional failure was the new optional source-status field in the old-release shape check. The field is now explicitly documented as optional data, with the actual legacy-label fallback tested; the 32 old-release tests and focused banner tests passed after the correction. The 20 stage-runner tests passed, including existing quarantine behavior. New fixtures cover an absent Global #7, a deliberately synthetic future EN edition, forecast drift, foreign regions, unknown IDs, repeated runs/source revisions, and official-time precedence.
