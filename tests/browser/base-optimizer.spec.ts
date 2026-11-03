import { expect, test } from '@playwright/test';
import account from '../fixtures/base-account.json';
import { presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { searchStarts } from '../../lib/base/searchStarts';

// The optimizer is a Preview feature: a production build (Check's) draws no Optimize base button.
test.beforeEach(async ({ request }) => {
  const response = await request.get('/build-info.json');
  const build = response.ok() ? await response.json() : null;
  test.skip(build?.deploymentRole !== 'staging', 'The base optimizer is Preview-only; production builds leave it out.');
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() })));
});

test('optimizer handles missing account and keyboard dismissal', async ({ page }) => {
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await expect(dialog.getByRole('link', { name: 'Import your account', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Recommend layout' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Optimize base', exact: true })).toBeFocused();
});

test('help stays compact, styled and keyboard accessible in both themes', async ({ page }) => {
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  const trigger = dialog.getByRole('button', { name: 'Yield assumptions', exact: true });
  await expect(dialog.getByRole('spinbutton', { name: 'External gold per day' })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    const imported = dialog.getByRole('link', { name: 'Import your account', exact: true });
    expect(await imported.evaluate(el => (() => { const probe = document.createElement('span'); probe.style.color = 'var(--teal)'; el.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(el).color === expected; })())).toBe(true);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const help = dialog.getByRole('region', { name: 'Yield assumptions', exact: true });
    await expect(help).toBeVisible();
    const reference = help.getByRole('link', { name: 'Production reference' });
    await expect(reference).toHaveAttribute('href', /docs.google.com\/spreadsheets/);
    expect(await reference.evaluate(el => (() => { const probe = document.createElement('span'); probe.style.color = 'var(--teal)'; el.append(probe); const expected = getComputedStyle(probe).color; probe.remove(); return getComputedStyle(el).color === expected; })())).toBe(true);
    expect((await help.innerText()).split(/\s+/).length).toBeLessThan(85);
    expect(await help.evaluate(el => {
      const box = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth + 1 && box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight;
    })).toBe(true);
    await reference.focus();
    await expect(reference).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`base-optimizer-help-${test.info().project.name}-${theme}.png`) });
    await page.keyboard.press('Escape');
    await expect(help).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(dialog).toBeVisible();
  }
});

