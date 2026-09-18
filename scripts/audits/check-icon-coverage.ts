/**
 * Every icon path an operator record implies must resolve to a published file.
 *
 * Run with tsx (see package.json check:assets) so it can share the site's own release
 * logic: an operator that is not yet out on Global may legitimately lack art -- the
 * mirrors publish CN-first -- so its gaps are reported, not failed. The decision is
 * isOperatorReleased(), the same one every operator surface uses, never a guess here.
 *
 * Six of the eight path helpers in lib/operators/ build a filename out of a record's
 * own fields and return it unchecked, so a name the art was never published under is a
 * silent 404 that renders as a blank square. Nothing failed, nothing logged, and the
 * gaps were found by a reader: 152 base skills displayed a scraped "Replaces" suffix,
 * and eleven icons pointed at files that do not exist.
 *
 * This is a ratchet, not a wall. The eleven known gaps are listed in KNOWN_GAPS with
 * the reason each one is still open; a clean run means nothing NEW is broken. Delete an
 * entry when its art is published -- an entry that no longer refers to a missing file
 * fails too, so the list cannot rot.
 */
import fs from 'node:fs';
import { isOperatorReleased } from '../../lib/operators/operatorAvailability';
import { getEssentialIconPath } from '../../lib/operators/operatorIconPaths';

const index = JSON.parse(fs.readFileSync(new URL('../../data/assets/external-asset-index.json', import.meta.url), 'utf8'));
const published = new Set(index.files);
const root = new URL('../../data/', import.meta.url);

// Every gap still open. Each needs art published to arkpedia-image-assets, not a code
// change. Empty as of 2026-09-18: eleven entries lived here until their art was mapped
// (arkpedia-image-assets#9 and #10), and each came out the run it resolved -- which is
// the point of failing on a filled gap as well as a new one.
const KNOWN_GAPS = new Map<string, string>([
]);

const RARITY_WORDS: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };
// Mirrors FACTION_ICON_FILES in lib/operators/classBranchIcons.ts.
const FACTION_ICON_FILES: Record<string, string> = {
  Aegir: 'Ægir.webp', Blacksteel: 'Blacksteel Worldwide.webp', 'Elite Op': 'Rhodes Island-Elite Operator.webp',
  Lungmen: 'Yan-Lungmen.webp', 'Op A4': 'Op Team A4.webp', 'Op Reserve A1': 'Reserve Op Team A1.webp',
  'Op Reserve A4': 'Reserve Op Team A4.webp', 'Op Reserve A6': 'Reserve Op Team A6.webp',
  'Pinus Sylvestris': 'Pinus Sylvestris Knightclub.webp', "Chiave's Gang": "Chiave's Gang.webp",
  "Laios's Party": 'Rhodes Island.webp', 'Ave Mujica': 'Rhodes Island.webp',
};
const safe = (value: unknown) => String(value).replace(/[\\/*?:"<>|]/g, '').trim();

const operators: any[] = [];
for (const dir of fs.readdirSync(root).filter((name) => /^operators-\dstar$/.test(name))) {
  for (const file of fs.readdirSync(new URL(`${dir}/`, root)).filter((name) => name.endsWith('.json'))) {
    operators.push(JSON.parse(fs.readFileSync(new URL(`${dir}/${file}`, root), 'utf8')));
  }
}
if (operators.length < 400) throw new Error(`Only ${operators.length} operator records found; the scan is not reading the roster.`);

/** One entry per path a helper in lib/operators/ would build for this record. */
function* expected(operator: any): Generator<[string, string]> {
  const word = RARITY_WORDS[operator.rarity] || 'six';
  // getOperatorIconPath -- guarded for future operators only, so still worth checking.
  if (!operator.isFuture) yield [`${word}-star-icons/${safe(operator.name)} - Base.webp`, 'roster icon'];
  if (operator.class) yield [`class-icons/${safe(operator.class)}.webp`, 'class icon'];
  if (operator.branch) yield [`branch-icons/${safe(operator.branch)}.webp`, 'branch icon'];
  if (operator.faction) yield [`faction-icons/${FACTION_ICON_FILES[operator.faction] ?? `${operator.faction}.webp`}`, 'faction icon'];
  for (const skill of operator.skills?.skillList ?? []) {
    if (skill?.name) yield [`skill-icons/${safe(operator.name)} - ${safe(skill.name)}.webp`, 'skill icon'];
  }
  // getBaseSkillIconPath uses the RAW name: the published filenames carry the scraped
  // "Replaces …" suffix, and only the heading is cleaned. See operatorIconPaths.ts.
  for (const baseSkill of operator.baseSkills ?? []) {
    if (baseSkill?.name) yield [`base-skill-icons/${safe(operator.rawName ?? operator.name)} - ${safe(baseSkill.rawName ?? baseSkill.name)}.webp`, 'base skill icon'];
    // The tier badge beside it. Resolved through the real helper, not a copy of its
    // rule: "Level 30" was missing for 14 operators because only the helper knew "Base".
    const tier = getEssentialIconPath(baseSkill?.eliteLevel);
    if (tier) yield [decodeURIComponent(tier.slice(1)), 'elite tier icon'];
  }
}

const missing = new Map<string, string>();
// Gaps on operators not yet released on Global. Their art often lands after the record,
// and the user has ruled that acceptable, so these are listed rather than failed.
const deferred = new Map<string, string>();
const unreleased = new Set<string>();
let checked = 0;
for (const operator of operators) {
  const released = isOperatorReleased(operator);
  if (!released) unreleased.add(operator.name);
  for (const [path, kind] of expected(operator)) {
    checked++;
    if (published.has(path)) continue;
    const where = `${kind} for ${operator.name}`;
    if (released) { if (!missing.has(path)) missing.set(path, where); }
    else if (!deferred.has(path)) deferred.set(path, where);
  }
}

const unexpected = [...missing].filter(([path]) => !KNOWN_GAPS.has(path));
const fixed = [...KNOWN_GAPS.keys()].filter((path) => !missing.has(path));

if (unexpected.length) {
  console.error(`${unexpected.length} icon path(s) point at files that are not published:`);
  for (const [path, where] of unexpected) console.error(`  ${path}  (${where})`);
  console.error('\nPublish the art to the matching asset repository and add it to');
  console.error('data/assets/external-asset-index.json, or correct the record it is built from.');
  process.exit(1);
}
if (fixed.length) {
  console.error(`${fixed.length} entr(y/ies) in KNOWN_GAPS now resolve. Delete them from`);
  console.error('scripts/audits/check-icon-coverage.mjs so the list keeps meaning something:');
  for (const path of fixed) console.error(`  ${path}`);
  process.exit(1);
}
if (deferred.size) {
  console.log(`${deferred.size} icon path(s) missing on ${unreleased.size} operator(s) not yet released on Global -- reported, not failed:`);
  for (const [path, where] of deferred) console.log(`  ${path}  (${where})`);
}
console.log(`Checked ${checked} icon paths across ${operators.length} operators (${unreleased.size} unreleased); ${KNOWN_GAPS.size} known gaps, nothing new.`);
