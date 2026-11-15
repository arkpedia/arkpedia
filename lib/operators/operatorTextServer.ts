import type { Operator } from './operatorTextTypes';
import type { BaseSkillKeyword } from './operatorTypes';
import { enrichOperatorText, type Translation } from './operatorTranslations';

/** Backfill old published pages from the checked deployment's canonical data snapshot.
 * Newly compiled releases already carry the result and never read this fallback. */
export async function completeOperatorText<P extends { operator: Operator }>(page: P): Promise<P> {
  if (page.operator.operatorTextVersion === 1) return page;
  const [translations, keywords] = await Promise.all([
    import('@/data/operator-translations.json'),
    import('@/data/combat-keywords.json'),
  ]);
  return { ...page, operator: enrichOperatorText(page.operator,
    translations.default as Record<string, Translation>, keywords.default as BaseSkillKeyword[]) };
}
