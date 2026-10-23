import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSynergyMatches, namesContainingSynergyTerms } from '../../lib/techniques/synergyDetection';

const candidates = [
  { name: 'Victoria', type: 'faction' as const },
  { name: 'Rhodes Island', type: 'faction' as const },
  { name: 'Guard', type: 'class' as const },
];
const matches = (text: string, ignoredNames: string[]) =>
  findSynergyMatches(text, candidates, { ignoredNames }).map((entry) => entry.name).sort();

/* The real module β Stage 3 text: "Victoria" occurs only inside her name. */
const vinaModule =
  'When damaging an enemy for the first time, inflicts Frighten on regular enemies for 6 seconds, '
  + 'while Elite and Leader enemies are Frightened for 12 seconds. '
  + 'Vina Victoria and her summons deal 15% more damage to Frightened targets';

test('a faction spelt only inside an operator name is not a faction mention', () => {
  assert.deepEqual(matches(vinaModule, ['Vina Victoria']), []);
  // Without the name list the old, wrong reading stands -- callers that do not pass it are unchanged.
  assert.deepEqual(matches(vinaModule, []), ['Victoria']);
});

test('a genuine mention beside the name still counts', () => {
  const text = 'Vina Victoria and all Victoria Operators deal 15% more damage to Frightened targets';
  assert.deepEqual(matches(text, ['Vina Victoria']), ['Victoria']);
});

test('Rhodes Island Recon names the operator, not the faction', () => {
  const text = "Rhodes Island Recon's ATK +10%; attacks deal Arts damage";
  assert.deepEqual(matches(text, ['Rhodes Island Recon']), []);
  assert.deepEqual(matches('All Rhodes Island Operators gain ATK +10%', ['Rhodes Island Recon']), ['Rhodes Island']);
});

test('masking a name keeps brackets and other terms readable', () => {
  const text = '[Victoria] Operators gain ATK +10%, and Vina Victoria gains DEF';
  assert.deepEqual(matches(text, ['Vina Victoria']), ['Victoria']);
});

test('only names that contain a faction or class term are ignored', () => {
  assert.deepEqual(
    namesContainingSynergyTerms(
      ['Vina Victoria', 'Amiya', 'Rhodes Island Recon', 'SilverAsh', 'Terra Research Commission'],
      candidates,
    ),
    ['Vina Victoria', 'Rhodes Island Recon'],
  );
  assert.deepEqual(namesContainingSynergyTerms([], candidates), []);
});
