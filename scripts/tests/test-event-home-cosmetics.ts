import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import layout from '../../public/event-preview/tm_p3r_1/layout.json';
import theatreLayout from '../../public/event-preview/tm_redvelvet_1/layout.json';
import { curveValue, type GameUiScene } from '../../lib/events/gameUiPlayer';
import { test } from 'node:test';
import { packCosmeticPreview, regionalEventCosmeticPreview, regionalPackCosmeticPreview } from '../../lib/events/cosmeticPreviews';
import { getHomePreview, homePreviewCatalogue, type GlobalHomeCosmetics } from '../../lib/home/previews';
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
  assert.equal(rewardTabsFor([], { packs: [], news: [], board: [], furniture: [], notices: [], cosmeticPreview }).length, 0);
  assert.equal(regionalEventCosmeticPreview(activity, data)?.theme?.name, 'Fixture Theme');
  assert.equal(regionalEventCosmeticPreview('act_other', data), undefined);
});

test('Persona uses the projected home prefab positions and serves every referenced sprite', () => {
  const preview = regionalPackCosmeticPreview(activity, cnPack, cnSource, undefined);
  assert.equal(preview?.theme?.layout?.manifest, '/event-preview/tm_p3r_1/layout.json');
  assert.equal(preview?.music?.preview, '/event-preview/bg_p3r_1/aria-of-the-soul-opening.m4a');
  assert.ok(existsSync(`public${preview?.music?.preview}`));
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
  assert.equal(theatreLayout.layers.find(layer => layer.label === 'Tragodia')?.camera, 'front');
  assert.equal(theatreLayout.layers.find(layer => layer.label === 'Breaking News')?.camera, 'left');
  assert.equal(theatreLayout.layers.find(layer => layer.label === 'Monthly Card')?.camera, 'left');
  const profile = theatreLayout.layers.find(layer => layer.text === 'doctor')?.matrix;
  assert.ok(profile && profile[0] > 0 && profile[12] < theatreLayout.width / 2);
  for (const layer of theatreLayout.layers) {
    if (layer.sprite) assert.ok(existsSync(`public${art}/${layer.sprite}.webp`), layer.sprite);
  }
});

