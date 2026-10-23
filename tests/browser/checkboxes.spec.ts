import { expect, test, type Locator, type Page } from '@playwright/test';
import { PLANNER_PLAN, plannerExperimental, readOnly } from './census-routes';

/*
 * Booleans and options are checkboxes (docs/development/ui-primitives.md rule 3).
 *
 * #64 turned eleven of them into highlighted buttons -- the /pull-planner income sources, the
 * past-rewards and sparking settings, /recruitment's 4★+ filter, the music guesser's
 * Include CN -- and the maintainer asked for the checkboxes back (2026-09-26). This
 * holds each known option group to a real checkbox in the .check primitive: found by
 * role and name, toggled by its label, and drawn as the one box. audit:styles
 * (checkboxPrimitive, tglOutsideToolbar) catches a new .tgl or an unstyled box in the
 * source; this catches the same options turning back into buttons.
 */

/** A checkbox that is the .check box: in a label.check, drawn (appearance none), 18px. */
async function expectCheckPrimitive(box: Locator) {
  await expect(box).toBeVisible();
  const drawn = await box.evaluate((el) => {
    const s = getComputedStyle(el);
    return { label: !!el.closest('label.check'), appearance: s.appearance, width: Math.round(el.getBoundingClientRect().width), hit: Math.round(el.closest('label')!.getBoundingClientRect().height) };
  });
  expect(drawn.label, 'inside a label.check').toBe(true);
  expect(drawn.appearance).toBe('none');
  expect(drawn.width).toBe(18);
  expect(drawn.hit, 'the label is a 24px+ hit area').toBeGreaterThanOrEqual(24);
}

/** Clicking the label's text (not the box) toggles it, both ways. */
async function expectLabelToggles(page: Page, box: Locator) {
  const before = await box.isChecked();
  await box.scrollIntoViewIfNeeded();
  const where = (await box.boundingBox())!;
  // Just past the box and its 8px gap: the start of the label's text.
  const text = { x: where.x + where.width + 12, y: where.y + where.height / 2 };
  await page.mouse.click(text.x, text.y);
  await expect(box).toBeChecked({ checked: !before });
  await page.mouse.click(text.x, text.y);
  await expect(box).toBeChecked({ checked: before });
}

