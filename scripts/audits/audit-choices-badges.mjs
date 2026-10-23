/**
 * Three strict audit:styles keys for tabs, pick-one rows and status badges, kept in a
 * file of their own so scripts/audits/audit-styles.mjs only has to merge them.
 *
 *   stretchedChoices  a pick-one or tab row stretched across its line. The maintainer's
 *                  mock (2026-09-26) had equal-width centred tabs, which put the first
 *                  label ~30px right of the section heading, and the census found the
 *                  site doing it for real: /operators/Amiya's voice-line categories at
 *                  +29.8px, /recruitment's view switch at +45.6, the calendar's layers
 *                  at +62.5, the map tools at +49.6, the music guesser's clip start at
 *                  +23.9, and the Terminal bar centred +26.9 off the frame. Rejected on a
 *                  choice ITEM (.filter-chip, .tab, [role=tab], or a child of a choice
 *                  row): flex-grow (flex: 1, flex: auto...) -- an item may centre its
 *                  own label, it may not grow. On a choice ROW: justify-content center,
 *                  space-* or stretch, and fr columns (repeat(n, 1fr), 1fr 1fr). A choice
 *                  row is .seg-control, .tabs, [role=tablist], any class named *-tabs or
 *                  *Tabs, every className given to <SegmentedControl> or <Tabs>, and every
 *                  element in TSX that holds two or more .filter-chip children or maps
 *                  them out. The exceptions are STRETCH_ALLOWED, each with its reason.
 *   deadPrimitives a class defined in styles/core/arkpedia-theme.css that no page,
 *                  component or lib file uses (pages/dev excluded: a primitive shown
 *                  only in the gallery is still dead on the site). `.tabs`, `.tab` and
 *                  `.seg*` sat there unused while four other tab looks grew up around
 *                  them. A class ending in -N counts as used where TSX builds it
 *                  (`tier-${n}`). Documented API that nothing renders today is
 *                  PRIMITIVE_KEEP, each with its reason.
 *   liveBadge      a LIVE / LIVE NOW / RUNNING NOW badge painted outside the one
 *                  .badge-live primitive. The census found four looks for one meaning
 *                  (mono 9/700 and Inter 10/700 on --danger-solid, mono 10/400 teal on
 *                  --teal-dim, the map's .badge-tradeable) and the primitive used by
 *                  none. In CSS: a rule outside arkpedia-theme.css whose subject has a
 *                  live-badge class (containing `live-badge` or `live-now-badge`, or
 *                  ending in `-live`, `is-live` excepted) and sets a font, a background or
 *                  a colour; position is the page's. In TSX: an element whose whole text
 *                  is LIVE, LIVE NOW or RUNNING NOW (a typed dot allowed) without the
 *                  badge-live class. LIVE_ALLOWED lists the non-badge matches.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Stretching that is right, with why. Keyed by `file: selector` (the rule's whole
 *  selector as written, whitespace collapsed). */
export const STRETCH_ALLOWED = new Map([
  ['styles/stages/stages-terminal.css: .supply-schedule > button',
    'Mon-Sun is a week: seven equal day cells on one line at every width, each stacking the day over the TODAY tick. At content width Wed and Thu would be wider than Mon and the strip would stop reading as a calendar row. The first cell\'s box still starts on the section edge.'],
  ['styles/planner/planner.css: .filter-chip.state-elite-chip',
    'The planner state form\'s E0/E1/E2: three promotion emblems (no text) in equal cells across the form\'s narrow column, the same size as the mastery and module rows under them. The first cell starts on the form\'s edge.'],
  ['styles/games/song-guesser.module.css: .stages',
    'The music guesser\'s clip-length scale (1s to 16s) under the full-width seek bar, in a listening console that is a centred composition (the 88px play button, the label and the volume are all centred): five equal cells span the bar they step along. The first cell\'s box starts on the console\'s content edge.'],
  ['styles/games/guesser.module.css: .categories',
    'The operator guesser\'s hint categories: ten sentences, each with its tick box, as a three-column checklist (two on a phone). Nothing is centred -- each label starts at its cell\'s left (.category, justify-content: flex-start) -- and the first cell starts on the section edge.'],
  ['styles/music/music.css: .music-player-bottombar-controls',
    'The music player\'s transport (like, credits, shuffle, previous, play, next, repeat, volume, queue): independent toggles and actions centred under the full-width seek bar, as every media player lays them out. Not a pick-one row, and no section heading sits above it.'],
  ['styles/music/music.css: .music-controls',
    'The corner player\'s transport (components/music/MusicPlayer.tsx): Favourite at the left, Previous, Play and Next centred, Queue at the right, under the seek bar of the song they control, as the /music bar lays them out. Independent toggles and actions, not a pick-one row, and no section heading sits above it.'],
  ['styles/music/music.css: .music-transport-buttons',
    'The music player bar\'s transport on a phone (components/music/MusicTransportBar.tsx): favourite, playlists, shuffle, previous, play, next, repeat and queue, centred under the song they control as every media player lays them out. Independent toggles and actions, not a pick-one row; over 900px they sit at the bar\'s right end.'],
  ['components/operators/OperatorPage.module.css: .skillTabs > :global(.tab)',
    'The operator page\'s skill tabs: two or three tabs, each holding the skill icon, its name and its mastery and priority badges, share the panel\'s width on purpose (#376, "Skill tabs share the full available width"). Each label starts at its tab\'s left (justify-content: flex-start, #377) and the first tab starts on the section edge; in a panel under 320px they stack icon over name.'],
]);

