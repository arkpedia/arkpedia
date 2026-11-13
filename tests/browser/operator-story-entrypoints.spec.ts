import { expect, test } from '@playwright/test';

test('overview voice credits jump to the selected language and focus the recordings', async ({ page }) => {
  await page.goto('/operators/Amiya');
  await page.getByRole('button', { name: 'Jump to Japanese voice lines', exact: true }).click();
  await expect(page).toHaveURL(/#voiceLines$/);
  await expect(page.locator('#operator-voiceLines')).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Voice language', exact: true })).toHaveText('JP');
});

test('story guide opens the requested video only after consent and closes cleanly', async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Video fixture</title>' }));
  await page.goto('/story');
  const opener = page.getByRole('button', { name: 'How to read the story', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'How to read the story', exact: true });
  await expect(dialog.locator('iframe')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Play Arkpedia story-reading guide', exact: true }).click();
  await page.getByRole('button', { name: 'Allow external media', exact: true }).click();
  await expect(dialog.locator('iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/ew2htOBEyO0\?/);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
});
