import { expect, test, type Page } from '@playwright/test';
import { playAllSongs, stubYouTube } from './youtube-stub';
import { rowCensus } from './row-census';
import { CENSUS_STATES, fontsSettled, openCensus, openFilters, readOnly, refuseWebfonts } from './census-routes';
import { census, censusWidth, expectOnlyAllowed, TOLERANCE } from './layout-checks';

/*
 * One line (docs/development/ui-primitives.md rule 4): in a row, a button, input or
 * select and the text beside it share one vertical centre, and the controls in it
 * share one height, --control-h.
 *
 * The row census (row-census.ts) runs on every page and state the UI census visits, at
 * 1440 and 390, in the layout census (layout-census.spec.ts, r11), on its one load of the
 * page; its tolerances (TOLERANCE), its accepted offences (ALLOWED) and expectOnlyAllowed
 * are in layout-checks.ts, which says what the census found and when.
 *
 * What stays here is what the census cannot see: the pull planner's goal row measured
 * directly (on a phone too, where each cell stacks its label over its value) and its
 * footer by baseline, its panels opened one by one, every row primitive against the
 * token and with the token flipped, the site nav, the Terminal bar's menu button, the
 * calendar's month menus, the operator page's panel header with and without the
 * webfonts, the /music queue's titles, the page header and the game switcher when the
 * webfonts arrive, and the planner's panel heads.
 */

/** A banner the plan can hold, from the page's own schedule. */
async function plannedBanner(page: Page): Promise<string> {
  await page.goto("/pull-planner");
  const name = await page.evaluate(() => {
    const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
    const names = Object.keys(odds);
    return names.find((n) => odds[n].type === 'limited') ?? names[0] ?? null;
  });
  expect(name, 'the schedule has a banner with odds').toBeTruthy();
  return name!;
}

test('the pull planner goal row and its footer are on one line', async ({ page }) => {
  const width = await censusWidth(page);
  const banner = await plannedBanner(page);
  await page.goto(`/pulls?banner=${encodeURIComponent(banner)}`);
  const row = page.locator('article [class*="bannerRow"]').first();
  await expect(row).toBeVisible();
  expectOnlyAllowed(expect, '', await census(page), "/pull-planner?banner", width);

  // The row measured directly: every value on the Pulls input's centre line, and on a
  // phone, where each cell stacks a label over its value, every label on one top. The
  // census cannot see the phone layout: there the input's cell holds its label too.
  const narrow = width <= 700;
  const measured = await row.evaluate((el, phone) => {
    const input = el.querySelector('input[type="number"]')!.getBoundingClientRect();
    const centre = (input.top + input.bottom) / 2;
    // On a phone the date is a line of its own above the figures, so it is left out.
    const values = Array.from(el.querySelectorAll(phone ? '[class*="figure"] > b' : '[class*="date"] > b, [class*="figure"] > b')).map((b) => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent, off: Math.round(((r.top + r.bottom) / 2 - centre) * 10) / 10 };
    });
    const labels = Array.from(el.querySelectorAll('[class*="budget"] > span, [class*="figure"] > span'))
      .filter((label) => label.getClientRects().length > 0)
      .map((label) => ({ text: label.textContent, top: Math.round(label.getBoundingClientRect().top) }));
    return { values, labels };
  }, narrow);
  expect(measured.values.length, 'the row shows its values').toBeGreaterThanOrEqual(3);
  for (const { text, off } of measured.values) expect(Math.abs(off), `${text} is ${off}px off the input's centre`).toBeLessThanOrEqual(2);
  if (narrow) {
    const tops = measured.labels.map((label) => label.top);
    expect(tops.length, `labels ${JSON.stringify(measured.labels)}`).toBe(4);
    expect(Math.max(...tops) - Math.min(...tops), `labels ${JSON.stringify(measured.labels)}`).toBeLessThanOrEqual(1);
  }

  // The footer: "Budgets covered" and "Savings after your plan" on one baseline. Both are
  // Inter at the same size or near it, so the bottoms of their glyph boxes are their
  // baselines to within a pixel.
  const bottoms = await page.locator('footer[class*="planFooter"]').evaluate((footer) => Array.from(footer.children).map((side) => {
    const text = document.createTreeWalker(side, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange();
    range.selectNodeContents(text);
    return { text: text.textContent, bottom: range.getBoundingClientRect().bottom };
  }));
  expect(bottoms).toHaveLength(2);
  expect(Math.abs(bottoms[0].bottom - bottoms[1].bottom), `footer text bottoms ${JSON.stringify(bottoms)}`).toBeLessThanOrEqual(1);
});

