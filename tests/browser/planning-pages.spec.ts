import { expect, test, type Locator, type Page } from '@playwright/test';

/*
 * The planning, events and home pages (the 2026-09-25 review's family B). One test per
 * bug the review measured on the rendered page, each asserting what the reader sees:
 *
 *   GE-01  /farming opened Tier 3 on a 650ms timer and its tiers were exclusive, so
 *          opening Tier 2 moved its own header 386-412px up the screen.
 *   GE-02  /results Detailed and the /base simulation widened the page at 390.
 *   GE-04  /base facility labels were dark-theme hex in light mode (1.52-2.80:1).
 *   GE-09  the home skins row was a marquee that ignored reduced motion.
 *   GE-11  /results' sortable headers were <th onClick>: no keyboard, no aria-sort.
 *   GE-15  unlimited event-store stock ("∞") printed as "×0".
 *   APJ    /events/[slug] tab switch and /gacha Reset shortened the page under the
 *          reader (the Anti-Page Jump rule, arkpedia-ui skill).
 *
 * These set their own viewports, so they run in the desktop project only.
 */

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } as const;

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'sets its own viewports, so it runs in one project');
});

async function pageWidthOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** How far `anchor` moves on screen when `act` runs, the reader having scrolled so it
 *  sits `at` px from the top. The Anti-Page Jump rule allows under 4px. */
async function anchorMovement(page: Page, anchor: Locator, act: () => Promise<void>, place?: number) {
  if (place !== undefined) {
    await anchor.evaluate((el, y) => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - y), behavior: 'instant' }), place);
    await page.waitForTimeout(300);
  }
  const before = await anchor.evaluate((el) => el.getBoundingClientRect().top);
  await act();
  await page.waitForTimeout(700);
  const after = await anchor.evaluate((el) => el.getBoundingClientRect().top);
  return Math.round(after - before);
}

test.describe('/farming tiers (GE-01)', () => {
  test('Tier 3 is open in the server HTML and nothing opens on a timer', async ({ page }) => {
    const html = await (await page.request.get('/farming')).text();
    expect(html.match(/class="farming-accordion-section open"/g) ?? [], 'exactly Tier 3 is open before any script runs').toHaveLength(1);
    await page.goto('/farming');
    const tier2 = page.getByRole('button', { name: 'Tier 2' });
    const at = await tier2.evaluate((el) => el.getBoundingClientRect().top);
    await page.waitForTimeout(1200);
    expect(Math.round(await tier2.evaluate((el) => el.getBoundingClientRect().top) - at), 'no layout shift after load').toBe(0);
  });

  for (const width of [{ key: '1440', use: { viewport: { width: 1440, height: 900 } } }, { key: '390', use: PHONE }]) {
    test.describe(`at ${width.key}`, () => {
      test.use(width.use);
      test('each tier toggles on its own and the reader does not move', async ({ page }) => {
        await page.goto('/farming');
        const tier1 = page.getByRole('button', { name: 'Tier 1' });
        const tier2 = page.getByRole('button', { name: 'Tier 2' });
        const tier3 = page.getByRole('button', { name: 'Tier 3' });
        await expect(tier3).toHaveAttribute('aria-expanded', 'true');
        const viewport = page.viewportSize()!;
        const moved = await anchorMovement(page, tier2, () => tier2.click(), Math.round(viewport.height * 0.6));
        await expect(tier2).toHaveAttribute('aria-expanded', 'true');
        await expect(tier3, 'opening Tier 2 leaves Tier 3 open').toHaveAttribute('aria-expanded', 'true');
        expect(Math.abs(moved), 'opening Tier 2 moves its header').toBeLessThan(4);

        // Reading Tier 1 at the bottom of the page, close Tier 3 far above.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
        const closed = await anchorMovement(page, tier1, () => tier3.click());
        await expect(tier3).toHaveAttribute('aria-expanded', 'false');
        expect(Math.abs(closed), 'closing Tier 3 above the reader moves Tier 1').toBeLessThan(4);
      });
    });
  }
});

