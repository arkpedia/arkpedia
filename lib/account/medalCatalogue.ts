import type { MedalCatalogue } from './medals';

const pending = new Map<string, Promise<MedalCatalogue>>();
/** Cache metadata by content release, never the player's ownership. A new deployment may
 * precede the first content release containing this newly introduced public file. */
export function loadMedalCatalogue(url: string): Promise<MedalCatalogue> {
  const cached = pending.get(url);
  if (cached) return cached;
  const request = (async () => {
    let response = await fetch(url);
    if (response.status === 404 && url !== '/medal-catalogue.json') response = await fetch('/medal-catalogue.json');
    if (!response.ok) throw new Error('Medal details could not be loaded. Please try again.');
    const data = await response.json();
    if (data?.version !== 1 || !Array.isArray(data.medals) || !data.medals.length || !Array.isArray(data.sets) || !Array.isArray(data.categories)
      || data.medals.some((m: Record<string, unknown>) => !m || typeof m.id !== 'string' || typeof m.name !== 'string' || typeof m.type !== 'string'
        || typeof m.description !== 'string' || typeof m.requirement !== 'string' || (m.icon !== null && (typeof m.icon !== 'string' || !/^\/profile-medals\/[a-z0-9_-]+\.webp$/.test(m.icon))))
      || data.sets.some((s: Record<string, unknown>) => !s || typeof s.id !== 'string' || typeof s.name !== 'string' || typeof s.description !== 'string'
        || typeof s.type !== 'string' || typeof s.color !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(s.color) || !Array.isArray(s.medals))
      || data.categories.some((c: Record<string, unknown>) => !c || typeof c.id !== 'string' || typeof c.name !== 'string')) {
      throw new Error('Medal details are unavailable. Please try again.');
    }
    const ids = new Set(data.medals.map((m: { id: string }) => m.id));
    if (ids.size !== data.medals.length || data.sets.some((s: { medals: unknown[] }) => s.medals.some(id => !ids.has(id)))) throw new Error('Medal details are unavailable. Please try again.');
    return data as MedalCatalogue;
  })();
  pending.set(url, request);
  request.catch(() => pending.delete(url));
  return request;
}