test('the pull planner panels are on one line', async ({ page }) => {
  // With a banner in the plan, which also picks it as the forecast banner: its trigger
  // shows the banner's portraits beside the date field, fitted to the control height.
  const width = await censusWidth(page);
  const banner = await plannedBanner(page);
  await page.goto(`/pulls?banner=${encodeURIComponent(banner)}`);
  await expect(page.locator('article [class*="bannerRow"]').first()).toBeVisible();
  for (const name of [/^Income/, /Past events/, /Skin wishlist/]) {
    await page.getByRole('button', { name }).click();
    expectOnlyAllowed(expect, '', await census(page), `/pulls?banner ${name.source}`, width);
    // Each is a popup now: closed before the next trigger.
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
  }
  await page.getByRole('button', { name: '+ Add banner' }).click();
  expectOnlyAllowed(expect, '', await census(page), "/pull-planner?banner + Add banner", width);
});

/*
 * One control height is one token: --control-h-base in styles/core/shared.css, 36px
 * (40 on a phone) and the one value the maintainer may flip. Every row primitive reads
 * it as a min-height with small vertical padding, so each measures exactly the token,
 * and a flip moves them all -- a primitive with a literal height, or padding that
 * outgrows a smaller token, is left behind and fails here. Measured on /operators (its
 * real search field and StyledSelect checkbox trigger) with the other primitives added beside
 * them; min-height decides, not the font, so this is the same on CI's Linux fonts.
 */
test('every row primitive is one control height, and follows the token', async ({ page }) => {
  const width = await censusWidth(page);
  await openCensus(page, '/operators');
  // On a phone the roster's StyledSelect is in its Filters sheet (components/ui/FilterSheet).
  await openFilters(page);
  const heights = () => page.evaluate(() => {
    let bench = document.getElementById('control-bench');
    if (!bench) {
      bench = document.createElement('div');
      bench.id = 'control-bench';
      bench.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start;gap:4px;position:relative;z-index:9999';
      bench.innerHTML = [
        '<button type="button" class="ghost">Ghost</button>',
        '<a class="ghost" href="#bench">Ghost link</a>',
        '<button type="button" class="danger">Reset</button>',
        '<button type="button" class="btn-sm">Small</button>',
        '<button type="button" class="primary btn-sm">Primary small</button>',
        '<button type="button" class="ghost btn-sm">Ghost small</button>',
        '<button type="button" class="btn-icon" aria-label="Help">?</button>',
        '<button type="button" class="ghost btn-icon" aria-label="Next">›</button>',
        // r10 x-buttons: the close or remove × (XButton), square at the token.
        '<button type="button" class="btn-x" aria-label="Close"><svg viewBox="0 0 16 16" width="16" height="16"></svg></button>',
        '<button type="button" class="filter-chip" aria-pressed="false">Chip</button>',
        '<button type="button" class="tgl">Mode</button>',
      ].join('');
      document.querySelector('main')!.prepend(bench);
    }
    const box = (el: Element | null) => (el ? { h: Math.round(el.getBoundingClientRect().height * 10) / 10, w: Math.round(el.getBoundingClientRect().width * 10) / 10 } : null);
    const out: Record<string, { h: number; w: number } | null> = {};
    for (const el of Array.from(bench.children)) out[el.outerHTML.slice(0, 48)] = box(el);
    out['search field'] = box(document.querySelector('#page-content .search-input'));
    out['StyledSelect checkbox trigger'] = box(document.querySelector('#page-content button[aria-haspopup="dialog"][aria-label="Filter by subclass"]'));
    return out;
  });
  for (const [base, expected] of [[null, width > 720 ? 36 : 40], [32, width > 720 ? 32 : 36]] as const) {
    if (base) await page.addStyleTag({ content: `:root { --control-h-base: ${base}px; }` });
    const measured = await heights();
    for (const [control, size] of Object.entries(measured)) {
      expect(size, `${control} is on the page`).not.toBeNull();
      expect(Math.abs(size!.h - expected), `${control} is ${size!.h}px tall, not the control height ${expected}px${base ? ` (--control-h-base: ${base}px)` : ''}`).toBeLessThanOrEqual(1);
      if (/btn-icon|btn-x/.test(control)) expect(Math.abs(size!.w - expected), `${control} is square`).toBeLessThanOrEqual(1);
    }
  }
});

