import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import layout from '../../config/persona-home-layout.json';
import { curveValue, type GameUiScene } from '../../lib/events/gameUiPlayer';
import { test } from 'node:test';
import { regionalEventCosmeticPreview, regionalPackCosmeticPreview, type GlobalHomeCosmetics } from '../../lib/events/cosmeticPreviews';
import { preferredPackGroups } from '../../lib/events/packRegions';
import { rewardTabsFor } from '../../lib/events/rewardTabs';

const activity = 'act54side';
const cnSource = 'https://ak.hypergryph.com/news/9681';
const globalSource = 'https://example.invalid/news/persona';
const cnPack = { name: '幽蓝门扉组合包', region: 'CN', contents: [] };
const globalPack = { name: 'Fixture Pack', contents: [] };
const art = (file: string) => ({ image: `/content-art/${file}.webp`, width: 400, height: 200 });
const data: GlobalHomeCosmetics = {
  bg_p3r_1: { name: 'Fixture Background', purchasePacks: ['a Fixture Pack'], art: { background: art('room') } },
  tm_p3r_1: { name: 'Fixture Theme', purchasePacks: ['Fixture Pack'], art: { battle_terminal: art('terminal') } },
};

test('keeps the CN preview until Global data exists and connects the announced pack by its game IDs', () => {
  assert.equal(regionalPackCosmeticPreview(activity, cnPack, cnSource, undefined)?.theme?.name, '月满');
  assert.equal(regionalPackCosmeticPreview(activity, globalPack, globalSource, undefined), undefined);

  const preview = regionalPackCosmeticPreview(activity, globalPack, globalSource, data);
  assert.equal(preview?.pack, globalPack.name);
  assert.equal(preview?.source, globalSource);
  assert.equal(preview?.scene.name, 'Fixture Background');
  assert.equal(preview?.scene.image, '/content-art/room.webp');
  assert.ok(preview?.scene.native, 'the regional preview keeps the moving scene');
  assert.equal(preview?.theme?.name, 'Fixture Theme');
  assert.equal(preview?.theme?.terminal.art?.image, '/content-art/terminal.webp');
  assert.equal(preview?.theme?.navigation[0].caption, undefined, 'an unavailable Global caption does not show Chinese text');
  assert.deepEqual(preview?.theme?.recruitment?.choices[0], { label: 'Recruit' });
  assert.equal(regionalPackCosmeticPreview('act_other', globalPack, globalSource, data), undefined);
  assert.equal(regionalPackCosmeticPreview(activity, { ...globalPack, name: 'Unrelated Pack' }, globalSource, data), undefined);
});

test('Global cosmetic names can arrive before the artwork and match the contents of a differently named offer', () => {
  const names = {
    bg_p3r_1: { name: 'Fixture Background', purchasePacks: [] },
    tm_p3r_1: { name: 'Fixture Theme', purchasePacks: [] },
  };
  const contents = [{ name: 'Main Menu Background [Fixture Background]' }, { name: 'Home Screen UI “Fixture Theme”' }];
  const preview = regionalPackCosmeticPreview(activity, { ...globalPack, contents }, globalSource, names);
  assert.equal(preview?.scene.name, 'Fixture Background');
  assert.equal(preview?.scene.image, '/event-preview/velvet-room.webp');
  assert.equal(preview?.theme?.name, 'Fixture Theme');
  assert.equal(regionalPackCosmeticPreview(activity, { ...globalPack, contents: contents.slice(0, 1) }, globalSource, names), undefined);
});

test('the Global sale catalogue supersedes the CN offers without importing their sale terms', () => {
  const cn = { kind: 'packs' as const, title: 'CN sales', region: 'CN', source: cnSource, items: [], packs: [cnPack] };
  const en = { kind: 'packs' as const, title: 'Global sales', region: 'Global', source: globalSource, items: [], packs: [globalPack] };
  assert.deepEqual(preferredPackGroups([cn]), [cn]);
  assert.deepEqual(preferredPackGroups([cn, en]), [en]);
});

