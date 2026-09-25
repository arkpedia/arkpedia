export declare const KNOWN_EXPORT_CLOCK_READS: Record<string, string>;
export declare function guardExportClock(isPageFrame: (frame: string) => boolean, options?: { refuse?: boolean }): { reads: string[]; restore: () => void };
export declare function exportClockVerdict(route: string, reads: string[]): string | null;
