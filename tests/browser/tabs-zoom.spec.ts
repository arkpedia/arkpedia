import { chromium, expect, test } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('skill underlines follow tabs at actual browser zoom, including 70%', async ({ baseURL }, info) => {
  test.skip(info.project.name !== 'desktop', 'Browser zoom is a desktop browser setting.');
  test.setTimeout(90000);
  const root = await mkdtemp(path.join(tmpdir(), 'arkpedia-tab-zoom-'));
  const extension = path.join(root, 'extension');
  await mkdir(extension);
  await writeFile(path.join(extension, 'manifest.json'), JSON.stringify({
    manifest_version: 3, name: 'Tab zoom regression', version: '1.0', permissions: ['tabs'],
    background: { service_worker: 'background.js' },
  }));
  await writeFile(path.join(extension, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
  const context = await chromium.launchPersistentContext(path.join(root, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    await context.addInitScript(() => localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({
      version: 1, analytics: false, externalMedia: false, externalMediaChosen: true, savedAt: Date.now(),
    })));
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = context.pages()[0];
    await page.goto(`${baseURL}/operators/Thorns%20the%20Lodestar#skills`);
    const list = page.locator('.op-skill-tabs');
    await expect(list).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
      for (const zoom of [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2]) {
        // Unlike CSS zoom or pinch emulation, tabs.setZoom changes real browser zoom.
        await worker.evaluate(async value => {
          const api = (globalThis as unknown as { chrome: { tabs: {
            query: (query: object) => Promise<{ id: number; url: string }[]>;
            setZoom: (id: number, zoom: number) => Promise<void>;
          } } }).chrome.tabs;
          const tab = (await api.query({})).find(tab => tab.url.includes('/operators/'))!;
          await api.setZoom(tab.id, value);
        }, zoom);
        for (const index of [0, 1, 2]) {
          await list.getByRole('tab').nth(index).click();
          await expect.poll(() => list.evaluate(element => {
            const tab = element.querySelector('[aria-selected="true"]')!;
            const bar = element.querySelector('.tabs-indicator')!;
            const t = tab.getBoundingClientRect(), b = bar.getBoundingClientRect();
            if (tab.getAnimations().length || bar.getAnimations().length) return Infinity;
            return Math.max(Math.abs(t.left - b.left), Math.abs(t.right - b.right), Math.abs(t.bottom - b.bottom));
          }), { message: `${theme}, ${zoom * 100}% zoom, skill ${index + 1}: underline matches tab` }).toBeLessThan(1);
        }
        if (zoom === 0.7) await page.screenshot({ path: info.outputPath(`skill-tabs-70-${theme}.png`) });
      }
    }
  } finally {
    await context.close();
    await rm(root, { recursive: true, force: true });
  }
});
