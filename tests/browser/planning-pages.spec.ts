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
 *   4.3 A  the /schedule calendar slid 180px left when an event opened.
 *   4.3 G  /gacha pull tiles and featured rates used their own palette (5-star teal).
 *   4.3 H  /base facility gear and ? were 8-9px on a phone.
 *   4.3 C  /gacha's guide ended on a "coming soon" page for trio and crossover banners
 *          (placeholders stay hidden until they have content).
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
 *  sits `at` px from the top. The Anti-Page Jump rule allows under 4px.
 *
 *  It first lets the page's entrance animations end (a finite CSS animation, such as the
 *  /farming table's 0.6s flow-in). Playwright will not click an element that is still
 *  moving, and on its retry it scrolls the element to the viewport's edge first: with the
 *  reader at the foot of /farming that scrolled Tier 2's header 142px, which read here as
 *  the page jumping (1 run in 50 under load; the page itself never moved). */
async function anchorMovement(page: Page, anchor: Locator, act: () => Promise<void>, place?: number) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
    .map((a) => a.finished.catch(() => undefined))));
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

        // Tier 3's header near the top of the screen, as far down the page as that
        // allows: closing it takes its whole body out, which would leave the document
        // shorter than the reader's position. The header they pressed must stay put.
        // (A click on a header scrolled off the screen would be Playwright scrolling
        // it into view, not the page moving.)
        await tier1.click();
        await expect(tier1).toHaveAttribute('aria-expanded', 'true');
        const closed = await anchorMovement(page, tier3, () => tier3.click(), 80);
        await expect(tier3).toHaveAttribute('aria-expanded', 'false');
        expect(Math.abs(closed), 'closing Tier 3 moves its own header').toBeLessThan(4);
      });

      test('one hairline under the page header, not two', async ({ page }) => {
        // .farming-legend-top said border-top: none, but .farming-legend came later in
        // the file at the same specificity and drew its own rule 26px under the header's.
        await page.goto('/farming');
        const rules = await page.evaluate(() => {
          const header = document.querySelector('.page-header')!.getBoundingClientRect().bottom;
          const legend = document.querySelector('.farming-legend-top')!;
          return { legendTop: getComputedStyle(legend).borderTopStyle, gap: Math.round(legend.getBoundingClientRect().top - header) };
        });
        expect(rules.legendTop, `the legend ${rules.gap}px under the header draws a second rule`).toBe('none');
      });
    });
  }
});

