import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBase } from '../../lib/base/calculateBase';
import { syntheticSkillEntry } from '../../lib/base/baseSkillEffects';
import type { BaseOperator, BaseSkill } from '../../lib/operators/operatorTypes';
import type { SlotAssignment } from '../../lib/base/baseTypes';
import { buildSheetCase, sheetCases } from './helpers/baseCombinationCases';
import reference from './fixtures/base-trading-reference.json';

// This sheet varies a TOTAL efficiency input, often without a buildable team.
// Synthetic workers supply that stated input. Actual Proviso/Tequila/Closure/
// Pepe records provide their special skills, and the complete page calculator
// must reproduce the sheet's output. This is arithmetic calibration, not proof
// that every operator label in the reference can attain that input rate.
/** Closure's record as a Global rename leaves it: another name, the old one kept in aliases, and
 *  every base skill renamed (on 2026-10-14 her Special Orders became Special Order, and rows 54-58
 *  lost her special orders in that night's content run). The output must not move. */
const RENAMED = 'Closure (Global name)';
function renameClosure(operators: BaseOperator[]): BaseOperator[] {
  return operators.map(op => op.name !== 'Closure' ? op : { ...op, name: RENAMED, aliases: ['Closure'], baseSkills: op.baseSkills?.map(skill => ({ ...skill, name: `${skill.name} (Global name)` })) });
}

function referenceRow(row: (typeof reference.rows)[number], renamed = false) {
  const {input} = buildSheetCase(sheetCases.find(c=>c.id==='TP:17')!);
  input.facilities = input.facilities.map(f=>f.id==='prod5'?{...f,level:row.level,capacity:row.level}:f);
  const staff: SlotAssignment[] = [];
  input.assignments = {controlCenter:[{operatorName:'Amiya',eliteLevel:'Base'}],prod5:staff};
  const push = (operatorName:string, phase:string) => staff.push({operatorName,eliteLevel:phase === 'E2'?'Elite 2':'Base'});
  const synthetic: BaseOperator[] = [];
  const addWorker = (quality?: string) => {
    const name = `Reference input ${row.row} ${synthetic.length}`;
    const skills: Partial<BaseSkill>[] = [{name:'Reference rate',facility:'Trading Post',slot:0,phase:0,level:1,description:'When assigned to a Trading Post, order acquisition efficiency +0%.',tableEntry:syntheticSkillEntry('TRADING',[{kind:'orderEfficiency',value:0}])}];
    if (quality) skills.push({name:quality,facility:'Trading Post',slot:1,phase:0,level:1,description:'Observed order-quality distribution input.',tableEntry:syntheticSkillEntry('TRADING',[],{goldOrderTier:quality.endsWith('β')?'higher':'lower'})});
    const template = input.operators.find(o=>o.name==='Jessica')!;
    synthetic.push({...template,name,baseSkills:skills as BaseSkill[]});push(name,'E0');
  };
  if (row.tailoring.includes('beta')) addWorker('Tailoring β');
  else if (row.tailoring === 'alpha+alpha') {addWorker('Tailoring α');addWorker('Tailoring α');}
  else if (row.tailoring === 'alpha') addWorker('Tailoring α');
  if (row.tequila !== '(none)') push('Tequila',row.tequila);
  if (row.proviso !== '(none)') push('Proviso',row.proviso);
  if (row.row >=54 && row.row<=58) push(renamed ? RENAMED : 'Closure','E2');
  if (row.row===62) push('Pepe','E2');
  if (!synthetic.length && staff.length < row.level) addWorker();
  while(staff.length < row.level) addWorker();
  assert(staff.length <= row.level, `reference ${row.row} requires too many operators`);
  if (!synthetic.length) {
    // Double-alpha + Tequila occupies all three slots. Its first quality
    // worker also supplies the variable efficiency input above.
    assert(row.row===62,'numeric calibration must have an input worker');
  } else {
    const intrinsic = row.row >=54 && row.row<=58 ? 0.1 : 0;
    const contribution = row.rate - (1 + staff.length*0.01 + 0.07 + intrinsic);
    synthetic[0].baseSkills![0].description = `When this Operator is assigned to a Trading Post, order acquisition efficiency +${(contribution*100).toFixed(8)}%.`;
    synthetic[0].baseSkills![0].tableEntry = syntheticSkillEntry('TRADING', [{ kind: 'orderEfficiency', value: Number((contribution * 100).toFixed(8)) / 100 }]);
  }
  input.operators = [...(renamed ? renameClosure(input.operators) : input.operators),...synthetic];
  const result = calculateBase(input);
  const expected = row.lmd ?? row.baselineLmd*row.rate;
  assert(Math.abs(result.dailyGoldWorthRed-expected)<0.001, `${row.row}: ${result.dailyGoldWorthRed} != ${expected}`);
}

for (const row of reference.rows) test(`complete calculator trading reference ${reference.sheet}:${row.row}`, () => referenceRow(row));
for (const row of reference.rows.filter(r => r.row >= 54 && r.row <= 58)) {
  test(`complete calculator trading reference ${reference.sheet}:${row.row}, with Closure renamed as Global renames`, () => referenceRow(row, true));
}
