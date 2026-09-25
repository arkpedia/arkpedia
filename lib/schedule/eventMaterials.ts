function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '') // strip [Crossover]-style tags
    .replace(/\brerun\b/g, '') // event records often append/repeat "Rerun"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Returns {materialName: stageCode} for the event. Only events with
 * EXACTLY 3 materials count as farmable -- fewer than that means the
 * extraction didn't find a complete set (or the event genuinely doesn't
 * have a Tier-3 farming stage), so it's treated as not available rather
 * than showing a partial/misleading list.
 *
 * Uses normalized matching rather than an exact string match, since
 * event records (bracket-tagged names like "[Rerun] X Rerun") and
 * event_materials.json (plain names like "X") come from two different
 * scrapers with different naming conventions. */
export function getEventMaterials(eventName: string, table: Record<string, Record<string, string>>): Record<string, string> | null {
  /* `table` is the release's data/event_materials.json, from the page's props or its data
     builder: required, so no caller answers from a copy compiled into the bundle. */
  const materials = Object.entries(table).find(([name]) => normalize(name) === normalize(eventName))?.[1];
  if (!materials || Object.keys(materials).length !== 3) return null;
  return materials;
}
