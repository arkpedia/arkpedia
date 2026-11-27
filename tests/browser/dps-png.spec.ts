import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

test('inspects the opening hit and skill window against custom stats and an enemy preset', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('combobox', { name: 'Add operator' }).fill('Ulpianus');
  await page.getByRole('option', { name: 'Ulpianus', exact: true }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();

  const results = page.getByRole('group', { name: 'Damage timeline results' });
  await expect(results).toContainText('Custom target · 5 s');
  await expect(results).toContainText('11,312.8 DPS · Anchor throw');
  await expect(results).toContainText('Anchor throw at 5 s · 9,098.24 damage');
  await expect(results).toContainText('Skill DPS 2,214.56 · 5–30 s (25 s)');

  const time = page.getByRole('slider', { name: 'Inspect time' });
  await time.press('Home');
  await expect(results).toContainText('499.6 DPS · Normal attacks');
  await time.press('End');
  await expect(results).toContainText('499.6 DPS · Normal attacks');
  await page.getByRole('spinbutton', { name: 'Activate skill at (s)' }).fill('10');
  await expect(results).toContainText('Skill DPS 2,214.56 · 10–35 s (25 s)');

  await page.getByRole('combobox', { name: 'Find enemy' }).fill('Patriot');
  await page.getByRole('option', { name: /^Patriot/ }).first().click();
  const form = page.getByRole('combobox', { name: 'Enemy form', exact: true });
  const def = page.getByRole('spinbutton', { name: 'DEF', exact: true });
  await expect(form).toContainText('Marching');
  await expect(def).toHaveValue('2100');
  await expect(results).toContainText(/Patriot .*Marching · 10 s/);
  await expect(results).toContainText('7,398.24 damage');
  await form.press('Enter');
  await form.press('End');
  await form.press('Enter');
  await expect(form).toContainText('Ruination');
  await expect(def).toHaveValue('700');
  await expect(results).toContainText(/Patriot .*Ruination · 10 s/);
  await expect(results).toContainText('8,798.24 damage');
  await page.getByRole('combobox', { name: 'Enemy level', exact: true }).click();
  await page.getByRole('option', { name: '1', exact: true }).click();
  await expect(results).toContainText('Lv 1 · Ruination · 10 s');
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(def).toHaveValue('700');
  await def.fill('517');
  await expect(results).toContainText('Custom target · 10 s');
  await expect(results).toContainText('Anchor throw at 10 s · 8,981.24 damage');
  await page.getByRole('button', { name: 'Detailed PNG', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Detailed PNG preview' }).getByRole('img')).toBeVisible();
});

test('applies selectable RES states for other enemies and identifies base-only records', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('combobox', { name: 'Add operator' }).fill('Amiya');
  await page.getByRole('option', { name: 'Amiya', exact: true }).click();
  await page.getByRole('combobox', { name: 'Damage source', exact: true }).click();
  await page.getByRole('option', { name: /^S1/ }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  const enemy = page.getByRole('combobox', { name: 'Find enemy', exact: true });
  const form = page.getByRole('combobox', { name: 'Enemy form', exact: true });
  const res = page.getByRole('spinbutton', { name: 'RES', exact: true });
  const result = page.getByRole('group', { name: 'Damage timeline results' });
  await enemy.fill('Dublinn Sniffer Hound');
  await page.getByRole('option', { name: /^Dublinn Sniffer Hound (?!Pro)/ }).first().click();
  await expect(res).toHaveValue('70');
  await expect(result).toContainText('Refraction active');
  const active = await result.locator('strong').innerText();
  await form.click();
  await page.getByRole('option', { name: 'Silenced', exact: true }).click();
  await expect(res).toHaveValue('0');
  await expect(result.locator('strong')).not.toHaveText(active);
  await expect(result).toContainText('Enemy HP');
  await page.getByRole('combobox', { name: 'Enemy fight', exact: true }).click();
  await page.getByRole('option', { name: 'Manual form change', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Form changes at (s)' }).fill('1');
  await expect(page.getByLabel('Enemy phase times')).toContainText('Silenced 0–1 s · Refraction active from 1 s');
  await expect(result).toContainText('Refraction active · 0 DEF · 70 RES');
  await enemy.fill('Manfred');
  await page.getByRole('option', { name: /^Manfred/ }).first().click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText('Only base defenses are available.', { exact: false })).toBeVisible();
});

test('shows Patriot’s full fight on the damage timeline with invulnerability and phase defenses', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('combobox', { name: 'Add operator', exact: true }).fill('Ulpianus');
  await page.getByRole('option', { name: 'Ulpianus', exact: true }).click();
  await page.getByRole('combobox', { name: 'Find enemy', exact: true }).fill('Patriot');
  await page.getByRole('option', { name: /^Patriot PT/ }).first().click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  const fight = page.getByRole('combobox', { name: 'Patriot fight', exact: true });
  await fight.click();
  await page.getByRole('option', { name: 'Full fight', exact: true }).click();
  const timing = page.getByRole('combobox', { name: 'Phase timing', exact: true });
  await expect(timing).toContainText('Automatic');
  const results = page.getByRole('group', { name: 'Damage timeline results' });
  await expect(results).toContainText('Enemy HP 37,436.86 / 45,000');
  await expect(page.getByLabel('Enemy phase times')).toContainText('Marching 0–29.4 s');
  await page.getByRole('slider', { name: 'Inspect time', exact: true }).fill('31');
  await expect(results).toContainText('Enemy HP 0 / 45,000');
  await page.getByRole('slider', { name: 'Inspect time', exact: true }).fill('90');
  await expect(results).toContainText('Enemy HP 45,000 / 45,000');
  await timing.click();
  await page.getByRole('option', { name: 'Manual', exact: true }).click();
  const marching = page.getByRole('spinbutton', { name: 'Marching ends (s)', exact: true });
  await marching.fill('12');
  await expect(page.getByText('Marching 0–12 s · Revival 12–72 s · Ruination from 72 s · Damage resumes at 87 s')).toBeVisible();
  const time = page.getByRole('slider', { name: 'Inspect time', exact: true });
  await time.fill('5');
  await expect(results).toContainText('Marching · 2,100 DEF · 90 RES');
  await expect(results).toContainText('7,398.24 damage');
  await time.fill('12');
  await expect(results).toContainText('Revival · Invulnerable');
  await expect(results).toContainText('0 DPS · Target invulnerable');
  await time.fill('72');
  await expect(results).toContainText('Ruination · 700 DEF · 45 RES · Invulnerable');
  await expect(results).toContainText('0 DPS · Target invulnerable');
  await time.fill('87');
  await expect(results).toContainText('379.6 DPS · Normal attacks');
  await page.getByRole('spinbutton', { name: 'Activate skill at (s)', exact: true }).fill('86');
  await expect(results).toContainText('Anchor throw at 86 s · 0 damage (invulnerable)');
  await time.fill('87');
  await expect(results).toContainText('2,094.56 DPS · Skill active');
  await marching.fill('120');
  await expect(time).toHaveAttribute('max', '240');
  await page.getByRole('button', { name: 'Detailed PNG', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Detailed PNG preview' }).getByRole('img')).toBeVisible();
  await page.getByRole('dialog').press('Escape');
  await fight.click();
  await page.getByRole('option', { name: 'Selected form', exact: true }).click();
  await expect(marching).toHaveCount(0);
  await expect(time).toHaveAttribute('max', '45');
});

test('uses the selected HP source for another enemy’s automatic threshold transition', async ({ page }) => {
  await page.goto('/dps-calculator');
  const add = page.getByRole('combobox', { name: 'Add operator', exact: true });
  for (const name of ['Ulpianus', 'Amiya']) {
    await add.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  }
  await page.getByRole('combobox', { name: 'Find enemy', exact: true }).fill('Talulah');
  await page.getByRole('option', { name: /^Talulah TA\b/ }).first().click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await page.getByRole('combobox', { name: 'Enemy fight', exact: true }).click();
  await page.getByRole('option', { name: 'Full fight', exact: true }).click();
  const chart = page.getByRole('group', { name: 'Damage timeline results' });
  const source = page.getByRole('combobox', { name: 'HP source', exact: true });
  await expect(chart).toContainText('Enemy HP 39,303.76 / 50,000 · #1 Ulpianus');
  const before = await page.getByLabel('Enemy phase times').innerText();
  await source.click();
  await page.getByRole('option', { name: /^#2 Amiya/ }).click();
  await expect(chart).not.toContainText('39,303.76');
  await expect(page.getByLabel('Enemy phase times')).not.toHaveText(before);
  await page.getByRole('slider', { name: 'Inspect time', exact: true }).fill('30');
  await expect(chart).toContainText('Below half HP · 1,400 DEF · 90 RES');
});

test('downloads the zoomed comparison as condensed and detailed PNGs', async ({ page }, info) => {
  await page.goto('/dps-calculator');
  const empty = page.getByText('Add an operator to compare damage or healing.');
  await expect(empty).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  const search = page.getByRole('combobox', { name: 'Add operator' });
  await search.fill('Tragodia');
  await search.press('ArrowDown');
  await search.press('Enter');
  const cards = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Duplicate' }) });
  await expect(cards.first()).toContainText('#1 ·');
  await cards.first().getByRole('button', { name: 'Duplicate' }).click();
  await expect(cards.nth(1)).toContainText('#2 ·');
  await cards.first().getByRole('button', { name: 'Remove' }).click();
  await expect(cards.first()).toContainText('#1 ·');
  await expect(page.getByRole('rowheader', { name: /#1 Tragodia S2 M3 Blood’s Whisper/ })).toBeVisible();
  await expect(empty).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Time to first burst (s)', exact: true }).click();
  await page.getByText('Chart settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Vertical zoom', exact: true }).click();
  await page.getByRole('option', { name: '30 s window', exact: true }).click();
  let height = 0;
  for (const view of ['Condensed', 'Detailed']) {
    await page.getByRole('button', { name: view + ' PNG', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: view + ' PNG preview' });
    const picture = dialog.getByRole('img');
    await expect(picture).toBeVisible();
    const previewHex = await picture.evaluate(async el => {
      const bytes = await (await fetch((el as HTMLImageElement).src)).arrayBuffer();
      return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).join(',');
    });
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Save image' }).click(),
    ]);
    expect(file.suggestedFilename()).toBe('arkpedia-dps-' + view.toLowerCase() + '.png');
    const path = info.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    const png = await readFile(path);
    expect(png.subarray(0, 8)).toEqual(Buffer.from('89504e470d0a1a0a', 'hex'));
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.readUInt32BE(20)).toBeGreaterThan(height);
    expect(Array.from(createHash('sha256').update(png).digest()).join(',')).toBe(previewHex);
    await dialog.getByRole('button', { name: 'Close' }).click();
    height = png.readUInt32BE(20);
  }
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(empty).toBeVisible();
  await expect(page.getByRole('button', { name: 'Detailed PNG' })).toHaveCount(0);
  await search.fill('Skadi');
  await page.getByRole('option', { name: 'Skadi', exact: true }).click();
  await expect(cards.first()).toContainText('#1 ·');
});

test('SilverAsh S2 opens a timeline for modeled and full-roster allies', async ({ page }) => {
  await page.goto('/dps-calculator');
  const timeline = page.locator('summary').filter({ hasText: 'Deployment timeline' });
  await expect(timeline).toHaveCount(0);
  const add = async (label: string, name: string) => {
    await page.getByRole('combobox', { name: label, exact: true }).fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await add('Add operator', 'SilverAsh the Reignfrost');
  await timeline.click();
  await add('Add timeline ally', 'Phantom');
  const table = page.getByRole('table', { name: /Deployment ·/ });
  await expect(table).toContainText('Bloody Opus');
  await add('Add timeline ally', 'Shining');
  await page.getByRole('spinbutton', { name: 'Ally ATK at impact' }).fill('1200');
  await expect(table.getByRole('row').filter({ hasText: 'Stored S2 strike 1' })).toContainText('1,200');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(timeline).toHaveCount(0);
});

test('inspecting a curve preserves the enemy and alternative charts export', async ({ page }) => {
  await page.goto('/dps-calculator');
  const op = page.getByRole('combobox', { name: 'Add operator', exact: true });
  for (const name of ['Tragodia', 'Exusiai']) {
    await op.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  }
  const enemy = page.getByRole('combobox', { name: 'Find enemy' });
  await enemy.fill('Slug');
  await page.getByRole('option').first().click();
  const res = page.getByRole('spinbutton', { name: 'RES', exact: true });
  const initial = await res.inputValue();
  await page.getByRole('combobox', { name: 'Vary', exact: true }).click();
  await page.getByRole('option', { name: 'RES', exact: true }).click();
  await page.getByRole('slider', { name: 'Inspect RES' }).press('End');
  await expect(res).toHaveValue(initial);
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeVisible();
  await page.getByText('Chart settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Reset probe to target' }).click();
  await expect(page.getByRole('slider', { name: 'Inspect RES' })).toHaveValue(initial);
  for (const name of ['At target', 'Elemental burst']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Condensed PNG' }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save image' }).click(),
    ]);
    expect(await file.failure()).toBeNull();
    await page.getByRole('dialog').press('Escape');
  }
  await expect(page.getByRole('img', { name: /First and second elemental bursts/ })).toBeVisible();
});

