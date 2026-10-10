# Base combination coverage — 2026-10-09

All 173 populated scenario rows in the supplied workbook run through `calculateBase`, the complete calculator used by `/base`. This is numerical regression coverage of reconstructed snapshots. It does not certify every possible base composition or reproduce live game history.

## Sources and reproduction

- [Supplied workbook](https://docs.google.com/spreadsheets/d/1Tan9MUPzTW2a-3wXmTUodbX1oS7QFMpWv8uIwoKMlHU/edit), exported 2026-10-09; XLSX SHA-256 `abdc01237000924e6ca6a656d9f7db722e034761b659cba3070394cf95d119ea`. Raw cell strings, room headers and row numbers are preserved in `scripts/tests/fixtures/base-combinations-sheet.json`.
- [Linked trading reference](https://docs.google.com/spreadsheets/d/1BwO9wGgirtkInaOzfde7m_iYLNXCZf0tkNxyFcjDmtc/edit), latest tab `202408 Pepe`, exported 2026-10-09; XLSX SHA-256 `5e8d9a5b608f02954ea50fd2bbebdf7bfdd3e294262c4c54e73504ca75036fc8`. Its 54 numeric rows are preserved in `scripts/tests/fixtures/base-trading-reference.json`.
- Operator skill IDs, slots, unlocks and descriptions use the independently imported game-table fixtures described in [the source audit](base-skill-audit-2026-10-09.md). Source descriptions do not expose all probability curves or effect evaluation priorities.
- Run `npm run test:base`, `npm run audit:base-combinations` and `npm run audit:base`. The combination audit regenerates this report and writes raw/reviewed JSON comparisons under ignored `.cache/base-combinations/`. Unexpected differences make it fail.
- The source audit needs raw game-table caches. This run used `ARKPEDIA_GAMEDATA=.cache/base-audit/en ARKPEDIA_CN_BASE_BUILDING=.cache/base-audit/cn-building_data.json npm run audit:base`; all four categories had zero findings. Without raw tables that command reports a skip, which is not a pass.
- Fixtures were extracted read-only from the XLSX shared strings and worksheet cells. Refresh by exporting each source workbook as XLSX, recording its SHA-256 and preserving original cell coordinates. Never derive expected numbers from calculator output.

## Coverage and interpretation

- **FAC: 54 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56).
- **TP: 30 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32).
- **RR: 24 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26).
- **PP: 14 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16).
- **HR: 12 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14).
- **Advanced: 22 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24).
- **252: 16 rows** (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18).
- **342: 1 row** (3).
- The Morale tab contains an empty “To do” row, without a scenario or expected number. Template and References tabs are supporting material. Annex 1’s six Jaye/Gnosis/Degenbrecher/Swire worked examples, Annex 2’s order distributions and Annex 4’s layout were inspected and used in reconstruction. Annex 3 is explanatory text, not another numeric scenario suite.
- Only four physical dormitories exist. The fifth dorm block in the template is excluded. Named spellings/alters are mapped explicitly; “Any” resting workers use distinct real operators outside the relevant counted groups. Missing promotion defaults to E0; explicit level gates are retained.
- The 252 layout follows Annex 4: five level-3 factories, TP levels 3/2, two level-3 plants, four level-1 dorms, Office 1 and Reception 2. These tests reproduce the listed room levels; they do not certify that every worksheet layout satisfies its power budget. The 342 template’s third plant block is excluded to retain nine production rooms.
- Bonus values exclude room baseline efficiency. Power Plant and Office skill columns exclude their staffed innate 5%; Reception values include operator innate/rarity/promotion bonuses above its 100% baseline. TP CAP usually means adjustment, but two cells specify total capacity and are normalized explicitly.
- TP:32 is expanded into four- and five-Gold-line cases (160%/165%). FAC:51 additionally tests the missing two-robot variant (65%). Original cell contents are retained below even when corrected.
- Twenty additional complete-calculator boundary tests cover Ling/Dusk at 12 versus 12.01 Morale, concurrent Worldly Plight consumers, Office levels 1/2/3, Czerny/Iris in different-level dorms, shared non-consuming PI conversion, all four R6 trainers at E0/E1/E2, and exhausted plant/Office workers.
- Property checks cover **19,445 eligible two-worker/product pairings, each in both slot orders (38,890 calculations)**: Gold/EXP/Originium factories (4,278 each), Trading Posts (2,926), Reception (1,540) and Control Center (2,145). These assert finite output and order invariance. They are not independent numerical correctness proofs. Dorm target selection and single-trainer/workshop rooms use targeted regressions instead.
- Fixes found in this audit: empty Trading Posts producing LMD through CC bonuses; Degenbrecher/Jaye/Swire ordering inconsistent with Annex 1; exhausted imported workers retaining working skills; stale products on unbuilt/converted factories counting as Gold lines; Greyy alter truncating 235-drone capacity to 23% instead of 23.5%; mislabeled TP skill breakdown lines; and phone calculation lines collapsing to zero height.

