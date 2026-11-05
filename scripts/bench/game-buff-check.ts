/**
 * The calculator against the game's own numbers. A raw save (the import's "Save raw game data") holds, per room, the
 * bonuses the game server computed for the staffing at that moment (`building.rooms[kind][slot].buff`): Factory
 * productivity and capacity, Trading Post order efficiency and limit, Power Plant drone speed, Dormitory recovery,
 * Reception and Office speed, every operator's own Morale change. This rebuilds the same staffing from the save
 * (lib/account/baseSnapshot.ts), runs calculateBase on it and prints each number side by side, a mismatch marked.
 *
 *   npx tsx scripts/bench/game-buff-check.ts <raw-save.json> [more saves...] [--all]
 *
 * Without --all only mismatches print. A raw save is the reader's own data: pass its path, never commit it.
 */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities } from '../../lib/base/baseConfig';
import { baseSnapshotFromGame, GAME_BASE_SLOTS } from '../../lib/account/baseSnapshot';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const args = process.argv.slice(2);
const all = args.includes('--all');
const files = args.filter(a => !a.startsWith('--'));
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name)).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const chars = (map as { chars: Record<string, { name?: string; formOf?: string }> }).chars;
const nameOfChar = (charId: string) => { const e = chars[charId]; return e?.formOf ? chars[e.formOf]?.name : e?.name; };

