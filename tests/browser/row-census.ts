/*
 * The row-alignment census, run inside the page (page.evaluate(rowCensus, tolerance)).
 *
 * "In the pull planner the text and buttons are not in one line" (maintainer,
 * 2026-09-26): in each goal row the Until, Available, All goals and Left values sat
 * about 7px above the centre of the Pulls input and the remove button beside them,
 * because a caption under each value (Estimated, 3 free, Shortfall) took space in the
 * flow and lifted the value off the row's centre line. Nothing measured it.
 *
 * For every flex row and grid on the page this pairs each CONTROL child (a button,
 * input, select, dropdown trigger, chip or .check label, or a wrapper whose only
 * content is one) with each TEXT child on the same line (a child with visible text
 * and no control in it) and with each other control on the same line, and reports
 * the pair when their vertical centres are more than `tolerance` px apart. The text's centre is the
 * centre of its glyph boxes in the flow -- one line, or a short stack such as a label
 * over a value -- which a centred line box puts on the box's centre. Space reserved
 * for an empty caption is not text, so it shows as the value sitting off the line;
 * a caption hung out of the flow (position: absolute) is not counted.
 *
 * Deliberately not reported: cards (a control taller than 80px), text whose main line
 * wraps (a paragraph beside a button lines up by its first line), anything positioned
 * out of flow, and pairs that do not share a line (a wrapped chip row, a label stacked
 * above its field).
 */
/** `beside` is the text, or the second control, off the control's centre line by `offset` px. */
export interface RowOffence { container: string; control: string; beside: string; offset: number }

export function rowCensus(tolerance: number): RowOffence[] {
  const CONTROL = 'button:not(.btn-bare), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea, [role="combobox"], a.btn, a.ghost, a.primary, a.danger, .filter-chip, .tgl, label.check';
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
  const controlsIn = (el: Element) => Array.from(el.querySelectorAll(CONTROL)).filter(visible);
  /** Whether `el`, or an element between it and `root`, is positioned out of flow. */
  const outOfFlow = (el: Element, root: Element) => {
    for (let node: Element | null = el; node && node !== root; node = node.parentElement) if (!inFlow(node)) return true;
    return false;
  };
  /** The text nodes under `root` that render in its flow (outside `skip`), with their
   *  font size and glyph boxes. A caption hung out of the flow does not count. */
  const textRuns = (root: Element, skip?: Element) => {
    const out: { size: number; rects: DOMRect[] }[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || (skip && skip.contains(parent)) || !visible(parent) || outOfFlow(parent, root)) continue;
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
  const offences: RowOffence[] = [];
  const seen = new Set<string>();
  for (const container of Array.from(document.querySelectorAll('body *'))) {
    const cs = getComputedStyle(container);
    const flexRow = /flex/.test(cs.display) && cs.flexDirection.startsWith('row');
    if (!flexRow && !/grid/.test(cs.display)) continue;
    if (!visible(container)) continue;
    const kids = Array.from(container.children).filter((k) => visible(k) && inFlow(k));
    if (kids.length < 2) continue;
    const controls: { kid: Element; box: DOMRect; el: Element }[] = [];
    const texts: { kid: Element; line: { top: number; bottom: number; centre: number } }[] = [];
    for (const kid of kids) {
      if (kid.matches(CONTROL)) {
        controls.push({ kid, el: kid, box: kid.getBoundingClientRect() });
        continue;
      }
      const inner = controlsIn(kid);
      if (inner.length === 1) {
        // A wrapper round one control (a label round an input, a div round a dropdown
        // trigger) stands for that control when nothing else in it shows text.
        if (!textRuns(kid, inner[0]).length) controls.push({ kid, el: inner[0], box: inner[0].getBoundingClientRect() });
        continue;
      }
      if (inner.length) continue;
      if (kid.querySelector('img, svg, video, canvas, picture')) {
        const media = Array.from(kid.querySelectorAll('img, svg, video, canvas, picture')).some((m) => m.getBoundingClientRect().height > 40);
        if (media) continue;
      }
      const line = textBlock(kid);
      if (line) texts.push({ kid, line });
    }
    // Two controls side by side (a search field and its Clear button) share a centre too.
    for (let i = 0; i < controls.length; i += 1) {
      for (let j = i + 1; j < controls.length; j += 1) {
        const [a, b] = [controls[i].box, controls[j].box];
        if (a.height > 80 || b.height > 80) continue;
        const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap < Math.min(a.height, b.height) * 0.5) continue;
        const offset = Math.round(((b.top + b.bottom) / 2 - (a.top + a.bottom) / 2) * 10) / 10;
        if (Math.abs(offset) <= tolerance) continue;
        const key = `${describe(container)}|${describe(controls[i].el)}|${describe(controls[j].el)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        offences.push({ container: describe(container), control: describe(controls[i].el), beside: describe(controls[j].el), offset });
      }
    }
    for (const c of controls) {
      if (c.box.height > 80) continue;
      for (const t of texts) {
        // Same line: the text's main line lies within the control's vertical extent.
        const overlap = Math.min(c.box.bottom, t.line.bottom) - Math.max(c.box.top, t.line.top);
        if (overlap < Math.min(c.box.height, t.line.bottom - t.line.top) * 0.5) continue;
        const offset = Math.round((t.line.centre - (c.box.top + c.box.bottom) / 2) * 10) / 10;
        if (Math.abs(offset) <= tolerance) continue;
        const key = `${describe(container)}|${describe(c.el)}|${describe(t.kid)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        offences.push({ container: describe(container), control: describe(c.el), beside: describe(t.kid), offset });
      }
    }
  }
  return offences;
}
