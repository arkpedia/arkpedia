import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAutoTechniqueMatches, detectAutoTechniques, mergeTechniques, skillTechniques, talentTechniques } from '../../lib/techniques/autoTechniques';
import { getAllOperators } from '../../lib/operators/operators';
import { getSkillList } from '../../lib/operators/operatorTypes';
import { buildTechniqueGroups } from '../../lib/techniques/buildTechniqueGroups';

/*
 * The Techniques page against the game's own wording (2026-10-03 sweep,
 * scripts/audits/audit-techniques-vs-gamedata.ts). Each line here is quoted from the EN game
 * tables. Reveal Invisibility was only ever hand-written on nine operators' records and no
 * rule found it, so the Sentry Protectors' SPT-X ("Reveals Invisible enemies within range")
 * and Totter went unlisted; it never read traits, so the Decel Binders'
 * Slow and the Hunters' Ammo were only credited where a skill happened to say so; and
 * "slowly" counted as the Slow status.
 */
const rules = (text: string, name = 'Someone') => detectAutoTechniqueMatches(6, [text], name, null, null).map((m) => m.name);

test('every way the game says an operator takes Invisibility away is Reveal Invisibility', () => {
  for (const text of [
    'Reveals Invisible enemies within range',
    'Grants 30% Physical and Arts Dodge to allies within Attack Range, and reveals Invisible enemies',
    'Buggy Cams will reveal Invisible enemies within the surrounding 8 tiles',
    'Enemies within Attack Range lose Invisibility and have -30% Movement Speed;',
    'Deals 200% ATK as Physical damage to 6 enemies in front, inflicts Cold on them and removes their Invisibility for 5 seconds;',
    'Immediately nullifies the Invisibility of enemies around for 10s and switches to a',
    'an illuminated zone is created for 10 seconds, disabling enemy Invisibility',
    'Can attack Invisible enemies.',
  ]) assert.ok(rules(text).includes('Reveal Invisibility'), text);
});

test("an operator's own Invisibility or Camouflage is not Reveal Invisibility", () => {
  for (const text of [
    'Stays Invisible normally. The first attack made gains +25% ATK and removes Invisibility. Regains Invisible state after not attacking for 6 seconds',
    'Drones gain Invisibility for 12 seconds after deployment (cannot be targeted by enemy ranged attacks)',
    'When skill is active, Block becomes 0 and gain Camouflage',
    'Attack range expands, gains +60% ATK and Invisibility',
  ]) assert.ok(!rules(text).includes('Reveal Invisibility'), text);
});

test('"slowly" is not the Slow status, and Slows is', () => {
  assert.ok(!rules('Attacks consume Ammo to increase ATK to 120% ; While not attacking, Ammo will be slowly reloaded (max capacity 4)').includes('Slow'));
  assert.ok(rules('Deals Arts damage and Slows the target for a short time').includes('Slow'));
});

test('Arts Damage Taken requires an increase in damage received by enemies', () => {
  for (const text of [
    'The Arts damage taken by nearby enemies +55% and their Movement Speed -60%',
    'Attacks inflict RES -10 and Arts damage taken +165 (+15) on targets for 5s.',
    'Increases the Arts damage taken by all blocked enemies by 18% (+3%) when deployed',
    'When deployed, all blocked enemies take +23% Arts damage',
  ]) assert.ok(rules(text).includes('Arts Damage Taken'), text);

  for (const text of [
    'Enemies take 75% ATK as Arts damage per second.',
    'While being pulled, enemies take Arts damage proportional to the distance traveled.',
    'When the target takes Arts damage, it takes an additional hit.',
    'This unit takes +20% Arts damage.',
    'Increases the Arts damage taken by nearby allies by 20%.',
    'Physical and Arts damage taken from units in front is reduced by 35%.',
    'Chained enemies deal 25% of the Arts damage taken to other chained enemies as extra damage.',
    'Inflicts 20% Arts Fragility on enemies.',
  ]) assert.ok(!rules(text).includes('Arts Damage Taken'), text);
});

