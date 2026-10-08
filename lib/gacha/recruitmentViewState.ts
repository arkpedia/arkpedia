export const MAX_RECRUITMENT_TAGS = 5;

export interface RecruitmentViewState {
  language?: 'en' | 'jp' | 'kr' | 'cn';
  textSize?: number;
  selectedTags: string[];
  showAllPossibilities: boolean;
  activeSection: 'calculator' | 'cheatsheet';
  cheatSheetSearch: string;
}

export const DEFAULT_RECRUITMENT_VIEW: RecruitmentViewState = {
  selectedTags: [],
  showAllPossibilities: false,
  activeSection: 'calculator',
  cheatSheetSearch: '',
};

/** The fragment carries a selection between windows without another server request. */
export function readRecruitmentView(hash: string, allowedTags: readonly string[]): RecruitmentViewState {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const allowed = new Set(allowedTags);
  return {
    ...(['en', 'jp', 'kr', 'cn'].includes(params.get('lang') ?? '') ? { language: params.get('lang') as 'en' | 'jp' | 'kr' | 'cn' } : {}),
    ...(params.has('size') ? { textSize: Math.max(12, Math.min(22, Number(params.get('size')) || 14)) } : {}),
    selectedTags: [...new Set(params.getAll('tag'))].filter((tag) => allowed.has(tag)).slice(0, MAX_RECRUITMENT_TAGS),
    showAllPossibilities: params.get('all') === '1',
    activeSection: params.get('view') === 'cheatsheet' ? 'cheatsheet' : 'calculator',
    cheatSheetSearch: (params.get('q') || '').slice(0, 100),
  };
}

export function recruitmentViewHash(state: RecruitmentViewState): string {
  const params = new URLSearchParams();
  if (state.language && state.language !== 'en') params.set('lang', state.language);
  if (state.textSize && state.textSize !== 14) params.set('size', String(state.textSize));
  state.selectedTags.forEach((tag) => params.append('tag', tag));
  if (state.showAllPossibilities) params.set('all', '1');
  if (state.activeSection === 'cheatsheet') params.set('view', 'cheatsheet');
  if (state.cheatSheetSearch) params.set('q', state.cheatSheetSearch);
  return params.size ? `#${params.toString()}` : '';
}
