import { expect, test, type Locator, type Page } from '@playwright/test';
import { readOnly } from './census-routes';

/*
 * Every × that closes or removes something is components/ui/XButton (ui-primitives rule
 * 21): no border and no box at rest, just the glyph, in a square hit area -- the
 * maintainer, 2026-09-27, on /pulls' goal rows: "remove the border around the x and make
 * it square, this should be default for 'X' buttons, so it just looks like an x but its
 * clickable even when not perfectly on the x symbol". Before, the site drew twenty of them
 * eleven ways: bordered 36x36, 37x36 and 40x40 boxes (/pulls' goal rows, the /gacha dialogs,
 * the planner's import dialog, the Stronghold sheet, the /music queue, the mini player),
 * 44px-wide and 61x46 glyph boxes, a 22x24 and a 28x28, a 17x18 span on the planner's tabs,
 * a literal "x" in mono 12px on the stage map, a 20x19 popover close with no name.
 *
 * audit:styles (xButton) finds a hand-written × in the source. This drives every place
 * that shows one and measures what is on screen: every visible × there -- an XButton, a
 * removable tab's ×, and any button whose content is a × glyph or whose name says Close,
 * Remove or Clear over a lone icon (the net for one written by hand) -- has no visible
 * border and no fill at rest, is square (±1px) and 24px or more, has a name, and is hit
 * by a press 8px from the glyph's centre in each direction; then the place's own × is
 * pressed 8px right of its glyph, and what it closes or removes must be gone. Box edges
 * only: the glyph is drawn, so its centre is the same in every font.
 *
 * Not driven: the /community world map's fullscreen ×, which shows only while an event is
 * running (the Check's data may have none: the test says so and skips that place).
 */

