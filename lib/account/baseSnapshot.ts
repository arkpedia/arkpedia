import type { GameAccountMap } from '@/lib/planner/gameAccount';
import type { BaseAssignments, ProductionSpots, FacilityLevels, FactoryProducts, DormitoryAmbience, ProductionKind, FacilityKind } from '@/lib/base/baseTypes';
import { defaultProductionSpots, getFacilities, MAX_LEVEL_BY_KIND } from '@/lib/base/baseConfig';

export interface AccountBaseSnapshot {
  version: 1;
  productionSpots: ProductionSpots;
  facilityLevels: FacilityLevels;
  assignments: BaseAssignments;
  factoryProducts: FactoryProducts;
  dormitoryAmbience: DormitoryAmbience;
  /** At the import instant, in displayed 0–24 units; missing means unknown. */
  morale: Record<string, number>;
  /** Every owned physical operator's unlock progress, also for replacement picks. */
  operatorProgress?: Record<string, { eliteLevel: string; level: number }>;
  trainee?: string;
  warnings: string[];
}

/** building_data.layouts.v0, sorted by actual floor and horizontal position.
 * B1 is the top production floor, not the first slot in the JSON object. */
export const GAME_BASE_SLOTS: Record<string, string> = {
  slot_24: 'prod1', slot_25: 'prod2', slot_26: 'prod3',
  slot_14: 'prod4', slot_15: 'prod5', slot_16: 'prod6',
  slot_5: 'prod7', slot_6: 'prod8', slot_7: 'prod9',
  slot_34: 'controlCenter', slot_28: 'dormitory1', slot_20: 'dormitory2',
  slot_9: 'dormitory3', slot_3: 'dormitory4', slot_36: 'receptionRoom',
  slot_32: 'workshop', slot_23: 'office', slot_13: 'trainingRoom',
};
const KINDS: Record<string, FacilityKind> = { CONTROL: 'controlCenter', DORMITORY: 'dormitory', MEETING: 'receptionRoom', WORKSHOP: 'workshop', HIRE: 'office', TRAINING: 'trainingRoom', TRADING: 'tradingPost', MANUFACTURE: 'factory', POWER: 'powerPlant' };
const object = (v: unknown): Record<string, any> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : {};
const integer = (v: unknown, max: number): number | null => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
const nameOf = (char: Record<string, any>, map: GameAccountMap) => {
  const id = char.charId;
  const entry = typeof id === 'string' ? map.chars[id] : undefined;
  // Base staffing uses the physical operator, including Amiya, once.
  return entry?.formOf ? map.chars[entry.formOf]?.name : entry?.name;
};

/** Read only the account/syncData building fields we can interpret. No credentials,
 * raw payload, inferred future staffing or elapsed-time projection are persisted.
 * roomSlots.charInstIds and rooms[roomId][slotId] follow the game protocol;
 * ap uses building_data.manpowerDisplayFactor (360000), not the Doctor's stamina. */
export function baseSnapshotFromGame(user: Record<string, any>, map: GameAccountMap): AccountBaseSnapshot | undefined {
  const building = object(user.building), slots = object(building.roomSlots);
  if (!Object.keys(slots).some(id => id in GAME_BASE_SLOTS)) return undefined;
  const rooms = object(building.rooms), troop = object(user.troop?.chars), baseChars = object(building.chars);
  const productionSpots = defaultProductionSpots();
  const facilityLevels: FacilityLevels = Object.fromEntries(getFacilities().filter(f => f.kind !== 'elevator').map(f => [f.id, 0]));
  const assignments: BaseAssignments = {}, factoryProducts: FactoryProducts = {}, dormitoryAmbience: DormitoryAmbience = {}, morale: Record<string, number> = {};
  const warnings = new Set<string>();
  for (const [instId, baseChar] of Object.entries(baseChars)) {
    const char = object(troop[instId]), name = nameOf(char, map), ap = object(baseChar).ap;
    if (name && typeof ap === 'number' && Number.isFinite(ap) && ap >= 0 && ap <= 24 * 360000) morale[name] = ap / 360000;
  }
  const operatorProgress: NonNullable<AccountBaseSnapshot['operatorProgress']> = {};
  for (const rawChar of Object.values(troop)) {
    const char = object(rawChar), name = nameOf(char, map);
    if (!name) continue;
    const phase = integer(char.evolvePhase, 2), level = integer(char.level, 90);
    operatorProgress[name] = { eliteLevel: ['Base', 'Elite 1', 'Elite 2'][phase ?? 0], level: level && level > 0 ? level : 1 };
    if (phase === null || !level) warnings.add(`Unlock progress unavailable for ${name}; calculations use E0/Lv1 where missing.`);
  }
  let trainee: string | undefined;
  const seen = new Set<string>();
  for (const [gameSlot, id] of Object.entries(GAME_BASE_SLOTS)) {
    const raw = object(slots[gameSlot]);
    if (!Object.keys(raw).length) continue;
    const roomId = typeof raw.roomId === 'string' ? raw.roomId : '';
    if (!roomId || roomId === 'NONE') continue;
    const kind = KINDS[roomId], detail = object(object(rooms[roomId])[gameSlot]);
    const expected = getFacilities().find(f => f.id === id)!;
    if (!kind || (id.startsWith('prod') ? !['factory', 'tradingPost', 'powerPlant'].includes(kind) : kind !== expected.kind)) {
      warnings.add(`Unsupported room type in ${gameSlot}.`); continue;
    }
    const level = integer(raw.level ?? detail.level, MAX_LEVEL_BY_KIND[kind]);
    if (level === null) { warnings.add(`Room level unavailable in ${gameSlot}.`); continue; }
    facilityLevels[id] = level;
    if (id.startsWith('prod')) productionSpots[id] = kind as ProductionKind;
    if (kind === 'factory') {
      const formula = String(detail.formulaId ?? '');
      factoryProducts[id] = ['1', '2', '3'].includes(formula) ? 'Battle Records' : formula === '4' ? 'Precious Metals' : formula === '13' || formula === '14' ? 'Originium Shards' : null;
      if (['1', '2'].includes(formula)) warnings.add('Battle Record output estimates use the Tactical formula; this factory makes a lower tier.');
      if (formula && factoryProducts[id] === null) warnings.add(`Factory recipe ${formula} is not modeled.`);
    }
    if (kind === 'dormitory') {
      const comfort = detail.comfort ?? object(detail.diySolution).comfort;
      if (typeof comfort === 'number' && Number.isFinite(comfort) && comfort >= 0 && comfort <= 5000) dormitoryAmbience[id] = comfort;
      else { dormitoryAmbience[id] = 0; warnings.add(`Ambience unavailable in ${gameSlot}; calculations use 0.`); }
    }
    const capacity = getFacilities(productionSpots, facilityLevels).find(f => f.id === id)!.capacity;
    const instIds = Array.isArray(raw.charInstIds) ? raw.charInstIds : [];
    const staff = Array.from({ length: capacity }, (_, index) => {
      const instId = instIds[index], char = object(troop[String(instId)]);
      if (instId == null || instId === -1) return null;
      const name = nameOf(char, map);
      if (!name) { warnings.add(`An assigned operator in ${gameSlot} is not in the catalogue.`); return null; }
      if (seen.has(name)) { warnings.add(`Duplicate assignment for ${name} was omitted.`); return null; }
      seen.add(name);
      if (morale[name] === undefined) warnings.add(`Morale unavailable for ${name}; remaining work time is unknown.`);
      return { operatorName: name, ...operatorProgress[name], ...(morale[name] !== undefined ? { morale: morale[name] } : {}) };
    });
    assignments[id] = staff;
    if (kind === 'trainingRoom') {
      const traineeId = detail.trainee?.charInstId ?? instIds[1];
      const name = nameOf(object(troop[String(traineeId)]), map);
      if (name && !seen.has(name)) { trainee = name; seen.add(name); }
    }
  }
  if (!Object.keys(morale).length) warnings.add('Operator Morale was not supplied; remaining work time is unknown.');
  return { version: 1, productionSpots, facilityLevels, assignments, factoryProducts, dormitoryAmbience, morale, operatorProgress, ...(trainee ? { trainee } : {}), warnings: [...warnings] };
}

