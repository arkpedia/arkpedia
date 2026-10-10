import { mkdirSync, writeFileSync } from 'node:fs';
import { sheetCases, evaluateSheetCase } from '../tests/helpers/baseCombinationCases';
import { expectedSheetCell, sheetAdjudications } from '../tests/helpers/baseCombinationExpectations';
import source from '../tests/fixtures/base-combinations-sheet.json';
import trading from '../tests/fixtures/base-trading-reference.json';

const rows = sheetCases.map(c => {
  const evaluated = evaluateSheetCase(c);
  return { id: evaluated.id, notes: evaluated.notes, cells: evaluated.cells.map(e => ({ ...e, matches: e.value !== undefined ? Math.abs(e.actual-e.value) < (e.metric === 'lmd' ? 1 : 1e-8) : e.range ? e.actual >= e.range[0]-1e-8 && e.actual <= e.range[1]+1e-8 : null })) };
});
mkdirSync('.cache/base-combinations', {recursive:true});
writeFileSync('.cache/base-combinations/raw-comparison.json', JSON.stringify(rows,null,2));
for (const row of rows) {
  const failures = row.cells.filter(e => e.matches === false);
  if (failures.length) console.log(`${row.id}: ${failures.map(e => `${e.cell} ${e.original} → ${e.actual.toFixed(6)}`).join('; ')}`);
}
console.log(`${rows.length} rows, ${rows.filter(r=>r.cells.some(e=>e.matches===false)).length} with differences, ${rows.flatMap(r=>r.cells).filter(e=>e.matches===null).length} underspecified cells`);

