import type { IncomingHttpHeaders } from 'node:http';
import { publishedContentPointer } from '../content/release';
import { canonicalPublicHref } from '../nav/publicRoutes';
import { REFRESH_PAGES, type MaintenanceStatus, type RefreshPage } from './refreshPages';

const prefix = 'dashboard/page-refresh/';
const historyKey = (route: RefreshPage) => prefix + (route.slice(1) || 'home');
interface RefreshHistory {
  list(options: { prefix: string }): Promise<{ objects: { key: string; uploaded: Date }[] }>;
  put(key: string, value: string): Promise<unknown>;
}

export function publicPageOrigin(role?: string, configured?: string) {
  const expected = role === 'production' ? 'https://www.arkpedia.net'
    : role === 'staging' ? 'https://preview.arkpedia.net' : null;
  return expected && expected === configured ? expected : null;
}

async function servedRelease(href: string, route: RefreshPage) {
  // Inspect an ordinary public page load, including its normal cache behavior.
  const response = await fetch(href, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const html = await response.text();
  const script = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!script) return null;
  const data = JSON.parse(script[1]);
  const release = data.props?.pageProps?.__contentRelease?.release;
  return data.page === route && typeof release === 'string' && /^[a-f0-9]{64}$/.test(release) ? release : null;
}

export async function maintenanceStatus(origin: string, bucket?: Pick<RefreshHistory, 'list'>): Promise<MaintenanceStatus> {
  const [release, history, pages] = await Promise.all([
    publishedContentPointer().catch(() => undefined),
    bucket?.list({ prefix }).catch(() => undefined),
    Promise.all(REFRESH_PAGES.map(async route => {
      const href = new URL(canonicalPublicHref(route), origin).href;
      return { route, href, served: await servedRelease(href, route).catch(() => null) };
    })),
  ]);
  const refreshed = new Map(history?.objects.map(item => [item.key, item.uploaded.toISOString()]));
  return {
    published: release?.release ?? null, checkedAt: new Date().toISOString(), historyAvailable: !!history,
    pages: pages.map(page => ({ ...page, lastRefresh: refreshed.get(historyKey(page.route)) ?? null })),
  };
}

export async function refreshPublicPage(
  route: RefreshPage, origin: string, req: { headers: IncomingHttpHeaders },
  revalidate: (path: string) => Promise<void>, bucket: Pick<RefreshHistory, 'put'>,
) {
  // OpenNext's res.revalidate targets req.headers.host and may forward cookies.
  // The private admin root redirects to the editor. Regenerate the public route
  // using only its configured host for this internal call, then restore the request.
  const adminHeaders = req.headers;
  try {
    req.headers = { host: new URL(origin).host };
    await revalidate(canonicalPublicHref(route));
  } finally {
    req.headers = adminHeaders;
  }
  try {
    await bucket.put(historyKey(route), '');
    return { refreshed: route };
  } catch {
    return { refreshed: route, warning: 'Page refreshed. Its refresh time could not be saved.' };
  }
}
