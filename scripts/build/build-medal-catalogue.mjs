/** Official EN medal descriptions and set membership, with already-published client icons. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildMedalCatalogue(table, published) {
  if (!Array.isArray(table.medalList) || !table.medalList.length || !table.medalTypeData) throw new Error('The EN medal table is missing medals or categories.');
  const types = Object.values(table.medalTypeData).sort((a, b) => a.sortId - b.sortId);
  const medals = table.medalList.map(m => ({ id: m.medalId, name: m.medalName, type: m.medalType, rarity: m.rarity,
    description: m.description ?? '', requirement: m.getMethod ?? '', advanced: m.advancedMedal ?? null, origin: m.originMedal ?? null,
    icon: published.has(`profile-medals/${m.medalId.toLowerCase()}.webp`) ? `/profile-medals/${m.medalId.toLowerCase()}.webp` : null }));
  const ids = new Set(medals.map(m => m.id));
  if (ids.size !== medals.length || medals.some(m => !m.id || !m.name || !m.type)) throw new Error('Invalid medal catalogue.');
  const sets = types.flatMap(type => (Array.isArray(type.groupData) ? type.groupData : []).map(g => ({ id: g.groupId, name: g.groupName,
    description: g.groupDesc ?? '', type: type.medalGroupId, medals: g.medalId, color: /^[a-fA-F0-9]{6}$/.test(g.groupBackColor) ? `#${g.groupBackColor}` : '#394b54' }))).reverse();
  if (sets.some(s => !Array.isArray(s.medals) || !s.medals.length || s.medals.some(id => !ids.has(id)))) throw new Error('A medal set references an unknown medal.');
  return { version: 1, medals, sets, categories: types.map(t => ({ id: t.medalGroupId, name: t.medalName })) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = path.join(process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata', 'en/gamedata/excel/medal_table.json');
  const catalogue = buildMedalCatalogue(JSON.parse(fs.readFileSync(source, 'utf8')), new Set(JSON.parse(fs.readFileSync('data/assets/external-asset-index.json', 'utf8')).files));
  fs.writeFileSync('public/medal-catalogue.json', `${JSON.stringify(catalogue)}\n`);
  console.log(`Medal catalogue: ${catalogue.medals.length} medals and ${catalogue.sets.length} sets.`);
}
