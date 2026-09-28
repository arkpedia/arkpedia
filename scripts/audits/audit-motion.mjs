/**
 * motionScope, the strict audit:styles key for motion (r11 quiet polish), kept in a file of
 * its own so scripts/audits/audit-styles.mjs only has to merge it.
 *
 * The maintainer chose option C, "Quiet polish", on 2026-09-26, with two conditions that
 * held every earlier motion here to nothing: all of it off under prefers-reduced-motion,
 * and none of it ever moving the layout. Motion written file by file had met neither
 * reliably -- the roster cards' entrance rose 24px in under reduced motion because its
 * override lost the cascade in another file, and most hover fades had no override at all.
 * So motion has one home, styles/core/motion.css, where every rule sits inside
 * @media (prefers-reduced-motion: no-preference) and nowhere else.
 *
 * It reports:
 *   - a transition or animation declaration (transition, transition-*, animation,
 *     animation-*) or an @keyframes block in any stylesheet but motion.css, and an
 *     inline `transition` / `animation*` style or a script assigning `style.transition`
 *     or `style.animation*` in TSX. Turning motion OFF is not motion: a value of `none`,
 *     `0s`, `0` or '' (a reduced-motion override, the one site-wide stop in shared.css,
 *     Tabs.tsx switching the underline's transition off for a relayout) is never
 *     reported. `view-transition-name` is not a transition. What was written before
 *     motion.css is MOTION_LEGACY, each entry with its reason; an entry nothing matches
 *     any more fails as stale, so the list only shrinks;
 *   - in motion.css, any rule, @keyframes or declaration that is not inside
 *     @media (prefers-reduced-motion: no-preference), and a :hover rule that is not also
 *     inside @media (hover: hover) (a touch screen's sticky hover would leave a card
 *     lifted after a tap);
 *   - a rule outside motion.css that starts an animation with no reduced-motion stop
 *     that wins the cascade over it (reducedMotionStops, below: the site nav's menus, the
 *     drawer's overlay, the invalid card's shake and the /gacha tutorial's pull cards all
 *     had a stop that lost), and the site-wide transition stop in shared.css gone.
 *
 * The browser half is tests/browser/motion.spec.ts: with reduced motion nothing runs,
 * and with it on nothing moves the layout.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

export const MOTION_FILE = 'styles/core/motion.css';

/* Why a pre-motion.css transition or animation stays where it is. Each stops under
   prefers-reduced-motion: the transitions by the one site-wide rule in
   styles/core/shared.css, the animations by an override in their own file. Moving one
   into motion.css is welcome; then delete its entry here. */
const HOVER_FADE = 'a hover, focus or state fade of colour, border or fill, written with its component before motion.css; instant under reduced motion (shared.css)';
const PRIMITIVE_FADE = 'a primitive\'s own hover and state fade (arkpedia-theme.css); motion.css restates it with the press, and it is instant under reduced motion';
const DRAWER = 'a drawer, overlay or menu sliding or fading in and out as it opens and closes; instant under reduced motion';
const DISCLOSURE = 'a disclosure opening (a row growing, an arrow turning); instant under reduced motion';
const ENTRANCE = 'a list or card entrance animation, switched off by its own prefers-reduced-motion: reduce override';
const LOOP = 'a looping indicator (a pulse, a marquee, a map route, a visualiser), switched off by its own prefers-reduced-motion: reduce override';
const TUTORIAL = 'a step of the /gacha tutorial\'s animated explainer; the step still happens under reduced motion, still';
const FEEDBACK = 'a one-off feedback animation (a shake, a flash, a halo on a pull), switched off by its own prefers-reduced-motion: reduce override';
const CROSSFADE = 'a cross-fade between two contents (a title and its translation, the operator artwork, a carousel page); instant under reduced motion';
const VIEW_TRANSITION = 'the Stronghold companion\'s view-transition timing; the helper that starts a view transition skips it under reduced motion';
const GLIDE = 'the Stronghold companion\'s hint spotlight gliding to the button it points at next; instant under reduced motion';
const ZOOM = 'the skin viewer\'s zoom following the pointer (50ms), so the image does not jitter; instant under reduced motion';
const METER = 'a bar growing to its new value; instant under reduced motion';

