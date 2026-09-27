import { expect, test, type Page } from '@playwright/test';
import { rowCensus, type RowOffence, type RowTolerance } from './row-census';
import { CENSUS_STATES, censusRoutes, openCensus, readOnly } from './census-routes';

/*
 * One line (docs/development/ui-primitives.md rule 4): in a row, a button, input or
 * select and the text beside it share one vertical centre, and the controls in it
 * share one height, --control-h.
 *
 * The census (row-census.ts) went over 41 routes and seven driven states (the /pulls
 * panels, /recruitment with tags and its cheat sheet, the stage guesser's own list) at
 * 1440 and 390 on 2026-09-26 and found five: the /pulls goal row (Until, Available,
 * All goals and Left 9px above the Pulls input and the remove button, lifted by the
 * space reserved for an empty caption), the /pulls forecast date (9px above the picked
 * banner's taller dropdown, both top-aligned), the /skins result count (9px above
 * Reset filters, lifted by .hint's bottom margin), the operator page credits (the
 * language label 4px above the voice actor's button, both top-aligned at different
 * heights) and the /planner search row (Clear 5px below the search field's centre).
 * The r9 census (2026-09-26, 45 addresses and twelve driven states) added the control
 * heights: six primitive heights side by side (tgl 32, ghost 33, chip 32/36, select 38,
 * search 38/40, button 44) and the rows pages had patched by hand, and three more rows
 * off their centre (the /operators/Amiya name row 15px, the /gacha dialogs' close 18px
 * and 7px, the planner level dialog's title 5.7px). One token, --control-h, fixed the
 * heights; each row is fixed at its source.
 *
 * STRICT on every page and state the census visited, at 1440 and 390: centres within
 * CENTRE px (glyph boxes come from the font, and CI's Linux fonts are not the Mac's,
 * so 2, not 1) and heights within HEIGHT px (a control's height is --control-h, a
 * min-height, whatever the font). A new page is measured without being listed here:
 * the addresses and states are census-routes.ts's, from pages/ as in page-bounds.spec.ts.
 *
 * What is not a failure is in ALLOWED, each with its reason, and an entry that matches
 * nothing on its page fails as stale, so the list only shrinks.
 *
 * This also measures the pull planner's goal row directly (on a phone too, where the
 * census cannot see it), and checks its footer, where text sits beside text, by
 * baseline.
 */
const TOLERANCE: RowTolerance = { centre: 2, height: 1 };

/** An accepted offence: `route` (as the test names it) and the width (1440 or 390),
 *  then the offence's fields as regular expressions. Every entry says why. */
interface Allowed { route: string; width?: 1440 | 390; kind: RowOffence['kind']; container: RegExp; control?: RegExp; beside?: RegExp; why: string }

const ALLOWED: Allowed[] = [
];

/** The census's two widths: the desktop project is 1440 wide, and the mobile one (a
 *  Pixel 7, 412 wide) is narrowed to the census's 390. */
async function censusWidth(page: Page): Promise<1440 | 390> {
  if (page.viewportSize()!.width >= 1000) return 1440;
  await page.setViewportSize({ width: 390, height: 844 });
  return 390;
}

async function census(page: Page): Promise<RowOffence[]> {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(rowCensus, TOLERANCE);
}

/** Fails on an offence ALLOWED does not name, and on an entry for this page that
 *  matched nothing (it is stale: delete it). */
function expectOnlyAllowed(offences: RowOffence[], route: string, width: number) {
  const mine = ALLOWED.filter((a) => a.route === route && (!a.width || a.width === width));
  const used = new Set<Allowed>();
  const fresh = offences.filter((o) => {
    const hit = mine.find((a) => a.kind === o.kind && a.container.test(o.container) && (!a.control || a.control.test(o.control)) && (!a.beside || a.beside.test(o.beside)));
    if (hit) used.add(hit);
    return !hit;
  });
  expect(fresh, `rows off one line or one height on ${route} at ${width}`).toEqual([]);
  expect(mine.filter((a) => !used.has(a)).map((a) => a.why), `stale ALLOWED entries for ${route} at ${width}`).toEqual([]);
}

