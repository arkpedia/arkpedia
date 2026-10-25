interface Site {
  fetch(request: Request): Promise<Response>;
}

interface PageCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

export const KEEP_SECONDS: number;
export const BUILD_CHECK_SECONDS: number;
export const STATE_HEADER: string;

export function fromCache(request: Request): boolean;
export function lifetime(headers: Headers): { fresh: number; keep: number } | null;
export function buildOf(url: string, html?: string): string | null;
export function notModified(request: Request, headers: Headers): boolean;
export function keptCopy(response: Response, body: ArrayBuffer, plan: { fresh: number; keep: number }, build: string, now: number): Response;
export function isFresh(kept: Response, now: number): boolean;
export function answerFrom(kept: Response, request: Request, state: string, now: number): Response;
export function createEdge(options?: { now?: () => number }): (
  request: Request,
  bindings: { cache: PageCache; site: Site; waitUntil: (promise: Promise<unknown>) => void },
) => Promise<Response>;
