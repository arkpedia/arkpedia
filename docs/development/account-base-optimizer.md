# Account Base optimizer (Preview)

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

Each candidate uses the existing greedy room refinement and alternating/staggered
crew search from `baseOptimizer.ts`. The chronological `baseSimulation.ts` scores
morale thresholds, dorm recovery, exhaustion, storage and collections over a repeating
cycle. Non-repeating and exhausted rotations are excluded from recommendations.
This is a heuristic best-found result, not a global optimality claim.

For comparison, LMD is limited by the ratio of daily gold supply to daily sales demand.
Gold supply includes an explicit optional outside-gold allowance, default zero. The
Pepe income that needs no gold is kept separately. Unsold gold is not added again to
LMD income. Balanced scoring values one EXP and one LMD equally; LMD and EXP priorities
are also available. The greedy construction still uses gold's 500-LMD proxy to discover
gold-factory teams; final rotation selection uses funded income.

Login presets are evenly spaced (24, 12, 8 or 6 hours). First-login hour shifts the
displayed timetable. Standard layouts assume their listed upgrades and full dorm
ambience; the imported layout uses its recorded ambience. Drone spending, workshop
crafts and training are excluded. Ramp skills use the existing averaged calculator.
Gold funding is a long-run estimate, not an inventory/order-event simulation.

Saving appends the recommended shift setups and replaces the active timetable; the
button's neighboring text states this. Existing saved setups and the imported account
are preserved. The manual timetable continues using snapshot rates and does not model
gold funding or one-off Fiammetta reseating; the optimizer's totals and notes remain
the authority for its recommendation. Nothing is sent to the game.

## Presentation and resource limits

Daily LMD, EXP and gold sit above a three-column production room board. The selected
shift shows pinned operator portraits, names and imported progress; support and dorm
teams remain in a separate section. Comparison tables and long caveats are disclosures.
Room surfaces share the Base map's facility colour rules (yellow factories, blue
Trading Posts, green Power Plants, and the existing support-room palette). Building
numbers count each built facility type in floor order, independently of physical slot IDs.

Searches run only in a browser Web Worker, on an explicit click. There is one active
search per mounted optimizer, cancelled on input changes or close and forcibly stopped
after ten minutes. Two completed results are retained in browser page memory, keyed by
all computation inputs, so repeat clicks or reopening the modal do not repeat the same
work. No account optimization is submitted to GitHub Actions or a server API.

Routine CI uses small real-operator fixtures. Full-catalogue rotation benchmarks are
lazy and skipped whenever `CI` is set, including if the opt-in flag is accidentally
inherited. Run `npm run test:base-full-roster` locally for those benchmark checks.
Browser regressions verify that recommendation makes no optimizer API/Actions request,
repeated input creates no second Worker, and a stalled Worker is terminated at the limit.

The search still has the limitations described above: cross-room effects are evaluated
for actual placements, but greedy construction does not guarantee discovery of an entire
multi-room synergy group. Dorm support search is limited. Presentation changes do not
expand mechanic coverage or establish a global optimum.

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

`node --import tsx --test scripts/tests/test-account-base-optimizer.ts scripts/tests/test-base-simulation.ts scripts/tests/test-base-rotation-optimizer.ts`

`node node_modules/@playwright/test/cli.js test --config playwright.optimizer.config.ts`

The latter uses localhost:3391 unless `BASE_OPTIMIZER_URL` is set. It covers real
Worker completion, selected-account ownership, saved presets, account preservation,
input invalidation, cancellation and keyboard dismissal at desktop/mobile sizes,
with dark/light screenshots. Browser fixtures are synthetic.
