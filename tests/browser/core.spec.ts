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
  // Measured from the skill tabs, the row above the title: the detail pane scrolls inside
  // itself, and Playwright's click may scroll it a pixel or two to bring the tab into
  // view (a real click does not), which is not the page moving the slider.
  const offset = () => slider.evaluate(el => el.getBoundingClientRect().top - el.closest('section')!.querySelector('[role="tablist"]')!.getBoundingClientRect().top);
  const top = await offset();
  for (const skill of [2, 3, 1]) {
    await page.getByRole('tab', { name: new RegExp(`^Skill ${skill}:`) }).click();
    const current = await offset();
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
  await expect(talents.locator('article')).toHaveCount(1);
  await expect(talents.getByRole('heading', { name: 'Tactical Configuration 1', exact: true })).toBeVisible();
  await expect(talents.getByRole('heading', { name: /Replaces/ })).toHaveCount(0);
  await expect(talents.getByText(/10% for 10 seconds/)).toBeVisible();
  await talents.getByRole('button', { name: 'Potential 6' }).click();
  await expect(talents.getByRole('heading', { name: 'Tactical Configuration 6', exact: true })).toBeVisible();
  await expect(talents.getByText(/20% for 20 seconds/)).toBeVisible();
  await expect(talents.getByText(/10% for 10 seconds/)).toBeHidden();
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

/* Voice-set switches, driven by keyboard: Playwright's click scrolls its target into view
   first, which a reader's click does not, and that would move the list before the page did.
   The detail panel scrolls on a desktop, the document on a phone. */
const voiceScroller = `(() => {
  for (let el = document.querySelector('#operator-voiceLines'); el && el !== document.body; el = el.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1) return el;
  }
  return document.scrollingElement;
})()`;
/** Picks a voice option by keyboard, and returns where the reader was just before the pick. */
async function pickVoiceOption(page: Page, label: string, value: string) {
  const trigger = page.locator('#operator-voiceLines').getByRole('combobox', { name: label });
  await trigger.evaluate((el: HTMLElement) => el.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  const menu = page.getByRole('listbox', { name: label });
  await expect(menu.getByRole('option', { name: value, exact: true })).toBeVisible();
  const index = await menu.getByRole('option').evaluateAll((options, text) => options.findIndex(option => option.textContent?.trim() === text), value);
  expect(index).toBeGreaterThanOrEqual(0);
  await page.keyboard.press('Home');
  for (let i = 0; i < index; i++) await page.keyboard.press('ArrowDown');
  const before = await voicePlace(page);
  await page.keyboard.press('Enter');
  return before;
}
async function pickVoice(page: Page, outfit: string, code: string) {
  // Outfits now have their own picker; retain the same scrolling and clip-folder assertions.
  const before = await pickVoiceOption(page, 'Voice outfit', outfit === 'Current recordings' ? 'Default outfit' : outfit);
  await pickVoiceOption(page, 'Voice language', code);
  return before;
}
/** The first line the reader sees under the sticky player, the space reserved under the
 *  list, and the scroller. */
async function voicePlace(page: Page) {
  return page.evaluate(`(() => {
    const s = ${voiceScroller};
    const player = document.querySelector('#operator-voiceLines [aria-label="Voice line player"]').getBoundingClientRect().bottom;
    const row = [...document.querySelectorAll('#operator-voiceLines li[data-line-id]')].find(li => li.getBoundingClientRect().bottom > player + 1);
    const list = document.querySelector('#operator-voiceLines ol');
    return { row: row ? { id: row.dataset.lineId, top: row.getBoundingClientRect().top } : null, rows: list.children.length,
      reserve: list.parentElement.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom,
      top: s.scrollTop, height: s.scrollHeight, client: s.clientHeight };
  })()`) as Promise<{ row: { id: string; top: number } | null; rows: number; reserve: number; top: number; height: number; client: number }>;
}
/** Puts the given fraction of the line list at the top of the scroller, once the page's art
 *  has loaded and cannot move it any more. */
async function scrollVoiceList(page: Page, fraction: number) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(`(() => {
    const s = ${voiceScroller};
    const list = document.querySelector('#operator-voiceLines ol').getBoundingClientRect();
    const top = s === document.scrollingElement ? 0 : s.getBoundingClientRect().top;
    s.scrollTop += list.top - top + list.height * ${fraction};
  })()`);
  await page.waitForTimeout(300);
}

/* An outfit with a voice of its own (Luo Xiaohei's Elite 2 art: 27 lines of its own and the 11
   in-battle and tap lines recorded again, which the game never plays) has its own entry in
   the voice outfit menu. Picking it switches the lines and the folder the clips come from,
   and a reader at the end of the list keeps the line they were reading where it was. */
test('an outfit voice set switches the lines and the clip folder, keeping the reader\'s line in place', async ({ page }) => {
  const requested: string[] = [];
  await page.route(pinnedGlob('arkpedia-voice-*'), async route => {
    requested.push(route.request().url());
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: Buffer.alloc(0) });
  });
  await page.goto('/operators/Luo%20Xiaohei#voiceLines');
  const voice = page.locator('#operator-voiceLines');
  await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
  await expect(voice.locator('ol > li')).toHaveCount(38);
  await page.waitForLoadState('networkidle');
  await page.evaluate(`(() => { const s = ${voiceScroller}; s.scrollTop = s.scrollHeight; })()`);
  await page.waitForTimeout(300);

  const trigger = voice.getByRole('combobox', { name: 'Voice language' });
  const before = await pickVoice(page, 'Elite 2', 'JP');
  expect(before.row, 'not vacuous: a line under the player').not.toBeNull();
  await expect(voice.getByText('Japanese · Elite 2')).toBeVisible();
  await expect(trigger).toContainText('Elite 2 outfit voice');
  await expect(voice.getByRole('group', { name: 'Voice line category' }).getByRole('button', { name: 'Unused', exact: true })).toBeVisible();
  await expect(voice.locator('ol > li')).toHaveCount(38);
  await expect(voice.locator('ol > li').filter({ hasText: 'Unused' })).toHaveCount(11);
  await page.waitForTimeout(300);
  const after = await voicePlace(page);
  expect(after.row?.id).toBe(before.row!.id);
  expect(Math.abs(after.row!.top - before.row!.top), 'the line the reader was reading stays where it was').toBeLessThanOrEqual(2);
  expect(after.reserve, 'only what that position lacks is reserved').toBeLessThan(after.client);

  await voice.locator('ol button:not([disabled])').first().evaluate((el: HTMLElement) => el.click());
  await expect.poll(() => requested.length).toBeGreaterThan(0);
  expect(requested[0]).toMatch(pinned('arkpedia-voice-japanese'));
  expect(requested[0]).toContain('/current/char_4067_lolxh%231/cn_001.mp3');

  // Back to the operator's own voice.
  await pickVoice(page, 'Current recordings', 'JP');
  await expect(voice.locator('ol > li').filter({ hasText: 'Unused' })).toHaveCount(0);
  await expect(trigger).not.toContainText('outfit voice');
  await withinBounds(page);
});