test('real worker recommends owned teams, invalidates stale input and saves without editing the imported account', async ({ page }) => {
  // Two real searches at the shortest search time (1 minute each, plus their first plans).
  test.setTimeout(360000);
  page.setDefaultTimeout(10000);
  await page.addInitScript(record => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(record));
    localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() }));
  }, account);
  await page.goto('/base');
  const importedBefore = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await dialog.getByRole('checkbox', { name: 'Recommend 2-5-2' }).uncheck();
  await dialog.getByRole('button', { name: '2 times a day, every 12 hours' }).click();
  await dialog.getByRole('combobox', { name: 'Optimizer search time', exact: true }).click();
  await page.getByRole('option', { name: '1 min', exact: true }).click();
  // One Worker per search the page decides to run for this device (no Fiammetta here, so no formations search).
  const starts = searchStarts(...await page.evaluate(() => [navigator.hardwareConcurrency ?? 1, matchMedia('(pointer: coarse)').matches] as const), false).main;
  const workers: string[] = [], remoteSearches: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  page.on('request', request => {
    if (/\/api\/.*optimizer|api\.github\.com\/.*actions|github\.com\/.*\/actions\//.test(request.url())) remoteSearches.push(request.url());
  });
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('definition').first()).toBeVisible({ timeout: 120000 });
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).toBeVisible();
  for (let shift = 1; shift <= 2; shift++) {
    await dialog.getByRole('button', { name: `Shift ${shift}`, exact: true }).click();
    const factories = dialog.locator('[aria-label="Production teams"]').getByRole('region', { name: /^Factory/ });
    await expect(factories).toHaveCount(4);
    for (const factory of await factories.all()) await expect(factory.locator('img').first()).toBeAttached();
  }
  await dialog.getByRole('button', { name: 'Shift 1', exact: true }).click();
  expect(workers).toHaveLength(starts);
  expect(remoteSearches).toEqual([]);
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(workers).toHaveLength(starts); // identical input reuses its result, no new workers
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Recommend 2-5-2' }).uncheck();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).toBeVisible();
  expect(workers).toHaveLength(starts); // reopening the dialog retains the bounded page cache
  await dialog.getByRole('button', { name: 'Shift 2', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: /20:00 →/ })).toBeVisible();
  await dialog.getByRole('button', { name: 'Shift 1', exact: true }).click();
  const portraits = dialog.getByRole('list').filter({ has: page.locator('img') });
  await expect(portraits.first()).toBeVisible();
  const firstPortrait = dialog.locator('img').first();
  await firstPortrait.scrollIntoViewIfNeeded();
  await expect.poll(() => firstPortrait.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const production = dialog.locator('[aria-label="Production teams"]');
  await expect(production.getByRole('region', { name: 'Factory 1, level 3', exact: true })).toBeVisible();
  await expect(production.getByRole('region', { name: 'Factory 4, level 3', exact: true })).toBeAttached();
  await expect(production.getByRole('region', { name: 'Trading Post 2, level 3', exact: true })).toBeAttached();
  await expect(production.getByRole('region', { name: /Factory 7|Trading Post 4/ })).toHaveCount(0);
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    for (const label of ['Yield assumptions', 'Gold balance and saving']) {
      const trigger = dialog.getByRole('button', { name: label, exact: true });
      await trigger.click();
      const help = dialog.getByRole('region', { name: label, exact: true });
      await expect(help).toBeVisible();
      expect(await help.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(help).not.toBeVisible();
      await expect(trigger).toBeFocused();
    }
    for (const [kind, token] of [['factory', '--cat-yellow'], ['tradingPost', '--cat-blue'], ['powerPlant', '--cat-green']]) {
      expect(await dialog.locator(`.base-room-surface.base-overview-${kind}`).first().evaluate((element, token) => {
        const style = getComputedStyle(element);
        return style.getPropertyValue('--base-room-color').trim() === style.getPropertyValue(token).trim() && style.backgroundColor !== 'rgba(0, 0, 0, 0)';
      }, token)).toBe(true);
    }
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`base-optimizer-${test.info().project.name}-${theme}.png`) });
  }
  await dialog.getByRole('button', { name: '1 times a day, every 24 hours' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).not.toBeVisible();
  await expect(dialog.getByText('Settings or account changed. Run the optimizer again.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  // Stop keeps the best plan found so far, if the search has one yet.
  await dialog.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Recommend layout' })).toBeEnabled();
  await page.route(workers[0], route => route.fulfill({ contentType: 'application/javascript', body: 'self.onmessage = () => {};' }));
  await page.clock.install();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  // A stuck worker is given up on at the search time plus three minutes (here 1 + 3).
  await page.clock.fastForward(4 * 60 * 1000 + 1);
  await expect(dialog.getByRole('alert')).toContainText('ran past its time');
  await expect(dialog.getByRole('button', { name: 'Recommend layout' })).toBeEnabled();
  await dialog.getByRole('button', { name: '2 times a day, every 12 hours' }).click();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).toBeVisible();
  const expectedYields = await dialog.getByRole('definition').allTextContents();
  await dialog.getByRole('button', { name: 'Use as rotation', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const summary = page.getByRole('region', { name: 'Base production summary', exact: true });
  await expect(summary.getByRole('radio', { name: 'Rotation', exact: true })).toBeChecked();
  await expect(summary.getByRole('button', { name: '12h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(summary.getByText('Add saved shifts in Rotation to calculate their output.')).toHaveCount(0);
  await expect(summary.locator('.base-summary-row').filter({ hasText: 'Average EXP' })).toContainText(expectedYields[1]);
  await expect(summary.locator('.base-summary-row').filter({ hasText: 'LMD made' })).toContainText(expectedYields[0]);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(importedBefore);
  const saved = await page.evaluate(() => ({ presets: JSON.parse(localStorage.getItem('baseSavedPresets_v1') ?? '[]'), rotation: JSON.parse(localStorage.getItem('baseRotationPlan_v1') ?? '{}') }));
  expect(saved.presets.length).toBeGreaterThanOrEqual(2);
  expect(saved.rotation.shifts.every((s: { hours: number }) => s.hours % 12 === 0)).toBe(true);
  for (const preset of saved.presets) for (const slots of Object.values(preset.assignments) as any[][]) for (const slot of slots) if (slot) expect(account.operators).toContain(slot.operatorName);
  await page.clock.resume();
  await page.reload();
  await expect(summary.getByRole('radio', { name: 'Rotation', exact: true })).toBeChecked();
  await expect(summary.getByRole('button', { name: '12h', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Current base settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Every login', exact: true })).toBeVisible();
  for (const theme of ['dark', 'light']) {
    if (!await page.getByRole('button', { name: 'Every login', exact: true }).isVisible()) await page.getByRole('button', { name: 'Current base settings', exact: true }).click();
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    for (const label of ['Clue exchange help', 'Morale help', 'Swap operators help', 'Login interval help', 'Production estimate limits']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      await trigger.click();
      const help = page.getByRole('region', { name: label, exact: true });
      await expect(help).toBeVisible();
      expect(await help.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
    }
    if (!await page.getByRole('button', { name: 'Every login', exact: true }).isVisible()) await page.getByRole('button', { name: 'Current base settings', exact: true }).click();
    await page.getByRole('button', { name: 'Current base settings', exact: true }).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`base-rotation-settings-${test.info().project.name}-${theme}.png`) });
  }
  await page.getByRole('button', { name: 'Edit rotation', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Rotation', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View in base', exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Base presets', exact: true })).toBeVisible();
});

test('with Fiammetta owned, a formations search runs beside the main one and its better plan is shown', async ({ page }) => {
  test.setTimeout(240000);
  page.setDefaultTimeout(10000);
  const record = { ...account, operators: [...account.operators, 'Fiammetta'] };
  await page.addInitScript(r => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(r));
    localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() }));
  }, record);
  await page.goto('/base');
  const expected = searchStarts(...await page.evaluate(() => [navigator.hardwareConcurrency ?? 1, matchMedia('(pointer: coarse)').matches] as const), true);
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await dialog.getByRole('checkbox', { name: 'Recommend 2-5-2' }).uncheck();
  await dialog.getByRole('combobox', { name: 'Optimizer search time', exact: true }).click();
  await page.getByRole('option', { name: '1 min', exact: true }).click();
  const workers: string[] = [];
  page.on('worker', worker => workers.push(worker.url()));
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).toBeVisible({ timeout: 150000 });
  // One Worker per search the page decides to run for this device: the plain starts and, where the device has
  // four cores or more, the formations search beside them.
  expect(workers).toHaveLength(expected.main + (expected.formations ? 1 : 0));
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('status').filter({ hasText: 'No repeating rotation' })).toHaveCount(0);
});

test('a 243 import defaults to its compatible 252 without a redundant layout picker', async ({ page }) => {
  const small = { ...account, operators: ['FEater', 'Gravel', 'Spot', 'Proviso', 'Texas', 'Myrtle', 'Lancet-2', 'Perfumer'] };
  await page.addInitScript(record => localStorage.setItem('arkpediaAccount', JSON.stringify(record)), small);
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await expect(dialog.getByRole('checkbox', { name: 'Recommend 2-5-2' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('heading', { name: '2-5-2 max right', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(dialog.locator('[aria-label="Production teams"]').getByRole('region', { name: /Factory/ })).toHaveCount(5);
  await expect(dialog.getByRole('combobox', { name: 'Recommended layout' })).toHaveCount(0);
  await expect(dialog.getByText('Compare layouts', { exact: true })).toHaveCount(0);
});

test('a rearranged 252 is searched once and saved in the imported building positions', async ({ page }) => {
  test.setTimeout(120000);
  const spots = presetSpots('2-5-2-right'), levels = presetLevels('2-5-2-right');
  const ids = Object.keys(spots), order = [1, 6, 2, 0, 3, 7, 4, 8, 5];
  const productionSpots = Object.fromEntries(ids.map((id, i) => [id, spots[ids[order[i]]]]));
  const facilityLevels = { ...levels, ...Object.fromEntries(ids.map((id, i) => [id, levels[ids[order[i]]]])) };
  const record = { ...account, base: { ...account.base, productionSpots, facilityLevels }, operators: ['FEater', 'Gravel', 'Spot', 'Proviso', 'Texas', 'Myrtle', 'Lancet-2', 'Perfumer'] };
  await page.addInitScript(record => localStorage.setItem('arkpediaAccount', JSON.stringify(record)), record);
  await page.goto('/base');
  const importedBefore = await page.evaluate(() => localStorage.getItem('arkpediaAccount'));
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await dialog.getByRole('button', { name: '2 times a day, every 12 hours' }).click();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('heading', { name: 'Your layout', exact: true })).toBeVisible({ timeout: 20000 });
  // Wait for the complete search: stopping at the first partial result could hide the duplicate.
  await expect(dialog.getByRole('button', { name: 'Recommend layout', exact: true })).toBeEnabled({ timeout: 90000 });
  await expect(dialog.getByRole('combobox', { name: 'Recommended layout' })).toHaveCount(0);
  await expect(dialog.getByText('Compare layouts', { exact: true })).toHaveCount(0);
  const production = dialog.locator('[aria-label="Production teams"]');
  expect(await production.getByRole('region').evaluateAll(rooms => rooms.map(room => room.getAttribute('aria-label')))).toEqual([
    'Factory 1, level 3', 'Factory 2, level 2', 'Power Plant 1, level 3',
    'Trading Post 1, level 3', 'Trading Post 2, level 2', 'Factory 3, level 2',
    'Factory 4, level 3', 'Factory 5, level 2', 'Power Plant 2, level 3',
  ]);
  for (const portrait of await production.locator('img').all()) {
    await portrait.scrollIntoViewIfNeeded();
    await expect.poll(() => portrait.evaluate(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)).toBe(true);
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await dialog.evaluate(el => { for (const node of [el, ...el.querySelectorAll<HTMLElement>('*')]) if (node.scrollHeight > node.clientHeight) node.scrollTop = 0; });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`rearranged-252-${test.info().project.name}-${theme}.png`) });
  }
  const expectedYields = await dialog.getByRole('definition').allTextContents();
  await dialog.getByRole('button', { name: 'Use as rotation', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('baseSavedPresets_v1') ?? '[]'));
  expect(saved.length).toBeGreaterThan(0);
  for (const preset of saved) {
    expect(preset.productionSpots).toEqual(productionSpots);
    expect(preset.facilityLevels).toEqual(facilityLevels);
  }
  await page.reload();
  const summary = page.getByRole('region', { name: 'Base production summary', exact: true });
  await expect(summary.getByRole('radio', { name: 'Rotation', exact: true })).toBeChecked();
  await expect(summary.locator('.base-summary-row').filter({ hasText: 'Average EXP' })).toContainText(expectedYields[1]);
  await expect(summary.locator('.base-summary-row').filter({ hasText: 'LMD made' })).toContainText(expectedYields[0]);
  expect(await page.evaluate(() => localStorage.getItem('arkpediaAccount'))).toBe(importedBefore);
});

test('layout alternatives stay compact and update the portrait board', async ({ page }) => {
  const small = { ...account, base: { ...account.base, productionSpots: presetSpots('2-5-2-left'), facilityLevels: presetLevels('2-5-2-left') }, operators: ['FEater', 'Gravel', 'Spot', 'Proviso', 'Texas', 'Myrtle', 'Lancet-2', 'Perfumer'] };
  await page.addInitScript(record => localStorage.setItem('arkpediaAccount', JSON.stringify(record)), small);
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Recommended layout' })).toBeVisible({ timeout: 20000 });
  await expect(dialog.getByRole('table', { name: 'Recommended layouts' })).not.toBeVisible();
  await dialog.getByRole('combobox', { name: 'Recommended layout' }).click();
  // Both legal 252 variants remain available for this minimally upgraded import.
  await expect(dialog.getByRole('option', { name: /2-4-3/ })).toHaveCount(0);
  await dialog.getByRole('option', { name: /^2-5-2 max right/ }).click();
  await expect(dialog.getByRole('heading', { name: '2-5-2 max right', exact: true })).toBeVisible();
  await expect(dialog.locator('[aria-label="Production teams"]').getByRole('region', { name: /Factory/ })).toHaveCount(5);
  await dialog.getByText('Compare layouts', { exact: true }).click();
  await expect(dialog.getByRole('table', { name: 'Recommended layouts' })).toBeVisible();
});

test('support staffing survives every optimized shift, save, selection and reload', async ({ page }, info) => {
  test.setTimeout(180000);
  const { getAllOperators } = await import('../../lib/operators/operators');
  const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
  const record = { ...account, operators: operators.map(o => o.name), base: {
    ...account.base, productionSpots: presetSpots('2-5-2-right'), facilityLevels: presetLevels('2-5-2-right'),
    assignments: {}, dormitoryAmbience: {},
    operatorProgress: Object.fromEntries(operators.map(o => [o.name, { eliteLevel: (o.rarity ?? 0) >= 3 ? 'Elite 2' : 'Base', level: (o.rarity ?? 0) >= 3 ? 60 : 30 }])),
  } };
  await page.addInitScript(record => localStorage.setItem('arkpediaAccount', JSON.stringify(record)), record);
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await dialog.getByRole('checkbox', { name: 'Recommend 2-5-2' }).uncheck();
  await dialog.getByRole('button', { name: '2 times a day, every 12 hours' }).click();
  await dialog.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(dialog.getByRole('definition').first()).toBeVisible({ timeout: 120000 });
  if (await dialog.getByRole('button', { name: 'Stop', exact: true }).isVisible()) await dialog.getByRole('button', { name: 'Stop', exact: true }).click();
  const shifts = await dialog.getByRole('button', { name: /^Shift \d+$/ }).count();
  expect(shifts).toBeGreaterThanOrEqual(2);
  // Shifts that place everyone the same way share one saved setup, as they share one preset in the game.
  const setups = Number((await dialog.getByText(/^\d+ saved setups? for \d+ shifts/).textContent())?.match(/^(\d+) saved/)?.[1]);
  expect(setups).toBeGreaterThanOrEqual(1);
  expect(setups).toBeLessThanOrEqual(Math.min(shifts, 3));
  for (let i = 1; i <= shifts; i++) {
    await dialog.getByRole('button', { name: `Shift ${i}`, exact: true }).click();
    for (const [name, count] of [['Reception Room', 2], ['Office', 1], ['Workshop', 1], ['Control Center', 5], ['Power Plant 1', 1], ['Power Plant 2', 1]] as const) {
      await expect(dialog.getByRole('region', { name: new RegExp(`^${name}, level`) }).locator('li')).toHaveCount(count);
    }
    await expect(dialog.getByText('Crafting standby', { exact: true })).toBeVisible();
  }
  await dialog.getByRole('button', { name: 'Use as rotation', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('baseSavedPresets_v1') ?? '[]'));
  expect(saved).toHaveLength(setups);
  for (const preset of saved) {
    expect(preset.assignments.receptionRoom.filter(Boolean)).toHaveLength(2);
    expect(preset.assignments.office.filter(Boolean)).toHaveLength(1);
    expect(preset.assignments.workshop.filter(Boolean)).toHaveLength(1);
    const names = Object.values(preset.assignments).flatMap(slots => (slots as {operatorName: string}[]).filter(Boolean).map(s => s.operatorName));
    expect(new Set(names).size).toBe(names.length);
    await page.getByRole('combobox', { name: 'Saved preset', exact: true }).click();
    await page.getByRole('option', { name: preset.name, exact: true }).click();
    for (const [name, count] of [['Reception Room', 2], ['Office', 1], ['Workshop', 1]] as const) {
      await expect(page.getByRole('button', { name: new RegExp(`^${name}, level \\d, ${count} of ${count} operators$`) })).toBeAttached();
    }
  }
  await page.reload();
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await expect(page.getByRole('button', { name: /^Reception Room, level \d, 2 of 2 operators$/ })).toBeAttached();
    await page.getByRole('button', { name: 'Fit base', exact: true }).click();
    await page.getByRole('region', { name: 'Base floor plan', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`staffed-base-${info.project.name}-${theme}.png`) });
  }
});

