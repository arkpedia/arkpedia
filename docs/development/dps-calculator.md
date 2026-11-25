# DPS calculator

The calculator compares independent builds against the same target. Select a damage source on each build card and use Edit build to change rank, module, promotion or source-specific conditions. With multiple builds, choose a baseline on any card to compare target results against it.

The response curve varies one relevant defense. Auto chooses DEF for physical damage, RES for Arts, and the largest modeled damage channel for a mixed comparison using unmitigated damage on the selected measure. Injury measures start with injury resistance and also offer defenses that change the buildup. At target gives a direct comparison for defense-independent sources such as True damage. The Elemental burst view appears when a selected source can build injury and plots first and second burst times from first contact.

Chart settings let you set the axis maximum, zoom vertically and reset an independent probe to the target. Vertical zoom follows the probe. When the values span more than the zoom window, the baseline anchors it if it has a value. Both PNG buttons preview the selected chart and save the same rendered file. The table gives HP loss and elemental injury separately. Selecting a row reveals which attack, tick or activation the values represent. Single activations have no sustained DPS. The damage composition chart uses a common absolute scale across builds.

Damage labels describe the actual unit each build uses. Exusiai’s volley includes all its shots, Ch’en’s S2 reports one cast, and Blood’s Whisper can report one tick or the full summon where labeled. Skill DPS averages the selected repeating damage during the active window. The damage table uses the same units as the chart and PNG.

## Damage timeline

Choose **Timeline** in Damage Comparison to plot each supported build against the selected enemy or custom defenses. Set the chart length and the time of one skill activation. The stepped line shows average normal attack DPS before and after a timed skill and average Skill DPS while it is active. Amiya S3 drops to zero on retreat. The time slider shows each build’s DPS and phase at the selected moment.

Ulpianus S3 applies its ATK buff to the opening anchor throw and uses the skill rank’s damage multiplier. The chart assumes the anchor connects at activation. It adds the mitigated hit as a one-second spike and lists its exact damage beside the skill window. Single casts are also shown as one-second spikes. The model holds target defenses and elemental state fixed and leaves SP recharge, projectile travel, animation timing, manual recalls, ammo and independent summon or trap timing outside the chart.

## Healing comparison

HPS measures healing per second for one ally with missing HP while the selected source is active. It adds direct healing per heal divided by its interval to passive regeneration per second. The breakdown shows how many allies a direct heal can reach and lists triggered heals separately. A comparison with only healing sources opens on HPS automatically. In a mixed comparison, choose HPS in Measure.

