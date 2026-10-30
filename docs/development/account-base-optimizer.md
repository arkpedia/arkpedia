# Account Base optimizer (Preview)

Release boundary: Preview only. Keep this feature out of production and do not
merge its feature pull request to main without a new explicit user instruction.

Open **Base → Optimize base**. The optimizer runs in a browser Worker; imported
rosters stay in the browser. It can be opened before choosing a manual layout.

The search uses the selected account's `base.operatorProgress`, then that account's
`operatorBuilds`. Unknown progress is E0/Lv1 and disclosed. The planner roster is
deliberately excluded because it can contain hypothetical promotions or another server.
Amiya forms are one physical worker.

## Search and scoring

`accountOptimizer.ts` compares the imported layout and power-valid 243, 252 max-left,
252 max-right layouts. Only 243 and 252 are searched, to keep the search small; an imported 153 or 342 is searched alone on request but is not compared. It excludes presets requiring a downgrade of
Reception, Office or Training. Identical layouts are searched once. Every distinct
gold/EXP split by factory level is considered, including all-gold and all-EXP.

The search has two stages within the reader's search time (`searchSeconds`, 1/2/5/10
minutes on the page, default 1):

1. **Seed.** `baseOptimizer.ts` builds a plan per layout: greedy crews, a menu of
   rotation shapes (alternate, duty, staggered, formations, thirds) and its repair
   passes. Product splits closest to one gold factory per Trading Post go first; this
   stage stops after about a third of the time, every layout having had one split.
2. **Anneal.** The best one or two layouts are improved by simulated annealing
   (`annealBase.ts`) over a plan genome (`planGenome.ts`): two or three crews,
   2 to 4 staffing changes, which crew staffs each room at each change,
   Fiammetta's refill core, parked Morale (Dusk below 12), factory products and two
   dorm rules. Moves: a room's whole team from its best teams (`teamBlocks.ts`, which
   keeps synergies such as Shamare/Bibeak/Tequila or a Sui Control Center together),
   swaps, retiming, core changes and the settings. Staffing moves are screened with the
   snapshot calculator and only the best are simulated; a worse plan is kept with
   probability exp(delta / T) as T cools, and the best plan seen is always kept, so the
   result never scores below its seed.

Beside this search the page runs a second one in another Worker, when Fiammetta is owned
and the device has four or more cores: `optimizeAccountBase({ formations: true })` builds one
first plan per layout, then the leading layout's plan again with formations (Fiammetta's
refill core with crews taking turns, as the reference sheets run; 20 to 40 s on a large
roster), and anneals it for the rest of the time. Formations help some rosters and only cost
time on others, so they never take the main search's time; the page keeps each layout's
better plan (`accountResults.ts`) and gives the formations search up to 10 s past the
chosen time. `scripts/bench/account-budget.ts` runs the page's whole search
(`FORMATIONS=0|1`).

The chronological `baseSimulation.ts` scores every plan: morale thresholds, dorm
recovery, exhaustion, storage, collections and drones over a repeating cycle (which may
repeat only every few cycles when a refill rotation lines up slowly). Non-repeating and
exhausted rotations are excluded. This is a best-found result, not a global optimality
claim. `scripts/bench/anneal-tiers.ts` compares the stages on rosters from 15 operators
at E0 to a maxed account. `scripts/bench/account-budget.ts` runs the page's whole search
against the reference sheets' rotations on their own operators (8 h logins, drones on),
scored the page's way: funded LMD (gold counts only as far as it is sold) plus EXP.

The 2026-10-30 continuation compared the account search against the preceding
implementation using the same live game-data revision
`b6ddc46e9ba00142fafaa4499040521c24bb2e66` (Node 26, 60-second budget).
These are individual runs; time-budgeted searches can finish at different rounds.

| Roster | Previous funded LMD+EXP/day | Current | Search / first plan |
|---|---:|---:|---:|
| 15 operators, E0 | 49,481 | 49,534 | 4.5 s / 0.1 s |
| 40 operators, E1 | 57,352 | 60,000 | 60.0 s / 0.4 s |
| 424 operators, few E2 | 86,602 | 88,144 | 60.0 s / 3.2 s |
| 424 operators, maxed | 99,445 | 100,254 | 61.3 s / 4.5 s |

