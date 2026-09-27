/*
 * The row-alignment census, run inside the page (page.evaluate(rowCensus, tolerances)).
 *
 * "In the pull planner the text and buttons are not in one line" (maintainer,
 * 2026-09-26): in each goal row the Until, Available, All goals and Left values sat
 * about 7px above the centre of the Pulls input and the remove button beside them,
 * because a caption under each value (Estimated, 3 free, Shortfall) took space in the
 * flow and lifted the value off the row's centre line. Nothing measured it.
 *
 * For every flex row and grid on the page this pairs each CONTROL child (a button,
 * input, select, dropdown trigger, chip, disclosure summary or .check label, a bare
 * button that draws a border, or a wrapper whose only content is one) with each TEXT
 * child on the same line (a child with visible text and no control in it) and with
 * each other control on the same line, and reports two things:
 *
 *   centre  the pair's vertical centres are more than `centre` px apart. The text's
 *           centre is the centre of its glyph boxes in the flow -- one line, or a short
 *           stack such as a label over a value -- which a centred line box puts on the
 *           box's centre. Space reserved for an empty caption is not text, so it shows
 *           as the value sitting off the line; a caption hung out of the flow
 *           (position: absolute) is not counted.
 *   height  two controls on the same line differ in height by more than `height` px
 *           (the 2026-09-26 census: a 38px search beside a 44px Clear, 32px chips
 *           beside a 44px Start button, a 36px round step beside 40px selects). One
 *           control height, --control-h, is ui-primitives rule 4.
 *
 * A wrapper round a single-line group of controls (a SegmentedControl's chips) stands
 * for the group, measured by its first control, so a chip group beside a button is
 * compared too; a flex row that wraps onto a second line is measured by its first line.
 *
 * Deliberately not reported: cards (a control taller than 80px), text whose main line
 * wraps (a paragraph beside a button lines up by its first line), anything positioned
 * out of flow, range inputs, pairs that do not share a line (a wrapped chip row, a
 * label stacked above its field), cells led by a picture (media taller than 40px),
 * and -- for height only -- a .check label, whose drawn box is its 18px checkbox, not
 * the label row round it, a control drawn as text (no border, no fill), whose box
 * nobody sees, and a control whose label wraps to a second line.
 *
 * And a third, for grids only:
 *
 *   overflow  a control is wider than the grid column it sits in: it ends past its
 *           column's edge, not on the edge of a later column it spans. One control
 *           height made the controls bigger, and a page that still sized its column
 *           for the old control let the new one run into the gap: the voice lines'
 *           play button went to 36px (40 on a phone) in a 32px column and crowded the
 *           line title to 5px (1px on a phone). Box edges only, so the same on any font.
 */
/** `beside` is the text, or the second control, off the control's centre line (or
 *  height) by `offset` px. */
export interface RowOffence { kind: 'centre' | 'height' | 'overflow'; container: string; control: string; beside: string; offset: number }

/** Centre-line and control-height tolerances, px, and which rows to measure: `content`
 *  (the default) is everything but the site nav, `nav` the site nav alone. The nav is the
 *  same fixed bar on every page, so row-alignment.spec.ts measures it once rather than on
 *  every address and state -- where its brand row (an 18px name beside an 11px "Beta",
 *  centred on the theme toggle) read 1.8px off at a 2px tolerance with the webfonts and
 *  2.3px without them, one glyph-metric reading that failed 59 desktop tests at once. */
export interface RowTolerance { centre: number; height: number; scope?: 'content' | 'nav' }

