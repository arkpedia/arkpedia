import fs from 'node:fs';
/** Inputs are reviewed, pinned inventories. No moving asset URL enters an operator page. */
export function chibiIndex(sd, tree, sdRevision, spineRevision, skins) {
  const raw = `https://raw.githubusercontent.com/arkpedia/arkpedia-sd-assets/${sdRevision}/`;
  const upstream = `https://raw.githubusercontent.com/fexli/ArknightsResource/${spineRevision}/spine/`;
  const prefabs = {};
  const paths = new Set(tree.tree.filter(entry => entry.type === 'blob').map(entry => entry.path));
  for (const file of paths) {
    if (!file.endsWith('.skel') || /\/build_/.test(file)) continue;
    const bits = file.split('/'), prefab = bits[1];
    // Bards use one battle Spine directory rather than Front / Back exports.
    const facing = bits[2] === 'Spine' ? 'front' : bits[2]?.toLowerCase();
    if (!prefab || !['front', 'back'].includes(facing)) continue;
    const directory = file.slice(0, file.lastIndexOf('/') + 1);
    const atlas = [...paths].find(value => value.startsWith(directory) && value.endsWith('.atlas'));
    const textures = [...paths].filter(value => value.startsWith(directory) && !value.slice(directory.length).includes('/') && /\.png$/i.test(value));
    if (!atlas || !textures.length) continue;
    const model = { skeleton: upstream + file, atlas: upstream + atlas, textures: Object.fromEntries(textures.map(value => [value.slice(directory.length), upstream + value])), premultipliedAlpha: false };
    (prefabs[prefab] ??= {})[facing] = model;
  }
  for (const model of Object.values(sd.models)) {
    if (model.kind !== 'operator' || model.variant !== 'default') continue;
    (prefabs[model.id] ??= {})[model.facing] = { skeleton: raw + model.skeleton.path, atlas: raw + model.atlas.path, textures: Object.fromEntries(model.textures.map(texture => [texture.path.split('/').pop(), raw + texture.path])), premultipliedAlpha: model.premultipliedAlpha ?? false };
  }
  const bySkin = {};
  for (const [id, skin] of Object.entries(skins.charSkins)) {
    if (!skin.charId?.startsWith('char_')) continue;
    const prefab = skin.battleSkin?.skinOrPrefabId;
    const key = !prefab || prefab === 'DefaultSkin' ? skin.charId : prefab.replace(/#/g, '_');
    if (prefabs[key]) bySkin[id] = prefabs[key];
  }
  return bySkin;
}
if (process.argv[1]?.endsWith('build-chibi-index.mjs')) {
  const [sdFile, treeFile, skinsFile, sdRevision, spineRevision] = process.argv.slice(2);
  if (![sdRevision, spineRevision].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))) throw Error('Provide SD manifest, Spine tree, skin table and both pinned commits.');
  const result = chibiIndex(JSON.parse(fs.readFileSync(sdFile)), JSON.parse(fs.readFileSync(treeFile)), sdRevision, spineRevision, JSON.parse(fs.readFileSync(skinsFile)));
  fs.writeFileSync('data/chibi-art.json', JSON.stringify(result) + '\n');
  console.log(Object.keys(result).length, 'skin IDs with native chibis');
}
