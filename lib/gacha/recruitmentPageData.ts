import type { ContentPageBuilder } from '@/lib/content/server';
import { getGlobalRecruitmentOperators } from './recruitmentPool';
import { computeGuaranteedCombos, type GuaranteedCombo, type RecruitableOperator } from './recruitmentCalc';

export interface RecruitmentProps {
  operators: RecruitableOperator[];
  guaranteedCombos4: GuaranteedCombo[];
  guaranteedCombos5: GuaranteedCombo[];
}

export const getRecruitmentPageProps: ContentPageBuilder<RecruitmentProps> = async () => {
  const operators = getGlobalRecruitmentOperators();
  const guaranteedCombos4 = computeGuaranteedCombos(operators, 4);
  const guaranteedCombos5 = computeGuaranteedCombos(operators, 5);
  // Project AFTER the combos are computed -- those run here, at build time, and
  // are free to read the whole record. What crosses into the page is only what
  // the calculator reads. Handing over full Operator objects made this page's
  // data 1.76 MB, most of it skills, modules, talents, voice actors and lore
  // for operators the visitor may never even match, inlined into the HTML and
  // re-fetched as JSON on every client-side navigation here.
  const pool: RecruitableOperator[] = operators.map((op) => ({
    name: op.name,
    rarity: op.rarity,
    tags: op.tags,
    position: op.position,
    class: op.class,
    // Coerced, not passed through: the field is optional on Operator and most
    // records simply omit it, and getStaticProps refuses to serialize
    // `undefined`. getOperatorIconPath only tests it for truthiness, so false
    // and absent mean the same thing to the only code that reads it.
    isFuture: op.isFuture ?? false,
  }));
  return { props: { operators: pool, guaranteedCombos4, guaranteedCombos5 } };
};
