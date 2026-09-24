import { expect, test } from '@playwright/test';

test('operator artwork uses local zoom and Escape closes the viewer', async ({ page }) => {
  await page.goto('/operators/Botani');
  const trigger = page.getByRole('button', { name: /Enlarge Botani artwork/ });
  await trigger.click();
  const viewer = page.getByRole('dialog', { name: /artwork$/ });
  await expect(viewer).toBeVisible();

  const prevented = await viewer.evaluate(element => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  await expect(viewer.locator('.skin-zoom-image')).toHaveAttribute('style', /scale\(1\.2\)/);

  // Escape must work even if focus is moved outside the dialog by the browser.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
