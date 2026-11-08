# Base optimizer: what the optimization literature offers

Research notes, 2026-11-05. What class of problem the base optimizer solves, what is known about
problems of that class, what that suggests building next, and what the first bench measured. The optimizer itself is described in
`account-base-optimizer.md`.

## What problem this is

Three layers, each harder than the one below:

1. **One setup, skills that simply add up:** operators to seats, each placement worth a number.
   That is the linear assignment problem, solved exactly in polynomial time (Hungarian algorithm,
   O(n³)). On its own it would be easy.
2. **Synergies and cross-room effects** (Shamare/Bibeak/Tequila, Proviso with Mr. Nothing, a Sui
   Control Center, per-faction counts): a placement's worth depends on who else is placed. That is
   the quadratic assignment / team formation family, NP-hard. No known algorithm finds the
   optimum in polynomial time, so exact methods take exponential time in the worst case.
3. **Over time:** Morale drains at work and refills in a Dormitory, the plan repeats in a cycle,
   beds are limited and the game stores only three presets. That is cyclic crew rostering with
   resource constraints, also NP-hard. Morale is exactly what the rostering literature calls a
   resource (like a nurse's fatigue or a battery's charge).

So "big O" gives no shortcut to the true optimum. What the literature does instead: exact solvers
that are fast enough at real sizes, and **bounds** that say how far a heuristic can be from the
optimum without finding it.

## What is known

- **Cyclic rostering by column generation (branch-and-price).** A column is one feasible pattern
  (a crew's work and rest across the cycle, legal for Morale); a master problem picks columns that
  cover every seat. Rest rules sit in the pricing step as resource constraints (a shortest path
  with resource constraints). Breugem, Dollevoet and Huisman compare formulations for the cyclic
  crew rostering problem and find column generation beats a commercial solver on hard instances;
  Purnomo and Bard solve cyclic and preference scheduling this way; Dohn and Mason prices with a
  nested shortest path whose resources encode rest requirements.
- **Team formation with pairwise synergy** is solved as an integer linear program after
  linearizing products (reformulation-linearization), or by enumerating whole teams as columns.
  `teamBlocks.ts` already enumerates teams, which is the column half of that.
- **Periodic maintenance problem** (KU Leuven): a cyclic schedule of fixed length for a set of
  machines, by integer linear programming; the nearest shape to "operators that must be rested".
- **Other Arknights tools** report no proof or bound. Shapto/ArknightsBaseOptimizer is greedy
  construction with swap hill-climbing (30 plans, 5 swap rounds). Arknights 一图流's schedule
  generator states 95–98% of "the ideal" for its beta, without saying how the ideal is computed.
  MAA's maatool publishes test reports, but its page did not render for reading. None found uses
  integer programming.

## What this suggests for Arkpedia

In order of value for cost:

1. **A measure of how much the search leaves.** A true upper bound ("no plan can beat this") needs
   each team's worth to hold in any context, and rooms interact (Control Center bonuses, faction
   counts), so a model that adds room values up is not one: on the Krooster fixtures it strays from
   the calculator by up to 6.8%. What can be measured exactly is below (Results).
2. **An exact solve of one setup.** The same model as an integer program: about 16 blocks a room
   over ~15 rooms is small for a MIP solver. Counted effects (per faction, per facility) are linear
   in the placement variables, and capped or threshold ones become indicator constraints. HiGHS,
   an open MIP solver, ships as WebAssembly (`highs` on npm, 1.15.4), so it can run in the
   optimizer Worker as well as in a Node bench.
3. **The cycle on top, by enumeration plus the MIP.** With at most three setups and at most four
   (or six) changes, the change-to-setup map can be listed outright (3⁶ = 729 maps at six changes,
   far fewer up to relabelling). For each map the rest is staffing three setups with rests between,
   which is the MIP above with Morale and bed constraints per step.
4. **Large neighbourhood search** as the practical hybrid: keep the anneal, but let a move free
   two or three rooms and re-solve them exactly with the MIP. This "matheuristic" is the usual way
   out of the basins the two-walk sweep showed (each walk settles in a different optimum).

## Results (2026-11-05)

`scripts/bench/staffingMip.ts` (HiGHS, `highs` devDependency), on the 21 Krooster fixtures' 60-round
plans (`scripts/bench/staffing-gap.ts`), scored as funded output of one staffing at full Morale
(EXP plus the LMD of the gold that is sold; drones not counted):

