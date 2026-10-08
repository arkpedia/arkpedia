import { expect, test } from '@playwright/test';

test.describe('pull planner integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/pulls');
    await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
  });

  // Whatever the planner offers today, never a banner by name: it leaves out banners that have
  // ended, and naming Rage of The Many failed every Check from the day it ended (2026-10-01).
  test('adds several banners without closing the picker and loads shared operator art', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const choices = page.getByRole('button', { name: /^Add / });
    await expect(choices.first()).toBeVisible();
    expect(await choices.count(), 'more than one banner to add').toBeGreaterThan(1);
    const withArt = choices.filter({ has: page.locator('img') }).first();
    await expect(withArt.locator('img').first()).toHaveJSProperty('complete', true);
    const first = choices.first();
    const label = (await first.getAttribute('aria-label'))!.replace(/^Add /, '');
    await first.click();

    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('button', { name: `Added ${label}`, exact: true })).toBeDisabled();
    await expect(choices.first(), 'the next banner can still be added').toBeEnabled();
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
  });

  test('fits the viewport without horizontal page overflow', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add banner' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('schedule deep links add the requested banner', async ({ page }) => {
    // A link the schedule draws today (its "Plan" button on an event's row), followed.
    await page.goto('/schedule');
    const link = page.locator('a.events-row-plan[href*="/pulls?banner="]').first();
    await expect(link, 'the schedule links an upcoming banner to the planner').toBeAttached();
    const href = (await link.getAttribute('href'))!;
    const banner = new URL(href, 'http://localhost').searchParams.get('banner')!;
    await page.goto(href);
    await expect(page.getByRole('heading', { name: /Your banners 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: `Edit ${banner}`, exact: true })).toBeVisible();
  });
});

/*
 * Past events is one framed control, "PAST EVENTS  [ ] Include  +" (the maintainer,
 * 2026-09-27: "put the include checkbox inside the 'Past events' dropdown menu thing, but
 * in the actual dropdown menu button not as an element in the dropdown"). It was a
 * trigger with the checkbox beside it, outside its frame, and a second copy beside the
 * panel's heading for phones, hidden at every width. The disclosure button is the frame:
 * it paints the box like Income and Skin wishlist, and is the hit area
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

  test('a press on the setting ticks it, and anywhere else in the frame opens the popup', async ({ page }) => {
    const box = page.getByRole('checkbox', { name: 'Include past rewards in forecast' });
    const dialog = page.getByRole('dialog', { name: 'Past events' });
    const p = await parts(page);
    const cy = (p.button!.top + p.button!.bottom) / 2;
    const check = async (open: boolean, ticked: boolean) => {
      await expect(dialog).toHaveCount(open ? 1 : 0);
      await expect(box).toBeChecked({ checked: ticked });
    };
    const opens = async (x: number, y: number) => {
      await page.mouse.click(x, y);
      await check(true, false);
      await page.keyboard.press('Escape');
      await check(false, false);
    };
    await check(false, false);
    // The label's text (just past the box and its 8px gap), then the box itself.
    await page.mouse.click(p.box!.right + 12, cy);
    await check(false, true);
    await page.mouse.click((p.box!.left + p.box!.right) / 2, (p.box!.top + p.box!.bottom) / 2);
    await check(false, false);
    // The frame's start, the + at its end, the gap between the label and the +, and the
    // frame's edge above the label: each is the button, and opens the popup.
    await opens(p.button!.left + 6, cy);
    await opens((p.sign!.left + p.sign!.right) / 2, cy);
    await opens((p.label!.right + p.sign!.left) / 2, cy);
    // Halfway between the frame's top and the label's, on a whole pixel (a hit test on a
    // half pixel can round into the label).
    await opens((p.label!.left + p.label!.right) / 2, Math.floor((p.button!.top + p.label!.top) / 2));
  });

  test('the keyboard reaches the button, then the setting, each with a focus ring', async ({ page }) => {
    const button = page.locator('#tab-past');
    const box = page.getByRole('checkbox', { name: 'Include past rewards in forecast' });
    const dialog = page.getByRole('dialog', { name: 'Past events' });
    await page.locator('#tab-income').focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    const ring = (el: Element) => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; };
    expect(await button.evaluate(ring), 'the button shows the focus ring').toBe(true);
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    // Escape closes it, and focus goes back to the button that opened it.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(button).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(box).toBeFocused();
    expect(await box.evaluate(ring), 'the checkbox shows the focus ring').toBe(true);
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
    await expect(dialog).toHaveCount(0);
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
 * lines, Income beside Past events and the wishlist under them. Squeezed into one
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
    expect(Math.abs(income.top - past.top), `${width}: Income beside Past events`).toBeLessThanOrEqual(1);
    expect(skins.top, `${width}: the wishlist on the line under them`).toBeGreaterThanOrEqual(income.bottom);
    for (const [name, b] of [['Income', income], ['Past events', past], ['Skin wishlist', skins]] as const) {
      expect(Math.abs(b.h - 36), `${width}: ${name} is ${b.h}px, not the control height`).toBeLessThanOrEqual(1);
    }
  }
});

/*
 * The banner goal editor stacks its outcome under the goal choices at every width, so the
 * outcome is one stacked block: a hairline above it, no side rule and no indent. Above
 * 1000px it kept the side-by-side column's left rule and 24px indent, a stub of rule
 * beside "Chances per operator"; on a phone the chances disclosure drew a second rule
 * just under the first. Box edges and computed borders only.
 */
