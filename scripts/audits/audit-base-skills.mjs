/**
 * Checks the base-skill model against the game's own building_data.json.
 *
 * WHY THIS EXISTS
 *
 * Every base skill reaches the calculation one of two ways: an entry in a
 * lib/base/*SpecialSkills.ts map keyed "Operator|SkillName", or a generic regex
 * over its English description. Both fail silently. A handler key with a quote
 * the scraped name lacks is never called; a skill matching no handler and no
 * regex is simply worth zero. Neither shows up in the UI, in tsc, or in a
 * build -- Viviana's key was wrong for as long as the handler existed, and the
 * only symptom was a number that looked plausible.
 *
 * So this reports three things the type system cannot:
 *
 *   activation  which skills are live at each Elite tier, against the game's
 *               own slot data -- catches an Elite 2 skill that should replace
 *               its Elite 0 version but stacks with it instead
 *   dead keys   handler keys that match no real operator/skill pair
 *   coverage    skills no handler and no regex touches
 *
 * Known, accepted gaps live in the baseline file next to this script, so a
 * clean run means "nothing new", not "nothing at all". Add to the baseline
 * only for a deliberate decision (Training Room and Workshop are unmodelled on
 * purpose); anything else appearing here is a bug or an operator to wire up.
 *
 *   npm run audit:base                 check against the baseline
 *   npm run audit:base -- --update     accept current state as the baseline
 *
 * Needs the EN gamedata. It reads the same upstream cache the stage pipeline keeps, so
 * `npm run stages:refresh` is what fills it; ARKPEDIA_GAMEDATA overrides the path. The
 * default used to be a sibling checkout of the private arkpedia-database, which is
 * retired -- nothing here depends on a repo outside this one any more.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO = path.resolve(import.meta.dirname, '../..');
// Same directory scripts/stage-pipeline/lib/gamedata.mjs reads, so one refresh serves
// both and there is a single place to point at when it moves.
const GAMEDATA = process.env.ARKPEDIA_GAMEDATA
  ?? path.join(REPO, '.cache/upstream/en-gamedata/en/gamedata/excel');
const BASELINE = path.join(import.meta.dirname, 'base-skill-audit-baseline.json');
const UPDATE = process.argv.includes('--update');

const SPECIAL_FILES = {
  'Control Center': 'controlCenterSpecialSkills.ts',
  Dormitory: 'dormitorySpecialSkills.ts',
  Factory: 'factorySpecialSkills.ts',
  Office: 'officeSpecialSkills.ts',
  'Power Plant': 'powerPlantSpecialSkills.ts',
  'Reception Room': 'receptionRoomSpecialSkills.ts',
  'Trading Post': 'tradingPostSpecialSkills.ts',
};

// The generic regexes each facility's calculation actually runs. Kept in step
// with the *_PATTERN constants in lib/base/baseProductivity.ts -- a facility
// absent here has no generic parser, so its skills only count when handled.
const GENERIC = {
  Factory: [/productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i, /capacity[^.]{0,30}?([+-]\d+)/i,
    /morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i,
    /morale (consumed per hour|loss)[^.]{0,20}?(of operators in the|of all operators)/i],
  'Trading Post': [/order acquisition[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i, /order limit[^.\d+-]{0,10}?([+-]\d+)/i,
    /productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i,
    /morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i,
    /morale (consumed per hour|loss)[^.]{0,20}?(of operators in the|of all operators)/i],
  'Power Plant': [/(?:drone recovery rate|drone charging speed)[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i,
    /morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i],
  'Control Center': [/order efficiency[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i,
    /factor(?:y|ies)[^%]{0,40}?productivity[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i,
    /clue collection speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i,
    /increase[s]? morale[^%\d]{0,60}?([+-]?\d+(?:\.\d+)?)\s*(?:per hour|\/\s*hr)/i],
  'Reception Room': [/clue search speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i],
  Office: [/hr contacting speed[^%]{0,40}?(-?\d+(?:\.\d+)?)%/i],
  Dormitory: [/morale consumed per hour[^%\d]{0,10}?([+-]?\d+(?:\.\d+)?)/i,
    /morale (consumed per hour|loss)[^.]{0,20}?(of operators in the|of all operators)/i],
};

const ROOM_TO_FACILITY = {
  CONTROL: 'Control Center', DORMITORY: 'Dormitory', HIRE: 'Office', MANUFACTURE: 'Factory',
  MEETING: 'Reception Room', POWER: 'Power Plant', TRADING: 'Trading Post',
  TRAINING: 'Training Room', WORKSHOP: 'Workshop',
};
const PHASE_RANK = { PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 };
const TIERS = [['Base', 0], ['Elite 1', 1], ['Elite 2', 2]];

// The site stores these surname-first, or unquoted, where the game's table does
// the opposite. Not a bug in either -- just the join key this audit needs.
const ALIASES = {
  'Yūtenji Nyamu': 'Nyamu Yūtenji', 'Misumi Uika': 'Uika Misumi', 'Togawa Sakiko': 'Sakiko Togawa',
  'Wakaba Mutsumi': 'Mutsumi Wakaba', 'Yahata Umiri': 'Umiri Yahata', 'Justice Knight': "'Justice Knight'",
};

const cleanName = (n) => { const i = (n ?? '').indexOf('Replaces'); return (i === -1 ? n ?? '' : n.slice(0, i)).trim(); };
// Quote glyphs and interpuncts differ between the scrape and the game's table;
// that difference alone must not read as a mismatch.
const norm = (s) => (s ?? '').replace(/·/g, ' ').replace(/[’]/g, "'").replace(/[“”]/g, '"')
  .replace(/["']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

function readOperators() {
  const out = [];
  for (const dir of fs.readdirSync(path.join(REPO, 'data')).filter((d) => /^operators-\d?\w*star$/.test(d))) {
    const full = path.join(REPO, 'data', dir);
    for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.json'))) {
      const op = JSON.parse(fs.readFileSync(path.join(full, file), 'utf8'));
      out.push({ name: file.slice(0, -5), skills: op.baseSkills ?? [] });
    }
  }
  return out;
}

/** Handler keys a special-skills map declares, and which return only a note. */
function specialKeys(file) {
  const src = fs.readFileSync(path.join(REPO, 'lib', 'base', file), 'utf8');
  const keys = new Set(); const noteOnly = new Set();
  const re = /^[ \t]*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const raw = m[1] !== undefined ? m[1] : m[2];
    // TypeScript resolves \uXXXX at parse time, so the runtime key holds the
    // real character. Unescape those and the quotes, nothing else.
    const key = raw.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!key.includes('|')) continue;
    keys.add(key);
    const body = src.slice(m.index + m[0].length, m.index + m[0].length + 400).split(/\n {2}['"]/)[0];
    if (/note:/.test(body) && !/\b(?:productivity|capacity|clue[SC]|selfMorale|ccMorale|drone|hr\w*|order\w*|dormitory\w*|training\w*|felvine|targeted\w*|perFactory\w*|perTrading\w*|factoryB\w*|tradingPostB\w*|reception\w*|allO\w*|singleT\w*|ursus\w*)\s*:/.test(body)) noteOnly.add(key);
  }
  return { keys, noteOnly };
}

