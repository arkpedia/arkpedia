import { expect, test, type Page } from '@playwright/test';

/*
 * Two maintainer decisions from 2026-09-26, after the site-wide restyle:
 *
 * - Section headings are teal-ish (--heading), not amber, and not the --teal that marks
 *   an on/current state either.
 * - Picture and content cards carry no resting frame: the art already says they can be
 *   clicked, and a grey box around every poster, portrait and tile was noise. They draw
 *   the teal edge on hover and keyboard focus. Real controls keep --control-border.
 */

// Routes whose sections use the site heading (.op-section h2 or the home panels).
const HEADING_ROUTES = ['/', '/operators/Amiya', '/gacha', '/planner', '/skins'];
const HOME_CARDS = ['.front-events-main', '.front-gacha-poster-wrap', '.front-featured-op', '.front-skin-item', '.front-community-item'];

/** The theme the page is in: no data-theme attribute means the default, dark. */
const themeOf = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark');

/** The colour a probe painted with the given custom property computes to. */
async function tokenColour(page: Page, token: string) {
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
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* none */ } }, theme);
    });

    test('section headings use --heading, never amber or the on-state teal', async ({ page }) => {
      for (const route of HEADING_ROUTES) {
        await page.goto(route);
        expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
        const heading = await tokenColour(page, '--heading');
        const amber = await tokenColour(page, '--amber');
        const teal = await tokenColour(page, '--teal');
        expect(heading, 'the heading colour is its own token').not.toBe(teal);
        const colours = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.op-section h2, .front-home-panel h2, .simple-all h2, .simple-empty h2, .plan-panel-head .label-pair > h2, .waiting-box h2'))
          .filter((el) => el.getClientRects().length > 0)
          .map((el) => ({ text: (el.textContent ?? '').trim().slice(0, 40), colour: getComputedStyle(el).color })));
        expect(colours.length, `${route} has section headings`).toBeGreaterThan(0);
        for (const { text, colour } of colours) {
          expect(colour, `${route} "${text}" is not amber`).not.toBe(amber);
          expect(colour, `${route} "${text}" uses --heading`).toBe(heading);
        }
      }
    });

    test('home picture cards have no resting frame and a teal edge on hover', async ({ page }, info) => {
      await page.goto('/');
      expect(await themeOf(page), `the page is in the ${theme} theme`).toBe(theme);
      const teal = await tokenColour(page, '--teal');
      let checked = 0;
      for (const selector of HOME_CARDS) {
        const card = page.locator(selector).first();
        if (!(await card.count()) || !(await card.isVisible())) continue;
        const rest = await card.evaluate((el) => getComputedStyle(el).borderTopColor);
        expect(rest, `${selector} has no visible border at rest`).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);
        checked += 1;
        if (info.project.name === 'desktop') {
          await card.hover();
          await expect.poll(() => card.evaluate((el) => getComputedStyle(el).borderTopColor), { message: `${selector} turns teal on hover` }).toBe(teal);
          await page.mouse.move(0, 0);
        }
      }
      expect(checked, 'at least the event, banner and featured cards are on the page').toBeGreaterThanOrEqual(3);
    });
  });
}
