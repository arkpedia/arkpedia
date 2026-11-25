import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import layout from '../../public/event-preview/tm_p3r_1/layout.json';
import theatreLayout from '../../public/event-preview/tm_redvelvet_1/layout.json';
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
  assert.equal(preview?.theme?.layout?.manifest, '/event-preview/tm_p3r_1/layout.json');
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
  assert.equal(layout.layers.find(layer => layer.label === 'Terminal')?.camera, 'right');
  assert.equal(layout.layers.find(layer => layer.label === 'Friends')?.camera, 'left');
  assert.equal(layout.layers.find(layer => layer.label === 'Makoto Yuki')?.fallbackFor, undefined);
  assert.notDeepEqual(layout.motion.left.right, layout.motion.right.right);
  for (const layer of layout.layers) {
    if (layer.sprite) assert.ok(existsSync(`public/event-preview/tm_p3r_1/${layer.sprite}.webp`), layer.sprite);
  }
});

test('Theatre uses its own prefab sprites and authored menu motion through the shared preview', () => {
  const pack = { name: '剧场序幕组合包', region: 'CN', contents: [] };
  const preview = regionalPackCosmeticPreview('act52side', pack, 'https://ak.hypergryph.com/news/5101', undefined);
  const art = preview?.theme?.layout?.artRoot;
  assert.equal(art, '/event-preview/tm_redvelvet_1');
  assert.equal(preview?.scene.gameData?.id, 'bg_redvelvet_1');
  assert.ok(existsSync(`public${preview?.scene.image}`));
  assert.equal(theatreLayout.layers.find(layer => layer.label === 'Terminal')?.camera, 'right');
  assert.equal(theatreLayout.layers.find(layer => layer.label === 'Friends')?.camera, 'left');
  assert.ok(theatreLayout.layers.some(layer => layer.sprite === 'squad_s1' && layer.motion && layer.motion.frames.length > 8));
  const profile = theatreLayout.layers.find(layer => layer.text === 'doctor')?.matrix;
  assert.ok(profile && profile[0] > 0 && profile[12] < theatreLayout.width / 2);
  for (const layer of theatreLayout.layers) {
    if (layer.sprite) assert.ok(existsSync(`public${art}/${layer.sprite}.webp`), layer.sprite);
  }
});

test('Celebration is a standalone background with BGM and no purchase offer', () => {
  const preview = regionalEventCosmeticPreview('act55side', undefined);
  assert.equal(preview?.scene.gameData?.id, 'bg_anniversary_1');
  assert.ok(existsSync(`public${preview?.scene.image}`));
  assert.equal(preview?.music?.preview, '/api/music-audio/697667');
  assert.ok(preview && !Object.hasOwn(preview, 'theme'));
  assert.equal(preview?.pack, undefined);
  assert.equal(regionalPackCosmeticPreview('act55side', globalPack, globalSource, data), undefined);
});

test('the Persona shop uses the original water shaders and looping record curves', () => {
  const directory = 'public/event-preview/tm_p3r_1';
  const scene: GameUiScene = JSON.parse(readFileSync(`${directory}/shop-scene.json`, 'utf8'));
  assert.equal(scene.transparent, true);
  assert.equal(scene.nodes.filter(node => /^wave_0[1-6]$/.test(node.name)).length, 6);
  assert.equal(scene.nodes.filter(node => node.rectMask).length, 2);
  assert.ok(scene.shaders.some(shader => shader.fragment.includes('_Time.y') && shader.name.endsWith('/Flowline-EndsFlat')));
  assert.equal(scene.curves.length, 4);
  assert.ok(scene.curves.every(curve => curve.duration === 40 && curve.keys.length > 2));
  for (const texture of scene.textures) assert.ok(existsSync(`${directory}/${texture.file}`), texture.file);
});

test('the Persona menus include the prefab particle emitters and their shared shard atlas', () => {
  const emitters = layout.layers.filter(layer => layer.effect === 'particles');
  assert.deepEqual(emitters.map(layer => layer.emitter), [
    'Terminal', 'Squads', 'Operators', 'Store', 'Headhunt', 'Friends', 'Archives',
  ]);
  const squads = emitters.find(layer => layer.emitter === 'Squads');
  assert.equal(squads?.camera, 'right');
  assert.equal(squads?.particles?.length, 5);
  for (const emitter of emitters) {
    assert.ok(existsSync(`public/event-preview/tm_p3r_1/${emitter.particleMask}.webp`));
    for (const particle of emitter.particles ?? []) {
      assert.equal(particle.frames[0].at(-1), 0);
      assert.equal(particle.frames.at(-1)?.at(-1), 0);
      assert.ok(particle.frames.some(([, , , , , , , r, g, , alpha]) => r > g && alpha > .3)
        || emitter.camera === 'left');
    }
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
