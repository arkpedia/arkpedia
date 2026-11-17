import { validateMediaDelivery } from '../../lib/assets/mediaDelivery.mjs';

/** Code-owned entrance packs use only event-transitions. Keep their whole subtree,
 * including nested textures/audio and shared runtime files. A revision also used by
 * a broad game-data catalogue must retain its complete map. Physical targets never change. */
export function bundledMediaMap(repository, revision, native, { entrances, fullReferences }) {
  validateMediaDelivery({ [repository]: { [revision]: native } });
  const key = `${repository}/${revision}`;
  const base = /^https:\/\/(?:assets\.arkpedia\.net|raw\.githubusercontent\.com)\/arkpedia\/([^/]+)\/([a-f0-9]{40})\/$/.exec(entrances?.baseUrl ?? '');
  const scoped = base && base[1] === repository && base[2] === revision && !fullReferences.has(key)
    && Array.isArray(entrances.entries) && entrances.entries.length > 0
    && entrances.entries.every(entry => typeof entry.folder === 'string'
      && /^event-transitions\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(entry.folder));
  if (!scoped) return native;
  return { ...native, overrides: Object.fromEntries(Object.entries(native.overrides)
    .filter(([group]) => group === 'event-transitions' || group.startsWith('event-transitions/'))) };
}