/*
 * The Terminal bar's menu button, the one control of the collapsed bar under 1040px,
 * is the control height too: sized by its padding it was 37px on a phone and 40
 * at 721-900px, beside a search field and chips at 40 and 36. It is alone on its line,
 * so the row census cannot see it; measured here at 390 and 800, and with the token
 * flipped.
 */
/*
 * The site nav, once: it is the same fixed bar on every page, so the per-page census
 * leaves it out (row-census.ts, `scope`) and this measures it at both widths, at the same
 * tolerances. Its brand row reads 1.8px today with the webfonts (2.3 on fallback fonts),
 * so if the webfont files do not arrive this one test says so, not 59 page tests.
 */
test('the site nav is on one line', async ({ page }) => {
  const width = await censusWidth(page);
  await openCensus(page, '/');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await fontsSettled(page);
  const offences = await page.evaluate(rowCensus, { ...TOLERANCE, scope: 'nav' as const });
  expectOnlyAllowed(expect, '', offences, 'site nav', width);
});

test("the Terminal bar's menu button is one control height, and follows the token", async ({ page }) => {
  const width = await censusWidth(page);
  const widths = width === 1440 ? [800] : [390];
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 844 });
    await openCensus(page, '/stages/all');
    const toggle = page.locator('.terminal-bar-toggle');
    await expect(toggle).toBeVisible();
    for (const [base, expected] of [[null, w > 720 ? 36 : 40], [32, w > 720 ? 32 : 36]] as const) {
      if (base) await page.addStyleTag({ content: `:root { --control-h-base: ${base}px; }` });
      const h = await toggle.evaluate((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
      expect(Math.abs(h - expected), `the Terminal menu button is ${h}px tall at ${w}px, not the control height ${expected}px${base ? ` (--control-h-base: ${base}px)` : ''}`).toBeLessThanOrEqual(1);
    }
  }
});

/*
 * The calendar's head never moves as the month changes (maintainer, 2026-09-28: "clicking
 * through the months changes the size and thus the elements change location, we DO NOT
 * WANT THIS"). The month trigger was as wide as its own value, MAY 85px and SEPTEMBER
 * 153px at 1440, so the year, the next arrow and Today moved at every step; the year's
 * digits are not all one width either. Next month is pressed through a whole year and
 * across a new year, at 1440 and on phones, and every control's box must stay where it
 * was (0.5px). Box edges only, the same on any font.
 */
test("the calendar's head holds still through a year of months", async ({ page }) => {
  const width = await censusWidth(page);
  const widths = width === 1440 ? [1440] : [360, 390, 460];
  await readOnly(page);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/schedule?view=calendar');
    await fontsSettled(page);
    const boxes = () => page.locator('.cal-head-when').evaluate((when) => ['.cal-pick-month', '.cal-pick-year', 'button[aria-label="Previous month"]', 'button[aria-label="Next month"]', '.cal-today-slot']
      .map((selector) => { const r = when.querySelector(selector)!.getBoundingClientRect(); return `${selector} ${r.left.toFixed(1)}+${r.width.toFixed(1)}`; }));
    // Step once first, so Today is drawn (it is absent on the current month by design).
    await page.getByRole('button', { name: 'Next month' }).click();
    const first = await boxes();
    for (let step = 0; step < 13; step += 1) {
      await page.getByRole('button', { name: 'Next month' }).click();
      const month = await page.locator('.cal-head-title').getByRole('combobox', { name: 'Month' }).innerText();
      const now = await boxes();
      const moved = now.filter((box, i) => {
        const [a, b] = [box, first[i]].map((entry) => entry.split(' ').pop()!.split('+').map(Number));
        return Math.abs(a[0] - b[0]) > 0.5 || Math.abs(a[1] - b[1]) > 0.5;
      }).map((box, i) => `${box} (was ${first[now.indexOf(box)].split(' ').pop()})`);
      expect(moved, `${w}px, ${month.replace(/\s+/g, ' ')}: the head's controls moved`).toEqual([]);
    }
  }
});