test('a Krooster profile imports as a testing account for the optimizer, through the site\'s own route', async ({ page }) => {
  // Preview only (the beforeEach above skips production builds). The route is stubbed: no request leaves for krooster.com.
  const profile = { username: 'tester', displayName: 'Tester', server: 'EN', level: 120, assistant: 'char_289_gyuki', roster: {
    char_002_amiya: { elite: 2, level: 40, potential: 6, skillLevel: 7, masteries: [0, 0, 0], modules: { uniequip_002_amiya: 0 } },
    char_1001_amiya2: { elite: 2, level: 40, potential: 6, skillLevel: 7, masteries: [0, 2] },
    char_289_gyuki: { elite: 2, level: 90, potential: 1, skillLevel: 7, masteries: [0, 3], modules: { uniequip_002_gyuki: 3 } },
    char_502_nblade: { elite: 0, level: 30, potential: 6, skillLevel: 1, masteries: [] },
  } };
  let asked = '';
  await page.route('**/api/account-import/krooster?user=*', route => { asked = new URL(route.request().url()).searchParams.get('user') ?? ''; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(profile) }); });
  await page.goto('/account');
  await page.locator('.page-header').getByRole('button', { name: 'Import / export', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Krooster username' }).fill('tester');
  await dialog.getByRole('button', { name: 'Import from Krooster', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Imported 4 operators from Tester\'s Krooster profile');
  expect(asked).toBe('tester');
  const stored = await page.evaluate(() => ({ account: JSON.parse(localStorage.getItem('arkpediaAccount') ?? 'null'), roster: JSON.parse(localStorage.getItem('plannerRoster') ?? '{}') }));
  // By the site's game-account map: char_289_gyuki is Matoimaru and char_502_nblade is Yato.
  expect(stored.account.operators).toEqual(['Amiya', 'Amiya (Guard)', 'Matoimaru', 'Yato']);
  expect(stored.account.base).toBeUndefined();
  expect(stored.account.doctor).toBe('Tester (Krooster)');
  expect(stored.roster.Matoimaru).toMatchObject({ elite: 2, level: 90, skillLevel: 7, masteries: { 1: 3 }, modules: { 0: 2 } });
  // The optimizer takes the testing account: it has no layout of its own, so Recommend 2-5-2 searches the presets.
  await page.keyboard.press('Escape');
  await page.goto('/base');
  await page.getByRole('button', { name: 'Optimize base', exact: true }).click();
  const optimizer = page.getByRole('dialog', { name: 'Base optimizer', exact: true });
  await expect(optimizer.getByRole('checkbox', { name: 'Recommend 2-5-2' })).toBeChecked();
  await optimizer.getByRole('button', { name: 'Recommend layout' }).click();
  await expect(optimizer.getByRole('definition').first()).toBeVisible({ timeout: 60000 });
  if (await optimizer.getByRole('button', { name: 'Stop', exact: true }).isVisible()) await optimizer.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(optimizer.getByRole('alert')).toHaveCount(0);
});
