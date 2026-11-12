export function pageFilePath(route: string): string;
export function isContentPagePath(file: unknown): file is string;
export function contentFileUrlPath(file: string): string;
export function matchingPagePaths(route: string, paths: string[]): string[];
