# Pull Planner

`/pulls` estimates funds for one date and supports a saved sequence of banner budgets. The page uses Arkpedia's existing theme tokens and normal page width. `/schedule` links to a selected banner through `?banner=<name>` in both the event list and calendar detail panel.

## Page flow

The resource card uses in-game icons and keeps recurring-income toggles visible. Income details, past clears, and the skin wishlist open in place; their state stays mounted while another section is open. The pull calculation and banner plan remain visible below, and phones collapse the same content into a single bounded column. Numeric fields select their contents on focus/click.

Income keeps a themed banner selector, calendar, and first/last-day buttons together. Banner options include featured operator names, and the selected banner shows its art. Manually changing the date clears the banner selection and disables the day buttons. The rerun checklist remains independent of the forecast date. Per-banner income actions switch to Income; desktop has no duplicate forecast popup.

Past Events opens one category at a time. Tick completed chapters, events, resource stages and Annihilation maps, then enable their remaining rewards. Individual first clears are projected from the existing reward pools by `node scripts/build-pull-first-clears.mjs`; generation fails if those lists do not reconcile with the old totals. Old all-cleared resource/Annihilation flags keep their meaning and expand into individual IDs only when that category is edited.

Daily, weekly and Annihilation income can be toggled independently. Optional yellow-certificate exchanges use only owned certificates, full 258-certificate sets for 38 pulls, and at most one set per Global server calendar month. Enabling assumes this month’s set is unclaimed; it does not invent future certificates. Optional version-1 fields `incomeSettings` and `yellowCerts` preserve older imports and saves.

Skins retains the sourced shop rotations, search, pagination, cross-shop wishlist, extra OP reserve, missing-price warnings and cumulative shop-deadline affordability checks. Pulls retains per-banner budgets, operator copy goals, sparking, returning operators and probability estimates.

The skin selector offers only explicit event shop rotations from `data/skin-shop-rotations.json`. Each entry records a source, source region, event opening, separate shop windows and exact new/returning outfit IDs. Neither a Fashion Review flag, catalogue release date nor original-run roster establishes OP shop availability. There is no unrestricted catalogue purchase tab. The September 9 review covers 19 rotations across 12 upcoming events; events without a sourced inventory are omitted. Add new rotations from announcements as the schedule advances; an unlisted outfit is not proof it will never return.

CN inventories are projected onto the scheduled Global opening while preserving each shop's start/end offsets. They are always marked estimated, including when the event date is confirmed. Shop windows may begin before or end after the event; expired shops are removed individually. Where the source gives no separate shop dates, the event window is explicitly an estimate (`event-estimate`). Global rotations can replace projections after their own inventory and dates are verified. General Fashion Review random-outfit draws are not selectable OP purchases.

Artwork and OP prices come from `getAllSkins` and `parsePrices`; free/certificate/redemption outfits are excluded. Unknown paid IDs in active rotations fail generation rather than silently hiding missing metadata. Cards sort by original release date, newest first, using Global dates where known and CN dates as a fallback. Reruns and Fashion Review do not reset a skin’s release date; unknown dates go last, with operator/outfit names breaking ties. Results render in batches of 12.

Your skins shows selected artwork, names, individual prices, total OP cost, and current OP shortfall. Each selected outfit is counted once against its earliest known upcoming shop closing date. Closing-date projections accumulate earlier purchases, the extra reserve, and the cost of unscheduled selections; unknown shop dates and missing prices stay visible. Projections follow enabled income and event-reward assumptions. Full skin costs remain protected before calculating banner pull budgets, so users must also check their banner shortfalls.

Existing manual reserves remain under the optional **Extra OP reserve** disclosure; old version-1 saves still load. Saved IDs resolve against current catalogue prices, never imported prices. Changing collections or searching does not discard selected skins.

Validation covers explicit shop membership, exclusion of inferred Fashion Review/rerun stock, projected date offsets, separate expiry boundaries and cumulative skin costs without duplicate purchases. Browser checks cover desktop and mobile selection, persistence, shared artwork loading, schedule deep links, and horizontal overflow.

The forecast headline shows available pulls before planned spending, with the skin reserve already excluded. After your plan deducts budgets due through the forecast date, charging other banners only for savings spent and the selected banner for its own used free pulls too. Unspent free pulls shown for that selected banner remain banner-only. Calculation details retain the comparison after earlier spending and first/last-day totals. Negative balances and deadline shortfalls stay visible.

## Wishing Wall scenarios

Income offers Minimum, Average (default), and I AM LUCKY. The selection saves with the plan; older files default to Minimum. It applies to all Wishing Walls in the forecast, including chronological banner budgets and the net-forecast popup. Existing event-end reward timing is unchanged.

- Minimum preserves the existing guaranteed 200 Orundum/day (2,800 over 14 days).
- Average assumes independent, equally likely strips worth 200/300/400/500/600/800. Keep the highest of two; a result below 400 unlocks three draws the following day. The exact expected maximum is 577.777… for two draws and 637.962… for three. Starting with no bonus, update its probability as `(1-p)/9 + p/27`, summing each day's weighted expectation. Fourteen days yield 8,170.256969… Orundum, rounded once per event to 8,170. This is an estimate under that distribution assumption, not verified drop odds.
- I AM LUCKY assumes 800 every day (11,200 over 14 days), explicitly labeled as the best case.