function slotTable() {
  const src = fs.readFileSync(path.join(REPO, 'lib', 'base', 'baseSkillSlots.ts'), 'utf8');
  const out = new Map();
  const re = /^ {2}'((?:[^'\\]|\\.)*)': \{ slot: (\d+), phase: (\d+), level: (\d+) \},/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.set(m[1].replace(/\\'/g, "'"), { slot: +m[2], phase: +m[3], level: +m[4] });
  }
  return out;
}

/** Mirrors the slot-table branch of combinedSkillsForElite() in pages/base.tsx. */
function activeSkills(opName, skills, facility, tierIndex, slots) {
  const forFacility = skills.filter((s) => s.facility === facility);
  const slotted = forFacility.map((s) => ({ s, meta: slots.get(`${opName}|${cleanName(s.name)}|${s.eliteLevel || 'Base'}`) }));
  if (!slotted.length || slotted.some((e) => !e.meta)) return null; // falls back to heuristics
  const best = new Map();
  for (const { s, meta } of slotted) {
    if (meta.phase > tierIndex) continue;
    const held = best.get(meta.slot);
    if (!held || meta.phase > held.meta.phase || (meta.phase === held.meta.phase && meta.level > held.meta.level)) {
      best.set(meta.slot, { s, meta });
    }
  }
  return [...best.values()].map(({ s }) => cleanName(s.name));
}

