/**
 * Checks the stylesheets -- and the markup, for the two controls that have one
 * implementation -- for the kinds of inconsistency that make the site look like
 * several sites.
 *
 * WHY THIS EXISTS
 *
 * Styling here is mostly plain global CSS, one file per feature, all imported in
 * order by _app.tsx, plus a handful of CSS modules. There is no scoping for the
 * global files, so nothing stops a page from styling a class another page owns, and
 * nothing reports it when one does. Nothing reports a page that paints rarity in its
 * own hex, a heading at its own size, or a dropdown of its own either -- and each of
 * those was found live, several times over, by the 2026-09-25 UI review.
 *
 * What it reports (every rule reads styles/**.css and components/**.css):
 *
 *   collisions     the same bare class styled as the selector subject at top level in
 *                  two or more GLOBAL files, where load order decides. CSS modules are
 *                  left out: their class names are hashed per file and cannot collide.
 *   fontSizes      a font-size off the site's scale, including fractional nudges
 *   rawHex         a hex literal for a colour a token in shared.css already names
 *   rarityLiteral  a colour literal in a rule whose selector names rarity, a star,
 *                  a pull tile or .r1-.r6, or in a custom property named for rarity
 *                  under any selector but a :root token block -- rarity colour
 *                  comes from --rarity-N only
 *   oldTeal        the pre-token teal, rgb(77 232 209) / #4de8d1, anywhere (CSS or
 *                  TSX): it ignores the light theme
 *   pills          a 999px (pill) radius; radii come from the 2-4px token family
 *   h1Rules        an h1 font-size or text-transform outside styles/core/shared.css;
 *                  the page title has one size and one case, set there
 *   fontWeights    a rule that asks a webfont for a weight pages/_document.tsx does
 *                  not load, which the browser then fakes (faux bold)
 *   nativeControls a native <select> or a role="listbox" outside components/ui --
 *                  components/ui/StyledSelect (and SuggestMenu) are the only ones
 *   scrollbarThumb a scrollbar thumb in --line or --line-soft (scrollbar-color's
 *                  first colour, or a ::-webkit-scrollbar-thumb background): a
 *                  hairline alpha at 1.31:1, a scrollbar nobody can see. The thumb
 *                  is --text-faint, inherited from :root
 *   primaryToggle  a class list chosen by a condition in TSX where only one side has
 *                  'primary' (pages/dev excepted): that is a toggle whose "on" borrows the
 *                  primary action's fill. A toggle is a .filter-chip with
 *                  aria-pressed (or a .tgl with .is-on); a button whose label says
 *                  its state keeps one class
 *   tealDecoration a colour, background, border, outline or shadow in var(--teal),
 *                  --teal-dim or --teal-fill on a selector that names no state (:hover,
 *                  :focus, :active, :checked, [aria-pressed|selected|current|checked|
 *                  expanded], or a class for current, active, armed, live, on, open,
 *                  selected, picked or over). Teal means "on" or "current" and nothing
 *                  else (ui-primitives rule 1). Only the stylesheets in
 *                  TEAL_DECORATION_SCOPE, the families already clean; 2026-09-26 the
 *                  others still held about 190 such rules
 *   checkboxPrimitive  an <input type="checkbox"> in TSX that is not inside a <label>
 *                  whose class list has `check`: a boolean or an option is the one
 *                  .check checkbox (styles/core/arkpedia-theme.css), not a per-page box
 *   tglOutsideToolbar  a `tgl` class in TSX outside the files of TGL_SCOPE: .tgl is a
 *                  toolbar mode switch, and #64 used it to turn eleven checkboxes into
 *                  highlighted buttons, which the maintainer asked to undo (2026-09-26).
 *                  A setting or an option is a .check checkbox
 *   stretchedChoices, deadPrimitives, liveBadge  tabs and pick-one rows stretched
 *                  across their line, primitives nothing renders, and LIVE badges
 *                  painted outside .badge-live: see scripts/audits/audit-choices-badges.mjs
 *
 * It is a RATCHET. Today's accepted cases are counted in style-audit-baseline.json
 * next to this script. The run fails when anything is NEW (more occurrences of an
 * entry than the baseline counts) and also when an entry is STALE (the baseline
 * counts more than exist): a fixed case must leave the baseline, or it could come
 * back unnoticed. Either way the fix is the same command:
 *
 *   npm run audit:styles                 check against the baseline
 *   npm run audit:styles -- --update     accept the current state as the baseline
 *
 * --update is for (a) tightening after a fix and (b) a deliberate, reviewed
 * exception. Never run it to make new drift go away.
 *
 * STRICT rules reached zero when the page families landed (2026-09-25) and take no
 * baseline at all: any occurrence fails, --update refuses to accept one, and a
 * baseline that lists one fails too. Fix the rule instead. The others (collisions,
 * fontSizes, nativeControls) still carry accepted cases and stay ratchets.
 *
 * Static analysis has limits, stated so nobody over-trusts a clean run: a weight on a
 * rule that inherits its font family, an <h1 className={styles.title}>, and a colour
 * set from TSX are invisible here. tests/browser/page-bounds.spec.ts and the
 * ui-reference rig measure the rendered page.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChoicesAndBadges, CHOICE_BADGE_LABELS } from './audit-choices-badges.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const baselinePath = join(here, 'style-audit-baseline.json');

/** The sizes the site actually uses, and the display sizes it uses deliberately.
 *  9 to 13 is the body range; 15/18/22/26/30 are headings and controls; anything
 *  larger is a display numeral and is listed in the baseline by file. */
