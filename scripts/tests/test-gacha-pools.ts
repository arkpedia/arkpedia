import assert from 'node:assert/strict';
import test from 'node:test';
import fixture from './fixtures/gacha-release.json';
import { doPulls, fiveStarWeightedPool, simulatorPullable, sixStarWeightedPool } from '../../lib/gacha/gachaEngine';
import { buildRealBannerConfig, getMechanicType, simulatorBannerConfig } from '../../lib/gacha/realGachaBanners';
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

/* The crossover rules as the Persona 3 Reload announcement states them
   (ak.hypergryph.com/news/1457), on its banner in the fixture. Each pull draws twice (rarity,
   then who), so a scripted Math.random decides every pull. */
function scripted<T>(draw: (index: number) => number, run: () => T): T {
  const real = Math.random;
  let index = 0;
  Math.random = () => draw(index++);
  try { return run(); } finally { Math.random = real; }
}
const P3 = '[Crossover · Persona 3 Reload] Some Evening of White and Mystic Blue';

test('a crossover guarantees its featured 6★ within every 120 pulls, not just the first', () => {
  const built = config(banner(P3));
  assert.equal(built.type, 'crossover');
  // Every roll as high as it goes: no featured 6★ by chance, only by the guarantee.
  const { items } = scripted(() => .999, () => doPulls(built, createInitialState(), 240));
  const featured = items.map((item, i) => [i + 1, item] as const).filter(([, item]) => item.rarity === 6 && item.isFeatured).map(([pull]) => pull);
  assert.deepEqual(featured, [120, 240]);
});

test('a crossover with no rate-up 5★ in its first 50 pulls makes the next 5★ one of them', () => {
  const built = config(banner(P3));
  // Pull 10's forced 5★ is off-banner; pull 51's rarity roll lands on a 5★, and its high
  // roll would pick an off-banner one without the rule.
  const { items } = scripted(i => (i === 100 ? .05 : .999), () => doPulls(built, createInitialState(), 51));
  assert.equal(items[9].rarity, 5);
  assert.equal(items[9].isFeatured, false);
  assert.equal(items[50].rarity, 5);
  assert.ok(['Aegis', 'Yukari Takeba'].includes(items[50].name), items[50].name);
});

/* Who the simulator can give, with the operators' real pool fields: Global moved seven 6★ and
   seven 5★ from Standard to Kernel Headhunting with Standard Pool #177 (2026-10-09). The
   fixture's lookups are the release's after that batch was recorded (arkpedia-data 003abcaf).
   simulatorBannerConfig is what the page pulls from before a reader's own picks. */
function simulated(name: string, lookups: Partial<typeof props> = {}): BannerConfig {
  const p = { ...props, ...lookups };
  return simulatorBannerConfig(banner(name), p.pools, [], p.kernelLookup, p.releaseLookup, new Set(p.kernelExclusiveNames), p.howToObtainLookup, p.operatorSeriesMap);
}
const names = (items: GachaItem[]) => new Set(items.map(item => item.name));
const MOVED_SIX = ['Lee', 'Goldenglow', 'Fiammetta', 'Horn', 'Irene', 'Ebenholz', 'Dorothy'];
const MOVED_FIVE = ['Blacknight', 'Quercus', 'Kazemaru', 'Rockrock', 'Windflit', 'Hibiscus the Purifier', 'Greyy the Lightningbearer'];

test('from Standard Pool #177 the batch of 2026-10-09 is out of every Standard and limited off-rate pool', () => {
  for (const name of MOVED_SIX) assert.equal(props.kernelLookup[name], '2026/10/09', name);
  for (const source of ['Standard Pool #177 (Global)', '[Celebration] Sealed With Time']) {
    const built = simulated(source);
    const six = names(built.otherSixStarPool), five = names(built.otherFiveStarPool);
    assert.ok(six.size > 10 && five.size > 10, `${source} has off-rate pools`);
    for (const name of MOVED_SIX) assert.ok(!six.has(name), `${source} off-rate 6★ has ${name}`);
    for (const name of MOVED_FIVE) assert.ok(!five.has(name), `${source} off-rate 5★ has ${name}`);
    // Their weighted pools, as a pull draws from them.
    assert.ok(!sixStarWeightedPool(built).some(entry => MOVED_SIX.includes(entry.item.name)), source);
    assert.ok(!fiveStarWeightedPool(built).some(entry => MOVED_FIVE.includes(entry.item.name)), source);
  }
});

