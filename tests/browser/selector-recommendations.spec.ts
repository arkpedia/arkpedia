import { expect, test } from '@playwright/test';
import { makeFriendFile } from '../../lib/account/friendFile';
import type { AccountRecord } from '../../lib/account/accountStore';

test('all ticket pools show signed, colored ratings and preserve the nested operator popup', async ({ page }) => {
  await page.goto('/selector-tickets');
  await expect(page.getByText('Kukkikaze ratings are pending.', { exact: false })).toHaveCount(0);
  // Five cards since #381/#386: the starter (beginner) selector and the newcomer pack join the three tickets.
  await expect(page.locator('.selector-card img')).toHaveCount(5);
  for (const [ticket, count] of [
    ['Special Event Transfer Permit', 8],
    ['2026 Celebration Operator Permit', 35],
    ['Top Operator Transfer Permit - Kernel', 48],
  ] as const) {
    const trigger = page.getByRole('button', { name: `${ticket}: selectable operators`, exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: ticket, exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.selector-score')).toHaveCount(count);
    for (const text of await dialog.locator('.selector-score').allTextContents()) expect(text).toMatch(/^(?:[+-]\d+(?:\.\d+)?|0)$/);
    if (ticket === '2026 Celebration Operator Permit') {
      const ines = dialog.getByRole('button', { name: /^Ines: operator preview/ });
      await expect(ines.locator('.selector-score-middle')).toHaveText('+4.25');
      await expect(ines).toHaveAttribute('title', /Invisibility reveal talent: \+0\.25/);
    }
    if (ticket.includes('Kernel')) {
      const siege = dialog.getByRole('button', { name: /^Siege: operator preview/ });
      await expect(siege.locator('.selector-score-negative')).toHaveText('-2');
      await expect(dialog.getByRole('button', { name: /^Ceobe: operator preview/ }).locator('.selector-score-middle')).toHaveText('+1.75');
      await expect(dialog.getByRole('button', { name: /^Saria: operator preview/ }).locator('.selector-score-middle')).toHaveText('+3');
      const silverAsh = dialog.getByRole('button', { name: /^SilverAsh: operator preview/ });
      await expect(silverAsh.locator('.selector-score-middle')).toHaveText('+2.25');
      await expect(silverAsh).toHaveAttribute('title', /Invisibility reveal talent: \+0\.25/);
      await siege.click();
      await expect(page.getByRole('dialog', { name: 'Siege', exact: true })).toBeVisible();
      await expect(page).toHaveURL(/\/selector-tickets$/);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeVisible();
      await expect(siege).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('imported own roster changes coverage scores while friend ownership stays separate', async ({ page }) => {
  const own: AccountRecord = { version: 1, server: 'en', importedAt: '2026-10-10T00:00:00Z', doctor: 'My Doctor', operators: [], skins: [], cleared: [] };
  const friend = makeFriendFile({ ...own, doctor: 'Friend Doctor', operators: ['Ceobe'] }, {}, new Date('2026-10-10T00:00:00Z'));
  await page.addInitScript(({ own, friend }) => {
    localStorage.setItem('arkpediaAccount', JSON.stringify(own));
    localStorage.setItem('arkpediaFriend', JSON.stringify(friend));
  }, { own, friend });
  await page.goto('/selector-tickets');
  await expect(page.getByText(/Using My Doctor/)).toBeVisible();
  await page.getByRole('button', { name: 'Top Operator Transfer Permit - Kernel: selectable operators', exact: true }).click();
  const ceobe = page.getByRole('button', { name: /^Ceobe: operator preview/ });
  await expect(ceobe.locator('.selector-score')).toHaveText('+2.25');
  await expect(ceobe).not.toContainText('Owned');
  await expect(ceobe).toHaveAttribute('title', /Arts coverage: lacking Arts dealers/);
});

test('four owned Casters and Supporters combined block the Arts coverage bonus', async ({ page }) => {
  const own: AccountRecord = { version: 1, server: 'en', importedAt: '2026-10-12T00:00:00Z', doctor: 'Mixed roster', operators: ['Eyjafjalla', 'Ifrit', 'Angelina', 'Suzuran'], skins: [], cleared: [] };
  await page.addInitScript(own => localStorage.setItem('arkpediaAccount', JSON.stringify(own)), own);
  await page.goto('/selector-tickets');
  await page.getByRole('button', { name: 'Top Operator Transfer Permit - Kernel: selectable operators', exact: true }).click();
  const ceobe = page.getByRole('button', { name: /^Ceobe: operator preview/ });
  await expect(ceobe.locator('.selector-score')).toHaveText('+1.75');
  await expect(ceobe).not.toHaveAttribute('title', /Arts coverage/);
});

test('personalization keeps popup geometry, changes scores, persists choices, and restores defaults', async ({ page }) => {
  await page.goto('/selector-tickets');
  const ticket = page.getByRole('button', { name: 'Special Event Transfer Permit: selectable operators', exact: true });
  await ticket.click();
  const dialog = page.getByRole('dialog', { name: 'Special Event Transfer Permit', exact: true });
  const before = await dialog.boundingBox();
  const mizuki = dialog.getByRole('button', { name: /^Mizuki: operator preview/ }).locator('.selector-score');
  await expect(mizuki).toHaveText('-0.75');
  await dialog.getByRole('button', { name: 'Personalize recommendations', exact: true }).click();
  expect(await dialog.boundingBox()).toEqual(before);
  // Every scoring component is a Yes/No choice since #381 (it was On/Off for this one).
  const subSkills = dialog.getByRole('group', { name: 'Sub priority skills', exact: true });
  await expect(subSkills.getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await subSkills.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('button', { name: 'Personalize recommendations', exact: true })).toBeFocused();
  // Three sub priority skills add +0.3. No unconditional IS/RA +0.5 any more (#375: "I like IS" is opt-in).
  await expect(mizuki).toHaveText('-0.45');
  await page.reload();
  await ticket.click();
  await dialog.getByRole('button', { name: 'Personalize recommendations', exact: true }).click();
  await expect(subSkills.getByRole('button', { name: 'Yes', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('group', { name: 'Lack Arts damage dealers', exact: true }).getByRole('button', { name: 'Yes', exact: true }).click();
  await dialog.getByRole('button', { name: 'Show recommendations', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /^Surtr: operator preview/ }).locator('.selector-score')).toHaveText('+3');
  await dialog.getByRole('button', { name: 'Personalize recommendations', exact: true }).click();
  await dialog.getByRole('button', { name: 'Reset defaults', exact: true }).click();
  await expect(subSkills.getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Show recommendations', exact: true }).click();
  await expect(dialog.getByRole('button', { name: /^Surtr: operator preview/ }).locator('.selector-score')).toHaveText('+2.5');
});

test('a How to Use video sits under its portrait and the other portraits keep the row even', async ({ page }, info) => {
  // Fixture props: the videos are editorial data (operator guides in arkpedia-data), not this build's.
  const VIDEO = 'S0zeA3uXINI';
  let given = false;
  await page.route(url => url.pathname === '/selector-tickets', async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      // Surtr in the gifted ticket alone has one, whatever the bundled records' guides say, so the
      // Kernel ticket below is a list with no video at all.
      for (const [name, ticket] of Object.entries(data.props.pageProps.tickets) as [string, { operators: { name: string; howToUseVideoId?: string | null }[] }][]) {
        for (const op of ticket.operators) {
          const video = name === 'Special Event Transfer Permit' && op.name === 'Surtr';
          op.howToUseVideoId = video ? VIDEO : null;
          given ||= video;
        }
      }
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.goto('/selector-tickets');
  expect(given, 'the page carries its tickets in __NEXT_DATA__ and Surtr is in one').toBe(true);
  await page.getByRole('button', { name: 'Special Event Transfer Permit: selectable operators', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Special Event Transfer Permit', exact: true });
  const link = dialog.getByRole('link', { name: 'How to use Surtr (YouTube video by Kukkikaze)', exact: true });
  await expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${VIDEO}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(link).toHaveText(/How to use/);
  // One link and seven "Coming soon" lines: this ticket's videos are on the way, so the
  // operators without one say so on the line a link would take.
  await expect(dialog.locator('.selector-howto')).toHaveCount(1);
  await expect(dialog.locator('.selector-howto-none')).toHaveCount(7);
  await expect(dialog.locator('.selector-howto-soon')).toHaveCount(7);
  await expect(dialog.locator('.selector-howto-soon').first()).toHaveText(/^Coming soon/);
  // Per row of the grid (a long name may wrap and make one row taller than another): every
  // portrait button is one height and every link line starts at one height, link or not.
  const rows = await dialog.locator('.event-selector-cell').evaluateAll(cells => {
    const byRow = new Map<number, { button: number; line: number }[]>();
    for (const cell of cells) {
      const top = Math.round(cell.getBoundingClientRect().top);
      const button = Math.round(cell.querySelector('.event-selector-operator')!.getBoundingClientRect().height);
      const line = Math.round(cell.querySelector('.selector-howto, .selector-howto-none')!.getBoundingClientRect().top);
      byRow.set(top, [...(byRow.get(top) ?? []), { button, line }]);
    }
    return [...byRow.values()];
  });
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(new Set(row.map(cell => cell.button)).size, `portrait buttons ${JSON.stringify(row)}`).toBe(1);
    expect(new Set(row.map(cell => cell.line)).size, `link lines ${JSON.stringify(row)}`).toBe(1);
  }
  const box = await link.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 44 : 28);
  // The portrait still opens the operator preview; the link is outside its button.
  await expect(dialog.getByRole('button', { name: /^Surtr: operator preview/ }).getByRole('link')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // A ticket without any video adds nothing under its portraits.
  await page.getByRole('button', { name: 'Top Operator Transfer Permit - Kernel: selectable operators', exact: true }).click();
  const kernel = page.getByRole('dialog', { name: 'Top Operator Transfer Permit - Kernel', exact: true });
  await expect(kernel).toBeVisible();
  await expect(kernel.locator('.selector-howto, .selector-howto-none')).toHaveCount(0);
});
