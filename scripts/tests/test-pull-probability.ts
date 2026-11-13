import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canComplete, formatChance, selectedRules, simulateOdds, sixStarChance, type BannerOdds, type OddsOperator, type OddsRequest } from '../../lib/pulls/probability';
import { getBannerOdds, LIMITED_RULES, resolveLimitedRules } from '../../lib/pulls/bannerOdds';
import { getPullSchedule } from '../../lib/pulls/schedule';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { getAllOperators } from '../../lib/operators/operators';
import { parsePullPlan } from '../../lib/pulls/plan';
const schedule = getPullSchedule().filter(b => b.end >= '2026-09-09');
const catalogue = getBannerOdds(schedule);
const ofType = (type: BannerOdds['type']) => Object.values(catalogue).find(rules => rules.type === type)!;
const maybeOfType = (type: BannerOdds['type']): BannerOdds | undefined => Object.values(catalogue).find(rules => rules.type === type);
const target = (name: string, copies = 1) => ({ name, copies });
const request = (rules: BannerOdds, pulls: number, names: string[], spark = false): OddsRequest => ({ rules, pulls, targets: names.map(n => target(n)), spark });

/* The model's own rules, on a limited banner shaped like the verified ones in
   LIMITED_RULES: two featured six-stars sharing 70% (one of them the 300-pull gift),
   one featured five-star at 50%, and returning limited operators -- one rated up five
   times -- sharing the remaining 30% with the ordinary pool. The names are invented,
   so a rename or a new banner in the data can never move these numbers. */
const featured = (name: string, rarity: 5 | 6, share: number, spark: number): OddsOperator => ({ name, rarity, share, kind: 'featured', icon: null, spark });
const ordinarySix = ['Ordinary A', 'Ordinary B', 'Ordinary C'];
const returningShare = (weight: number) => .3 * weight / (ordinarySix.length + 5 + 3);
const limited: BannerOdds = {
  id: 'LIMITED_TEST', type: 'limited', sources: [], bonus: 'Gift Six', ordinarySix,
  operators: [
    featured('Featured Six', 6, .35, 300), featured('Gift Six', 6, .35, 300), featured('Featured Five', 5, .5, 75),
    { name: 'Rated-up Returner', rarity: 6, share: returningShare(5), kind: 'returning', icon: null, spark: 300 },
    { name: 'Returner', rarity: 6, share: returningShare(1), kind: 'returning', icon: null, spark: 300 },
    { name: 'Discount Returner', rarity: 6, share: returningShare(1), kind: 'returning', icon: null, spark: 200 },
    { name: 'Second Discount Returner', rarity: 6, share: returningShare(1), kind: 'returning', icon: null, spark: 200 },
  ],
};
const sum = (operators: OddsOperator[]) => operators.reduce((total, op) => total + op.share, 0);

// The reported banner, fixed independently of catalogue renames and schedule dates.
const orchid: BannerOdds = { id: 'LINKAGE_74_0_1', type: 'crossover', sources: [], operators: [
  { name: 'Violet Mizutsune Orchid', rarity: 6, share: .5, kind: 'featured', icon: null },
  { name: 'Zinogre S Catapult', rarity: 5, share: .5, kind: 'featured', icon: null },
] };

test('230-pull Orchid report: adding Catapult cannot improve all-goal odds or change Orchid marginals', () => {
  const original: OddsRequest = { rules: orchid, pulls: 230, targets: [target(orchid.operators[0].name, 6)], spark: false };
  const alone = simulateOdds(original);
  const together = simulateOdds({ ...original, targets: [...original.targets, target(orchid.operators[1].name)] });
  assert.ok(together.all.probability <= alone.all.probability, 'adding a goal cannot improve joint success');
  assert.deepEqual(together.copies[0], alone.copies[0], 'unchanged goals must use identical simulated pulls');
});

