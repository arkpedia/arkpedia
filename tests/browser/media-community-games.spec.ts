import { expect, test, type Page } from '@playwright/test';

/*
 * Guards for the games, music and community pages (review 2026-09-25): the bugs a
 * reader saw, each measured on the rendered page.
 */

/** No page-wide sideways scroll. */
async function inBounds(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}

/**
 * Anti-Page Jump: put `selector` at `top` px down the viewport, press it where the
 * reader would (a mouse click at its current position, no scroll-into-view), and
 * report how far it moved on screen. The site's rule allows under 4px.
 */
async function pressHolds(page: Page, selector: string, top: number) {
  const target = page.locator(selector).first();
  await target.evaluate((el, y) => window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - y), behavior: 'instant' }), top);
  await page.waitForTimeout(400);
  const before = await target.evaluate(el => el.getBoundingClientRect().top);
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(900);
  const after = await target.evaluate(el => el.getBoundingClientRect().top);
  return Math.abs(after - before);
}

test('GM-02: Discover tiles are laid out as tiles, not as uppercase buttons', async ({ page }) => {
  await page.goto('/music/discover');
  const row = page.getByRole('region', { name: 'Recently added albums' });
  const tiles = row.locator('.music-discover-album-tile');
  await expect(tiles.first()).toBeVisible();
  const boxes = await tiles.evaluateAll(els => els.slice(0, 8).map(el => {
    const tile = el.getBoundingClientRect();
    const name = el.querySelector('.music-discover-album-tile-name')!.getBoundingClientRect();
    return { left: tile.left, right: tile.right, nameLeft: name.left, nameRight: name.right, tt: getComputedStyle(el.querySelector('.music-discover-album-tile-name')!).textTransform };
  }));
  expect(boxes.length).toBeGreaterThan(1);
  for (let i = 0; i < boxes.length; i++) {
    // A title stays inside its own tile (they overlapped the next tile by up to 73px) ...
    expect(boxes[i].nameLeft).toBeGreaterThanOrEqual(boxes[i].left - 1);
    expect(boxes[i].nameRight).toBeLessThanOrEqual(boxes[i].right + 1);
    // ... in its own case (the button voice forced uppercase).
    expect(boxes[i].tt).toBe('none');
    if (i) expect(boxes[i].left).toBeGreaterThanOrEqual(boxes[i - 1].right - 0.5);
  }
  await inBounds(page);
});

test('UI-16: /community-hub shows no developer setup notes', async ({ page }) => {
  await page.goto('/community-hub');
  await expect(page.getByRole('heading', { level: 1, name: 'Community Hub' })).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/YOUTUBE_API_KEY|TWITCH_CLIENT_ID|TWITCH_CLIENT_SECRET|twitchConfig\.ts/);
});

/* The world map is /community-hub's feature: it was hidden whenever no community event was
   upcoming (2026-09-25), and with none upcoming the whole map was gone. It is drawn with
   the list whatever the page's clock says: here the page data is fetched on a client
   navigation with its clock moved past the last event, so every event has ended. */
/* The map's land reads against its sea (maintainer, 2026-09-29: "i can barely make out the
   continents because of the low contrast"). In both themes the coastline is 3:1 or more
   against the sea (WCAG 1.4.11) and the land fill visibly apart from it, and no stroke runs
   across the map: a ring crossing the date line (Chukotka, Fiji) used to be drawn as one
   line spanning the whole width. */