test('Standard Pool #176, which closed the morning the batch moved, still has it', () => {
  const built = simulated('Standard Pool #176 (Global)');
  for (const name of MOVED_SIX) assert.ok(names(built.otherSixStarPool).has(name), name);
  for (const name of MOVED_FIVE) assert.ok(names(built.otherFiveStarPool).has(name), name);
});

test('Kernel Locating #13 (2026-10-20) offers the batch it names: Goldenglow, Dorothy, Blacknight and Quercus', () => {
  const built = simulated('Kernel Locating #13 (Global)');
  assert.equal(built.type, 'kernelLocating');
  for (const name of ['Goldenglow', 'Dorothy']) assert.ok(names(built.sixStarFeatured).has(name), name);
  for (const name of ['Blacknight', 'Quercus']) assert.ok(names(built.fiveStarFeatured).has(name), name);
  // Every operator the announcement names is one the simulator offers.
  assert.equal(built.sixStarFeatured.length, banner('Kernel Locating #13 (Global)').six_stars.length);
  assert.equal(built.fiveStarFeatured.length, banner('Kernel Locating #13 (Global)').five_stars.length);
});

test('a Kernel banner has whoever was in the Kernel pool while it ran: Kernel #63 gains the batch, Kernel #62 and #24 closed before their moves', () => {
  // Kernel #63 ran 2026/10/06-10/20; the batch joined Kernel Headhunting on 10/09, and the official
  // permit range of that day (news/4814) already counts the seven 6★ among the pool's.
  const k63 = simulated('Kernel #63 (Global)');
  for (const name of MOVED_SIX) assert.ok(names(k63.otherSixStarPool).has(name), `Kernel #63 has ${name}`);
  for (const name of MOVED_FIVE) assert.ok(names(k63.otherFiveStarPool).has(name), `Kernel #63 has ${name}`);
  // Kernel #62 closed 10/06.
  const k62 = simulated('Kernel #62 (Global)');
  for (const name of MOVED_SIX) assert.ok(!names(k62.otherSixStarPool).has(name), `Kernel #62 has ${name}`);
  // Kernel #24 closed at the 04:00 reset of 2024/12/17 that opened Kernel #25 and moved the
  // second batch: Passenger is not in it, in any time zone.
  assert.equal(props.kernelLookup.Passenger, '2024/12/17');
  assert.ok(!names(simulated('Kernel #24 (Global)').otherSixStarPool).has('Passenger'));
  assert.ok(names(k62.otherSixStarPool).has('Passenger'));
});

test('with the batch still recorded as Standard, as the records were until 2026-10-14, Standard Pool #177 gave it and Kernel Locating #13 did not', () => {
  const howToObtainLookup = structuredClone(props.howToObtainLookup);
  const kernelLookup = { ...props.kernelLookup };
  for (const name of [...MOVED_SIX, ...MOVED_FIVE]) {
    howToObtainLookup[name] = { ...howToObtainLookup[name], 'Standard Headhunting': 'Yes', 'Kernel Headhunting': 'No' };
    delete kernelLookup[name];
  }
  const kernelExclusiveNames = props.kernelExclusiveNames.filter(name => ![...MOVED_SIX, ...MOVED_FIVE].includes(name));
  const stale = { howToObtainLookup, kernelLookup, kernelExclusiveNames };
  assert.ok(names(simulated('Standard Pool #177 (Global)', stale).otherSixStarPool).has('Goldenglow'));
  assert.ok(!names(simulated('Kernel Locating #13 (Global)', stale).sixStarFeatured).has('Goldenglow'));
});