test('goal order, stricter copy counts and sparking compare the same trials across banner types', () => {
  const single: BannerOdds = { ...orchid, id: 'SINGLE_TEST', type: 'single' };
  for (const rules of [orchid, single, limited]) {
    const [a, b] = rules.operators;
    const base: OddsRequest = { rules, pulls: 600, targets: [target(a.name)], spark: false };
    const alone = simulateOdds(base, 2000);
    const goals = [target(a.name), target(b.name)];
    const both = simulateOdds({ ...base, targets: goals }, 2000);
    const reversed = simulateOdds({ ...base, targets: [...goals].reverse() }, 2000);
    assert.deepEqual(both.copies[0], alone.copies[0], rules.type);
    assert.deepEqual(reversed.copies, [...both.copies].reverse(), rules.type);
    assert.deepEqual(reversed.all, both.all, rules.type);
    assert.ok(both.all.probability <= alone.all.probability, rules.type);
    const stricter = simulateOdds({ ...base, targets: [target(a.name, 6), target(b.name, 6)] }, 2000);
    assert.deepEqual(stricter.copies, both.copies, rules.type);
    assert.ok(stricter.all.probability <= both.all.probability, rules.type);
    const spark = simulateOdds({ ...base, targets: goals, spark: true }, 2000);
    assert.ok(spark.all.probability >= both.all.probability, rules.type);
  }
});

test('Orchid six-copy estimate agrees with an independent exact crossover recurrence at 230 pulls', () => {
  // State: copies (0–5), pulls since featured (0–119), six-star misses (0–98).
  // Six copies are absorbing. Five-star guarantees cannot change six-star odds.
  const width = 120 * 99;
  let state = new Float64Array(6 * width); state[0] = 1;
  let exact = 0;
  for (let pull = 0; pull < 230; pull++) {
    const next = new Float64Array(state.length);
    for (let copies = 0; copies < 6; copies++) for (let since = 0; since < 120; since++) for (let misses = 0; misses < 99; misses++) {
      const mass = state[copies * width + since * 99 + misses];
      if (!mass) continue;
      const six = misses < 50 ? .02 : Math.min(1, .04 + (misses - 50) * .02);
      const featured = since === 119 ? 1 : six / 2;
      if (copies === 5) exact += mass * featured;
      else next[(copies + 1) * width] += mass * featured;
      if (since < 119) {
        next[copies * width + (since + 1) * 99] += mass * six / 2;
        if (six < 1) next[copies * width + (since + 1) * 99 + misses + 1] += mass * (1 - six);
      }
    }
    state = next;
  }
  const sampled = simulateOdds({ rules: orchid, pulls: 230, targets: [target(orchid.operators[0].name, 6)], spark: false });
  const margin = 4 * Math.sqrt(exact * (1 - exact) / sampled.samples);
  assert.ok(Math.abs(sampled.all.probability - exact) < margin, `sampled ${sampled.all.probability}, exact ${exact}`);
});

test('every verified limited pool in the schedule gets its official roster, sparks and rates', () => {
  const byId = new Map(getAllOperators().map(op => [op.internalName, op.name]));
  const banners = getAllHeadhuntingBanners();
  const pools = Object.values(catalogue).filter(rules => rules.type === 'limited');
  // Keyed by pool id: LIMITED_73_0_1 opens on Global in the committed schedule and stays in it.
  assert.ok(pools.some(rules => rules.id === 'LIMITED_73_0_1'));
  for (const rules of pools) {
    const verified = LIMITED_RULES[rules.id];
    assert.ok(verified, `${rules.id} has no verified limited rules`);
    const raw = banners.find(banner => banner.name === schedule.find(entry => entry.poolId === rules.id)?.name)!;
    const six = rules.operators.filter(o => o.rarity === 6), five = rules.operators.filter(o => o.rarity === 5);
    const featuredSix = six.filter(o => o.kind === 'featured'), returning = six.filter(o => o.kind === 'returning');
    assert.ok(Math.abs(sum(featuredSix) - .7) < 1e-12 && featuredSix.every(o => o.spark === 300), rules.id);
    assert.ok(Math.abs(sum(five) - .5) < 1e-12 && five.every(o => o.kind === 'featured' && o.spark === 75), rules.id);
    // The gift and the returning roster are the verified operators, whatever they are called today.
    assert.ok(featuredSix.some(o => o.name === rules.bonus) && rules.bonus === byId.get(verified.bonus), `${rules.id} gift`);
    const discounted = verified.returning200.map(id => byId.get(id));
    assert.deepEqual(returning.map(o => o.name).sort(), [...verified.returning300, ...verified.returning200].map(id => byId.get(id)).sort(), rules.id);
    for (const op of returning) assert.equal(op.spark, discounted.includes(op.name) ? 200 : 300, op.name);
    const normal = Math.min(...returning.map(o => o.share));
    for (const op of returning) assert.ok(Math.abs(op.share / normal - (raw.rate_up_six_stars?.includes(op.name) ? 5 : 1)) < 1e-9, op.name);
    assert.ok(Math.abs(sum(six) + rules.ordinarySix!.length * normal - 1) < 1e-10, rules.id);
    assert.ok(!rules.ordinarySix!.some(name => six.some(op => op.name === name)), `${rules.id} counts an operator twice`);
  }
  // The ordinary pool is the banner's own: released before it opens, obtainable from headhunting.
  const [sealed] = pools.filter(rules => rules.id === 'LIMITED_73_0_1');
  const named = (id: string) => byId.get(id)!;
  assert.ok(sealed.ordinarySix!.includes(named('char_1051_headb2')), 'released three weeks earlier');
  for (const id of ['char_4229_aphris', 'char_172_svrash', 'char_002_amiya']) assert.ok(!sealed.ordinarySix!.includes(named(id)), id);
});
test('a limited rule applies whole or not at all: an id no operator record has is named, never dropped', () => {
  const rule = { bonus: 'char_gift', source: 'https://example.test/news', returning300: ['char_a', 'char_b'], returning200: ['char_c'] };
  const everyone = new Map([['char_gift', 'Gift'], ['char_a', 'A'], ['char_b', 'B'], ['char_c', 'C']]);
  assert.deepEqual(resolveLimitedRules(rule, everyone), { resolved: { source: rule.source, bonus: 'Gift', returning300: ['A', 'B'], returning200: ['C'] } });
  // A returning operator's record missing (not imported yet, or quarantined) and the gift's.
  const withoutB = new Map([...everyone].filter(([id]) => id !== 'char_b'));
  assert.deepEqual(resolveLimitedRules(rule, withoutB), { missing: ['char_b'] });
  assert.deepEqual(resolveLimitedRules(rule, new Map([...everyone].filter(([id]) => id !== 'char_gift'))), { missing: ['char_gift'] });
});