test('the /community-hub map draws land that reads against the sea, in both themes', async ({ page }) => {
  await page.goto('/community-hub');
  const map = page.locator('.community-map-row .world-map-svg');
  await expect(map).toBeVisible();
  for (const theme of ['dark', 'light'] as const) {
    const found = await map.evaluate((svg, t) => {
      document.documentElement.setAttribute('data-theme', t);
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const rgb = (value: string) => {
        probe.style.color = value;
        const canvas = document.createElement('canvas').getContext('2d')!;
        canvas.fillStyle = getComputedStyle(probe).color;
        canvas.fillRect(0, 0, 1, 1);
        return Array.from(canvas.getImageData(0, 0, 1, 1).data.slice(0, 3));
      };
      const lum = ([r, g, b]: number[]) => [r, g, b].map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const land = svg.querySelector('.world-map-land')!;
      const sea = rgb(getComputedStyle(svg.querySelector('.world-map-bg')!).fill);
      const out = { coast: ratio(rgb(getComputedStyle(land).stroke), sea), fill: ratio(rgb(getComputedStyle(land).fill), sea) };
      probe.remove();
      return out;
    }, theme);
    expect(found.coast, `${theme}: the coastline against the sea`).toBeGreaterThanOrEqual(3);
    expect(found.fill, `${theme}: the land fill against the sea`).toBeGreaterThanOrEqual(1.3);
  }
  const spans = await map.locator('.world-map-land').evaluate((path) => {
    const d = path.getAttribute('d') ?? '';
    let previous: number | null = null; let widest = 0;
    for (const [, cmd, x] of d.matchAll(/([ML])([\d.-]+),[\d.-]+/g)) {
      const value = Number(x);
      if (cmd === 'L' && previous !== null) widest = Math.max(widest, Math.abs(value - previous));
      previous = value;
    }
    return widest;
  });
  expect(spans, 'no coastline segment crosses the map (the date line splits a ring)').toBeLessThan(500);
});

test('/community-hub always shows the world map and the event list, even when every event has ended', async ({ page }) => {
  await page.goto('/community-hub');
  await expect(page.locator('.community-map-row .world-map-svg'), 'the map, at the build\'s clock').toBeVisible();
  await page.route(/\/_next\/data\/[^/]+\/community-hub\.json/, async (route) => {
    if (route.request().method() !== 'GET') { await route.continue(); return; }
    const response = await route.fetch();
    const json = await response.json();
    const ends = (json.pageProps.events as { endTime?: string; startTime: string }[]).map((event) => Date.parse(event.endTime ?? event.startTime));
    if (ends.length) json.pageProps.now = Math.max(...ends) + 86_400_000;
    await route.fulfill({ response, json });
  });
  await page.goto('/');
  await page.evaluate(() => (window as unknown as { next: { router: { push: (url: string) => Promise<boolean> } } }).next.router.push('/community-hub'));
  await page.waitForURL('**/community-hub');
  await expect(page.locator('.community-map-row .world-map-svg'), 'the map, with every event ended').toBeVisible();
  await expect(page.locator('.community-map-row .community-event-panel'), 'the event list beside it').toBeVisible();
});

test('GE-10/GM-04: the music widget never covers the last row, and stays off /music', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'the reserve is a phone rule (<=640px)');
  await page.goto('/community-hub/videos');
  const toggle = page.locator('[data-music-widget] .music-collapse-toggle');
  await expect(toggle).toBeVisible();
  // To the very end: the list grows as it is read, so the bottom moves until every card is in.
  await expect.poll(async () => {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    return page.locator('.video-card').count();
  }).toBe(34);
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
  await page.waitForTimeout(400);
  const lastBottom = await page.locator('main').evaluate(el => el.lastElementChild!.getBoundingClientRect().bottom);
  const toggleTop = (await toggle.boundingBox())!.y;
  expect(lastBottom, 'the last row must scroll clear of the floating player').toBeLessThanOrEqual(toggleTop);

  await page.goto('/music');
  await expect(page.locator('.music-collapse-toggle')).toHaveCount(0);
  await expect(page.locator('[data-music-widget]')).toHaveCount(0);
});

test('/community-hub/videos grows as it is read, with no "Show more" button and no jump', async ({ page }) => {
  // A short window, so the first batch's end starts out of reach (600px past the fold).
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  await page.goto('/community-hub/videos');
  const cards = page.locator('.video-card');
  await expect(cards).toHaveCount(24);
  await expect(page.getByRole('button', { name: /more/i })).toHaveCount(0);
  const first = await cards.nth(20).evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  await cards.last().scrollIntoViewIfNeeded();
  await expect(cards).toHaveCount(34);
  // The next batch lands below what the reader has: nothing already shown moves.
  expect(await cards.nth(20).evaluate(el => el.getBoundingClientRect().top + window.scrollY)).toBe(first);
  await expect(page.locator('.load-on-scroll')).toHaveCount(0);
});

