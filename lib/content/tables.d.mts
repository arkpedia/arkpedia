export declare const PAGE_TABLES: Readonly<Record<string, readonly string[]>>;
export declare function pageTables(route: string): readonly string[];
export declare function missingPageTables(route: string, props: unknown): string[];

export declare const REGIONAL_ROUTES: readonly string[];
/** Tables withContentPage attaches to every content route itself. */
export declare const SITE_TABLES: readonly string[];
