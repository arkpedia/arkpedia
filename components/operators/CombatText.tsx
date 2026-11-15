import { createContext, useContext, type ReactNode } from 'react';
import BaseSkillText from './BaseSkillText';
import type { BaseSkillKeyword } from '@/lib/operators/operatorTypes';

const Keywords = createContext<readonly BaseSkillKeyword[]>([]);
export function CombatKeywords({ keywords = [], children }: { keywords?: readonly BaseSkillKeyword[]; children: ReactNode }) {
  return <Keywords.Provider value={keywords}>{children}</Keywords.Provider>;
}

/** Only definitions used by this operator travel with its page or preview. */
export default function CombatText({ text }: { text: string | null | undefined }) {
  return <BaseSkillText text={text} keywords={useContext(Keywords)} />;
}