test('Chen is searchable without punctuation and zoom follows Virtuosa’s burst timing', async ({ page }) => {
  await page.goto('/dps-calculator');
  const search = page.getByRole('combobox', { name: 'Add operator', exact: true });
  await search.fill('Chen');
  await page.getByRole('option', { name: "Ch'en", exact: true }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await search.fill('Virtuosa');
  await page.getByRole('option', { name: 'Virtuosa', exact: true }).click();
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Time to first burst (s)', exact: true }).click();
  for (const slot of [3, 2, 1]) {
    await page.getByRole('combobox', { name: 'Damage source', exact: true }).click();
    await page.getByRole('option', { name: new RegExp('^S' + slot) }).click();
    await expect(page.getByRole('cell').filter({ hasText: /First at .* s/ }).first()).toBeVisible();
  }
  await page.getByText('Chart settings', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Vertical zoom', exact: true }).click();
  await page.getByRole('option', { name: '4×', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Inspect Injury resistance' });
  const plot = page.getByRole('img', { name: /vertical range/ });
  await slider.press('Home');
  const start = await plot.getAttribute('aria-label');
  await slider.press('End');
  await expect(plot).not.toHaveAttribute('aria-label', start!);
});

test('compares Virtuosa modules at the target independently of the probe', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('combobox', { name: 'Add operator' }).fill('Virtuosa');
  await page.getByRole('option', { name: 'Virtuosa', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toContainText('Time to first burst');
  const slider = page.getByRole('slider', { name: 'Inspect Injury resistance' });
  const results = page.getByRole('group', { name: 'Selected target results' });
  const cards = page.getByRole('article').filter({ has: page.getByRole('button', { name: 'Duplicate' }) });
  await expect(results).toContainText(/#1 Virtuosa S3 M3/);
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(results).toContainText('Same as #1');
  await cards.nth(1).getByRole('button', { name: 'Edit build' }).click();
  await page.getByRole('combobox', { name: 'Module', exact: true }).click();
  await page.getByRole('option').last().click();
  await expect(results).toContainText('#1 Virtuosa S3 M3 · No module');
  await expect(results).toContainText('#2 Virtuosa S3 M3 · RIT-X3');
  await expect(results).toContainText(/s faster than #1/);
  const atTarget = await results.innerText();
  await slider.press('End');
  expect(await results.innerText()).toBe(atTarget);
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await page.getByRole('option', { name: 'Injury per second', exact: true }).click();
  await expect(results).toContainText('injury/s vs #1');
  await cards.nth(1).getByRole('button', { name: 'Baseline', exact: true }).click();
  await expect(cards.nth(1).getByRole('button', { name: 'Baseline', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(results).toContainText('injury/s vs #2');
  await page.getByRole('button', { name: 'Duplicate' }).last().click();
  await expect(page.getByRole('combobox', { name: 'Measure', exact: true })).toContainText('Injury per second');
});

test('defenses and chart choices follow the selected damage source', async ({ page }) => {
  await page.goto('/dps-calculator');
  const search = page.getByRole('combobox', { name: 'Add operator', exact: true });
  const add = async (name: string) => {
    await search.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  const selectSkill = async (skill: RegExp) => {
    await page.getByRole('combobox', { name: 'Damage source', exact: true }).click();
    await page.getByRole('option', { name: skill }).click();
  };
  const axis = page.getByRole('combobox', { name: 'Vary', exact: true });
  const def = page.getByRole('spinbutton', { name: 'DEF', exact: true });
  const res = page.getByRole('spinbutton', { name: 'RES', exact: true });
  const elementalView = page.getByRole('button', { name: 'Elemental burst', exact: true });
  const remove = page.getByRole('button', { name: 'Remove', exact: true });

  await add('Skadi');
  await expect(axis).toContainText('Auto · DEF');
  await expect(def).toBeVisible();
  await expect(res).toHaveCount(0);
  await expect(elementalView).toHaveCount(0);
  const jump = page.getByRole('link', { name: 'View chart', exact: true });
  if ((page.viewportSize()?.width ?? 0) <= 780) {
    await jump.click();
    await expect(page).toHaveURL(/#damage-comparison$/);
  } else {
    await expect(jump).toBeHidden();
  }
  await page.getByRole('combobox', { name: 'Measure', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Injury per second', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await remove.click();

  await add('Amiya');
  await expect(page.getByRole('img', { name: /at the selected target/ })).toBeVisible();
  await selectSkill(/^S1/);
  await expect(axis).toContainText('Auto · RES');
  await expect(res).toBeVisible();
  await expect(def).toHaveCount(0);
  await remove.click();

  await add("Ch'en");
  await selectSkill(/^S2/);
  await expect(axis).toContainText('Auto · DEF');
  await axis.click();
  await page.getByRole('option', { name: 'RES', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Inspect RES' })).toBeVisible();
  await page.getByText('Chart settings', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'RES axis maximum' }).fill('50');
  await expect(page.getByRole('slider', { name: 'Inspect RES' })).toHaveAttribute('max', '50');
  await remove.click();

  await add('Virtuosa');
  await expect(axis).toContainText('Auto · Injury resistance');
  await expect(elementalView).toBeVisible();
  await page.getByText('Elemental scenario', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Active burst', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Necrosis', exact: true })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Burn', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('reports Skill DPS and distinguishes a volley from a skill cast', async ({ page }) => {
  await page.goto('/dps-calculator');
  const search = page.getByRole('combobox', { name: 'Add operator', exact: true });
  const add = async (name: string) => {
    await search.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await add('Exusiai');
  const measure = page.getByRole('combobox', { name: 'Measure', exact: true });
  const results = page.getByRole('group', { name: 'Selected target results' });
  await expect(measure).toContainText('Skill DPS');
  await expect(results).toContainText(/\d DPS/);
  await add('Skadi');
  await expect(results).toContainText('DPS vs #1');
  await page.getByRole('button', { name: 'Remove', exact: true }).last().click();
  await measure.click();
  await page.getByRole('option', { name: 'Damage per volley', exact: true }).click();
  await expect(results).toContainText('damage per volley');
  await add("Ch'en");
  await expect(results).toContainText('damage per cast');
  await expect(results.getByText(/vs #1/)).toHaveCount(0);
  await page.getByText('Damage by type', { exact: true }).click();
  await expect(page.getByText(/total damage per volley/)).toBeVisible();
  await expect(page.getByText(/total damage per cast/)).toBeVisible();
});

test('compares direct healing and regeneration per ally', async ({ page }) => {
  await page.goto('/dps-calculator');
  const search = page.getByRole('combobox', { name: 'Add operator' });
  const add = async (name: string) => {
    await search.fill(name);
    await page.getByRole('option', { name, exact: true }).click();
  };
  await add('Haruka');
  const comparison = page.getByRole('group', { name: 'Selected target results' });
  await expect(page.getByRole('heading', { name: 'Healing comparison' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Target', exact: true })).toHaveCount(0);
  await expect(comparison).toContainText('One injured ally');
  await expect(comparison).toContainText('351.09 HPS');
  await page.getByRole('button', { name: 'Edit build', exact: true }).click();
  await page.getByRole('combobox', { name: 'Skill activation', exact: true }).click();
  await page.getByRole('option', { name: 'First activation', exact: true }).click();
  await expect(comparison).toContainText('250.78 HPS');
  await add('Skadi the Corrupting Heart');
  await expect(comparison).toContainText('88.62 HPS');
  const breakdown = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'HPS per ally' }) });
  await expect(breakdown).toContainText('401.25 per heal');
  await expect(breakdown.getByRole('row', { name: /Skadi the Corrupting Heart/ }).getByRole('cell').nth(1)).toHaveText('88.62');
  await expect(breakdown).toContainText('133.75 per pop');
  await page.getByRole('button', { name: 'Detailed PNG', exact: true }).click();
  const png = page.getByRole('dialog', { name: 'Detailed PNG preview' });
  await expect(png.getByRole('img')).toBeVisible();
  await png.getByRole('button', { name: 'Close' }).click();

  await add('Virtuosa');
  await page.getByRole('button', { name: 'Elemental burst', exact: true }).click();
  const measure = page.getByRole('combobox', { name: 'Measure', exact: true });
  await measure.click();
  await page.getByRole('option', { name: 'HPS', exact: true }).click();
  await expect(comparison).toContainText('250.78 HPS');
  await expect(page.getByRole('heading', { name: 'Healing comparison' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('plots enemy damage and healing against an operator over time', async ({ page }) => {
  await page.goto('/dps-calculator');
  const survival = page.getByRole('tab', { name: 'Survival' });
  const comparison = page.getByRole('tab', { name: 'Damage & healing' });
  await comparison.focus();
  await comparison.press('ArrowRight');
  await expect(survival).toHaveAttribute('aria-selected', 'true');
  const pick = async (label: string, text: string, option: RegExp) => {
    await page.getByRole('combobox', { name: label, exact: true }).fill(text);
    await page.getByRole('option', { name: option }).click();
  };
  await pick('Choose enemy', 'Caster', /^Caster A3$/);
  await pick('Choose defender', 'Cuora', /^Cuora$/);
  await page.getByText('Defender settings', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Max HP', exact: true }).fill('300');
  await expect(page.getByRole('img', { name: 'Operator HP over time' })).toBeVisible();
  await expect(page.getByText('Defeated at 8 s', { exact: true })).toBeVisible();
  await expect(page.getByText(/50 DPS after defenses/)).toBeVisible();
  await pick('Add healer', 'Haruka', /^Haruka$/);
  await expect(page.getByText('Survives 30 s', { exact: true })).toBeVisible();
  const probe = page.getByRole('slider', { name: 'Inspect time' });
  await probe.fill('10');
  const health = page.getByRole('group', { name: 'HP at inspected time' });
  await expect(health).toContainText('With healing300 HP');
  await expect(health).toContainText('Without healing0 HP');
  await page.getByText('Edit healer', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Skill start for Haruka (seconds)' }).fill('10');
  await expect(page.getByText('Defeated at 8 s', { exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove Haruka', exact: true }).click();
  await expect(health).not.toContainText('Without healing');
  await comparison.click();
  await expect(page.getByRole('combobox', { name: 'Add operator', exact: true })).toBeVisible();
  await survival.click();
  await expect(page.getByText('Defeated at 8 s', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('compares Faust’s special bolt with and without Cuora’s Shell Defense', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('tab', { name: 'Survival' }).click();
  await page.getByRole('combobox', { name: 'Choose enemy' }).fill('Faust');
  await page.getByRole('option', { name: /^Faust FA$/ }).click();
  await page.getByRole('combobox', { name: 'Choose defender' }).fill('Cuora');
  await page.getByRole('option', { name: 'Cuora', exact: true }).click();
  await page.getByText('Defender settings', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Max HP', exact: true }).fill('1000');
  await page.getByText('Defender settings', { exact: true }).click();
  await expect(page.getByText('Defeated at 20 s', { exact: true })).toBeVisible();
  await expect(page.getByText('Special bolt at 20 s', { exact: false }).last()).toBeVisible();

  await page.getByRole('combobox', { name: 'Enemy skill', exact: true }).click();
  await page.getByRole('option', { name: 'Basic attacks only', exact: true }).click();
  await expect(page.getByText('Defeated at 25 s', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Enemy skill', exact: true }).click();
  await page.getByRole('option', { name: 'Special bolt', exact: true }).click();
  await page.getByRole('combobox', { name: 'Defender skill', exact: true }).click();
  await page.getByRole('option', { name: /Shell Defense/ }).click();
  await expect(page.getByText('Survives 30 s', { exact: true })).toBeVisible();
  await expect(page.getByText(/Special bolt at 20 s · 240\.5 damage/)).toBeVisible();
  await page.getByRole('spinbutton', { name: 'Defender skill start (seconds)' }).fill('22');
  await expect(page.getByText('Defeated at 20 s', { exact: true })).toBeVisible();
});

test('models Patriot’s stances and Haruka’s full activation sequence', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('tab', { name: 'Survival' }).click();
  const pick = async (label: string, option: RegExp, query?: string) => {
    const input = page.getByRole('combobox', { name: label, exact: true });
    if (query) await input.fill(query); else await input.click();
    await page.getByRole('option', { name: option }).click();
  };
  await pick('Choose enemy', /^Patriot PT$/, 'Patriot');
  await pick('Choose defender', /^Cuora$/, 'Cuora');
  await expect(page.getByRole('combobox', { name: 'Patriot stance' })).toContainText('Marching Stance');
  await expect(page.getByText(/1,955 damage per hit · 4 hits per attack/)).toBeVisible();
  await pick('Patriot stance', /^Ruination Stance$/);
  await expect(page.getByText(/True damage aura · 100\.03 damage every 0\.8 s/)).toBeVisible();
  await pick('Defender position', /^High ground outside aura$/);
  await expect(page.getByText(/Spear throw at 18 s · 1,827 damage/)).toBeVisible();
  await expect(page.getByText(/True damage aura ·/)).toHaveCount(0);
  await pick('Defender position', /^High ground in aura$/);
  await expect(page.getByText(/True damage aura ·/)).toBeVisible();
  await pick('Add healer', /^Haruka$/, 'Haruka');
  await page.getByText('Edit healer', { exact: true }).click();
  await pick('Haruka skill timing', /^From deployment$/);
  const planned = page.getByRole('group', { name: 'Planned healer activations' });
  await expect(planned).toContainText('Haruka · 17–43 s, 60 s (permanent)');
  await expect(page.getByRole('combobox', { name: 'Skill activation', exact: true })).toHaveCount(0);
  await pick('Time window', /^90 s$/);
  await expect(page.getByRole('slider', { name: 'Inspect time' })).toHaveAttribute('max', '90');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('plots Patriot’s Marching, revival and Ruination on one HP timeline', async ({ page }) => {
  await page.goto('/dps-calculator');
  await page.getByRole('tab', { name: 'Survival' }).click();
  const pick = async (label: string, option: RegExp, query?: string) => {
    const input = page.getByRole('combobox', { name: label, exact: true });
    if (query) await input.fill(query); else await input.click();
    await page.getByRole('option', { name: option }).click();
  };
  await pick('Choose enemy', /^Patriot PT$/, 'Patriot');
  await pick('Choose defender', /^Cuora$/, 'Cuora');
  await page.getByText('Defender settings', { exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Max HP', exact: true }).fill('40000');
  await pick('Patriot stance', /^Full fight$/);
  const marching = page.getByRole('spinbutton', { name: 'Marching ends (s)' });
  await marching.fill('8');
  await expect(page.getByRole('combobox', { name: 'Time window' })).toContainText('120 s');
  await expect(page.getByText('Marching 0–8 s · Revival 8–68 s · Ruination from 68 s')).toBeVisible();
  await pick('Position after Marching', /^High ground in aura$/);
  const probe = page.getByRole('slider', { name: 'Inspect time' });
  const readout = page.getByRole('group', { name: 'HP at inspected time' });
  await probe.fill('15');
  await expect(readout).toContainText('Patriot phase · Revival');
  await probe.fill('86');
  await expect(readout).toContainText('Patriot phase · Ruination');
  await expect(readout).toContainText('Spear throw at 86 s');
  await marching.fill('12');
  await expect(page.getByText('Marching 0–12 s · Revival 12–72 s · Ruination from 72 s')).toBeVisible();
  await probe.fill('90');
  await expect(readout).toContainText('Spear throw at 90 s');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
