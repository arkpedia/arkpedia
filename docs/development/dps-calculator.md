# DPS calculator

The Planner compares independent builds against the same target. The response curve varies one defense while the other settings stay fixed. The table gives HP loss and elemental injury separately. Selecting a row reveals which attack, tick or activation the values represent. Single activations have no sustained DPS. The damage composition chart uses a common absolute scale across builds.

## Calculation order

1. Read the operator and deployable stat curves, promotion gates, potentials, skill ranks, module stages and talent upgrades from the pinned EN and CN game tables. Interpolate within the selected promotion, then add trust, potential and module stats. Builds use full trust.
2. Resolve the selected source. An independent summon uses its own ATK. Effects such as Mayer's detonation use the owner's ATK. A trap is one trigger. Repeated hits apply defense individually. Named conditional hits stay in the breakdown unless the source explicitly includes them.
3. Calculate HP loss by damage type, then any injury derived from the damage dealt or directly from ATK. Apply the target's injury resistance and burst lockout. The first-burst table starts with an empty gauge and tests individual actions or ticks against 1,000 for a grunt or elite and 2,000 for a boss.
4. Resolve deployment interactions at their event times. A marked ally's SilverAsh the Reignfrost S2 strikes land at 1.0 and 1.4 seconds. Each reads the ally's ATK at that instant. Self-deployment skills resolve at deployment, and a manual auto-recovery skill waits for both the requested delay and available SP. Same-time activation precedes the strike. The model assumes uninterrupted range and normal SP recovery. The timing reference is [Arkpedia's reviewed SilverAsh controller](https://github.com/arkpedia/arkpedia-stage-simulator-standalone/blob/5ded8215ae50330577d031093d73aec8c992e811/server/sim/content/arkpedia-svash2.js).

## Extending coverage

The profile generator reads the ArknightsGamedata revision named in the hydrated data lock. The build and content exporter reuse the generated coefficients while that pin matches. To regenerate after editing the supported profiles, run:

```sh
node scripts/build/build-dps-profiles.mjs
```

Two optional arguments supply local EN and CN excel directories from the same revision. The CN inventory searches obtainable operators, their skills, talents, modules and owned tokens for elemental mechanics. A newly detected operator needs review. Add the selected skill slots to the generator, map the injury type in `lib/dps/sources.ts`, implement the specific source and verify it against a numeric example. Add conditional events in `effects.ts` and timed interactions in `deployment.ts`. The calculator exposes reviewed sources and modules. Rotation downtime, pathing, ally damage outside the deployment scenario and the exact Rampage fallout ramp are outside these figures.

Run `node --import tsx --test scripts/tests/test-dps-calculator.ts` from the application checkout. The fixtures include damage floors, independent resistance channels, multi-hit conversions, summoned and trapped sources, promotion limits, a split deployment timeline and Tragodia's before/after boss breakpoint.
