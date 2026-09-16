import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hasChinese = text => typeof text === 'string' && /\p{Script=Han}/u.test(text);
const isEnglish = text => typeof text === 'string' && /[A-Za-z]/.test(text) && !hasChinese(text);

export function localizeOperator(operator, handbook) {
  if (!handbook || handbook.charID !== operator.internalName) return operator;
  // Multiple stories can be alternate-form or conditional archives. Do not
  // flatten them or assign another form's text to this operator.
  const sections = new Map((handbook.storyTextAudio ?? [])
    .filter(group => group.stories?.length === 1 && isEnglish(group.stories[0].storyText))
    .map(group => [group.storyTitle, group.stories[0].storyText]));
  const next = structuredClone(operator);
  const profile = sections.get('Profile');
  if (profile && (!next.review?.official || hasChinese(next.review.official))) {
    next.review = { ...next.review, official: profile };
  }
  for (const file of next.files ?? []) {
    const text = sections.get(file.section);
    if (text && hasChinese(file.description)) file.description = text;
  }
  return next;
}

export function syncOperatorEnglish(root, handbook) {
  if (!handbook?.handbookDict || typeof handbook.handbookDict !== 'object') throw new Error('Invalid English handbook table');
  let changed = 0;
  for (const directory of fs.readdirSync(path.join(root, 'data')).filter(name => /^operators-\dstar$/.test(name))) {
    for (const file of fs.readdirSync(path.join(root, 'data', directory)).filter(name => name.endsWith('.json'))) {
      const at = path.join(root, 'data', directory, file);
      const operator = JSON.parse(fs.readFileSync(at, 'utf8'));
      const next = localizeOperator(operator, handbook.handbookDict[operator.internalName]);
      if (JSON.stringify(next) === JSON.stringify(operator)) continue;
      fs.writeFileSync(at, JSON.stringify(next, null, 2) + '\n');
      console.log(`English profile/archive text: ${operator.name}`);
      changed++;
    }
  }
  return changed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const table = process.env.ARKPEDIA_EN_HANDBOOK
    || `${process.env.ARKPEDIA_EN || '.cache/upstream/en-gamedata/en'}/gamedata/excel/handbook_info_table.json`;
  const changed = syncOperatorEnglish(process.cwd(), JSON.parse(fs.readFileSync(table, 'utf8')));
  console.log(`${changed} operator(s) gained published English profile/archive text.`);
}
