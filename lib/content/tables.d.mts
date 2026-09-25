export const PAGE_TABLES: Readonly<Record<string, readonly string[]>>;
export function pageTables(route: string): readonly string[];
export function missingPageTables(route: string, props: unknown): string[];
