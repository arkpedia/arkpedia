/**
 * npx tsx scripts/import-operator-details.ts <stats.csv> <files.csv> <gamedata-dir> [--write]
 * gamedata-dir contains character_table.json, char_patch_table.json, favor_table.json and source.json.
 * Validates the entire import before writing. Without --write this is a read-only audit.
 */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readCsv } from './lib/operator-csv';
import { getBaseStats, STAT_KEYS, StatValues, StatPhase, OperatorStats, OperatorFile } from '../lib/operators/operatorStats';

const [statsPath, filesPath, gameDir, write] = process.argv.slice(2);
assert(statsPath && filesPath && gameDir, 'Usage: import-operator-details.ts <stats.csv> <files.csv> <gamedata-dir> [--write]');
assert(!write || write === '--write', 'Unknown argument');
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const statRows = readCsv(fs.readFileSync(statsPath, 'utf8'));
const fileRows = readCsv(fs.readFileSync(filesPath, 'utf8'));
const characters = { ...read(path.join(gameDir, 'character_table.json')), ...read(path.join(gameDir, 'char_patch_table.json')).patchChars };
const favorFrames = read(path.join(gameDir, 'favor_table.json')).favorFrames;
assert.equal(favorFrames.length, 201);
assert(favorFrames.every((frame: { data: { percent: number; battlePhase: number } }, index: number) => frame.data.percent === index && frame.data.battlePhase === Math.floor(index / 2)), 'Trust progression changed');
const columns = { hp: 'max_hp', atk: 'attack', def: 'defense', res: 'resistance', redeploy: 'redeploy_time', dp: 'dp_cost', block: 'block_count', interval: 'attack_interval' };
const gameKeys = { hp: 'maxHp', atk: 'atk', def: 'def', res: 'magicResistance', redeploy: 'respawnTime', dp: 'cost', block: 'blockCnt', interval: 'baseAttackTime' };
const number = (value: string): number => {
  assert(value?.trim() && Number.isFinite(Number(value)), `Invalid number: ${value}`);
  return Number(value);
};
const values = (row: Record<string, string>): StatValues => Object.fromEntries(STAT_KEYS.map(key => [key, number(row[columns[key]])])) as StatValues;
const byId = new Map<string, Record<string, string>[]>();
for (const row of statRows) {
  assert(row.character_id && row.operator && row.mode && row.range_id, 'Missing stat identity');
  byId.set(row.character_id, [...(byId.get(row.character_id) ?? []), row]);
}
const paths = [1, 2, 3, 4, 5, 6].flatMap(star => {
  const dir = `data/operators-${star}star`;
  return fs.readdirSync(dir).filter(file => file.endsWith('.json')).sort().map(file => path.join(dir, file));
});
const records = paths.map(file => ({ file, op: read(file) }));
const ownedIds = new Set(records.map(({ op }) => op.internalName));
assert(ownedIds.size === records.length, 'Duplicate or missing operator IDs');
const namesToIds = new Map<string, Set<string>>();
for (const row of statRows.filter(row => ownedIds.has(row.character_id))) {
  if (!namesToIds.has(row.operator)) namesToIds.set(row.operator, new Set());
  namesToIds.get(row.operator)!.add(row.character_id);
}
const filesById = new Map<string, OperatorFile[]>();
const excludedFiles: string[] = [];
const amiyaForms = new Map([['Caster', 'char_002_amiya'], ['Guard', 'char_1001_amiya2'], ['Medic', 'char_1037_amiya3']]);
for (const row of fileRows) {
  assert(row.operator && row.section && row.unlock && row.description, 'Empty archive field');
  let targets: string[];
  if (row.operator === 'Amiya') {
    const suffix = row.section.match(/\((Caster|Guard|Medic)(?: \/ (?:Caster|Guard|Medic))*\)$/)?.[0];
    assert(suffix, `Unmapped Amiya archive: ${row.section}`);
    targets = [...amiyaForms].filter(([form]) => suffix.includes(form)).map(([, id]) => id);
  } else {
    const ids = namesToIds.get(row.operator);
    if (!ids) {
      // These archives belong only to temporary recruitment units absent from the roster.
      assert(['Pith', 'Sharp', 'Stormeye', 'Touch', 'Tulip'].includes(row.operator), `Unmapped archive: ${row.operator}`);
      excludedFiles.push(row.operator); continue;
    }
    assert(ids.size === 1, `Ambiguous archive: ${row.operator}`);
    targets = [...ids];
  }
  for (const id of targets) {
    const entry = { section: row.section, unlock: row.unlock, description: row.description };
    const previous = filesById.get(id) ?? [];
    assert(!previous.some(file => file.section === entry.section), `Duplicate archive section: ${id}/${entry.section}`);
    filesById.set(id, [...previous, entry]);
  }
}