const firstLimited = (page: Page) => page.evaluate(() => {
  const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
  const names = Object.keys(odds);
  return names.find((n) => odds[n].type === 'limited') ?? names[0] ?? null;
});
const addOperator = async (page: Page, name = 'Penance') => {
  await page.getByPlaceholder('Search operators…').fill(name);
  await page.getByRole('option', { name: new RegExp(name) }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
};
const plannedOperator = async (page: Page) => {
  await addOperator(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
};
const experimental = async (page: Page) => {
  await page.getByRole('tab', { name: 'Experimental', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Experimental', exact: true })).toHaveAttribute('aria-selected', 'true');
};
const beginBase = async (page: Page) => {
  await page.locator('.base-setup-preset-card').first().click();
  await page.getByRole('button', { name: 'Begin Simulation' }).click();
  await expect(page.locator('.base-facility').first()).toBeVisible();
};
const builtFacility = (page: Page) => page.locator('.base-facility:not(.base-facility-unbuilt)').nth(2);

interface Place {
  id: string;
  route: string;
  /** Puts the place's × on screen. */
  open: (page: Page) => Promise<void>;
  /** The × this place presses. */
  x: (page: Page) => Locator;
  /** Holds once the press has closed or removed its thing. */
  gone: (page: Page) => Promise<void>;
  /** Some place's data is not always there (a running event); the reason it may skip. */
  mayBeAbsent?: string;
}

const PLACES: Place[] = [
  {
    id: '/pulls goal row', route: '/pulls',
    open: async (page) => { const banner = await firstLimited(page); expect(banner).toBeTruthy(); await page.goto(`/pulls?banner=${encodeURIComponent(banner!)}`); await expect(page.locator('article').first()).toBeVisible(); },
    x: (page) => page.getByRole('button', { name: /^Remove / }).first(),
    gone: async (page) => { await expect(page.getByRole('heading', { name: /Your banners 0/ })).toBeVisible(); },
  },
  {
    id: 'planner operator dialog', route: '/planner', open: (page) => addOperator(page),
    x: (page) => page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.getByRole('dialog')).toHaveCount(0); },
  },
  {
    id: 'planner operator tab', route: '/planner', open: plannedOperator,
    x: (page) => page.getByRole('tablist', { name: 'View materials for' }).locator('.tab-remove').first(),
    gone: async (page) => { await expect(page.getByRole('tablist', { name: 'View materials for' })).toHaveCount(0); },
  },
  {
    id: 'planner plan row', route: '/planner', open: async (page) => { await plannedOperator(page); await experimental(page); },
    x: (page) => page.getByRole('button', { name: /^Drop .* from the plan$/ }).first(),
    gone: async (page) => { await expect(page.getByRole('button', { name: /^Drop .* from the plan$/ })).toHaveCount(0); },
  },
  {
    id: 'planner build dialog', route: '/planner',
    open: async (page) => { await plannedOperator(page); await experimental(page); await page.getByRole('button', { name: 'Build', exact: true }).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); },
    x: (page) => page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.getByRole('dialog')).toHaveCount(0); },
  },
  {
    id: 'planner goal dialog', route: '/planner',
    open: async (page) => { await experimental(page); await page.getByRole('button', { name: /Add a goal/ }).first().click(); await expect(page.getByRole('dialog')).toBeVisible(); },
    x: (page) => page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.getByRole('dialog')).toHaveCount(0); },
  },
  {
    id: 'planner import dialog', route: '/planner',
    open: async (page) => { await experimental(page); await page.getByRole('button', { name: 'Export / import' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); },
    x: (page) => page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.getByRole('dialog')).toHaveCount(0); },
  },
  {
    id: '/gacha banner details', route: '/gacha',
    open: async (page) => { await page.getByRole('button', { name: 'Details', exact: true }).first().click(); await expect(page.locator('.gacha-details-modal')).toBeVisible(); },
    x: (page) => page.getByRole('button', { name: 'Close banner details' }),
    gone: async (page) => { await expect(page.locator('.gacha-details-modal')).toHaveCount(0); },
  },
  {
    id: '/gacha operator preview', route: '/gacha',
    open: async (page) => {
      await page.getByRole('button', { name: 'Details', exact: true }).first().click();
      await page.locator('.gacha-details-modal button.gacha-details-featured, .gacha-details-modal .gacha-details-name-list button').first().click();
      await expect(page.locator('.gacha-pull-preview-header')).toBeVisible();
    },
    x: (page) => page.getByRole('button', { name: 'Close operator preview' }),
    gone: async (page) => { await expect(page.locator('.gacha-pull-preview-header')).toHaveCount(0); },
  },
  {
    id: '/schedule event drawer', route: '/schedule',
    open: async (page) => { await page.getByRole('tab', { name: 'Calendar', exact: true }).click(); await page.locator('.schedule-bar').first().click(); await expect(page.locator('.schedule-fullscreen-panel.open')).toBeVisible(); },
    x: (page) => page.locator('.schedule-fullscreen-panel.open').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.locator('.schedule-fullscreen-panel.open')).toHaveCount(0); },
  },
  {
    id: 'Stronghold enemy sheet', route: '/gamemodes/stronghold-protocol',
    open: async (page) => { await page.getByRole('tab', { name: 'Enemies', exact: true }).first().click(); await page.locator('.gm-pool:visible').first().click(); await expect(page.locator('.gm-sheet')).toBeVisible(); },
    x: (page) => page.locator('.gm-sheet').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.locator('.gm-sheet')).toHaveCount(0); },
  },
  {
    id: 'Stronghold record', route: '/gamemodes/stronghold-protocol',
    open: async (page) => { await page.getByRole('tab', { name: 'Enemies', exact: true }).first().click(); await page.locator('.gm-row:visible').first().click(); await expect(page.locator('.gm-record')).toBeVisible(); },
    x: (page) => page.locator('.gm-record').getByRole('button', { name: /^Close/ }),
    gone: async (page) => { await expect(page.locator('.gm-record')).toHaveCount(0); },
  },
  {
    id: 'Stronghold Isomorph pairings', route: '/gamemodes/stronghold-protocol',
    open: async (page) => { await page.getByRole('tab', { name: 'Items', exact: true }).first().click(); await page.locator('.gm-isoopen').first().click(); await expect(page.locator('.gm-isorecord')).toBeVisible(); },
    x: (page) => page.locator('.gm-isorecord').getByRole('button', { name: 'Close', exact: true }),
    gone: async (page) => { await expect(page.locator('.gm-isorecord')).toHaveCount(0); },
  },
  {
    id: 'stage guesser tile details', route: '/games/stage-guesser',
    open: async (page) => {
      await page.getByRole('button', { name: 'Start guessing' }).click();
      await page.getByText('Map legend').first().click();
      await page.locator('button[class*="tileType"]').first().click();
      await expect(page.getByRole('button', { name: 'Close tile details' })).toBeVisible();
    },
    x: (page) => page.getByRole('button', { name: 'Close tile details' }),
    gone: async (page) => { await expect(page.getByRole('button', { name: 'Close tile details' })).toHaveCount(0); },
  },
  {
    id: 'stage map tile description', route: '/stages/browse?s=ta-1',
    open: async (page) => { await page.locator('g.stage-tile').nth(5).dispatchEvent('click'); await expect(page.locator('.stage-tile-pop')).toBeVisible(); },
    x: (page) => page.getByRole('button', { name: 'Close tile description' }),
    gone: async (page) => { await expect(page.locator('.stage-tile-pop')).toHaveCount(0); },
  },
  {
    id: '/base room popover', route: '/base',
    open: async (page) => { await beginBase(page); await builtFacility(page).click(); await expect(page.locator('.base-popover-close')).toBeVisible(); },
    x: (page) => page.locator('.base-popover-close'),
    gone: async (page) => { await expect(page.locator('.base-popover-close')).toHaveCount(0); },
  },
  {
    id: '/base room team', route: '/base',
    open: async (page) => { await beginBase(page); await builtFacility(page).click(); await page.locator('.base-slot').first().click(); await page.locator('.base-room-card').first().click(); await expect(page.getByRole('button', { name: /^Remove / }).first()).toBeVisible(); },
    x: (page) => page.locator('.base-room-team-x').first(),
    gone: async (page) => { await expect(page.locator('.base-room-team-x')).toHaveCount(0); },
  },
  {
    id: '/music queue', route: '/music',
    open: async (page) => { await expect(page.locator('.music-queue-row').nth(1)).toBeVisible(); },
    // The first row is the playing track, whose remove is disabled.
    x: (page) => page.locator('.music-queue-row').nth(1).getByRole('button', { name: 'Remove', exact: true }),
    gone: async () => {},
  },
  {
    id: 'a search field\'s clear', route: '/operators',
    open: async (page) => { await page.locator('#page-content .search-input').first().fill('am'); },
    x: (page) => page.getByRole('button', { name: /^Clear / }).first(),
    gone: async (page) => { await expect(page.locator('#page-content .search-input').first()).toHaveValue(''); },
  },
  {
    id: 'the mini player', route: '/operators',
    open: async (page) => { await page.getByRole('button', { name: 'Expand player' }).click(); await expect(page.getByRole('button', { name: 'Collapse player' })).toBeVisible(); },
    x: (page) => page.getByRole('button', { name: 'Collapse player' }),
    gone: async (page) => { await expect(page.getByRole('button', { name: 'Expand player' })).toBeVisible(); },
  },
  {
    id: '/community world map', route: '/community', mayBeAbsent: 'the map shows only while a community event is running',
    open: async (page) => { await page.getByRole('button', { name: 'View fullscreen' }).click(); },
    x: (page) => page.getByRole('button', { name: 'Exit fullscreen' }),
    gone: async (page) => { await expect(page.getByRole('button', { name: 'View fullscreen' })).toBeVisible(); },
  },
];