/*
 * The calendar's month and year menus show their whole value. On a phone the head is a
 * grid of the two month steps (each var(--control-h) square) either side of the month
 * and year, and the month gets what is left: when the steps grew from 36 to 40px,
 * SEPTEMBER (109px in Rajdhani) had 105px at 390 and 75 at 360, and lost its last
 * letter. Every month is selected, at 360, 390 and 460 (the phone layout on both sides
 * of the short names' 440px) and at 1440, and the text each trigger shows is compared
 * with the trigger's value box: text against the box it sits in, never a constant,
 * within 2px.
 */
test("the calendar's month and year menus show their whole value", async ({ page }) => {
  const width = await censusWidth(page);
  const widths = width === 1440 ? [1440] : [360, 390, 460];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  await readOnly(page);
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 844 });
    await page.goto('/schedule?view=calendar');
    await fontsSettled(page);
    const month = page.locator('.cal-head-title').getByRole('combobox', { name: 'Month' });
    await expect(month).toBeVisible();
    for (const name of months) {
      await month.click();
      await page.getByRole('option', { name, exact: true }).click();
      await expect(page.getByRole('listbox')).toHaveCount(0);
      // Every piece of text the trigger shows lies inside its value box. The text's own
      // extent (a Range), so a value cut short by a span inside it counts too; text kept
      // for a screen reader only (the full month name on a phone) is not shown.
      const cut = await page.locator('.cal-head-title').evaluate((title) => Array.from(title.querySelectorAll('[role="combobox"]')).flatMap((trigger) => {
        const value = trigger.querySelector(':scope > span')!;
        const box = value.getBoundingClientRect();
        const out: string[] = [];
        const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (!node.textContent?.trim()) continue;
          let hidden = false;
          for (let el = node.parentElement; el && el !== trigger; el = el.parentElement) {
            const cs = getComputedStyle(el);
            // Not drawn: display none, clipped away, or a hidden sizer that only holds the
            // trigger at its widest value (CalendarMonthValue.tsx).
            if (cs.display === 'none' || cs.clip !== 'auto' || cs.visibility === 'hidden' || el.getBoundingClientRect().width <= 1) { hidden = true; break; }
          }
          if (hidden) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          if (text.left < box.left - 2 || text.right > box.right + 2) out.push(`"${node.textContent}" ${Math.round(text.width)}px in ${Math.round(box.width)}px`);
        }
        return out;
      }));
      expect(cut, `values cut short at ${w}px with ${name} picked`).toEqual([]);
    }
  }
});

/*
 * The operator page's panel header (the name row, the meta line and, for an operator
 * with class forms, the forms' icon tabs) is no taller than it was before this round:
 * 127px at 390 and 121 at 1440 for Amiya, 89 and 87 for SilverAsh, as the dev site
 * measured at 61f8409. It is sticky on a phone, so every pixel of it is a pixel of the
 * page the reader loses. It grew to 151 and 141 when each meta item became a
 * control-height cell and the forms became icon tabs; the meta's lines are 20px now
 * (OperatorPage.module.css). Box heights from min-heights, within 2px of the ceiling,
 * so CI's fonts do not change the verdict.
 *
 * And the same with the webfonts refused, where each star row must be the meta's one
 * 20px line. The Inter subsets the site loads draw no ★, so a system face does, 23px
 * tall at line-height normal on a Mac: a Check whose build could not fetch the Google
 * Fonts stylesheet to inline it (Next then left the <link>; the fonts are self-hosted
 * now) measured Amiya's header at 124px, 3px over, on 2026-09-27.
 */
