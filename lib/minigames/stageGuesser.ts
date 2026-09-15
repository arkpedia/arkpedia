import { normalizeAnswer } from './logic';
import type { GeometryTile, StageGeometry } from '@/lib/stages/stageTypes';

export type StageCollection = 'story' | 'supply' | 'event' | 'annihilation' | 'sss' | 'reclamation' | 'integrated_strategies' | 'contingency_contract' | 'guide';
export type StageLayout = Pick<StageGeometry, 'rows' | 'cols' | 'tileGrid'> & {
  tileLegend: (GeometryTile & { name?: string; description?: string })[];
};
export type StageSearchMode = 'stages' | 'connections';
export interface StageAnswer { slug: string; code: string; name: string; source?: string; aliases?: string[]; chapter?: number | null; mapKey?: string }
export interface StageQuestion extends StageAnswer {
  collection: StageCollection;
  image: string;
  version: string;
  layout: StageLayout;
  source: string;
  reason: string;
}
export interface StageRound {
  wrong: string[];
  hints: number;
  status: 'playing' | 'won' | 'lost' | 'revealed';
}
export const STAGE_MISTAKES = 5;
export const STAGE_HINT_AT = [2, 3] as const;
export const STAGE_HINTS = STAGE_HINT_AT.length;
export const newStageRound = (): StageRound => ({ wrong: [], hints: 0, status: 'playing' });

/** Stage codes tolerate spaces, punctuation and case; ambiguous titles need a selection. */
export function resolveStageAnswer(input: string, stages: StageAnswer[]): StageAnswer | null {
  const key = normalizeAnswer(input);
  if (!key) return null;
  const codeMatches = stages.filter((stage) => normalizeAnswer(stage.code) === key || stage.aliases?.some((alias) => normalizeAnswer(alias) === key));
  if (codeMatches.length === 1) return codeMatches[0];
  const names = stages.filter((stage) => normalizeAnswer(stage.name) === key);
  return names.length === 1 ? names[0] : null;
}

export function searchStageAnswers(input: string, stages: StageAnswer[], mode: StageSearchMode = 'stages'): StageAnswer[] {
  const key = normalizeAnswer(input);
  if (!key) return [];
  const chapter = key.match(/^(?:chapter|episode|ep)0*(\d+)$/);
  const connectionMatches = (stage: StageAnswer) => mode === 'connections' && (chapter
    ? stage.chapter === Number(chapter[1]) : normalizeAnswer(stage.source || '').includes(key));
  const aliasMatches = (stage: StageAnswer) => stage.aliases?.some((alias) => normalizeAnswer(alias).includes(key));
  const rank = (stage: StageAnswer) => normalizeAnswer(stage.code) === key ? 0
    : normalizeAnswer(stage.name) === key ? 1 : normalizeAnswer(stage.code).startsWith(key) ? 2 : 3;
  return stages.filter((stage) => normalizeAnswer(stage.code).includes(key) || normalizeAnswer(stage.name).includes(key) || connectionMatches(stage) || aliasMatches(stage))
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export function guessStage(round: StageRound, answer: string, target: string): StageRound {
  if (round.status !== 'playing' || round.wrong.includes(answer)) return round;
  if (answer === target) return { ...round, status: 'won' };
  const wrong = [...round.wrong, answer];
  const unlocked = STAGE_HINT_AT.filter((threshold) => wrong.length >= threshold).length;
  return { wrong, hints: Math.max(round.hints, unlocked), status: wrong.length >= STAGE_MISTAKES ? 'lost' : 'playing' };
}

export function revealStageHint(round: StageRound): StageRound {
  return round.status === 'playing' && round.hints < STAGE_HINTS ? { ...round, hints: round.hints + 1 } : round;
}

export interface StageEntry extends Omit<StageQuestion, 'layout'> {
  groupId: string;
  classic: boolean;
  mapKey: string;
  layoutUrl: string;
}
export interface StageGroup { id: string; label: string; kind: StageCollection; count: number }
export type StagePool = 'classic' | 'all' | 'custom';
export function filterStagePool(stages: StageEntry[], pool: StagePool, groups: string[]): StageEntry[] {
  return stages.filter((stage) => pool === 'all' || (pool === 'classic' && stage.classic)
    || (pool === 'custom' && groups.includes(stage.groupId)));
}

export interface StageCatalogue { entries: StageEntry[]; answers: StageAnswer[] }
