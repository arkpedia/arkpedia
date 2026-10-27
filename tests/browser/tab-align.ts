/*
 * The tab-alignment census, run inside the page (page.evaluate(tabAlign, options)).
 *
 * "Check for consistency with tabs ... and fix the alignment issues" (maintainer,
 * 2026-09-26). The mock had equal-width centred tabs, which put the first label ~30px
 * right of the section heading and of the buttons and checkboxes under it, and the r9
 * census found the site doing it: /operators/Amiya's voice-line categories +29.8px,
 * /recruitment's view switch +45.6, the calendar's layers +62.5, the map tools +49.6,
 * the music guesser's clip start +23.9 (all centred labels in stretched chips), and the
 * Terminal bar centred +26.9 off the frame.
 *
 * For every tab strip and pick-one row that LEADS ITS VISUAL LINE -- [role=tablist],
 * .tabs (the link strips), .seg-control (SegmentedControl), a class named *-tabs or
 * *Tabs, and any row of two or more .filter-chip -- this checks two things:
 *
 *   edge       the first item's box starts on the section's edge: within `tolerance` px
 *              of the text-left of the nearest heading before it in the same column,
 *              of the content edge of the section, dialog or boxed panel it sits in, of
 *              the block on the line above it, or of the page frame. A tab is measured
 *              by its first glyph or icon (it has no box); a chip by its border, with
 *              the label 13px in.
 *   stretched  no item on the first line is GROWN wider than its own content plus
 *              padding -- flex-grow, or equal fr columns filling the row -- which is what
 *              centres the label away from the edge. A tile sized on purpose (a 44px
 *              icon tile) is not grown. STRETCH_OK lists the rows where equal cells are
 *              right, with the reason (audit:styles' STRETCH_ALLOWED says the same in
 *              CSS), and PLACED_OK the two rows centred on purpose.
 *
 * And every visible .tab (Tabs, and the link strips) draws no box: no side padding, no
 * border, no fill -- the `boxed` kind.
 *
 * "Leads its visual line" means nothing is drawn to its left on the same line: no text,
 * picture, control or boxed element beside it, and no sibling to its left in a row
 * layout on the way up to its section. A row placed after a heading on the heading's
 * own line (the map tools beside MAP), a sort row at the right end of a toolbar and the
 * event tabs in the right-hand column are placed there on purpose and are not measured.
 *
 * Linux-font-safe (CI runs Chromium on the maintainer's NAS with other fonts): every
 * measure is a box edge, a text node's inline start or a width compared with the same
 * element's own content, never a text width against a constant.
 */
export interface TabAlignOffence { kind: 'edge' | 'stretched' | 'boxed'; group: string; detail: string }

export interface TabAlignOptions { tolerance: number }

