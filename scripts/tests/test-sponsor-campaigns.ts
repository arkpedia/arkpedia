import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLootBarHandoff, checkSponsorCampaigns, sitePath, sponsorCampaignFor, sponsorCampaignsFor, type SponsorCampaign } from '../../lib/sponsors/campaigns';
import { resolveSponsorEvents } from '../../lib/sponsors/eventCampaigns';
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

test('event campaigns follow exact Global openings and exclusive closings', () => {
  const eventCampaign = (id: string) => campaign({ id, eventActivityId: id, startAt: null, endAt: null, placements: ['header'] });
  const mobileArtwork = { image: '/advertisements/acme/mobile.webp', width: 900, height: 200, alt: 'Mobile sale' };
  const raw = table(eventCampaign('first'), { ...eventCampaign('next'), mobileArtwork }, eventCampaign('pending'));
  const boundary = '2026-12-01T15:00:00Z';
  const resolved = resolveSponsorEvents(raw, [
    { activityId: 'first', global: { startAt: '2026-11-21T15:00:00Z', endAt: boundary } },
    { activityId: 'next', global: { startAt: boundary, endAt: '2026-12-14T11:00:00Z' } },
    { activityId: 'pending', global: { startAt: boundary, endAt: '2026-12-14T11:00:00Z', note: 'Estimated' } },
  ]);
  assert.deepEqual(resolved.campaigns.map(c => c.id), ['first', 'next']);
  assert.equal(sponsorCampaignFor(raw, 'header', at(boundary)), null);
  assert.equal(sponsorCampaignFor(resolved, 'header', at(boundary) - 1)?.id, 'first');
  assert.equal(sponsorCampaignFor(resolved, 'header', at(boundary))?.image, '/advertisements/acme/sale.webp');
  assert.equal(sponsorCampaignFor(resolved, 'mobile-menu', at(boundary))?.image, mobileArtwork.image);
  assert.equal(sponsorCampaignFor(resolved, 'mobile-menu', at('2026-12-14T11:00:00Z')), null);
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
  bad({ eventActivityId: 'act50side' }, /takes its dates from the event/);
  bad({ mobileArtwork: { image: '/bad.webp' }, placements: ['header'] }, /mobileArtwork: image must be/);
  bad({ alt: ' ' }, /alt is missing/);
  assert.throws(() => checkSponsorCampaigns({ version: 1, campaigns: [campaign(), campaign()] }), /used twice/);
  assert.throws(() => checkSponsorCampaigns({ campaigns: [] }), /version: 1/);
});

test('a placement with several campaigns lists them all in the record\'s order, and the first is the one a single slot shows', () => {
  const t = table(campaign({ id: 'a', placements: ['header'] }), campaign({ id: 'b', placements: ['home'] }), campaign({ id: 'c', placements: ['header', 'support'] }), campaign({ id: 'd', status: 'ended', placements: ['header'] }));
  const now = at('2026-11-17T00:00:00Z');
  assert.deepEqual(sponsorCampaignsFor(t, 'header', now).map(c => c.id), ['a', 'c']);
  assert.equal(sponsorCampaignFor(t, 'header', now)?.id, 'a');
  assert.deepEqual(sponsorCampaignsFor(t, 'support', now).map(c => c.id), ['c']);
});

test('a link is an https address or a path on this site, never another scheme or host-relative', () => {
  checkSponsorCampaigns({ version: 1, campaigns: [campaign({ url: '/music/discover' })] });
  for (const url of ['//evil.example/a', 'http://example.com', 'javascript:alert(1)', 'music/discover', '/a b']) {
    assert.throws(() => checkSponsorCampaigns({ version: 1, campaigns: [campaign({ url })] }), /url must be/, url);
  }
  assert.equal(sitePath('/music/discover'), true);
  assert.equal(sitePath('https://example.com/a'), false);
});

test('Violet bridges a delayed Kirin opening on both page and mobile and ends there permanently', () => {
  const violet = campaign({ id: 'lootbar-violet-orchid', placements: ['header'] });
  const home = { ...violet, id: 'lootbar-violet-orchid-main', placements: ['home'] as SponsorCampaign['placements'] };
  const pending = applyLootBarHandoff(table(home, violet));
  const opening = '2026-12-10T15:00:00Z';
  const kirin = campaign({ id: 'lootbar-kirin-yato', placements: ['header'], startAt: opening,
    endAt: '2026-12-20T11:00:00Z', mobileArtwork: { ...violet, image: '/advertisements/acme/mobile.webp' } });
  const confirmed = applyLootBarHandoff(table(home, violet, kirin));
  for (const slot of ['header', 'mobile-menu'] as const) {
    assert.equal(sponsorCampaignFor(pending, slot, at(opening))?.id, violet.id);
    assert.equal(sponsorCampaignFor(confirmed, slot, at(opening) - 1)?.id, violet.id);
    assert.equal(sponsorCampaignFor(confirmed, slot, at(opening))?.id, kirin.id);
    assert.equal(sponsorCampaignFor(confirmed, slot, at(kirin.endAt!)), null);
  }
  assert.equal(sponsorCampaignFor(confirmed, 'mobile-menu', at(opening))?.image, kirin.mobileArtwork?.image);
  assert.equal(sponsorCampaignFor(confirmed, 'home', at(opening) - 1)?.id, home.id);
  assert.equal(sponsorCampaignFor(confirmed, 'home', at(opening)), null);
});