## Row-by-row scenario results

“match” means the provided numeric oracle matches; “source-correction” retains the original value while using reviewed source/current reference evidence; “normalization” fixes representation; “estimate” has a stated model boundary; “expanded” has explicit variant tests. Rows with no numeric oracle verify source-derived clue speed and retain qualitative likelihood notes.

| Scenario | Worksheet cells: original → calculator | Status | Reconstruction notes |
| --- | --- | --- | --- |
| FAC:3 | S3: 0.25 → 25%; T3: 0.0 → 0 | match |  |
| FAC:4 | S4: 0.4 → 40%; T4: 0.0 → 0 | match |  |
| FAC:5 | S5: 0.5 → 50%; T5: 0.0 → 0 | match |  |
| FAC:6 | S6: 0.9 → 90%; T6: 0.0 → 0 | match |  |
| FAC:7 | S7: 0.35 → 35%; T7: 0.0 → 0 | match |  |
| FAC:8 | S8: 0.05 → 5%; T8: 0.0 → 0 | match |  |
| FAC:9 | S9: 1.1 → 110%; T9: 0.0 → 0 | match |  |
| FAC:10 | S10: 0.76 → 76%; T10: 0.0 → 0 | match |  |
| FAC:11 | S11: 0.1 → 10%; T11: 10.0 → 10 | match |  |
| FAC:12 | S12: 0.41 → 41%; T12: 27.0 → 27 | match |  |
| FAC:13 | S13: 0.93 → 93%; T13: 46.0 → 46 | match |  |
| FAC:14 | S14: 0.38 → 38%; T14: 18.0 → 18 | match |  |
| FAC:15 | S15: 0.1 → 10%; T15: 10.0 → 10 | match |  |
| FAC:16 | S16: 0.44 → 44%; T16: 14.0 → 14 | match |  |
| FAC:17 | S17: 0.35 → 35%; T17: 10.0 → 10 | match |  |
| FAC:18 | S18: 0.65 → 65%; T18: 10.0 → 10 | match |  |
| FAC:19 | S19: 0.16 → 16%; T19: 8.0 → 8 | match |  |
| FAC:20 | S20: 52-57% → 56.375%; T20: 16.0 → 16 | match |  |
| FAC:21 | S21: 0.56 → 56%; T21: 18.0 → 18 | match |  |
| FAC:22 | S22: 0.56 → 56%; T22: 18.0 → 18 | match |  |
| FAC:23 | S23: 0.66 → 66%; T23: 33.0 → 33 | match |  |
| FAC:24 | S24: 0.53 → 53%; T24: 14.0 → 14 | match |  |
| FAC:25 | S25: 0.46 → 46%; T25: 18.0 → 18 | match |  |
| FAC:26 | S26: 0.0 → 0%; T26: 0.0 → 0 | match |  |
| FAC:27 | S27: 0.25 → 25%; T27: 0.0 → 0 | match |  |
| FAC:28 | S28: 0.3 → 30%; T28: 0.0 → 0 | match |  |
| FAC:29 | S29: 0.6 → 60%; T29: 0.0 → 0 | match |  |
| FAC:30 | S30: 0.9 → 90%; T30: 0.0 → 0 | match |  |
| FAC:31 | S31: 0.95 → 95%; T31: 0.0 → 0 | match |  |
| FAC:32 | S32: 0.6 → 60%; T32: 0.0 → 0 | match |  |
| FAC:33 | S33: 0.6 → 60%; T33: 0.0 → 0 | match |  |
| FAC:34 | S34: 0.65 → 65%; T34: 0.0 → 0 | match |  |
| FAC:35 | S35: 1.05 → 105%; T35: 0.0 → 0 | match |  |
| FAC:36 | S36: 0.15 → 15%; T36: 0.0 → 0 | match |  |
| FAC:37 | S37: 45-50% → 49.375%; T37: 0.0 → 0 | match |  |
| FAC:38 | S38: 0.45 → 45%; T38: 0.0 → 0 | match |  |
| FAC:39 | S39: 0.6 → 60%; T39: 0.0 → 0 | match |  |
| FAC:40 | S40: 0.6 → 60%; T40: 0.0 → 0 | match |  |
| FAC:41 | S41: 0.85 → 85%; T41: 0.0 → 0 | match |  |
| FAC:42 | S42: 1.15 → 115%; T42: 15.0 → 15 | match |  |
| FAC:43 | S43: 0.2 → 20%; T43: 10.0 → 10 | match |  |
| FAC:44 | S44: 0.45 → 45%; T44: 0.0 → 0 | match |  |
| FAC:45 | S45: 0.0 → 0%; T45: 0.0 → 0 | match |  |
| FAC:46 | S46: 0.0 → 0%; T46: 0.0 → 0 | match |  |
| FAC:47 | S47: 0.35 → 35%; T47: 0.0 → 0; BC47: 0.3 → 30%; BD47: 0.0 → 0 | match |  |
| FAC:48 | S48: 0.0 → 0%; T48: 0.0 → 0 | match |  |
| FAC:49 | S49: 0.4 → 40%; T49: 0.0 → 0; BP49: 0.1 → 10%; BS49: 0.1 → 10% | match |  |
| FAC:50 | S50: 0.35 → 35%; T50: 0.0 → 0; BP50: 0.1 → 10%; BS50: 0.1 → 10% | match |  |
| FAC:51 | S51: 0.65 → 45%; T51: 0.0 → 0 | source-correction, match |  |
| FAC:52 | S52: 1.0 → 100%; T52: 0.0 → 0; AB52: 0.36 → 36%; AC52: 0.0 → 0 | match |  |
| FAC:53 | S53: 0.1 → 0%; T53: 0.0 → 0 | source-correction, match |  |
| FAC:54 | S54: 0.1 → 5%; T54: 0.0 → 0; BC54: 0.3 → 30%; BD54: 0.0 → 0 | source-correction, match |  |
| FAC:55 | S55: 0.6 → 60%; T55: 0.0 → 0; AB55: 0.3 → 30%; AC55: 0.0 → 0; BC55: 0.4 → 40%; BD55: 0.0 → 0 | match |  |
| FAC:56 | S56: 0.9 → 90%; T56: 0.0 → 0; AB56: 0.4 → 40%; AC56: 0.0 → 0 | match |  |
| TP:3 | BC3: 0.3 → 30%; BD3: 0.0 → 0 | match |  |
| TP:4 | BC4: 0.2 → 20%; BD4: 0.0 → 0 | match |  |
| TP:5 | BC5: 0.4 → 40%; BD5: 0.0 → 0 | match |  |
| TP:6 | BC6: 0.75 → 75%; BD6: 0.0 → 0 | match |  |
| TP:7 | BC7: 0.6 → 60%; BD7: 0.0 → 0 | match |  |
| TP:8 | BC8: 1.15 → 115%; BD8: 0.0 → 0 | match |  |
| TP:9 | BC9: 1.35 → 135%; BD9: 0.0 → 0 | match |  |
| TP:10 | BC10: 0.9 → 90%; BD10: 0.0 → 0 | match |  |
| TP:11 | BC11: 0.2 → 20%; BD11: 0.0 → 0 | match |  |
| TP:12 | BC12: 22385 LMD/day → 22385.7868 LMD/day; BD12: 0.0 → 0 | match |  |
| TP:13 | BC13: 22592 LMD/day → 22662.08251 LMD/day; BD13: 0.0 → 0 | source-correction, match |  |
| TP:14 | BC14: 23150 LMD/day → 23150.68493 LMD/day; BD14: 0.0 → 0 | match |  |
| TP:15 | BC15: 24060 LMD/day → 24060.91371 LMD/day; BD15: 0.0 → 0 | match |  |
| TP:16 | BC16: 24444 LMD/day → 24577.60314 LMD/day; BD16: 0.0 → 0 | source-correction, match |  |
| TP:17 | BC17: 25479 LMD/day → 25479.45205 LMD/day; BD17: 0.0 → 0 | match |  |
| TP:18 | BC18: 0.97 → 97%; BD18: 0.0 → 0 | match |  |
| TP:19 | BC19: 22265 LMD/day → 22265.48673 LMD/day; BD19: 0.0 → 0 | match |  |
| TP:20 | BC20: 27079 LMD/day → 27079.64602 LMD/day; BD20: 0.0 → 0 | match |  |
| TP:21 | BC21: 24884 LMD/day → 24884.95575 LMD/day; BD21: 0.0 → 0 | match |  |
| TP:22 | BC22: 30265 LMD/day → 30265.48673 LMD/day; BD22: 0.0 → 0 | match |  |
| TP:23 | BC23: 27868 LMD/day → 27868.0203 LMD/day; BD23: 0.0 → 0 | match |  |
| TP:24 | BC24: 29543 LMD/day → 29543.14721 LMD/day; BD24: 0.0 → 0 | match |  |
| TP:25 | BC25: 0.8 → 80%; BD25: 0.0 → 0 | match |  |
| TP:26 | BC26: 1.29 → 129%; BD26: 8.0 → 8 | match |  |
| TP:27 | BC27: 1.25 → 125%; BD27: 30.0 → 20 | match, normalization |  |
| TP:28 | BC28: 0.65 → 65%; BD28: -2.0 → -2 | match |  |
| TP:29 | BC29: 1.25 → 125%; BD29: 10.0 → 10 | match |  |
| TP:30 | BC30: 1.21 → 121%; BD30: 14.0 → 4 | match, normalization |  |
| TP:31 | BC31: 1.04 → 104%; BD31: 16.0 → 16 | match |  |
| TP:32 | BC32: 160% (4 GPL) 165% (5 GPL) → 60%; BD32: 0.0 → 0 | expanded, match |  |
| RR:3 | CB3: 0.25 → 25% | match |  |
| RR:4 | CB4: 0.26 → 26% | match |  |
| RR:5 | CB5: 0.51 → 51% | match |  |
| RR:6 | CB6: 46-56% → 54.75% | match |  |
| RR:7 | CB7: 51-61% → 59.75% | match |  |
| RR:8 | CB8: 0.75 → 75% | match |  |
| RR:9 | CB9: 0.86 → 91% | source-correction |  |
| RR:10 | CB10: 0.96 → 96% | match | Vigil starts at zero Morale. |
| RR:11 | CB11: 0.2 → 20% | match |  |
| RR:12 | CB12: 0.3 → 30% | match |  |
| RR:13 | CB13: 0.86 → 86% | match |  |
| RR:14 | CB14: 0.25 → 25% | match |  |
| RR:15 | CB15: 0.25 → 25% | match |  |
| RR:16 | CB16: 0.46 → 46% | match |  |
| RR:17 | CB17: 0.56 → 56% | match |  |
| RR:18 | CB18: 0.17 → 17% | match |  |
| RR:19 | CB19: 0.55 → 55% | match |  |
| RR:20 | CB20: 0.25 → 25% | match |  |
| RR:21 | CB21: 0.09 → 9% | match |  |
| RR:22 | CB22: 0.55 → 55% | match |  |
| RR:23 | CB23: 0.25 → 25% | match |  |
| RR:24 | No numeric oracle; clue-speed + likelihood-note regression | qualitative |  |
| RR:25 | No numeric oracle; clue-speed + likelihood-note regression | qualitative |  |
| RR:26 | No numeric oracle; clue-speed + likelihood-note regression | qualitative |  |
| PP:3 | BP3: 0.2 → 20% | match |  |
| PP:4 | BP4: 23(.5)% → 23.5% | normalization |  |
| PP:5 | BP5: 0.2 → 20% | match |  |
| PP:6 | BP6: 15-20% → 19.375% | match |  |
| PP:7 | BP7: 15-20% → 19.375%; BS7: 0.15 → 15% | match |  |
| PP:8 | S8: 0.15 → 15%; T8: 0.0 → 0 | match |  |
| PP:9 | S9: 0.2 → 20%; T9: 0.0 → 0; BP9: 0.1 → 10% | match |  |
| PP:10 | BP10: 0.1 → 10% | match |  |
| PP:11 | BP11: 0.15 → 15% | match |  |
| PP:12 | S12: 0.0 → 0%; T12: 0.0 → 0; BP12: 0.1 → 10% | match |  |
| PP:13 | BP13: 0.1 → 10% | match |  |
| PP:14 | BP14: 0.15 → 15% | match |  |
| PP:15 | S15: 0.0 → 0%; T15: 0.0 → 0; BP15: 0.1 → 10% | match |  |
| PP:16 | S16: 0.6 → 60%; T16: 0.0 → 0; BP16: 0.13 → 13% | match |  |
| HR:3 | CD3: 0.5 → 50% | match |  |
| HR:4 | CD4: 0.3 → 30% | match |  |
| HR:5 | CD5: 0.45 → 45% | match |  |
| HR:6 | CD6: 0.2 → 20% | match |  |
| HR:7 | CD7: 0.45 → 45% | match |  |
| HR:8 | CD8: 0.25 → 25% | match |  |
| HR:9 | CD9: 0.45 → 45% | match |  |
| HR:10 | CD10: 0.4 → 40% | match |  |
| HR:11 | CD11: 0.2 → 20% | match |  |
| HR:12 | CA12: 0.35 → 35%; CD12: 0.3 → 30% | match |  |
| HR:13 | CD13: 0.4 → 40% | match |  |
| HR:14 | CA14: 0.3 → 35%; CD14: 0.35 → 35% | source-correction, match |  |
| Advanced:3 | S3: 0.8 → 80%; T3: 0.0 → 0; BC3: 0.42 → 42%; BD3: 0.0 → 0; CD3: 0.4 → 40% | match | Fifth template dorm excluded: the game has four dorms. |
| Advanced:4 | S4: 0.2 → 20%; T4: 0.0 → 0 | match | Fifth template dorm excluded: the game has four dorms. |
| Advanced:5 | S5: 0.4 → 60%; T5: 0.0 → 0; BC5: 0.22 → 32%; BD5: 0.0 → 0; CD5: 0.2 → 20% | source-correction, match | Fifth template dorm excluded: the game has four dorms. |
| Advanced:6 | S6: 1.45 → 160%; T6: 15.0 → 15; BP6: 0.235 → 23.5%; BS6: 0.0 → 0% | estimate, match | Lancet-2 starts at zero Morale. |
| Advanced:7 | S7: 0.45 → 45%; T7: 0.0 → 0 | match |  |
| Advanced:8 | S8: 0.6 → 60%; T8: 0.0 → 0; BP8: 0.235 → 23.5% | match |  |
| Advanced:9 | S9: 0.75 → 75%; T9: 0.0 → 0; BP9: 0.1 → 10% | match |  |
| Advanced:10 | S10: 1.3 → 145%; T10: 15.0 → 15; BP10: 0.235 → 23.5%; BS10: 0.0 → 10% | source-correction, match |  |
| Advanced:11 | S11: 1.31 → 131%; T11: 0.0 → 0; BP11: 0.1 → 10% | match |  |
| Advanced:12 | S12: 0.25 → 25%; T12: 0.0 → 0 | match |  |
| Advanced:13 | S13: 0.27 → 27%; T13: 0.0 → 0; BP13: 0.1 → 10%; BS13: 0.1 → 10% | match |  |
| Advanced:14 | S14: 0.25 → 25%; T14: 0.0 → 0; BP14: 0.1 → 10% | match |  |
| Advanced:15 | S15: 1.1 → 110%; T15: 0.0 → 0; BP15: 0.22 → 22%; BS15: 0.15 → 15% | match |  |
| Advanced:16 | S16: 0.19 → 19%; T16: 8.0 → 8 | match |  |
| Advanced:17 | BC17: 0.41 → 41%; BD17: 2.0 → 2 | match |  |
| Advanced:18 | S18: 0.17 → 17% | match |  |
| Advanced:19 | BC19: 0.11 → 11%; BD19: 2.0 → 2 | match |  |
| Advanced:20 | S20: 0.35 → 35%; BC20: 0.35 → 35%; BD20: 1.0 → 1; CA20: 0.55 → 55% | match |  |
| Advanced:21 | S21: 0.29 → 29%; T21: 0.0 → 0; AB21: 0.25 → 25%; AC21: 0.0 → 0; BC21: 0.52 → 52%; BD21: 0.0 → 0; CA21: 0.3 → 30%; CD21: 0.55 → 55% | match | Fifth template dorm excluded: the game has four dorms. |
| Advanced:22 | BC22: 0.4 → 40%; BD22: 2.0 → 2; CA22: 66-76% → 74.75% | match |  |
| Advanced:23 | S23: 0.0 → 0%; T23: 0.0 → 0; BC23: 0.37 → 37%; BD23: 0.0 → 0; BP23: 0.2 → 20%; BS23: 0.1 → 10% | match |  |
| Advanced:24 | BC24: 1.15 → 115%; BD24: 0.0 → 0; CA24: 0.54 → 54%; CD24: 0.4 → 40% | match | Fifth template dorm excluded: the game has four dorms. |
| 252:3 | S3: 0.04 → 4%; T3: 0.0 → 0; CH3: 0.2 → 20% | match |  |
| 252:4 | BL4: 0.0 → 0%; BM4: 0.0 → 0; CH4: 0.2 → 20% | match |  |
| 252:5 | S5: 0.6 → 60%; T5: 0.0 → 0 | match |  |
| 252:6 | BL6: ~25% (12h) <15% (24h) → 23.50597%; BM6: 0.0 → 0 | estimate, match |  |
| 252:7 | BS7: ~17% (12h) <12% (24h) → 17.2909%; BT7: 0.0 → 0 | estimate, match |  |
| 252:8 | S8: 0.05 → 4%; T8: 10.0 → 10 | source-correction, match |  |
| 252:9 | S9: 0.25 → 25%; T9: 0.0 → 0 | match |  |
| 252:10 | BL10: 0.75 → 75%; BM10: 2.0 → 2 | match |  |
| 252:11 | BL11: 0.35 → 35%; BM11: 0.0 → 0; BS11: 0.3 → 40%; BT11: 0.0 → 0 | match, source-correction |  |
| 252:12 | BL12: 0.25 → 25%; BM12: 0.0 → 0 | match |  |
| 252:13 | BW13: 0.12 → 12% | match |  |
| 252:14 | CH14: 0.13 → 13% | match |  |
| 252:15 | CH15: 0.2 → 20% | match |  |
| 252:16 | CE16: 0.5 → 50%; CH16: 0.35 → 35% | match |  |
| 252:17 | CE17: 0.5 → 50%; CH17: 0.35 → 35% | match |  |
| 252:18 | CE18: 0.5 → 50%; CH18: 0.35 → 35% | match |  |
| 342:3 | S3: 0.99 → 99%; T3: 0.0 → 0 | match |  |

