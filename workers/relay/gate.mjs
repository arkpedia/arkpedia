// What the relay's Worker decides before a container wakes. No Cloudflare imports, so the site's
// tests check it in Node (scripts/tests/test-relay-worker.ts).

/** The one page origin the relay serves: the site's own Worker (config/relay.json
 *  cloudflare.siteWorker) on the same workers.dev account as the relay, so the account's
 *  subdomain is never written down. Anywhere but workers.dev, none. */
export function siteOrigin(relay, requestUrl) {
  const { hostname } = new URL(requestUrl);
  if (!hostname.endsWith('.workers.dev')) return null;
  return `https://${relay.cloudflare.siteWorker}.${hostname.split('.').slice(1).join('.')}`;
}

/** The status a request is refused with, or 0 to hand it to the relay. */
export function refusal(request, origin) {
  if (new URL(request.url).pathname !== '/wisp/') return 404;
  if ((request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return 403;
  if (!origin || request.headers.get('Origin') !== origin) return 403;
  return 0;
}

/** The container's settings (container/server.mjs): config/relay.json's hosts and limits, and
 *  the one origin. */
export function containerEnv(relay, origin) {
  return {
    ARKRELAY_ORIGINS: JSON.stringify(origin ? [origin] : []),
    ARKRELAY_ALLOWED_HOSTS: JSON.stringify(relay.allowedHosts),
    ARKRELAY_PORTS: JSON.stringify(relay.cloudflare.ports),
    ARKRELAY_STREAMS: String(relay.cloudflare.streamsPerVisitor),
  };
}
