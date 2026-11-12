/**
 * What a named pair is worth inside a finished plan. For every owned pair of scripts/audits/base-combo-catalogue.ts
 * whose skill the roster has unlocked and the plan leaves apart, the pair is swapped into the plan's own staffing
 * (whoever they replace takes the seats they left) and the calculator's snapshot is compared, which sorts each into:
 *
 *   no credit   the room is worth the same with or without the partner: the skill table gives the link nothing
 *   beaten      the link counts, but the plan's staffing is worth more
 *   candidate   the swap is worth more than the plan: the search left value behind (Morale not checked here)
 *
 * A snapshot ignores Morale, so a candidate still needs the simulator; a "beaten" or "no credit" does not.
 *
 *   npx tsx scripts/bench/combo-valuation.ts <run.json> [<run.json> ...]     (runs of scripts/bench/optimizer-run.ts)
 */
import fs from 'node:fs';
import { comboLinks } from '../audits/base-combo-catalogue';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { activeBaseSkills, cleanSkillName } from '../../lib/base/activeBaseSkills';
import { snapshotTotals } from '../../lib/base/snapshotMemo';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import type { AccountRecord } from '../../lib/account/accountStore';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import type { BaseAssignments, SlotAssignment } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills }) as BaseOperator);
const byName = new Map(operators.map(o => [o.name, o]));
const known = new Set(operators.map(o => o.name));
const ROOM_KIND: Record<string, string> = { 'Control Center': 'controlCenter', 'Trading Post': 'tradingPost', Factory: 'factory', 'Power Plant': 'powerPlant', 'Reception Room': 'receptionRoom', Office: 'office' };
const WHERE_KIND: Record<string, string> = { 'Control Center': 'controlCenter', 'a Trading Post': 'tradingPost', 'a Factory': 'factory', 'a Power Plant': 'powerPlant', 'Reception Room': 'receptionRoom', Office: 'office' };
const seenLink = new Set<string>();
const pairs = comboLinks().links.filter(l => l.needs.kind === 'operator' && ROOM_KIND[l.room] && (l.where === 'same room' || l.where === 'anywhere working' || WHERE_KIND[l.where]))
  .filter(l => { const key = `${l.holder}|${l.needs.name}|${l.room}|${l.where}`; if (seenLink.has(key)) return false; seenLink.add(key); return true; });

