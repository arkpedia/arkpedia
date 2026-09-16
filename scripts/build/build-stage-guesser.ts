import fs from 'node:fs';
import path from 'node:path';
import { buildStageGuesserCatalogue } from '../../lib/minigames/stageGuesserData';
const { entries, answers, layouts, groups } = buildStageGuesserCatalogue();
const out = path.join(process.cwd(), 'public/stage-guesser');
// This directory contains only generated outputs. Remove obsolete hash-named
// layouts/catalogues so they cannot accumulate in subsequent content releases.
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'layouts'), { recursive: true });
for (const [key, layout] of layouts) {
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) throw new Error(`Invalid stage layout name: ${key}`);
  fs.writeFileSync(path.join(out, 'layouts', `${key}.json`), JSON.stringify(layout));
}
const json = JSON.stringify({ entries, answers });
const catalogueUrl = '/stage-guesser/catalogue.json';
fs.writeFileSync(path.join(process.cwd(), 'public', catalogueUrl), json);
const counts = { all: entries.length, classic: entries.filter((e) => e.classic).length };
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ catalogueUrl, groups, counts }));
console.log('Stage Guesser:', counts, `${groups.length} groups; ${answers.length} searchable answers; layouts loaded per round.`);
