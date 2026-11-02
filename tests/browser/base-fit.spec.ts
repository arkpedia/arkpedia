import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`base fits both dimensions and shares normal header spacing (${theme})`, async ({ page }, info) => {
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now() }));
    }, theme);
    await page.goto('/recruitment');
    await expect.poll(() => page.locator('.page-header').evaluate(el => getComputedStyle(el).paddingTop)).toBe('28px');
    const headerGap = await page.locator('.page-header').evaluate(el => el.querySelector('.eyebrow')!.getBoundingClientRect().top - el.getBoundingClientRect().top);
    await page.goto('/base');
    await page.locator('.base-setup-preset-card').first().click();
    await page.getByRole('button', { name: 'View base', exact: true }).click();
    await expect.poll(() => page.locator('.page-header').evaluate(el => el.querySelector('.eyebrow')!.getBoundingClientRect().top - el.getBoundingClientRect().top)).toBe(headerGap);
    const widths = info.project.name === 'mobile' ? [{ width: 320, height: 800 }, { width: 412, height: 600 }] : [{ width: 1440, height: 1000 }, { width: 1440, height: 600 }, { width: 1920, height: 1080 }];
    for (const viewport of widths) {
      await page.setViewportSize(viewport);
      const view = page.getByLabel('Zoomable base map', { exact: true });
      await expect.poll(() => view.evaluate(el => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight))).toBeLessThanOrEqual(1);
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
      await page.getByRole('button', { name: 'Fit base', exact: true }).click();
      await expect.poll(() => view.evaluate(el => Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight))).toBeLessThanOrEqual(1);
      const roomBounds = await view.evaluate(el => {
        const view = el.getBoundingClientRect();
        return [...el.querySelectorAll('.base-overview-room')].every(room => {
          const box = room.getBoundingClientRect();
          return box.left >= view.left && box.top >= view.top && box.right <= view.left + el.clientWidth && box.bottom <= view.top + el.clientHeight;
        });
      });
      expect(roomBounds).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await fs.mkdir('.cache/base-fit-qa', { recursive: true });
    await page.locator('.base-map').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.cache/base-fit-qa/${info.project.name}-${theme}.png` });
  });
}