- **The single-staffing program is exact.** `scripts/bench/staffing-mip-verify.ts` holds it to a
  brute force on three small bases (14,669 to 50,411 staffings each), including a Control Center
  whose faction bonuses lift the Factories: all three match. Funding needs two formulations (gold
  sold within gold made; or each post's sales priced on their own and rationed to the gold made):
  one LMD-per-gold price for every post missed the brute force by 18%.
- **One staffing is the wrong comparison.** The program's best staffing beats the plan's best shift
  by 3.5% on average (0.8% to 9.5%), but no rotation can run every room's best crew at once: the
  plan's best shift mixes main and relief crews, since rooms change crews at different changes.
- **Column generation separates rest from slack.** A linear program mixes whole setups, each scored
  exactly, by time share, within each operator's Morale (work plus the rest it needs at most the
  whole time, at the best recovery the plan reaches) and the beds; gold made in one setup funds sales
  in another. Fiammetta's refill targets work without rest (without that, the plan's own rotation did
  not fit the model and the mix came out 11% below the plan). Run over the plan's own setups only, the
  mix is 1.76% above the plan on average (0.53% to 5.84%): what the relaxation's freedoms add by
  themselves. Setups priced in by the duals add **2.57% on average (0.55% to 6.61%)** more: staffing
  the search could use. Largest: mayank_mj 6.6%, ashie 6.0%, blackgatoacer 4.3%; smallest: flover
  0.6%, szaal 0.9%, aliafso and DokterOetker 1.1%. Twelve pricing rounds get nearly all of it (60
  rounds: mayank_mj 6.79%, DokterOetker 1.08%, szaal unchanged).
- **Limits.** Slack is over exact setup values but heuristic pricing, so it may be understated; and
  over a relaxation (fractional shares, no three-preset limit, no Morale wasted at 24), so a real
  rotation may not reach all of it. The plans were made before the Shamare and Greyy fixes of the
  same day and are scored after them.

So the search is within about 1% of the best mix on a few accounts and 4 to 7% short on others:
enough to make suggestion 4 (re-solving freed rooms exactly inside the anneal) worth building, and
the generated setups show which rooms it gets wrong.

## Re-solving freed rooms (2026-11-06)

Suggestion 4, built as `annealBase.ts`'s `resolve`: a move frees two or three of one crew's rooms and
staffs them again together, ranking every disjoint combination of their team blocks by the sum of each
team's value in the crew with those rooms empty, then scoring the best four whole. No solver: the
enumeration is small enough to run in the optimizer Worker. It is behind `lns`, **on by default**
since 2026-11-06, when the owner accepted the 5-minute result below.

**What it is worth, at the budget the page actually searches for** (5 minutes, 21 Krooster profiles):
13 rosters' plans came out identical, 5 rose and 3 fell, mean **+0.30%**. The rises are real:
kokonattsuu +6.03% and blackgatoacer +1.81% beat the best of three baseline draws (+5.67%, +1.62%),
so they are not luck. Every fall (mayank_mj −1.68%, entropy −0.27%, shadyer −0.08%) is smaller than
the −2.29% a bare change of random seed costs on mayank_mj.

**Four findings worth more than the feature:**

- **A round budget does not predict the clock.** At 60 rounds the same move loses on 6 of 21 rosters,
  one by 5.0%, and the per-roster results are all but uncorrelated with the 5-minute ones: the worst
  60-round loser (blackgatoacer) is a 5-minute winner, the best 60-round winner (mayank_mj) a loser.
  A 5-minute walk runs ~2000 rounds, so a 60-round bench measures a different search. Anything tuned
  on rounds alone, including the two-walk portfolio of 2026-11-05, is unverified in production.
- **The second walk barely runs in production.** The first walk takes its layout's slot whole (170 s
  of 173 s, 2015 rounds) and the second gets 3 s or never starts, though the round bench has it
  winning on 8 of 21 rosters. Giving it a share was tried and lost; see the next section.
- **The 5-minute search has a seed noise of about ±1%**, tail −2.3%. No change, including no change
  at all, clears "every roster stays or rises" against that; a per-roster result inside the band is
  not evidence either way.
- **A hedge is not available.** Half the slot to a walk with the move and half to one without lost
  0.28% and gave up the whole effect (kokonattsuu +6.03% → −0.23%): the gains need the long walk.

