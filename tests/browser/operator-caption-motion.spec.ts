import { expect, test } from '@playwright/test';

for (const theme of ['dark', 'light']) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`outfit name and price hand off without moving the gallery (${theme}, ${reducedMotion})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(value => localStorage.setItem('theme', value), theme);
    await page.goto('/operators/Aak');
    await page.getByRole('button', { name: 'Pause outfit autoplay', exact: true }).click();
    const choices = page.getByRole('group', { name: 'Operator outfits', exact: true });
    const current = page.locator('[data-current="true"]:has(> [data-caption-name])');
    await choices.getByRole('button', { name: 'Doctor of Faces', exact: true }).click();
    await expect(current.locator('[data-caption-name]')).toHaveText('Doctor of Faces');
    await expect(current.locator('[data-caption-price]')).toHaveText('18 OP');
    await page.waitForTimeout(550);
    const before = await page.locator('.op-carousel-main').boundingBox();
    const captionBox = await current.locator('..').boundingBox();
    await choices.getByRole('button', { name: 'Healing Hand, Evil Heart', exact: true }).click();
    await expect(current.locator('[data-caption-name]')).toHaveText('Healing Hand, Evil Heart');
    const outgoing = page.locator('[data-artwork-caption="exit"]');
    await expect(outgoing.locator('[data-caption-name]')).toHaveText('Doctor of Faces');
    await expect(outgoing).toHaveAttribute('aria-hidden', 'true');
    await expect(current).toHaveAttribute('aria-hidden', 'false');
    if (reducedMotion === 'reduce') {
      await expect(outgoing).toHaveCSS('visibility', 'hidden');
      expect(await current.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
      await expect(current.locator('[data-caption-name]')).toHaveCSS('transform', 'none');
    } else {
      // Freeze the handoff mid-frame: both pieces of ink move, their layout boxes do not.
      await current.locator('..').evaluate(el => {
        for (const animation of el.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 120; }
      });
      for (const field of ['data-caption-name', 'data-caption-price']) {
        const ink = async (selector: string) => page.locator(`${selector} > [${field}]`).evaluate(el => {
          const style = getComputedStyle(el);
          return { x: new DOMMatrix(style.transform).m41, opacity: Number(style.opacity) };
        });
        const old = await ink('[data-artwork-caption="exit"]'), next = await ink('[data-artwork-caption="enter"]');
        expect(old.x).toBeLessThan(0);
        expect(next.x).toBeGreaterThan(0);
        expect(old.opacity).toBeLessThan(1);
        expect(next.opacity).toBeGreaterThan(0);
        expect(next.opacity).toBeLessThan(1);
      }
      if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/caption-handoff-${theme}-${testInfo.project.name}.png` });
      await current.locator('..').evaluate(el => { for (const animation of el.getAnimations({ subtree: true })) animation.finish(); });
    }
    expect(await page.locator('.op-carousel-main').boundingBox()).toEqual(before);
    expect(await current.locator('..').boundingBox()).toEqual(captionBox);
    // Reverse, then change again before the previous handoff completes.
    await page.getByRole('button', { name: 'Show previous outfit', exact: true }).click();
    await expect(current.locator('[data-caption-name]')).toHaveText('Doctor of Faces');
    await page.getByRole('button', { name: 'Show next outfit', exact: true }).click();
    await expect(current.locator('[data-caption-name]')).toHaveText('Healing Hand, Evil Heart');
    await page.waitForTimeout(550);
    await expect(page.locator('[data-artwork-caption="exit"]')).toHaveCount(0);
    await expect(current.locator('[data-caption-name]')).toHaveCSS('opacity', '1');
    expect(await page.locator('.op-carousel-main').boundingBox()).toEqual(before);
    if (process.env.ARKPEDIA_QA_CAPTURE) await page.screenshot({ path: `${process.env.ARKPEDIA_QA_CAPTURE}/caption-settled-${theme}-${reducedMotion}-${testInfo.project.name}.png` });
  });
}
