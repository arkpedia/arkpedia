import archive from '../../config/dps-profiles.json';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculate,
  createBuild as buildFromProfile,
  type Profile,
  initialTarget,
  mitigate,
  normalize,
} from '../../lib/dps/calculator';
import { deploymentSequence } from '../../lib/dps/deployment';
import { firstBurst, fallout } from '../../lib/dps/breakpoints';
import { elements } from '../../lib/dps/sources';
import { chartControls, targetControls } from '../../lib/dps/controls';
import { damageBasis, dpsLabel } from '../../lib/dps/damageLabels';
import { damageAtTime, damageTimeline } from '../../lib/dps/damageTimeline';
import { hpAt, patriotAttack, patriotFight, simulateSurvival, type Defense } from '../../lib/dps/survival';
import type { PatriotStances } from '../../lib/dps/survivalRoster';
const profiles = archive.operators as unknown as Profile[];
const createBuild = (id: string, number: number) =>
  buildFromProfile(profiles.find((p) => p.id === id)!, number);
const dummy = { ...initialTarget, def: 0, res: 0 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, a + ' vs ' + b);

test('Ulpianus S3 plots a mitigated opening hit separately from skill and normal attack DPS', () => {
  const build = createBuild('ulpia', 1);
  const timeline = damageTimeline(build, initialTarget)!;
  assert.equal(timeline.skill?.duration, 25);
  near(timeline.opening!.damage, 9098.24);
  near(damageAtTime(timeline, 4.9, 5).dps, 499.6);
  near(damageAtTime(timeline, 5, 5).dps, 11312.8);
  near(damageAtTime(timeline, 6, 5).dps, 2214.56);
  near(damageAtTime(timeline, 29.9, 5).dps, 2214.56);
  near(damageAtTime(timeline, 30, 5).dps, 499.6);

  const armored = damageTimeline(build, { ...initialTarget, def: 517 })!;
  near(armored.opening!.damage, 8981.24);
  near(damageAtTime(armored, 6, 5).dps, 2167.76);
  near(damageAtTime(armored, 30, 5).dps, 452.8);
});

test('damage timelines use RES for Arts, handle retreat and omit healing or unknown skill windows', () => {
  const amiya = createBuild('amiya', 1);
  const chant = damageTimeline({ ...amiya, skill: 1 }, initialTarget)!;
  const noRes = damageTimeline({ ...amiya, skill: 1 }, { ...initialTarget, res: 0 })!;
  near(chant.skill!.dps, noRes.skill!.dps * 0.8);
  const chimera = damageTimeline({ ...amiya, skill: 3 }, initialTarget)!;
  assert.equal(damageAtTime(chimera, 35, 5).retreated, true);
  assert.equal(damageAtTime(chimera, 35, 5).dps, 0);
  assert.equal(damageTimeline(createBuild('susuro', 2), initialTarget), null);
  assert.equal(damageTimeline(createBuild('blaze2', 3), initialTarget), null);
});

test('survival uses the damage type and resolves a lethal hit before a simultaneous heal', () => {
  const defender: Defense = { hp: 350, def: 240, res: 25, dp: 10, blocksDirectHealing: false };
  const sussurro = { ...createBuild('susuro', 1), skill: 0 };
  const interval = calculate(sussurro, dummy).attackInterval;
  const attack = { atk: 480, interval, type: 'Arts' } as const;
  const arts = simulateSurvival(attack, defender, [{ build: sussurro, delay: 0 }], 15);
  near(arts.hitDamage, 360);
  near(arts.healed.defeatedAt!, interval);
  assert.equal(arts.healed.finalHp, 0);
  const physical = simulateSurvival({ ...attack, type: 'Physical' }, defender, [{ build: sussurro, delay: 0 }], 15);
  near(physical.hitDamage, 240);
  assert.equal(physical.healed.defeatedAt, null);
  assert.equal(physical.healed.lowest, 110);
  assert.equal(physical.healed.finalHp, 350);
  near(physical.alone.defeatedAt!, 2 * interval);
});

test('survival respects Haruka’s finite first cast, permanent later cast and activation delay', () => {
  const defender: Defense = { hp: 600, def: 0, res: 0, dp: 18, blocksDirectHealing: false };
  const attack = { atk: 200, interval: 2, type: 'Physical' } as const;
  const haruka = createBuild('haruka', 1);
  const first = simulateSurvival(attack, defender, [{ build: { ...haruka, firstHealingCast: true }, delay: 0 }], 40);
  assert.equal(first.alone.defeatedAt, 6);
  assert.equal(first.healed.defeatedAt, 30);
  const later = simulateSurvival(attack, defender, [{ build: haruka, delay: 0 }], 40);
  assert.equal(later.healed.defeatedAt, null);
  assert.equal(later.healed.finalHp, 600);
  const late = simulateSurvival(attack, defender, [{ build: haruka, delay: 10 }], 40);
  assert.equal(late.healed.defeatedAt, 6);
});

