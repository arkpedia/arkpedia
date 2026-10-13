#!/usr/bin/env node
/**
 * Finds class names the app renders that no stylesheet styles.
 *
 * This exists because of a real bug: `.enemy-rank-tag` and `.enemy-index` were both
 * being rendered with no rule anywhere, so a boss marker and every chapter/event
 * shorthand came out as plain body text instead of the badge and the teal code they
 * are elsewhere on the site. Nothing failed -- the page just quietly looked wrong,
 * and the only way to catch it was to read it.
 *
 * A name that rides on a styled one is NOT reported: `.base-facility-note` sits on
 * `.hint` and takes every pixel of its appearance from it, which is a naming hook and
 * not a missing rule. Only names that turn up with no styled company are flagged --
 * 45 became 8 the day that distinction went in.
 *
 * Two traps this deliberately handles, both of which hid that bug from a naive grep:
 *   - A class mentioned only inside :not() / :is() / :where() / :has() is NOT styled
 *     by that rule. `.enemy-hero-tags > span:not(.enemy-index)` made .enemy-index
 *     look defined while saying the opposite.
 *   - A class only ever used positionally, e.g. `.a .b { position: static }`, has no
 *     visual styling of its own. Those are reported separately rather than passed.
 *
 * Usage:
 *   node scripts/audits/check-unstyled-classes.mjs                 report everything, exit 0
 *   node scripts/audits/check-unstyled-classes.mjs --only enem     one area, exit 1 on a hit
 *   node scripts/audits/check-unstyled-classes.mjs --strict        whole app, exit 1 on a hit
 *   node scripts/audits/check-unstyled-classes.mjs --json          machine-readable
 *
 * A bare run only reports: older pages have gaps of their own, and a check that
 * always fails is a check nobody runs. Scope it with --only to gate the page you are
 * working on.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const SRC_DIRS = ['pages', 'components'];
const CSS_DIR = 'styles';

/**
 * Properties that can only PLACE an element, never give it an appearance. A rule
 * made of nothing but these leaves a visible token looking like bare text, which is
 * how `.enemy-rank-tag` hid: its only rule was `position: static`.
 *
 * Margins are deliberately absent. `margin-bottom` alone is a complete and correct
 * style for a block wrapper, so counting it here reported every section wrapper in
 * the app as broken.
 */
const LAYOUT_ONLY = new Set([
  'position', 'top', 'right', 'bottom', 'left', 'z-index', 'order', 'grid-area', 'inset',
]);

/**
 * Classes that are meant to carry no styling, with the reason. Keep this short and
 * keep the reason honest -- an entry here is a promise that the element looks right
 * without a rule, not a way to quiet the check.
 */
const INTENTIONALLY_UNSTYLED = new Map([
  ['gm-co-hintlayer', 'fixed overlay host; .gm-co-hintcard supplies the visible hint panel'],
  ['record-dialog-wrap', 'fixed overlay host; the record dialog and backdrop supply the appearance (components/ui/RecordDialog.tsx)'],
  ['site-nav-menu', 'relative positioning anchor for the styled dropdown and trigger'],
  ['enemy-appear-list-group', 'role="group" hook for the listbox; the stages page leaves .stage-picker-group unstyled for the same reason'],
  ['stage-picker-group', 'role="group" hook inside the picker popover; the options carry the styling'],
  ['stage-picker', 'positioned by .stage-picker in stages.css, which is the whole job -- the popover is fixed and measures against it'],
  ['event-detail-carousel', 'positioned by events.css; the slides inside it are what is styled'],
  ['base-facility-notes', 'stacks .hint paragraphs in normal block flow -- the notes carry every pixel'],
  ['gacha-content-group', 'groups a heading and a row so the two stay together; both are styled, the group is a name'],
  ['stage-legend-overlay-inner', 'click-and-key catcher filling .stage-legend-overlay, which sizes and places it'],
  ['music-prev-btn', 'a plain <button> with the site button look; the hook places it in the phone player grid (music.css, max-width 380px)'],
  ['music-next-btn', 'a plain <button> with the site button look; the hook places it in the phone player grid (music.css, max-width 380px)'],
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.tsx', '.ts', '.jsx', '.js'].includes(extname(name))) out.push(p);
  }
  return out;
}

