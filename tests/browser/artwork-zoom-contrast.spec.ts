import { expect, test, type Page } from '@playwright/test';
import { readOnly } from './census-routes';
import { setTheme } from './overlay-checks';

/*
 * The focused artwork view's controls read on its ground in both themes (2026-10-06).
 *
 * The view (components/skins/SkinZoomOverlay.tsx) lies on a near-black scrim,
 * rgba(4 7 10 / 95%), in BOTH themes, and its Still / Animated switch, the animation buttons
 * and Reset are transparent .filter-chip and .ghost buttons: they showed the page's theme
 * inks straight on that scrim. The light theme's --text-dim read 3.17:1 there, and its teal
 * (a pressed chip, a hovered one) 2.6:1, under the 4.5:1 of WCAG 1.4.3 for 12px text. The
 * dark theme was fine, so nobody saw it there. skins.css now gives the view's own controls
 * the scrim inks (shared.css --scrim-ink-dim, --scrim-teal), and this reads every line of
 * text in the open view, at rest and with each control hovered, and the keyboard focus ring
 * (the theme's --teal too, 2.6:1 on the scrim in the light theme), in both themes.
 *
 * Why its own spec and not the overlay census (overlay-checks.ts): the census reads text on
 * an absolutely positioned plate, and this view is a FIXED one; and a pressed chip paints its
 * own 12% tint, so the census takes the chip as the text's ground and never reaches the scrim.
 * This composites every ground from the view's scrim down to the text instead, the scrim
 * over black and over white (the worse counts, as the census does), and a gradient fill
 * (Close's --teal-fill) at each of its stops.
 *
 * Animated selected: the page has to carry a model for the switch to show, and the Check
 * builds with no models (data/dynamic-art.json), so the page's own props are given one
 * pointer per artwork on the way in, and the model is held unanswered: the switch stays on
 * Animated, loading, with nothing drawn. A drawn model needs WebGL, which the Check's browser
 * need not have, so the buttons the model's animations get once it draws are put in their
 * row with SkinZoomOverlay's own markup for them (one pressed, one not): they take the
 * view's styles as the real ones do. Disabled controls are left out (WCAG exempts them).
 */

const MODEL = '/__artwork-zoom-contrast__/model.json';
const OPERATOR = 'Botani';

interface Reading { text: string; ink: string; ratio: number }

/** Every line of text in the open view, its ink over the grounds under it, worst case; or, for
 *  'focus', the keyboard focus ring of the focused control over the ground it is drawn on. */