## Reviewed differences and underspecified cells

| Cell | Treatment | Reason |
| --- | --- | --- |
| FAC:S51 | source-correction; numeric oracle 0.45 | No robots are assigned in this row. Warmy contributes 30%, Alanna contributes the 15% pairing bonus. Two robots are needed for the listed 65%; that variant is tested separately. |
| FAC:S53 | source-correction; numeric oracle 0 | Franka and Liskarm have no Factory skills; E0 Jessica the Liberated does not give the E2 Factory support bonus. |
| FAC:S54 | source-correction; numeric oracle 0.05 | Group Hunting alpha gives 5% per original Abyssal Hunter in factories. Specter the Unchained is not in the source Abyssal Hunter glossary; only Specter receives 5%. |
| TP:BC13 | source-correction; numeric oracle 22662.08251 | Annex 2 and the linked 202408 Pepe table row 44 use 13/22/65 double-alpha weights; they yield 22662 rather than the older 22592 here. |
| TP:BC16 | source-correction; numeric oracle 24577.60314 | Annex 2 and the linked 202408 Pepe table row 41 use 13/22/65 double-alpha weights; they yield 24577 rather than the older 24444 here. |
| TP:BD27 | normalization; numeric oracle 20 | This cell contains the TOTAL order limit, 30, whereas other CAP cells contain the adjustment. Base 10 + adjustment 20 = 30. |
| TP:BD30 | normalization; numeric oracle 4 | Annex 1 contains TOTAL limit 14; the displayed adjustment is 4 above base 10. |
| RR:CB9 | source-correction; numeric oracle 0.91 | Kazemaru skill 15% + Vigil skill 25% + Kazemaru innate/rarity/promotion 25% + Vigil 26% = 91%. Neither operator is exhausted in row 9. |
| HR:CA14 | source-correction; numeric oracle 0.35 | Level-3 Office has two additional recruitment slots. Nosy contributes 10% to Reception: 12F skill 20% + innate 5% + 10% = 35%. |
| Advanced:S5 | source-correction; numeric oracle 0.6 | Rosmontis and Ebenholz each generate 20 Perception Information. Both contributions remain available; Whisperain adds 20, for 60 total. |
| Advanced:BC5 | source-correction; numeric oracle 0.32 | The same 60 Perception Information converts to Soundless Resonance, plus 5 from Virtuosa: floor(65/2) = 32%. |
| Advanced:S6 | estimate; numeric oracle 1.6 | Current Snegurochka text gives 10% per Factory occupant (30%, not 15%). The dead-Lancet virtual-plant interpretation from the sheet gives Weedy 90% + Purestream 40% + Snegurochka 30% = 160%. Fatigued robot presence/evaluation remains community evidence. |
| Advanced:S10 | source-correction; numeric oracle 1.45 | Current Workflow Optimization is 10% per Factory occupant: 30%, rather than the 15% assumed here. Weedy 75% + Purestream 40% + Snegurochka 30% = 145%. |
| Advanced:BS10 | source-correction; numeric oracle 0.1 | Lancet-2 is awake here and her E0 Power Plant skill gives 10%; the zero applies to the exhausted version in row 6. |
| 252:S8 | source-correction; numeric oracle 0.04 | Annex 4 shows four level-1 dormitories, totaling four levels. The fifth dorm column is a template error: Narantuya gives 4%, not 5%. |
| 252:BS11 | source-correction; numeric oracle 0.4 | Famiglia Business beta checks Vigil anywhere in the base, giving 40% even when he is in another Trading Post. Outstanding Debt capacity remains same-room only. |
| PP:BP4 | normalization; numeric oracle 0.235 | The worksheet writes 23(.5)%; the fully excavated 235-drone capacity contributes 235/10 × 1% = 23.5%, plus the plant innate bonus separately. |
| TP:BC32 | expanded | The 4- and 5-Gold-production-line variants are separate tests, with expected bonuses 160% and 165%. The raw row leaves Factory products blank. |
| 252:BL6 | estimate | The sheet gives heuristic 12h/24h bonuses. Tests verify the queue-dependent decline, level dependence and capacity idle handling. Expected productive-hour averaging differs from a fixed subtraction heuristic; not certified against live order history. |
| 252:BS7 | estimate | As for row 6, with a level-2 Trading Post. Both 12h and 24h windows are tested; the sheet heuristic is retained as unverified rather than forced into the model. |

