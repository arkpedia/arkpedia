import { getSkillIconPath } from '../operators/operatorIconPaths';
import { getSkillList, type Operator, type SkillRecommendationEntry } from '../operators/operatorTypes';

export type GuideValue =
  | { kind: 'mastery'; entries: SkillRecommendationEntry[] }
  | { kind: 'video'; label: string; creator: string };
export interface GuideField {
  key: string;
  title: string;
  icon?: string | null;
  source: GuideValue;
  value: GuideValue;
  revision: number;
  customized: boolean;
}
export interface GuideDocument { name: string; fields: GuideField[] }
export interface GuideEdit { field: string; revision: number; value: GuideValue | null }

export function guideFields(op: Operator, edits: GuideEdit[]): GuideField[] {
  function field(key: string, title: string, source: GuideValue, icon?: string | null): GuideField {
    const saved = edits.find(edit => edit.field === key);
    return { key, title, source, icon: icon ?? null, value: saved?.value ?? source,
      revision: saved?.revision ?? 0, customized: !!saved?.value };
  }
  return [
    ...getSkillList(op).map((skill, i) => field('s' + (i + 1), 'Skill ' + (i + 1) + (skill.name ? ' · ' + skill.name : ''),
      { kind: 'mastery', entries: skill.recommendation ?? [] }, skill.icon || getSkillIconPath(op.name, skill.name))),
    ...(op.guides ?? []).map((guide, i) => field('video:' + guide.videoId, guide.label || ['Guide ' + (i + 1), guide.creator].filter(Boolean).join(' · '),
      { kind: 'video', label: guide.label ?? '', creator: guide.creator ?? '' })),
  ];
}

export function applyGuideEdits(op: Operator, edits: GuideEdit[]): Operator {
  if (!edits.some(edit => edit.value)) return op;
  const values = new Map(edits.map(edit => [edit.field, edit.value]));
  const skills = getSkillList(op).map((skill, i) => {
    const edit = values.get('s' + (i + 1));
    return edit?.kind === 'mastery' ? { ...skill, recommendation: edit.entries } : skill;
  });
  return { ...op, skills: Array.isArray(op.skills) ? skills : { ...op.skills, skillList: skills },
    ...(op.guides && { guides: op.guides.map(guide => {
      const edit = values.get('video:' + guide.videoId);
      return edit?.kind === 'video' ? { ...guide, editorialCaption: { label: edit.label, creator: edit.creator } } : guide;
    }) }) };
}

export function validGuideValue(input: unknown, kind: GuideValue['kind']): input is GuideValue {
  if (!input || typeof input !== 'object' || !('kind' in input) || input.kind !== kind) return false;
  if (kind === 'video') return 'label' in input && typeof input.label === 'string' && input.label.length <= 500
    && 'creator' in input && typeof input.creator === 'string' && input.creator.length <= 200;
  return 'entries' in input && Array.isArray(input.entries) && input.entries.length <= 12 && input.entries.every(entry =>
    entry && [null, 'm1', 'm2', 'm3'].includes(entry.mastery) && [null, 'main', 'sub', 'primary'].includes(entry.priority)
    && (entry.order === null || typeof entry.order === 'string' && /^\d{1,2}(st|nd|rd|th)$/.test(entry.order))
    && (entry.explanation === null || typeof entry.explanation === 'string' && entry.explanation.length <= 5000));
}
