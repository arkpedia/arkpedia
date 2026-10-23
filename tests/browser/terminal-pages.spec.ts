import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsSettled, refuseWebfonts } from './census-routes';

/*
 * The catalogue and terminal pages -- /stages/*, /gamemodes*, /enemies, /techniques,
 * /synergies. One test per bug the 2026-09-25 UI review found on them (REVIEW.md
 * §4.2 and §4.3 I), each measured on the rendered page, because every one of these
 * passed typecheck, lint and a green build while it was broken.
 */

/** WCAG contrast of two sRGB colours given as [r, g, b] in 0-255. */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Puts `target` at `topPx` from the viewport's top, runs each step of `act`, and
 *  returns the largest distance it moved on screen after any of them -- the Anti-Page
 *  Jump measure (arkpedia-ui skill). Measured on the element itself, so a selector
 *  that matches several elements cannot measure one and press another. */
async function anchorMoved(page: Page, target: Locator, act: (() => Promise<void>)[], topPx = 160): Promise<number> {
  await target.waitFor({ state: 'visible' });
  await target.evaluate((el, topPx) => {
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - topPx), behavior: 'instant' });
  }, topPx);
  await page.waitForTimeout(500);
  const before = (await target.boundingBox())!.y;
  let moved = 0;
  for (const step of act) {
    await step();
    await page.waitForTimeout(900);
    moved = Math.max(moved, Math.abs((await target.boundingBox())!.y - before));
  }
  return moved;
}

test('Stronghold section tabs stay clickable once the lookup bar pins under the nav', async ({ page }) => {
  // UC-01: .gm-lookup was sticky at top:0, under the fixed site nav, so once pinned
  // elementFromPoint at every tab answered with the nav -- 0 of 7 clickable at 1440,
  // the first row hidden at 390.
  await page.goto('/game-modes/stronghold-protocol');
  const tabs = page.locator('.gm-lookup [role="tab"]');
  await expect(tabs.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
  // The nav collapses over a transition; the bar re-measures when it settles.
  await page.waitForTimeout(900);
  const hits = await tabs.evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { label: button.textContent, top: Math.round(box.top), ok: !!hit && button.contains(hit) };
  }));
  expect(hits.length).toBeGreaterThanOrEqual(7);
  expect(hits.filter((h) => !h.ok), 'a pinned tab is covered by something else').toEqual([]);
  // And the page did scroll far enough for the bar to be pinned at all.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
});

test('stage cards keep their names on a phone when the stage has other forms', async ({ page }) => {
  // UC-03: the "forms available" label never shrank, so on a phone it squeezed 18 of
  // 28 names on this page to 0px and ran 13px off the card.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stages/content/main_14');
  const cards = page.locator('.stage-card');
  await expect(cards.first()).toBeVisible();
  const measured = await cards.evaluateAll((els) => els.map((card) => {
    const box = card.getBoundingClientRect();
    const name = card.querySelector('.stage-card-name')?.getBoundingClientRect();
    const forms = card.querySelector('.stage-card-forms')?.getBoundingClientRect();
    return {
      name: name ? Math.round(name.width) : null,
      formsOverflow: forms ? Math.round(forms.right - box.right) : -1,
      hasForms: !!forms,
    };
  }));
  expect(measured.filter((m) => m.hasForms).length, 'the page has stages with other forms').toBeGreaterThan(0);
  expect(measured.filter((m) => m.name !== null && m.name < 40), 'a stage name narrower than 40px').toEqual([]);
  expect(measured.filter((m) => m.formsOverflow > 0), 'a forms label past the card edge').toEqual([]);
});

