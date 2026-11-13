import test from 'node:test';
import assert from 'node:assert/strict';
import { projectIs } from '../../lib/gamemodes/integratedStrategies';
test('IS Global records replace matching CN identities while new CN records remain labelled', () => {
  const topic = { id: 'rogue_1', name: 'Theme', lineText: 'Intro' };
  const cn = { topics: { rogue_1: topic }, details: { rogue_1: { items: { a: { id: 'a', name: '中文', type: 'RELIC' }, b: { id: 'b', name: 'Future', type: 'RELIC' }, c: { id: 'c', name: 'Squad', type: 'BAND' } }, stages: { x: { id: 'x', name: 'Map', levelId: 'Obt/Rogue/Map' } } } } };
  const en = { topics: { rogue_1: { ...topic, name: 'English theme' } }, details: { rogue_1: { items: { a: { id: 'a', name: 'English', type: 'RELIC' } } } } };
  const result = projectIs(cn, en, [{ id: 'obt/rogue/map', slug: 'map-slug' }])[0];
  assert.equal(result.name, 'English theme');
  assert.deepEqual(result.sections.items.map(x => [x.id, x.name, x.source]), [['a', 'English', 'Global'], ['b', 'Future', 'CN']]);
  assert.equal(result.sections.squads[0].id, 'c');
  assert.equal(result.sections.stages[0].href, '/stages/browse?s=map-slug');
});
test('IS mechanics preserve game descriptions and stages without a catalogue match have no broken link', () => {
  const result = projectIs({}, { topics: { rogue_2: { name: 'Theme' } }, details: { rogue_2: { stages: { a: { id: 'a', name: 'Future', levelId: 'missing' } } } }, modules: { rogue_2: { chaos: { states: { a: { name: 'Effect', functionDesc: 'Costs +1', desc: 'Flavour' } } } } } })[0];
  assert.equal(result.sections.stages[0].href, undefined);
  assert.equal(result.sections.mechanics[0].text, 'Costs +1\n\nFlavour');
});
