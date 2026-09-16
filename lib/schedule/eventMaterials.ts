import eventMaterialsData from '@/data/event_materials.json';

const eventMaterials = eventMaterialsData as Record<string, Record<string, string>>;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // strip [Crossover]-style tags
    .replace(/\brerun\b/g, '') // events.json often appends/repeats "Rerun"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const normalizedLookup = new Map<string, Record<string, string>>();
for (const [name, materials] of Object.entries(eventMaterials)) {
  normalizedLookup.set(normalize(name), materials);
}

/** Returns {materialName: stageCode} for the event. Only events with
 * EXACTLY 3 materials count as farmable -- fewer than that means the
 * extraction didn't find a complete set (or the event genuinely doesn't
 * have a Tier-3 farming stage), so it's treated as not available rather
 * than showing a partial/misleading list.
 *
 * Uses normalized matching rather than an exact string match, since
 * events.json (bracket-tagged names like "[Rerun] X Rerun") and
 * event_materials.json (plain names like "X") come from two different
 * scrapers with different naming conventions. */
export function getEventMaterials(eventName: string, table?: Record<string, Record<string, string>>): Record<string, string> | null {
  const materials = table ? Object.entries(table).find(([name]) => normalize(name) === normalize(eventName))?.[1] : normalizedLookup.get(normalize(eventName));
  if (!materials || Object.keys(materials).length !== 3) return null;
  return materials;
}