test('regeneration offsets damage between hits even when the defender rejects direct heals', () => {
  const defender: Defense = { hp: 500, def: 0, res: 25, dp: 18, blocksDirectHealing: true };
  const skadi = { build: createBuild('skadi2', 1), delay: 0 };
  const haruka = { build: createBuild('haruka', 2), delay: 0 };
  const attack = { atk: 600, interval: 2, type: 'Arts' } as const;
  const result = simulateSurvival(attack, defender, [skadi, haruka], 15);
  near(hpAt(result.healed.points, 3), 138.616);
  near(hpAt(result.alone.points, 3), 50);
  assert.deepEqual(result.healed, simulateSurvival(attack, defender, [skadi], 15).healed);
  assert.equal(result.healed.defeatedAt, 4);
});

test('Faust replaces a basic shot after cooldown and Corrupted Knight pauses attacks to charge', () => {
  const defender: Defense = { hp: 4000, def: 500, res: 0, dp: 18, blocksDirectHealing: false };
  const attack = { atk: 1000, interval: 5, type: 'Physical' } as const;
  const bolt = simulateSurvival({ ...attack, abilities: [{
    name: 'Special bolt', type: 'Physical', scale: 2, firstReady: 17, cooldown: 17, delay: 0, mode: 'next-hit',
  }] }, defender, [], 45);
  assert.deepEqual(bolt.abilityHits.map(hit => hit.time), [20, 40]);
  assert.equal(hpAt(bolt.alone.points, 20), 1000);
  const charge = simulateSurvival({ ...attack, interval: 4, abilities: [{
    name: 'Charged attack', type: 'Physical', scale: 3, firstReady: 22, cooldown: 22, delay: 4, mode: 'charge',
  }] }, { ...defender, hp: 6000 }, [], 30);
  assert.equal(hpAt(charge.alone.points, 24), 3500);
  assert.equal(hpAt(charge.alone.points, 26), 1000);
});

test('defender skills change mitigation, HP cap and self-healing within their active window', () => {
  const defender: Defense = { hp: 1000, def: 100, res: 25, dp: 18, blocksDirectHealing: false };
  const cold = simulateSurvival({ atk: 400, interval: 5, type: 'Arts' }, defender, [], 15, {
    name: 'Cold Resistance', hp: 0.5, res: 1, duration: 5, start: 6,
  });
  near(hpAt(cold.alone.points, 6), 1050);
  near(hpAt(cold.alone.points, 10), 850);
  near(hpAt(cold.alone.points, 11), 850 / 1.5);
  assert.equal(cold.peakHp, 1500);
  assert.equal(cold.finalMaxHp, 1000);
  const shell = simulateSurvival({ atk: 200, interval: 4, type: 'Physical' }, defender, [], 12, {
    name: 'Shell Defense', def: 1.3, regenerationRatio: 0.03, duration: 8, start: 0,
  });
  near(hpAt(shell.alone.points, 4), 990);
  near(hpAt(shell.alone.points, 5), 1000);
  near(hpAt(shell.alone.points, 8), 900);
});

const patriot: PatriotStances = {
  marchingAtk: 2720, ruinationAtk: 1920, ruinationInterval: 3.6,
  revival: { atk: 1920, duration: 60, interval: 0.8 },
  aura: { name: 'True damage aura', type: 'True', mode: 'aura', scale: 0.0521, firstReady: 0.8, cooldown: 0.8, delay: 0 },
  spear: { name: 'Spear throw', type: 'Physical', mode: 'separate', scale: 1.35, firstReady: 15, cooldown: 20, delay: 3 },
};

test('Patriot mitigates each Marching hit and uses the Ruination attack pattern selected by position', () => {
  const defense: Defense = { hp: 12000, def: 500, res: 60, dp: 20, blocksDirectHealing: false };
  const marching = simulateSurvival(patriotAttack(patriot, 4, 'marching', 'melee'), defense, [], 30);
  assert.equal(marching.basicHits, 4);
  near(hpAt(marching.alone.points, 4), 12000 - 4 * (2720 - 500));
  const melee = simulateSurvival(patriotAttack(patriot, 4, 'ruination', 'melee'), defense, [], 30);
  near(hpAt(melee.alone.points, 3.6), 12000 - 4 * 1920 * 0.0521 - (1920 - 500));
  const spear = simulateSurvival(patriotAttack(patriot, 4, 'ruination', 'spear'), defense, [], 45);
  assert.deepEqual(spear.abilityHits.map(hit => hit.time), [18, 38]);
  assert.equal(hpAt(spear.alone.points, 17.9), 12000);
  near(hpAt(spear.alone.points, 18), 12000 - (1920 * 1.35 - 500));
  const combined = simulateSurvival(patriotAttack(patriot, 4, 'ruination', 'spear-aura'), defense, [], 30);
  near(hpAt(combined.alone.points, 18), hpAt(spear.alone.points, 18) - 22 * 1920 * 0.0521);
});

