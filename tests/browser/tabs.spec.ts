import { expect, test, type Locator, type Page } from '@playwright/test';
import { bannerWithDetails, fontsSettled } from './census-routes';
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
 * (tab-align.ts) on the states a plain page load does not reach and the layout census
 * (layout-census.spec.ts) does not drive -- the census runs it on every route and on
 * every state it drives.
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

/** The hydration errors a page reports while a test drives it. The Check runs a production
 *  build, where React says nothing about an attribute mismatch and reports a text or
 *  structure one as an uncaught "Minified React error" (a pageerror, not a console
 *  message). Both channels, both wordings; the state divergence an attribute mismatch
 *  leaves behind is caught by the presses below (every tab of every strip must select,
 *  and show its panel). */
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  const hydration = /hydrat|did not match|Minified React error #(418|419|421|422|423|425)\b/i;
  page.on('console', (msg) => { if (msg.type() === 'error' && hydration.test(msg.text())) errors.push(msg.text()); });
  page.on('pageerror', (error) => { if (hydration.test(String(error))) errors.push(String(error)); });
  return errors;
}

test('a tab strip is a real tablist, and the keyboard moves along it', async ({ page }) => {
  const errors = watchHydration(page);
  await page.goto("/game-modes/stronghold-protocol");
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
  for (const route of ["/game-modes/stronghold-protocol", '/schedule', '/recruitment', "/operator-planner"]) {
    const html = await (await page.request.get(route)).text();
    expect(html, `${route}: role="tablist" in the server HTML`).toMatch(/role="tablist"/);
    expect(html, `${route}: a selected tab in the server HTML`).toMatch(/role="tab"[^>]*aria-selected="true"|aria-selected="true"[^>]*role="tab"/);
    expect(html).toMatch(/aria-controls="[^"]+-panel-[^"]*"/);
  }
});

test('the planner\'s operator tabs are removed with Delete or their ×', async ({ page }) => {
  await page.goto("/operator-planner");
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
  // Delete on the focused tab removes it, and focus lands on the tab the planner makes
  // current (All), not on a neighbour at tabindex -1 announced "not selected".
  await penance.click();
  await expect(penance).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Delete');
  await expect(list.getByRole('tab')).toHaveCount(2);
  const all = list.getByRole('tab', { name: 'All', exact: true });
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute('tabindex', '0');
  // The × is a mouse shortcut, but a thumb can hit it: 24px or more each way around
  // its centre (WCAG 2.5.8) lands on it, not on the tab beside it. Box edges only.
  const x = list.getByRole('tab', { name: /Surtr/ }).locator('.tab-remove');
  const misses = await x.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    return [[-11, 0], [11, 0], [0, -11], [0, 11]].filter(([dx, dy]) => !el.contains(document.elementFromPoint(cx + dx, cy + dy))).map(([dx, dy]) => `${dx},${dy}`);
  });
  expect(misses, 'points 11px from the ×\'s centre that miss it').toEqual([]);
  // The × removes without selecting.
  await x.click();
  await expect(page.getByRole('tablist', { name: 'View materials for' })).toHaveCount(0);
});

