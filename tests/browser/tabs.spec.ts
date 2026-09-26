import { expect, test, type Locator, type Page } from '@playwright/test';
import { tabAlign } from './tab-align';

/*
 * components/ui/Tabs: the site's one tab strip (docs/development/ui-primitives.md,
 * "Tabs"). Before r9 no page rendered role="tablist": the eleven real tab groups were
 * SegmentedControl chips or buttons of their own, in four looks, and the .tabs / .tab
 * primitive sat unused in arkpedia-theme.css.
 *
 * This holds the component to a real tablist (roles, aria-selected, aria-controls
 * naming a rendered role="tabpanel", a roving tabindex, Left/Right/Home/End), rendered
 * by the server as it hydrates, holds the planner's removable tabs to Delete, holds
 * every tab strip to the Anti-Page Jump rule, and runs the tab-alignment census
 * (tab-align.ts) on the states a plain page load does not reach -- page-bounds.spec.ts
 * runs it on every route.
 */

const PEOPLE = '/events/%5BSide%20Story%5D%20People%2C%20A%20People';

/** Every tab in a strip, with what the keyboard and a screen reader need. */
async function strip(list: Locator) {
  return list.evaluate((el) => Array.from(el.querySelectorAll(':scope > [role="tab"]')).map((tab) => {
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    return {
      name: (tab.getAttribute('aria-label') || tab.textContent || '').trim(),
      id: tab.id,
      selected: tab.getAttribute('aria-selected'),
      tabindex: tab.getAttribute('tabindex'),
      focused: document.activeElement === tab,
      panel: panel ? { role: panel.getAttribute('role'), labelledby: panel.getAttribute('aria-labelledby'), shown: !panel.hidden && panel.getClientRects().length > 0 } : null,
    };
  }));
}

test('a tab strip is a real tablist, and the keyboard moves along it', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error' && /hydrat|did not match/i.test(msg.text())) errors.push(msg.text()); });
  await page.goto('/gamemodes/stronghold-protocol');
  const list = page.getByRole('tablist', { name: 'Sections' });
  await expect(list).toBeVisible();
  const tabs = list.getByRole('tab');
  await expect(tabs).toHaveCount(7);

  let state = await strip(list);
  // One selected, one Tab stop, and it is the selected one.
  expect(state.filter((t) => t.selected === 'true').map((t) => t.name)).toEqual(['Operators']);
  expect(state.filter((t) => t.tabindex === '0').map((t) => t.name)).toEqual(['Operators']);
  expect(state.filter((t) => t.tabindex === '-1')).toHaveLength(6);
  // Each tab names a panel, and the one shown names its tab back.
  for (const t of state) expect(t.panel, `${t.name} controls a rendered panel`).not.toBeNull();
  const shown = state.filter((t) => t.panel?.shown);
  expect(shown.map((t) => t.name)).toEqual(['Operators']);
  expect(shown[0].panel).toMatchObject({ role: 'tabpanel', labelledby: shown[0].id });

  // Right moves and selects; the panel follows.
  await tabs.first().focus();
  await page.keyboard.press('ArrowRight');
  state = await strip(list);
  expect(state.find((t) => t.focused)?.name).toBe('Alliances');
  expect(state.find((t) => t.selected === 'true')?.name).toBe('Alliances');
  expect(state.find((t) => t.panel?.shown)?.name).toBe('Alliances');
  expect(state.filter((t) => t.tabindex === '0').map((t) => t.name)).toEqual(['Alliances']);
  // End, then Right wraps to the first; Left wraps to the last; Home.
  await page.keyboard.press('End');
  expect((await strip(list)).find((t) => t.focused)?.name).toBe('Bounties');
  await page.keyboard.press('ArrowRight');
  expect((await strip(list)).find((t) => t.selected === 'true')?.name).toBe('Operators');
  await page.keyboard.press('ArrowLeft');
  expect((await strip(list)).find((t) => t.selected === 'true')?.name).toBe('Bounties');
  await page.keyboard.press('Home');
  state = await strip(list);
  expect(state.find((t) => t.focused)?.name).toBe('Operators');
  expect(state.find((t) => t.selected === 'true')?.name).toBe('Operators');
  // The strip is one Tab stop: Tab leaves it.
  await page.keyboard.press('Tab');
  expect(await list.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  // A click selects too.
  await tabs.nth(3).click();
  expect((await strip(list)).find((t) => t.selected === 'true')?.name).toBe('Items');
  expect(errors, 'no hydration mismatch').toEqual([]);
});

