import { expect, test, type Locator, type Page } from '@playwright/test';
import { fontsSettled, openPullableSimulator, PLANNER_PLAN, plannerExperimental, readOnly, type PlannerStorage } from './census-routes';

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
 *   r10    the planner's shortfall said "None of these can be made at the bench" over a
 *          short Dualchip (a Factory recipe) beside a Farming route disabled for no
 *          stated reason; its depot tiles' names ran over their steppers.
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

test.describe("/polls/power-scale", () => {
  test.use(PHONE);

  test('Detailed keeps the page inside a phone (GE-02)', async ({ page }) => {
    await page.goto("/polls/power-scale");
    await page.getByRole('button', { name: 'Detailed', exact: true }).click();
    await expect(page.locator('.stats-table')).toBeVisible();
    expect(await pageWidthOverflow(page), 'the table scrolls in its own box, not the page').toBeLessThanOrEqual(1);
  });

  test('Compact fits five operators per row on a phone', async ({ page }) => {
    await page.goto("/polls/power-scale");
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
    await page.goto("/polls/power-scale");
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
    // Every total on the tab: the All summary's compact tiles and a store's totals alike.
    const totals = page.locator('.reward-summary-tile, .event-reward-total');
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
        // Natural section spacing is content too: a taller outfit inventory exposes
        // the section's bottom margin, which is not empty space added by the hold.
        const content = last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom || '0')
          - el.getBoundingClientRect().top;
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

test.describe('/planner operators', () => {
  const STATE = { elite: 2, level: 1, skillLevel: 7, masteryTargets: {}, moduleStageTargets: {}, startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {} };

  test('a CN record can be found, says CN, and is added to the plan', async ({ page }) => {
    // After the switch on 2026-09-30 the planner kept Global-released operators alone, and
    // nineteen CN operators could not be added (plannerOperators).
    await page.goto("/operator-planner");
    // Not on Global yet by the page's own release markers (plannerOperators).
    const cn = await page.evaluate(() => {
      const ops = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { operators: { name: string; releasedAt?: number | null; isFuture?: true }[] } } } }).__NEXT_DATA__.props.pageProps.operators;
      return ops.filter((op) => (op.releasedAt != null && op.releasedAt > Date.now()) || (op.releasedAt === null && op.isFuture)).map((op) => op.name);
    });
    expect(cn.length, 'the planner carries operators not on Global yet').toBeGreaterThan(0);
    const search = page.getByPlaceholder('Search operators…');
    await search.fill(cn[0]);
    const option = page.getByRole('option').filter({ hasText: cn[0] }).first();
    await expect(option, `${cn[0]} is offered`).toBeVisible();
    await expect(option).toContainText('CN');
    await option.click();
    await expect(page.getByRole('tab', { name: new RegExp(cn[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }), `${cn[0]} is in the plan`).toBeVisible();
  });

  test('a plan made before an import starts where the imported roster says', async ({ page }) => {
    // Planned from E0 L1, then a game import recorded E2 L60: the plan kept saying "Current
    // Level Lv. 1" and pricing from there until the level slider was nudged (2026-10-01).
    await page.addInitScript(() => {
      try {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem('plannerState', JSON.stringify({ selectedNames: ['Surtr'], builderStates: { Surtr: { elite: 2, level: 90, skillLevel: 7, masteryTargets: {}, moduleStageTargets: {},
          startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {} } } }));
        localStorage.setItem('plannerRoster', JSON.stringify({ Surtr: { elite: 2, level: 60, skillLevel: 7, masteries: {} } }));
      } catch { /* none */ }
    });
    await page.goto("/operator-planner");
    await page.getByRole('tab', { name: /Surtr/ }).first().click();
    const current = page.locator('.simple-state-link').first();
    await expect(current).toContainText('Lv. 60');
    // And it stays put: what the page saved starts there too.
    await page.reload();
    await page.getByRole('tab', { name: /Surtr/ }).first().click();
    await expect(page.locator('.simple-state-link').first()).toContainText('Lv. 60');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('plannerState')!).builderStates.Surtr.startingLevel)).toBe(60);
  });

  test("a planned operator's portrait starts at the top of its frame", async ({ page }) => {
    // Enlarged from its centre, tall art lost its head (Executor, 2026-10-01).
    await page.addInitScript((state) => { try { localStorage.setItem('plannerState', state); } catch {} }, JSON.stringify({ selectedNames: ['Executor'], builderStates: { Executor: STATE } }));
    await page.goto("/operator-planner");
    await page.getByRole('tab', { name: /Executor/ }).first().click();
    const portrait = page.locator('.simple-portrait').first();
    await expect(portrait.locator('img')).toBeVisible();
    const { frameTop, imgTop } = await portrait.evaluate((el) => ({ frameTop: el.getBoundingClientRect().top, imgTop: el.querySelector('img')!.getBoundingClientRect().top }));
    expect(imgTop, 'the image is not enlarged up past the frame').toBeGreaterThanOrEqual(frameTop - 1);
  });
});

