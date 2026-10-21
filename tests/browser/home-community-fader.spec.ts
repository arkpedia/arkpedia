import { test, expect } from '@playwright/test';

/*
 * The home page's Community panel turns between a live stream, a video and the next community
 * event (components/home/CommunityFader.tsx). Every slide stays in the markup, stacked in one
 * cell, so the panel is as tall as its tallest slide: turning one never moves the page. A long
 * event name once made the panel a line taller every six seconds (2026-10-21).
 */
test('the Community panel keeps its height as its slides turn, and holds still under the pointer', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('.front-community-panel');
  const dots = panel.locator('.front-community-dot');
  test.skip((await dots.count()) < 2, 'one slide to feature today: nothing turns');
  const height = await panel.evaluate((e) => e.getBoundingClientRect().height);
  for (let i = 0; i < await dots.count(); i++) {
    await dots.nth(i).click();
    await expect(dots.nth(i)).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('.front-community-slide[data-current]')).toHaveCount(1);
    expect(await panel.evaluate((e) => e.getBoundingClientRect().height)).toBe(height);
  }
  // Under the pointer the slide does not turn away (the rotation is six seconds).
  await panel.locator('.front-community-slide[data-current] .front-community-item').hover();
  const shown = await panel.locator('.front-community-slide[data-current]').innerText();
  await page.waitForTimeout(6500);
  expect(await panel.locator('.front-community-slide[data-current]').innerText()).toBe(shown);
});