/** Classes kept in arkpedia-theme.css although no page renders them today. */
export const PRIMITIVE_KEEP = new Map([
  ['btn-lg', 'the documented size modifier for a large action (ui-primitives.md, Buttons)'],
  ['tgl', 'the toolbar mode switch of rule 3; TGL_SCOPE in audit-styles.mjs admits it file by file'],
  ['is-on', '.tgl\'s on state (rule 1: "On" has one look), with aria-pressed'],
  ['is-quiet', '.tgl\'s enabled-but-not-engaged state'],
  ['is-selected', '.pick-card\'s picked alias, documented beside aria-pressed/selected/checked'],
  ['no-scroll-wrap', 'the documented wrap for a small fixed set (ui-primitives.md, ScrollRow)'],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`tier-fill-${n}`, 'the documented rarity surface (rule 6, ui-primitives.md Rarity)']),
]);

/** Selectors whose subject matches the live-badge pattern but are not a badge. */
export const LIVE_ALLOWED = new Map([
  ['event-status-live', 'the status DOT before an event name on /community-hub (live, upcoming, ended), not a text badge; next round\'s blinking dot is for .badge-live'],
]);

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function walk(root, dir, ext) {
  return readdirSync(join(root, dir), { recursive: true })
    .filter((f) => ext.some((e) => f.endsWith(e)))
    .map((f) => join(dir, f).split('\\').join('/'))
    .sort();
}

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

/** TSX with comments removed, so a comment naming a class is not a use of it. */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

/** The class names a className attribute value names: quoted words, template-literal
 *  words and `styles.x` module references. */
