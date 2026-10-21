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
  // Measured once the page has settled: fonts and late pictures still move it for a moment
  // after load, which is not a slide turning.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1000);
  const height = await panel.evaluate((e) => e.getBoundingClientRect().height);
  for (let i = 0; i < await dots.count(); i++) {
    await dots.nth(i).click();
    await expect(dots.nth(i)).toHaveAttribute('aria-current', 'true');
    await expect(panel.locator('.front-community-slide[data-current]')).toHaveCount(1);
    expect(await panel.evaluate((e) => e.getBoundingClientRect().height)).toBe(height);
  }
  // Under the pointer the slide does not turn away (the rotation is six seconds), and its card
  // lifts on a shadow as every picture card does (motion.spec.ts leaves the turning panel out).
  const item = panel.locator('.front-community-slide[data-current] .front-community-item');
  const rest = await item.evaluate((e) => getComputedStyle(e).boxShadow);
  await item.hover();
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => matchMedia('(hover: hover)').matches))) test.info().annotations.push({ type: 'no hover', description: 'a touch device: the lift is checked at desktop width' });
  else expect(await item.evaluate((e) => getComputedStyle(e).boxShadow)).not.toBe(rest);
  const shown = await panel.locator('.front-community-slide[data-current]').innerText();
  await page.waitForTimeout(6500);
  expect(await panel.locator('.front-community-slide[data-current]').innerText()).toBe(shown);
});
