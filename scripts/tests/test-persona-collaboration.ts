import assert from 'node:assert/strict';
import test from 'node:test';
import { getBannerForEvent } from '../../lib/gacha/headhuntingBanners';
import { getFeaturedOperatorRates } from '../../lib/gacha/eventBannerRates';
import { getGachaIconPools } from '../../lib/gacha/gachaIconPools';
import { getAllEventListings } from '../../lib/home/frontPageContent';
import { getAllSkins } from '../../lib/skins/skins';
import { getSkinsForEvent } from '../../lib/schedule/scheduleSkinMatch';
import { matchesSearch } from '../../lib/search/searchNormalize';
import evidence from '../../data/persona-collaboration-sources.json';

const pinned = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/[^/]+\/[a-f0-9]{40}\//;

test('Persona links the official banner and portraits without claiming a Global date', () => {
  const banner = getBannerForEvent(evidence.event)!;
  assert.ok(banner);
  assert.equal(banner.global_date, null);
  assert.match(banner.banner_image!, pinned);
  assert.deepEqual(getFeaturedOperatorRates(banner).map(op => [op.name, op.percent]), [
    ['Makoto Yuki', 50], ['Aegis', 25], ['Yukari Takeba', 25],
  ]);
  const pools = getGachaIconPools();
  for (const name of [...banner.six_stars, ...banner.five_stars]) {
    const icon = [...pools.six, ...pools.five].find(op => op.name === name)?.icon;
    assert.ok(icon, name);
    assert.match(icon, pinned);
  }
  assert.ok(![...banner.six_stars, ...banner.five_stars].includes('Koromaru'));
});

test('Persona event estimates remain labelled and all four searchable outfits have artwork', () => {
  const event = getAllEventListings(new Date('2026-09-22T12:00:00Z')).find(e => e.name === evidence.event)!;
  assert.ok(event?.isPredicted);
  assert.match(event.poster, pinned);
  const skins = getSkinsForEvent(evidence.event, getAllSkins(), [evidence.event]);
  assert.deepEqual(skins.map(s => `${s.model} / ${s.name}`).sort(), [...evidence.skinIds].sort());
  for (const skin of skins) {
    assert.match(skin.image!, pinned);
    assert.ok(matchesSearch(skin.searchAliases!.join(' '), 'Persona 3'));
  }
});