test('Patriot’s full fight preserves HP and casts across phases and carries the aura clock through revival', () => {
  const defender: Defense = { hp: 25000, def: 500, res: 60, dp: 20, blocksDirectHealing: false };
  const haruka = { build: createBuild('haruka', 1), delay: 0, cycle: true };
  const result = simulateSurvival(patriotFight(patriot, 4, 'spear-aura', 8), defender, [haruka], 100);
  assert.deepEqual(result.enemyPhases, [{ name: 'Marching', start: 0 }, { name: 'Revival', start: 8 }, { name: 'Ruination', start: 68 }]);
  const hp = (time: number) => hpAt(result.alone.points, time);
  near(hp(8), 25000 - 4 * (2720 - 500));
  const aura = 1920 * 0.0521;
  near(hp(8) - hp(8.8), aura);
  near(hp(67.9) - hp(68), aura);
  near(hp(68) - hp(68.8), aura);
  near(hp(85.9) - hp(86), 1920 * 1.35 - 500);
  assert.deepEqual(result.abilityHits.map(hit => hit.time), [86]);
  assert.deepEqual(result.healerCycles[0].casts, [{ start: 17, end: 43 }, { start: 60, end: null }]);
  assert.ok(hpAt(result.healed.points, 68) > hp(68));

  const distant = simulateSurvival(patriotFight(patriot, 4, 'spear', 8), defender, [], 100);
  near(hpAt(distant.alone.points, 85.9), hp(8));
  assert.equal(distant.aura, null);
});

test('Haruka deployment timing charges twice and uses the weaker heal on her finite first cast', () => {
  const defense: Defense = { hp: 10000, def: 0, res: 0, dp: 20, blocksDirectHealing: false };
  const attack = { atk: 200, interval: 2, type: 'Physical' } as const;
  const result = simulateSurvival(attack, defense, [{ build: createBuild('haruka', 1), delay: 0, cycle: true }], 90);
  assert.deepEqual(result.healerCycles[0].casts, [{ start: 17, end: 43 }, { start: 60, end: null }]);
  const hp = (time: number) => hpAt(result.healed.points, time);
  near(hp(18.6) - hp(18.59), 401.25);
  near(hp(44) - hp(43), -200);
  near(hp(61.6) - hp(61.59), 561.75);
});

test('SP cycles honor Sussurro’s two-use limit and resume defender skills after their cooldown', () => {
  const defense: Defense = { hp: 10000, def: 100, res: 0, dp: 20, blocksDirectHealing: false };
  const attack = { atk: 200, interval: 2, type: 'Physical' } as const;
  const result = simulateSurvival(attack, defense, [{ build: createBuild('susuro', 1), delay: 0, cycle: true }], 120, {
    name: 'DEF Up', def: 0.5, duration: 10, start: 0, sp: { cost: 15, initial: 5 }, cycle: true,
  });
  assert.deepEqual(result.healerCycles[0].casts.map(cast => cast.start), [15, 60]);
  assert.deepEqual(result.defenderWindows.slice(0, 3), [{ start: 10, end: 20 }, { start: 35, end: 45 }, { start: 60, end: 70 }]);
  near(hpAt(result.alone.points, 8) - hpAt(result.alone.points, 10), 50);
  near(hpAt(result.alone.points, 18) - hpAt(result.alone.points, 20), 100);
});
test('damage labels identify the modeled unit, including multi-hit and one-off sources', () => {
  const hit = (operator: string, skill: number, extra: { plotSummon?: boolean } = {}) =>
    calculate({ ...createBuild(operator, 1), skill, ...extra }, initialTarget);
  assert.equal(damageBasis(hit('angel', 3)), 'per volley');
  assert.equal(damageBasis(hit('chen', 2)), 'per cast');
  assert.equal(damageBasis(hit('doroth', 1)), 'per trigger');
  assert.equal(damageBasis(hit('phatm2', 2, { plotSummon: true })), 'per tick');
  assert.equal(damageBasis(hit('phatm2', 1)), 'per attack (cycle average)');
  assert.equal(damageBasis(hit('chen', 0)), 'per attack', 'both hits belong to one normal attack');
  assert.equal(dpsLabel([{ skill: 3 }]), 'Skill DPS');
  assert.equal(dpsLabel([{ skill: 0 }]), 'Attack DPS');
  assert.equal(dpsLabel([{ skill: 3 }, { skill: 0 }]), 'DPS');
});

