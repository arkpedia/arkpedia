# DPS calculator

The calculator compares independent builds against the same target. The response curve varies one defense while the other settings stay fixed. The probe inspects the curve independently of the selected enemy. At target compares builds at the enemy’s actual defenses. Burst timeline plots absolute first and second burst times from first contact and marks recovery between them. Vertical zoom follows the probe. Where several values exceed the zoom window, the first available build anchors it. Both PNG buttons preview the selected chart and save the same rendered file. The table gives HP loss and elemental injury separately. Selecting a row reveals which attack, tick or activation the values represent. Single activations have no sustained DPS. The damage composition chart uses a common absolute scale across builds.

## Calculation order

1. Read the operator and deployable stat curves, promotion gates, potentials, skill ranks, module stages and talent upgrades from the pinned EN and CN game tables. Interpolate within the selected promotion, then add trust, potential and module stats. Builds use full trust.
2. Resolve the selected source. An independent summon uses its own ATK. Effects such as Mayer's detonation use the owner's ATK. A trap is one trigger. Repeated hits apply defense individually. Named conditional hits stay in the breakdown unless the source explicitly includes them.
3. Calculate HP loss by damage type, then any injury derived from the damage dealt or directly from ATK. Apply the target's injury resistance and burst lockout. The first-burst table starts with an empty gauge and tests individual actions or ticks against 1,000 for a grunt or elite and 2,000 for a boss.
4. Resolve deployment interactions at their event times. A marked ally's SilverAsh the Reignfrost S2 strikes land at 1.0 and 1.4 seconds. Each reads the ally's ATK at that instant. Self-deployment skills resolve at deployment, and a manual auto-recovery skill waits for both the requested delay and available SP. Same-time activation precedes the strike. The model assumes uninterrupted range and normal SP recovery. The timing reference is [Arkpedia's reviewed SilverAsh controller](https://github.com/arkpedia/arkpedia-stage-simulator-standalone/blob/5ded8215ae50330577d031093d73aec8c992e811/server/sim/content/arkpedia-svash2.js).

## Enemy presets and repeat bursts

The enemy selector joins the handbook to the simulator combat archive by enemy ID. Each level inherits its unspecified fields from level zero. The combat record supplies rank, DEF, Arts RES, injury resistance and elemental damage resistance. Named presets use the rank’s gauge. Custom targets can override it. Stage-specific stat overrides and phase changes are outside this preset.

Both timing measures start at first contact with an empty gauge. The second measures the elapsed time from the first burst to the second on the same surviving target. The model follows the attack clock through recovery, discards injury during lockout, and resets periodic sources that end on burst. The base recovery windows come from the enemy entries in the [game glossary](https://github.com/ArknightsAssets/ArknightsGamedata/blob/e0cd8f274ffbcf57ed0b0684cb681620478ffe0e/cn/gamedata/excel/gamedata_const.json). Tragodia S3 and Botani S2 increase the recovery rate. Thumpy’s physical hits subtract time from the running Corrosion cooldown. The next Corrosion buildup uses the reduced DEF. A bounded source can expire before either burst. A manually triggered source can have a known action count with unknown timing.

Virtuosa’s S1 timing scenario starts with full stored charges. The first cast and first aura tick land at first contact, and the model assumes one SP per second without animation lockout. S2 combines her own attack and one-second aura against one target during the active window. S3 applies its talent multiplier to the bonus Necrosis percentage, then measures the aura on the same surviving target.

## Extending coverage

The profile generator reads the ArknightsGamedata revision named in the hydrated data lock. The build and content exporter reuse the generated coefficients while that pin matches. To regenerate after editing the supported profiles, run:

```sh
node scripts/build/build-dps-profiles.mjs
```

Two optional arguments supply local EN and CN excel directories from the same revision. The CN inventory searches obtainable operators, their skills, talents, modules and owned tokens for elemental mechanics. A newly detected operator needs review. Add the selected skill slots to the generator, map the injury type in `lib/dps/sources.ts`, implement the specific source and verify it against a numeric example. Add conditional events in `effects.ts` and timed interactions in `deployment.ts`. The calculator exposes reviewed sources and modules. Rotation downtime, pathing, ally damage outside the deployment scenario and the exact Rampage fallout ramp are outside these figures.

Run `node --import tsx --test scripts/tests/test-dps-calculator.ts` from the application checkout. The fixtures include damage floors, independent resistance channels, multi-hit conversions, summoned and trapped sources, promotion limits, a split deployment timeline and Tragodia's before/after boss breakpoint.