type Verdict = 'together' | 'no credit' | 'beaten' | 'candidate';
const tally = new Map<string, Record<Verdict, number> & { gain: number[] }>();
for (const file of process.argv.slice(2)) {
  const run = JSON.parse(fs.readFileSync(file, 'utf8')) as { account: string; loginInterval: number; recommendations: { id: string; label: string; score: number; products: never; shifts: { rooms: Record<string, (string | null)[]> }[] }[] };
  const rec = run.recommendations[0];
  if (!rec) continue;
  const roster = ownedBaseRoster(accountFromKrooster(profileFromData(JSON.parse(fs.readFileSync(run.account, 'utf8')))!, map as never).record as AccountRecord, known).roster;
  const facilities = getFacilities(presetSpots(rec.id as never), presetLevels(rec.id as never));
  const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never, facilities };
  const kind = new Map(facilities.map(f => [f.id, f.kind as string]));
  const slotOf = (name: string | null): SlotAssignment | null => name && roster[name] ? { operatorName: name, eliteLevel: roster[name].eliteLevel, level: roster[name].level } : null;
  const value = (rooms: Record<string, (string | null)[]>) => {
    const assignments: BaseAssignments = Object.fromEntries(Object.entries(rooms).map(([id, names]) => [id, names.map(slotOf)]));
    const r = snapshotTotals(base as never, assignments, rec.products, run.loginInterval);
    return r.lmd + r.exp + r.goldMade * 500;
  };
  const unlocked = (name: string, room: string, skill: string) => !!roster[name] && activeBaseSkills(byName.get(name)!, room, roster[name].eliteLevel, slots as never, roster[name].level).some(s => cleanSkillName(s.name) === cleanSkillName(skill));
  const working = (id: string) => kind.get(id) !== 'dormitory' && kind.get(id) !== 'trainingRoom' && kind.get(id) !== 'workshop';
  const lines: string[] = [];
  for (const link of pairs) {
    const partner = link.needs.name;
    if (!unlocked(link.holder, link.room, link.skill) || !roster[partner]) continue;
    const holderKind = ROOM_KIND[link.room], partnerKind = link.where === 'same room' ? holderKind : WHERE_KIND[link.where];
    const active = (rooms: Record<string, (string | null)[]>) => Object.entries(rooms).some(([id, names]) => kind.get(id) === holderKind && names.includes(link.holder) && (
      link.where === 'same room' ? names.includes(partner) : Object.entries(rooms).some(([other, there]) => there.includes(partner) && (partnerKind ? kind.get(other) === partnerKind : working(other)))));
    const key = `${link.holder} + ${partner} (${link.room}; ${link.where})`;
    const t = tally.get(key) ?? { together: 0, 'no credit': 0, beaten: 0, candidate: 0, gain: [] };
    tally.set(key, t);
    if (rec.shifts.some(s => active(s.rooms))) { t.together++; continue; }
    // Best swap over every shift: the holder takes a seat of its room's kind, the partner a seat where the link
    // wants them, and whoever sat there takes the seat each of them left (or stands down when they had none).
    let best = -Infinity, credit = 0;
    for (const shift of rec.shifts) {
      const plan = value(shift.rooms);
      const place = (rooms: Record<string, (string | null)[]>, name: string, room: string, seat: number) => {
        const next = Object.fromEntries(Object.entries(rooms).map(([id, names]) => [id, [...names]]));
        const from = Object.entries(next).find(([id, names]) => working(id) && names.includes(name));
        for (const names of Object.values(next)) names.forEach((n, i) => { if (n === name) names[i] = null; });
        const displaced = next[room][seat];
        next[room][seat] = name;
        if (from && displaced && displaced !== name) { const i = next[from[0]].indexOf(null); if (i >= 0) next[from[0]][i] = displaced; }
        return next;
      };
      const seatsOf = (k: string | undefined) => Object.keys(shift.rooms).filter(id => k ? kind.get(id) === k : working(id)).flatMap(id => shift.rooms[id].map((_, seat) => ({ id, seat })));
      for (const h of seatsOf(holderKind)) {
        const withHolder = place(shift.rooms, link.holder, h.id, h.seat);
        const partnerSeats = link.where === 'same room' ? withHolder[h.id].map((_, seat) => ({ id: h.id, seat })).filter(s => s.seat !== h.seat)
          : link.where === 'anywhere working' && Object.entries(withHolder).some(([id, names]) => working(id) && names.includes(partner)) ? [null] : seatsOf(partnerKind).filter(s => !(s.id === h.id && s.seat === h.seat));
        for (const p of partnerSeats) {
          const both = p ? place(withHolder, partner, p.id, p.seat) : withHolder;
          if (!active(both)) continue;
          const v = value(both) - plan;
          if (v > best) {
            best = v;
            const alone = Object.fromEntries(Object.entries(both).map(([id, names]) => [id, names.map(n => n === partner ? null : n)]));
            const partnerOnly = Object.fromEntries(Object.entries(both).map(([id, names]) => [id, names.map(n => n === link.holder ? null : n)]));
            const none = Object.fromEntries(Object.entries(both).map(([id, names]) => [id, names.map(n => n === link.holder || n === partner ? null : n)]));
            // What the two add together beyond what each adds alone.
            credit = value(both) - value(alone) - value(partnerOnly) + value(none);
          }
        }
      }
    }
    if (best === -Infinity) continue;
    const verdict: Verdict = best > 1 ? 'candidate' : Math.abs(credit) < 1 ? 'no credit' : 'beaten';
    t[verdict]++; t.gain.push(best);
    if (verdict !== 'beaten') lines.push(`${key}: ${verdict}, swap ${best >= 0 ? '+' : ''}${best.toFixed(0)}, pair credit ${credit.toFixed(0)}`);
  }
  console.log(`${run.account.split('/').pop()} (${rec.label} ${rec.score.toFixed(0)}):${lines.length ? '\n  ' + lines.join('\n  ') : ' nothing left behind'}`);
}
console.log('\nPair: together / candidate / beaten / no credit, median swap value per day');
const median = (xs: number[]) => xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0;
for (const [key, t] of [...tally].sort((a, b) => b[1].candidate - a[1].candidate || b[1]['no credit'] - a[1]['no credit'] || median(b[1].gain) - median(a[1].gain)))
  console.log(` ${t.together} / ${t.candidate} / ${t.beaten} / ${t['no credit']}  ${median(t.gain).toFixed(0).padStart(7)}  ${key}`);
