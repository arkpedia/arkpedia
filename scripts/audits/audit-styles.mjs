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
 *   pills          a 999px (pill) radius, or a 50% one on anything but an avatar, a
 *                  dot or an image (ROUND_OK), and never on a control (roundControl:
 *                  .btn-icon names the glyph it holds, not a picture); radii come from
 *                  the 2-4px token family
 *   h1Rules        an h1 font-size or text-transform outside styles/core/shared.css;
 *                  the page title has one size and one case, set there
 *   fontWeights    a rule that asks a webfont for a weight pages/_app.tsx does
 *                  not import, which the browser then fakes (faux bold)
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
 *   controlHeight  a literal height or min-height on a control -- a button, chip,
 *                  .tgl, input, select or textarea, or a class TSX puts on one -- outside
 *                  styles/core, and on a primitive in it. Controls take one height,
 *                  var(--control-h), from the
 *                  primitives: the 2026-09-26 census found six primitive heights side by
 *                  side and pages patching them by hand (a 38px wishlist chip to match the
 *                  search, a 44px Clear, a 44px include switch). CONTROL_HEIGHT_EXEMPT
 *                  names the few that are not row controls, each with its reason, and an
 *                  exemption that matches nothing fails as stale. A textarea (the
 *                  element, or a class TSX puts on a <textarea>) is held to it only at a
 *                  row control's height (20-56px): a multi-line field is taller than any
 *                  row, the way a boxed card is
 *   primitiveLayout  a row-control primitive (.filter-chip, .tgl, .ghost, .back-btn...)
 *                  that no styles/core rule gives var(--control-h), or whose own rule
 *                  (the class alone, no context) carries a margin, align-self or
 *                  justify-self: the primitive draws the control, its placements place it.
 *                  .back-btn shipped with both, off-height and off-centre in control rows
 *   xButton        (r10 x-buttons) a close or remove × drawn as its own button: a
 *                  <button>, or any element with an onClick, whose whole content is a ×
 *                  glyph (×, ✕, ✖, x, &times;, &#10005;, a quoted one, one chosen by a
 *                  condition, or one alone in an element of its own), a drawn × (the
 *                  player's close icon, XGlyph, or XGlyph's path in a hand-written <svg>),
 *                  or a lone icon (one <svg>, or one self-closing component) under an
 *                  aria-label starting Close/Remove/Drop/Clear/Dismiss/Exit/Collapse (the
 *                  net x-buttons.spec.ts casts on screen), and whose class list lacks
 *                  btn-x (or tab-remove, a removable tab's × span). A × is
 *                  components/ui/XButton: no border, a square hit area, a required label
 *                  (docs/development/ui-primitives.md rule 21)
 *   motionScope    (r11 quiet polish) a transition, animation or @keyframes outside
 *                  styles/core/motion.css (MOTION_LEGACY lists what predates it, each with
 *                  its reason, and fails on a stale entry), or a rule in motion.css outside
 *                  @media (prefers-reduced-motion: no-preference), or a :hover in it outside
 *                  @media (hover: hover): see scripts/audits/audit-motion.mjs
 *   headingRules   (r9 headings-spacing) a font-size, font, color, letter-spacing or
 *                  text-transform on a selector whose subject is an h2 or h3 -- the
 *                  element, or a class the TSX puts on an <h2>/<h3> -- outside
 *                  styles/core/shared.css, unless the subject also carries .entity-title
 *                  or .label-tag. A section heading is .op-section h2 / .section-title,
 *                  a sub-section the global h3, a name .entity-title, a micro-label
 *                  .label-tag, all in core; the 2026-09-26 census found 18 h2s and 18 h3s
 *                  restated per page. An .entity-title larger than 22px fails too
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
import { fontShorthandPx } from './font-shorthand.mjs';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectChoicesAndBadges, CHOICE_BADGE_LABELS } from './audit-choices-badges.mjs';
import { collectMotion, MOTION_LABELS } from './audit-motion.mjs'; // r11 quiet polish
import { collectDeadResponsiveOverrides } from './dead-responsive-overrides.mjs';

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

/** The weights pages/_app.tsx loads, per family, from its @fontsource/<id>/<weight>.css imports;
 *  the family's name is the package's own (metadata.json). A <subset>-<weight>.css import fails:
 *  fontsource writes those without a unicode-range, so two subsets of one weight would each
 *  claim every character. And no page goes back to linking Google Fonts at runtime. */
