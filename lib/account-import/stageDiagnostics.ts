/** Opt-in, tab-memory-only exploration of syncData stage change markers.
 * Never keeps the raw account, credentials, replay payloads or arbitrary string values.
 * Observes imports already requested by the reader; it performs no network requests. */
import type { ServerId } from './yostar';

type Fields = Record<string, string>;
type Values = Record<string, number | boolean | null>;
type Summary = { fields: Fields; values: Values };
type Sample = { server: ServerId; dungeon: Summary; stages: Record<string, Summary> };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const safeKey = (key: string) => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) && !/token|secret|password|email|uid|credential|authorization/i.test(key);

function summarize(value: unknown): Summary {
  const fields: Fields = {}, values: Values = {};
  for (const [key, item] of Object.entries(object(value)).slice(0, 100)) {
    if (!safeKey(key)) continue;
    fields[key] = item === null ? 'null' : Array.isArray(item) ? 'array' : typeof item;
    if (/time|timestamp|revision|version|count|state|replay|deploy|record|save|mtime|has/i.test(key)
      && (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item)))) values[key] = item;
  }
  return { fields, values };
}

export function stageMetadata(user: unknown, server: ServerId): Sample {
  const dungeon = object(object(user).dungeon);
  const stages: Record<string, Summary> = {};
  for (const [id, value] of Object.entries(object(dungeon.stages)).slice(0, 10000)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,99}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    stages[id] = summarize(value);
  }
  return { server, dungeon: summarize(dungeon), stages };
}

export function stageDiagnosticsAvailable(host: string, search: string): boolean {
  return (host === 'preview.arkpedia.net' || (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(host)))
    && new URLSearchParams(search).get('stageDiagnostics') === '1';
}

export function createStageDiagnostics() {
  let armed: ServerId | null = null;
  let samples: Sample[] = [];
  let state = { armed, count: 0, report: '' } as { armed: ServerId | null; count: number; report: string };
  const listeners = new Set<() => void>();
  const publish = () => {
    state = { armed, count: samples.length, report: samples.length ? JSON.stringify({ version: 1, samples }, null, 2) : '' };
    listeners.forEach(listener => listener());
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    arm: (server: ServerId) => { if (samples.length < 3) { armed = server; publish(); } },
    cancel: () => { armed = null; publish(); },
    clear: () => { armed = null; samples = []; publish(); },
    capture: (user: unknown, server: ServerId) => {
      if (armed !== server) return;
      armed = null;
      try { samples = [...samples, stageMetadata(user, server)]; } catch { /* Diagnostics must never break the import. */ }
      publish();
    },
  };
}

export const stageDiagnostics = createStageDiagnostics();
