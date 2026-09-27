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

for (const target of [...censusRoutes(), ...CENSUS_STATES]) {
  const name = typeof target === 'string' ? target : target.id;
  test(`${typeof target === 'string' ? target : `${target.route} (${target.id})`} is on one line`, async ({ page }) => {
    const width = await censusWidth(page);
    await openCensus(page, target);
    expectOnlyAllowed(await census(page), name, width);
  });
}
