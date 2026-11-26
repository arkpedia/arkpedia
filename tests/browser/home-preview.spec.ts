import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import catalogue from '../../config/discovered-home-cosmetics.json';
import { getHomePreview, homePreviewCatalogue, type HomePreview } from '../../lib/home/previews';

test.use({ launchOptions: { args: ['--enable-unsafe-swiftshader'] } });

const fixtureEvent = '[Rerun] The Rides to Lake Silberneherze Rerun';
const references: { id: string; background: string; theme?: string; room: string; assistant?: string }[] = [
  { id: 'hunt', background: 'bg_hunter_1', theme: 'tm_hunter_1', room: 'Strike Camp', assistant: 'Violet Mizutsune Orchid' },
  { id: 'persona', background: 'bg_p3r_1', theme: 'tm_p3r_1', room: 'Velvet Room', assistant: 'Makoto Yuki' },
  { id: 'theatre', background: 'bg_redvelvet_1', theme: 'tm_redvelvet_1', room: 'Theatre Prologue', assistant: 'Tragodia' },
  { id: 'celebration', background: 'bg_anniversary_1', room: 'Celebration' },
];

function path(event: string) {
  return `/events/${encodeURIComponent(event)}#packs`;
}

async function artwork(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
}

async function openPreview(page: Page, isTheme: boolean) {
  const opener = page.locator('#event-section-panel-packs').getByRole('button', { name: isTheme ? 'Preview UI' : 'Preview background', exact: true }).first();
  await opener.click();
  const dialog = page.locator('dialog.event-scene-dialog[open]');
  await expect(dialog).toBeVisible();
  await artwork(dialog.locator('.event-scene-background'));
  return { dialog, opener };
}

async function hud(dialog: Locator, assistant: string) {
  const screen = dialog.locator('.event-persona-viewport');
  await artwork(screen.getByAltText(assistant, { exact: true }));
  await artwork(screen.locator('img[src*="icon_breaking_news"]'));
  for (const field of ['level', 'doctor', 'maxSanity', 'lmd', 'orundum', 'originite']) {
    await expect(screen.locator(`[data-value="${field}"]`)).toBeVisible();
  }
  await expect(screen.locator('[data-value="sanity"]')).toBeVisible();
  return screen;
}

async function screenshot(dialog: Locator, info: TestInfo, id: string) {
  const file = info.outputPath(`${id}.png`);
  await dialog.screenshot({ path: file });
  await info.attach(id, { path: file, contentType: 'image/png' });
}

for (const { id, background, theme, room, assistant } of references) {
  test(`${id} home preview keeps its room, HUD and artwork`, async ({ page }, info) => {
    const failures: string[] = [];
    page.on('response', response => {
      if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/event-preview/')) failures.push(response.url());
    });
    const preview = getHomePreview(background, theme);
    expect(preview).toBeDefined();
    const { dialog, opener } = await showCandidate(page, preview!);
    await expect(dialog).toHaveAccessibleName(room);
    await expect(dialog.locator('.event-scene-image > canvas.event-scene-native')).toBeVisible({ timeout: 20000 });
    if (assistant) {
      const screen = await hud(dialog, assistant);
      if (id === 'hunt') {
        await artwork(screen.getByAltText('Hunters of the Umbral Wilds', { exact: true }));
        const sanity = screen.getByRole('img', { name: 'Sanity 210' });
        const [frame, meter] = await Promise.all([screen.boundingBox(), sanity.boundingBox()]);
        expect(frame && meter).toBeTruthy();
        const x = (meter!.x + meter!.width / 2 - frame!.x) / frame!.width;
        const y = (meter!.y + meter!.height / 2 - frame!.y) / frame!.height;
        expect(x).toBeCloseTo(.604, 1);
        expect(y).toBeCloseTo(.281, 1);
        await expect(screen.locator('[data-value="dialogue"]')).toHaveText("I see your workload hasn't changed, Doctor. Don't worry, I'll help you sort it out.");
        await expect(screen.locator('[data-value="doctor"]')).toHaveAttribute('data-font-face', 'NotoSansHans-Medium');
        await expect(screen.locator('[data-value="level"]')).toHaveAttribute('data-font-face', 'AEwide');
      }
    }
    await screenshot(dialog, info, id);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
    expect(failures).toEqual([]);
  });
}

