/**
 * A copy of the last imported save, for the owner to download once and hand over for mapping
 * reward sources the tracker cannot read yet. Only off the main site (arkpedia-dev, a local
 * build): www never offers it. The copy stays in this page's memory until reload; nothing is
 * uploaded. Identity is stripped before anything is kept: account and friend ids, names, the
 * bio, contact and device fields, and any long digit run (an id) in a string.
 */
const DROP = /^(uid|nickName|nickNumber|resume|friend\w*|social|email|phone|token|secret\w*|device\w*|account\w*|serverName|mailbox|mail\w*)$/i;
const ID_RUN = /\d{7,}/g;

export function redactSave(value: unknown, depth = 0): unknown {
  if (depth > 40) return null;
  if (Array.isArray(value)) return value.map((v) => redactSave(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !DROP.test(key))
      .map(([key, v]) => [key.replace(ID_RUN, '<id>'), redactSave(v, depth + 1)]));
  }
  if (typeof value === 'string') return value.replace(ID_RUN, '<id>');
  return value;
}

/** Whether this host may offer the download: never the main site. */
export const rawSaveAllowed = () => typeof window !== 'undefined' && !/(^|\.)arkpedia\.net$/.test(window.location.hostname);

let latest: unknown = null;
const listeners = new Set<() => void>();
export const rawSave = {
  set(user: Record<string, unknown> | null) { latest = user && rawSaveAllowed() ? redactSave(user) : null; listeners.forEach((l) => l()); },
  get: () => latest,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