test.describe('/obtain-method', () => {
  for (const width of [{ key: '1440', use: { viewport: { width: 1440, height: 900 } } }, { key: '390', use: PHONE }]) {
    test.describe(`at ${width.key}`, () => {
      test.use(width.use);
      test('no line of a card\'s rarity and note starts with a dash', async ({ page }) => {
        // The rarity and the note were two flex items in a wrapping flex row, so the
        // note wrapped onto a line of its own that began with "\u2014" on every card, at
        // every width. Checked two ways: no flex item starts with the dash, and no dash
        // is drawn at the start of a line (a single run can still wrap before one).
        await page.goto('/obtain-method');
        await expect(page.locator('.roster-class-branch', { hasText: /days until/ }).first()).toBeVisible();
        const found = await page.locator('.roster-class-branch').evaluateAll((rows) => {
          const problems: string[] = [];
          let dashes = 0;
          for (const row of rows) {
            const box = row.getBoundingClientRect();
            const style = getComputedStyle(row);
            const lineStart = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
            for (const item of Array.from(row.childNodes)) {
              if (/^\s*\u2014/.test(item.textContent ?? '')) problems.push(`flex item "${item.textContent!.trim().slice(0, 30)}"`);
            }
            const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              const text = node.textContent ?? '';
              for (let i = text.indexOf('\u2014'); i >= 0; i = text.indexOf('\u2014', i + 1)) {
                dashes += 1;
                const range = document.createRange();
                range.setStart(node, i);
                range.setEnd(node, i + 1);
                const left = range.getBoundingClientRect().left;
                if (left - lineStart < 1) problems.push(`"${row.textContent!.trim().slice(0, 40)}" has a line starting with the dash`);
              }
            }
          }
          return { problems, dashes, rows: rows.length };
        });
        expect(found.dashes, 'the cards carry notes, or this proves nothing').toBeGreaterThan(0);
        expect(found.problems).toEqual([]);
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
    // The most chips any one line holds, across every average's row (the first row
    // may simply have fewer than five operators in it).
    const perRow = await page.locator('.tier-drop').evaluateAll((rows) => Math.max(...rows.map((row) => {
      const tops = new Map<number, number>();
      for (const chip of Array.from(row.children)) {
        const top = Math.round(chip.getBoundingClientRect().top);
        tops.set(top, (tops.get(top) ?? 0) + 1);
      }
      return Math.max(0, ...tops.values());
    })));
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
    await page.getByRole('tablist', { name: 'Event sections' }).getByRole('tab', { name: 'Rewards' }).click();
    const totals = page.locator('.event-reward-total');
    await expect(totals.first()).toBeVisible();
    const texts = await totals.allInnerTexts();
    expect(texts.filter((text) => /×0$/.test(text.trim())), 'a listing without a limit is not a zero').toEqual([]);
  });

  test('placeholder tabs are hidden', async ({ page }) => {
    await page.goto(PEOPLE);
    const tabs = page.getByRole('tablist', { name: 'Event sections' });
    await expect(tabs.getByRole('tab', { name: 'Packs' })).toHaveCount(0);
    await expect(tabs.getByRole('tab', { name: 'Miscellaneous' })).toHaveCount(0);
    await expect(page.getByText('Coming soon')).toHaveCount(0);
  });

  test.describe('at 390', () => {
    test.use(PHONE);
    test('switching to a shorter tab at the bottom holds the reader (Anti-Page Jump)', async ({ page }) => {
      await page.goto(PEOPLE);
      const tabs = page.getByRole('tablist', { name: 'Event sections' });
      // The tab row near the top of the screen with the tall Rewards list under it:
      // the reader can see the tab they press, and a shorter tab would leave the page
      // shorter than where they are.
      for (const shorter of ['Skins', 'Banner']) {
        await tabs.getByRole('tab', { name: 'Rewards' }).click();
        const moved = await anchorMovement(page, tabs, () => tabs.getByRole('tab', { name: shorter }).click(), 70);
        expect(Math.abs(moved), `Rewards -> ${shorter} moves the tab row`).toBeLessThan(4);
      }
      // The hold is only what that position needed: back at the top of the page there
      // is nothing to scroll down into under the short tab (the page is its own height,
      // or one screen when that is taller), and a switch made at the top holds nothing.
      const blankBelow = () => page.evaluate(() => {
        const el = document.querySelector('.event-detail-right') as HTMLElement;
        const last = el.lastElementChild as HTMLElement;
        const content = last.getBoundingClientRect().bottom - el.getBoundingClientRect().top;
        const doc = document.documentElement.scrollHeight;
        const natural = doc - (el.getBoundingClientRect().height - content);
        return Math.round(doc - Math.max(natural, window.innerHeight));
      });
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect.poll(blankBelow, { message: 'the hold is released at the top' }).toBeLessThanOrEqual(24);
      await tabs.getByRole('tab', { name: 'Rewards' }).click();
      await tabs.getByRole('tab', { name: 'Skins' }).click();
      expect(await blankBelow(), 'a switch at the top holds nothing').toBeLessThanOrEqual(24);
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

/** The reader's view of the base: the 2-4-3 preset, simulated. */
async function simulateBase(page: Page) {
  await page.goto('/base');
  await page.locator('.base-setup-preset-card').first().click();
  await page.getByRole('button', { name: 'Begin Simulation' }).click();
  await expect(page.locator('.base-facility-label').first()).toBeVisible();
}

test.describe('/base', () => {
  test.describe('at 390', () => {
    test.use(PHONE);
    test('the simulation keeps the page inside a phone (GE-02)', async ({ page }) => {
      await simulateBase(page);
      expect(await pageWidthOverflow(page), 'the summary rows wrap instead of widening the page').toBeLessThanOrEqual(1);
    });

    test('each facility gear and ? is at least 24px on screen (4.3 H)', async ({ page }) => {
      await simulateBase(page);
      const sizes = await page.locator('.base-facility-settings-btn, .base-facility-explain-btn').evaluateAll((buttons) =>
        buttons.map((button) => { const box = button.getBoundingClientRect(); return Math.min(box.width, box.height); }));
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(24);
    });
  });

  test('facility labels clear 4.5:1 in the light theme (GE-04)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch { /* none */ } });
    await simulateBase(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const worst = await page.evaluate(() => {
      /* rgb()/rgba() and color(srgb ...), which is how a color-mix() computes. */
      const parse = (value: string): number[] | null => {
        const rgb = value.match(/rgba?\(([^)]+)\)/);
        if (rgb) { const p = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; }
        const srgb = value.match(/color\(srgb ([^)]+)\)/);
        if (srgb) { const p = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1]; }
        return null;
      };
      const over = (top: number[], bottom: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
      const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
      const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      const background = (el: Element): number[] => {
        const layers: number[][] = [];
        for (let node: Element | null = el; node; node = node.parentElement) {
          const c = parse(getComputedStyle(node).backgroundColor);
          if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
        }
        let base = layers.length && layers[layers.length - 1][3] >= 1 ? layers.pop()! : [255, 255, 255, 1];
        while (layers.length) base = over(layers.pop()!, base);
        return base;
      };
      let min = { ratio: 99, label: '' };
      for (const label of Array.from(document.querySelectorAll('.base-facility-label'))) {
        if (!(label as HTMLElement).offsetParent) continue;
        const bg = background(label);
        const fg = over(parse(getComputedStyle(label).color)!, bg);
        const r = ratio(fg, bg);
        if (r < min.ratio) min = { ratio: Math.round(r * 100) / 100, label: label.textContent ?? '' };
      }
      return min;
    });
    expect(worst.ratio, `${worst.label} measured ${worst.ratio}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

test.describe('/gacha', () => {
  for (const width of [{ key: '1440', use: { viewport: { width: 1440, height: 900 } } }, { key: '390', use: PHONE }]) {
    test.describe(`at ${width.key}`, () => {
      test.use(width.use);
      test('Reset at the bottom of the page does not move the reader (Anti-Page Jump)', async ({ page }) => {
        await page.goto('/gacha');
        const ten = page.getByRole('button', { name: 'Pull ten operators' });
        for (let i = 0; i < 3; i += 1) { await ten.click(); await page.waitForTimeout(400); }
        await page.getByRole('button', { name: /Pull history/ }).click();
        // Reset near the top of the screen, with Latest pull and the open history
        // under it: everything below it empties.
        const reset = page.locator('.gacha-action-reset');
        const moved = await anchorMovement(page, reset, () => reset.click(), 70);
        expect(Math.abs(moved), 'Reset moves the controls under the reader').toBeLessThan(4);
        await expect(page.locator('.gacha-pull-tile-empty'), 'Latest pull keeps its ten frames').toHaveCount(10);
        await expect(page.getByRole('button', { name: /Pull history/ }), 'the history header stays').toBeVisible();
      });
    });
  }

  test('pull tiles and featured rates take their colour from the rarity tokens (4.3 G)', async ({ page }) => {
    await page.goto('/gacha');
    await page.getByRole('button', { name: 'Pull ten operators' }).click();
    const result = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const token = (n: number) => { probe.style.color = `var(--rarity-${n})`; return getComputedStyle(probe).color; };
      const wrong: string[] = [];
      const names: Record<string, number> = { 'pull-six': 6, 'pull-five': 5, 'pull-four': 4, 'pull-three': 3 };
      for (const tile of Array.from(document.querySelectorAll('.gacha-pull-grid .gacha-pull-tile'))) {
        const cls = Array.from(tile.classList).find((c) => c in names);
        if (cls && getComputedStyle(tile).borderTopColor !== token(names[cls])) wrong.push(`${cls}: ${getComputedStyle(tile).borderTopColor}`);
      }
      for (const n of [6, 5]) {
        for (const rate of Array.from(document.querySelectorAll(`.gacha-featured-chip-${n} .gacha-featured-percent`))) {
          if (getComputedStyle(rate).color !== token(n)) wrong.push(`featured ${n}: ${getComputedStyle(rate).color}`);
        }
      }
      probe.remove();
      return wrong;
    });
    expect(result).toEqual([]);

    // The Details modal's featured rates: 5-star was teal there.
    await page.getByRole('button', { name: 'Details', exact: true }).click();
    const details = await page.evaluate(() => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const token = (n: number) => { probe.style.color = `var(--rarity-${n})`; return getComputedStyle(probe).color; };
      const seen: string[] = [];
      const wrong: string[] = [];
      for (const n of [6, 5]) {
        for (const rate of Array.from(document.querySelectorAll(`.gacha-details-rarity-${n} small`))) {
          seen.push(String(n));
          if (getComputedStyle(rate).color !== token(n)) wrong.push(`details ${n}: ${getComputedStyle(rate).color}`);
        }
      }
      probe.remove();
      return { seen: seen.length, wrong };
    });
    expect(details.seen, 'the Details modal lists featured operators').toBeGreaterThan(0);
    expect(details.wrong).toEqual([]);
  });

  // A banner type with no tutorial of its own (trio, crossover) used to end its guide on
  // a "coming soon" page. Placeholders stay hidden until they have content, so its guide
  // is the Basics alone and ends on Done.
  test('a banner without its own tutorial opens its guide on the Basics, with no placeholder', async ({ page }) => {
    await page.goto('/gacha');
    // "The Front That Was" banners are trio and the Crossover category is crossover
    // (getMechanicType in lib/gacha/realGachaBanners.ts): neither type has pages of its
    // own. Not a skip when one is missing -- a guard that can skip itself guards nothing.
    const categories = page.getByRole('group', { name: 'Banner category' });
    const trio = categories.getByRole('button', { name: 'The Front That Was', exact: true });
    const category = await trio.count() ? trio : categories.getByRole('button', { name: 'Crossover', exact: true });
    await category.click();
    await page.getByRole('region', { name: 'Banners' }).getByRole('button').first().click();
    await page.getByRole('button', { name: 'How does this work?' }).first().click();
    const guide = page.locator('.gacha-guide-modal');
    await expect(guide.locator('.gacha-tutorial-progress')).toHaveText(/^Basics 1 \/ \d+$/);
    await expect(guide.getByText('Do you understand the basics', { exact: false })).toHaveCount(0);
    for (let i = 0; i < 20 && await guide.getByRole('button', { name: /^Next/ }).count(); i += 1) {
      await expect(guide).not.toContainText(/coming soon/i);
      await guide.getByRole('button', { name: /^Next/ }).click();
    }
    await expect(guide).not.toContainText(/coming soon/i);
    await expect(guide.getByRole('button', { name: /^Continue/ }), 'nothing to continue into').toHaveCount(0);
    await guide.getByRole('button', { name: 'Done' }).click();
    await expect(guide).toHaveCount(0);
  });
});

test.describe('/schedule calendar', () => {
  test('stays in the frame and does not move when an event opens (4.3 A)', async ({ page }) => {
    await page.goto('/schedule?view=calendar');
    const grid = page.locator('.timeline-month-large');
    const box = () => grid.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right) }; });
    const before = await box();
    const main = await page.locator('main').evaluate((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { left: Math.round(r.left + parseFloat(s.paddingLeft)), right: Math.round(r.right - parseFloat(s.paddingRight)) }; });
    expect(before, 'the grid fills main').toEqual(main);
    await page.locator('.schedule-bar').first().click();
    await expect(page.locator('.schedule-fullscreen-panel.open')).toBeVisible();
    await page.waitForTimeout(400);
    expect(await box(), 'opening an event moves nothing').toEqual(before);
  });
});
