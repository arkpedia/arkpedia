import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { publicFileExists } from '../../lib/assets/publicAssets';
import { applyCommunityPaletteOverrides, getPaletteCatalogue } from '../../lib/minigames/data';
import { playablePalettes } from '../../lib/minigames/logic';
import { getAllOperators } from '../../lib/operators/operators';
import manifest from '../../data/color-palettes.json';
import features from '../../data/color-palette-features.json';
import reviews from '../../data/color-palette-reviews.json';

type PaletteSample = { x: number; y: number; color: string; label: string };
type PaletteReview = { sourceSha256: string } & (
  | { status: 'accepted'; colors: string[]; samples?: (PaletteSample | null)[] }
  | { status: 'approved'; samples: PaletteSample[] }
  | { status: 'draft' | 'flagged' | 'declined'; samples?: (PaletteSample | null)[] }
);

const asOf = Date.parse('2026-09-07T12:00:00Z');
const catalogue = getPaletteCatalogue();
const palettes = playablePalettes(catalogue, asOf);

test('community palette corrections replace only the matching artwork colors', () => {
  const original = palettes.find((operator) => operator.base)?.base;
  assert.ok(original);
  const colors = ['#111111', '#222222', '#333333', '#444444', '#555555'];
  const updated = applyCommunityPaletteOverrides(palettes, { [original.image]: { colors } });
  assert.deepEqual(updated.find((operator) => operator.base?.image === original.image)?.base?.colors, colors);
  assert.deepEqual(
    applyCommunityPaletteOverrides(palettes, { [original.image]: { colors: ['#bad'] } })
      .find((operator) => operator.base?.image === original.image)?.base?.colors,
    original.colors,
  );
});

test('palette modes contain only actual Base/E2 artwork, never outfits or low-rarity E2 stand-ins', () => {
  const operators = new Map(getAllOperators().map((operator) => [operator.name, operator]));
  assert.ok(palettes.length > 350);
  for (const operator of palettes) for (const mode of ['base', 'elite2'] as const) {
    const art = operator[mode];
    if (!art) continue;
    assert.ok(art.image.endsWith(mode === 'base' ? ' - Base.webp' : ' - Elite 2.webp'));
    assert.equal(art.colors.length, 5);
    assert.ok(art.colors.every((color) => /^#[a-f\d]{6}$/.test(color)));
    assert.ok(publicFileExists(art.image));
    if (mode === 'elite2') assert.ok((operators.get(operator.name)?.rarity || 0) >= 4);
  }
  assert.equal(palettes.find((operator) => operator.name === 'Lancet-2')?.elite2, null);
});

test('palette hints use real rarity and the main operator class, never its branch', () => {
  const operators = new Map(getAllOperators().map((operator) => [operator.name, operator]));
  const classes = new Set(['Caster', 'Defender', 'Guard', 'Medic', 'Sniper', 'Specialist', 'Supporter', 'Vanguard']);
  for (const operator of palettes) {
    const source = operators.get(operator.name)!;
    assert.ok(operator.rarity && Number.isInteger(operator.rarity) && operator.rarity >= 1 && operator.rarity <= 6, operator.name);
    assert.equal(operator.rarity, source.rarity, operator.name);
    assert.ok(operator.class && classes.has(operator.class), operator.name);
    assert.equal(operator.class, source.class, operator.name);
    assert.ok(!('branch' in operator), operator.name);
  }
  assert.equal(palettes.find((operator) => operator.name === 'Exusiai')?.class, 'Sniper');
  assert.equal(palettes.find((operator) => operator.name === 'Vigna')?.class, 'Vanguard');
  assert.equal(palettes.find((operator) => operator.name === 'Lancet-2')?.rarity, 1);
});

test('generated palettes match their artwork fingerprints and cannot silently go stale', () => {
  for (const [image, entry] of Object.entries(manifest.artworks)) {
    assert.match(image, / - (Base|Elite 2)\.webp$/);
    const local = path.join(process.cwd(), 'public', image);
    if (fs.existsSync(local)) {
      const bytes = fs.readFileSync(local);
      assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), entry.sha256, `Regenerate palette: ${image}`);
    } else {
      assert.ok(publicFileExists(image), `Missing external artwork: ${image}`);
      assert.match(entry.sha256, /^[0-9a-f]{64}$/, `Invalid artwork fingerprint: ${image}`);
    }
  }
});

// The version build-color-palettes.py stamps on the palettes it makes for art nobody has
// reviewed or given a recipe; read from the script, so changing how they are made fails here
// until they are made again.
const AUTOMATIC = fs.readFileSync(path.join(process.cwd(), 'scripts/palettes/build-color-palettes.py'), 'utf8').match(/^AUTOMATIC = '([^']+)'$/m)?.[1];

