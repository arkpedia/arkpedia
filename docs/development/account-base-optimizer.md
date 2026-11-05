# Account Base optimizer (Preview)

The site's base expert's notes on how a base is run and how operators are chosen are the
spec for the rotation and tie-break work: [base-design-notes.md](base-design-notes.md).

Release boundary: Preview only. Keep this feature out of production and do not
merge its feature pull request to main without a new explicit user instruction.

Open **Base → Optimize base**. The optimizer runs in a browser Worker; imported
rosters stay in the browser. It can be opened before choosing a manual layout.

The search uses the selected account's `base.operatorProgress`, then that account's
`operatorBuilds`. Unknown progress is E0/Lv1 and disclosed. The planner roster is
deliberately excluded because it can contain hypothetical promotions or another server.
Amiya forms are one physical worker.

## Search and scoring

`accountOptimizer.ts` recommends power-valid 252 max-left and 252 max-right layouts,
including an imported 252. The maintainer prefers 252 over 243 for production; automatic
search spends its budget on 252 variants. Turn off **Recommend 2-5-2** to optimize any
valid imported layout on its own, including 243, 153 or 342. It excludes presets requiring a downgrade of
Reception, Office or Training. Equivalent production rooms are compared by kind and level, regardless of position.
Support-room levels and effective dorm recovery must also match. The imported layout
wins an equivalent comparison, preserving its room IDs, arrangement and recorded ambience.
It is searched once; a reordered preset does not consume a second search budget.
Separate time-bounded heuristic searches can still produce different staffing plans. Every distinct
gold/EXP split by factory level is considered, including all-gold and all-EXP.

A same-machine 30-second comparison on 2026-10-31 kept 252 as the winner in all
four roster tiers before and after narrowing recommendations. Funded LMD+EXP/day
was 49,067 → 49,067 (tiny), 58,700 → 58,727 (small), 85,787 → 85,736 (mid), and
100,809 → 100,809 (maxed). These single time-budgeted runs are effectively flat,
not evidence of a general yield increase. All results were repeating, owned-only,
within room capacities and without exhaustion or duplicate placements.

The search has two stages within the reader's search time (`searchSeconds`, 1/2/5/10
minutes on the page, default 1):

1. **Seed.** `baseOptimizer.ts` builds a plan per layout: greedy crews, a menu of
   rotation shapes (alternate, duty, formations, thirds; the four-change staggered
   shape only if `MAX_ROTATION_SETUPS` ever allows four) and its repair passes. Product splits closest to one gold factory per Trading Post go first; this
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

The page runs one search per spare core on a desktop-class device, at most four, and one
on a phone or tablet (`searchStarts` in `lib/base/searchStarts.ts`, which the browser spec
reads too): each start (`start` in `AccountOptimizerInput`) seeds the
same way and anneals from its own random seed (a start from a worse product split was
tried and lost its minute to it), the formations
search takes one of those workers where it runs, and `accountResults.ts` keeps each
layout's best plan across all of them. Stopping keeps the best of every worker so far.
`account-budget.ts` takes `START=n` for one start; several processes side by side, keeping
the best, measure what the extra cores buy.

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
to 4 staffing changes (alternation, duty, thirds, a four-step duty and three distinct
formations), within the preset bound below.

### Testing accounts from Krooster

Testers keep their collections on krooster.com. On Preview, the Base optimizer dialog has
"Testing account from Krooster" and Import / export on the Account page "From a Krooster
profile": the tester pastes the profile link (`kroosterUser` takes the link or the bare
username), and the site's own route
(`pages/api/account-import/krooster.ts`, `ARKPEDIA_KROOSTER_IMPORT` from next.config.js, so
production has no such route) fetches the public lookup page, whose embedded page data
carries the roster, and passes on only the roster and a few profile fields
(`lib/account-import/krooster.ts`). `accountFromKrooster` makes the account record and the
planner roster by the game-account map, with module stages and masteries; the record has
no base layout, clears or depot, so the optimizer recommends a layout (Recommend 2-5-2).
The Base page carries no game-account map, so the control there loads the Account page's
props on demand, as the header's Import / export does (`components/account/AccountActions.tsx`).

