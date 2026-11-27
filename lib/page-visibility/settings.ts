import { canonicalPublicHref } from '@/lib/nav/publicRoutes';

export const managedPages = {
  ccb: {
    href: '/game-modes/ccb',
    title: 'Contingency Contract Battleplan',
    terms: ['CCB', 'Contingency Contract'],
  },
  dps: {
    href: '/dps-calculator',
    title: 'DPS Calculator',
    terms: ['DPS', 'Damage', 'HPS', 'Survival'],
  },
} as const;

export type ManagedPage = keyof typeof managedPages;
export type VisibilityMode = 'unlisted' | 'listed' | 'scheduled';
export interface PageVisibilitySetting {
  id: ManagedPage;
  mode: VisibilityMode;
  showAt: number | null;
  hideAt: number | null;
  revision: number;
}

export interface PublicPageVisibility {
  listed: ManagedPage[];
  refreshAfterMs: number;
}

export function isManagedPage(id: unknown): id is ManagedPage {
  return typeof id === 'string' && Object.hasOwn(managedPages, id);
}

function isTime(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isSafeInteger(value) && Number.isFinite(new Date(value).getTime());
}

export function validPageVisibility(value: unknown): value is PageVisibilitySetting {
  if (!value || typeof value !== 'object') return false;
  const { id, mode, showAt, hideAt, revision } = value as PageVisibilitySetting;
  if (!isManagedPage(id) || !Number.isSafeInteger(revision) || revision < 0 || !isTime(showAt) || !isTime(hideAt)) return false;
  if (mode === 'scheduled') {
    return (showAt !== null || hideAt !== null) && (showAt === null || hideAt === null || showAt < hideAt);
  }
  return (mode === 'listed' || mode === 'unlisted') && showAt === null && hideAt === null;
}

export function pageIsListed({ mode, showAt, hideAt }: PageVisibilitySetting, now: number): boolean {
  return mode === 'listed' || mode === 'scheduled' && (showAt === null || showAt <= now) && (hideAt === null || now < hideAt);
}

export function publicPageVisibility(settings: readonly PageVisibilitySetting[], now: number): PublicPageVisibility {
  let refreshAfterMs = 60_000;
  const listed = settings.filter(setting => pageIsListed(setting, now)).map(setting => setting.id);
  for (const setting of settings) {
    for (const time of [setting.showAt, setting.hideAt]) {
      if (time !== null && time > now) refreshAfterMs = Math.min(refreshAfterMs, time - now);
    }
  }
  return { listed, refreshAfterMs };
}

export function managedPageForHref(href: string): ManagedPage | undefined {
  const route = canonicalPublicHref(href).split(/[?#]/, 1)[0];
  return (Object.keys(managedPages) as ManagedPage[]).find(id => managedPages[id].href === route);
}