test('a scroll row is a named region that the keyboard scrolls, on the site\'s drawn scrollbar', async ({ page }) => {
  // It was measured on /skins' Available now shelf, which the gallery's own order replaced
  // (2026-09-29); Discover's albums row is the same ScrollRow.
  await page.goto('/music/discover');
  const row = page.getByRole('region', { name: 'Recently added albums', exact: true });
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/sidescroll/);
  expect(await row.evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
  const scrollLeft = () => row.evaluate(el => el.scrollLeft);
  await row.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await expect.poll(scrollLeft).toBeGreaterThan(0);
  // Follow actual movement rather than a fixed key count: rapid presses can coalesce
  // with Chromium's native smooth scrolling and leave one reverse step pending.
  await expect.poll(async () => {
    await page.keyboard.press('ArrowLeft');
    return scrollLeft();
  }, { intervals: [100] }).toBe(0);
  await expect.poll(scrollLeft).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  // The page does not switch the whole document to a thin scrollbar.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarWidth)).not.toBe('thin');
});

test('GM-07: nav triggers use the nav links voice', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'the desktop nav bar');
  await page.goto('/support');
  const trigger = page.locator('.site-nav-trigger').first();
  const link = page.locator('.site-nav a').filter({ hasText: 'Schedule' }).first();
  const style = (el: Element) => { const s = getComputedStyle(el); return { tt: s.textTransform, weight: s.fontWeight, family: s.fontFamily }; };
  const t = await trigger.evaluate(style);
  const l = await link.evaluate(style);
  expect(t.tt).toBe('none');
  expect(t.weight).toBe(l.weight);
  expect(t.family).toBe(l.family);
});

test('closing a panel holds the reader in place on the games and Discover', async ({ page }) => {
  // Music guesser: closing a long category from below took 435-571px off the page.
  await page.goto('/games/music-guesser');
  const category = 'button[class*="categoryToggle"]';
  await page.locator(category).first().click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, category, 320)).toBeLessThan(4);

  // Operator guesser: closing "Customize hints".
  await page.goto('/games/operator-guesser');
  await page.locator('details summary').first().click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, 'details summary', 300)).toBeLessThan(4);

  // Discover: "Show less" on the characters.
  await page.goto('/music/discover');
  const more = 'button[aria-controls="discover-characters"]';
  await page.locator(more).click();
  await page.waitForTimeout(400);
  expect(await pressHolds(page, more, 200)).toBeLessThan(4);
});

test('the recruitment guesser holds its place through reveal and next', async ({ page }) => {
  await page.goto('/games/recruitment-guesser');
  const tags = page.getByLabel('Recruitment tags');
  await expect(tags).toBeVisible();
  // Four rounds: combinations are drawn at random and differ in how many answers they
  // have, which is what makes "Next" shorten the page some of the time.
  for (const label of ['Reveal answers', 'Next combination', 'Reveal answers', 'Next combination', 'Reveal answers', 'Next combination', 'Reveal answers', 'Next combination']) {
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await page.waitForTimeout(400);
    const before = await tags.evaluate(el => el.getBoundingClientRect().top);
    await page.getByRole('button', { name: label }).click();
    await page.waitForTimeout(900);
    const after = await tags.evaluate(el => el.getBoundingClientRect().top);
    expect(Math.abs(after - before), `${label} moved the round`).toBeLessThan(4);
  }
  await expect(page.getByRole('button', { name: 'Reveal answers' })).toBeVisible();
});

/**
 * Every .rarity-N (and the glyphs inside it) against the colour --rarity-N resolves to
 * here, read off a probe painted with the token itself -- the custom property's raw
 * value can be a color-mix(), not the rgb() getComputedStyle reports. `frames` are
 * portraits that must carry the tier-N edge in the same colour.
 */
