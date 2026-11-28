import type { UpdateContent } from '@/lib/site-updates/types';

export const PREVIEW_ORIGIN = 'https://preview.arkpedia.net';
export const LIVE_ORIGIN = 'https://www.arkpedia.net';

export interface ReleaseCandidate {
  source: string;
  base: string;
  fingerprint: string;
  pullRequest: number;
  title: string;
  paths: string[];
}

export interface ReleaseEntry extends ReleaseCandidate {
  note: UpdateContent | null;
  state: 'queued' | 'publishing' | 'published' | 'needs_review' | 'superseded';
  target: string | null;
  revision: number;
}

export interface ReleaseQueueData {
  entries: ReleaseEntry[];
  previewSource: string | null;
  readySource: string | null;
  publicationEnabled: boolean;
}

export type ReleaseCommand =
  | { action: 'queue'; pullRequest: number; paths: string[] }
  | { action: 'save-note'; source: string; revision: number; note: UpdateContent | null }
  | { action: 'publish' | 'refresh'; source: string; revision: number };

export const validCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function reviewPaths(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 12) throw Error('Enter 1–12 page paths to review.');
  const paths = value.map(path => {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.length > 256 || /[\\\x00-\x20]/.test(path)) {
      throw Error('Use paths on Arkpedia, such as /pulls.');
    }
    const url = new URL(path, PREVIEW_ORIGIN);
    const decoded = decodeURIComponent(url.pathname);
    if (url.origin !== PREVIEW_ORIGIN || decoded.startsWith('//') || decoded.includes('\\') ||
        /^\/(?:api|dashboard|dev|_next)(?:\/|$)/i.test(decoded)) throw Error('Use paths to reader-facing pages.');
    return url.pathname + url.search + url.hash;
  });
  return [...new Set(paths)];
}