// The same event viewer is used for assets whose offer has yet to appear in a published
// event record. Inject only the page's preview prop, keeping the real renderer and assets.
async function showCandidate(page: Page, preview: HomePreview) {
  await page.route(url => decodeURIComponent(url.pathname) === `/events/${fixtureEvent}`, async route => {
    const response = await route.fetch();
    const html = await response.text();
    const body = html.replace(/(<script id="__NEXT_DATA__"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open, json, close) => {
      const data = JSON.parse(json);
      data.props.pageProps.extras.cosmeticPreview = preview;
      data.props.pageProps.extras.packs = [];
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    await route.fulfill({ response, body });
  });
  await page.goto(path(fixtureEvent));
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  return openPreview(page, !!preview.theme);
}

const managed = homePreviewCatalogue();
for (const { id, backgroundId } of managed.themes) {
  if (!Object.hasOwn(catalogue.themes[id as keyof typeof catalogue.themes] ?? {}, 'source')) continue;
  test(`generated theme ${id} assembles a complete home screen`, async ({ page }, info) => {
    const preview = getHomePreview(backgroundId ?? undefined, id);
    expect(preview).toBeDefined();
    const { dialog } = await showCandidate(page, preview!);
    const screen = await hud(dialog, 'Amiya');
    await expect(screen.getByAltText('Terminal', { exact: true })).toBeVisible();
    await screenshot(dialog, info, id);
  });
}
for (const { id, animated } of managed.backgrounds) {
  if (!Object.hasOwn(catalogue.backgrounds[id as keyof typeof catalogue.backgrounds] ?? {}, 'source')) continue;
  test(`generated room ${id} loads its artwork and available effects`, async ({ page }, info) => {
    const preview = getHomePreview(id);
    expect(preview).toBeDefined();
    const { dialog } = await showCandidate(page, preview!);
    if (animated) await expect(dialog.locator('.event-scene-image > canvas.event-scene-native')).toBeVisible({ timeout: 20000 });
    const music = preview?.music;
    if (music) {
      await dialog.getByRole('button', { name: 'Play BGM' }).click();
      await expect.poll(() => page.locator('audio[src]').evaluateAll((elements, source) => elements.some(element => {
        const audio = element as HTMLAudioElement;
        return audio.src.endsWith(source) && audio.currentTime > 0;
      }), music.preview)).toBe(true);
    }
    await screenshot(dialog, info, id);
  });
}

test('Dahuang Sprout Pack opens the generated Global preview from the event page', async ({ page }, info) => {
  await page.goto(path(fixtureEvent));
  await page.locator('#event-section-panel-packs').getByRole('button', { name: /Dahuang Sprout Pack/ }).click();
  await page.locator('.event-pack-detail-actions').getByRole('button', { name: 'Preview UI', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Green Buds', exact: true });
  await artwork(dialog.locator('.event-scene-background'));
  const screen = await hud(dialog, 'Amiya');
  await expect(screen).toHaveAccessibleName('Dahuang home screen');
  for (const [field, text] of [['recruitment', 'Recruitment'], ['recruit', 'Recruit'], ['headhunt', 'Headhunt']]) {
    const label = screen.locator(`[data-value="${field}"]`);
    await expect(label).toBeVisible();
    await expect(label).toHaveText(text);
    await expect(label).toHaveAttribute('data-font-face', 'Novecentowide-Medium');
    await expect(label).toHaveCSS('text-transform', 'uppercase');
    await expect(label).toHaveCSS('font-weight', '500');
    expect(await label.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
  await expect(screen.getByText('All Stages Cleared')).toHaveCSS('color', 'rgb(40, 40, 40)');
  await screenshot(dialog, info, 'dahuang-pack');
});
