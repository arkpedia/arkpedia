import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canComplete, formatChance, selectedRules, simulateOdds, sixStarChance, type BannerOdds, type OddsRequest } from '../../lib/pulls/probability';
import { getBannerOdds } from '../../lib/pulls/bannerOdds';
import { getPullSchedule } from '../../lib/pulls/schedule';
import { parsePullPlan } from '../../lib/pulls/plan';
const catalogue = getBannerOdds(getPullSchedule().filter(b => b.end >= '2026-09-09'));
const limited = catalogue['[Celebration] Sealed With Time'];
const target = (name: string, copies = 1) => ({ name, copies });
const request = (rules: BannerOdds, pulls: number, names: string[], spark = false): OddsRequest => ({ rules, pulls, targets: names.map(n => target(n)), spark });

test('all nine scheduled banners have rules; official limited rosters and five-star rates are banner-specific', () => {
  assert.equal(Object.keys(catalogue).length, 9);
  assert.equal(limited.operators.length, 14);
  assert.equal(limited.operators.find(o => o.name === 'Crackborne')?.share, .5);
  assert.equal(limited.operators.find(o => o.name === 'Specter the Unchained')?.spark, 200);
  assert.equal(limited.operators.find(o => o.name === 'Texas the Omertosa')?.spark, 300);
  assert.ok(!limited.operators.some(o => o.name === 'Nian'));
  const summer = catalogue['[Carnival] Trails End Winds Rest'];
  assert.equal(summer.operators.find(o => o.name === 'Gavial the Invincible')?.spark, 200);
  assert.ok(!summer.operators.some(o => o.name === 'W'));
  const boosted = limited.operators.find(o => o.name === "Wiš'adel")!;
  const normal = limited.operators.find(o => o.name === 'W')!;
  assert.ok(Math.abs(boosted.share / normal.share - 5) < 1e-12);
  assert.ok(!limited.ordinarySix?.includes('Aphrissa'));
  assert.ok(limited.ordinarySix?.includes('Zima the Raging Tide'));
  assert.ok(!limited.ordinarySix?.includes('SilverAsh'));
  assert.ok(!limited.ordinarySix?.includes('Amiya'));
  const sixMass = limited.operators.filter(o => o.rarity === 6).reduce((s,o) => s+o.share,0) + limited.ordinarySix!.length * normal.share;
  assert.ok(Math.abs(sixMass - 1) < 1e-10);
});
test('soft pity begins on pull 51, reaches certainty at 99 and resets after a six-star', () => {
  assert.equal(sixStarChance(49), .02); assert.equal(sixStarChance(50), .04);
  assert.equal(sixStarChance(51), .06); assert.equal(sixStarChance(98), 1); assert.equal(sixStarChance(0), .02);
});
test('sampled base rates agree with exact one-pull probabilities', () => {
  const result = simulateOdds(request(limited, 1, ['Closure', 'Crackborne']), 200000);
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
  for (const [name, cost] of [['Crackborne',75],['W',200],['Closure',300]] as const) {
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
  const ops = ['W','Rosmontis'].map(n=>limited.operators.find(o=>o.name===n)!);
  const targets = ops.map(o=>target(o.name));
  assert.equal(canComplete([0,0],targets,ops,200),false);
  assert.equal(canComplete([0,0],targets,ops,400),true);
  assert.equal(canComplete([1,0],targets,ops,200),true);
  const result=simulateOdds({...request(limited,200,ops.map(o=>o.name),true)},1000);
  assert.ok(result.copies.every(row=>row[0].certain));assert.equal(result.all.certain,false);
  assert.ok(result.all.probability<.5);
  assert.equal(simulateOdds(request(limited,300,['Closure',limited.bonus!],true),100).all.certain,true);
  assert.equal(simulateOdds(request(limited,0,['Closure'],true),100).all.impossible,true);
});
test('single safety net and recurring crossover guarantees use different boundaries', () => {
  const single=catalogue['Rage of The Many']; const cross=catalogue['Hunters of the Umbral Wilds'];
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
test('Orienteering requires three of each rarity and only permits selected targets', () => {
  const rules=catalogue['Orienteering #7'];const r=request(rules,100,[rules.operators[0].name]);
  assert.throws(()=>selectedRules(r),/three/);
  r.roster=[...rules.operators.filter(o=>o.rarity===6).slice(0,3),...rules.operators.filter(o=>o.rarity===5).slice(0,3)].map(o=>o.name);
  const resolved=selectedRules(r);assert.equal(resolved.operators[0].share,1/3);assert.equal(resolved.operators[3].share,.2);
  assert.throws(()=>simulateOdds({...r,targets:[target('Typhon')]},1),/no longer available/);
});
test('results are deterministic, tails monotonic, and sampled extremes are not mislabeled guarantees', () => {
  const r=request(limited,80,['Closure','Crackborne']);const first=simulateOdds(r,2000);
  assert.deepEqual(first,simulateOdds(r,2000));
  for(const row of first.copies) for(let i=1;i<6;i++) assert.ok(row[i].probability<=row[i-1].probability);
  assert.equal(formatChance({probability:1,certain:false,impossible:false}),'>99.9%');
  assert.equal(formatChance({probability:0,certain:false,impossible:false}),'<0.1%');
});
test('operator goals round-trip and imported probabilities cannot override the model', () => {
  const p={version:1,orundum:'',originite:'',permits:'',reservedOP:'',until:'',manualEventDate:'',bannerName:'',monthlyCard:false,includeBacklog:false,annihilationDone:false,doneEvents:[],doneKeys:[],clearedReruns:[],future:{},goals:[{banner:'test',pulls:300,spendOn:'2026-11-01',targets:[{name:'W',copies:2}],includeSpark:true,rateUpRoster:[]}]};
  assert.equal(parsePullPlan(JSON.stringify(p)).goals[0].targets?.[0].copies,2);
  assert.equal(parsePullPlan(JSON.stringify(p)).goals[0].includeSpark,true);
  for(const copies of [0,7,1.5,'2',null]) assert.throws(()=>parsePullPlan(JSON.stringify({...p,goals:[{...p.goals[0],targets:[{name:'W',copies}]}]})));
  assert.throws(()=>parsePullPlan(JSON.stringify({...p,goals:[{...p.goals[0],includeSpark:'yes'}]})));
  assert.throws(()=>simulateOdds(request(limited,100,['Nian']),1),/no longer available/);
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
  const estimate=simulateOdds(request(limited,120,['Closure']),100000);
  for(let n=1;n<=6;n++) {
    const exact=[...state].reduce((sum,[key,p])=>sum+(Number(key.split(',')[1])>=n?p:0),0);
    assert.ok(Math.abs(estimate.copies[0][n-1].probability-exact)<.006,`tail ${n}`);
  }
});
