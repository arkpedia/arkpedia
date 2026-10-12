# Automatic chibi delivery — 2026-10-11

Scope: `arkpedia/arkpedia-sd-assets`, the website's chibi content stage and live operator pages at `https://www.arkpedia.net`. Other artwork repositories, operator availability metadata and simulator combat support are excluded.

The live migration already removed upstream chibi URLs from all 434 published operator routes, with desktop/mobile default, skin and base playback verified at website commit `7209136a96f943317a8ae60f6c0d2cb2ae84d7c8`. The remaining broken handoff was upstream discovery: SD had no scheduled importer, and its curated `refresh` command revisited existing entries only.

| Handoff | Repair and evidence |
|---|---|
| New upstream operator/skin → exact model identity | Native skin table and Spine tree at one source commit; battle prefab, template form and building prefab handled separately |
| Complete original files → SD manifest | Immutable skeleton/atlas/all PNG pages; checksum and Spine version validation before atomic manifest publication |
| Source additions → scheduled publication | New daily `sync-chibis.yml` at 16:23 UTC; sequential writers, validated commit/push, failure/recovery issue |
| SD publication → website content release | SD added to the shared asset sync wait/report list; existing SD fingerprint and commit-pinned consumer remain enforced |
| Content release → served pages | Existing live pointer, dynamic operator props and cache refresh mechanism; no app redeploy needed for future model-only changes |

Local replay of upstream `d7bdc0146f99f6fa88ecdc1bbf79021c012c21c5` adds 18 complete models and nine skin IDs: default/E2 IDs for `char_393_toledo`, `char_4231_clemnt`, `char_4232_hbound`, and Sightseer outfits for `char_1042_phatm2`, `char_194_leto`, `char_4204_mantra`. All previous 2,961 model records and 1,378 skin mappings remain unchanged. All 18 new skeletons parse with no missing atlas regions. `char_101_sora@summer#1` remains explicitly pending because the upstream tree contains no battle model.

Regression tests replay a new operator, a skin with a distinct dormitory prefab, multiple atlas pages, incomplete upload/failure retention, retry/idempotency, changed model bytes with old revision retention, reviewed simulator preservation, duplicate native prefabs, and a truncated skin table. The website's release tests include SD in the exact list used for both waiting and operational reports.

Local replay is verified working. Scheduled publication and live adoption require a successful workflow run and served evidence after merge; configured automation alone does not establish unattended execution at a future operator release. Upstream asset availability and delayed cron execution remain timing limits; failures retain the previous published catalogue and raise operational reports.
