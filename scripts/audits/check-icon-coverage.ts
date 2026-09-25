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
 *
 * Two modes:
 *   npm run check:assets           (the Check workflow, every pull request) fails on a
 *                                  released operator's missing icon. A pull request that
 *                                  renames a record or changes a path helper is where that
 *                                  mistake is made, where the app's bundled data is all
 *                                  there is, and where it is cheapest to fix.
 *   npm run check:assets:release   (--quarantine, the daily content release) passes, and
 *                                  holds back only the icons: each such operator becomes a
 *                                  published-partial entry in data/quarantine.json (stage
 *                                  'icons', key operator:<id>, the missing paths in the
 *                                  reason). On a Global launch the record takes its official
 *                                  name the day the art under that name is still on its way,
 *                                  and one late icon must never hold back the day's release.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isOperatorReleased } from '../../lib/operators/operatorAvailability';
import { getEssentialIconPath } from '../../lib/operators/operatorIconPaths';
import { OPERATOR_PORTRAIT_PLACEHOLDER } from '../../lib/operators/operatorIcon';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { beginStage, defaultNow } from '../lib/quarantine.mjs';

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
  "Laios's Party": 'Rhodes Island.webp', 'Ave Mujica': 'Rhodes Island.webp', 'S.E.E.S': 'Rhodes Island.webp',
};
const safe = (value: unknown) => String(value).replace(/[\\/*?:"<>|]/g, '').trim();

/** One entry per path a helper in lib/operators/ would build for this record. */
function* expected(operator: any): Generator<[string, string]> {
  const word = RARITY_WORDS[operator.rarity] || 'six';
  // getOperatorIconPath -- an unpublished portrait shows OPERATOR_PORTRAIT_PLACEHOLDER
  // (checked once, below), but a released operator's own is still worth checking.
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

/** Runs the check on the data under `root`; returns what it prints and how it exits. */
export function checkIconCoverage({ root, now = defaultNow(), quarantine = false, minOperators = 400 }: { root: string; now?: Date; quarantine?: boolean; minOperators?: number }) {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data/assets/external-asset-index.json'), 'utf8'));
  const published = new Set(index.files);
  const operators: any[] = [];
  for (const dir of fs.readdirSync(path.join(root, 'data')).filter((name) => /^operators-\dstar$/.test(name))) {
    for (const file of fs.readdirSync(path.join(root, 'data', dir)).filter((name) => name.endsWith('.json'))) {
      operators.push(JSON.parse(fs.readFileSync(path.join(root, 'data', dir, file), 'utf8')));
    }
  }
  if (operators.length < minOperators) throw new Error(`Only ${operators.length} operator records found; the scan is not reading the roster.`);

  const missing = new Map<string, string>();
  // Every released operator's own gaps, for the quarantine: a shared icon (a new class
  // branch, a faction emblem) is missing from each of their pages.
  const gapsOf = new Map<string, { name: string; paths: string[] }>();
  // Gaps on operators not yet released on Global. Their art often lands after the record,
  // and the user has ruled that acceptable, so these are listed rather than failed.
  const deferred = new Map<string, string>();
  const unreleased = new Set<string>();
  let checked = 0;
  for (const operator of operators) {
    const released = isOperatorReleased(operator, now.getTime());
    if (!released) unreleased.add(operator.name);
    for (const [file, kind] of expected(operator)) {
      checked++;
      if (published.has(file)) continue;
      const where = `${kind} for ${operator.name}`;
      if (!released) { if (!deferred.has(file)) deferred.set(file, where); continue; }
      if (!missing.has(file)) missing.set(file, where);
      if (KNOWN_GAPS.has(file)) continue;
      const key = `operator:${operator.internalName || operator.name}`;
      const gaps: { name: string; paths: string[] } = gapsOf.get(key) ?? { name: operator.name, paths: [] };
      if (!gaps.paths.includes(file)) gaps.paths.push(file);
      gapsOf.set(key, gaps);
    }
  }

  // Every operator whose portrait is not published yet shows this one file instead, so
  // it is a gap on all of them at once.
  const placeholder = OPERATOR_PORTRAIT_PLACEHOLDER.slice(1);
  if (!published.has(placeholder)) missing.set(placeholder, 'portrait placeholder for every operator without one');
  const unexpected = [...missing].filter(([file]) => !KNOWN_GAPS.has(file));
  const fixed = [...KNOWN_GAPS.keys()].filter((file) => !missing.has(file));
  const out: string[] = [], errors: string[] = [];
  let exitCode = 0;
  if (quarantine) {
    const holds = beginStage(root, 'icons', now);
    for (const [key, { name, paths }] of gapsOf) {
      holds.add({ key, action: 'published-partial', reason: `${name}: icon(s) not published yet, shown blank: ${paths.sort().join(', ')}` });
    }
    const written = holds.commit();
    if (unexpected.length) {
      out.push(`${unexpected.length} icon path(s) on ${written.length} released operator(s) are not published yet -- held back as quarantine entries (stage 'icons' in data/quarantine.json), not failed:`);
      for (const [file, where] of unexpected) out.push(`  ${file}  (${where})`);
    }
    if (fixed.length) out.push(`${fixed.length} entr(y/ies) in KNOWN_GAPS now resolve; delete them from scripts/audits/check-icon-coverage.ts:`, ...fixed.map((file) => `  ${file}`));
  } else if (unexpected.length) {
    errors.push(`${unexpected.length} icon path(s) point at files that are not published:`);
    for (const [file, where] of unexpected) errors.push(`  ${file}  (${where})`);
    errors.push('\nPublish the art to the matching asset repository and add it to');
    errors.push('data/assets/external-asset-index.json, or correct the record it is built from.');
    errors.push('(The daily release runs this with --quarantine: there the gap holds back the icon, not the release.)');
    exitCode = 1;
  } else if (fixed.length) {
    errors.push(`${fixed.length} entr(y/ies) in KNOWN_GAPS now resolve. Delete them from`);
    errors.push('scripts/audits/check-icon-coverage.ts so the list keeps meaning something:');
    for (const file of fixed) errors.push(`  ${file}`);
    exitCode = 1;
  }
  if (!exitCode) {
    if (deferred.size) {
      out.push(`${deferred.size} icon path(s) missing on ${unreleased.size} operator(s) not yet released on Global -- reported, not failed:`);
      for (const [file, where] of deferred) out.push(`  ${file}  (${where})`);
    }
    out.push(`Checked ${checked} icon paths across ${operators.length} operators (${unreleased.size} unreleased); ${KNOWN_GAPS.size} known gaps, ${unexpected.length ? `${unexpected.length} held back` : 'nothing new'}.`);
  }
  return { exitCode, out, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { exitCode, out, errors } = checkIconCoverage({ root: fileURLToPath(new URL('../..', import.meta.url)), quarantine: process.argv.includes('--quarantine') });
  for (const line of out) console.log(line);
  for (const line of errors) console.error(line);
  process.exit(exitCode);
}
