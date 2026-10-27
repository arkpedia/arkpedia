import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

// Only small catalogue icons; no full portraits, outfits, posters or user URLs.
const icons = JSON.parse(readFileSync('data/assets/public-asset-index.json', 'utf8')).files
  .filter(path => /^(?:[a-z]+-star-icons|enemies-icons|npc-icons|faction-icons|alliance-icons|nation-marks|essential-icons|stat-icons|enemy-stat-icons|class-icons|branch-icons|material-icons|item-icons|skill-icons|base-skill-icons|profile-avatars|profile-ui)\/[^/]+\.(?:webp|png)$/.test(path))
  .sort();
writeFileSync('lib/account/profile-avatar-catalogue.json', `${JSON.stringify(icons)}\n`);
// Facility metadata comes from operator records, never guesses from an icon's colour.
const normalise = value => value.normalize('NFKC').replace(/Replaces.*$/, '').replace(/['’“”"\s._-]/g, '').toLowerCase();
const skills = new Map(), operators = new Map();
for (let rarity = 1; rarity <= 6; rarity++) {
  const folder = `data/operators-${rarity}star`;
  for (const file of readdirSync(folder).filter(name => name.endsWith('.json'))) {
    const op = JSON.parse(readFileSync(`${folder}/${file}`, 'utf8'));
    const facilities = new Set((op.baseSkills ?? []).map(skill => skill.facility).filter(Boolean));
    operators.set(normalise(op.name), facilities.size === 1 ? [...facilities][0] : null);
    for (const skill of op.baseSkills ?? []) {
      const name = (skill.rawName ?? skill.name ?? '').replace(/[\\/*?:"<>|]/g, '').trim();
      if (name && skill.facility) skills.set(normalise(`${op.name} - ${name}`), skill.facility);
    }
  }
}
const facilities = Object.fromEntries(icons.filter(id => id.startsWith('base-skill-icons/')).map(id => {
  const name = id.slice('base-skill-icons/'.length).replace(/\.(webp|png)$/, '');
  const operator = name.split(' - ')[0];
  return [id, skills.get(normalise(name)) ?? operators.get(normalise(operator)) ?? 'Other base skills'];
}));
writeFileSync('lib/account/profile-avatar-base-facilities.json', `${JSON.stringify(facilities)}\n`);
console.log(`Profile avatar catalogue: ${icons.length} trusted icons`);