test('the technique index keeps verified amplification sources and lists Esperanta under Repositioning', () => {
  const groups = buildTechniqueGroups();
  const artsDamageTaken = groups.find(group => group.name === 'Arts Damage Taken')!;
  for (const name of ['Saria', 'Logos', 'Skyfire']) {
    assert.ok(artsDamageTaken.entries.some(entry => entry.operatorName === name), name);
  }
  for (const name of ['Tin Man', 'Clementia', 'Astgenne the Lightchaser']) {
    assert.ok(!artsDamageTaken.entries.some(entry => entry.operatorName === name), name);
  }

  const esperanta = getAllOperators().find(operator => operator.internalName === 'char_1052_kalts2')!;
  const skill = getSkillList(esperanta)[2];
  assert.ok(skillTechniques(esperanta, skill).some(technique => technique.name === 'Repositioning'));
  const repositioning = groups.find(group => group.name === 'Repositioning')!;
  const entry = repositioning.entries.find(entry => entry.operatorName === esperanta.name);
  assert.ok(entry, "Esperanta is listed under Repositioning");
  assert.equal(entry.badges.length, 1);
  assert.equal(entry.badges[0].skillNumber, 3);
  assert.equal(entry.badges[0].label, skill.name);
  assert.ok(repositioning.entries.some(entry => entry.operatorName === 'Exusiai the New Covenant'));
});

test('the page lists module traits and operator traits, without crediting what a trait does for others', () => {
  const groups = buildTechniqueGroups();
  const members = (name: string) => new Set(groups.find((g) => g.name === name)?.entries.map((e) => e.operatorName) ?? []);
  const reveal = members('Reveal Invisibility');
  for (const op of ['Liskarm', 'Blitz', 'Underflow', 'SilverAsh', 'Tsukinogi', 'Totter']) assert.ok(reveal.has(op), `${op} reveals Invisible enemies`);
  assert.ok(!reveal.has('Manticore'), 'Manticore\'s Invisibility is her own');
  // A Hunter's Ammo is its basic attack's, not a skill with a set number of uses: neither its
  // trait nor its HUN modules make it an Ammo-based Skill.
  const ammo = members('Ammo-based Skills');
  for (const op of ['Ray', 'Coldshot', 'Snow Hunter']) assert.ok(!ammo.has(op), `${op} is a Hunter, not an Ammo-based Skill`);
  const slow = members('Slow');
  assert.ok(slow.has('Glaucus') && slow.has('Orchid'), 'a Decel Binder Slows through its trait');
  assert.ok(!slow.has('Ray'), 'a Hunter reloads slowly, it does not Slow');
  const sustainViaTrait = groups.find((g) => g.name === 'Self-Sustain')?.entries.filter((e) => e.badges.every((b) => b.label === 'Trait')) ?? [];
  assert.deepEqual(sustainViaTrait.map((e) => e.operatorName), [], 'an Abjurer\'s trait heals allies, not itself');
});

test('a lowered stat with no minus sign, "reduce the target\'s RES by 24%", is the stat debuff', () => {
  for (const [text, name] of [
    ["Attacks reduce the target's RES by 24% for 1 second", 'RES Down'],
    ["Attacks have a 25% chance to reduce the target's RES by 25% for 3 seconds", 'RES Down'],
    ["Attacks reduce the target's DEF by 7% for 10s (stacks up to 5 times)", 'DEF Down'],
    ["20% chance for attacks to deal 165% damage and reduce the target's ATK by 15% for 3 seconds", 'ATK Down'],
    ["When hitting an enemy with full HP, ATK increases to 130%, reduce that enemy's Movement Speed by 50% for 3.5s", 'Movement Speed Down'],
  ]) assert.ok(rules(text).includes(name), text);
  // A sentence-opening verb counts too.
  assert.ok(rules("Reduces the target's DEF by 20% for 5 seconds").includes('DEF Down'));
  // Another stat sitting between the verb and the number keeps the number off this one. Lower
  // case, mid-sentence, so the verb does match and only isInterfered keeps ATK Down out.
  assert.ok(!rules('Attacks reduces DP Cost and increases ATK by 20%').includes('ATK Down'));
  assert.ok(!rules('Reduces DP Cost and increases ATK by 20%').includes('ATK Down'));
});

test('a technique the record names by hand is listed once, the record\'s entry', () => {
  const manual = [{ name: 'Reveal Invisibility', description: 'Editor note' }];
  const auto = detectAutoTechniques(6, ['Reveals Invisible enemies within range'], 'Someone', null, null);
  assert.ok(auto.some((t) => t.name === 'Reveal Invisibility'));
  assert.deepEqual(mergeTechniques(manual, auto).filter((t) => t.name === 'Reveal Invisibility'), manual);
  // Every skill and talent list the operator page shows, over the whole roster.
  for (const op of getAllOperators()) {
    const lists = [...getSkillList(op).map((skill) => skillTechniques(op, skill)), ...(op.talents ?? []).map((talent) => talentTechniques(op, talent))];
    for (const list of lists) {
      const names = list.map((t) => t.name).filter(Boolean);
      assert.equal(new Set(names).size, names.length, `${op.name} lists ${names.join(', ')}`);
    }
  }
});

