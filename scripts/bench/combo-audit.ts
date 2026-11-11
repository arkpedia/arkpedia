/**
 * Which of a roster's owned pairs the finished plan places together. Reads runs written by
 * scripts/bench/optimizer-run.ts and the links of scripts/audits/base-combo-catalogue.ts (a skill that names another
 * operator). A pair the plan leaves apart is a candidate miss, not a miss: the search may have scored it and found
 * better, so a pinned re-search has to confirm it before anything is built on it.
 *
 *   npx tsx scripts/bench/combo-audit.ts <run.json> [<run.json> ...]
 */
import fs from 'node:fs';
import { comboLinks } from '../audits/base-combo-catalogue';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { getAllOperators } from '../../lib/operators/operators';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import type { AccountRecord } from '../../lib/account/accountStore';
import map from '../../data/game-account-map.json';

const { links } = comboLinks();
const pairs = links.filter(l => l.needs.kind === 'operator');
const known = new Set(getAllOperators().map(o => o.name));
const KIND_OF_WHERE: Record<string, string> = { 'Control Center': 'controlCenter', 'a Trading Post': 'tradingPost', 'a Factory': 'factory', 'a Power Plant': 'powerPlant', 'a Dormitory': 'dormitory', 'Reception Room': 'receptionRoom', 'Training Room': 'trainingRoom' };
const ROOM_KIND: Record<string, string> = { 'Control Center': 'controlCenter', 'Trading Post': 'tradingPost', Factory: 'factory', 'Power Plant': 'powerPlant', Dormitory: 'dormitory', 'Reception Room': 'receptionRoom', Office: 'office', 'Training Room': 'trainingRoom', Workshop: 'workshop' };
const tally = new Map<string, { owned: number; together: number }>();
for (const file of process.argv.slice(2)) {
  const run = JSON.parse(fs.readFileSync(file, 'utf8')) as { account: string; recommendations: { id: string; label: string; score: number; shifts: { rooms: Record<string, (string | null)[]> }[] }[] };
  const rec = run.recommendations[0];
  if (!rec) { console.log(`${file}: no plan`); continue; }
  const profile = profileFromData(JSON.parse(fs.readFileSync(run.account, 'utf8')));
  const owned = new Set(Object.keys(ownedBaseRoster(accountFromKrooster(profile!, map as never).record as AccountRecord, known).roster));
  const facilities = getFacilities(presetSpots(rec.id as never), presetLevels(rec.id as never));
  const kind = new Map(facilities.map(f => [f.id, f.kind as string]));
  const roomsOf = (name: string, shift: { rooms: Record<string, (string | null)[]> }) => Object.entries(shift.rooms).filter(([, names]) => names.includes(name)).map(([id]) => id);
  const apart: string[] = [];
  let ownedPairs = 0, together = 0;
  for (const link of pairs) {
    if (!owned.has(link.holder) || !owned.has(link.needs.name)) continue;
    // Training Room and Dormitory pairs are outside what the plan is scored on.
    if (['Training Room', 'Dormitory'].includes(link.room) || link.where === 'same Dormitory' || link.where === 'Training Room') continue;
    ownedPairs++;
    const active = rec.shifts.some(shift => roomsOf(link.holder, shift).some(room => kind.get(room) === ROOM_KIND[link.room] && (
      link.where === 'same room' ? shift.rooms[room].includes(link.needs.name)
        : link.where === 'anywhere working' ? roomsOf(link.needs.name, shift).some(r => kind.get(r) !== 'dormitory')
          : roomsOf(link.needs.name, shift).some(r => kind.get(r) === KIND_OF_WHERE[link.where]))));
    const key = `${link.holder} + ${link.needs.name} (${link.room}; ${link.where})`;
    const t = tally.get(key) ?? { owned: 0, together: 0 }; t.owned++; if (active) { t.together++; together++; } else apart.push(key); tally.set(key, t);
  }
  console.log(`${run.account.split('/').pop()}: ${rec.label} ${rec.score.toFixed(0)}, ${together} of ${ownedPairs} owned pairs together; apart: ${apart.join('; ')}`);
}
console.log('\nPair, rosters owning both, plans placing them together:');
for (const [key, t] of [...tally].sort((a, b) => (a[1].together / a[1].owned) - (b[1].together / b[1].owned) || b[1].owned - a[1].owned)) console.log(` ${t.together}/${t.owned}  ${key}`);
