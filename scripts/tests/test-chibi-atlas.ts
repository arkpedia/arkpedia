import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spine } from '../../lib/vendor/spine-3.8/spine-webgl';
import { chibiAtlasText } from '../../lib/operators/chibiAtlas';

const page = (name: string) => `${name}.png\nsize: 64, 64\nformat: RGBA8888\nfilter: Linear, Linear\nrepeat: none\n${name}\n  rotate: false\n  xy: 0, 0\n  size: 16, 16\n  orig: 16, 16\n  offset: 0, 0\n  index: -1\n`;
const texture = () => ({ getImage: () => ({ width: 64, height: 64 }), setFilters() {}, setWraps() {}, dispose() {} }) as unknown as spine.Texture;

test('client PMA page headers remain playable by the actual Spine 3.8 atlas reader', () => {
  const legacy = `${page('front')}\n${page('effect')}`;
  const exported = legacy.replace('repeat: none\nfront', 'repeat: none\npma: true\nfront').replace('repeat: none\neffect', 'repeat: none\npma: false\neffect');
  assert.throws(() => new spine.TextureAtlas(exported, texture), /Invalid line/);
  assert.equal(chibiAtlasText(exported), legacy);
  assert.equal(chibiAtlasText(exported.replaceAll('\n', '\r\n')), legacy.replaceAll('\n', '\r\n'));
  const atlas = new spine.TextureAtlas(chibiAtlasText(exported), texture);
  assert.equal(atlas.pages.length, 2);
  assert.deepEqual(atlas.regions.map(region => [region.name, region.width, region.height]), [['front', 16, 16], ['effect', 16, 16]]);
  atlas.dispose();
});

test('existing atlases and native region properties are preserved', () => {
  const legacy = page('front');
  assert.equal(chibiAtlasText(legacy), legacy);
  assert.equal(chibiAtlasText('pma: true'), '');
});