**Measured and not shipped:** the same re-solve run over the best plan after the walk, keeping only
what the full simulation scores higher. Safe by construction, and worth +0.07% (15 of 21 rosters
unchanged) — not enough for the code, so it was removed.

**Why the slack is still mostly unclaimed.** The column generation says 2.57% on average is there;
this takes 0.30%. Nothing here addresses the finding above it: a rotation, not a staffing, is what
the mix exploits, and the move re-staffs rooms within one crew's snapshot.

## Giving the second walk a real slot (2026-11-06)

The portfolio runs as one walk on the clock: the first takes the layout's whole slot and the second
gets what its patience leaves, usually nothing. Giving the second a share of its own was the obvious
repair, so both splits were measured over all 21 Krooster profiles at the 5 minutes the page searches
for, with the re-solve off in both walks so the split was the only change:

| Wider / narrower | Mean | Up | Down | Same | Worst | Best |
| --- | --- | --- | --- | --- | --- | --- |
| 0.5 / 0.5 | **−0.58%** | 4 | 16 | 1 | entropy −3.04% | flover +1.21% |
| 0.7 / 0.3 | **−0.25%** | 8 | 13 | 0 | entropy −1.90% | flover +1.26% |

No split beats the single long walk. The even split loses on 16 of 21 rosters and its worst case is
3.0% down; giving the wider walk 70% of the slot cuts the loss to 0.25%, which is what the time buys,
not what the second walk adds. The 60-round portfolio's edge does not survive the clock: gita and
blackgatoacer, two rosters the narrower walk won at 60 rounds (+1,164 and +884), lose 0.42% and 1.36%
when it gets half the slot, and 1.31% and 1.56% at 0.7.

`DEFAULT_WALKS` keeps no share: the second walk still takes the first's remainder. The re-solve is on
in both walks (the section above).

## What the 5-minute search's ceiling looks like (2026-11-06)

Six attempts to beat the shipped search, each measured at the budget the page uses, and what they
say about where the remaining slack is not:

- **The clock is worth about one more start.** Six variance rosters at 600 s beat their own 300 s
  plans by **+0.34%** in the mean (4 up, 1 down, 1 flat) — exactly what a best-of-three-starts merge
  at 300 s scores (+0.34%). Doubling the time buys a little diversity, not a different class of
  plan: the search is near its practical ceiling, and the remaining ~0.3% is not in the schedule.
- **A per-roster configuration selector cannot clear the bar.** A perfect pick among the default,
  the re-solve and the two split settings would be **+0.57%** in the mean, already barely over the
  +0.5% bar. An honest leave-one-out one-feature rule for the re-solve (count feeders) reaches
  +0.38%: it keeps its five wins and drops its three losses, which is +0.08% over shipping the
  re-solve for everyone, from 21 samples with no held-out roster. Not shipped.
- **Unequal time shares are not reachable at a 12-hour login.** Holding a finished plan's three
  staffings and products fixed and re-simulating only unequal shift lengths exhausts a crew at 12 h
  and 8 h (scores collapse); at 6 h the best shares are roster-specific (+0.8% on one roster, −0.6%
  on another). The equal three-shift cycle, which every one of the 21 plans chose, is at the Morale
  edge. The column generation's 1.76% "relaxation" is mostly the relaxation's freedom — fractional
  shares and no Morale wasted at 24 — not a rotation the game can run.
- **A wider room re-solve loses.** Freeing 3-4 rooms and scoring 8 combinations instead of 2-3 and
  4 costs more per move and finds worse plans at 5 minutes: over six rosters the mean was **−0.86%**,
  with blackgatoacer −3.48% and kokonattsuu −4.81%. The extra neighbourhood does not pay for its
  time.
- **The seed phase is not the lever.** Capping it at 0.2 of the budget instead of 0.35 left
  blackgatoacer's and shadyer's plans identical (100,083 and 93,887): the queue of product splits
  finishes before either cap, so the 600 s run's +0.34% is anneal time, not a richer seed.
- **A joint room-order move loses.** A move that rotates, relabels or swaps the crew orders of 2-3
  rooms together — the one change that could trade one room's rest against another's — scored
  **−0.74%** over the six variance rosters (1 up, 4 down), with blackgatoacer −2.47% and
  kokonattsuu −3.30%. The per-room orders the search already reaches are better than the joint ones
  this move finds at the same weight.

