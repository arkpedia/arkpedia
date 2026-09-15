export const MAX_RECRUITMENT_TAGS = 5;

export interface RecruitmentViewState {
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
    selectedTags: [...new Set(params.getAll('tag'))].filter((tag) => allowed.has(tag)).slice(0, MAX_RECRUITMENT_TAGS),
    showAllPossibilities: params.get('all') === '1',
    activeSection: params.get('view') === 'cheatsheet' ? 'cheatsheet' : 'calculator',
    cheatSheetSearch: (params.get('q') || '').slice(0, 100),
  };
}

export function recruitmentViewHash(state: RecruitmentViewState): string {
  const params = new URLSearchParams();
  state.selectedTags.forEach((tag) => params.append('tag', tag));
  if (state.showAllPossibilities) params.set('all', '1');
  if (state.activeSection === 'cheatsheet') params.set('view', 'cheatsheet');
  if (state.cheatSheetSearch) params.set('q', state.cheatSheetSearch);
  return params.size ? `#${params.toString()}` : '';
}
