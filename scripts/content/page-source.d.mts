/** The page file a release key (or any route) is built from, or null when there is none. */
export function pageSource(route: string): string | null;
/** The release key of a page's public route: its old name where the release lists it under one. */
export function releaseKey(route: string, released: readonly string[]): string;
