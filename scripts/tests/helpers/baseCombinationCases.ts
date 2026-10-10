import assert from 'node:assert/strict';
import { getAllOperators } from '../../../lib/operators/operators';
import { getFacilities } from '../../../lib/base/baseConfig';
import { calculateBase, type BaseCalculationInput } from '../../../lib/base/calculateBase';
import { toBaseRosters } from '../../../lib/base/baseGroupRosters';
import type { BaseAssignments, ProductionSpots, FacilityLevels, FactoryProducts, FacilityKind } from '../../../lib/base/baseTypes';
import source from '../fixtures/base-combinations-sheet.json';
import groups from '../../../data/base-group-rosters.json';
import slots from '../../../data/base-skill-slots.json';
import recipes from '../../../data/base-workshop-recipes.json';

// The page exposes one physical Amiya; class-form duplicates are combat views.
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const names = new Set(operators.map(o => o.name));
const aliases: Record<string, string> = {
  'Executor alter': 'Executor the Ex Foedere', 'Fang alter': 'Fang the Fire-Sharpened',
  'Thorns alter': 'Thorns the Lodestar', 'Silence alter': 'Silence the Paradigmatic',
  'Jessica alter': 'Jessica the Liberated', 'Specter alter': 'Specter the Unchained',
  'Silverash': 'SilverAsh', 'Silverash alter': 'SilverAsh the Reignfrost',
  'Pramanix alter': 'Pramanix the Prerita', 'Swire alter': 'Swire the Elegant Wit',
  'Greyy alter': 'Greyy the Lightningbearer', 'Blaze alter': 'Blaze the Igniting Spark',
  'Noir Corne alter': 'Rathalos S Noir Corne', 'Kirin Yato': 'Kirin R Yato',
  'Chen3': "Ch'en the Dawnstreak", 'Wisadel': "Wiš'adel", 'Pozemka': 'Pozëmka',
  'Sankta Miks.': 'Sankta Miksaparato', 'Phonor-0': 'PhonoR-0', 'Confess-47': 'CONFESS-47',
  'Cznery': 'Czerny', 'Fiametta': 'Fiammetta', 'Wildmane': 'Wild Mane', 'Wulfenite': 'Wulfenite',
  'TRC': 'Terra Research Commission', 'Mr Nothing': 'Mr. Nothing', 'Miss Christine': 'Miss.Christine', 'Vina': 'Vina Victoria', 'Typhoon': 'Typhon',
  'Sakiko': 'Togawa Sakiko', 'Uika': 'Misumi Uika', 'Mutsumi': 'Wakaba Mutsumi',
  'Umiri': 'Yahata Umiri', 'Nyamu': 'Yūtenji Nyamu',
};
export const sheetCases = source.sheets.flatMap(sheet => sheet.cases.map(row => ({ sheet, row, id: `${sheet.name}:${row.row}` })));
export type SheetCase = typeof sheetCases[number];
export type ExpectedCell = { cell: string; roomId: string; kind: FacilityKind; metric: 'bonus' | 'capacity' | 'lmd'; original: string; value?: number; range?: [number, number] };