The dialog has no start-time control: the search knows only the hours between logins, and
the shift clocks read the rotation's start time, which the Base page's rotation panel
("Starts at") sets and a saved recommendation keeps.
`scripts/tests/test-krooster-import.ts` holds the parser, the mapping and the link parsing.

### Before and after the table

`scripts/bench/compare-optimizer.ts <pre-table checkout>` runs the same accounts (the fixture,
both reference sheets' maxed roster, every profile under `tests/fixtures/krooster/`) in a
checkout of the pre-table tip (e692e12dc) and in this one and diffs the recommendations, each
account twice: with the operators of `scripts/tests/base-skill-deviations.ts` left out, where the
two must agree exactly, and with the whole roster. Both sides anneal for a fixed round budget
(`annealRounds`, cooling over the rounds) and settle every compared number to 1e-9
(`lib/base/settle.ts`): two sums of the same skill numbers can sit a last bit apart, and a
greedy fill or an anneal that breaks a tie by that bit walks another path from then on. The
pre-table checkout gets both through `scripts/bench/pre-table-determinism.patch`. A difference
confined to the Reception Room, Office, Control Center and the Dormitories with every production
crew the same is the completion pass (its support candidates rank by their own drain since
4990c4e50), which the search's score never sees, and the report says so.

### Where a minute goes

Profiled on the maxed roster on 2026-11-03 (`node --cpu-prof` over 15 s of annealing): with
the shared room-rate cache a simulation costs about 4 ms and calls the snapshot calculator
less than once, so the simulator is a third of the time and the team-block rebuilds every
40 rounds were about 60%, each scoring some five thousand placements with the full
calculator. Three changes, all keeping `simulateBase` identical:

- `snapshotMemo.ts` remembers the calculator's scored totals by staffing content, so a
  placement is scored once per crew it appears in (about one call in sixteen is answered
  from the memo on the maxed roster; it helps most where the proxy sums unchanged steps).
- The annealer scores lean (`evaluate(g, ctx, true)`): no Morale trace or per-login Morale,
  which the search never reads; the plan a reader sees is evaluated in full.
- Block refreshes re-rank the blocks found, over the previous build's own ranking with a
  shorter shortlist, and enumerate in full only every third refresh (`FULL_BUILD_EVERY`).

120 annealing rounds on the maxed roster went from 18.7 s to 11.2 s (three runs each,
same seed, 54,725 to 28,714 placements scored); at 30 s the page's search scored 390 to
438 plans instead of 143 to 173 and finished at or above the earlier score (100,305 to
100,505 against 100,081; the 2-5-2 sheet roster within its run-to-run band).
`account-budget.ts` prints the memo and block counts.

### Preset slots

The game stores three base presets, so a rotation that needs more distinct setups cannot
be set up in the base. `MAX_ROTATION_SETUPS` in `rotationSetups.ts` is that bound, and
`setupKey` says when two shifts are one preset (the same placements, products and
settings; refills and reseats are login actions). The seed search skips the staggered
shape (four setups) and any seed plan over the bound; in its place the thirds shape is a
seed of its own (each room's main crew rests a different one of three changes, so a third
of the base rests at a time and every place can be staffed within three setups), both simulators score such a plan
as unusable, the annealer screens its moves before simulating them, `genomeFromResult`
refuses such plans, and `optimizeAccountBase` rejects any over it before it is shown
(counted among the excluded rotations). A four-step duty (A, A, A, B) needs two presets
when every off-duty worker rests, three when only the crew just off shift does (the seed
duty shape), and stays allowed either way. `completeStaffing` fills a setup group as one
and rests the worker in another group, so groups stay identical; where no other group
has the beds, or a worker would exhaust resting one shift in three, it splits the group
into its alternate shifts, which rest their support workers in each other. That may use a
slot the search did not, never more than the bound. Saving creates one setup per group, and the rotation's shifts
share it. Raising the constant is the one change needed should the game
add a slot.

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

## Completing the base

Published account recommendations pass through `completeStaffing.ts`. The search
staffs every work room, the Reception Room and Office included, since some of their
skills raise scored output across rooms (Mulberry in HR lifts a Trading Post), but it
may put only an operator with a skill for the room into those two: their own speed is
not LMD, EXP or gold, so a search free to drop anyone there kept whatever its last
random move left (testers saw Penance and Mudrock searching for clues and Bison in HR).
It leaves the Workshop alone (crafting is instantaneous) and may leave low-value
Control Center and Power Plant slots open. The completion pass fills open slots with
remaining owned operators, skilled first by the room's own rate, then by Morale drain,
then the operator the reader has built (an E0 copy of a skill never displaces a promoted
one), keeps existing working placements and locked/dorm-skill residents, and finds
recovery placements. A support room it cannot staff safely stays empty, and its note
names the idle skilled operators the reader can run there by hand.
A supplemental operator may cover multiple changes only when the complete simulated
cycle remains periodic and free of exhaustion. This includes all cross-room effects;
returned yields and saved rotations use the completed assignments. Intermediate
results are completed too, cached per plan, with the highest completed score retained.

Three refinements run around the fill (2026-11-04, after testers saw Brigid at E0 in
HR over Haruka at E2, and a fourth Factory worker adding nothing):

- **Skill rooms chosen by their own speed.** The Reception Room and Office seats the
  search filled with whichever skilled operator its last move left (their speed is not
  in the score, so every skilled choice ties) are given back to the fill, which ranks by
  the room's speed, then Morale drain, then the reader's build. Only occupants who work
  nowhere else are given back, so a cross-room choice the search made for its score
  (Mulberry in HR for a Trading Post) stands. An operator without a skill for either
  room is never seated there, by the search (`annealBase.ts`) or the fill; a roster with
  nobody skilled leaves the room empty and the note says so.
- **Built operators first.** An Elite 0 worker in a Factory, Trading Post or Power
  Plant gives their whole schedule to an idle built (Elite 1 or 2) operator with a skill
  for the room when the simulated funded score falls by no more than
  `BUILT_FIRST_MARGIN` (0.5% of itself): the output lost is a hair beside raising an
  operator the reader has not built. The note names each swap.
- **Workers who add nothing.** A Factory or Trading Post worker whose removal from the
  room, in every shift, leaves the funded score where it is (gold no post sells, orders
  no gold fills) is left out, and the note names them. Power Plant workers are not
  judged this way: drone charge has uses the score does not count. A worker left out
  gives up their beds too (unless a Dormitory skill of theirs still serves the room, or
  the rotation protects them), and the freed beds go once more to the fill for the
  Control Center, Power Plants, Reception Room and Office, which are last in line for a
  bed otherwise: on the 21 saved Krooster profiles the Office stood empty in most shifts
  while a left-out seller kept a bed in every one (found 2026-11-05).

Per-slot staggering (the base expert's second rotation: one or two seats of a room change
hands while the rest of the crew works on, a weaker filler covering, and the best workers
returning as soon as they have rested) is a seat-level override in the genome: `seatCrews`
names, per room and seat, the crew that holds the seat at each change where it differs from
the room's crew (`crewAtSeat`, `staffAt` in `planGenome.ts`). The decode, the collision check
and the annealer's proxy read seats through it; a `stagger` move (weight 2 for 12-hour and
8-hour logins, off for 24-hour logins, where whole crews swap) sets or clears one seat at one
change; the published result carries `seatCrews` and `genomeFromResult` rebuilds the crews
seat by seat from the saved shifts, so a staggered plan reads back exactly. The preset bound
(`rotationSetups.ts`) counts the decoded shifts as before. The notes name each staggered seat
and who holds it at each change.

