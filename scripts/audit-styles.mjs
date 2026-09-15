/**
 * Checks the stylesheets for the kinds of inconsistency that make the site look
 * like several sites.
 *
 * WHY THIS EXISTS
 *
 * Styling here is plain global CSS, one file per feature, all imported in order by
 * _app.tsx. There is no scoping, so nothing stops a page from styling a class
 * another page owns, and nothing reports it when one does. The failure is always
 * the same shape: two stylesheets define the same bare class, whichever loads last
 * wins, and a page inherits an appearance nobody chose for it. The recruitment page
 * drew its section headings in the operator page's amber that way, and its buttons
 * at a size no other page used, and neither showed up in tsc, in lint, or in a
 * build.
 *
 * So this reports three things no other check can:
 *
 *   collisions   the same bare class styled as the selector subject at top level in
 *                two or more files, which is the case where load order decides
 *   font sizes   declarations off the site's scale, including the fractional ones
 *                that were almost certainly a nudge rather than a decision
 *   raw hex      a colour written as a hex literal that a token already names, so
 *                the light theme silently does not apply to it
 *
 * Known, accepted cases live in the baseline next to this script, so a clean run
 * means "nothing new", not "nothing at all". Add to the baseline for a deliberate
 * decision; anything else appearing here is drift.
 *
 *   npm run audit:styles                 check against the baseline
 *   npm run audit:styles -- --update     accept the current state as the baseline
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const stylesDir = join(here, '..', 'styles');
const baselinePath = join(here, 'style-audit-baseline.json');

/** The sizes the site actually uses, and the display sizes it uses deliberately.
 *  9 to 13 is the body range; 15/18/22/26/30 are headings and controls; anything
 *  larger is a display numeral and is listed in the baseline by file. */
const SCALE = new Set([9, 10, 11, 12, 13, 15, 18, 22, 26, 30]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Only the tokens whose value is a plain hex, since those are the ones a literal
 *  can duplicate. Read from shared.css so this cannot drift from the real values. */
function tokenHexes() {
  const css = stripComments(readFileSync(join(stylesDir, 'shared.css'), 'utf8'));
  const out = new Map();
  for (const m of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out.set(m[2].toLowerCase(), m[1]);
  }
  return out;
}

/** Splits a stylesheet into its top-level text and the text inside @media blocks.
 *  A rule inside a media query is a responsive override and is expected to repeat
 *  a class another file defines, so only top level counts as a collision. */
function topLevel(css) {
  let out = css;
  for (const m of [...css.matchAll(/@media[^{]*\{/g)].reverse()) {
    let depth = 1;
    let i = m.index + m[0].length;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    out = out.slice(0, m.index) + out.slice(i);
  }
  return out;
}

const SUBJECT = /^\.([a-zA-Z][\w-]*)(?::{1,2}[\w()-]+)?$/;

function collect() {
  const files = readdirSync(stylesDir).filter((f) => f.endsWith('.css')).sort();
  const owners = new Map();   // class -> Set<file>
  const sizes = [];           // { file, px }
  const hexes = [];           // { file, hex, token }
  const tokens = tokenHexes();

  for (const file of files) {
    const raw = stripComments(readFileSync(join(stylesDir, file), 'utf8'));
    for (const m of topLevel(raw).matchAll(/([^{}]+)\{/g)) {
      for (const sel of m[1].split(',')) {
        const trimmed = sel.trim();
        if (!trimmed || trimmed.startsWith('@')) continue;
        const subject = trimmed.split(/[\s>+~]+/).pop();
        const hit = SUBJECT.exec(subject);
        if (!hit) continue;
        if (!owners.has(hit[1])) owners.set(hit[1], new Set());
        owners.get(hit[1]).add(file);
      }
    }
    for (const m of raw.matchAll(/font-size:\s*([0-9.]+)px/g)) {
      const px = Number(m[1]);
      if (!SCALE.has(px)) sizes.push({ file, px });
    }
    for (const m of raw.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = m[0].toLowerCase();
      const token = tokens.get(hex);
      if (token && file !== 'shared.css') hexes.push({ file, hex, token });
    }
  }

  const collisions = [...owners.entries()]
    .filter(([, fs]) => fs.size > 1)
    .map(([cls, fs]) => `${cls}: ${[...fs].sort().join(', ')}`)
    .sort();

  return {
    collisions,
    fontSizes: sizes.map((s) => `${s.file}: ${s.px}px`).sort(),
    rawHex: hexes.map((h) => `${h.file}: ${h.hex} is var(${h.token})`).sort(),
  };
}

const found = collect();

if (process.argv.includes('--update')) {
  writeFileSync(baselinePath, `${JSON.stringify(found, null, 2)}\n`);
  const n = Object.values(found).reduce((a, v) => a + v.length, 0);
  console.log(`style baseline updated: ${n} accepted entries`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error(`No baseline at ${basename(baselinePath)}. Run: npm run audit:styles -- --update`);
  process.exit(1);
}

const LABELS = {
  collisions: 'the same bare class styled in more than one stylesheet, so load order decides which wins',
  fontSizes: 'font-size off the scale (9-13 body, 15/18/22/26/30 display)',
  rawHex: 'a hex literal for a colour a token already names, so the light theme does not reach it',
};

let failed = false;
for (const key of Object.keys(LABELS)) {
  const known = new Set(baseline[key] || []);
  const fresh = (found[key] || []).filter((x) => !known.has(x));
  if (fresh.length === 0) continue;
  failed = true;
  console.error(`\n${fresh.length} new: ${LABELS[key]}`);
  for (const line of fresh) console.error(`  ${line}`);
}

if (failed) {
  console.error('\nFix these, or accept them deliberately with: npm run audit:styles -- --update');
  process.exit(1);
}
console.log('styles: nothing new against the baseline');
