import { test, expect } from '@playwright/test';

for (const theme of ['dark', 'light']) test(`pack artwork escapes a glass panel and fits the viewport (${theme})`, async ({ page }) => {
  await page.addInitScript(value => { localStorage.setItem('theme', value); }, theme);
  // A real event's glass panel establishes a containing block for fixed descendants.
  // Keep that condition even when this event's animated backdrop is unavailable.
  await page.route(url => url.pathname.includes('/content-art/pack-promo-'), route => route.fulfill({
    contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1560" height="500"><rect width="1560" height="500" fill="#319e91"/></svg>',
  }));
  const event = '[Story Collection] Bolívar Diagnosed';
  await page.route(url => decodeURIComponent(url.pathname) === `/events/${event}`, async route => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
      const data = JSON.parse(json);
      data.props.pageProps.extras.packs = [{ title: 'CN offers', source: 'https://ak.hypergryph.com/news/9686', region: 'CN', packs: [{ name: 'CN preview pack', region: 'CN', imagePath: '/content-art/pack-promo-layout-test.webp', artworkLayout: 'promo', contents: [{ name: 'Orundum', kind: 'currency', count: 600 }] }] }];
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  await page.goto(`/events/${encodeURIComponent(event)}#rewards/packs`);
  // The synthetic packs differ from SSR only in this fixture; hide the development hydration notice.
  await page.addStyleTag({ content: '.event-section-card { backdrop-filter: blur(1px); } nextjs-portal { display: none !important; }' });
  const opener = page.getByRole('button', { name: /^Enlarge official artwork:/ }).first();
  await opener.scrollIntoViewIfNeeded();
  await opener.click();
  const viewer = page.getByRole('dialog', { name: / artwork$/ });
  await expect(viewer).toBeVisible();
  const image = viewer.getByRole('img');
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const boxes = await viewer.evaluate(el => ({
    viewport: { width: innerWidth, height: innerHeight },
    overlay: el.getBoundingClientRect().toJSON(),
    image: el.querySelector('img')!.getBoundingClientRect().toJSON(),
    close: el.querySelector('button:last-child')!.getBoundingClientRect().toJSON(),
  }));
  for (const box of [boxes.overlay, boxes.image, boxes.close]) {
    expect(box.top).toBeGreaterThanOrEqual(-1);
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.bottom).toBeLessThanOrEqual(boxes.viewport.height + 1);
    expect(box.right).toBeLessThanOrEqual(boxes.viewport.width + 1);
  }
  expect(boxes.image.width / boxes.image.height).toBeCloseTo(1560 / 500, 1);
  await page.keyboard.press('Escape');
  await expect(viewer).toHaveCount(0);
  await expect(opener).toBeFocused();
});