test("the operator page's panel header is no taller than before", async ({ page }) => {
  const width = await censusWidth(page);
  const ceilings: Record<string, Record<1440 | 390, number>> = { Amiya: { 390: 127, 1440: 121 }, SilverAsh: { 390: 89, 1440: 87 } };
  for (const fonts of [true, false]) {
    if (!fonts) {
      // openCensus' readOnly would let the fonts through: one route that refuses them too.
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => (!['GET', 'HEAD'].includes(route.request().method()) ? route.abort() : route.continue()));
      await refuseWebfonts(page);
    }
    for (const [name, ceiling] of Object.entries(ceilings)) {
      if (fonts) await openCensus(page, `/operators/${name}`);
      else {
        await page.goto(`/operators/${name}`);
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      }
      await fontsSettled(page);
      const header = page.locator('[class*="panelHeader"]').first();
      await expect(header).toBeVisible();
      const m = await header.evaluate((el) => ({
        h: Math.round(el.getBoundingClientRect().height * 10) / 10,
        stars: Math.round((el.querySelector('.op-sticky-meta > .rarity')?.getBoundingClientRect().height ?? 0) * 10) / 10,
        // The metric-matched local stand-ins ("Inter Fallback", styles/core/shared.css) are faces
        // too, loaded from the system: not webfonts.
        webfont: Array.from(document.fonts).some((f) => f.status === 'loaded' && /Inter|Rajdhani/.test(f.family) && !/ Fallback$/.test(f.family)),
      }));
      const at = `${name}'s panel header at ${width}px${fonts ? '' : ', webfonts refused'}`;
      if (!fonts) expect(m.webfont, `${at}: no webfont loaded`).toBe(false);
      expect(m.h, `${at} is ${m.h}px, over the ${ceiling[width]}px it was`).toBeLessThanOrEqual(ceiling[width] + 2);
      expect(Math.abs(m.stars - 20), `${at}: its star row is ${m.stars}px, not the meta's one 20px line`).toBeLessThanOrEqual(0.5);
    }
  }
});

/*
 * The /music queue's track titles keep the room for text they had before the row's icon
 * buttons grew to the phone's 40px control height. The three buttons are 24px wider than
 * the 32px squares they were, and the title paid for it (153px of text room to 129, so
 * titles that fitted ended in an ellipsis); the row's spacing gives the width back
 * (music.css). A phone at 390 (the mobile project: a touch screen, where the list's
 * scrollbar is an overlay): the title's content box, at least 153px, and at the row's one
 * height. The drag handle beside it is a glyph, so 2px of tolerance.
 */
test("the /music queue's titles keep their room at the one row height", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 1000, 'a phone: the 40px buttons are the phone height');
  await censusWidth(page);
  // The Queue view (the Library opens by default when nothing has played).
  await stubYouTube(page);
  await openCensus(page, '/music?view=queue');
  await playAllSongs(page);
  await fontsSettled(page);
  const row = page.locator('.music-queue-list .music-queue-row').first();
  await expect(row).toBeVisible();
  // The music lists' one row (components/music/SongRow.tsx): its buttons share one height, the
  // song's own area fills the row, and the title keeps the room it had before the album art.
  const m = await row.evaluate((el) => {
    const main = el.querySelector('.music-song-row-main')!.getBoundingClientRect();
    const text = el.querySelector('.music-song-row-text')!.getBoundingClientRect();
    const heights = Array.from(el.querySelectorAll('.music-song-row-actions button')).filter(b => b.getBoundingClientRect().height > 0).map((b) => Math.round(b.getBoundingClientRect().height));
    return { room: Math.round(main.right - text.left - 8), heights, main: Math.round(main.height), row: el.clientHeight };
  });
  expect(new Set(m.heights).size, `its buttons are one height: ${m.heights.join(', ')}`).toBe(1);
  expect(m.main, 'the song area fills the row').toBe(m.row);
  expect(m.room, `the title has ${m.room}px for its text at 390, under the 153px it had`).toBeGreaterThanOrEqual(153 - 2);
});

/*
 * The page header and the game switcher do not move when the webfonts arrive. They load
 * with font-display: swap, so the first paint is in the fallback face (and every paint,
 * where the font files never arrive). The eyebrow and the h1 were "normal" line
 * height, as tall as the face drawing them, so everything under the header moved down 4px
 * (3 on a phone) on every page when Rajdhani and JetBrains Mono came in; and the switcher
 * wrapped where its labels ran out of room, which the face decides: at 390px its "Stage"
 * tab jumped 260px from the second row to the first, and from 480 to 720px rows and the
 * music guesser's library link came and went (GameLinks.module.css). This loads every game
 * (every page that renders the switcher) with the webfonts and with the webfont files refused,
 * and compares: the eyebrow's and the h1's height per line, and where each thing in the
 * header's actions sits, the switcher's tabs by row. Box edges and line counts only, no
 * text widths, so it is the same test on CI's Linux fonts.
 */
