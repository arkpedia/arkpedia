import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { buildMedalCatalogue } from '../build/build-medal-catalogue.mjs';

test('official catalogue preserves descriptions, grouping, trim variants, and published icons only', () => {
  const table = { medalList: [
    { medalId: 'medal_a', medalName: 'A', medalType: 'activityMedal', rarity: 'T1', getMethod: 'Clear the stage', description: 'Official description', advancedMedal: 'medal_a_trim' },
    { medalId: 'medal_a_trim', medalName: 'A trimmed', medalType: 'activityMedal', rarity: 'T1', originMedal: 'medal_a' },
  ], medalTypeData: { activity: { medalGroupId: 'activityMedal', medalName: 'Event Medal', sortId: 1, groupData: [{ groupId: 'group_a', groupName: 'A set', medalId: ['medal_a'], groupBackColor: '5b3100' }] } } };
  const result = buildMedalCatalogue(table, new Set(['profile-medals/medal_a.webp']));
  assert.equal(result.medals[0].icon, '/profile-medals/medal_a.webp');
  assert.equal(result.medals[1].icon, null);
  assert.equal(result.medals[0].advanced, 'medal_a_trim');
  assert.equal(result.medals[0].description, 'Official description');
  assert.equal(result.medals[0].requirement, 'Clear the stage');
  assert.deepEqual(result.sets[0].medals, ['medal_a']);
  assert.equal(result.sets[0].color, '#5b3100');
  assert.throws(() => buildMedalCatalogue({}, new Set()));
  assert.throws(() => buildMedalCatalogue({ ...table, medalList: [table.medalList[1]] }, new Set()), /unknown medal/);
});
test('published catalogue has complete set membership and its nightly builder is registered', () => {
  const catalogue = JSON.parse(fs.readFileSync('public/medal-catalogue.json', 'utf8'));
  const ids = new Set(catalogue.medals.map(m => m.id));
  assert.equal(ids.size, catalogue.medals.length);
  assert.ok(catalogue.medals.length > 1000 && catalogue.sets.length > 50);
  for (const set of catalogue.sets) assert.ok(set.medals.every(id => ids.has(id)), set.name);
  assert.match(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8'), /stage medal-catalogue -- node scripts\/build\/build-medal-catalogue\.mjs/);
  assert.match(fs.readFileSync('scripts/content/hydrate-source.mjs', 'utf8'), /public\/medal-catalogue\.json/);
});
