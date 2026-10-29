/*
 * The section census, run inside the page (page.evaluate(sectionCensus, options)): the
 * vertical rhythm and the left edges of a page's sections. row-census.ts measures the
 * other axis (the centre line of a row); this one measures
 *
 *   headings   every section heading (.op-section h2, .section-title, .waiting-box h2):
 *              its look, and the gap from it -- or from the heading row it leads -- to
 *              the first content under it (docs/development/ui-primitives.md rule 15)
 *   sections   consecutive .op-sections stacked in a column, and the gap between them
 *   entities   every .entity-title (and dialog title): its size, and the section h2
 *              above it in the same section (rule 16)
 *   firstGap   the page header's hairline to the first content in <main> (rule 15)
 *   stacks     a child whose first line starts 3-120px right of its parent's content
 *              edge while a sibling starts on it (rule 17)
 *
 * The 2026-09-26 census found 12 heading gaps (0-30px), 11 section gaps (0-44px),
 * 13 pages whose first line was not 24px under the hairline, and first lines set in by
 * an 18px box centred in a 40px cell, the browser's 40px list indent and 4-6px of
 * padding on the operator page's voice lines.
 *
 * Everything is box geometry (margins, padding, borders, the left edge of the first
 * glyph), so it holds on the Linux fonts CI renders with; nothing measures a text's
 * width. A gap is laid-out space between boxes, which no font changes.
 *
 * What counts as "first content": the first box drawn -- a box with a visible
 * background, side border or top rule, a control, an image, or the line box of text
 * (its box top plus its padding) -- descending through unboxed wrappers. A heading row
 * (a flex or grid row the heading shares a line with: a count, a button) is measured
 * from its content's bottom, not from padding under it.
 *
 * Deliberately not measured, and why:
 *   - a heading that is a disclosure's header (it holds an [aria-expanded] control):
 *     its body hangs from it on a shared edge (/farming's tiers)
 *   - a heading with nothing under it in its section
 *   - sections in a multi-column grid: a board of panels spaced by its grid gap (the
 *     Terminal home), not a column of sections
 *   - in the stack census: inline runs (only blocks stack), anything positioned out of
 *     flow, content centred or end-aligned across the section (text-align, justify-content
 *     or align-items on a box at least half the stack's width, an auto left margin), and
 *     a tile that centres an icon over its label (the technique, material and character
 *     tiles). A control centred alone in a small cell is NOT excluded: that is the indent
 *     the music guesser's select-all box had. A row boxed by its state (the selected
 *     stage row, the voice line being played: boxed while a sibling of its class is not)
 *     leads by its content, not its box. When no child starts on the parent's content
 *     edge, the leftmost child is the edge (the operator panel's header and reading area
 *     disagreeing with each other). A picture card's text is reported like any other
 *     indent; page-bounds.spec.ts accepts it from its baseline at --card-inset, measured by
 *     its content box (`boxDx`, layout only) rather than its first glyph.
 */
export interface HeadingReport {
  text: string;
  size: number;
  weight: string;
  tracking: number;
  transform: string;
  colour: string;
  /** null when the gap is not measured (see above); `why` says which. */
  gap: number | null;
  why: string;
  next: string;
}
export interface SectionGapReport { a: string; b: string; gap: number }
export interface EntityReport { text: string; size: number; sectionHeading: string | null; sectionSize: number | null }
/** `dx` is where the child's first line starts (its first glyph or box); `boxDx` where its
 *  content box starts (layout only, font-free), both from the parent's content edge. */
export interface StackOffence { parent: string; child: string; dx: number; boxDx: number; by: string; flush: string }
export interface FirstGapReport { gap: number | null; first: string; terminalScene: boolean }
export interface SectionCensus {
  headings: HeadingReport[];
  sections: SectionGapReport[];
  entities: EntityReport[];
  firstGap: FirstGapReport;
  stacks: StackOffence[] | null;
}

