export const REFRESH_PAGES = ['/', '/about', '/support', '/schedule'] as const;
export type RefreshPage = typeof REFRESH_PAGES[number];
export const PAGE_NAMES: Record<RefreshPage, string> = {
  '/': 'Home', '/about': 'About', '/support': 'Support', '/schedule': 'Schedule',
};

export interface MaintenanceStatus {
  published: string | null;
  checkedAt: string;
  historyAvailable: boolean;
  pages: {
    route: RefreshPage;
    href: string;
    served: string | null;
    lastRefresh: string | null;
  }[];
}
