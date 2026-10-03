import assert from 'node:assert/strict';
import test from 'node:test';
import { detectAutoTechniqueMatches } from '../../lib/techniques/autoTechniques';
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