/* A set's text differs from the operator's (One More Story is CN-only, its text Chinese and far
   shorter): partway down the list, the line under the player stays where it was through the
   switch and back, and nothing is reserved -- the list's length below the reader is enough. */
test('a voice-set switch partway down the list keeps the line on screen in place', async ({ page }) => {
  await page.goto('/operators/Eyjafjalla%20the%20Hv%C3%ADt%20Aska#voiceLines');
  const voice = page.locator('#operator-voiceLines');
  await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
  await scrollVoiceList(page, 0.45);
  for (const [group, code, status] of [['One More Story', 'CN', 'Mandarin · One More Story'], ['A Picnic Before A Long Trip', 'EN', 'English · A Picnic Before A Long Trip'], ['Current recordings', 'EN', 'English']]) {
    const before = await pickVoice(page, group, code);
    expect(before.row, 'not vacuous: a line under the player').not.toBeNull();
    await expect(voice.getByText(status, { exact: true })).toBeVisible();
    await page.waitForTimeout(300);
    const now = await voicePlace(page);
    expect(now.row?.id, `${group}: the same line under the player`).toBe(before.row!.id);
    expect(Math.abs(now.row!.top - before.row!.top), `${group}: it stays where it was`).toBeLessThanOrEqual(2);
    expect(now.reserve, `${group}: nothing reserved partway down`).toBeLessThanOrEqual(1);
  }
});

/* Civilight Eterna's own voice has 81 rows (43 of them additional lines), Condolence 38. At the
   top of the list nothing is held: the page simply gets shorter below the reader. Among the
   rows Condolence does not have, the new list starts under the player, not 4000px of nothing. */
test('a much shorter voice set leaves no empty space under the reader', async ({ page }) => {
  await page.goto('/operators/Civilight%20Eterna#voiceLines');
  const voice = page.locator('#operator-voiceLines');
  await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
  await expect(voice.locator('ol > li')).toHaveCount(81);
  await scrollVoiceList(page, 0);
  const top = await pickVoice(page, 'Condolence', 'EN');
  await expect(voice.locator('ol > li')).toHaveCount(38);
  await page.waitForTimeout(300);
  const switched = await voicePlace(page);
  expect(switched.reserve, 'nothing reserved at the top of the list').toBeLessThanOrEqual(1);
  expect(switched.row?.id).toBe(top.row?.id);
  expect(Math.abs(switched.row!.top - top.row!.top)).toBeLessThanOrEqual(2);

  await pickVoice(page, 'Current recordings', 'EN');
  await expect(voice.locator('ol > li')).toHaveCount(81);
  await scrollVoiceList(page, 0.7);
  const deep = await pickVoice(page, 'Condolence', 'EN');
  expect(deep.row!.id, 'not vacuous: a row Condolence does not have').toMatch(/^EX_/);
  await expect(voice.locator('ol > li')).toHaveCount(38);
  await page.waitForTimeout(300);
  const start = await voicePlace(page);
  expect(start.reserve, 'no empty space under the shorter list').toBeLessThanOrEqual(1);
  expect(start.row?.id, 'the shorter list starts under the player').toBe('CN_001');
  expect(start.top + start.client).toBeLessThanOrEqual(start.height + 1);
  await withinBounds(page);
});

