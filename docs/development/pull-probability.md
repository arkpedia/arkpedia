# Pull-goal probabilities

The planner worker calls `calculateOdds` in `lib/pulls/exactProbability.ts`.
It propagates probability mass through finite states: six-star pity, the
banner-specific featured-six guarantee, the first-ten guarantee, crossover
featured-five guarantees, and capped copy counts. No random draws contribute
to planner results. The rules and fresh-banner assumptions remain visible in
the goal editor; exact calculation does not confirm a future Global roster or
resolve an unknown initial pity balance.

Individual copy tails are calculated separately with counts capped at six.
The joint calculation caps each count at its requested goal and evaluates one
shared spark wallet. The limited-banner 300-pull gift is a deterministic copy,
not an exchange. Reaching all goals is absorbing, since subsequent pulls cannot
undo success. This reduces the usual two- or three-featured-target requests
without multiplying independent marginal probabilities.

Transitions are cached independently of copy counts. Compact states use two
reusable dense probability buffers with active-state lists; larger state spaces
use sparse maps. Computation is bounded to 400,000 simultaneous states and
60,000,000 visited states per request. Requests exceeding that work limit return
an explicit calculation error, never a sampled percentage. Both planner displays
handle errors; the expanded editor explains the limit. These bounds protect
browser responsiveness, rather than imposing a fixed operator-count restriction.

`simulateOdds` remains a test/reference implementation, not a runtime fallback.
Its trials have independent deterministic random streams, so target-dependent
early stopping cannot change subsequent trials. The previous shared stream
reproduced the reported 230-pull Orchid inconsistency: 7.11% alone became 7.272%
when one Catapult was added.

The exact calculation under the documented model gives 7.12918727955598% for
six Orchids and 7.12918697960694% with one Catapult as well. Both display 7.1%.
Tests include independent one-pull and first-ten closed forms, paired crossover
five-star guarantees, an independent six-star recurrence, shared sparks, the
300-pull gift, target-order invariance and nested-goal/budget checks.