/** What predates motion.css, by `path: selector { property }` (or `path: @keyframes name`,
 *  `path: style.property`), with how many times it occurs and why it stays. */
export const MOTION_LEGACY = new Map([
  ['components/operators/OperatorPage.module.css: .relationPopover > button > svg { transition }', { count: 1, reason: DISCLOSURE }],
  ['components/ui/StyledSelect.module.css: .root .trigger { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/base/base.css: .base-facility { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/base/base.css: .base-facility-settings-btn { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/community/video.css: .video-card { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/core/arkpedia-theme.css: button:where(:not(.btn-bare)), a.ghost, a.primary, a.danger, .btn { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/arkpedia-theme.css: .pick-card { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/arkpedia-theme.css: .filter-chip { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/arkpedia-theme.css: .check { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/arkpedia-theme.css: .check > input[type="checkbox"] { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/arkpedia-theme.css: .check > input[type="checkbox"]::before { transition }', { count: 1, reason: PRIMITIVE_FADE }],
  ['styles/core/nav.css: .site-nav-link { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/core/nav.css: .site-nav-trigger { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/core/nav.css: .site-nav-chev { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/core/nav.css: .site-nav-pop { animation }', { count: 1, reason: DRAWER }],
  ['styles/core/nav.css: @keyframes site-nav-pop-in', { count: 1, reason: DRAWER }],
  ['styles/core/nav.css: .site-nav-popitem { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/core/nav.css: .mobile-nav-overlay { animation }', { count: 1, reason: DRAWER }],
  ['styles/core/nav.css: @keyframes mobile-nav-overlay-in', { count: 1, reason: DRAWER }],
  ['styles/core/nav.css: .mobile-nav-drawer { transition }', { count: 1, reason: DRAWER }],
  ['styles/core/nav.css: .mobile-nav-drawer.open { transition }', { count: 1, reason: DRAWER }],
  ['styles/core/shared.css: .card.invalid { animation }', { count: 1, reason: FEEDBACK }],
  ['styles/core/shared.css: @keyframes shake', { count: 1, reason: FEEDBACK }],
  ['styles/core/shared.css: @keyframes cardRiseIn', { count: 1, reason: ENTRANCE }],
  ['styles/core/shared.css: @keyframes title-marquee', { count: 1, reason: LOOP }],
  ['styles/enemies/enemies.css: .enemy-status-trigger > svg { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/enemies/enemies.css: .enemy-flavour-drop > summary { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/enemies/enemies.css: .enemy-flavour-drop > summary::before { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/farming/farming.css: @keyframes farmingTableFlowIn', { count: 1, reason: ENTRANCE }],
  ['styles/farming/farming.css: .farming-table-enter { animation }', { count: 1, reason: ENTRANCE }],
  ['styles/farming/farming.css: .farming-accordion-header { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/farming/farming.css: .farming-accordion-body-wrap.open { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-ramp-pull.ramping { animation }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: @keyframes gachaRampPulse', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-reset { transition }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-reset.hit { animation }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: @keyframes gachaResetHitFlash', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-pity-chip { transition }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-pity-chip.shake { animation }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: @keyframes pityChipShake', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-pity-chip.fizzling { animation }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: @keyframes pityChipFizzle', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-pick-slot { transition }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha-tutorial.css: .gacha-tutorial-rateup-bar { transition }', { count: 1, reason: TUTORIAL }],
  ['styles/gacha/gacha.css: .gacha-action { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/gacha/gacha.css: .gacha-pull-tile { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/gacha/gacha.css: .gacha-pull-grid .gacha-pull-tile:is(.pull-six, .pull-five)::before { animation }', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: @keyframes gachaHaloReveal', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: @keyframes gachaPullSlideFromBottom', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: @keyframes gachaPullSlideFromTop', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: .gacha-pull-slide-bottom { animation }', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: .gacha-pull-slide-top { animation }', { count: 1, reason: FEEDBACK }],
  ['styles/gacha/gacha.css: .gacha-spark-store-btn { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/gamemodes/gamemodes.css: .gm-row { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/gamemodes/gamemodes.css: ::view-transition-group(*) { animation-duration }', { count: 1, reason: VIEW_TRANSITION }],
  ['styles/gamemodes/gamemodes.css: ::view-transition-group(*) { animation-timing-function }', { count: 1, reason: VIEW_TRANSITION }],
  ['styles/gamemodes/gamemodes.css: .gm-co-rail i { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/gamemodes/gamemodes.css: .gm-co-langchev { transition }', { count: 1, reason: DISCLOSURE }],
  ['styles/gamemodes/gamemodes.css: .gm-co-hintspot { transition }', { count: 1, reason: GLIDE }],
  ['styles/games/games.module.css: .card { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-events-main { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-events-dot::before { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-gacha-poster-wrap { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-skin-item { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-featured-op { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/home/front.css: .front-community-fade-wrap { animation }', { count: 1, reason: CROSSFADE }],
  ['styles/home/front.css: @keyframes front-community-fade-in', { count: 1, reason: CROSSFADE }],
  ['styles/home/front.css: .front-community-item { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/music/music.css: .music-crossfade-text { transition }', { count: 1, reason: CROSSFADE }],
  ['styles/music/music.css: .music-track-title.marquee { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-play-btn.loading { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: @keyframes music-play-loading-pulse', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-lyric-line { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/music/music.css: .music-wave-visualizer { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-wave-1 { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-wave-2 { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-wave-3 { animation }', { count: 1, reason: LOOP }],
  ['styles/music/music.css: @keyframes music-wave-scroll', { count: 1, reason: LOOP }],
  ['styles/music/music.css: @keyframes music-wave-hue-cycle', { count: 1, reason: LOOP }],
  ['styles/music/music.css: .music-discover-album-tile-cover { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/music/music.css: .music-discover-character-portrait { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/operator-detail.css: .op-carousel-img-enter { animation }', { count: 1, reason: CROSSFADE }],
  ['styles/operators/operator-detail.css: .op-carousel-img-exit { animation }', { count: 1, reason: CROSSFADE }],
  ['styles/operators/operator-detail.css: @keyframes op-img-fade-in', { count: 1, reason: CROSSFADE }],
  ['styles/operators/operator-detail.css: @keyframes op-img-fade-out', { count: 1, reason: CROSSFADE }],
  ['styles/operators/operator-detail.css: .op-synergy-operator { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/operator-detail.css: .op-skill-technique-branch-op-icon { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/operator-detail.css: .op-skill-technique-related-op { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/operator-detail.css: .op-skill-technique-related-more { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/operator-detail.css: .op-skill-technique-unit-icon { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/operators/roster.css: .roster-card-enter, .skin-card-enter { animation }', { count: 1, reason: ENTRANCE }],
  ['styles/pulls/pulls.css: .pulls-wish-option { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/pulls/pulls.css: .pulls-operator-choice { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/recruitment/recruitment.css: .recruit-combo-op { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/recruitment/recruitment.css: .recruit-sheet-pairing { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/events.css: .events-row { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/events.css: .events-row-name { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/events.css: .event-detail-skin-item { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/timeline.css: .timeline-bar { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/timeline.css: .map-pin-pulse { animation }', { count: 1, reason: LOOP }],
  ['styles/schedule/timeline.css: @keyframes pin-pulse', { count: 1, reason: LOOP }],
  ['styles/schedule/timeline.css: .schedule-fullscreen-panel { transition }', { count: 1, reason: DRAWER }],
  ['styles/schedule/timeline.css: .schedule-fullscreen-panel.open { transition }', { count: 1, reason: DRAWER }],
  ['styles/schedule/timeline.css: .schedule-panel-skin img { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/schedule/timeline.css: .schedule-panel-pullable-op { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/skins/skins.css: .skin-card { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/skins/skins.css: .skin-zoom-image { transition }', { count: 1, reason: ZOOM }],
  ['styles/stages/stages-terminal.css: .terminal-tab { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .score-node-pin { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .score-node-art { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .terminal-lead-art { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .regular-now { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .regular-now-go::after { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .regular-tower { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .supply-card { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages-terminal.css: .ra-fill { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/stages/stages.css: @keyframes stage-route-march', { count: 1, reason: LOOP }],
  ['styles/stages/stages.css: @keyframes stage-route-march-fine', { count: 1, reason: LOOP }],
  ['styles/stages/stages.css: .stage-route-line { animation }', { count: 1, reason: LOOP }],
  ['styles/stages/stages.css: .stage-route-line.flying { animation }', { count: 1, reason: LOOP }],
  ['styles/stages/stages.css: .stage-legend-overlay { transition }', { count: 1, reason: DRAWER }],
  ['styles/techniques/techniques.css: .technique-fragility-umbrella { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/techniques/techniques.css: .technique-entry-operator-icon { transition }', { count: 1, reason: HOVER_FADE }],
  ['styles/ui/ticker.css: .ticker-bar { transition }', { count: 1, reason: DRAWER }],
  ['styles/ui/ticker.css: .ticker-track { animation }', { count: 1, reason: LOOP }],
  ['styles/ui/ticker.css: @keyframes ticker-scroll', { count: 1, reason: LOOP }],
  ['components/ui/FadeCarousel.tsx: style.transition', { count: 1, reason: CROSSFADE }],
  ['pages/base.tsx: style.transition', { count: 1, reason: METER }],
  ['pages/obtain-method.tsx: style.animationDelay', { count: 1, reason: ENTRANCE }],
  ['pages/operators/index.tsx: style.animationDelay', { count: 1, reason: ENTRANCE }],
  ['pages/skins.tsx: style.animationDelay', { count: 1, reason: ENTRANCE }],
]);

/** Every declaration that adds motion, in the order the audit finds them. */
const MOTION_PROP = /^(?:transition|animation)(?:-[a-z-]+)?$/;
const OFF = /^(?:none|0m?s?|initial|unset|inherit)?\s*(?:!important)?$/i;

function walk(root, dir, exts) {
  const out = [];
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== 'node_modules') out.push(...walk(root, rel, exts)); }
    else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

/** A brace-aware walk of a stylesheet: every rule and at-rule block with the stack of
 *  at-rule preludes around it, so a rule's media context is known exactly (the audit's
 *  topLevel() only strips @media blocks, which is not enough to say what is inside
 *  which). Returns { kind: 'rule'|'keyframes', prelude, body, stack }. Keyframe steps are
 *  part of their @keyframes block, not rules. */
export function blocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') {
      const prelude = norm(text.slice(start, i).split(/[;}]/).pop());
      if (/^@(?:-webkit-)?keyframes\b/.test(prelude)) {
        let depth = 1;
        let j = i + 1;
        while (j < text.length && depth) { if (text[j] === '{') depth += 1; else if (text[j] === '}') depth -= 1; j += 1; }
        out.push({ kind: 'keyframes', prelude, body: text.slice(i + 1, j - 1), stack: [...stack] });
        i = j - 1;
        start = j;
        continue;
      }
      if (prelude.startsWith('@')) { stack.push(prelude); start = i + 1; continue; }
      let j = text.indexOf('}', i);
      if (j < 0) j = text.length;
      out.push({ kind: 'rule', prelude, body: text.slice(i + 1, j), stack: [...stack] });
      i = j;
      start = j + 1;
    } else if (c === '}') {
      stack.pop();
      start = i + 1;
    }
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

const NO_PREFERENCE = /prefers-reduced-motion\s*:\s*no-preference/;
const REDUCE = /prefers-reduced-motion\s*:\s*reduce/;
const HOVER_MEDIA = /\(\s*hover\s*:\s*hover\s*\)/;

/* --- the reduced-motion stops for what predates motion.css ---------------------------
   A MOTION_LEGACY animation keeps its own `prefers-reduced-motion: reduce` override, and
   the label saying so is not enough: /gacha's tutorial pull cards slid in under reduced
   motion because their stop sat in shared.css, which loads before gacha.css, so at equal
   specificity the animation won. So every legacy rule that starts an animation (the
   `animation` shorthand or `animation-name`) must be stopped, selector by selector, by a
   rule inside a reduce block that sets it to none AND wins the cascade: a subject that
   holds every simple selector of the animated one's (ancestors may narrow it to where it
   is used), with higher specificity, or equal specificity and later in the cascade (the
   same file after it, or a file _app.tsx imports later; CSS modules load after the
   global sheets). And the one site-wide stop for transitions (shared.css) must be there. */

const beats = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
/** Splits a selector list on its top-level commas. */
function selectorList(prelude) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of prelude) {
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** Specificity [ids, classes, types] of one selector; :where() is 0, :is()/:not()/:has()
 *  are their most specific argument, a module's :global(x) is x. */
export function specificity(selector) {
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  let total = [0, 0, 0];
  // Outermost functional pseudo-classes (and :global) out first, argument by argument.
  let s = '';
  const src = selector;
  for (let i = 0; i < src.length; i += 1) {
    const m = /^:(where|is|not|has|matches|global)\(/.exec(src.slice(i));
    if (!m || src[i - 1] === ':') { s += src[i]; continue; }
    let depth = 1;
    let j = i + m[0].length;
    while (j < src.length && depth) { if (src[j] === '(') depth += 1; else if (src[j] === ')') depth -= 1; j += 1; }
    const inner = src.slice(i + m[0].length, j - 1);
    if (m[1] === 'global') s += inner;
    else if (m[1] !== 'where') total = add(total, selectorList(inner).map(specificity).sort((x, y) => beats(y, x))[0] ?? [0, 0, 0]);
    i = j - 1;
  }
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):(?!:)[\w-]+(?:\([^)]*\))?/g) || []).length;
  const types = (s.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) || []).length + (s.match(/::[\w-]+(?:\([^)]*\))?/g) || []).length;
  return add(total, [ids, classes, types]);
}
/** The simple selectors of a selector's subject (its last compound), as a set of strings. */
function subjectOf(selector) {
  const s = selector.replace(/:global\(([^()]*)\)/g, '$1').trim();
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(c)) cut = i + 1;
  }
  const compound = s.slice(cut);
  return new Set(compound.match(/::?[\w-]+(?:\((?:[^()]|\([^()]*\))*\))?|\.[\w-]+|#[\w-]+|\[[^\]]*\]|^[a-z*][\w-]*/gi) || []);
}
/** The cascade position of each global stylesheet: its import line in pages/_app.tsx. */
function importOrder(root) {
  const order = new Map();
  let app = '';
  try { app = readFileSync(join(root, 'pages/_app.tsx'), 'utf8'); } catch { /* no app */ }
  let n = 0;
  for (const m of app.matchAll(/import\s+'@\/(styles\/[^']+\.css)'/g)) { n += 1; order.set(m[1], n); }
  return (path) => (order.has(path) ? order.get(path) : path.endsWith('.module.css') ? 10_000 : 0);
}

/** Every legacy rule that starts an animation, and whether a winning reduce stop covers
 *  each of its selectors; plus whether the site-wide transition stop is there. */
export function reducedMotionStops(root) {
  const order = importOrder(root);
  const css = [...walk(root, 'styles', ['.css']), ...walk(root, 'components', ['.css'])].sort();
  const starts = [];
  const stops = [];
  let transitionStop = false;
  for (const path of css) {
    if (path === MOTION_FILE) continue;
    blocks(readFileSync(join(root, path), 'utf8')).forEach((b, index) => {
      if (b.kind !== 'rule') return;
      const reduce = b.stack.some((m) => REDUCE.test(m));
      const decls = declarations(b.body);
      const at = { path, file: order(path), index };
      if (reduce) {
        if (decls.some((d) => /^animation(?:-name)?$/.test(d.prop) && OFF.test(d.value))) {
          for (const sel of selectorList(b.prelude)) stops.push({ ...at, sel, spec: specificity(sel), subject: subjectOf(sel) });
        }
        if (selectorList(b.prelude).includes('*') && decls.some((d) => d.prop === 'transition' && /^none\s*!important$/i.test(d.value))) transitionStop = true;
        return;
      }
      if (decls.some((d) => /^animation(?:-name)?$/.test(d.prop) && !OFF.test(d.value))) {
        for (const sel of selectorList(b.prelude)) starts.push({ ...at, prelude: b.prelude, sel, spec: specificity(sel), subject: subjectOf(sel) });
      }
    });
  }
  const unstopped = starts.filter((a) => !stops.some((t) => [...a.subject].every((x) => t.subject.has(x))
    && (beats(t.spec, a.spec) > 0 || (beats(t.spec, a.spec) === 0 && (t.file > a.file || (t.file === a.file && t.path === a.path && t.index > a.index))))));
  return { starts, unstopped, transitionStop };
}

/** { found: string[], motionFile: string[] }: the motion declarations outside motion.css
 *  (as `path: selector { prop }`, `path: @keyframes name`, `path: style.prop`), and what
 *  in motion.css breaks its two rules. */
/* The properties motion.css may animate: paint only, never a box's size or place. */
const PAINT_ONLY = /^(transform|translate|scale|rotate|opacity|box-shadow|filter|color|background-color|border(-(top|right|bottom|left))?-color|outline-color|fill|stroke|text-decoration-color)$/;

/** What a motion.css block animates: the properties a transition names, or that a
 *  @keyframes block sets. */
function animatedProps(b) {
  if (b.kind === 'keyframes') return [...new Set([...b.body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]))];
  const out = [];
  for (const d of declarations(b.body)) {
    if (d.prop === 'transition-property') out.push(...d.value.split(',').map((v) => v.trim()));
    else if (d.prop === 'transition') out.push(...d.value.split(/,(?![^(]*\))/).map((v) => v.trim().split(/\s+/)[0]));
  }
  return out.map((prop) => prop.toLowerCase()).filter((prop) => prop && prop !== 'none');
}

