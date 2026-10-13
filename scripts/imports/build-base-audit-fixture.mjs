import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stripRichText } from '../lib/gametext.mjs';
import { BASE_ROOMS } from '../lib/base-rooms.mjs';

const [enFile, cnFile] = process.argv.slice(2);
const en = JSON.parse(fs.readFileSync(enFile)), cn = JSON.parse(fs.readFileSync(cnFile));
const rooms = BASE_ROOMS;
const hashes = { en: createHash('sha256').update(fs.readFileSync(enFile)).digest('hex'), cn: createHash('sha256').update(fs.readFileSync(cnFile)).digest('hex') };
const operators = [];
const found = new Set();
for (const folder of fs.readdirSync('data').filter(name => /^operators-.*star$/.test(name))) for (const file of fs.readdirSync(path.join('data', folder))) {
  const op = JSON.parse(fs.readFileSync(path.join('data', folder, file)));
  if (/^Amiya \(/.test(op.name)) continue;
  const region = en.chars[op.internalName] ? 'en' : 'cn', table = region === 'en' ? en : cn;
  if (!table.chars[op.internalName]) throw new Error(`Missing source ${op.name}`);
  found.add(op.internalName);
  const steps = table.chars[op.internalName].buffChar.flatMap((chain, slot) => (Array.isArray(chain.buffData) ? chain.buffData : []).map(entry => {
    const buff = table.buffs[entry.buffId];
    return [entry.buffId, slot, Number(entry.cond.phase.replace('PHASE_', '')), entry.cond.level, rooms[buff.roomType], region === 'en' ? createHash('sha256').update(stripRichText(buff.description)).digest('hex') : null];
  }));
  operators.push({ name: op.name, internalName: op.internalName, region, steps });
}
for (const [id, char] of Object.entries(cn.chars)) if (!found.has(id) && char.buffChar.some(slot => Array.isArray(slot.buffData) && slot.buffData.length)) throw new Error(`Game operator ${id} missing from site`);
fs.writeFileSync('scripts/tests/fixtures/base-skill-source.json', JSON.stringify({ checkedAt: '2026-10-09', sources: ['https://github.com/ArknightsAssets/ArknightsGamedata/tree/master/en/gamedata/excel', 'https://github.com/Kengxxiao/ArknightsGameData/tree/master/zh_CN/gamedata/excel'], hashes, operators }) + '\n');
console.log(`${operators.length} operators; ${operators.reduce((s, o) => s + o.steps.length, 0)} skill steps; no missing game operators`);
