import { test as base, type Request } from '@playwright/test';

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';

// These public-page fixtures need request timing on failure, not full traces or bodies.
export function diagnosticUrl(value: string): string {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.origin + url.pathname : '[non-http resource]';
  } catch { return '[invalid URL]'; }
}

export const test = base.extend<{ requestDiagnostics: void }>({
  requestDiagnostics: [async ({ page }, use, info) => {
    const pending = new Map<Request, { url: string; method: string; type: string; started: number }>();
    const failed: object[] = [];
    const httpErrors: object[] = [];
    const began = Date.now();
    let domContentLoaded: number | null = null, loaded: number | null = null;
    const onRequest = (request: Request) => {
      if (pending.size < 200) pending.set(request, { url: diagnosticUrl(request.url()),
        method: request.method(), type: request.resourceType(), started: Date.now() });
    };
    const onFinished = (request: Request) => { pending.delete(request); };
    const onFailed = (request: Request) => {
      if (failed.length < 100) failed.push({ url: diagnosticUrl(request.url()), type: request.resourceType(),
        failure: request.failure()?.errorText.match(/net::ERR_[A-Z_]+/)?.[0] ?? 'request failed' });
      pending.delete(request);
    };
    const onResponse = (response: import('@playwright/test').Response) => {
      if (response.status() >= 400 && httpErrors.length < 100) httpErrors.push({ url: diagnosticUrl(response.url()), status: response.status() });
    };
    const onDom = () => { domContentLoaded = Date.now() - began; };
    const onLoad = () => { loaded = Date.now() - began; };
    page.on('request', onRequest); page.on('requestfinished', onFinished); page.on('requestfailed', onFailed);
    page.on('response', onResponse); page.on('domcontentloaded', onDom); page.on('load', onLoad);
    try {
      await use();
    } finally {
      if (info.status !== info.expectedStatus) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let documentState: unknown = { unavailable: true };
        try {
          documentState = await Promise.race([
            page.evaluate(() => ({ readyState: document.readyState, path: location.pathname,
              heading: document.querySelector('main h1')?.textContent?.slice(0, 120) ?? null,
              openDialogs: document.querySelectorAll('dialog[open]').length })).catch(() => ({ unavailable: true })),
            new Promise(resolve => { timer = setTimeout(() => resolve({ timedOut: true }), 1000); }),
          ]);
        } finally { clearTimeout(timer); }
        await info.attach('request-diagnostics', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
          elapsedMs: Date.now() - began, page: diagnosticUrl(page.url()), domContentLoaded, loaded, documentState,
          pending: [...pending.values()].map(({ started, ...request }) => ({ ...request, ageMs: Date.now() - started })),
          failed, httpErrors,
        }, null, 2)) });
      }
      page.off('request', onRequest); page.off('requestfinished', onFinished); page.off('requestfailed', onFailed);
      page.off('response', onResponse); page.off('domcontentloaded', onDom); page.off('load', onLoad);
    }
  }, { auto: true }],
});
