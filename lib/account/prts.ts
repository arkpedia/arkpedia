/**
 * What Rhodes Island's AI is called, as the reader's own story has it: PRTS, the Primitive
 * Rhodes Island Terminal Service, until Episode 15, where the Priestess turns it against the
 * landship and Closure replaces it with ZOOT. The nav names the reader's own menu (their
 * account and planners) after it.
 *
 * Episode 15 is cleared once its finale is (EPISODE_15_FINALE, the story stage 15-21), or any
 * stage of a later episode. scripts/tests/test-prts.ts checks the finale is still Episode 15's
 * last stage in data/stages.
 */
import type { AccountRecord } from './accountStore';

export const EPISODE_15_FINALE = 'st_15-03';

export function storyAI(account: Pick<AccountRecord, 'cleared'> | null): 'PRTS' | 'ZOOT' {
  if (!account) return 'PRTS';
  const past = account.cleared.some((id) => id === EPISODE_15_FINALE || Number(/^main_(\d+)-/.exec(id)?.[1] ?? 0) > 15);
  return past ? 'ZOOT' : 'PRTS';
}