Only Wishing Wall Orundum changes. Stage OP, permits, free pulls and reward timing retain their existing rules. Tests independently enumerate two days of draws, verify the 14-day scenarios, per-event bonus resets, save migration and unchanged unrelated rewards.

## Planning rules

- Holdings, content selections, monthly-card settings, manual reward dates, OP reserve, selected skin IDs, and up to 40 banner goals save locally under `arkpedia.pull-plan.v1`. Export/import uses a versioned JSON file. Invalid imports leave the current plan untouched; an unreadable saved file is not silently overwritten.
- Budgets are total pulls, including the selected banner's free pulls. Goals run in spending-date order. Their paid portion is subtracted from cumulative savings before calculating later goals. Shortfalls carry forward rather than being clamped away.
- Free pulls stay with their banner. Past daily freebies are excluded; an active banner's one-time ticket has an “already used” checkbox. These follow the existing dataset's date-based free-pull window.
- OP reservations apply across held and future OP. The summary shows only spendable holdings, excluding selected unclaimed rewards. The forecast separates holdings, recurring income, rewards still to collect, and banner-only free pulls.
- Manually estimated event rewards require a collection date and cannot fund an earlier goal. Existing source rules continue to determine when scheduled event rewards arrive and avoid counting back-catalogue rewards twice.
- Banner dates are resolved from current headhunting data during page generation/ISR, so an older reward snapshot cannot restore a corrected banner date. The schedule's predicted-event status is retained in labels. Missing or rescheduled goals require review; expired goals are not deducted again from updated holdings.

The existing monthly-card model assumes purchases covering the selected window, including their OP. Forecasts assume completion of the selected missions/content. Per-banner operator acquisition probabilities are calculated separately from the income forecast. Updating actual holdings after pulling remains the player's responsibility.

## Checks

- `npm run audit:pulls` — existing reward and income calculations.
- `npm run test:pull-plan` — budgets, free-pull isolation, shortfalls, persistence validation, schedule corrections, skin pricing, and legacy-save compatibility.
- `npm run typecheck`, `npm run lint -- --max-warnings 15`, strict rendered-class check, and production build.
- Browser coverage: desktop/mobile layout, shared artwork, multi-banner selection, persistent picker behavior, direct schedule links, and horizontal overflow.

## Operator goals and chances

Each banner goal optionally persists `targets` (operator name and 1–6 **new** copies),
`includeSpark`, and an Orienteering `rateUpRoster`. Older version-1 saves remain valid.
Import validation never accepts probabilities, exchange prices, or guarantee rules;
those always come from the server-built catalogue. Unknown banner mechanics have no
odds until reviewed, and unavailable imported targets produce a removable error.

The UI shows **at least** 1–6 copies, not an exact-copy distribution. The combined
headline means every selected copy goal can be fulfilled. With sparking enabled,
individual rows each prioritize that operator; the combined result checks the sum
of all missing copies' exchange costs against **one** contract balance. It does not
multiply marginal probabilities or duplicate contracts. Exchanges are chosen after
all budgeted pulls. The once-only limited 300-pull gift is included independently
of the spark toggle, grants no additional contract, and does not reset pity.

Calculations use deterministic Monte Carlo in a debounced, cancellable Web Worker.
The sample count adapts to the pull budget (2,000–50,000 runs); the UI states the
sampling margin. The seed is stable for a banner/roster. Requests are terminated
when inputs change or a card unmounts; old results never appear under new inputs.
Only analytically established guarantees display `100%`. The model starts each
banner at zero pity, with its initial ten-pull guarantee unused; carried Standard
pity and already-spent pulls are **not** modeled. No stop-on-success savings are
assumed. The budget remains fully spent in the forecast.

### Sources checked September 9, 2026

