import type { Operator } from '@/lib/operators/operatorTypes';

/**
 * Kukkikaze's How to Use video for a selector guide portrait: the first of the operator's
 * `guides` (the operator page's Guides section) whose creator is kukkikaze, or null.
 * The guides are editorial records in arkpedia-data, so a video added there reaches the
 * selector guide with the next content run, no redeploy (2026-10-13).
 */
export function howToUseVideoId(op: Pick<Operator, 'guides'>): string | null {
  return (op.guides ?? []).find(guide => (guide.creator ?? '').trim().toLowerCase() === 'kukkikaze')?.videoId ?? null;
}
