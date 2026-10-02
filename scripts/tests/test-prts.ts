import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { EPISODE_15_FINALE, storyAI } from '../../lib/account/prts';

test('the reader\'s AI is PRTS until Episode 15 is cleared, then ZOOT', () => {
  assert.equal(storyAI(null), 'PRTS');
  assert.equal(storyAI({ cleared: ['main_14-21', 'main_15-18'] }), 'PRTS');
  assert.equal(storyAI({ cleared: ['main_15-18', EPISODE_15_FINALE] }), 'ZOOT');
  // A later episode cleared counts even when the finale's own record is missing.
  assert.equal(storyAI({ cleared: ['main_16-01'] }), 'ZOOT');
});

test('the finale the switch reads is still Episode 15\'s last stage', () => {
  const dir = path.join(process.cwd(), 'data', 'stages');
  const stages = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as { id: string; chapter?: number; order?: number; variant?: unknown })
    .filter((s) => s.chapter === 15 && !s.variant && typeof s.order === 'number');
  assert.ok(stages.length > 10, 'Episode 15 is in data/stages');
  const last = stages.reduce((a, b) => (b.order! > a.order! ? b : a));
  assert.equal(last.id, EPISODE_15_FINALE);
});
