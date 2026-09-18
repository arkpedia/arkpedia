import { expect, test, Page } from '@playwright/test';
import cdn from '../../config/asset-delivery.json';

async function withinBounds(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'Page must not scroll horizontally').toBeLessThanOrEqual(1);
}

// No third-party media is needed to test controls. Network asset integrity is
// checked independently by check:published-assets and public asset CI.
test('operator section navigation and skill controls stay stable', async ({ page }) => {
  await page.goto('/operators/Thorns%20the%20Lodestar#skills');
  const slider = page.getByRole('slider', { name: 'Skill level', exact: true });
  await expect(slider).toBeVisible();
  const top = await slider.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  for (const skill of [2, 3, 1]) {
    await page.getByRole('button', { name: new RegExp(`^Skill ${skill}:`) }).click();
    const current = await slider.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    expect(Math.abs(current - top), 'Skill names and recommendations must not shift the slider').toBeLessThanOrEqual(1);
  }
  await slider.focus();
  const before = await slider.inputValue();
  await slider.press(Number(before) ? 'ArrowLeft' : 'ArrowRight');
  await expect(slider).not.toHaveValue(before);
  await withinBounds(page);
  await page.getByRole('combobox', { name: 'Jump to section' }).click();
  await page.getByRole('option', { name: 'Stats', exact: true }).click();
  await expect(page).toHaveURL(/#stats$/);
  await page.reload();
  await expect(page.locator('#operator-stats')).toBeVisible();
  await withinBounds(page);
});

test('low-rarity operator tiers and scraped talent names render cleanly', async ({ page }) => {
  const essentialRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/essential-icons/')) essentialRequests.push(request.url());
  });
  await page.goto('/operators/Castle-3#baseSkills');
  await expect(page.locator('#operator-baseSkills')).toBeVisible();
  await expect.poll(() => essentialRequests.some(url => /Elite(?:%20| )0\.webp/.test(url))).toBe(true);
  expect(essentialRequests.some(url => /Level(?:%20| )30\.webp/.test(url)), 'Level 30 must reuse the existing Elite 0 icon').toBe(false);
  await withinBounds(page);

  await page.goto('/operators/Castle-3#talents');
  const talents = page.locator('#operator-talents');
  await expect(talents).toBeVisible();
  await expect(talents.getByRole('heading', { name: 'Tactical Configuration 2', exact: true })).toBeVisible();
  await expect(talents.getByRole('heading', { name: /Replaces/ })).toHaveCount(0);
  await withinBounds(page);
});

// Where readers load published media from is one template (config/asset-delivery.json), so the
// tests read it too rather than hard-coding a host: a delivery-network change must not
// turn into four red browser tests. `pinned` is the address prefix for one repository at
// any 40-hex commit; `pinnedGlob` is the same shape as a Playwright route pattern.
const prefix = cdn.template.split('{path}')[0];
const pinned = (repository: string) => new RegExp('^' + prefix.replace('{repository}', repository).replace('{revision}', '[a-f0-9]{40}').replace(/[.]/g, '\\.'));
const pinnedGlob = (repository: string) => prefix.replace('{repository}', repository).replace('{revision}', '*') + '**';

test('voice playback requests the pinned source and can pause', async ({ page }) => {
  // A short local generated WAV makes playback deterministic and avoids downloading
  // game audio in every CI run. It still exercises the real browser media element.
  const wav = Buffer.alloc(44 + 8000 * 2 * 3);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  const requested: string[] = [];
  await page.route(pinnedGlob('arkpedia-voice-*'), async route => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: wav });
  });
  await page.goto('/operators/Kroos#voiceLines');
  const voice = page.locator('#operator-voiceLines');
  await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
  await voice.locator('ol button:not([disabled])').first().click();
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toMatch(pinned('arkpedia-voice-[^/@]+'));
  await expect.poll(() => voice.locator('audio').evaluate((el: HTMLAudioElement) => el.paused)).toBe(false);
  await voice.locator('ol button').first().click();
  await expect.poll(() => voice.locator('audio').evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await voice.getByRole('searchbox', { name: 'Search voice lines' }).fill('unlikely-no-matching-line');
  await expect(voice.getByText('No voice lines match.')).toBeVisible();
  await withinBounds(page);
});

test('operator search and planner entry are usable', async ({ page }) => {
  await page.goto('/operators');
  await page.getByRole('searchbox', { name: 'Search operators' }).fill('Penance');
  await expect(page.getByRole('link', { name: /Penance/ }).first()).toBeVisible();
  await withinBounds(page);
  await page.goto('/planner');
  await expect(page.getByRole('heading', { name: 'Operator Planner' })).toBeVisible();
  await page.getByPlaceholder('Search operators…').fill('Penance');
  await expect(page.getByRole('button', { name: /Penance/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Penance/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await withinBounds(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Opera GX uses the recruitment popup fallback', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Opera GX is a desktop browser');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: `${navigator.userAgent} OPR/124.0.0.0`,
    });
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: () => { throw new Error('Opera GX rejected document PiP'); },
        window: null,
      },
    });
  });
  await page.goto('/recruitment');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Pop out', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/recruitment\/popout/);
  await expect(popup.getByRole('heading', { name: 'Recruitment', exact: true })).toBeVisible();
  await popup.close();
});

test('artwork uses pinned external files', async ({ request }) => {
  const response = await request.get('/six-star-skins/Penance%20-%20Base.webp', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(pinned('arkpedia-skin-assets'));
});