test('target inputs and chart defaults follow the selected skill and its damage', () => {
  const skadi = createBuild('skadi', 1);
  const amiya = createBuild('amiya', 2);
  const arts = { ...amiya, skill: 1 };
  const physical = chartControls([skadi], initialTarget, 'seconds');
  assert.deepEqual(physical.axes, ['def']);
  assert.deepEqual(physical.metrics, ['dps', 'damage']);
  assert.equal(physical.metric, 'dps');
  assert.equal(physical.burstTimeline, false);
  assert.deepEqual([...targetControls([skadi]).defenses], ['def']);
  assert.deepEqual(chartControls([arts], initialTarget).axes, ['res']);
  assert.deepEqual(chartControls([amiya], initialTarget).axes, [], 'True damage has no resistance curve');

  const chen = { ...createBuild('chen', 3), skill: 2 };
  assert.deepEqual(chartControls([chen], initialTarget).axes, ['def', 'res'], 'equal damage prefers DEF');
  assert.deepEqual(chartControls([chen, arts], initialTarget).axes, ['res', 'def'], 'Arts leads with Amiya');
  assert.deepEqual(chartControls([chen, skadi], { ...initialTarget, def: 3000 }).axes, ['def', 'res'],
    'target edits do not reorder a mixed comparison');
});

test('elemental buildup and elemental HP damage expose their own controls', () => {
  const virtuosa = createBuild('cello', 1);
  const charts = chartControls([virtuosa], initialTarget);
  assert.deepEqual(charts.axes, ['injuryRes']);
  assert.equal(charts.defaultMetric, 'seconds');
  assert.equal(charts.burstTimeline, true);
  assert.deepEqual(targetControls([virtuosa]).bursts, ['Necrosis']);
  assert.ok(targetControls([virtuosa]).defenses.has('elementalRes'), 'applies to fallout');
  const dia = { ...createBuild('kaitou', 2), skill: 1 };
  assert.deepEqual(chartControls([dia], initialTarget, 'injury').axes, ['injuryRes', 'res']);
  const nymph = { ...createBuild('nymph', 3), skill: 3 };
  assert.deepEqual(chartControls([nymph], { ...initialTarget, burst: 'Necrosis' }).axes, ['elementalRes']);
});

test('DEF, Arts RES, elemental RES and injury resistance mitigate independently', () => {
  const wall = { ...dummy, def: 10000, res: 99, elementalRes: 45, injuryRes: 100 };
  assert.equal(mitigate(200, 'Physical', wall), 10);
  assert.equal(mitigate(200, 'Arts', wall), 10);
  near(mitigate(200, 'Elemental', wall), 110);
  assert.equal(mitigate(200, 'True', wall), 200);
  const b = createBuild('phatm2', 1);
  near(calculate(b, wall).injury, calculate(b, dummy).injury * 0.05);
  assert.equal(calculate(b, { ...wall, burst: 'Burn' }).injury, 0);
});

test('Haruka S2 compares first and later healing activations per ally', () => {
  const b = createBuild('haruka', 1);
  const first = calculate({ ...b, firstHealingCast: true }, dummy);
  const later = calculate(b, dummy);
  assert.equal(b.skill, 2);
  near(first.healing!.direct!.amount, 401.25);
  near(first.hps!, 250.78125);
  near(later.healing!.direct!.amount, 561.75);
  near(later.healing!.conditional!.amount, 187.25);
  near(later.hps!, 351.09375);
  assert.equal(later.healing!.direct!.targets, 2);
  assert.equal(calculate({ ...b, stage: 3 }, dummy).healing!.direct!.targets, 3);
  assert.equal(later.dps, null);
  assert.equal(later.damage, 0);
  const normal = calculate({ ...b, skill: 0 }, dummy);
  assert.ok(normal.components.Arts > 0);
  assert.equal(normal.hps, null);
  near(normal.healing!.conditional!.amount, 133.75);
  const setup = chartControls([b], dummy);
  assert.equal(setup.defaultMetric, 'hps');
  assert.deepEqual(setup.metrics, ['hps']);
  assert.deepEqual(setup.axes, []);
  assert.equal(targetControls([b]).defenses.size, 0);
  const mixed = chartControls([b, createBuild('skadi', 2)], dummy, 'hps');
  assert.equal(mixed.metric, 'hps');
  assert.ok(mixed.metrics.includes('dps'));
  assert.deepEqual(mixed.axes, []);
});

test('Skadi uses her own ATK for regeneration and switches to True damage on S3', () => {
  const b = createBuild('skadi2', 1);
  near(calculate({ ...b, skill: 0 }, dummy).hps!, 44.308);
  near(calculate({ ...b, skill: 1 }, dummy).hps!, 354.464);
  near(calculate(b, dummy).hps!, 88.616);
  near(calculate({ ...b, abyssalAlly: true }, dummy).hps!, 96.14);
  near(calculate({ ...b, stage: 3, alternateModule: true }, dummy).hps!, 97.664);
  const damage = calculate({ ...b, skill: 3 }, dummy);
  assert.equal(damage.hps, null);
  near(damage.dps!, 310.156);
  near(damage.components.True, damage.dps!);
});