let checkedLevels = 0, exceptions = 0;
const payloads = records.map(({ file, op }) => {
  const rows = byId.get(op.internalName);
  assert(rows?.length, `Missing stats: ${op.name}`);
  const expectedMode = ['char_4195_radian', 'char_4230_mcnist'].includes(op.internalName) ? 'SO' : 'BASE';
  assert(rows.every(row => row.mode === expectedMode), `Mixed game modes: ${op.name}`);
  const game = characters[op.internalName];
  assert(game, `Missing trust source: ${op.name}`);
  const phases: StatPhase[] = [...new Set(rows.map(row => number(row.elite)))].sort().map(elite => {
    const levels = rows.filter(row => number(row.elite) === elite).sort((a, b) => number(a.level) - number(b.level));
    const minLevel = number(levels[0].level), maxLevel = number(levels[levels.length - 1].level);
    assert(Number.isInteger(elite) && elite >= 0 && elite <= 2 && minLevel === 1, `Invalid promotion: ${op.name}`);
    assert(maxLevel === levels.length && levels.every((row, index) => number(row.level) === index + 1), `Missing/duplicate levels: ${op.name} E${elite}`);
    const phase: StatPhase = { elite, minLevel, maxLevel, base: values(levels[0]), max: values(levels[levels.length - 1]), rangeId: levels[0].range_id };
    assert(game.phases[elite]?.maxLevel === maxLevel, `Promotion cap disagrees with game: ${op.name} E${elite}`);
    for (const [index, endpoint] of [[0, phase.base], [game.phases[elite].attributesKeyFrames.length - 1, phase.max]] as const) {
      const raw = game.phases[elite].attributesKeyFrames[index].data;
      for (const key of STAT_KEYS) assert.equal(endpoint[key], raw[gameKeys[key]], `${op.name} E${elite} endpoint ${key}`);
    }
    for (const row of levels) {
      const expected = values(row), calculated = getBaseStats(phase, number(row.level));
      const override: NonNullable<StatPhase['overrides']>[string] = {};
      for (const key of STAT_KEYS) if (Math.abs(calculated[key] - expected[key]) > 1e-9) override[key] = expected[key];
      if (row.range_id !== phase.rangeId) override.rangeId = row.range_id;
      if (Object.keys(override).length) { (phase.overrides ??= {})[row.level] = override; exceptions++; }
      assert.deepEqual(getBaseStats(phase, number(row.level)), expected);
      checkedLevels++;
    }
    return phase;
  });
  const favor = game.favorKeyFrames;
  // The game's internal favor level 50 is 100% displayed trust (not a 50% cap).
  assert.deepEqual(favor.map((frame: { level: number }) => frame.level), [0, 50]);
  assert(Object.values(favor[0].data).every(value => !value), `Nonzero initial trust: ${op.name}`);
  assert(Object.entries(favor[1].data).every(([key, value]) => !value || ['maxHp', 'atk', 'def'].includes(key)), `Unsupported trust attribute: ${op.name}`);
  const trust = { hp: favor[1].data.maxHp, atk: favor[1].data.atk, def: favor[1].data.def };
  const stats: OperatorStats = { phases, trust };
  const files = filesById.get(op.internalName);
  assert(files?.length, `Missing files: ${op.name}`);
  return { file, op: { ...op, stats, files } };
});

const sha256 = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = {
  sources: {
    stats: { file: path.basename(statsPath), sha256: sha256(statsPath), rows: statRows.length },
    files: { file: path.basename(filesPath), sha256: sha256(filesPath), rows: fileRows.length },
    trust: { ...read(path.join(gameDir, 'source.json')), characterSha256: sha256(path.join(gameDir, 'character_table.json')), patchSha256: sha256(path.join(gameDir, 'char_patch_table.json')), favorSha256: sha256(path.join(gameDir, 'favor_table.json')) },
  },
  operators: payloads.length, checkedLevels, exceptionLevels: exceptions,
  excludedStatIds: [...byId.keys()].filter(id => !ownedIds.has(id)).sort(),
  excludedArchiveOperators: [...new Set(excludedFiles)].sort(),
  excludedArchiveRows: excludedFiles.length,
  importedFiles: payloads.reduce((sum, { op }) => sum + op.files.length, 0),
};
if (write) {
  for (const { file, op } of payloads) fs.writeFileSync(file, JSON.stringify(op, null, 2) + '\n');
  fs.writeFileSync('data/operator-import-report.json', JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
