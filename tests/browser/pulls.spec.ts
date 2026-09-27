import { expect, test } from '@playwright/test';

test.describe('pull planner integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pulls');
    await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
  });

  test('adds several banners without closing the picker and loads shared operator art', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const zima = page.getByRole('button', { name: /Add Zima the Raging Tide/ });
    await expect(zima.locator('img')).toHaveCount(1);
    await expect(zima.locator('img')).toHaveJSProperty('complete', true);
    await zima.click();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Added Zima the Raging Tide/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Add Closure/ })).toBeEnabled();
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
  });

  test('fits the viewport without horizontal page overflow', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('schedule deep links add the requested banner', async ({ page }) => {
    await page.goto('/pulls?banner=Rage%20of%20The%20Many');
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Edit Rage of The Many/ })).toBeVisible();
  });
});

/*
 * Past events is one framed control, "PAST EVENTS  [ ] Include  +" (the maintainer,
 * 2026-09-27: "put the include checkbox inside the 'Past events' dropdown menu thing, but
 * in the actual dropdown menu button not as an element in the dropdown"). It was a
 * trigger with the checkbox beside it, outside its frame, and a second copy beside the
 * panel's heading for phones, hidden at every width. The disclosure button is the frame:
 * it paints the box like Income & events and Skin wishlist, and is the hit area
 * everywhere but the setting. The checkbox is its sibling laid over it, never inside it
 * (a <button> may not hold an input, and the accessibility tree flattens one that does).
 * Box edges only: nothing here reads a text width.
 */
