import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBase } from '../../lib/base/calculateBase';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { buildSheetCase, sheetCases } from './helpers/baseCombinationCases';
import { getAllOperators } from '../../lib/operators/operators';
import type { FactoryProduct } from '../../lib/base/baseTypes';

const modes = [
  {label:'Factory',id:'prod1',product:'Precious Metals'},
  {label:'Factory',id:'prod1',product:'Battle Records'},
  {label:'Factory',id:'prod1',product:'Originium Shards'},
  {label:'Trading Post',id:'prod5'},
  {label:'Reception Room',id:'receptionRoom'},
  {label:'Control Center',id:'controlCenter'},
] as const;

// These checks establish numerical safety and permutation invariance for every
// two-worker pairing in these rooms. They are not independent numeric oracles.
for (const mode of modes) test(`all source-skill pairs: ${mode.label} ${'product' in mode?mode.product:''}`, t => {
  const {input} = buildSheetCase(sheetCases.find(c=>c.id==='FAC:3')!);
  input.assignments = {};
  if ('product' in mode) input.factoryProducts = {prod1:mode.product as FactoryProduct};
  const sourceOperators = new Map(getAllOperators().map(op => [op.name, op]));
  const tier = (op: typeof input.operators[number]) => {
    const promotion = sourceOperators.get(op.name)!.promotion;
    return promotion.some(p => p.tier === 'Elite 2') ? 'Elite 2' : promotion.some(p => p.tier === 'Elite 1') ? 'Elite 1' : 'Base';
  };
  const candidates = input.operators.filter(op=>activeBaseSkills(op,mode.label,tier(op),input.skillSlots).length>0);
  const values = (result:ReturnType<typeof calculateBase>) => {
    const r = result.rooms[mode.id];
    return [r.productivity?.grey ?? 0,r.productivity?.yellow ?? 0,r.capacity?.adjustment ?? 0,r.orderLimit?.adjustment ?? 0,r.clueSpeed ?? 0,r.clueSpeedBase ?? 0,result.ccEffects.tradingPostBonus,result.ccEffects.factoryBonus,result.ccEffects.clueCollectionBonus,result.ccEffects.ccMoraleBonus,result.dailyGoldWorthGreen,result.dailyGoldWorthRed,result.dailyExpGreen,result.dailyGoldMadeGreen];
  };
  let checked=0;
  for (let a=0;a<candidates.length;a++) for(let b=a+1;b<candidates.length;b++) {
    const pair = [candidates[a],candidates[b]].map(op=>({operatorName:op.name,eliteLevel:tier(op)}));
    input.assignments[mode.id]=pair; const forward=values(calculateBase(input));
    input.assignments[mode.id]=[...pair].reverse(); const backward=values(calculateBase(input));
    for(let i=0;i<forward.length;i++) {
      assert(Number.isFinite(forward[i]), `${mode.label}: ${pair.map(p=>p.operatorName)} output ${i} is not finite`);
      assert(Math.abs(forward[i]-backward[i])<1e-7, `${mode.label}: ${pair.map(p=>p.operatorName)} changes output ${i} with slot order: ${forward[i]} vs ${backward[i]}`);
    }
    checked++;
  }
  t.diagnostic(`${candidates.length} eligible workers; ${checked} pairings; two slot orders each`);
});