test('Theatre recruitment captions keep their original transparent button margins', () => {
  for (const [sprite, width] of [['recruit_normal', 186], ['recruit_advance', 195]] as const) {
    const webp = readFileSync(`public/event-preview/tm_redvelvet_1/${sprite}.webp`);
    assert.equal(webp.toString('ascii', 12, 16), 'VP8L');
    const header = webp.readUInt32LE(21);
    assert.equal((header & 0x3fff) + 1, width);
    assert.equal(((header >>> 14) & 0x3fff) + 1, 129);
    assert.equal((header >>> 28) & 1, 1, 'the padding must be transparent');
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

test('matches imported backgrounds and themes by offer contents and game unlock descriptions', () => {
  const source = 'https://www.arknights.global/news/5092';
  const items = [{ name: 'Background - Strike Camp' }, { name: 'Home Screen UI - Hunt' }];
  const preview = packCosmeticPreview('Strike Camp Hunt Pack', source, items);
  assert.equal(preview?.scene.gameData?.id, 'bg_hunter_1');
  assert.equal(preview?.scene.title, 'Strike Camp');
  assert.equal(preview?.theme?.gameData?.id, 'tm_hunter_1');
  assert.equal(preview?.theme?.name, 'Hunt');
  assert.ok(packCosmeticPreview('结营出猎组合包', cnSource)?.theme);
  assert.equal(packCosmeticPreview('Strike Camp Hunt Pack', source)?.theme?.name, 'Hunt');
  assert.equal(preview?.music?.title, 'Cloudy Day');
  assert.ok(existsSync(`public${preview?.music?.preview}`));
  assert.equal(packCosmeticPreview('Unknown theme pack', source, [items[0], { name: 'Home Screen UI - Unknown' }]), undefined);
});

test('loads imported particle tracks and every referenced game texture', () => {
  for (const [id, emitter] of [['bg_redvelvet_1', 'xian_01'], ['bg_anniversary_1', 'yanhua'], ['bg_hunter_1', 'spark']]) {
    const root = `public/event-preview/${id}`;
    const scene: GameUiScene = JSON.parse(readFileSync(`${root}/scene.json`, 'utf8'));
    assert.equal(scene.continuous, true);
    assert.ok(scene.nodes.some(node => node.name.includes(emitter) && node.particleTracks?.length), id);
    for (const texture of scene.textures) assert.ok(existsSync(`${root}/${texture.file}`), texture.file);
  }
});

test('lists home cosmetics independently of events and mixes any two imported assets', () => {
  const catalogue = homePreviewCatalogue(data);
  assert.equal(catalogue.defaultBackgroundId, 'bg_rhodes_day');
  assert.ok(catalogue.backgrounds.some(room => room.id === 'bg_anniversary_1' && room.animated));
  assert.ok(catalogue.themes.some(theme => theme.id === 'tm_p3r_1' && theme.name === 'Fixture Theme'));
  assert.equal(catalogue.themes.find(theme => theme.id === 'tm_hunter_1')?.backgroundId, 'bg_hunter_1');

  const combination = getHomePreview('bg_p3r_1', 'tm_hunter_1', data);
  assert.equal(combination?.theme?.layout?.manifest, '/event-preview/tm_hunter_1/layout.json');
  assert.equal(combination?.scene.image, '/content-art/room.webp');
  assert.equal(combination?.music?.title, 'Aria of the Soul (P3R Version)');
  assert.equal(getHomePreview(undefined, 'tm_hunter_1')?.scene.gameData?.id, 'bg_rhodes_day');
  assert.equal(getHomePreview('bg_anniversary_1')?.theme, undefined);
  assert.equal(getHomePreview('bg_anniversary_1', 'tm_missing'), undefined);
});

test('Hunt exports its complete Global HUD with the native digits and Terminal mask', () => {
  const root = 'public/event-preview/tm_hunter_1';
  const layout = JSON.parse(readFileSync(`${root}/layout.json`, 'utf8')) as {
    sources: Record<string, string>;
    layers: {
      label?: string; text?: string; width: number; height: number; matrix: number[]; sprite?: string; content?: string; fontFace?: string;
      bitmap?: { atlas: string; glyphs: Record<string, number[]> };
      children?: { sprite: string }[];
    }[];
  };
  for (const label of ['Violet Mizutsune Orchid', 'Breaking News', 'Hunters of the Umbral Wilds', 'Recruitment']) {
    const sprite = layout.layers.find(layer => layer.label === label)?.sprite;
    assert.ok(sprite && existsSync(`${root}/${sprite}.webp`), label);
  }
  assert.ok(layout.sources['spritepack/ui_home_act_banner_gacha_en_0.ab']);
  const meter = layout.layers.find(layer => layer.text === 'sanity');
  assert.ok(meter);
  const digits = meter.bitmap;
  assert.deepEqual(Object.keys(digits?.glyphs ?? {}), [...'0123456789']);
  assert.ok(digits && existsSync(`${root}/${digits.atlas}.webp`));
  const terminalMask = layout.layers.find(layer => layer.sprite === 'btn_battle_softmask');
  assert.ok(terminalMask?.children?.some(child => child.sprite === 'btn_battle_circle_1'));
  assert.equal(layout.layers.some(layer => layer.sprite === 'btn_battle_circle_1'), false);
  assert.equal(layout.layers.find(layer => layer.text === 'progress')?.content, 'All Stages Cleared');
  // The projected center of the prefab belongs inside Terminal. Skipping the
  // slot's anchor puts it at about (685, 142), above and left of the panel.
  const { matrix, width, height } = meter;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const depth = matrix[3] * halfWidth + matrix[7] * halfHeight + matrix[15];
  const x = (matrix[0] * halfWidth + matrix[4] * halfHeight + matrix[12]) / depth;
  const y = (matrix[1] * halfWidth + matrix[5] * halfHeight + matrix[13]) / depth;
  assert.ok(Math.abs(x - 774) < 5 && Math.abs(y - 203) < 5, `Sanity center: ${x}, ${y}`);
  const dialogue = layout.layers.find(layer => layer.text === 'dialogue');
  assert.equal(dialogue?.content, "I see your workload hasn't changed, Doctor. Don't worry, I'll help you sort it out.");
  assert.equal(dialogue.height, 81);
  assert.equal(dialogue.fontFace, 'NotoSansHans-Medium');
  assert.equal(layout.layers.find(layer => layer.text === 'doctor')?.fontFace, dialogue.fontFace);
  assert.equal(layout.layers.find(layer => layer.text === 'level')?.fontFace, 'AEwide');
  assert.ok(layout.layers.some(layer => layer.sprite === 'tri'));
  assert.ok(existsSync(`${root}/tri.webp`));
  for (const key of ['sanity', 'maxSanity', 'lmd', 'orundum', 'originite']) {
    const matches = layout.layers.filter(layer => layer.text === key);
    assert.equal(matches.length, 1, key);
    assert.ok(matches[0].width > 0, key);
  }
});
