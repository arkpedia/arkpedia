/** Reviewed exceptions to the supplied worksheet, never populated from calculator output. */
export const sheetAdjudications: Record<string, { value?: number; status: 'source-correction' | 'normalization' | 'estimate' | 'expanded'; reason: string }> = {
  'FAC:S51': { value:0.45,status:'source-correction',reason:'No robots are assigned in this row. Warmy contributes 30%, Alanna contributes the 15% pairing bonus. Two robots are needed for the listed 65%; that variant is tested separately.' },
  'FAC:S53': { value:0,status:'source-correction',reason:'Franka and Liskarm have no Factory skills; E0 Jessica the Liberated does not give the E2 Factory support bonus.' },
  'FAC:S54': { value:0.05,status:'source-correction',reason:'Group Hunting alpha gives 5% per original Abyssal Hunter in factories. Specter the Unchained is not in the source Abyssal Hunter glossary; only Specter receives 5%.' },
  'TP:BC13': { value:22662.08251,status:'source-correction',reason:'Annex 2 and the linked 202408 Pepe table row 44 use 13/22/65 double-alpha weights; they yield 22662 rather than the older 22592 here.' },
  'TP:BC16': { value:24577.60314,status:'source-correction',reason:'Annex 2 and the linked 202408 Pepe table row 41 use 13/22/65 double-alpha weights; they yield 24577 rather than the older 24444 here.' },
  'TP:BD27': { value:20,status:'normalization',reason:'This cell contains the TOTAL order limit, 30, whereas other CAP cells contain the adjustment. Base 10 + adjustment 20 = 30.' },
  'TP:BD30': { value:4,status:'normalization',reason:'Annex 1 contains TOTAL limit 14; the displayed adjustment is 4 above base 10.' },
  'RR:CB9': { value:0.91,status:'source-correction',reason:'Kazemaru skill 15% + Vigil skill 25% + Kazemaru innate/rarity/promotion 25% + Vigil 26% = 91%. Neither operator is exhausted in row 9.' },
  'HR:CA14': { value:0.35,status:'source-correction',reason:'Level-3 Office has two additional recruitment slots. Nosy contributes 10% to Reception: 12F skill 20% + innate 5% + 10% = 35%.' },
  'Advanced:S5': { value:0.6,status:'source-correction',reason:'Rosmontis and Ebenholz each generate 20 Perception Information. Both contributions remain available; Whisperain adds 20, for 60 total.' },
  'Advanced:BC5': { value:0.32,status:'source-correction',reason:'The same 60 Perception Information converts to Soundless Resonance, plus 5 from Virtuosa: floor(65/2) = 32%.' },
  'Advanced:S6': { value:1.6,status:'estimate',reason:'Current Snegurochka text gives 10% per Factory occupant (30%, not 15%). The dead-Lancet virtual-plant interpretation from the sheet gives Weedy 90% + Purestream 40% + Snegurochka 30% = 160%. Fatigued robot presence/evaluation remains community evidence.' },
  'Advanced:S10': { value:1.45,status:'source-correction',reason:'Current Workflow Optimization is 10% per Factory occupant: 30%, rather than the 15% assumed here. Weedy 75% + Purestream 40% + Snegurochka 30% = 145%.' },
  'Advanced:BS10': { value:0.1,status:'source-correction',reason:'Lancet-2 is awake here and her E0 Power Plant skill gives 10%; the zero applies to the exhausted version in row 6.' },
  '252:S8': { value:0.04,status:'source-correction',reason:'Annex 4 shows four level-1 dormitories, totaling four levels. The fifth dorm column is a template error: Narantuya gives 4%, not 5%.' },
  '252:BS11': { value:0.4,status:'source-correction',reason:'Famiglia Business beta checks Vigil anywhere in the base, giving 40% even when he is in another Trading Post. Outstanding Debt capacity remains same-room only.' },
  'PP:BP4': { value:0.23,status:'source-correction',reason:'The worksheet writes 23(.5)%. The game server gives her Power Plant 0.28 drone speed on a base of 235 drone capacity (a raw save, 2026-10-28: 5% innate + 23%), so Line Patrol Frame counts whole tens: 23%, not 23.5%.' },
  'Advanced:BP6': { value:0.23,status:'source-correction',reason:'The game server gives her Power Plant 0.28 drone speed on a base of 235 drone capacity (a raw save, 2026-10-28: 5% innate + 23%), so Line Patrol Frame counts whole tens: 23%, not 23.5%.' },
  'Advanced:BP8': { value:0.23,status:'source-correction',reason:'The game server gives her Power Plant 0.28 drone speed on a base of 235 drone capacity (a raw save, 2026-10-28: 5% innate + 23%), so Line Patrol Frame counts whole tens: 23%, not 23.5%.' },
  'Advanced:BP10': { value:0.23,status:'source-correction',reason:'The game server gives her Power Plant 0.28 drone speed on a base of 235 drone capacity (a raw save, 2026-10-28: 5% innate + 23%), so Line Patrol Frame counts whole tens: 23%, not 23.5%.' },
  'TP:BC32': { status:'expanded',reason:'The 4- and 5-Gold-production-line variants are separate tests, with expected bonuses 160% and 165%. The raw row leaves Factory products blank.' },
  '252:BL6': { status:'estimate',reason:'The sheet gives heuristic 12h/24h bonuses. Tests verify the queue-dependent decline, level dependence and capacity idle handling. Expected productive-hour averaging differs from a fixed subtraction heuristic; not certified against live order history.' },
  '252:BS7': { status:'estimate',reason:'As for row 6, with a level-2 Trading Post. Both 12h and 24h windows are tested; the sheet heuristic is retained as unverified rather than forced into the model.' },
};

export function expectedSheetCell(sheet: string, e: {cell:string;value?:number;range?:[number,number]}) {
  const adjudication = sheetAdjudications[`${sheet}:${e.cell}`];
  return { value:adjudication?.value ?? e.value, range:e.range, adjudication };
}