test('every palette tracks its exact approved review, its provisional recipe, or is marked automatic', () => {
  assert.deepEqual(features.roles, ['hair', 'outfit-primary', 'outfit-secondary', 'outfit-detail', 'standout']);
  assert.ok(AUTOMATIC, 'build-color-palettes.py names its AUTOMATIC version');
  const recipes = features.artworks as Record<string, string[]>;
  const references = features.references as Record<string, string>;
  for (const [image, entry] of Object.entries(manifest.artworks)) {
    const review = (reviews.artworks as Record<string, PaletteReview>)[image];
    if (review?.status === 'accepted') {
      assert.equal(review.sourceSha256, entry.sha256, image);
      assert.deepEqual(entry.colors, review.colors, image);
      const digest = crypto.createHash('sha256').update(JSON.stringify([review.sourceSha256, 'accepted', review.colors])).digest('hex');
      assert.equal((entry as { reviewSha256?: string }).reviewSha256, digest, `Apply accepted palette: ${image}`);
      continue;
    }
    if (review?.status === 'approved') {
      assert.equal(review.sourceSha256, entry.sha256, image);
      assert.equal(review.samples.length, 5, image);
      assert.ok(review.samples.every(s => Number.isInteger(s.x) && Number.isInteger(s.y) && s.x >= 0 && s.y >= 0 && s.label.trim()), image);
      assert.deepEqual(entry.colors, review.samples.map(s => s.color), image);
      const digest = crypto.createHash('sha256').update(JSON.stringify([review.sourceSha256, review.samples.map(s => [s.x, s.y, s.color, s.label])])).digest('hex');
      assert.equal((entry as { reviewSha256?: string }).reviewSha256, digest, `Apply approved palette: ${image}`);
      continue;
    }
    const recipe = recipes[image];
    if (!recipe) {
      // New art (the palettes stage of the release makes one for every Base and Elite 2
      // artwork the pinned skin repository has), held in data/quarantine.json until someone
      // reviews it or writes its recipe.
      assert.equal((entry as { automatic?: string }).automatic, AUTOMATIC, `Regenerate automatic palette: ${image}`);
      continue;
    }
    assert.equal((entry as { automatic?: string }).automatic, undefined, `${image} has a recipe, so its palette follows it`);
    assert.equal(recipe.length, 5, image);
    const targets = recipe.map((name) => references[name]);
    assert.ok(targets.every((color) => /^#[a-f\d]{6}$/.test(color || '')), image);
    const digest = crypto.createHash('sha256').update(JSON.stringify([features.roles, targets])).digest('hex');
    assert.equal((entry as { recipeSha256?: string }).recipeSha256, digest, `Regenerate provisional palette: ${image}`);
  }
});

test('recognizable hair, clothing and small accessories survive palette extraction', () => {
  function swatch(name: string, index: number, mode: 'base' | 'elite2' = 'base') {
    const color = palettes.find((operator) => operator.name === name)?.[mode]?.colors[index];
    assert.ok(color, `${name} ${mode}`);
    return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  }
  for (const mode of ['base', 'elite2'] as const) {
    const [r, g, b] = swatch('Figurino', 0, mode);
    assert.ok(g > b + 30 && g > r * .85, `Figurino's yellow-green hair (${mode})`);
    const [tr, tg, tb] = swatch('Tequila', 1, mode);
    assert.ok(tb > tr * 1.25 && tg > tr * 1.05, `Tequila's blue shirt (${mode})`);
    const [nr, ng, nb] = swatch('Narantuya', 4, mode);
    assert.ok(ng > nr * 1.2 && nb > nr * 1.4, `Narantuya's blue accents (${mode})`);
  }
  const [kr, kg, kb] = swatch('Kroos', 1);
  assert.ok(kg > kr && kg > kb * 1.2, 'Kroos has a green shirt swatch');
  const [tr, tg, tb] = swatch('Texas', 4);
  assert.ok(tr > 150 && tg > 140 && tb < 130, 'Texas has a yellow sword swatch');
  const [fr, fg, fb] = swatch('Folinic', 4);
  assert.ok(fg > fr * 1.2 && fb > fr * 1.2, 'Folinic has cyan gloves');
  for (const name of ['Broca', 'Heavyrain']) {
    const [r, g, b] = swatch(name, 4);
    assert.ok(r > b * 1.2 && g > b * 1.2, `${name} retains gold/olive details`);
  }
  const [sr, sg, sb] = swatch('Skyfire', 1);
  assert.ok(sr > sg * 1.4 && sr > sb * 1.2, 'Skyfire has a red coat swatch');
  const [hr, hg, hb] = swatch('Surtr', 0);
  assert.ok(hr > hg * 1.6 && hr > hb * 1.2, 'Surtr has red hair');
});

// The page ships the whole catalogue and filters it at render; its size budget is
// scripts/audits/check-payload-budgets.ts, since npm test also runs in the release job.
test('palette data excludes future-only operators', () => {
  assert.equal(playablePalettes(catalogue, Date.parse('2019-01-01')).length, 0);
});
