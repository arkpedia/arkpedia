# Base optimizer: design

The goal: take the operators from an account import and propose the most productive base staffing, plus a rotation saying which shift goes in at which login, for a chosen login interval (6, 12, 18 or 24 hours).

It ships in three pull requests to `dev`:

1. data and a chronological simulator with tests (this document and `lib/base/baseSimulation.ts`);
2. the optimizer;
3. the planner page.

## What already exists, and what this adds

Most of the data model and every skill's arithmetic already exist and are audited. The optimizer builds on them; it does not duplicate them.

| Need | Where it lives | Evidence |
| --- | --- | --- |
| Base skills per operator, with their promotion and level unlocks | Operator records (`baseSkills`), `data/base-skill-slots.json`, `lib/base/activeBaseSkills.ts` | [Base skill audit](base-skill-audit-2026-10-09.md): 429 operators and 921 skill steps matched to `building_data` buff IDs |
| Named groups (Rhine Lab, Abyssal Hunters, R6S, …) | `data/base-group-rosters.json`, `lib/base/baseGroupRosters.ts` | Built from the game glossary |
| Cross-room rates at one instant | `lib/base/calculateBase.ts` | 173 worksheet scenarios, 54 trading references, 19,445 pair checks ([coverage](base-combination-coverage-2026-10-09.md)) |
| The imported account: rooms, levels, staffing, Morale, every owned operator's promotion and level | `lib/account/baseSnapshot.ts` (`operatorProgress`), `lib/planner/roster.ts` | [Base account view](base-account-ui.md) |
| A manual rotation timetable | `lib/base/baseRotationPlan.ts`, `lib/base/calculateRotation.ts` | Two cycles of captured rates |

What is missing is time. `calculateBase` is a snapshot: it says how fast each room produces and how fast each operator drains or recovers at one instant. The rotation timetable multiplies those snapshot rates by shift length, so it cannot see an operator reaching 0 halfway through a shift, a dorm effect switching off when its target is full, storage filling before the next login, or one-off effects like Fiammetta's swap.

The older dev-only `/optimizer` and `/bases/whole-base-optimizer` pages (`lib/base/optimizerLogic.ts`, `wholeBaseOptimizer.ts`) rank fixed candidate lists with fixed cross-room contexts (`worldlyPlight: 20` and so on) for an account that owns every operator. Stage 2 supersedes them and does not extend them. They can be removed once the new page ships.

## Data model

Everything comes from the datamined `building_data` table the nightly release already ingests. The wiki is not used. The constants the simulator and its tests depend on:

| Constant (`building_data`) | Value | Meaning |
| --- | --- | --- |
| `manpowerDisplayFactor` | 360000 | Raw `ap` per displayed Morale point; 24 is full |
| `manufactManpowerCostByNum`, `tradingManpowerCostByNum` | 0, 0, −5, −10 | Morale/h per worker is 1.00, 0.95, 0.90 with 1, 2, 3 workers |
| `controlData.basicCostBuff` | −5 | Control Center relief |
| `manufactData.phases[].outputCapacity` | 24 / 36 / 54 | Factory storage by level |
| `tradingData.phases[].orderLimit` | 6 / 8 / 10 | Trading Post order storage by level |
| `dormData.phases[].manpowerRecover` | 160 … 200 | Dorm base recovery ×100, by level |
| `comfortManpowerRecoverFactor`, `comfortLimit` | 25, 5000 | Ambience adds ambience/25/100 Morale/h, up to 5000 |

Skill effects are not re-read here. They are read the way `/base` reads them, through `activeBaseSkills` and the handler files below.

## Interaction classes

Each class the optimizer must respect, and the existing code that models it:

