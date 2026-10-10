import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities } from '../../lib/base/baseConfig';
import { sheetCases, evaluateSheetCase, buildSheetCase } from './helpers/baseCombinationCases';
import { expectedSheetCell, sheetAdjudications } from './helpers/baseCombinationExpectations';

const near = (actual: number, expected: number, tolerance = 1e-8) => assert(Math.abs(actual-expected) <= tolerance, `${actual} != ${expected}`);
const scenario = (id: string) => buildSheetCase(sheetCases.find(c => c.id === id)!);

for (const c of sheetCases) test(`complete base spreadsheet ${c.id}`, () => {
  const e = evaluateSheetCase(c);
  for (const cell of e.cells) {
    const expected = expectedSheetCell(c.sheet.name, cell);
    if (expected.value !== undefined) near(cell.actual, expected.value, cell.metric === 'lmd' ? 1 : 1e-8);
    else if (expected.range) assert(cell.actual >= expected.range[0]-1e-8 && cell.actual <= expected.range[1]+1e-8, `${cell.cell}: ${cell.actual} outside ${expected.range}`);
    else assert(expected.adjudication, `${c.id}/${cell.cell}: missing explicit verification scope`);
  }
  for (const room of Object.values(e.result.rooms)) {
    assert(room.deadTime === null || Number.isFinite(room.deadTime) && room.deadTime >= 0);
    assert(room.productivity === null || Number.isFinite(room.productivity.grey + room.productivity.yellow));
  }
  // These rows only specify clue-likelihood pairings, without expected numbers.
  if (c.sheet.name === 'RR' && c.row.row >= 24) {
    near(e.result.rooms.receptionRoom.facilityBreakdown!.effectiveProductivity, ({24:1.35,25:1.91,26:1.60} as Record<number,number>)[c.row.row]);
    assert(e.result.rooms.receptionRoom.facilityBreakdown!.lines.some(l => l.note?.includes('not a speed number')));
  }
  if (c.id === 'TP:30') {
    const lines = e.result.rooms.prod5.facilityBreakdown!.lines;
    near(lines.find(l => l.skillName === "Champion's Bearing")!.rawValue, 0.5);
    near(lines.find(l => l.skillName === 'Imposing Presence')!.rawValue, 0.25);
  }
});

test('spreadsheet catalogue and exception list cannot silently lose a scenario or assertion', () => {
  assert.equal(sheetCases.length,173);
  for (const key of Object.keys(sheetAdjudications)) {
    const [sheet,cell] = key.split(':');
    assert(sheetCases.some(c => c.sheet.name === sheet && c.row.row === Number(cell.match(/\d+$/)![0]) && c.row.cells[cell.replace(/\d+$/, '') as keyof typeof c.row.cells] !== undefined), key);
  }
});

for (const count of [4,5]) test(`Pozy Tuye Kirara: ${count} built Gold lines and four counted Durins`, () => {
  const {input} = scenario('TP:32');
  if (count === 5) {
    const spots = Object.fromEntries(input.facilities.filter(f=>f.id.startsWith('prod')).map(f=>[f.id, f.id === 'prod9' ? 'factory' : f.kind]));
    input.facilities = getFacilities(spots as Parameters<typeof getFacilities>[0], {});
  }
  input.factoryProducts = Object.fromEntries(input.facilities.filter(f=>f.kind==='factory').map(f=>[f.id,'Precious Metals']));
  const result = calculateBase(input);
  near(result.rooms.prod5.productivity!.yellow, count === 4 ? 1.60 : 1.65);
});

test('Warmy Alanna gains the missing robot contributions only when robots are actually assigned', () => {
  const {input} = scenario('FAC:51');
  near(calculateBase(input).rooms.prod1.productivity!.yellow, 0.45);
  input.assignments.prod7 = [{operatorName:'Lancet-2',eliteLevel:'Base'}];
  input.assignments.prod8 = [{operatorName:'CONFESS-47',eliteLevel:'Base'}];
  near(calculateBase(input).rooms.prod1.productivity!.yellow, 0.65);
});

for (const id of ['252:6','252:7']) test(`Jaye E0 ${id} distinguishes productive-hour averaging, login time and full storage`, () => {
  const {input} = scenario(id); const room = id.endsWith('6') ? 'prod6' : 'prod7';
  const at12 = calculateBase({...input,loginInterval:12}), at24 = calculateBase({...input,loginInterval:24});
  assert(at12.rooms[room].productivity!.yellow > at24.rooms[room].productivity!.yellow);
  assert(at24.rooms[room].productivity!.yellow > 0 && at12.rooms[room].productivity!.yellow < (id.endsWith('6') ? 0.4 : 0.32));
  assert(at24.dailyGoldWorthGreen <= at24.dailyGoldWorthRed);
  if (id.endsWith('7')) assert(at24.rooms[room].fullTime! < 24, 'level-2 storage fills before login');
});

test('empty rooms do not generate ghost output from Control Center bonuses', () => {
  const {input} = scenario('TP:17');
  const both = calculateBase(input);
  input.assignments.prod5 = [];
  near(calculateBase(input).dailyGoldWorthRed,0);
  near(both.dailyGoldWorthRed,25479.45205,0.001);
});

test('Gold line consumers exclude unbuilt rooms and old products on converted rooms', () => {
  const {input} = scenario('TP:32');
  input.factoryProducts = {prod1:'Precious Metals',prod9:'Precious Metals',unknown:'Precious Metals'};
  input.facilities = input.facilities.map(f=>f.id==='prod1'?{...f,level:0,capacity:0}:f);
  near(calculateBase(input).rooms.prod5.productivity!.yellow,0.60);
});