Reviewed healing builds include Skadi the Corrupting Heart, Haruka, Sussurro, Ptilopsis and Perfumer. Skadi’s regeneration assumes the ally is in her or her Seaborn’s range and counts their shared aura once. Haruka S2 defaults to its second activation, when its ATK bonus and unlimited duration apply. Select First activation to compare its initial cast. Bubble pops depend on incoming hits and are shown per pop. Haruka S2’s follow-up damage depends on the actual HP restored and is outside this comparison. Coefficients come from the [pinned game skill table](https://github.com/ArknightsAssets/ArknightsGamedata/blob/e0cd8f274ffbcf57ed0b0684cb681620478ffe0e/en/gamedata/excel/skill_table.json).

## Survival

Select an enemy, a defending operator and any number of the reviewed healers. The enemy uses ATK, attack interval, attack speed and damage types from the enemy records. Select the attack type when the handbook lists both Physical and Arts. Enemies without supported attack data are omitted. The defender starts at full HP with the selected level, potential and full trust. Override the off-skill HP, DEF and RES to represent other stat buffs or a module.

HP over time shows the defender with and without healers, with the same defender skill applied to both traces. One activation assumes the skill is ready at its configured time. From deployment uses the selected rank's initial SP and cost. Supported auto-recovery skills fire when ready, charge at 1 SP per second outside their active window, and respect use limits. At M3, Haruka S2 runs from 17 to 43 seconds and becomes permanent at 60 seconds. SP bonuses from other effects are excluded. Passive skills apply for the whole window. Modeled defender effects include DEF, RES, maximum HP and self-regeneration. Maximum-HP changes preserve the current HP fraction. The highlighted windows give the defender's skill uptime.

Modeled enemy skills default to on. Faust’s special bolt replaces the first basic attack after its cooldown. FrostNova’s Ice Nova lands on cooldown. W’s C4 lands after a modeled three-second fuse. Corrupted Knight pauses basic attacks during its charged attack. Multipliers and cooldowns come from the enemy database. Skill impacts are marked above the HP chart. The basic attack DPS figure describes an off-skill defender and serves as a reference next to the timeline. The model assumes a stationary one-on-one encounter and approximates attack timing without animations or stage-specific positioning.

Patriot can run in either stance alone or in Full fight. Marching treats the defender as blocking and groups four separately mitigated hits at each attack timestamp. In Full fight, set when Marching ends. Revival then lasts for the duration recorded for that enemy level. Patriot stops basic attacks during revival and deals True damage within the aura. The aura clock continues into Ruination, and the selected position governs melee attacks and high-ground spear throws. Spear impacts use a modeled three-second wind-up. Defender HP, healing and skill timers continue across phases. The manually set Marching end stands in for defeating Patriot’s first phase.

After a healer skill ends, the healer returns to normal healing. Each activation or expiration starts a fresh direct-heal interval. Regeneration applies continuously, and direct healing caps at missing HP. Simultaneous damage resolves before direct healing. A lethal hit ends recovery. Juggernauts, Reapers and Soloblades receive regeneration only. Stage modifiers, defensive talents and shields, effects such as Skadi’s Inspiration and Haruka’s Sanctuary, and triggered healing are outside this model.

`scripts/build/build-dps-enemies.ts` generates the enemy and defender roster with the other calculator assets. The browser loads it when Survival first opens.

## Calculation order

1. Read the operator and deployable stat curves, promotion gates, potentials, skill ranks, module stages and talent upgrades from the pinned EN and CN game tables. Interpolate within the selected promotion, then add trust, potential and module stats. Builds use full trust.
2. Resolve the selected source. An independent summon uses its own ATK. Effects such as Mayer's detonation use the owner's ATK. A trap is one trigger. Repeated hits apply defense individually. Named conditional hits stay in the breakdown unless the source explicitly includes them.
3. Calculate HP loss by damage type, then any injury derived from the damage dealt or directly from ATK. Apply the target's injury resistance and burst lockout. The first-burst table starts with an empty gauge and tests individual actions or ticks against 1,000 for a grunt or elite and 2,000 for a boss.
4. Resolve deployment interactions at their event times. A marked ally's SilverAsh the Reignfrost S2 strikes land at 1.0 and 1.4 seconds. Each reads the ally's ATK at that instant. Self-deployment skills resolve at deployment, and a manual auto-recovery skill waits for both the requested delay and available SP. Same-time activation precedes the strike. The model assumes uninterrupted range and normal SP recovery. The timing reference is [Arkpedia's reviewed SilverAsh controller](https://github.com/arkpedia/arkpedia-stage-simulator-standalone/blob/5ded8215ae50330577d031093d73aec8c992e811/server/sim/content/arkpedia-svash2.js).

## Enemy presets and repeat bursts

The enemy selector joins the handbook to the simulator combat archive by enemy ID. Each level inherits its unspecified fields from level zero. The combat record supplies rank, DEF, Arts RES, injury resistance and elemental damage resistance. Named presets use the rank’s gauge. Custom targets can override it.

**Enemy form** appears where a reviewed rule can apply the level’s archived DEF or RES modifiers. Patriot defaults to Marching (2,100 DEF, 90 RES). Ruination uses 700 DEF and 45 RES after the opening invulnerability. Other presets include Refraction and Silence, Overload, orchestra variations, and named forms such as the Last Steam Knight’s second form. For example, Steam Knight Lv 1 inherits the RES reduction from Lv 0 and uses its own DEF reduction. These rules read the numeric coefficients by name from the game’s talent blackboard and specify how each modifier is applied. [Pinned enemy database](https://raw.githubusercontent.com/ArknightsAssets/ArknightsGamedata/e0cd8f274ffbcf57ed0b0684cb681620478ffe0e/en/gamedata/levels/enemydata/enemy_database.json)

The selected form supplies fixed defenses throughout the damage timeline and the other comparison views. For records with insufficient data to compute a different form, the calculator labels the base defenses and offers Customize. Stage modifiers, form transitions inside a damage run, incoming-damage reduction, barriers, dodge, invulnerability and recovery are outside the target defense model. Check the active form and any encounter modifiers before comparing it with an in-game result.

Both timing measures start at first contact with an empty gauge. The second measures the elapsed time from the first burst to the second on the same surviving target. The model follows the attack clock through recovery, discards injury during lockout, and resets periodic sources that end on burst. The base recovery windows come from the enemy entries in the [game glossary](https://github.com/ArknightsAssets/ArknightsGamedata/blob/e0cd8f274ffbcf57ed0b0684cb681620478ffe0e/cn/gamedata/excel/gamedata_const.json). Tragodia S3 and Botani S2 increase the recovery rate. Thumpy’s physical hits subtract time from the running Corrosion cooldown. The next Corrosion buildup uses the reduced DEF. A bounded source can expire before either burst. A manually triggered source can have a known action count with unknown timing.

Virtuosa’s S1 timing scenario starts with full stored charges. The first cast and first aura tick land at first contact, and the model assumes one SP per second without animation lockout. S2 combines her own attack and one-second aura against one target during the active window. S3 applies its talent multiplier to the bonus Necrosis percentage, then measures the aura on the same surviving target.

## Extending coverage

The profile generator reads the ArknightsGamedata revision named in the hydrated data lock. The build and content exporter reuse the generated coefficients while that pin matches. To regenerate after editing the supported profiles, run:

```sh
node scripts/build/build-dps-profiles.mjs
```

Two optional arguments supply local EN and CN excel directories from the same revision. The CN inventory searches obtainable operators, their skills, talents, modules and owned tokens for elemental mechanics. A newly detected operator needs review. Add the selected skill slots to the generator, map the injury type in `lib/dps/sources.ts`, implement the specific source and verify it against a numeric example. Add conditional events in `effects.ts` and timed interactions in `deployment.ts`. The calculator exposes reviewed sources and modules. Rotation downtime, pathing, ally damage outside the deployment scenario and the exact Rampage fallout ramp are outside these figures.

Run `node --import tsx --test scripts/tests/test-dps-calculator.ts` from the application checkout. The fixtures include damage floors, independent resistance channels, multi-hit conversions, summoned and trapped sources, promotion limits, a split deployment timeline and Tragodia's before/after boss breakpoint.
