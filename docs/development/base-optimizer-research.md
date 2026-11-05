# Base optimizer: what the optimization literature offers

Research notes, 2026-11-05. What class of problem the base optimizer solves, what is known about
problems of that class, and what that suggests building next. The optimizer itself is described in
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

1. **An upper bound, so every plan has an optimality gap.** A linear relaxation of a
   set-packing model (choose one team block per room and setup, no operator twice, beds per
   setup) gives a number no plan can beat. "This plan is within 1.5% of the best possible" is
   something no other tool claims, and it tells us whether more search is worth building at all:
   the anneal settled at the same score at 60 and 80 rounds, which is either the optimum or a basin.
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

First step: build 1 and 2 as an offline bench over the 21 Krooster fixtures, and compare each
account's best anneal shift against the exact single-setup optimum and the bound. If the gap is
under about 1%, the search is good enough and the work belongs in the skill table; if it is several
percent, 3 and 4 are worth building.

## Sources

- Breugem, Dollevoet, Huisman, the cyclic crew rostering problem: https://repub.eur.nl/pub/112199
- Purnomo and Bard, cyclic preference scheduling by branch-and-price: https://zendy.io/title/10.1002/nav.20201
- Dohn and Mason, branch-and-price for staff rostering: https://orbit.dtu.dk/en/publications/branch-and-price-for-staff-rostering-an-efficient-implementation-/
- Team formation, integer linear optimization: https://repositorio.ufc.br/handle/riufc/58283?mode=full
- Synergistic team composition: https://arxiv.org/pdf/1909.11994
- Periodic maintenance problem: https://lirias.kuleuven.be/bitstream/123456789/118276/1/OR_0362.pdf
- Shapto/ArknightsBaseOptimizer: https://github.com/Shapto/ArknightsBaseOptimizer
- Arknights 一图流 schedule generator: https://ark.yituliu.cn/tools/scheduleV3/ and its release note https://www.taptap.cn/moment/837445530131890232
- MAA base scheduling optimizer: https://maatool.com/
