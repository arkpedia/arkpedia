import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripRichText } from '../lib/gametext.mjs';

const ROOMS = { CONTROL: 'Control Center', DORMITORY: 'Dormitory', HIRE: 'Office', MANUFACTURE: 'Factory', MEETING: 'Reception Room', POWER: 'Power Plant', TRADING: 'Trading Post', TRAINING: 'Training Room', WORKSHOP: 'Workshop' };
const clean = name => String(name ?? '').split('Replaces')[0].trim();
const norm = name => clean(name).replace(/[·’“”"']/g, '').replace(/\s+/g, '').toLowerCase();
const rank = skill => skill.phase ?? Math.max(0, ['Base', 'Elite 1', 'Elite 2'].indexOf(skill.eliteLevel));

/** Rebuild only base skills. Names/icons stay compatible with the site's assets and handlers.
 * EN supplies descriptions; CN-only translations retain their text, but use CN slot chains.
 * A missing/ambiguous join fails before ANY operator file is written. */
export function reconcileBaseSkills(operator, building, region, translations = {}) {
  const character = building.chars?.[operator.internalName];
  if (!character) throw new Error(`${operator.name}: no building_data character ${operator.internalName}`);
  const old = operator.baseSkills ?? [];
  const used = new Set();
  const skills = [];
  for (const [slot, chain] of (character.buffChar ?? []).entries()) {
    for (const entry of Array.isArray(chain.buffData) ? chain.buffData : []) {
      const buff = building.buffs[entry.buffId];
      if (!buff || !ROOMS[buff.roomType]) throw new Error(`${operator.name}: unknown buff ${entry.buffId}`);
      const phase = Number(entry.cond.phase.replace('PHASE_', ''));
      const exact = old.map((skill, index) => ({ skill, index })).filter(({ skill, index }) => !used.has(index) && skill.buffId === entry.buffId && skill.slot === slot && skill.phase === phase);
      let candidates = old.map((skill, index) => ({ skill, index })).filter(({ skill, index }) => !used.has(index) && skill.facility === ROOMS[buff.roomType] && norm(skill.name) === norm(buff.buffName));
      if (candidates.length > 1) candidates = candidates.filter(({ skill }) => rank(skill) === phase);
      if (!candidates.length && region === 'CN') {
        candidates = old.map((skill, index) => ({ skill, index })).filter(({ skill, index }) => !used.has(index) && skill.facility === ROOMS[buff.roomType] && rank(skill) === phase);
      }
      if (exact.length) candidates = exact;
      if (candidates.length > 1) candidates = candidates.filter(({ skill }) => skill.slot === slot && skill.phase === phase);
      if (candidates.length > 1) throw new Error(`${operator.name}: ambiguous translation join for ${entry.buffId}`);
      // CN text needs an existing translation. Ordering is valid only for repeated
      // same-facility/same-promotion steps within the record's source slot order.
      const prior = candidates[0] ?? (translations[entry.buffId] ? { skill: { ...translations[entry.buffId], icon: null } } : undefined);
      if (!prior && region === 'CN') throw new Error(`${operator.name}: untranslated ${entry.buffId}`);
      if (prior?.index !== undefined) used.add(prior.index);
      const level = entry.cond.level;
      skills.push({
        ...(prior?.skill ?? { icon: null }),
        name: prior ? prior.skill.name : buff.buffName.replace(/·/g, ' '),
        facility: ROOMS[buff.roomType],
        eliteLevel: phase === 0 && level > 1 ? `Level ${level}` : ['Base', 'Elite 1', 'Elite 2'][phase],
        description: region === 'Global' ? stripRichText(buff.description) : prior.skill.description,
        buffId: entry.buffId, slot, phase, level,
      });
    }
  }
  if (used.size !== old.length) throw new Error(`${operator.name}: ${old.length - used.size} existing base skills have no source match`);
  return skills;
}

export function importBaseSkills({ root, en, cn, write = false }) {
  const report = { operators: 0, skills: 0, global: 0, cn: 0, changed: [], descriptionChanges: [], problems: [] };
  const writes = [];
  const translationFile = path.join(root, 'data/base-skill-translations.json');
  const translations = fs.existsSync(translationFile) ? JSON.parse(fs.readFileSync(translationFile, 'utf8')) : {};
  for (const folder of fs.readdirSync(path.join(root, 'data')).filter(name => /^operators-.*star$/.test(name))) {
    for (const file of fs.readdirSync(path.join(root, 'data', folder)).filter(name => name.endsWith('.json'))) {
      const target = path.join(root, 'data', folder, file);
      const op = JSON.parse(fs.readFileSync(target, 'utf8'));
      // Combat-only Amiya forms deliberately carry no base skills; the original
      // operator owns those skills and must not be counted three times.
      if (/^Amiya \(/.test(op.name)) continue;
      report.operators++;
      const region = en.chars[op.internalName] ? 'Global' : 'CN';
      try {
        const skills = reconcileBaseSkills(op, region === 'Global' ? en : cn, region, translations);
        report[region === 'Global' ? 'global' : 'cn']++;
        report.skills += skills.length;
        for (const skill of skills) {
          const previous = (op.baseSkills ?? []).find(s => norm(s.name) === norm(skill.name) && rank(s) === skill.phase);
          if (previous?.description?.replace(/\s+/g, '') !== skill.description?.replace(/\s+/g, '')) report.descriptionChanges.push(`${op.name}|${skill.name}`);
        }
        if (JSON.stringify(skills) !== JSON.stringify(op.baseSkills)) {
          report.changed.push(op.name);
          writes.push([target, { ...op, baseSkills: skills }]);
        }
      } catch (error) { report.problems.push(error.message); }
    }
  }
  if (write && report.problems.length) throw new Error(`Base skill import refused:\n${report.problems.join('\n')}`);
  if (write) for (const [target, op] of writes) fs.writeFileSync(target, JSON.stringify(op, null, 2) + '\n');
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [enPath, cnPath] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  if (!enPath || !cnPath) throw new Error('Usage: node scripts/imports/import-base-skills.mjs EN/building_data.json CN/building_data.json [--write]');
  const report = importBaseSkills({ root: process.cwd(), en: JSON.parse(fs.readFileSync(enPath)), cn: JSON.parse(fs.readFileSync(cnPath)), write: process.argv.includes('--write') });
  fs.mkdirSync('.cache/base-audit', { recursive: true });
  fs.writeFileSync('.cache/base-audit/data-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, changed: report.changed.length, descriptionChanges: report.descriptionChanges.length }, null, 2));
  if (report.problems.length) process.exitCode = 1;
}