export function buildSheetCase(c: SheetCase): { input: BaseCalculationInput; expected: ExpectedCell[]; notes: string[] } {
  const productionSpots: ProductionSpots = {}, facilityLevels: FacilityLevels = {}, assignments: BaseAssignments = {}, factoryProducts: FactoryProducts = {};
  const expected: ExpectedCell[] = [], notes: string[] = [];
  const used = new Set<string>(); let spot = 0, dorm = 0, pp = 0;
  const anonymous = operators.filter(o => !groups.DURIN.includes(o.name) && !groups.SUI.includes(o.name) && !groups.WANDERING_MEDIC.includes(o.name)).map(o => o.name);
  let clueExchangeActive = false;
  for (const group of c.sheet.groups) {
    const label = group.label;
    const kind: FacilityKind | null = label.startsWith('FACTORY') ? 'factory' : label.startsWith('TRADING') ? 'tradingPost' : label.startsWith('POWER') ? 'powerPlant' : label.startsWith('DORM') ? 'dormitory' : label.startsWith('CONTROL') ? 'controlCenter' : label.startsWith('RECEPTION') ? 'receptionRoom' : label.startsWith('OFFICE') ? 'office' : label.startsWith('WORKSHOP') ? 'workshop' : label.startsWith('TRAINING') ? 'trainingRoom' : null;
    if (!kind) continue;
    if (kind === 'dormitory' && ++dorm > 4) { if (Object.keys(group.fields).some(col => c.row.cells[col as keyof typeof c.row.cells])) notes.push('Fifth template dorm excluded: the game has four dorms.'); continue; }
    if (kind === 'powerPlant' && ++pp > (c.sheet.name === '342' ? 2 : 3)) continue;
    const production = ['factory', 'tradingPost', 'powerPlant'].includes(kind);
    const id = production ? `prod${++spot}` : kind === 'dormitory' ? `dormitory${dorm}` : kind;
    if (production) productionSpots[id] = kind as ProductionSpots[string];
    const level = label.match(/(?:level|lvl) (\d)/)?.[1];
    facilityLevels[id] = level ? Number(level) : kind === 'dormitory' || kind === 'controlCenter' ? 5 : 3;
    const fields = Object.entries(group.fields); assignments[id] = [];
    for (let i = 0; i < fields.length; i++) {
      const [col, field] = fields[i], raw = c.row.cells[col as keyof typeof c.row.cells];
      if (!raw) continue;
      if (field.startsWith('Operator')) {
        let name = raw.replace(' (dead)', ''); name = aliases[name] ?? name;
        if (name === 'Any') { name = anonymous.find(n => !used.has(n) && !Object.values(c.row.cells).includes(n))!; notes.push(`Anonymous dorm worker represented by ${name}.`); }
        assert(names.has(name), `${c.id} ${col}: unknown operator ${raw}`);
        assert(!used.has(name), `${c.id}: duplicate physical operator ${name}`); used.add(name);
        const eliteRaw = fields[i + 1]?.[1].startsWith('Pr.') ? c.row.cells[fields[i + 1][0] as keyof typeof c.row.cells] ?? 'E0' : 'E0';
        const phase = eliteRaw.match(/E([012])/)?.[1] ?? '0';
        const exactLevel = eliteRaw.match(/E[012] (\d+)/)?.[1];
        assignments[id].push({ operatorName: name, eliteLevel: phase === '0' ? 'Base' : `Elite ${phase}`, ...(exactLevel ? { level: Number(exactLevel) } : {}), morale: raw.includes('(dead)') ? 0 : kind === 'dormitory' ? 0 : 24 });
        if (raw.includes('(dead)')) notes.push(`${name} starts at zero Morale.`);
      } else if (field === 'Recipe' && kind === 'factory') factoryProducts[id] = raw === 'Gold' ? 'Precious Metals' : 'Battle Records';
      else if (raw === 'Yes' || raw === 'No') clueExchangeActive = raw === 'Yes';
      else if (field === 'Prod' || field === 'CAP') {
        const metric = field === 'CAP' ? 'capacity' : raw.includes('LMD/day') ? 'lmd' : 'bonus';
        const exact = /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : /^\d+ LMD\/day$/.test(raw) ? Number(raw.split(' ')[0]) : /^\d+%$/.test(raw) ? Number(raw.slice(0,-1))/100 : undefined;
        const range = raw.match(/^(\d+)-(\d+)%$/);
        expected.push({cell: `${col}${c.row.row}`, roomId:id,kind,metric,original:raw,value:exact, ...(range ? {range:[Number(range[1])/100,Number(range[2])/100] as [number,number]} : {})});
      }
    }
  }
  assert(Object.keys(productionSpots).length === 9, c.id + ': must describe nine production rooms');
  const facilities = getFacilities(productionSpots, facilityLevels);
  for (const room of facilities) assert((assignments[room.id]?.length ?? 0) <= room.capacity, `${c.id} ${room.id}: over capacity`);
  const importedMorale = notes.some(n => n.includes('zero Morale')) ? Object.fromEntries(Object.values(assignments).flatMap(ss => ss.flatMap(s => s ? [[s.operatorName, s.morale ?? 24]] : []))) : undefined;
  return { input: { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities, assignments, factoryProducts, clueExchangeActive, importedMorale }, expected, notes };
}

export function actualCell(result: ReturnType<typeof calculateBase>, e: ExpectedCell): number {
  const r = result.rooms[e.roomId];
  if (e.metric === 'lmd') return result.dailyGoldWorthRed;
  if (e.metric === 'capacity') return (e.kind === 'factory' ? r.capacity?.adjustment : r.orderLimit?.adjustment) ?? 0;
  if (e.kind === 'powerPlant') return (r.droneRate ?? 0) - (r.facilityBreakdown?.greyProductivity ?? 0);
  if (e.kind === 'office') return (r.office?.speed ?? 0) - 0.05;
  if (e.kind === 'receptionRoom') return (r.clueSpeed ?? 0) + (r.clueSpeedBase ?? 0) - 1;
  return r.productivity?.yellow ?? 0;
}

export function evaluateSheetCase(c: SheetCase) {
  const built = buildSheetCase(c), result = calculateBase(built.input);
  return { id:c.id, notes:built.notes, cells:built.expected.map(e => ({...e,actual:actualCell(result,e)})), input:built.input, result };
}
