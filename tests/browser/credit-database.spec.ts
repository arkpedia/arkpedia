import { expect, test, type Page } from '@playwright/test';
import { uncolouredLinks } from './layout-checks';
import { setTheme } from './overlay-checks';

/*
 * /artists and /voice-actors (components/operators/CreditDatabase.tsx). The owner's
 * screenshot of /voice-actors, 2026-10-22: a group titled "-" (the voice tables' placeholder
 * for "no actor on record") listed as a person, operator names in the browser's own blue and
 * visited purple, and a thousand collapsed name accordions with no filter. The layout census
 * never saw the links: they were inside closed accordions. Every person's operators now show
 * at load, so the census's link-colour check reaches them; this holds the rest.
 * Both projects (1440 and 390), both themes.
 */

test.setTimeout(120000);

const people = (page: Page) => page.locator('main .credit-person');
const names = (page: Page) => page.locator('main .credit-person h3').allInnerTexts();
/** How many people the summary line says match. */
const total = async (page: Page) => parseInt(await page.locator('main .credit-summary').innerText(), 10) || 0;

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(people(page).first()).toBeVisible();
}

/** The address's query once the debounced write has landed. */
async function query(page: Page, key: string, value: string | null) {
  await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value);
}

for (const route of ['/artists', '/voice-actors']) {
  test(`${route}: operator links take the site's colour in both themes`, async ({ page }) => {
    await open(page, route);
    // The first person's operators are on screen at load, as links.
    await expect(people(page).first().locator('a.credit-op').first()).toBeVisible();
    for (const theme of ['dark', 'light'] as const) {
      await setTheme(page, theme);
      expect(await uncolouredLinks(page), `${route} ${theme}`).toEqual([]);
      // And not the old underline either.
      const deco = await people(page).first().locator('a.credit-op').first().evaluate(el => getComputedStyle(el).textDecorationLine);
      expect(deco, `${route} ${theme}`).toBe('none');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'no sideways scroll').toBeLessThanOrEqual(0);
  });

  test(`${route}: rarity, class and server filters narrow every card and reach the address`, async ({ page }) => {
    await open(page, route);
    const before = await total(page);
    await page.getByRole('button', { name: '6-star', exact: true }).click();
    await query(page, 'rarity', '6');
    await page.getByRole('button', { name: 'Sniper', exact: true }).click();
    await query(page, 'class', 'Sniper');
    // Every tile left is a 6-star Sniper (a 6-star tile carries the tier-6 edge).
    const tiles = page.locator('main .credit-person .credit-op');
    await expect(tiles.first()).toBeVisible();
    expect(await page.locator('main .credit-person .credit-op-art:not(.tier-6)').count()).toBe(0);
    expect(await total(page)).toBeLessThan(before);
    // CN only: every tile left says so.
    await page.getByRole('group', { name: 'Server' }).getByRole('button', { name: 'CN only', exact: true }).click();
    await query(page, 'server', 'cn');
    const count = await tiles.count();
    if (count) expect(await page.locator('main .credit-person .credit-op-cn').count()).toBe(count);
    // Reset clears every filter from the address at once.
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await query(page, 'rarity', null);
    await query(page, 'class', null);
    await query(page, 'server', null);
    await expect(page.getByRole('button', { name: '6-star', exact: true })).toHaveAttribute('aria-pressed', 'false');
  });

  test(`${route}: a shared address opens on its filters, and the letter and order apply`, async ({ page }) => {
    await open(page, `${route}?letter=S&sort=count`);
    await expect(page.getByRole('group', { name: 'First letter' }).getByRole('button', { name: 'S', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('group', { name: 'Sort by' }).getByRole('button', { name: 'Most operators', exact: true })).toHaveAttribute('aria-pressed', 'true');
    const shown = await names(page);
    expect(shown.length).toBeGreaterThan(0);
    for (const name of shown) expect(name.normalize('NFKD').charAt(0).toUpperCase()).toBe('S');
    // Most operators first: the counts never rise down the list.
    const counts = await page.locator('main .credit-person').evaluateAll(rows => rows.map(row => row.querySelectorAll('.credit-op').length));
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
    await page.getByRole('group', { name: 'Sort by' }).getByRole('button', { name: 'Name', exact: true }).click();
    await query(page, 'sort', null);
    await query(page, 'letter', 'S');
  });

  test(`${route}: filtering from the toolbar does not move the toolbar`, async ({ page }) => {
    await open(page, route);
    // Put the letter row at the top of the screen, a long list under it, then narrow the
    // list to one letter's handful: the page may not clamp the reader upward.
    const row = page.getByRole('group', { name: 'First letter' });
    await row.evaluate(el => window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 80));
    await page.waitForTimeout(300);
    const top = await row.evaluate(el => el.getBoundingClientRect().top);
    const last = (await row.getByRole('button').evaluateAll(bs => bs.filter(b => !(b as HTMLButtonElement).disabled).map(b => b.textContent ?? ''))).at(-1)!;
    await row.getByRole('button', { name: last, exact: true }).click();
    await page.waitForTimeout(300);
    expect(Math.abs(await row.evaluate(el => el.getBoundingClientRect().top) - top)).toBeLessThan(4);
  });
}

test('/voice-actors: no person is a placeholder, and the "-" credits sit under Uncredited', async ({ page }) => {
  await open(page, '/voice-actors');
  expect(await names(page)).not.toContain('-');
  // The operators of the old "-" group, found by operator: their real actors are people,
  // the missing ones a labelled Uncredited group at the end.
  await page.getByRole('searchbox').fill('Miss.Christine');
  const uncredited = page.locator('#credits-uncredited');
  await expect(uncredited).toBeVisible();
  await expect(uncredited.getByRole('heading', { name: 'Uncredited' })).toBeVisible();
  await expect(uncredited.locator('a.credit-op', { hasText: 'Miss.Christine' })).toContainText('Japanese · Mandarin');
  expect(await names(page)).not.toContain('-');
  // It is the last group on the page.
  expect(await page.locator('main .credit-group').last().getAttribute('id')).toBe('credits-uncredited');
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    expect(await uncolouredLinks(page), theme).toEqual([]);
  }
});

