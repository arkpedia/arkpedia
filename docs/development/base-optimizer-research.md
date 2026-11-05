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