Workshop assignments are standby suggestions for the current recipe, not simulated
crafting; craft costs and post-craft recovery still require player action. Training
is staffed only when the user has selected an operator target. Limited rosters or
recovery capacity can still leave gaps, named by room and shift in the search notes.
Existing saved setups are unchanged: rerun the optimizer and use the new rotation.

## The base skill table

Every operator base skill the game describes is one entry in `lib/base/base-skill-effects.json`,
keyed by the game's buff id (`building_data.json` → `buffs`), with the types and the loader in
`lib/base/baseSkillEffects.ts`. The calculator and the optimizer read numbers from this table;
nothing reads a skill's description text for a number. Regenerate it after a game data refresh
that adds a buff id, or after changing a rule or an override:

```bash
npm run base:skill-effects
```

`npm run base:skill-effects -- --fetch` first fetches `building_data.json` from the EN mirror
(ArknightsAssets/ArknightsGamedata) and the CN mirror (Kengxxiao/ArknightsGameData) into
`.cache/gamedata/`; without it the script reads `ARKPEDIA_GAMEDATA` or the stage pipeline's cache
(`.cache/upstream/en-gamedata`), and `ARKPEDIA_CN` or `.cache/upstream/cn-tables`. EN comes first;
a buff id only CN describes takes its structure from CN and its English from the operator record
in `data/`. The table is committed (`data/` is pulled and git-ignored, and the calculator imports
the table statically), so a regeneration shows as a diff to review.