test('direct-healing Medics account for cadence, target count and regeneration', () => {
  const sussurro = createBuild('susuro', 1);
  const s = calculate(sussurro, dummy);
  near(s.healing!.direct!.amount, 1096);
  assert.equal(s.healing!.direct!.targets, 1);
  near(s.hps!, 1096 / (43 / 30));
  const lowCostAlly = calculate({ ...sussurro, lowCostHealingTarget: true }, dummy);
  near(lowCostAlly.hps!, s.hps! * 1.2);
  const ptilopsis = createBuild('plosis', 2);
  const p = calculate(ptilopsis, dummy);
  near(p.healing!.direct!.amount, 390);
  assert.equal(p.healing!.direct!.targets, 3);
  assert.ok(p.hps! > calculate({ ...ptilopsis, skill: 0 }, dummy).hps!);
  const perfumer = calculate(createBuild('flower', 3), dummy);
  assert.ok(perfumer.healing!.regeneration > 0);
  near(perfumer.hps!, perfumer.healing!.direct!.amount / perfumer.attackInterval + perfumer.healing!.regeneration);
});
test('Tragodia S2 matches P1 level and module breakpoints from both reference builds', () => {
  const before = { ...createBuild('phatm2', 1), level: 60 },
    after = { ...before, level: 90, stage: 3 };
  const r = calculate(before, dummy),
    z = calculate(after, dummy);
  assert.equal(r.base, 503);
  assert.equal(z.base, 572);
  near(r.summon!.injury, 1509);
  near(z.summon!.injury, 2024.88);
  near(calculate(after, { ...dummy, tier: 'Grunt' }).summon!.injury, 1716);
  assert.equal(firstBurst(before, dummy).count, null);
  assert.equal(firstBurst(after, dummy).count, 12);
  const p6 = calculate({ ...after, potential: 6, stage: 0 }, dummy);
  near(p6.summon!.damage, 9954);
  near(p6.dps!, 553 / 1.2);
  const s1 = calculate({ ...after, stage: 0, potential: 6, skill: 1 }, dummy);
  near(s1.empowered!.damagePerHit, 829.5);
  near(s1.empowered!.injuryPerHit, 328.482);
});
test('Tragodia S1 opens with a double hit and RIT-X increases injury against elites and bosses', () => {
  const build = { ...createBuild('phatm2', 1), skill: 1 };
  const grunt = { ...dummy, tier: 'Grunt' as const }, elite = { ...dummy, tier: 'Elite' as const };
  assert.equal(firstBurst(build, grunt).count, firstBurst(build, elite).count);
  const equipped = { ...build, stage: 3 };
  near(calculate(equipped, elite).injury, calculate(equipped, grunt).injury * 1.18);
  for (const [target, actions, seconds] of [[grunt, 3, 3.2], [elite, 2, 1.6], [dummy, 4, 4.8]] as const) {
    const result = firstBurst(equipped, target);
    assert.equal(result.count, actions);
    near(result.seconds!, seconds);
  }
});
test('elemental HP and damage-derived injury occur in different target states', () => {
  const dia = { ...createBuild('kaitou', 1), skill: 1 };
  const fresh = calculate(dia, { ...dummy, res: 50 }),
    burst = calculate(dia, { ...dummy, res: 50, burst: 'Necrosis' });
  near(fresh.injury, fresh.components.Arts * 0.15);
  assert.equal(fresh.components.Elemental, 0);
  assert.ok(burst.components.Elemental > 0);
  assert.equal(burst.injury, 0);
  assert.equal(fallout('Necrosis', dummy)?.count, 15);
});
test('a one-use trap has per-trigger damage and no implied continuous DPS', () => {
  const r = calculate({ ...createBuild('doroth', 1), skill: 1 }, { ...dummy, def: 500 });
  near(r.damage, r.atk * 4.5 - 325);
  assert.equal(r.dps, null);
  const ling = calculate(createBuild('ling', 1), dummy);
  near(ling.damage, ling.atk * 0.2);
  near(ling.interval!, 0.5);
});
test('deployment casts read the marked ally at each strike and respect available SP', () => {
  const owner = createBuild('svash2', 1),
    skadi = createBuild('skadi', 2),
    ulpia = createBuild('ulpia', 3),
    phantom = createBuild('phatom', 4);
  const first = deploymentSequence(owner, skadi, dummy, 2, 1);
  assert.deepEqual(
    first.slice(-2).map((e) => e.time),
    [1, 1.4],
  );
  near(first.at(-1)!.damage, calculate(skadi, dummy).atk * 3.8);
  const split = deploymentSequence(owner, ulpia, dummy, 2, 1.1);
  near(split.find((e) => e.time === 1)!.atk, calculate({ ...ulpia, skill: 0 }, dummy).atk);
  near(split.at(-1)!.atk, calculate(ulpia, dummy).atk);
  const early = deploymentSequence(owner, { ...ulpia, rank: 1 }, dummy, 2, 0);
  assert.ok(early.find((e) => e.label === 'Ally skill active')!.time > 1.4);
  assert.equal(phantom.skill, 2);
  const normal = calculate({ ...phantom, skill: 0 }, dummy);
  const full = deploymentSequence(owner, phantom, dummy, 2, 0);
  near(full.at(-1)!.atk, normal.base * 3);
  const spent = deploymentSequence(owner, phantom, dummy, 2, 0, 1.1);
  near(spent.at(-2)!.atk, normal.base * 3);
  near(spent.at(-1)!.atk, normal.base * 2.8);
  assert.equal(spent.some(e => e.label === 'Night Raid hit'), false);
  const night = deploymentSequence(owner, { ...phantom, skill: 3 }, dummy, 1, 5);
  near(night[1].damage, night[0].atk * 3);
  near(night[2].damage, night[0].atk * 3.8);
});
test('supported ranks, operators, modules and target states return finite numbers', () => {
  for (const p of profiles)
    for (const skill of p.skills.length ? p.skills : [{ slot: 0, ranks: [{}], elite: 0 }]) {
      for (let rank = 1; rank <= skill.ranks.length; rank++)
        for (const stage of [0, 3])
          for (const burst of ['None', elements[p.id] ?? 'Burn']) {
            const b = normalize({ ...createBuild(p.id, 1), skill: skill.slot, rank, stage });
            const r = calculate(b, { ...dummy, burst });
            for (const n of [r.damage, r.injury, r.dps, r.hps, r.injuryRate, r.summon?.damage, r.summon?.injury])
              assert.ok(
                n == null || (Number.isFinite(n) && n >= 0),
                p.id + ' S' + skill.slot + ' Lv' + rank + ' module ' + stage,
              );
          }
    }
  assert.deepEqual(
    normalize({ ...createBuild('phatm2', 1), elite: 0, level: 90, stage: 3, skill: 3, rank: 10 }),
    { ...createBuild('phatm2', 1), elite: 0, level: 50, stage: 0, skill: 0, rank: 4 },
  );
});
test('every audited elemental owner exposes an offensive elemental source', () => {
  assert.equal(Object.keys(elements).length, 27);
  for (const [operator, element] of Object.entries(elements)) {
    const b = createBuild(operator, 1),
      p = profiles.find((op) => op.id === operator)!;
    const sources = [0, ...p.skills.map((skill) => skill.slot)].flatMap((skill) =>
      ['None', element].map((burst) =>
        calculate({ ...b, skill, stage: p.module ? 3 : 0 }, { ...dummy, burst }),
      ),
    );
    assert.ok(
      sources.some((r) => r.injury > 0 || r.components.Elemental > 0 || r.effects.some((e) => e.amount > 0)),
      p.name,
    );
  }
});
test('CN Rampage, conversion attacks and manual activation distinguish source states', () => {
  const c = createBuild('caledo', 1);
  assert.ok(calculate(c, dummy).injury > 0);
  const n = { ...createBuild('nymph', 1), skill: 3 };
  const arts = calculate(n, dummy),
    element = calculate(n, { ...dummy, burst: 'Necrosis' });
  near(arts.components.Arts, element.components.Elemental);
  assert.equal(element.components.Arts, 0);
  const grace = { ...createBuild('graceb', 2), skill: 2 };
  const converted = calculate(grace, { ...dummy, burst: 'Nervous Impairment', def: 2500 });
  near(converted.components.Elemental, converted.atk * 7.5);
  assert.equal(converted.dps, null);
  const deep = calculate(createBuild('deepcl', 3), dummy);
  assert.ok(deep.sourceAtk > 0 && deep.sourceAtk !== deep.atk);
  near(deep.damage, deep.sourceAtk);
});