test('nothing on a stage card runs past its edge on a phone, and the code stays on one line', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Measured at 390, where the cards are two abreast.');
  // The forms label above was fixed while the "Adverse Environment" badge kept
  // reaching x=374 on a card ending at 366 on every boss H-stage of main_10 to
  // main_14, and pushed the code onto two lines ("H14-" / "4"). The card clips its
  // overflow, so only a measurement shows it. Every descendant, not one class, so the
  // next label added to the card is held to the same edge.
  await page.setViewportSize({ width: 390, height: 844 });
  let badged = 0;
  for (const id of ['main_10', 'main_11', 'main_12', 'main_13', 'main_14']) {
    await page.goto(`/stages/content/${id}`);
    const cards = page.locator('.stage-card');
    await expect(cards.first()).toBeVisible();
    const measured = await cards.evaluateAll((els) => els.map((card) => {
      const box = card.getBoundingClientRect();
      const code = card.querySelector('.stage-card-code');
      const over = Array.from(card.querySelectorAll('*'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.right > box.right + 0.5)
        .map(({ el, r }) => `${el.className || el.tagName} +${Math.round(r.right - box.right)}px`);
      const text = code ? Array.from(code.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) : null;
      let lines = 1;
      if (text) {
        const range = document.createRange();
        range.selectNodeContents(text);
        lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      }
      return { code: text?.textContent?.trim() ?? '', over, lines, badge: !!card.querySelector('.stage-variant-badge') };
    }));
    badged += measured.filter((m) => m.badge).length;
    expect(measured.filter((m) => m.over.length > 0), `${id}: something past a card's right edge`).toEqual([]);
    expect(measured.filter((m) => m.lines > 1).map((m) => m.code), `${id}: a stage code broken over two lines`).toEqual([]);
  }
  expect(badged, 'the pages have cards with a variant badge, or this proves nothing').toBeGreaterThan(0);
});

test('the stage map legend is readable in the light theme', async ({ page }) => {
  // UI-04: a fixed near-black scrim under themed text measured 1.32:1 in light.
  await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch { /* private mode */ } });
  await page.goto('/stages/browse?s=1-7');
  await page.getByRole('button', { name: /Legend/ }).click();
  const overlay = page.locator('.stage-legend-overlay.open');
  await expect(overlay).toBeVisible();
  const colours = await overlay.evaluate((el) => {
    const probe = document.createElement('canvas').getContext('2d')!;
    /** Any CSS colour (color-mix, color(srgb), rgb) as [r, g, b, a] via the canvas. */
    const rgba = (css: string) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      return Array.from(probe.getImageData(0, 0, 1, 1).data);
    };
    const text = el.querySelector('.stage-legend-special, .stage-legend') as HTMLElement;
    const under = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : 'rgb(0,0,0)';
    return { bg: rgba(getComputedStyle(el).backgroundColor), text: rgba(getComputedStyle(text).color), under: rgba(under) };
  });
  // The scrim is translucent: composite it over black, the darkest a schematic gets.
  const a = colours.bg[3] / 255;
  const ground = [0, 1, 2].map((i) => colours.bg[i] * a + 0 * (1 - a));
  expect(contrast(colours.text, ground)).toBeGreaterThanOrEqual(4.5);

  // The same bug in the HUD: a fixed dark plate under themed text (the unit limit read
  // dark grey on near-black in light). Composited over white, the lightest ground.
  const limit = page.locator('.stage-hud-limit').first();
  if (await limit.count()) {
    const hud = await limit.evaluate((el) => {
      const probe = document.createElement('canvas').getContext('2d')!;
      const rgba = (css: string) => {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#000';
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        return Array.from(probe.getImageData(0, 0, 1, 1).data);
      };
      return { bg: rgba(getComputedStyle(el).backgroundColor), text: rgba(getComputedStyle(el).color) };
    });
    const k = hud.bg[3] / 255;
    const plate = [0, 1, 2].map((i) => hud.bg[i] * k + 255 * (1 - k));
    const t = hud.text[3] / 255;
    const ink = [0, 1, 2].map((i) => hud.text[i] * t + plate[i] * (1 - t));
    expect(contrast(ink, plate)).toBeGreaterThanOrEqual(4.5);
  }
});

test('stage and chapter titles keep a space between code and name', async ({ page }) => {
  // The h1 ran code and name together: "AD-EX-1Dusty Prop Room" is what screen
  // readers and copy/paste got.
  await page.goto('/stages/browse?s=ad-ex-1');
  await expect(page.locator('h1')).toHaveText('AD-EX-1 Dusty Prop Room');
  await page.goto('/stages/content/main_14');
  await expect(page.locator('h1')).toHaveText('EP 14 Absolved Will Be the Seekers');
});