**A generated setup does not drop into a rotation.** `scripts/bench/integer-rotation.ts` takes a
finished plan, runs the column generation (`rotationMix`), and replaces each of the plan's three
shifts in turn with a generated setup, filling the support seats the way the optimizer fills them.
Every replacement exhausts the roster: the simulator scores it around −1e7, its exhaustion penalty.
The plan's dorms hold the crew that has just come off shift, and a generated setup's workers are not
that crew, so they rest nowhere; filling every bed with off-shift workers instead does not help
either, because the plan's rotation rests one crew at a time. The LP's slack is a relaxation of the
**joint staffing-and-rest schedule**, not a list of setups to insert; the browser search already
solves the rest schedule for its own moves, which is why the 2-3 room re-solve works and a whole-setup
swap does not. Going through the genome does not rescue it either: `generated-crew.ts` replaces one
of the plan's crew templates with a generated setup and keeps the plan's per-room schedule (the
generated crew is then used at steps the plan built for another crew's rests), or uses the setup in
a plain 0,1,2 rotation (the plan's own crews exhaust under that schedule too). The per-room schedule,
not the staffing, is what makes the plan valid; a generated setup has to be given a new rotation, not
a slot in the old one.

So the one lever these leave — **new setups** — is not reachable by generating setups alone. A
server-side generator (or a wasm port) would have to solve the rest schedule around them too, and it
must show that beats the plan by more than the +0.5% bar before anything is built.

The 5-minute search has no untried lever left inside it: every reallocation of its clock or its move
mix measured here lost or tied. The remaining ~0.3% to the 10-minute run and the LP's slack both need
something outside the Worker.

## The integer-rotation study (2026-11-06)

The offline test the ceiling left open: can the column generation's setups be run as an integer
rotation — at most three whole presets, whole-login shift lengths — and beat the plan by +0.5%?

`integer-mix.ts` solves the master LP with integer logins (`m_s` in a cycle of L), at most three
setups, and the same Morale, beds and funding rows. On ashie's 60-round plan:

- without the plan's own setups in the pool it is **infeasible**: the LP's mix uses more than three
  setups, so no three presets can carry its shares;
- with them in the pool it is feasible, but every simulated rotation **exhausts** and the MIP value
  (74,889 to 75,876) is below the plan (80,805).

`rotation-search.ts` drops the LP approximation and enumerates ordered triples of whole setups with
every whole-login allocation up to 12, builds each rotation with `decode`'s rest rule (the just-off
crew takes the beds, empty beds take dorm skills) and simulates it:

- on the 60-round plans (smaller crews) it does find rotations — kokonattsuu **+4.95%** from its two
  shifts plus one generated setup — but the 300 s plan is 89,001 against that rotation's 85,920;
- on the 300 s plans **no whole-setup rotation is feasible at all**: the just-off crew is larger than
  the 20 beds. That is why the real plan uses a per-room crew order rather than whole-crew switches.

So the LP's slack is not a preset rotation: it relaxes the per-room schedule that makes a 5-minute
plan valid. A server-side generator would have to solve that joint schedule, not just the setups;
this study does not justify building one.

## A per-room schedule solver (2026-11-08)

The schedule the integer study pointed at, built: keep the plan's crews, products and number of
staffing changes, and solve the per-room crew order (`assign`) that decides who works each room at
each change, and therefore who has just come off shift and rests. Coordinate descent over every
room's full pattern set (3^steps), evaluated by the exact simulator, then four perturb-and-descend
restarts. The plan's own genome exhausts under `decode`'s rest rule (the plant's dorms are its own),
so the descent first has to find a valid schedule; the plan is kept when the candidate is invalid or
worse, so the solver never returns a loss.

Over the 21 rosters at 300 s: **mean +0.20%**, all non-negative (10 positive, 11 zero). Largest
ashie +1.04, ny3h +0.80, aliafso +0.66, akushi +0.57; the strong plans are already at a per-room
local optimum (DokterOetker +0.01, blackgatoacer +0.05). Twelve restarts instead of four leave the
zero rosters at zero, so the descent is not under-searched: the per-room-order + `decode`-rest model
tops out around 0.2%.

The missing half is the rest schedule. The plan's own dorms are what make its schedule valid, and
`decode` cannot reproduce them; a solver that optimizes the dorm assignment alongside the room orders
is the next attempt.