// ---- what the app renders -------------------------------------------------
// className="a b", className={`a ${x} b`}, className={cond ? 'a' : 'b'}.
// A token holding an interpolation becomes a prefix probe instead of a literal,
// so `rank-${enemy.rank}` asks "is anything named rank-* styled?".
const rendered = new Map();
const prefixes = new Map();
/**
 * Every className attribute as a set of the literal names in it, so a name can be
 * asked whether it ever appears WITHOUT styled company.
 *
 * This is what separates a missing rule from a naming hook. `.base-facility-note`
 * has no rule of its own and never needed one: it rides on `.hint`, which has all
 * the styling, and exists so the page can be read and searched. Reporting the two
 * the same way is what made this check 45 lines long and mostly noise.
 *
 * Imprecise in one direction, deliberately: `cond ? 'a' : 'b'` puts a and b in one
 * group though they never share an element, so a broken class paired with a styled
 * one in a ternary reads as a hook. Narrowing that would mean parsing the
 * expression, and the check would rather understate than cry wolf.
 */
const groups = [];
/* r10 x-buttons: a component that renders its own primitive class alongside the one it
 * is given. components/ui/XButton puts .btn-x beside its className, so a class given to
 * <XButton> (.gm-sheetclose, .schedule-panel-close-btn) places a styled button and rides
 * on .btn-x, as a class beside .ghost does. */
const COMPONENT_CLASSES = { XButton: ['btn-x'] };

/** CSS written inside a component with styled-jsx, which styles/*.css cannot see.
 *  One page does it (community.tsx) and its three wrappers read as unstyled without
 *  this -- the check would have been telling that page to fix what it had done. */
const jsxCss = [];

for (const dir of SRC_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    const rel = relative(ROOT, file);
    for (const m of text.matchAll(/<style jsx[^>]*>\{`([\s\S]*?)`\}<\/style>/g)) {
      jsxCss.push([`${rel} (styled-jsx)`, m[1]]);
    }
    for (const m of text.matchAll(/className=(?:"([^"]*)"|\{((?:[^{}]|\{[^{}]*\})*)\})/g)) {
      const raw = (m[1] ?? m[2] ?? '').replace(/['"`]/g, ' ');
      const group = new Set();
      const tag = text.slice(text.lastIndexOf('<', m.index) + 1).match(/^[A-Za-z][\w.]*/)?.[0];
      for (const c of COMPONENT_CLASSES[tag] ?? []) group.add(c); // r10 x-buttons
      for (const tok of raw.matchAll(/[A-Za-z][A-Za-z0-9_-]*(?:\$\{[^}]*\})?/g)) {
        const t = tok[0];
        if (t.includes('${')) {
          const pre = t.slice(0, t.indexOf('${'));
          if (pre.includes('-')) {
            push(prefixes, pre, rel);
            // Company too: `farming-tile-grid-open${...}` is a styled name with an
            // interpolation stuck to it, not an unknown.
            group.add(pre);
          }
        } else if (/^[a-z][a-z0-9-]*$/.test(t)) {
          // Only hyphenated names are REPORTED -- a bare word is as likely to be a
          // stray identifier as a class. All of them count as company, though:
          // .base-facility-note rides on .hint, and .music-add-playlist-btn on
          // .ghost, so leaving the single words out of the group made both of them
          // look alone.
          if (t.includes('-')) push(rendered, t, rel);
          group.add(t);
        }
      }
      if (group.size) groups.push(group);
    }
  }
}
function push(map, key, val) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(val);
}

// ---- what the stylesheets actually style ----------------------------------
const styled = new Set();      // appears in a real selector
const layoutOnly = new Map();  // appears, but the rule only positions it

const sheets = readdirSync(join(ROOT, CSS_DIR), { recursive: true })
  .filter((name) => name.endsWith('.css'))
  .map((name) => [name, readFileSync(join(ROOT, CSS_DIR, name), 'utf8')]);

