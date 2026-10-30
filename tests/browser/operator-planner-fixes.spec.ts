import { expect, test, type Page } from '@playwright/test';
import type { RosterOperator } from '../../lib/operators/operatorTypes';
import { plannerExperimental } from './census-routes';

async function controls(page: Page, mobile: boolean) {
  if (!mobile) return page;
  await page.getByRole('button', { name: /^Filters/ }).click();
  return page.getByRole('dialog', { name: 'Filters', exact: true });
}
for (const theme of ['dark', 'light']) {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() })));
  });
  test(`operator filters retain multiple choices, checkbox selections and bookmarks (${theme})`, async ({ page }, info) => {
    test.setTimeout(120000);
    const mobile = info.project.name === 'mobile';
    await page.goto('/operators');
    await page.evaluate(theme => { localStorage.setItem('theme', theme); document.documentElement.setAttribute('data-theme', theme); }, theme);
    let scope = await controls(page, mobile);
    for (const name of ['6-star', '5-star', 'Guard', 'Sniper']) await scope.getByRole('button', { name, exact: true }).click();
    for (const name of ['6-star', '5-star', 'Guard', 'Sniper']) await expect(scope.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await scope.getByRole('button', { name: 'Filter by subclass', exact: true }).click();
    const subclasses = page.getByRole('dialog', { name: 'Filter by subclass', exact: true });
    await subclasses.getByRole('checkbox', { name: 'Liberator', exact: true }).check();
    await subclasses.getByRole('checkbox', { name: 'Lord', exact: true }).check();
    await expect(subclasses.getByRole('checkbox', { name: 'Liberator', exact: true })).toBeChecked();
    await page.waitForTimeout(180);
    await page.screenshot({ path: info.outputPath(`subclass-filters-${theme}.png`) });
    await page.keyboard.press('Escape');
    const trigger = scope.getByRole('button', { name: 'Filter by faction', exact: true });
    await trigger.click();
    const menu = page.getByRole('dialog', { name: 'Filter by faction', exact: true });
    await menu.getByRole('checkbox', { name: 'Rhodes Island', exact: true }).check();
    await menu.getByRole('checkbox', { name: 'Kazimierz', exact: true }).check();
    await expect(menu.getByRole('checkbox', { name: 'Rhodes Island', exact: true })).toBeChecked();
    await expect(menu.getByRole('checkbox', { name: 'Kazimierz', exact: true })).toBeChecked();
    await page.waitForTimeout(180);
    await page.screenshot({ path: info.outputPath(`multi-filters-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(scope.getByRole('button', { name: 'Filter by subclass', exact: true })).toContainText('Liberator');
    await scope.getByRole('button', { name: 'Filter by how obtained', exact: true }).click();
    const obtainMenu = page.getByRole('dialog', { name: 'Filter by how obtained', exact: true });
    await obtainMenu.getByRole('checkbox', { name: 'Standard headhunting', exact: true }).check();
    await obtainMenu.getByRole('checkbox', { name: 'Recruitment', exact: true }).check();
    await expect(obtainMenu.getByRole('checkbox', { name: 'Standard headhunting', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    if (mobile) await scope.getByRole('button', { name: 'Done', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('rarity')).toBe('6,5');
    await expect.poll(() => new URL(page.url()).searchParams.get('faction')).toBe('Rhodes Island,Kazimierz');
    await expect.poll(() => new URL(page.url()).searchParams.get('branch')).toBe('Liberator,Lord');
    await expect(page.locator('.roster-card').filter({ hasText: 'Młynar' })).toBeVisible();
    await page.reload();
    scope = await controls(page, mobile);
    for (const name of ['6-star', '5-star', 'Guard', 'Sniper']) await expect(scope.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await scope.getByRole('button', { name: 'Guard', exact: true }).click();
    await expect(scope.getByRole('button', { name: 'Sniper', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await scope.getByRole('button', { name: 'Filter by subclass', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Filter by subclass', exact: true }).getByRole('checkbox', { name: 'Liberator', exact: true })).toBeChecked();
    await expect(page.getByRole('dialog', { name: 'Filter by subclass', exact: true }).getByRole('checkbox', { name: 'Lord', exact: true })).toBeChecked();
    await page.keyboard.press('Escape');
    await scope.getByRole('button', { name: '6-star', exact: true }).click();
    await expect(scope.getByRole('button', { name: '5-star', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(scope.getByRole('button', { name: 'Sniper', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
  test(`bookmarked multi-filters survive both operator return paths (${theme})`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(theme => localStorage.setItem('theme', theme), theme);
    await page.goto('/operators?rarity=6%2C5&class=Guard%2CSniper&branch=Liberator%2CLord');
    const card = page.locator('a.roster-card').filter({ hasText: 'Młynar' });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(/\/operators\//);
    await page.goBack();
    await expect(card).toBeVisible();
    const choices = { rarity: '6,5', class: 'Guard,Sniper', branch: 'Liberator,Lord' };
    for (const [key, value] of Object.entries(choices)) expect(new URL(page.url()).searchParams.get(key)).toBe(value);
    await card.click();
    await expect(page).toHaveURL(/\/operators\//);
    await page.getByRole('link', { name: 'Operator roster', exact: true }).click();
    await expect(card).toBeVisible();
    for (const [key, value] of Object.entries(choices)) await expect.poll(() => new URL(page.url()).searchParams.get(key)).toBe(value);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
  test(`calendar estimates never become confirmed availability (${theme})`, async ({ page }, info) => {
    test.setTimeout(120000);
    // Freeze the forecast fixture, not the live calendar: an official date update
    // must not make this regression require an obsolete estimate.
    const html = await (await page.request.get('/operators')).text();
    const payload = JSON.parse(html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)![1]);
    const fixture = { ...payload.props.pageProps, now: Date.parse('2026-10-30T20:00:00Z'),
      operators: (payload.props.pageProps.operators as RosterOperator[]).map(op => op.name === 'Violet Mizutsune Orchid'
        ? { ...op, releaseAt: undefined, availableUntil: undefined, releaseEstimate: '2026-11-16', isFuture: true,
          characterInfo: { 'Release Date': '' } } : op) };
    await page.route('**/_next/data/**/operators.json*', route => route.fulfill({ json: { pageProps: fixture, __N_SSG: true } }));
    await page.clock.setFixedTime(new Date('2026-10-30T20:00:00Z'));
    await page.goto('/cookies');
    await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/operators?q=Violet%20Mizutsune%20Orchid'));
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    const card = page.locator('.roster-card').filter({ hasText: 'Violet Mizutsune Orchid' });
    await expect(card).toHaveCount(0);
    await page.clock.setFixedTime(new Date('2026-11-10T07:00:00Z'));
    await expect(card).toContainText('Est. in 6 days');
    await expect(card).not.toContainText('Now Available');
    const decline = page.getByRole('button', { name: 'No thanks', exact: true });
    if (await decline.isVisible()) await decline.click();
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => card.locator('img').first().evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`calendar-estimate-${theme}.png`) });
    await page.clock.setFixedTime(new Date('2026-11-18T07:00:00Z'));
    await expect(card).toHaveCount(0);
    const scope = await controls(page, info.project.name === 'mobile');
    await scope.getByRole('button', { name: 'Show CN', exact: true }).click();
    if (info.project.name === 'mobile') await scope.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(card).toContainText('Upcoming');
    await expect(card).not.toContainText('Now Available');
  });
  test(`two Dualchip craft toggles update one catalyst row (${theme})`, async ({ page }, info) => {
    test.setTimeout(120000);
    await page.goto('/operator-planner');
    const state = { elite: 2, level: 1, skillLevel: 7, masteryTargets: {}, moduleStageTargets: {}, startingElite: 1, startingLevel: 80, startingSkillLevel: 7, startingMasteryLevels: {}, startingModuleStages: {} };
    await plannerExperimental(page, {
      plannerState: { selectedNames: ['Surtr', 'Exusiai'], builderStates: { Surtr: state, Exusiai: state } },
      plannerRoster: { Surtr: { elite: 1, level: 80, skillLevel: 7, masteries: {} }, Exusiai: { elite: 1, level: 80, skillLevel: 7, masteries: {} } },
      plannerDepot: { LMD: 5000000, 'Strategic Battle Record': 500 },
    });
    await page.evaluate(theme => { localStorage.setItem('theme', theme); document.documentElement.setAttribute('data-theme', theme); }, theme);
    const panel = page.locator('.plan-panel').filter({ has: page.getByRole('heading', { name: 'Still needed', exact: true }) });
    const catalysts = panel.locator('.need-card').filter({ has: page.locator('.need-card-who > b').filter({ hasText: /^Chip Catalyst$/ }) });
    await panel.getByRole('checkbox', { name: 'Craft Guard Dualchip', exact: true }).check();
    await expect(catalysts).toHaveCount(1);
    await expect(catalysts.locator('.need-card-count b')).toHaveText('4');
    await panel.getByRole('checkbox', { name: 'Craft Sniper Dualchip', exact: true }).check();
    await expect(catalysts).toHaveCount(1);
    await expect(catalysts.locator('.need-card-count b')).toHaveText('8');
    await catalysts.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`shared-catalysts-${theme}.png`) });
    await panel.getByRole('checkbox', { name: 'Craft Guard Dualchip', exact: true }).uncheck();
    await expect(catalysts).toHaveCount(1);
    await expect(catalysts.locator('.need-card-count b')).toHaveText('4');
  });
}