Each entry carries `roomType`, `buffCategory`, `targets` (the game's F_EXP / F_GOLD / F_DIAMOND
product targets, training classes, Workshop recipe kinds), `efficiency` (the game's headline
percent, null where it gives none), `unlock` (the earliest promotion phase and level any operator
unlocks it at, `unlocks` listing every distinct one when they differ), and its `shape` with
`effects`. The description text is not in it (the operator records carry that; the table ships to
the browser with the calculator, 17 KB gzipped):

- `flat`: fixed numbers (`+30%` productivity, `+2` order limit).
- `counted`: a base plus an amount per counted thing (`per.count`): a group roster in the base or
  the room, a facility count, Dormitory levels, Office recruit slots, a resource pool; with an
  optional `step`, `maxCount` and `cap`. `countedValue` in `baseSkillEffects.ts` is the arithmetic.
- `threshold`: numbers that apply only while a condition (`when`) holds: a named operator in the
  same room or the Control Center, alone in the Reception Room, Clue Exchange active, a count
  reaching a value, a product being made. A name the game text wraps in a glossary term
  (`<$cc.angel>Exusiai</>`: "Includes the following Operators: Exusiai the New Covenant, Exusiai")
  carries the term's other forms in `forms`, and any one of them satisfies the condition once:
  Lemuen's Amicus pays its +25% for either Exusiai, not twice for both; Tomimi's Barbecue Master
  pays for Gavial the Invincible as for Gavial. The build reads the terms from `gamedata_const`
  (EN) beside the building data, and only a term wrapping the name itself counts: the Glasgow
  Gang term around "Glasgow Gang" lists Siege without meaning him.
- `pool`: every effect is on a shared quantity rather than a rate: Morale drain or recovery, order
  limit, capacity, drone charge, a base-wide resource (Felvine, Passion, Worldly Plight).
- `custom`: a named handler in the calculator (`custom.handler`) with its numbers in
  `custom.params`: `ramp` (a value climbing by the hour, averaged over the window), `afterHours`,
  the Totter pair, Bubble, Vermeil, Waai Fu, Snowsant, `perOthersOrderLimit` (Degenbrecher, Swire),
  Jaye's pair, Gladiia's Tide Observation and Group Hunting, Młynar, and `moraleGated` (Dusk, Ling).

