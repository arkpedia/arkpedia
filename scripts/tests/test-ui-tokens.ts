import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { THEME_COLOR } from '../../lib/nav/themeColor';

/*
 * The colour tokens make promises in their comments -- "clears 3:1 on every surface",
 * "4.5:1 as text on --panel-2" -- and two of them were false when measured: the light
 * --rarity-6/-5 were 3.83 and 4.38, and the button boundary everyone reused (--line)
 * was 1.31. A comment cannot fail a build. This reads the two theme blocks out of
 * styles/core/shared.css, resolves each token to a colour and checks the promises, so
 * a token edited to look nicer in one theme cannot quietly break legibility in it.
 *
 * WCAG 2.2: 1.4.3 (text, 4.5:1) and 1.4.11 (a control's boundary, 3:1).
 */
const SHARED = path.join(process.cwd(), 'styles/core/shared.css');

type Rgba = { r: number; g: number; b: number; a: number };

function block(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block not found in shared.css`);
  const open = css.indexOf('{', start);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return css.slice(open + 1, i - 1);
}

/** Every `--name: value;` in a block, and every name that is declared twice. */
function declarations(body: string): { tokens: Map<string, string>; duplicates: string[] } {
  const tokens = new Map<string, string>();
  const duplicates: string[] = [];
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (tokens.has(m[1])) duplicates.push(m[1]);
    tokens.set(m[1], m[2].trim());
  }
  return { tokens, duplicates };
}

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1];
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
  }
  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const [r, g, b, a = 1] = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  }
  throw new Error(`not a colour this test can read: ${value}`);
}

function blend(top: Rgba, under: Rgba): Rgba {
  return { r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 };
}

function luminance(c: Rgba): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

/** Contrast of `fg` painted over the opaque surface `bg`. */
function contrast(fg: Rgba, bg: Rgba): number {
  const top = blend(fg, bg);
  const [a, b] = [luminance(top), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The two stops of a linear-gradient token. */
function stops(value: string): Rgba[] {
  return [...value.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|rgba?\([^)]+\)/gi)].map(m => parse(m[0]));
}

const css = fs.readFileSync(SHARED, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const dark = declarations(block(css, ':root'));
const lightOnly = declarations(block(css, ':root[data-theme="light"]'));
/** The light theme is the dark block with the light block laid over it. */
const themes = {
  dark: dark.tokens,
  light: new Map([...dark.tokens, ...lightOnly.tokens]),
};

function colour(theme: Map<string, string>, name: string): Rgba {
  const value = theme.get(name);
  assert.ok(value, `${name} is not defined`);
  return parse(value);
}

/** Every surface a control or a line of text sits on. */
function surfaces(theme: Map<string, string>): [string, Rgba][] {
  const out: [string, Rgba][] = ['--bg', '--panel', '--panel-2', '--well', '--panel-dim'].map(name => [name, colour(theme, name)]);
  for (const name of ['--row-grad', '--row-grad-hi', '--panel-grad']) {
    stops(theme.get(name) ?? '').forEach((stop, i) => out.push([`${name}[${i}]`, stop]));
  }
  return out;
}

test('no token is declared twice within one theme block', () => {
  assert.deepEqual(dark.duplicates, [], 'dark :root');
  assert.deepEqual(lightOnly.duplicates, [], 'light :root[data-theme="light"]');
});

for (const [name, theme] of Object.entries(themes)) {
  test(`${name}: --control-border clears 3:1 on every surface a control sits on`, () => {
    const border = colour(theme, '--control-border');
    for (const [surface, bg] of surfaces(theme)) {
      const ratio = contrast(border, bg);
      assert.ok(ratio >= 3, `--control-border on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: --rarity-1..6 exist and read as text on --panel-2 and --panel`, () => {
    for (let n = 1; n <= 6; n += 1) {
      const fg = colour(theme, `--rarity-${n}`);
      for (const surface of ['--panel-2', '--panel', '--bg']) {
        const ratio = contrast(fg, colour(theme, surface));
        assert.ok(ratio >= 4.5, `--rarity-${n} on ${surface} is ${ratio.toFixed(2)}:1`);
      }
    }
  });

  test(`${name}: the category hues read as text on --panel`, () => {
    for (const hue of ['blue', 'yellow', 'orange', 'green', 'red', 'grey']) {
      const ratio = contrast(colour(theme, `--cat-${hue}`), colour(theme, '--panel'));
      assert.ok(ratio >= 4.5, `--cat-${hue} on --panel is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: the resting scrollbar thumb (--text-faint) is visible on every surface`, () => {
    const thumb = colour(theme, '--text-faint');
    for (const [surface, bg] of surfaces(theme)) {
      const ratio = contrast(thumb, bg);
      assert.ok(ratio >= 3, `--text-faint thumb on ${surface} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: the selected state (teal text on --teal-dim) clears 4.5:1`, () => {
    const teal = colour(theme, '--teal');
    const dim = colour(theme, '--teal-dim');
    for (const surface of ['--panel', '--panel-2', '--bg']) {
      const ground = blend(dim, colour(theme, surface));
      const ratio = contrast(teal, ground);
      assert.ok(ratio >= 4.5, `--teal on --teal-dim over ${surface} is ${ratio.toFixed(2)}:1`);
    }
  });

  test(`${name}: --teal-ink clears 4.5:1 on both --teal-fill stops`, () => {
    const ink = colour(theme, '--teal-ink');
    for (const token of ['--teal-fill', '--teal-fill-hi']) {
      stops(theme.get(token) ?? '').forEach((stop, i) => {
        const ratio = contrast(ink, stop);
        assert.ok(ratio >= 4.5, `--teal-ink on ${token}[${i}] is ${ratio.toFixed(2)}:1`);
      });
    }
  });
}

test('rarity fills are one set for both themes (dark ink sits on them)', () => {
  for (let n = 1; n <= 6; n += 1) {
    assert.ok(dark.tokens.has(`--rarity-fill-${n}`), `--rarity-fill-${n} missing`);
    assert.ok(!lightOnly.tokens.has(`--rarity-fill-${n}`), `--rarity-fill-${n} must not be restated in the light block`);
  }
});

test('the theme-color meta matches --bg in each theme', () => {
  assert.equal(THEME_COLOR.dark.toLowerCase(), themes.dark.get('--bg')!.toLowerCase());
  assert.equal(THEME_COLOR.light.toLowerCase(), themes.light.get('--bg')!.toLowerCase());
});

test('the page frame tokens exist, and the nav, header and main all use them', () => {
  assert.equal(dark.tokens.get('--page-gutter'), '24px');
  assert.equal(dark.tokens.get('--frame-max'), '1040px');
  assert.ok(!lightOnly.tokens.has('--page-gutter') && !lightOnly.tokens.has('--frame-max'), 'the frame is not a theme property');
  const nav = fs.readFileSync(path.join(process.cwd(), 'styles/core/nav.css'), 'utf8');
  assert.match(nav, /\.site-nav-inner \{[^}]*max-width: var\(--frame-max\);[^}]*padding: 10px var\(--page-gutter\);/);
  assert.match(css, /\nmain \{[^}]*max-width: var\(--frame-max\);[^}]*padding: 24px var\(--page-gutter\);/);
  assert.match(css, /\.page-header \{[^}]*padding: 28px var\(--page-gutter\) 20px;[^}]*max-width: var\(--frame-max\);/);
});
