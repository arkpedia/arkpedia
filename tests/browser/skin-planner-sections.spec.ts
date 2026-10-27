import { expect, test } from '@playwright/test';

test.setTimeout(120000);
for (const fashion of [false, true]) {
  test(`${fashion ? 'Fashion Review' : 'Normal'} shows open sections and defers distant artwork`, async ({ page }, testInfo) => {
    await page.goto('/skin-planner');
    if (fashion) await page.getByRole('button', { name: 'Fashion Review', exact: true }).click();
    const events = page.locator('h3.skin-plan-event');
    await expect(events.first()).toBeVisible();
    await expect(page.locator('button.skin-plan-event, .skin-plan-event[aria-expanded]')).toHaveCount(0);
    const cards = page.locator('.skin-plan-card');
    await expect.poll(() => cards.count()).toBeGreaterThan(12);
    // Pick a card well beyond the observer's preload distance. Its frame and text
    // exist, while neither the image element nor its download has started.
    await cards.evaluateAll(nodes => {
      const distant = nodes.find(node => node.getBoundingClientRect().top > innerHeight + 1000 && !node.querySelector('.skin-plan-art img'));
      if (!distant) throw new Error('No card beyond the viewport and preload distance');
      // Previously visible artwork stays loaded when switching shop filters.
      // Keep an unvisited node stable when earlier sections append another batch.
      distant.setAttribute('data-lazy-artwork-probe', 'true');
    });
    const distant = page.locator('[data-lazy-artwork-probe]');
    await expect(distant.locator('.skin-plan-art img')).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready);
    await expect.poll(() => cards.first().locator('.skin-plan-art img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.locator('.skin-plan-art img').evaluateAll(images => Promise.all(images.filter(image => {
      const bounds = image.getBoundingClientRect(); return bounds.bottom > 0 && bounds.top < innerHeight;
    }).map(image => (image as HTMLImageElement).decode().catch(() => {}))));
    await page.screenshot({ path: `.cache/feedback/screenshots/skin-sections-${fashion ? 'fashion' : 'normal'}-${testInfo.project.name}.png` });
    const art = distant.locator('.skin-plan-art');
    const height = (await art.boundingBox())!.height;
    await distant.scrollIntoViewIfNeeded();
    await expect(distant.locator('.skin-plan-art img')).toBeAttached();
    await expect(distant.locator('.skin-plan-art img')).toHaveAttribute('loading', 'lazy');
    expect((await art.boundingBox())!.height).toBeCloseTo(height, 0);
    // The end of the current batch grows automatically in either view.
    const before = await cards.count();
    await cards.last().scrollIntoViewIfNeeded();
    await expect.poll(() => cards.count()).toBeGreaterThan(before);
  });
}
