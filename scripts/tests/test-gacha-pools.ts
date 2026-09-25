import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/gacha-release.json';
import { doPulls, fiveStarWeightedPool, simulatorPullable, sixStarWeightedPool } from '../../lib/gacha/gachaEngine';
import { buildRealBannerConfig, getMechanicType } from '../../lib/gacha/realGachaBanners';
import { createInitialState, type BannerConfig, type GachaItem } from '../../lib/gacha/gachaTypes';
import type { GachaIconPools } from '../../lib/gacha/gachaIconPools';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';
import type { HowToObtainLookup } from '../../lib/gacha/realGachaBanners';
import type { OperatorSeries } from '../../lib/operators/operatorSeries';

/*
 * The simulator's pool builders assumed every Standard, Kernel and Limited banner lists
 * two featured 6★ and indexed feat[0] and feat[1] regardless. Standard Pool #176 went
 * live with its lineup still pending (six_stars: []), the Celebration Kernel banners
 * list no 6★ rate-up at all, and Kernel #38 lists one operator the kernel rules remove,
 * so their pools held `undefined` at 25% a slot: the first off-banner 6★ drawn took the
 * page down on `o.item.name` (sweep 2026-09-24, §3.1). The fixture is the release's
 * gacha page payload cut to those banners, one complete banner of every mechanic, and
 * three invented short lineups; the published banners are never read here.
 */
const props = fixture.props as unknown as {
  pools: GachaIconPools;
  banners: HeadhuntingBanner[];
  kernelLookup: Record<string, string>;
  releaseLookup: Record<string, string>;
  kernelExclusiveNames: string[];
  howToObtainLookup: HowToObtainLookup;
  operatorSeriesMap: Record<string, OperatorSeries>;
};

function config(banner: HeadhuntingBanner, excluded: string[] = []): BannerConfig {
  return buildRealBannerConfig(banner, props.pools, excluded, props.kernelLookup, props.releaseLookup,
    new Set(props.kernelExclusiveNames), props.howToObtainLookup, props.operatorSeriesMap);
}

const banner = (name: string) => {
  const found = props.banners.find(b => b.name === name);
  assert.ok(found, `fixture lacks ${name}`);
  return found;
};

/** The configurations the page can reach: the banner as published, and for the
 *  choose-your-own mechanics the lineup after the reader confirms a selection. */
function reachable(source: HeadhuntingBanner): [string, BannerConfig][] {
  const base = config(source);
  const shapes: [string, BannerConfig][] = [[source.name, base]];
  if (base.type === 'orienteering') {
    const six = base.sixStarFeatured.slice(0, 3);
    const five = base.fiveStarFeatured.slice(0, 3);
    shapes.push([`${source.name} (chosen)`, { ...base, sixStarFeatured: six, fiveStarFeatured: five,
      otherFiveStarPool: base.fiveStarFeatured.filter(item => !five.includes(item)) }]);
  }
  if (base.type === 'kernelLocating') {
    const six = base.sixStarFeatured.slice(0, 2);
    const five = base.fiveStarFeatured.slice(0, 3);
    shapes.push([`${source.name} (chosen)`, { ...base, sixStarFeatured: six, fiveStarFeatured: five,
      otherSixStarPool: base.sixStarFeatured.filter(item => !six.includes(item)),
      otherFiveStarPool: base.fiveStarFeatured.filter(item => !five.includes(item)) }]);
  }
  if (base.type === 'celebration') {
    // The reader already owns all but one: only that one is featured.
    shapes.push([`${source.name} (one missing)`, config(source, source.six_stars.slice(1))]);
  }
  return shapes;
}

function assertPool(label: string, pool: { item: GachaItem; weight: number }[]) {
  for (const [index, entry] of pool.entries()) {
    assert.equal(typeof entry.item?.name, 'string', `${label}: entry ${index} has no operator`);
    assert.ok(entry.item.name.length > 0, `${label}: entry ${index} has an empty name`);
    assert.ok(Number.isFinite(entry.weight) && entry.weight > 0, `${label}: ${entry.item.name} weighs ${entry.weight}`);
  }
  if (pool.length === 0) return;
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `${label}: shares add up to ${total}, not 1`);
}

const near = (actual: number[], expected: number[], label: string) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-9, `${label}: ${value} is not ${expected[index]}`));
};

/** Math.random, replayable: a pull sequence that crashes crashes every run. */
function seeded<T>(seed: number, run: () => T): T {
  const original = Math.random;
  let state = seed >>> 0;
  Math.random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
  try { return run(); } finally { Math.random = original; }
}

test('the fixture still carries every banner shape the pool builder crashed on', () => {
  const mechanics = new Set(props.banners.map(getMechanicType));
  for (const type of ['featured', 'limited', 'standard', 'kernel', 'kernelLocating', 'joint', 'orienteering', 'celebration', 'crossover', 'trio']) {
    assert.ok(mechanics.has(type as BannerConfig['type']), `no ${type} banner in the fixture`);
  }
  assert.equal(banner('Standard Pool #176 (Global)').lineupSource, 'pending');
  assert.deepEqual(banner('Standard Pool #176 (Global)').six_stars, []);
  assert.deepEqual(banner('Celebration - Kernel #3').six_stars, []);
  assert.equal(config(banner('Kernel #38 (Global)')).sixStarFeatured.length, 1);
});