- [Sealed With Time / 承诺](https://ak.hypergryph.com/news/2825): featured shares,
  weighted returning roster, per-operator exchange costs, separate 300-pull gift,
  soft pity, and contract rules. The 200-cost reduction is an explicit roster,
  not a blanket age-based rule.
- [Trails End Winds Rest / 车辙与风的归所](https://ak.hypergryph.com/news/6247.html):
  its own returning roster and exchange list. Gavial and Ch'en cost 200 here.
- [Single-featured safety net](https://ak.hypergryph.com/news/2023033352): after
  150 consecutive featured misses, the next six-star is featured, once per banner.
- [Hunters of the Umbral Wilds](https://ak.hypergryph.com/news/7377.html) and
  [Sharpened by Flame rerun](https://ak.hypergryph.com/news/9699): recurring
  120-pull six-star guarantees and a next-five-star guarantee if the featured
  five-star was absent from the first 50 draws. These are the 2026 Monster Hunter
  rules, not the older crossover simulator's generic one-time guarantee.
- [Orienteering #7](https://ak.hypergryph.com/news/3046): choose three six-stars
  and three five-stars; chosen six-stars share 100%, chosen five-stars share 60%.
  Other Standard five-stars remain in the remaining 40%, aggregated in this model.
- Extracted CN `gacha_table.json` pool metadata: `guarantee5Avail=1`,
  `guarantee5Count=10`; `limitParam` identifies the 300-pull gift operator;
  `LINKAGE_LOOP6_NEW5` and `loopTarget6Count=120` confirm the crossover variant.

Base rarity rates are 2% / 8% / 50% / 40%. After 50 consecutive six-star misses,
6-star probability rises by two percentage points per pull (4% on pull 51,
100% on pull 99), resetting on any six-star. The non-six-star proportional
redistribution and the first-ten forced-five-or-higher treatment follow Arkpedia's
existing rarity model; official notices do not separately tabulate the adjusted
five-star curve. This modeling assumption is disclosed in the UI.

The two limited exchange rosters are verified by pool ID. Returning-operator draw
odds additionally depend on a **projected Global ordinary six-star roster**, built
with Arkpedia's shared headhunting eligibility, release, and Kernel transition
rules. Corrected schedule debut dates override stale operator snapshots. No
10-month wait is imposed on ordinary operators. The ordinary roster is inspectable
in the UI; future Global roster changes can alter returning-operator percentages.
Upcoming Global probabilities use published CN rules, clearly labeled in the UI.
Do not generalize these exchange lists to future pool IDs without checking their
announcements.

Validation: `npm run test:pull-plan` includes independent exact recurrence versus
Monte Carlo, rarity and guarantee boundaries, shared exchanges, per-banner rosters,
Orienteering eligibility, and persistence validation. Browser QA covers desktop and
phone layouts, multi-banner selection, deep links, shared artwork, and page overflow.

## Contextual help

Operator-goal rules and skin-shop assumptions use focused help dialogs. Essential
labels, figures, warnings, and estimate qualifiers remain visible in the main flow.
Dialogs close with Escape, their close button, or a backdrop click and restore focus
to the invoking control.

## September 2026 outfit catalogue reconciliation

The operator galleries and artwork were ahead of `data/skins.json`. The shared catalogue now includes 42 missing outfits: 34 OP purchases and eight rewards/other acquisition methods. People, A People has its two new outfits, Critical Phase Transition has eight, and the Persona collaboration has four. The Legend Seeker uses the recorded 27 OP price; there is no fixed maximum-price assumption.

Per-outfit gallery and module attribution is recorded in `data/skin-catalogue-refresh-sources.json`. Names, artists, original descriptions and event links follow those sources; OP prices are taken from each operator gallery's obtain field. Existing Arkpedia names are retained where the wiki adds punctuation or still displays a Chinese title. The imported artwork uses the usual rarity folders. Eight reviewed illustrations and matching portrait icons were migrated from the planner catalogue into the public asset repositories; the skin repository also publishes preserved originals plus 320/768/1280 WebP and AVIF variants. The app references their commit-pinned raw GitHub paths. Rarity folders for the newly covered operators were checked against `Kengxxiao/ArknightsGameData` CN `character_table` and `skin_table`.

A verified local artwork path lets a new outfit render even if its operator profile has not been imported yet. The production prebuild now runs `scripts/audits/check-skin-catalogue.mjs` and fails if an operator's recorded outfit is missing from the shared catalogue. This checks known operator outfits; it does not replace checking new event announcements for outfits not yet in either dataset. Regression coverage verifies all refreshed entries, prices, artwork, free-outfit exclusion and the three event collections above.

## Shared event and banner timing

The planner resolves banner dates from the same headhunting records used by the
schedule. Exact `global_window` timestamps and their `timingSource` confirm a
window; future date-only projections remain labeled estimated. Once client data
or an official announcement supplies an exact window, the shared sync updates
that record and every consumer follows it. Missing or invalid windows are omitted
instead of restoring stale planner snapshots. Event rewards remain independent
of banner dates, while skin-shop projections preserve their own sourced offsets.

Tests run the real client-calendar sync, verify official-source precedence, and
check that banner cards, event rewards, skin shops, and schedule deep links all
use the current shared data.

### September 10 shop and input review

People, A People's later returning shop includes all 22 explicitly listed outfits in section 9 of https://ak.hypergryph.com/news/1461. The four first-batch outfits retain their separate window. Unenumerated Fashion Review stock is not inferred. Returning batches have distinct display names while IDs stay stable. Shop options show full sale windows, CN-based estimate labels, and a source link. Both planner dropdowns use a themed, keyboard-accessible popup. All numeric resource and budget inputs select their contents on focus and click.

## Workspace implementation checks — September 11, 2026

49 planner/probability tests, typecheck and production build pass. New coverage checks legacy and new save round trips, independently disabled income sources, certificate funding/monthly caps, and individual first-clear reconciliation with legacy flags. The style audit reports the same pre-existing findings as the branch baseline; this change adds none. Browser checks cover desktop and phone layouts, shared image delivery, schedule deep links, a picker that stays open for multiple additions, and horizontal overflow.