test.describe('a stage link opens the rail on that stage\'s own chapter, with the stage marked', () => {
  // A static page's first render has no query, so /stages/browse?s=<slug> used to seed
  // the rail from the index's first stage (AD-EX-1): every deep link showed Act or Die
  // with nothing marked, and fetched ad-ex-1's file before the stage asked for
  // (2026-09-26 audit). Exactly one stage file is fetched: the one in the address.
  const detailRequests = (page: Page) => {
    const slugs: string[] = [];
    page.on('request', (request) => {
      const hit = request.url().match(/\/stage-detail\/([^/?#]+)\.json/);
      if (hit) slugs.push(decodeURIComponent(hit[1]));
    });
    return slugs;
  };
  const expectScoped = async (page: Page, code: string, chapter: string) => {
    await expect(page.locator('.stage-rows .stage-row.selected')).toHaveCount(1);
    await expect(page.locator('.stage-rows .stage-row.selected .stage-row-code')).toHaveText(new RegExp(`^${code}`));
    await expect(page.getByRole('combobox', { name: 'Chapter or event' })).toContainText(chapter);
    await expect(page.locator('h1')).toContainText(code);
  };

  for (const { slug, code, chapter } of [
    { slug: 'pa-1', code: 'PA-1', chapter: 'People, A People' },
    { slug: '1-7', code: '1-7', chapter: 'Evil Time Part 2' },
    { slug: 'cf-9', code: 'CF-9', chapter: 'A Flurry to the Flame' },
  ]) {
    test(`opened directly: ?s=${slug}`, async ({ page }) => {
      const fetched = detailRequests(page);
      await page.goto(`/stages/browse?s=${slug}`);
      await expectScoped(page, code, chapter);
      expect([...new Set(fetched)]).toEqual([slug]);
    });
  }

  test('with no stage in the address, none is opened or fetched', async ({ page }) => {
    // It used to open the index's first row, AD-EX-1. The rail opens on a chapter (what
    // is running, or the latest main-story chapter) and the pane asks for a pick.
    const fetched = detailRequests(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/stages/browse');
    await expect(page.locator('.stage-detail-col .hint')).toHaveText('Pick a stage from the list.');
    await expect(page.locator('.stage-rows .stage-row').first()).toBeVisible();
    await expect(page.locator('.stage-rows .stage-row.selected')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Chapter or event' })).not.toHaveText('');
    expect(fetched).toEqual([]);
    // The server's markup survives hydration: it used to be thrown away here (#425/#418/#423).
    expect(errors).toEqual([]);
  });

  test('followed from a stage card, without a reload', async ({ page }) => {
    await page.goto('/stages/content/act51side');
    await page.evaluate(() => { (window as unknown as { stayed: boolean }).stayed = true; });
    const fetched = detailRequests(page);
    await page.locator('a.stage-card[href="/stages/browse?s=pa-1"]').click();
    await expect(page).toHaveURL(/\/stages\/browse\?s=pa-1$/);
    await expectScoped(page, 'PA-1', 'People, A People');
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed), 'the page reloaded').toBe(true);
    expect([...new Set(fetched)]).toEqual(['pa-1']);
  });

  test('a stage in another chapter re-scopes the rail; picking a chapter by hand is kept', async ({ page }) => {
    await page.goto('/stages/browse?s=pa-1');
    await expectScoped(page, 'PA-1', 'People, A People');
    // The reader picks another event while PA-1 stays open: the rail follows them, and
    // is not snapped back to the open stage's chapter.
    await page.getByRole('combobox', { name: 'Chapter or event' }).click();
    await page.getByRole('listbox', { name: 'Chapter or event' }).getByRole('option', { name: /^CF A Flurry to the Flame$/ }).click();
    await expect(page.getByRole('combobox', { name: 'Chapter or event' })).toContainText('A Flurry to the Flame');
    await page.waitForTimeout(500);
    await expect(page.getByRole('combobox', { name: 'Chapter or event' })).toContainText('A Flurry to the Flame');
    await expect(page.locator('.stage-rows .stage-row.selected')).toHaveCount(0);
    // A row from that list opens its stage and keeps the list.
    await page.locator('.stage-rows .stage-row').filter({ has: page.locator('.stage-row-code', { hasText: /^CF-9/ }) }).click();
    await expectScoped(page, 'CF-9', 'A Flurry to the Flame');
    // And a stage in another chapter, from a link on the page, re-scopes the rail.
    await page.goBack();
    await expectScoped(page, 'PA-1', 'People, A People');
  });
});

/** The colour a probe painted with the given custom property computes to. */
async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

for (const theme of ['dark', 'light'] as const) {
  test(`every Terminal panel is headed by the site's section heading, --heading (${theme} theme)`, async ({ page }) => {
    // The panels' labels were a 10px teal tab painted by CSS from a data-tab attribute:
    // no outline saw them (each carried a visually hidden twin), /stages/regular jumped
    // from h1 to h3, and /stages/seasonal had no visible heading at all. The heading is
    // the site's .op-section h2, in --heading: the site's green, --teal (2026-09-29), and
    // never amber (tried and rejected, 2026-09-26). cards-and-headings.spec.ts holds the
    // rest of the site to the same.
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* none */ } }, theme);
    for (const route of ['/stages', '/stages/regular', '/stages/seasonal', '/stages/score']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark'), `${route}: the ${theme} theme`).toBe(theme);
      const [heading, amber, teal] = [await tokenColour(page, '--heading'), await tokenColour(page, '--amber'), await tokenColour(page, '--teal')];
      expect(heading, 'section headings are the site\'s green, --teal (2026-09-29)').toBe(teal);
      expect(heading, 'the heading colour is not amber').not.toBe(amber);
      const panels = page.locator('main .terminal-panel, main .score-block');
      expect(await panels.count(), `${route}: panels`).toBeGreaterThan(1);
      const measured = await panels.evaluateAll((els) => els.map((panel) => {
        const h2 = panel.querySelector(':scope > h2');
        const box = h2?.getBoundingClientRect();
        return {
          text: h2?.textContent?.trim() ?? '',
          visible: !!box && box.width > 2 && box.height > 2 && !h2!.classList.contains('visually-hidden'),
          colour: h2 ? getComputedStyle(h2).color : '',
          tab: panel.hasAttribute('data-tab') || getComputedStyle(panel, '::before').content !== 'none',
        };
      }));
      for (const m of measured) {
        expect(m.text, `${route}: a panel with no h2`).not.toBe('');
        expect(m.visible, `${route}: "${m.text}" is not visible`).toBe(true);
        expect(m.colour, `${route}: "${m.text}" is not amber`).not.toBe(amber);
        expect(m.colour, `${route}: "${m.text}" is in --heading`).toBe(heading);
        expect(m.tab, `${route}: "${m.text}" still draws a CSS tab`).toBe(false);
      }
    }
  });
}