`interaction` holds what a skill does to other skills: `overridesOthers` and `exemptFromOverride`
(the Automation and Snegurochka family against Purestream's kind), `goldOrderTier` and `trade`
(the Trading Post's order distribution, Proviso, Tequila, Pepe, Closure, U-Official),
`immuneToRoomMorale`, `reclassifiesSkills` (Highmore), `cancelsSuiSelfDrain` (Ling), the
Dormitory's `preferredTarget`, `recipientBonus` and `providerBonus`. An effect's `suppressedBy`
names the buff id that silences it. `nonNumeric` marks the skills the game states in words only
(which clue is likelier, a one-off Morale swap).

The script's guard refuses the table when a buff id is unclassified, a rule found no number in a
text that has one, a record skill is in neither game table, a text uses words the rules cannot
read (a count, a condition) without an override, an override names a key no record has, or two
overrides disagree on a buff id several operators share. The rules are the text patterns the
calculator once ran at runtime, now in `scripts/build/build-base-skill-effects.ts`; the overrides
are `scripts/build/base-skill-overrides.ts`, keyed by the former handler key ("Operator|Skill",
found in the operator records under the operator's name or a former one) or by a buff id outright.

### How the calculator reads it

`lib/base/skillEvaluation.ts` turns an entry into a contribution against a `SkillScope`: the
room's operators, the base's counts (`count`) and conditions (`holds`) as closures the calculator
supplies (`scopeFor` in `calculateBase.ts`; `roomOnlyScope` in `optimizerLogic.ts` for the
standalone room search, with the assumed base it always used). The data shapes resolve there; a
`custom` entry comes back with its handler name and parameters, and the room runs it at its
stage (`lib/base/customSkillHandlers.ts`): `base` for Gladiia, Młynar and the Morale-gated
generators before any room; `factoryAggregate` for Bubble, Vermeil and Waai Fu once the room's
other productivity is known; `tradingAggregate` and `tradingOrders` for Snowsant, Degenbrecher,
Swire and Jaye; `moraleWindow` for the ramps and Totter once the room's Morale window is known.
Control Center effects aimed at one room (`perTradingPostOrderEfficiency`, `perFactoryProductivity`)
are evaluated once per target room with that room as the scope. Resource pools come from the
table's `resource` effects (`lib/base/baseResources.ts` sums the generation and runs the
conversions in their stages). A test or bench that needs a made-up rate gives a skill its own
entry (`tableEntry`, `syntheticSkillEntry`) rather than description text.

`scripts/tests/test-base-skill-parity.ts` held the table-driven calculator equal to the one it
replaced (frozen under `lib/base/legacy/` for the move) room by room over the fixture account,
the 2-5-2 and 3-4-2 reference sheets and 500 seeded random placements of a maxed roster; the
differences are the skills the handlers or the text patterns got wrong, listed with their reasons
in `scripts/tests/base-skill-deviations.ts` and each held to its corrected number in
`test-base-skill-corrections.ts`. With the legacy copy gone the parity test holds a golden
snapshot of the new numbers (`tests/fixtures/base-calculator-golden.json`): a regression lock,
not the proof.

Training Room and Workshop skills are read from the table like every other room's. A training
effect names the trainee classes it applies to (`targets`, the game's class codes) and may hold
only at a mastery level or for a branch (`masteryLevel`, `traineeBranch`); counted ones read
`base.roster:X` (Knights, Sami, the R6 groups, Abyssal Hunters) or `resource:worldlyPlight`;
Zuo Le's instant Guard M1 is a `trainingTimeFactor` of 0 under `all` of mastery 1 and
`instantTrainingReady`. `lib/base/trainingRoom.ts` sums the evaluated skills into the room's
speed, Morale and hours. A Workshop effect names its recipe kinds (`targets`) and may be gated
on a word in the recipe's name (`recipeFamily`: Oriron, Polyester, Crystal) or on its base Morale
cost (`recipeCostIs`, `recipeCostAtLeast`); the kinds are `byproductChance`, `recipeMorale`
(added), `recipeMoraleFixed` (Mudrock, Lessing), `recipeMoraleFactor` (Luo Xiaohei's quarter)
and `recipeLmdFree` (Blemishine); the per-resident skills count `dorm.moraleAtMost:N` or
`dorm.moraleBelow:N`. Nine-Colored Deer's counters and Thorns's refund are the custom handlers
`causality`, `karma` and `explosionArts`, run at the `workshop` stage with the reader's settings.
`lib/base/workshop.ts` turns the evaluated skills into the craft's chance and costs. The two
rooms joined the table after the others: their old modules were held equal over 60,640 trainer
and crafter cases, the differences being deviations listed with the rest (six trainers whose
record text carries a no-break space the old mastery pattern never matched, Talulah's and
Caleido's CN-only skills, Homebound's recipe gate).