function readView(what: 'text' | 'focus'): Reading[] {
  type C = { r: number; g: number; b: number; a: number };
  const parse = (v: string): C | null => {
    let m = v.match(/^rgba?\(([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    m = v.match(/^color\(srgb ([^)]+)\)$/);
    if (m) { const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  const over = (top: C, under: C): C => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = (c: C) => {
    const [r, g, b] = [c.r, c.g, c.b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: C, b: C) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const root = document.querySelector('.skin-zoom-overlay')!;
  /** The grounds under `el`: every painted layer from the view's scrim down to it. */
  const grounds = (el: Element): C[] => {
    const layers: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) { layers.unshift(n); if (n === root) break; }
    let out: C[] = [{ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 }];
    for (const layer of layers) {
      const cs = getComputedStyle(layer);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) out = out.map((g) => over(bg, g));
      const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g) ?? []).map(parse).filter((s): s is C => !!s);
      if (stops.length) out = out.flatMap((g) => stops.map((s) => over(s, g)));
    }
    return out;
  };
  const worst = (ink: C, under: C[]) => Math.round(Math.min(...under.map((g) => ratio(over(ink, g), g))) * 100) / 100;
  if (what === 'focus') {
    // The ring is drawn outside the control (outline-offset), on its parent's ground.
    const focused = document.activeElement!;
    const cs = getComputedStyle(focused);
    if (!focused.matches(':focus-visible') || cs.outlineStyle === 'none') return [{ text: focused.textContent ?? '', ink: 'no ring', ratio: 0 }];
    return [{ text: focused.textContent ?? '', ink: cs.outlineColor, ratio: worst(parse(cs.outlineColor)!, grounds(focused.parentElement!)) }];
  }
  const found: Reading[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (!node.data.trim()) continue;
    const parent = node.parentElement!;
    if (!parent.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
    if (parent.closest('button:disabled, [aria-disabled="true"]')) continue;
    const inkCss = getComputedStyle(parent).color;
    const ink = parse(inkCss)!;
    found.push({ text: node.data.trim(), ink: inkCss, ratio: worst(ink, grounds(parent)) });
  }
  return found;
}

/** The operator page, with a model pointer for every artwork it shows. Returns whether the
 *  page's props were found and given them (checked by the test, not in the handler, where a
 *  failure would leave the page unanswered and read as a timeout). */
async function withModels(page: Page): Promise<() => boolean> {
  let given = false;
  await page.route((url) => url.pathname === `/operators/${OPERATOR}`, async (route) => {
    const html = await (await route.fetch()).text();
    const body = html.replace(/(<script id="__NEXT_DATA__" type="application\/json"[^>]*>)([\s\S]*?)(<\/script>)/, (_, open: string, json: string, close: string) => {
      const data = JSON.parse(json);
      const props = data.props.pageProps;
      props.dynamicArt = Object.fromEntries(props.appearances.map((appearance: { label: string }) => [appearance.label, MODEL]));
      given = Object.keys(props.dynamicArt).length > 0;
      return open + JSON.stringify(data).replace(/</g, '\\u003c') + close;
    });
    // Its own headers, not the server's: the body is no longer the (compressed) one they describe.
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
  });
  // Held unanswered: the view stays on Animated, loading.
  await page.route((url) => url.pathname === MODEL, () => {});
  return () => given;
}

test('the focused artwork view\'s controls read at 4.5:1 on its scrim in both themes, at rest, hovered and focused', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'colour does not change with the width');
  test.setTimeout(90_000);
  await readOnly(page);
  const given = await withModels(page);
  await page.goto(`/operators/${OPERATOR}`);
  expect(given(), 'the page carries its props in __NEXT_DATA__, and each artwork got a model').toBe(true);
  await page.getByRole('button', { name: new RegExp(`Enlarge ${OPERATOR} artwork`) }).click();
  const view = page.getByRole('dialog', { name: /artwork$/ });
  await expect(view).toBeVisible();

  await view.getByRole('button', { name: 'Animated', exact: true }).click();
  await expect(view.getByRole('button', { name: 'Animated', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(view.locator('.skin-zoom-status')).toHaveText(/Loading the animated art/);
  // The row the model's animations fill once it draws: SkinZoomOverlay's markup for it.
  await view.locator('.skin-zoom-animations').evaluate((row) => {
    const group = document.createElement('div');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Animation');
    group.className = 'seg-control';
    for (const [label, pressed] of [['Idle', 'false'], ['Touch', 'true']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip';
      button.setAttribute('aria-pressed', pressed);
      button.textContent = label;
      group.appendChild(button);
    }
    row.appendChild(group);
  });
  // Zoomed in, so Reset is enabled.
  await view.evaluate((element) => element.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100 })));
  await expect(view.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();

  const hovered = ['Still', 'Animated', 'Idle', 'Touch', 'Reset', 'Close'];
  for (const theme of ['dark', 'light'] as const) {
    await setTheme(page, theme);
    await page.mouse.move(2, 2);
    const atRest = await page.evaluate(readView, 'text' as const);
    expect(atRest.map((line) => line.text).sort(), `${theme}: every control and the status line are read`)
      .toEqual([...hovered, 'Loading the animated art…'].sort());
    expect(atRest.filter((line) => line.ratio < 4.5), `${theme} theme, at rest: text in the focused artwork view under 4.5:1 (worst of its scrim over black and over white)`).toEqual([]);
    for (const name of hovered) {
      const control = view.getByRole('button', { name, exact: true });
      await control.hover();
      const line = (await page.evaluate(readView, 'text' as const)).find((candidate) => candidate.text === name)!;
      expect(line.ratio, `${theme} theme, ${name} hovered: ${line.ink} reads ${line.ratio}:1`).toBeGreaterThanOrEqual(4.5);
    }
    // The keyboard focus ring, a non-text indicator: 3:1 (WCAG 1.4.11) on the scrim it is drawn
    // on, on every control (the view keeps Tab inside it, so six presses visit all six).
    await page.mouse.move(2, 2);
    const rung = new Set<string>();
    for (let press = 0; press < hovered.length; press += 1) {
      await page.keyboard.press('Tab');
      const [ring] = await page.evaluate(readView, 'focus' as const);
      expect(ring.ratio, `${theme} theme, the focus ring on ${ring.text}: ${ring.ink} reads ${ring.ratio}:1`).toBeGreaterThanOrEqual(3);
      rung.add(ring.text);
    }
    expect([...rung].sort(), `${theme}: Tab visits every control in the view`).toEqual([...hovered].sort());
  }
});