test('soft pity begins on pull 51, reaches certainty at 99 and resets after a six-star', () => {
  assert.equal(sixStarChance(49), .02); assert.equal(sixStarChance(50), .04);
  assert.equal(sixStarChance(51), .06); assert.equal(sixStarChance(98), 1); assert.equal(sixStarChance(0), .02);
});
test('sampled base rates agree with exact one-pull probabilities', () => {
  const result = simulateOdds(request(limited, 1, ['Featured Six', 'Featured Five']), 200000);
  assert.ok(Math.abs(result.copies[0][0].probability - .007) < .0007);
  assert.ok(Math.abs(result.copies[1][0].probability - .04) < .0015);
  assert.equal(result.all.probability, 0); // cannot draw both in one pull
});
test('first-ten guarantee changes the no-five-or-six outcome, not every tenth pull', () => {
  const rules: BannerOdds = { id: 'test', type: 'orienteering', sources: [], operators: [
    ...['a','b','c'].map(name => ({name,rarity:6 as const,share:1/3,kind:'featured' as const,icon:null})),
    ...['d','e','f'].map(name => ({name,rarity:5 as const,share:.2,kind:'featured' as const,icon:null})),
  ] };
  // Constant .5 misses rarity until forced first-ten, but selects third featured five-star.
  const r = { ...request(rules, 20, ['f']), roster: rules.operators.map(o=>o.name) };
  const result = simulateOdds(r, 1, () => .5);
  assert.equal(result.copies[0][0].probability,1); assert.equal(result.copies[0][1].probability,0);
});
test('sparking thresholds 75/200/300 and separate 300-pull bonus', () => {
  for (const [name, cost] of [['Featured Five',75],['Discount Returner',200],['Featured Six',300]] as const) {
    assert.equal(simulateOdds(request(limited,cost-1,[name],true),100).copies[0][0].certain,false);
    assert.equal(simulateOdds(request(limited,cost,[name],true),100).copies[0][0].certain,true);
  }
  const name = limited.bonus!;
  assert.equal(simulateOdds(request(limited,299,[name]),100).copies[0][0].certain,false);
  const off=simulateOdds(request(limited,300,[name]),100);
  const on=simulateOdds(request(limited,300,[name],true),100);
  assert.equal(off.copies[0][0].certain,true);assert.equal(off.copies[0][1].certain,false);
  assert.equal(on.copies[0][1].certain,true); // gift + one exchange
  assert.equal(simulateOdds(request(limited,600,[name]),100).copies[0][1].certain,false); // gift is once, not recurring
});
test('joint goals share contracts and never multiply marginal probabilities', () => {
  const ops = ['Discount Returner','Second Discount Returner'].map(n=>limited.operators.find(o=>o.name===n)!);
  const targets = ops.map(o=>target(o.name));
  assert.equal(canComplete([0,0],targets,ops,200),false);
  assert.equal(canComplete([0,0],targets,ops,400),true);
  assert.equal(canComplete([1,0],targets,ops,200),true);
  const result=simulateOdds({...request(limited,200,ops.map(o=>o.name),true)},1000);
  assert.ok(result.copies.every(row=>row[0].certain));assert.equal(result.all.certain,false);
  assert.ok(result.all.probability<.5);
  assert.equal(simulateOdds(request(limited,300,['Featured Six',limited.bonus!],true),100).all.certain,true);
  assert.equal(simulateOdds(request(limited,0,['Featured Six'],true),100).all.impossible,true);
});
test('single safety net and recurring crossover guarantees use different boundaries', () => {
  const single=ofType('single'); const cross=ofType('crossover');
  assert.equal(simulateOdds(request(single,248,[single.operators[0].name]),100).all.certain,false);
  assert.equal(simulateOdds(request(single,249,[single.operators[0].name]),100).all.certain,true);
  const req=request(cross,240,[cross.operators[0].name]);req.targets[0].copies=2;
  assert.equal(simulateOdds(req,100).all.certain,true);
  assert.equal(simulateOdds({...req,pulls:239},100).all.certain,false);
  // Always miss featured until forced: repeated 120 guarantee actually produces two, not just a label.
  const r=simulateOdds(req,1,()=>.999999);
  assert.equal(r.copies[0][1].probability,1);assert.equal(r.copies[0][2].probability,0);
  // No featured five-star in first 50: the next five-star is forced only until obtained.
  const draws = Array<number>(50).fill(.5); draws.splice(10,0,.99); draws.push(.05,.1,.99);
  const five = simulateOdds(request(cross,52,[cross.operators[1].name]),1,()=>draws.shift()!);
  assert.equal(five.copies[0][0].probability,1); assert.equal(five.copies[0][1].probability,0);
});
test('the Persona 3 Reload crossover gets its announced rates: Makoto Yuki 50% of 6★ rolls, Aegis and Yukari Takeba 25% of 5★ each', () => {
  const rules = Object.values(catalogue).find(r => r.id === 'LINKAGE_77_0_1');
  assert.ok(rules, 'the pool is in the schedule and verified');
  assert.equal(rules.type, 'crossover');
  assert.deepEqual(rules.sources, ['https://ak.hypergryph.com/news/1457']);
  assert.deepEqual(rules.operators.map(op => [op.name, op.rarity, op.share]),
    [['Makoto Yuki', 6, .5], ['Aegis', 5, .25], ['Yukari Takeba', 5, .25]]);
});

