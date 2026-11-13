import assert from 'node:assert/strict';
import test from 'node:test';
import { packArtKey, resolvePackArt } from '../../lib/events/packArt.mjs';
import { eventExtras } from '../../lib/events/tableRewards';

test('official promotional artwork remains scoped to its source, ahead of the existing fallback', () => {
  const name = 'Sniper Chip Pack', source = 'https://www.arknights.global/news/5092';
  const art = { [name]: '/content-art/cn.webp', [packArtKey(source, name)]: '/content-art/global.webp' };
  const group = { kind: 'packs' as const, title: 'Packs', source, items: [], packs: [{ name, contents: [{ name: 'Sniper Chip', count: 5, kind: 'material' }] }] };
  const extras = eventExtras([group], () => null, (name, source) => resolvePackArt(art, source, name));
  assert.equal(extras.packs[0].packs[0].imagePath, '/content-art/global.webp');
  assert.equal(extras.packs[0].packs[0].artworkLayout, 'promo');
  assert.equal(extras.packs[0].packs[0].contents[0].count, 5);
  assert.deepEqual(resolvePackArt(art, source + '0', name), { path: '/content-art/cn.webp', layout: 'icon' });
});