/** Stored account records are untrusted. Reject malformed snapshots, never throw. */
export function parseBaseSnapshot(value: unknown): AccountBaseSnapshot | undefined {
  const v = object(value);
  if (v.version !== 1 || !v.productionSpots || !v.facilityLevels || !v.assignments) return undefined;
  const spots = object(v.productionSpots), levels = object(v.facilityLevels);
  if (!getFacilities().filter(f => f.id.startsWith('prod')).every(f => ['factory', 'tradingPost', 'powerPlant'].includes(spots[f.id]))) return undefined;
  const facilities = getFacilities(spots as ProductionSpots, {});
  if (!facilities.filter(f => f.kind !== 'elevator').every(f => integer(levels[f.id], MAX_LEVEL_BY_KIND[f.kind]) !== null)) return undefined;
  const seen = new Set<string>(), assignments: BaseAssignments = {};
  for (const f of getFacilities(spots as ProductionSpots, levels)) {
    if (f.kind === 'elevator') continue;
    const raw = object(v.assignments)[f.id];
    if (raw !== undefined && !Array.isArray(raw)) return undefined;
    assignments[f.id] = Array.from({ length: f.capacity }, (_, i) => {
      const s = raw?.[i];
      if (!s || typeof s.operatorName !== 'string' || s.operatorName.length > 200 || seen.has(s.operatorName)) return null;
      seen.add(s.operatorName);
      return { operatorName: s.operatorName, eliteLevel: ['Base', 'Elite 1', 'Elite 2'].includes(s.eliteLevel) ? s.eliteLevel : 'Base', level: integer(s.level, 90) ? s.level : 1, ...(typeof s.morale === 'number' && Number.isFinite(s.morale) && s.morale >= 0 && s.morale <= 24 ? { morale: s.morale } : {}) };
    });
  }
  const numeric = (raw: unknown, max: number) => Object.fromEntries(Object.entries(object(raw)).filter(([name, n]) => name.length <= 200 && typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max)) as Record<string, number>;
  return { version: 1, productionSpots: { ...spots } as ProductionSpots, facilityLevels: { ...levels }, assignments,
    factoryProducts: Object.fromEntries(Object.entries(object(v.factoryProducts)).filter(([id, p]) => facilities.some(f => f.id === id && f.kind === 'factory') && (p === null || ['Battle Records', 'Precious Metals', 'Originium Shards'].includes(p as string)))),
    dormitoryAmbience: numeric(v.dormitoryAmbience, 5000), morale: numeric(v.morale, 24),
    operatorProgress: Object.fromEntries(Object.entries(object(v.operatorProgress)).filter(([name, progress]) => name.length <= 200 && ['Base', 'Elite 1', 'Elite 2'].includes(object(progress).eliteLevel) && !!integer(object(progress).level, 90)).map(([name, progress]) => [name, { eliteLevel: object(progress).eliteLevel, level: object(progress).level }])),
    ...(typeof v.trainee === 'string' && v.trainee.length <= 200 && !seen.has(v.trainee) ? { trainee: v.trainee } : {}),
    warnings: Array.isArray(v.warnings) ? v.warnings.filter((s: unknown): s is string => typeof s === 'string' && s.length <= 300).slice(0, 50) : [],
  };
}