test('Tragodia’s summon can be plotted independently over its six active seconds', () => {
  const b = { ...createBuild('phatm2', 1), plotSummon: true };
  const tick = calculate(b, dummy);
  near(tick.interval!, 0.5);
  near(tick.damage * 12, tick.summon!.damage);
  near(tick.injury * 12, tick.summon!.injury);
  assert.equal(tick.splash, 0);
});
test('Skadi’s blocked-target module modifies her hits while the ally strike reads her ATK', () => {
  const skadi = { ...createBuild('skadi', 1), stage: 3, alternateModule: true };
  const blocked = { ...skadi, traitActive: true };
  const open = calculate(skadi, dummy),
    closed = calculate(blocked, dummy);
  near(closed.atk, open.atk);
  near(closed.damage, open.damage * 1.15);
  near(deploymentSequence(createBuild('svash2', 2), blocked, dummy, 1, 0).at(-1)!.damage, closed.atk * 3.8);
});
test('Frost S2 only contributes the three follow-up shots inside operator range', () => {
  const b = createBuild('rfrost', 1),
    target = { ...dummy, def: 290 };
  const trap = calculate(b, target),
    volley = calculate({ ...b, trapInRange: true }, target);
  near(volley.damage - trap.damage, 3 * mitigate(trap.atk * 1.8, 'Physical', target));
  assert.equal(volley.interval, null);
});