export function rowCensus(tolerance: RowTolerance): RowOffence[] {
  const CONTROL = 'button:not(.btn-bare), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea, [role="combobox"], a.btn, a.ghost, a.primary, a.danger, .filter-chip, .tgl, label.check, summary';
  /** A .btn-bare button starts from nothing -- a card, a tile, a tab, a name that opens
   *  a popover -- and is a control once it draws a control's boundary: a visible border
   *  on all four sides (the /music queue's track title, a boxed bare button 36px tall
   *  beside the row's 40px icon buttons, which the census could not see while it left
   *  every .btn-bare out). A picture card keeps a transparent border at rest, and a list
   *  row a hairline on one side, so both stay out. */
  const BARE = 'button.btn-bare';
  const transparent = (colour: string) => /rgba\([^)]*,\s*0\)|transparent/.test(colour);
  /** How many sides of `el` draw a visible border. */
  const edges = (el: Element) => {
    const s = getComputedStyle(el);
    return ['top', 'right', 'bottom', 'left'].filter((side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && !transparent(s.getPropertyValue(`border-${side}-color`))).length;
  };
  const isControl = (el: Element) => el.matches(CONTROL) || (el.matches(BARE) && edges(el) === 4);
  /** Whether an ancestor of `el` is itself a control (a chip inside a dropdown trigger
   *  counts once, as the trigger). */
  const inControl = (el: Element) => {
    for (let node = el.parentElement; node; node = node.parentElement) if (isControl(node)) return true;
    return false;
  };
  const MEDIA = 'img, svg, video, canvas, picture';
  const describe = (el: Element) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join('') : '';
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
  };
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.opacity !== '0' && el.checkVisibility();
  };
  const inFlow = (el: Element) => !['absolute', 'fixed'].includes(getComputedStyle(el).position);
  const controlsIn = (el: Element) => Array.from(el.querySelectorAll(`${CONTROL}, ${BARE}`)).filter((c) => isControl(c) && visible(c) && !inControl(c));
  /** Whether `el`, or an element between it and `root`, is positioned out of flow. */
  const outOfFlow = (el: Element, root: Element) => {
    for (let node: Element | null = el; node && node !== root; node = node.parentElement) if (!inFlow(node)) return true;
    return false;
  };
  /** A control drawn as text -- no visible border and no fill (an inline name that
   *  opens a popover, a bare glyph button): its box is not seen, so only its centre
   *  counts, not its height. */
  const drawnAsText = (el: Element) => {
    const s = getComputedStyle(el);
    const fill = s.backgroundImage !== 'none' || !transparent(s.backgroundColor);
    return !edges(el) && !fill;
  };
  /** A control whose label runs to a second line: its height is its text's, and a
   *  wider fallback font (CI's Linux Chromium) can wrap a label the Mac keeps on one. */
  const wraps = (el: Element) => {
    const lines = textRuns(el).flatMap((r) => r.rects);
    return lines.length > 1 && Math.max(...lines.map((r) => r.top)) - Math.min(...lines.map((r) => r.top)) > 4;
  };
  /** A control whose content is a picture (a portrait tab, an operator slot): its
   *  height follows the art, not the control height. */
  const pictureLed = (el: Element) => Array.from(el.querySelectorAll(MEDIA)).some((m) => m.getBoundingClientRect().height > 40);
  /** The text nodes under `root` that render in its flow (outside every element of
   *  `skip`), with their font size and glyph boxes. A caption hung out of the flow does
   *  not count. */
  const textRuns = (root: Element, skip: Element[] = []) => {
    const out: { size: number; rects: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || skip.some((s) => s.contains(parent)) || !visible(parent) || outOfFlow(parent, root)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (rects.length) out.push({ size: parseFloat(getComputedStyle(parent).fontSize), rects });
    }
    return out;
  };
  /** The vertical extent of the text under `el`: one line, or a short stack (a value
   *  with a label over it, a title with a status under it). Null when the largest text
   *  wraps -- a paragraph beside a button lines up by its first line -- or the stack is
   *  taller than three lines. */
  const textBlock = (el: Element) => {
    const runs = textRuns(el);
    if (!runs.length) return null;
    const size = Math.max(...runs.map((r) => r.size));
    const main = runs.filter((r) => r.size === size).flatMap((r) => r.rects);
    if (Math.max(...main.map((r) => r.bottom)) - Math.min(...main.map((r) => r.top)) > size * 1.8) return null;
    const rects = runs.flatMap((r) => r.rects);
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    if (bottom - top > size * 1.3 * 3) return null;
    return { top, bottom, centre: (top + bottom) / 2 };
  };
  /** The first line of a flex row that mixes text with controls and wraps onto more
   *  than one line, as the extent of the items on it; null for anything else. A row of
   *  controls only (a chip group) is left to the group rule: whether it wraps can turn
   *  on the font, and CI's Linux fonts are wider than the Mac's. */
  const firstLine = (el: Element) => {
    const cs = getComputedStyle(el);
    if (!/flex/.test(cs.display) || !cs.flexDirection.startsWith('row') || cs.flexWrap !== 'wrap') return null;
    const children = Array.from(el.children).filter((k) => visible(k) && inFlow(k));
    if (!children.some((k) => !isControl(k) && !controlsIn(k).length)) return null;
    const items = children.map((k) => k.getBoundingClientRect());
    if (items.length < 2) return null;
    const top = Math.min(...items.map((r) => r.top));
    const first = items.filter((r) => r.top < top + 2);
    const bottom = Math.max(...first.map((r) => r.bottom));
    if (!items.some((r) => r.top >= bottom - 1)) return null;
    return { top, bottom, centre: (top + bottom) / 2 };
  };
  /** Whether boxes all overlap one another vertically: controls on one line. */
  const oneLine = (boxes: DOMRect[]) => boxes.every((a) => boxes.every((b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= Math.min(a.height, b.height) * 0.5));
  const offences: RowOffence[] = [];
  const seen = new Set<string>();
  const report = (kind: RowOffence['kind'], container: Element, a: Element, b: Element, offset: number) => {
    const key = `${kind}|${describe(container)}|${describe(a)}|${describe(b)}`;
    if (seen.has(key)) return;
    seen.add(key);
    offences.push({ kind, container: describe(container), control: describe(a), beside: describe(b), offset });
  };
  for (const container of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(container);
    const flexRow = /flex/.test(cs.display) && cs.flexDirection.startsWith('row');
    if (!flexRow && !/grid/.test(cs.display)) continue;
    if (isControl(container) || !visible(container)) continue;
    if (!!container.closest('.site-nav') !== (tolerance.scope === 'nav')) continue;
    const kids = Array.from(container.children).filter((k) => visible(k) && inFlow(k));
    if (kids.length < 2) continue;
    const controls: { kid: Element; box: DOMRect; el: Element }[] = [];
    const texts: { kid: Element; line: { top: number; bottom: number; centre: number } }[] = [];
    for (const kid of kids) {
      if (isControl(kid)) {
        controls.push({ kid, el: kid, box: kid.getBoundingClientRect() });
        continue;
      }
      // A wrapped row (a flex-wrap line of meta that runs to a second line beside a
      // menu) lines up by its FIRST line: the /operators/Amiya name row centred a
      // two-line meta on the section menu, which put the menu between the lines.
      const wrapped = firstLine(kid);
      if (wrapped) { texts.push({ kid, line: wrapped }); continue; }
      const inner = controlsIn(kid);
      if (inner.length === 1) {
        // A wrapper round one control (a label round an input, a div round a dropdown
        // trigger) stands for that control. With text of its own BESIDE the control (an
        // inline caption, a class name before a branch), the control still shares the
        // row's line with the other controls; the caption is measured in the wrapper's
        // own row. Not a label stacked over its field (the stack lines up by its top, as
        // the pull planner's phone cells do), and not a card that holds a button
        // (taller than 80px, or led by a picture).
        const box = inner[0].getBoundingClientRect();
        const text = textRuns(kid, inner).flatMap((r) => r.rects);
        const beside = text.some((r) => Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) >= r.height * 0.5);
        if (!text.length || (beside && kid.getBoundingClientRect().height <= 80 && !pictureLed(kid))) controls.push({ kid, el: inner[0], box });
        continue;
      }
      if (inner.length) {
        // A wrapper round a one-line group of controls (a SegmentedControl) stands for
        // the group when nothing else in it shows text.
        const boxes = inner.map((c) => c.getBoundingClientRect());
        if (oneLine(boxes) && !textRuns(kid, inner).length) controls.push({ kid, el: inner[0], box: boxes[0] });
        continue;
      }
      if (kid.querySelector(MEDIA) && pictureLed(kid)) continue;
      const line = textBlock(kid);
      if (line) texts.push({ kid, line });
    }
    // Two controls side by side (a search field and its Clear button) share a centre
    // and a height.
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const [a, b] = [controls[i].box, controls[j].box];
        if (a.height > 80 || b.height > 80) continue;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap < Math.min(a.height, b.height) * 0.5) continue;
        const offset = Math.round(((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) * 10) / 10;
        if (Math.abs(offset) > tolerance.centre) report('centre', container, controls[i].el, controls[j].el, offset);
        const [ea, eb] = [controls[i].el, controls[j].el];
        if ([ea, eb].some((e) => e.matches('label.check') || pictureLed(e) || drawnAsText(e) || wraps(e))) continue;
        const diff = Math.round((b.height - a.height) * 10) / 10;
        if (Math.abs(diff) > tolerance.height) report('height', container, ea, eb, diff);
      }
    }
    // A control wider than its grid area (see `overflow` above). Only a grid whose tracks
    // start at its content edge (justify-content start or normal). The tracks are the
    // resolved grid-template-columns, in CSS px, so they are scaled by the element's CSS
    // zoom (the Stronghold companion zooms to its window); the area is the columns the
    // grid item spans (grid-column), so a row spanning 1 / -1 holds a control of any width.
    if (/grid/.test(cs.display) && /^(normal|start|stretch|flex-start|left)$/.test(cs.justifyContent) && !/subgrid/.test(cs.gridTemplateColumns)) {
      const zoom = (container as Element & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
      const tracks = cs.gridTemplateColumns.split(/\s+/).map(parseFloat).filter((n) => Number.isFinite(n)).map((n) => n * zoom);
      const gap = (parseFloat(cs.columnGap) || 0) * zoom;
      const outer = container.getBoundingClientRect();
      let at = outer.left + ((parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.paddingLeft) || 0)) * zoom;
      const cols = tracks.map((w) => { const col = { start: at, end: at + w, w }; at += w + gap; return col; });
      /** How many columns a grid item spans, from its grid-column. */
      const spanOf = (el: Element, i: number) => {
        const k = getComputedStyle(el);
        const m = /span\s+(\d+)/.exec(k.gridColumnEnd) ?? /span\s+(\d+)/.exec(k.gridColumnStart);
        if (m) return Number(m[1]);
        const [a, b] = [parseInt(k.gridColumnStart, 10), parseInt(k.gridColumnEnd, 10)];
        if (!Number.isFinite(b)) return 1;
        const line = (x: number) => (x < 0 ? cols.length + 2 + x : x);
        return Math.max(1, line(b) - (Number.isFinite(a) ? line(a) : i + 1));
      };
      for (const c of controls) {
        const box = c.el.getBoundingClientRect();
        const i = cols.findIndex((col) => Math.abs(col.start - c.kid.getBoundingClientRect().left) <= 1);
        if (i < 0) continue;
        const area = cols[Math.min(cols.length - 1, i + spanOf(c.kid, i) - 1)];
        if (box.right <= area.end + 1) continue;
        const key = `overflow|${describe(container)}|${describe(c.el)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        offences.push({ kind: 'overflow', container: describe(container), control: describe(c.el), beside: `its ${Math.round((area.end - cols[i].start) * 10) / 10}px column (${i + 1} of ${cols.length})`, offset: Math.round((box.right - area.end) * 10) / 10 });
      }
    }
    for (const c of controls) {
      if (c.box.height > 80) continue;
      for (const t of texts) {
        // Same line: the text's main line lies within the control's vertical extent.
        const overlap = Math.min(c.box.bottom, t.line.bottom) - Math.max(c.box.top, t.line.top);
        if (overlap < Math.min(c.box.height, t.line.bottom - t.line.top) * 0.5) continue;
        const offset = Math.round((t.line.centre - (c.box.top + c.box.bottom) / 2) * 10) / 10;
        if (Math.abs(offset) <= tolerance.centre) continue;
        report('centre', container, c.el, t.kid, offset);
      }
    }
  }
  return offences;
}