| Sheet variant (layout) | Reference funded LMD+EXP/day | Current search, 60 seconds |
|---|---:|---:|
| 2-5-2 max-right | 89,401; 110 exhaustion events | 95,304 (106.6%) |
| 3-4-2, imported layout | 87,069; feasible four-worker refill core | 84,522 (97.1%) |

All six optimizer results repeat without exhaustion or duplicate placements.
The 342 target remains unmet: its strong gold pairs leave a level 3 factory for
EXP, and reaching that arrangement requires several factory/support changes
together. Do not substitute weighted gold scores or a saved intermediate warm start
for this end-to-end account-search comparison. The 252 comparison fixes max-right;
choosing a max-left layout against that sheet would not be like-for-like.

`account-acceptance.ts` checks ownership, capacity, repeating cycles, exhaustion,
duplicate placements, funded scoring and wall time. `BASELINE_JSON` enforces
nonregression against a saved run on the same data; `REQUIRE_REFERENCE_MATCH=1`
fails while a selected reference is ahead. It never feeds the reference placements
to the optimizer.

For comparison, LMD is limited by the ratio of daily gold supply to daily sales demand.
Gold supply includes an explicit optional outside-gold allowance, default zero. The
Pepe income that needs no gold is kept separately. Unsold gold is not added again to
LMD income. Balanced scoring values one EXP and one LMD equally; LMD and EXP priorities
are also available. The greedy construction still uses gold's 500-LMD proxy to discover
gold-factory teams; final rotation selection uses funded income.

Login presets are evenly spaced (24, 12, 8 or 6 hours). First-login hour shifts the
displayed timetable. Standard layouts assume their listed upgrades and full dorm
ambience; the imported layout uses its recorded ambience. Workshop crafts and training
are excluded. Ramp skills climb from the hours an operator has already worked without
a break in the same room, not a fresh-start average. Gold funding is a long-run
estimate, not an inventory/order-event simulation.

Power Plant drones are counted by default (`drones`, on unless explicitly disabled):
10 an hour times (1 + the staffed Plants' drone-rate bonuses), spent at each login
where one is worth most -- 3 minutes of a Trading Post's or Factory's own BASE
production (its rate with every skill taken out; base skills do not apply to a drone,
matching how the game treats them). Under funded scoring a gold deficit is covered by
Precious-Metal Factories first, and Trading Posts take drones only as far as the gold
on hand can actually be sold; at most one item or order in progress per room per
login. The drone stock cap (235) and storage limits on what a drone's output fills are
not modeled.

Saving appends the recommended shift setups and replaces the active timetable; the
button's neighboring text states this. Existing saved setups and the imported account
are preserved. The saved rotation carries what the optimizer simulated -- each shift's
Fiammetta refill and reseat lists, the drone weights and parked Morale -- so the Base
page's rotation estimate recalculates to the optimizer's yields (a unit test checks
this). Nothing is sent to the game.

## Presentation and resource limits

Daily LMD, EXP and gold sit above a three-column production room board. The selected
shift shows pinned operator portraits, names and imported progress; support and dorm
teams remain in a separate section. Comparison tables and long caveats are disclosures.
Room surfaces share the Base map's facility colour rules (yellow factories, blue
Trading Posts, green Power Plants, and the existing support-room palette). Building
numbers count each built facility type in floor order, independently of physical slot IDs.

Searches run only in a browser Web Worker, on an explicit click. There is one active
search per mounted optimizer, cancelled on input changes or close. The Worker posts the
best result so far whenever it improves; the progress line shows it, and **Stop** keeps
it. A Worker that never answers is stopped at the search time plus three minutes. Two
completed results are retained in browser page memory, keyed by all computation inputs
(including the search time, which is remembered for the page visit), so repeat clicks
or reopening the modal do not repeat the same work. No account optimization is
submitted to GitHub Actions or a server API.