test('the Terminal bar\'s tabs sit in the site frame', async ({ page }) => {
  // .terminal-bar-inner had its own 1040px and 12px, so its content started 12px left
  // of the header and main above and below it.
  await page.goto('/stages/regular');
  const edges = await page.evaluate(() => {
    const inner = (el: Element) => {
      const box = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return [Math.round(box.left + parseFloat(cs.paddingLeft)), Math.round(box.right - parseFloat(cs.paddingRight))];
    };
    return { bar: inner(document.querySelector('.terminal-bar-inner')!), main: inner(document.querySelector('main')!) };
  });
  expect(edges.bar).toEqual(edges.main);
});

/*
 * The Terminal bar is one row from the first paint. The webfonts load with
 * font-display: swap, so the first paint is in the fallback face, where the seven tabs
 * need 1141px of the frame's 992 (967 in Rajdhani). As a wrapping strip the bar was two
 * rows until Rajdhani arrived, then one, and every Terminal page jumped up 42px (CLS
 * 0.4-0.8). So this loads the bar with the webfont files refused -- the first paint, held -- and asserts one row at the bar's own 40px, inside
 * the frame, at the narrowest window that shows the row and at 1440. Box edges only, no
 * text widths, so Linux fonts cannot move it. Under 1040px the bar is its menu button:
 * between 901 and 1039 the row was two rows even with Rajdhani.
 */