| Class | Handler |
| --- | --- |
| Factory productivity, capacity, product gates, ramp skills | `factorySpecialSkills.ts`, generic text in `baseProductivity.ts` |
| Trading Post order efficiency, order limit, order quality (Shamare, Proviso, Tequila, Pepe, Closure, Jaye) | `tradingPostSpecialSkills.ts`, `jaye.ts`, `baseProductivity.ts` |
| Control Center buffs, base-wide Morale relief (Babel, Chongyue, Młynar), highest-only rules | `controlCenterSpecialSkills.ts`, `crossFacilityMorale.ts` |
| Global resources and tokens: Perception Information, Memory Fragments, Thoughts, Worldly Plight, Witchcraft-style counts, Felvine, Monster Meals | `baseResources.ts` (`computeResourcePools`, `consumerBonuses`) |
| Power plant drone speed, robot and Laterano counts | `powerPlantSpecialSkills.ts` |
| Reception (clue speed), Office (recruit speed), Workshop (byproduct chance, Morale per craft), Training | `receptionRoomSpecialSkills.ts`, `officeSpecialSkills.ts`, `workshopSkills.ts`, `trainingRoomSkills.ts` |
| Dorm recovery: base by level and ambience, group, single-target, self, conditional (below 18/20, non-full counts) | `dormitorySpecialSkills.ts`, `dormitoryRecovery.ts` |
| One-off Morale effects (Fiammetta's Communal Suffering) | **New:** `baseSimulation.ts` |
| Morale drain, exhaustion and recovery over time; shift changes at logins; storage between collections | **New:** `baseSimulation.ts` |

A search of every `building_data` buff for "swap", "Full Morale", "previous Operator" and "when assigned" finds one non-rate Morale effect: `dorm_exchangeAp` (Fiammetta). Every other dorm buff is a per-hour rate, and Kal'tsit's base skills are Control Center rates. Every other Morale trick is therefore a choice of who rests where and when: single-target recovery, recovery of non-full occupants, and placing exhausted operators with Fiammetta. The optimizer searches those choices, and the simulator scores them.

## The simulator (stage 1)

`simulateBase({ base, shifts, loginInterval, initialMorale })` steps from event to event:

- **Logins** come every `loginInterval` hours. Each login empties every room's storage. A shift's first login applies its complete staffing. A shift may last several logins (`logins: 2` holds a 12-hour shift under 6-hour logins).
- **Morale thresholds.** The calculator's rates read current Morale only through 0 (exhausted), 12 (Ling, Dusk), 18 and 20 (`dorm_rec_all&tired`) and 24 (full). Between two crossings every rate is constant, so the simulator calls `calculateBase` once per segment and integrates exactly. Rates are cached by which side of each threshold every operator is on.

  A sweep of every `building_data` buff mentioning Morale near a number also finds conditions that do not move these rates:
  - Totter's −5% per 4 points of Morale difference, and his bonus beyond 12: averaged over the login window from full, like ramp skills;
  - the workshop's count of dorm operators at 4, 12 or 20 Morale or less: crafts are not simulated;
  - the 16-Morale clue guarantees: reception events, not output.
- **Storage** fills at 1/`fullTime` per hour. A full room stops producing until the next login. Morale keeps draining while it waits.
- **Exhaustion.** It is reported when a worker spends time at 0. Reaching 0 exactly at a login and then resting loses nothing, so it is not reported. An operator at 0 stays placed, stops draining, and stops working: their skills and their 1% base productivity are gone, and a room with nobody working produces nothing. Stage 1 corrects the 1% in `calculateBase`; it previously counted exhausted workers.
- **Fiammetta.** When she is placed in a dorm, or re-seated there (`reseat`), at full Morale, she swaps Morale with the operator in the slot before hers. She then recovers exactly 2/h through Self-Discipline.
- **Steady state.** The shift list repeats until Morale at the start of a cycle equals Morale at its end, or until 30 days have passed. The reported numbers are that repeating cycle, normalized to a day: per-room EXP, Precious Metals made, gold sold and LMD; idle hours with full storage; hours with an exhausted worker; Morale traces; and Morale at every login.

Steady-state detection finds cycles that repeat every shift list (period 1). Coupled dorm effects could in principle need a longer period; that run ends at 30 days with a warning, and the optimizer must treat a non-repeating result as a penalty, never as a score to compare.

Measured cost: one `calculateBase` call takes about 0.4 ms on the development machine. The two-shift, 12-hour rotation in the tests settles in two cycles and 13 calls, thanks to the cache.

### Tests (`scripts/tests/test-base-simulation.ts`)

Every expected value comes from the `building_data` constants above, not from the code under test:

- three skill-less workers drain 0.9/h, reach 0 at 26.67 h, and their factory's output stops then;
- a lone Elite 2 FEater fills 54 storage (ten Battle Records) and the room idles until the login;
- a level 5 dorm at 5000 ambience recovers 4.0/h, reaching full in 6 h;
- Fiammetta's swap, her 2/h recovery, no repeat while she stays seated, a repeat on re-seat, and no swap with nobody seated before her;
- a two-shift 12-hour rotation repeats, never exhausts, and equals the calculator's full-day output;
- an exhausted worker drops the 1% base, and an all-exhausted room produces nothing.

The skill arithmetic itself stays covered by the existing `test:base` suites (309 tests), which pass unchanged.

### Uncertain mechanics, surfaced as caveats

The simulator returns these as `caveats` for the page to show, rather than hiding them:

1. **Fiammetta's target.** The text says "the previous Operator assigned to that Dormitory". The simulator treats the slot before hers as that operator. Whether placing someone new later while she is full triggers another swap is not settled.
2. **Ramp skills** ("+20% the first hour, then +1% per hour") and **Totter's** Morale-difference skills use the calculator's average over one login interval, starting fresh, not the hours or Morale since that operator was placed.
3. **Not part of the output:** workshop crafts, training, clues, recruitment and drone use. Their rates are still computed for the rooms that depend on them, such as Office-fed resources.
4. **Exhausted base productivity.** That an exhausted worker also loses their 1% base share follows from the game stopping their work. The game tables do not state it as a number, so an in-game check is still owed. It is separable: "a room with nobody working produces nothing" stands on its own, and the 1% part is a one-line revert in `calculateBase` that does not touch the simulator.
5. **Morale drain at full storage.** The simulator assumes operators keep draining while storage is full. This matches common play and is not stated in the tables.

## The optimizer (stage 2)

`optimizeBase({ base, roster, loginInterval, factoryProducts, weights, allowExhaustion })` in `lib/base/baseOptimizer.ts`.

**Input:**

- the imported roster: owned operators with promotion and level, from `operatorProgress` or the planner roster. Unowned operators are never proposed. Skills come from `activeBaseSkills` at that promotion and level, so an Elite 1 never brings an Elite 2 skill;
- the layout as facilities: a preset (2-4-3, 2-5-2, 1-5-3) or the imported account's own rooms and levels;
- the login interval;
- the product of each factory (Battle Records or Precious Metals), chosen by the reader.

**Objective:** weighted output per day of the simulator's steady-state cycle: LMD + EXP × w(EXP) + Precious Metals made × w(gold). Defaults are 1, 1 and 500; one Precious Metal counts as the 500 LMD it sells for. A rotation that exhausts a worker is rejected unless `allowExhaustion` is set. A rotation that never repeats is never preferred.

**Search.** It is a heuristic. The scoring that decides between rotations is the simulator.

1. *Candidates:* for each working room type (Control Center, Trading Post, Factory, Power Plant, Reception Room, Office), every owned operator with an active skill there.
2. *Shift A, greedy:* repeatedly add the (room, operator) pair with the largest gain in the snapshot calculator's login-interval totals. Those totals count storage filling before the next login, so 24-hour plans favour capacity. Cross-room effects count, because every step evaluates the whole base. Steps are lazy: the best 40 previous estimates are re-scored, with a full pass every six steps and before stopping. The team stops growing at the dorms' total capacity, because it must rest there.
3. *Room refinement:* greedy adds one operator at a time, so a pair worth more together than either alone can be missed. Each room is re-picked exhaustively from its own staff plus the eight best unused candidates, everything else fixed. On a one-room base this equals brute force (tested).
4. *Team B* is built the same way from the operators team A did not use.
5. *Rotation shape and length.* Two shapes are simulated, at every step length (a multiple of the login interval) a crew can work without passing 24 hours:
   - **Alternating teams:** A works while B rests whole in the dorms, then they swap. Each team must fit the dorms, 20 places on four level 5 dorms, so steps 2–4 build the teams to that size.
   - **Staggered crews** (logins every 12 h or less): the rooms are split into two halves of even head count, which change crew on alternate steps. A crew works two steps, rests one in the dorms (4/h refills two steps' drain), and waits one unassigned, which holds its Morale. Only half the base rests at once, so the crews are built to every place the base has.

   The best score wins. Within 0.1%, fewer staffing changes win.
6. *Support rooms:* greedy sees no output from a Power Plant (drones are not scored) and little from Control Center Morale relief. While the dorms still have room for everyone who rests at a step, the empty Control Center, Power Plant, Office and Reception places are filled with unused operators who have a skill there. This is kept if the simulator does not lose by it, and tried again after the exhaustion repair frees places. When alternating teams are the shape and the dorms are the limit (20 resting places against a 29-place 2-4-3 base), the result says which support rooms stay empty and why.
7. *Exhaustion repair:* each operator who still reaches 0 is tried out of the rotation, and kept out if the score improves.
8. *Fiammetta:* if owned and unused, she is tried in the first dorm after the first operator coming off shift, re-seated at every staffing change. This is kept only if the simulation gains.
9. *Explanation:* for each crew and room, the room's output per day, each operator's marginal value (the snapshot output lost without them) and their active skills there.

Measured on the development machine, whole account, 2-4-3:

| Login | Shape | Places per crew | Weighted per day | Time |
| --- | --- | --- | --- | --- |
| 6 h | staggered, 12 h steps | 25 / 24 | 126,740 | 9 s |
| 12 h | staggered, 12 h steps | 25 / 24 | 127,015 | 9 s |
| 18 h | alternating, 18 h | 20 / 20 | 122,050 | 3 s |
| 24 h | alternating, 24 h | 20 / 20 | 106,137 | 3 s |

Stage 3 runs the search in a Web Worker. The 6 h result comes out slightly below 12 h because the greedy pass, which scores with the login interval, builds slightly different teams. The search is a heuristic, not a guarantee.

**Tests** (`scripts/tests/test-base-rotation-optimizer.ts`):

- On a one-room base the result equals brute force over every team of one, two or three.
- Only owned operators are placed, with exactly the skills their promotion and level unlock.
- A whole-account rotation at 12 h and 24 h logins:
  - repeats;
  - never exhausts a worker;
  - changes staff only at logins;
  - never puts one operator in both crews;
  - never rests more operators than the dorms hold.
- At 12 h the staggered shape wins and staffs more than 20 places; at 24 h the teams alternate.
- Each explanation's marginal value equals the snapshot difference.
- 24 h logins never beat 12 h.

**Limits:**

- Two shapes are searched: alternating teams and staggered halves. Operators who could work through several steps without rest (slow drain, Control Center relief), and three-crew schedules, are not.
- Power plants score only through cross-room effects, because drones are not part of the output. They are filled only when the dorms have room to spare.
- Dorm recovery skills are not chosen on purpose; resting operators fill dorms in team order.
- Selling gold needs gold made. The page should show both figures, since the calculator does not limit Trading Posts by the gold supply.
- Greedy and refinement do not guarantee a global optimum on a whole base. Adding an operator to the roster can, rarely, lower the score.

## The page (stage 3, planned)

- A new page, `/base-optimizer`, in the **Planner** menu, next to the operator and pull planners, because it reads the account import. `/base` stays in Guides as the manual calculator. The owner may prefer one page with a tab instead.
- Controls: login interval (6 / 12 / 18 / 24 h), layout (2-4-3, 2-5-2, 1-5-3, or "my base" when the import has rooms), and product mix.
- Output:
  - recommended shifts per room with operator icons (`getOperatorIconPath`);
  - the login schedule ("08:00 shift A in, 20:00 shift B in");
  - expected output per day;
  - a Morale chart per operator from `moraleTrace`;
  - the "why" text, and the caveats.
- "Open in /base" loads a shift as an editable plan through the existing preset format (`SavedBasePreset`).
- The search runs in a Web Worker, so the page stays responsive.
- Follows the arkpedia-ui conventions: `shared.css` tokens, `npm run audit:styles`, the layout census, and `bundledWhenUnpublished` if the page is static.