test.describe('home', () => {
  test('every event slide has one shape: the name, then the countdown on its own line', async ({ browser }) => {
    // A wrapping row put the countdown beside a short name ("Duel Channel: Ivy Vine") and
    // under a long one, so the panel changed height as the carousel turned (2026-09-30).
    for (const use of [{ viewport: { width: 1440, height: 900 } }, PHONE]) {
      const context = await browser.newContext(use);
      const page = await context.newPage();
      await page.goto('/');
      await expect(page.locator('.front-events-info')).toBeVisible();
      const dots = page.locator('.front-events-dots button');
      const slides = Math.max(await dots.count(), 1);
      const shapes: { name: string; height: number; below: boolean }[] = [];
      for (let i = 0; i < slides; i++) {
        if (slides > 1) await dots.nth(i).click();
        await page.waitForTimeout(150);
        if (slides > 1) {
          await expect(page.locator('.front-events-dot[aria-current="true"]')).toHaveCount(1);
          const colours = await dots.evaluateAll((buttons) => buttons.map((button) => {
            const swatch = document.createElement('span');
            swatch.style.color = button.getAttribute('aria-current') === 'true' ? 'var(--teal)' : 'var(--text-dim)';
            button.appendChild(swatch);
            const expected = getComputedStyle(swatch).color;
            swatch.remove();
            return { actual: getComputedStyle(button, '::before').backgroundColor, expected };
          }));
          for (const colour of colours) expect(colour.actual).toBe(colour.expected);
        }
        shapes.push(await page.locator('.front-events-info').evaluate((el) => {
          const name = el.querySelector('.front-events-name')!, timer = el.querySelector('.countdown-timer')!;
          return { name: name.textContent ?? '', height: el.getBoundingClientRect().height, below: timer.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 0.5 };
        }));
      }
      for (const shape of shapes) expect(shape.below, `${shape.name}: the countdown sits under the name at ${use.viewport.width}`).toBe(true);
      expect(new Set(shapes.map((shape) => Math.round(shape.height))).size, `one height for every slide at ${use.viewport.width}: ${JSON.stringify(shapes)}`).toBe(1);
      await context.close();
    }
  });

  test('the skins row scrolls by hand, with nothing moving on its own (GE-09)', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('.front-skins-panel');
    await expect(panel).toBeVisible();
    const state = await panel.evaluate((el) => {
      // r11 quiet polish: a skin's picture fades in once as it arrives (img-arrive, rule 23:
      // one 0.3s opacity fade, then its mark comes off). That is not the row moving on its
      // own, so it alone is set aside, and only while it is that one finite fade; any other
      // animation here, a marquee above all, still counts.
      const arriving = (node: Element) => node instanceof HTMLImageElement && getComputedStyle(node).animationName === 'img-arrive'
        && node.getAnimations().every((a) => a.effect?.getComputedTiming().iterations === 1);
      const animated = Array.from(el.querySelectorAll('*')).filter((node) => getComputedStyle(node).animationName !== 'none' && !arriving(node));
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
  await page.getByRole('button', { name: 'View base', exact: true }).click();
  await expect(page.locator('.base-overview-room-name').first()).toBeVisible();
}

test.describe('/base', () => {
  test.describe('at 390', () => {
    test.use(PHONE);
    test('the simulation keeps the page inside a phone (GE-02)', async ({ page }) => {
      await simulateBase(page);
      expect(await pageWidthOverflow(page), 'the summary rows wrap instead of widening the page').toBeLessThanOrEqual(1);
    });

    test('each facility has a directly reachable touch target (4.3 H)', async ({ page }) => {
      await simulateBase(page);
      const sizes = await page.locator('.base-overview-room').evaluateAll((buttons) =>
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
      for (const label of Array.from(document.querySelectorAll('.base-overview-room-name'))) {
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

test.describe("/gacha-simulator", () => {
  for (const width of [{ key: '1440', use: { viewport: { width: 1440, height: 900 } } }, { key: '390', use: PHONE }]) {
    test.describe(`at ${width.key}`, () => {
      test.use(width.use);
      test('Reset at the bottom of the page does not move the reader (Anti-Page Jump)', async ({ page }) => {
        await openPullableSimulator(page);
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

      test('scrolling up after closing the history from the foot of the page is never pulled back', async ({ page }) => {
        // Closing it from the bottom and wheeling up put the reader back where they closed it
        // every second step, 1017 -> 717 -> 417 -> 1017 at 1440: useHeightFloor kept the press
        // reading from the close, and when the released spacer came out the container's
        // collapsed margin read as a shrink, which restored that reading.
        await openPullableSimulator(page);
        const ten = page.getByRole('button', { name: 'Pull ten operators' });
        for (let i = 0; i < 5; i += 1) { await ten.click(); await page.waitForTimeout(400); }
        const toggle = page.getByRole('button', { name: /Pull history/ });
        await toggle.click();
        await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
        await page.waitForTimeout(400);
        await toggle.click();
        await page.waitForTimeout(700);
        const ys = [await page.evaluate(() => Math.round(window.scrollY))];
        expect(ys[0], 'the history closed from low on the page').toBeGreaterThan(600);
        for (let i = 0; i < 25 && ys[ys.length - 1] > 0; i += 1) {
          await page.mouse.move(200, 400);
          await page.mouse.wheel(0, -300);
          // wheel() dispatches input before the compositor applies it. Observe this
          // step first, then keep the stability sample that catches a delayed pullback.
          await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeLessThan(ys[ys.length - 1]);
          await page.waitForTimeout(300);
          ys.push(await page.evaluate(() => Math.round(window.scrollY)));
        }
        for (let i = 1; i < ys.length; i += 1) expect(ys[i], `scrollY per wheel step up: ${ys.join(' -> ')}`).toBeLessThan(ys[i - 1]);
        expect(ys[ys.length - 1], `the reader reaches the top: ${ys.join(' -> ')}`).toBe(0);
      });
    });
  }

  test('pull tiles and featured rates take their colour from the rarity tokens (4.3 G)', async ({ page }) => {
    await openPullableSimulator(page);
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
    await page.goto("/gacha-simulator");
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

/*
 * The planner's shortfall foot (r10, 2026-09-27). With only a Guard Dualchip short -- a
 * Factory recipe the planner does not follow, and no stage drops it -- the sentence under
 * the cards said "None of these can be made at the bench, so every one of them is a run or
 * a shop." beside a card saying "Factory recipe", and the Farming route chip sat there
 * disabled with no reason given. The plan: Surtr from E1 Lv80 to E2, with the depot holding
 * everything the promotion takes except the Dualchips.
 */
const DUALCHIP_ONLY: PlannerStorage = {
  plannerState: {
    selectedNames: ['Surtr'],
    builderStates: { Surtr: { elite: 2, level: 1, skillLevel: 7, masteryTargets: {}, moduleStageTargets: {}, startingElite: 1, startingLevel: 80, startingSkillLevel: 7, startingMasteryLevels: {}, startingModuleStages: {} } },
  },
  plannerRoster: { Surtr: { elite: 1, level: 80, skillLevel: 7, masteries: {} } },
  plannerDepot: { LMD: 5000000, 'Polymerization Preparation': 20, 'Keton Colloid': 20, 'Strategic Battle Record': 500 },
};

test.describe('/planner shortfall (r10)', () => {
  test('a short Dualchip is made in the Factory, and no idle Farming route is offered', async ({ page }) => {
    test.setTimeout(60000);
    /* Nowhere in the planner's panels is a control disabled without a stated reason: one
       that cannot act in the state on screen is not shown (Show all, the farming route), or
       says why on hover (Clear with nothing to clear). */
    const silentlyDisabled = () => page.evaluate(() => Array.from(document.querySelectorAll('.plan-panel button, .plan-panel input'))
      .filter((b) => (b as HTMLButtonElement).disabled && !b.getAttribute('title'))
      .map((b) => (b.textContent ?? '').trim()));
    await readOnly(page);
    await page.goto("/operator-planner");
    await plannerExperimental(page, DUALCHIP_ONLY);
    const panel = page.locator('.plan-panel').filter({ has: page.getByRole('heading', { name: 'Still needed' }) });
    await expect(panel.locator('.need-card'), 'only the Dualchip is short').toHaveCount(1);
    await expect(panel.locator('.need-card')).toContainText('Guard Dualchip');
    // Soft, so a run on the old page reports every one of these, not the first.
    const foot = panel.locator('.plan-panel-foot');
    await expect.soft(foot).toContainText('Guard Dualchip is made in the Factory');
    await expect.soft(foot).not.toContainText('None of these can be made at the bench');
    await expect.soft(foot.getByRole('button'), 'a farming route with nothing to farm is not offered').toHaveCount(0);
    expect.soft(await silentlyDisabled(), 'disabled controls with no reason').toEqual([]);

    // With farmables short, the route is there and it works.
    await plannerExperimental(page, PLANNER_PLAN);
    const route = panel.locator('.plan-panel-foot').getByRole('button', { name: 'Farming route', exact: true });
    await expect(route).toBeEnabled();
    await route.click();
    await expect(panel.locator('.planner-need-stages')).toBeVisible();
    expect(await silentlyDisabled(), 'disabled controls with no reason').toEqual([]);
  });

  /* The depot's tiles hold a name beside a control-height stepper. At the old 206px
     minimum a name had 40-70px, and "Data Supplement Instrument", "Concentrated Power
     Unit" or "Transmuted Salt Agglomerate" ran over the stepper's box, and on a phone
     (a 164px stepper of touch targets) "Polymerization" did in CI's Linux fonts. Every
     tile, at 1440, 1024, 860 (three columns near their minimum), 390 and 360: the name's
     glyph boxes end before its stepper starts, on its line or the line under it. */
  test('a depot tile\'s name never runs into its stepper', async ({ page }) => {
    await readOnly(page);
    await page.goto("/operator-planner");
    await plannerExperimental(page, PLANNER_PLAN);
    await page.getByRole('button', { name: 'Open depot', exact: true }).click();
    await expect(page.locator('.depot-tile').first()).toBeVisible();
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 1024, height: 900 }, { width: 860, height: 900 }, PHONE.viewport, { width: 360, height: 780 }]) {
      await page.setViewportSize(viewport);
      await fontsSettled(page);
      const overlaps = await page.locator('.depot-grid').first().evaluate(() => Array.from(document.querySelectorAll('.depot-tile')).flatMap((tile) => {
        const name = tile.querySelector('.name')!;
        const label = (name.firstChild?.textContent ?? '').trim();
        const stepper = tile.querySelector('.depot-stepper')!.getBoundingClientRect();
        const edge = tile.getBoundingClientRect().right - parseFloat(getComputedStyle(tile).paddingRight);
        const range = document.createRange();
        range.selectNodeContents(name);
        return Array.from(range.getClientRects()).filter((r) => r.width > 0).flatMap((r) => {
          if (r.right > edge + 1) return [`${label}: ${Math.round((r.right - edge) * 10) / 10}px past its tile`];
          const into = Math.min(r.right, stepper.right) - Math.max(r.left, stepper.left);
          const sameLine = Math.min(r.bottom, stepper.bottom) - Math.max(r.top, stepper.top) > 0;
          return sameLine && into > 0 ? [`${label}: ${Math.round(into * 10) / 10}px over its stepper`] : [];
        });
      }));
      expect(overlaps, `names over their steppers at ${viewport.width}px`).toEqual([]);
    }
  });
});

/* "the base so it only uses operators you actually have (you can still manually add operators
   you don't have or adjust the level of operators you have for the base for future planning)"
   (maintainer, 2026-10-01): with an import, a room's picker lists the account's operators,
   placed at the elite the planner's roster has them at, and "Not owned too" adds the rest. */
test('with an import, the base room picker offers the owned operators at their own elite', async ({ page }) => {
  await page.goto('/base');
  await page.evaluate(() => {
    localStorage.setItem('arkpediaAccount', JSON.stringify({ version: 1, server: 'en', importedAt: '2026-10-01T12:00:00.000Z', doctor: null,
      operators: ['Texas', 'Lappland', 'Exusiai', 'Proviso'], skins: [], cleared: [] }));
    const owned = (elite: number) => ({ elite, level: 1, skillLevel: 1, masteries: {} });
    localStorage.setItem('plannerRoster', JSON.stringify({ Texas: owned(1), Lappland: owned(2), Exusiai: owned(0), Proviso: owned(2) }));
  });
  await page.reload();
  await page.locator('.base-setup-preset-card').first().click();
  await page.getByRole('button', { name: 'View base', exact: true }).click();
  await page.locator('.base-overview-room').nth(2).click();
  await expect(page.getByRole('button', { name: 'Your elite', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const names = await page.locator('.base-room-card .base-room-card-name').allTextContents();
  expect(names.sort()).toEqual(['Exusiai', 'Lappland', 'Proviso', 'Texas']);
  // Texas is at Elite 1 in the roster, so that is where she lands.
  await page.locator('.base-room-card', { hasText: 'Texas' }).click();
  await expect(page.locator('.base-room-card', { hasText: 'Texas' }).locator('.base-room-card-number')).toHaveText(/E1$/);
  // Planning ahead: the rest of the roster, each marked as not owned.
  await page.getByRole('button', { name: 'Not owned too', exact: true }).click();
  expect(await page.locator('.base-room-card').count()).toBeGreaterThan(50);
  await expect(page.locator('.base-room-card', { hasText: 'Amiya' }).first().locator('.base-op-unowned-tag')).toHaveText('Not owned');
});