/* A clip still loading when the reader picks another voice set (or language): the switch pauses
   and reloads the player, which rejects the old play() with an AbortError. That request is
   over, and nothing failed in the new set: no "could not be loaded" message. */
test('switching voice set while a clip loads does not report a failed clip', async ({ page }) => {
  const wav = Buffer.alloc(44 + 8000 * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  await page.route(pinnedGlob('arkpedia-voice-*'), async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }).catch(() => {});
  });
  await page.goto('/operators/Skadi%20the%20Corrupting%20Heart#voiceLines');
  const voice = page.locator('#operator-voiceLines');
  await expect(voice.getByRole('searchbox', { name: 'Search voice lines' })).toBeVisible();
  const status = voice.locator('[aria-label="Voice line player"] [aria-live="polite"]');
  for (const [group, code, label] of [['Red Countess', 'EN', 'English · Red Countess'], ['Current recordings', 'JP', 'Japanese']]) {
    await voice.locator('ol > li').nth(2).getByRole('button').evaluate((el: HTMLElement) => el.click());
    await page.waitForTimeout(200);
    await pickVoice(page, group, code);
    await page.waitForTimeout(2200);
    await expect(status).toHaveText(label);
    await expect(status).not.toHaveAttribute('data-error', /.*/);
  }
});

test('operator search and planner entry are usable', async ({ page }) => {
  await page.goto('/operators');
  await page.getByRole('searchbox', { name: 'Search operators' }).fill('Penance');
  await expect(page.getByRole('link', { name: /Penance/ }).first()).toBeVisible();
  await withinBounds(page);
  await page.goto('/operator-planner');
  await expect(page.getByRole('heading', { name: 'Operator Planner' })).toBeVisible();
  await page.getByPlaceholder('Search operators…').fill('Penance');
  await expect(page.getByRole('option', { name: /Penance/ }).first()).toBeVisible();
  await page.getByRole('option', { name: /Penance/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await withinBounds(page);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

// OPERA_POPOUT_NOTICE in components/recruitment/RecruitmentTool.tsx.
const OPERA_NOTICE = 'Opera GX pop-outs do not stay on top of other windows. Use another browser for Always on Top.';

test('Opera GX without Document PiP opens a regular recruitment window and says it will not stay on top', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Opera GX is a desktop browser');
  // On the context, so the pop-out window is Opera too.
  await page.context().addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: `${navigator.userAgent} OPR/124.0.0.0`,
    });
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto('/recruitment');
  await expect(page.getByRole('button', { name: 'Open window', exact: true })).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open window', exact: true }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await expect(popup).toHaveURL(/\/recruitment\/popout/);
  await expect(popup.getByRole('heading', { name: 'Recruitment', exact: true })).toBeVisible();
  // The pop-out says it will not stay on top, in place of the usual note (kukki PR #73).
  await expect(popup.getByText(OPERA_NOTICE)).toBeVisible();
  await expect(page.getByText(OPERA_NOTICE)).toBeVisible();
  await popup.close();
});

test('Opera GX with Document PiP is offered the regular window, not On top', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Opera GX is a desktop browser');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: `${navigator.userAgent} OPR/114.0.0.0 (Edition GX)`,
    });
    // Opera GX has the API and opens the window, but the window does not stay on top.
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: { requestWindow: () => Promise.reject(new Error('must not be asked')), window: null },
    });
  });
  await page.goto('/recruitment');
  await expect(page.getByRole('button', { name: 'Open window', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On top', exact: true })).toHaveCount(0);
  await expect(page.getByText(OPERA_NOTICE)).toHaveCount(0);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open window', exact: true }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/recruitment\/popout/);
  await expect(page.getByText(OPERA_NOTICE)).toBeVisible();
  await popup.close();
});

test('a browser whose Document PiP is refused offers a regular window', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Document PiP uses a desktop window');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: () => Promise.reject(new Error('Document PiP rejected')),
        window: null,
      },
    });
  });
  await page.goto('/recruitment');
  await page.getByRole('button', { name: 'On top', exact: true }).click();
  await expect(page.getByText('Could not open the pop-out: Document PiP rejected')).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Open a regular window' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/recruitment\/popout/);
  await popup.close();
});

test('Stronghold Companion switches to a tab after Document PiP is refused', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Document PiP uses a desktop window');
  await page.addInitScript(() => {
    Object.defineProperty(window, 'documentPictureInPicture', {
      configurable: true,
      value: {
        requestWindow: () => Promise.reject(new Error('PiP unavailable')),
        window: null,
      },
    });
  });
  await page.goto('/game-modes/stronghold-protocol');
  await page.getByRole('button', { name: 'On top' }).click();
  await expect(page.getByText('Always-on-top is unavailable in this browser.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New tab' })).toBeVisible();
});

test('artwork uses pinned external files', async ({ request }) => {
  const response = await request.get('/six-star-skins/Penance%20-%20Base.webp', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(pinned('arkpedia-skin-assets'));
});