test('the Terminal bar is one row from the first paint, or its menu where one row does not fit', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop row: the widths are set here');
  const measure = async (page: Page) => page.evaluate(() => {
    const row = document.querySelector('.terminal-tabs')!;
    const inner = document.querySelector('.terminal-bar-inner')!;
    const cs = getComputedStyle(inner);
    const frameRight = inner.getBoundingClientRect().right - parseFloat(cs.paddingRight);
    const tabs = Array.from(row.children).map((tab) => tab.getBoundingClientRect());
    const toggle = document.querySelector('.terminal-bar-toggle')!;
    return {
      // A Rajdhani face loaded, not document.fonts.check(): that answers whether the
      // faces settled, and a refused file settles too (as an error), not which face drew.
      rajdhani: Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === 'Rajdhani' && f.status === 'loaded'),
      rowShown: getComputedStyle(row).display !== 'none',
      toggleShown: getComputedStyle(toggle).display !== 'none',
      height: Math.round(row.getBoundingClientRect().height * 10) / 10,
      tabs: tabs.length,
      tops: tabs.map((r) => Math.round(r.top)),
      past: tabs.filter((r) => r.right > frameRight + 1).length,
      clipped: Array.from(row.querySelectorAll('.terminal-tab-label')).filter((l) => l.scrollWidth > l.clientWidth + 2).map((l) => l.textContent),
    };
  });
  for (const fonts of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()));
    if (!fonts) await refuseWebfonts(context);
    const page = await context.newPage();
    for (const route of ['/stages', '/stages/supplies', '/stages/all']) {
      for (const width of [1040, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        await fontsSettled(page);
        const m = await measure(page);
        const at = `${route} at ${width}px, ${fonts ? 'webfonts' : 'webfonts refused'}`;
        if (!fonts) expect(m.rajdhani, `${at}: the first paint's face, not Rajdhani`).toBe(false);
        expect(m.rowShown && !m.toggleShown, `${at}: the row, not the menu`).toBe(true);
        expect(m.tabs, `${at}: seven tabs`).toBe(7);
        expect(Math.max(...m.tops) - Math.min(...m.tops), `${at}: one row, tops ${m.tops}`).toBeLessThanOrEqual(1);
        expect(Math.abs(m.height - 40), `${at}: the bar is ${m.height}px, not its one-row 40px`).toBeLessThanOrEqual(1);
        expect(m.past, `${at}: tabs past the frame's edge`).toBe(0);
        // With Rajdhani in, 25px spare at 1440: nothing gives way. Compared with each
        // label's own box, and only once the face is known to be in.
        if (fonts && width === 1440 && m.rajdhani) expect(m.clipped, `${at}: labels cut short`).toEqual([]);
      }
      await page.setViewportSize({ width: 1039, height: 900 });
      await page.goto(route);
      const narrow = await measure(page);
      expect(!narrow.rowShown && narrow.toggleShown, `${route} at 1039px: the menu button, not a row`).toBe(true);
    }
    await context.close();
  }
});

/*
 * The Terminal home is a board of boxed panels, spaced by its grid's 14px gap, where it has
 * two columns; folded to one column under 900px it is a column of sections, --section-gap
 * (36px) apart, as /pull-planner's and /recruitment's boxed sections are on a phone (ui-primitives
 * rule 15). The rule said 14 at every width while the stylesheet said 36 on a phone; this
 * holds the two to one answer. Box edges only.
 */
test('the Terminal home is a board of panels in two columns and a column of sections in one', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the widths are set here');
  const gaps = () => page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll('main .terminal-home > .terminal-panel')).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const out: { dir: string; gap: number }[] = [];
    for (const [i, a] of boxes.entries()) {
      for (const b of boxes.slice(i + 1)) {
        const sameColumn = b.left < a.right - 1 && a.left < b.right - 1;
        const sameRow = b.top < a.bottom - 1 && a.top < b.bottom - 1;
        const between = (c: DOMRect) => c !== a && c !== b && c.left < a.right - 1 && a.left < c.right - 1 && c.top >= a.bottom - 1 && c.bottom <= b.top + 1;
        if (sameColumn && b.top >= a.bottom - 1 && !boxes.some(between)) out.push({ dir: 'below', gap: Math.round((b.top - a.bottom) * 10) / 10 });
        if (sameRow && b.left >= a.right - 1) out.push({ dir: 'beside', gap: Math.round((b.left - a.right) * 10) / 10 });
      }
    }
    return out;
  });
  for (const [width, dir, gap] of [[1440, 'beside', 14], [900, 'below', 36], [390, 'below', 36]] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/stages');
    const found = await gaps();
    expect(found.some((g) => g.dir === dir), `/stages at ${width}px: panels ${dir} one another`).toBe(true);
    if (dir === 'below') expect(found.filter((g) => g.dir !== 'below'), `/stages at ${width}px: one column`).toEqual([]);
    // In two columns a short panel's row may leave room under it: only the gap beside counts.
    expect(found.filter((g) => g.dir === dir && Math.abs(g.gap - gap) > 1).map((g) => `${g.dir} ${g.gap}px`), `/stages at ${width}px: panels ${gap}px apart`).toEqual([]);
  }
});