/* A crossover with two rate-up 5★, as Persona 3 Reload has. Names invented. */
const pair: BannerOdds = { id: 'LINKAGE_TEST', type: 'crossover', sources: [], operators: [
  featured('Crossover Six', 6, .5, 0), featured('Five A', 5, .25, 0), featured('Five B', 5, .25, 0)].map(({ spark, ...op }) => op) };
test('with two rate-up 5★, the next 5★ after the first of them is the other, once', () => {
  // Three 5★ in a row: A by its roll, then B owed without a roll, then A by its roll again.
  const draws = [.03, .1, .03, .03, .1];
  const result = simulateOdds(request(pair, 3, ['Five A', 'Five B']), 1, () => draws.shift()!);
  assert.equal(draws.length, 0, 'the owed 5★ takes no roll');
  assert.deepEqual(result.copies.map(row => row.slice(0, 2).map(c => c.probability)), [[1, 1], [1, 0]]);
});
test('with two rate-up 5★, the 50-pull guarantee can give either, and either counts as the first', () => {
  // Fifty pulls with no rate-up 5★ (pull 10's forced 5★ is off-banner), then a 5★ whose
  // roll lands in the second half of the rate-up share: Five B, where the model used to
  // give the first-listed every time. The next 5★ is then Five A, owed.
  const draws = [...Array(9).fill(.5), .5, .9, ...Array(40).fill(.5), .05, .9, .07];
  const result = simulateOdds(request(pair, 52, ['Five A', 'Five B']), 1, () => draws.shift()!);
  assert.equal(draws.length, 0);
  assert.deepEqual(result.copies.map(row => row[0].probability), [1, 1]);
});
test('Orienteering requires three of each rarity and only permits selected targets', () => {
  // A scheduled Orienteering's rules when the data has one, else six and six like one's: one
  // Global has not carried yet is in no list (waitsForGlobal), so a day can have none.
  const rules: BannerOdds = maybeOfType('orienteering') ?? { id: 'orienteering', type: 'orienteering', sources: [], operators: [
    ...[1,2,3,4,5,6].map(n => ({ name: `Six ${n}`, rarity: 6 as const, share: 1/6, kind: 'featured' as const, icon: null })),
    ...[1,2,3,4,5,6].map(n => ({ name: `Five ${n}`, rarity: 5 as const, share: 1/6, kind: 'featured' as const, icon: null })),
  ] };
  const r=request(rules,100,[rules.operators[0].name]);
  assert.throws(()=>selectedRules(r),/three/);
  r.roster=[...rules.operators.filter(o=>o.rarity===6).slice(0,3),...rules.operators.filter(o=>o.rarity===5).slice(0,3)].map(o=>o.name);
  const resolved=selectedRules(r);assert.equal(resolved.operators[0].share,1/3);assert.equal(resolved.operators[3].share,.2);
  const unselected=rules.operators.find(o=>!r.roster!.includes(o.name))!;
  assert.throws(()=>simulateOdds({...r,targets:[target(unselected.name)]},1),/no longer available/);
});
test('results are deterministic, tails monotonic, and sampled extremes are not mislabeled guarantees', () => {
  const r=request(limited,80,['Featured Six','Featured Five']);const first=simulateOdds(r,2000);
  assert.deepEqual(first,simulateOdds(r,2000));
  for(const row of first.copies) for(let i=1;i<6;i++) assert.ok(row[i].probability<=row[i-1].probability);
  assert.equal(formatChance({probability:1,certain:false,impossible:false}),'>99.9%');
  assert.equal(formatChance({probability:0,certain:false,impossible:false}),'<0.1%');
});
test('operator goals round-trip and imported probabilities cannot override the model', () => {
  const p={version:1,orundum:'',originite:'',permits:'',reservedOP:'',until:'',manualEventDate:'',bannerName:'',monthlyCard:false,includeBacklog:false,annihilationDone:false,doneEvents:[],doneKeys:[],clearedReruns:[],future:{},goals:[{banner:'test',pulls:300,spendOn:'2026-11-01',targets:[{name:'Returner',copies:2}],includeSpark:true,rateUpRoster:[]}]};
  assert.equal(parsePullPlan(JSON.stringify(p)).goals[0].targets?.[0].copies,2);
  assert.equal(parsePullPlan(JSON.stringify(p)).goals[0].includeSpark,true);
  for(const copies of [0,7,1.5,'2',null]) assert.throws(()=>parsePullPlan(JSON.stringify({...p,goals:[{...p.goals[0],targets:[{name:'Returner',copies}]}]})));
  assert.throws(()=>parsePullPlan(JSON.stringify({...p,goals:[{...p.goals[0],includeSpark:'yes'}]})));
  assert.throws(()=>simulateOdds(request(limited,100,['Not On This Banner']),1),/no longer available/);
});

test('Monte Carlo matches an independent exact pity/count recurrence through 120 pulls', () => {
  let state = new Map<string, number>([['0,0',1]]);
  for(let pull=0;pull<120;pull++) {
    const next = new Map<string, number>();
    const add=(misses:number,count:number,p:number) => { const key=`${misses},${count}`;next.set(key,(next.get(key)||0)+p); };
    for(const [key,mass] of state) {
      const [misses,count]=key.split(',').map(Number);
      const six=misses<50?.02:Math.min(1,.04+(misses-50)*.02);
      add(0,Math.min(6,count+1),mass*six*.35);
      add(0,count,mass*six*.65);
      if(six<1) add(misses+1,count,mass*(1-six));
    }
    state=next;
  }
  const estimate=simulateOdds(request(limited,120,['Featured Six']),100000);
  for(let n=1;n<=6;n++) {
    const exact=[...state].reduce((sum,[key,p])=>sum+(Number(key.split(',')[1])>=n?p:0),0);
    assert.ok(Math.abs(estimate.copies[0][n-1].probability-exact)<.006,`tail ${n}`);
  }
});
