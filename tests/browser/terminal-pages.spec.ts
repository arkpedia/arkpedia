import { expect, test, type Page } from '@playwright/test';

/*
 * The catalogue and terminal pages -- /stages/*, /gamemodes*, /enemies, /techniques,
 * /synergies. One test per bug the 2026-09-25 UI review found on them (REVIEW.md
 * §4.2 and §4.3 I), each measured on the rendered page, because every one of these
 * passed typecheck, lint and a green build while it was broken.
 */

/** WCAG contrast of two sRGB colours given as [r, g, b] in 0-255. */
function contrast(a: number[], b: number[]): number {
  const lum = (c: number[]) => {
    const [r, g, bl] = c.map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Puts `selector` at `topPx` from the viewport's top, runs `act`, and returns how far
 *  it moved on screen afterwards -- the Anti-Page Jump measure (arkpedia-ui skill). */
async function anchorMoved(page: Page, selector: string, act: () => Promise<void>, topPx = 160): Promise<number> {
  await page.locator(selector).first().waitFor({ state: 'attached' });
  await page.evaluate(({ selector, topPx }) => {
    const el = document.querySelector(selector)!;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - topPx), behavior: 'instant' });
  }, { selector, topPx });
  await page.waitForTimeout(500);
  const before = await page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top, selector);
  await act();
  await page.waitForTimeout(900);
  const after = await page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top, selector);
  return Math.abs(after - before);
}

test('Stronghold section tabs stay clickable once the lookup bar pins under the nav', async ({ page }) => {
  // UC-01: .gm-lookup was sticky at top:0, under the fixed site nav, so once pinned
  // elementFromPoint at every tab answered with the nav -- 0 of 7 clickable at 1440,
  // the first row hidden at 390.
  await page.goto('/gamemodes/stronghold-protocol');
  const tabs = page.locator('.gm-lookup button[aria-pressed]');
  await expect(tabs.first()).toBeVisible();
  await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
  // The nav collapses over a transition; the bar re-measures when it settles.
  await page.waitForTimeout(900);
  const hits = await tabs.evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { label: button.textContent, top: Math.round(box.top), ok: !!hit && button.contains(hit) };
  }));
  expect(hits.length).toBeGreaterThanOrEqual(7);
  expect(hits.filter((h) => !h.ok), 'a pinned tab is covered by something else').toEqual([]);
  // And the page did scroll far enough for the bar to be pinned at all.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(2000);
});

test('stage cards keep their names on a phone when the stage has other forms', async ({ page }) => {
  // UC-03: the "forms available" label never shrank, so on a phone it squeezed 18 of
  // 28 names on this page to 0px and ran 13px off the card.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/stages/content/main_14');
  const cards = page.locator('.stage-card');
  await expect(cards.first()).toBeVisible();
  const measured = await cards.evaluateAll((els) => els.map((card) => {
    const box = card.getBoundingClientRect();
    const name = card.querySelector('.stage-card-name')?.getBoundingClientRect();
    const forms = card.querySelector('.stage-card-forms')?.getBoundingClientRect();
    return {
      name: name ? Math.round(name.width) : null,
      formsOverflow: forms ? Math.round(forms.right - box.right) : -1,
      hasForms: !!forms,
    };
  }));
  expect(measured.filter((m) => m.hasForms).length, 'the page has stages with other forms').toBeGreaterThan(0);
  expect(measured.filter((m) => m.name !== null && m.name < 40), 'a stage name narrower than 40px').toEqual([]);
  expect(measured.filter((m) => m.formsOverflow > 0), 'a forms label past the card edge').toEqual([]);
});

test('the stage map legend is readable in the light theme', async ({ page }) => {
  // UI-04: a fixed near-black scrim under themed text measured 1.32:1 in light.
  await page.addInitScript(() => { try { localStorage.setItem('theme', 'light'); } catch { /* private mode */ } });
  await page.goto('/stages/browse?s=1-7');
  await page.getByRole('button', { name: /Legend/ }).click();
  const overlay = page.locator('.stage-legend-overlay.open');
  await expect(overlay).toBeVisible();
  const colours = await overlay.evaluate((el) => {
    const probe = document.createElement('canvas').getContext('2d')!;
    /** Any CSS colour (color-mix, color(srgb), rgb) as [r, g, b, a] via the canvas. */
    const rgba = (css: string) => {
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = '#000';
      probe.fillStyle = css;
      probe.fillRect(0, 0, 1, 1);
      return Array.from(probe.getImageData(0, 0, 1, 1).data);
    };
    const text = el.querySelector('.stage-legend-special, .stage-legend') as HTMLElement;
    const under = el.parentElement ? getComputedStyle(el.parentElement).backgroundColor : 'rgb(0,0,0)';
    return { bg: rgba(getComputedStyle(el).backgroundColor), text: rgba(getComputedStyle(text).color), under: rgba(under) };
  });
  // The scrim is translucent: composite it over black, the darkest a schematic gets.
  const a = colours.bg[3] / 255;
  const ground = [0, 1, 2].map((i) => colours.bg[i] * a + 0 * (1 - a));
  expect(contrast(colours.text, ground)).toBeGreaterThanOrEqual(4.5);
});

test('stage and chapter titles keep a space between code and name', async ({ page }) => {
  // The h1 ran code and name together: "AD-EX-1Dusty Prop Room" is what screen
  // readers and copy/paste got.
  await page.goto('/stages/browse?s=ad-ex-1');
  await expect(page.locator('h1')).toHaveText('AD-EX-1 Dusty Prop Room');
  await page.goto('/stages/content/main_14');
  await expect(page.locator('h1')).toHaveText('EP 14 Absolved Will Be the Seekers');
});

test('each terminal page has one h1, in a page header that lines up with its content', async ({ page }) => {
  for (const route of ['/stages', '/stages/score', '/stages/all', '/gamemodes', '/enemies', '/techniques', '/synergies']) {
    await page.goto(route);
    await expect(page.locator('h1'), `${route}: one h1`).toHaveCount(1);
    const edges = await page.evaluate(() => {
      const h1 = document.querySelector('h1')!;
      const range = document.createRange();
      range.selectNodeContents(h1);
      const main = document.querySelector('main')!;
      const pad = parseFloat(getComputedStyle(main).paddingLeft);
      return { title: Math.round(range.getBoundingClientRect().left), content: Math.round(main.getBoundingClientRect().left + pad) };
    });
    expect(Math.abs(edges.title - edges.content), `${route}: title at ${edges.title}, content at ${edges.content}`).toBeLessThanOrEqual(1);
  }
});

test.describe('state changes near the foot of a page do not move what was pressed', () => {
  test('techniques: the last group\'s table toggle', async ({ page }) => {
    await page.goto('/techniques');
    const last = '.technique-group:last-of-type .technique-table-toggle';
    const moved = await anchorMoved(page, last, async () => {
      await page.locator(last).last().click();
      await page.locator(last).last().click();
    }, 500);
    expect(moved).toBeLessThan(4);
  });

  test('Stronghold: narrowing the list keeps the pinned lookup bar where it is', async ({ page }) => {
    await page.goto('/gamemodes/stronghold-protocol');
    await page.evaluate(() => window.scrollTo({ top: 4000, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const bar = page.locator('.gm-lookup');
    const before = (await bar.boundingBox())!.y;
    await page.getByRole('searchbox', { name: 'Search the whole mode' }).fill('Caper');
    await page.waitForTimeout(900);
    const after = (await bar.boundingBox())!.y;
    expect(Math.abs(after - before)).toBeLessThan(4);
  });
});