/** Every × on screen, measured: see the header. */
function measure() {
  const GLYPH = /^[×✕✖✗xX]$/;
  const NAMED = /^(close|remove|drop|clear|dismiss|exit|collapse)\b/i;
  const clear = (colour: string) => colour === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(colour);
  const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: true }); };
  const xs = Array.from(document.querySelectorAll('button, [role="button"], .tab-remove')).filter(shown).filter((el) => {
    const text = (el.textContent ?? '').trim();
    const iconOnly = !text && el.children.length === 1 && el.firstElementChild!.matches('svg');
    return el.matches('.btn-x, .tab-remove') || GLYPH.test(text) || (iconOnly && NAMED.test(el.getAttribute('aria-label') ?? ''));
  });
  // On screen: wholly inside the viewport and every box that clips it (a × on the last
  // row of a scrolled list is half hidden), and not under a dialog that has opened over it
  // (the plan rows behind the build dialog). A × its own centre does not reach for any
  // other reason is measured, and fails.
  const inside = (r: DOMRect, c: { top: number; left: number; bottom: number; right: number }) => r.top >= c.top - 0.5 && r.left >= c.left - 0.5 && r.bottom <= c.bottom + 0.5 && r.right <= c.right + 0.5;
  const onScreen = xs.filter((el) => {
    const r = el.getBoundingClientRect();
    if (!inside(r, { top: 0, left: 0, bottom: innerHeight, right: innerWidth })) return false;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const o = getComputedStyle(node);
      if (/(auto|scroll|hidden|clip)/.test(o.overflowX + o.overflowY) && !inside(r, node.getBoundingClientRect())) return false;
    }
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el.contains(top) || !top?.closest('[role="dialog"], dialog, .modal-overlay');
  });
  return onScreen.map((el) => {
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const glyph = (el.querySelector('svg') ?? el).getBoundingClientRect();
    const cx = glyph.left + glyph.width / 2;
    const cy = glyph.top + glyph.height / 2;
    const misses = [[-8, 0], [8, 0], [0, -8], [0, 8]].filter(([dx, dy]) => !el.contains(document.elementFromPoint(cx + dx, cy + dy))).map(([dx, dy]) => `${dx},${dy}`);
    const bordered = ['top', 'right', 'bottom', 'left'].filter((side) => parseFloat(s.getPropertyValue(`border-${side}-width`)) > 0 && !clear(s.getPropertyValue(`border-${side}-color`)));
    const cls = typeof el.className === 'string' ? el.className : '';
    return {
      what: `${el.tagName.toLowerCase()}${cls ? `.${cls.trim().split(/\s+/).join('.')}` : ''} "${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim()}"`,
      primitive: el.matches('.btn-x, .tab-remove'),
      named: el.matches('.tab-remove') || !!(el.getAttribute('aria-label') ?? '').trim(),
      bordered, fill: !clear(s.backgroundColor) || s.backgroundImage !== 'none',
      // Every place here opens by pointer, so a × drawn in the focus ring is a box round
      // the glyph that the reader never asked for: the planner's operator dialog focused
      // its × on open, and Chromium carries :focus-visible from the Simple search's field.
      ringed: el.matches(':focus-visible'),
      w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10, misses,
    };
  });
}