test('/voice-actors: the language filter keeps only that language, and reaches the address', async ({ page }) => {
  await open(page, '/voice-actors');
  await page.getByRole('combobox', { name: 'Filter by language' }).click();
  await page.getByRole('option', { name: /^Korean/ }).click();
  await query(page, 'lang', 'Korean');
  const credits = await page.locator('main .credit-person .credit-op-credit').allInnerTexts();
  expect(credits.length).toBeGreaterThan(0);
  for (const text of credits) expect(text.replace(/ · CN only$/, '')).toBe('Korean');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Filter by language' })).toContainText('Korean');
});

test('/artists: the credit filter keeps outfits, and a search by operator keeps its artists', async ({ page }) => {
  await open(page, '/artists?credit=outfit');
  await expect(page.getByRole('combobox', { name: 'Filter by credit' })).toContainText('Outfits');
  const credits = await page.locator('main .credit-person .credit-op-credit').allInnerTexts();
  expect(credits.length).toBeGreaterThan(0);
  for (const text of credits) expect(text).not.toMatch(/(^|· )(Base|E1|E2|Design)( ·|$)/);
  await page.goto('/artists');
  await page.getByRole('searchbox').fill('Thorns');
  await query(page, 'q', 'Thorns');
  const tiles = await page.locator('main .credit-op-name').allInnerTexts();
  expect(tiles.length).toBeGreaterThan(0);
  for (const name of tiles) expect(name).toMatch(/Thorns/);
});

test('each credited person is one card: joined credits split, case variants merged', async ({ page }) => {
  // The list shows forty cards at a time, so each case is found by searching its operator.
  const cases = [
    ['/artists', 'Bellone', ['Lowro', 'Studio Montagne']],
    ['/artists', 'Esperanta', ['海猫络合物', '唯@W', 'Studio Montagne']],
    ['/artists', 'Blaze the Igniting Spark', ['百慕大飞鱼', 'Mag42', '唯@W']],
    ['/artists', 'Lappland the Decadenza', ['幻象黑兔', 'Mag42']],
    ['/artists', 'Makoto Yuki', ['〇亻']],
    ['/artists', 'Surtr', ['Ask']],
    ['/artists', 'Bagpipe', ['u介']],
    ['/voice-actors', 'Passenger', ['Stephen Spencer', 'Georgia Cudby']],
  ] as const;
  // The heading's text, not its rendered capitals.
  const cards = (page: Page) => page.locator('main .credit-person h3').allTextContents();
  let at = '';
  for (const [route, search, people] of cases) {
    if (route !== at) await open(page, (at = route));
    await page.getByRole('searchbox').fill(search);
    await expect.poll(() => cards(page), `${route} ${search}`).toEqual(expect.arrayContaining([...people]));
    const shown = (await cards(page)).map(name => name.trim());
    expect(shown.filter(name => /&|[,，、]|\(|\s\/\s/.test(name)), `${route} ${search}: joined or annotated names`).toEqual([]);
    const keys = shown.map(name => name.toLowerCase());
    expect(keys.filter((key, i) => keys.indexOf(key) !== i), `${route} ${search}: case-only duplicates`).toEqual([]);
  }
});