for (const [name, css] of [...sheets, ...jsxCss]) {
  // strip comments so commented-out rules do not count as definitions
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1];
    const body = m[2];
    if (selector.trim().startsWith('@')) continue;
    // a class named only inside a functional pseudo is being EXCLUDED, not styled
    const effective = selector.replace(/:(?:not|is|where|has)\([^()]*\)/g, '');
    const props = [...body.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((p) => p[2]);
    const onlyPlacement = props.length > 0 && props.every((p) => LAYOUT_ONLY.has(p));
    for (const c of effective.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)) {
      if (onlyPlacement) push(layoutOnly, c[1], `${name}: ${selector.trim()}`);
      else styled.add(c[1]);
    }
  }
}

// ---- report ---------------------------------------------------------------
const bare = [...rendered.keys()]
  .filter((c) => !styled.has(c) && !INTENTIONALLY_UNSTYLED.has(c))
  .sort();
/** Unstyled, but never alone: every element carrying it carries a styled class too. */
const styledList = [...styled];
/** `.a` keeps company with a probe `b-${...}` when something styled starts with b-.
 *  farming.tsx renders `farming-tile-grid farming-tile-grid-open${...}`, where the
 *  interpolation swallows the styled name into a prefix and left the base looking
 *  alone. */
const companion = (g, self) => [...g].some((other) => other !== self
  && (styled.has(other) || (other.endsWith('-') === false && styledList.some((c) => c.startsWith(`${other}-`)))));
const hooks = new Set(bare.filter((c) => {
  const mine = groups.filter((g) => g.has(c));
  return mine.length > 0 && mine.every((g) => companion(g, c));
}));
const unstyled = bare.filter((c) => !hooks.has(c));
const deadPrefixes = [...prefixes.keys()]
  .filter((p) => ![...styled].some((c) => c.startsWith(p)))
  .sort();
const placementOnly = unstyled.filter((c) => layoutOnly.has(c));

// --only <text> narrows the report to one area, so a page can be checked without
// the app's pre-existing gaps elsewhere burying the result.
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt !== -1 ? process.argv[onlyAt + 1] : null;
const inScope = (c, files) =>
  !only || c.includes(only) || [...files].some((f) => f.includes(only));

const hits = unstyled.filter((c) => inScope(c, rendered.get(c)));
/** A probe is not dead when its element carries a styled class: ScrollableRow
 *  renders `scrollable-row-arrow scrollable-row-arrow-left${...}`, where the arrow
 *  itself has every rule and left/right are names for the two ends. */
const deadHits = deadPrefixes
  .filter((p) => !groups.some((g) => g.has(p) && companion(g, p)))
  .filter((p) => inScope(p, prefixes.get(p)));

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ unstyled: hits, hooks: [...hooks], deadPrefixes: deadHits, placementOnly }, null, 2));
} else {
  const scope = only ? ` matching "${only}"` : '';
  if (!hits.length && !deadHits.length) {
    console.log(`All ${rendered.size} rendered class names${scope} are styled or ride on one that is`
      + ` (${hooks.size} of them ride).`);
  } else {
    if (hits.length) {
      console.log(`Rendered but never styled${scope} (${hits.length} of ${rendered.size}):`);
      for (const c of hits) {
        const where = [...rendered.get(c)].join(', ');
        const placed = layoutOnly.get(c);
        const note = placed ? `\n${' '.repeat(35)}only placed by -> ${[...placed][0]}` : '';
        console.log(`  .${c.padEnd(30)} ${where}${note}`);
      }
    }
    if (deadHits.length) {
      console.log(`\nDynamic class prefixes with nothing styled under them:`);
      for (const p of deadHits) {
        console.log(`  ${p}\${...}   rendered in ${[...prefixes.get(p)].join(', ')}`);
      }
    }
  }
}

// Unscoped runs report and succeed: the app has older gaps on other pages, and a
// check that always fails gets ignored. Scoped or --strict runs gate.
const gating = Boolean(only) || process.argv.includes('--strict');
process.exit(gating && (hits.length || deadHits.length) ? 1 : 0);