test('the page header and the game switcher keep their rows when the webfonts arrive', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'the widths are set here');
  const measure = (page: Page) => page.evaluate(() => {
    const header = document.querySelector('header.page-header')!;
    const lines = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size || 1;
    };
    const perLine = (el: Element | null) => (el ? Math.round((el.getBoundingClientRect().height / lines(el)) * 10) / 10 : null);
    const actions = header.querySelector('.page-header-actions');
    const top = actions?.getBoundingClientRect().top ?? 0;
    const nav = header.querySelector('nav[aria-label="Games"]');
    const tabs = nav ? Array.from(nav.children) : [];
    const rowTops = [...new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().top)))].sort((a, b) => a - b);
    return {
      webfont: Array.from(document.fonts).some((f) => f.family.replace(/["']/g, '') === 'Rajdhani' && f.status === 'loaded'),
      eyebrow: perLine(header.querySelector('.eyebrow')),
      h1: perLine(header.querySelector('h1')),
      actions: actions ? Array.from(actions.children).map((el) => `${el.tagName.toLowerCase()} at +${Math.round(el.getBoundingClientRect().top - top)}`) : [],
      tabs: tabs.map((t) => `${t.textContent?.trim()} on row ${rowTops.indexOf(Math.round(t.getBoundingClientRect().top)) + 1}`),
      strip: nav ? Math.round(nav.getBoundingClientRect().height) : null,
    };
  });
  const seen: Record<string, Awaited<ReturnType<typeof measure>>> = {};
  for (const fonts of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()));
    if (!fonts) await refuseWebfonts(context);
    const page = await context.newPage();
    for (const route of ['/games/operator-guesser', '/games/music-guesser', '/games/color-palette', '/games/stage-guesser', '/games/recruitment-guesser']) {
      await page.goto(route);
      await fontsSettled(page);
      for (const width of [390, 520, 640, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const m = await measure(page);
        const key = `${route} at ${width}px`;
        expect(m.tabs.length, `${key}: the switcher`).toBe(5);
        if (fonts) {
          expect(m.webfont, `${key}: Rajdhani is in`).toBe(true);
          seen[key] = m;
          continue;
        }
        expect(m.webfont, `${key}: the first paint's face, not Rajdhani`).toBe(false);
        const loaded = seen[key];
        expect(Math.abs(m.eyebrow! - loaded.eyebrow!), `${key}: the eyebrow is ${m.eyebrow}px a line in the fallback, ${loaded.eyebrow} in the webfont`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(m.h1! - loaded.h1!), `${key}: the h1 is ${m.h1}px a line in the fallback, ${loaded.h1} in the webfont`).toBeLessThanOrEqual(0.5);
        expect(m.tabs, `${key}: the switcher's rows in the fallback face`).toEqual(loaded.tabs);
        expect(m.strip, `${key}: the switcher's height in the fallback face`).toBe(loaded.strip);
        expect(m.actions, `${key}: the header's actions in the fallback face`).toEqual(loaded.actions);
      }
    }
    await context.close();
  }
});

/*
 * The planner's panel heads (r10, 2026-09-27): the count after a panel's title ("· 4
 * operators with goals", "· 31 of 36 materials short", "· edited 18 days ago") follows
 * the title at the head's one column gap, and a head's controls are one group with one
 * gap. The count was the middle of three space-between items, so it floated to 598, 796
 * and 631px at 1440; and Show all sat 18.7px off Raw only where the pair's own gap is 6,
 * so when it wrapped on a phone it started 10px in from the line's edge. Box edges only:
 * a gap, not a width, so it is the same on CI's fonts.
 */
