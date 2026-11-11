/**
 * Which seats a finished plan leaves empty, and what its Dormitory beds hold.
 *
 *   npx tsx scripts/bench/seat-gaps.ts <tests/fixtures/krooster/user.json> [seconds=60 | r<rounds>] [interval=12] [--brief] [--take=40]
 *
 * `r40` runs 40 anneal rounds instead of the clock: the same plan every run, so two checkouts differ only in the
 * completion (lib/base/completeStaffing.ts). `--brief` prints one line: empty seat-shifts outside the Training Room.
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import { getFacilities } from '../../lib/base/baseConfig';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const brief = process.argv.includes('--brief');
// `--take=40` keeps the first 40 owned operators: a thin roster, which cannot staff every seat.
const take = Number(process.argv.find(a => a.startsWith('--take='))?.slice(7) ?? 0);
const [file, seconds = '60', interval = '12'] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const rounds = seconds.startsWith('r') ? Number(seconds.slice(1)) : undefined;
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const known = new Set(operators.map(o => o.name));
const profile = profileFromData(JSON.parse(fs.readFileSync(file, 'utf8')));
if (!profile) throw new Error('not a profile');
const owned = ownedBaseRoster(accountFromKrooster(profile, map as never).record, known).roster;
const roster = take ? Object.fromEntries(Object.entries(owned).slice(0, take)) : owned;
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never };
const r = optimizeAccountBase({ base, roster, snapshot: undefined, loginInterval: Number(interval), objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: rounds ? 600 : Number(seconds), ...(rounds ? { annealRounds: rounds } : {}) });
for (const rec of r.recommendations.slice(0, 1)) {
  const plan = rec.plan, facilities = getFacilities(rec.spots, rec.levels);
  const facs = facilities.filter(f => f.capacity);
  const kind = new Map(facs.map(f => [f.id, f.kind]));
  const works = new Set(plan.shifts.flatMap(s => Object.entries(s.assignments).flatMap(([id, sl]) => kind.get(id) === 'dormitory' ? [] : sl.flatMap(x => x ? [x.operatorName] : []))));
  const gaps = facs.filter(f => !['dormitory', 'trainingRoom'].includes(f.kind)).flatMap(f => plan.shifts.flatMap((s, i) => { const n = f.capacity - (s.assignments[f.id] ?? []).filter(Boolean).length; return n ? [`${f.label} s${i + 1} -${n}`] : []; }));
  const open = facs.filter(f => !['dormitory', 'trainingRoom'].includes(f.kind)).reduce((sum, f) => sum + plan.shifts.reduce((n, s) => n + f.capacity - (s.assignments[f.id] ?? []).filter(Boolean).length, 0), 0);
  const plain = plan.notes.find(n => n.startsWith('Seated so the room is not left open'))?.split(':')[1]?.split('. ')[0] ?? '';
  console.log(`${file.split('/').pop()}: ${Object.keys(roster).length} ops, ${rec.label}, score ${rec.score.toFixed(1)}, ${plan.shifts.length} shifts, open ${open} [${gaps.join(', ')}]${plain ? ` plain:${plain}` : ''}, exhausted ${plan.simulation.events.filter(e => e.kind === 'exhausted').length}`);
  if (brief) continue;
  plan.shifts.forEach((s, i) => {
    const empty = facs.filter(f => f.kind !== 'dormitory').flatMap(f => { const n = f.capacity - (s.assignments[f.id] ?? []).filter(Boolean).length; return n ? [`${f.label} -${n}`] : []; });
    const beds = facs.filter(f => f.kind === 'dormitory').flatMap(f => (s.assignments[f.id] ?? Array(f.capacity).fill(null)));
    const resting = beds.filter(x => x && works.has(x.operatorName)).length, idle = beds.filter(x => x && !works.has(x.operatorName)).map(x => x!.operatorName);
    console.log(` shift ${i + 1}: empty [${empty.join(', ')}] | beds: ${resting} workers resting, ${idle.length} non-workers (${idle.join(', ')}), ${beds.filter(x => !x).length} free`);
  });
  const placed = new Set(plan.shifts.flatMap(s => Object.values(s.assignments).flatMap(sl => sl.flatMap(x => x ? [x.operatorName] : []))));
  console.log(` roster unplaced: ${Object.keys(roster).length - placed.size}`);
  for (const n of plan.notes) console.log('  note:', n.slice(0, 300));
}