test('the goal editor\'s outcome is one stacked block with one rule', async ({ page }) => {
  await page.goto('/pulls');
  const banner = await page.evaluate(() => {
    const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
    const names = Object.keys(odds);
    return names.find((n) => odds[n].type === 'limited') ?? names[0] ?? null;
  });
  expect(banner).toBeTruthy();
  await page.goto(`/pulls?banner=${encodeURIComponent(banner!)}`);
  const editor = page.locator('.pulls-banner-editor').first();
  await expect(editor).toBeVisible();
  const measure = () => editor.evaluate((el) => {
    const outcome = el.querySelector('.pulls-goals-outcome')!;
    const s = getComputedStyle(outcome);
    const ruled = (st: CSSStyleDeclaration, side: string) => parseFloat(st.getPropertyValue(`border-${side}-width`)) > 0 && !/rgba\([^)]*,\s*0\)$|^transparent$/.test(st.getPropertyValue(`border-${side}-color`));
    const inputs = el.querySelector('.pulls-goals-inputs')!.getBoundingClientRect();
    const first = outcome.firstElementChild?.getBoundingClientRect();
    const details = el.querySelector('.pulls-copy-details');
    return {
      side: ruled(s, 'left') || ruled(s, 'right'), top: ruled(s, 'top'),
      indent: first ? Math.round((first.left - inputs.left) * 10) / 10 : null,
      below: outcome.getBoundingClientRect().top >= inputs.bottom - 0.5,
      detailsRule: details ? ruled(getComputedStyle(details), 'top') : false,
    };
  });
  const empty = await measure();
  expect(empty, 'with no goal picked').toMatchObject({ side: false, top: true, below: true });
  expect(Math.abs(empty.indent ?? 99), 'the outcome starts on the choices\' edge').toBeLessThanOrEqual(1);
  await editor.locator('.pulls-operator-option button').first().click();
  await expect(editor.locator('.pulls-copy-details')).toBeVisible({ timeout: 15000 });
  const picked = await measure();
  expect(picked, 'with a goal picked').toMatchObject({ side: false, top: true, below: true, detailsRule: false });
});

/* The Pull Planner's skin section and the Skin Planner are one plan (lib/skins/skinPlan): an
 * outfit planned in one is planned in the other (the maintainer's request, 2026-10-01). */
test('an outfit planned in the Pull Planner is planned on the Skin Planner', async ({ page }) => {
  await page.goto('/pulls');
  await page.getByRole('button', { name: /Skin wishlist/ }).click();
  const card = page.locator('#panel-skins .skin-plan-card-foot').first();
  test.skip(await page.getByText('No shop that sells outfits for Originite Prime is open or listed ahead.').count() > 0, 'no skin shop rotation is listed in this build');
  await expect(card).toHaveAttribute('aria-pressed', 'false');
  const label = await card.getAttribute('aria-label');
  await card.click();
  await expect(card).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/skin-planner');
  await expect(page.locator(`.skin-plan-card-foot[aria-label=${JSON.stringify(label)}]`).first()).toHaveAttribute('aria-pressed', 'true');
  // And back: unplanned there, it is unplanned here.
  await page.locator(`.skin-plan-card-foot[aria-label=${JSON.stringify(label)}]`).first().click();
  await page.goto('/pulls');
  await page.getByRole('button', { name: /Skin wishlist/ }).click();
  await expect(page.locator(`#panel-skins .skin-plan-card-foot[aria-label=${JSON.stringify(label)}]`).first()).toHaveAttribute('aria-pressed', 'false');
});

test('Skin Planner artwork opens without changing the plan and returns focus', async ({ page }) => {
  await page.goto('/skin-planner');
  const card = page.locator('.skin-plan-card').first();
  const plan = card.locator('.skin-plan-card-foot');
  const view = card.getByRole('button', { name: /^View .* artwork$/ });
  await expect(plan).toHaveAttribute('aria-pressed', 'false');
  await view.click();
  const gallery = page.getByRole('dialog', { name: /artwork$/ });
  await expect(gallery).toBeVisible();
  await gallery.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(view).toBeFocused();
  await expect(plan).toHaveAttribute('aria-pressed', 'false');
  await plan.click();
  await expect(plan).toHaveAttribute('aria-pressed', 'true');
  await view.click();
  await page.keyboard.press('Escape');
  await expect(gallery).toHaveCount(0);
  await expect(plan).toHaveAttribute('aria-pressed', 'true');
});

test('Fashion Review has its own planner inventory', async ({ page }) => {
  await page.goto('/skin-planner');
  await expect(page.getByRole('region', { name: /Fashion Review/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fashion Review', exact: true }).click();
  const fashion = page.getByRole('region', { name: /Fashion Review/ });
  await expect(fashion.first()).toBeVisible();
  expect(await fashion.locator('.skin-plan-card').count()).toBeGreaterThan(0);
  expect(await fashion.locator('.skin-plan-card').count()).toBeLessThanOrEqual(12);
  // The event headings stay collapsed while their Fashion Review inventories load in batches.
  const cards = page.locator('.skin-plan-card');
  expect(await cards.evaluateAll(nodes => nodes.every(node => node.closest('section[aria-label]')?.getAttribute('aria-label')?.includes('Fashion Review')))).toBe(true);
});
