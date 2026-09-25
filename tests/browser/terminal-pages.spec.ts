import { expect, test, type Locator, type Page } from '@playwright/test';

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

/** Puts `target` at `topPx` from the viewport's top, runs each step of `act`, and
 *  returns the largest distance it moved on screen after any of them -- the Anti-Page
 *  Jump measure (arkpedia-ui skill). Measured on the element itself, so a selector
 *  that matches several elements cannot measure one and press another. */
async function anchorMoved(page: Page, target: Locator, act: (() => Promise<void>)[], topPx = 160): Promise<number> {
  await target.waitFor({ state: 'visible' });
  await target.evaluate((el, topPx) => {
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - topPx), behavior: 'instant' });
  }, topPx);
  await page.waitForTimeout(500);
  const before = (await target.boundingBox())!.y;
  let moved = 0;
  for (const step of act) {
    await step();
    await page.waitForTimeout(900);
    moved = Math.max(moved, Math.abs((await target.boundingBox())!.y - before));
  }
  return moved;
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

test('nothing on a stage card runs past its edge on a phone, and the code stays on one line', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Measured at 390, where the cards are two abreast.');
  // The forms label above was fixed while the "Adverse Environment" badge kept
  // reaching x=374 on a card ending at 366 on every boss H-stage of main_10 to
  // main_14, and pushed the code onto two lines ("H14-" / "4"). The card clips its
  // overflow, so only a measurement shows it. Every descendant, not one class, so the
  // next label added to the card is held to the same edge.
  await page.setViewportSize({ width: 390, height: 844 });
  let badged = 0;
  for (const id of ['main_10', 'main_11', 'main_12', 'main_13', 'main_14']) {
    await page.goto(`/stages/content/${id}`);
    const cards = page.locator('.stage-card');
    await expect(cards.first()).toBeVisible();
    const measured = await cards.evaluateAll((els) => els.map((card) => {
      const box = card.getBoundingClientRect();
      const code = card.querySelector('.stage-card-code');
      const over = Array.from(card.querySelectorAll('*'))
        .map((el) => ({ el, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.right > box.right + 0.5)
        .map(({ el, r }) => `${el.className || el.tagName} +${Math.round(r.right - box.right)}px`);
      const text = code ? Array.from(code.childNodes).find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) : null;
      let lines = 1;
      if (text) {
        const range = document.createRange();
        range.selectNodeContents(text);
        lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size;
      }
      return { code: text?.textContent?.trim() ?? '', over, lines, badge: !!card.querySelector('.stage-variant-badge') };
    }));
    badged += measured.filter((m) => m.badge).length;
    expect(measured.filter((m) => m.over.length > 0), `${id}: something past a card's right edge`).toEqual([]);
    expect(measured.filter((m) => m.lines > 1).map((m) => m.code), `${id}: a stage code broken over two lines`).toEqual([]);
  }
  expect(badged, 'the pages have cards with a variant badge, or this proves nothing').toBeGreaterThan(0);
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

  // The same bug in the HUD: a fixed dark plate under themed text (the unit limit read
  // dark grey on near-black in light). Composited over white, the lightest ground.
  const limit = page.locator('.stage-hud-limit').first();
  if (await limit.count()) {
    const hud = await limit.evaluate((el) => {
      const probe = document.createElement('canvas').getContext('2d')!;
      const rgba = (css: string) => {
        probe.clearRect(0, 0, 1, 1);
        probe.fillStyle = '#000';
        probe.fillStyle = css;
        probe.fillRect(0, 0, 1, 1);
        return Array.from(probe.getImageData(0, 0, 1, 1).data);
      };
      return { bg: rgba(getComputedStyle(el).backgroundColor), text: rgba(getComputedStyle(el).color) };
    });
    const k = hud.bg[3] / 255;
    const plate = [0, 1, 2].map((i) => hud.bg[i] * k + 255 * (1 - k));
    const t = hud.text[3] / 255;
    const ink = [0, 1, 2].map((i) => hud.text[i] * t + plate[i] * (1 - t));
    expect(contrast(ink, plate)).toBeGreaterThanOrEqual(4.5);
  }
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
    // 166px at 1440 and up to 806px at 390 before the height floor on each group.
    await page.goto('/techniques');
    const toggle = page.locator('.technique-table-toggle').last();
    // Open the table, read down into it (the toggle near the top of the screen), then
    // close it: the page loses the table's height under the reader.
    await toggle.click();
    await expect(toggle).toHaveText(/show icons/i);
    const moved = await anchorMoved(page, toggle, [() => toggle.click()], 120);
    await expect(toggle).toHaveText(/show table/i);
    expect(moved).toBeLessThan(4);
  });

  test('enemies: switching the detail tab', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Above 900px the handbook is locked to the viewport and the pane scrolls inside itself.');
    // 55px at 390, where the detail pane flows in the page: from the foot of the page,
    // a switch to a shorter tab clamped the scroll and the tab row moved down.
    await page.goto('/enemies');
    const tabs = page.locator('.enemy-tabs');
    await expect(tabs).toBeVisible();
    const buttons = tabs.locator('button');
    const n = await buttons.count();
    expect(n, 'the enemy has tabs to switch between').toBeGreaterThan(1);
    // Find the tallest and the shortest tab for this enemy.
    const heights: number[] = [];
    for (let i = 0; i < n; i += 1) {
      await buttons.nth(i).click();
      await page.waitForTimeout(300);
      heights.push(await page.evaluate(() => document.documentElement.scrollHeight));
    }
    const tallest = heights.indexOf(Math.max(...heights));
    const shortest = heights.indexOf(Math.min(...heights));
    expect(heights[tallest] - heights[shortest], 'the tabs differ in height, or this proves nothing').toBeGreaterThan(20);
    // On the tallest, at the foot of the page, then switch to the shortest.
    await buttons.nth(tallest).click();
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo({ top: 1e6, behavior: 'instant' }));
    await page.waitForTimeout(600);
    // A reader presses the tab row where they can see it. At the very foot it can sit
    // under the enemy hero, which is pinned below the nav at this width (it did once the
    // music widget's 84px reserve went under main), and a click on a covered button
    // scrolls it into view first -- a move the test would then blame on the page. Come
    // up just far enough to uncover the row.
    await page.evaluate(() => {
      const row = document.querySelector('.enemy-tabs')!.getBoundingClientRect();
      const cover = document.querySelector('.enemy-detail-pane .enemy-hero')?.getBoundingClientRect().bottom ?? 0;
      if (row.top < cover + 4) window.scrollBy({ top: row.top - cover - 8, behavior: 'instant' });
    });
    await page.waitForTimeout(300);
    // Still past where the shorter tab would end the page, or this proves nothing.
    expect(await page.evaluate(() => scrollY + innerHeight)).toBeGreaterThan(heights[shortest] + 20);
    const before = (await tabs.boundingBox())!.y;
    await buttons.nth(shortest).click();
    await page.waitForTimeout(900);
    expect(Math.abs((await tabs.boundingBox())!.y - before)).toBeLessThan(4);
  });

  test('stages/browse: picking a shorter stage from the pinned rail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Below 900px the rail stacks above the stage and nothing is pinned.');
    // 120px in the review (155px measured on the bundled data): the new stage's detail
    // column is shorter, the page clamped, and the sticky rail went with it.
    await page.goto('/stages/browse?s=1-7');
    await expect(page.locator('.stage-detail-col .stage-brief')).toBeVisible();
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo({ top: 1e6, behavior: 'instant' }));
    await page.waitForTimeout(600);
    const rail = page.locator('.stage-list-col');
    const column = page.locator('.stage-detail-col');
    const before = { rail: (await rail.boundingBox())!.y, column: (await column.boundingBox())!.height, y: await page.evaluate(() => window.scrollY) };
    expect(before.y, 'the page is scrolled, so there is a position to lose').toBeGreaterThan(0);
    await page.locator('.stage-rail .stage-row', { hasText: 'Rehearsal Day' }).first().click();
    await expect(page.locator('h1')).toContainText('AD-1');
    await page.waitForTimeout(900);
    const after = { rail: (await rail.boundingBox())!.y, column: (await column.boundingBox())!.height, y: await page.evaluate(() => window.scrollY) };
    expect(after.column, 'the new stage is shorter, or this test proves nothing').toBeLessThan(before.column);
    // Neither the rail nor the reader's place moves: the review measured the scroll
    // clamped by 120px, and where the grid is short the sticky rail goes with it.
    expect(Math.abs(after.rail - before.rail)).toBeLessThan(4);
    expect(Math.abs(after.y - before.y)).toBeLessThan(4);
  });

  test('Stronghold: narrowing the list keeps the pinned lookup bar where it is', async ({ page }) => {
    await page.goto('/gamemodes/stronghold-protocol');
    await page.evaluate(() => window.scrollTo({ top: 4000, behavior: 'instant' }));
    await page.waitForTimeout(900);
    const bar = page.locator('.gm-lookup');
    const before = (await bar.boundingBox())!.y;
    await page.getByLabel('Search the whole mode').fill('Caper');
    await page.waitForTimeout(900);
    const after = (await bar.boundingBox())!.y;
    expect(Math.abs(after - before)).toBeLessThan(4);
  });
});
