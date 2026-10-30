import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// The catalogue is built by arkpedia-data's importer (its scripts/build/build-medal-catalogue.mjs,
// whose own test lives beside it); these hold what the site is given to read.

test('published catalogue has complete set membership and is carried by the release', () => {
  const catalogue = JSON.parse(fs.readFileSync('public/medal-catalogue.json', 'utf8'));
  const ids = new Set(catalogue.medals.map(m => m.id));
  assert.equal(ids.size, catalogue.medals.length);
  assert.ok(catalogue.medals.length > 1000 && catalogue.sets.length > 50);
  for (const set of catalogue.sets) assert.ok(set.medals.every(id => ids.has(id)), set.name);
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
});