test.describe('the Past events frame holds its Include setting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pulls');
    await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
  });

  const parts = (page: import('@playwright/test').Page) => page.evaluate(() => {
    const button = document.getElementById('tab-past')!;
    const frame = button.parentElement!;
    const box = frame.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    const label = box?.closest('label') ?? null;
    const rect = (el: Element | null) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height }; };
    const spans = Array.from(button.children);
    return {
      inButton: button.querySelectorAll('input, label').length,
      labelIsSibling: !!label && label.parentElement === frame && !button.contains(label),
      labelClass: label?.className ?? '',
      boxName: box?.getAttribute('aria-label') ?? null,
      copies: document.querySelectorAll('input[type="checkbox"][aria-label="Include past rewards in forecast"]').length,
      frame: rect(frame), button: rect(button), label: rect(label), box: rect(box),
      text: rect(spans[0] ?? null), sign: rect(spans[spans.length - 1] ?? null),
      siblings: ['tab-income', 'tab-skins'].map((id) => rect(document.getElementById(id))),
    };
  });

  test('its structure, its box and its row', async ({ page }) => {
    const p = await parts(page);
    expect(p.inButton, 'nothing to tick inside the <button>').toBe(0);
    expect(p.labelIsSibling, 'the Include label is the button\'s sibling in the frame').toBe(true);
    expect(p.labelClass).toMatch(/(?:^|\s)check(?:\s|$)/);
    expect(p.boxName).toBe('Include past rewards in forecast');
    expect(p.copies, 'one Include checkbox on the page (the hidden phone copy is gone)').toBe(1);
    const { frame, button, label, box, text, sign, siblings } = p;
    // The button is the frame, and the setting sits inside its box, before its +.
    for (const side of ['left', 'right', 'top', 'bottom'] as const) expect(Math.abs(button![side] - frame![side]), `the button fills the frame (${side})`).toBeLessThanOrEqual(1);
    expect(label!.left).toBeGreaterThanOrEqual(button!.left);
    expect(label!.right).toBeLessThanOrEqual(button!.right);
    expect(label!.top).toBeGreaterThanOrEqual(button!.top - 0.5);
    expect(label!.bottom).toBeLessThanOrEqual(button!.bottom + 0.5);
    expect(text!.right, '"Past events" never runs under the checkbox').toBeLessThanOrEqual(label!.left + 0.5);
    expect(sign!.left, 'the + comes after the checkbox').toBeGreaterThanOrEqual(label!.right - 0.5);
    // One height and one centre line with the two other triggers, and the box on it.
    for (const s of siblings) {
      expect(Math.abs(s!.h - button!.h), `the frame is ${button!.h}px, a sibling trigger ${s!.h}px`).toBeLessThanOrEqual(1);
      if (Math.abs(s!.top - button!.top) < button!.h) expect(Math.abs((s!.top + s!.bottom) / 2 - (button!.top + button!.bottom) / 2), 'one centre line with the trigger beside it').toBeLessThanOrEqual(1);
    }
    expect(Math.abs((box!.top + box!.bottom) / 2 - (button!.top + button!.bottom) / 2), 'the checkbox is on the frame\'s centre line').toBeLessThanOrEqual(1);
  });

  test('a press on the setting ticks it, and anywhere else in the frame opens the panel', async ({ page }) => {
    const button = page.locator('#tab-past');
    const box = page.getByRole('checkbox', { name: 'Include past rewards in forecast' });
    const panel = page.locator('#panel-past');
    const p = await parts(page);
    const cy = (p.button!.top + p.button!.bottom) / 2;
    const check = async (expanded: boolean, ticked: boolean) => {
      await expect(button).toHaveAttribute('aria-expanded', String(expanded));
      await expect(panel).toBeVisible({ visible: expanded });
      await expect(box).toBeChecked({ checked: ticked });
    };
    await check(false, false);
    // The label's text (just past the box and its 8px gap), then the box itself.
    await page.mouse.click(p.box!.right + 12, cy);
    await check(false, true);
    await page.mouse.click((p.box!.left + p.box!.right) / 2, (p.box!.top + p.box!.bottom) / 2);
    await check(false, false);
    // The frame's start, the + at its end, the gap between the label and the +, and the
    // frame's edge above the label: each is the button.
    await page.mouse.click(p.button!.left + 6, cy);
    await check(true, false);
    await page.mouse.click((p.sign!.left + p.sign!.right) / 2, cy);
    await check(false, false);
    await page.mouse.click((p.label!.right + p.sign!.left) / 2, cy);
    await check(true, false);
    // Halfway between the frame's top and the label's, on a whole pixel (a hit test on a
    // half pixel can round into the label).
    await page.mouse.click((p.label!.left + p.label!.right) / 2, Math.floor((p.button!.top + p.label!.top) / 2));
    await check(false, false);
  });

  test('the keyboard reaches the button, then the setting, each with a focus ring', async ({ page }) => {
    const button = page.locator('#tab-past');
    const box = page.getByRole('checkbox', { name: 'Include past rewards in forecast' });
    await page.locator('#tab-income').focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const ring = (el: Element) => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; };
    expect(await button.evaluate(ring), 'the button shows the focus ring').toBe(true);
    await page.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('Tab');
    await expect(box).toBeFocused();
    expect(await box.evaluate(ring), 'the checkbox shows the focus ring').toBe(true);
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('the setting is saved', async ({ page }) => {
    const box = page.getByRole('checkbox', { name: 'Include past rewards in forecast' });
    await box.check();
    await page.waitForTimeout(400);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: 'Include past rewards in forecast' })).toBeChecked();
  });
});

/* Between the phone's one column and the full row (701-900px) the three triggers take two
 * lines, Income & events beside Past events and the wishlist under them. Squeezed into one
 * line their labels wrapped to two (46px triggers at 701-760px), and the Past events frame
 * holds the checkbox too. Box edges only: at these widths each trigger has 300px or more. */
test('between a phone and the full row the triggers take two lines, each a control tall', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'window widths, set here');
  for (const width of [760, 860]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/pulls');
    const [income, past, skins] = await page.evaluate(() => ['tab-income', 'tab-past', 'tab-skins'].map((id) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: Math.round(r.height * 10) / 10 };
    }));
    expect(Math.abs(income.top - past.top), `${width}: Income & events beside Past events`).toBeLessThanOrEqual(1);
    expect(skins.top, `${width}: the wishlist on the line under them`).toBeGreaterThanOrEqual(income.bottom);
    for (const [name, b] of [['Income & events', income], ['Past events', past], ['Skin wishlist', skins]] as const) {
      expect(Math.abs(b.h - 36), `${width}: ${name} is ${b.h}px, not the control height`).toBeLessThanOrEqual(1);
    }
  }
});

