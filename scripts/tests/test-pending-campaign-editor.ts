import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { editorCatalog, readerCampaigns } from '../../lib/dashboard/campaignCatalog';
import { mergeCampaigns } from '../../lib/dashboard/campaignStore';
import { CONTENT_SCHEMA } from '../../lib/content/types';
import type { SponsorCampaign } from '../../lib/sponsors/campaigns';

test('the editor retains unpublished event records while artwork waits for its original release window', async t => {
  const previousOrigin = process.env.ARKPEDIA_CONTENT_URL;
  process.env.ARKPEDIA_CONTENT_URL = 'https://campaign-fixture.test';
  const disabled = process.env.ARKPEDIA_CONTENT_DISABLED;
  delete process.env.ARKPEDIA_CONTENT_DISABLED;
  t.after(() => {
    if (previousOrigin === undefined) delete process.env.ARKPEDIA_CONTENT_URL; else process.env.ARKPEDIA_CONTENT_URL = previousOrigin;
    if (disabled !== undefined) process.env.ARKPEDIA_CONTENT_DISABLED = disabled;
  });
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const release = 'a'.repeat(64), revision = 'b'.repeat(40);
  const campaign: SponsorCampaign = { id: 'incoming', sponsor: 'Sponsor', eventActivityId: 'act123', status: 'active',
    placements: ['header'], url: 'https://example.com', startAt: null, endAt: null,
    image: '/advertisements/test/header.webp', width: 1800, height: 400, alt: 'Header',
    mobileArtwork: { image: '/advertisements/test/mobile.webp', width: 900, height: 200, alt: 'Menu' } };
  const record = JSON.stringify({ version: 1, campaigns: [campaign] });
  const assets = { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision };
  const payloads: Record<string, string> = {};
  const pages = Object.fromEntries(Object.entries({
    support: { __contentTables: { 'sponsor-campaigns': { version: 1, campaigns: [] } } },
    schedule: { events: [{ activityId: 'act123', name: 'Upcoming event', cn: {}, global: {} }] },
  }).map(([name, props]) => {
    const path = 'pages/' + name + '.json';
    const text = JSON.stringify({ props });
    payloads['/' + revision + '/release/' + path] = text;
    return ['/' + name, { path, bytes: Buffer.byteLength(text), sha256: hash(text) }];
  }));
  const manifest = JSON.stringify({ schema: CONTENT_SCHEMA, release, pages, files: {}, assets, sourceHashes: { 'data/sponsor-campaigns.json': hash(record) } });
  payloads['/' + revision + '/release/manifest.json'] = manifest;
  payloads['/live/current.json'] = JSON.stringify({ schema: CONTENT_SCHEMA, release, revision, manifestSha256: hash(manifest) });
  payloads['/' + revision + '/source/data/sponsor-campaigns.json'] = record;
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const value = payloads[new URL(input).pathname];
    return new Response(value ?? '', { status: value ? 200 : 404 });
  });

  const catalog = await editorCatalog();
  assert.deepEqual(catalog.base, [campaign]);
  assert.equal(catalog.groups.incoming, 'Waiting for Global dates');
  assert.deepEqual((await readerCampaigns()).campaigns, []);

  const { eventActivityId: _event, ...original } = campaign;
  const edit = { id: original.id, revision: 1, followsRelease: true, campaign: { ...original,
    image: '/advertisements/test/edited.webp', mobileArtwork: { ...original.mobileArtwork!, image: '/advertisements/test/edited-mobile.webp' } } };
  assert.deepEqual(mergeCampaigns([], [edit]), []);
  const confirmed = { ...original, startAt: '2027-01-10T10:00:00Z', endAt: '2027-01-20T10:00:00Z' };
  assert.deepEqual(mergeCampaigns([confirmed], [edit]), [{ ...edit.campaign, startAt: confirmed.startAt, endAt: confirmed.endAt }]);
  assert.deepEqual(mergeCampaigns([confirmed], [{ ...edit, campaign: null }]), [confirmed]);
});
