# Regional schedules

`lib/time/servers.mjs` remains the sole fixed-offset/reset policy. The imported account is the sole server preference. `data/regional-schedules.json` contains **independent client facts**, not translated Global timestamps.

`scripts/sync/sync-regional-schedules.mjs` runs after the event-window reconciliation in the normal content refresh. It reads EN/JP/KR from the same immutable ArknightsAssets mirror pin as the rest of the refresh. English activity IDs join canonical English event names to regional activities. Banner pool IDs use the client's explicit EN/JP/KR region token; absent IDs/windows are not inferred from a title, a localization gap or a clock offset. Ambiguous activity matches are omitted.

JP official news and KR's official Naver event board can correct maintenance/preloading openings. A correction requires the named regional record, its own calendar day, one unambiguous opening within twelve hours of the client timestamp, and an unchanged regional close. Announced corrections survive a feed outage or a notice leaving the bounded recent feed. Source URLs remain with the facts. A failed regional refresh preserves that region's previous snapshot and reports quarantine; first publication requires JP and KR snapshots.

Permanent RA themes are joined by sandbox topic ID and retain their own regional launch date without a timed event close. Official English notices also correct Global maintenance preloading before the content is published.

Japanese sale paragraphs are parsed separately from login rewards and event-stage windows. Only explicitly named OP outfits enter a shop. Reviewed Korean image-only announcements live in `config/regional-shop-windows.json`, with their own source, inventory and exact interval; this is a supplement, not an inference that every Global shop exists in Korea. Unlisted regional inventories remain unscheduled. In particular, a Fashion Review count alone does not establish all of its individual outfit IDs.

The content release carries route-specific projections through the shared `regional-schedules` table. No browser bundle imports the snapshot. Old releases receive the deployment's seed until the next content refresh publishes the table. Runtime consumers use the selected account and preserve canonical banner names and reward IDs, so changing server does not rename saved goals or erase manual claims.

Server rendering does not know the selected account. Timed rewards remain in page props until every evidenced regional close has passed; the browser then selects its native window. A Global close must not prune a reward still available in JP or KR.

| Surface | Regional facts and behavior |
| --- | --- |
| Navigation/account income | Existing shared server policy: fixed wall clock, 04:00 daily reset, Monday weekly reset, 04:00 first-of-month shop rollover, selected account. |
| Supplies and chip ticker | Client `weeklyAdditionInfo`, reset weekday, and region-specific force-open campaigns. Saturday Sniper/Caster availability follows the client. |
| Home | Regional activity/banner windows, event stores, repeatable event-farming stages and verified outfit windows. |
| Gacha | Regional pool opening/closing instants and provenance; dates retain the canonical banner identity for links. |
| Schedule/list/event detail | Regional activity/banners and source calendar dates. The list updates across closing/focus; unknown regional windows do not inherit Global forecasts. CN records remain available as their own source history. |
| Farming guide | Regional event stages and distinct event-store closes. |
| Stage Terminal/rail | Regional activity windows; account switching does not discard a manual stage selection. |
| Regular Tasks | Client Annihilation rotations and SSS seasons, with exclusive closing instants. The ticker uses the actual selected-client SSS season; its older 28-day Global table is only compatibility data. |
| Pull Planner | Regional banners/events/shops, daily/weekly income and banner-only freebies at the owning server's reset. Manual holdings, dates and targets remain saved. |
| Skin Planner/Skins | Explicit regional shop acquisition windows; missing inventories stay unscheduled. Stage closes never stand in for outfit-sale closes. |
| Reward Tracker | Timed client sign-in windows matched to stable claim IDs and matching item inventories. Unknown Global announcement gifts are not presented as regional claims. Permanent/manual progress remains intact. |

Exact closes are exclusive. Client final seconds are normalized to the exclusive minute boundary; a notice's final printed minute includes that whole minute. Never reinterpret a calendar date as a host-local instant.

Regression coverage includes Japanese/Korean maintenance corrections, ambiguous/unnamed notices, paid-shop versus login deadlines, Saturday/Sunday daily rotation, force-open expiry, regional banner-only free pulls, manual budgets and claim IDs, truncated inputs, and SSS season boundaries. Browser tests cross JP/KR closes while Global stays open and switch the same page between account servers. Use a browser timezone different from every game server and test desktop/mobile.