## Linked trading-reference coverage

All 54 numeric rows in the latest `202408 Pepe` tab pass through the full calculator. Real Proviso, Tequila, Closure and Pepe records supply special-order mechanics. Synthetic calibration workers supply the reference’s stated total efficiency and Tailoring distributions. Many rows do not describe an attainable named team; this validates the order arithmetic at those inputs, not the feasibility of every worker label. The older `202303 Prov Teq` and explicitly outdated `202209` revisions are historical and are not presented as current oracles.

| Reference row | TP level | Total efficiency | Tailoring | Tequila / Proviso | Expected LMD/day |
| --- | --- | --- | --- | --- | --- |
| 3 | 3 | 2 | (none) | (none) / (none) | 20530.97345 |
| 4 | 2 | 2 | (none) | (none) / (none) | 20281.69014 |
| 5 | 1 | 2 | (none) | (none) / (none) | 20000 |
| 7 | 3 | 2.4 | (none) | (none) / E2 | 38230.0885 |
| 8 | 3 | 2.3 | (none) | (none) / E2 | 36637.16814 |
| 9 | 3 | 2.2 | (none) | (none) / E2 | 35044.24779 |
| 10 | 3 | 2.1 | (none) | (none) / E2 | 33451.32743 |
| 11 | 3 | 2 | (none) | (none) / E2 | 31858.40708 |
| 12 | 3 | 1.9 | (none) | (none) / E2 | 30265.48673 |
| 13 | 3 | 1.8 | (none) | (none) / E2 | 28672.56637 |
| 14 | 3 | 1.7 | (none) | (none) / E2 | 27079.64602 |
| 15 | 3 | 2.4 | (none) | (none) / E0 | 31433.62832 |
| 16 | 3 | 2.3 | (none) | (none) / E0 | 30123.89381 |
| 17 | 3 | 2.2 | (none) | (none) / E0 | 28814.15929 |
| 18 | 3 | 2.1 | (none) | (none) / E0 | 27504.42478 |
| 19 | 3 | 2 | (none) | (none) / E0 | 26194.69027 |
| 20 | 3 | 1.9 | (none) | (none) / E0 | 24884.95575 |
| 21 | 3 | 1.8 | (none) | (none) / E0 | 23575.22124 |
| 22 | 3 | 1.7 | (none) | (none) / E0 | 22265.48673 |
| 23 | 2 | 1.99 | (none) | (none) / E2 | 36997.1831 |
| 24 | 2 | 1.89 | (none) | (none) / E2 | 35138.02817 |
| 25 | 2 | 1.79 | (none) | (none) / E2 | 33278.87324 |
| 26 | 2 | 1.69 | (none) | (none) / E2 | 31419.71831 |
| 27 | 2 | 1.59 | (none) | (none) / E2 | 29560.56338 |
| 28 | 2 | 1.49 | (none) | (none) / E2 | 27701.40845 |
| 29 | 2 | 1.39 | (none) | (none) / E2 | 25842.25352 |
| 30 | 2 | 1.99 | (none) | (none) / E0 | 28588.73239 |
| 31 | 2 | 1.89 | (none) | (none) / E0 | 27152.11268 |
| 32 | 2 | 1.79 | (none) | (none) / E0 | 25715.49296 |
| 33 | 2 | 1.69 | (none) | (none) / E0 | 24278.87324 |
| 34 | 2 | 1.59 | (none) | (none) / E0 | 22842.25352 |
| 35 | 2 | 1.49 | (none) | (none) / E0 | 21405.6338 |
| 36 | 2 | 1.39 | (none) | (none) / E0 | 19969.01408 |
| 39 | 3 | 1 | (none) | (none) / (none) | 10265.48673 |
| 40 | 3 | 2 | alpha+beta | E2 / (none) | 25479.45205 |
| 41 | 3 | 2 | alpha+alpha | E2 / (none) | 24577.60314 |
| 42 | 3 | 2 | alpha | E2 / (none) | 24060.91371 |
| 43 | 3 | 2 | alpha+beta | E0 / (none) | 23150.68493 |
| 44 | 3 | 2 | alpha+alpha | E0 / (none) | 22662.08251 |
| 45 | 3 | 2 | alpha | E0 / (none) | 22385.7868 |
| 46 | 3 | 2 | alpha | E2 / E2 | 29543.14721 |
| 47 | 3 | 2 | alpha | E2 / E0 | 26802.03046 |
| 48 | 3 | 2 | alpha | E0 / E2 | 27868.0203 |
| 49 | 3 | 2 | alpha | E0 / E0 | 25126.90355 |
| 50 | 3 | 1.5 | (none) | E2 / E2 | 24955.75221 |
| 51 | 3 | 1.5 | (none) | E2 / E0 | 20707.9646 |
| 52 | 3 | 1.5 | (none) | E0 / E2 | 24424.77876 |
| 53 | 3 | 1.5 | (none) | E0 / E0 | 20176.99115 |
| 54 | 3 | 2 | (none) | (none) / (none) | 24000 |
| 55 | 3 | 2.05 | (none) | (none) / (none) | 24600 |
| 56 | 3 | 2.15 | (none) | (none) / (none) | 25800 |
| 57 | 3 | 1.8 | (none) | (none) / (none) | 21600 |
| 58 | 3 | 1.2 | (none) | (none) / (none) | 14400 |
| 62 | 3 | 1 | (none) | (none) / (none) | 5333.33333 |