test('archived enemy targets use the combat rank and inherit per-level defenses', async () => {
  const { enemyTargets } = await import('../../lib/dps/enemyTargets');
  const enemies = enemyTargets();
  const levels = (id: string) => enemies.find((e) => e.id === id)!.levels;
  assert.deepEqual(
    levels('enemy_1502_crowns').map((l) => [l.def, l.res, l.tier]),
    [
      [120, 50, 'Boss'],
      [150, 50, 'Boss'],
      [250, 50, 'Boss'],
    ],
  );
  assert.equal(levels('enemy_2093_skzams')[0].tier, 'Boss');
  const colossus = levels('enemy_10078_mprein_2')[0];
  assert.deepEqual([colossus.tier, colossus.injuryRes, colossus.elementalRes], ['Elite', 10, 0]);
  assert.equal(new Set(enemies.map((e) => e.id)).size, enemies.length);

  const defenses = (level: number, id: string) => levels(id).find(row => row.level === level)!.forms
    ?.map(form => [form.name, form.def, form.res]);
  for (const level of [0, 1]) {
    assert.deepEqual(defenses(level, 'enemy_1506_patrt'), [['Marching', 2100, 90], ['Ruination', 700, 45]]);
  }
  assert.deepEqual(defenses(0, 'enemy_1533_stmkgt'), [['First form', 2000, 40], ['Second form', 500, 0]]);
  assert.deepEqual(defenses(1, 'enemy_1533_stmkgt'), [['First form', 2400, 40], ['Second form', 400, 0]]);
  assert.deepEqual(defenses(0, 'enemy_1165_duhond'), [['Refraction active', 0, 70], ['Silenced', 0, 0]]);
  assert.deepEqual(defenses(0, 'enemy_1172_dugago')?.slice(0, 3), [
    ['Ground', 550, 70], ['Statue', 1350, 100], ['Flying', 550, 70],
  ]);
  assert.deepEqual(defenses(0, 'enemy_1353_esabr'), [['Normal', 100, 0], ['Overload', 300, 30]]);
  assert.deepEqual(defenses(0, 'enemy_1372_ltntpt'), [['Melancholic variation', 200, 15], ['Passionate variation', 100, 15]]);
  assert.deepEqual(defenses(0, 'enemy_1509_mousek'), [['Barrier active', 3350, 30], ['Barrier broken', 350, 30]]);
  assert.deepEqual(defenses(0, 'enemy_1530_white'), [['First form', 1200, 70], ['Second form', 400, 20]]);
  assert.deepEqual(defenses(1, 'enemy_1554_lrtsia'), [['First form', 500, 80], ['Second form', 2500, 40]]);
  assert.equal(levels('enemy_1528_manfri')[0].forms, undefined);
  assert.match(levels('enemy_1528_manfri')[0].defenseNote ?? '', /Only base defenses/);
  for (const row of enemies.flatMap(enemy => enemy.levels)) {
    assert.ok([row.def, row.res, row.elementalRes, row.injuryRes].every(Number.isFinite));
    if (!row.forms) continue;
    assert.equal(new Set(row.forms.map(form => form.id)).size, row.forms.length);
    assert.ok(row.forms.every(form => Number.isFinite(form.def) && Number.isFinite(form.res)));
  }
});

test('a periodic source restarts on the first eligible contact after fallout', () => {
  const build = { ...createBuild('yu', 1), skill: 0 };
  const t = { ...dummy, tier: 'Grunt' as const };
  const perHit = calculate(build, t).injury;
  const r = firstBurst(build, { ...t, thresholdOverride: perHit * 3 });
  assert.equal(r.count, 3);
  assert.equal(r.seconds, 2);
  assert.equal(r.recovery, 10);
  assert.equal(r.repeat, 12);
  assert.equal(firstBurst(build, { ...t, thresholdOverride: perHit }).seconds, 0);
});

test('Tragodia S3 resets the mark on burst and reapplies it after accelerated recovery', () => {
  const build = { ...createBuild('phatm2', 1), skill: 3 };
  const r = firstBurst(build, dummy);
  near(r.seconds!, 5); // The fifth second's independent tick reaches the boss threshold.
  near(r.recovery!, 10 / 1.5);
  near(r.repeat!, 12.8);
  const s1 = firstBurst({ ...build, skill: 1 }, dummy);
  near(s1.recovery!, 10);
  near(s1.seconds!, 8);
  const summon = firstBurst({ ...build, skill: 2, stage: 3 }, dummy, 'summon');
  near(summon.seconds!, 5.5);
  assert.equal(summon.repeat, null);
  assert.equal(summon.limited, true);
});