function classTokens(value) {
  const out = [];
  for (const m of value.matchAll(/styles\.([A-Za-z_][\w]*)|styles\[['"]([\w-]+)['"]\]/g)) out.push(m[1] || m[2]);
  for (const m of value.matchAll(/(['"`])((?:(?!\1)[^\n])*)\1/g)) {
    for (const word of m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[A-Za-z][\w-]*$/.test(word)) out.push(word);
  }
  return out;
}

/** The value of a JSX className attribute starting at `i` (just after `className=`). */
function attrValue(text, i) {
  if (text[i] === '"' || text[i] === "'") return text.slice(i, text.indexOf(text[i], i + 1) + 1);
  if (text[i] !== '{') return '';
  let depth = 0;
  for (let j = i; j < text.length; j += 1) {
    if (text[j] === '{') depth += 1;
    else if (text[j] === '}') { depth -= 1; if (depth === 0) return text.slice(i, j + 1); }
  }
  return '';
}

const TAG = /<(\/?)([A-Za-z][\w.]*)((?:=>|[^>])*?)(\/?)>/g;

/** The class names of every choice ROW in TSX: SegmentedControl's className, and the
 *  element that directly holds a .filter-chip (found by walking the JSX tag stack). */
function choiceRows(root) {
  const rows = new Set();
  for (const path of [...walk(root, 'pages', ['.tsx']), ...walk(root, 'components', ['.tsx'])]) {
    const text = code(readFileSync(join(root, path), 'utf8'));
    // A parent holds a ROW of chips when it has two or more chip children, or its
    // chip is returned by an arrow function (a .map()): one chip beside a hint or a field (a toolbar, a
    // settings line) is a control in a layout row, not a pick-one row.
    const stack = [];
    const settle = (entry) => { if (entry.chips >= 2 || entry.mapped) for (const t of entry.tokens) rows.add(t); };
    for (const m of text.matchAll(TAG)) {
      const [, closing, name, attrs, selfClosing] = m;
      if (closing) {
        const at = stack.map((t) => t.name).lastIndexOf(name);
        if (at >= 0) { stack.slice(at).forEach(settle); stack.length = at; }
        continue;
      }
      const cls = attrs.indexOf('className=');
      const tokens = cls >= 0 ? classTokens(attrValue(attrs, cls + 'className='.length)) : [];
      if (name === 'SegmentedControl' || name === 'Tabs') for (const t of tokens) rows.add(t);
      if (tokens.includes('filter-chip')) {
        const parent = [...stack].reverse().find((t) => /^[a-z]/.test(t.name));
        if (parent) {
          parent.chips += 1;
          // Returned by an arrow function or a ternary in one (`.map((x) => (<button`,
          // `.map((x) => one ? <Icon/> : <button`): one chip in the source, a row of
          // them on the page.
          if (/(?:=>|\breturn|[?:])\s*\(?\s*$/.test(text.slice(Math.max(parent.end, m.index - 40), m.index))) parent.mapped = true;
        }
      }
      if (!selfClosing) stack.push({ name, tokens, end: m.index + m[0].length, chips: 0, mapped: false });
    }
    stack.forEach(settle);
  }
  rows.delete('filter-chip');
  return rows;
}

const ROW_NAME = /^(?:seg-control|tabs|[\w-]*-tabs|[a-z][\w]*Tabs)$/;
const ITEM_CLASS = /\.(?:filter-chip|tab)(?![\w-])|\[role=["']?tab["']?\]/;
const LIVE_BADGE_CLASS = (c) => /live(?:-now)?-badge/.test(c) || (/-live$/.test(c) && c !== 'is-live');
const LIVE_TEXT = /^\s*(?:●\s*)?(?:live|live now|running now)\s*$/i;
const PAINT = /^(?:font(?:-family|-size|-weight|-style)?|letter-spacing|text-transform|background(?:-color|-image)?|color)$/;

/** The compounds of one selector (no commas), split on combinators, with the
 *  combinator that precedes each: [{ comb: '', compound: '.a' }, { comb: '>', compound: 'button' }]. */
function compounds(selector) {
  const out = [];
  let comb = '';
  for (const part of selector.replace(/\s*([>+~])\s*/g, ' $1 ').trim().split(/\s+/)) {
    if (['>', '+', '~'].includes(part)) { comb = part; continue; }
    out.push({ comb: comb || (out.length ? ' ' : ''), compound: part });
    comb = '';
  }
  return out;
}

const classesOf = (compound) => [...compound.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]);

export function collectChoicesAndBadges(root) {
  const out = { stretchedChoices: [], deadPrimitives: [], liveBadge: [] };
  const rows = choiceRows(root);
  const isRow = (compound) => classesOf(compound).some((c) => ROW_NAME.test(c) || rows.has(c)) || /\[role=["']?tablist["']?\]/.test(compound);
  const cssFiles = [...walk(root, 'styles', ['.css']), ...walk(root, 'components', ['.css'])];
  const theme = 'styles/core/arkpedia-theme.css';

  for (const path of cssFiles) {
    const raw = stripComments(readFileSync(join(root, path), 'utf8'));
    for (const { selector, body } of rules(raw)) {
      const decls = declarations(body);
      for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
        const parts = compounds(part);
        if (!parts.length) continue;
        const subject = parts[parts.length - 1];
        // --- stretchedChoices ------------------------------------------------
        // An item: a chip or tab itself, or anything directly (or as a button or
        // link) inside a choice row.
        const parentRow = parts.length > 1 && isRow(parts[parts.length - 2].compound)
          && (subject.comb === '>' || /^(?:button|a)\b|\.filter-chip|\.tab\b/.test(subject.compound));
        const item = ITEM_CLASS.test(subject.compound) || parentRow;
        const row = isRow(subject.compound) && !ITEM_CLASS.test(subject.compound);
        const allowed = STRETCH_ALLOWED.has(`${path}: ${part}`) || STRETCH_ALLOWED.has(`${path}: ${selector}`);
        if (!allowed) {
          for (const d of decls) {
            let bad = null;
            // An item may centre its own label (the chip does, and a fixed-width
            // icon tile or "Lv 0" must); it may not grow to fill the line, which is
            // what turns that centring into an inset first label.
            if (item) {
              if (d.prop === 'flex-grow' && parseFloat(d.value) > 0) bad = d;
              if (d.prop === 'flex' && (/^auto$/.test(d.value) || parseFloat(d.value) > 0)) bad = d;
            }
            // A row may sit at the end of a line (flex-end); it may not centre or
            // spread its items, or deal the line out in equal fr columns.
            if (row) {
              if (d.prop === 'justify-content' && /center|space-|stretch/.test(d.value)) bad = d;
              if (/^grid-template-columns$|^grid-auto-columns$/.test(d.prop) && /\dfr\b/.test(d.value)) bad = d;
            }
            if (bad) out.stretchedChoices.push(`${path}: ${part} { ${bad.prop}: ${bad.value} }`);
          }
        }
        // --- liveBadge (CSS half) ----------------------------------------------
        if (path !== theme) {
          const live = classesOf(subject.compound).find(LIVE_BADGE_CLASS);
          if (live && !LIVE_ALLOWED.has(live)) {
            for (const d of decls) {
              if (PAINT.test(d.prop) || (d.prop === 'font')) out.liveBadge.push(`${path}: ${part} { ${d.prop} }`);
            }
          }
        }
      }
    }
  }

  // --- deadPrimitives -------------------------------------------------------
  const themeCss = stripComments(readFileSync(join(root, theme), 'utf8'));
  const defined = new Set();
  for (const m of themeCss.matchAll(/([^{}]+)\{/g)) {
    if (m[1].trim().startsWith('@')) continue;
    for (const c of m[1].matchAll(/\.([A-Za-z_][\w-]*)/g)) defined.add(c[1]);
  }
  // A class is used where a string in the code names it: a className, a classList
  // call, a class list built in a helper. Only string contents count -- an identifier
  // called `rail` or `band` is not the .rail class. A template literal's `${...}` ends
  // a stem (`tier-${n}` uses every .tier-N).
  const sources = ['pages', 'components', 'lib'].flatMap((dir) => walk(root, dir, ['.tsx', '.ts', '.jsx', '.js']))
    .filter((p) => !p.startsWith('pages/dev/'));
  const words = new Set();
  const stems = new Set();
  for (const p of sources) {
    const source = code(readFileSync(join(root, p), 'utf8'));
    // JSX prose can contain apostrophes, which the general string scan mistakes
    // for quotes. Read literal className attributes independently as well.
    for (const m of source.matchAll(/\bclassName=(["'])([^"']*)\1/g)) {
      for (const word of m[2].split(/\s+/)) if (word) words.add(word);
    }
    for (const m of source.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      // `${` ends the word before it, closed or not (a nested template literal cuts
      // this match short at its own backtick): `tabs${cls}` names .tabs, and
      // `tier-${n}` names every .tier-N.
      for (const word of m[2].replace(/\$\{[^}]*\}?/g, '\u0000 ').split(/\s+/)) {
        if (word.endsWith('\u0000')) { stems.add(word.slice(0, -1)); words.add(word.slice(0, -1)); } else if (word) words.add(word);
      }
    }
  }
  for (const c of [...defined].sort()) {
    if (PRIMITIVE_KEEP.has(c) || words.has(c)) continue;
    const stem = c.match(/^(.*-)\d+$/);
    if (stem && stems.has(stem[1])) continue;
    out.deadPrimitives.push(`${theme}: .${c}`);
  }

  // --- liveBadge (TSX half) ---------------------------------------------------
  for (const path of [...walk(root, 'pages', ['.tsx']), ...walk(root, 'components', ['.tsx'])]) {
    const text = code(readFileSync(join(root, path), 'utf8'));
    for (const m of text.matchAll(/<([a-z][\w]*)\b((?:=>|[^>])*?)>([^<>{}]*)<\/\1>/g)) {
      if (!LIVE_TEXT.test(m[3])) continue;
      const cls = m[2].indexOf('className=');
      const tokens = cls >= 0 ? classTokens(attrValue(m[2], cls + 'className='.length)) : [];
      if (!tokens.includes('badge-live')) out.liveBadge.push(`${path}: <${m[1]}${tokens.length ? ` class="${tokens.join(' ')}"` : ''}>${m[3].trim()}</${m[1]}>`);
    }
  }

  for (const key of Object.keys(out)) out[key].sort();
  return out;
}

export const CHOICE_BADGE_LABELS = {
  stretchedChoices: 'a tab or pick-one row stretched across its line (flex-grow on an item, justify-content or fr columns on the row) -- tabs and SegmentedControl chips are content width with the first one on the section edge (ui-primitives.md, "Tabs and pick-one rows start on the section edge"); a genuine exception goes in STRETCH_ALLOWED in scripts/audits/audit-choices-badges.mjs with its reason',
  deadPrimitives: 'a class defined in styles/core/arkpedia-theme.css that no page, component or lib file uses -- delete the rule, or list documented API in PRIMITIVE_KEEP with its reason',
  liveBadge: 'a LIVE / LIVE NOW / RUNNING NOW badge painted outside .badge-live -- render <span className="badge-live"> and keep only its position in the page stylesheet (ui-primitives.md, "One live badge")',
};