let mismatches = 0, compared = 0;
const close = (a: number, b: number) => Math.abs(a - b) < 0.005;
const row = (label: string, game: number, ours: number | null | undefined, note = '') => {
  compared++;
  const ok = ours != null && close(game, ours);
  if (!ok) mismatches++;
  if (!ok || all) console.log(`${ok ? '  ' : '✗ '}${label.padEnd(58)} game ${game.toFixed(3).padStart(7)}  ours ${ours == null ? '   null' : ours.toFixed(3).padStart(7)}${note ? `  ${note}` : ''}`);
};

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const user = raw.user ?? raw;
  const snapshot = baseSnapshotFromGame(user, map as never);
  if (!snapshot) { console.log(`${file}: no base`); continue; }
  const building = user.building, troop = user.troop?.chars ?? {};
  const inst = (id: string | number) => nameOfChar(troop[String(id)]?.charId) ?? `#${id}`;
  const facilities = getFacilities(snapshot.productionSpots, snapshot.facilityLevels);
  const workHours = Object.fromEntries(Object.entries(building.chars ?? {}).map(([id, c]) => [inst(id), Number((c as { workTime?: number }).workTime ?? 0) / 3600]));
  const result = calculateBase({
    operators, rosters: toBaseRosters(groups), skillSlots: slots as never, workshopRecipes: recipes as never, facilities,
    assignments: snapshot.assignments, factoryProducts: snapshot.factoryProducts, dormitoryAmbience: snapshot.dormitoryAmbience,
    importedMorale: snapshot.morale, loginInterval: 12, swapPolicy: 'onLogin',
    // A Clue Exchange still running at the save (its end, `infoShare.ts`, after the room's last update) turns on the
    // skills that need one (Caper's Innocent Smile).
    clueExchangeActive: Number(building.rooms?.MEETING?.slot_36?.infoShare?.ts ?? 0) > Number(building.rooms?.MEETING?.slot_36?.lastUpdateTime ?? Infinity),
    // The game's figure is the one at this instant: ramps at the hours each operator has worked, no averaging window.
    rampStartHours: workHours, rampWindowOverride: 0.0001,
  });
  console.log(`\n=== ${file.split('/').pop()}`);
  const ccGlobal = Number(building.rooms?.CONTROL?.slot_34?.buff?.global?.apCost ?? 0);
  for (const [slot, id] of Object.entries(GAME_BASE_SLOTS)) {
    const roomSlot = building.roomSlots?.[slot]; if (!roomSlot) continue;
    const kind = roomSlot.roomId as string, buff = building.rooms?.[kind]?.[slot]?.buff;
    const ours = (result.rooms as Record<string, any>)[id];
    if (!buff || !ours) continue;
    const staff = (roomSlot.charInstIds ?? []).filter((x: number) => x !== -1).map(inst).join(', ');
    const label = (what: string) => `${id} ${what}`;
    if (staff && all) console.log(`${id} (${kind}): ${staff}`);
    if (kind === 'MANUFACTURE') {
      // The game's figure includes the +1% each operator adds, which the calculator keeps in its baseline (grey).
      row(label('productivity'), buff.speed, ours.productivity ? ours.productivity.grey - 1 + ours.productivity.yellow : null, staff);
      row(label('capacity +'), buff.capacity ?? 0, ours.capacity?.adjustment);
    } else if (kind === 'TRADING') {
      row(label('order efficiency'), buff.speed, ours.productivity ? ours.productivity.grey - 1 + ours.productivity.yellow : null, staff);
      row(label('order limit +'), buff.limit ?? 0, ours.orderLimit?.adjustment);
    } else if (kind === 'POWER') {
      row(label('drone speed'), buff.laborSpeed, ours.droneRate, staff);
    } else if (kind === 'MEETING') {
      // Skills, the Control Center's and the Office's bonuses: the rarity and promotion bonuses are not in the buff.
      row(label('clue speed'), buff.speed, ours.clueSpeed, staff);
    } else if (kind === 'HIRE') {
      row(label('HR speed'), buff.speed, ours.office?.speed, staff);
    } else if (kind === 'TRAINING') {
      row(label('training speed'), buff.speed, ours.trainingSpeed != null ? ours.trainingSpeed - 1 : null, staff);
    }
    // Morale, in hundredths an hour, a positive number a saving: each operator's own change (`self`), the room's
    // shared one (`all`) and the Control Center's for the whole base (`global`), off the room's 1/h less 0.05 for
    // each operator after the first (the save's `display.base`). Ours is each operator's total drain.
    if (kind !== 'DORMITORY' && kind !== 'WORKSHOP' && kind !== 'CONTROL' && kind !== 'TRAINING' && ours.perOperatorMorale) {
      const staffIds = (roomSlot.charInstIds ?? []).filter((x: number) => x !== -1);
      const room = 100 - 5 * (staffIds.length - 1) - ccGlobal - Number(buff.apCost?.all ?? 0);
      for (const instId of staffIds) {
        const name = inst(instId), self = Number(buff.apCost?.self?.[String(instId)] ?? 0);
        row(label(`${name} Morale/h`), Math.max(0, room - self) / 100, ours.perOperatorMorale[name]);
      }
    }
    if (kind === 'DORMITORY') {
      // Recovery from skills: the room's shared bonus (`all`), each operator's own (`self`), one target's (`single`).
      const recovery = (result.dormitoryRecoveryByFacility as Record<string, { name: string; base: number; bonus: number }[]>)[id] ?? [];
      const single = buff.apCost?.single?.target != null ? { name: inst(buff.apCost.single.target), value: Number(buff.apCost.single.value) } : null;
      for (const instId of (roomSlot.charInstIds ?? []).filter((x: number) => x !== -1)) {
        const name = inst(instId), mine = recovery.find(r => r.name === name);
        const game = (Number(buff.apCost?.all ?? 0) + Number(buff.apCost?.self?.[String(instId)] ?? 0) + (single?.name === name ? single.value : 0)) / 100;
        row(label(`${name} skill recovery`), game, mine?.bonus);
      }
    }
    if (kind === 'CONTROL') {
      row(label('Trading Post order efficiency, all posts'), Number(buff.trading?.speed ?? 0), result.ccEffects?.tradingPostBonus);
      row(label('Factory productivity, all factories'), Number(buff.manufacture?.speed ?? 0), result.ccEffects?.factoryBonus);
      row(label('Morale saving, whole base'), ccGlobal / 100, result.ccMoraleRelief);
    }
  }
}
console.log(`\n${compared} numbers compared, ${mismatches} differ`);