export function motionFindings(root) {
  const found = [];
  const motionFile = [];
  const css = [...walk(root, 'styles', ['.css']), ...walk(root, 'components', ['.css'])].sort();
  for (const path of css) {
    const isMotion = path === MOTION_FILE;
    for (const b of blocks(readFileSync(join(root, path), 'utf8'))) {
      if (isMotion) {
        const where = b.kind === 'keyframes' ? b.prelude : b.prelude;
        if (!b.stack.some((m) => NO_PREFERENCE.test(m))) motionFile.push(`${path}: ${where} is outside @media (prefers-reduced-motion: no-preference)`);
        if (b.kind === 'rule' && /:hover\b/.test(b.prelude) && !b.stack.some((m) => HOVER_MEDIA.test(m))) motionFile.push(`${path}: ${where} is a :hover outside @media (hover: hover)`);
        // Motion never moves the layout: it may animate paint (transform, opacity, shadow,
        // colour) and nothing that sizes or places a box, so the browser checks can sample
        // one page per kind of motion instead of loading every page twice each way.
        for (const prop of animatedProps(b)) {
          if (!PAINT_ONLY.test(prop)) motionFile.push(`${path}: ${where} animates ${prop}, which moves the layout (only transform, translate, scale, rotate, opacity, box-shadow, filter and colours)`);
        }
        continue;
      }
      if (b.kind === 'keyframes') { found.push(`${path}: ${b.prelude.replace(/^@(?:-webkit-)?keyframes\s+/, '@keyframes ')}`); continue; }
      for (const d of declarations(b.body)) {
        if (!MOTION_PROP.test(d.prop) || OFF.test(d.value)) continue;
        found.push(`${path}: ${b.prelude} { ${d.prop} }`);
      }
    }
  }
  const tsx = [...walk(root, 'pages', ['.tsx', '.ts']), ...walk(root, 'components', ['.tsx', '.ts']), ...walk(root, 'lib', ['.tsx', '.ts'])].sort();
  for (const path of tsx) {
    const code = readFileSync(join(root, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    // An inline style: { transition: ..., animationDelay: ... }
    for (const m of code.matchAll(/[{,]\s*(transition(?:Property|Duration|Delay|TimingFunction)?|animation(?:Name|Duration|Delay|TimingFunction|IterationCount|Direction|FillMode|PlayState)?)\s*:\s*([^,}\n]+)/g)) {
      const value = m[2].trim().replace(/^['"`]|['"`]$/g, '');
      if (OFF.test(value)) continue;
      found.push(`${path}: style.${m[1]}`);
    }
    // A script writing one: el.style.transition = '...'
    for (const m of code.matchAll(/\.style\.(transition\w*|animation\w*)\s*=(?!=)\s*([^;\n]+)/g)) {
      const value = m[2].trim().replace(/^['"`]|['"`]$/g, '');
      if (OFF.test(value)) continue;
      found.push(`${path}: style.${m[1]} =`);
    }
  }
  return { found, motionFile };
}

function counts(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

/** The motionScope offences: a motion declaration outside motion.css that MOTION_LEGACY
 *  does not accept (or more of one than it counts), an accepted one no longer there, and
 *  motion.css breaking its own two rules. */
export function collectMotion(root) {
  const { found, motionFile } = motionFindings(root);
  const out = [...motionFile];
  const have = counts(found);
  for (const [entry, n] of have) {
    const known = MOTION_LEGACY.get(entry);
    const allowed = known ? known.count : 0;
    for (let i = allowed; i < n; i += 1) out.push(`${entry} -- motion outside ${MOTION_FILE}: move it there, inside @media (prefers-reduced-motion: no-preference)`);
  }
  for (const [entry, { count }] of MOTION_LEGACY) {
    for (let i = have.get(entry) || 0; i < count; i += 1) out.push(`${entry} -- in MOTION_LEGACY (scripts/audits/audit-motion.mjs) but no longer found: delete the entry`);
  }
  const { unstopped, transitionStop } = reducedMotionStops(root);
  for (const a of unstopped) out.push(`${a.path}: ${a.sel} { animation } -- runs under prefers-reduced-motion: reduce: stop it with animation: none inside @media (prefers-reduced-motion: reduce), after it in the same file (or more specific)`);
  if (!transitionStop) out.push(`styles/core/shared.css: @media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important } } -- the site-wide stop for the transitions written before ${MOTION_FILE} is gone`);
  return { motionScope: out };
}

export const MOTION_LABELS = {
  motionScope: `motion outside ${MOTION_FILE} (a transition, an animation or an @keyframes; MOTION_LEGACY lists what predates it, each with its reason, and only shrinks), or a rule in it outside @media (prefers-reduced-motion: no-preference), or a :hover in it outside @media (hover: hover) -- docs/development/ui-primitives.md rule 23`,
};

// `node scripts/audits/audit-motion.mjs --list` prints what it finds, for writing the list.
if (process.argv[1] && relative(process.cwd(), process.argv[1]).endsWith('audit-motion.mjs') && process.argv.includes('--list')) {
  const { found, motionFile } = motionFindings(join(new URL('.', import.meta.url).pathname, '../..'));
  for (const [entry, n] of counts(found)) console.log(`${n}\t${entry}`);
  for (const line of motionFile) console.log(`MOTION.CSS\t${line}`);
}