test('an early Global pack list can keep the standalone CN preview until its cosmetic data arrives', () => {
  const cosmeticPreview = regionalEventCosmeticPreview(activity, undefined);
  assert.equal(cosmeticPreview?.theme?.name, '月满');
  assert.equal(rewardTabsFor([], { packs: [], news: [], board: [], furniture: [], notices: [], cosmeticPreview })[0]?.label, 'Packs');
  assert.equal(regionalEventCosmeticPreview(activity, data)?.theme?.name, 'Fixture Theme');
  assert.equal(regionalEventCosmeticPreview('act_other', data), undefined);
});

test('Persona uses the projected home prefab positions and serves every referenced sprite', () => {
  const preview = regionalPackCosmeticPreview(activity, cnPack, cnSource, undefined);
  assert.equal(preview?.theme?.nativeLayout, 'persona');
  assert.equal(layout.width / layout.height, 16 / 9);
  const position = (label: string) => {
    const matrix = layout.layers.find(layer => layer.label === label)?.matrix;
    assert.equal(matrix?.length, 16, label);
    return matrix!.slice(12, 14);
  };
  const [terminalX, terminalY] = position('Terminal');
  const [squadsX, squadsY] = position('Squads');
  const [operatorX, operatorY] = position('Operators');
  const [friendsX, friendsY] = position('Friends');
  assert.ok(terminalX > layout.width / 2 && terminalY < squadsY);
  assert.ok(operatorX > squadsX && Math.abs(operatorY - squadsY) < 50);
  assert.ok(friendsX < layout.width / 2 && friendsY > squadsY);
  for (const layer of layout.layers) {
    if (layer.sprite) assert.ok(existsSync(`public/event-preview/tm_p3r_1/${layer.sprite}.webp`), layer.sprite);
  }
});

test('the Velvet Room draws the rotated light through the foreground grille on the shadow timeline', () => {
  const scene: GameUiScene = JSON.parse(readFileSync('public/event-preview/bg_p3r_1/scene.json', 'utf8'));
  const nodes = scene.nodes.map(node => node.name);
  assert.deepEqual(nodes, ['flow_1', 'bg_p3r_1', 'shadow_1', 'shadow_2']);
  const roomTexture = scene.textures[scene.nodes[1].image!.texture!];
  const foreground = readFileSync(`public/event-preview/bg_p3r_1/${roomTexture.file}`);
  assert.equal(foreground.toString('ascii', 12, 16), 'VP8X');
  assert.equal(foreground[20] & 0x10, 0x10, 'the extended WebP preserves the grille alpha channel');
  const lightMaterial = scene.materials[scene.nodes[0].image!.material!];
  assert.equal(lightMaterial.values._HG_UV_ROTATION, 1);
  assert.deepEqual(lightMaterial.values._Rotation0, [0, 1, -1, 0]);
  assert.deepEqual(lightMaterial.values._Rotation1, [0, 1, -1, 0]);
  const lightTexture = scene.textures[scene.nodes[0].image!.texture!];
  assert.equal(lightTexture.file, 'mask_light.webp');
  assert.ok(existsSync(`public/event-preview/bg_p3r_1/${lightTexture.file}`));
  const value = (node: string, property: string, time: number) => {
    const curve = scene.curves.find(curve => curve.node === nodes.indexOf(node) && curve.property === property);
    assert.ok(curve, `${node} ${property}`);
    return curveValue(curve.keys, time);
  };
  for (const [shadow, time] of [['shadow_1', .83], ['shadow_2', 1.83]] as const) {
    assert.equal(value('flow_1', 'alpha', time), 1);
    assert.ok(value(shadow, 'uniforms._TintColor.3', time) > .25);
    assert.ok(value('flow_1', 'uniforms.arkMainUVOffset.0', time) < 0);
  }
  assert.equal(value('flow_1', 'alpha', 2), 0);
  assert.equal(value('flow_1', 'alpha', 5), 1);

  const headphones = layout.layers.find(layer => layer.effect === 'headphones');
  assert.equal(headphones?.shadow?.matrix.length, 16);
  assert.notDeepEqual(headphones?.shadow?.matrix, headphones?.matrix);
});