test('a stage\'s forms are tab-look links and its Emergency Ops switch is the site\'s chips', async ({ page }) => {
  // They were .stage-variant-option, a page-local chip in mono 11px with a teal fill of
  // its own. The forms are links (each is its own address), marked aria-current="page",
  // in the site's tab look for links between routes (.tabs / .tab, r9); Normal /
  // Emergency Ops switches a value in place, so it is a SegmentedControl.
  await page.goto('/stages/browse?s=1-7');
  const forms = page.getByRole('group', { name: 'Stage forms' });
  await expect(forms.locator('a.tab')).toHaveCount(2);
  await expect(forms.locator('[aria-current="page"]')).toHaveText('Normal');
  await expect(page.locator('.stage-variant-option')).toHaveCount(0);
  await forms.getByRole('link', { name: 'Challenge Mode' }).click();
  await expect(page).toHaveURL(/\?s=1-7_challenge_mode$/);
  await expect(forms.locator('[aria-current="page"]')).toHaveText('Challenge Mode');

  await page.goto('/stages/browse?s=isw-no_level_obt_roguelike_ro1_level_rogue1_1-1');
  const state = page.getByRole('group', { name: 'Stage state' });
  await expect(state.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'true');
  await state.getByRole('button', { name: 'Emergency Ops' }).click();
  await expect(state.getByRole('button', { name: 'Emergency Ops' })).toHaveAttribute('aria-pressed', 'true');
  await expect(state.getByRole('button', { name: 'Normal' })).toHaveAttribute('aria-pressed', 'false');
});

test('each terminal page has one h1, in a page header that lines up with its content', async ({ page }) => {
  for (const route of ['/stages', '/stages/score', '/stages/all', '/game-modes', '/enemies', '/techniques', '/synergies']) {
    await page.goto(route);
    await expect(page.locator('h1'), `${route}: one h1`).toHaveCount(1);
    const edges = await page.evaluate(() => {
      const h1 = document.querySelector('h1')!;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const main = document.querySelector('main')!;
      const pad = parseFloat(getComputedStyle(main).paddingLeft);
      return { title: Math.round(range.getBoundingClientRect().left), content: Math.round(main.getBoundingClientRect().left + pad) };
    });
    expect(Math.abs(edges.title - edges.content), `${route}: title at ${edges.title}, content at ${edges.content}`).toBeLessThanOrEqual(1);
  }
});