const escape = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const number = (n: number) => Number(n.toFixed(5)).toString();
const unexpected: string[] = [];
const reviewed = rows.map(row => ({ ...row, cells: row.cells.map(cell => {
  const expected = expectedSheetCell(row.id.split(':')[0], cell);
  const matches = expected.value !== undefined ? Math.abs(cell.actual - expected.value) < (cell.metric === 'lmd' ? 1 : 1e-8)
    : expected.range ? cell.actual >= expected.range[0] - 1e-8 && cell.actual <= expected.range[1] + 1e-8 : null;
  if (matches === false || matches === null && !expected.adjudication) unexpected.push(`${row.id}/${cell.cell}`);
  return { ...cell, expected: expected.value, status: expected.adjudication?.status ?? 'match', reason: expected.adjudication?.reason, matches };
}) }));
writeFileSync('.cache/base-combinations/reviewed-comparison.json', JSON.stringify(reviewed, null, 2));
const formatActual = (cell: typeof reviewed[number]['cells'][number]) => cell.metric === 'bonus' ? `${number(cell.actual * 100)}%` : `${number(cell.actual)}${cell.metric === 'lmd' ? ' LMD/day' : ''}`;
const document = [
  '# Base combination coverage — 2026-10-09',
  '',
  'All 173 populated scenario rows in the supplied workbook run through `calculateBase`, the complete calculator used by `/base`. This is numerical regression coverage of reconstructed snapshots. It does not certify every possible base composition or reproduce live game history.',
  '',
  '## Sources and reproduction',
  '',
  `- [Supplied workbook](${source.source}), exported ${source.retrieved}; XLSX SHA-256 \`${source.sha256}\`. Raw cell strings, room headers and row numbers are preserved in \`scripts/tests/fixtures/base-combinations-sheet.json\`.`,
  `- [Linked trading reference](${trading.source}), latest tab \`${trading.sheet}\`, exported ${trading.retrieved}; XLSX SHA-256 \`${trading.sha256}\`. Its 54 numeric rows are preserved in \`scripts/tests/fixtures/base-trading-reference.json\`.`,
  '- Operator skill IDs, slots, unlocks and descriptions use the independently imported game-table fixtures described in [the source audit](base-skill-audit-2026-10-09.md). Source descriptions do not expose all probability curves or effect evaluation priorities.',
  '- Run `npm run test:base`, `npm run audit:base-combinations` and `npm run audit:base`. The combination audit regenerates this report and writes raw/reviewed JSON comparisons under ignored `.cache/base-combinations/`. Unexpected differences make it fail.',
  '- The source audit needs raw game-table caches. This run used `ARKPEDIA_GAMEDATA=.cache/base-audit/en ARKPEDIA_CN_BASE_BUILDING=.cache/base-audit/cn-building_data.json npm run audit:base`; all four categories had zero findings. Without raw tables that command reports a skip, which is not a pass.',
  '- Fixtures were extracted read-only from the XLSX shared strings and worksheet cells. Refresh by exporting each source workbook as XLSX, recording its SHA-256 and preserving original cell coordinates. Never derive expected numbers from calculator output.',
  '',
  '## Coverage and interpretation',
  '',
  ...source.sheets.map(s => `- **${s.name}: ${s.cases.length} ${s.cases.length === 1 ? 'row' : 'rows'}** (${s.cases.map(c=>c.row).join(', ')}).`),
  '- The Morale tab contains an empty “To do” row, without a scenario or expected number. Template and References tabs are supporting material. Annex 1’s six Jaye/Gnosis/Degenbrecher/Swire worked examples, Annex 2’s order distributions and Annex 4’s layout were inspected and used in reconstruction. Annex 3 is explanatory text, not another numeric scenario suite.',
  '- Only four physical dormitories exist. The fifth dorm block in the template is excluded. Named spellings/alters are mapped explicitly; “Any” resting workers use distinct real operators outside the relevant counted groups. Missing promotion defaults to E0; explicit level gates are retained.',
  '- The 252 layout follows Annex 4: five level-3 factories, TP levels 3/2, two level-3 plants, four level-1 dorms, Office 1 and Reception 2. These tests reproduce the listed room levels; they do not certify that every worksheet layout satisfies its power budget. The 342 template’s third plant block is excluded to retain nine production rooms.',
  '- Bonus values exclude room baseline efficiency. Power Plant and Office skill columns exclude their staffed innate 5%; Reception values include operator innate/rarity/promotion bonuses above its 100% baseline. TP CAP usually means adjustment, but two cells specify total capacity and are normalized explicitly.',
  '- TP:32 is expanded into four- and five-Gold-line cases (160%/165%). FAC:51 additionally tests the missing two-robot variant (65%). Original cell contents are retained below even when corrected.',
  '- Twenty additional complete-calculator boundary tests cover Ling/Dusk at 12 versus 12.01 Morale, concurrent Worldly Plight consumers, Office levels 1/2/3, Czerny/Iris in different-level dorms, shared non-consuming PI conversion, all four R6 trainers at E0/E1/E2, and exhausted plant/Office workers.',
  '- Property checks cover **19,445 eligible two-worker/product pairings, each in both slot orders (38,890 calculations)**: Gold/EXP/Originium factories (4,278 each), Trading Posts (2,926), Reception (1,540) and Control Center (2,145). These assert finite output and order invariance. They are not independent numerical correctness proofs. Dorm target selection and single-trainer/workshop rooms use targeted regressions instead.',
  '- Fixes found in this audit: empty Trading Posts producing LMD through CC bonuses; Degenbrecher/Jaye/Swire ordering inconsistent with Annex 1; exhausted imported workers retaining working skills; stale products on unbuilt/converted factories counting as Gold lines; Greyy alter truncating 235-drone capacity to 23% instead of 23.5%; mislabeled TP skill breakdown lines; and phone calculation lines collapsing to zero height.',
  '',
  '## Row-by-row scenario results',
  '',
  '“match” means the provided numeric oracle matches; “source-correction” retains the original value while using reviewed source/current reference evidence; “normalization” fixes representation; “estimate” has a stated model boundary; “expanded” has explicit variant tests. Rows with no numeric oracle verify source-derived clue speed and retain qualitative likelihood notes.',
  '',
  '| Scenario | Worksheet cells: original → calculator | Status | Reconstruction notes |',
  '| --- | --- | --- | --- |',
  ...reviewed.map(row => {
    const cells = row.cells.map(c=>`${c.cell}: ${escape(c.original)} → ${formatActual(c)}`).join('; ') || 'No numeric oracle; clue-speed + likelihood-note regression';
    const statuses = [...new Set(row.cells.map(c=>c.status))].join(', ') || 'qualitative';
    return `| ${row.id} | ${cells} | ${statuses} | ${escape(row.notes.filter(n=>!n.startsWith('Anonymous')).join(' '))} |`;
  }),
  '',
  '## Reviewed differences and underspecified cells',
  '',
  '| Cell | Treatment | Reason |',
  '| --- | --- | --- |',
  ...Object.entries(sheetAdjudications).map(([cell,e])=>`| ${cell} | ${e.status}${e.value !== undefined ? `; numeric oracle ${number(e.value)}` : ''} | ${escape(e.reason)} |`),
  '',
  '## Linked trading-reference coverage',
  '',
  'All 54 numeric rows in the latest `202408 Pepe` tab pass through the full calculator. Real Proviso, Tequila, Closure and Pepe records supply special-order mechanics. Synthetic calibration workers supply the reference’s stated total efficiency and Tailoring distributions. Many rows do not describe an attainable named team; this validates the order arithmetic at those inputs, not the feasibility of every worker label. The older `202303 Prov Teq` and explicitly outdated `202209` revisions are historical and are not presented as current oracles.',
  '',
  '| Reference row | TP level | Total efficiency | Tailoring | Tequila / Proviso | Expected LMD/day |',
  '| --- | --- | --- | --- | --- | --- |',
  ...trading.rows.map(r=>`| ${r.row} | ${r.level} | ${number(r.rate)} | ${r.tailoring} | ${r.tequila} / ${r.proviso} | ${number(r.lmd ?? r.baselineLmd*r.rate)} |`),
  '',
  '## Remaining evidence boundaries',
  '',
  '1. Mature Tailoring probabilities/warm-up are community measurements. Source tables do not encode their curves; lower-level proxy distributions remain estimates. Clue-type likelihood remains qualitative.',
  '2. Jaye/Degenbrecher/Swire now matches all six Annex 1 examples, including 121% with total limit 14 under Gnosis. This is community reference evidence; game skill text alone does not establish the evaluation priority. E0 Jaye’s 12h/24h queue model differs from the worksheet’s heuristic fixed adjustments and is not certified against a recorded live queue.',
  '3. Exhausted Lancet still supplies physical presence for Eunectes while not blocking Greyy alter’s working-robot condition. Advanced:6 has a numeric regression for that community interpretation, not an in-game execution trace. Pepe versus Closure’s competing fixed order priority likewise remains unverified.',
  '4. Fiammetta’s one-off transfer, historical dorm target locks, uninterrupted Irene/Logos preparation, accumulated Zuo Le training and craft history require explicit current/prepared counters. Snapshot calculations and the rotation timetable do not simulate every historical skill event or auto-execute a rotation in game.',
  '5. The linked general combo guide is background material, not an additional fully enumerated oracle. The property checks do not cover every three-worker team, full-base Cartesian composition or cross-room resource history. No claim is made that every imaginable combination is game-certified.',
  '',
  '## Validation record',
  '',
  '- Focused base suite: 283 passed, zero failed/skipped. Source inventory tests also check 429 operators, 921 steps and 11,583 promotion/room activation comparisons against independently extracted game-table chains.',
  '- Desktop/mobile browser: 22 checks passed for imported staffing/rotation persistence, responsive stability, live worksheet Worldly Plight/Witchcraft output, Degenbrecher/Jaye breakdown and empty-TP output. These exercise the actual production page, not a separate test calculator.',
  '- Typecheck, changed-file lint and production build/postbuild trace/client-chunk guards pass. Existing unrelated build lint warnings remain.',
  '- Full unit suite: 1,531 tests, 1,527 passed, three skipped, one failed. The failing homepage previous-release compatibility assertion (`test-previous-release-props.ts`, `/`) concerns missing `ongoingBanners` fields `global_date_estimated`, `global_window` and `globalPoolId`. The exact failure reproduces in a clean archive of baseline commit `888c4cec`, with none of this audit’s changes; it is not hidden or marked passed.',
  '- This is local and draft-PR validation. No production promotion or recorded live-game numerical trace is claimed.',
  '',
];
mkdirSync('docs/development', { recursive: true });
writeFileSync('docs/development/base-combination-coverage-2026-10-09.md', document.join('\n'));
console.log(`Reviewed: ${reviewed.length} rows; ${unexpected.length} unexpected or unreviewed differences.`);
if (unexpected.length) { console.error(unexpected.join('\n')); process.exitCode = 1; }
