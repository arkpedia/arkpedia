import type { BaseSkillGlossary } from './baseSkillGlossary';
import type { Operator } from './operatorTextTypes';
import type { BaseSkillKeyword } from './operatorTypes';
import { enrichOperatorText, type Translation } from './operatorTranslations';
import { readShippedTable } from '@/lib/content/shippedTable';

let records: Promise<[Record<string, Translation>, BaseSkillKeyword[], BaseSkillGlossary]> | undefined;
function operatorTextRecords() {
  return records ??= Promise.all([
    process.env.ARKPEDIA_WORKER === '1'
      ? readShippedTable<Record<string, Translation>>('operator-translations.json')
      : import('@/data/operator-translations.json').then(module => module.default as Record<string, Translation>),
    process.env.ARKPEDIA_WORKER === '1'
      ? readShippedTable<BaseSkillKeyword[]>('combat-keywords.json')
      : import('@/data/combat-keywords.json').then(module => module.default as BaseSkillKeyword[]),
    process.env.ARKPEDIA_WORKER === '1'
      ? readShippedTable<BaseSkillGlossary>('base-skill-glossary.json')
      : import('@/data/base-skill-glossary.json').then(module => module.default as BaseSkillGlossary),
  ]).catch(error => { records = undefined; throw error; });
}

/** Backfill old published pages from the checked deployment's canonical data snapshot.
 * Newly compiled releases already carry the result and never read this fallback. */
export async function completeOperatorText<P extends { operator: Operator }>(page: P): Promise<P> {
  if (page.operator.operatorTextVersion === 6) return page;
  const [translations, keywords, glossary] = await operatorTextRecords();
  return { ...page, operator: enrichOperatorText(page.operator, translations, keywords, glossary) };
}
