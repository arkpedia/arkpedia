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
const profiles = archive.operators as unknown as Profile[];
const createBuild = (id: string, number: number) =>
  buildFromProfile(profiles.find((p) => p.id === id)!, number);
const dummy = { ...initialTarget, def: 0, res: 0 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.00001, a + ' vs ' + b);
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
  const night = deploymentSequence(owner, phantom, dummy, 1, 5);
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
            for (const n of [r.damage, r.injury, r.dps, r.injuryRate, r.summon?.damage, r.summon?.injury])
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