test('every reader can remove the operator on show, not only a mouse or a keyboard', async ({ page }) => {
  // The tab's × is aria-hidden and Delete needs a keyboard, so a touch screen reader
  // or voice control had no way to remove an operator in Simple mode: base had a 36x44
  // "Remove … from plan" button beside each tab.
  await page.goto("/operator-planner");
  for (const name of ['Penance', 'Surtr']) {
    await page.getByPlaceholder('Search operators…').fill(name);
    await page.getByRole('option', { name: new RegExp(name) }).first().click();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  const list = page.getByRole('tablist', { name: 'View materials for' });
  await list.getByRole('tab', { name: /Penance/ }).click();
  const panel = page.getByRole('tabpanel', { name: /Penance/ });
  const remove = panel.getByRole('button', { name: 'Remove from plan', exact: true });
  await expect(remove).toBeVisible();
  const box = await remove.boundingBox();
  expect(box && Math.min(box.width, box.height), 'a 24px target or more').toBeGreaterThanOrEqual(24);
  await remove.click();
  await expect(list.getByRole('tab')).toHaveCount(2);
  // Focus is not dropped on the body: it goes to All, which now shows.
  const all = list.getByRole('tab', { name: 'All', exact: true });
  await expect(all).toHaveAttribute('aria-selected', 'true');
  await expect(all).toBeFocused();
});

/* --- Anti-Page Jump: switching a tab never shortens the page under the reader --------- */

interface Place { name: string; route: string; open?: (page: Page) => Promise<void> }
const openPreview = async (page: Page) => {
  await (await bannerWithDetails(page)).click();
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
  { name: 'Sections', route: "/game-modes/stronghold-protocol" },
  { name: 'Event sections', route: PEOPLE },
  { name: 'Reward store', route: PEOPLE, open: async (page) => { await page.getByRole('tablist', { name: 'Event sections' }).getByRole('tab', { name: 'Rewards' }).click(); } },
  { name: 'Show', route: '/enemies' },
  { name: 'Skill', route: '/operators/Amiya' },
  { name: 'Recruitment view', route: '/recruitment' },
  { name: 'Planner mode', route: "/operator-planner" },
  { name: 'View materials for', route: "/operator-planner", open: addOperator },
  { name: 'Schedule view', route: '/schedule' },
  // The view read from the address: the server and the browser must agree on it, or the
  // Calendar tab looks current and does nothing when pressed.
  { name: 'Schedule view', route: '/schedule?view=calendar' },
  { name: 'Skill', route: "/gacha-simulator", open: openPreview },
  { name: 'Module', route: "/gacha-simulator", open: openPreview },
];

for (const place of PLACES) {
  test(`switching "${place.name}" on ${decodeURIComponent(place.route)} never moves the strip`, async ({ page }) => {
    // Every page with a strip hydrates without an error, not only the keyboard test's:
    // a text node beside /recruitment's view tabs that differed between the server and
    // the browser passed the whole spec while only Stronghold was watched.
    const errors = watchHydration(page);
    await page.goto(place.route);
    if (place.open) await place.open(page);
    const list = page.getByRole('tablist', { name: place.name }).first();
    await expect(list).toBeVisible();
    const tabs = list.locator(':scope > [role="tab"]:not([disabled])');
    const n = await tabs.count();
    test.skip(n < 2, 'one tab: nothing to switch');
    // A tab named apart from what it shows (an aria-label) starts with what it shows
    // (WCAG 2.5.3, label in name): the gacha preview's "S1" was named "Skill 1: ...", so
    // "click S1" in voice control found nothing. Its label is its own text, not the
    // count or the remove mark beside it, and only letters and digits are compared: a
    // symbol is not spoken as shown ("6★" named "6-star" passes).
    const misnamed = await tabs.evaluateAll((els) => els.flatMap((el) => {
      const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const name = el.getAttribute('aria-label');
      const shown = Array.from(el.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim();
      return name && words(shown) && !words(name).startsWith(words(shown)) ? [`"${shown}" is named "${name}"`] : [];
    }));
    expect(misnamed, 'tabs whose accessible name does not start with their label').toEqual([]);
    // Where the reader is most exposed: the strip at the top of the screen, as far down
    // the page as that allows (a pinned strip stays there at the very foot of the page).
    // scrollIntoView reaches a strip inside its own scroller too (the operator page's
    // detail pane at 1440, the gacha preview's dialog). Before EVERY press, not once: the
    // panel showing decides how far down the strip can go, and placed once, on the short
    // panel, the strip stayed where the short panel allowed, so the press from the tall
    // panel back to the short one started with no scroll to lose -- /recruitment's Cheat
    // sheet -> Calculator (143px at 1440) and /planner's Experimental -> Simple (98px)
    // clamped the reader and passed.
    const toTop = async () => {
      await list.evaluate((el) => {
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
        const nav = document.querySelector('.site-nav')?.getBoundingClientRect().bottom ?? 0;
        if (el.getBoundingClientRect().top < nav + 8) window.scrollBy({ top: el.getBoundingClientRect().top - nav - 8, behavior: 'instant' });
        if (getComputedStyle(el.closest('.gm-lookup') ?? el).position === 'sticky') window.scrollTo({ top: 1e6, behavior: 'instant' });
      });
      await page.waitForTimeout(900);
    };
    // A strip pinned by position: sticky rides its section and cannot stay on screen once
    // the section under it is shorter (the arkpedia-ui skill: padding is not content a
    // sticky element can travel through), so for it the measure is the reader's place.
    const sticky = await list.evaluate((el) => getComputedStyle(el.closest('.gm-lookup') ?? el).position === 'sticky');
    const moves: string[] = [];
    // Start from the first tab the page does NOT mark current and end on the one it
    // does, so every press is a switch: a strip whose state disagrees with what the
    // server drew (a hydration mismatch React leaves in place in production) shows it
    // as a press that selects nothing.
    const drawn = Math.max(0, await tabs.evaluateAll((els) => els.findIndex((el) => el.getAttribute('aria-selected') === 'true')));
    const order = Array.from({ length: n }, (_, k) => (drawn + 1 + k) % n);
    const unselected: string[] = [];
    for (const i of order) {
      const tab = tabs.nth(i);
      const label = ((await tab.getAttribute('aria-label')) || (await tab.textContent()) || '').trim();
      await toTop();
      const before = await list.evaluate((el) => ({ y: el.getBoundingClientRect().top, scroll: window.scrollY }));
      // A press where the reader sees it: no scrolling into view first.
      await tab.dispatchEvent('click');
      await page.waitForTimeout(700);
      const after = await list.evaluate((el) => ({ y: el.getBoundingClientRect().top, scroll: window.scrollY }));
      const moved = sticky ? after.scroll - before.scroll : after.y - before.y;
      if (Math.abs(moved) >= 4) moves.push(`${label}: the strip moved ${Math.round(after.y - before.y)}px (scroll ${Math.round(before.scroll)} -> ${Math.round(after.scroll)})`);
      const shown = await tab.evaluate((el) => {
        const panel = document.getElementById(el.getAttribute('aria-controls') ?? '');
        return el.getAttribute('aria-selected') === 'true' && !!panel && panel.checkVisibility();
      });
      if (!shown) unselected.push(label);
    }
    expect(moves).toEqual([]);
    expect(unselected, 'pressed tabs that did not become current with their panel shown').toEqual([]);
    expect(errors, 'hydration errors on the page').toEqual([]);
  });
}

/* --- the tab census on states a page load does not reach --------------------------- */

interface State { name: string; route: string; act?: (page: Page) => Promise<void> }
const tab = (list: string, name: string | RegExp) => async (page: Page) => {
  await page.getByRole('tablist', { name: list }).getByRole('tab', { name }).click();
  await page.waitForTimeout(600);
};
/* r11: the layout census (layout-census.spec.ts) runs this census on every state it drives
   (census-routes.ts CENSUS_STATES), in both themes at 1440 and 390, on the load it makes
   anyway. So the seven states it drives the same way left this list: the event's Rewards
   tab, the planner's Experimental, the Stronghold's Alliances, Items and Enemies, the enemy
   page's Stages and the stage guesser's Custom list. What stays is what it does not drive:
   another tab, a view read from the address, the preview with its skill tabs loaded, an
   operator in the plan, the cheat sheet and a stage map. */
const STATES: State[] = [
  { name: 'event skins', route: PEOPLE, act: tab('Event sections', 'Skins') },
  { name: 'gacha operator preview', route: "/gacha-simulator", act: openPreview },
  { name: 'schedule calendar', route: '/schedule?view=calendar' },
  { name: 'planner with an operator', route: "/operator-planner", act: addOperator },
  { name: 'recruitment cheat sheet', route: '/recruitment', act: tab('Recruitment view', 'Guarantee cheat sheet') },
  // 1-7: its map renders in a build with the content release switched off (ta-1's did not).
  { name: 'a stage map', route: '/stages/browse?s=1-7', act: async (page) => { await expect(page.locator('.stage-map-tools')).toBeVisible({ timeout: 45_000 }); } },
];

for (const state of STATES) {
  test(`tab strips and pick-one rows start on the section edge: ${state.name}`, async ({ page }) => {
    await page.goto(state.route);
    await fontsSettled(page);
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