test('every banner builds 6★ and 5★ pools of real operators whose shares add up to 1', () => {
  let shapes = 0;
  for (const source of props.banners) {
    for (const [label, built] of reachable(source)) {
      shapes++;
      assertPool(`${label} 6★`, sixStarWeightedPool(built));
      assertPool(`${label} 5★`, fiveStarWeightedPool(built));
      if (built.type === 'crossover' && built.fiveStarFeatured[0]) {
        assertPool(`${label} 5★ after one of the pair`, fiveStarWeightedPool(built, built.fiveStarFeatured[0].name));
      }
    }
  }
  assert.ok(shapes > props.banners.length, 'the chosen-lineup shapes were not exercised');
});

test('an unfilled featured slot gives its share to the rest of the pool, not to the other featured operator', () => {
  const pending = sixStarWeightedPool(config(banner('Standard Pool #176 (Global)')));
  assert.ok(pending.length > 0);
  assert.ok(pending.every(entry => entry.tag === 'other'));

  const complete = sixStarWeightedPool(config(banner('Standard Pool #175 (Global)')));
  near(complete.filter(entry => entry.tag === 'featured').map(entry => entry.weight), [0.25, 0.25], 'Standard Pool #175');

  // One of Kernel #38's two rate-ups is not kernel-eligible: the other keeps its 25%.
  const short = sixStarWeightedPool(config(banner('Kernel #38 (Global)')));
  const featured = short.filter(entry => entry.tag === 'featured');
  assert.equal(featured.length, 1);
  near([featured[0].weight], [0.25], 'Kernel #38 rate-up');
  near([short.filter(entry => entry.tag === 'other').reduce((sum, entry) => sum + entry.weight, 0)], [0.75], 'Kernel #38 others');

  // Limited: the returning rate-ups keep their 5x over the rest.
  const limited = sixStarWeightedPool(config(banner('[Festival] Ashes to Ashes, Ages on Ages')));
  const rateUp = limited.find(entry => entry.tag === 'rateUp');
  const other = limited.find(entry => entry.tag === 'other');
  assert.ok(rateUp && other);
  assert.ok(Math.abs(rateUp.weight / other.weight - 5) < 1e-9);
  near(limited.filter(entry => entry.tag === 'featured').map(entry => entry.weight), [0.35, 0.35], 'Festival featured');
});

test('a pending lineup, or a banner no 6★ can drop from, is not offered for pulls', () => {
  const pending = banner('Standard Pool #176 (Global)');
  assert.equal(simulatorPullable(pending, config(pending)), false);
  const noSix = banner('[Limited-Time] Quicksand Vortex');
  assert.equal(sixStarWeightedPool(config(noSix)).length, 0);
  assert.equal(simulatorPullable(noSix, config(noSix)), false);
  // A published lineup that simply names no 6★ rate-up is a real banner.
  const celebrationKernel = banner('Celebration - Kernel #3');
  assert.equal(simulatorPullable(celebrationKernel, config(celebrationKernel)), true);
  const complete = banner('Standard Pool #175 (Global)');
  assert.equal(simulatorPullable(complete, config(complete)), true);
});

test('pulling 300 times on every banner shape never yields an operator without a name', () => {
  for (const [index, source] of props.banners.entries()) {
    for (const [label, built] of reachable(source)) {
      const { state, items } = seeded(index + 1, () => doPulls(built, createInitialState(), 300));
      assert.equal(state.pullCount, 300, label);
      for (const item of items) {
        assert.equal(typeof item.name, 'string', `${label}: a ${item.rarity}★ pull has no name`);
        assert.ok([3, 4, 5, 6].includes(item.rarity), `${label}: rarity ${item.rarity}`);
      }
      // Soft pity guarantees a 6★ by pull 99, so the 6★ path ran on every shape.
      assert.ok(items.some(item => item.rarity === 6), `${label}: no 6★ in 300 pulls`);
    }
  }
});

test('an empty 6★ lineup pulls from the rest of the pool, and an empty pool does not throw', () => {
  const pending = config(banner('Celebration - Kernel #3'));
  const { items } = seeded(7, () => doPulls(pending, createInitialState(), 300));
  const sixes = items.filter(item => item.rarity === 6);
  assert.ok(sixes.length > 0);
  const offBanner = new Set(pending.otherSixStarPool.map(item => item.name));
  assert.ok(sixes.every(item => offBanner.has(item.name) && !item.isFeatured));

  const empty = config(banner('[Limited-Time] Quicksand Vortex'));
  const pulled = seeded(11, () => doPulls(empty, createInitialState(), 120)).items.filter(item => item.rarity === 6);
  assert.ok(pulled.length > 0);
  assert.ok(pulled.every(item => item.name === 'Unknown Operator'));
});