function loadedWeights() {
  const doc = readFileSync(join(root, 'pages/_document.tsx'), 'utf8');
  if (/fonts\.(googleapis|gstatic)\.com/.test(doc)) {
    throw new Error('pages/_document.tsx links Google Fonts: the webfonts are self-hosted, imported in pages/_app.tsx');
  }
  const app = stripComments(readFileSync(join(root, 'pages/_app.tsx'), 'utf8'));
  const out = new Map();
  for (const m of app.matchAll(/^import\s+['"]@fontsource\/([a-z0-9-]+)\/([^'"]+)['"]/gm)) {
    const [, id, file] = m;
    const weight = file.match(/^(\d{3})\.css$/);
    if (!weight) {
      throw new Error(`pages/_app.tsx imports @fontsource/${id}/${file}: import @fontsource/${id}/<weight>.css, whose subsets carry their unicode-range`);
    }
    const { family } = JSON.parse(readFileSync(join(root, 'node_modules/@fontsource', id, 'metadata.json'), 'utf8'));
    if (!out.has(family)) out.set(family, new Set());
    out.get(family).add(Number(weight[1]));
  }
  if (!out.size) throw new Error('No @fontsource/<id>/<weight>.css imports in pages/_app.tsx');
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

/* ---- controlHeight and round radii (r9 controls) ---------------------------------
   One control height, --control-h in styles/core/shared.css: the primitives read it
   (.filter-chip, .tgl, .ghost, .danger, .btn-sm, .btn-icon, .search-input, the
   StyledSelect trigger, number inputs), and no page states a height of its own on a
   control. A page that needs a control taller or shorter than its row is the finding. */
/** The primitive classes that are controls wherever they appear. */
const CONTROL_PRIMITIVES = new Set(['filter-chip', 'tgl', 'ghost', 'primary', 'danger', 'btn', 'btn-sm', 'btn-icon', 'search-input', /* r10 x-buttons */ 'btn-x', 'btn-x-dense', /* every Back (2026-10-05) */ 'back-btn']);
/** Elements that are controls. An input is one unless it is a box, a slider or hidden.
 *  A <summary> is left out: it is a disclosure row heading a section, not a boxed row
 *  control (the row census in tests/browser measures one that sits beside controls). */
const CONTROL_ELEMENT = /^(?:button|select|textarea|input(?![^\s]*\[type=["']?(?:checkbox|radio|range|hidden|file|color)\b))(?=$|[.:#[])/;
/** Controls that are not row controls, and why. `match` is tested against
 *  "<path>: <selector>"; an entry that matches no rule fails as stale. */
const CONTROL_HEIGHT_EXEMPT = [
  // Not controls in a row.
  [/^styles\/gamemodes\/gamemodes\.css: [^{]*\.gm-co-/, 'the Stronghold companion: a dense play-beside-the-game window with its own compact scale (full-bleed by design; page-bounds excludes it too)'],
  [/^styles\/gacha\/gacha\.css: \.gacha-action \{/, 'the /gacha X1/X10 pull row: the reference page keeps its 42px action row (docs/development/ui-primitives.md)'],
  [/^styles\/gacha\/gacha\.css: \.gacha-(?:banner-sidebar-item|details-featured) \{/, 'the /gacha banner list and featured-operator cards: picture cards on the reference page, sized by their art'],
  [/^styles\/home\/front\.css: \.front-gacha-thumb \{/, 'the home banner thumbnails: pictures that switch the banner, sized by the art'],
  [/^styles\/survey\/boxplot\.css: \.results-page \.results-chip \{/, 'the /results operator portraits: draggable picture tiles'],
  [/^styles\/recruitment\/recruitment\.css: \.recruit-selection button \{/, 'the five recruitment tag slots: a fixed grid of equal slots (an empty one is the same box) sized for a two-line tag name'],
  [/^styles\/games\/song-guesser\.module\.css: \.play \{/, "the music guesser's one big play button: the round's hero control, alone on its line"],
  [/^styles\/enemies\/enemies\.css: \.enemy-appear-option \{/, "a row in the enemy picker's menu: 40px like StyledSelect's own options, a menu row rather than a row control"],
  [/^components\/operators\/OperatorPage\.module\.css: \.splitRail button \{/, "the operator page's split handle between the artwork and the details: a 28px-wide rail, not a row control"],
  [/^components\/operators\/OperatorPage\.module\.css: \.relationPopover > button \{/, 'a name drawn as text (no border, no fill) that opens a popover: a 28px hit area round one line of text'],
  [/^styles\/music\/music\.css: \.music-(?:player-bottombar-controls|transport-buttons|song-row-actions) > (?:button|\.music-list-btn) \{/, "the music player bar's transport and the song rows' buttons (More, the icon toggles) on a touch screen (pointer: coarse): 44px targets (WCAG 2.5.5), as a phone's media controls are, where the row controls' 40px would be the only small targets on a page the reader drives by thumb"],
  // Boxed bare buttons (boxedClasses) that are not row controls.
  [/^styles\/farming\/farming\.css: \.farming-accordion-header \{/, "a /farming tier's disclosure header: a full-width row heading its tier, as a <summary> would be (left out above), not a control in a row"],
  [/^styles\/games\/guesser\.module\.css: \.clueTile \{/, "the operator guesser's hint tiles: a grid of tiles whose clue can run to two lines, not a row control"],
  [/^styles\/survey\/boxplot\.css: \.stats-table-sort \{/, "the /results table's column sort buttons: sized with the table's header row, in cells beside header text, not a row of controls"],
];
/** A radius of 50% draws a circle, which is right only for an avatar, a dot, an image or
 *  a slider thumb; every control and surface takes a radius token (ui-primitives rule 10). */
const ROUND_OK = /(?:^|[-_.\s])(?:dots?|avatar|portrait|icon|img|image|photo)(?=$|[-_\s:.[\]>)])|(?:^|[\s>])img(?=$|[.:[\s])|::?-(?:webkit-slider|moz-range)-thumb/;
/** A control is never round, whatever else its name says: a <button>, a class naming a
 *  button (btn, button: .btn-icon, .close-btn, .pulls-help-button) or a control primitive.
 *  ROUND_OK's `icon` is for a picture (.technique-entry-skill-icon), and `.btn-icon` -- the
 *  square icon button that replaced the calendar's and the help and close buttons' circles --
 *  would otherwise pass as one. ROUND_EXEMPT still names a round control on purpose. */
const roundControl = (subject) => /^button(?=$|[.:#[])/.test(subject)
  || /(?:^|[-_.])(?:btn|button)(?=$|[-_.:#[)])/.test(subject)
  || [...subject.matchAll(/\.([a-zA-Z_][\w-]*)/g)].some((m) => CONTROL_PRIMITIVES.has(m[1]));
/** Round things whose names do not say so, and why they are round. */
const ROUND_EXEMPT = {
  '.theme-toggle': 'the nav theme toggle is an operator avatar (a round portrait)',
  '.status-ok i': 'a status tick drawn as a dot',
  '.wizard-step b': 'a numbered step marker, a dot with a digit in it',
  '.technique-entry-priority-badge': 'a numbered dot pinned to a skill icon',
  /* r11 quiet polish */
  '.badge-live::before': 'the LIVE badge\'s blinking dot (option A, maintainer 2026-09-26)',
};
/** Class names in a className expression: quoted words, template text, styles.x. */
function classNamesIn(expr) {
  const out = new Set();
  for (const m of expr.matchAll(/(['"`])((?:(?!\1)[\s\S])*?)\1/g)) for (const w of m[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(w)) out.add(w);
  for (const m of expr.matchAll(/\b(?:styles|s|css|pageStyles)\.([a-zA-Z_]\w*)|\b(?:styles|s|css|pageStyles)\[['"]([\w-]+)['"]\]/g)) out.add(m[1] || m[2]);
  return out;
}
/** The classes TSX puts on a control: on a <button>, <select>, <textarea> or a text
 *  <input>, or on any element whose classes name a button variant or a chip -- never on
 *  a .btn-bare, which is a card or a tile, not a control. */
function controlClasses(tsxFiles) {
  const out = new Set();
  for (const path of tsxFiles) {
    const code = readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/<([A-Za-z][\w.]*)\b((?:=>|[^>])*?)\/?>/g)) {
      const cls = m[2].match(/\bclassName=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/);
      if (!cls) continue;
      const names = classNamesIn(cls[1]);
      if (names.has('btn-bare')) continue;
      const tag = m[1];
      const input = tag === 'input' && !/\btype=["'{]\s*['"`]?(?:checkbox|radio|range|hidden|file|color)\b/.test(m[2]);
      if (['button', 'select', 'textarea', ...X_BUTTON_COMPONENTS].includes(tag) || input || [...names].some((n) => CONTROL_PRIMITIVES.has(n))) {
        for (const n of names) out.add(n);
      }
    }
  }
  return out;
}
/** The classes TSX puts on a <textarea>: a multi-line field, which a rule may make taller
 *  than any row (the verifier's case: `textarea { min-height: 120px }` read as a control
 *  out of step with its row). */
function textareaClasses(tsxFiles) {
  const out = new Set();
  for (const path of tsxFiles) {
    const code = readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/<textarea\b((?:=>|[^>])*?)\/?>/g)) {
      const cls = m[1].match(/\bclassName=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/);
      if (cls) for (const n of classNamesIn(cls[1])) out.add(n);
    }
  }
  return out;
}
/** The classes TSX puts on a bare <button> (className has btn-bare): a card, a tile, a tab
 *  or a name drawn as text -- until its CSS draws it a box (boxedClasses), when it is a
 *  control like any other. The /music queue's track title was one: a bordered .btn-bare
 *  with a literal 36px beside 40px icon buttons, which controlHeight could not see while
 *  it left every .btn-bare out. */
function bareButtonClasses(tsxFiles) {
  const out = new Set();
  for (const path of tsxFiles) {
    const code = readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/<button\b((?:=>|[^>])*?)\/?>/g)) {
      const cls = m[1].match(/\bclassName=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/);
      if (!cls) continue;
      const names = classNamesIn(cls[1]);
      if (!names.has('btn-bare')) continue;
      for (const n of names) if (n !== 'btn-bare') out.add(n);
    }
  }
  return out;
}
/** Of `candidates`, the classes a rule draws a control's box round at rest: a `border`
 *  (or `border-color`) in var(--control-border), the boundary only real controls carry
 *  (ui-primitives rule 2; a large pressable surface carries --card-border), on a subject
 *  with no pseudo-class (a hover or focus edge is a picture card's, not a boundary). */
function boxedClasses(cssFiles, candidates) {
  const out = new Set();
  for (const path of cssFiles) {
    for (const { selector, body } of rules(stripComments(readFileSync(join(root, path), 'utf8')))) {
      const box = declarations(body).some((d) => (d.prop === 'border' || d.prop === 'border-color') && /var\(\s*--control-border\s*\)/.test(d.value) && !/\b(?:none|hidden)\b/.test(d.value) && !/(?:^|\s)0(?:px)?(?:\s|$)/.test(d.value));
      if (!box) continue;
      for (const part of selector.split(/,(?![^(]*\))/)) {
        const subject = part.replace(/:global\(([^)]*)\)/g, '$1').trim().split(/\s*[\s>+~]\s*/).pop() || '';
        if (subject.includes(':')) continue;
        for (const m of subject.matchAll(/\.([a-zA-Z_][\w-]*)/g)) if (candidates.has(m[1])) out.add(m[1]);
      }
    }
  }
  return out;
}
/** A literal height a control in a row could have (a card or a panel is taller). */
const controlSized = (value) => [...value.matchAll(/(\d*\.?\d+)px\b/g)].some((m) => Number(m[1]) >= 20 && Number(m[1]) <= 56);
/* --- r9 headingRules (headings-spacing) ----------------------------------------------- */
/** Heading classes whose look is deliberately their own, and why. Named, not a pattern. */
const HEADING_EXEMPT = {
  'gm-co-stephead': 'the Stronghold companion: tool UI in a Document Picture-in-Picture window, full-bleed by design',
  'gm-co-substep': 'the Stronghold companion: tool UI in a Document Picture-in-Picture window, full-bleed by design',
  'visually-hidden': 'not drawn: a heading for the outline only',
};
const HEADING_PAINT = new Set(['font-size', 'color', 'letter-spacing', 'text-transform']);
/** The subject (last compound) of one selector. */
const subjectOf = (selector) => selector.trim().split(/\s*[\s>+~]\s*/).pop() || '';
const classesOf = (compound) => [...compound.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
/** Every class the TSX puts on an <h2> or <h3>: quoted class lists, the static parts of a
 *  template literal, and CSS-module references (styles.x, where styles is an import of a
 *  .module.css file). A class set by a function call is invisible here. */
function headingClasses(files) {
  const out = new Set();
  for (const path of files) {
    const code = readFileSync(join(root, path), 'utf8');
    const modules = new Set([...code.matchAll(/import\s+(\w+)\s+from\s+['"][^'"]+\.module\.css['"]/g)].map((m) => m[1]));
    for (const m of code.matchAll(/<h[23]\b((?:=>|[^>])*)>/g)) {
      const cn = m[1].match(/className=(?:"([^"]*)"|'([^']*)'|\{([\s\S]*)\})/);
      if (!cn) continue;
      const plain = cn[1] ?? cn[2];
      if (plain !== undefined) { for (const w of plain.split(/\s+/)) if (w) out.add(w); continue; }
      for (const q of cn[3].matchAll(/(['"`])((?:(?!\1)[^\n])*?)\1/g)) {
        for (const w of q[2].replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(w)) out.add(w);
      }
      for (const q of cn[3].matchAll(/\b(\w+)\.([a-zA-Z]\w*)/g)) if (modules.has(q[1])) out.add(q[2]);
    }
  }
  return out;
}
/** A literal height or min-height on a control's rule: outside styles/core on any
 *  control, and in styles/core on the primitives themselves (a primitive stating 32px
 *  instead of the token is how a flip of --control-h-base would silently miss it). */
function controlHeights(cssFiles, controls, boxedBare, textareas) {
  const found = [];
  for (const path of cssFiles) {
    const core = path.startsWith(join('styles', 'core') + '/');
    for (const { selector, body } of rules(stripComments(readFileSync(join(root, path), 'utf8')))) {
      const decls = declarations(body).filter((d) => /^(?:min-)?(?:height|block-size)$/.test(d.prop) && /(?:^|[\s(,])\d*\.?\d+(?:px|rem|em)\b/.test(d.value) && !/var\(\s*--control-h\b/.test(d.value));
      if (!decls.length) continue;
      for (const part of selector.split(/,(?![^(]*\))/)) {
        const subject = part.replace(/:global\(([^)]*)\)/g, '$1').trim().split(/\s*[\s>+~]\s*/).pop() || '';
        if (subject.includes('::')) continue;
        const classes = [...subject.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
        // A .btn-bare is a card or a tile, and a dot (a carousel pager, a status mark) is
        // its own small hit area: neither is a control in a row.
        if (classes.includes('btn-bare') || classes.some((c) => /(?:^|-)dots?$/.test(c))) continue;
        const control = core ? classes.some((c) => CONTROL_PRIMITIVES.has(c))
          : CONTROL_ELEMENT.test(subject.replace(/:not\([^)]*\)/g, '')) || classes.some((c) => CONTROL_PRIMITIVES.has(c) || controls.has(c));
        // A boxed bare button (boxedClasses) is held to it too, at a height a row
        // control could have: a boxed card is taller than any row.
        const boxed = !control && !core && classes.some((c) => boxedBare.has(c));
        if (!control && !boxed) continue;
        // A textarea is a row control only at a row control's height: a multi-line field
        // (min-height: 120px) is taller than any row, as a boxed card is.
        const multiLine = /^textarea(?=$|[.:#[])/.test(subject) || classes.some((c) => textareas.has(c));
        for (const d of decls) if ((!boxed && !multiLine) || controlSized(d.value)) found.push(`${path}: ${part.trim()} { ${d.prop}: ${d.value} }`);
      }
    }
  }
  const stale = CONTROL_HEIGHT_EXEMPT.filter(([match]) => !found.some((f) => match.test(f)));
  return [
    ...found.filter((f) => !CONTROL_HEIGHT_EXEMPT.some(([match]) => match.test(f))),
    ...stale.map(([match, why]) => `stale CONTROL_HEIGHT_EXEMPT entry ${match} (${why}): it matches nothing, delete it`),
  ];
}
/* ---- primitiveLayout (2026-10-05) -----------------------------------------------
   A row control's primitive is its look and the one control height, and nothing about
   where it sits. .back-btn replaced .ghost in control rows with neither: no min-height
   (34px beside 36px controls) and an align-self: flex-start that lifted it off the centre
   line of every row it sat in, plus a margin-bottom four placements cancelled with
   one-off classes. A placement that needs room or alignment says so with a selector of its
   own (.modal-box > .back-btn), which this leaves alone. */
/** The primitives that are row controls: all of them but a base or .primary button, which
 *  stays 44px as a standalone call to action and takes .btn-sm in a row. */
const ROW_PRIMITIVES = [...CONTROL_PRIMITIVES].filter((c) => c !== 'primary' && c !== 'btn');
/** Outer layout: what places a box among its siblings rather than drawing it. */
const OUTER_LAYOUT = /^(?:margin(?:-[a-z-]+)?|align-self|justify-self|place-self)$/;
function primitiveLayouts(cssFiles) {
  const core = cssFiles.filter((path) => path.startsWith(join('styles', 'core') + '/'));
  const sized = new Set();
  const found = [];
  for (const path of core) {
    for (const { selector, body } of rules(stripComments(readFileSync(join(root, path), 'utf8')))) {
      const decls = declarations(body);
      for (const part of selector.split(/,(?![^(]*\))/)) {
        const compounds = part.trim().split(/\s*[\s>+~]\s*(?![^(]*\))/);
        const subject = compounds[compounds.length - 1];
        if (subject.includes('::')) continue;
        const classes = classesOf(subject.replace(/:(?:not|is|where|has)\([^)]*\)/g, ''));
        for (const name of ROW_PRIMITIVES.filter((c) => classes.includes(c))) {
          if (decls.some((d) => /^(?:min-)?(?:height|block-size)$/.test(d.prop) && /var\(\s*--control-h\b/.test(d.value))) sized.add(name);
          // The primitive's own rule: the selector is the primitive alone (a state on it
          // included), with no ancestor or sibling to say which placement it means.
          if (compounds.length > 1) continue;
          for (const d of decls) if (OUTER_LAYOUT.test(d.prop)) found.push(`${path}: ${part.trim()} { ${d.prop}: ${d.value} }`);
        }
      }
    }
  }
  for (const name of ROW_PRIMITIVES) if (!sized.has(name)) found.push(`.${name}: no rule in styles/core gives it var(--control-h)`);
  return found;
}
/* ---- end controlHeight and round radii ------------------------------------------- */
/* --- end r9 headingRules constants ---------------------------------------------------- */

/* === r10 x-buttons: xButton =====================================================
   A close or remove × is components/ui/XButton (.btn-x): no border and no box at rest,
   a square hit area, a label it cannot be rendered without. Before it, main drew
   twenty-one of them in seventeen sizes: bordered boxes of 30x44 (/pulls' goal rows),
   50x40 (the /gacha dialogs) and 40x40 (the planner's import dialog), 44px-wide glyph
   boxes as tall as their dialog heads, a 30x30 plan-row glyph squeezed to 8px wide on a
   phone, a 61x46 one, a literal "x" in a mono 12px, a popover close with no accessible
   name. The component is how a new one is written; this is how a hand-written one is
   found. */
/** The whole content of a × button, as written: one glyph, an entity, a quoted glyph,
 *  or a glyph picked by a condition ({open ? '✕' : '⛶'} is a × in one state). */
const X_GLYPH = /^(?:[×✕✖✗xX]|&times;|&#(?:215|10005|10006|x[dD]7|x2715|x2716);|\{[^{}]*(['"`])(?:[×✕✖]|\\u00[dD]7|\\u271[56]|\\xd7)\1[^{}]*\})$/;
/** A drawn ×: the player's close icon (components/music/TransportIcons), the ×
 *  buttons' own glyph (XGlyph, exported for the removable tab's span and for the two
 *  buttons that are a × in one state only: the mini player's collapse and the /community
 *  map's fullscreen toggle), or that glyph's path copied into a hand-written <svg> (the
 *  search field's clear was one). A button drawing one must carry .btn-x in its class
 *  list, in the state that shows it: the map's toggle shows only while a community event
 *  runs (x-buttons.spec.ts reaches it by moving the page's clock, on desktop only), and this
 *  finds it in the source whatever the data. */
const X_ICON = /<TransportIcon\b[^>]*\bname=(?:"close"|'close'|\{[^}]*['"`]close['"`][^}]*\})|<XGlyph\b|\bd=["'{`]*m4 4 8 8M12 4l-8 8/;
/** A glyph wrapped in its own element and nothing else (<span aria-hidden="true">×</span>),
 *  the way a removable tab's × was written. */
const X_WRAPPED = /^<(\w+)\b[^>]*>([^<]*)<\/\1>$/;
/** A lone icon -- one <svg>, or one self-closing icon component (<CloseIcon size={14} />)
 *  -- is a × when the button's aria-label starts with one of these words. It is the net
 *  x-buttons.spec.ts's measure() casts on screen (NAMED there; keep the two the same), so
 *  a × written by hand with any other path or icon is found in every file, not only at the
 *  places the browser run drives: the search field's clear on main was a hand-written
 *  <svg> with a path of its own. */
const X_NAMED = /^(?:close|remove|drop|clear|dismiss|exit|collapse)\b/i;
const X_LONE_ICON = /^(?:<svg\b[\s\S]*<\/svg>|<(?!XButton\b)[A-Z][\w.]*\b[^<>]*\/>)$/;
/** Components that render a <button> of their own: a class given to one is a class on
 *  a control (controlHeight holds it to the token like any other). */
const X_BUTTON_COMPONENTS = ['XButton'];
function xButtons(tsxFiles) {
  const out = [];
  for (const path of tsxFiles) {
    if (path === join('components', 'ui', 'XButton.tsx')) continue;
    const code = readFileSync(join(root, path), 'utf8').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of code.matchAll(/<([a-z][\w]*)\b((?:=>|[^>])*?)>/g)) {
      const [open, tag, attrs] = m;
      if (open.endsWith('/>')) continue;
      if (tag !== 'button' && !/\bonClick=/.test(attrs)) continue;
      const end = code.indexOf(`</${tag}>`, m.index + open.length);
      if (end < 0) continue;
      // A × drawn by an element of its own inside (a removable tab's .tab-remove span)
      // is that element's, not its holder's.
      const raw = code.slice(m.index + open.length, end).replace(/<(\w+)\b(?:=>|[^>])*?\bclassName=(?:=>|[^>])*?\b(?:tab-remove|btn-x)\b(?:=>|[^>])*?>[\s\S]*?<\/\1>/g, '');
      const content = raw.replace(/\s+/g, '');
      const tight = raw.replace(/\s+/g, ' ').trim();
      const wrapped = tight.match(X_WRAPPED);
      const label = attrs.match(/\baria-label=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/);
      const named = !!label && [...label[1].matchAll(/(["'`])((?:(?!\1)[\s\S])*)\1/g)].some((l) => X_NAMED.test(l[2].trim()));
      if (!X_GLYPH.test(content) && !X_ICON.test(raw) && !(wrapped && X_GLYPH.test(wrapped[2].replace(/\s+/g, ''))) && !(named && X_LONE_ICON.test(tight))) continue;
      const cls = attrs.match(/\bclassName=(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|'[^']*')/);
      const names = cls ? classNamesIn(cls[1]) : new Set();
      // classNamesIn drops what a template literal picks inside ${...}; a × that is one in
      // one state names .btn-x there (`${isFullscreen ? 'btn-x' : 'btn-icon'} ...`).
      const picked = (c) => new RegExp(`\\$\\{[^}]*(['"\`])${c}\\1[^}]*\\}`).test(cls?.[1] ?? '');
      if (names.has('btn-x') || names.has('tab-remove') || picked('btn-x')) continue;
      out.push(`${path}: <${tag}${attrs.replace(/\s+/g, ' ').slice(0, 70)}>${content.slice(0, 30)}`);
    }
  }
  // One net, two guards: the words that make a lone icon a × here are measure()'s NAMED in
  // x-buttons.spec.ts, and a word added to one and not the other would let the audit and
  // the browser run disagree about what a × is.
  const words = (re) => (re?.match(/\((?:\?:)?([a-z|]+)\)/)?.[1] ?? '').split('|').sort().join('|');
  const specNet = readFileSync(join(root, 'tests', 'browser', 'x-buttons.spec.ts'), 'utf8').match(/const NAMED = \/(.*)\/i;/)?.[1];
  if (words(specNet) !== words(X_NAMED.source)) out.push(`tests/browser/x-buttons.spec.ts: measure()'s NAMED (${words(specNet) || 'not found'}) is not audit-styles.mjs' X_NAMED (${words(X_NAMED.source)}); keep the two nets one list`);
  return out;
}
/* === end r10 x-buttons ============================================================ */

function collect() {
  const cssFiles = [...walk('styles', ['.css']), ...walk('components', ['.css'])];
  const owners = new Map();   // class -> Set<file>
  const out = {
    collisions: [], fontSizes: [], rawHex: [], rarityLiteral: [], oldTeal: [],
    pills: [], h1Rules: [], fontWeights: [], nativeControls: [], scrollbarThumb: [], primaryToggle: [],
    tealDecoration: [], checkboxPrimitive: [], tglOutsideToolbar: [],
    headingRules: [],
  };
  const tsxFiles = [...walk('pages', ['.tsx']), ...walk('components', ['.tsx'])];
  const hClasses = headingClasses(tsxFiles);
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
    // The `font:` shorthand carries a size too (`font: 700 20px/1.1 var(--font-display)`):
    // eight off-scale sizes on /pulls hid in it. The size is the first length before the
    // family, optionally followed by /line-height; `font: inherit` and the like have none.
    for (const m of raw.matchAll(/(?<![-\w])font:\s*([^;}]+)/g)) {
      const size = fontShorthandPx(m[1]);
      if (size !== null && !SCALE.has(size)) out.fontSizes.push(`${file}: ${size}px`);
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
        if (d.prop.includes('radius') && /(?:^|\s)50%/.test(d.value)) {
          for (const part of selector.split(/,(?![^(]*\))/).map((x) => x.trim())) {
            const subject = part.split(/\s*[\s>+~]\s*/).pop() || '';
            if ((roundControl(subject) || !ROUND_OK.test(subject)) && !ROUND_EXEMPT[part]) out.pills.push(`${path}: ${part} { ${d.prop}: ${d.value} }`);
          }
        }
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
      // r9 headingRules: heading paint lives in styles/core/shared.css.
      if (path !== join('styles', 'core', 'shared.css')) {
        for (const part of selector.split(',')) {
          const subject = subjectOf(part);
          const cls = classesOf(subject);
          const entity = cls.includes('entity-title');
          if (entity) {
            for (const d of decls) {
              const px = d.prop === 'font-size' ? d.value.match(/^([\d.]+)px/) : d.prop === 'font' ? d.value.match(/(?:^|\s)([\d.]+)px/) : null;
              if (px && Number(px[1]) > 22) out.headingRules.push(`${path}: ${part.trim()} { ${d.prop}: ${d.value} } is an .entity-title over 22px`);
            }
            continue;
          }
          if (cls.includes('label-tag') || cls.some((c) => HEADING_EXEMPT[c])) continue;
          // An h2/h3 element, or a heading class on no other named element (h4.x is an h4).
          const element = subject.match(/^[a-z][a-z0-9]*/)?.[0];
          if (element ? !/^h[23]$/.test(element) : !cls.some((c) => hClasses.has(c))) continue;
          for (const d of decls) {
            if (HEADING_PAINT.has(d.prop) || (d.prop === 'font' && /\d/.test(d.value))) out.headingRules.push(`${path}: ${part.trim()} { ${d.prop} }`);
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

  for (const path of tsxFiles) {
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
  out.xButton = xButtons(tsxFiles); // r10 x-buttons
  Object.assign(out, collectMotion(root)); // r11 quiet polish: motionScope
  // controlHeight (r9 controls)
  out.controlHeight = controlHeights(cssFiles, controlClasses(tsxFiles), boxedClasses(cssFiles, bareButtonClasses(tsxFiles)), textareaClasses(tsxFiles));
  out.primitiveLayout = primitiveLayouts(cssFiles);
  out.deadResponsiveOverride = collectDeadResponsiveOverrides(root);

  out.collisions = [...owners.entries()]
    .filter(([, fs]) => fs.size > 1)
    .map(([cls, fs]) => `${cls}: ${[...fs].sort().join(', ')}`);
  for (const key of Object.keys(out)) out[key].sort();
  return out;
}

const LABELS = {
  deadResponsiveOverride: 'a media-query declaration always defeated by a later unconditional rule with the same selector and property; remove it from the earlier sheet or put an intentional responsive rule after its owner',
  collisions: 'the same bare class styled in more than one global stylesheet, so load order decides which wins',
  fontSizes: 'font-size off the scale (9-13 body, 15/18/22/26/30 display)',
  rawHex: 'a hex literal for a colour a token already names, so the light theme does not reach it',
  rarityLiteral: 'a colour literal in a rarity rule -- use var(--rarity-N), .rarity-N, .tier-N or .tier-fill-N',
  oldTeal: 'the pre-token teal literal -- use var(--teal) or color-mix(in srgb, var(--teal) N%, transparent)',
  pills: 'a 999px pill radius, or a 50% one on a control or surface (only avatars, dots, images and slider thumbs are round, and a control -- a button, a .btn-icon -- never is) -- use var(--radius), var(--radius-frame) or var(--radius-control)',
  h1Rules: 'an h1 size or case outside styles/core/shared.css -- render components/ui/PageHeader',
  fontWeights: 'a webfont weight pages/_app.tsx does not import from @fontsource, so the browser fakes it',
  nativeControls: 'a native <select> or role="listbox" outside components/ui -- use components/ui/StyledSelect or SearchInput',
  scrollbarThumb: 'a scrollbar thumb in --line or --line-soft (1.31:1, invisible) -- drop the override and inherit :root\'s --text-faint',
  primaryToggle: "a class swapped between 'primary' and 'ghost' -- a toggle is a .filter-chip with aria-pressed; --teal-fill is for primary actions only",
  checkboxPrimitive: 'a checkbox outside a <label className="check"> -- a boolean or an option is the .check checkbox (styles/core/arkpedia-theme.css, docs/development/ui-primitives.md)',
  tglOutsideToolbar: `a .tgl outside a toolbar (TGL_SCOPE: ${TGL_SCOPE.length ? TGL_SCOPE.join(', ') : 'none'}) -- a setting or an option is a .check checkbox, a pick-one is SegmentedControl, an independent filter is a .filter-chip with aria-pressed`,
  headingRules: 'heading paint (size, colour, tracking, case) on an h2/h3 outside styles/core/shared.css -- a section heading is .op-section h2 or .section-title, a sub-section the global h3, a name .entity-title (22px at most), a micro-label .label-tag (docs/development/ui-primitives.md rule 16)',
  tealDecoration: `teal on a selector that names no state, in ${TEAL_DECORATION_SCOPE.join(', ')} -- teal means "on" or "current"; recolour it (--text-dim, --heading for a heading) or qualify the selector with the state it marks`,
  ...CHOICE_BADGE_LABELS,
};

const STRICT = ['rawHex', 'rarityLiteral', 'oldTeal', 'pills', 'h1Rules', 'fontWeights', 'scrollbarThumb', 'primaryToggle', 'tealDecoration', 'checkboxPrimitive', 'tglOutsideToolbar', 'headingRules', 'deadResponsiveOverride',
  ...Object.keys(CHOICE_BADGE_LABELS)];
// controlHeight (r9 controls)
LABELS.controlHeight = 'a literal height or min-height on a control outside styles/core, or on a primitive inside it -- controls take var(--control-h) from the primitives (.btn-sm for a base or primary button in a row, .btn-icon for a square icon button); a control that is not a row control goes in CONTROL_HEIGHT_EXEMPT with its reason';
STRICT.push('controlHeight');
LABELS.primitiveLayout = 'a row-control primitive (CONTROL_PRIMITIVES but .primary and .btn) with no var(--control-h) height in styles/core, or with a margin, align-self or justify-self on its own rule -- the primitive is the look and the height; a placement that needs room or alignment says so with a contextual selector (.modal-box > .back-btn)';
STRICT.push('primitiveLayout');
// r10 x-buttons
LABELS.xButton = 'a close or remove × drawn as its own button -- render components/ui/XButton (.btn-x: no border, a square hit area, a required label; docs/development/ui-primitives.md rule 21). An icon button that is not a × (a chevron, a trash can) is read as one when its aria-label starts Close/Remove/Drop/Clear/Dismiss/Exit/Collapse: name it for what it does ("Hide the list", "Fold the section", "Delete") or give it a text label';
STRICT.push('xButton');
// r11 quiet polish: motion lives in styles/core/motion.css (scripts/audits/audit-motion.mjs)
Object.assign(LABELS, MOTION_LABELS);
STRICT.push(...Object.keys(MOTION_LABELS));

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
