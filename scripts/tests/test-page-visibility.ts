import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { managedPageForHref, pageIsListed, publicPageVisibility, validPageVisibility, type PageVisibilitySetting } from '../../lib/page-visibility/settings';
import { readPageVisibility, savePageVisibility } from '../../lib/page-visibility/store';

const day = Date.UTC(2026, 11, 1);
const unlisted: PageVisibilitySetting = { id: 'ccb', mode: 'unlisted', showAt: null, hideAt: null, revision: 0 };

test('managed page lookups include older direct links, queries and fragments', () => {
  assert.equal(managedPageForHref('/ccb#ccb-squad'), 'ccb');
  assert.equal(managedPageForHref('/game-modes/ccb?view=stage'), 'ccb');
  assert.equal(managedPageForHref('/game-modes'), undefined);
});

test('a schedule lists at the show instant and unlists at the hide instant', () => {
  const scheduled: PageVisibilitySetting = { ...unlisted, mode: 'scheduled', showAt: day, hideAt: day + 1_000 };
  assert.deepEqual(publicPageVisibility([scheduled], day - 1), { listed: [], refreshAfterMs: 1 });
  assert.deepEqual(publicPageVisibility([scheduled], day), { listed: ['ccb'], refreshAfterMs: 1_000 });
  assert.deepEqual(publicPageVisibility([scheduled], day + 1_000), { listed: [], refreshAfterMs: 60_000 });
  assert.ok(pageIsListed({ ...scheduled, showAt: null }, day - 1));
  assert.ok(pageIsListed({ ...scheduled, hideAt: null }, day + 2_000));
  assert.ok(!pageIsListed(unlisted, day));
  assert.ok(pageIsListed({ ...unlisted, mode: 'listed' }, day));
});

test('visibility writes require a valid page and an ordered, non-empty schedule', () => {
  assert.ok(validPageVisibility(unlisted));
  assert.ok(validPageVisibility({ ...unlisted, mode: 'scheduled', hideAt: day }));
  assert.ok(!validPageVisibility({ ...unlisted, mode: 'scheduled' }));
  assert.ok(!validPageVisibility({ ...unlisted, mode: 'scheduled', showAt: day, hideAt: day }));
  assert.ok(!validPageVisibility({ ...unlisted, mode: 'scheduled', showAt: day, hideAt: day - 1 }));
  assert.ok(!validPageVisibility({ ...unlisted, mode: 'listed', showAt: day }));
  assert.ok(!validPageVisibility({ ...unlisted, id: 'unknown' }));
  assert.ok(!validPageVisibility({ ...unlisted, revision: -1 }));
});

test('migration seeds CCB unlisted and saves reject stale revisions', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(readFileSync('migrations/accounts/0032_page_visibility.sql', 'utf8'));
    const db = { prepare: (sql: string) => ({
      all: async () => ({ results: sqlite.prepare(sql).all() }),
      bind: (...values: (string | number | null)[]) => ({ first: async () => sqlite.prepare(sql).get(...values) ?? null }),
    }) } as unknown as D1Database;
    assert.deepEqual((await readPageVisibility(db)).map(row => ({ ...row })), [unlisted]);
    const schedule = { ...unlisted, mode: 'scheduled', showAt: day, hideAt: day + 1_000 } as const;
    const saved = await savePageVisibility(db, schedule, 'test@example.org');
    assert.deepEqual({ ...saved }, { ...schedule, revision: 1 });
    assert.equal(await savePageVisibility(db, { ...unlisted, mode: 'listed' }, 'other@example.org'), null);
    assert.deepEqual(publicPageVisibility(await readPageVisibility(db), day).listed, ['ccb']);
  } finally {
    sqlite.close();
  }
});