export function tabAlign({ tolerance }: TabAlignOptions): TabAlignOffence[] {
  /** Rows where equal cells are right. Keep in step with STRETCH_ALLOWED in
   *  scripts/audits/audit-choices-badges.mjs. */
  const STRETCH_OK: [string, string][] = [
    ['.supply-schedule', 'Mon-Sun: seven equal day cells, a week row'],
    ['[aria-label="Clip length"]', 'the clip-length scale under the full-width seek bar in the centred listening console'],
    ['[class*="guesser_categories"]', 'the operator guesser\'s ten hint categories as a checklist in columns, each label left in its cell'],
    ['.op-skill-tabs', 'the operator page\'s skill tabs share the panel\'s width on purpose (#376), each label left in its tab (#377)'],
  ];
  /** Rows that are not on a section's edge by design, with the reason. */
  const PLACED_OK: [string, string][] = [
    ['.music-player-bottombar-controls', 'the music player\'s transport, centred under the full-width seek bar like every player'],
    ['[class*="OperatorAttackRange_elites"]', 'the attack-range figure\'s own switch, centred under the grid it changes'],
  ];
  const de = document.documentElement;
  const cw = Math.min(de.clientWidth, document.body.getBoundingClientRect().width);
  const frameMax = parseFloat(getComputedStyle(de).getPropertyValue('--frame-max'));
    const frameLeft = cw >= frameMax ? (cw - frameMax) / 2 + 24 : 24;
  const px = (v: string) => parseFloat(v) || 0;
  const round = (n: number) => Math.round(n * 10) / 10;
  const cs = (el: Element) => getComputedStyle(el);
  const clear = (c: string) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = cs(el);
    return s.visibility !== 'hidden' && el.checkVisibility() && !el.closest('.visually-hidden, .sr-only');
  };
  const fixedOrChrome = (el: Element) => {
    if (el.closest('.site-nav, .skip-link')) return true;
    for (let x: Element | null = el; x && x !== de; x = x.parentElement) if (cs(x).position === 'fixed') return true;
    return false;
  };
  const describe = (el: Element) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((c) => `.${c}`).join('') : '';
    const name = el.getAttribute('aria-label');
    return `${el.tagName.toLowerCase()}${cls}${name ? ` "${name}"` : ''}`;
  };
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30);
  const firstTextLeft = (el: Element): number | null => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rect = Array.from(range.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      if (rect) return rect.left;
    }
    return null;
  };
  /** The horizontal extent of what an item draws: its text and its pictures. */
  const extent = (el: Element) => {
    let l = Infinity;
    let r = -Infinity;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent?.trim() || !n.parentElement || !visible(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const rect of Array.from(range.getClientRects())) { if (rect.width > 0) { l = Math.min(l, rect.left); r = Math.max(r, rect.right); } }
    }
    // Pictures: img, svg, canvas, video, and anything painted by a mask or a background
    // (the Terminal's mode marks, the class glyphs in currentColor).
    for (const child of Array.from(el.querySelectorAll('*'))) {
      const s = cs(child);
      const painted = /^(IMG|SVG|VIDEO|CANVAS)$/i.test(child.tagName) || s.backgroundImage !== 'none'
        || (s.maskImage && s.maskImage !== 'none') || ((s as unknown as { webkitMaskImage?: string }).webkitMaskImage ?? 'none') !== 'none'
        || !clear(s.backgroundColor);
      if (!painted || !visible(child)) continue;
      const rect = child.getBoundingClientRect();
      l = Math.min(l, rect.left);
      r = Math.max(r, rect.right);
    }
    return Number.isFinite(l) ? { l, r } : null;
  };
  /** The width an item's content needs: what it draws, plus its own padding and border. */
  const intrinsic = (el: Element) => {
    const e = extent(el);
    if (!e) return null;
    const s = cs(el);
    return e.r - e.l + px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);
  };
  const SECTION = 'section, article, main, aside, fieldset, dialog, [role="dialog"], [role="tabpanel"], header, form, li, td, details';
  const boxed = (el: Element) => {
    const s = cs(el);
    return !clear(s.backgroundColor) || s.backgroundImage !== 'none'
      || (px(s.borderLeftWidth) > 0 && s.borderLeftStyle !== 'none' && !clear(s.borderLeftColor));
  };
  const contentLeft = (el: Element) => {
    const s = cs(el);
    return el.getBoundingClientRect().left + px(s.borderLeftWidth) + px(s.paddingLeft);
  };

  /* What is drawn: text runs, pictures, controls and boxed elements, collected once. */
  const ink: { el: Element; rect: DOMRect }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!n.textContent?.trim() || !parent || !visible(parent) || fixedOrChrome(parent)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const rect of Array.from(range.getClientRects())) if (rect.width > 0 && rect.height > 0) ink.push({ el: parent, rect });
  }
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (!/^(IMG|SVG|VIDEO|CANVAS|INPUT|SELECT|BUTTON|TEXTAREA)$/i.test(el.tagName) && !boxed(el)) continue;
    if (!visible(el) || fixedOrChrome(el)) continue;
    ink.push({ el, rect: el.getBoundingClientRect() });
  }

  const offences: TabAlignOffence[] = [];

  // --- boxed: a tab draws no box. Its label is its edge, so side padding, a border or a
  // fill from a page rule (the planner's old .simple-operator-tabs button rule gave its
  // tabs all three) puts the first label off the heading and makes a fifth tab look.
  for (const tab of Array.from(document.querySelectorAll('.tab'))) {
    if (!visible(tab) || fixedOrChrome(tab) || tab.closest('.terminal-tabs.open')) continue;
    const s = cs(tab);
    const paint = [
      px(s.paddingLeft) || px(s.paddingRight) ? `side padding ${s.paddingLeft} ${s.paddingRight}` : '',
      ['Top', 'Right', 'Bottom', 'Left'].some((side) => px(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0) ? `border ${s.borderTopWidth}` : '',
      !clear(s.backgroundColor) || s.backgroundImage !== 'none' ? `fill ${s.backgroundColor}` : '',
    ].filter(Boolean);
    if (paint.length) offences.push({ kind: 'boxed', group: describe(tab.parentElement ?? tab), detail: `"${text(tab)}" draws ${paint.join(', ')}` });
  }
  // Tab strips and pick-one rows, by role or class, and any row of two or more chips
  // (the calendar's layers, the map tools): the same stretched-and-centred mistake
  // reached those too.
  const candidates = new Set<Element>(document.querySelectorAll('[role="tablist"], .tabs, .seg-control, [class*="-tabs"], [class*="Tabs"]'));
  for (const chip of Array.from(document.querySelectorAll('.filter-chip'))) {
    const row = chip.parentElement;
    if (row && row.querySelectorAll(':scope > .filter-chip').length >= 2) candidates.add(row);
  }
  const groups = Array.from(candidates).filter((g) => visible(g) && !fixedOrChrome(g));
  for (const group of groups) {
    if (PLACED_OK.some(([sel]) => group.matches(sel))) continue;
    const items = Array.from(group.children).filter((c) => visible(c) && c.matches('[role="tab"], .tab, .filter-chip, button, a'));
    if (!items.length) continue;
    const firstBox = items[0].getBoundingClientRect();
    // A tab has no box: where it starts is its first glyph or icon. A chip starts at its
    // border, with its label the padding in.
    const isTab = items[0].matches('[role="tab"], .tab');
    const drawn = isTab ? extent(items[0]) : null;
    const first = drawn ? new DOMRect(drawn.l, firstBox.top, firstBox.right - drawn.l, firstBox.height) : firstBox;
    const overlaps = (r: DOMRect) => Math.min(r.bottom, first.bottom) - Math.max(r.top, first.top) > 0;

    // Leads its line? Nothing drawn to its left on the same line...
    const beside = ink.find(({ el, rect }) => rect.right <= first.left + 1 && rect.right > 0 && overlaps(rect)
      && !group.contains(el) && !el.contains(group));
    if (beside) continue;
    // ...and no sibling to its left in a row layout, up to its section.
    let placed = false;
    const section = group.parentElement?.closest(SECTION) ?? document.body;
    for (let node: Element = group; node.parentElement && node !== section; node = node.parentElement) {
      const parent = node.parentElement;
      const ps = cs(parent);
      const row = (/flex/.test(ps.display) && ps.flexDirection.startsWith('row')) || /grid/.test(ps.display);
      if (!row) continue;
      const box = node.getBoundingClientRect();
      if (Array.from(parent.children).some((sib) => sib !== node && visible(sib) && sib.getBoundingClientRect().right <= box.left + 1
        && Math.min(sib.getBoundingClientRect().bottom, box.bottom) - Math.max(sib.getBoundingClientRect().top, box.top) > 0)) { placed = true; break; }
    }
    if (placed) continue;

    // --- edge ------------------------------------------------------------------
    const refs: { what: string; left: number }[] = [{ what: 'frame', left: frameLeft }];
    let container: Element | null = group.parentElement;
    while (container && container !== document.body && !(container.matches(SECTION) || boxed(container))) container = container.parentElement;
    if (container && container !== document.body) refs.push({ what: `${describe(container)} content edge`, left: contentLeft(container) });
    // The block on the line above: the nearest visible element before the group, at its
    // own level or its parent's, up to the container (the operator hero's name row over
    // its class forms, the search field over the voice-line categories).
    for (let node: Element | null = group; node && node !== container && node !== document.body; node = node.parentElement) {
      let prev = node.previousElementSibling;
      while (prev && !visible(prev)) prev = prev.previousElementSibling;
      if (prev) { refs.push({ what: `${describe(prev)} above`, left: prev.getBoundingClientRect().left }); break; }
    }
    // The nearest heading before the group whose column holds the first item.
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).filter((h) => visible(h) && !fixedOrChrome(h)
      && (h.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING));
    for (let i = headings.length - 1; i >= 0; i -= 1) {
      const h = headings[i];
      const hl = firstTextLeft(h);
      const box = h.getBoundingClientRect();
      if (hl === null || box.right <= first.left || hl > first.left + tolerance + 40) continue;
      refs.push({ what: `${h.tagName.toLowerCase()} "${text(h)}" text-left`, left: hl });
      break;
    }
    const nearest = refs.reduce((a, b) => (Math.abs(b.left - first.left) < Math.abs(a.left - first.left) ? b : a));
    if (Math.abs(nearest.left - first.left) > tolerance) {
      offences.push({
        kind: 'edge',
        group: describe(group),
        detail: `first ${isTab ? 'tab\'s label' : 'item\'s box'} "${text(items[0])}" starts at x=${round(first.left)}; the edges are ${refs.map((r) => `${r.what} x=${round(r.left)}`).join(', ')}`,
      });
    }

    // --- stretched ---------------------------------------------------------------
    const ok = STRETCH_OK.find(([sel]) => group.matches(sel));
    if (ok) continue;
    // Grown, not sized: a fixed-width icon tile (a 44px talent tile, a 40px "1x") is
    // wider than its content on purpose. Growing is flex-grow on the item, or a grid
    // that deals the row out in equal columns (1fr) filling the group.
    const gs = cs(group);
    const tracks = /grid/.test(gs.display) ? gs.gridTemplateColumns.split(/\s+/).map(px).filter((w) => w > 0) : [];
    const fillsGrid = tracks.length > 1 && tracks.every((w) => Math.abs(w - tracks[0]) < 1)
      && Math.abs(tracks.reduce((a, b) => a + b, 0) + px(gs.columnGap) * (tracks.length - 1) - (group.getBoundingClientRect().width - px(gs.paddingLeft) - px(gs.paddingRight) - px(gs.borderLeftWidth) - px(gs.borderRightWidth))) < 2;
    const line = items.filter((it) => Math.abs(it.getBoundingClientRect().top - firstBox.top) < 4);
    const grown = line.map((it) => ({ it, w: it.getBoundingClientRect().width, need: intrinsic(it), grow: px(cs(it).flexGrow) > 0 && /flex/.test(gs.display) }))
      .filter(({ w, need, grow }) => need !== null && w > need + 4 && (grow || fillsGrid));
    if (grown.length) {
      offences.push({
        kind: 'stretched',
        group: describe(group),
        detail: grown.map(({ it, w, need }) => `"${text(it)}" is ${round(w)}px for ${round(need!)}px of content`).join('; '),
      });
    }
  }
  return offences;
}