test("the planner's panel heads: the count follows the title, and the controls share one gap", async ({ page }) => {
  const width = await censusWidth(page);
  for (const state of CENSUS_STATES.filter((s) => /^planner experimental,? (with a plan|depot open)/.test(s.id))) {
    await openCensus(page, state);
    const heads = await page.locator('.plan-panel-head').evaluateAll((els) => els.map((head) => {
      const hs = getComputedStyle(head);
      const contentLeft = head.getBoundingClientRect().left + parseFloat(hs.paddingLeft) + parseFloat(hs.borderLeftWidth);
      // r11: the title and its count are one lead (.plan-panel-lead), whose column gap
      // is the one the count follows the title at.
      const lead = head.querySelector(':scope > .plan-panel-lead')!;
      const title = lead.querySelector(':scope > .label-pair')!.getBoundingClientRect();
      const hint = lead.querySelector(':scope > .plan-hint')?.getBoundingClientRect() ?? null;
      const acts = head.querySelector(':scope > .plan-panel-acts')!;
      const controls = Array.from(acts.querySelectorAll('button, label.check')).map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0)
        .sort((a, b) => a.top - b.top || a.left - b.left);
      const gaps: number[] = [];
      const lineStarts: number[] = [];
      controls.forEach((r, i) => {
        const prev = controls[i - 1];
        if (prev && Math.abs(prev.top - r.top) < 2) gaps.push(Math.round((r.left - prev.right) * 10) / 10);
        else lineStarts.push(Math.round((r.left - acts.getBoundingClientRect().left) * 10) / 10);
      });
      /* Each control's label sits in the middle of its box: glyph boxes against the box,
         both sides, so the font cancels out (Show all's empty tick span stood in the flex
         row with its gap and put the label 6px right of centre). */
      const offCentre = Array.from(acts.querySelectorAll('button')).filter((c) => c.getBoundingClientRect().width > 0).flatMap((c) => {
        const box = c.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(c);
        const text = range.getBoundingClientRect();
        const off = Math.round(((text.left - box.left) - (box.right - text.right)) * 10) / 10;
        return Math.abs(off) > 2 ? [`${c.textContent?.trim()} ${off}px`] : [];
      });
      return {
        offCentre,
        name: head.querySelector('h2')!.textContent,
        columnGap: parseFloat(getComputedStyle(lead).columnGap),
        hintAfterTitle: hint && Math.abs(hint.top + hint.height / 2 - (title.top + title.height / 2)) < title.height / 2 ? Math.round((hint.left - title.right) * 10) / 10 : null,
        hintAtLineStart: hint ? Math.round((hint.left - contentLeft) * 10) / 10 : null,
        gaps,
        lineStarts,
      };
    }));
    expect(heads.length, `${state.id}: the three panels`).toBe(3);
    // The shortfall's count ends in one unbreakable clause (no-break spaces from the dot
    // on), so a wrapped line never ends on the dot or an "and": at 390 it read "...across
    // 34 goals ·" over "and LMD and EXP". A string, not a glyph position.
    const shortfall = (await page.locator('.plan-panel-head').filter({ hasText: 'Still needed' }).locator(':scope > .plan-panel-lead > .plan-hint').textContent())!.trim();
    expect.soft(shortfall, `${state.id}: the shortfall count's money clause`).toMatch(/\u00a0·\u00a0and\u00a0(LMD|EXP|LMD\u00a0and\u00a0EXP)$/);
    for (const h of heads) {
      const where = `${state.id} at ${width}px, ${h.name}`;
      if (h.hintAfterTitle !== null) expect.soft(Math.abs(h.hintAfterTitle - h.columnGap), `${where}: the count is ${h.hintAfterTitle}px after the title, not the lead's ${h.columnGap}px gap`).toBeLessThanOrEqual(1);
      else if (h.hintAtLineStart !== null) expect.soft(Math.abs(h.hintAtLineStart), `${where}: the count wrapped to ${h.hintAtLineStart}px from the line's start`).toBeLessThanOrEqual(1);
      expect(h.gaps.length, `${where}: the controls`).toBeGreaterThan(0);
      expect.soft(Math.max(...h.gaps) - Math.min(...h.gaps), `${where}: the controls' gaps ${h.gaps.join(', ')}`).toBeLessThanOrEqual(1);
      expect.soft(h.offCentre, `${where}: labels off their controls' centre`).toEqual([]);
      for (const start of h.lineStarts) expect.soft(Math.abs(start), `${where}: a line of controls starts ${start}px in`).toBeLessThanOrEqual(1);
    }
  }
});
