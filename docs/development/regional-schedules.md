# Regional schedules

`lib/time/servers.mjs` remains the sole fixed-offset/reset policy. The imported account is the sole server preference. `data/regional-schedules.json` contains **independent client facts**, not translated Global timestamps.

`importer/scripts/sync/sync-regional-schedules.mjs` runs after the event-window reconciliation in arkpedia-data's nightly import (its `docs/importer.md`). It reads EN/JP/KR from the same immutable ArknightsAssets mirror pin as the rest of the refresh. English activity IDs join canonical English event names to regional activities. Banner pool IDs use the client's explicit EN/JP/KR region token; absent IDs/windows are not inferred from a title, a localization gap or a clock offset. Ambiguous activity matches are omitted.

JP official news and KR's official Naver event board can correct maintenance/preloading openings. A correction requires the named regional record, its own calendar day, one unambiguous opening within twelve hours of the client timestamp, and an unchanged regional close. Announced corrections survive a feed outage or a notice leaving the bounded recent feed. Source URLs remain with the facts. A failed regional refresh preserves that region's previous snapshot and reports quarantine; first publication requires JP and KR snapshots.

Permanent RA themes are joined by sandbox topic ID and retain their own regional launch date without a timed event close. Official English notices also correct Global maintenance preloading before the content is published.

Japanese sale paragraphs are parsed separately from login rewards and event-stage windows. Only explicitly named OP outfits enter a shop. Reviewed Korean image-only announcements live in `importer/config/regional-shop-windows.json`, with their own source, inventory and exact interval; this is a supplement, not an inference that every Global shop exists in Korea. Unlisted regional inventories remain unscheduled. In particular, a Fashion Review count alone does not establish all of its individual outfit IDs.

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

### Calendar subscriptions

The Schedule toolbar’s **Sync calendar / .ics** dialog offers a subscribable URL and a
one-time download. `/api/calendar.ics?server=en&predicted=1&birthdays=0` reads the current
verified content release; it does not require another application deployment when
event dates change. Supported servers are `en`, `jp`, and `kr`. The optional
`download=1` flag adds an attachment disposition; the underlying calendar is identical.
Calendar apps control refresh timing (the feed suggests six hours).

Event titles explicitly begin with `[Confirmed]` or `[Predicted]`. CN-based forecasts
also say `(CN estimate)`. JP/KR windows without local confirmation use `(Global
fallback)` when based on confirmed Global dates; they never become locally confirmed
merely because Global has a date. `predicted=0` excludes these forecasts. Confirmed
instants are UTC; forecasts and dates without exact times use all-day entries with an
exclusive end. Permanent mode launches occupy one day. Withdrawn/expired forecasts
are omitted. Optional birthdays recur yearly without reminders.

UIDs depend on the server and event identity, not dates or confirmation status, so
rescheduling and confirmation update existing subscribed entries. Release timestamps
provide stable revision metadata; HTTP ETags allow conditional refreshes. Failed
content reads return 503 rather than an empty successful feed. Downloads are snapshots
and do not subscribe the user's calendar. The feed is public and contains no account,
planner budget, or personal goal data.

`scripts/tests/test-calendar-feed.ts` covers date/status handling, regional fallbacks,
stable UIDs, escaping and UTF-8 folding. `tests/browser/calendar-subscription.spec.ts`
covers subscription options, download responses, keyboard closure and narrow dialogs.

Regression coverage includes Japanese/Korean maintenance corrections, ambiguous/unnamed notices, paid-shop versus login deadlines, Saturday/Sunday daily rotation, force-open expiry, regional banner-only free pulls, manual budgets and claim IDs, truncated inputs, and SSS season boundaries. Browser tests cross JP/KR closes while Global stays open and switch the same page between account servers. Use a browser timezone different from every game server and test desktop/mobile.