for (const place of PLACES) {
  test(`every × is borderless and square, and a press off its glyph lands: ${place.id}`, async ({ page }, info) => {
    await readOnly(page);
    await page.goto(place.route);
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    if (place.mayBeAbsent && await place.x(page).count() === 0 && await page.getByRole('button', { name: 'View fullscreen' }).count() === 0) {
      test.skip(true, `${place.id}: ${place.mayBeAbsent}, and none is running in this build`);
    }
    await place.open(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    const target = place.x(page);
    await expect(target, `${place.id} shows its ×`).toBeVisible();
    await target.scrollIntoViewIfNeeded();

    const xs = await page.evaluate(measure);
    expect(xs.length, `${place.id}: a × on screen`).toBeGreaterThan(0);
    for (const x of xs) {
      expect(x.primitive, `${x.what} is the XButton (.btn-x) or a removable tab's ×`).toBe(true);
      expect(x.named, `${x.what} has a name`).toBe(true);
      expect(x.bordered, `${x.what} draws no border`).toEqual([]);
      expect(x.fill, `${x.what} has no fill at rest`).toBe(false);
      expect(x.ringed, `${x.what} opens outside the focus ring (its place was opened by pointer)`).toBe(false);
      expect(Math.abs(x.w - x.h), `${x.what} is square (${x.w}x${x.h})`).toBeLessThanOrEqual(1);
      expect(Math.min(x.w, x.h), `${x.what} is 24px or more`).toBeGreaterThanOrEqual(24);
      expect(x.misses, `${x.what}: points 8px from the glyph's centre that miss it`).toEqual([]);
    }

    // Hover shows the hit area (a pointer only).
    if (info.project.name === 'desktop') {
      await target.hover();
      await expect.poll(() => target.evaluate((el) => getComputedStyle(el).backgroundColor), { message: `${place.id}: the hovered × fills its square` }).not.toMatch(/rgba\([^)]*,\s*0\)$|^transparent$/);
    }
    // Pressed 8px right of the glyph, it still does its job.
    const glyph = await target.evaluate((el) => { const r = (el.querySelector('svg') ?? el).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const before = place.id === '/music queue' ? await page.locator('.music-queue-row').nth(1).locator('.music-queue-row-title').textContent() : null;
    await page.mouse.click(glyph.x + 8, glyph.y);
    // The queue keeps its row count (a placeholder takes the place), so the removed track
    // is gone when the row holds another.
    if (before !== null) await expect(page.locator('.music-queue-row').nth(1).locator('.music-queue-row-title')).not.toHaveText(before);
    await place.gone(page);
  });
}

/*
 * The planner's operator dialog opens from the Simple search, a text field, and takes focus
 * on itself rather than on its ×: Chromium carries :focus-visible from a field to whatever a
 * script focuses next, so the × opened in the teal focus ring for a reader who had clicked.
 * The keyboard path still reaches the ×, and the dialog still holds Tab: Shift+Tab from the
 * box itself goes to the dialog's last control, not to the page behind the overlay.
 */
test("the planner's operator dialog opens on itself, and Tab still reaches its × and stays inside", async ({ page }) => {
  await readOnly(page);
  await page.goto('/planner');
  const search = page.getByPlaceholder('Search operators…');
  await search.fill('Penance');
  await expect(page.getByRole('option', { name: /Penance/ }).first()).toBeVisible();
  await search.press('ArrowDown');
  await search.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('role')), { message: 'focus is on the dialog' }).toBe('dialog');
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await page.keyboard.press('Tab');
  await expect(close, 'the first Tab reaches the ×').toBeFocused();
  expect(await close.evaluate((el) => el.matches(':focus-visible')), 'a keyboard reader sees the ring on it').toBe(true);
  await dialog.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), 'Shift+Tab from the box stays in the dialog').toBe(true);
});
