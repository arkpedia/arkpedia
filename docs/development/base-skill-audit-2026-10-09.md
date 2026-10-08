# Base skill audit — 2026-10-09

## Outcome and evidence boundary

All 429 operators in the current game roster have their complete 921 base-skill steps matched to game buff IDs, upgrade slots, promotion phases, unlock levels and facilities. The two combat-only Amiya forms are excluded from the staffing picker: Amiya is one physical base worker, using her original record's skills. This also prevents assigning three Amiyas from older content releases. Global text comes directly from the English game tables; 19 CN-only operators retain reviewed English translations with CN identity/unlock metadata. This is a complete inventory and activation audit, **not proof that every combination and hidden probability equals the game**.

The numeric model now handles training and workshop effects, actual facility levels, conditional dorm recovery, cross-room resources and the reported R6S/Rose Salt errors. Source data, formula regression tests, actual browser results and estimates are distinguished below.

## Sources

- [Global game tables](https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/en/gamedata/excel): `building_data.json`, character classes/branches, crafting items and formulas.
- [CN game tables](https://github.com/Kengxxiao/ArknightsGameData/tree/master/zh_CN/gamedata/excel): CN-only operators, exact glossary membership and interaction scopes.
- [Reported base combinations spreadsheet](https://docs.google.com/spreadsheets/d/1Tan9MUPzTW2a-3wXmTUodbX1oS7QFMpWv8uIwoKMlHU/edit?gid=430423743): useful reproduction cases; expected numbers are checked against source conditions rather than accepted unconditionally.
- Game-table byte hashes are recorded in `scripts/tests/fixtures/base-skill-source.json`. The 429 expected operator chains are built from raw game records, not from the resolver being tested.
- Added icon art uses `yuanyan3060/ArknightsGameResource` commit `d89e2600c7214e13ab1042a616a9f690f7f5dd95`. All 33 new images were decoded/hashed; publication is additive.

## Inventory and activation

- Added 33 previously absent skills for 15 operators: Angelina the Mellow Wish, Aphrissa, Closure, Crackborne, Gallus², Jacinta, Kal'tsit - Esperanta, Mechanist, Pedro, Rhodes Island Recon, Thumpy, Timeslot, Violet Mizutsune Orchid, Viy, Zinogre S Catapult.
- Reconciled every record against `buffId`, slot, phase and level, retaining the site's icon/handler spellings.
- Updated 372 matched existing descriptions to game text (including formatting corrections), with the Defending/Attacking R6S qualification restored.
- Resolve upgrade chains across all facilities **before** filtering by room. An upgraded skill that moves to another room replaces the previous skill; it no longer leaves both active.
- Rebuild 28 named groups using the game glossary and stable character IDs. R6S subgroups, alternate operators, Rhine Lab, Laterano, Karlan, Pinus Sylvestris, Siracusa, Laios's Party, Bubble Kingdom Hunters and SEES now follow explicit skill membership.
- Nightly catalogue reconciliation updates skills, groups and workshop recipes. Missing CN translations, ambiguous joins, unknown facilities and unmatched old skills fail before writes. Tests cover those guards.

## Calculation corrections

| Area | Changes |
| --- | --- |
| R6S training | Ela/Doc count Tachanka, Frost, Ela and Doc. Iana/Fuze count Ash, Blitz, Iana and Fuze. Count distinct operators anywhere placed in the base, including dorms, trainer and named trainee; cap four. |
| Other training | Apply class, job-branch and mastery restrictions, faction caps, CC bonus, innate trainer 5%, additional Morale costs and explicit Irene/Logos/Zuo Le prepared conditions. Named trainees must be eligible 4–6★ operators and are mutually exclusive with other assignments. |
| Workshop | Use 66 source recipes, correct material/category gates, base byproduct chances, LMD/Morale costs per craft (no hourly workshop depletion), dorm Morale thresholds and Stainless/Catherine conditions. Nine-Colored Deer checks the craft that reaches the guarantee, with separate Causality/Karma counters. |
| Trading post | Rose Salt/Pepe capacity follows TP level; Vigil/Mitm follow RR level; Bellone's base-wide and same-room bonuses are distinct; Archetto uses dorm levels. Correct Taraxacum's key, MH2 group effects, Jacinta's order quality, Closure's special order and level-specific ordinary order times/distributions. |
| Jaye/Snowsant | E0 speed falls as expected queued orders accumulate between collections. E1 Street Economics cancels queue dependence; Snowsant copies other skills first under the game glossary rule. Storage idle time is applied once. Gnosis efficiency/capacity changes reach this calculation before Jaye. |
| Factory | Narantuya uses dorm levels; Minimalist uses summed facility levels and the correct thresholds; Viy uses training-room level; Makoto uses SEES; Mechanist uses the ramp window. Product gates and override-exempt effects are preserved. |
| Office/resources | Recruitment slots are 2/3/4 by Office level, with 0/1/2 extra slots. Whisperain, Mulberry, Bassline, Lin and clue-resource effects use those values. Czerny/Iris use their own dorm's level. Tin Man uses summed dorm levels; Esperanta uses occupied Elite-operator facilities. |
| Power plant/reception | Restore the staffed plant's innate 5% charging and staffed Office's innate 5% HR bonus. Aegis/Makoto and Gallus/other robot checks use actual assignments. Windscoot uses Office extras; Recon checks Violet Orchid in CC; Koromaru is gated by clue exchange. |
| CC/Morale | Apply the strongest matching Babel/Chongyue/Mlynar relief with the glossary's room scope. Ling cancels affected Sui self-reduction. Highest-only factory/HR bonuses remain highest-only. Gladiia reads actual resting/full-Morale hunters. |
| Dorms | Level 5 ambience cap is 5,000, yielding 4.0/h base recovery at max ambience. Highest group recovery is selected **per recipient**, with single-target recovery evaluated separately. Coldshot includes herself among non-full recipients; Bobbing counts actual non-full occupants; Perfumer/Vendela thresholds use current Morale; Senshi/Glasgow recipient bonuses and Fiammetta's exclusive 2/h are respected. |
| Layout | At most five TPs, five factories and three plants. Staffing follows source capacities: CC 1–5, production 1–3, RR two at every built level, Office one, trainer one plus trainee separately, dorm five. Unbuilt rooms have no slots. |

## Presets and image export

The Presets controls save, load, update and delete named snapshots in this browser. A snapshot includes room arrangement/levels, workers/Elite tiers/current dorm Morale, products, ambience, training/crafting inputs and calculation settings. Restoring validates operator names, removes duplicates and clamps invalid capacities/numbers. The app account backup includes saved presets and current training/crafting settings. A reserved status line keeps the map from moving when feedback appears.

Save image exports a self-contained PNG with room positions (B101 etc.), workers, levels, capacity, efficiency, time to full, dorm ambience/Morale/recovery, training and daily summary. It does not depend on remote image downloads or canvas CORS access.

## Validation

- Import rerun: 429 operators, 921 steps, 410 Global + 19 CN, **zero changes and zero problems**.
- Activation checks: 429 operators × 3 promotions × 9 rooms = 11,583 comparisons against raw source chains.
- `audit:base`: zero activation mismatches, dead handler keys, unclassified skills and unmatched source steps. This classifies qualitative effects as explained; it does not establish their probabilities.
- App `npm test`: 1,252 tests, 1,249 passed, 3 skipped, 0 failed; four additional importer guard tests passed separately afterward.
- Base regression suite: 15 tests covering source inventory, R6S, training restrictions, actual levels, resource pools, strongest Morale effects, Jaye/Snowsant, workshop recipes/counters, dorm thresholds/recipient competition, presets and building capacities. Existing optimizer tests pass.
- App and upstream typechecks pass; rendered classes check passes.
- Catalogue integration dry run: current CN tables plus the cached Global combat/calendar snapshot, with current Global base tables. Zero new/missing assets, zero quarantine, zero record additions. This validates the new base reconciliation inside the catalogue path, not unrelated live calendar ingestion.
- Actual browser: shared mastery dropdown updates M2 time to 11.03h at 145%; Greyy E0 gives plant +25% including its innate 5%; Deer Causality 39 plus a 1-Morale craft displays 100% byproduct. Ela + four defenders → 145% / 5.52h for M1; unrelated Ash adds nothing. Iana + self/Ash → 125%, then dorm Blitz/Fuze → 145%; defenders add nothing. Rose Salt TP1/2/3 totals → 7/10/13. Saved trainee/assignment restored after switching and reload. PNG downloaded and visually inspected.
- Responsive preset controls reviewed at 390×844 and 320×740, dark and light themes. No document-width overflow; the existing base map is a horizontally scrollable, scaled view.

## Explicit remaining estimates and unmodeled history

1. Order-quality probability curves and warm-up are not exposed in the source tables. Existing mature Lv3 community measurements remain an estimate; applying that proxy at lower levels is explicitly marked in the TP explanation. Ordinary TP level distributions and fixed order types are modeled separately.
2. Jaye with Degenbrecher/Swire has capacity/efficiency feedback. The source text does not establish the evaluation priority; the current ordering is marked unverified in the explanation. Do not treat its optimizer ranking as game-certified.
3. Pepe plus Closure has conflicting special order types. Pepe's fixed order is currently used, with that priority explicitly marked unverified.
4. Clue-type likelihood changes remain qualitative notes: they are not converted to invented numeric probabilities.
5. This is a snapshot calculator, not a chronological game simulator. Fiammetta's one-off Morale transfer, dorm historical target locks, Logos/Irene uninterrupted training history, Zuo Le's accumulated Martial Arts, NCD counters and Thorns craft history are not inferred automatically. Current Morale and prepared/craft counters are explicit inputs where modeled.
6. Selected Elite tier assumes its level-gated base skills have been unlocked. Drone capacity assumes full excavation (235). The disabled rotation experiment still uses optimistic support-room assumptions; its results are not a validation oracle for the interactive calculator.

These are recorded as unresolved verification scope. A zero-result static audit must not be described as exhaustive numeric validation of all combinations.
