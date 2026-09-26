import { expect, test, type Page } from '@playwright/test';
import { rowCensus, type RowOffence } from './row-census';

/*
 * One line (docs/development/ui-primitives.md rule 4): in a row, a button, input or
 * select and the text beside it share one vertical centre.
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
 * This keeps the census on those routes, plus the /pulls states that put controls
 * beside text, measures the goal row directly (on a phone too, where the census cannot
 * see it), and checks the pull planner's footer, where text sits beside text, by
 * baseline.
 */
const TOLERANCE = 3;

async function census(page: Page): Promise<RowOffence[]> {
  await page.waitForLoadState('networkidle').catch(() => {});
  return page.evaluate(rowCensus, TOLERANCE);
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
  const banner = await plannedBanner(page);
  await page.goto(`/pulls?banner=${encodeURIComponent(banner)}`);
  const row = page.locator('article [class*="bannerRow"]').first();
  await expect(row).toBeVisible();
  expect(await census(page)).toEqual([]);

  // The row measured directly: every value on the Pulls input's centre line, and on a
  // phone, where each cell stacks a label over its value, every label on one top. The
  // census cannot see the phone layout: there the input's cell holds its label too.
  const narrow = (page.viewportSize()?.width ?? 1440) <= 700;
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
  // grows to hold the portraits beside the date field.
  const banner = await plannedBanner(page);
  await page.goto(`/pulls?banner=${encodeURIComponent(banner)}`);
  await expect(page.locator('article [class*="bannerRow"]').first()).toBeVisible();
  for (const name of [/Income & events/, /Past events/, /Skin wishlist/]) {
    await page.getByRole('button', { name }).click();
    expect(await census(page), `with ${name.source} open`).toEqual([]);
  }
  await page.getByRole('button', { name: '+ Add banner' }).click();
  expect(await census(page), 'with the banner picker open').toEqual([]);
});

for (const route of ['/skins', '/operators/Amiya', '/recruitment', '/planner']) {
  test(`${route} is on one line`, async ({ page }) => {
    await page.goto(route);
    expect(await census(page)).toEqual([]);
  });
}
