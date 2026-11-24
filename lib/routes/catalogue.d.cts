export interface PageNavigation {
  readonly group: string;
  readonly order: number;
  readonly label: string;
  readonly icon: string;
  readonly query?: string;
  readonly dividerAfter?: boolean;
}

export interface PagePolicy {
  readonly route: string;
  readonly file: string;
  readonly key?: string;
  readonly sitemap?: 'static' | 'exclude' | 'omit';
  readonly tables?: readonly string[];
  readonly regional?: true;
  readonly clock?: 'minute' | 'second';
  readonly serverDay?: true;
  readonly outsideRelease?: string;
  readonly nav?: readonly PageNavigation[];
}

export declare const pageCatalogue: readonly PagePolicy[];
export declare const releaseRoutes: readonly string[];