async function rarityMismatches(page: Page, frames?: string) {
  return page.evaluate((frameSelector) => {
    const probe = document.createElement('span');
    document.body.appendChild(probe);
    const token = (n: string) => { probe.style.color = `var(--rarity-${n})`; return getComputedStyle(probe).color; };
    const out: string[] = [];
    const marks = Array.from(document.querySelectorAll<HTMLElement>('[class*="rarity-"]'))
      .filter((el) => /(?:^|\s)rarity-[1-6](?:\s|$)/.test(el.className) && el.getClientRects().length > 0);
    for (const el of marks) {
      const n = el.className.match(/(?:^|\s)rarity-([1-6])(?:\s|$)/)![1];
      const want = token(n);
      for (const part of [el, ...Array.from(el.querySelectorAll<HTMLElement>('[aria-hidden="true"]'))]) {
        const got = getComputedStyle(part).color;
        if (got !== want) out.push(`${el.textContent!.trim()}: ${got}, not --rarity-${n} ${want}`);
      }
    }
    let framed = 0;
    for (const img of frameSelector ? Array.from(document.querySelectorAll<HTMLElement>(frameSelector)) : []) {
      const n = img.className.match(/(?:^|\s)tier-([1-6])(?:\s|$)/)?.[1];
      if (!n) { out.push(`portrait without a tier-N frame: ${img.outerHTML.slice(0, 80)}`); continue; }
      const s = getComputedStyle(img);
      if (s.borderBottomWidth !== '3px' || s.borderBottomColor !== token(n)) out.push(`portrait frame ${s.borderBottomWidth} ${s.borderBottomColor}, not 3px --rarity-${n}`);
      framed += 1;
    }
    probe.remove();
    return { out, marks: marks.length, framed };
  }, frames ?? null);
}

test('every guesser that prints a rarity prints it in --rarity-N, in both themes, after a round', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'colour, not layout: once is enough');
  test.setTimeout(90000);
  // The operator guesser's answer card painted it --text-dim: '.answerCard span span'
  // (0,1,2) outranked .rarity-N (0,1,0) and caught the glyph span inside <Rarity>. The
  // rig missed it because the answer appears only after a round. The stage and music
  // guessers print no rarity.
  for (const theme of ['dark', 'light'] as const) {
    await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* private mode */ } }, theme);
    const rounds: { name: string; path: string; play: () => Promise<void>; frames?: string }[] = [
      {
        name: 'operator guesser', path: '/games/operator-guesser', frames: '[class*="answerCard"] > img',
        play: async () => {
          await page.getByRole('button', { name: 'Start round' }).click();
          await page.getByRole('button', { name: 'Give up and reveal answer' }).click();
          await expect(page.locator('[class*="answerCard"] .rarity')).toBeVisible();
        },
      },
      {
        name: 'recruitment guesser', path: '/games/recruitment-guesser', frames: '[data-found] > img',
        play: async () => {
          await page.getByRole('button', { name: 'Reveal answers' }).click();
          await expect(page.locator('[data-found] .rarity').first()).toBeVisible();
        },
      },
      {
        name: 'colour palette', path: '/games/color-palette',
        play: async () => {
          await page.getByRole('button', { name: 'Start guessing' }).click();
          await page.getByRole('button', { name: 'Hint 1: rarity' }).click();
          await page.getByRole('button', { name: 'Reveal answer' }).click();
          await expect(page.getByLabel('Revealed hints').locator('.rarity')).toBeVisible();
        },
      },
    ];
    for (const round of rounds) {
      await page.goto(round.path);
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme') ?? 'dark'), `${round.name} is in the ${theme} theme`).toBe(theme);
      await round.play();
      const found = await rarityMismatches(page, round.frames);
      expect(found.marks, `${round.name}: prints a rarity, or this proves nothing`).toBeGreaterThan(0);
      if (round.frames) expect(found.framed, `${round.name}: a framed portrait`).toBeGreaterThan(0);
      expect(found.out, `${round.name} (${theme})`).toEqual([]);
    }
  }
});