/** A banner the plan can hold, from the page's own schedule. */
async function plannedBanner(page: Page): Promise<string> {
  await page.goto('/pulls');
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
  expectOnlyAllowed(await census(page), '/pulls?banner', width);

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
  for (const name of [/Income & events/, /Past events/, /Skin wishlist/]) {
    await page.getByRole('button', { name }).click();
    expectOnlyAllowed(await census(page), `/pulls?banner ${name.source}`, width);
  }
  await page.getByRole('button', { name: '+ Add banner' }).click();
  expectOnlyAllowed(await census(page), '/pulls?banner + Add banner', width);
});

/*
 * One control height is one token: --control-h-base in styles/core/shared.css, 36px
 * (40 on a phone) and the one value the maintainer may flip. Every row primitive reads
 * it as a min-height with small vertical padding, so each measures exactly the token,
 * and a flip moves them all -- a primitive with a literal height, or padding that
 * outgrows a smaller token, is left behind and fails here. Measured on /operators (its
 * real search field and StyledSelect trigger) with the other primitives added beside
 * them; min-height decides, not the font, so this is the same on CI's Linux fonts.
 */
test('every row primitive is one control height, and follows the token', async ({ page }) => {
  const width = await censusWidth(page);
  await openCensus(page, '/operators');
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
        '<button type="button" class="btn-icon" aria-label="Close">×</button>',
        '<button type="button" class="ghost btn-icon" aria-label="Next">›</button>',
        '<button type="button" class="filter-chip" aria-pressed="false">Chip</button>',
        '<button type="button" class="tgl">Mode</button>',
      ].join('');
      document.querySelector('main')!.prepend(bench);
    }
    const box = (el: Element | null) => (el ? { h: Math.round(el.getBoundingClientRect().height * 10) / 10, w: Math.round(el.getBoundingClientRect().width * 10) / 10 } : null);
    const out: Record<string, { h: number; w: number } | null> = {};
    for (const el of Array.from(bench.children)) out[el.outerHTML.slice(0, 48)] = box(el);
    out['search field'] = box(document.querySelector('#page-content .search-input'));
    out['StyledSelect trigger'] = box(document.querySelector('#page-content [role="combobox"]'));
    return out;
  });
  for (const [base, expected] of [[null, width > 720 ? 36 : 40], [32, width > 720 ? 32 : 36]] as const) {
    if (base) await page.addStyleTag({ content: `:root { --control-h-base: ${base}px; }` });
    const measured = await heights();
    for (const [control, size] of Object.entries(measured)) {
      expect(size, `${control} is on the page`).not.toBeNull();
      expect(Math.abs(size!.h - expected), `${control} is ${size!.h}px tall, not the control height ${expected}px${base ? ` (--control-h-base: ${base}px)` : ''}`).toBeLessThanOrEqual(1);
      if (/btn-icon/.test(control)) expect(Math.abs(size!.w - expected), `${control} is square`).toBeLessThanOrEqual(1);
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
 * so if fonts.googleapis.com is unreachable this one test says so, not 59 page tests.
 */
test('the site nav is on one line', async ({ page }) => {
  const width = await censusWidth(page);
  await openCensus(page, '/');
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  const offences = await page.evaluate(rowCensus, { ...TOLERANCE, scope: 'nav' as const });
  expectOnlyAllowed(offences, 'site nav', width);
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
    await page.evaluate(() => document.fonts.ready);
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
            if (cs.display === 'none' || cs.clip !== 'auto' || el.getBoundingClientRect().width <= 1) { hidden = true; break; }
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
 */
test("the operator page's panel header is no taller than before", async ({ page }) => {
  const width = await censusWidth(page);
  const ceilings: Record<string, Record<1440 | 390, number>> = { Amiya: { 390: 127, 1440: 121 }, SilverAsh: { 390: 89, 1440: 87 } };
  for (const [name, ceiling] of Object.entries(ceilings)) {
    await openCensus(page, `/operators/${name}`);
    await page.evaluate(() => document.fonts.ready);
    const header = page.locator('[class*="panelHeader"]').first();
    await expect(header).toBeVisible();
    const h = await header.evaluate((el) => Math.round(el.getBoundingClientRect().height * 10) / 10);
    expect(h, `${name}'s panel header at ${width}px is ${h}px, over the ${ceiling[width]}px it was`).toBeLessThanOrEqual(ceiling[width] + 2);
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
  await openCensus(page, '/music');
  await page.evaluate(() => document.fonts.ready);
  const row = page.locator('.music-queue-row:not(.music-queue-row-placeholder)').first();
  await expect(row).toBeVisible();
  const m = await row.evaluate((el) => {
    const title = el.querySelector('.music-queue-row-title')!;
    const cs = getComputedStyle(title);
    const heights = [title, ...Array.from(el.querySelectorAll('.music-queue-row-actions button'))].map((b) => Math.round(b.getBoundingClientRect().height));
    return { room: title.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), heights };
  });
  expect(new Set(m.heights).size, `the title and its buttons are one height: ${m.heights.join(', ')}`).toBe(1);
  expect(m.room, `the title has ${m.room}px for its text at 390, under the 153px it had`).toBeGreaterThanOrEqual(153 - 2);
});

/*
 * The page header and the game switcher do not move when the webfonts arrive. They load
 * from Google Fonts with display=swap, so the first paint is in the fallback face (and
 * every paint, where Google Fonts is blocked). The eyebrow and the h1 were "normal" line
 * height, as tall as the face drawing them, so everything under the header moved down 4px
 * (3 on a phone) on every page when Rajdhani and JetBrains Mono came in; and the switcher
 * wrapped where its labels ran out of room, which the face decides: at 390px its "Stage"
 * tab jumped 260px from the second row to the first, and from 480 to 720px rows and the
 * music guesser's library link came and went (GameLinks.module.css). This loads every game
 * (every page that renders the switcher) with the webfonts and with Google Fonts refused,
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
    await context.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => {
      if (!fonts && /fonts\.(googleapis|gstatic)\.com/.test(route.request().url())) return route.abort();
      return ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const route of ['/games/operator-guesser', '/games/music-guesser', '/games/color-palette', '/games/stage-guesser', '/games/recruitment-guesser']) {
      await page.goto(route);
      await page.evaluate(() => document.fonts.ready);
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
      const title = head.querySelector(':scope > .label-pair')!.getBoundingClientRect();
      const hint = head.querySelector(':scope > .plan-hint')?.getBoundingClientRect() ?? null;
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
        columnGap: parseFloat(hs.columnGap),
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
    const shortfall = (await page.locator('.plan-panel-head').filter({ hasText: 'Still needed' }).locator(':scope > .plan-hint').textContent())!.trim();
    expect.soft(shortfall, `${state.id}: the shortfall count's money clause`).toMatch(/\u00a0·\u00a0and\u00a0(LMD|EXP|LMD\u00a0and\u00a0EXP)$/);
    for (const h of heads) {
      const where = `${state.id} at ${width}px, ${h.name}`;
      if (h.hintAfterTitle !== null) expect.soft(Math.abs(h.hintAfterTitle - h.columnGap), `${where}: the count is ${h.hintAfterTitle}px after the title, not the head's ${h.columnGap}px gap`).toBeLessThanOrEqual(1);
      else if (h.hintAtLineStart !== null) expect.soft(Math.abs(h.hintAtLineStart), `${where}: the count wrapped to ${h.hintAtLineStart}px from the line's start`).toBeLessThanOrEqual(1);
      expect(h.gaps.length, `${where}: the controls`).toBeGreaterThan(0);
      expect.soft(Math.max(...h.gaps) - Math.min(...h.gaps), `${where}: the controls' gaps ${h.gaps.join(', ')}`).toBeLessThanOrEqual(1);
      expect.soft(h.offCentre, `${where}: labels off their controls' centre`).toEqual([]);
      for (const start of h.lineStarts) expect.soft(Math.abs(start), `${where}: a line of controls starts ${start}px in`).toBeLessThanOrEqual(1);
    }
  }
});

for (const target of [...censusRoutes(), ...CENSUS_STATES]) {
  const name = typeof target === 'string' ? target : target.id;
  test(`${typeof target === 'string' ? target : `${target.route} (${target.id})`} is on one line`, async ({ page }) => {
    const width = await censusWidth(page);
    await openCensus(page, target);
    expectOnlyAllowed(await census(page), name, width);
  });
}
