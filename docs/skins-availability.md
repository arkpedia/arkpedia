# Skin acquisition windows

The gallery treats original release history and current acquisition as separate records. `data/skin-availability-windows.json` contains verified Global windows with an explicit inventory, acquisition method, source, and exclusive closing instant. IDs are `operator / outfit` so identical outfit names cannot share stock accidentally.

Verified on 22 September 2026:

| Method | Inventory | Window source |
| --- | --- | --- |
| Outfit shop | Surtr / Prelude to Transcendence; Nymph / Blooming Reverie | [People, A People, section 04](https://www.arknights.global/news/4635) |
| Returning shop outfits | Qiubai / Courtesy; Corroserum / Leisure; Cement / New Business; Pinecone / Season of Travel | [When Elegies Are Ashes Rerun, section 05](https://www.arknights.global/news/4452) |
| Event reward | Mousse / Hydration Time | [Stronghold Protocol: Alliance, Stronghold Credit](https://www.arknights.global/news/4434) |
| Event exchange | Ethan / Infiltrator | [People, A People, Snow-Soaked Campfire](https://www.arknights.global/news/4635) |
| Random draw | Fashion Review II (16 outfits), III (18 outfits) | [Official timing and draw rules, section 04](https://www.arknights.global/news/4635); [complete pool inventories](https://arknights.wiki.gg/wiki/Store#Limited-Time_Fashion_Review) |

Shop and redemption windows can outlast playable stages. Announcement end times of 03:59 are stored as exclusive 04:00 UTC−7. Stronghold's earning deadline and reward-claim deadline are separate and described in the reward details.

`lib/skins/skinAvailability.ts` also derives upcoming projections from explicit shop rotations and release associations. Projections remain labelled estimates and never become confirmed live stock merely because their start date passed. A historical `fashionReviewDate` or event `hasFashionReview` flag does not prove current OP availability or random-pool membership.

For a new verified sale, add its full Global inventory and its own start/end times. Do not infer returning stock from an event rerun or assume CN shop offsets are unchanged on Global. Preserve original release/acquisition fields in `skins.json`.

The testing app publishes these records in `arkpedia/arkpedia-data` under `source/data/`. Update that source alongside the app fallback; source hydration removes files absent from the data repository. Newly compiled `/skins` content carries `availabilityWindows`; the page accepts older content payloads and derives windows from its bundled records until the next content release. Reader-clock refreshes expire current badges without requiring a rebuild.

Regression coverage in `test-skin-availability.ts` checks complete inventories, shop/reward/draw classification, exact opening and closing boundaries, stale build flags, unsupported forecasts, and operator-qualified identity. Browser QA covers desktop/phone, light/dark themes, search, combined filter reset, URL reload, wishlist, details, focus restoration and artwork.
