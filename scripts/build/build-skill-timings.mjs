/** node scripts/build/build-skill-timings.mjs /path/to/EN/excel
 * Data source: Aceship fork's YoStar EN gamedata mirror, skill_table.json and
 * character_table.json, including char_patch_table.json for Amiya's class forms.
 * Join by internalName and skill slot, validate level counts before supplementing
 * scraped durations. Target effect durations are separate from activation duration.
 * Missing/new CN operators retain their existing data until EN data is available.
 */
import fs from 'node:fs';
import path from 'node:path';
const input = process.argv[2] ?? '.cache/upstream/en-gamedata/en/gamedata/excel';
const read = name => JSON.parse(fs.readFileSync(path.join(input, name), 'utf8'));
const skills = read('skill_table.json');
const characters = { ...read('character_table.json'), ...read('char_patch_table.json').patchChars };
const operators = {};
for (let rarity = 1; rarity <= 6; rarity++) {
  const folder = `data/operators-${rarity}star`;
  for (const file of fs.readdirSync(folder).filter(file => file.endsWith('.json'))) {
    const op = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
    const character = characters[op.internalName];
    if (!character) continue;
    const ownSkills = op.skills?.skillList ?? (Array.isArray(op.skills) ? op.skills : []);
    if (ownSkills.length !== character.skills.length) throw new Error(`Skill slots differ: ${op.name}`);
    if (!ownSkills.length) continue;
    operators[op.internalName] = ownSkills.map((skill, slot) => {
      const source = skills[character.skills[slot].skillId];
      if (!source || source.levels.length !== skill.levels.length) throw new Error(`Skill levels differ: ${op.name} ${slot + 1}`);
      return source.levels.map(level => {
        if (level.duration > 0) return { kind: 'duration', seconds: level.duration };
        if (level.durationType === 'AMMO' || level.durationType === 1) return { kind: 'ammo' };
        if (level.duration === -1) {
          // These are the timed effect fields used by the reference viewer.
          const effect = (level.blackboard ?? []).find(item => ['duration', 'projectile_delay_time', 'max_duration'].includes(item.key) && item.value > 0);
          if (effect) return { kind: 'effect', seconds: effect.value };
          return { kind: 'instant' };
        }
        return null;
      });
    });
  }
}
fs.writeFileSync('data/skill-timings.json', JSON.stringify({ source: 'https://puppiizsunniiz.github.io/AN-EN-Tags/json/gamedata/ArknightsGameData_YoStar/en_US/gamedata/excel/', operators }) + '\n');
console.log(`Wrote timing metadata for ${Object.keys(operators).length} operators.`);
