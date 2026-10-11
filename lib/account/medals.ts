export interface OwnedMedal { id: string; obtainedAt: string | null }
export interface Medal { id: string; name: string; type: string; rarity: string; description: string; requirement: string; icon: string | null; advanced: string | null; origin: string | null }
export interface MedalSet { id: string; name: string; description: string; type: string; medals: string[]; color: string }
export interface MedalCatalogue { version: 1; medals: Medal[]; sets: MedalSet[]; categories: { id: string; name: string }[] }
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const date = (value: unknown) => typeof value === 'string' && value.length < 40 && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

/** Validate the portable collection; an absent collection means an older, board-only import. */
export function parseMedalCollection(value: unknown): OwnedMedal[] | undefined {
  if (!Array.isArray(value) || value.length > 10000 || value.some(m => !m || typeof m !== 'object' || !id(m.id))) return undefined;
  return [...new Map(value.map(m => [m.id, { id: m.id, obtainedAt: date(m.obtainedAt) }])).values()];
}
/** The sync response keeps progress for unearned medals too: only positive completion timestamps count. */
export function medalsFromGame(value: unknown): OwnedMedal[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const rows = Array.isArray(value) ? value.map(m => [m?.id, m]) : Object.entries(value);
  const obtained = rows.flatMap(([key, m]) => {
    if (!m || typeof m !== 'object') return [];
    const medalId = m.id ?? key;
    const ts = typeof m.fts === 'number' && m.fts > 0 ? m.fts : m.rts;
    if (!id(medalId) || typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0 || ts >= 253402300800) return [];
    return [{ id: medalId, obtainedAt: new Date(ts * 1000).toISOString() }];
  });
  return parseMedalCollection(obtained);
}
/** A trimmed variant also fulfils its base medal, without inventing ownership of the variant. */
export function obtainedMedal(medal: Medal, owned: ReadonlyMap<string, OwnedMedal>): OwnedMedal | undefined {
  return owned.get(medal.id) ?? (medal.advanced ? owned.get(medal.advanced) : undefined);
}
export function medalSetProgress(set: MedalSet, medals: ReadonlyMap<string, Medal>, owned: ReadonlyMap<string, OwnedMedal>) {
  const parts = set.medals.map(id => medals.get(id)).map(medal => medal ? obtainedMedal(medal, owned) : undefined);
  const count = parts.filter(Boolean).length;
  const complete = parts.length > 0 && count === parts.length;
  const dates = parts.map(part => part?.obtainedAt);
  return { count, complete, completedAt: complete && dates.every((d): d is string => !!d) ? dates.sort().at(-1)! : null };
}