Routine CI uses small real-operator fixtures. Full-catalogue rotation benchmarks are
lazy and skipped whenever `CI` is set, including if the opt-in flag is accidentally
inherited. Run `npm run test:base-full-roster` locally for those benchmark checks.
Browser regressions verify that recommendation makes no optimizer API/Actions request,
repeated input creates no second Worker, and a stalled Worker is terminated at the limit.

The search still has limits: cross-room effects are evaluated for actual placements,
and team blocks keep one room's synergies whole, but a synergy that spans several rooms
is only found when the annealer reaches it. A genome expresses two or three crews over 2
to 4 staffing changes (alternation, duty, thirds, the staggered shape and three distinct
formations); longer rotations stay seed-only.

### Empty-room correction

Ordinary owned workers remain candidates even without an active skill in that room.
To bound search cost, each step adds three available ordinary workers to the full
skilled pool, preferring workers with fewer competing skilled jobs. The shortlist is
refreshed as workers are assigned, so later picks and crew B can use the remainder.
Small rosters reserve half their operators for the return crew.

Room grouping includes product and existing staffing, as well as kind and level.
Only identical room states share an evaluation; an empty factory is considered even
when another same-level factory has a spare slot. Candidate estimates belong to each
room. These changes prevent filling the first factory/crew while overlooking useful
ordinary work in other rooms or the return shift.

The 28-operator screenshot reproduction, with the same 243 layout and one gold/three
EXP factories at 12-hour logins, changed from 9650 LMD/6120 EXP to 14350 LMD/27960 EXP
per day under the same model. Both crews now staff every factory and all 28 workers
are assigned across the two crews. Full slots in both crews would need more operators;
the UI shows working, resting and unassigned counts. Drone use remains outside scoring.

## Reference review (2026-10-27)

- [User's production sheet](https://docs.google.com/spreadsheets/d/1at6UTVRJXpiDlo7JucaQZdVQCSOZhAgN5jo4ZDFEWhk/edit?gid=2051144322#gid=2051144322),
  reviewed through its CSV export: cross-room support, Proviso low-level trading,
  Shamare/Bibeak/Tequila, mixed-level factories, gold deficits, flex production and
  explicit external-gold/drone assumptions. Its displayed totals are a scenario,
  not constants copied into the solver.
- [可露希尔基建终端](https://riic.autos/) and its
  [public UI repository](https://github.com/Closure-RIIC/RIIC-Web): imported Box,
  facility configuration, three-shift presentation, per-room output, comparison and
  MAA export. The repository says its production solver is private. Useful UI
  reference; no code copied.
- [Hnsr0327/arknights-base-simulation](https://github.com/Hnsr0327/arknights-base-simulation):
  README describes real login times, synergy seeds, cross-room swaps, drone allocation,
  permanent Fiammetta-supported staff and unsold-gold valuation. These motivate future
  exact-time scheduling, stronger synergy search and gold/drone simulation. Its claims
  have not been independently benchmarked; no source copied.
- [ArkBuilding](https://github.com/closure-studio/ArkBuilding): combination enumeration
  plus integer programming is a possible stronger search approach; its README limits
  the current model to one shift.

The Preview release uses the native Preview workflow only. This work does not request
promotion to main or www.

## Focused verification

`node --import tsx --test scripts/tests/test-account-base-optimizer.ts scripts/tests/test-base-simulation.ts scripts/tests/test-base-rotation-optimizer.ts scripts/tests/test-anneal-base.ts`

`npx tsx scripts/bench/anneal-tiers.ts sheet,mid,small,tiny 120` (seed vs anneal per roster tier)

`node node_modules/@playwright/test/cli.js test --config playwright.optimizer.config.ts`

The latter uses localhost:3391 unless `BASE_OPTIMIZER_URL` is set. Run the browser
specs against a staging production build (`ARKPEDIA_DEPLOYMENT_ROLE=staging npm run
build`, then `next start`): the optimizer is Preview-only, and `next dev` reloads pages
served as 127.0.0.1, which closes the dialog mid-test. It covers real
Worker completion, selected-account ownership, saved presets, account preservation,
input invalidation, cancellation and keyboard dismissal at desktop/mobile sizes,
with dark/light screenshots. Browser fixtures are synthetic.