test('the pull planner settings are checkboxes', async ({ page }) => {
  await page.goto('/pull-planner');
  await expect(page.getByRole('heading', { name: 'Pull Planner' })).toBeVisible();
  const income = page.getByRole('group', { name: 'Recurring income' });
  for (const name of ['Daily missions', 'Weekly missions', 'Annihilation', 'Yellow cert shop', 'Green cert shop', 'Monthly card']) {
    await expectCheckPrimitive(income.getByRole('checkbox', { name, exact: true }));
  }
  await expect(income.getByRole('button')).toHaveCount(0);
  // Same behaviour as before #64: Daily missions starts on, and the monthly rate follows it.
  const daily = income.getByRole('checkbox', { name: 'Daily missions' });
  await expect(daily).toBeChecked();
  const rate = page.getByText(/pulls \/ 30 days/).locator('xpath=..').locator('strong');
  const on = await rate.textContent();
  await daily.uncheck();
  await expect(rate).not.toHaveText(on ?? '');
  await daily.check();
  await expect(rate).toHaveText(on ?? '');
  await expectLabelToggles(page, income.getByRole('checkbox', { name: 'Monthly card' }));

  // In the Past events frame at every width (it was beside the trigger on a desktop only).
  await expectCheckPrimitive(page.getByRole('checkbox', { name: 'Include past rewards in forecast' }));
  // The Past events popup's lists are ticked off item by item: each row's tick is a real
  // checkbox (its name beside it is the button that names the stages left).
  await page.getByRole('button', { name: /Past events/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Past events' });
  const story = dialog.getByRole('list', { name: /: claimed$/ }).first();
  await expect.poll(() => story.getByRole('checkbox').count()).toBeGreaterThan(3);
  const first = story.getByRole('checkbox').first();
  await expectCheckPrimitive(first);
  const before = await first.isChecked();
  await first.click();
  await expect(first).toBeChecked({ checked: !before });
  await first.click();
  await expect(first).toBeChecked({ checked: before });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Include sparking: shown for a limited banner's goals.
  const limited = await page.evaluate(() => {
    const odds = (window as unknown as { __NEXT_DATA__: { props: { pageProps: { bannerOdds: Record<string, { type: string }> } } } }).__NEXT_DATA__.props.pageProps.bannerOdds;
    return Object.keys(odds).find((name) => odds[name].type === 'limited') ?? null;
  });
  test.skip(!limited, 'no limited banner is scheduled in this build');
  await page.goto(`/pull-planner?banner=${encodeURIComponent(limited!)}`);
  const edit = page.getByRole('button', { name: `Edit ${limited}`, exact: true });
  await expect(edit).toBeVisible();
  if ((await edit.getAttribute('aria-expanded')) !== 'true') await edit.click();
  const spark = page.getByRole('checkbox', { name: 'Include sparking' });
  await expectCheckPrimitive(spark);
  await expectLabelToggles(page, spark);
});

test('the recruitment 4★+ filter is a checkbox', async ({ page }) => {
  await page.goto('/recruitment');
  const filter = page.getByRole('checkbox', { name: 'Prioritize 4★+ and Robots' });
  await expectCheckPrimitive(filter);
  await expect(filter).toBeChecked();
  await expectLabelToggles(page, filter);
});

test('the stage guesser chapter and event list is checkboxes', async ({ page }) => {
  await page.goto('/games/stage-guesser');
  await page.getByRole('group', { name: 'Collection' }).getByRole('button', { name: 'Custom', exact: true }).click();
  const list = page.locator('fieldset').filter({ has: page.getByText('Choose sources') }).getByRole('checkbox');
  await expect.poll(() => list.count()).toBeGreaterThan(10);
  await expectCheckPrimitive(list.first());
  await expectLabelToggles(page, list.first());
});

test('the music guesser Include CN and release list are checkboxes', async ({ page }) => {
  await page.goto('/games/music-guesser');
  const cn = page.getByRole('checkbox', { name: 'Include CN' });
  await expectCheckPrimitive(cn);
  await expectLabelToggles(page, cn);
  const all = page.getByRole('checkbox', { name: /^Select all / });
  await expect.poll(() => all.count()).toBeGreaterThan(0);
  await expectCheckPrimitive(all.first());
});

test('a disabled checkbox keeps a visible box', async ({ page }) => {
  await page.goto('/games/music-guesser');
  await expect(page.getByRole('checkbox', { name: 'Include CN' })).toBeVisible();
  // Built in place so the check does not depend on which releases are CN-only today.
  const boxes = await page.evaluate(() => {
    const make = (disabled: boolean) => {
      const label = document.createElement('label');
      label.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.disabled = disabled;
      label.append(input, 'probe');
      document.body.append(label);
      const s = getComputedStyle(input);
      return { border: s.borderTopColor, opacity: s.opacity };
    };
    return { enabled: make(false), disabled: make(true) };
  });
  expect(boxes.disabled.opacity).toBe('1');
  expect(boxes.disabled.border, 'the disabled box keeps the control border').toBe(boxes.enabled.border);
});

/*
 * The planner's two on/off choices (r10, 2026-09-27): whether to craft a material, on
 * each shortfall card, and whether you own the operator, in the roster window. Both were
 * buttons drawing their own tick box (rule 3's exact case), the first in a --line border
 * beside the stage codes. Now each is the .check box, and nothing in those places is a
 * pressed button.
 */
test('the planner\'s Craft and Owned are checkboxes', async ({ page }) => {
  await readOnly(page);
  await page.goto('/operator-planner');
  await plannerExperimental(page, PLANNER_PLAN);
  const cards = page.locator('.need-card');
  await expect(cards.first()).toBeVisible();
  await expect(page.locator('.need-cards [aria-pressed]'), 'no pressed buttons on the cards').toHaveCount(0);
  const craft = page.getByRole('checkbox', { name: /^Craft / });
  await expect.poll(() => craft.count(), 'a Craft checkbox on each craftable card').toBeGreaterThan(3);
  await expectCheckPrimitive(craft.first());
  // Ticking it declares the craft (2026-10-03): the card stays in Missing, ticked, and says
  // how many it will make; what it is made of joins the list, each saying what it is for.
  const name = (await craft.first().getAttribute('aria-label'))!.replace(/^Craft /, '');
  await craft.first().check();
  await expect(page.getByRole('checkbox', { name: `Craft ${name}`, exact: true })).toBeChecked();
  await expect(page.locator('.need-card').filter({ has: page.getByRole('checkbox', { name: `Craft ${name}`, exact: true }) })).toContainText('to craft');
  await expect(page.locator('.need-card-for').filter({ hasText: `for crafting ${name}` }).first()).toBeVisible();
  await page.getByRole('checkbox', { name: `Craft ${name}`, exact: true }).uncheck();

  await page.getByRole('button', { name: 'Your roster', exact: true }).click();
  await page.locator('.modal-box').getByRole('button', { name: /Surtr/ }).first().click();
  const owned = page.getByRole('checkbox', { name: 'Owned', exact: true });
  await expectCheckPrimitive(owned);
  await expect(owned, 'Surtr is in the roster').toBeChecked();
  await expect(page.locator('.modal-box [aria-pressed]').filter({ hasText: /^Owned$/ })).toHaveCount(0);
  await expectLabelToggles(page, owned);
});
