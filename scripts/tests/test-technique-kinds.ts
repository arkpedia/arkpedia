import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { UMBRELLA_MEMBERS } from '../../lib/techniques/autoTechniques';
import { UMBRELLA_KIND, techniqueKind } from '../../lib/techniques/techniqueKinds';

/*
 * /techniques' Kind filter (lib/techniques/techniqueKinds.ts) has one answer per technique.
 * Every technique a rule in autoTechniques.ts can produce, and every umbrella, is placed in
 * a real kind here, so a new rule is given one when it is written -- not left in Other,
 * which is for a hand-written technique a record adds later. Read from the code, not the
 * day's data: a record's new technique name is not a failure.
 */
const RULE_NAMES = [...fs.readFileSync(new URL('../../lib/techniques/autoTechniques.ts', import.meta.url), 'utf8')
  .matchAll(/^\s+name: '([^']+)',$/gm)].map((m) => m[1]);

test('the rules are read from autoTechniques.ts', () => {
  assert.ok(RULE_NAMES.length > 30, `found ${RULE_NAMES.length} rule names`);
  assert.ok(RULE_NAMES.includes('Stun') && RULE_NAMES.includes('Self-Sustain'));
});

test('every umbrella has a kind', () => {
  for (const umbrella of Object.keys(UMBRELLA_MEMBERS)) assert.ok(UMBRELLA_KIND[umbrella], umbrella);
});

test('every technique a rule makes, and every umbrella member, has a kind other than Other', () => {
  const memberOf = new Map<string, string[]>();
  for (const [umbrella, members] of Object.entries(UMBRELLA_MEMBERS)) for (const m of members) memberOf.set(m, [...(memberOf.get(m) ?? []), umbrella]);
  for (const name of new Set([...RULE_NAMES, ...memberOf.keys()])) {
    assert.notEqual(techniqueKind(name, memberOf.get(name) ?? []), 'Other', name);
  }
});

test('a name nothing covers is Other, and its own name outranks its umbrella', () => {
  assert.equal(techniqueKind('Some New Trick', []), 'Other');
  assert.equal(techniqueKind('Burn', ['Enhance Arts Damage', 'Elemental Damage']), 'Damage');
  assert.equal(techniqueKind('RES Down', ['Stats Debuff', 'Enhance Arts Damage']), 'Debuffs');
});
