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
  // A public record: pulled from arkpedia-data and published by the release (scripts/content/records.mjs).
  assert.match(fs.readFileSync('scripts/content/records.mjs', 'utf8'), /'public\/medal-catalogue\.json'/);
});

test('set geometry and art come from the Global client and published asset repository', () => {
  const catalogue = JSON.parse(fs.readFileSync('public/medal-catalogue.json', 'utf8'));
  assert.ok(catalogue.sets.every(set => set.layout && set.background), 'Every current EN set has client positions and official artwork');
  const wolumonde = catalogue.sets.find(s => s.id === 'medalGroupActivity11d0');
  assert.equal(wolumonde.layout.width, 1374);
  assert.equal(wolumonde.layout.height, 459.093);
  assert.deepEqual(wolumonde.layout.positions.find(p => p.id === 'medal_activity_11d0_01'), { id: 'medal_activity_11d0_01', x: 914.3, y: 223.3 });
  const small = catalogue.medals.find(m => m.id === 'medal_activity_11d0_02');
  assert.equal(small.size.height, 114);
  assert.equal(catalogue.medals.find(m => m.id === 'medal_activity_11d0_06').size.height, 180);
  assert.ok(catalogue.medals.find(m => m.id === 'medal_activity_11d0_01').size.height > 248);
  for (const set of catalogue.sets) {
    assert.deepEqual(new Set(set.layout.positions.map(p => p.id)), new Set(set.medals));
    assert.match(set.background, /profile-medals\/medalgroup[a-z0-9_-]+-background\.webp$/);
  }
  assert.match(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8'), /stage medal-layouts -- python3 scripts\/imports\/import-medal-layouts\.py/);
});
