import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) {
  test(`full planner art keeps one size across cost views and operators (${theme})`, async ({ page }, info) => {
    await page.addInitScript(theme => {
      localStorage.setItem('theme', theme);
      localStorage.setItem('arkpedia:privacy:v1', JSON.stringify({ version: 1, analytics: false, externalMedia: false, savedAt: Date.now() }));
      const state = { elite: 2, level: 90, skillLevel: 7, masteryTargets: { 0: 3, 1: 3, 2: 3 }, moduleStageTargets: { 0: 3 },
        startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {} };
      localStorage.setItem('plannerState', JSON.stringify({ selectedNames: ['Surtr', 'Thorns', 'Executor'],
        builderStates: { Surtr: state, Thorns: state, Executor: state } }));
    }, theme);
    await page.goto('/planner');
    let size: { width: number; height: number } | undefined;
    for (const name of ['Surtr', 'Thorns', 'Executor']) {
      await page.getByRole('tab', { name, exact: true }).click();
      const art = page.locator('.simple-portrait img');
      await expect(art).toBeVisible();
      await expect.poll(() => art.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      for (const view of ['Total', 'Separate', 'Total']) {
        await page.getByRole('button', { name: view, exact: true }).click();
        const geometry = await art.evaluate(img => {
          const frame = img.parentElement!.getBoundingClientRect();
          const image = img.getBoundingClientRect();
          const caption = img.closest('.simple-portrait')!.querySelector('.simple-portrait-caption')!.getBoundingClientRect();
          const style = getComputedStyle(img);
          return { width: image.width, height: image.height, frameWidth: frame.width, frameHeight: frame.height,
            contained: style.objectFit === 'contain' && style.transform === 'none',
            overlapsCaption: Math.min(image.right, caption.right) > Math.max(image.left, caption.left)
              && Math.min(image.bottom, caption.bottom) > Math.max(image.top, caption.top) };
        });
        size ??= geometry;
        expect(geometry.width).toBeCloseTo(size.width, 0);
        expect(geometry.height).toBeCloseTo(size.height, 0);
        expect(geometry.width).toBeCloseTo(geometry.frameWidth, 0);
        expect(geometry.height).toBeCloseTo(geometry.frameHeight, 0);
        expect(geometry.contained, 'the full image fits without zooming or cropping').toBe(true);
        expect(geometry.overlapsCaption, 'the name does not cover the artwork').toBe(false);
      }
    }
    await page.screenshot({ path: `.cache/planner-portrait-${info.project.name}-${theme}.png` });
  });
}