## Remaining evidence boundaries

1. Mature Tailoring probabilities/warm-up are community measurements. Source tables do not encode their curves; lower-level proxy distributions remain estimates. Clue-type likelihood remains qualitative.
2. Jaye/Degenbrecher/Swire now matches all six Annex 1 examples, including 121% with total limit 14 under Gnosis. This is community reference evidence; game skill text alone does not establish the evaluation priority. E0 Jaye’s 12h/24h queue model differs from the worksheet’s heuristic fixed adjustments and is not certified against a recorded live queue.
3. Exhausted Lancet still supplies physical presence for Eunectes while not blocking Greyy alter’s working-robot condition. Advanced:6 has a numeric regression for that community interpretation, not an in-game execution trace. Pepe versus Closure’s competing fixed order priority likewise remains unverified.
4. Fiammetta’s one-off transfer, historical dorm target locks, uninterrupted Irene/Logos preparation, accumulated Zuo Le training and craft history require explicit current/prepared counters. Snapshot calculations and the rotation timetable do not simulate every historical skill event or auto-execute a rotation in game.
5. The linked general combo guide is background material, not an additional fully enumerated oracle. The property checks do not cover every three-worker team, full-base Cartesian composition or cross-room resource history. No claim is made that every imaginable combination is game-certified.

## Validation record

- Focused base suite: 283 passed, zero failed/skipped. Source inventory tests also check 429 operators, 921 steps and 11,583 promotion/room activation comparisons against independently extracted game-table chains.
- Desktop/mobile browser: 22 checks passed for imported staffing/rotation persistence, responsive stability, live worksheet Worldly Plight/Witchcraft output, Degenbrecher/Jaye breakdown and empty-TP output. These exercise the actual production page, not a separate test calculator.
- Typecheck, changed-file lint and production build/postbuild trace/client-chunk guards pass. Existing unrelated build lint warnings remain.
- Full unit suite: 1,531 tests, 1,527 passed, three skipped, one failed. The failing homepage previous-release compatibility assertion (`test-previous-release-props.ts`, `/`) concerns missing `ongoingBanners` fields `global_date_estimated`, `global_window` and `globalPoolId`. The exact failure reproduces in a clean archive of baseline commit `888c4cec`, with none of this audit’s changes; it is not hidden or marked passed.
- This is local and draft-PR validation. No production promotion or recorded live-game numerical trace is claimed.
