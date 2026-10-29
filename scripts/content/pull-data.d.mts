export const DATA_REPOSITORY: string;
export const LIVE_POINTER: string;
export function dataCache(root?: string, env?: Record<string, string | undefined>): string;
export function pulledPath(file: string, root?: string, env?: Record<string, string | undefined>): string;
export function pinnedRevision(root?: string): string;
export function pinnedDataEntries(root?: string, env?: Record<string, string | undefined>): Set<string> | null;
export function pulledSource(root?: string): { repository: string; ref: string; revision: string; release: string | null; pulledAt: string } | null;
export function resolveDataRef(ref: string | undefined, fetchImpl?: typeof fetch): Promise<{ ref: string; revision: string | null; release: string | null }>;
export function fetchSource(cache: string, target: string): string;
