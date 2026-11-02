const PREVIEW_ORIGIN = 'https://arkpedia-gins-arkpedia.cloudflare-1ff.workers.dev';

// The demo stays on its isolated native Preview, including its separate cache.
// Never forward production cookies or accept an upstream selected by the caller.
export async function domainResponse(request, requestPreview = fetch) {
  const url = new URL(request.url);
  let path = url.pathname;
  try { path = decodeURIComponent(path); } catch { /* The application rejects malformed URL escapes. */ }
  if (url.hostname === 'arkpedia.net') {
    url.protocol = 'https:';
    url.hostname = 'www.arkpedia.net';
    url.port = '';
    return Response.redirect(url.toString(), 308);
  }
  if (url.hostname !== 'preview.arkpedia.net') return null;
  const upstream = new URL(PREVIEW_ORIGIN);
  upstream.pathname = url.pathname;
  upstream.search = url.search;
  const headers = new Headers(request.headers);
  const previewAccount = /^\/api\/(?:auth|cloud-account|account-profile)(?:\/|$)/.test(path)
    || /^\/api\/community\/(?:sharing|availability)\/?$/.test(path);
  // Only the isolated native Preview handles its accounts. Ordinary demo requests
  // still discard credentials; no account request reaches the live service binding.
  if (!previewAccount) {
    headers.delete('cookie');
    headers.delete('authorization');
  }
  headers.delete('host');
  const response = await requestPreview(new Request(upstream, {
    method: request.method, headers, redirect: 'manual',
    ...(['GET', 'HEAD'].includes(request.method) ? {} : { body: request.body, duplex: 'half' }),
  }));
  const outputHeaders = new Headers(response.headers);
  if (!previewAccount) outputHeaders.delete('set-cookie');
  else outputHeaders.set('cache-control', 'private, no-store');
  outputHeaders.set('x-robots-tag', 'noindex, nofollow');
  outputHeaders.set('x-arkpedia-preview', 'native');
  const location = outputHeaders.get('location');
  if (location) {
    const target = new URL(location, upstream);
    if (target.origin === PREVIEW_ORIGIN) {
      outputHeaders.set('location', url.origin + target.pathname + target.search + target.hash);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outputHeaders });
}
