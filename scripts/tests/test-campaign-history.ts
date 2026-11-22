import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { campaignHistory, recentCampaignChanges } from '../../lib/dashboard/campaignStore';

test('private campaign history isolates campaigns and compares revisions across a page boundary', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec(fs.readFileSync('migrations/accounts/0025_campaign_editor.sql', 'utf8'));
    const insert = sqlite.prepare('INSERT INTO campaign_editor_revisions VALUES (?, ?, ?, ?, ?, ?)');
    for (let revision = 1; revision <= 23; revision++) {
      const art = { image: '/advertisements/test/page.webp', width: 1800, height: 400, alt: 'Page' };
      const snapshot = { ...art, placements: ['header'], mobileArtwork: { ...art, alt: 'Mobile ' + revision } };
      insert.run('test', revision, revision % 2 ? 'first@example.org' : 'second@example.org',
        new Date(1000 * revision).toISOString(), 1, revision === 22 ? null : JSON.stringify(snapshot));
    }
    insert.run('other', 1, 'other@example.org', new Date().toISOString(), 0, null);
    const db = { prepare: (sql: string) => ({ all: async () => ({ results: sqlite.prepare(sql).all() }), bind: (...values: (string | number)[]) => ({
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    }) }) } as unknown as D1Database;
    const recent = await recentCampaignChanges(db);
    assert.deepEqual(recent.map(row => [row.id, row.revision, row.cleared]), [['other', 1, true], ['test', 23, false]]);
    assert.equal(recent[1].actor, 'first@example.org');
    assert.equal(recent[1].updatedAt, new Date(23000).toISOString());
    assert.deepEqual(recent[1].changes, []);
    const first = await campaignHistory(db, 'test');
    assert.equal(first.versions.length, 20);
    assert.deepEqual(first.versions[0].changes, []);
    assert.equal(first.versions[1].campaign, null);
    assert.deepEqual(first.versions.at(-1)?.changes, ['Mobile artwork']);
    assert.equal(first.nextBefore, 4);
    const second = await campaignHistory(db, 'test', first.nextBefore!);
    assert.deepEqual(second.versions.map(row => row.revision), [3, 2, 1]);
    assert.equal(second.versions[1].actor, 'second@example.org');
    assert.equal(second.versions[1].updatedAt, new Date(2000).toISOString());
    assert.equal(second.nextBefore, null);
    const snapshot = first.versions[0].campaign!;
    insert.run('test', 24, 'third@example.org', new Date().toISOString(), 1, JSON.stringify({ ...snapshot, alt: 'Revised' }));
    const latest = (await recentCampaignChanges(db)).find(row => row.id === 'test')!;
    assert.deepEqual(latest.changes, ['Page artwork']);
    assert.equal(latest.actor, 'third@example.org');
    assert.ok(!('campaign' in latest));
    assert.deepEqual(await campaignHistory(db, 'empty'), { versions: [], nextBefore: null });
  } finally { sqlite.close(); }
});