export function sectionCensus(options: { stacks: boolean }): SectionCensus {
  const de = document.documentElement;
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const cs = (el: Element) => { let s = styleCache.get(el); if (!s) { s = getComputedStyle(el); styleCache.set(el, s); } return s; };
  const px = (v: string) => parseFloat(v) || 0;
  const R = (n: number) => Math.round(n * 10) / 10;
  const clear = (c: string) => !c || c === 'transparent' || /^rgba\(\d+, \d+, \d+, 0\)$/.test(c);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = cs(el);
    return s.visibility !== 'hidden' && s.opacity !== '0' && el.checkVisibility();
  };
  const inFlow = (el: Element) => !['absolute', 'fixed'].includes(cs(el).position);
  const describe = (el: Element | null) => {
    if (!el) return '';
    const raw = typeof el.className === 'string' ? el.className : el.getAttribute('class') ?? '';
    const cls = raw.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c.replace(/__[\w-]{5}$/, '').replace(/^[\w-]+_(?=[a-zA-Z])/, '')}`).join('');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
    return `${el.tagName.toLowerCase()}${cls}${text ? ` "${text}"` : ''}`;
  };
  const firstClass = (el: Element) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '') || '';
  const inDialog = (el: Element) => !!el.closest('dialog, [role="dialog"], .modal-box, .modal-overlay');
  const root = document.getElementById('page-content') ?? document.body;
  const main = root.querySelector('main') ?? root;

  /** The nearest opaque background behind an element's own box. */
  const behind = (el: Element) => {
    for (let x = el.parentElement; x; x = x.parentElement) { const c = cs(x).backgroundColor; if (!clear(c)) return c; }
    return cs(document.body).backgroundColor;
  };
  /** A box a reader sees as a box: a visible side border, a background unlike what is
   *  behind it, or an image. A band in the page's own colour is not one. */
  const boxed = (el: Element) => {
    const s = cs(el);
    const side = (['Left', 'Right'] as const).some((k) => px(s.getPropertyValue(`border-${k.toLowerCase()}-width`)) > 0
      && s.getPropertyValue(`border-${k.toLowerCase()}-style`) !== 'none' && !clear(s.getPropertyValue(`border-${k.toLowerCase()}-color`)));
    return side || (!clear(s.backgroundColor) && s.backgroundColor !== behind(el)) || s.backgroundImage !== 'none';
  };
  const topRule = (el: Element) => { const s = cs(el); return px(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !clear(s.borderTopColor); };
  const REPLACED = /^(IMG|SVG|VIDEO|CANVAS|PICTURE|INPUT|SELECT|TEXTAREA|IFRAME)$/i;
  // A tab (.tab, components/ui/Tabs) is a control too, though it is .btn-bare: it draws
  // no box, but its box is its hit area and carries its underline at the foot, so the
  // strip's top is the box's, like a chip row's. It has no side padding, so its box's
  // left is its label's (tests/browser/tab-align.ts measures the label).
  const CONTROL = 'button:not(.btn-bare), .tab, [role="combobox"], .filter-chip, a.btn, a.ghost, a.primary, a.danger';
  const ownText = (el: Element) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
  const contentTop = (el: Element) => { const s = cs(el); return el.getBoundingClientRect().top + px(s.borderTopWidth) + px(s.paddingTop); };

  /** The top of the first thing drawn in `el`. */
  const visualTop = (el: Element): number => {
    const r = el.getBoundingClientRect();
    if (boxed(el) || topRule(el) || REPLACED.test(el.tagName) || el.matches(CONTROL)) return r.top;
    // A row that centres its items (a 44px list row, a field row) is one line: its content
    // box is the first content. So is a text block's; its padding is empty space. A row
    // that does not centre them (picture cards) is measured by what its items draw.
    const d = cs(el);
    const row = (d.display.includes('flex') && d.flexDirection.startsWith('row')) || d.display.includes('grid');
    if ((row && ['center', 'safe center'].includes(d.alignItems)) || ownText(el)) return contentTop(el);
    let best = Infinity;
    for (const k of Array.from(el.children)) if (visible(k) && inFlow(k)) best = Math.min(best, visualTop(k));
    return best === Infinity ? contentTop(el) : best;
  };

  /* ---------------- headings ---------------- */
  const isRow = (el: Element) => { const s = cs(el); return (s.display.includes('flex') && s.flexDirection.startsWith('row')) || s.display.includes('grid'); };
  const sameLine = (a: DOMRect, b: DOMRect) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * 0.3;
  /** The heading, or the row it shares a line with (a count, a button), climbing while
   *  each parent is such a row. */
  const headingBlock = (h: Element) => {
    let block: Element = h;
    for (let p = h.parentElement; p && p !== main && p !== root; p = p.parentElement) {
      if (!isRow(p)) break;
      const br = block.getBoundingClientRect();
      const beside = Array.from(p.children).some((k) => k !== block && visible(k) && inFlow(k) && sameLine(k.getBoundingClientRect(), br));
      // A heading row that wrapped on a phone (the count dropped under the heading) is
      // still the heading's row: a row of small things, none much taller than the heading.
      const small = Array.from(p.children).every((k) => !visible(k) || !inFlow(k) || k.getBoundingClientRect().height <= Math.max(br.height * 2.5, 60));
      if (!beside && !small) break;
      block = p;
    }
    return block;
  };
  /** The bottom of a heading, or of its row's content box (padding under a row is not
   *  part of the heading). */
  const blockBottom = (block: Element, h: Element) => {
    if (block === h) return h.getBoundingClientRect().bottom;
    const s = cs(block);
    return block.getBoundingClientRect().bottom - px(s.paddingBottom) - px(s.borderBottomWidth);
  };
  const BOUNDARY = '.op-section, section, article, main, dialog, [role="dialog"]';
  const nextContent = (block: Element): Element | null => {
    for (let x: Element | null = block; x && x !== main && x !== root; x = x.parentElement) {
      for (let s = x.nextElementSibling; s; s = s.nextElementSibling) if (visible(s) && inFlow(s)) return s;
      if (x.parentElement?.matches(BOUNDARY)) return null;
    }
    return null;
  };
  const SECTION_HEADING = '.op-section h2, h2.section-title, .waiting-box h2';
  const headings: HeadingReport[] = [];
  for (const h of Array.from(main.querySelectorAll(SECTION_HEADING))) {
    if (!visible(h) || inDialog(h) || h.matches('.entity-title, .visually-hidden')) continue;
    const s = cs(h);
    const size = px(s.fontSize);
    const entry: HeadingReport = {
      text: (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), size, weight: s.fontWeight,
      tracking: R((s.letterSpacing === 'normal' ? 0 : px(s.letterSpacing)) / size * 1000) / 1000,
      transform: s.textTransform, colour: s.color, gap: null, why: '', next: '',
    };
    const block = headingBlock(h);
    if (block.querySelector('[aria-expanded]')) entry.why = 'a disclosure header';
    else {
      const next = nextContent(block);
      if (!next) entry.why = 'nothing under it';
      else { entry.gap = R(visualTop(next) - blockBottom(block, h)); entry.next = describe(next); }
    }
    headings.push(entry);
  }

  /* ---------------- stacked sections ---------------- */
  const board = (el: Element | null) => !!el && cs(el).display.includes('grid') && cs(el).gridTemplateColumns.trim().split(/\s+(?![^(]*\))/).length > 1;
  const sections: SectionGapReport[] = [];
  for (const a of Array.from(main.querySelectorAll('.op-section'))) {
    if (!visible(a) || inDialog(a) || !inFlow(a) || board(a.parentElement)) continue;
    let b = a.nextElementSibling;
    while (b && !(visible(b) && inFlow(b))) b = b.nextElementSibling;
    if (!b || !b.matches('.op-section')) continue;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (rb.top < ra.bottom - 1) continue; // side by side
    sections.push({ a: describe(a).replace(/ ".*$/, ''), b: describe(b).replace(/ ".*$/, ''), gap: R(rb.top - ra.bottom) });
  }

  /* ---------------- entity titles ---------------- */
  const entities: EntityReport[] = [];
  for (const e of Array.from(root.querySelectorAll('.entity-title, .modal-box h2'))) {
    if (!visible(e)) continue;
    const section = e.closest('.op-section');
    let heading: Element | null = null;
    if (section) {
      for (const h of Array.from(section.querySelectorAll('h2'))) {
        if (h === e || h.matches('.entity-title') || !visible(h) || h.closest('.modal-box, dialog')) continue;
        if (h.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) { heading = h; break; }
      }
    }
    entities.push({
      text: (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), size: px(cs(e).fontSize),
      sectionHeading: heading ? (heading.textContent ?? '').trim().slice(0, 30) : null, sectionSize: heading ? px(cs(heading).fontSize) : null,
    });
  }

  /* ---------------- header hairline to first content ---------------- */
  const header = Array.from(root.querySelectorAll('header')).find((x) => visible(x) && x.querySelector('h1') && !x.closest('main')) ?? null;
  let firstGap: FirstGapReport = { gap: null, first: '', terminalScene: main.matches('.terminal-scene') };
  if (header && main !== root) {
    const extension = header.nextElementSibling?.matches('.page-header-sticky-actions') ? header.nextElementSibling : null;
    const hb = (extension ?? header).getBoundingClientRect().bottom;
    let top = Infinity;
    let first: Element | null = null;
    const walk = (el: Element) => {
      for (const k of Array.from(el.children)) {
        if (!visible(k)) continue;
        // A picture laid over its box (next/image's fill, the operator artwork) is content
        // at its own top, though it is out of flow: its frame paints nothing of its own (a
        // painted ground used to make the operator artwork's pane count, 2026-10-29).
        if (!inFlow(k)) {
          if (cs(k).position !== 'absolute') continue;
          // Only its pictures: a control or a label laid over the art is not the page's
          // first content (the operator page's Chibi switch sits over its artwork).
          for (const pic of [k, ...Array.from(k.querySelectorAll('img, video, canvas'))]) {
            if (!/^(IMG|VIDEO|CANVAS)$/i.test(pic.tagName) || !visible(pic)) continue;
            const r = pic.getBoundingClientRect();
            if (r.height >= 40 && r.top < top) { top = r.top; first = pic; }
          }
          continue;
        }
        const box = boxed(k) || topRule(k) || REPLACED.test(k.tagName) || k.matches(CONTROL);
        const t = box ? k.getBoundingClientRect().top : ownText(k) ? contentTop(k) : Infinity;
        if (t < top) { top = t; first = k; }
        if (t === Infinity) walk(k);
      }
    };
    walk(main);
    if (first) firstGap = { gap: R(top - hb), first: describe(first), terminalScene: main.matches('.terminal-scene') };
  }

  /* ---------------- stacks ---------------- */
  let stacks: StackOffence[] | null = null;
  if (options.stacks) {
    stacks = [];
    type Lead = { l: number; t: number; node: Element; by: string };
    const leadCache = new Map<Element, Lead | null>();
    const contentLeft = (el: Element) => { const s = cs(el); return el.getBoundingClientRect().left + px(s.borderLeftWidth) + px(s.paddingLeft); };
    const generated = (el: Element) => {
      const b = getComputedStyle(el, '::before');
      return b.content !== 'none' && b.content !== 'normal' && b.display !== 'none' && !['absolute', 'fixed'].includes(b.position);
    };
    /** A row boxed by its state (the selected stage row, the voice line being played):
     *  boxed while a sibling of the same class is not. It leads by its content. */
    const highlighted = (el: Element) => {
      const cls = firstClass(el);
      return !!cls && !!el.parentElement && Array.from(el.parentElement.children).some((k) => k !== el && firstClass(k) === cls && visible(k) && !boxed(k));
    };
    /** The leftmost thing drawn on an element's first line. */
    const leading = (el: Element): Lead | null => {
      if (leadCache.has(el)) return leadCache.get(el)!;
      let out: Lead | null = null;
      if (visible(el) && inFlow(el)) {
        const r = el.getBoundingClientRect();
        const s = cs(el);
        if ((boxed(el) && !highlighted(el)) || REPLACED.test(el.tagName) || el.matches(CONTROL)) out = { l: r.left, t: r.top, node: el, by: describe(el).replace(/ ".*$/, '') };
        else if ((el.tagName === 'SUMMARY' && s.display === 'list-item') || generated(el)) {
          // A disclosure marker or a generated glyph leads its element, at its content edge.
          out = { l: contentLeft(el), t: r.top, node: el, by: `marker:${describe(el).replace(/ ".*$/, '')}` };
        } else if (el.tagName === 'LI' && s.display === 'list-item' && s.listStyleType !== 'none' && s.listStylePosition === 'outside' && el.parentElement) {
          // An outside marker sits in the list's marker column: 1.1em of the list's own
          // font, the site's list reset (a 40px browser indent leaves the marker ~25px in).
          const list = cs(el.parentElement);
          const column = Math.min(px(list.paddingLeft), 1.1 * px(list.fontSize));
          out = { l: contentLeft(el) - column, t: r.top, node: el, by: `marker:${describe(el).replace(/ ".*$/, '')}` };
        } else {
          const found: Lead[] = [];
          for (const n of Array.from(el.childNodes)) {
            if (n.nodeType === 3) {
              const text = n.textContent ?? '';
              const i = text.search(/\S/);
              if (i < 0) continue;
              const range = document.createRange();
              range.setStart(n, i);
              range.setEnd(n, i + 1);
              const q = Array.from(range.getClientRects()).find((x) => x.width > 0);
              if (q) found.push({ l: q.left, t: q.top, node: el, by: `text:${describe(el).replace(/ ".*$/, '')}` });
            } else if (n.nodeType === 1) {
              const x = leading(n as Element);
              if (x) found.push(x);
            }
          }
          if (found.length) {
            const t0 = Math.min(...found.map((x) => x.t));
            out = found.filter((x) => x.t < t0 + 16).reduce((a, b) => (b.l < a.l ? b : a));
          }
        }
      }
      leadCache.set(el, out);
      return out;
    };
    /** Whether anything from the leading node up to `top` centres or end-aligns it: a
     *  tile (a column that centres an icon over its label: the technique, material and
     *  character tiles), or a centring box at least half the stack's width. A control
     *  centred alone in a small cell (the select-all box in a 40px cell) is an indent, not
     *  a centred layout. An auto margin end-aligns whatever its width. */
    const aligned = (node: Element, top: Element, span: number) => {
      const wide = (el: Element) => el.getBoundingClientRect().width >= span / 2;
      const autoLeft = (el: Element) => {
        const typed = (el as Element & { computedStyleMap?: () => { get: (p: string) => { toString: () => string } | undefined } }).computedStyleMap?.();
        return typed?.get('margin-left')?.toString() === 'auto';
      };
      const tile = (el: Element) => { const t = cs(el); return t.display.includes('flex') && t.flexDirection.startsWith('column') && ['center', 'safe center'].includes(t.alignItems) && Array.from(el.children).filter(visible).length >= 2; };
      for (let x: Element | null = node; x; x = x.parentElement) {
        const s = cs(x);
        if (['center', 'right', 'end', '-webkit-center'].includes(s.textAlign) && wide(x)) return true;
        const parent = x.parentElement;
        if (parent && x !== top && tile(parent)) return true;
        if (parent && wide(parent)) {
          const ps = cs(parent);
          if (ps.display.includes('flex') && ps.flexDirection.startsWith('row') && ['center', 'flex-end', 'end', 'right', 'space-around', 'space-evenly'].includes(ps.justifyContent)) return true;
          if (ps.display.includes('flex') && ps.flexDirection.startsWith('column') && ['center', 'flex-end', 'end'].includes(ps.alignItems)) return true;
          if (ps.display.includes('grid') && ['center', 'end', 'right'].includes(ps.justifyItems)) return true;
          if (['center', 'end', 'right', 'flex-end'].includes(s.justifySelf) || (ps.flexDirection.startsWith('column') && ['center', 'flex-end', 'end'].includes(s.alignSelf))) return true;
        }
        // An auto left margin (centred or pushed to the end); getComputedStyle resolves it
        // to pixels, the typed computed value keeps the keyword.
        if (autoLeft(x)) return true;
        if (x === top) break;
      }
      return false;
    };
    for (const C of Array.from(main.querySelectorAll('*'))) {
      if (!visible(C) || inDialog(C)) continue;
      let fixed = false;
      for (let x: Element | null = C; x && x !== de; x = x.parentElement) if (cs(x).position === 'fixed') { fixed = true; break; }
      if (fixed) continue;
      // Blocks only: inline runs wrapping inside a paragraph are one text, not a stack.
      const kids = Array.from(C.children).filter((k) => visible(k) && inFlow(k) && !cs(k).display.startsWith('inline') && cs(k).display !== 'contents');
      if (kids.length < 2) continue;
      let stacked = true;
      for (let i = 1; i < kids.length; i += 1) if (kids[i].getBoundingClientRect().top < kids[i - 1].getBoundingClientRect().bottom - 2) { stacked = false; break; }
      if (!stacked) continue;
      const cl = contentLeft(C);
      const span = C.getBoundingClientRect().width;
      const rows = kids.map((k) => { const L = leading(k); return L ? { k, L, dx: R(L.l - cl) } : null; })
        .filter((x): x is { k: Element; L: Lead; dx: number } => !!x && !aligned(x.L.node, x.k, span));
      if (rows.length < 2) continue;
      // The edge: the parent's content edge when a child starts on it; otherwise where the
      // leftmost child starts (a header and a reading area that disagree with each other,
      // neither on the parent's edge, are a misalignment too).
      const ref = rows.some((x) => Math.abs(x.dx) <= 2) ? 0 : Math.min(...rows.map((x) => x.dx));
      const flush = rows.filter((x) => Math.abs(x.dx - ref) <= 2);
      for (const row of rows) {
        const off = R(row.dx - ref);
        if (off <= 3 || off > 120) continue;
        stacks.push({
          parent: describe(C).replace(/ ".*$/, ''), child: describe(row.k).replace(/ ".*$/, ''), dx: off,
          boxDx: R(contentLeft(row.k) - cl - ref), by: row.L.by, flush: describe(flush[0].k).replace(/ ".*$/, ''),
        });
      }
    }
  }
  return { headings, sections, entities, firstGap, stacks };
}
