import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { EditConflict, InvalidEdit, readRotationPlans, saveRotation } from '../../lib/dashboard/campaignStore';
import { sponsorCampaignsFor, type SponsorCampaignTable } from '../../lib/sponsors/campaigns';
import { defaultTurnSeconds, publicRotations, rotationTurns } from '../../lib/sponsors/rotation';

test('placement rotations survive reload, preserve event eligibility, and reject stale or invalid writes', async () => {
  const sql = new DatabaseSync(':memory:');
  try {
    sql.exec(readFileSync('migrations/accounts/0027_sponsor_rotations.sql', 'utf8'));
    const db = { prepare: (query: string) => ({
      all: async () => ({ results: sql.prepare(query).all() }),
      bind: (...args: unknown[]) => ({ run: async () => ({ meta: sql.prepare(query).run(...args) }) }),
    }) } as unknown as D1Database;
    const turns = [{ id: 'archive', seconds: 70, enabled: true }, { id: 'violet', seconds: 4, enabled: false }];
    await saveRotation(db, 'editor', 'header', 0, turns);
    await assert.rejects(saveRotation(db, 'editor', 'header', 0, []), EditConflict);
    await saveRotation(db, 'editor', 'mobile-menu', 0, []);
    for (const bad of [[turns[0], turns[0]], [{ ...turns[0], seconds: 0 }], [{ ...turns[0], seconds: 8.5 }]]) {
      await assert.rejects(saveRotation(db, 'editor', 'header', 1, bad), InvalidEdit);
    }
    const campaigns: SponsorCampaignTable['campaigns'] = ['violet', 'archive', 'kirin'].map(id => ({
      id, sponsor: id, status: 'active', url: '/music', placements: ['home', 'header'], endAt: null,
      startAt: id === 'kirin' ? new Date(1000).toISOString() : null, alt: id, image: '/page', width: 900, height: 200,
      mobileArtwork: { image: '/mobile', width: 450, height: 100, alt: id },
    }));
    const plans = await readRotationPlans(db);
    assert.deepEqual(plans.header, { turns, revision: 1 });
    const table: SponsorCampaignTable = { version: 1, campaigns, rotations: publicRotations(campaigns, plans) };
    assert.deepEqual(sponsorCampaignsFor(table, 'header', 999).map(c => c.id), ['archive']);
    assert.deepEqual(sponsorCampaignsFor(table, 'header', 1000).map(c => c.id), ['archive', 'kirin']);
    assert.deepEqual(sponsorCampaignsFor(table, 'mobile-menu', 999).map(c => [c.id, c.image]), [['violet', '/mobile'], ['archive', '/mobile']]);
    assert.equal(sponsorCampaignsFor(table, 'home', 999)[0].id, 'violet');
    assert.deepEqual(publicRotations([campaigns[1]], plans).header, [turns[0]]);
    assert.equal(rotationTurns(['kirin'], turns)[0].seconds, defaultTurnSeconds);
    await saveRotation(db, 'other', 'header', 1, turns.map(t => ({ ...t, enabled: false })));
    table.rotations = publicRotations(campaigns, await readRotationPlans(db));
    assert.equal(sponsorCampaignsFor(table, 'header', 999).length, 0);
    await assert.rejects(saveRotation(db, 'editor', 'header', 1, turns), EditConflict);
  } finally { sql.close(); }
});