test('Corrosion recovery handles both faster recovery and physical hit cooldown reductions', () => {
  const thumpy = { ...createBuild('thumpy', 1), skill: 0 };
  const r = firstBurst(thumpy, dummy);
  near(r.recovery!, 5);
  assert.ok(firstBurst({ ...thumpy, potential: 3 }, dummy).recovery! < r.recovery!);
  const botany = firstBurst({ ...createBuild('botany', 2), skill: 2 }, dummy);
  near(botany.recovery!, 8 / 1.25);
  near(botany.repeat!, 16.5);
});

test('externally triggered injury returns a count without inventing an action interval', () => {
  const r = firstBurst({ ...createBuild('yu', 1), skill: 1 }, dummy);
  assert.ok(r.count! > 1);
  assert.equal(r.seconds, null);
  assert.equal(r.repeat, null);
});

test('burn fields scale injury with Arts damage dealt and Botani S1 uses its opening bonus once', () => {
  const blaze = { ...createBuild('blaze2', 1), skill: 1 };
  near(calculate(blaze, { ...dummy, res: 50 }).injury, calculate(blaze, dummy).injury / 2);
  const botani = { ...createBuild('botany', 1), skill: 1 };
  const injury = calculate(botani, dummy).injury;
  assert.equal(firstBurst(botani, { ...dummy, thresholdOverride: 2 * injury }).count, 3);
  const thumpy = { ...createBuild('thumpy', 1), skill: 0, stage: 3 };
  near(calculate(thumpy, dummy, 1).atk - calculate(thumpy, dummy).atk, 5);
});

test('normal attacks from casters, ritualists and summoners respect RES', () => {
  for (const id of ['warmy', 'nymph', 'ebnhlz', 'threye', 'ling', 'deepcl']) {
    const build = { ...createBuild(id, 1), skill: 0, stage: 0 };
    const r = calculate(build, { ...dummy, def: 9999, res: 40 });
    near(r.components.Arts, r.atk * 0.6);
    assert.equal(r.components.Physical, 0);
  }
});

test('Exusiai mitigates every shot independently and uses the equipped module on aerial targets', () => {
  const build = createBuild('angel', 1);
  const wall = { ...dummy, def: 10000 };
  for (const [skill, shots, scale] of [[0, 1, 1], [1, 3, 1.45], [2, 4, 1.25], [3, 5, 1.1]]) {
    const r = calculate({ ...build, skill }, wall);
    near(r.damage, shots * r.atk * scale * .05);
    if (skill === 1) assert.equal(r.dps, null);
  }
  const equipped = { ...build, stage: 3 };
  const grounded = calculate(equipped, dummy);
  near(calculate({ ...equipped, traitActive: true }, dummy).damage, grounded.damage * 1.1);
  const normal = calculate({ ...build, skill: 0 }, dummy);
  assert.ok(calculate(build, dummy).interval! < normal.interval!);
});

test('Exusiai alternate module applies ground ASPD and staged DEF ignore independently', () => {
  const b = { ...createBuild('angel', 1), stage: 3, alternateModule: true };
  const t = { ...dummy, def: 400 };
  const r = calculate(b, t);
  near(calculate({ ...b, penetrationStacks: 25 }, t).damage - r.damage, 250 * 5);
  near(calculate({ ...b, stage: 2, penetrationStacks: 25 }, t).damage -
    calculate({ ...b, stage: 2 }, t).damage, 150 * 5);
  const ground = calculate({ ...b, traitActive: true }, t);
  near(ground.damage, r.damage);
  assert.ok(ground.interval! < r.interval!);
});

test('Ch’en splits Unsheath into independently mitigated packets and amplifies skill damage after defense', () => {
  const b = {...createBuild('chen', 1), skill: 2, stage: 3};
  const r = calculate(b, {...dummy, def: 600, res: 75});
  near(r.components.Arts, 5 * r.atk * .25 * 1.1);
  near(r.components.Physical, (5 * r.atk - 600) * 1.1);
  near(calculate({...b, skill: 0}, dummy).damage, r.atk * 2);
  near(calculate({...b, skill: 3}, dummy).damage, r.atk * 3.2 * 10 * 1.1);
});
test('Virtuosa stacks the skill with her aura and amplifies only the bonus portion of Mental Inversion on S3', () => {
  const b = {...createBuild('cello', 1), stage: 3};
  const s3 = calculate(b, dummy);
  near(s3.damage, 0);
  near(s3.injury, s3.atk * .1 * (1 + .33 * 2.5) * 1.18);
  for (const skill of [1,2,3]) {
    const r = firstBurst({...b, skill}, dummy);
    assert.ok(r.seconds !== null && r.seconds >= 0);
    if (skill !== 2) assert.ok(r.repeat !== null && r.repeat >= 15);
  }
  const s2 = calculate({...b,skill:2}, dummy);
  near(s2.periodic, s2.atk * .1 * 1.33 * 1.18);
  near(s2.injury, s2.atk * .25 * 1.33 * 1.18);
  near(calculate({...b,skill:1}, {...dummy,burst:'Necrosis'}).damage,0);
});