test.describe('state changes near the foot of a page do not move what was pressed', () => {
  for (const route of ['/techniques', '/synergies']) {
    test(`${route}: opening and closing a card's record near the foot of the list`, async ({ page }, testInfo) => {
      // The groups used to fold in place ("Show table", "Show less") and shortened the
      // page under the reader: 166px and 264px at 1440, up to 824px at 390. Since the
      // 2026-10-23 redesign a card opens its record over the page (RecordDialog) and
      // writes it to the address (?t=, ?s=); neither the dialog nor the address may move
      // the card the reader pressed, opened or closed, by the x or by Escape.
      if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route);
      const cards = page.locator('main .technique-card');
      await expect(cards.first()).toBeVisible();
      const card = cards.nth(Math.min(8, (await cards.count()) - 1));
      const dialog = page.getByRole('dialog').and(page.locator('.record-dialog'));
      const key = route === '/techniques' ? 't' : 's';
      const moved = await anchorMoved(page, card, [
        async () => { await card.click(); await expect(dialog).toBeVisible(); await expect.poll(() => new URL(page.url()).searchParams.get(key)).not.toBeNull(); },
        async () => { await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBeNull(); },
        async () => { await card.click(); await expect(dialog).toBeVisible(); },
        async () => { await dialog.locator('.record-dialog-shut').click(); await expect(dialog).toHaveCount(0); },
      ], 300);
      expect(moved).toBeLessThan(4);
    });
  }

  test('enemies: switching the detail tab', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Above 900px the handbook is locked to the viewport and the pane scrolls inside itself.');
    // 55px at 390, where the detail pane flows in the page: from the foot of the page,
    // a switch to a shorter tab clamped the scroll and the tab row moved down.
    await page.goto('/enemies');
    const tabs = page.locator('.enemy-tabs');
    await expect(tabs).toBeVisible();
    const buttons = tabs.locator('button');
    const n = await buttons.count();
    expect(n, 'the enemy has tabs to switch between').toBeGreaterThan(1);
    // Find the tallest and the shortest tab for this enemy.
    const heights: number[] = [];
    for (let i = 0; i < n; i += 1) {
      await buttons.nth(i).click();
      await page.waitForTimeout(300);
      heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    }
    const tallest = heights.indexOf(Math.max(...heights));
    const shortest = heights.indexOf(Math.min(...heights));
    expect(heights[tallest] - heights[shortest], 'the tabs differ in height, or this proves nothing').toBeGreaterThan(20);
    // On the tallest, at the foot of the page, then switch to the shortest.
    await buttons.nth(tallest).click();
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 1e6, behavior: 'instant' }));
    await page.waitForTimeout(600);
    // A reader presses the tab row where they can see it. At the very foot it can sit
    // under the enemy hero, which is pinned below the nav at this width (it did once the
    // music widget's 84px reserve went under main), and a click on a covered button
    // scrolls it into view first -- a move the test would then blame on the page. Come
    // up just far enough to uncover the row.
    await page.evaluate(() => {
      const row = document.querySelector('.enemy-tabs')!.getBoundingClientRect();
      const cover = document.querySelector('.enemy-detail-pane .enemy-hero')?.getBoundingClientRect().bottom ?? 0;
      if (row.top < cover + 4) window.scrollBy({ top: row.top - cover - 8, behavior: 'instant' });
    });
    await page.waitForTimeout(300);
    // Still past where the shorter tab would end the page, or this proves nothing.
    expect(await page.evaluate(() => scrollY + innerHeight)).toBeGreaterThan(heights[shortest] + 20);
    const before = (await tabs.boundingBox())!.y;
    await buttons.nth(shortest).click();
    await page.waitForTimeout(900);
    expect(Math.abs((await tabs.boundingBox())!.y - before)).toBeLessThan(4);
  });

  test('stages/browse: picking a shorter stage from the pinned rail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Below 900px the rail stacks above the stage and nothing is pinned.');
    // 120px in the review (155px measured on the bundled data): the new stage's detail
    // column is shorter, the page clamped, and the sticky rail went with it.
    // 1-8 to 1-9: 131px shorter. The pair was 1-7 to 1-6 until a stage's enemies became
    // faces instead of rows, which made most of chapter 1 the same height.
    await page.goto('/stages/browse?s=1-8');
    await expect(page.locator('.stage-detail-col .stage-brief')).toBeVisible();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo({ top: 1e6, behavior: 'instant' }));
    await page.waitForTimeout(600);
    const rail = page.locator('.stage-list-col');
    const column = page.locator('.stage-detail-col');
    const before = { rail: (await rail.boundingBox())!.y, column: (await column.boundingBox())!.height, y: await page.evaluate(() => window.scrollY) };
    expect(before.y, 'the page is scrolled, so there is a position to lose').toBeGreaterThan(0);
    // 1-9 from 1-8's own chapter, which the rail shows beside it (it used to show Act or
    // Die here, and this test picked AD-1 from that).
    await page.locator('.stage-rail .stage-row', { hasText: 'Rout' }).first().click();
    await expect(page.locator('h1')).toContainText('1-9');
    await page.waitForTimeout(900);
    const after = { rail: (await rail.boundingBox())!.y, column: (await column.boundingBox())!.height, y: await page.evaluate(() => window.scrollY) };
    expect(after.column, 'the new stage is shorter, or this test proves nothing').toBeLessThan(before.column);
    // Neither the rail nor the reader's place moves: the review measured the scroll
    // clamped by 120px, and where the grid is short the sticky rail goes with it.
    expect(Math.abs(after.rail - before.rail)).toBeLessThan(4);
    expect(Math.abs(after.y - before.y)).toBeLessThan(4);
  });

  test('Stronghold: narrowing the list keeps the pinned lookup bar where it is', async ({ page }) => {
    await page.goto('/game-modes/stronghold-protocol');
    await page.evaluate(() => window.scrollTo({ top: 4000, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const bar = page.locator('.gm-lookup');
    const before = (await bar.boundingBox())!.y;
    await page.getByLabel('Search the whole mode').fill('Caper');
    await page.waitForTimeout(900);
    const after = (await bar.boundingBox())!.y;
    expect(Math.abs(after - before)).toBeLessThan(4);
  });
});