test.describe('/results', () => {
  test.use(PHONE);

  test('Detailed keeps the page inside a phone (GE-02)', async ({ page }) => {
    await page.goto('/results');
    await page.getByRole('button', { name: 'Detailed', exact: true }).click();
    await expect(page.locator('.stats-table')).toBeVisible();
    expect(await pageWidthOverflow(page), 'the table scrolls in its own box, not the page').toBeLessThanOrEqual(1);
  });

  test('Compact fits five operators per row on a phone', async ({ page }) => {
    await page.goto('/results');
    const perRow = await page.locator('.tier-drop').first().evaluate((row) => {
      const tops = new Map<number, number>();
      for (const chip of Array.from(row.children)) {
        const top = Math.round(chip.getBoundingClientRect().top);
        tops.set(top, (tops.get(top) ?? 0) + 1);
      }
      return Math.max(...tops.values());
    });
    expect(perRow).toBeGreaterThanOrEqual(5);
  });

  test('the sortable headers are buttons with aria-sort (GE-11)', async ({ page }) => {
    await page.goto('/results');
    await page.getByRole('button', { name: 'Detailed', exact: true }).click();
    const average = page.getByRole('button', { name: /^Average/ });
    await average.focus();
    await expect(average, 'a header can take keyboard focus').toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('columnheader', { name: /Average/ })).toHaveAttribute('aria-sort', 'descending');
    await expect(page.getByRole('columnheader', { name: /Median/ })).toHaveAttribute('aria-sort', 'none');
    await page.getByRole('button', { name: /^Median/ }).press('Space');
    await expect(page.getByRole('columnheader', { name: /Median/ })).toHaveAttribute('aria-sort', 'descending');
  });
});

test.describe('/events/[slug]', () => {
  const PEOPLE = '/events/%5BSide%20Story%5D%20People%2C%20A%20People';

  test('unlimited store stock never totals to ×0 (GE-15)', async ({ page }) => {
    await page.goto(PEOPLE);
    await page.getByRole('group', { name: 'Event sections' }).getByRole('button', { name: 'Rewards' }).click();
    const totals = page.locator('.event-reward-total');
    await expect(totals.first()).toBeVisible();
    const texts = await totals.allInnerTexts();
    expect(texts.filter((text) => /×0$/.test(text.trim())), 'a listing without a limit is not a zero').toEqual([]);
  });

  test('placeholder tabs are hidden', async ({ page }) => {
    await page.goto(PEOPLE);
    const tabs = page.getByRole('group', { name: 'Event sections' });
    await expect(tabs.getByRole('button', { name: 'Packs' })).toHaveCount(0);
    await expect(tabs.getByRole('button', { name: 'Miscellaneous' })).toHaveCount(0);
    await expect(page.getByText('Coming soon')).toHaveCount(0);
  });

  test.describe('at 390', () => {
    test.use(PHONE);
    test('switching to a shorter tab at the bottom holds the reader (Anti-Page Jump)', async ({ page }) => {
      await page.goto(PEOPLE);
      const tabs = page.getByRole('group', { name: 'Event sections' });
      await tabs.getByRole('button', { name: 'Rewards' }).click();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(300);
      for (const shorter of ['Skins', 'Banner']) {
        const moved = await anchorMovement(page, tabs, () => tabs.getByRole('button', { name: shorter }).click());
        expect(Math.abs(moved), `Rewards -> ${shorter} moves the tab row`).toBeLessThan(4);
        await tabs.getByRole('button', { name: 'Rewards' }).click();
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
      }
    });
  });
});

test.describe('home', () => {
  test('the skins row scrolls by hand, with nothing moving on its own (GE-09)', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('.front-skins-panel');
    await expect(panel).toBeVisible();
    const state = await panel.evaluate((el) => {
      const animated = Array.from(el.querySelectorAll('*')).filter((node) => getComputedStyle(node).animationName !== 'none');
      const row = el.querySelector('.scroll-row');
      const names = Array.from(el.querySelectorAll('.front-skin-name')).map((n) => n.textContent);
      return {
        animated: animated.length,
        overflowX: row ? getComputedStyle(row).overflowX : null,
        duplicated: names.length - new Set(names).size,
      };
    });
    expect(state.animated, 'no animation in the skins panel').toBe(0);
    if (state.overflowX !== null) expect(state.overflowX).toBe('auto');
    expect(state.duplicated, 'each skin appears once (the marquee doubled the track)').toBe(0);
  });

  test('the Packs placeholder is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Packs' })).toHaveCount(0);
  });
});
