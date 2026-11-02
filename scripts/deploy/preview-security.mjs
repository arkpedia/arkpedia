// Shared Preview and production ingress controls. Never log account URLs, cookies or request bodies.
export const PREVIEW_CSP = "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'";
// Observe script restrictions before enforcing them across the static/ISR site.
// No remote report endpoint: violations are inspected in browser QA, not sent with reader URLs.
export const PREVIEW_SCRIPT_POLICY = "script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv https://embed.twitch.tv; object-src 'none'; base-uri 'self'";

export async function protectPreviewRequest(request, env, run) {
  let path = new URL(request.url).pathname;
  try { path = decodeURIComponent(path); } catch { /* The router rejects malformed paths. */ }
  let response;
  const accountRequest = /^\/api\/(auth|cloud-account|account-profile|community)(\/|$)/.test(path) || path === '/api/account-import/replay-permit';
  if (accountRequest) {
    try {
      if (!env.ACCOUNT_TRAFFIC_LIMIT || !env.ACCOUNT_IP_LIMIT) throw Error('Missing account limiter');
      // A total cap also bounds unauthenticated traffic forwarded through another Worker.
      // Cross-zone Worker subrequests share CF's fixed IP, so do not treat it as an individual.
      const total = await env.ACCOUNT_TRAFFIC_LIMIT.limit({ key: 'accounts' });
      const ip = request.headers.get('cf-connecting-ip');
      const individual = !ip || ip === '2a06:98c0:3600::103' ? true
        : (await env.ACCOUNT_IP_LIMIT.limit({ key: ip })).success;
      if (!total.success || !individual) response = Response.json({ error: 'Too many account requests. Please wait a minute and try again.' }, {
        status: 429, headers: { 'retry-after': '60', 'cache-control': 'private, no-store' },
      });
    } catch {
      response = Response.json({ error: 'Accounts are temporarily unavailable. Your browser data is unchanged.' }, {
        status: 503, headers: { 'cache-control': 'private, no-store' },
      });
    }
  }
  response ??= await run();
  const headers = new Headers(response.headers);
  if (accountRequest) {
    headers.set('cache-control', 'private, no-store');
    const vary = headers.get('vary');
    if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'cookie')) headers.set('vary', vary ? `${vary}, Cookie` : 'Cookie');
  }
  headers.set('strict-transport-security', 'max-age=604800');
  headers.set('content-security-policy', PREVIEW_CSP);
  headers.set('content-security-policy-report-only', PREVIEW_SCRIPT_POLICY);
  if (/^\/api\/auth(?:\/|$)/.test(path)) headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
