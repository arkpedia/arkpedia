import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { getBannerForEvent } from '../../lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { getFeaturedOperatorRates } from '../../lib/gacha/eventBannerRates';
import { getGachaIconPools } from '../../lib/gacha/gachaIconPools';
import { getAllEventListings } from '../../lib/home/frontPageContent';
import { getAllSkins } from '../../lib/skins/skins';
import { matchesSearch } from '../../lib/search/searchNormalize';

const pinned = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/[^/]+\/[a-f0-9]{40}\//;

const rawEvent = () => fs.readdirSync('data/events').filter(file => /^events_\d+\.json$/.test(file)).flatMap(file => JSON.parse(fs.readFileSync(`data/events/${file}`, 'utf8'))).find(event => event.activityId === 'act54side');

test('Persona links the banner and portraits, with evidence for any Global date', () => {
  const banner = getBannerForEvent(rawEvent().name, undefined, getAllHeadhuntingBanners())!;
  assert.ok(banner);
  if (banner.global_date) assert.ok(banner.global_window?.timingSource, 'Global release must have source evidence');
  assert.match(banner.banner_image!, pinned);
  const roster = getAllOperators();
  const name = (id: string) => roster.find(op => op.internalName === id)!.name;
  assert.deepEqual(getFeaturedOperatorRates(banner).map(op => [op.name, op.percent]).sort(), [
    [name('char_4217_makoto'), 50], [name('char_4218_aigis'), 25], [name('char_4219_yukari'), 25],
  ].sort());
  const pools = getGachaIconPools();
  for (const name of [...banner.six_stars, ...banner.five_stars]) {
    const icon = [...pools.six, ...pools.five].find(op => op.name === name)?.icon;
    assert.ok(icon, name);
    assert.match(icon, pinned);
  }
  assert.ok(![...banner.six_stars, ...banner.five_stars].includes('Koromaru'));
});

test('Persona event estimates remain labelled and all four searchable outfits have artwork', () => {
  const source = rawEvent();
  const event = getAllEventListings().find(e => e.name === source.name)!;
  assert.ok(event);
  if (!source.global?.startAt) assert.ok(event.isPredicted);
  else assert.ok(source.global.timingSource);
  assert.match(event.poster ?? '', pinned);
  const skins = getAllSkins().filter(skin => skin.skinId?.includes('@p3r#'));
  assert.ok(skins.length >= 4);
  for (const skin of skins) {
    assert.ok(skin.image?.match(pinned) || skin.image?.startsWith('/'), skin.skinId);
    assert.ok(matchesSearch((skin.searchAliases || [skin.series]).join(' '), 'Persona 3'));
  }
});