const SCALE = new Set([9, 10, 11, 12, 13, 15, 18, 22, 26, 30]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function walk(dir, ext) {
  return readdirSync(join(root, dir), { recursive: true })
    .filter((f) => ext.some((e) => f.endsWith(e)))
    .map((f) => join(dir, f))
    .sort();
}

/** Only the tokens whose value is a plain hex, since those are the ones a literal
 *  can duplicate. Read from shared.css so this cannot drift from the real values. */
function tokenHexes() {
  const css = stripComments(readFileSync(join(root, 'styles/core/shared.css'), 'utf8'));
  const out = new Map();
  for (const m of css.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out.set(m[2].toLowerCase(), m[1]);
  }
  return out;
}

/** The weights pages/_document.tsx loads, per family, from its Google Fonts URL. */
function loadedWeights() {
  const doc = readFileSync(join(root, 'pages/_document.tsx'), 'utf8');
  const url = doc.match(/fonts\.googleapis\.com\/css2\?([^"']+)/);
  if (!url) throw new Error('No Google Fonts URL in pages/_document.tsx');
  const out = new Map();
  for (const m of url[1].matchAll(/family=([^:&]+):wght@([\d;]+)/g)) {
    out.set(decodeURIComponent(m[1]).replace(/\+/g, ' '), new Set(m[2].split(';').map(Number)));
  }
  return out;
}

/** The webfont a font-family value (or a font shorthand) names first, if any. */
function familyOf(value) {
  if (/var\(--font-body\)|['"]?Inter['"]?\b/.test(value)) return 'Inter';
  if (/var\(--font-display\)|['"]?Rajdhani['"]?/.test(value)) return 'Rajdhani';
  if (/var\(--font-mono\)|JetBrains Mono/.test(value)) return 'JetBrains Mono';
  return null;
}

function weightOf(value) {
  const v = value.trim();
  if (v === 'normal') return 400;
  if (v === 'bold') return 700;
  return /^\d{3}$/.test(v) ? Number(v) : null;
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

/** Every innermost rule: { selector, body }. At-rule preludes (@media, @supports,
 *  @keyframes) are not selectors and are skipped; keyframe steps are dropped. */
function rules(css) {
  const out = [];
  for (const m of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    const selector = norm(m[1]);
    if (!selector || selector.startsWith('@') || /^(from|to|\d+%)([\s,]|$)/.test(selector)) continue;
    out.push({ selector, body: m[2] });
  }
  return out;
}

function declarations(body) {
  const out = [];
  for (const part of body.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    out.push({ prop: part.slice(0, i).trim().toLowerCase(), value: part.slice(i + 1).trim() });
  }
  return out;
}

const SUBJECT = /^\.([a-zA-Z][\w-]*)(?::{1,2}[\w()-]+)?$/;
/* "star" as a word or a hyphenated part (.six-star, .star-row), not inside "start". */
const TOKEN_BLOCK = /^:root(?:\[[^\]]*\]|:not\([^)]*\))*$/;
const RARITY_SELECTOR = /rarity|(?:^|[^a-z])stars?(?![a-z])|pull-|\.r[1-6]\b/i;
const COLOUR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\([^)]*\)/g;
const OLD_TEAL = /#4de8d1\b|rgba?\(\s*77[\s,]+232[\s,]+209\b/gi;
/** Where tealDecoration applies: page families whose stylesheets paint teal for a state
 *  only. Add a family's folder once it is clean; the rule is strict. */
const TEAL_DECORATION_SCOPE = [join('styles', 'stages') + '/'];
const TEAL = /var\(\s*--teal(?:-dim|-fill(?:-hi)?)?\s*\)/;
/** The files whose toolbars may use .tgl (a dense row of mode switches). None do today;
 *  add a file here only for a real toolbar, never for a setting or an option. */
const TGL_SCOPE = [];
/** A checkbox input, however the attribute is written. */
const CHECKBOX_INPUT = /<input\b(?:=>|[^>])*?\btype=(?:"checkbox"|'checkbox'|\{\s*['"`]checkbox['"`]\s*\})/g;
/** A <label> opening tag whose class list names .check: a quoted class list, or a
 *  template literal, that has `check` as a whole class name. */
const CHECK_LABEL = /^<label\b(?:=>|[^>])*?\bclassName=\{?\s*(['"`])(?:(?!\1)[\s\S])*?(?<![\w-])check(?![\w-])/;
const TEAL_PROPS = /^(?:color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|box-shadow|text-decoration(?:-color)?)$/;
/** A selector that says which state it paints: a pseudo-class, an ARIA state, or a state
 *  class (".current", ".stage-mode-live", ".drag-over"). */
const STATE_SELECTOR = /:(?:hover|focus|focus-visible|focus-within|active|checked)\b|\[aria-(?:pressed|selected|current|checked|expanded)|\.(?:[\w-]+-)?(?:current|active|armed|live|on|open|selected|picked|over)(?![\w-])/;
/** Whether a selector's SUBJECT (its last compound) is an h1 element: `.page h1`
 *  and `h1.title` are, `.head h1 .code` is not. */
const h1Subject = (selector) => /^h1(?=$|[.:#[])/.test(selector.trim().split(/\s*[\s>+~]\s*/).pop() || '');

function collect() {
  const cssFiles = [...walk('styles', ['.css']), ...walk('components', ['.css'])];
  const owners = new Map();   // class -> Set<file>
  const out = {
    collisions: [], fontSizes: [], rawHex: [], rarityLiteral: [], oldTeal: [],
    pills: [], h1Rules: [], fontWeights: [], nativeControls: [], scrollbarThumb: [], primaryToggle: [],
    tealDecoration: [], checkboxPrimitive: [], tglOutsideToolbar: [],
  };
  const tokens = tokenHexes();
  const weights = loadedWeights();

  for (const path of cssFiles) {
    const file = basename(path);
    const isModule = path.endsWith('.module.css');
    const raw = stripComments(readFileSync(join(root, path), 'utf8'));

    if (!isModule) {
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
    }
    for (const m of raw.matchAll(/font-size:\s*([0-9.]+)px/g)) {
      const px = Number(m[1]);
      if (!SCALE.has(px)) out.fontSizes.push(`${file}: ${px}px`);
    }
    for (const m of raw.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = m[0].toLowerCase();
      const token = tokens.get(hex);
      if (token && file !== 'shared.css') out.rawHex.push(`${file}: ${hex} is var(${token})`);
    }
    for (const m of raw.matchAll(OLD_TEAL)) out.oldTeal.push(`${path}: ${m[0].toLowerCase()}`);

    for (const { selector, body } of rules(raw)) {
      const decls = declarations(body);
      // A rarity rule's colours, and a custom property named for rarity anywhere
      // (--gacha-rarity-border: #F5D547 on .gacha-featured-chip-5 hid a literal behind a
      // selector that does not say rarity). Only the token blocks may hold the hex.
      if (!TOKEN_BLOCK.test(selector)) {
        const raritySelector = RARITY_SELECTOR.test(selector);
        for (const d of decls) {
          if (!raritySelector && !(d.prop.startsWith('--') && /rarity/i.test(d.prop))) continue;
          for (const lit of d.value.matchAll(COLOUR_LITERAL)) {
            out.rarityLiteral.push(`${path}: ${selector} { ${d.prop}: ${lit[0]} }`);
          }
        }
      }
      if (TEAL_DECORATION_SCOPE.some((scope) => path.startsWith(scope))) {
        const resting = selector.split(',').map((part) => part.trim()).filter((part) => part && !STATE_SELECTOR.test(part));
        for (const d of decls) {
          if (!resting.length || !TEAL_PROPS.test(d.prop) || !TEAL.test(d.value)) continue;
          out.tealDecoration.push(`${path}: ${resting.join(', ')} { ${d.prop} }`);
        }
      }
      for (const d of decls) {
        if (d.prop.includes('radius') && /\b9{3,}px\b/.test(d.value)) out.pills.push(`${path}: ${selector}`);
        const thumb = d.prop === 'scrollbar-color' ? d.value.trim().split(/\s+(?![^(]*\))/)[0]
          : /::-webkit-scrollbar-thumb/.test(selector) && (d.prop === 'background' || d.prop === 'background-color') ? d.value : null;
        if (thumb && /var\(\s*--line(?:-soft)?\s*[,)]/.test(thumb)) out.scrollbarThumb.push(`${path}: ${selector} { ${d.prop}: ${d.value} }`);
      }
      if (path !== join('styles', 'core', 'shared.css') && selector.split(',').some(h1Subject)) {
        for (const d of decls) {
          if (d.prop === 'font-size' || d.prop === 'text-transform' || (d.prop === 'font' && /\d/.test(d.value))) {
            out.h1Rules.push(`${path}: ${selector} { ${d.prop} }`);
          }
        }
      }
      let family = null;
      let weight = null;
      for (const d of decls) {
        if (d.prop === 'font-family') family = familyOf(d.value) ?? family;
        else if (d.prop === 'font-weight') weight = weightOf(d.value) ?? weight;
        else if (d.prop === 'font') {
          family = familyOf(d.value) ?? family;
          const w = d.value.match(/(?:^|\s)(\d{3}|bold|normal)\s/);
          if (w) weight = weightOf(w[1]);
        }
      }
      if (family && weight !== null && !weights.get(family)?.has(weight)) {
        out.fontWeights.push(`${path}: ${selector} asks ${family} for ${weight}`);
      }
    }
  }

  for (const path of [...walk('pages', ['.tsx']), ...walk('components', ['.tsx'])]) {
    const text = readFileSync(join(root, path), 'utf8');
    for (const m of text.matchAll(OLD_TEAL)) out.oldTeal.push(`${path}: ${m[0].toLowerCase()}`);
    // Code only: a comment that says "rather than a <select>" is not a select.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    // Every checkbox sits in its <label class="check">: the nearest <label> opened
    // before it and not yet closed has `check` in its class list.
    for (const m of code.matchAll(CHECKBOX_INPUT)) {
      const open = code.lastIndexOf('<label', m.index);
      const closed = open >= 0 && code.slice(open, m.index).includes('</label>');
      if (open < 0 || closed || !CHECK_LABEL.test(code.slice(open, m.index))) {
        out.checkboxPrimitive.push(`${path}: ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`);
      }
    }
    if (!TGL_SCOPE.includes(path)) {
      for (const m of code.matchAll(/(['"`])((?:(?!\1)[^\n])*?)\1/g)) {
        if (/(?:^|\s)tgl(?=\s|$|\$)/.test(m[2])) out.tglOutsideToolbar.push(`${path}: ${m[0].slice(0, 80)}`);
      }
    }
    if (path.startsWith(join('components', 'ui') + '/')) continue;
    for (const _ of code.matchAll(/<select[\s>]/g)) out.nativeControls.push(`${path}: <select>`);
    for (const _ of code.matchAll(/role(?:=|:\s*)["']listbox["']/g)) out.nativeControls.push(`${path}: role="listbox"`);
    if (!path.startsWith(join('pages', 'dev') + '/')) {
      // Any two quoted class lists chosen by a condition where exactly one side has
      // "primary": 'primary btn-sm' vs 'ghost' is the same toggle as 'primary' vs 'ghost'.
      for (const m of code.matchAll(/\?\s*(['"`])([^'"`]*)\1\s*:\s*(['"`])([^'"`]*)\3/g)) {
        if (/\bprimary\b/.test(m[2]) !== /\bprimary\b/.test(m[4])) out.primaryToggle.push(`${path}: ${m[0].replace(/\s+/g, ' ')}`);
      }
    }
  }

  Object.assign(out, collectChoicesAndBadges(root));

  out.collisions = [...owners.entries()]
    .filter(([, fs]) => fs.size > 1)
    .map(([cls, fs]) => `${cls}: ${[...fs].sort().join(', ')}`);
  for (const key of Object.keys(out)) out[key].sort();
  return out;
}

const LABELS = {
  collisions: 'the same bare class styled in more than one global stylesheet, so load order decides which wins',
  fontSizes: 'font-size off the scale (9-13 body, 15/18/22/26/30 display)',
  rawHex: 'a hex literal for a colour a token already names, so the light theme does not reach it',
  rarityLiteral: 'a colour literal in a rarity rule -- use var(--rarity-N), .rarity-N, .tier-N or .tier-fill-N',
  oldTeal: 'the pre-token teal literal -- use var(--teal) or color-mix(in srgb, var(--teal) N%, transparent)',
  pills: 'a 999px pill radius -- use var(--radius), var(--radius-frame) or var(--radius-control)',
  h1Rules: 'an h1 size or case outside styles/core/shared.css -- render components/ui/PageHeader',
  fontWeights: 'a webfont weight pages/_document.tsx does not load, so the browser fakes it',
  nativeControls: 'a native <select> or role="listbox" outside components/ui -- use components/ui/StyledSelect or SearchInput',
  scrollbarThumb: 'a scrollbar thumb in --line or --line-soft (1.31:1, invisible) -- drop the override and inherit :root\'s --text-faint',
  primaryToggle: "a class swapped between 'primary' and 'ghost' -- a toggle is a .filter-chip with aria-pressed; --teal-fill is for primary actions only",
  checkboxPrimitive: 'a checkbox outside a <label className="check"> -- a boolean or an option is the .check checkbox (styles/core/arkpedia-theme.css, docs/development/ui-primitives.md)',
  tglOutsideToolbar: `a .tgl outside a toolbar (TGL_SCOPE: ${TGL_SCOPE.length ? TGL_SCOPE.join(', ') : 'none'}) -- a setting or an option is a .check checkbox, a pick-one is SegmentedControl, an independent filter is a .filter-chip with aria-pressed`,
  tealDecoration: `teal on a selector that names no state, in ${TEAL_DECORATION_SCOPE.join(', ')} -- teal means "on" or "current"; recolour it (--text-dim, --heading for a heading) or qualify the selector with the state it marks`,
  ...CHOICE_BADGE_LABELS,
};

const STRICT = ['rawHex', 'rarityLiteral', 'oldTeal', 'pills', 'h1Rules', 'fontWeights', 'scrollbarThumb', 'primaryToggle', 'tealDecoration', 'checkboxPrimitive', 'tglOutsideToolbar',
  ...Object.keys(CHOICE_BADGE_LABELS)];

function counts(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

const found = collect();

if (process.argv.includes('--update')) {
  const refused = STRICT.filter((key) => found[key].length);
  if (refused.length) {
    for (const key of refused) {
      console.error(`\n${found[key].length} ${key} (strict, never accepted into the baseline): ${LABELS[key]}`);
      for (const line of found[key]) console.error(`  ${line}`);
    }
    console.error('\nNothing written. Fix these first.');
    process.exit(1);
  }
  writeFileSync(baselinePath, `${JSON.stringify(found, null, 2)}\n`);
  const n = Object.values(found).reduce((a, v) => a + v.length, 0);
  console.log(`style baseline updated: ${n} accepted entries`);
  for (const key of Object.keys(LABELS)) console.log(`  ${key.padEnd(15)} ${found[key].length}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error(`No baseline at ${relative(root, baselinePath)}. Run: npm run audit:styles -- --update`);
  process.exit(1);
}

let failed = false;
for (const key of STRICT) {
  if ((baseline[key] || []).length) {
    failed = true;
    console.error(`\nThe baseline accepts ${baseline[key].length} ${key} entr${baseline[key].length === 1 ? 'y' : 'ies'}, but ${key} is strict: empty that list and fix the rule.`);
  }
}
for (const key of Object.keys(LABELS)) {
  const have = counts(found[key] || []);
  const known = counts(baseline[key] || []);
  const fresh = [];
  const stale = [];
  for (const [entry, n] of have) for (let i = known.get(entry) || 0; i < n; i += 1) fresh.push(entry);
  for (const [entry, n] of known) for (let i = have.get(entry) || 0; i < n; i += 1) stale.push(entry);
  if (fresh.length) {
    failed = true;
    console.error(`\n${fresh.length} new: ${LABELS[key]}`);
    for (const line of fresh) console.error(`  ${line}`);
  }
  if (stale.length) {
    failed = true;
    console.error(`\n${stale.length} fixed but still in the baseline (${key}) -- tighten it with --update so they cannot come back:`);
    for (const line of stale) console.error(`  ${line}`);
  }
}

if (failed) {
  console.error('\nFix new entries (or accept a reviewed exception), then: npm run audit:styles -- --update');
  process.exit(1);
}
const summary = Object.keys(LABELS).map((key) => `${key} ${found[key].length}`).join(', ');
console.log(`styles: nothing new and nothing stale against the baseline (${summary})`);
