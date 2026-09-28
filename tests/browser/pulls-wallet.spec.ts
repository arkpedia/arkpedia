import { expect, test } from '@playwright/test';

/*
 * The pull planner's wallet fields share one line for their boxes (r11, 2026-09-28).
 * At 360 "Originite Prime" wraps to two lines beside a one-line "Orundum", and the row's
 * cells were centred, so its box sat 3px under Orundum's (styles/pulls/pulls-workspace
 * .module.css). At 320, 360 and 390, the boxes on each row of the wallet's grid start on
 * one line (1px) and are one height. Box edges only.
 */
test("the wallet's fields keep their boxes on one line when a label wraps", async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the two-column phone layout');
  await page.goto('/pulls');
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForTimeout(150);
    const boxes = await page.locator('[class*="wallet"] .pulls-field-box').evaluateAll((els) => els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top * 10) / 10, height: Math.round(r.height * 10) / 10, label: el.closest('.pulls-field')?.querySelector('.pulls-field-label')?.textContent?.trim() ?? '' };
    }));
    expect(boxes.length, `${width}px: the four wallet fields`).toBe(4);
    for (const [a, b] of [[0, 1], [2, 3]]) {
      expect(Math.abs(boxes[a].top - boxes[b].top), `${width}px: ${boxes[a].label} at ${boxes[a].top}, ${boxes[b].label} at ${boxes[b].top}`).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes[a].height - boxes[b].height), `${width}px: ${boxes[a].label} and ${boxes[b].label} are one height`).toBeLessThanOrEqual(1);
    }
  }
});
