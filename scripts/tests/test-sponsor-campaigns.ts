import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSponsorCampaigns, currentSponsorCampaigns, sponsorCampaignFor, type SponsorCampaign } from '../../lib/sponsors/campaigns';
import record from '../../data/sponsor-campaigns.json';

const campaign = (over: Partial<SponsorCampaign> = {}): SponsorCampaign => ({
  id: 'acme-sale', sponsor: 'Acme', status: 'active', url: 'https://example.com/a', startAt: '2026-11-01T00:00:00Z', endAt: '2026-12-01T00:00:00Z',
  placements: ['home'], image: '/advertisements/acme/sale.webp', width: 1920, height: 640, alt: 'Acme sale', ...over,
});
const table = (...campaigns: SponsorCampaign[]) => checkSponsorCampaigns({ version: 1, campaigns });
const at = (iso: string) => Date.parse(iso);

test('the published record is well formed', () => {
  checkSponsorCampaigns(record);
});

test('readers see a campaign only while it is active, linked and inside its window', () => {
  const t = table(campaign());
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-11-17T00:00:00Z'))?.id, 'acme-sale');
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-10-31T23:59:00Z')), null, 'before startAt');
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-12-01T00:00:00Z')), null, 'endAt is exclusive');
  assert.equal(sponsorCampaignFor(t, 'header', at('2026-11-17T00:00:00Z')), null, 'another placement');
  assert.equal(sponsorCampaignFor(table(campaign({ status: 'ended' })), 'home', at('2026-11-17T00:00:00Z')), null);
});

test('a draft is never shown to readers, and is shown in a preview whatever its link and dates', () => {
  const t = table(campaign({ status: 'draft', url: null, startAt: null, endAt: null }));
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-11-17T00:00:00Z')), null);
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-11-17T00:00:00Z'), true)?.id, 'acme-sale');
});

test('a request is handed no active campaign outside its dates, and every draft', () => {
  const t = table(campaign({ id: 'over', endAt: '2026-11-10T00:00:00Z' }), campaign({ id: 'running' }), campaign({ id: 'draft', status: 'draft', url: null }));
  assert.deepEqual(currentSponsorCampaigns(t, at('2026-11-17T00:00:00Z')).campaigns.map(c => c.id), ['running', 'draft']);
  // What the server then renders without a clock of its own.
  assert.equal(sponsorCampaignFor(currentSponsorCampaigns(t, at('2026-12-02T00:00:00Z')), 'home', null), null);
});

test('the first usable campaign listed for a placement wins', () => {
  const t = table(campaign({ id: 'over', endAt: '2026-11-10T00:00:00Z' }), campaign({ id: 'running' }));
  assert.equal(sponsorCampaignFor(t, 'home', at('2026-11-17T00:00:00Z'))?.id, 'running');
});

test('a malformed campaign stops the release, naming each problem', () => {
  const bad = (over: Record<string, unknown>, problem: RegExp) =>
    assert.throws(() => checkSponsorCampaigns({ version: 1, campaigns: [{ ...campaign(), ...over }] }), problem);
  bad({ url: 'http://example.com' }, /https link/);
  bad({ url: null }, /active campaign needs its url/);
  bad({ startAt: '2026-11-01' }, /startAt/);
  bad({ endAt: '2026-10-01T00:00:00Z' }, /endAt must be after startAt/);
  bad({ placements: ['sidebar'] }, /placements/);
  bad({ image: '/event-poster/x.webp' }, /image must be/);
  bad({ width: 0 }, /pixel size/);
  bad({ alt: ' ' }, /alt is missing/);
  assert.throws(() => checkSponsorCampaigns({ version: 1, campaigns: [campaign(), campaign()] }), /used twice/);
  assert.throws(() => checkSponsorCampaigns({ campaigns: [] }), /version: 1/);
});