test('the server renders the tablist the browser hydrates', async ({ page }) => {
  for (const route of ['/gamemodes/stronghold-protocol', '/schedule', '/recruitment', '/planner']) {
    const html = await (await page.request.get(route)).text();
    expect(html, `${route}: role="tablist" in the server HTML`).toMatch(/role="tablist"/);
    expect(html, `${route}: a selected tab in the server HTML`).toMatch(/role="tab"[^>]*aria-selected="true"|aria-selected="true"[^>]*role="tab"/);
    expect(html).toMatch(/aria-controls="[^"]+-panel-[^"]*"/);
  }
});

test('the planner\'s operator tabs are removed with Delete or their ×', async ({ page }) => {
  await page.goto('/planner');
  for (const name of ['Penance', 'Surtr']) {
    await page.getByPlaceholder('Search operators…').fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const list = page.getByRole('tablist', { name: 'View materials for' });
  await expect(list.getByRole('tab')).toHaveCount(3);
  const penance = list.getByRole('tab', { name: /Penance/ });
  await expect(penance).toHaveAttribute('aria-keyshortcuts', /Delete/);
  await expect(list.getByRole('tab', { name: 'All', exact: true })).not.toHaveAttribute('aria-keyshortcuts', /.+/);
  // Delete on the focused tab removes it; focus stays in the strip.
  await penance.click();
  await expect(penance).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Delete');
  await expect(list.getByRole('tab')).toHaveCount(2);
  expect(await list.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  // The × removes without selecting.
  await list.getByRole('tab', { name: /Surtr/ }).locator('.tab-remove').click();
  await expect(page.getByRole('tablist', { name: 'View materials for' })).toHaveCount(0);
});

/* --- Anti-Page Jump: switching a tab never shortens the page under the reader --------- */

interface Place { name: string; route: string; open?: (page: Page) => Promise<void> }
const openPreview = async (page: Page) => {
  await page.getByRole('button', { name: 'Details', exact: true }).first().click();
  await page.locator('.gacha-details-modal button.gacha-details-featured, .gacha-details-modal .gacha-details-name-list button').first().click();
  await expect(page.getByRole('tablist', { name: 'Skill' })).toBeVisible({ timeout: 15000 });
};
const addOperator = async (page: Page) => {
  await page.getByPlaceholder('Search operators…').fill('Penance');
  await page.getByRole('option', { name: /Penance/ }).first().click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('tablist', { name: 'View materials for' })).toBeVisible();
};
const PLACES: Place[] = [
  { name: 'Sections', route: '/gamemodes/stronghold-protocol' },
  { name: 'Event sections', route: PEOPLE },
  { name: 'Reward store', route: PEOPLE, open: async (page) => { await page.getByRole('tablist', { name: 'Event sections' }).getByRole('tab', { name: 'Rewards' }).click(); } },
  { name: 'Show', route: '/enemies' },
  { name: 'Skill', route: '/operators/Amiya' },
  { name: 'Recruitment view', route: '/recruitment' },
  { name: 'Planner mode', route: '/planner' },
  { name: 'View materials for', route: '/planner', open: addOperator },
  { name: 'Schedule view', route: '/schedule' },
  { name: 'Skill', route: '/gacha', open: openPreview },
  { name: 'Module', route: '/gacha', open: openPreview },
];

for (const place of PLACES) {
  test(`switching "${place.name}" on ${decodeURIComponent(place.route)} never moves the strip`, async ({ page }) => {
    await page.goto(place.route);
    if (place.open) await place.open(page);
    const list = page.getByRole('tablist', { name: place.name }).first();
    await expect(list).toBeVisible();
    const tabs = list.locator(':scope > [role="tab"]:not([disabled])');
    const n = await tabs.count();
    test.skip(n < 2, 'one tab: nothing to switch');
    // Where the reader is most exposed: the strip at the top of the screen, as far down
    // the page as that allows (a pinned strip stays there at the very foot of the page).
    // scrollIntoView reaches a strip inside its own scroller too (the operator page's
    // detail pane at 1440, the gacha preview's dialog).
    await list.evaluate((el) => {
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      const nav = document.querySelector('.site-nav')?.getBoundingClientRect().bottom ?? 0;
      if (el.getBoundingClientRect().top < nav + 8) window.scrollBy({ top: el.getBoundingClientRect().top - nav - 8, behavior: 'instant' });
      if (getComputedStyle(el.closest('.gm-lookup') ?? el).position === 'sticky') window.scrollTo({ top: 1e6, behavior: 'instant' });
    });
    await page.waitForTimeout(900);
    // A strip pinned by position: sticky rides its section and cannot stay on screen once
    // the section under it is shorter (the arkpedia-ui skill: padding is not content a
    // sticky element can travel through), so for it the measure is the reader's place.
    const sticky = await list.evaluate((el) => getComputedStyle(el.closest('.gm-lookup') ?? el).position === 'sticky');
    const moves: string[] = [];
    const order = [...Array.from({ length: n }, (_, i) => i), 0];
    for (const i of order) {
      const tab = tabs.nth(i);
      const label = ((await tab.getAttribute('aria-label')) || (await tab.textContent()) || '').trim();
      const before = await list.evaluate((el) => ({ y: el.getBoundingClientRect().top, scroll: window.scrollY }));
      // A press where the reader sees it: no scrolling into view first.
      await tab.dispatchEvent('click');
      await page.waitForTimeout(700);
      const after = await list.evaluate((el) => ({ y: el.getBoundingClientRect().top, scroll: window.scrollY }));
      const moved = sticky ? after.scroll - before.scroll : after.y - before.y;
      if (Math.abs(moved) >= 4) moves.push(`${label}: the strip moved ${Math.round(after.y - before.y)}px (scroll ${Math.round(before.scroll)} -> ${Math.round(after.scroll)})`);
    }
    expect(moves).toEqual([]);
  });
}

/* --- the tab census on states a page load does not reach --------------------------- */

interface State { name: string; route: string; act?: (page: Page) => Promise<void> }
const tab = (list: string, name: string | RegExp) => async (page: Page) => {
  await page.getByRole('tablist', { name: list }).getByRole('tab', { name }).click();
  await page.waitForTimeout(600);
};
const STATES: State[] = [
  { name: 'event rewards', route: PEOPLE, act: tab('Event sections', 'Rewards') },
  { name: 'event skins', route: PEOPLE, act: tab('Event sections', 'Skins') },
  { name: 'gacha operator preview', route: '/gacha', act: openPreview },
  { name: 'schedule calendar', route: '/schedule?view=calendar' },
  { name: 'planner with an operator', route: '/planner', act: addOperator },
  { name: 'planner experimental', route: '/planner', act: tab('Planner mode', 'Experimental') },
  { name: 'recruitment cheat sheet', route: '/recruitment', act: tab('Recruitment view', 'Guarantee cheat sheet') },
  { name: 'Stronghold alliances', route: '/gamemodes/stronghold-protocol', act: tab('Sections', 'Alliances') },
  { name: 'Stronghold items', route: '/gamemodes/stronghold-protocol', act: tab('Sections', 'Items') },
  { name: 'Stronghold enemies', route: '/gamemodes/stronghold-protocol', act: tab('Sections', 'Enemies') },
  { name: 'enemy stages', route: '/enemies', act: tab('Show', 'Stages') },
  { name: 'stage guesser custom', route: '/games/stage-guesser', act: async (page) => { await page.getByRole('button', { name: 'Custom', exact: true }).click(); await page.waitForTimeout(600); } },
  // 1-7: its map renders in a build with the content release switched off (ta-1's did not).
  { name: 'a stage map', route: '/stages/browse?s=1-7', act: async (page) => { await expect(page.locator('.stage-map-tools')).toBeVisible({ timeout: 45_000 }); } },
];

for (const state of STATES) {
  test(`tab strips and pick-one rows start on the section edge: ${state.name}`, async ({ page }) => {
    await page.goto(state.route);
    await page.evaluate(() => document.fonts.ready);
    if (state.act) await state.act(page);
    await page.waitForTimeout(400);
    const found: string[] = [];
    for (const theme of ['dark', 'light'] as const) {
      await page.evaluate((t) => {
        if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
        else document.documentElement.removeAttribute('data-theme');
      }, theme);
      for (const o of await page.evaluate(tabAlign, { tolerance: 2 })) found.push(`(${theme}) ${o.kind}: ${o.group}: ${o.detail}`);
    }
    expect([...new Set(found)]).toEqual([]);
  });
}