test('projectile interception and enemy accuracy have separate source wording', () => {
  for (const text of [
    'Enemy projectile speed in attack range is greatly reduced, and all projectiles are removed when the skill expires.',
    'Enemy projectiles passing through the wall have a 20% chance of being removed.',
  ]) {
    assert.ok(rules(text).includes('Hit Reduction'));
    assert.ok(!rules(text).includes('Hit Rate Down'));
  }
  for (const text of [
    'Ground enemies within the cloud have -20% Physical and Arts hit rate.',
    'Reduces the hit rate of Physical and Arts attacks from enemies in the surrounding 8 tiles by 20%.',
  ]) {
    assert.ok(rules(text).includes('Hit Rate Down'));
    assert.ok(!rules(text).includes('Hit Reduction'));
  }
  assert.ok(!rules('Throws 3 projectiles per attack. Gains 35% Arts Dodge.').includes('Hit Reduction'));
});

test('passive debuffs have an enemy subject and the correct stat', () => {
  assert.ok(rules('Enemies that attack Bubble have their ATK reduced by 8%').includes('ATK Down'));
  assert.ok(rules('Attacks inflict the following effect on enemies: Movement Speed reduced by 18%').includes('Movement Speed Down'));
  assert.ok(!rules('After defeating an enemy, own ATK is reduced by 10%').includes('ATK Down'));
});

test('elemental buildup requires a source of buildup, including on a module', () => {
  for (const effect of ['Burn', 'Necrosis', 'Nervous Impairment']) {
    assert.ok(rules('Attacks deal an additional 10% as ' + effect).includes(effect));
    for (const text of [
      'When an enemy triggers a ' + effect + ' burst, deal additional Elemental Damage.',
      'When attacked, half of the damage is received as ' + effect + '.',
      'Enemies receive 22% more ' + effect + '.',
    ]) assert.ok(!rules(text).includes(effect), text);
  }
  assert.ok(rules('Enemies take 70 points of Nervous Impairment.').includes('Nervous Impairment'));
  assert.ok(rules('Attacks also deal 60 Necrosis.').includes('Necrosis'));
});

test('status application, healing and SP gains require the right recipient and action', () => {
  const pairs = [
    ['Stun', 'The target is Stunned for 1 second.', 'The Sniper and this unit have a chance to Stun themselves.'],
    ['Levitate', 'Causes the target to Levitate for 3s.', 'Deals Arts damage to Levitated enemies when they fall.'],
    ['Cold / Freeze', 'Attacks inflict Cold.', 'All Kjerag Operators gain Frozen immunity.'],
    ['Fear', 'The last slash inflicts Fear.', 'Fever +2 whenever inflicting Slow or Fear.'],
    ['SP Charging', 'The device grants the Operator 1 SP.', 'Equipment Alteration activates when SP is full.'],
    ['Self-Sustain', 'Each attack restores 5% HP.', 'Attacks instead restore the HP of 2 allies.'],
  ];
  for (const [rule,positive,negative] of pairs) {
    assert.ok(rules(positive).includes(rule), positive);
    assert.ok(!rules(negative).includes(rule), negative);
  }
});

test('a single-hit barrier threshold is distinct from an exhaustible HP barrier', () => {
  assert.deepEqual(rules('A Crystal Barrier blocks all damage, shattering when 200 damage is taken.'), ['Crystal Barrier']);
  assert.ok(rules('Immediately gains a Barrier equal to 130% Max HP.').includes('Barrier Generation'));
  assert.ok(!rules('When attacked while under the effect of her own Barrier, deals damage to the attacker.').includes('Barrier Generation'));
});

test('Corrosion credits the source of buildup without crediting a burst or cooldown bonus', () => {
  assert.ok(rules('When dealing Physical damage, inflicts Corrosion equal to 8% of ATK.').includes('Corrosion'));
  for (const text of ['When Corrosion bursts, gains Barrier.', "Reduces the target's Corrosion cooldown.", 'Reduces Corrosion taken by 20%.']) {
    assert.ok(!rules(text).includes('Corrosion'), text);
  }
});