function main() {
  if (!fs.existsSync(path.join(GAMEDATA, 'building_data.json'))) {
    console.log(`SKIPPED: no gamedata at ${GAMEDATA}`);
    console.log('Run `npm run stages:refresh` to fill the upstream cache, or set');
    console.log('ARKPEDIA_GAMEDATA to a gamedata/excel directory.');
    return 0;
  }
  const bd = JSON.parse(fs.readFileSync(path.join(GAMEDATA, 'building_data.json'), 'utf8'));
  const ct = JSON.parse(fs.readFileSync(path.join(GAMEDATA, 'character_table.json'), 'utf8'));
  const buffs = bd.buffs;
  const byGameName = new Map();
  for (const [cid, c] of Object.entries(ct)) {
    if (!byGameName.has(c.name)) byGameName.set(c.name, []);
    byGameName.get(c.name).push(cid);
  }

  const operators = readOperators();
  const slots = slotTable();
  // A few skills are modelled directly in pages/base.tsx or through
  // computeResourcePools() rather than a facility map -- Senshi's Monster
  // Meals, Czerny's and Iris's resource conversions. They are handled, just
  // not somewhere the two checks above can see, so match them by name.
  // baseSkillSlots.ts is excluded deliberately: it is keyed by EVERY skill
  // name, so including it would mark everything as handled and hide real gaps.
  let elsewhereSrc = fs.readFileSync(path.join(REPO, 'pages', 'base.tsx'), 'utf8');
  for (const f of fs.readdirSync(path.join(REPO, 'lib', 'base')).filter((f) => f.endsWith('.ts') && f !== 'baseSkillSlots.ts')) {
    elsewhereSrc += fs.readFileSync(path.join(REPO, 'lib', 'base', f), 'utf8');
  }
  // Matched either as a bare skill name or as a full "Operator|Skill" key --
  // computeResourcePools() uses the latter form.
  const handledElsewhere = (opName, skillName) =>
    [`'${skillName}'`, `"${skillName}"`, `'${opName}|${skillName}'`, `"${opName}|${skillName}"`]
      .some((probe) => elsewhereSrc.includes(probe));
  const maps = Object.fromEntries(Object.entries(SPECIAL_FILES).map(([fac, f]) => [fac, specialKeys(f)]));
  const realKeys = new Set(); const realByNorm = new Map();
  for (const op of operators) {
    for (const s of op.skills) {
      const k = `${op.name}|${cleanName(s.name)}`;
      realKeys.add(k); realByNorm.set(norm(k), k);
    }
  }

  const found = { activation: [], deadKeys: [], coverage: [], unmatched: [] };

  for (const [fac, { keys }] of Object.entries(maps)) {
    for (const key of keys) if (!realKeys.has(key)) {
      const near = realByNorm.get(norm(key));
      found.deadKeys.push(`${fac}: ${key}${near ? `  (real name is ${near})` : '  (no similar skill exists)'}`);
    }
  }

  for (const op of operators) {
    if (!op.skills.length) continue;
    for (const s of op.skills) {
      const fac = s.facility; const desc = s.description ?? '';
      const key = `${op.name}|${cleanName(s.name)}`;
      const { keys, noteOnly } = maps[fac] ?? { keys: new Set(), noteOnly: new Set() };
      if (keys.has(key)) continue; // handled, or a documented note
      if ((GENERIC[fac] ?? []).some((re) => re.test(desc))) continue;
      if (handledElsewhere(op.name, cleanName(s.name))) continue;
      found.coverage.push(`${fac}: ${key}`);
    }
    const cids = (byGameName.get(ALIASES[op.name] ?? op.name) ?? []).filter((c) => bd.chars[c]);
    if (!cids.length) { found.unmatched.push(op.name); continue; }
    // An empty slot is stored as `buffData: {}`, not `[]`, so this cannot
    // assume an array -- 102 slots in the current dump look like that.
    const chains = bd.chars[cids[0]].buffChar
      .map((sl) => (Array.isArray(sl.buffData) ? sl.buffData : []))
      .filter((chain) => chain.length > 0);
    for (const [tier, rank] of TIERS) {
      const truth = new Map();
      for (const chain of chains) {
        const ok = chain.filter((b) => PHASE_RANK[b.cond.phase] <= rank);
        if (!ok.length) continue;
        const bestStep = ok.reduce((a, b) => (PHASE_RANK[b.cond.phase] > PHASE_RANK[a.cond.phase]
          || (PHASE_RANK[b.cond.phase] === PHASE_RANK[a.cond.phase] && b.cond.level > a.cond.level)) ? b : a);
        const buff = buffs[bestStep.buffId];
        const f = ROOM_TO_FACILITY[buff.roomType];
        if (!truth.has(f)) truth.set(f, new Set());
        truth.get(f).add(norm(buff.buffName));
      }
      const facilities = new Set([...truth.keys(), ...op.skills.map((s) => s.facility)]);
      for (const fac of facilities) {
        const app = activeSkills(op.name, op.skills, fac, TIERS.findIndex(([t]) => t === tier), slots);
        if (app === null) continue; // not covered by the slot table; heuristics apply
        const appSet = new Set(app.map(norm));
        const truthSet = truth.get(fac) ?? new Set();
        const extra = [...appSet].filter((x) => !truthSet.has(x));
        const missing = [...truthSet].filter((x) => !appSet.has(x));
        if (extra.length || missing.length) {
          found.activation.push(`${op.name} / ${tier} / ${fac}: extra=[${extra}] missing=[${missing}]`);
        }
      }
    }
  }

  for (const k of Object.keys(found)) found[k].sort();

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify(found, null, 1) + '\n');
    console.log('baseline updated:');
    for (const [k, v] of Object.entries(found)) console.log(`  ${k}: ${v.length}`);
    return 0;
  }

  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  let drift = 0;
  for (const [kind, items] of Object.entries(found)) {
    const known = new Set(baseline[kind] ?? []);
    const isNew = items.filter((i) => !known.has(i));
    const gone = [...known].filter((i) => !items.includes(i));
    console.log(`${kind}: ${items.length} total, ${known.size} baselined, ${isNew.length} NEW`);
    for (const i of isNew) { console.log(`   NEW  ${i}`); drift++; }
    for (const i of gone) console.log(`   fixed (still in baseline, drop it with --update)  ${i}`);
  }
  if (drift) {
    console.log(`\n${drift} new finding(s). Each is a skill the calculation gets wrong or ignores.`);
    console.log('Fix it, or -- if it is a deliberate omission -- run with --update to baseline it.');
    return 1;
  }
  console.log('\nNo new findings.');
  return 0;
}

process.exit(main());
