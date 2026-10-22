// The account-import relay on Cloudflare (README.md). This Worker terminates wss://, refuses
// everything but a WebSocket to /wisp/ from the site's own Worker before a container wakes, and
// hands the connection to the one relay container (container/server.mjs).
//
// The container's traffic must never go through Cloudflare's HTTP proxy, so allowedHosts,
// deniedHosts, interceptHttps and outbound handlers stay unset on Relay: they route its
// connections through that proxy, and interceptHttps ends TLS there, where the traffic could be
// read. The allow-list in server.mjs is the lock (scripts/tests/test-relay-worker.ts).
import { Container, getContainer } from '@cloudflare/containers';
import relay from '../../config/relay.json';
import { containerEnv, refusal, siteOrigin } from './gate.mjs';

export class Relay extends Container {
  defaultPort = 8080;
  // A cold start opens the relay in about 2 s (2026-10-22); the page connects when the email
  // field is focused, so most of it passes while the reader types.
  sleepAfter = '10m';
  enableInternet = true;

  async fetch(request) {
    // Read when the container starts, which is on its first request here: the Container
    // constructor only schedules its alarms.
    this.envVars = containerEnv(relay, siteOrigin(relay, request.url));
    return super.fetch(request);
  }
}

export default {
  async fetch(request, env) {
    const status = refusal(request, siteOrigin(relay, request.url));
    if (status) return new Response(status === 404 ? 'Not found\n' : 'Forbidden\n', { status });
    // Requests per minute per address, as nginx limits the VPS relay. The address is a counter
    // key, never stored.
    const { success } = await env.VISITORS.limit({ key: request.headers.get('cf-connecting-ip') || 'unknown' });
    if (!success) return new Response('Too many requests\n', { status: 429 });
    return getContainer(env.RELAY, 'relay').fetch(request);
  },
};
