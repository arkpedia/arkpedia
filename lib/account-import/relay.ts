/**
 * The transports the account import runs on (yostar.ts).
 *
 * relayTransport is libcurl.js, curl and mbedTLS compiled to WebAssembly, tunnelling TCP
 * through the Wisp relay (config/relay.json; arkpedia/arkpedia-relay). TLS runs here, in the page,
 * against the real hosts' certificates (libcurl.js carries Mozilla's CA bundle), so the
 * relay forwards ciphertext it cannot read or alter. The relay answers only this site's
 * origins and connects only to the Yostar, game and Account Center hosts the import needs.
 *
 * libcurl.js (LGPL-3.0-or-later, unmodified) is about 550 KB compressed. It is loaded
 * as its own chunk the first time an import starts, never with the page.
 */
import { parseNetwork, SERVER_IDS, SERVERS, type Transport } from './yostar';
import relayConfig from '@/config/relay.json';
import { connectionDiagnostics, type WispDiagnosticsAPI } from './connectionDiagnostics';

/** Where the relay is: config/relay.json (the relay itself is arkpedia/arkpedia-relay). */
export const RELAY_URL = relayConfig.url;

/** The relay a page at this address uses. That's RELAY_URL, except on the site's own Worker (its
 *  *.workers.dev page and its domains, config/relay.json cloudflare.hosts), where it's the relay on
 *  Cloudflare when `use` is on or the page's ?relay=cloudflare asks for it. ?relay=vps asks for
 *  RELAY_URL. */
export function chooseRelayUrl(location: { hostname: string; search: string }, config: { url: string; cloudflare: { use: boolean; url: string; hosts: string[] } } = relayConfig): string {
  const onCloudflare = location.hostname.endsWith('.workers.dev') || config.cloudflare.hosts.includes(location.hostname);
  if (!onCloudflare) return config.url;
  const asked = new URLSearchParams(location.search).get('relay');
  const useCloudflare = asked === 'cloudflare' ? true : asked === 'vps' ? false : config.cloudflare.use;
  return useCloudflare ? config.cloudflare.url : config.url;
}

interface CurlSession {
  set_connections(total: number, cached: number, perHost: number): void;
  /** raw_headers: every header line as sent. A Headers object folds two Set-Cookie lines into
   *  one, and a page's own fetch never shows them at all; libcurl's response keeps them. */
  fetch(url: string, init: { method: string; headers: Record<string, string>; body?: string; redirect?: 'manual' }): Promise<Response & { raw_headers?: [string, string][] }>;
}
interface Libcurl {
  wisp: WispDiagnosticsAPI;
  load_wasm(): Promise<void>;
  set_websocket(url: string): void;
  HTTPSession: new () => CurlSession;
}

/** Keep this page's pool below the relay's eight-stream visitor budget. The default
 * libcurl pool caches forty connections: changing regions can otherwise exhaust Wisp
 * with idle connections and refuse the next server list or TLS handshake. */
export function createRelaySession(curl: Pick<Libcurl, 'HTTPSession'>): CurlSession {
  const session = new curl.HTTPSession();
  session.set_connections(6, 4, 2);
  return session;
}

let loading: Promise<CurlSession> | null = null;
function libcurl(): Promise<CurlSession> {
  loading ??= import('libcurl.js/bundled').then(async (module) => {
    const curl = module.libcurl as Libcurl;
    await curl.load_wasm();
    const relayUrl = chooseRelayUrl(window.location);
    connectionDiagnostics.install(curl.wisp, relayUrl);
    curl.set_websocket(relayUrl);
    return createRelaySession(curl);
  }).catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

async function read(response: Response & { raw_headers?: [string, string][] }) {
  const text = await response.text();
  const headers = response.raw_headers ?? [...response.headers.entries()];
  try {
    return { status: response.status, json: text ? JSON.parse(text) : null, headers };
  } catch {
    // Not JSON (an error page): the flow reports the status, or the missing fields.
    return { status: response.status, json: null, headers };
  }
}

declare global {
  interface Window {
    /** A browser test's stand-in for the relay (tests/browser/account-import.spec.ts), set by
     *  its init script before the page loads, so a test drives the sign-in without Yostar, the
     *  game or the relay. The site never sets it. */
    __arkpediaImportTransport?: Transport;
  }
}

export const relayTransport: Transport = async (url, request) => {
  const stub = typeof window === 'undefined' ? undefined : window.__arkpediaImportTransport;
  const finish = connectionDiagnostics.begin(url);
  try {
    const response = stub ? await stub(url, request) : await read(await (await libcurl()).fetch(url, request));
    finish({ status: response.status });
    return response;
  } catch (error) {
    finish({ error });
    throw error;
  }
};

/** The page's own fetch, for same-origin metadata or a host that allows browser access. */
export const directTransport: Transport = async (url, request) => read(await fetch(url, request));

/** Public metadata uses the shared website cache. Only this harmless GET may fall back;
 *  code requests and every authenticated request keep their one encrypted route. */
export function createNetworkTransport(direct: Transport, relay: Transport): Transport {
  return async (url, request) => {
    const server = SERVER_IDS.find(id => SERVERS[id].networkConfig === url);
    if (!server || request.method !== 'GET' || request.body) throw new Error('Not a public server-list request');
    try {
      const response = await direct(`/api/account-import/network?server=${server}`, { method: 'GET', headers: {} });
      if (response.status === 200) {
        parseNetwork(response.json);
        return response;
      }
    } catch { /* A public-cache outage must not prevent an otherwise working import. */ }
    return relay(url, request);
  };
}

export const networkTransport = createNetworkTransport(directTransport, relayTransport);
